/**
 * security.js – Sicherheits-Kern von ident (Agentur 4ever1).
 *
 * Bündelt alle sicherheitskritischen Bausteine an EINER Stelle, auf bewährten
 * Standard-Konstruktionen (kein selbst erfundenes Krypto):
 *   - Verschlüsselung ruhender Daten: AES-256-GCM
 *   - Passwörter: scrypt (Salt + Hash), timing-sicherer Vergleich
 *   - 2FA: TOTP (RFC 6238, HMAC-SHA1)
 *   - Sitzungen: zufällige Tokens, an IP + Rolle gebunden, mit Ablauf
 *   - Missbrauchsschutz: Rate-Limit pro IP, Konto-Sperre nach Fehlversuchen,
 *     Honeypot, optionale IP-Allowlist fürs Login
 *   - HTTP-Sicherheits-Header (CSP, HSTS, …)
 */
'use strict';
const crypto = require('crypto');

let ENC_KEY = null;              // 32-Byte-Schlüssel (AES-256), aus STORAGE_KEY abgeleitet
let TOTP_SECRET_ADMIN = '';      // Admin-2FA (base32), optional
let LOGIN_ALLOW_IPS = [];        // optionale IP-Allowlist fürs Login

function init({ storageKey, adminTotp, loginAllowIps } = {}) {
  ENC_KEY = storageKey ? crypto.createHash('sha256').update(String(storageKey)).digest() : null;
  TOTP_SECRET_ADMIN = adminTotp || '';
  LOGIN_ALLOW_IPS = String(loginAllowIps || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return { encrypted: !!ENC_KEY };
}
function hasKey() { return !!ENC_KEY; }

// ---- Verschlüsselung ruhender Daten (AES-256-GCM) --------------------------
// Layout: iv(12) | tag(16) | ciphertext
function encrypt(buf) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const ct = Buffer.concat([cipher.update(buf), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}
function decrypt(buf) {
  const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), ct = buf.subarray(28);
  const d = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

// ---- Passwörter ------------------------------------------------------------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  const h = crypto.scryptSync(String(password), salt, 64);
  const stored = Buffer.from(hash, 'hex');
  return h.length === stored.length && crypto.timingSafeEqual(h, stored);
}
function safeEqual(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// ---- TOTP (2FA) ------------------------------------------------------------
function base32Decode(s) {
  const alph = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of String(s).toUpperCase().replace(/=+$/, '')) {
    const v = alph.indexOf(c);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function hotp(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secret).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[off] & 0x7f) << 24) | (hmac[off + 1] << 16) | (hmac[off + 2] << 8) | hmac[off + 3];
  return String(code % 1e6).padStart(6, '0');
}
// Prüft einen 6-stelligen Code (±1 Zeitfenster). Leeres Secret = 2FA aus.
function verifyTotp(secretBase32, token) {
  if (!secretBase32) return true;
  const t = String(token || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(t)) return false;
  const secret = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let w = -1; w <= 1; w++) if (hotp(secret, counter + w) === t) return true;
  return false;
}
function verifyAdminTotp(token) { return verifyTotp(TOTP_SECRET_ADMIN, token); }
function adminTotpActive() { return !!TOTP_SECRET_ADMIN; }
function generateTotpSecret() {
  const alph = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let s = '';
  for (let i = 0; i < 32; i++) s += alph[crypto.randomInt(alph.length)];
  return s;
}

// ---- Sitzungs-Tokens -------------------------------------------------------
// In-Memory (flüchtig). Token ist an IP + Rolle + Name gebunden und läuft ab.
const TOKEN_TTL = 8 * 60 * 60 * 1000; // 8 Stunden
const tokens = new Map(); // token -> { ip, role, name, exp }

function issueToken(ip, { name, role }) {
  const token = crypto.randomBytes(32).toString('base64url');
  tokens.set(token, { ip, name: String(name || ''), role, exp: Date.now() + TOKEN_TTL });
  return token;
}
function tokenInfo(token, ip) {
  const t = tokens.get(String(token || ''));
  if (!t) return null;
  if (t.exp < Date.now()) { tokens.delete(token); return null; }
  if (ip && t.ip !== ip) return null; // an die anmeldende IP gebunden
  return t;
}
function validToken(token, ip) { return !!tokenInfo(token, ip); }
function isAdmin(token, ip) { const t = tokenInfo(token, ip); return !!t && t.role === 'admin'; }
function revokeToken(token) { tokens.delete(String(token || '')); }

// ---- Missbrauchsschutz -----------------------------------------------------
const fails = new Map();        // ip -> { n, until }
const accountFails = new Map(); // username -> n
const blocked = new Map();      // ip -> { reason, at }
const events = [];              // Sicherheits-Ereignisse (Ringpuffer)
const rate = new Map();         // ip -> { n, reset }

const MAX_IP_FAILS = 8, IP_BLOCK_MS = 15 * 60 * 1000;
const MAX_ACCOUNT_FAILS = 5;
const RATE_MAX = 60, RATE_WINDOW = 60 * 1000; // 60 Anfragen / Minute (nur unangemeldet)

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}
function recordEvent(type, ip, detail) {
  events.push({ type, ip, detail: String(detail || '').slice(0, 200), at: new Date().toISOString() });
  if (events.length > 500) events.shift();
}
function recordFail(ip, detail) {
  const f = fails.get(ip) || { n: 0, until: 0 };
  f.n += 1;
  if (f.n >= MAX_IP_FAILS) { blocked.set(ip, { reason: 'brute-force', at: new Date().toISOString() }); f.n = 0; }
  fails.set(ip, f);
  recordEvent('auth-fail', ip, detail);
}
function recordAccountFail(username) {
  const n = (accountFails.get(username) || 0) + 1;
  accountFails.set(username, n);
  return n >= MAX_ACCOUNT_FAILS;
}
function resetFails(ip) { fails.delete(ip); }
function resetAccountFails(username) { accountFails.delete(username); }
function isBlocked(ip) { return blocked.has(ip); }
function block(ip, reason) { blocked.set(ip, { reason: reason || 'manual', at: new Date().toISOString() }); recordEvent('blocked', ip, reason); }
function unblock(ip) { blocked.delete(ip); fails.delete(ip); recordEvent('unblock', ip, ''); }
function rateLimit(ip) {
  const now = Date.now();
  const r = rate.get(ip) || { n: 0, reset: now + RATE_WINDOW };
  if (now > r.reset) { r.n = 0; r.reset = now + RATE_WINDOW; }
  r.n += 1; rate.set(ip, r);
  return r.n <= RATE_MAX;
}
function loginAllowed(ip) {
  if (!LOGIN_ALLOW_IPS.length) return true;
  return LOGIN_ALLOW_IPS.includes(ip);
}
function loginIpRestricted() { return LOGIN_ALLOW_IPS.length > 0; }
function getMonitoring() {
  return {
    blocked: Array.from(blocked.entries()).map(([ip, v]) => ({ ip, ...v })),
    events: events.slice(-120).reverse(),
  };
}

// ---- HTTP-Sicherheits-Header ----------------------------------------------
function setSecurityHeaders(res) {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
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

module.exports = {
  init, hasKey, encrypt, decrypt,
  hashPassword, verifyPassword, safeEqual,
  verifyTotp, verifyAdminTotp, adminTotpActive, generateTotpSecret,
  issueToken, tokenInfo, validToken, isAdmin, revokeToken,
  clientIp, recordEvent, recordFail, recordAccountFail, resetFails, resetAccountFails,
  isBlocked, block, unblock, rateLimit, loginAllowed, loginIpRestricted, getMonitoring,
  setSecurityHeaders,
};
