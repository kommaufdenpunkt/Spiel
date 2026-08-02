/**
 * server.js – ident (Agentur 4ever1)
 *
 *   1. Liefert die Web-App (statische Dateien) aus.
 *   2. JSON-API: Login/2FA, Zugangscodes, Warteraum, Fälle/Akten, Aufnahmen,
 *      Mitarbeiter-Verwaltung, Überwachung.
 *   3. WebSocket-Signalisierung für die WebRTC-Videoverbindung (Bewerber ↔ Prüfer).
 *
 * Alle personenbezogenen Daten werden verschlüsselt gespeichert (STORAGE_KEY).
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const sec = require('./security.js');
const store = require('./store.js');
const mcp = require('./mcp.js');
const textpolish = require('./textpolish.js');

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const STORAGE_KEY = process.env.STORAGE_KEY || '';
const ADMIN_TOTP = process.env.ADMIN_TOTP_SECRET || process.env.MODERATOR_TOTP_SECRET || '';
// Notausgang: ADMIN_2FA_OFF=1 (Env) + Redeploy schaltet die Admin-2FA komplett ab.
const ADMIN_2FA_OFF = /^(1|true|yes|on)$/i.test(process.env.ADMIN_2FA_OFF || '');
// Wirksames Admin-2FA-Secret: Env hat Vorrang, sonst das im Panel gesetzte.
function adminTotpSecret() { return ADMIN_2FA_OFF ? '' : (ADMIN_TOTP || store.getAdminTotp()); }
let pendingAdminTotp = '';
let pendingDeviceInvite = null; // { code, exp } – Freischalt-Code für ein neues Admin-Gerät
const TURN_HOST = process.env.TURN_HOST || '';
const TURN_SECRET = process.env.TURN_SECRET || '';
const TURN_TTL = parseInt(process.env.TURN_TTL || '3600', 10);
const RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS || '90', 10); // Standard: Auto-Löschung nach 90 Tagen (0 = aus). Passend zur Datenschutzerklärung.

// ---- Passkeys (Face ID / Fingerabdruck, WebAuthn) --------------------------
// rpID = registrierbare Domain, damit Passkeys auf ident. UND pruefer. gelten.
const RP_ID = process.env.RP_ID || '4ever1.tv';
const RP_NAME = process.env.RP_NAME || '4EVER1';
const RP_ORIGINS = (process.env.RP_ORIGINS || 'https://ident.4ever1.tv,https://pruefer.4ever1.tv,https://admin.4ever1.tv')
  .split(',').map((s) => s.trim()).filter(Boolean);
const waChallenges = new Map(); // schlüssel -> { challenge, exp }
function waSetChallenge(key, challenge) { waChallenges.set(key, { challenge, exp: Date.now() + 5 * 60 * 1000 }); }
function waTakeChallenge(key) { const c = waChallenges.get(key); waChallenges.delete(key); return c && Date.now() <= c.exp ? c.challenge : null; }
const b64urlToBuf = (s) => Buffer.from(String(s || ''), 'base64url');
const bufToB64url = (u) => Buffer.from(u).toString('base64url');

sec.init({ storageKey: STORAGE_KEY, adminTotp: ADMIN_TOTP, loginAllowIps: process.env.LOGIN_ALLOW_IPS });
const storeInfo = store.init({ dir: DATA_DIR });
// Schlüssel für die unterschriebenen Abhol-Links der MCP-Übergabe
mcp.initSign(STORAGE_KEY || 'ident-ohne-schluessel');

// Wurde der Server mitten in einer Übergabe neu gestartet, hinge die Akte für
// immer auf "läuft". Beim Start einmal aufräumen, damit man sie nachschicken kann.
try {
  store.listCases().forEach((c) => {
    if (c.mcpStatus === 'laeuft') store.setCaseMcp(c.id, { status: 'fehlgeschlagen', text: 'Server wurde neu gestartet – bitte erneut übergeben' });
  });
} catch { /* beim ersten Start gibt es noch keine Akten */ }

