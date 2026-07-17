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
const TURN_HOST = process.env.TURN_HOST || '';
const TURN_SECRET = process.env.TURN_SECRET || '';
const TURN_TTL = parseInt(process.env.TURN_TTL || '3600', 10);
const RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS || '0', 10); // 0 = aus

// ---- Passkeys (Face ID / Fingerabdruck, WebAuthn) --------------------------
// rpID = registrierbare Domain, damit Passkeys auf ident. UND pruefer. gelten.
const RP_ID = process.env.RP_ID || '4ever1.tv';
const RP_NAME = process.env.RP_NAME || '4EVER1';
const RP_ORIGINS = (process.env.RP_ORIGINS || 'https://ident.4ever1.tv,https://pruefer.4ever1.tv')
  .split(',').map((s) => s.trim()).filter(Boolean);
const waChallenges = new Map(); // schlüssel -> { challenge, exp }
function waSetChallenge(key, challenge) { waChallenges.set(key, { challenge, exp: Date.now() + 5 * 60 * 1000 }); }
function waTakeChallenge(key) { const c = waChallenges.get(key); waChallenges.delete(key); return c && Date.now() <= c.exp ? c.challenge : null; }
const b64urlToBuf = (s) => Buffer.from(String(s || ''), 'base64url');
const bufToB64url = (u) => Buffer.from(u).toString('base64url');

