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
const sec = require('./security.js');
const store = require('./store.js');

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const STORAGE_KEY = process.env.STORAGE_KEY || '';
const ADMIN_TOTP = process.env.ADMIN_TOTP_SECRET || process.env.MODERATOR_TOTP_SECRET || '';
const TURN_HOST = process.env.TURN_HOST || '';
const TURN_SECRET = process.env.TURN_SECRET || '';
const TURN_TTL = parseInt(process.env.TURN_TTL || '3600', 10);

sec.init({ storageKey: STORAGE_KEY, adminTotp: ADMIN_TOTP, loginAllowIps: process.env.LOGIN_ALLOW_IPS });
const storeInfo = store.init({ dir: DATA_DIR });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8',
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
    if (sec.safeEqual(body.password || '', ADMIN_PASSWORD) && sec.verifyAdminTotp(body.totp)) {
      sec.resetFails(ip); sec.recordEvent('login-ok', ip, 'Admin');
      sendJson(res, 200, { token: sec.issueToken(ip, { name: 'Admin', role: 'admin' }), name: 'Admin', role: 'admin' });
    } else {
      sec.recordFail(ip, 'Admin-Login fehlgeschlagen');
      sendJson(res, 401, { reason: 'bad-login' });
    }
    return true;
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
    const rec = store.addAgent({ username: body.username, password: body.password, role: body.role, createdBy: reqName(req, ip) });
    if (!rec) { sendJson(res, 400, { reason: 'exists-or-invalid' }); return true; }
    sec.recordEvent('audit', ip, 'Mitarbeiter angelegt: ' + rec.username);
    sendJson(res, 200, { id: rec.id, username: rec.username, totpSecret: rec.totpSecret }); return true;
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
  if (urlPath === '/api/case-delete' && req.method === 'POST') {
    if (!adminOnly()) return true; let body; try { body = await readJson(req, 16 * 1024); } catch { body = {}; }
    const ok = store.deleteCase(body.id); if (ok) sec.recordEvent('audit', ip, 'Fall gelöscht: ' + body.id);
    sendJson(res, 200, { ok }); return true;
  }

  if (urlPath === '/api/recordings' && req.method === 'GET') { if (!adminOnly()) return true; sendJson(res, 200, { recordings: store.listRecordings() }); return true; }
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
  if (urlPath === '/panel' || urlPath === '/admin') urlPath = '/admin.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Nicht gefunden'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---- WebSocket-Signalisierung (WebRTC) -------------------------------------
const wss = new WebSocketServer({ server });
/** rooms: Map<code, {host?:ws, guest?:ws}>  */
const rooms = new Map();
/** waiting: Map<code, {code, note, joinedAt, claimedBy, claimedAt}> */
const waiting = new Map();
const CLAIM_TTL = 30000;
function waitingBusy(entry) {
  const room = rooms.get(entry.code);
  if (room && room.host) return true;
  return !!(entry.claimedBy && (Date.now() - entry.claimedAt) < CLAIM_TTL);
}
function send(ws, obj) { if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj)); }
function otherPeer(room, ws) { if (!room) return null; return room.host === ws ? room.guest : room.host; }

wss.on('connection', (ws, req) => {
  ws.ip = sec.clientIp(req);
  if (sec.isBlocked(ws.ip)) { try { ws.close(); } catch {} return; }

  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'join') {
      const code = String(msg.room || '').trim().toUpperCase();
      if (!code) { send(ws, { type: 'error', reason: 'no-room' }); return; }
      let role = msg.role === 'host' ? 'host' : 'guest';

      if (role === 'host') {
        if (!sec.validToken(msg.token, ws.ip)) { sec.recordFail(ws.ip, 'WS: ungültiges Prüfer-Token'); send(ws, { type: 'error', reason: 'auth' }); return; }
      } else {
        if (!store.isCodeUsable(code)) { sec.recordFail(ws.ip, 'WS: ungültiger Zugangscode (' + code + ')'); send(ws, { type: 'error', reason: 'bad-code' }); return; }
      }

      let room = rooms.get(code); if (!room) { room = {}; rooms.set(code, room); }
      if (role === 'host' && room.host && room.host !== ws) role = 'guest';
      if (role === 'guest' && room.guest && room.guest !== ws) { send(ws, { type: 'error', reason: 'room-full' }); return; }

      ws.roomCode = code; ws.role = role; room[role] = ws;

      if (role === 'guest') {
        const note = store.getCode(code); // Notiz aus dem Code (falls hinterlegt)
        waiting.set(code, { code, note: note ? note.note : '', joinedAt: Date.now(), claimedBy: null, claimedAt: 0 });
      }
      send(ws, { type: 'joined', role, room: code });

      if (room.host && room.guest) {
        const w = waiting.get(code); if (w) { w.claimedAt = Date.now(); }
        send(room.host, { type: 'peer-ready' });
        send(room.guest, { type: 'peer-ready' });
      }
      return;
    }

    if (msg.type === 'signal') { send(otherPeer(rooms.get(ws.roomCode), ws), { type: 'signal', data: msg.data }); return; }
    if (msg.type === 'app') { send(otherPeer(rooms.get(ws.roomCode), ws), { type: 'app', data: msg.data }); return; }
  });

  ws.on('close', () => {
    const room = rooms.get(ws.roomCode); if (!room) return;
    send(otherPeer(room, ws), { type: 'peer-left' });
    if (room.host === ws) {
      room.host = undefined;
      const w = waiting.get(ws.roomCode);
      if (w && room.guest) { if (!store.isCodeUsable(ws.roomCode)) waiting.delete(ws.roomCode); else { w.claimedBy = null; w.claimedAt = 0; } }
    }
    if (room.guest === ws) { room.guest = undefined; waiting.delete(ws.roomCode); }
    if (!room.host && !room.guest) rooms.delete(ws.roomCode);
  });
});

server.listen(PORT, () => {
  console.log(`ident läuft auf Port ${PORT}`);
  console.log(`Daten: ${storeInfo.DATA_DIR} (${sec.hasKey() ? 'verschlüsselt' : 'UNVERSCHLÜSSELT'})`);
  console.log(`Admin-Passwort: ${ADMIN_PASSWORD ? 'gesetzt' : 'NICHT gesetzt – Verwaltung gesperrt'}`);
  console.log(`Admin-2FA: ${sec.adminTotpActive() ? 'aktiv' : 'AUS (empfohlen: ADMIN_TOTP_SECRET setzen)'}`);
  console.log(`Mitarbeiter-Konten: ${store.agentCount()}`);
  console.log(`TURN: ${TURN_SECRET && TURN_HOST ? 'aktiv (' + TURN_HOST + ')' : 'nur STUN'}`);
  console.log(`Login-IP-Sperre: ${sec.loginIpRestricted() ? 'aktiv' : 'aus'}`);
  if (!sec.hasKey()) console.warn('!! WARNUNG: STORAGE_KEY fehlt – Daten werden UNVERSCHLÜSSELT gespeichert!');
});