/** Eine fertige Akte an mcp.4ever1.tv übergeben. Wirft nie – Fehler landen in der Akte. */
function mcpUebergeben(fallId, vonHand) {
  return mcp.uebergeben(fallId, {
    getCase: (id) => {
      const c = store.getCase(id);
      return c ? { ...c, entries: (c.entries || []) } : null;
    },
    getRecordingByCode: (code) => store.getRecordingByCode(code),
    ablegen: (paket) => store.ablegen(paket),
    setStatus: (id, s) => { try { store.setCaseMcp(id, s); } catch {} },
    log: (m) => { try { sec.recordEvent('audit', 'system', m); } catch {} console.log(m); },
  }, vonHand).catch((e) => {
    try { store.setCaseMcp(fallId, { status: 'fehlgeschlagen', text: String(e && e.message || e).slice(0, 200) }); } catch {}
    return { ok: false, grund: 'fehler' };
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

// ---- Geräte-Freigabe für den Admin-Bereich ---------------------------------
// Nur freigegebene Geräte dürfen sich anmelden. Das Gerät schickt bei jedem
// Login seine Kennung mit; gespeichert ist nur deren Hash.
// Notausgang: ADMIN_DEVICE_LOCK=off (Env) + Redeploy schaltet die Prüfung ab.
// WICHTIG: Die Geräte-Bindung ist standardmäßig AUS. Sie wird erst wirksam,
// wenn sie bewusst eingeschaltet wird – entweder über die Umgebungsvariable
// ADMIN_DEVICE_LOCK=on oder im Sicherheits-Bereich per Schalter. So kann sich
// niemand nach einem Update unbeabsichtigt selbst aussperren.
const ADMIN_DEVICE_LOCK_ENV = String(process.env.ADMIN_DEVICE_LOCK || '').toLowerCase();
const AGENT_DEVICE_LOCK_ENV = String(process.env.AGENT_DEVICE_LOCK || '').toLowerCase();
function adminDeviceLockOn() {
  if (/^(off|0|false|no)$/.test(ADMIN_DEVICE_LOCK_ENV)) return false; // Notausgang hat Vorrang
  if (/^(on|1|true|yes)$/.test(ADMIN_DEVICE_LOCK_ENV)) return true;
  return store.getDeviceLock('admin');       // sonst: Einstellung aus dem Panel
}
function agentDeviceLockOn() {
  if (/^(off|0|false|no)$/.test(AGENT_DEVICE_LOCK_ENV)) return false;
  if (/^(on|1|true|yes)$/.test(AGENT_DEVICE_LOCK_ENV)) return true;
  return store.getDeviceLock('agent');
}
function deviceHash(secret) {
  const s = String(secret || '');
  if (s.length < 20) return '';
  return crypto.createHash('sha256').update('ident-device:' + s).digest('hex');
}
/**
 * Erkennt Gerät und Browser aus der Browser-Kennung, damit man in der Liste
 * sofort sieht, welches Handy oder welcher Rechner gemeint ist – z. B.
 * „Samsung SM-S918B · Chrome" statt nur „Android-Handy".
 */
function deviceLabel(req) {
  const ua = String(req.headers['user-agent'] || '');
  let dev = 'Gerät';

  if (/iPad/i.test(ua)) dev = 'iPad';
  else if (/iPhone/i.test(ua)) dev = 'iPhone';
  else if (/Android/i.test(ua)) {
    // Modell steht bei Android meist in Klammern vor „) AppleWebKit"
    const m = ua.match(/Android[^;)]*;\s*([^;)]+?)\s*(?:Build|\))/i);
    let model = m ? m[1].trim() : '';
    model = model.replace(/\s*\/.*$/, '').slice(0, 28);
    if (/^SM-/i.test(model)) dev = 'Samsung ' + model;
    else if (/^Pixel/i.test(model)) dev = 'Google ' + model;
    else if (/^(Mi|Redmi|POCO)\b/i.test(model)) dev = 'Xiaomi ' + model;
    else if (/^(CPH|OnePlus)/i.test(model)) dev = 'OnePlus ' + model;
    else if (/^(ELS|ANA|VOG|NOH|LIO)/i.test(model)) dev = 'Huawei ' + model;
    else if (model && model.toLowerCase() !== 'k') dev = model;
    else dev = /Mobile/i.test(ua) ? 'Android-Handy' : 'Android-Tablet';
  } else if (/Macintosh/i.test(ua)) dev = 'Mac';
  else if (/Windows/i.test(ua)) dev = 'Windows-PC';
  else if (/CrOS/i.test(ua)) dev = 'Chromebook';
  else if (/Linux/i.test(ua)) dev = 'Linux-Rechner';

  // Browser dazu – so lassen sich zwei Browser auf demselben Rechner trennen.
  let br = '';
  if (/Edg\//i.test(ua)) br = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) br = 'Opera';
  else if (/SamsungBrowser/i.test(ua)) br = 'Samsung Internet';
  else if (/Firefox\//i.test(ua)) br = 'Firefox';
  else if (/Chrome\//i.test(ua)) br = 'Chrome';
  else if (/Safari\//i.test(ua)) br = 'Safari';

  return (br ? dev + ' · ' + br : dev).slice(0, 40);
}

// ---- Figuren-Konfiguration serverseitig absichern --------------------------
function sanitizeFigures(arr) {
  if (!Array.isArray(arr)) return null;
  const numKeys = ['face', 'hair', 'brows', 'eyes', 'nose', 'beard', 'glass', 'mouth', 'phones', 'skin', 'hairColor', 'shirt', 'bg'];
  const out = arr.slice(0, 3).map((f) => {
    const o = {};
    if (f && typeof f === 'object') {
      numKeys.forEach((k) => { let n = parseInt(f[k], 10); if (!Number.isFinite(n) || n < 0) n = 0; o[k] = Math.min(n, 99); });
      o.name = String(f.name || '').slice(0, 16);
      o.role = String(f.role || '').slice(0, 48);
      if (typeof f.img === 'string' && /^data:image\/(png|jpe?g|webp);base64,/.test(f.img) && f.img.length <= 900000) o.img = f.img;
      // Bildausschnitt (Zoom + Verschiebung), damit das Gesicht sauber sitzt
      const zahl = (v, vor, min, max) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : vor; };
      o.imgZoom = zahl(f.imgZoom, 1, 1, 4);
      o.imgX = zahl(f.imgX, 0.5, 0, 1);
      o.imgY = zahl(f.imgY, 0.5, 0, 1);
    }
    return o;
  });
  return out.length === 3 ? out : null;
}

// ---- ICE / TURN ------------------------------------------------------------
function buildIceServers() {
  const list = [{ urls: ['stun:stun.l.google.com:19302'] }];
  if (TURN_SECRET && TURN_HOST) {
    const username = String(Math.floor(Date.now() / 1000) + TURN_TTL);
    const hmac = crypto.createHmac('sha1', TURN_SECRET).update(username).digest('base64');
    list.push({
      urls: [`turn:${TURN_HOST}:3478?transport=udp`, `turn:${TURN_HOST}:3478?transport=tcp`, `turns:${TURN_HOST}:5349?transport=tcp`],
      username, credential: hmac,
    });
  }
  return list;
}

// ---- HTTP-Hilfen -----------------------------------------------------------
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readJson(req, limit = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too-large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function readRaw(req, limit = 300 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too-large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function getToken(req) {
  const h = req.headers['authorization'] || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  try { return new URL(req.url, 'http://x').searchParams.get('token') || ''; } catch { return ''; }
}
const authed = (req, ip) => sec.validToken(getToken(req), ip);
const isAdmin = (req, ip) => sec.isAdmin(getToken(req), ip);
function reqName(req, ip) { const t = sec.tokenInfo(getToken(req), ip); return t ? t.name : ''; }

// ---- API -------------------------------------------------------------------
async function handleApi(req, res, urlPath, ip) {
  if (!urlPath.startsWith('/api/')) return false;
  // Nur-Admin-Prüfung (früh definiert, damit sie überall im Handler nutzbar ist)
  const adminOnly = () => { if (!isAdmin(req, ip)) { sendJson(res, 403, { reason: 'admin-only' }); return false; } return true; };
  // Endgültiges Löschen gibt es ausschliesslich über acp.<domain>. Wer aus
  // Versehen im Tagesgeschäft auf einen Knopf kommt, kann damit nichts
  // vernichten – dafür muss man bewusst den Diagnose-Bereich aufrufen.
  const aufAcp = /^acp\./.test(String(req.headers.host || '').split(':')[0].toLowerCase());
  const loeschenErlaubt = () => {
    if (!adminOnly()) return false;
    if (!aufAcp) { sendJson(res, 403, { reason: 'nur-acp' }); return false; }
    return true;
  };

  // ---- Login (Admin ODER Mitarbeiter) ----
  if (urlPath === '/api/login' && req.method === 'POST') {
    if (!sec.loginAllowed(ip)) { sec.recordEvent('blocked', ip, 'Login von nicht erlaubter IP'); sendJson(res, 403, { reason: 'ip-blocked' }); return true; }
    let body; try { body = await readJson(req, 64 * 1024); } catch { sendJson(res, 400, { reason: 'bad-request' }); return true; }
    const username = String(body.username || '').trim();

    if (username) { // Mitarbeiter-Login
      const existing = store.getAgentByUsername(username);
      if (existing && existing.locked) { sec.recordEvent('auth-fail', ip, 'Gesperrtes Konto: ' + username); store.addLoginEvent({ ok: false, kind: 'agent', who: username, ip, detail: 'Konto ist gesperrt' }); sendJson(res, 403, { reason: 'account-locked' }); return true; }
      const a = store.verifyAgent(username, body.password || '');
      const okTotp = a ? sec.verifyTotp(a.totpSecret, body.totp) : false;
      if (a && okTotp) {
        // Gerät prüfen: Prüfer kommen nur von freigegebenen Geräten herein.
        const adh = deviceHash(body.device);
        const knownDev = adh ? store.findAgentDevice(a, adh) : null;
        const hasDev = (a.devices || []).length > 0;
        if (agentDeviceLockOn() && !knownDev) {
          if (!adh) {
            // Keine Gerätekennung übermittelt (alte, zwischengespeicherte
            // App-Version). Nur abweisen, wenn bereits ein Gerät gebunden ist –
            // sonst käme der Prüfer nach einem Update nie wieder hinein.
            if (hasDev) {
              sec.recordEvent('blocked', ip, 'Login ohne Gerätekennung abgewiesen: ' + a.username);
              store.addLoginEvent({ ok: false, kind: 'device', who: a.username, ip, detail: 'keine Gerätekennung übermittelt' });
              sendJson(res, 403, { reason: 'device-missing' }); return true;
            }
          } else if (!hasDev) {
            // Erstes Gerät dieses Prüfers -> automatisch binden (Einrichtung).
            store.addAgentDevice(a.id, { hash: adh, name: deviceLabel(req) });
            sec.recordEvent('audit', ip, 'Erstes Gerät für ' + a.username + ' gebunden: ' + deviceLabel(req));
            store.addLoginEvent({ ok: true, kind: 'device', who: a.username, ip, detail: 'erstes Gerät gebunden (' + deviceLabel(req) + ')' });
          } else {
            sec.recordEvent('blocked', ip, 'Login von nicht freigegebenem Gerät: ' + a.username + ' (' + deviceLabel(req) + ')');
            store.addLoginEvent({ ok: false, kind: 'device', who: a.username, ip, detail: 'Gerät nicht freigegeben (' + deviceLabel(req) + ')' });
            sendJson(res, 403, { reason: 'device-not-approved', device: deviceLabel(req) }); return true;
          }
        }
        // Auch hier: erfolgreich genutzte Geräte immer merken, damit sie beim
        // späteren Einschalten der Bindung schon freigegeben sind.
        if (adh) {
          if (!store.findAgentDevice(a, adh)) store.addAgentDevice(a.id, { hash: adh, name: deviceLabel(req) });
          store.touchAgentDevice(a.id, adh);
        }
        sec.resetFails(ip); sec.resetAccountFails(username);
        sec.recordEvent('login-ok', ip, 'Mitarbeiter: ' + a.username);
        store.addLoginEvent({ ok: true, kind: 'agent', who: a.username, ip });
        sendJson(res, 200, { token: sec.issueToken(ip, { name: a.username, role: a.role }), name: a.username, role: a.role, mustChange: !!a.mustChange });
      } else {
        sec.recordFail(ip, 'Mitarbeiter-Login fehlgeschlagen (' + username + ')');
        store.addLoginEvent({ ok: false, kind: 'agent', who: username, ip,
          detail: !existing ? 'Benutzername unbekannt' : (a ? '2FA-Code falsch' : 'Passwort falsch') });
        if (existing && sec.recordAccountFail(username)) { store.lockAgent(username); sec.recordEvent('blocked', ip, 'Konto gesperrt: ' + username); store.addLoginEvent({ ok: false, kind: 'agent', who: username, ip, detail: 'Konto nach zu vielen Fehlversuchen gesperrt' }); }
        sendJson(res, 401, { reason: a ? 'bad-totp' : 'bad-login' });
      }
      return true;
    }
    // Admin-Login (leerer Benutzername + Admin-Passwort + Admin-2FA)
    if (!ADMIN_PASSWORD) { sendJson(res, 503, { reason: 'admin-not-configured' }); return true; }
    // Erhöhte Sicherheitsstufe: bereits gesperrt? -> gar nicht erst prüfen.
    const lock = sec.adminLockRemaining(ip);
    if (lock > 0) {
      sec.recordEvent('blocked', ip, 'Admin-Login abgewiesen (gesperrt)');
      store.addLoginEvent({ ok: false, kind: 'admin', who: 'Admin', ip, detail: 'abgewiesen – gesperrt' });
      sendJson(res, 429, { reason: 'locked', retryAfterSec: Math.ceil(lock / 1000) }); return true;
    }
    if (sec.safeEqual(body.password || '', ADMIN_PASSWORD) && sec.verifyTotp(adminTotpSecret(), body.totp)) {
      // Passwort stimmt – jetzt zusätzlich das Gerät prüfen.
      const dh = deviceHash(body.device);
      const known = dh ? store.findAdminDevice(dh) : null;
      const anyDevice = store.adminDeviceCount() > 0;
      if (adminDeviceLockOn() && !known) {
        if (!dh) {
          // Es kam gar keine Gerätekennung (alte, zwischengespeicherte App-Version
          // oder Browser ohne lokalen Speicher). Solange noch kein Gerät gebunden
          // ist, darf das nicht zum Aussperren führen – sonst käme man nach einem
          // Update nie wieder hinein. Ist bereits ein Gerät gebunden, bleibt es
          // beim Abweisen, mit einem verständlichen Hinweis.
          if (anyDevice) {
            sec.recordEvent('blocked', ip, 'Admin-Login ohne Gerätekennung abgewiesen');
            store.addLoginEvent({ ok: false, kind: 'device', who: 'Admin', ip, detail: 'keine Gerätekennung übermittelt' });
            sendJson(res, 403, { reason: 'device-missing' }); return true;
          }
          sec.recordEvent('audit', ip, 'Admin-Login ohne Gerätekennung zugelassen (noch kein Gerät gebunden)');
        } else if (!anyDevice) {
          // Erstes Gerät überhaupt -> automatisch freigeben (Einrichtung).
          store.addAdminDevice({ hash: dh, name: deviceLabel(req) });
          sec.recordEvent('audit', ip, 'Erstes Admin-Gerät freigegeben: ' + deviceLabel(req));
        } else {
          sec.recordEvent('blocked', ip, 'Admin-Login von nicht freigegebenem Gerät (' + deviceLabel(req) + ')');
          store.addLoginEvent({ ok: false, kind: 'device', who: 'Admin', ip, detail: 'Gerät nicht freigegeben (' + deviceLabel(req) + ')' });
          sendJson(res, 403, { reason: 'device-not-approved', device: deviceLabel(req) }); return true;
        }
      }
      // Jedes Gerät, von dem aus man sich erfolgreich anmeldet, wird gemerkt –
      // auch bei ausgeschalteter Bindung. Dadurch sind beim späteren Einschalten
      // alle bisher genutzten Geräte bereits freigegeben.
      if (dh) {
        if (!store.findAdminDevice(dh)) store.addAdminDevice({ hash: dh, name: deviceLabel(req) });
        store.touchAdminDevice(dh);
      }
      sec.resetFails(ip); sec.resetAdminFails(ip); sec.recordEvent('login-ok', ip, 'Admin');
      store.addLoginEvent({ ok: true, kind: 'admin', who: 'Admin', ip });
      sendJson(res, 200, { token: sec.issueToken(ip, { name: 'Admin', role: 'admin' }), name: 'Admin', role: 'admin' });
    } else {
      // Stimmt das Passwort und fehlt nur der 2FA-Code, sagen wir das ausdrücklich –
      // sonst könnte man sich mit ausgeblendetem 2FA-Feld aussperren (wie beim
      // Mitarbeiter-Login). Ohne gültiges Passwort bleibt es bei 'bad-login'.
      const pwOk = sec.safeEqual(body.password || '', ADMIN_PASSWORD);
      sec.recordFail(ip, 'Admin-Login fehlgeschlagen');
      store.addLoginEvent({ ok: false, kind: 'admin', who: 'Admin', ip,
        detail: pwOk ? '2FA-Code fehlt oder falsch' : 'Passwort falsch' });
      // Bremse gegen automatisiertes Durchprobieren (vor dem Zählen ermittelt).
      const wait = sec.adminFailDelay(ip);
      const st = sec.recordAdminFail(ip);
      await new Promise((r) => setTimeout(r, wait));
      if (st.lockedMs) { sendJson(res, 429, { reason: 'locked', retryAfterSec: Math.ceil(st.lockedMs / 1000) }); return true; }
      sendJson(res, 401, {
        reason: pwOk && adminTotpSecret() ? 'bad-totp' : 'bad-login',
        triesLeft: st.remaining,
      });
    }
    return true;
  }

  // ---- Neues Gerät mit Freischalt-Code anmelden -----------------------------
  // Verlangt Admin-Passwort UND den Code, der auf einem freigegebenen Gerät
  // erzeugt wurde. Unterliegt derselben Sperre wie der Login.
  if (urlPath === '/api/admin-devices/claim' && req.method === 'POST') {
    if (!ADMIN_PASSWORD) { sendJson(res, 503, { reason: 'admin-not-configured' }); return true; }
    const lockC = sec.adminLockRemaining(ip);
    if (lockC > 0) { sendJson(res, 429, { reason: 'locked', retryAfterSec: Math.ceil(lockC / 1000) }); return true; }
    let body; try { body = await readJson(req, 8 * 1024); } catch { body = {}; }
    const pwOk = sec.safeEqual(body.password || '', ADMIN_PASSWORD);
    const inv = pendingDeviceInvite;
    const codeOk = !!(inv && inv.exp > Date.now() && sec.safeEqual(String(body.code || '').trim(), inv.code));
    const dh = deviceHash(body.device);
    if (!pwOk || !codeOk || !dh) {
      sec.recordFail(ip, 'Geräte-Freischaltung fehlgeschlagen');
      const w = sec.adminFailDelay(ip); const st2 = sec.recordAdminFail(ip);
      await new Promise((r) => setTimeout(r, w));
      if (st2.lockedMs) { sendJson(res, 429, { reason: 'locked', retryAfterSec: Math.ceil(st2.lockedMs / 1000) }); return true; }
      sendJson(res, 401, { reason: 'bad-claim', triesLeft: st2.remaining }); return true;
    }
    pendingDeviceInvite = null; // Code ist verbraucht
    store.addAdminDevice({ hash: dh, name: String(body.name || deviceLabel(req)).slice(0, 40) });
    sec.resetAdminFails(ip);
    sec.recordEvent('audit', ip, 'Neues Admin-Gerät freigeschaltet: ' + deviceLabel(req));
    sendJson(res, 200, { ok: true }); return true;
  }

  // ---- Passkey-Login (Face ID / Fingerabdruck) – öffentlich ----
  if (urlPath === '/api/passkey/login/options' && req.method === 'POST') {
    if (!sec.loginAllowed(ip)) { sendJson(res, 403, { reason: 'ip-blocked' }); return true; }
    let body; try { body = await readJson(req, 8 * 1024); } catch { body = {}; }
    const agent = store.getAgentByUsername(body.username || '');
    if (!agent || agent.locked || !(agent.passkeys || []).length) { sendJson(res, 404, { reason: 'no-passkey' }); return true; }
    const opts = await generateAuthenticationOptions({
      rpID: RP_ID, userVerification: 'preferred',
      allowCredentials: agent.passkeys.map((p) => ({ id: b64urlToBuf(p.id), type: 'public-key' })),
    });
    waSetChallenge('auth:' + agent.username.toLowerCase(), opts.challenge);
    sendJson(res, 200, opts); return true;
  }
  if (urlPath === '/api/passkey/login/verify' && req.method === 'POST') {
    if (!sec.loginAllowed(ip)) { sendJson(res, 403, { reason: 'ip-blocked' }); return true; }
    let body; try { body = await readJson(req, 32 * 1024); } catch { body = {}; }
    const agent = store.getAgentByUsername(body.username || '');
    const expectedChallenge = agent ? waTakeChallenge('auth:' + agent.username.toLowerCase()) : null;
    const pk = agent ? (agent.passkeys || []).find((p) => p.id === (body.response && body.response.id)) : null;
    if (!agent || agent.locked || !expectedChallenge || !pk) { sec.recordFail(ip, 'Passkey-Login fehlgeschlagen'); store.addLoginEvent({ ok: false, kind: 'passkey', who: body.username || '', ip, detail: agent && agent.locked ? 'Konto ist gesperrt' : 'Passkey unbekannt' }); sendJson(res, 401, { reason: 'bad-login' }); return true; }
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: body.response, expectedChallenge, expectedOrigin: RP_ORIGINS, expectedRPID: RP_ID,
        authenticator: { credentialID: b64urlToBuf(pk.id), credentialPublicKey: b64urlToBuf(pk.publicKey), counter: pk.counter || 0 },
        requireUserVerification: false,
      });
    } catch (e) { verification = { verified: false }; }
    if (!verification.verified) { sec.recordFail(ip, 'Passkey-Login fehlgeschlagen (' + agent.username + ')'); store.addLoginEvent({ ok: false, kind: 'passkey', who: agent.username, ip, detail: 'Passkey nicht bestätigt' }); sendJson(res, 401, { reason: 'bad-login' }); return true; }
    store.setPasskeyCounter(agent.id, pk.id, verification.authenticationInfo.newCounter);
    sec.resetFails(ip); sec.resetAccountFails(agent.username); sec.recordEvent('login-ok', ip, 'Passkey: ' + agent.username);
    store.addLoginEvent({ ok: true, kind: 'passkey', who: agent.username, ip });
    sendJson(res, 200, { token: sec.issueToken(ip, { name: agent.username, role: agent.role }), name: agent.username, role: agent.role, mustChange: !!agent.mustChange });
    return true;
  }

  // ---- Audition-Text (Teleprompter) – Abruf öffentlich (Bewerber liest ihn) ----
  if (urlPath === '/api/script' && req.method === 'GET') { sendJson(res, 200, { script: store.getScript() }); return true; }
  if (urlPath === '/api/intro' && req.method === 'GET') { sendJson(res, 200, { intro: store.getIntro() }); return true; }
  // Startseite: liegt ein echtes Team-Foto im Ordner public? (öffentlich)
  if (urlPath === '/api/site' && req.method === 'GET') {
    // Eigene Bilder, die einfach in den Ordner public gelegt werden können.
    const suche = (namen) => {
      for (const n of namen) {
        try { fs.accessSync(path.join(PUBLIC_DIR, n)); return '/' + n; } catch { /* nicht vorhanden */ }
      }
      return '';
    };
    sendJson(res, 200, {
      teamPhoto: suche(['team.jpg', 'team.jpeg', 'team.png', 'team.webp']),
      logo: suche(['logo.png', 'logo.webp', 'logo.jpg', 'logo.jpeg', 'logo.svg'])
    });
    return true;
  }
  // Figuren (Team-Avatare) – Abruf öffentlich (Bewerber sieht sie im Warteraum)
  if (urlPath === '/api/figures' && req.method === 'GET') { sendJson(res, 200, { figures: store.getFigures(), script: store.getFigureScript() }); return true; }

  // Posteingang: nimmt eine Akte von aussen entgegen und legt sie im Ordner
  // des Streamers ab. Ausweisen über MCP_TOKEN. Damit kann später auch ein
  // anderes System Akten hierher schicken – der Aufbau ist derselbe.
  if (urlPath === '/api/mcp/inbox' && req.method === 'POST') {
    if (!mcp.tokenOk(req.headers['authorization'])) {
      sec.recordFail(ip, 'MCP-Posteingang: falscher Schlüssel');
      sendJson(res, 401, { reason: 'auth' }); return true;
    }
    let paket; try { paket = await readJson(req, 4 * 1024 * 1024); } catch { sendJson(res, 413, { reason: 'too-large' }); return true; }
    const ordner = store.ablegen(paket || {});
    if (!ordner) { sendJson(res, 400, { reason: 'keine-bigo-id' }); return true; }
    sec.recordEvent('audit', ip, 'Akte im Ordner ' + ordner.bigoId + ' eingegangen');
    sendJson(res, 200, { ok: true, ordner: ordner.bigoId, id: ordner.id }); return true;
  }

  // Abhol-Punkt für die Gegenstelle: nur mit unterschriebenem, kurzlebigem Link.
  if (urlPath === '/api/pull' && req.method === 'GET') {
    const q = new URL(req.url, 'http://x').searchParams;
    const fallId = q.get('fall') || '', datei = q.get('datei') || '';
    if (!mcp.pruefeLink(fallId, datei, q.get('exp'), q.get('sig'))) {
      sec.recordEvent('audit', ip, 'MCP-Abholung abgewiesen (Link ungültig)');
      res.writeHead(403); res.end('Forbidden'); return true;
    }
    if (datei.startsWith('rec:')) {
      const data = store.readRecording(datei.slice(4));
      if (!data) { res.writeHead(404); res.end('not found'); return true; }
      res.writeHead(200, { 'Content-Type': data.mime, 'Content-Length': data.buffer.length, 'Cache-Control': 'no-store' });
      res.end(data.buffer); return true;
    }
    const fall = store.getCase(fallId);
    const doc = fall && (fall.docs || []).find((d) => d.file === datei);
    const data = doc && store.readDoc(fallId, doc);
    if (!data) { res.writeHead(404); res.end('not found'); return true; }
    res.writeHead(200, { 'Content-Type': data.mime, 'Content-Length': data.buffer.length, 'Cache-Control': 'no-store' });
    res.end(data.buffer); return true;
  }

  // ---- ab hier: gültiges Login nötig ----
  if (!authed(req, ip)) { sendJson(res, 401, { reason: 'auth' }); return true; }

  if (urlPath === '/api/change-password' && req.method === 'POST') {
    let body; try { body = await readJson(req, 16 * 1024); } catch { body = {}; }
    if (String(body.newPassword || '').length < 8) { sendJson(res, 400, { reason: 'too-short' }); return true; }
    const ok = store.changeOwnPassword(reqName(req, ip), body.newPassword);
    if (ok) sec.recordEvent('audit', ip, 'Passwort geändert: ' + reqName(req, ip));
    sendJson(res, ok ? 200 : 400, { ok }); return true;
  }

  // ---- Passkey einrichten (eingeloggter Prüfer, Face ID / Fingerabdruck) ----
  if (urlPath === '/api/passkey/register/options' && req.method === 'POST') {
    const agent = store.getAgentByUsername(reqName(req, ip));
    if (!agent) { sendJson(res, 403, { reason: 'agent-only' }); return true; }
    const opts = await generateRegistrationOptions({
      rpName: RP_NAME, rpID: RP_ID,
      userID: agent.id, userName: agent.username, userDisplayName: agent.username,
      attestationType: 'none',
      excludeCredentials: (agent.passkeys || []).map((p) => ({ id: b64urlToBuf(p.id), type: 'public-key' })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });
    waSetChallenge('reg:' + agent.id, opts.challenge);
    sendJson(res, 200, opts); return true;
  }
  if (urlPath === '/api/passkey/register/verify' && req.method === 'POST') {
    const agent = store.getAgentByUsername(reqName(req, ip));
    if (!agent) { sendJson(res, 403, { reason: 'agent-only' }); return true; }
    let body; try { body = await readJson(req, 32 * 1024); } catch { body = {}; }
    const expectedChallenge = waTakeChallenge('reg:' + agent.id);
    if (!expectedChallenge) { sendJson(res, 400, { reason: 'expired' }); return true; }
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: body, expectedChallenge, expectedOrigin: RP_ORIGINS, expectedRPID: RP_ID, requireUserVerification: false,
      });
    } catch (e) { sendJson(res, 400, { reason: 'verify-failed', detail: e.message }); return true; }
    if (!verification.verified || !verification.registrationInfo) { sendJson(res, 400, { reason: 'not-verified' }); return true; }
    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;
    store.addPasskey(agent.id, { id: bufToB64url(credentialID), publicKey: bufToB64url(credentialPublicKey), counter });
    sec.recordEvent('audit', ip, 'Passkey eingerichtet: ' + agent.username);
    sendJson(res, 200, { ok: true }); return true;
  }

  // ---- Zugangscodes ----
  if (urlPath === '/api/code' && req.method === 'POST') {
    let body; try { body = await readJson(req, 16 * 1024); } catch { body = {}; }
    const rec = store.createCode({ createdBy: reqName(req, ip), note: body.note });
    sendJson(res, 200, { code: rec.code }); return true;
  }
  if (urlPath === '/api/codes' && req.method === 'GET') { sendJson(res, 200, { codes: store.listCodes() }); return true; }
  if (urlPath === '/api/code-revoke' && req.method === 'POST') {
    let body; try { body = await readJson(req, 16 * 1024); } catch { body = {}; }
    store.revokeCode(body.code); sendJson(res, 200, { ok: true }); return true;
  }

  // ---- Warteraum ----
  if (urlPath === '/api/waiting' && req.method === 'GET') {
    const list = Array.from(waiting.values()).sort((a, b) => a.joinedAt - b.joinedAt).map((w) => {
      const busy = waitingBusy(w);
      const room = rooms.get(w.code);
      // Namen der Prüfer, die gerade in diesem Gespräch sind
      const hosts = [];
      if (room) for (const ws of room.values()) if (ws.role === 'host' && ws.pname) hosts.push(ws.pname);
      return {
        code: w.code, note: w.note, joinedAt: w.joinedAt, busy,
        bigoId: w.bigoId || '', bekannt: w.bekannt || null,
        claimedBy: busy ? w.claimedBy : null,
        hosts, live: hosts.length > 0,
        waitingSec: Math.max(0, Math.round((Date.now() - w.joinedAt) / 1000)),
      };
    });
    sendJson(res, 200, {
      waiting: list,
      free: list.filter((w) => !w.busy).length,
      running: list.filter((w) => w.live).length,
    }); return true;
  }
  // Ältesten wartenden Bewerber übernehmen ("Nächsten annehmen").
  if (urlPath === '/api/waiting/next' && req.method === 'POST') {
    if (!authed(req, ip)) { sendJson(res, 401, { reason: 'auth' }); return true; }
    const name = reqName(req, ip) || 'Prüfer';
    const next = Array.from(waiting.values())
      .filter((w) => !waitingBusy(w))
      .sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (!next) { sendJson(res, 404, { reason: 'none-waiting' }); return true; }
    next.claimedBy = name; next.claimedAt = Date.now();
    sendJson(res, 200, { code: next.code }); return true;
  }
  if (urlPath === '/api/waiting/claim' && req.method === 'POST') {
    let body; try { body = await readJson(req, 16 * 1024); } catch { body = {}; }
    const code = String(body.code || '').trim().toUpperCase();
    const entry = waiting.get(code);
    if (!entry) { sendJson(res, 404, { reason: 'gone' }); return true; }
    const wer = reqName(req, ip) || 'Prüfer';
    // Wer den Bewerber selbst gerade reserviert hat – etwa über „Nächsten
    // annehmen" – darf natürlich auch beitreten. Sonst blockierte sich der
    // Prüfer mit dem eigenen Klick.
    const fremd = waitingBusy(entry) && entry.claimedBy !== wer;
    if (fremd) { sendJson(res, 409, { reason: 'busy', by: entry.claimedBy || '' }); return true; }
    entry.claimedBy = wer; entry.claimedAt = Date.now();
    sendJson(res, 200, { ok: true }); return true;
  }
  if (urlPath === '/api/waiting/release' && req.method === 'POST') {
    let body; try { body = await readJson(req, 16 * 1024); } catch { body = {}; }
    const code = String(body.code || '').trim().toUpperCase();
    const entry = waiting.get(code); const room = rooms.get(code);
    if (entry && !(room && room.host) && entry.claimedBy === (reqName(req, ip) || 'Prüfer')) { entry.claimedBy = null; entry.claimedAt = 0; }
    sendJson(res, 200, { ok: true }); return true;
  }

  // ---- Streamer übernehmen, die es schon gibt (ohne Audition) ----
  // Wer im PK-Board mitläuft, soll auch hier eine Akte haben. Das Skript
  // pkboard-import.sh liest die Mitglieder und schickt sie hierher. Der
  // Aufruf darf beliebig oft kommen: Vorhandenes wird nicht überschrieben.
  if (urlPath === '/api/streamer-import' && req.method === 'POST') {
    if (!adminOnly()) return true;
    let body; try { body = await readJson(req, 2 * 1024 * 1024); } catch { sendJson(res, 413, { reason: 'too-large' }); return true; }
    const leute = Array.isArray(body.leute) ? body.leute.slice(0, 5000) : [];
    if (!leute.length) { sendJson(res, 400, { reason: 'keine-daten' }); return true; }
    let neu = 0, vorhanden = 0, ergaenzt = 0, ohneId = 0;
    const angelegt = [];
    for (const p of leute) {
      const r = store.ordnerAnlegen({
        bigoId: p.bigoId, name: p.name, alter: p.alter, art: p.art,
        notiz: p.notiz, status: p.status, herkunft: p.herkunft || 'pkboard',
      });
      if (r.grund === 'keine-bigo-id') { ohneId++; continue; }
      if (r.angelegt) { neu++; angelegt.push(r.ordner.bigoId); }
      else { vorhanden++; if (r.ergaenzt) ergaenzt++; }
    }
    sec.recordEvent('audit', ip, 'Streamer übernommen: ' + neu + ' neu, ' + vorhanden + ' vorhanden');
    sendJson(res, 200, { neu, vorhanden, ergaenzt, ohneId, gesamt: leute.length, angelegt: angelegt.slice(0, 50) });
    return true;
  }

  // ---- Kennen wir die Person schon? ----
  // Wird beim Eintippen der Ausweisdaten gefragt. Der Prüfer soll wissen,
  // ob die Audition an einen bestehenden Ordner angehängt wird oder ob ein
  // neuer entsteht – vor der Freigabe, nicht danach.
  if (urlPath === '/api/person-suche' && req.method === 'POST') {
    let body; try { body = await readJson(req, 8 * 1024); } catch { body = {}; }
    const t = store.suchePerson({
      bigoId: body.bigoId, docNumber: body.docNumber, name: body.name, age: body.age,
    });
    sendJson(res, 200, { treffer: t }); return true;
  }

  // ---- Fall speichern (Prüfer) ----
  if (urlPath === '/api/case' && req.method === 'POST') {
    let body; try { body = await readJson(req); } catch { sendJson(res, 413, { reason: 'too-large' }); return true; }
    if (!body.code || !store.isCodeUsable(body.code)) { sendJson(res, 400, { reason: 'bad-code' }); return true; }
    // Die beiden Texte kommen vom Server, nicht vom Browser: Sie sind die
    // Einwilligung, die der Bewerber abgegeben hat, und gehören unverändert
    // in die Akte. Wird der Text später geändert, bleibt hier stehen, was
    // an diesem Tag galt.
    const rec = store.saveCase({
      ...body, agentName: reqName(req, ip) || body.agentName,
      skript: store.getScript(), einleitung: store.getIntro(),
    });
    // Wurde die Aufnahme schon ausgewertet, bevor die Akte angelegt war?
    // Dann gehört die Einschätzung jetzt hier hinein.
    const auf = store.listRecordings().find((r) => r.code === rec.code && r.quality);
    if (auf) {
      store.addCaseEntry(rec.id, {
        text: auf.quality === 'ok'
          ? 'Aufnahme geprüft: brauchbar.' + (auf.reviewNote ? ' ' + auf.reviewNote : '')
          : 'Aufnahme geprüft: nicht brauchbar.' + (auf.reviewNote ? ' Grund: ' + auf.reviewNote : ''),
        author: auf.reviewedBy || 'Prüfer', kind: 'recording',
      });
    }
    sec.recordEvent('audit', ip, 'Fall ' + rec.result + ': ' + (rec.verifiedName || rec.id));
    // Fertige Akte wandert in den Ordner des Streamers auf mcp.4ever1.tv.
    // Das läuft im Hintergrund – der Prüfer wartet nicht darauf, und wenn die
    // Gegenstelle gerade nicht erreichbar ist, bleibt die Akte trotzdem hier.
    if (mcp.autoAn()) mcpUebergeben(rec.id, false);
    sendJson(res, 200, { id: rec.id, mcp: mcp.aktiv() }); return true;
  }

  // ---- Protokoll-Einträge in der Akte --------------------------------------
  // Vorschlag holen: Text aufräumen, damit der Nutzer entscheiden kann.
  if (urlPath === '/api/entry-polish' && req.method === 'POST') {
    if (!authed(req, ip)) { sendJson(res, 401, { reason: 'auth' }); return true; }
    let body; try { body = await readJson(req, 64 * 1024); } catch { body = {}; }
    const out = await textpolish.polishWithService(String(body.text || ''));
    sendJson(res, 200, out); return true;
  }
  // Eintrag anlegen – Prüfer (Teamleitung) und Admin dürfen das.
  if (urlPath === '/api/entry' && req.method === 'POST') {
    if (!authed(req, ip)) { sendJson(res, 401, { reason: 'auth' }); return true; }
    let body; try { body = await readJson(req, 64 * 1024); } catch { body = {}; }
    const rec = store.addCaseEntry(body.caseId, {
      text: body.text, original: body.original, author: reqName(req, ip) || 'Unbekannt',
    });
    if (!rec) { sendJson(res, 400, { reason: 'bad-entry' }); return true; }
    sec.recordEvent('audit', ip, 'Akten-Eintrag hinzugefügt');
    sendJson(res, 200, { entry: rec }); return true;
  }
  // Ändern und Löschen: nur Admin.
  if (urlPath === '/api/entry-update' && req.method === 'POST') {
    if (!adminOnly()) return true;
    let body; try { body = await readJson(req, 64 * 1024); } catch { body = {}; }
    const ok = store.updateCaseEntry(body.caseId, body.entryId, { text: body.text, editor: reqName(req, ip) || 'Admin' });
    if (ok) sec.recordEvent('audit', ip, 'Akten-Eintrag geändert');
    sendJson(res, ok ? 200 : 400, { ok }); return true;
  }
  if (urlPath === '/api/entry-delete' && req.method === 'POST') {
    if (!adminOnly()) return true;
    let body; try { body = await readJson(req, 16 * 1024); } catch { body = {}; }
    const ok = store.deleteCaseEntry(body.caseId, body.entryId);
    if (ok) sec.recordEvent('audit', ip, 'Akten-Eintrag gelöscht');
    sendJson(res, ok ? 200 : 400, { ok }); return true;
  }

  // ---- Aufnahme hochladen (Prüfer, roher Video-Body) ----
  if (urlPath === '/api/recording' && req.method === 'POST') {
    let buf; try { buf = await readRaw(req); } catch { sendJson(res, 413, { reason: 'too-large' }); return true; }
    if (!buf.length) { sendJson(res, 400, { reason: 'empty' }); return true; }
    const q = new URL(req.url, 'http://x').searchParams;
    const rec = store.saveRecording({ buffer: buf, mime: (req.headers['content-type'] || 'video/webm').split(';')[0].trim(), ext: q.get('ext') || 'webm', durationSec: q.get('dur'), code: q.get('code') || '', agentName: reqName(req, ip) });
    if (!rec) { sendJson(res, 400, { reason: 'bad-recording' }); return true; }
    sec.recordEvent('audit', ip, 'Aufnahme gespeichert: ' + rec.id);
    sendJson(res, 200, { id: rec.id, bytes: rec.bytes, durationSec: rec.durationSec }); return true;
  }

  // ---- Streamer-Ordner (mcp.4ever1.tv) ------------------------------------
  // Prüfer dürfen die Ordner sehen; ändern und löschen nur Admins.
  // Der Adminbereich sieht alles. Prüfer bekommen zunächst nur die Hülle:
  // dass es eine Akte gibt, wie sie heisst, wie viel drinsteht. Der Inhalt
  // kommt erst nach /api/streamer-oeffnen mit genanntem Grund – und zwar
  // wirklich erst dann, der Server schickt ihn vorher nicht mit.
  if (urlPath === '/api/streamers' && req.method === 'GET') {
    if (!authed(req, ip)) { sendJson(res, 401, { reason: 'auth' }); return true; }
    const admin = isAdmin(req, ip);
    sendJson(res, 200, {
      streamers: admin ? store.listStreamers() : store.listStreamersKurz(),
      voll: admin,
    });
    return true;
  }

  // ---- Akteneinsicht: nur mit Grund ----
  // Wer kein Admin ist, muss sagen, warum er hineinschaut. Der Grund landet
  // in der Akte, sichtbar für alle, und im Sicherheitsprotokoll. Admins
  // kommen ohne Angabe hinein – aber auch ihr Zugriff wird festgehalten.
  if (urlPath === '/api/streamer-oeffnen' && req.method === 'POST') {
    if (!authed(req, ip)) { sendJson(res, 401, { reason: 'auth' }); return true; }
    let body; try { body = await readJson(req, 16 * 1024); } catch { body = {}; }
    const admin = isAdmin(req, ip);
    const grund = String(body.grund || '').trim();
    if (!admin && grund.length < 5) { sendJson(res, 400, { reason: 'grund-fehlt' }); return true; }
    const s = store.getStreamer(body.id);
    if (!s) { sendJson(res, 404, { reason: 'nicht-gefunden' }); return true; }
    const wer = reqName(req, ip) || 'Unbekannt';
    store.protokolliereZugriff(s.id, { wer, rolle: admin ? 'admin' : 'pruefer', grund: admin ? (grund || 'Adminzugriff') : grund, ip });
    sec.recordEvent('audit', ip, 'Akte geöffnet (' + wer + '): ' + s.bigoId + (grund ? ' – ' + grund : ''));
    sendJson(res, 200, { ordner: store.getStreamer(s.id) });
    return true;
  }
  if (urlPath === '/api/streamer' && req.method === 'GET') {
    if (!authed(req, ip)) { sendJson(res, 401, { reason: 'auth' }); return true; }
    const s = store.getStreamer(new URL(req.url, 'http://x').searchParams.get('id') || '');
    if (!s) { sendJson(res, 404, { reason: 'gone' }); return true; }
    sendJson(res, 200, { streamer: s }); return true;
  }
  if (urlPath === '/api/streamer' && req.method === 'POST') {
    if (!adminOnly()) return true;
    let body; try { body = await readJson(req, 64 * 1024); } catch { body = {}; }
    const s = store.setStreamer(String(body.id || ''), body);
    if (!s) { sendJson(res, 404, { reason: 'gone' }); return true; }
    sec.recordEvent('audit', ip, 'Streamer-Ordner geändert: ' + s.bigoId);
    sendJson(res, 200, { streamer: s }); return true;
  }
  // Vermerke im Streamer-Ordner: schreiben darf jeder Prüfer, ändern nur
  // Admins, löschen nur über acp. – wie bei den Akten auch.
  if (urlPath === '/api/streamer-entry' && req.method === 'POST') {
    if (!authed(req, ip)) { sendJson(res, 401, { reason: 'auth' }); return true; }
    let body; try { body = await readJson(req, 64 * 1024); } catch { body = {}; }
    const rec = store.addStreamerEintrag(String(body.id || ''), {
      text: body.text, original: body.original, author: reqName(req, ip) || 'Unbekannt',
    });
    if (!rec) { sendJson(res, 400, { reason: 'bad-entry' }); return true; }
    sec.recordEvent('audit', ip, 'Vermerk im Streamer-Ordner hinzugefügt');
    sendJson(res, 200, { entry: rec }); return true;
  }
  if (urlPath === '/api/streamer-entry-update' && req.method === 'POST') {
    if (!adminOnly()) return true;
    let body; try { body = await readJson(req, 64 * 1024); } catch { body = {}; }
    const ok = store.updateStreamerEintrag(String(body.id || ''), String(body.entryId || ''), {
      text: body.text, editor: reqName(req, ip) || 'Admin',
    });
    if (ok) sec.recordEvent('audit', ip, 'Vermerk geändert');
    sendJson(res, ok ? 200 : 400, { ok }); return true;
  }
  if (urlPath === '/api/streamer-entry-delete' && req.method === 'POST') {
    if (!loeschenErlaubt()) return true;
    let body; try { body = await readJson(req, 16 * 1024); } catch { body = {}; }
    const ok = store.deleteStreamerEintrag(String(body.id || ''), String(body.entryId || ''));
    if (ok) sec.recordEvent('audit', ip, 'Vermerk gelöscht');
    sendJson(res, ok ? 200 : 400, { ok }); return true;
  }

  if (urlPath === '/api/streamer-delete' && req.method === 'POST') {
    if (!loeschenErlaubt()) return true;
    let body; try { body = await readJson(req, 16 * 1024); } catch { body = {}; }
    const ok = store.deleteStreamer(String(body.id || ''));
    if (ok) sec.recordEvent('audit', ip, 'Streamer-Ordner gelöscht');
    sendJson(res, 200, { ok }); return true;
  }

  // ---- Übergabe an mcp.4ever1.tv ------------------------------------------
  if (urlPath === '/api/mcp-status' && req.method === 'GET') {
    if (!adminOnly()) return true;
    sendJson(res, 200, mcp.info()); return true;
  }
  // Von Hand nachschicken, wenn es beim ersten Mal nicht geklappt hat.
  if (urlPath === '/api/mcp-push' && req.method === 'POST') {
    if (!adminOnly()) return true;
    let body; try { body = await readJson(req, 16 * 1024); } catch { body = {}; }
    if (!mcp.aktiv()) { sendJson(res, 400, { reason: 'nicht-eingerichtet' }); return true; }
    const erg = await mcpUebergeben(String(body.id || ''), true);
    sendJson(res, erg.ok ? 200 : 502, erg); return true;
  }
  // ---- Aufnahme auswerten: ist sie brauchbar geworden? ----
  // Das entscheidet der Prüfer selbst, direkt nach dem Gespräch. Er darf dafür
  // seine eigene Aufnahme ansehen; Admins dürfen alle.
  if (urlPath === '/api/recording-review' && req.method === 'POST') {
    if (!authed(req, ip)) { sendJson(res, 401, { reason: 'auth' }); return true; }
    let body; try { body = await readJson(req, 16 * 1024); } catch { body = {}; }
    const rec = store.getRecording(String(body.id || ''));
    if (!rec) { sendJson(res, 404, { reason: 'gone' }); return true; }
    const wer = reqName(req, ip) || 'Prüfer';
    if (!isAdmin(req, ip) && rec.agentName && rec.agentName !== wer) {
      sendJson(res, 403, { reason: 'not-yours' }); return true;
    }
    const neu = store.reviewRecording(rec.id, { quality: body.quality, note: body.note, by: wer });
    sec.recordEvent('audit', ip, 'Aufnahme ausgewertet (' + (neu.quality || 'offen') + '): ' + rec.id);
    // Die Auswertung gehört in die Akte – dort wird sie später nachgelesen.
    const fall = store.listCases().find((c) => c.code === rec.code);
    if (fall) {
      store.addCaseEntry(fall.id, {
        text: neu.quality === 'ok'
          ? 'Aufnahme geprüft: brauchbar.' + (neu.reviewNote ? ' ' + neu.reviewNote : '')
          : 'Aufnahme geprüft: nicht brauchbar.' + (neu.reviewNote ? ' Grund: ' + neu.reviewNote : ''),
        author: wer, kind: 'recording',
      });
    }
    sendJson(res, 200, { ok: true, recording: neu, imFall: !!fall }); return true;
  }

  // ---- ab hier: NUR Admin ----

  if (urlPath === '/api/agents' && req.method === 'GET') { if (!adminOnly()) return true; sendJson(res, 200, { agents: store.listAgents() }); return true; }
  if (urlPath === '/api/agents' && req.method === 'POST') {
    if (!adminOnly()) return true;
    let body; try { body = await readJson(req, 16 * 1024); } catch { body = {}; }
    const rec = store.addAgent({ username: body.username, password: body.password, role: body.role, createdBy: reqName(req, ip), require2fa: !!body.require2fa });
    if (!rec) { sendJson(res, 400, { reason: 'exists-or-invalid' }); return true; }
    sec.recordEvent('audit', ip, 'Mitarbeiter angelegt: ' + rec.username + (rec.totpSecret ? ' (mit 2FA)' : ' (ohne 2FA)'));
    // Nur bei aktiver 2FA: otpauth-Link + QR-Bild (SHA1/6/30 -> passt zu verifyTotp).
    let otpauth = '', qr = '';
    if (rec.totpSecret) {
      const label = encodeURIComponent('ident (' + rec.username + ')');
      otpauth = `otpauth://totp/${label}?secret=${rec.totpSecret}&issuer=ident&algorithm=SHA1&digits=6&period=30`;
      try { qr = await QRCode.toDataURL(otpauth, { margin: 1, width: 220 }); } catch (e) { /* QR optional */ }
    }
    sendJson(res, 200, { id: rec.id, username: rec.username, totpSecret: rec.totpSecret, otpauth, qr, has2fa: !!rec.totpSecret }); return true;
  }
  if (urlPath === '/api/agent-delete' && req.method === 'POST') {
    if (!loeschenErlaubt()) return true; let body; try { body = await readJson(req, 16 * 1024); } catch { body = {}; }
    sendJson(res, 200, { ok: store.deleteAgent(body.id) }); return true;
  }
  if (urlPath === '/api/agent-reset' && req.method === 'POST') {
    if (!adminOnly()) return true; let body; try { body = await readJson(req, 16 * 1024); } catch { body = {}; }
    if (String(body.newPassword || '').length < 8) { sendJson(res, 400, { reason: 'too-short' }); return true; }
    sendJson(res, 200, { ok: store.setAgentPassword(body.id, body.newPassword, true) }); return true;
  }
  if (urlPath === '/api/agent-unlock' && req.method === 'POST') {
    if (!adminOnly()) return true; let body; try { body = await readJson(req, 16 * 1024); } catch { body = {}; }
    sendJson(res, 200, { ok: store.unlockAgent(body.id) }); return true;
  }

  if (urlPath === '/api/script' && req.method === 'POST') {
    if (!adminOnly()) return true;
    let body; try { body = await readJson(req, 16 * 1024); } catch { body = {}; }
    store.setScript(body.script || ''); sec.recordEvent('audit', ip, 'Audition-Text geändert');
    sendJson(res, 200, { ok: true, script: store.getScript() }); return true;
  }
  if (urlPath === '/api/intro' && req.method === 'POST') {
    if (!adminOnly()) return true;
    let body; try { body = await readJson(req, 16 * 1024); } catch { body = {}; }
    store.setIntro(body.intro || ''); sec.recordEvent('audit', ip, 'Begrüßungstext geändert');
    sendJson(res, 200, { ok: true, intro: store.getIntro() }); return true;
  }
  // ---- Geräte eines Prüfers verwalten (nur Admin) --------------------------
  if (urlPath === '/api/agent-devices' && req.method === 'GET') {
    if (!adminOnly()) return true;
    const id = new URL(req.url, 'http://x').searchParams.get('id') || '';
    sendJson(res, 200, { devices: store.agentDevices(id), lockOn: agentDeviceLockOn(), lockEnvForced: /^(on|1|true|yes|off|0|false|no)$/.test(AGENT_DEVICE_LOCK_ENV) }); return true;
  }
  if (urlPath === '/api/agent-device-rename' && req.method === 'POST') {
    if (!adminOnly()) return true;
    let body; try { body = await readJson(req, 8 * 1024); } catch { body = {}; }
    sendJson(res, 200, { ok: store.renameAgentDevice(body.id, body.deviceId, body.name) }); return true;
  }
  if (urlPath === '/api/agent-device-remove' && req.method === 'POST') {
    if (!adminOnly()) return true;
    let body; try { body = await readJson(req, 8 * 1024); } catch { body = {}; }
    const ok = store.removeAgentDevice(body.id, body.deviceId);
    if (ok) sec.recordEvent('audit', ip, 'Gerät eines Prüfers entfernt');
    sendJson(res, 200, { ok }); return true;
  }
  // Alle Geräte lösen: das nächste Gerät, mit dem sich der Prüfer anmeldet,
  // wird automatisch wieder gebunden (praktisch bei neuem Handy).
  if (urlPath === '/api/agent-devices-reset' && req.method === 'POST') {
    if (!adminOnly()) return true;
    let body; try { body = await readJson(req, 8 * 1024); } catch { body = {}; }
    const ok = store.resetAgentDevices(body.id);
    if (ok) sec.recordEvent('audit', ip, 'Geräte-Bindung eines Prüfers zurückgesetzt');
    sendJson(res, 200, { ok }); return true;
  }

  // ---- Anmelde-Protokoll (nur Admin) ---------------------------------------
  if (urlPath === '/api/login-log' && req.method === 'GET') {
    if (!adminOnly()) return true;
    const q = new URL(req.url, 'http://x').searchParams;
    sendJson(res, 200, {
      events: store.listLoginEvents(q.get('limit') || 200),
      fails24h: store.loginFailCount(24),
    }); return true;
  }
  if (urlPath === '/api/login-log-clear' && req.method === 'POST') {
    if (!adminOnly()) return true;
    store.clearLoginLog(); sec.recordEvent('audit', ip, 'Anmelde-Protokoll geleert');
    sendJson(res, 200, { ok: true }); return true;
  }

  // ---- Geräte-Bindung ein-/ausschalten (nur Admin) -------------------------
  // Beim Einschalten wird das gerade benutzte Gerät sofort mit freigegeben –
  // sonst würde man sich mit dem eigenen Klick aussperren.
  if (urlPath === '/api/device-lock' && req.method === 'POST') {
    if (!adminOnly()) return true;
    let body; try { body = await readJson(req, 8 * 1024); } catch { body = {}; }
    const kind = body.kind === 'agent' ? 'agent' : 'admin';
    const on = !!body.on;
    if (on && kind === 'admin') {
      const dh = deviceHash(body.device);
      if (!dh) { sendJson(res, 400, { reason: 'device-missing' }); return true; }
      if (!store.findAdminDevice(dh)) store.addAdminDevice({ hash: dh, name: deviceLabel(req) });
    }
    store.setDeviceLock(kind, on);
    sec.recordEvent('audit', ip, 'Geräte-Bindung (' + kind + ') ' + (on ? 'eingeschaltet' : 'ausgeschaltet'));
    sendJson(res, 200, { ok: true, on: kind === 'admin' ? adminDeviceLockOn() : agentDeviceLockOn() }); return true;
  }

  // ---- Geräte-Freigabe verwalten (nur Admin) -------------------------------
  if (urlPath === '/api/admin-devices' && req.method === 'GET') {
    if (!adminOnly()) return true;
    sendJson(res, 200, { devices: store.listAdminDevices(), lockOn: adminDeviceLockOn(), lockEnvForced: /^(on|1|true|yes|off|0|false|no)$/.test(ADMIN_DEVICE_LOCK_ENV) }); return true;
  }
  // Freischalt-Code erzeugen: damit gibt ein bereits freigegebenes Gerät ein
  // neues frei (Code ist kurz gültig und nur einmal verwendbar).
  if (urlPath === '/api/admin-devices/invite' && req.method === 'POST') {
    if (!adminOnly()) return true;
    const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
    pendingDeviceInvite = { code, exp: Date.now() + 10 * 60 * 1000 };
    sec.recordEvent('audit', ip, 'Freischalt-Code für neues Admin-Gerät erzeugt');
    sendJson(res, 200, { code, validMin: 10 }); return true;
  }
  if (urlPath === '/api/admin-devices/rename' && req.method === 'POST') {
    if (!adminOnly()) return true;
    let body; try { body = await readJson(req, 8 * 1024); } catch { body = {}; }
    sendJson(res, 200, { ok: store.renameAdminDevice(body.id, body.name) }); return true;
  }
  if (urlPath === '/api/admin-devices/remove' && req.method === 'POST') {
    if (!adminOnly()) return true;
    let body; try { body = await readJson(req, 8 * 1024); } catch { body = {}; }
    // Das letzte Gerät darf nicht entfernt werden – sonst sperrt man sich aus.
    if (store.adminDeviceCount() <= 1) { sendJson(res, 400, { reason: 'last-device' }); return true; }
    const ok = store.removeAdminDevice(body.id);
    if (ok) sec.recordEvent('audit', ip, 'Admin-Gerät entfernt');
    sendJson(res, 200, { ok }); return true;
  }

  // ---- Admin-Oberfläche: Markup erst nach erfolgreichem Login ausliefern ----
  // So steht im Quelltext der Anmeldeseite nichts über Akten, Aufnahmen usw.
  if (urlPath === '/api/admin-shell' && req.method === 'GET') {
    if (!adminOnly()) return true;
    let html; try { html = fs.readFileSync(path.join(__dirname, 'views', 'admin-dash.html'), 'utf8'); }
    catch { sendJson(res, 500, { reason: 'shell-missing' }); return true; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html); return true;
  }

  // ---- Figuren (Team-Avatare) speichern – nur Admin (GET ist oben öffentlich) --
  if (urlPath === '/api/figures' && req.method === 'POST') {
    if (!adminOnly()) return true;
    let body; try { body = await readJson(req, 4 * 1024 * 1024); } catch { body = {}; }
    store.setFigures(sanitizeFigures(body.figures));
    if (typeof body.script === 'string') store.setFigureScript(body.script);
    sec.recordEvent('audit', ip, 'Figuren geändert');
    sendJson(res, 200, { ok: true, figures: store.getFigures(), script: store.getFigureScript() }); return true;
  }
  // ---- Admin-2FA im Panel (Face-ID-frei, mit Notausgang ADMIN_2FA_OFF) ----
  if (urlPath === '/api/admin-2fa/status' && req.method === 'GET') {
    if (!adminOnly()) return true;
    sendJson(res, 200, { active: !!store.getAdminTotp(), envForced: !!ADMIN_TOTP, off: ADMIN_2FA_OFF }); return true;
  }
  if (urlPath === '/api/admin-2fa/setup' && req.method === 'POST') {
    if (!adminOnly()) return true;
    const secret = sec.generateTotpSecret(); pendingAdminTotp = secret;
    const otpauth = `otpauth://totp/${encodeURIComponent('4EVER1 Admin')}?secret=${secret}&issuer=4EVER1&algorithm=SHA1&digits=6&period=30`;
    let qr = ''; try { qr = await QRCode.toDataURL(otpauth, { margin: 1, width: 220 }); } catch (e) { /* QR optional */ }
    sendJson(res, 200, { qr, otpauth, secret }); return true;
  }
  if (urlPath === '/api/admin-2fa/activate' && req.method === 'POST') {
    if (!adminOnly()) return true;
    let body; try { body = await readJson(req, 8 * 1024); } catch { body = {}; }
    if (!pendingAdminTotp || !sec.verifyTotp(pendingAdminTotp, body.code)) { sendJson(res, 400, { reason: 'bad-code' }); return true; }
    store.setAdminTotp(pendingAdminTotp); pendingAdminTotp = ''; sec.recordEvent('audit', ip, 'Admin-2FA aktiviert');
    sendJson(res, 200, { ok: true }); return true;
  }
  if (urlPath === '/api/admin-2fa/disable' && req.method === 'POST') {
    if (!adminOnly()) return true;
    store.setAdminTotp(''); pendingAdminTotp = ''; sec.recordEvent('audit', ip, 'Admin-2FA deaktiviert');
    sendJson(res, 200, { ok: true }); return true;
  }
  if (urlPath === '/api/cases' && req.method === 'GET') {
    if (!adminOnly()) return true;
    // Die zur Akte gehörende Aufnahme (über die Zugangsnummer) gleich mitliefern,
    // damit in der Akte wirklich alles zusammen steht.
    const recs = store.listRecordings();
    sendJson(res, 200, {
      cases: store.listCases().map((c) => {
        const r = c.code ? recs.find((x) => x.code === c.code) : null;
        return {
          ...c,
          docs: c.docs.map((d) => ({ label: d.label, file: d.file })),
          recording: r ? {
            id: r.id, bytes: r.bytes, durationSec: r.durationSec, ext: r.ext, createdAt: r.createdAt,
            // Auswertung des Prüfers gehört sichtbar in die Akte
            quality: r.quality || '', reviewNote: r.reviewNote || '',
            reviewedBy: r.reviewedBy || '', reviewedAt: r.reviewedAt || '',
          } : null,
        };
      }),
    }); return true;
  }
  if (urlPath === '/api/doc' && req.method === 'GET') {
    if (!isAdmin(req, ip)) { res.writeHead(403); res.end('Forbidden'); return true; }
    const q = new URL(req.url, 'http://x').searchParams;
    const c = store.getCase(q.get('id'));
    const docRec = c && c.docs.find((d) => d.file === q.get('file'));
    const data = docRec && store.readDoc(c.id, docRec);
    if (!data) { res.writeHead(404); res.end('not found'); return true; }
    res.writeHead(200, { 'Content-Type': data.mime, 'Cache-Control': 'no-store' }); res.end(data.buffer); return true;
  }
  if (urlPath === '/api/case-export' && req.method === 'GET') {
    if (!isAdmin(req, ip)) { res.writeHead(403); res.end('Forbidden'); return true; }
    const c = store.getCase(new URL(req.url, 'http://x').searchParams.get('id'));
    if (!c) { res.writeHead(404); res.end('Nicht gefunden'); return true; }
    const eh = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
    const status = c.result === 'approved' ? 'Freigegeben' : (c.result === 'rejected' ? 'Abgelehnt' : 'Offen');
    const row = (k, v) => v ? `<tr><th>${eh(k)}</th><td>${eh(v)}</td></tr>` : '';
    const imgs = (c.docs || []).map((d) => { const doc = store.readDoc(c.id, d); if (!doc) return ''; return `<figure><img src="data:${doc.mime};base64,${doc.buffer.toString('base64')}"><figcaption>${eh(d.label)}</figcaption></figure>`; }).join('');
    const checks = (c.checklist || []).map((x) => `<li>${x.checked ? '☑' : '☐'} ${eh(x.label)}</li>`).join('');
    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Audition ${eh(c.bigoName || c.verifiedName || c.code)}</title><style>
      *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1b2738;max-width:820px;margin:2rem auto;padding:0 1.2rem;line-height:1.5}
      h1{font-size:1.4rem;margin:0 0 .2rem} .sub{color:#6b7a90;font-size:.9rem;margin:0 0 1.2rem}
      .badge{display:inline-block;padding:.2rem .6rem;border-radius:999px;font-size:.85rem;font-weight:600}
      .ok{background:#e7f6ec;color:#1a7a3c} .no{background:#fdecec;color:#c23b37} .open{background:#fff4e0;color:#9a6a00}
      table{border-collapse:collapse;width:100%;margin:1rem 0} th,td{border:1px solid #e3e9f2;padding:.5rem .7rem;text-align:left;font-size:.92rem;vertical-align:top} th{width:34%;background:#f6f8fc;font-weight:600}
      figure{margin:0} .imgs{display:flex;flex-wrap:wrap;gap:1rem;margin-top:1rem} .imgs img{max-width:240px;border:1px solid #e3e9f2;border-radius:8px} figcaption{font-size:.75rem;color:#6b7a90;text-align:center;margin-top:.2rem}
      ul{padding-left:1.1rem;margin:.4rem 0} .print{margin:1rem 0;padding:.6rem 1rem;border:1px solid #3b6ef0;background:#eef3ff;border-radius:8px}
      pre.wortlaut{white-space:pre-wrap;font-family:inherit;font-size:.9rem;line-height:1.6;background:#f6f8fc;border:1px solid #e3e9f2;border-radius:8px;padding:.7rem .9rem;margin:.3rem 0}
      @media print{.print{display:none}}
    </style></head><body>
      <h1>4EVER1 · Audition</h1><p class="sub">BIGO Live · Bewerbungs-/Auditionsakte</p>
      <div class="print">Tipp: Mit <b>Strg/Cmd + P</b> → „Als PDF sichern" exportierst du diese Akte als PDF.</div>
      <p>Status: <span class="badge ${c.result === 'approved' ? 'ok' : (c.result === 'rejected' ? 'no' : 'open')}">${eh(status)}</span></p>
      <table>
        ${row('BIGO-ID', c.bigoName)}${row('Alter', c.age)}${row('Name laut Ausweis', c.verifiedName)}
        ${row('Ausweisart', c.docType)}${row('Ausweis-Nr.', c.docNumber)}${row('Zugangsnummer', c.code)}
        ${row('Prüfer', c.agentName)}${row('Datum', new Date(c.createdAt).toLocaleString('de-DE'))}
        ${row('Notiz', c.note)}${row('Ablehnungsgrund', c.rejectReason)}
        ${(() => { const r = c.code ? store.listRecordings().find((x) => x.code === c.code) : null;
          return row('Video-Aufnahme', r ? 'vorhanden (' + (r.bytes / (1024 * 1024)).toFixed(1) + ' MB'
            + (r.durationSec ? ', ' + Math.floor(r.durationSec / 60) + ':' + String(r.durationSec % 60).padStart(2, '0') : '')
            + ') – im Admin-Bereich abrufbar' : 'keine'); })()}
      </table>
      ${checks ? `<h3>Prüf-Checkliste</h3><ul>${checks}</ul>` : ''}
      ${imgs ? `<h3>Bilder</h3><div class="imgs">${imgs}</div>` : ''}
      ${c.skript ? `<h3>Vorgelesener Text (Einwilligung)</h3><pre class="wortlaut">${eh(c.skript)}</pre>` : ''}
      ${c.einleitung ? `<h3>Begrüßung / Ablauf</h3><pre class="wortlaut">${eh(c.einleitung)}</pre>` : ''}
    </body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(html); return true;
  }
  if (urlPath === '/api/case-delete' && req.method === 'POST') {
    if (!loeschenErlaubt()) return true; let body; try { body = await readJson(req, 16 * 1024); } catch { body = {}; }
    const ok = store.deleteCase(body.id); if (ok) sec.recordEvent('audit', ip, 'Fall gelöscht: ' + body.id);
    sendJson(res, 200, { ok }); return true;
  }

  if (urlPath === '/api/recordings' && req.method === 'GET') {
    if (!adminOnly()) return true;
    const cs = store.listCases();
    const recs = store.listRecordings().map((r) => { const c = cs.find((x) => x.code === r.code); return { ...r, bigoName: c ? c.bigoName : '', name: c ? c.verifiedName : '', result: c ? c.result : '' }; });
    sendJson(res, 200, { recordings: recs }); return true;
  }
  if (urlPath === '/api/recording' && req.method === 'GET') {
    // Admins sehen alles. Ein Prüfer darf die Aufnahme ansehen, die er selbst
    // gemacht hat – sonst könnte er nicht beurteilen, ob sie etwas geworden ist.
    const recId = new URL(req.url, 'http://x').searchParams.get('id');
    const meta = store.getRecording(recId || '');
    const eigene = meta && authed(req, ip) && meta.agentName && meta.agentName === (reqName(req, ip) || '');
    if (!isAdmin(req, ip) && !eigene) { res.writeHead(403); res.end('Forbidden'); return true; }
    const data = store.readRecording(recId);
    if (!data) { res.writeHead(404); res.end('not found'); return true; }
    const total = data.buffer.length; const range = req.headers['range'];
    const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m) {
      let start = m[1] === '' ? 0 : parseInt(m[1], 10); let end = m[2] === '' ? total - 1 : parseInt(m[2], 10);
      if (isNaN(start) || isNaN(end) || start > end || start >= total) { res.writeHead(416, { 'Content-Range': `bytes */${total}` }); res.end(); return true; }
      end = Math.min(end, total - 1);
      res.writeHead(206, { 'Content-Type': data.mime, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'no-store' });
      res.end(data.buffer.subarray(start, end + 1)); return true;
    }
    res.writeHead(200, { 'Content-Type': data.mime, 'Content-Length': total, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
    res.end(data.buffer); return true;
  }
  if (urlPath === '/api/recording-delete' && req.method === 'POST') {
    if (!loeschenErlaubt()) return true; let body; try { body = await readJson(req, 16 * 1024); } catch { body = {}; }
    const ok = store.deleteRecording(body.id); if (ok) sec.recordEvent('audit', ip, 'Aufnahme gelöscht: ' + body.id);
    sendJson(res, 200, { ok }); return true;
  }

  // ---- Überwachung ----
  if (urlPath === '/api/security' && req.method === 'GET') { if (!adminOnly()) return true; sendJson(res, 200, sec.getMonitoring()); return true; }
  if (urlPath === '/api/security-unblock' && req.method === 'POST') {
    if (!adminOnly()) return true; let body; try { body = await readJson(req, 16 * 1024); } catch { body = {}; }
    sec.unblock(body.ip); sendJson(res, 200, { ok: true }); return true;
  }
  if (urlPath === '/api/security-block' && req.method === 'POST') {
    if (!adminOnly()) return true; let body; try { body = await readJson(req, 16 * 1024); } catch { body = {}; }
    sec.block(body.ip, 'manuell'); sendJson(res, 200, { ok: true }); return true;
  }

  sendJson(res, 404, { reason: 'unknown' }); return true;
}

// ---- HTTP-Server -----------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const ip = sec.clientIp(req);
  let urlPath;
  try { urlPath = decodeURIComponent(req.url.split('?')[0]); }
  catch { res.writeHead(400); res.end('Bad request'); return; }

  sec.setSecurityHeaders(res);
  if (sec.isBlocked(ip)) { res.writeHead(403); res.end('Forbidden'); return; }
  if (urlPath !== '/healthz' && !authed(req, ip) && !sec.rateLimit(ip)) { res.writeHead(429); res.end('Zu viele Anfragen'); return; }

  if (urlPath === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  if (urlPath === '/ice') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ iceServers: buildIceServers() })); return; }

  if (urlPath.startsWith('/api/')) { try { if (await handleApi(req, res, urlPath, ip)) return; } catch { if (!res.headersSent) sendJson(res, 500, { reason: 'server-error' }); return; } }

  // Statische Dateien – je nach Subdomain der passende Einstieg:
  //   ident.*   -> Bewerber-Startseite      (index.html)
  //   pruefer.* -> Mitarbeiter-Login        (index.html, Modus per JS)
  //   admin.*   -> Admin-Bereich            (admin.html)
  //   mcp.*     -> Team-Bereich             (index.html, Warteraum + Ordner)
  //   acp.*     -> Diagnose + Löschen       (admin.html)
  //   mein.*    -> gehört dem PK-Board auf dem anderen Server, nicht hier
  const hostName = String(req.headers.host || '').split(':')[0].toLowerCase();
  const acpHost = hostName.startsWith('acp.');          // Diagnose + Löschen
  // mein.<domain> gehört dem PK-Board auf dem anderen Server – hier nicht mehr.
  const mcpHost = hostName.startsWith('mcp.');  // Team
  const altHost = hostName.startsWith('admin.') || hostName.startsWith('pruefer.');
  // Alte Adressen leiten auf den Team-Bereich weiter, damit Lesezeichen und
  // laufende Sitzungen nicht ins Leere laufen. Vorübergehend (302), damit
  // Browser es nicht dauerhaft merken.
  if (altHost) {
    // Beide landen im Team-Bereich. Auch admin.<domain> führt bewusst NICHT
    // mehr in die Verwaltung – die liegt woanders und wird nicht verraten.
    const ziel = 'https://mcp.' + hostName.split('.').slice(1).join('.') + '/';
    res.writeHead(302, { Location: ziel, 'Cache-Control': 'no-store' });
    res.end('Umgezogen nach ' + ziel); return;
  }
  // www. und die kurze Form sind sonst zwei Adressen mit demselben Inhalt.
  // Alles läuft auf der kurzen Form zusammen.
  if (hostName.startsWith('www.')) {
    const ziel = 'https://' + hostName.slice(4) + req.url;
    res.writeHead(301, { Location: ziel, 'Cache-Control': 'no-store' });
    res.end('Weiter zu ' + ziel); return;
  }
  const adminHost = acpHost;   // der Admin-Bereich wird über acp. und mcp./verwaltung erreicht
  // Hauptdomain (4ever1.tv, www.4ever1.tv) -> öffentliche Startseite der Agentur.
  // ident./pruefer. -> Audition bzw. Mitarbeiter-Login, admin. -> Verwaltung.
  const knownSub = /^(ident|pruefer|admin|acp|mcp)\./.test(hostName);
  const homeHost = !knownSub && !/^(localhost|127\.|\[|\d+\.\d+\.\d+\.\d+$)/.test(hostName);
  // acp. -> Diagnose/Löschen, mcp. -> Team-Bereich (Warteraum + Ordner),
  // Hauptdomain -> öffentliche Seite, sonst die Bewerber-Seite.
  if (urlPath === '/') urlPath = acpHost ? '/admin.html' : (mcpHost ? '/index.html' : (homeHost ? '/home.html' : '/index.html'));
  if (urlPath === '/start' || urlPath === '/home') urlPath = '/home.html';
  // Eigener Direkt-Link für Prüfer -> Startseite öffnet gleich den Mitarbeiter-Login
  if (['/pruefer', '/login', '/team', '/mitarbeiter'].includes(urlPath)) urlPath = '/index.html';
  // Alles Administrative liegt ausschliesslich auf acp.<domain>: einrichten,
  // Diagnose, Löschen. Auf jeder anderen Adresse – auch auf mcp. – gibt es
  // die Verwaltung schlicht nicht. Kein Hinweis, keine Weiterleitung: eine
  // Weiterleitung würde die Adresse verraten, nach der niemand fragen soll.
  if (['/panel', '/admin', '/admin.html', '/verwaltung'].includes(urlPath)) {
    if (!acpHost) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Nicht gefunden'); return; }
    urlPath = '/admin.html';
  }
  // Suchmaschinen: Die Hauptseite darf gefunden werden, die Arbeitsbereiche
  // ausdrücklich nicht. Das wird je nach Adresse unterschiedlich beantwortet.
  if (urlPath === '/robots.txt') {
    const txt = homeHost
      ? 'User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://' + hostName + '/sitemap.xml\n'
      : 'User-agent: *\nDisallow: /\n';
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
    res.end(txt); return;
  }
  if (urlPath === '/sitemap.xml') {
    if (!homeHost) { res.writeHead(404); res.end('Nicht gefunden'); return; }
    const heute = new Date().toISOString().slice(0, 10);
    const seiten = ['/', '/impressum', '/datenschutz'];
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + seiten.map((u) => '  <url><loc>https://' + hostName + u + '</loc><lastmod>' + heute + '</lastmod></url>').join('\n')
      + '\n</urlset>\n';
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
    res.end(xml); return;
  }
  if (urlPath === '/figur' || urlPath === '/figuren') urlPath = '/figur.html';
  if (urlPath === '/datenschutz') urlPath = '/datenschutz.html';
  if (urlPath === '/impressum') urlPath = '/impressum.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Nicht gefunden'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---- WebSocket-Signalisierung (WebRTC-Mesh: 1 Bewerber + bis zu 4 Prüfer) --
const wss = new WebSocketServer({ server });
/** rooms: Map<code, Map<peerId, ws>> */
const rooms = new Map();
/** waiting: Map<code, {code, note, joinedAt, claimedBy, claimedAt}> */
const waiting = new Map();
const CLAIM_TTL = 30000;
const MAX_HOSTS = 4;
function roomHosts(room) { let n = 0; if (room) for (const w of room.values()) if (w.role === 'host') n++; return n; }
function roomHasGuest(room) { if (room) for (const w of room.values()) if (w.role === 'guest') return true; return false; }
function waitingBusy(entry) {
  const room = rooms.get(entry.code);
  if (room && roomHosts(room) > 0) return true;
  return !!(entry.claimedBy && (Date.now() - entry.claimedAt) < CLAIM_TTL);
}
function send(ws, obj) { if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj)); }

wss.on('connection', (ws, req) => {
  ws.ip = sec.clientIp(req);
  if (sec.isBlocked(ws.ip)) { try { ws.close(); } catch {} return; }
  ws.peerId = crypto.randomUUID();

  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'join') {
      const code = String(msg.room || '').trim().toUpperCase();
      if (!code) { send(ws, { type: 'error', reason: 'no-room' }); return; }
      const role = msg.role === 'host' ? 'host' : 'guest';

      if (role === 'host') {
        if (!sec.validToken(msg.token, ws.ip)) { sec.recordFail(ws.ip, 'WS: ungültiges Prüfer-Token'); send(ws, { type: 'error', reason: 'auth' }); return; }
      } else {
        if (!store.isCodeUsable(code)) { sec.recordFail(ws.ip, 'WS: ungültiger Zugangscode (' + code + ')'); send(ws, { type: 'error', reason: 'bad-code' }); return; }
      }

      let room = rooms.get(code); if (!room) { room = new Map(); rooms.set(code, room); }
      if (role === 'guest' && roomHasGuest(room)) { send(ws, { type: 'error', reason: 'room-full' }); return; }
      if (role === 'host' && roomHosts(room) >= MAX_HOSTS) { send(ws, { type: 'error', reason: 'room-full' }); return; }

      ws.roomCode = code; ws.role = role; ws.pname = String(msg.name || (role === 'host' ? 'Prüfer' : 'Bewerber')).slice(0, 40);
      const peers = [];
      for (const other of room.values()) peers.push({ peerId: other.peerId, role: other.role, name: other.pname });
      room.set(ws.peerId, ws);
      // Neuen Teilnehmer den Bestehenden melden (die initiieren die Verbindung).
      for (const other of room.values()) if (other !== ws) send(other, { type: 'peer-joined', peerId: ws.peerId, role, name: ws.pname });
      send(ws, { type: 'joined', role, peerId: ws.peerId, peers });

      if (role === 'guest') {
        const note = store.getCode(code); // Notiz aus dem Code (falls hinterlegt)
        // Gleich nachsehen, ob wir die Person kennen. Steht damit in der
        // Warteschlange, noch bevor jemand das Gespräch annimmt.
        const bigo = String(msg.bigo || '').trim().slice(0, 80);
        let bekannt = null;
        try { bekannt = store.suchePerson({ bigoId: bigo, age: msg.alter }); } catch { bekannt = null; }
        waiting.set(code, {
          code, note: note ? note.note : '', joinedAt: Date.now(), claimedBy: null, claimedAt: 0,
          bigoId: bigo, bekannt,
        });
      } else {
        const w = waiting.get(code); if (w) { w.claimedBy = ws.pname; w.claimedAt = Date.now(); }
      }
      return;
    }

    // Signal gezielt an einen Peer (msg.to) weiterreichen.
    if (msg.type === 'signal') {
      const room = rooms.get(ws.roomCode); if (!room) return;
      const target = room.get(msg.to); if (target) send(target, { type: 'signal', from: ws.peerId, data: msg.data });
      return;
    }
  });

  ws.on('close', () => {
    const room = rooms.get(ws.roomCode); if (!room) return;
    room.delete(ws.peerId);
    for (const other of room.values()) send(other, { type: 'peer-left', peerId: ws.peerId });
    if (ws.role === 'guest') { waiting.delete(ws.roomCode); }
    else {
      const w = waiting.get(ws.roomCode);
      if (w && roomHosts(room) === 0) { if (!store.isCodeUsable(ws.roomCode)) waiting.delete(ws.roomCode); else { w.claimedBy = null; w.claimedAt = 0; } }
    }
    if (room.size === 0) rooms.delete(ws.roomCode);
  });
});