sec.init({ storageKey: STORAGE_KEY, adminTotp: ADMIN_TOTP, loginAllowIps: process.env.LOGIN_ALLOW_IPS });
const storeInfo = store.init({ dir: DATA_DIR });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

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

  // ---- Login (Admin ODER Mitarbeiter) ----
  if (urlPath === '/api/login' && req.method === 'POST') {
    if (!sec.loginAllowed(ip)) { sec.recordEvent('blocked', ip, 'Login von nicht erlaubter IP'); sendJson(res, 403, { reason: 'ip-blocked' }); return true; }
    let body; try { body = await readJson(req, 64 * 1024); } catch { sendJson(res, 400, { reason: 'bad-request' }); return true; }
    const username = String(body.username || '').trim();

    if (username) { // Mitarbeiter-Login
      const existing = store.getAgentByUsername(username);
      if (existing && existing.locked) { sec.recordEvent('auth-fail', ip, 'Gesperrtes Konto: ' + username); sendJson(res, 403, { reason: 'account-locked' }); return true; }
      const a = store.verifyAgent(username, body.password || '');
      const okTotp = a ? sec.verifyTotp(a.totpSecret, body.totp) : false;
      if (a && okTotp) {
        sec.resetFails(ip); sec.resetAccountFails(username);
        sec.recordEvent('login-ok', ip, 'Mitarbeiter: ' + a.username);
        sendJson(res, 200, { token: sec.issueToken(ip, { name: a.username, role: a.role }), name: a.username, role: a.role, mustChange: !!a.mustChange });
      } else {
        sec.recordFail(ip, 'Mitarbeiter-Login fehlgeschlagen (' + username + ')');
        if (existing && sec.recordAccountFail(username)) { store.lockAgent(username); sec.recordEvent('blocked', ip, 'Konto gesperrt: ' + username); }
        sendJson(res, 401, { reason: a ? 'bad-totp' : 'bad-login' });
      }
      return true;
    }
    // Admin-Login (leerer Benutzername + Admin-Passwort + Admin-2FA)
    if (!ADMIN_PASSWORD) { sendJson(res, 503, { reason: 'admin-not-configured' }); return true; }
    if (sec.safeEqual(body.password || '', ADMIN_PASSWORD) && sec.verifyTotp(adminTotpSecret(), body.totp)) {
      sec.resetFails(ip); sec.recordEvent('login-ok', ip, 'Admin');
      sendJson(res, 200, { token: sec.issueToken(ip, { name: 'Admin', role: 'admin' }), name: 'Admin', role: 'admin' });
    } else {
      sec.recordFail(ip, 'Admin-Login fehlgeschlagen');
      sendJson(res, 401, { reason: 'bad-login' });
    }
    return true;
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
    if (!agent || agent.locked || !expectedChallenge || !pk) { sec.recordFail(ip, 'Passkey-Login fehlgeschlagen'); sendJson(res, 401, { reason: 'bad-login' }); return true; }
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: body.response, expectedChallenge, expectedOrigin: RP_ORIGINS, expectedRPID: RP_ID,
        authenticator: { credentialID: b64urlToBuf(pk.id), credentialPublicKey: b64urlToBuf(pk.publicKey), counter: pk.counter || 0 },
        requireUserVerification: false,
      });
    } catch (e) { verification = { verified: false }; }
    if (!verification.verified) { sec.recordFail(ip, 'Passkey-Login fehlgeschlagen (' + agent.username + ')'); sendJson(res, 401, { reason: 'bad-login' }); return true; }
    store.setPasskeyCounter(agent.id, pk.id, verification.authenticationInfo.newCounter);
    sec.resetFails(ip); sec.resetAccountFails(agent.username); sec.recordEvent('login-ok', ip, 'Passkey: ' + agent.username);
    sendJson(res, 200, { token: sec.issueToken(ip, { name: agent.username, role: agent.role }), name: agent.username, role: agent.role, mustChange: !!agent.mustChange });
    return true;
  }

  // ---- Audition-Text (Teleprompter) – Abruf öffentlich (Bewerber liest ihn) ----
  if (urlPath === '/api/script' && req.method === 'GET') { sendJson(res, 200, { script: store.getScript() }); return true; }
  if (urlPath === '/api/intro' && req.method === 'GET') { sendJson(res, 200, { intro: store.getIntro() }); return true; }

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
      return { code: w.code, note: w.note, joinedAt: w.joinedAt, busy, claimedBy: busy ? w.claimedBy : null };
    });
    sendJson(res, 200, { waiting: list }); return true;
  }
  if (urlPath === '/api/waiting/claim' && req.method === 'POST') {
    let body; try { body = await readJson(req, 16 * 1024); } catch { body = {}; }
    const code = String(body.code || '').trim().toUpperCase();
    const entry = waiting.get(code);
    if (!entry) { sendJson(res, 404, { reason: 'gone' }); return true; }
    if (waitingBusy(entry)) { sendJson(res, 409, { reason: 'busy', by: entry.claimedBy || '' }); return true; }
    entry.claimedBy = reqName(req, ip) || 'Prüfer'; entry.claimedAt = Date.now();
    sendJson(res, 200, { ok: true }); return true;
  }
  if (urlPath === '/api/waiting/release' && req.method === 'POST') {
    let body; try { body = await readJson(req, 16 * 1024); } catch { body = {}; }
    const code = String(body.code || '').trim().toUpperCase();
    const entry = waiting.get(code); const room = rooms.get(code);
    if (entry && !(room && room.host) && entry.claimedBy === (reqName(req, ip) || 'Prüfer')) { entry.claimedBy = null; entry.claimedAt = 0; }
    sendJson(res, 200, { ok: true }); return true;
  }

  // ---- Fall speichern (Prüfer) ----
  if (urlPath === '/api/case' && req.method === 'POST') {
    let body; try { body = await readJson(req); } catch { sendJson(res, 413, { reason: 'too-large' }); return true; }
    if (!body.code || !store.isCodeUsable(body.code)) { sendJson(res, 400, { reason: 'bad-code' }); return true; }
    const rec = store.saveCase({ ...body, agentName: reqName(req, ip) || body.agentName });
    sec.recordEvent('audit', ip, 'Fall ' + rec.result + ': ' + (rec.verifiedName || rec.id));
    sendJson(res, 200, { id: rec.id }); return true;
  }

  // ---- Aufnahme hochladen (Prüfer, roher Video-Body) ----
  if (urlPath === '/api/recording' && req.method === 'POST') {
    let buf; try { buf = await readRaw(req); } catch { sendJson(res, 413, { reason: 'too-large' }); return true; }
    if (!buf.length) { sendJson(res, 400, { reason: 'empty' }); return true; }
    const q = new URL(req.url, 'http://x').searchParams;
    const rec = store.saveRecording({ buffer: buf, mime: (req.headers['content-type'] || 'video/webm').split(';')[0].trim(), ext: q.get('ext') || 'webm', durationSec: q.get('dur'), code: q.get('code') || '', agentName: reqName(req, ip) });
    if (!rec) { sendJson(res, 400, { reason: 'bad-recording' }); return true; }
    sec.recordEvent('audit', ip, 'Aufnahme gespeichert: ' + rec.id);
    sendJson(res, 200, { id: rec.id }); return true;
  }

  // ---- ab hier: NUR Admin ----
  const adminOnly = () => { if (!isAdmin(req, ip)) { sendJson(res, 403, { reason: 'admin-only' }); return false; } return true; };

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
    if (!adminOnly()) return true; let body; try { body = await readJson(req, 16 * 1024); } catch { body = {}; }
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
    sendJson(res, 200, { cases: store.listCases().map((c) => ({ ...c, docs: c.docs.map((d) => ({ label: d.label, file: d.file })) })) }); return true;
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
      @media print{.print{display:none}}
    </style></head><body>
      <h1>4EVER1 · Audition</h1><p class="sub">BIGO Live · Bewerbungs-/Auditionsakte</p>
      <div class="print">Tipp: Mit <b>Strg/Cmd + P</b> → „Als PDF sichern" exportierst du diese Akte als PDF.</div>
      <p>Status: <span class="badge ${c.result === 'approved' ? 'ok' : (c.result === 'rejected' ? 'no' : 'open')}">${eh(status)}</span></p>
      <table>
        ${row('BIGO-Name', c.bigoName)}${row('Alter', c.age)}${row('Name laut Ausweis', c.verifiedName)}
        ${row('Ausweisart', c.docType)}${row('Ausweis-Nr.', c.docNumber)}${row('Zugangsnummer', c.code)}
        ${row('Prüfer', c.agentName)}${row('Datum', new Date(c.createdAt).toLocaleString('de-DE'))}
        ${row('Notiz', c.note)}${row('Ablehnungsgrund', c.rejectReason)}
      </table>
      ${checks ? `<h3>Prüf-Checkliste</h3><ul>${checks}</ul>` : ''}
      ${imgs ? `<h3>Bilder</h3><div class="imgs">${imgs}</div>` : ''}
    </body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(html); return true;
  }
  if (urlPath === '/api/case-delete' && req.method === 'POST') {
    if (!adminOnly()) return true; let body; try { body = await readJson(req, 16 * 1024); } catch { body = {}; }
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
    if (!isAdmin(req, ip)) { res.writeHead(403); res.end('Forbidden'); return true; }
    const data = store.readRecording(new URL(req.url, 'http://x').searchParams.get('id'));
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
    if (!adminOnly()) return true; let body; try { body = await readJson(req, 16 * 1024); } catch { body = {}; }
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

  // Statische Dateien
  if (urlPath === '/') urlPath = '/index.html';
  // Eigener Direkt-Link für Prüfer -> Startseite öffnet gleich den Mitarbeiter-Login
  if (['/pruefer', '/login', '/team', '/mitarbeiter'].includes(urlPath)) urlPath = '/index.html';
  if (urlPath === '/panel' || urlPath === '/admin') urlPath = '/admin.html';
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
        waiting.set(code, { code, note: note ? note.note : '', joinedAt: Date.now(), claimedBy: null, claimedAt: 0 });
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
  if (!sec.hasKey()) console.warn('!! WARNUNG: STORAGE_KEY fehlt – Daten werden UNVERSCHLÜSSELT gespeichert!');
});

// Auto-Löschung: beim Start und danach alle 6 Stunden.
function runRetention() {
  if (RETENTION_DAYS <= 0) return;
  try { const n = store.purgeOlderThan(RETENTION_DAYS); if (n) { sec.recordEvent('audit', 'system', n + ' Akte(n)/Aufnahme(n) automatisch gelöscht (>' + RETENTION_DAYS + ' Tage)'); console.log('Auto-Löschung: ' + n + ' Einträge entfernt.'); } } catch (e) { console.error('Auto-Löschung Fehler:', e.message); }
}
runRetention();
setInterval(runRetention, 6 * 60 * 60 * 1000);
