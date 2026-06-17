/*
 * Sicherheits-Modul (ohne externe Abhängigkeiten):
 *   - TOTP-2FA (RFC 6238, kompatibel mit Google/Microsoft Authenticator)
 *   - Login-Tokens (kurzlebig, im Speicher)
 *   - Brute-Force-Schutz (IP-Sperre nach zu vielen Fehlversuchen)
 *   - Honeypot / Angriffs-Erkennung (Zugriff auf Köder-Pfade -> IP-Block)
 */

const crypto = require('crypto');

// ---- Ereignis-Protokoll (für die Überwachungs-Ansicht) ---------------------
const MAX_EVENTS = 300;
let events = [];          // Ringpuffer der letzten Ereignisse (im Speicher)
let persistFn = null;     // optionale Funktion zum dauerhaften Speichern

function init({ persist, initial } = {}) {
  persistFn = persist || null;
  if (Array.isArray(initial)) events = initial.slice(-MAX_EVENTS);
}
function recordEvent(type, ip, detail) {
  const ev = { time: new Date().toISOString(), type, ip: ip || 'unknown', detail: detail || '' };
  events.push(ev);
  if (events.length > MAX_EVENTS) events.shift();
  if (persistFn) { try { persistFn(ev); } catch {} }
  return ev;
}

// ---- Client-IP (hinter Coolify/Traefik via X-Forwarded-For) ----------------
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

// ---- Timing-sicherer Vergleich (gegen Timing-Angriffe) ---------------------
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// ---- Login-Tokens (kurzlebig, an die Client-IP gebunden) -------------------
const tokens = new Map(); // token -> {exp, ip}
const TOKEN_TTL = 8 * 60 * 60 * 1000; // 8 Stunden

function issueToken(ip, info = {}) {
  const t = crypto.randomBytes(24).toString('hex');
  tokens.set(t, { exp: Date.now() + TOKEN_TTL, ip: ip || '', name: info.name || '', isAdmin: !!info.isAdmin });
  return t;
}
function validToken(t, ip) {
  const rec = tokens.get(t);
  if (!rec) return false;
  if (Date.now() > rec.exp) { tokens.delete(t); return false; }
  if (rec.ip && ip && rec.ip !== ip) return false; // an IP gebunden
  return true;
}
function tokenInfo(t) { return tokens.get(t) || null; }
function isAdminToken(t, ip) { return validToken(t, ip) && !!tokens.get(t).isAdmin; }

// ---- Allgemeines Rate-Limit pro IP -----------------------------------------
const reqCounts = new Map(); // ip -> {count, windowStart}
const RATE_MAX = 300;        // Anfragen
const RATE_WINDOW = 60 * 1000; // pro 60 Sekunden
function rateLimit(ip) {
  const now = Date.now();
  const rec = reqCounts.get(ip);
  if (!rec || now - rec.windowStart > RATE_WINDOW) {
    reqCounts.set(ip, { count: 1, windowStart: now });
    return true;
  }
  rec.count++;
  if (rec.count > RATE_MAX) {
    if (rec.count === RATE_MAX + 1) recordEvent('rate-limit', ip, 'zu viele Anfragen');
    return false;
  }
  return true;
}

// ---- TOTP (2FA) ------------------------------------------------------------
function base32Decode(str) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(str).toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = '';
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function hotp(secretBuf, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretBuf).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return (code % 1000000).toString().padStart(6, '0');
}

// Prüft einen 6-stelligen TOTP-Code gegen das base32-Secret (±1 Zeitfenster).
function verifyTotp(secretBase32, token) {
  if (!secretBase32) return true; // 2FA nicht konfiguriert -> übersprungen
  const t = String(token || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(t)) return false;
  const secret = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let w = -1; w <= 1; w++) {
    if (hotp(secret, counter + w) === t) return true;
  }
  return false;
}

// Erzeugt ein neues base32-Secret (für die Einrichtung in der Authenticator-App).
function generateTotpSecret() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let s = '';
  const bytes = crypto.randomBytes(20);
  for (const b of bytes) s += alphabet[b % 32];
  return s;
}

// ---- Brute-Force-Schutz + Honeypot ----------------------------------------
const fails = new Map();    // ip -> {count, first}
const blocked = new Map();  // ip -> unblockTime(ms)
const MAX_FAILS = 6;
const FAIL_WINDOW = 15 * 60 * 1000;
const BLOCK_MS = 30 * 60 * 1000;       // normale Sperre
const HONEYPOT_BLOCK_MS = 24 * 60 * 60 * 1000; // Honeypot-Treffer: lange Sperre

// Typische Scanner-/Angriffspfade. Wer das abruft, will nichts Gutes.
const HONEYPOTS = [
  '/wp-login.php', '/wp-admin', '/xmlrpc.php', '/.env', '/.git/config',
  '/phpmyadmin', '/admin.php', '/vendor/phpunit', '/config.php', '/shell',
  '/.aws/credentials', '/server-status',
];

function isBlocked(ip) {
  const until = blocked.get(ip);
  if (!until) return false;
  if (Date.now() > until) { blocked.delete(ip); return false; }
  return true;
}
function block(ip, ms) { blocked.set(ip, Date.now() + ms); }

function recordFail(ip, detail) {
  recordEvent('auth-fail', ip, detail || '');
  const now = Date.now();
  const rec = fails.get(ip);
  if (!rec || now - rec.first > FAIL_WINDOW) {
    fails.set(ip, { count: 1, first: now });
    return;
  }
  rec.count++;
  if (rec.count >= MAX_FAILS) {
    block(ip, BLOCK_MS);
    fails.delete(ip);
    recordEvent('blocked', ip, 'Zu viele Fehlversuche (Brute-Force)');
  }
}
function resetFails(ip) { fails.delete(ip); }

function isHoneypot(urlPath) {
  const p = urlPath.toLowerCase();
  return HONEYPOTS.some((h) => p === h || p.startsWith(h + '/') || p.startsWith(h));
}
function recordHoneypot(ip, urlPath) {
  block(ip, HONEYPOT_BLOCK_MS);
  recordEvent('honeypot', ip, urlPath || '');
  console.warn(`[security] Honeypot-Treffer von ${ip} (${urlPath || ''}) – IP gesperrt.`);
}

// Manuelles Sperren/Entsperren + Status für die Überwachung.
function unblock(ip) { blocked.delete(ip); fails.delete(ip); recordEvent('unblock', ip, 'manuell'); }
function blockManual(ip) { block(ip, BLOCK_MS); recordEvent('manual-block', ip, 'manuell gesperrt'); }
function getMonitoring() {
  const now = Date.now();
  const blockedList = [];
  for (const [ip, until] of blocked) {
    if (until > now) blockedList.push({ ip, until: new Date(until).toISOString(), minutesLeft: Math.ceil((until - now) / 60000) });
  }
  return { blocked: blockedList, events: events.slice().reverse() };
}

module.exports = {
  init, clientIp, issueToken, validToken, tokenInfo, isAdminToken, safeEqual, rateLimit,
  verifyTotp, generateTotpSecret,
  isBlocked, recordFail, resetFails, isHoneypot, recordHoneypot, recordEvent,
  unblock, blockManual, getMonitoring,
};
