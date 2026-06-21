/*
 * Verifizierungs-Video-Raum — Server
 * ----------------------------------
 * Zwei Aufgaben:
 *   1. Statische Dateien aus /public ausliefern (die eigentliche Web-App).
 *   2. WebSocket-"Signalisierung": Der Server vermittelt nur die Verbindung
 *      zwischen Moderator (du) und Bewerber. Das eigentliche Video läuft
 *      danach direkt von Browser zu Browser (WebRTC) — es geht NICHT über
 *      diesen Server.
 *
 * Pro Raum sind genau 2 Teilnehmer erlaubt: der Moderator ("host") und
 * der Bewerber ("guest"). Der Server merkt sich, wer in welchem Raum ist,
 * und leitet die Aushandlungs-Nachrichten (SDP / ICE) an den jeweils
 * anderen weiter.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const store = require('./store');
const security = require('./security');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Speicherort der Daten (in Coolify: Persistent Volume, z. B. /data).
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
// Schlüssel zum Verschlüsseln der Ausweis-Fotos (leer = unverschlüsselt).
const STORAGE_KEY = process.env.STORAGE_KEY || '';
// Optionales 2FA-Secret (base32) für den ADMIN. Leer = nur Passwort (unsicher).
const MODERATOR_TOTP_SECRET = process.env.MODERATOR_TOTP_SECRET || '';
// Optionale IP-Allowlist fürs Login (Komma-getrennt). Leer = keine Beschränkung.
const LOGIN_ALLOW_IPS = process.env.LOGIN_ALLOW_IPS || '';

const storeInfo = store.init({ dir: DATA_DIR, encKey: STORAGE_KEY });
security.init({ persist: store.logSecurity, initial: store.getSecurityLog() });
security.setLoginAllowIps(LOGIN_ALLOW_IPS.split(','));

// ---------------------------------------------------------------------------
// ICE-/TURN-Konfiguration (für zuverlässige Verbindungen)
// ---------------------------------------------------------------------------
// STUN ist immer dabei. Ist zusätzlich ein TURN-Server konfiguriert
// (Umgebungsvariablen TURN_SECRET + TURN_HOST), liefert der /ice-Endpunkt
// zeitlich begrenzte Zugangsdaten (TURN-REST-Verfahren, passend zu coturns
// "use-auth-secret"). So stehen keine festen Passwörter im Client.
const TURN_SECRET = process.env.TURN_SECRET || '';
const TURN_HOST = process.env.TURN_HOST || '';
const TURN_TTL = parseInt(process.env.TURN_TTL || '3600', 10); // Sekunden
const STUN_URLS = (process.env.STUN_URLS ||
  'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302')
  .split(',').map((s) => s.trim()).filter(Boolean);

// Admin-Passwort: damit verwaltet man die persönlichen Moderator-Logins
// (anlegen/löschen). Fällt auf MODERATOR_PASSWORD zurück (Abwärtskompatibilität).
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.MODERATOR_PASSWORD || '';

function buildIceServers() {
  const servers = [{ urls: STUN_URLS }];
  if (TURN_SECRET && TURN_HOST) {
    // Nutzername = Ablaufzeitpunkt (Unix), Passwort = HMAC-SHA1 davon.
    const expiry = Math.floor(Date.now() / 1000) + TURN_TTL;
    const username = String(expiry);
    const credential = crypto.createHmac('sha1', TURN_SECRET)
      .update(username).digest('base64');
    servers.push({
      urls: [
        `turn:${TURN_HOST}:3478?transport=udp`,
        `turn:${TURN_HOST}:3478?transport=tcp`,
      ],
      username,
      credential,
    });
  }
  return servers;
}

// ---------------------------------------------------------------------------
// HTTP-Helfer + API (Login, Einmalcodes, Accounts)
// ---------------------------------------------------------------------------
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

// Sicherheits-HTTP-Header (gegen XSS, Clickjacking, Protokoll-Downgrade …).
function setSecurityHeaders(res) {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Kamera/Mikro nur für die eigene Seite erlaubt (für die Video-Funktion nötig).
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob: mediastream:",
    "connect-src 'self' ws: wss:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; '));
}
function readBody(req, limit = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too-large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}
// Liest den Anfrage-Body als rohen Buffer (für Video-Uploads).
function readRawBody(req, limit = 300 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too-large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function getToken(req) {
  const h = req.headers['authorization'] || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  if (req.headers['x-auth-token']) return req.headers['x-auth-token'];
  try { return new URL(req.url, 'http://x').searchParams.get('token') || ''; }
  catch { return ''; }
}
function isAuthed(req) { return security.validToken(getToken(req), security.clientIp(req)); }
function isAdminReq(req) { return security.isAdminToken(getToken(req), security.clientIp(req)); }
function reqName(req) { const i = security.tokenInfo(getToken(req)); return i ? i.name : ''; }

// Behandelt /api/*-Anfragen. Gibt true zurück, wenn die Anfrage erledigt ist.
async function handleApi(req, res, urlPath, ip) {
  if (!urlPath.startsWith('/api/')) return false;

  // ---- Login ----
  // Mit Benutzername  -> persönlicher Moderator-Login (eigenes Passwort + 2FA).
  // Ohne Benutzername -> Admin-Login (ADMIN_PASSWORD + optional Admin-2FA),
  //                      nur zum Verwalten der Moderator-Konten.
  if (urlPath === '/api/login' && req.method === 'POST') {
    // Optionale Standort-/IP-Sperre: Login nur von erlaubten IPs.
    if (!security.loginIpAllowed(ip)) {
      security.recordEvent('blocked', ip, 'Login von nicht erlaubter IP');
      sendJson(res, 403, { reason: 'ip-blocked' }); return true;
    }
    let body; try { body = await readBody(req, 64 * 1024); } catch { sendJson(res, 400, { reason: 'bad-request' }); return true; }
    const username = String(body.username || '').trim();

    if (username) {
      const existing = store.getModeratorByUsername(username);
      if (existing && existing.locked) {
        security.recordEvent('auth-fail', ip, 'Gesperrtes Konto: ' + username);
        sendJson(res, 403, { reason: 'account-locked' }); return true;
      }
      const m = store.verifyModerator(username, body.password || '');
      const okTotp = m ? security.verifyTotp(m.totpSecret, body.totp) : false;
      if (m && okTotp) {
        security.resetFails(ip);
        security.resetAccountFails(username);
        security.recordEvent('login-ok', ip, 'Moderator: ' + m.username);
        sendJson(res, 200, { token: security.issueToken(ip, { name: m.username, isAdmin: false }), name: m.username, role: 'moderator', mustChange: !!m.mustChange });
      } else {
        security.recordFail(ip, 'Moderator-Login fehlgeschlagen (' + username + ')');
        // Zusätzlich: Fehlversuche pro Konto -> Konto sperren.
        if (existing && security.recordAccountFail(username)) {
          store.lockModerator(username);
          security.recordEvent('blocked', ip, 'Konto gesperrt (zu viele Fehlversuche): ' + username);
        }
        sendJson(res, 401, { reason: m ? 'bad-totp' : 'bad-login' });
      }
      return true;
    }

    // Admin
    if (!ADMIN_PASSWORD) { sendJson(res, 503, { reason: 'mod-not-configured' }); return true; }
    const okPw = security.safeEqual(body.password || '', ADMIN_PASSWORD);
    const okTotp = security.verifyTotp(MODERATOR_TOTP_SECRET, body.totp);
    if (okPw && okTotp) {
      security.resetFails(ip);
      security.recordEvent('login-ok', ip, 'Admin');
      sendJson(res, 200, { token: security.issueToken(ip, { name: 'Admin', isAdmin: true }), name: 'Admin', role: 'admin' });
    } else {
      security.recordFail(ip, 'Admin-Login fehlgeschlagen');
      sendJson(res, 401, { reason: !okPw ? 'bad-password' : 'bad-totp' });
    }
    return true;
  }

  // Alle weiteren API-Routen erfordern ein gültiges Login-Token.
  if (!isAuthed(req)) { sendJson(res, 401, { reason: 'auth' }); return true; }

  // ---- Eigenes Passwort ändern (eingeloggter Moderator) ----
  if (urlPath === '/api/change-password' && req.method === 'POST') {
    let body; try { body = await readBody(req, 16 * 1024); } catch { body = {}; }
    const pw = String(body.newPassword || '');
    if (pw.length < 8) { sendJson(res, 400, { reason: 'too-short' }); return true; }
    const ok = store.changeOwnPassword(reqName(req), pw);
    if (ok) security.recordEvent('audit', ip, 'Passwort geändert: ' + reqName(req));
    sendJson(res, ok ? 200 : 400, { ok }); return true;
  }

  // ---- Moderator-Konten verwalten (nur Admin) ----
  if (urlPath === '/api/moderators' && req.method === 'GET') {
    if (!isAdminReq(req)) { sendJson(res, 403, { reason: 'admin-only' }); return true; }
    sendJson(res, 200, { moderators: store.listModerators() }); return true;
  }
  if (urlPath === '/api/moderators' && req.method === 'POST') {
    if (!isAdminReq(req)) { sendJson(res, 403, { reason: 'admin-only' }); return true; }
    let body; try { body = await readBody(req, 64 * 1024); } catch { body = {}; }
    const totpSecret = security.generateTotpSecret();
    const m = store.addModerator({ username: body.username, password: body.password, totpSecret, createdBy: reqName(req) });
    if (!m) { sendJson(res, 400, { reason: 'exists-or-invalid' }); return true; }
    security.recordEvent('audit', ip, 'Moderator angelegt: ' + m.username);
    const otpauth = `otpauth://totp/verify.4ever1.tv:${encodeURIComponent(m.username)}?secret=${totpSecret}&issuer=4ever1`;
    sendJson(res, 200, { id: m.id, username: m.username, totpSecret, otpauth }); return true;
  }
  if (urlPath === '/api/moderator-delete' && req.method === 'POST') {
    if (!isAdminReq(req)) { sendJson(res, 403, { reason: 'admin-only' }); return true; }
    let body; try { body = await readBody(req, 16 * 1024); } catch { body = {}; }
    const ok = store.deleteModerator(body.id);
    if (ok) security.recordEvent('audit', ip, 'Moderator gelöscht: ' + body.id);
    sendJson(res, 200, { ok }); return true;
  }
  if (urlPath === '/api/moderator-reset' && req.method === 'POST') {
    if (!isAdminReq(req)) { sendJson(res, 403, { reason: 'admin-only' }); return true; }
    let body; try { body = await readBody(req, 16 * 1024); } catch { body = {}; }
    const pw = String(body.newPassword || '');
    if (pw.length < 8) { sendJson(res, 400, { reason: 'too-short' }); return true; }
    const ok = store.resetModeratorPassword(body.id, pw);
    if (ok) security.recordEvent('audit', ip, 'Passwort zurückgesetzt für ' + body.id);
    sendJson(res, ok ? 200 : 400, { ok }); return true;
  }
  if (urlPath === '/api/moderator-unlock' && req.method === 'POST') {
    if (!isAdminReq(req)) { sendJson(res, 403, { reason: 'admin-only' }); return true; }
    let body; try { body = await readBody(req, 16 * 1024); } catch { body = {}; }
    const ok = store.unlockModerator(body.id);
    if (ok) security.recordEvent('audit', ip, 'Konto entsperrt: ' + body.id);
    sendJson(res, ok ? 200 : 400, { ok }); return true;
  }

  // ---- Einmalcode erzeugen ----
  if (urlPath === '/api/room' && req.method === 'POST') {
    let body; try { body = await readBody(req, 64 * 1024); } catch { body = {}; }
    const rec = store.createCode({ createdBy: reqName(req), applicantName: body.applicantName });
    sendJson(res, 200, { code: rec.code });
    return true;
  }
  if (urlPath === '/api/codes' && req.method === 'GET') {
    sendJson(res, 200, { codes: store.listCodes() }); return true;
  }
  if (urlPath === '/api/code-revoke' && req.method === 'POST') {
    let body; try { body = await readBody(req, 16 * 1024); } catch { body = {}; }
    store.revokeCode(body.code); sendJson(res, 200, { ok: true }); return true;
  }
  // ---- Warteliste: wartende Bewerber zum "Abholen" (eingeloggte Moderatoren) ----
  if (urlPath === '/api/waiting' && req.method === 'GET') {
    const list = Array.from(waiting.values())
      .sort((a, b) => a.joinedAt - b.joinedAt) // älteste zuerst (faire Reihenfolge)
      .map((w) => {
        const busy = waitingBusy(w);
        return {
          code: w.code, name: w.name, firstName: w.firstName, lastName: w.lastName,
          bigoId: w.bigoId, joinedAt: w.joinedAt,
          busy, claimedBy: busy ? w.claimedBy : null,
        };
      });
    sendJson(res, 200, { waiting: list }); return true;
  }
  // Bewerber reservieren ("Abholen"), bevor die Kamera startet. Atomar: zwei
  // Moderatoren können denselben Bewerber nicht gleichzeitig bekommen.
  if (urlPath === '/api/waiting/claim' && req.method === 'POST') {
    let body; try { body = await readBody(req, 16 * 1024); } catch { body = {}; }
    const code = String(body.code || '').trim().toUpperCase();
    const entry = waiting.get(code);
    if (!entry) { sendJson(res, 404, { reason: 'gone' }); return true; }
    if (waitingBusy(entry)) { sendJson(res, 409, { reason: 'busy', by: entry.claimedBy || '' }); return true; }
    entry.claimedBy = reqName(req) || 'Moderator';
    entry.claimedAt = Date.now();
    sendJson(res, 200, { ok: true }); return true;
  }
  // Reservierung wieder freigeben (z. B. wenn die Kamera nicht freigegeben wurde).
  if (urlPath === '/api/waiting/release' && req.method === 'POST') {
    let body; try { body = await readBody(req, 16 * 1024); } catch { body = {}; }
    const code = String(body.code || '').trim().toUpperCase();
    const entry = waiting.get(code);
    const room = rooms.get(code);
    // Nur lösen, wenn ich selbst reserviert hatte und noch kein Gespräch läuft.
    if (entry && !(room && room.host) && entry.claimedBy === (reqName(req) || 'Moderator')) {
      entry.claimedBy = null; entry.claimedAt = 0;
    }
    sendJson(res, 200, { ok: true }); return true;
  }

  // ---- Account speichern / auflisten / ansehen / löschen ----
  if (urlPath === '/api/account' && req.method === 'POST') {
    let body; try { body = await readBody(req); } catch { sendJson(res, 413, { reason: 'too-large' }); return true; }
    if (!body.code || !store.isCodeUsable(body.code)) { sendJson(res, 400, { reason: 'bad-code' }); return true; }
    const rec = store.saveAccount({ ...body, moderatorName: reqName(req) || body.moderatorName });
    security.recordEvent('audit', ip, 'Account gespeichert: ' + (rec.verifiedName || rec.applicantName || rec.id));
    sendJson(res, 200, { id: rec.id });
    return true;
  }
  // Personalakte ansehen/löschen = NUR Admin (Moderatoren speichern nur).
  if (urlPath === '/api/accounts' && req.method === 'GET') {
    if (!isAdminReq(req)) { sendJson(res, 403, { reason: 'admin-only' }); return true; }
    const list = store.listAccounts().map((a) => ({ ...a, photos: a.photos.map((p) => ({ label: p.label, file: p.file })) }));
    sendJson(res, 200, { accounts: list }); return true;
  }
  if (urlPath === '/api/account' && req.method === 'GET') {
    if (!isAdminReq(req)) { sendJson(res, 403, { reason: 'admin-only' }); return true; }
    const id = new URL(req.url, 'http://x').searchParams.get('id');
    const acc = store.getAccount(id);
    if (!acc) { sendJson(res, 404, { reason: 'not-found' }); return true; }
    sendJson(res, 200, { account: { ...acc, photos: acc.photos.map((p) => ({ label: p.label, file: p.file })) } });
    return true;
  }
  if (urlPath === '/api/photo' && req.method === 'GET') {
    if (!isAdminReq(req)) { res.writeHead(403); res.end('Forbidden'); return true; }
    const q = new URL(req.url, 'http://x').searchParams;
    const acc = store.getAccount(q.get('id'));
    const photoRec = acc && acc.photos.find((p) => p.file === q.get('file'));
    const data = photoRec && store.readPhoto(acc.id, photoRec);
    if (!data) { res.writeHead(404); res.end('not found'); return true; }
    res.writeHead(200, { 'Content-Type': data.mime, 'Cache-Control': 'no-store' });
    res.end(data.buffer);
    return true;
  }
  if (urlPath === '/api/account-delete' && req.method === 'POST') {
    if (!isAdminReq(req)) { sendJson(res, 403, { reason: 'admin-only' }); return true; }
    let body; try { body = await readBody(req, 16 * 1024); } catch { body = {}; }
    const ok = store.deleteAccount(body.id);
    if (ok) security.recordEvent('audit', ip, 'Account gelöscht: ' + body.id);
    sendJson(res, 200, { ok }); return true;
  }

  // ---- Aufnahmen (verschlüsselte Verifizierungs-Videos) ----
  // Hochladen darf jeder eingeloggte Moderator (rohes Video im Body).
  if (urlPath === '/api/recording' && req.method === 'POST') {
    let buf; try { buf = await readRawBody(req); } catch { sendJson(res, 413, { reason: 'too-large' }); return true; }
    if (!buf.length) { sendJson(res, 400, { reason: 'empty' }); return true; }
    const q = new URL(req.url, 'http://x').searchParams;
    const rec = store.saveRecording({
      buffer: buf,
      mime: (req.headers['content-type'] || 'video/webm').split(';')[0].trim(),
      ext: q.get('ext') || 'webm',
      durationSec: q.get('dur'),
      applicantName: q.get('applicant') || '',
      roomCode: q.get('room') || '',
      moderatorName: reqName(req),
    });
    if (!rec) { sendJson(res, 400, { reason: 'bad-recording' }); return true; }
    security.recordEvent('audit', ip, 'Aufnahme gespeichert: ' + (rec.applicantName || rec.id));
    sendJson(res, 200, { id: rec.id }); return true;
  }
  // Auflisten/Ansehen/Löschen = NUR Admin.
  if (urlPath === '/api/recordings' && req.method === 'GET') {
    if (!isAdminReq(req)) { sendJson(res, 403, { reason: 'admin-only' }); return true; }
    sendJson(res, 200, { recordings: store.listRecordings() }); return true;
  }
  if (urlPath === '/api/recording' && req.method === 'GET') {
    if (!isAdminReq(req)) { res.writeHead(403); res.end('Forbidden'); return true; }
    const q = new URL(req.url, 'http://x').searchParams;
    const data = store.readRecording(q.get('id'));
    if (!data) { res.writeHead(404); res.end('not found'); return true; }
    const total = data.buffer.length;
    const range = req.headers['range'];
    // Range-Anfragen (Vor-/Zurückspulen im <video>) bedienen.
    const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m) {
      let start = m[1] === '' ? 0 : parseInt(m[1], 10);
      let end = m[2] === '' ? total - 1 : parseInt(m[2], 10);
      if (isNaN(start) || isNaN(end) || start > end || start >= total) {
        res.writeHead(416, { 'Content-Range': `bytes */${total}` }); res.end(); return true;
      }
      end = Math.min(end, total - 1);
      res.writeHead(206, {
        'Content-Type': data.mime,
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Cache-Control': 'no-store',
      });
      res.end(req.method === 'HEAD' ? undefined : data.buffer.subarray(start, end + 1));
      return true;
    }
    res.writeHead(200, {
      'Content-Type': data.mime,
      'Content-Length': total,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    });
    res.end(data.buffer);
    return true;
  }
  if (urlPath === '/api/recording-delete' && req.method === 'POST') {
    if (!isAdminReq(req)) { sendJson(res, 403, { reason: 'admin-only' }); return true; }
    let body; try { body = await readBody(req, 16 * 1024); } catch { body = {}; }
    const ok = store.deleteRecording(body.id);
    if (ok) security.recordEvent('audit', ip, 'Aufnahme gelöscht: ' + body.id);
    sendJson(res, 200, { ok }); return true;
  }

  // ---- Überwachung (gesperrte IPs + Ereignisse) ----
  if (urlPath === '/api/security' && req.method === 'GET') {
    sendJson(res, 200, security.getMonitoring()); return true;
  }
  if (urlPath === '/api/security-unblock' && req.method === 'POST') {
    let body; try { body = await readBody(req, 16 * 1024); } catch { body = {}; }
    security.unblock(String(body.ip || '')); sendJson(res, 200, { ok: true }); return true;
  }
  if (urlPath === '/api/security-block' && req.method === 'POST') {
    let body; try { body = await readBody(req, 16 * 1024); } catch { body = {}; }
    security.blockManual(String(body.ip || '')); sendJson(res, 200, { ok: true }); return true;
  }

  sendJson(res, 404, { reason: 'unknown-endpoint' });
  return true;
}

// ---------------------------------------------------------------------------
// 1) Statischer Datei-Server
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

const server = http.createServer(async (req, res) => {
  // Nur den Pfad-Teil verwenden, Query-Parameter ignorieren.
  // decodeURIComponent kann bei kaputter %-Kodierung werfen -> abfangen.
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Ungültige Anfrage');
    return;
  }

  const ip = security.clientIp(req);
  setSecurityHeaders(res);

  // Gesperrte IPs (Brute-Force / Honeypot) sofort abweisen.
  if (security.isBlocked(ip)) { res.writeHead(403); res.end('Forbidden'); return; }

  // Honeypot: bekannte Angriffs-/Scanner-Pfade -> IP sperren.
  if (security.isHoneypot(urlPath)) {
    security.recordHoneypot(ip, urlPath);
    res.writeHead(404); res.end('Not found');
    return;
  }

  // Allgemeines Rate-Limit – nur für NICHT angemeldete Anfragen (Login/öffentlich).
  // Eingeloggte Moderatoren/Admins werden nicht gedrosselt (z. B. viele Foto-
  // Thumbnails in der Account-Liste). Brute-Force-Schutz + Honeypot bleiben aktiv.
  if (urlPath !== '/healthz' && !isAuthed(req) && !security.rateLimit(ip)) {
    res.writeHead(429, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Zu viele Anfragen');
    return;
  }

  // Health-Check (für Coolify/Reverse-Proxy).
  if (urlPath === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  // API-Anfragen.
  if (urlPath.startsWith('/api/')) {
    try { await handleApi(req, res, urlPath, ip); }
    catch { if (!res.headersSent) sendJson(res, 500, { reason: 'server-error' }); }
    return;
  }

  // ICE-/TURN-Konfiguration für den Client.
  if (urlPath === '/ice') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify({ iceServers: buildIceServers() }));
    return;
  }

  // Moderatoren-Panel: eigene Seite. Über die Subdomain mcp.* wird es direkt
  // als Startseite ausgeliefert; sonst per /panel erreichbar.
  const host = String(req.headers.host || '').toLowerCase();
  if (urlPath === '/panel' || (urlPath === '/' && host.startsWith('mcp.'))) {
    urlPath = '/panel.html';
  }
  if (urlPath === '/') urlPath = '/index.html';

  // Pfad sicher auflösen (kein Ausbruch aus /public).
  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Nicht gefunden');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------------------------------------------------------------------------
// 2) WebSocket-Signalisierung
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ server });

/** rooms: Map<roomCode, { host?: ws, guest?: ws }> */
const rooms = new Map();
/**
 * waiting: Map<roomCode, { code, name, firstName, lastName, bigoId, joinedAt,
 *                          claimedBy, claimedAt }>
 * Bewerber, die mit ihrem Einmalcode beigetreten sind und darauf warten, von
 * einem Moderator "abgeholt" zu werden. Rein flüchtig (nur solange verbunden).
 */
const waiting = new Map();
// Eine Reservierung ("Claim") gilt so lange, bis der Moderator wirklich im Raum
// ist. Falls er es sich anders überlegt / die Kamera nicht freigibt, verfällt
// die Reservierung nach dieser Zeit, damit ihn jemand anderes abholen kann.
const CLAIM_TTL = 30000;
// Ist ein wartender Bewerber gerade vergeben? (Aktiver Moderator im Raum ODER
// eine noch gültige Reservierung.)
function waitingBusy(entry) {
  const room = rooms.get(entry.code);
  if (room && room.host) return true;
  return !!(entry.claimedBy && (Date.now() - entry.claimedAt) < CLAIM_TTL);
}

function send(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function otherPeer(room, ws) {
  if (!room) return null;
  return room.host === ws ? room.guest : room.host;
}

wss.on('connection', (ws, req) => {
  ws.roomCode = null;
  ws.role = null;
  ws.ip = security.clientIp(req);

  // Gesperrte IPs (Brute-Force/Honeypot) gar nicht erst zulassen.
  if (security.isBlocked(ws.ip)) { try { ws.close(); } catch {} return; }

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'join') {
      const code = String(msg.room || '').trim().toUpperCase();
      if (!code) {
        send(ws, { type: 'error', reason: 'no-room' });
        return;
      }
      let room = rooms.get(code);
      if (!room) {
        room = {};
        rooms.set(code, room);
      }

      // Rolle bestimmen: Erster im Raum ist host, zweiter ist guest.
      let role = msg.role === 'host' ? 'host' : 'guest';

      // Moderator: gültiges Login-Token nötig (kommt aus /api/login).
      if (role === 'host') {
        if (!security.validToken(msg.token, ws.ip)) {
          security.recordFail(ws.ip, 'WS: ungültiges Moderator-Token');
          send(ws, { type: 'error', reason: 'auth' });
          return;
        }
      }
      // Bewerber: nur mit gültigem, unbenutztem Einmalcode.
      if (role === 'guest') {
        if (!store.isCodeUsable(code)) {
          security.recordFail(ws.ip, 'WS: ungültiger Einmalcode (' + code + ')');
          send(ws, { type: 'error', reason: 'bad-code' });
          return;
        }
      }

      if (role === 'host' && room.host && room.host !== ws) {
        // Es gibt schon einen Moderator -> als Gast behandeln.
        role = 'guest';
      }
      if (role === 'guest' && room.guest && room.guest !== ws) {
        send(ws, { type: 'error', reason: 'room-full' });
        return;
      }

      ws.roomCode = code;
      ws.role = role;
      room[role] = ws;
      ws.peerName = String(msg.name || '').slice(0, 60);

      // Bewerber tritt in die Warteliste ein (Moderatoren sehen ihn dort und
      // können ihn "abholen"). Selbstauskunft kommt direkt mit dem Beitritt.
      if (role === 'guest') {
        const info = msg.info || {};
        waiting.set(code, {
          code,
          name: ws.peerName,
          firstName: String(info.firstName || '').slice(0, 60),
          lastName: String(info.lastName || '').slice(0, 60),
          bigoId: String(info.bigoId || '').slice(0, 60),
          joinedAt: Date.now(),
          claimedBy: null,   // welcher Moderator hat reserviert/holt ab
          claimedAt: 0,      // Zeitpunkt der Reservierung (für Ablauf)
        });
      }

      send(ws, { type: 'joined', role, room: code });

      // Wenn beide da sind: dem Moderator Bescheid geben, dass er die
      // Verbindung aufbauen (das WebRTC-Angebot erstellen) soll.
      if (room.host && room.guest) {
        const w = waiting.get(code);
        if (w) { w.claimedBy = room.host.peerName || w.claimedBy; w.claimedAt = Date.now(); }
        send(room.host, { type: 'peer-ready', peerName: room.guest.peerName });
        send(room.guest, { type: 'peer-ready', peerName: room.host.peerName });
      }
      return;
    }

    // Aushandlungs-Nachrichten (Angebot/Antwort/ICE) + Chat-Fallback:
    // einfach an den anderen Teilnehmer im Raum weiterleiten.
    if (msg.type === 'signal') {
      const room = rooms.get(ws.roomCode);
      const peer = otherPeer(room, ws);
      send(peer, { type: 'signal', data: msg.data });
      return;
    }
  });

  ws.on('close', () => {
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    const peer = otherPeer(room, ws);
    send(peer, { type: 'peer-left' });
    if (room.host === ws) {
      room.host = undefined;
      const w = waiting.get(ws.roomCode);
      if (w && room.guest) {
        // Schon freigegeben (Einmalcode verbraucht)? Dann ist der Bewerber fertig
        // und gehört nicht zurück in die Warteliste. Sonst Reservierung lösen,
        // damit ihn wieder jemand abholen kann.
        if (!store.isCodeUsable(ws.roomCode)) waiting.delete(ws.roomCode);
        else { w.claimedBy = null; w.claimedAt = 0; }
      }
    }
    if (room.guest === ws) {
      room.guest = undefined;
      waiting.delete(ws.roomCode); // Bewerber weg -> aus der Warteliste raus
    }
    if (!room.host && !room.guest) rooms.delete(ws.roomCode);
  });
});

server.listen(PORT, () => {
  console.log(`Verifizierungs-Raum läuft auf Port ${PORT}`);
  console.log(`TURN: ${TURN_SECRET && TURN_HOST ? 'aktiv (' + TURN_HOST + ')' : 'nicht konfiguriert – nur STUN'}`);
  console.log(`Admin-Passwort: ${ADMIN_PASSWORD ? 'gesetzt' : 'NICHT gesetzt – Verwaltung gesperrt!'}`);
  console.log(`Moderator-Konten: ${store.listModerators().length}`);
  console.log(`Admin-2FA: ${MODERATOR_TOTP_SECRET ? 'aktiv' : 'AUS – empfohlen: MODERATOR_TOTP_SECRET setzen!'}`);
  console.log(`Login-IP-Sperre: ${security.loginIpRestricted() ? 'aktiv' : 'aus'}`);
  console.log(`Daten-Verzeichnis: ${storeInfo.DATA_DIR} (Daten ${storeInfo.encrypted ? 'verschlüsselt' : 'UNverschlüsselt'})`);
  if (!storeInfo.encrypted) {
    console.warn('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.warn('!! WARNUNG: STORAGE_KEY ist NICHT gesetzt.                 !!');
    console.warn('!! Ausweis-Daten/Fotos werden UNVERSCHLÜSSELT gespeichert! !!');
    console.warn('!! Für den Echtbetrieb unbedingt STORAGE_KEY setzen.       !!');
    console.warn('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  }
});