server.listen(PORT, () => {
  console.log(`ident läuft auf Port ${PORT}`);
  console.log(`Daten: ${storeInfo.DATA_DIR} (${sec.hasKey() ? 'verschlüsselt' : 'UNVERSCHLÜSSELT'})`);
  const pwHint = ADMIN_PASSWORD
    ? `gesetzt (${ADMIN_PASSWORD.length} Zeichen, beginnt mit "${ADMIN_PASSWORD.slice(0, 2)}", endet mit "${ADMIN_PASSWORD.slice(-2)}")`
    : 'NICHT gesetzt – Verwaltung gesperrt';
  console.log(`Admin-Passwort: ${pwHint}`);
  console.log(`Admin-2FA: ${adminTotpSecret() ? 'AKTIV (2FA-Code nötig)' : 'AUS (nur Passwort)'}${ADMIN_2FA_OFF ? ' – per ADMIN_2FA_OFF abgeschaltet' : ''}`);
  console.log(`Mitarbeiter-Konten: ${store.agentCount()}`);
  console.log(`TURN: ${TURN_SECRET && TURN_HOST ? 'aktiv (' + TURN_HOST + ')' : 'nur STUN'}`);
  console.log(`Login-IP-Sperre: ${sec.loginIpRestricted() ? 'aktiv' : 'aus'}`);
  console.log(`Aufbewahrung: ${RETENTION_DAYS > 0 ? 'Auto-Löschung nach ' + RETENTION_DAYS + ' Tagen' : 'aus (Akten bleiben)'}`);
  const mi = mcp.info();
  console.log(`Übergabe an MCP: ${mi.aktiv ? (mi.auto ? 'automatisch' : 'nur von Hand') + ' -> ' + mi.ziel : 'nicht eingerichtet (MCP_URL fehlt)'}`);
  if (!mi.lokal && !mi.oeffentlicheAdresse) console.warn('!! Hinweis: PUBLIC_URL fehlt – die Gegenstelle bekommt keine Abhol-Links für Bilder und Video.');
  console.log(`Streamer-Ordner: ${store.streamerCount()}`);
  if (!sec.hasKey()) console.warn('!! WARNUNG: STORAGE_KEY fehlt – Daten werden UNVERSCHLÜSSELT gespeichert!');
});

// Auto-Löschung: beim Start und danach alle 6 Stunden.
function runRetention() {
  if (RETENTION_DAYS <= 0) return;
  try { const n = store.purgeOlderThan(RETENTION_DAYS); if (n) { sec.recordEvent('audit', 'system', n + ' Akte(n)/Aufnahme(n) automatisch gelöscht (>' + RETENTION_DAYS + ' Tage)'); console.log('Auto-Löschung: ' + n + ' Einträge entfernt.'); } } catch (e) { console.error('Auto-Löschung Fehler:', e.message); }
}
runRetention();
setInterval(runRetention, 6 * 60 * 60 * 1000);
