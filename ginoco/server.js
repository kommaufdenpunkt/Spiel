// Fahrschulportal - HTTP-Server und API.
// Ohne externe Pakete: nur eingebaute Node-Module.
import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { randomBytes, createECDH, hkdfSync, createCipheriv, createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify, createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import {
  db, getSettings, getSettingRaw, setSettingRaw,
  hashPassword, verifyPassword,
} from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, 'public');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0'; // hinter Caddy: HOST=127.0.0.1 (nur Proxy erreicht Node)
const SESSION_DAYS = 30;
const APP_VERSION = "3.72.0";
// Einstellungen, die Schueler/Oeffentlichkeit sehen duerfen (Rest bleibt beim Fahrlehrer)
const PUBLIC_SETTINGS = ['instructor_name', 'instructor_phone', 'policy_text',
  'cancel_hours', 'lock_hours', 'reserve_expire_min', 'booking_horizon_days', 'booking_horizon_days_rank2',
  'live_lead_min', 'lesson_min', 'break_min', 'start_time', 'last_start', 'max_per_week', 'release_time',
  'registration_open', 'sonder_min_ueberland', 'sonder_min_autobahn', 'sonder_min_nacht',
  'req_ueberland', 'req_autobahn', 'req_nacht', 'rank2_min_lessons', 'passkey_enabled'];

// ---------- Passwort-Richtlinie (stark, mit Sonderzeichen) ----------
// Gibt null zurueck, wenn ok, sonst die fehlende Anforderung.
function passwordProblem(pw) {
  pw = String(pw || '');
  if (pw.length < 8) return 'mindestens 8 Zeichen';
  if (!/[A-Za-zÄÖÜäöüß]/.test(pw)) return 'mindestens einen Buchstaben';
  if (!/[0-9]/.test(pw)) return 'mindestens eine Zahl';
  if (!/[^A-Za-z0-9ÄÖÜäöüß]/.test(pw)) return 'mindestens ein Sonderzeichen (z. B. ! ? # @ % + *)';
  return null;
}

// ---------- Einfacher Login-Ratenbegrenzer (im Speicher, gegen Brute-Force) ----------
const loginAttempts = new Map(); // ip -> { count, until }
const LOGIN_MAX = 8;             // erlaubte Fehlversuche
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}
function loginBlocked(req) {
  const e = loginAttempts.get(clientIp(req));
  return e && e.until > Date.now() && e.count >= LOGIN_MAX;
}
function noteLoginFail(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const e = loginAttempts.get(ip);
  if (!e || e.until < now) loginAttempts.set(ip, { count: 1, until: now + LOGIN_WINDOW_MS });
  else { e.count++; e.until = now + LOGIN_WINDOW_MS; }
}
function noteLoginOk(req) { loginAttempts.delete(clientIp(req)); }
function isHttps(req) {
  return req.headers['x-forwarded-proto'] === 'https' || !!req.socket.encrypted || process.env.FSP_HTTPS === '1';
}

// ---------- kleine Helfer ----------
const json = (res, code, data) => {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
};
const ok = (res, data = {}) => json(res, 200, data);
const bad = (res, msg, code = 400) => json(res, code, { error: msg });

// Profilfoto als data-URL pruefen (klein halten – Client verkleinert vor dem Upload)
// Bewertungs-Kategorien (Reihenfolge = Anzeigereihenfolge). Muss mit dem
// Frontend (REVIEW_CATS in app.js) übereinstimmen.
const REVIEW_CATS = ['geduld', 'erklaerung', 'puenktlich', 'freundlich', 'sicher'];
function validPhoto(dataUrl) {
  return typeof dataUrl === 'string'
    && /^data:image\/(jpeg|png|webp);base64,/.test(dataUrl)
    && dataUrl.length <= 700000; // ~500 KB Bild
}
// Ein gespeichertes data-URL-Bild als echte Bilddatei ausliefern
function sendDataUrl(res, dataUrl) {
  const m = /^data:([\w/+.-]+);base64,(.+)$/s.exec(dataUrl || '');
  if (!m) { res.writeHead(404); return res.end(); }
  const buf = Buffer.from(m[2], 'base64');
  res.writeHead(200, { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=30' });
  res.end(buf);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
  });
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function newToken() { return randomBytes(24).toString('hex'); }

function createSession(res, kind, studentId = null, secure = false, remember = true) {
  const token = newToken();
  const expires = Date.now() + SESSION_DAYS * 864e5;
  db.prepare('INSERT INTO sessions(token,kind,student_id,expires) VALUES(?,?,?,?)')
    .run(token, kind, studentId, expires);
  // „Angemeldet bleiben": persistentes Cookie (Max-Age). Sonst Sitzungs-Cookie,
  // das der Browser beim Schließen verwirft (Serverseitig bleibt die Sitzung gültig).
  const maxAge = remember ? `; Max-Age=${SESSION_DAYS * 86400}` : '';
  res.setHeader('Set-Cookie',
    `fsp=${token}; HttpOnly; Path=/${maxAge}; SameSite=Lax${secure ? '; Secure' : ''}`);
  return token;
}
// ---- Authenticator (TOTP, RFC 6238) – zero-dependency ----
const B32_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) {
  let bits = 0, val = 0, out = '';
  for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32_ALPHA[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32_ALPHA[(val << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, val = 0; const out = [];
  for (const ch of clean) { const idx = B32_ALPHA.indexOf(ch); if (idx < 0) continue; val = (val << 5) | idx; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; } }
  return Buffer.from(out);
}
function hotp(secretBuf, counter) {
  const c = Buffer.alloc(8);
  c.writeUInt32BE(Math.floor(counter / 4294967296), 0);
  c.writeUInt32BE(counter >>> 0, 4);
  const h = createHmac('sha1', secretBuf).update(c).digest();
  const o = h[h.length - 1] & 0x0f;
  const n = ((h[o] & 0x7f) << 24) | ((h[o + 1] & 0xff) << 16) | ((h[o + 2] & 0xff) << 8) | (h[o + 3] & 0xff);
  return String(n % 1000000).padStart(6, '0');
}
function totpVerify(secretB32, code, t = Date.now(), window = 1) {
  const c = String(code || '').replace(/\s/g, '');
  if (!secretB32 || !/^\d{6}$/.test(c)) return false;
  const buf = base32Decode(secretB32); if (!buf.length) return false;
  const step = Math.floor(t / 1000 / 30);
  for (let w = -window; w <= window; w++) if (hotp(buf, step + w) === c) return true;
  return false;
}
function newTotpSecret() { return base32Encode(randomBytes(20)); } // 160-bit
function otpauthURL(secretB32, label, issuer) {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}`
    + `?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// ===================== Passkeys / WebAuthn (Face ID / Touch ID) =====================
// Zero-Dependency nach WebAuthn Level 2 – nur fuer den Fahrlehrer (mcp.ginoco.de).
// Attestation wird als "none" behandelt (kein Zertifikatscheck); die Sicherheit kommt
// aus der Signaturpruefung beim Login. Public Keys sind nicht geheim.
const waChallenges = new Map(); // challenge(b64url) -> Ablauf (ms)
function waIssueChallenge() {
  const ch = b64url(randomBytes(32));
  waChallenges.set(ch, Date.now() + 300000); // 5 Min gueltig
  if (waChallenges.size > 300) for (const [k, exp] of waChallenges) if (exp < Date.now()) waChallenges.delete(k);
  return ch;
}
function waConsumeChallenge(ch) {
  const exp = waChallenges.get(ch);
  if (!exp) return false;
  waChallenges.delete(ch);
  return exp >= Date.now();
}
function rpInfo(req) {
  const host = String(req.headers.host || 'localhost').toLowerCase();
  return { rpId: host.split(':')[0], origin: (isHttps(req) ? 'https://' : 'http://') + host };
}
function getPasskeys() { try { return JSON.parse(getSettingRaw('instructor_passkeys') || '[]'); } catch { return []; } }
function setPasskeys(list) { setSettingRaw('instructor_passkeys', JSON.stringify(list)); }

// Minimaler CBOR-Decoder (nur die WebAuthn-Teilmenge)
function cborDecode(buf, start = 0) {
  let o = start;
  const readLen = (ai) => {
    if (ai < 24) return ai;
    if (ai === 24) { const v = buf[o]; o += 1; return v; }
    if (ai === 25) { const v = buf.readUInt16BE(o); o += 2; return v; }
    if (ai === 26) { const v = buf.readUInt32BE(o); o += 4; return v; }
    if (ai === 27) { const v = Number(buf.readBigUInt64BE(o)); o += 8; return v; }
    throw new Error('cbor-len');
  };
  const item = () => {
    const b = buf[o]; o += 1;
    const major = b >> 5, ai = b & 0x1f;
    if (major === 0) return readLen(ai);
    if (major === 1) return -1 - readLen(ai);
    if (major === 2) { const n = readLen(ai); const v = buf.subarray(o, o + n); o += n; return v; }
    if (major === 3) { const n = readLen(ai); const v = buf.toString('utf8', o, o + n); o += n; return v; }
    if (major === 4) { const n = readLen(ai); const a = []; for (let i = 0; i < n; i++) a.push(item()); return a; }
    if (major === 5) { const n = readLen(ai); const m = new Map(); for (let i = 0; i < n; i++) { const k = item(); m.set(k, item()); } return m; }
    if (major === 7) { return null; }
    throw new Error('cbor-major ' + major);
  };
  return { value: item(), offset: o };
}
// COSE-Public-Key (CBOR) -> KeyObject (ES256 / RS256)
function coseToKey(coseBuf) {
  const m = cborDecode(coseBuf).value;
  const kty = m.get(1);
  if (kty === 2) return createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64url(m.get(-2)), y: b64url(m.get(-3)) }, format: 'jwk' });
  if (kty === 3) return createPublicKey({ key: { kty: 'RSA', n: b64url(m.get(-1)), e: b64url(m.get(-2)) }, format: 'jwk' });
  throw new Error('Schluesseltyp nicht unterstuetzt');
}
// authenticatorData zerlegen
function parseAuthData(ad) {
  const out = { rpIdHash: ad.subarray(0, 32), flags: ad[32], signCount: ad.readUInt32BE(33) };
  out.up = !!(out.flags & 0x01); out.uv = !!(out.flags & 0x04); out.at = !!(out.flags & 0x40);
  if (out.at) {
    let o = 37 + 16;                       // 37 + aaguid(16)
    const credLen = ad.readUInt16BE(o); o += 2;
    out.credId = ad.subarray(o, o + credLen); o += credLen;
    out.coseKey = ad.subarray(o);
  }
  return out;
}

// Wiederherstellungs-Codes für den Fahrlehrer erzeugen (Klartext zurück, Hashes speichern).
function genInstructorRecovery(n = 8) {
  const AL = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const grp = () => { let s = ''; const r = randomBytes(5); for (let i = 0; i < 5; i++) s += AL[r[i] % AL.length]; return s; };
  const codes = [];
  for (let i = 0; i < n; i++) codes.push(grp() + '-' + grp());
  setSettingRaw('instructor_recovery', JSON.stringify(codes.map((c) => hashPassword(c))));
  return codes;
}

function getSession(req) {
  // Cookie (Web) ODER Authorization: Bearer <token> (native App / API-Clients)
  const auth = req.headers.authorization;
  const token = parseCookies(req).fsp
    || (auth && auth.startsWith('Bearer ') ? auth.slice(7).trim() : null);
  if (!token) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!s) return null;
  if (s.expires < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return s;
}

// ---------- Zeit-/Datums-Helfer ----------
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// ISO-Wochentag 1..7 (Mo..So) aus YYYY-MM-DD
function isoDow(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.getDay() === 0 ? 7 : d.getDay();
}
// Lokale YYYY-MM-DD-Ausgabe (nie toISOString -> sonst Zeitzonen-Versatz)
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
// Montag der Woche zu einem Datum
function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (dow - 1));
  return ymd(d);
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return ymd(d);
}
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function nowHHMM() { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
// Stunden von jetzt bis zum Termin (date=YYYY-MM-DD, start=HH:MM)
function hoursUntil(date, start) {
  const target = new Date(`${date}T${start}:00`).getTime();
  return (target - Date.now()) / 36e5;
}
// ganze Tage zwischen heute und date
function daysAhead(date) {
  return Math.round((new Date(date + 'T00:00:00').getTime() - new Date(todayStr() + 'T00:00:00').getTime()) / 864e5);
}
// Luftlinie in km zwischen zwei Koordinaten
function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371, rad = (d) => d * Math.PI / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function getOverride(date) {
  return db.prepare('SELECT * FROM day_overrides WHERE date = ?').get(date) || null;
}

// Slot-Raster fuer ein Datum erzeugen (beruecksichtigt Tages-Ausnahmen / kurze Tage)
function slotGrid(date) {
  const s = getSettings();
  const step = s.lesson_min + s.break_min;
  if (!(step > 0) || !(s.lesson_min > 0)) return []; // Schutz vor Endlosschleife bei Fehlwerten
  const ov = date ? getOverride(date) : null;
  if (ov && ov.closed) return [];
  const start = toMin((ov && ov.start_time) || getSettingRaw('start_time'));
  const last = toMin((ov && ov.last_start) || getSettingRaw('last_start'));
  const slots = [];
  for (let t = start; t <= last; t += step) {
    slots.push({ start: toHHMM(t), duration: s.lesson_min, end: toHHMM(t + s.lesson_min) });
  }
  return slots;
}

// ---- Fliessender Tagesplan (lueckenlos) ----
// Abholzeit (Minuten) eines Schuelers: explizit gepflegt (z.B. Groß Schönebeck = 30),
// sonst aus dem Wohnort geschaetzt (Luftlinie / Durchschnittstempo), sonst Standardwert.
function travelMin(studentId) {
  if (!studentId) return 0;
  const st = db.prepare('SELECT travel_min, home_lat, home_lng, home_base FROM students WHERE id = ?').get(studentId);
  if (!st) return 0;
  if (st.travel_min != null) return Math.max(0, Math.round(st.travel_min)); // fest hinterlegt gewinnt
  // Zwei moegliche Standorte (Eberswalde + Finow); je nach Wahl bzw. automatisch der naehere.
  const bases = [];
  const s1lat = Number(getSettingRaw('school_lat')), s1lng = Number(getSettingRaw('school_lng'));
  const s2lat = Number(getSettingRaw('school2_lat')), s2lng = Number(getSettingRaw('school2_lng'));
  if (s1lat && s1lng) bases.push({ key: 'main', lat: s1lat, lng: s1lng });
  if (s2lat && s2lng) bases.push({ key: 'finow', lat: s2lat, lng: s2lng });
  if (st.home_lat != null && st.home_lng != null && bases.length) {
    let chosen;
    if (st.home_base === 'finow') chosen = bases.find((b) => b.key === 'finow') || bases[0];
    else if (st.home_base === 'main') chosen = bases.find((b) => b.key === 'main') || bases[0];
    else chosen = bases                          // automatisch: der naehere Standort
      .map((b) => ({ ...b, d: haversineKm(b.lat, b.lng, st.home_lat, st.home_lng) }))
      .sort((a, z) => a.d - z.d)[0];
    const km = haversineKm(chosen.lat, chosen.lng, st.home_lat, st.home_lng);
    const speed = Math.max(5, Number(getSettingRaw('avg_speed_kmh')) || 30);
    return Math.round((km / speed) * 60 / 5) * 5; // auf 5 Min gerundet
  }
  return Math.max(0, Number(getSettingRaw('travel_default_min')) || 0);
}

// Rahmen eines Tages: Arbeitsbeginn, spaetestmoegliches Stundenende, Pause.
function dayFrame(date) {
  const s = getSettings();
  const ov = date ? getOverride(date) : null;
  if (ov && ov.closed) return { closed: true, dayStart: 0, workEnd: 0, brk: s.break_min, lessonMin: s.lesson_min };
  const dayStart = toMin((ov && ov.start_time) || getSettingRaw('start_time'));
  const lastStart = toMin((ov && ov.last_start) || getSettingRaw('last_start'));
  const workEnd = lastStart + s.lesson_min; // spaetestes Stundenende des Tages
  return { closed: false, dayStart, lastStart, workEnd, brk: s.break_min, lessonMin: s.lesson_min };
}

// ===================== Web Push (Handy-Benachrichtigungen) =====================
// Zero-Dependency nach RFC 8291 (aes128gcm) + VAPID (RFC 8292).
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlDecode = (str) => Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function ensureVapidKeys() {
  if (getSettingRaw('vapid_public') && getSettingRaw('vapid_private')) return;
  const ec = createECDH('prime256v1'); ec.generateKeys();
  setSettingRaw('vapid_public', b64url(ec.getPublicKey()));   // 65 Byte unkomprimiert
  setSettingRaw('vapid_private', b64url(ec.getPrivateKey())); // 32 Byte Skalar
}
function vapidPrivKeyObject() {
  const p = b64urlDecode(getSettingRaw('vapid_public'));      // 0x04 || X(32) || Y(32)
  const jwk = { kty: 'EC', crv: 'P-256', x: b64url(p.subarray(1, 33)), y: b64url(p.subarray(33, 65)), d: b64url(b64urlDecode(getSettingRaw('vapid_private'))) };
  return createPrivateKey({ key: jwk, format: 'jwk' });
}
const hkdf = (salt, ikm, info, len) => Buffer.from(hkdfSync('sha256', ikm, salt, info, len));

// Payload nach RFC 8291 verschluesseln (aes128gcm, ein Record)
function encryptPush(payload, p256dhB64, authB64) {
  const uaPublic = b64urlDecode(p256dhB64);   // 65
  const authSecret = b64urlDecode(authB64);   // 16
  const as = createECDH('prime256v1'); as.generateKeys();
  const asPublic = as.getPublicKey();         // 65
  const shared = as.computeSecret(uaPublic);  // 32
  const salt = randomBytes(16);
  const authInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const prk = hkdf(authSecret, shared, authInfo, 32);
  const cek = hkdf(salt, prk, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, prk, Buffer.from('Content-Encoding: nonce\0'), 12);
  const record = Buffer.concat([Buffer.from(payload, 'utf8'), Buffer.from([0x02])]); // letzter Record
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(record), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096, 0);
  const header = Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic]);
  return Buffer.concat([header, body]);
}
function vapidAuth(endpoint) {
  const u = new URL(endpoint);
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64url(JSON.stringify({ aud: u.origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:kontakt@ginoco.de' }));
  const signingInput = `${header}.${payload}`;
  const sig = cryptoSign('sha256', Buffer.from(signingInput), { key: vapidPrivKeyObject(), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${signingInput}.${b64url(sig)}, k=${getSettingRaw('vapid_public')}`;
}
function postPush(endpoint, body, auth) {
  return new Promise((resolve) => {
    const u = new URL(endpoint);
    const req = httpsRequest({ hostname: u.hostname, port: 443, path: u.pathname + u.search, method: 'POST',
      headers: { Authorization: auth, 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
        'Content-Length': body.length, TTL: '86400', Urgency: 'normal' } },
      (res) => { let d = ''; res.on('data', (c) => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
    req.on('error', (e) => resolve({ status: 0, error: e.message }));
    req.write(body); req.end();
  });
}
// Push an alle Geraete eines Schuelers (fire-and-forget). Tote Abos (404/410) werden entfernt.
function pushToStudent(studentId, message, url = '/') {
  try {
    if (!studentId || !getSettingRaw('vapid_public')) return;
    const subs = db.prepare('SELECT * FROM push_subscriptions WHERE student_id = ?').all(studentId);
    if (!subs.length) return;
    const payload = JSON.stringify({ title: 'Ginoco', body: String(message).slice(0, 300), url });
    for (const s of subs) {
      let body; try { body = encryptPush(payload, s.p256dh, s.auth); } catch (e) { console.error('push enc', e); continue; }
      postPush(s.endpoint, body, vapidAuth(s.endpoint)).then((r) => {
        if (r.status === 404 || r.status === 410) db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(s.id);
      }).catch(() => {});
    }
  } catch (e) { console.error('pushToStudent', e); }
}
// Push an alle Geraete des Fahrlehrers (fuer neue Schueler-Nachrichten).
function pushToInstructor(message, url = '/') {
  try {
    if (!getSettingRaw('vapid_public')) return;
    const subs = db.prepare("SELECT * FROM push_subscriptions WHERE kind = 'instructor'").all();
    if (!subs.length) return;
    const payload = JSON.stringify({ title: 'Ginoco', body: String(message).slice(0, 300), url });
    for (const s of subs) {
      let body; try { body = encryptPush(payload, s.p256dh, s.auth); } catch { continue; }
      postPush(s.endpoint, body, vapidAuth(s.endpoint)).then((r) => {
        if (r.status === 404 || r.status === 410) db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(s.id);
      }).catch(() => {});
    }
  } catch (e) { console.error('pushToInstructor', e); }
}

// Belegte Intervalle eines Tages (Buchungen + Bloecke), sortiert.
function occupiedIntervals(date) {
  const bookings = db.prepare(
    "SELECT id,student_id,start_time,duration_min,status FROM bookings WHERE date = ? AND status IN ('booked','offered','done')").all(date);
  const blocks = db.prepare('SELECT start_time,end_time,title FROM blocks WHERE date = ?').all(date);
  const iv = [];
  for (const b of bookings) iv.push({ s: toMin(b.start_time), e: toMin(b.start_time) + b.duration_min, kind: 'booking', b });
  for (const bl of blocks) iv.push({ s: toMin(bl.start_time), e: toMin(bl.end_time), kind: 'block', title: bl.title });
  iv.sort((a, z) => a.s - z.s || a.e - z.e);
  return iv;
}

// Freie Startzeiten fuer eine NEUE Fahrstunde dieses Schuelers (fliessend, lueckenlos).
// Vor jeder Stunde liegt die Abholzeit; zwischen zwei Stunden zusaetzlich die Pause.
// Rueckgabe: [{ start(min), cap(min) }] – cap = spaetestes erlaubtes Stundenende an diesem Start.
function freeStarts(date, studentId) {
  const f = dayFrame(date);
  if (f.closed) return [];
  const travel = travelMin(studentId);
  const brk = f.brk;
  const minDur = 40; // kuerzestmoegliche Stunde, um einen Start ueberhaupt anzubieten
  const iv = occupiedIntervals(date);
  const out = [];

  // Klassisches festes Raster (nur falls der fliessende Plan abgeschaltet ist):
  // Startzeiten auf festem Abstand (Dauer + Pause), freie werden angeboten.
  if (getSettingRaw('flow_schedule') === '0') {
    const step = f.lessonMin + brk;
    if (step <= 0) return [];
    const capFor = (t) => {
      let cap = f.workEnd;
      for (const o of iv) if (o.s >= t + minDur && o.s - brk < cap) cap = o.s - brk;
      return cap;
    };
    for (let t = f.dayStart; t <= f.lastStart; t += step) {
      const busy = iv.some((o) => overlaps(t, t + minDur, o.s, o.e));
      if (busy) continue;
      const cap = capFor(t);
      if (t + minDur <= cap) out.push({ start: t, cap });
    }
    return out;
  }
  // Heute: keine Startzeiten in der Vergangenheit anbieten (auf jetzt vorziehen).
  const nowClamp = (date === todayStr()) ? Math.ceil(toMin(nowHHMM()) / 5) * 5 : -1;
  // „danach": lueckenlos NACH einer Buchung (Pause + Abholzeit), Fenster ggf. nach rechts begrenzt.
  const addAfter = (winStart, winEnd) => {
    if (winEnd <= winStart) return;
    let start = winStart + brk + travel;
    start = Math.ceil(start / 5) * 5; // auf 5 Min aufrunden
    if (nowClamp >= 0) start = Math.max(start, nowClamp);
    // Ende dieses Fensters: bei einer Belegung dahinter muss noch die Pause passen
    const interior = winEnd < f.workEnd;
    const cap = interior ? winEnd - brk : winEnd;
    if (start + minDur <= cap) out.push({ start, cap });
  };
  // „davor": lueckenlos VOR der ersten Buchung. Die Stunde endet buendig, danach
  // Pause + Abholzeit bis zur Buchung. Die erste Stunde des Tages braucht Abholzeit voraus.
  const addBefore = (winStart, bookingStart) => {
    const cap = bookingStart - brk;               // Vor-Stunde endet spaetestens hier (dann Pause bis zur Buchung)
    const earliest = Math.ceil((winStart + travel) / 5) * 5; // Abholung vor der ersten Stunde des Tages
    if (cap - earliest < minDur) return;
    const room = cap - earliest;
    const anchor = Math.min(f.lessonMin, room);   // Standardstunde endet buendig (lueckenlos) an der Buchung
    let start = cap - anchor;
    if (start < earliest) start = earliest;
    start = Math.round(start / 5) * 5;
    if (nowClamp >= 0) start = Math.max(start, nowClamp);
    if (start + minDur <= cap) out.push({ start, cap });
  };
  if (!iv.length) {
    // Leerer Tag: freie Wunschzeit – mehrere Startzeiten im 30-Min-Raster anbieten.
    // Sobald der Schueler eine bucht, fliesst der Rest lueckenlos davor & danach.
    const WISH = 30;
    const first = Math.ceil((f.dayStart + travel) / WISH) * WISH; // Abholung vor der 1. Stunde
    const seen = new Set();
    const push = (t) => {
      let start = t;
      if (nowClamp >= 0) start = Math.max(start, nowClamp);
      if (start < first || start > f.lastStart) return;
      if (start + minDur > f.workEnd) return;
      if (seen.has(start)) return;
      seen.add(start); out.push({ start, cap: f.workEnd });
    };
    for (let t = first; t <= f.lastStart; t += WISH) push(t);
    push(f.lastStart); // spaetestmoeglichen Start immer anbieten
    out.sort((a, z) => a.start - z.start);
  } else {
    addBefore(f.dayStart, iv[0].s);
    for (let i = 0; i < iv.length; i++) {
      const winStart = iv[i].e;
      const winEnd = (i + 1 < iv.length) ? iv[i + 1].s : f.workEnd;
      addAfter(winStart, Math.min(winEnd, f.workEnd));
    }
  }
  return out;
}

// Ist ein Datum fuer Schueler buchbar? Beruecksichtigt Horizont + taegliche Freigabe-Uhrzeit.
// Gefahrene (abgeschlossene) Stunden eines Schuelers
function doneCount(studentId) {
  return db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE student_id=? AND status='done' AND (attended IS NULL OR attended=1)").get(studentId).n;
}
// Rang & Buchungshorizont eines Schuelers (ab X Stunden -> Rang 2 -> weiter im Voraus)
function studentRank(studentId) {
  const rank2Min = Number(getSettingRaw('rank2_min_lessons'));
  const dc = studentId ? doneCount(studentId) : 0;
  const rank = dc >= rank2Min ? 2 : 1;
  const horizon = rank >= 2
    ? Number(getSettingRaw('booking_horizon_days_rank2'))
    : Number(getSettingRaw('booking_horizon_days'));
  return { rank, horizon, doneCount: dc, rank2Min };
}
// Gefahrene Sonderfahrten je Art – in UNTERRICHTSEINHEITEN (UE, 45 Min).
// So zaehlt eine 225-Min-Ueberlandfahrt korrekt als 5 UE (= 5/5), nicht als 1 Termin.
function sonderCounts(studentId) {
  const UE = 45;
  const rows = db.prepare(
    "SELECT lesson_type AS t, COALESCE(SUM(duration_min),0) AS m FROM bookings WHERE student_id=? AND status='done' AND (attended IS NULL OR attended=1) AND lesson_type IN ('ueberland','autobahn','nacht') GROUP BY lesson_type").all(studentId);
  const m = { ueberland: 0, autobahn: 0, nacht: 0 };
  for (const r of rows) m[r.t] = Math.round((r.m || 0) / UE);
  return m;
}
function sonderReq() {
  return { ueberland: Number(getSettingRaw('req_ueberland')), autobahn: Number(getSettingRaw('req_autobahn')), nacht: Number(getSettingRaw('req_nacht')) };
}
// Feste Dauer je Sonderfahrt (Minuten): Ueberland 225 · Autobahn 180 · Nacht 135
function sonderMin(type) {
  const d = { ueberland: Number(getSettingRaw('sonder_min_ueberland')) || 225,
    autobahn: Number(getSettingRaw('sonder_min_autobahn')) || 180,
    nacht: Number(getSettingRaw('sonder_min_nacht')) || 135 };
  return d[type] || 0;
}

// Fahrstunden-Statistik: Einheiten (Doppelstunde = 80 Min = 1; 40=0,5; 120=1,5; 160=2),
// Anzahl Termine, gefahrene Minuten – gesamt und nach Getriebe (Schalt/Automatik).
function lessonStats(studentId) {
  const UNIT = 80;
  const rows = db.prepare(
    "SELECT duration_min AS d, gearbox AS g, lesson_type AS t FROM bookings WHERE student_id=? AND status='done' AND (attended IS NULL OR attended=1)").all(studentId);
  const s = {
    sessions: 0, minutes: 0, units: 0,
    schalt: { sessions: 0, minutes: 0, units: 0 },
    automatik: { sessions: 0, minutes: 0, units: 0 },
    sonder: { ueberland: { sessions: 0, minutes: 0 }, autobahn: { sessions: 0, minutes: 0 }, nacht: { sessions: 0, minutes: 0 } },
  };
  for (const r of rows) {
    const d = Number(r.d) || 0;
    s.sessions++; s.minutes += d; s.units += d / UNIT;
    if (r.g === 'schalt') { s.schalt.sessions++; s.schalt.minutes += d; s.schalt.units += d / UNIT; }
    else if (r.g === 'automatik') { s.automatik.sessions++; s.automatik.minutes += d; s.automatik.units += d / UNIT; }
    if (s.sonder[r.t]) { s.sonder[r.t].sessions++; s.sonder[r.t].minutes += d; }
  }
  const round1 = (x) => Math.round(x * 10) / 10;
  s.units = round1(s.units); s.schalt.units = round1(s.schalt.units); s.automatik.units = round1(s.automatik.units);
  s.hours = round1(s.minutes / 60);
  s.unit = UNIT;
  return s;
}

// Zusammenfassung der Ausbildungskarte über ALLE Fahrstunden: je Aufgabe wie oft
// geübt (gesamt + je Tag), letzter Stand, und welche Punkte noch geübt werden müssen.
function adkSummary(studentId) {
  const rows = db.prepare(
    "SELECT date, curriculum FROM bookings WHERE student_id=? AND status='done' AND (attended IS NULL OR attended=1) AND curriculum IS NOT NULL AND curriculum <> '' ORDER BY date, start_time").all(studentId);
  const items = {};        // key -> { count, days:{date:count}, lastDate, lastStatus, statuses:{geuebt,mehr,ok} }
  let totalMarks = 0;
  for (const r of rows) {
    let arr = []; try { arr = JSON.parse(r.curriculum) || []; } catch {}
    for (const raw of arr) {
      const k = typeof raw === 'string' ? raw : (raw && raw.k);
      if (!k) continue;
      let st = (raw && typeof raw === 'object' && raw.s) ? raw.s : 'geuebt';
      if (!['geuebt', 'mehr', 'ok'].includes(st)) st = 'geuebt';
      const it = items[k] || (items[k] = { count: 0, days: {}, lastDate: null, lastStatus: null, statuses: { geuebt: 0, mehr: 0, ok: 0 } });
      it.count++; totalMarks++;
      it.days[r.date] = (it.days[r.date] || 0) + 1;
      it.statuses[st]++;
      it.lastDate = r.date; it.lastStatus = st; // rows sind chronologisch -> letzter gewinnt
    }
  }
  // „Muss noch geübt werden" = zuletzt als 'mehr' markiert
  const needWork = Object.keys(items).filter((k) => items[k].lastStatus === 'mehr');
  const distinct = Object.keys(items).length;
  return { items, totalMarks, distinct, needWork, lessonsWithCard: rows.length };
}

function dateOpenForStudents(date, studentId = null) {
  const horizon = studentId ? studentRank(studentId).horizon : Number(getSettingRaw('booking_horizon_days'));
  const ahead = daysAhead(date);
  if (ahead < 0) return false;
  if (ahead > horizon) return false;
  // Der aeusserste Tag (genau am Horizont) oeffnet erst ab der Freigabe-Uhrzeit
  if (ahead === horizon) {
    const release = getSettingRaw('release_time') || '10:00';
    if (nowHHMM() < release) return false;
  }
  return true;
}

// Ueberlappen zwei Zeitintervalle [a1,a2) und [b1,b2)?
const overlaps = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;

// ---------- API-Endpunkte ----------
async function handleApi(req, res, url) {
  const p = url.pathname;
  const method = req.method;
  const sess = getSession(req);
  const requireInstructor = () => sess && sess.kind === 'instructor';
  const requireStudent = () => sess && sess.kind === 'student';

  // ===== AUTH =====
  if (p === '/api/auth/me' && method === 'GET') {
    if (!sess) return ok(res, { user: null });
    if (sess.kind === 'instructor') {
      return ok(res, { user: { role: 'instructor', name: getSettingRaw('instructor_name') } });
    }
    const st = db.prepare('SELECT id,name,email,phone,username,allowed_durations FROM students WHERE id = ?').get(sess.student_id);
    if (!st) return ok(res, { user: null });
    return ok(res, { user: { role: 'student', ...st } });
  }

  if (p === '/api/auth/logout' && method === 'POST') {
    const token = parseCookies(req).fsp;
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.setHeader('Set-Cookie', 'fsp=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
    return ok(res);
  }

  if (p === '/api/auth/instructor' && method === 'POST') {
    if (loginBlocked(req)) return bad(res, 'Zu viele Fehlversuche. Bitte in ein paar Minuten erneut versuchen.', 429);
    const b = await readBody(req);
    const secret = String(b.pin || b.password || '');
    if (!verifyPassword(secret, getSettingRaw('instructor_pin'))) { noteLoginFail(req); return bad(res, 'Falsche PIN oder falsches Passwort', 401); }
    // Optionaler zweiter Faktor (Authenticator): wenn aktiviert, Code verlangen.
    const totp = getSettingRaw('instructor_totp');
    if (getSettingRaw('instructor_2fa') === '1' && totp) {
      const code = String(b.code || '').replace(/\s/g, '');
      if (!code) return ok(res, { need2fa: true });        // Client blendet das Code-Feld ein
      if (!totpVerify(totp, code)) { noteLoginFail(req); return bad(res, 'Authenticator-Code stimmt nicht.', 401); }
    }
    noteLoginOk(req);
    const remember = !(b.remember === false || b.remember === 0 || b.remember === '0');
    const token = createSession(res, 'instructor', null, isHttps(req), remember);
    return ok(res, { role: 'instructor', name: getSettingRaw('instructor_name'), token });
  }
  // Passwort vergessen (Fahrlehrer): mit einem gültigen Authenticator-Code ein neues Passwort setzen.
  if (p === '/api/auth/instructor/forgot' && method === 'POST') {
    if (loginBlocked(req)) return bad(res, 'Zu viele Versuche. Bitte in ein paar Minuten erneut.', 429);
    const b = await readBody(req);
    const totp = getSettingRaw('instructor_totp');
    if (!totp) return bad(res, 'Es ist noch kein Authenticator eingerichtet. Bitte richte ihn zuerst in den Einstellungen ein.', 400);
    if (!totpVerify(totp, b.code)) { noteLoginFail(req); return bad(res, 'Authenticator-Code stimmt nicht. Uhrzeit am Handy automatisch stellen lassen.', 401); }
    const np = String(b.new_password || '');
    const prob = passwordProblem(np);
    if (prob) return bad(res, 'Neues Passwort braucht ' + prob + '.');
    setSettingRaw('instructor_pin', hashPassword(np));
    noteLoginOk(req);
    logEvent('info', { actor: 'instructor', detail: 'Passwort per Authenticator zurückgesetzt' });
    return ok(res, { reset: true });
  }
  // Authenticator einrichten: neues (noch nicht bestätigtes) Geheimnis + QR-Link.
  if (p === '/api/instructor/totp/setup' && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const secret = newTotpSecret();
    setSettingRaw('instructor_totp_pending', secret);
    const label = getSettingRaw('instructor_name') || 'Fahrlehrer';
    return ok(res, { secret, otpauth: otpauthURL(secret, label, 'Ginoco') });
  }
  // Authenticator bestätigen: Code prüfen und aktivieren (optional 2FA beim Login).
  if (p === '/api/instructor/totp/confirm' && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const b = await readBody(req);
    const pending = getSettingRaw('instructor_totp_pending');
    if (!pending) return bad(res, 'Bitte zuerst „Einrichten" antippen.');
    if (!totpVerify(pending, b.code)) return bad(res, 'Code stimmt nicht. Stimmt die Uhrzeit am Handy (automatisch stellen)?');
    setSettingRaw('instructor_totp', pending);
    setSettingRaw('instructor_totp_pending', '');
    setSettingRaw('instructor_2fa', b.require_login ? '1' : '0');
    logEvent('info', { actor: 'instructor', detail: 'Authenticator eingerichtet' });
    return ok(res, { enabled: true, two_factor: b.require_login ? true : false });
  }
  // 2FA beim Login an/aus (Authenticator muss eingerichtet sein).
  if (p === '/api/instructor/totp/2fa' && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const b = await readBody(req);
    if (!getSettingRaw('instructor_totp')) return bad(res, 'Erst den Authenticator einrichten.');
    setSettingRaw('instructor_2fa', b.on ? '1' : '0');
    return ok(res, { two_factor: !!b.on });
  }
  // Authenticator entfernen (Passwort ODER aktueller Code zur Bestätigung).
  if (p === '/api/instructor/totp/disable' && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const b = await readBody(req);
    const okAuth = verifyPassword(String(b.password || ''), getSettingRaw('instructor_pin'))
      || totpVerify(getSettingRaw('instructor_totp'), b.code);
    if (!okAuth) return bad(res, 'Bitte Passwort oder aktuellen Code zur Bestätigung.', 401);
    setSettingRaw('instructor_totp', ''); setSettingRaw('instructor_totp_pending', ''); setSettingRaw('instructor_2fa', '0');
    logEvent('info', { actor: 'instructor', detail: 'Authenticator entfernt' });
    return ok(res, { disabled: true });
  }

  // ===== Passkeys / Face ID (WebAuthn), nur Fahrlehrer =====
  if (p === '/api/instructor/passkey/register/options' && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const { rpId } = rpInfo(req);
    return ok(res, {
      challenge: waIssueChallenge(), rp: { id: rpId, name: 'Ginoco' },
      user: { id: b64url(Buffer.from('ginoco-fahrlehrer')), name: getSettingRaw('instructor_name') || 'Fahrlehrer', displayName: getSettingRaw('instructor_name') || 'Fahrlehrer' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
      excludeCredentials: getPasskeys().map((k) => ({ id: k.id, type: 'public-key' })),
      timeout: 120000, attestation: 'none',
    });
  }
  if (p === '/api/instructor/passkey/register/verify' && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const b = await readBody(req);
    try {
      const { rpId, origin } = rpInfo(req);
      const clientData = JSON.parse(b64urlDecode(b.clientDataJSON).toString('utf8'));
      if (clientData.type !== 'webauthn.create') return bad(res, 'Falscher Anfrage-Typ');
      if (!waConsumeChallenge(clientData.challenge)) return bad(res, 'Anfrage abgelaufen – bitte erneut versuchen.');
      if (clientData.origin !== origin) return bad(res, 'Origin stimmt nicht');
      const att = cborDecode(b64urlDecode(b.attestationObject)).value;
      const parsed = parseAuthData(att.get('authData'));
      if (!parsed.up && !parsed.uv) return bad(res, 'Nutzerbestätigung fehlt');
      if (!parsed.rpIdHash.equals(createHash('sha256').update(rpId).digest())) return bad(res, 'Domain stimmt nicht');
      if (!parsed.credId) return bad(res, 'Kein Passkey erhalten');
      coseToKey(parsed.coseKey); // prüfen, dass der Schlüssel lesbar ist
      const id = b64url(parsed.credId);
      const list = getPasskeys();
      if (list.some((k) => k.id === id)) return ok(res, { ok: true, already: true });
      const label = (b.label && String(b.label).slice(0, 40)) || ('Passkey ' + (list.length + 1));
      list.push({ id, cose: b64url(parsed.coseKey), counter: parsed.signCount, label, created_at: new Date().toISOString() });
      setPasskeys(list);
      logEvent('info', { actor: 'instructor', detail: 'Passkey/Face ID hinzugefügt (' + label + ')' });
      return ok(res, { ok: true, label });
    } catch (e) { console.error('passkey reg', e); return bad(res, 'Passkey konnte nicht gespeichert werden.'); }
  }
  if (p === '/api/instructor/passkey/auth/options' && method === 'POST') {
    if (loginBlocked(req)) return bad(res, 'Zu viele Versuche. Bitte in ein paar Minuten erneut.', 429);
    const { rpId } = rpInfo(req);
    return ok(res, {
      challenge: waIssueChallenge(), rpId, timeout: 120000, userVerification: 'preferred',
      allowCredentials: getPasskeys().map((k) => ({ id: k.id, type: 'public-key' })),
    });
  }
  if (p === '/api/instructor/passkey/auth/verify' && method === 'POST') {
    if (loginBlocked(req)) return bad(res, 'Zu viele Versuche. Bitte in ein paar Minuten erneut.', 429);
    const b = await readBody(req);
    try {
      const { rpId, origin } = rpInfo(req);
      const clientData = JSON.parse(b64urlDecode(b.clientDataJSON).toString('utf8'));
      if (clientData.type !== 'webauthn.get') { noteLoginFail(req); return bad(res, 'Falscher Anfrage-Typ', 401); }
      if (!waConsumeChallenge(clientData.challenge)) { noteLoginFail(req); return bad(res, 'Anfrage abgelaufen – bitte erneut.', 401); }
      if (clientData.origin !== origin) { noteLoginFail(req); return bad(res, 'Origin stimmt nicht', 401); }
      const cred = getPasskeys().find((k) => k.id === b.id);
      if (!cred) { noteLoginFail(req); return bad(res, 'Passkey nicht bekannt', 401); }
      const authData = b64urlDecode(b.authenticatorData);
      const parsed = parseAuthData(authData);
      if (!parsed.rpIdHash.equals(createHash('sha256').update(rpId).digest())) { noteLoginFail(req); return bad(res, 'Domain stimmt nicht', 401); }
      if (!parsed.up) { noteLoginFail(req); return bad(res, 'Nutzerbestätigung fehlt', 401); }
      const clientHash = createHash('sha256').update(b64urlDecode(b.clientDataJSON)).digest();
      const signedData = Buffer.concat([authData, clientHash]);
      if (!cryptoVerify('sha256', signedData, coseToKey(b64urlDecode(cred.cose)), b64urlDecode(b.signature))) {
        noteLoginFail(req); return bad(res, 'Signatur ungültig', 401);
      }
      if (parsed.signCount > 0 || cred.counter > 0) {
        const list = getPasskeys(); const c = list.find((k) => k.id === cred.id);
        if (c) { c.counter = parsed.signCount; setPasskeys(list); }
      }
      noteLoginOk(req);
      const token = createSession(res, 'instructor', null, isHttps(req), true);
      return ok(res, { role: 'instructor', name: getSettingRaw('instructor_name'), token });
    } catch (e) { console.error('passkey auth', e); return bad(res, 'Anmeldung fehlgeschlagen.', 401); }
  }
  if (p === '/api/instructor/passkeys' && method === 'GET') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    return ok(res, { passkeys: getPasskeys().map((k) => ({ id: k.id, label: k.label, created_at: k.created_at })) });
  }
  if (p === '/api/instructor/passkey/delete' && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const b = await readBody(req);
    const list = getPasskeys().filter((k) => k.id !== b.id);
    setPasskeys(list);
    logEvent('info', { actor: 'instructor', detail: 'Passkey entfernt' });
    return ok(res, { ok: true, count: list.length });
  }
  // Zugang wiederherstellen: mit einem Wiederherstellungs-Code ein neues Passwort setzen.
  if (p === '/api/auth/instructor/recover' && method === 'POST') {
    if (loginBlocked(req)) return bad(res, 'Zu viele Versuche. Bitte in ein paar Minuten erneut.', 429);
    const b = await readBody(req);
    const code = String(b.code || '').trim().toUpperCase();
    const np = String(b.new_password || '');
    let list; try { list = JSON.parse(getSettingRaw('instructor_recovery') || '[]'); } catch { list = []; }
    const idx = list.findIndex((h) => verifyPassword(code, h));
    if (idx < 0) { noteLoginFail(req); return bad(res, 'Code ungültig oder bereits verwendet.', 401); }
    const prob = passwordProblem(np);
    if (prob) return bad(res, 'Neues Passwort braucht ' + prob + '.');
    setSettingRaw('instructor_pin', hashPassword(np));
    list.splice(idx, 1);                                   // Code verbrauchen (einmalig)
    setSettingRaw('instructor_recovery', JSON.stringify(list));
    noteLoginOk(req);
    logEvent('info', { actor: 'instructor', detail: 'Zugang per Wiederherstellungs-Code neu gesetzt' });
    return ok(res, { recovered: true, remaining: list.length });
  }

  if (p === '/api/auth/register' && method === 'POST') {
    if (getSettingRaw('registration_open') !== '1')
      return bad(res, 'Die Registrierung ist derzeit geschlossen. Bitte wende dich an deinen Fahrlehrer.', 403);
    const { code, name, email, phone, password, birth_year } = await readBody(req);
    if (!code || !name || !password) return bad(res, 'Bitte Name, Code und Passwort ausfuellen');
    const prob = passwordProblem(password);
    if (prob) return bad(res, 'Passwort braucht ' + prob + '.');
    const by = Number(birth_year);
    if (!by || by < 1930 || by > 2015) return bad(res, 'Bitte gueltigen Jahrgang angeben');
    const c = db.prepare('SELECT * FROM codes WHERE code = ?').get(String(code).trim().toUpperCase());
    if (!c) return bad(res, 'Ungueltiger Code');
    if (c.used) return bad(res, 'Dieser Code wurde bereits verwendet');
    const mail = email && String(email).trim() ? String(email).trim().toLowerCase() : null;
    if (mail && db.prepare('SELECT 1 FROM students WHERE email = ?').get(mail))
      return bad(res, 'E-Mail ist bereits registriert');
    const username = genUsername(String(name).trim(), by);
    const info = db.prepare('INSERT INTO students(name,email,phone,pass,username,birth_year,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(String(name).trim(), mail, phone ? String(phone).trim() : null, hashPassword(password), username, by, new Date().toISOString());
    const sid = Number(info.lastInsertRowid);
    db.prepare('UPDATE codes SET used = 1, student_id = ? WHERE code = ?').run(sid, c.code);
    logEvent('info', { actor: 'student', studentId: sid, detail: `Konto erstellt (Login: ${username})` });
    const token = createSession(res, 'student', sid, isHttps(req));
    return ok(res, { role: 'student', id: sid, name, username, token });
  }

  if (p === '/api/auth/login' && method === 'POST') {
    if (loginBlocked(req)) return bad(res, 'Zu viele Fehlversuche. Bitte in ein paar Minuten erneut versuchen.', 429);
    const b = await readBody(req);
    const handle = String(b.login || b.email || '').trim();
    const key = handle.toLowerCase();
    // per Login-Name (Initialen+Jahrgang) ODER E-Mail
    const st = db.prepare('SELECT * FROM students WHERE username = ? COLLATE NOCASE OR email = ?').get(handle, key);
    if (!st || !verifyPassword(b.password || '', st.pass)) { noteLoginFail(req); return bad(res, 'Login-Name/E-Mail oder Passwort falsch', 401); }
    noteLoginOk(req);
    const token = createSession(res, 'student', st.id, isHttps(req));
    return ok(res, { role: 'student', id: st.id, name: st.name, token });
  }

  // "Passwort vergessen": Anfrage landet beim Fahrlehrer (der setzt ein neues und teilt es mit).
  // Antwortet immer generisch – keine Konto-Enumeration.
  if (p === '/api/auth/reset-request' && method === 'POST') {
    const b = await readBody(req);
    const handle = String(b.login || b.email || '').trim();
    if (handle) {
      const st = db.prepare('SELECT id,name,username FROM students WHERE username = ? COLLATE NOCASE OR email = ?').get(handle, handle.toLowerCase());
      if (st) {
        // Doppelte Anfragen innerhalb von 30 Min nicht mehrfach protokollieren
        const recent = db.prepare("SELECT 1 FROM events WHERE type='reset' AND student_id=? AND at > ?")
          .get(st.id, new Date(Date.now() - 30 * 60000).toISOString());
        if (!recent) logEvent('reset', { actor: 'student', studentId: st.id,
          detail: `${st.name} hat „Passwort vergessen" angefragt (Login ${st.username || '?'}). Bitte ein neues Passwort setzen und mitteilen.` });
      }
    }
    return ok(res, { requested: true });
  }

  // ===== Einstellungen: Fahrlehrer sieht alles, andere nur eine unbedenkliche Teilmenge =====
  if (p === '/api/settings' && method === 'GET') {
    const full = getSettings();
    if (sess && sess.kind === 'instructor') return ok(res, { settings: full });
    const pub = {};
    for (const k of PUBLIC_SETTINGS) if (k in full) pub[k] = full[k];
    if (!sess) delete pub.instructor_phone; // Handynummer nur fuer eingeloggte Nutzer
    return ok(res, { settings: pub });
  }
  // Version / Health (fuer native App und Monitoring)
  if (p === '/api/version' && method === 'GET') {
    return ok(res, { name: 'ginoco', version: APP_VERSION, auth: ['cookie', 'bearer-token'], ok: true });
  }

  // ===== Bewertungen (oeffentlich lesbar – fuer die Laufschrift auf der Startseite) =====
  if (p === '/api/reviews' && method === 'GET') {
    const rows = db.prepare(
      `SELECT r.id, r.rating, r.text, r.author_mode, r.show_photo, r.reply, r.author_name, r.created_at, r.featured, r.student_id, r.ratings,
              (CASE WHEN r.show_photo=1 AND s.photo IS NOT NULL THEN s.photo ELSE NULL END) AS photo
       FROM reviews r LEFT JOIN students s ON s.id = r.student_id
       WHERE r.published = 1 ORDER BY r.featured DESC, r.created_at DESC LIMIT 60`).all();
    const reviews = rows.map((r) => {
      let ratings = null; if (r.ratings) { try { ratings = JSON.parse(r.ratings); } catch {} }
      return {
        id: r.id, rating: r.rating, text: r.text, reply: r.reply || null,
        author: r.author_name || 'Ein Fahrschüler', photo: r.photo || null,
        verified: r.student_id != null, featured: !!r.featured, ratings,
        date: r.created_at ? r.created_at.slice(0, 10) : null,
      };
    });
    return ok(res, { reviews });
  }

  // ===== Web Push: Handy-Benachrichtigungen =====
  if (p === '/api/push/key' && method === 'GET') {
    return ok(res, { key: getSettingRaw('vapid_public') || null });
  }
  if (p === '/api/push/subscribe' && method === 'POST') {
    if (!requireStudent() && !requireInstructor()) return bad(res, 'Bitte anmelden', 401);
    const b = await readBody(req);
    const endpoint = b.endpoint && String(b.endpoint);
    const p256dh = b.keys && b.keys.p256dh, auth = b.keys && b.keys.auth;
    if (!endpoint || !p256dh || !auth) return bad(res, 'Ungültige Push-Daten');
    const sid = sess.kind === 'student' ? sess.student_id : null;
    db.prepare(`INSERT INTO push_subscriptions(student_id,kind,endpoint,p256dh,auth,created_at)
      VALUES(?,?,?,?,?,?)
      ON CONFLICT(endpoint) DO UPDATE SET student_id=excluded.student_id, kind=excluded.kind, p256dh=excluded.p256dh, auth=excluded.auth`)
      .run(sid, sess.kind, endpoint, String(p256dh), String(auth), new Date().toISOString());
    return ok(res, { subscribed: true });
  }
  if (p === '/api/push/unsubscribe' && method === 'POST') {
    if (!sess) return bad(res, 'Bitte anmelden', 401);
    const b = await readBody(req);
    if (b.endpoint) db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(String(b.endpoint));
    return ok(res, { unsubscribed: true });
  }
  // Test-Push an das eigene Gerät (Button "Test")
  if (p === '/api/push/test' && method === 'POST') {
    if (!requireStudent()) return bad(res, 'Bitte anmelden', 401);
    pushToStudent(sess.student_id, '🔔 Test: So sieht eine Benachrichtigung von Ginoco aus.');
    return ok(res, { sent: true });
  }

  // ===== STUDENT: Slots ansehen & buchen =====
  if (p === '/api/slots' && method === 'GET') {
    if (!requireStudent() && !requireInstructor()) return bad(res, 'Bitte anmelden', 401);
    const date = url.searchParams.get('date') || todayStr();
    return ok(res, { date, ...buildDaySlots(date, sess.kind === 'student' ? sess.student_id : null) });
  }

  // Monats-Verfügbarkeit für den Kalender: pro Tag frei/ausgebucht/geschlossen.
  if (p === '/api/availability' && method === 'GET') {
    if (!requireStudent() && !requireInstructor()) return bad(res, 'Bitte anmelden', 401);
    const studentId = sess.kind === 'student' ? sess.student_id : null;
    const today = todayStr();
    const from = url.searchParams.get('from') || today;
    const to = url.searchParams.get('to') || from;
    const days = [];
    let d = from, guard = 0;
    while (d <= to && guard++ < 70) {
      const day = buildDaySlots(d, studentId);
      let st, free = 0;
      if (d < today) st = 'past';
      else if (!day.isWorkday) st = 'closed';
      else {
        free = day.slots.filter((sl) => sl.state === 'free').length;
        const beyond = day.slots.length > 0 && day.slots.every((sl) => sl.state === 'toofar');
        if (free > 0) st = 'free';
        else if (beyond) st = 'toofar';
        else if (d === today) st = 'past';
        else st = 'full';
      }
      days.push({ date: d, state: st, free });
      d = addDays(d, 1);
    }
    return ok(res, { days });
  }

  // Naechsten buchbaren Tag finden (fuers "reibungslose" Buchen) – scannt ab
  // heute (oder ?from=) vorwaerts bis zum Buchungshorizont des Schuelers.
  if (p === '/api/next-free' && method === 'GET') {
    if (!requireStudent() && !requireInstructor()) return bad(res, 'Bitte anmelden', 401);
    const studentId = sess.kind === 'student' ? sess.student_id : null;
    const horizon = studentId ? studentRank(studentId).horizon : Number(getSettingRaw('booking_horizon_days'));
    let d = url.searchParams.get('from') || todayStr();
    if (daysAhead(d) < 0) d = todayStr();
    let next = null;
    for (let i = 0; i <= horizon + 1; i++) {
      const free = buildDaySlots(d, studentId).slots.filter((s) => s.state === 'free');
      if (free.length) { next = { date: d, freeCount: free.length, first: free[0].start }; break; }
      d = addDays(d, 1);
    }
    return ok(res, { next, horizon });
  }

  if (p === '/api/my/bookings' && method === 'GET') {
    if (!requireStudent()) return bad(res, 'Bitte anmelden', 401);
    const rows = db.prepare(
      `SELECT id,date,start_time,duration_min,status,gearbox,plate,note,started_at,ended_at,confirmed,feedback,lesson_type,late_minutes,attended,needs_sign,signed_at,signature,curriculum,invoice_date,invoice_time,created_at
       FROM bookings WHERE student_id = ? AND status != 'cancelled' ORDER BY date, start_time`
    ).all(sess.student_id);
    return ok(res, { bookings: rows, weekInfo: weekInfoForStudent(sess.student_id),
      stats: lessonStats(sess.student_id), adk: adkSummary(sess.student_id),
      progress: { ...studentRank(sess.student_id), sonder: sonderCounts(sess.student_id), req: sonderReq() } });
  }
  // Fahrschüler unterschreibt/bestätigt eine nachgetragene Fahrstunde.
  const signM = p.match(/^\/api\/my\/bookings\/(\d+)\/sign$/);
  if (signM && method === 'POST') {
    if (!requireStudent()) return bad(res, 'Bitte anmelden', 401);
    const id = Number(signM[1]);
    const bk = db.prepare('SELECT id,student_id,needs_sign,status FROM bookings WHERE id = ?').get(id);
    if (!bk || bk.student_id !== sess.student_id) return bad(res, 'Fahrstunde nicht gefunden', 404);
    const b = await readBody(req);
    const sig = (typeof b.signature === 'string' && validPhoto(b.signature)) ? b.signature : null;
    db.prepare('UPDATE bookings SET signed_at = ?, signature = ?, needs_sign = 0 WHERE id = ?')
      .run(new Date().toISOString(), sig, id);
    // zugehörige „bitte unterschreiben"-Benachrichtigung als gelesen markieren
    db.prepare("UPDATE notifications SET read = 1 WHERE student_id = ? AND kind = 'sign' AND ref_booking_id = ?").run(sess.student_id, id);
    const st = db.prepare('SELECT name FROM students WHERE id = ?').get(sess.student_id);
    logEvent('info', { actor: 'student', studentId: sess.student_id, bookingId: id, detail: `Fahrstunde unterschrieben${st ? ' von ' + st.name : ''}` });
    return ok(res, { signed: true });
  }

  // Eigene Bewertung ansehen / abgeben (ein Eintrag je Schueler – wird ueberschrieben)
  if (p === '/api/my/review' && method === 'GET') {
    if (!requireStudent()) return bad(res, 'Bitte anmelden', 401);
    const r = db.prepare('SELECT id,rating,text,author_mode,show_photo,published,reply,ratings,created_at FROM reviews WHERE student_id = ?').get(sess.student_id) || null;
    if (r && r.ratings) { try { r.ratings = JSON.parse(r.ratings); } catch { r.ratings = null; } }
    const st = db.prepare('SELECT archived_at,(photo IS NOT NULL) AS has_photo FROM students WHERE id = ?').get(sess.student_id) || {};
    return ok(res, { review: r, passed: !!st.archived_at, hasPhoto: !!st.has_photo });
  }
  if (p === '/api/my/review' && method === 'POST') {
    if (!requireStudent()) return bad(res, 'Bitte anmelden', 401);
    const b = await readBody(req);
    const text = String(b.text || '').trim();
    if (text.length < 5) return bad(res, 'Bitte schreib ein paar Worte (mind. 5 Zeichen).');
    if (text.length > 800) return bad(res, 'Bitte fasse dich etwas kürzer (max. 800 Zeichen).');
    const mode = ['full', 'initials', 'anon'].includes(b.author_mode) ? b.author_mode : 'initials';
    // Kategorie-Aufschlüsselung ("Durchbewerten") einsammeln + säubern.
    let ratings = null;
    if (b.ratings && typeof b.ratings === 'object') {
      const o = {};
      for (const k of REVIEW_CATS) {
        const v = Math.round(Number(b.ratings[k]));
        if (v >= 1 && v <= 5) o[k] = v;
      }
      if (Object.keys(o).length) ratings = o;
    }
    // Gesamtnote: ausdrücklich angegeben, sonst Durchschnitt der Kategorien, sonst 5.
    let rating = Number(b.rating);
    if (!(rating >= 1 && rating <= 5) && ratings) {
      const vals = Object.values(ratings);
      rating = vals.reduce((s, x) => s + x, 0) / vals.length;
    }
    rating = Math.max(1, Math.min(5, Math.round(rating || 5)));
    // Foto direkt beim Bewerten hochgeladen? -> Profilfoto setzen und mit anzeigen.
    const uploaded = typeof b.photo === 'string' && validPhoto(b.photo);
    if (uploaded) db.prepare('UPDATE students SET photo=? WHERE id=?').run(b.photo, sess.student_id);
    const wantPhoto = uploaded || b.show_photo === true || b.show_photo === 1 || b.show_photo === '1';
    const showPhoto = (mode !== 'anon' && wantPhoto) ? 1 : 0;
    const st = db.prepare('SELECT id,name,first_name,last_name FROM students WHERE id = ?').get(sess.student_id);
    const authorName = reviewAuthorName(st, mode);
    const ratingsJson = ratings ? JSON.stringify(ratings) : null;
    const existing = db.prepare('SELECT id FROM reviews WHERE student_id = ?').get(sess.student_id);
    if (existing) {
      db.prepare('UPDATE reviews SET rating=?, text=?, author_mode=?, show_photo=?, author_name=?, ratings=?, published=1 WHERE id=?')
        .run(rating, text, mode, showPhoto, authorName, ratingsJson, existing.id);
    } else {
      db.prepare('INSERT INTO reviews(student_id,rating,text,author_mode,show_photo,author_name,ratings,published,created_at) VALUES(?,?,?,?,?,?,?,1,?)')
        .run(sess.student_id, rating, text, mode, showPhoto, authorName, ratingsJson, new Date().toISOString());
    }
    logEvent('info', { actor: 'student', studentId: sess.student_id, detail: `Bewertung abgegeben (${rating}★)` });
    return ok(res, { saved: true });
  }

  // ===== Nachrichten: Fahrschüler <-> Fahrlehrer =====
  if (p === '/api/my/messages' && method === 'GET') {
    if (!requireStudent()) return bad(res, 'Bitte anmelden', 401);
    const rows = db.prepare('SELECT id,sender,body,created_at FROM messages WHERE student_id = ? ORDER BY id').all(sess.student_id);
    // Fahrlehrer-Nachrichten als gelesen markieren
    db.prepare("UPDATE messages SET read_student = 1 WHERE student_id = ? AND sender = 'instructor' AND read_student = 0").run(sess.student_id);
    return ok(res, { messages: rows, instructorName: getSettingRaw('instructor_name') });
  }
  if (p === '/api/my/messages' && method === 'POST') {
    if (!requireStudent()) return bad(res, 'Bitte anmelden', 401);
    const b = await readBody(req);
    const body = String(b.body || '').trim();
    if (!body) return bad(res, 'Bitte etwas schreiben.');
    if (body.length > 2000) return bad(res, 'Nachricht zu lang (max. 2000 Zeichen).');
    db.prepare(`INSERT INTO messages(student_id,sender,body,read_student,read_instructor,created_at)
      VALUES(?,?,?,1,0,?)`).run(sess.student_id, 'student', body, new Date().toISOString());
    const st = db.prepare('SELECT name FROM students WHERE id = ?').get(sess.student_id);
    logEvent('message', { actor: 'student', studentId: sess.student_id, detail: `Neue Nachricht: „${body.slice(0, 80)}"` });
    pushToInstructor(`✉️ Neue Nachricht von ${st?.name || 'einem Fahrschüler'}: ${body.slice(0, 120)}`);
    return ok(res, { sent: true });
  }
  if (p === '/api/my/messages/unread' && method === 'GET') {
    if (!requireStudent()) return bad(res, 'Bitte anmelden', 401);
    const n = db.prepare("SELECT COUNT(*) AS n FROM messages WHERE student_id = ? AND sender = 'instructor' AND read_student = 0").get(sess.student_id).n;
    return ok(res, { unread: n });
  }

  // Abwesenheit des Fahrlehrers (Urlaub / freie Tage) – nur fuer eingeloggte Nutzer
  if (p === '/api/away' && method === 'GET') {
    if (!sess) return bad(res, 'Bitte anmelden', 401);
    const rows = db.prepare(
      "SELECT date,type FROM day_overrides WHERE closed = 1 AND date >= ? ORDER BY date LIMIT 60").all(todayStr());
    return ok(res, { away: rows });
  }

  // Tagesstatus (laeuft planmaessig / Verzoegerung) fuer einen Tag – fuer alle Eingeloggten lesbar.
  if (p === '/api/day-status' && method === 'GET') {
    if (!sess) return bad(res, 'Bitte anmelden', 401);
    const date = url.searchParams.get('date') || todayStr();
    const row = db.prepare('SELECT date,state,minutes,reason,note,updated_at FROM day_status WHERE date=?').get(date) || null;
    return ok(res, { status: row });
  }

  // Benachrichtigungen (Portal-Postfach)
  if (p === '/api/my/notifications' && method === 'GET') {
    if (!requireStudent()) return bad(res, 'Bitte anmelden', 401);
    const rows = db.prepare(
      `SELECT id,kind,message,date,ref_booking_id,read,created_at FROM notifications
       WHERE student_id = ? ORDER BY read, created_at DESC LIMIT 30`).all(sess.student_id);
    const unread = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE student_id = ? AND read = 0').get(sess.student_id).n;
    return ok(res, { notifications: rows, unread });
  }
  if (p === '/api/my/notifications/read' && method === 'POST') {
    if (!requireStudent()) return bad(res, 'Bitte anmelden', 401);
    db.prepare('UPDATE notifications SET read = 1 WHERE student_id = ?').run(sess.student_id);
    return ok(res);
  }

  if (p === '/api/bookings' && method === 'POST') {
    if (!requireStudent() && !requireInstructor()) return bad(res, 'Bitte anmelden', 401);
    const body = await readBody(req);
    return createBooking(res, sess, body);
  }

  // Fahrstunde NACHTRAGEN (Fahrlehrer): eine bereits gefahrene Stunde als "done"
  // eintragen – mit echtem Fahrdatum+Uhrzeit (auch in der Vergangenheit).
  // created_at = jetzt (Eintragedatum), date/start_time = tatsächliches Fahrdatum.
  if (p === '/api/instructor/log-lesson' && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const b = await readBody(req);
    const sid = b.student_id ? Number(b.student_id) : null;
    const date = b.date, start = b.start_time;
    if (!sid) return bad(res, 'Bitte einen Fahrschüler wählen');
    if (!date || !start) return bad(res, 'Bitte Fahrdatum und Uhrzeit angeben');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(start)) return bad(res, 'Datum/Uhrzeit ungültig');
    if (!db.prepare('SELECT 1 FROM students WHERE id=?').get(sid)) return bad(res, 'Fahrschüler nicht gefunden');
    const dur = Math.max(1, Number(b.duration_min) || getSettings().lesson_min);
    const late = Math.max(0, Number(b.late_minutes) || 0);
    const type = ['ueberland', 'autobahn', 'nacht'].includes(b.lesson_type) ? b.lesson_type : 'normal';
    const attended = (b.attended === false || b.attended === 0 || b.attended === '0') ? 0 : 1;
    const gear = ['schalt', 'automatik'].includes(b.gearbox) ? b.gearbox : null;
    const vermerk = b.feedback ? String(b.feedback).trim() : null;
    // Abweichendes fsmanager-Datum (optional): gefahren an X, im fsmanager gefuehrt an Y.
    const invDate = /^\d{4}-\d{2}-\d{2}$/.test(b.invoice_date || '') ? b.invoice_date : null;
    const invTime = /^([01]?\d|2[0-3]):[0-5]\d$/.test(b.invoice_time || '') ? b.invoice_time : null;
    // Nachgetragene, tatsächlich gefahrene Stunden müssen vom Schüler unterschrieben werden.
    const needsSign = attended ? 1 : 0;
    const info = db.prepare(
      `INSERT INTO bookings(student_id,date,start_time,duration_min,status,gearbox,lesson_type,late_minutes,attended,feedback,confirmed,needs_sign,invoice_date,invoice_time,created_at)
       VALUES(?,?,?,?,'done',?,?,?,?,?,1,?,?,?,?)`
    ).run(sid, date, start, dur, gear, type, late, attended, vermerk, needsSign, invDate, invTime, new Date().toISOString());
    const bid = Number(info.lastInsertRowid);
    const typeLbl = { ueberland: 'Überland', autobahn: 'Autobahn', nacht: 'Nachtfahrt' }[type];
    const detail = attended
      ? `nachgetragen: ${wdShort(date)} ${dmy(date)} ${start} Uhr (${dur} Min${late ? `, ${late} Min zu spät` : ''})${typeLbl ? ' – ' + typeLbl : ''}${vermerk ? ' – ' + vermerk : ''}`
      : `nachgetragen (nicht erschienen): ${wdShort(date)} ${dmy(date)} ${start} Uhr${vermerk ? ' – ' + vermerk : ''}`;
    logEvent(attended ? 'done' : 'noshow', { actor: 'instructor', studentId: sid, bookingId: bid, date, detail });
    // Benachrichtigung an den Schüler: bitte unterschreiben (Push + in der App).
    if (needsSign) notify(sid, 'sign',
      `✍️ Bitte bestätige deine Fahrstunde vom ${wdShort(date)} ${dmy(date)} um ${start} Uhr (${dur} Min)${vermerk ? ` – ${vermerk}` : ''}.`, date, bid);
    else if (vermerk) notify(sid, 'info',
      `📝 Fahrstunde nachgetragen (${wdShort(date)} ${dmy(date)} ${start} Uhr): ${vermerk}`, date, bid);
    return ok(res, { id: bid });
  }

  // Sammel-Import bestehender Termine (Fahrlehrer). Zwei Schritte:
  //   commit:false  -> Vorschau (nichts wird gespeichert, nur geprueft)
  //   commit:true   -> die gueltigen Zeilen werden angelegt
  if (p === '/api/instructor/bookings/bulk' && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer darf das', 403);
    const body = await readBody(req);
    return bulkInstructorBookings(res, body);
  }

  // /api/bookings/:id  (DELETE = stornieren, PATCH = aktualisieren)
  const bm = p.match(/^\/api\/bookings\/(\d+)$/);
  if (bm) {
    const id = Number(bm[1]);
    const bk = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    // Nicht vorhanden ODER fremde Buchung eines Schuelers -> identische 404 (keine ID-Enumeration)
    const mayAccess = bk && (requireInstructor() || (requireStudent() && bk.student_id === sess.student_id));
    if (!mayAccess) return bad(res, 'Buchung nicht gefunden', 404);

    if (method === 'DELETE') {
      if (requireInstructor()) {
        const reason = url.searchParams.get('reason');
        db.prepare("UPDATE bookings SET status='cancelled' WHERE id = ?").run(id);
        logEvent('cancel_instr', { actor: 'instructor', studentId: bk.student_id, bookingId: id, date: bk.date,
          detail: `${wdShort(bk.date)} ${dmy(bk.date)} ${bk.start_time} Uhr abgesagt vom Fahrlehrer${reason ? ' – ' + reason : ''}` });
        if (bk.student_id) notify(bk.student_id, 'info',
          `Deine Fahrstunde am ${wdShort(bk.date)} ${dmy(bk.date)} um ${bk.start_time} Uhr wurde vom Fahrlehrer abgesagt${reason ? ' (' + reason + ')' : ''}.`, bk.date);
        const filled = autoFillGapsOnCancel(bk.date);  // Tag lueckenlos halten
        return ok(res, { autofilled: filled });
      }
      if (requireStudent() && bk.student_id === sess.student_id) {
        if (bk.status === 'done') return bad(res, 'Bereits gefahrene Stunden koennen nicht storniert werden');
        const cancelH = Number(getSettingRaw('cancel_hours'));
        const lockH = Number(getSettingRaw('lock_hours'));
        const h = hoursUntil(bk.date, bk.start_time);
        if (h < lockH) {
          return bad(res, `Ab ${lockH} Std. vorher ist der Termin fest gebucht und kann nicht mehr abgesagt werden.`);
        }
        if (h < cancelH) {
          return bad(res, `Kostenfreies Stornieren nur bis ${cancelH} Std. vorher. `
            + `Du kannst die Stunde aber zur Uebernahme anbieten – uebernimmt sie jemand, bist du frei.`);
        }
        db.prepare("UPDATE bookings SET status='cancelled' WHERE id = ?").run(id);
        logEvent('cancel_student', { actor: 'student', studentId: bk.student_id, bookingId: id, date: bk.date,
          detail: `${wdShort(bk.date)} ${dmy(bk.date)} ${bk.start_time} Uhr storniert (rechtzeitig)` });
        const filled = autoFillGapsOnCancel(bk.date);  // Tag lueckenlos halten
        return ok(res, { autofilled: filled });
      }
      return bad(res, 'Keine Berechtigung', 403);
    }

    if (method === 'PATCH') {
      if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer darf das', 403);
      const b = await readBody(req);
      // Verschieben (vorziehen / zurueckziehen) mit Kollisionspruefung
      const newDate = b.date || bk.date;
      const newStart = b.start_time || bk.start_time;
      const newDur = ('duration_min' in b && Number(b.duration_min) > 0) ? Number(b.duration_min) : bk.duration_min;
      if (b.date || b.start_time) {
        const s = getSettings();
        const ns = toMin(newStart), ne = ns + newDur;
        const others = db.prepare("SELECT * FROM bookings WHERE date = ? AND id != ? AND status != 'cancelled'").all(newDate, id);
        for (const o of others) {
          const os = toMin(o.start_time), oe = os + o.duration_min;
          if (overlaps(ns, ne + s.break_min, os, oe + s.break_min))
            return bad(res, 'Verschieben nicht moeglich: kollidiert mit einem anderen Termin (inkl. Pause).');
        }
        for (const bl of db.prepare('SELECT * FROM blocks WHERE date = ?').all(newDate)) {
          if (overlaps(ns, ne, toMin(bl.start_time), toMin(bl.end_time)))
            return bad(res, `Verschieben nicht moeglich: Zeit durch "${bl.title}" belegt.`);
        }
      }
      const fields = [];
      const vals = [];
      if (b.date) { fields.push('date=?'); vals.push(newDate); }
      if (b.start_time) { fields.push('start_time=?'); vals.push(newStart); }
      if (b.status && ['booked', 'done', 'cancelled', 'offered'].includes(b.status)) { fields.push('status=?'); vals.push(b.status); }
      if ('gearbox' in b) { fields.push('gearbox=?'); vals.push(b.gearbox || null); }
      if ('plate' in b) { fields.push('plate=?'); vals.push(b.plate ? String(b.plate).trim() : null); }
      if ('note' in b) { fields.push('note=?'); vals.push(b.note ? String(b.note).trim() : null); }
      if ('reason' in b) { fields.push('reason=?'); vals.push(b.reason ? String(b.reason).trim() : null); }
      if ('feedback' in b) { fields.push('feedback=?'); vals.push(b.feedback ? String(b.feedback).trim() : null); }
      if ('lesson_type' in b) { fields.push('lesson_type=?'); vals.push(['ueberland', 'autobahn', 'nacht', 'normal'].includes(b.lesson_type) ? b.lesson_type : null); }
      if ('meet_label' in b) { fields.push('meet_label=?'); vals.push(b.meet_label ? String(b.meet_label).trim() : null); }
      if ('meet_lat' in b) { fields.push('meet_lat=?'); vals.push(b.meet_lat == null || b.meet_lat === '' ? null : Number(b.meet_lat)); }
      if ('meet_lng' in b) { fields.push('meet_lng=?'); vals.push(b.meet_lng == null || b.meet_lng === '' ? null : Number(b.meet_lng)); }
      if ('attended' in b) { fields.push('attended=?'); vals.push(b.attended == null ? null : (b.attended ? 1 : 0)); }
      if ('late_minutes' in b) { fields.push('late_minutes=?'); vals.push(Math.max(0, Number(b.late_minutes) || 0)); }
      // Abweichendes fsmanager-Datum/-zeit (leer = loeschen)
      if ('invoice_date' in b) { fields.push('invoice_date=?'); vals.push(/^\d{4}-\d{2}-\d{2}$/.test(b.invoice_date || '') ? b.invoice_date : null); }
      if ('invoice_time' in b) { fields.push('invoice_time=?'); vals.push(/^([01]?\d|2[0-3]):[0-5]\d$/.test(b.invoice_time || '') ? b.invoice_time : null); }
      if ('duration_min' in b && Number(b.duration_min) > 0) { fields.push('duration_min=?'); vals.push(newDur); }
      // curriculum/request_sign duerfen auch allein kommen (ohne weitere Felder).
      if (!fields.length && !Array.isArray(b.curriculum) && !b.request_sign) return bad(res, 'Nichts zu aendern');
      if (fields.length) { vals.push(id); db.prepare(`UPDATE bookings SET ${fields.join(',')} WHERE id = ?`).run(...vals); }

      // Beim Abschließen die tatsächliche Endzeit festhalten (echter Zeitpunkt).
      // started_at kommt – falls genutzt – vom Timer; wir leiten hier NICHTS ab
      // (Zeitzonen-Falle). Fürs Protokoll zählt sonst das geplante Zeitfenster.
      if (b.status === 'done') {
        const f0 = db.prepare('SELECT ended_at FROM bookings WHERE id=?').get(id);
        if (!f0.ended_at) db.prepare('UPDATE bookings SET ended_at=? WHERE id=?').run(new Date().toISOString(), id);
      }
      // An diesem Tag behandelte Ausbildungs-Themen protokollieren (mit Fahrdatum in der Karte).
      // Format je Punkt: { k:'grundfahr:4', s:'geuebt'|'mehr'|'ok' } – s = Stand nach dieser Stunde.
      // Abwaertskompatibel: reine Strings werden als { k, s:'geuebt' } uebernommen.
      if (Array.isArray(b.curriculum) && bk.student_id) {
        const valid = /^[a-z]+:\d+$/;
        const st3 = new Set(['geuebt', 'mehr', 'ok']);
        const seen = new Set();
        const items = [];
        for (const raw of b.curriculum) {
          const k = typeof raw === 'string' ? raw : (raw && typeof raw.k === 'string' ? raw.k : null);
          if (!k || !valid.test(k) || seen.has(k)) continue;
          let s = (raw && typeof raw === 'object' && typeof raw.s === 'string') ? raw.s : 'geuebt';
          if (!st3.has(s)) s = 'geuebt';
          seen.add(k); items.push({ k, s });
          if (items.length >= 300) break;
        }
        db.prepare('UPDATE bookings SET curriculum=? WHERE id=?').run(JSON.stringify(items), id);
        if (items.length) {
          const stu = db.prepare('SELECT training FROM students WHERE id=?').get(bk.student_id);
          let tr = {}; try { tr = stu && stu.training ? JSON.parse(stu.training) : {}; } catch {}
          const ds = b.date || bk.date;
          const tsMs = Date.parse(ds + 'T12:00:00') || Date.now();
          for (const it of items) { if (!tr[it.k]) tr[it.k] = tsMs; }   // vorhandene Daten nicht überschreiben
          db.prepare('UPDATE students SET training=? WHERE id=?').run(JSON.stringify(tr), bk.student_id);
        }
      }
      // Beim Abschließen optional Unterschrift anfordern (Push ins Postfach).
      if (b.request_sign && bk.student_id) {
        const fr = db.prepare('SELECT status,attended,signed_at,date,start_time,duration_min,feedback FROM bookings WHERE id=?').get(id);
        if (fr.status === 'done' && fr.attended !== 0 && !fr.signed_at) {
          db.prepare('UPDATE bookings SET needs_sign=1 WHERE id=?').run(id);
          notify(bk.student_id, 'sign',
            `✍️ Bitte bestätige deine Fahrstunde vom ${wdShort(fr.date)} ${dmy(fr.date)} um ${fr.start_time} Uhr (${fr.duration_min} Min)${fr.feedback ? ` – ${fr.feedback}` : ''}.`, fr.date, id);
        }
      }
      // Rückmeldung/Vermerk an den Schüler (nur wenn neu/geändert und nicht leer)
      if ('feedback' in b && String(b.feedback || '').trim()
          && String(b.feedback).trim() !== String(bk.feedback || '').trim() && bk.student_id) {
        notify(bk.student_id, 'info',
          `📝 Rückmeldung zu deiner Fahrstunde am ${wdShort(bk.date)} ${dmy(bk.date)}: ${String(b.feedback).trim()}`, bk.date, id);
      }

      // Protokoll: Verschieben / Abschluss
      if ((b.date && newDate !== bk.date) || (b.start_time && newStart !== bk.start_time)) {
        logEvent('shift', { actor: 'instructor', studentId: bk.student_id, bookingId: id, date: newDate,
          detail: `verschoben: ${wdShort(bk.date)} ${dmy(bk.date)} ${bk.start_time} → ${wdShort(newDate)} ${dmy(newDate)} ${newStart} Uhr` });
        if (bk.student_id) notify(bk.student_id, 'shift',
          `Dein Termin wurde auf ${wdShort(newDate)} ${dmy(newDate)} ${newStart} Uhr verschoben.`, newDate, id);
      }
      if (b.status === 'done' || b.status === 'cancelled' || 'attended' in b) {
        const fresh = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
        const who = fresh.student_id ? '' : (fresh.title ? fresh.title + ' – ' : '');
        if (fresh.status === 'done' && fresh.attended === 0) {
          logEvent('noshow', { actor: 'instructor', studentId: fresh.student_id, bookingId: id, date: fresh.date,
            detail: `${who}nicht erschienen am ${wdShort(fresh.date)} ${dmy(fresh.date)} ${fresh.start_time}${fresh.reason ? ' – ' + fresh.reason : ''}` });
        } else if (fresh.status === 'done') {
          const car = fresh.gearbox === 'schalt' ? 'Schalter' : fresh.gearbox === 'automatik' ? 'Automatik' : '–';
          const typeLabel = { ueberland: 'Überland', autobahn: 'Autobahn', nacht: 'Nachtfahrt' }[fresh.lesson_type];
          logEvent('done', { actor: 'instructor', studentId: fresh.student_id, bookingId: id, date: fresh.date,
            detail: `${who}gefahren ${wdShort(fresh.date)} ${dmy(fresh.date)} ${fresh.start_time} · ${fresh.duration_min} Min · ${car}${typeLabel ? ' · ' + typeLabel : ''}${fresh.plate ? ' · ' + fresh.plate : ''}${fresh.late_minutes ? ' · ' + fresh.late_minutes + ' Min zu spät' : ''}` });
        }
      }
      return ok(res, { booking: db.prepare('SELECT * FROM bookings WHERE id = ?').get(id) });
    }
  }

  // ===== Uebernahme-Marktplatz (Fahrstunde tauschen) =====
  // Eigene Stunde zur Uebernahme anbieten
  const offm = p.match(/^\/api\/bookings\/(\d+)\/offer$/);
  if (offm && method === 'POST') {
    if (!requireStudent()) return bad(res, 'Bitte anmelden', 401);
    const bk = db.prepare('SELECT * FROM bookings WHERE id = ?').get(Number(offm[1]));
    if (!bk || bk.student_id !== sess.student_id) return bad(res, 'Keine Berechtigung', 403);
    if (bk.status !== 'booked') return bad(res, 'Nur gebuchte Stunden koennen angeboten werden');
    const lockH = Number(getSettingRaw('lock_hours'));
    if (hoursUntil(bk.date, bk.start_time) < lockH)
      return bad(res, `Ab ${lockH} Std. vorher steht der Termin fest und kann nicht mehr abgegeben werden.`);
    const oBody = await readBody(req);
    const named = oBody && oBody.named ? 1 : 0; // freiwillig: Vorname im Feed zeigen
    db.prepare("UPDATE bookings SET status='offered', offer_named=? WHERE id = ?").run(named, bk.id);
    db.prepare('DELETE FROM offer_declines WHERE booking_id = ?').run(bk.id); // frische Runde
    // andere Schueler informieren (mit Vorname nur, wenn der Anbieter das wollte)
    const who = named ? (db.prepare('SELECT name FROM students WHERE id=?').get(bk.student_id)?.name || '').split(' ')[0] : '';
    const msg = who
      ? `${who} gibt eine Fahrstunde am ${wdShort(bk.date)} ${dmy(bk.date)} um ${bk.start_time} Uhr ab – möchtest du sie übernehmen?`
      : `Eine Fahrstunde am ${wdShort(bk.date)} ${dmy(bk.date)} um ${bk.start_time} Uhr ist frei geworden – möchtest du sie übernehmen?`;
    for (const sid of otherStudentIds(sess.student_id)) notify(sid, 'offer', msg, bk.date, bk.id);
    logEvent('offer', { actor: 'student', studentId: bk.student_id, bookingId: bk.id, date: bk.date,
      detail: `zur Übernahme angeboten: ${wdShort(bk.date)} ${dmy(bk.date)} ${bk.start_time} Uhr` });
    return ok(res);
  }
  // Angebot zuruecknehmen
  const wdm = p.match(/^\/api\/bookings\/(\d+)\/withdraw$/);
  if (wdm && method === 'POST') {
    if (!requireStudent()) return bad(res, 'Bitte anmelden', 401);
    const bk = db.prepare('SELECT * FROM bookings WHERE id = ?').get(Number(wdm[1]));
    if (!bk || bk.student_id !== sess.student_id) return bad(res, 'Keine Berechtigung', 403);
    if (bk.status !== 'offered') return bad(res, 'Diese Stunde ist nicht angeboten');
    db.prepare("UPDATE bookings SET status='booked' WHERE id = ?").run(bk.id);
    db.prepare('DELETE FROM offer_declines WHERE booking_id = ?').run(bk.id);
    return ok(res);
  }
  // "Keine Zeit" auf ein Angebot – wenn alle ablehnen, geht die Stunde zurueck an den Anbieter
  const decm = p.match(/^\/api\/bookings\/(\d+)\/decline$/);
  if (decm && method === 'POST') {
    if (!requireStudent()) return bad(res, 'Bitte anmelden', 401);
    const bk = db.prepare('SELECT * FROM bookings WHERE id = ?').get(Number(decm[1]));
    if (!bk || bk.status !== 'offered') return bad(res, 'Diese Stunde ist nicht mehr verfuegbar');
    if (bk.student_id === sess.student_id) return bad(res, 'Das ist deine eigene Stunde');
    db.prepare('INSERT OR IGNORE INTO offer_declines(booking_id,student_id) VALUES(?,?)').run(bk.id, sess.student_id);
    // Haben ALLE anderen abgelehnt? -> Stunde bleibt beim Anbieter (zahlungspflichtig)
    const others = otherStudentIds(bk.student_id);
    const declined = db.prepare('SELECT COUNT(*) AS n FROM offer_declines WHERE booking_id = ?').get(bk.id).n;
    if (others.length > 0 && declined >= others.length) {
      db.prepare("UPDATE bookings SET status='booked' WHERE id = ?").run(bk.id);
      db.prepare('DELETE FROM offer_declines WHERE booking_id = ?').run(bk.id);
      notify(bk.student_id, 'info',
        `Niemand konnte deine Fahrstunde am ${wdShort(bk.date)} ${dmy(bk.date)} um ${bk.start_time} Uhr übernehmen. Sie bleibt fest bei dir (zahlungspflichtig).`, bk.date, bk.id);
      logEvent('info', { actor: 'system', studentId: bk.student_id, bookingId: bk.id, date: bk.date,
        detail: `Angebot ${wdShort(bk.date)} ${dmy(bk.date)} ${bk.start_time} – alle haben abgelehnt, bleibt beim Schüler` });
    }
    return ok(res, { closed: others.length > 0 && declined >= others.length });
  }
  // Angebotene Stunden anderer Schueler ansehen (ohne die bereits abgelehnten)
  if (p === '/api/offers' && method === 'GET') {
    if (!requireStudent()) return bad(res, 'Bitte anmelden', 401);
    const rows = db.prepare(
      `SELECT b.id,b.date,b.start_time,b.duration_min,b.offer_named,s.name AS sname
       FROM bookings b LEFT JOIN students s ON s.id = b.student_id
       WHERE b.status='offered' AND b.student_id != ? AND b.date >= ?
         AND b.id NOT IN (SELECT booking_id FROM offer_declines WHERE student_id = ?)
       ORDER BY b.date, b.start_time`).all(sess.student_id, todayStr(), sess.student_id);
    // Datenschutz: Vorname nur, wenn der Anbieter ihn freigegeben hat. Nie Fotos/Nachname.
    const offers = rows.filter((r) => hoursUntil(r.date, r.start_time) > 0)
      .map((r) => ({ id: r.id, date: r.date, start_time: r.start_time, duration_min: r.duration_min,
        from: r.offer_named ? (r.sname || '').split(' ')[0] : null }));
    return ok(res, { offers });
  }
  // Angebotene Stunde uebernehmen
  const tkm = p.match(/^\/api\/bookings\/(\d+)\/take$/);
  if (tkm && method === 'POST') {
    if (!requireStudent()) return bad(res, 'Bitte anmelden', 401);
    const bk = db.prepare('SELECT * FROM bookings WHERE id = ?').get(Number(tkm[1]));
    if (!bk || bk.status !== 'offered') return bad(res, 'Diese Stunde ist nicht mehr verfuegbar');
    if (bk.student_id === sess.student_id) return bad(res, 'Das ist deine eigene Stunde');
    if (hoursUntil(bk.date, bk.start_time) <= 0) return bad(res, 'Termin liegt in der Vergangenheit');
    const s = getSettings();
    // Wochenlimit des Uebernehmers pruefen
    const wi = weekInfoForStudent(sess.student_id, bk.date);
    if (wi.remaining <= 0) return bad(res, `Du hast diese Woche schon ${wi.max} Fahrstunden.`);
    // Zeitkonflikt beim Uebernehmer?
    const mine = db.prepare("SELECT * FROM bookings WHERE student_id = ? AND date = ? AND status != 'cancelled'").all(sess.student_id, bk.date);
    const ns = toMin(bk.start_time), ne = ns + bk.duration_min;
    for (const m of mine) {
      const ms = toMin(m.start_time), me = ms + m.duration_min;
      if (overlaps(ns, ne + s.break_min, ms, me + s.break_min))
        return bad(res, 'Du hast an dem Tag schon einen Termin zu dieser Zeit.');
    }
    // Beim Uebernehmen persoenliche Daten des Vorbesitzers entfernen (Treffpunkt/Notiz)
    // -> sonst saehe der Uebernehmer ueber /api/my/live bzw. /api/my/bookings dessen Adresse.
    db.prepare("UPDATE bookings SET student_id = ?, status='booked', meet_label=NULL, meet_lat=NULL, meet_lng=NULL, note=NULL WHERE id = ?")
      .run(sess.student_id, bk.id);
    db.prepare('DELETE FROM offer_declines WHERE booking_id = ?').run(bk.id);
    // urspruenglichen Schueler informieren, dass er frei ist (anonym, wenn aktiviert)
    const taker = db.prepare('SELECT name FROM students WHERE id = ?').get(sess.student_id);
    const anon = getSettingRaw('anonymous_swaps') === '1';
    const byWhom = anon ? 'von einem anderen Fahrschüler' : `von ${taker?.name || 'jemandem'}`;
    notify(bk.student_id, 'info', `Deine angebotene Fahrstunde am ${dmy(bk.date)} um ${bk.start_time} Uhr wurde ${byWhom} übernommen – du bist frei.`, bk.date);
    // Protokoll (nur der Fahrlehrer) enthaelt zur Nachvollziehbarkeit die Namen
    const from = db.prepare('SELECT name FROM students WHERE id = ?').get(bk.student_id);
    logEvent('take', { actor: 'student', studentId: sess.student_id, bookingId: bk.id, date: bk.date,
      detail: `${taker?.name || '?'} übernimmt Stunde von ${from?.name || '?'} · ${wdShort(bk.date)} ${dmy(bk.date)} ${bk.start_time} Uhr` });
    return ok(res);
  }

  // Schueler bestaetigt einen reservierten Termin (den der Fahrlehrer eingetragen hat)
  const confm = p.match(/^\/api\/bookings\/(\d+)\/confirm$/);
  if (confm && method === 'POST') {
    if (!requireStudent()) return bad(res, 'Bitte anmelden', 401);
    const bk = db.prepare('SELECT * FROM bookings WHERE id=?').get(Number(confm[1]));
    if (!bk || bk.student_id !== sess.student_id) return bad(res, 'Buchung nicht gefunden', 404);
    if (bk.status === 'cancelled') return bad(res, 'Dieser Termin ist storniert');
    db.prepare('UPDATE bookings SET confirmed=1 WHERE id=?').run(bk.id);
    logEvent('confirm', { actor: 'student', studentId: bk.student_id, bookingId: bk.id, date: bk.date,
      detail: `${wdShort(bk.date)} ${dmy(bk.date)} ${bk.start_time} Uhr bestätigt` });
    const stC = db.prepare('SELECT name FROM students WHERE id=?').get(bk.student_id);
    pushToInstructor(`✅ ${stC?.name || 'Ein Fahrschüler'} hat den Termin ${wdShort(bk.date)} ${dmy(bk.date)} ${bk.start_time} Uhr zugesagt.`);
    return ok(res);
  }

  // Schueler LEHNT einen reservierten Termin AB (den der Fahrlehrer eingetragen hat).
  // Nur solange noch nicht bestaetigt – ein Termin, den der Schueler nie selbst
  // zugesagt hat, darf jederzeit abgelehnt werden (unabhaengig von der Storno-Frist).
  const rejm = p.match(/^\/api\/bookings\/(\d+)\/reject$/);
  if (rejm && method === 'POST') {
    if (!requireStudent()) return bad(res, 'Bitte anmelden', 401);
    const bk = db.prepare('SELECT * FROM bookings WHERE id=?').get(Number(rejm[1]));
    if (!bk || bk.student_id !== sess.student_id) return bad(res, 'Buchung nicht gefunden', 404);
    if (bk.status === 'cancelled') return bad(res, 'Dieser Termin ist bereits storniert');
    if (bk.confirmed === 1) return bad(res, 'Diesen Termin hast du schon zugesagt. Für eine Absage bitte stornieren oder ins Angebot geben.');
    db.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(bk.id);
    logEvent('reject', { actor: 'student', studentId: bk.student_id, bookingId: bk.id, date: bk.date,
      detail: `${wdShort(bk.date)} ${dmy(bk.date)} ${bk.start_time} Uhr abgelehnt` });
    const stR = db.prepare('SELECT name FROM students WHERE id=?').get(bk.student_id);
    pushToInstructor(`🚫 ${stR?.name || 'Ein Fahrschüler'} hat den reservierten Termin ${wdShort(bk.date)} ${dmy(bk.date)} ${bk.start_time} Uhr abgelehnt. Der Slot ist wieder frei.`);
    return ok(res);
  }

  // Fahrstunden-Timer: "Start" druecken, wenn die Stunde beginnt (Schueler oder Fahrlehrer).
  // Zaehlt danach die Fahrzeit herunter. reset:true macht einen Fehlklick rueckgaengig.
  const startm = p.match(/^\/api\/bookings\/(\d+)\/start$/);
  if (startm && method === 'POST') {
    if (!requireStudent() && !requireInstructor()) return bad(res, 'Bitte anmelden', 401);
    const bk = db.prepare('SELECT * FROM bookings WHERE id=?').get(Number(startm[1]));
    if (!bk) return bad(res, 'Buchung nicht gefunden', 404);
    if (requireStudent() && bk.student_id !== sess.student_id) return bad(res, 'Keine Berechtigung', 403);
    const b = await readBody(req);
    if (b && b.reset) {
      db.prepare('UPDATE bookings SET started_at=NULL WHERE id=?').run(bk.id);
      return ok(res, { started_at: null, duration_min: bk.duration_min });
    }
    if (!bk.started_at) db.prepare('UPDATE bookings SET started_at=? WHERE id=?').run(new Date().toISOString(), bk.id);
    const fresh = db.prepare('SELECT started_at,duration_min FROM bookings WHERE id=?').get(bk.id);
    return ok(res, fresh);
  }

  // ===== FAHRLEHRER =====
  // KI-Planer: Terminvorschlaege aus Verfuegbarkeit + freien Slots (nichts wird gespeichert).
  if (p === '/api/instructor/plan' && method === 'GET') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const from = url.searchParams.get('from') || addDays(todayStr(), 1);
    let to = url.searchParams.get('to') || addDays(from, 13);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return bad(res, 'Zeitraum ungültig');
    if (to < from) to = from;
    if (to > addDays(from, 34)) to = addDays(from, 34); // Zeitraum deckeln (max. 5 Wochen)
    const sidParam = url.searchParams.get('student_id');
    const studentIds = sidParam ? [Number(sidParam)] : null;
    const suggestions = planSuggestions({ from, to, studentIds });
    // Wie viele aktive Schueler haben ueberhaupt eine Verfuegbarkeit hinterlegt?
    const withAvail = db.prepare("SELECT COUNT(*) AS n FROM students WHERE archived_at IS NULL AND availability IS NOT NULL AND availability <> '' AND availability <> '{}'").get().n;
    return ok(res, { from, to, suggestions, students_with_availability: withAvail });
  }
  // KI-Planer: ausgewaehlte Vorschlaege als reservierte Termine uebernehmen.
  if (p === '/api/instructor/plan/apply' && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const b = await readBody(req);
    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) return bad(res, 'Keine Vorschläge ausgewählt');
    let created = 0; const results = [];
    for (const it of items) {
      const sid = Number(it.student_id);
      const date = it.date, start = it.start_time;
      const dur = Math.max(1, Number(it.duration_min) || getSettings().lesson_min);
      if (!sid || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{1,2}:\d{2}$/.test(start || '')) { results.push({ ...it, error: 'ungültig' }); continue; }
      if (date < todayStr() || (date === todayStr() && toMin(start) <= toMin(nowHHMM()))) { results.push({ ...it, error: 'liegt in der Vergangenheit' }); continue; }
      if (!db.prepare('SELECT 1 FROM students WHERE id=? AND archived_at IS NULL').get(sid)) { results.push({ ...it, error: 'Fahrschüler nicht gefunden' }); continue; }
      const r = reserveForStudent(sid, date, start, dur);
      if (r.error) results.push({ ...it, error: r.error }); else { created++; results.push({ ...it, id: r.id }); }
    }
    return ok(res, { created, results });
  }

  // Auslastung & freie Zeiten je Tag: wie viel ist gebucht, wie viel Platz ist noch.
  // Rein informativ, damit der Fahrlehrer sieht, wo er noch Stunden legen kann.
  if (p === '/api/instructor/capacity' && method === 'GET') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const from = url.searchParams.get('from') || todayStr();
    let to = url.searchParams.get('to') || addDays(from, 13);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return bad(res, 'Zeitraum ungültig');
    if (to < from) to = from;
    if (to > addDays(from, 41)) to = addDays(from, 41);
    const s = getSettings();
    const unit = s.lesson_min + s.break_min;
    const workdays = getSettingRaw('workdays').split(',').map(Number);
    const days = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const ov = getOverride(d);
      if (ov && ov.closed) { days.push({ date: d, weekday: wdShort(d), closed: true, type: ov.type || 'free' }); continue; }
      if (!workdays.includes(isoDow(d))) continue; // regulaerer Ruhetag -> nicht auflisten
      const f = dayFrame(d);
      const winStart = f.dayStart, winEnd = f.workEnd, total = Math.max(0, winEnd - winStart);
      let occ = 0;
      for (const b of db.prepare("SELECT start_time,duration_min FROM bookings WHERE date=? AND status!='cancelled'").all(d)) {
        const bs = toMin(b.start_time), be = bs + b.duration_min;
        occ += Math.max(0, Math.min(be, winEnd) - Math.max(bs, winStart));
      }
      for (const bl of db.prepare('SELECT start_time,end_time FROM blocks WHERE date=?').all(d)) {
        const bs = toMin(bl.start_time), be = toMin(bl.end_time);
        occ += Math.max(0, Math.min(be, winEnd) - Math.max(bs, winStart));
      }
      occ = Math.min(occ, total);
      const free = Math.max(0, total - occ);
      const bookedCount = db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE date=? AND status!='cancelled' AND student_id IS NOT NULL").get(d).n;
      days.push({ date: d, weekday: wdShort(d), closed: false, total, occ, free, freeLessons: Math.floor(free / unit), bookedCount });
    }
    return ok(res, { from, to, unit, lessonMin: s.lesson_min, days });
  }

  if (p === '/api/instructor/overview' && method === 'GET') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const from = url.searchParams.get('from') || todayStr();
    const to = url.searchParams.get('to') || addDays(from, 6);
    const rows = db.prepare(
      `SELECT b.*, s.name AS student_name, s.phone AS student_phone
       FROM bookings b LEFT JOIN students s ON s.id = b.student_id
       WHERE b.date BETWEEN ? AND ? AND b.status != 'cancelled'
       ORDER BY b.date, b.start_time`
    ).all(from, to);
    const blocks = db.prepare('SELECT * FROM blocks WHERE date BETWEEN ? AND ? ORDER BY date, start_time').all(from, to);
    const overrides = db.prepare('SELECT * FROM day_overrides WHERE date BETWEEN ? AND ?').all(from, to);
    return ok(res, { from, to, bookings: rows, blocks, overrides });
  }

  if (p === '/api/instructor/stats' && method === 'GET') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const ref = url.searchParams.get('date') || todayStr();
    return ok(res, statsFor(ref));
  }

  // Protokoll / Fahrlehrer-Benachrichtigungen (Ereignis-Log)
  if (p === '/api/instructor/events' && method === 'GET') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const sid = url.searchParams.get('student_id');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const cond = [], args = [];
    if (sid) { cond.push('student_id = ?'); args.push(Number(sid)); }
    if (from) { cond.push('at >= ?'); args.push(from + 'T00:00:00'); }
    if (to) { cond.push('at <= ?'); args.push(to + 'T23:59:59'); }
    const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
    const rows = db.prepare(`SELECT * FROM events ${where} ORDER BY at DESC LIMIT 300`).all(...args);
    const unseen = db.prepare('SELECT COUNT(*) AS n FROM events WHERE seen = 0').get().n;
    return ok(res, { events: rows, unseen });
  }
  if (p === '/api/instructor/events/seen' && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    db.prepare('UPDATE events SET seen = 1 WHERE seen = 0').run();
    return ok(res);
  }

  // Verspaetungs-Kette: "Ich komme X Min spaeter" -> alle Folgetermine heute nachruecken
  if (p === '/api/instructor/delay-today' && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const b = await readBody(req);
    const mins = Math.max(1, Number(b.minutes) || 0);
    const date = b.date || todayStr();
    const nowM = date === todayStr() ? toMin(nowHHMM()) : -1;
    // betroffen: heutige, noch nicht begonnene, gebuchte Stunden
    const rows = db.prepare("SELECT * FROM bookings WHERE date = ? AND status IN ('booked','offered') ORDER BY start_time").all(date)
      .filter((r) => toMin(r.start_time) >= nowM);
    let moved = 0;
    for (const r of rows) {
      const nt = toHHMM(toMin(r.start_time) + mins);
      db.prepare('UPDATE bookings SET start_time = ?, delay_min = delay_min + ? WHERE id = ?').run(nt, mins, r.id);
      moved++;
      if (r.student_id) {
        notify(r.student_id, 'shift', `Der Fahrlehrer verspätet sich um ${mins} Min. Dein Termin verschiebt sich auf ${nt} Uhr.`, date, r.id);
        logEvent('delay', { actor: 'instructor', studentId: r.student_id, bookingId: r.id, date,
          detail: `Verspätung ${mins} Min: ${r.start_time} → ${nt} Uhr` });
      }
    }
    return ok(res, { moved, minutes: mins });
  }

  // Tagesstatus setzen: "laeuft planmaessig" oder Verzoegerung mit Grund. Die
  // Fahrschueler mit einem Termin an dem Tag werden benachrichtigt (Push + Postfach).
  if (p === '/api/instructor/day-status' && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const b = await readBody(req);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : todayStr();
    const state = b.state === 'delay' ? 'delay' : 'ok';
    const REASONS = { rush: '🚗 Berufsverkehr', jam: '🚧 Stau', snow: '❄️ Schnee', ice: '🧊 Glatteis', weather: '🌧️ Witterung', other: '⏳ Grund' };
    const reason = state === 'delay' && b.reason in REASONS ? b.reason : null;
    const minutes = state === 'delay' ? Math.max(0, Math.min(240, Math.round(Number(b.minutes) || 0))) : 0;
    const note = b.note ? String(b.note).trim().slice(0, 200) : null;
    db.prepare(`INSERT INTO day_status(date,state,minutes,reason,note,updated_at)
      VALUES(?,?,?,?,?,?)
      ON CONFLICT(date) DO UPDATE SET state=excluded.state, minutes=excluded.minutes, reason=excluded.reason, note=excluded.note, updated_at=excluded.updated_at`)
      .run(date, state, minutes, reason, note, new Date().toISOString());
    // Betroffene Schueler (Termin an dem Tag, nicht storniert) benachrichtigen.
    const studs = db.prepare("SELECT DISTINCT student_id FROM bookings WHERE date=? AND student_id IS NOT NULL AND status NOT IN ('cancelled')").all(date).map((r) => r.student_id);
    const rlabel = reason ? REASONS[reason] : '';
    let msg;
    if (state === 'delay') {
      msg = `⏳ Heute läuft es etwas später: dein Fahrlehrer meldet ca. ${minutes} Min Verzögerung${rlabel ? ' wegen ' + rlabel : ''}.${note ? ' ' + note : ''} Deine Uhrzeit bleibt – bitte trotzdem pünktlich da sein, es kann sich kurzfristig ändern.`;
    } else {
      msg = `✅ Heute läuft alles planmäßig. Bis später!`;
    }
    for (const sid of studs) notify(sid, 'daystatus', msg, date, null);
    logEvent('daystatus', { actor: 'instructor', date,
      detail: state === 'delay' ? `Verzögerung ~${minutes} Min${rlabel ? ' – ' + rlabel : ''}${note ? ' – ' + note : ''}` : 'Läuft planmäßig' });
    return ok(res, { ok: true, notified: studs.length });
  }

  // Wetter-Hinweis fuer den Tag (Glatteis/Schnee/Regen) – als Vorschlag fuer den Tagesstatus.
  if (p === '/api/instructor/weather-hint' && method === 'GET') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date') || '') ? url.searchParams.get('date') : todayStr();
    const hint = await weatherHintFor(date);
    return ok(res, { hint });
  }

  // Erinnerungen jetzt pruefen/versenden (laeuft auch automatisch im Hintergrund)
  if (p === '/api/instructor/run-reminders' && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    return ok(res, { sent: sendDueReminders() });
  }

  // ===== Live-Standort =====
  // Fahrlehrer sendet seine aktuelle Position (waehrend die App offen ist)
  if (p === '/api/instructor/location' && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const b = await readBody(req);
    const lat = Number(b.lat), lng = Number(b.lng);
    if (!isFinite(lat) || !isFinite(lng)) return bad(res, 'Ungueltige Koordinaten');
    db.prepare('UPDATE live_location SET lat=?, lng=?, updated_at=?, active=1 WHERE id=1')
      .run(lat, lng, new Date().toISOString());
    return ok(res);
  }
  if (p === '/api/instructor/location/stop' && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    db.prepare('UPDATE live_location SET active=0 WHERE id=1').run();
    return ok(res);
  }
  // "Ich bin in X Min da" – kurze Ankunfts-Ansage an den wartenden Schueler
  if (p === '/api/instructor/eta' && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const b = await readBody(req);
    const mins = Math.max(0, Math.min(180, Math.round(Number(b.minutes) || 0)));
    if (!mins) { db.prepare('UPDATE live_location SET eta_min=NULL, eta_at=NULL WHERE id=1').run(); return ok(res, { cleared: true }); }
    db.prepare('UPDATE live_location SET eta_min=?, eta_at=? WHERE id=1').run(mins, new Date().toISOString());
    return ok(res, { minutes: mins });
  }
  // Fahrlehrer sieht, ob eine Stunde ansteht (fuer den Start-Hinweis)
  if (p === '/api/instructor/live-status' && method === 'GET') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const lead = Number(getSettingRaw('live_lead_min'));
    const soon = db.prepare(
      `SELECT b.*, s.name AS student_name FROM bookings b LEFT JOIN students s ON s.id=b.student_id
       WHERE b.date = ? AND b.status='booked' AND b.student_id IS NOT NULL ORDER BY b.start_time`).all(todayStr())
      .map((b) => ({ ...b, h: hoursUntil(b.date, b.start_time) }))
      .filter((b) => b.h > -0.5 && b.h * 60 <= Math.max(lead, 45))
      .map((b) => {
        const s = db.prepare('SELECT home_label,home_lat,home_lng,live_lat,live_lng,live_at,live_active FROM students WHERE id=?').get(b.student_id) || {};
        const meet = {
          label: b.meet_label || s.home_label || null,
          lat: b.meet_lat != null ? b.meet_lat : (s.home_lat != null ? s.home_lat : null),
          lng: b.meet_lng != null ? b.meet_lng : (s.home_lng != null ? s.home_lng : null),
        };
        let studentLive = null;
        if (s.live_active && s.live_at && (Date.now() - new Date(s.live_at).getTime()) < 3 * 60 * 1000)
          studentLive = { lat: s.live_lat, lng: s.live_lng, updated_at: s.live_at };
        return { id: b.id, student_name: b.student_name, start_time: b.start_time, minutes: Math.round(b.h * 60), meet, studentLive };
      });
    const live = db.prepare('SELECT active,updated_at,eta_min,eta_at FROM live_location WHERE id=1').get();
    let eta = null;
    if (live.eta_min != null && live.eta_at) {
      const ageMin = (Date.now() - new Date(live.eta_at).getTime()) / 60000;
      if (ageMin < 30) eta = { minutes: live.eta_min, remaining: Math.max(0, Math.round(live.eta_min - ageMin)), at: live.eta_at };
    }
    return ok(res, { lead, upcoming: soon, active: !!live.active, eta });
  }

  // Schueler verfolgt den Live-Standort (nur im Zeitfenster vor der eigenen Stunde)
  if (p === '/api/my/live' && method === 'GET') {
    if (!requireStudent()) return bad(res, 'Bitte anmelden', 401);
    const lead = Number(getSettingRaw('live_lead_min'));
    // Abhol-Fenster: bis 45 Min vorher (damit man den Abholort früh setzen kann),
    // bis kurz nach Beginn. Der Fahrlehrer-Standort wird separat nur bei aktivem Teilen gezeigt.
    const winMin = Math.max(lead, 45);
    const statusWin = Math.max(winMin, 90); // schon ~1,5 h vorher den beruhigenden Status zeigen
    const upcoming = db.prepare(
      "SELECT * FROM bookings WHERE student_id=? AND date=? AND status='booked' ORDER BY start_time").all(sess.student_id, todayStr())
      .map((b) => ({ b, h: hoursUntil(b.date, b.start_time) }))
      .filter((x) => x.h > -0.25 && x.h * 60 <= statusWin)
      .sort((a, z) => a.h - z.h)[0];
    if (!upcoming) return ok(res, { window: false });
    const bk = upcoming.b;
    // Treffpunkt: 1. an der Stunde hinterlegt  2. fester Standort des Schuelers  3. globaler Standard
    const home = db.prepare('SELECT home_label,home_lat,home_lng FROM students WHERE id=?').get(bk.student_id) || {};
    const meet = {
      label: bk.meet_label || home.home_label || getSettingRaw('meet_default_label') || null,
      lat: bk.meet_lat != null ? bk.meet_lat : (home.home_lat != null ? home.home_lat : (getSettingRaw('meet_default_lat') ? Number(getSettingRaw('meet_default_lat')) : null)),
      lng: bk.meet_lng != null ? bk.meet_lng : (home.home_lng != null ? home.home_lng : (getSettingRaw('meet_default_lng') ? Number(getSettingRaw('meet_default_lng')) : null)),
    };
    const live = db.prepare('SELECT * FROM live_location WHERE id=1').get();
    const staleMs = live.updated_at ? Date.now() - new Date(live.updated_at).getTime() : Infinity;
    // Datenschutz: laeuft gerade eine ANDERE Fahrstunde, wird der Standort noch nicht
    // geteilt (sonst saehe der naechste Schueler den Aufenthaltsort der vorigen Stunde).
    const nowM = toMin(nowHHMM());
    const otherInProgress = db.prepare(
      "SELECT start_time,duration_min,id FROM bookings WHERE date=? AND status IN ('booked','done','offered')").all(bk.date)
      .some((o) => o.id !== bk.id && toMin(o.start_time) <= nowM && nowM < toMin(o.start_time) + o.duration_min);
    const active = !!live.active && staleMs < 3 * 60 * 1000 && !otherInProgress;
    let distanceKm = null, etaMin = null;
    if (active && meet.lat != null && meet.lng != null) {
      distanceKm = haversineKm(live.lat, live.lng, meet.lat, meet.lng);
      const speed = Math.max(5, Number(getSettingRaw('avg_speed_kmh')) || 30);
      etaMin = Math.max(1, Math.ceil((distanceKm / speed) * 60));
    }
    // Manuelle Ankunfts-Ansage ("Ich bin in X Min da"), solange sie frisch ist
    let announce = null;
    if (live.eta_min != null && live.eta_at) {
      const ageMin = (Date.now() - new Date(live.eta_at).getTime()) / 60000;
      if (ageMin < 30) announce = { minutes: live.eta_min, remaining: Math.max(0, Math.round(live.eta_min - ageMin)), at: live.eta_at };
    }
    const meLive = db.prepare('SELECT live_active FROM students WHERE id=?').get(bk.student_id);
    const minutesToStart = Math.round(upcoming.h * 60);
    // Phase steuert die Anzeige beim Schüler:
    //  soon   = noch früh dran (≈45–90 Min): beruhigender Status + freundliche Standort-Frage
    //  pickup = im Abhol-Fenster, Fahrlehrer teilt aber noch nicht: Abholort setzen/Standort teilen
    //  live   = Fahrlehrer ist unterwegs (Karte)
    const phase = active ? 'live' : (minutesToStart > winMin ? 'soon' : 'pickup');
    // Tagesstatus (laeuft planmaessig / Verzoegerung mit Grund) automatisch mitliefern.
    const ds = db.prepare('SELECT state,minutes,reason,note FROM day_status WHERE date=?').get(bk.date) || null;
    return ok(res, {
      window: true, active, busy: otherInProgress, phase,
      booking: { date: bk.date, start_time: bk.start_time, minutesToStart, delayMin: bk.delay_min || 0 },
      location: active ? { lat: live.lat, lng: live.lng, updated_at: live.updated_at } : null,
      meet, distanceKm, etaMin, lead, announce, dayStatus: ds,
      sharing: !!(meLive && meLive.live_active),
    });
  }

  // Schüler setzt/ändert seinen Abholort für die anstehende Fahrstunde
  if (p === '/api/my/pickup' && method === 'POST') {
    if (!requireStudent()) return bad(res, 'Bitte anmelden', 401);
    const b = await readBody(req);
    const bk = db.prepare("SELECT * FROM bookings WHERE student_id=? AND date=? AND status='booked' ORDER BY start_time")
      .all(sess.student_id, todayStr()).find((x) => hoursUntil(x.date, x.start_time) > -0.25);
    if (!bk) return bad(res, 'Gerade keine anstehende Fahrstunde');
    const label = b.label ? String(b.label).trim() : null;
    const lat = (b.lat == null || b.lat === '') ? null : Number(b.lat);
    const lng = (b.lng == null || b.lng === '') ? null : Number(b.lng);
    db.prepare('UPDATE bookings SET meet_label=?, meet_lat=?, meet_lng=? WHERE id=?').run(label, lat, lng, bk.id);
    return ok(res, { label, lat, lng });
  }
  // Schüler teilt seinen Live-Standort (nur im Abhol-Fenster, auf Tipp)
  if (p === '/api/my/location' && method === 'POST') {
    if (!requireStudent()) return bad(res, 'Bitte anmelden', 401);
    const b = await readBody(req);
    const lat = Number(b.lat), lng = Number(b.lng);
    if (!isFinite(lat) || !isFinite(lng)) return bad(res, 'Ungueltige Koordinaten');
    db.prepare('UPDATE students SET live_lat=?, live_lng=?, live_at=?, live_active=1 WHERE id=?')
      .run(lat, lng, new Date().toISOString(), sess.student_id);
    return ok(res);
  }
  if (p === '/api/my/location/stop' && method === 'POST') {
    if (!requireStudent()) return bad(res, 'Bitte anmelden', 401);
    db.prepare('UPDATE students SET live_active=0 WHERE id=?').run(sess.student_id);
    return ok(res);
  }

  // Schueler aktualisiert eigene Handynummer
  // Eigenes Profil ansehen (nur der Schüler selbst)
  if (p === '/api/my/profile' && method === 'GET') {
    if (!requireStudent()) return bad(res, 'Bitte anmelden', 401);
    const st = db.prepare('SELECT name,email,phone,birth_year,birth_date,street,house_no,zip,city,username,(photo IS NOT NULL) AS has_photo FROM students WHERE id=?').get(sess.student_id);
    return ok(res, { profile: st || {} });
  }
  // Eigenes Profilfoto ausliefern (nur der Schueler selbst)
  if (p === '/api/my/photo' && method === 'GET') {
    if (!requireStudent()) return bad(res, 'Bitte anmelden', 401);
    const r = db.prepare('SELECT photo FROM students WHERE id=?').get(sess.student_id);
    if (!r || !r.photo) { res.writeHead(404); return res.end(); }
    return sendDataUrl(res, r.photo);
  }
  // Profilfoto eines Schuelers – NUR fuer den Fahrlehrer (Datenschutz: Schueler sehen sich nicht)
  const phm = p.match(/^\/api\/students\/(\d+)\/photo$/);
  if (phm && method === 'GET') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const r = db.prepare('SELECT photo FROM students WHERE id=?').get(Number(phm[1]));
    if (!r || !r.photo) { res.writeHead(404); return res.end(); }
    return sendDataUrl(res, r.photo);
  }
  // Eigenes Profil vervollständigen (Name/Telefon/E-Mail/Jahrgang) – nur der Schüler selbst
  if (p === '/api/my/profile' && method === 'PATCH') {
    if (!requireStudent()) return bad(res, 'Bitte anmelden', 401);
    const b = await readBody(req);
    const fields = [], vals = [];
    if ('name' in b) { const nm = String(b.name || '').trim(); if (!nm) return bad(res, 'Name darf nicht leer sein'); fields.push('name=?'); vals.push(nm); }
    if ('phone' in b) { fields.push('phone=?'); vals.push(b.phone ? String(b.phone).trim() : null); }
    if ('email' in b) {
      const em = b.email ? String(b.email).trim() : null;
      if (em && db.prepare('SELECT 1 FROM students WHERE email=? AND id<>?').get(em, sess.student_id)) return bad(res, 'Diese E-Mail ist schon vergeben');
      fields.push('email=?'); vals.push(em);
    }
    if ('birth_year' in b) { fields.push('birth_year=?'); vals.push(b.birth_year ? Number(b.birth_year) : null); }
    if ('birth_date' in b) {
      const bd = b.birth_date ? String(b.birth_date).trim() : null;
      if (bd && !/^\d{4}-\d{2}-\d{2}$/.test(bd)) return bad(res, 'Geburtsdatum ungültig');
      fields.push('birth_date=?'); vals.push(bd);
      if (bd) { fields.push('birth_year=?'); vals.push(Number(bd.slice(0, 4))); }   // Jahrgang mitziehen
    }
    for (const k of ['street', 'house_no', 'zip', 'city']) {
      if (k in b) { fields.push(`${k}=?`); vals.push(b[k] ? String(b[k]).trim() : null); }
    }
    if ('photo' in b) {
      if (b.photo === null || b.photo === '') { fields.push('photo=?'); vals.push(null); }
      else if (validPhoto(b.photo)) { fields.push('photo=?'); vals.push(b.photo); }
      else return bad(res, 'Foto ungültig oder zu groß (bitte ein normales Foto, JPG/PNG).');
    }
    if (fields.length) db.prepare(`UPDATE students SET ${fields.join(', ')} WHERE id=?`).run(...vals, sess.student_id);
    return ok(res);
  }

  // Lücken-Vorschlag: contigierter Tagesplan (Stunden nach vorne ziehen)
  if (p === '/api/instructor/gap-proposal' && method === 'GET') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const date = url.searchParams.get('date') || todayStr();
    return ok(res, packDay(date));
  }
  // Vorschlag anwenden: Stunden verschieben + betroffene Schueler benachrichtigen
  if (p === '/api/instructor/apply-shift' && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const { date } = await readBody(req);
    if (!date) return bad(res, 'Datum noetig');
    if (!packDay(date).hasGap) return bad(res, 'Keine Lücke zu schließen.');
    return ok(res, { moved: applyPack(date, 'Lücke geschlossen') });
  }

  // Termine, die (z.B. nach geänderter Pause/Slot-Dauer) nicht mehr ins Raster passen
  if (p === '/api/instructor/misaligned' && method === 'GET') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    return ok(res, misalignedDays());
  }
  // Kommende Termine ans aktuelle Raster rücken (einen Tag oder alle betroffenen)
  if (p === '/api/instructor/realign' && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const b = await readBody(req);
    const dates = b.date ? [b.date] : misalignedDays().days.map((d) => d.date);
    let moved = 0;
    for (const date of dates) moved += applyPack(date, 'ans neue Raster angepasst');
    return ok(res, { moved, days: dates.length });
  }

  // -- Bewertungen: Moderation durch den Fahrlehrer --
  if (p === '/api/instructor/reviews' && method === 'GET') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const rows = db.prepare(
      `SELECT r.*, s.name AS student_name, s.archived_at
       FROM reviews r LEFT JOIN students s ON s.id = r.student_id
       ORDER BY r.created_at DESC`).all();
    return ok(res, { reviews: rows });
  }
  // Fahrlehrer legt selbst eine Bewertung an (z.B. mündliches Lob / Google-Rezension übertragen)
  if (p === '/api/instructor/reviews' && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const b = await readBody(req);
    const text = String(b.text || '').trim();
    if (text.length < 5) return bad(res, 'Bitte ein paar Worte schreiben.');
    if (text.length > 800) return bad(res, 'Text zu lang (max. 800 Zeichen).');
    const rating = Math.max(1, Math.min(5, Math.round(Number(b.rating) || 5)));
    const author = String(b.author_name || '').trim() || 'Ein Fahrschüler';
    const info = db.prepare(`INSERT INTO reviews(student_id,rating,text,author_mode,show_photo,author_name,published,featured,created_at)
      VALUES(NULL,?,?,?,0,?,1,?,?)`).run(rating, text, 'full', author, b.featured ? 1 : 0, new Date().toISOString());
    logEvent('info', { actor: 'instructor', detail: `Bewertung selbst eingetragen (${rating}★, ${author})` });
    return ok(res, { id: Number(info.lastInsertRowid) });
  }
  const rvm = p.match(/^\/api\/instructor\/reviews\/(\d+)$/);
  if (rvm && method === 'PATCH') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const id = Number(rvm[1]);
    const b = await readBody(req);
    const fields = [], vals = [];
    if ('published' in b) { fields.push('published=?'); vals.push(b.published ? 1 : 0); }
    if ('featured' in b) { fields.push('featured=?'); vals.push(b.featured ? 1 : 0); }
    if ('reply' in b) { fields.push('reply=?'); vals.push(b.reply ? String(b.reply).trim() : null); }
    if ('text' in b) { const t = String(b.text || '').trim(); if (t.length < 5) return bad(res, 'Text zu kurz'); fields.push('text=?'); vals.push(t.slice(0, 800)); }
    if ('rating' in b) { fields.push('rating=?'); vals.push(Math.max(1, Math.min(5, Math.round(Number(b.rating) || 5)))); }
    if (!fields.length) return bad(res, 'Nichts zu aendern');
    vals.push(id);
    db.prepare(`UPDATE reviews SET ${fields.join(', ')} WHERE id=?`).run(...vals);
    return ok(res, { updated: true });
  }
  if (rvm && method === 'DELETE') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    db.prepare('DELETE FROM reviews WHERE id=?').run(Number(rvm[1]));
    return ok(res, { deleted: true });
  }

  // -- Codes --
  if (p === '/api/codes' && method === 'GET') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const rows = db.prepare(
      `SELECT c.code,c.note,c.used,c.created_at,s.name AS student_name
       FROM codes c LEFT JOIN students s ON s.id = c.student_id ORDER BY c.created_at DESC`
    ).all();
    return ok(res, { codes: rows });
  }
  if (p === '/api/codes' && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const { note } = await readBody(req);
    const code = genCode();
    db.prepare('INSERT INTO codes(code,note,created_at) VALUES(?,?,?)').run(code, note ? String(note).trim() : null, new Date().toISOString());
    return ok(res, { code });
  }
  const cm = p.match(/^\/api\/codes\/([A-Z0-9-]+)$/);
  if (cm && method === 'DELETE') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const c = db.prepare('SELECT * FROM codes WHERE code = ?').get(cm[1]);
    if (c && c.used) return bad(res, 'Verwendete Codes koennen nicht geloescht werden');
    db.prepare('DELETE FROM codes WHERE code = ?').run(cm[1]);
    return ok(res);
  }

  // -- Schueler --
  if (p === '/api/students' && method === 'GET') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const archived = url.searchParams.get('scope') === 'archived';
    const rows = db.prepare(
      `SELECT s.id,s.name,s.first_name,s.last_name,s.email,s.phone,s.username,s.birth_year,s.birth_date,
        s.street,s.house_no,s.zip,s.city,s.allowed_durations,s.created_at,
        s.home_label,s.home_lat,s.home_lng,s.travel_min,s.home_base,s.availability,s.archived_at,s.notes,
        (s.photo IS NOT NULL) AS has_photo,
        (SELECT COUNT(*) FROM bookings b WHERE b.student_id=s.id AND b.status='done') AS done_count
       FROM students s WHERE s.archived_at IS ${archived ? 'NOT NULL' : 'NULL'} ORDER BY s.name`
    ).all().map((s) => {
      const adk = adkSummary(s.id); const st = lessonStats(s.id);
      return { ...s, ...studentRank(s.id), sonder: sonderCounts(s.id), travel_est: travelMin(s.id),
        redCount: adk.needWork.length, adkDistinct: adk.distinct, units: st.units, schaltUnits: st.schalt.units };
    });
    const activeCount = db.prepare('SELECT COUNT(*) AS c FROM students WHERE archived_at IS NULL').get().c;
    const archivedCount = db.prepare('SELECT COUNT(*) AS c FROM students WHERE archived_at IS NOT NULL').get().c;
    return ok(res, { students: rows, req: sonderReq(), activeCount, archivedCount, scope: archived ? 'archived' : 'active' });
  }
  // Erlaubte Slot-Laengen eines Schuelers setzen (z.B. 40-Min-Ausnahme)
  const stm = p.match(/^\/api\/students\/(\d+)$/);
  if (stm && method === 'PATCH') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const b = await readBody(req);
    const sid = Number(stm[1]);
    // Stammdaten bearbeiten (Vorname/Nachname bzw. Name / Telefon / E-Mail / Jahrgang / Notiz)
    if ('first_name' in b || 'last_name' in b || 'name' in b || 'phone' in b || 'email' in b || 'birth_year' in b || 'birth_date' in b || 'street' in b || 'house_no' in b || 'zip' in b || 'city' in b || 'notes' in b || 'travel_min' in b || 'availability' in b || 'home_base' in b) {
      const st = db.prepare('SELECT id FROM students WHERE id=?').get(sid);
      if (!st) return bad(res, 'Schueler nicht gefunden', 404);
      const fields = [], vals = [];
      if ('first_name' in b || 'last_name' in b) {
        const first = String(b.first_name || '').trim(), last = String(b.last_name || '').trim();
        const nm = combineName(first, last);
        if (!nm) return bad(res, 'Name darf nicht leer sein');
        fields.push('first_name=?', 'last_name=?', 'name=?'); vals.push(first || null, last || null, nm);
      } else if ('name' in b) { const nm = String(b.name || '').trim(); if (!nm) return bad(res, 'Name darf nicht leer sein'); const sp = splitName(nm); fields.push('name=?', 'first_name=?', 'last_name=?'); vals.push(nm, sp.first || null, sp.last || null); }
      if ('phone' in b) { fields.push('phone=?'); vals.push(b.phone ? String(b.phone).trim() : null); }
      if ('notes' in b) { fields.push('notes=?'); vals.push(b.notes ? String(b.notes).trim() : null); }
      if ('email' in b) {
        const em = b.email ? String(b.email).trim() : null;
        if (em && db.prepare('SELECT 1 FROM students WHERE email=? AND id<>?').get(em, sid)) return bad(res, 'Diese E-Mail ist schon vergeben');
        fields.push('email=?'); vals.push(em);
      }
      if ('birth_year' in b) { fields.push('birth_year=?'); vals.push(b.birth_year ? Number(b.birth_year) : null); }
      if ('birth_date' in b) {
        const bd = b.birth_date ? String(b.birth_date).trim() : null;
        if (bd && !/^\d{4}-\d{2}-\d{2}$/.test(bd)) return bad(res, 'Geburtsdatum ungültig');
        fields.push('birth_date=?'); vals.push(bd);
        if (bd) { fields.push('birth_year=?'); vals.push(Number(bd.slice(0, 4))); }
      }
      for (const k of ['street', 'house_no', 'zip', 'city']) {
        if (k in b) { fields.push(`${k}=?`); vals.push(b[k] ? String(b[k]).trim() : null); }
      }
      // Abholzeit (Minuten): leer/None -> automatisch schaetzen (NULL)
      if ('travel_min' in b) {
        const tv = (b.travel_min === '' || b.travel_min == null) ? null : Math.max(0, Math.round(Number(b.travel_min)));
        fields.push('travel_min=?'); vals.push(Number.isFinite(tv) ? tv : null);
      }
      // Standort fuer die Abholzeit-Schaetzung: '' (auto) | 'main' | 'finow'
      if ('home_base' in b) {
        const hb = ['main', 'finow'].includes(b.home_base) ? b.home_base : null;
        fields.push('home_base=?'); vals.push(hb);
      }
      // Verfuegbarkeit Mo–So als JSON {"mo":[["08:00","12:00"],...],...} – nur gueltige Fenster.
      if ('availability' in b) {
        let av = null;
        const src = b.availability;
        if (src && typeof src === 'object' && !Array.isArray(src)) {
          const re = /^([01]?\d|2[0-3]):[0-5]\d$/;
          const clean = {};
          for (const d of ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so']) {
            const arr = Array.isArray(src[d]) ? src[d] : [];
            const wins = [];
            for (const w of arr) {
              let v, bb, m = 'school', p = '';
              if (Array.isArray(w) && w.length >= 2) { v = w[0]; bb = w[1]; }
              else if (w && typeof w === 'object') { v = w.v; bb = w.b; m = w.m === 'pickup' ? 'pickup' : 'school'; p = w.p ? String(w.p).slice(0, 80).trim() : ''; }
              else continue;
              if (re.test(v) && re.test(bb) && v < bb) wins.push(m === 'pickup' ? { v, b: bb, m, p } : { v, b: bb });
            }
            if (wins.length) clean[d] = wins;
          }
          if (Object.keys(clean).length) av = JSON.stringify(clean);
        }
        fields.push('availability=?'); vals.push(av);
      }
      if (!fields.length) return bad(res, 'Nichts zu aendern');
      db.prepare(`UPDATE students SET ${fields.join(', ')} WHERE id=?`).run(...vals, sid);
      logEvent('info', { actor: 'instructor', studentId: sid, detail: 'Stammdaten bearbeitet' });
      return ok(res, { updated: true });
    }
    // Festen Standort/Treffpunkt setzen (mit dem Schueler abgesprochen)
    if ('home_label' in b || 'home_lat' in b || 'home_lng' in b) {
      const st = db.prepare('SELECT id FROM students WHERE id=?').get(sid);
      if (!st) return bad(res, 'Schueler nicht gefunden', 404);
      const label = b.home_label ? String(b.home_label).trim() : null;
      const lat = b.home_lat == null || b.home_lat === '' ? null : Number(b.home_lat);
      const lng = b.home_lng == null || b.home_lng === '' ? null : Number(b.home_lng);
      db.prepare('UPDATE students SET home_label=?, home_lat=?, home_lng=? WHERE id=?').run(label, lat, lng, sid);
      logEvent('info', { actor: 'instructor', studentId: sid, detail: label ? `Standort gesetzt: ${label}` : 'Standort entfernt' });
      return ok(res, { home_label: label, home_lat: lat, home_lng: lng });
    }
    // Erlaubte Slot-Laengen setzen
    const durs = Array.isArray(b.allowed_durations) ? b.allowed_durations : String(b.allowed_durations || '').split(',');
    const clean = [...new Set(durs.map(Number).filter((n) => n > 0))].sort((a, z) => a - z);
    if (!clean.length) return bad(res, 'Mindestens eine Dauer noetig');
    db.prepare('UPDATE students SET allowed_durations = ? WHERE id = ?').run(clean.join(','), sid);
    return ok(res, { allowed_durations: clean.join(',') });
  }
  // Passwort eines Schuelers zuruecksetzen (Fahrlehrer teilt es dem Schueler mit)
  const rpm = p.match(/^\/api\/students\/(\d+)\/reset-password$/);
  if (rpm && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const b = await readBody(req);
    const pw = String(b.new_password || '').trim();
    const prob = passwordProblem(pw);
    if (prob) return bad(res, 'Passwort braucht ' + prob + '.');
    const st = db.prepare('SELECT id,name FROM students WHERE id = ?').get(Number(rpm[1]));
    if (!st) return bad(res, 'Schueler nicht gefunden', 404);
    db.prepare('UPDATE students SET pass = ? WHERE id = ?').run(hashPassword(pw), st.id);
    logEvent('info', { actor: 'instructor', studentId: st.id, detail: 'Passwort zurückgesetzt' });
    // Offene "Passwort vergessen"-Anfragen dieses Schuelers als erledigt markieren
    db.prepare("UPDATE events SET seen = 1 WHERE type = 'reset' AND student_id = ?").run(st.id);
    notify(st.id, 'info', 'Dein Passwort wurde zurückgesetzt. Dein Fahrlehrer teilt dir das neue Passwort mit.');
    return ok(res);
  }
  // Offene "Passwort vergessen"-Anfragen (fuer den Fahrlehrer, mit Ein-Tipp-Reset)
  if (p === '/api/instructor/reset-requests' && method === 'GET') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const rows = db.prepare(
      `SELECT e.id, e.student_id, e.at, s.name AS student_name, s.username
       FROM events e LEFT JOIN students s ON s.id = e.student_id
       WHERE e.type = 'reset' AND e.seen = 0 AND s.id IS NOT NULL
       ORDER BY e.at DESC`).all();
    return ok(res, { requests: rows });
  }

  // ===== Nachrichten (Fahrlehrer-Seite) =====
  // Gesprächsliste: je Schüler letzte Nachricht + ungelesen-Anzahl
  if (p === '/api/instructor/messages' && method === 'GET') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const rows = db.prepare(
      `SELECT m.student_id, s.name AS student_name, s.username,
              MAX(m.id) AS last_id,
              (SELECT body FROM messages m2 WHERE m2.student_id = m.student_id ORDER BY m2.id DESC LIMIT 1) AS last_body,
              (SELECT sender FROM messages m2 WHERE m2.student_id = m.student_id ORDER BY m2.id DESC LIMIT 1) AS last_sender,
              (SELECT created_at FROM messages m2 WHERE m2.student_id = m.student_id ORDER BY m2.id DESC LIMIT 1) AS last_at,
              SUM(CASE WHEN m.sender = 'student' AND m.read_instructor = 0 THEN 1 ELSE 0 END) AS unread
       FROM messages m LEFT JOIN students s ON s.id = m.student_id
       GROUP BY m.student_id ORDER BY last_id DESC`).all();
    const totalUnread = db.prepare("SELECT COUNT(*) AS n FROM messages WHERE sender = 'student' AND read_instructor = 0").get().n;
    return ok(res, { conversations: rows, totalUnread });
  }
  if (p === '/api/instructor/messages/unread' && method === 'GET') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const n = db.prepare("SELECT COUNT(*) AS n FROM messages WHERE sender = 'student' AND read_instructor = 0").get().n;
    return ok(res, { unread: n });
  }
  const msgm = p.match(/^\/api\/instructor\/messages\/(\d+)$/);
  if (msgm && method === 'GET') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const sid = Number(msgm[1]);
    const rows = db.prepare('SELECT id,sender,body,created_at FROM messages WHERE student_id = ? ORDER BY id').all(sid);
    db.prepare("UPDATE messages SET read_instructor = 1 WHERE student_id = ? AND sender = 'student' AND read_instructor = 0").run(sid);
    const st = db.prepare('SELECT name,username FROM students WHERE id = ?').get(sid);
    return ok(res, { messages: rows, student: st || null });
  }
  if (p === '/api/instructor/messages' && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const b = await readBody(req);
    const sid = Number(b.student_id);
    const body = String(b.body || '').trim();
    if (!sid || !body) return bad(res, 'Empfänger und Text nötig');
    if (body.length > 2000) return bad(res, 'Nachricht zu lang (max. 2000 Zeichen).');
    if (!db.prepare('SELECT 1 FROM students WHERE id = ?').get(sid)) return bad(res, 'Schüler nicht gefunden', 404);
    db.prepare(`INSERT INTO messages(student_id,sender,body,read_student,read_instructor,created_at)
      VALUES(?,?,?,0,1,?)`).run(sid, 'instructor', body, new Date().toISOString());
    notify(sid, 'info', `✉️ Nachricht von deinem Fahrlehrer: ${body.slice(0, 140)}`);
    return ok(res, { sent: true });
  }
  // Test-/Demo-Schueler mit einem Klick anlegen (zum Ausprobieren der Schueler-Ansicht)
  // Fahrschüler direkt anlegen (Fahrlehrer) – erzeugt Login + Startpasswort zum Weitergeben
  if (p === '/api/students' && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const b = await readBody(req);
    // Vorname/Nachname bevorzugt; sonst der kombinierte Name (Abwärtskompatibilität)
    const hasParts = ('first_name' in b) || ('last_name' in b);
    const first = String(b.first_name || '').trim();
    const last = String(b.last_name || '').trim();
    const name = (hasParts ? combineName(first, last) : String(b.name || '').trim());
    if (!name) return bad(res, 'Bitte einen Namen angeben');
    const sp = hasParts ? { first, last } : splitName(name);
    const by = b.birth_year ? Number(b.birth_year) : null;
    const email = b.email ? String(b.email).trim() : null;
    const phone = b.phone ? String(b.phone).trim() : null;
    if (email && db.prepare('SELECT 1 FROM students WHERE email = ?').get(email)) return bad(res, 'Diese E-Mail ist schon vergeben');
    let username = b.username ? String(b.username).trim().replace(/\s+/g, '') : '';
    if (username) {
      if (db.prepare('SELECT 1 FROM students WHERE username = ?').get(username)) return bad(res, 'Dieser Login-Name ist schon vergeben');
    } else {
      username = genUsername(name, by);
    }
    const password = b.password ? String(b.password) : genStudentPassword();
    const prob = passwordProblem(password);
    if (prob) return bad(res, 'Passwort braucht ' + prob + '.');
    const durs = Array.isArray(b.allowed_durations) ? b.allowed_durations : String(b.allowed_durations || '80').split(',');
    const clean = [...new Set(durs.map(Number).filter((n) => n > 0))].sort((a, z) => a - z);
    const info = db.prepare('INSERT INTO students(name,first_name,last_name,email,phone,pass,username,birth_year,allowed_durations,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(name, sp.first || null, sp.last || null, email, phone, hashPassword(password), username, by, (clean.length ? clean : [80]).join(','), new Date().toISOString());
    logEvent('info', { actor: 'instructor', studentId: Number(info.lastInsertRowid), detail: `Fahrschüler angelegt (${username})` });
    return ok(res, { id: Number(info.lastInsertRowid), name, username, password });
  }

  // Mehrere Fahrschüler auf einmal anlegen (Liste "Nachname, Vorname" pro Zeile)
  if (p === '/api/students/bulk' && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const b = await readBody(req);
    const lines = String(b.text || '').split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return bad(res, 'Bitte eine Namensliste einfügen');
    if (lines.length > 200) return bad(res, 'Maximal 200 Zeilen auf einmal');
    const created = [], errors = [];
    for (const line of lines) {
      try {
        // "Nachname, Vorname" -> "Vorname Nachname"; optionaler Jahrgang am Ende
        let rest = line, by = null;
        const ym = rest.match(/(?:^|[\s,;])((?:19|20)\d{2})\s*$/);
        if (ym) { by = Number(ym[1]); rest = rest.slice(0, ym.index).trim().replace(/[;,]\s*$/, ''); }
        let name = rest, first = '', last = '';
        if (rest.includes(',')) {
          const parts = rest.split(',');
          last = (parts[0] || '').trim(); first = (parts[1] || '').trim();
          name = `${first} ${last}`.trim();
        }
        name = name.replace(/\s+/g, ' ').trim();
        if (!name) { errors.push({ line, error: 'kein Name' }); continue; }
        if (!first && !last) { const sp = splitName(name); first = sp.first; last = sp.last; }
        const username = genUsername(name, by);
        const password = genStudentPassword();
        const info = db.prepare('INSERT INTO students(name,first_name,last_name,pass,username,birth_year,allowed_durations,created_at) VALUES(?,?,?,?,?,?,?,?)')
          .run(name, first || null, last || null, hashPassword(password), username, by, '80', new Date().toISOString());
        logEvent('info', { actor: 'instructor', studentId: Number(info.lastInsertRowid), detail: `Fahrschüler angelegt (${username})` });
        created.push({ name, username, password });
      } catch (e) { errors.push({ line, error: e.message }); }
    }
    return ok(res, { created, errors });
  }

  // Eigene Ausbildungskarte ansehen (nur Lesen, Fahrschüler)
  if (p === '/api/my/training' && method === 'GET') {
    if (!requireStudent()) return bad(res, 'Bitte anmelden', 401);
    const st = db.prepare('SELECT training FROM students WHERE id=?').get(sess.student_id);
    let training = {};
    try { training = st && st.training ? JSON.parse(st.training) : {}; } catch {}
    return ok(res, { training });
  }
  // Ausbildungskarte lesen/speichern (Fahrlehrer)
  // Gefahrene Fahrstunden eines Schülers (für Nachweis-Druck)
  const lsm = p.match(/^\/api\/students\/(\d+)\/lessons$/);
  if (lsm && method === 'GET') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const sid = Number(lsm[1]);
    const st = db.prepare('SELECT name FROM students WHERE id=?').get(sid);
    if (!st) return bad(res, 'Schüler nicht gefunden', 404);
    const lessons = db.prepare(
      `SELECT id,date,start_time,duration_min,status,gearbox,plate,lesson_type,late_minutes,attended,feedback,needs_sign,signed_at,signature,curriculum,invoice_date,invoice_time,created_at
       FROM bookings WHERE student_id=? AND status='done' ORDER BY date,start_time`).all(sid);
    return ok(res, { lessons, name: st.name, stats: lessonStats(sid), adk: adkSummary(sid) });
  }

  const trm = p.match(/^\/api\/students\/(\d+)\/training$/);
  if (trm && method === 'GET') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const st = db.prepare('SELECT training FROM students WHERE id=?').get(Number(trm[1]));
    if (!st) return bad(res, 'Schüler nicht gefunden', 404);
    let training = {};
    try { training = st.training ? JSON.parse(st.training) : {}; } catch {}
    return ok(res, { training, adk: adkSummary(Number(trm[1])), stats: lessonStats(Number(trm[1])) });
  }
  if (trm && method === 'PUT') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const b = await readBody(req);
    const t = (b && typeof b.training === 'object' && b.training) ? b.training : {};
    // nur gesetzte Punkte speichern; Zahl = Zeitstempel „zuletzt abgehakt“ (sonst 1)
    const clean = {};
    for (const k of Object.keys(t)) {
      if (!t[k]) continue;
      const v = t[k];
      clean[String(k).slice(0, 80)] = (typeof v === 'number' && v > 1e12) ? v : 1;
    }
    db.prepare('UPDATE students SET training=? WHERE id=?').run(JSON.stringify(clean), Number(trm[1]));
    logEvent('info', { actor: 'instructor', studentId: Number(trm[1]), detail: `Ausbildungskarte aktualisiert (${Object.keys(clean).length} Punkte)` });
    return ok(res, { saved: true, count: Object.keys(clean).length });
  }

  // Fahrschüler archivieren (bestanden) bzw. reaktivieren
  const arm = p.match(/^\/api\/students\/(\d+)\/(archive|reactivate)$/);
  if (arm && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const sid = Number(arm[1]);
    const st = db.prepare('SELECT id,name FROM students WHERE id=?').get(sid);
    if (!st) return bad(res, 'Schüler nicht gefunden', 404);
    if (arm[2] === 'archive') {
      db.prepare('UPDATE students SET archived_at=? WHERE id=?').run(new Date().toISOString(), sid);
      logEvent('info', { actor: 'instructor', studentId: sid, detail: `Fahrschüler archiviert/bestanden (${st.name})` });
      // Glückwunsch + Einladung zur Bewertung (nur, wenn noch keine abgegeben wurde)
      const hasRev = db.prepare('SELECT 1 FROM reviews WHERE student_id=?').get(sid);
      if (!hasRev) notify(sid, 'info',
        '🎉 Herzlichen Glückwunsch zur bestandenen Prüfung! Wenn du magst, hinterlass eine Bewertung – unter „⭐ Bewertung" in der App. Das hilft anderen sehr.', null);
      return ok(res, { archived: true });
    }
    db.prepare('UPDATE students SET archived_at=NULL WHERE id=?').run(sid);
    logEvent('info', { actor: 'instructor', studentId: sid, detail: `Fahrschüler reaktiviert (${st.name})` });
    return ok(res, { archived: false });
  }

  // Fahrschüler löschen (Fahrlehrer) – inkl. seiner Buchungen
  const delm = p.match(/^\/api\/students\/(\d+)$/);
  if (delm && method === 'DELETE') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const sid = Number(delm[1]);
    const st = db.prepare('SELECT id,name,username FROM students WHERE id = ?').get(sid);
    if (!st) return bad(res, 'Schüler nicht gefunden', 404);
    db.prepare('DELETE FROM bookings WHERE student_id = ?').run(sid);
    // Bewertung bleibt dauerhaft erhalten – nur die Verknuepfung wird geloest (Foto entfaellt dann).
    db.prepare('UPDATE reviews SET student_id = NULL, show_photo = 0 WHERE student_id = ?').run(sid);
    db.prepare('DELETE FROM students WHERE id = ?').run(sid);
    logEvent('info', { actor: 'instructor', detail: `Fahrschüler gelöscht (${st.username || st.name})` });
    return ok(res, { deleted: true });
  }

  if (p === '/api/instructor/test-student' && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const n = db.prepare("SELECT COUNT(*) AS c FROM students WHERE name LIKE 'Testschüler%'").get().c + 1;
    const name = `Testschüler ${n}`;
    const username = genUsername('Test Schueler', 2000);
    const password = 'Test1234!'; // erfuellt die Passwort-Richtlinie
    const info = db.prepare('INSERT INTO students(name,pass,username,birth_year,allowed_durations,created_at) VALUES(?,?,?,?,?,?)')
      .run(name, hashPassword(password), username, 2000, '40,80,120', new Date().toISOString());
    logEvent('info', { actor: 'instructor', studentId: Number(info.lastInsertRowid), detail: `Testschüler angelegt (${username})` });
    return ok(res, { name, username, password });
  }

  // -- Tages-Ausnahmen (kurzer Tag / frei) --
  if (p === '/api/day-overrides' && method === 'GET') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const rows = db.prepare('SELECT * FROM day_overrides WHERE date >= ? ORDER BY date').all(todayStr());
    return ok(res, { overrides: rows });
  }
  if (p === '/api/day-overrides' && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const b = await readBody(req);
    const type = ['short', 'free', 'vacation'].includes(b.type) ? b.type : (b.closed ? 'free' : 'short');
    const closed = (type === 'free' || type === 'vacation') ? 1 : 0;
    let lastStart = closed ? null : (b.last_start || null);
    if (!closed && lastStart && b.start_time && toMin(lastStart) < toMin(b.start_time))
      return bad(res, 'Letzter Slot darf nicht vor dem Arbeitsbeginn liegen');

    // Mehrere angeklickte Tage (dates:[…]) ODER Zeitraum von–bis ODER ein einzelner Tag.
    let dates;
    if (Array.isArray(b.dates) && b.dates.length) {
      dates = [...new Set(b.dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort().slice(0, 370);
    } else {
      if (!b.date) return bad(res, 'Datum noetig');
      const from = b.date;
      const to = (b.date_to && b.date_to >= from) ? b.date_to : from;
      dates = [];
      for (let d = from; d <= to && dates.length < 370; d = addDays(d, 1)) dates.push(d);
    }
    if (!dates.length) return bad(res, 'Kein Datum gewählt');

    // Bestehende Termine, die durch kürzeren Tag / Schließung herausfallen – erst prüfen
    const affected = [];
    for (const date of dates) {
      const aff = db.prepare("SELECT b.*, s.name AS student_name FROM bookings b LEFT JOIN students s ON s.id=b.student_id WHERE b.date = ? AND b.status IN ('booked','offered')").all(date)
        .filter((bk) => closed || (lastStart && toMin(bk.start_time) > toMin(lastStart)));
      for (const a of aff) affected.push({ ...a, _d: date });
    }
    if (affected.length && !b.force) {
      const list = affected.slice(0, 6).map((a) => `${dmy(a._d)} ${a.start_time} ${a.student_name || a.title || ''}`.trim()).join(', ');
      return bad(res, `Es liegen schon ${affected.length} Termin(e), die dann keinen Platz mehr haben `
        + `(${list}${affected.length > 6 ? ' …' : ''}). Verschiebe diese zuerst – oder bestätige mit „trotzdem".`);
    }

    const ins = db.prepare(`INSERT INTO day_overrides(date,start_time,last_start,closed,type,note,created_at)
      VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(date) DO UPDATE SET start_time=excluded.start_time,last_start=excluded.last_start,closed=excluded.closed,type=excluded.type,note=excluded.note`);
    const stamp = new Date().toISOString();
    for (const date of dates) {
      ins.run(date, closed ? null : (b.start_time || null), lastStart, closed, type, b.note ? String(b.note).trim() : null, stamp);
      if (type === 'vacation') logEvent('vacation', { actor: 'instructor', date, detail: `Urlaub am ${wdShort(date)} ${dmy(date)}` });
    }
    return ok(res, { affected: affected.length, days: dates.length });
  }
  const dom = p.match(/^\/api\/day-overrides\/(\d{4}-\d{2}-\d{2})$/);
  if (dom && method === 'DELETE') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    db.prepare('DELETE FROM day_overrides WHERE date = ?').run(dom[1]);
    return ok(res);
  }

  // -- Bloecke / Ausnahmen (Theorie etc.) --
  if (p === '/api/blocks' && method === 'POST') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const { date, start_time, end_time, title, type, count_hours, repeat_weekly } = await readBody(req);
    if (!date || !start_time || !end_time || !title) return bad(res, 'Datum, Zeit und Titel noetig');
    if (toMin(end_time) <= toMin(start_time)) return bad(res, 'Ende muss nach dem Start liegen');
    // Serie: wöchentlich wiederholen (z.B. Theorie über mehrere Wochen)
    const weeks = Math.max(1, Math.min(52, Number(repeat_weekly) || 1));
    const ins = db.prepare('INSERT INTO blocks(date,start_time,end_time,title,type,count_hours,created_at) VALUES(?,?,?,?,?,?,?)');
    const stamp = new Date().toISOString();
    let created = 0;
    for (let i = 0; i < weeks; i++) {
      ins.run(addDays(date, i * 7), start_time, end_time, String(title).trim(), type || 'block', count_hours === false ? 0 : 1, stamp);
      created++;
    }
    return ok(res, { created });
  }
  const blm = p.match(/^\/api\/blocks\/(\d+)$/);
  if (blm && method === 'DELETE') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    db.prepare('DELETE FROM blocks WHERE id = ?').run(Number(blm[1]));
    return ok(res);
  }

  // -- Einstellungen aendern --
  if (p === '/api/instructor/settings' && method === 'PUT') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const b = await readBody(req);
    // Plausibilitaet: Fahrstundenlaenge/Pause muessen sinnvoll sein (sonst Endlosschleife im Raster)
    if ('lesson_min' in b && !(Number(b.lesson_min) >= 10)) return bad(res, 'Fahrstunde muss mind. 10 Minuten sein');
    if ('break_min' in b && !(Number(b.break_min) >= 0)) return bad(res, 'Pause darf nicht negativ sein');
    if ('monthly_target_h' in b && !(Number(b.monthly_target_h) >= 80)) return bad(res, 'Das Monatsziel muss mindestens 80 Stunden sein');
    if ('monthly_max_h' in b && 'monthly_target_h' in b && Number(b.monthly_max_h) < Number(b.monthly_target_h))
      return bad(res, 'Das Skala-Ende (höchstens) darf nicht kleiner als das Monatsziel sein');
    const allowed = ['instructor_name', 'start_time', 'last_start', 'lesson_min', 'break_min',
      'weekly_target_h', 'daily_target_h', 'weekly_lo_h', 'monthly_target_h', 'monthly_max_h', 'workdays', 'max_per_week', 'student_max_per_day',
      'reserve_expire_min', 'weather_enabled', 'weather_autostatus', 'booking_horizon_days', 'cancel_hours', 'lock_hours', 'release_time', 'short_day_last_start',
      'vacation_credit_min', 'vacation_days_left', 'late_grace_min', 'policy_text',
      'instructor_phone', 'avg_speed_kmh', 'live_lead_min',
      'meet_default_label', 'meet_default_lat', 'meet_default_lng',
      'anonymous_swaps', 'req_ueberland', 'req_autobahn', 'req_nacht',
      'sonder_min_ueberland', 'sonder_min_autobahn', 'sonder_min_nacht',
      'rank2_min_lessons', 'booking_horizon_days_rank2', 'registration_open',
      'flow_schedule', 'auto_fill_gaps', 'school_lat', 'school_lng', 'travel_default_min',
      'school_label', 'school2_label', 'school2_lat', 'school2_lng',
      'instructor_home_label', 'instructor_home_lat', 'instructor_home_lng'];
    const emptyOk = new Set(['instructor_phone', 'meet_default_label', 'meet_default_lat', 'meet_default_lng', 'policy_text',
      'instructor_home_label', 'instructor_home_lat', 'instructor_home_lng']);
    for (const k of allowed) {
      if (!(k in b) || b[k] == null) continue;
      if (b[k] === '' && !emptyOk.has(k)) continue;
      setSettingRaw(k, b[k]);
    }
    if (b.new_pin) {
      const prob = passwordProblem(b.new_pin);
      if (prob) return bad(res, 'Fahrlehrer-Passwort braucht ' + prob + '.');
      setSettingRaw('instructor_pin', hashPassword(String(b.new_pin)));
    }
    return ok(res, { settings: getSettings(), misaligned: misalignedDays() });
  }

  return bad(res, 'Unbekannter Endpunkt', 404);
}

// ---------- Geschaeftslogik ----------
function genCode() {
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne verwechselbare Zeichen
  let code;
  do {
    let s = '';
    const buf = randomBytes(8);
    for (let i = 0; i < 8; i++) s += alpha[buf[i] % alpha.length];
    code = `${s.slice(0, 4)}-${s.slice(4)}`;
  } while (db.prepare('SELECT 1 FROM codes WHERE code = ?').get(code));
  return code;
}

// Merkbares, richtlinien-konformes Startpasswort, z.B. "Ampel482!"
function genStudentPassword() {
  const words = ['Auto', 'Fahrt', 'Motor', 'Ampel', 'Kreisel', 'Spur', 'Gang', 'Blinker', 'Tempo', 'Route'];
  const specials = '!?#@';
  const b = randomBytes(4);
  const w = words[b[0] % words.length];
  const num = 100 + ((b[1] << 8 | b[2]) % 900); // dreistellig
  const sp = specials[b[3] % specials.length];
  return `${w}${num}${sp}`;
}

// Login-Handle aus Initialen + Jahrgang, z.B. "Max Mustermann" 1997 -> "MM1997"
// Vor-/Nachname zu einem Anzeigenamen zusammensetzen
function combineName(first, last) {
  return [String(first || '').trim(), String(last || '').trim()].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
// Fallback: kombinierten Namen in Vor-/Nachname zerlegen (letztes Wort = Nachname)
function splitName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] || '', last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}
// Anzeigename einer Bewertung je nach gewaehltem Modus (Schnappschuss beim Absenden).
function reviewAuthorName(student, mode) {
  const first = (student?.first_name || splitName(student?.name).first || '').trim();
  const last = (student?.last_name || splitName(student?.name).last || '').trim();
  if (mode === 'anon') return 'Anonym';
  if (mode === 'full') return combineName(first, last) || (student?.name || 'Ein Fahrschüler');
  // 'initials' (Standard): Vorname + erster Buchstabe des Nachnamens
  const li = last ? ` ${last[0].toUpperCase()}.` : '';
  return (first || (student?.name || 'Ein Fahrschüler')) + li;
}
function genUsername(name, year) {
  const parts = name.split(/\s+/).filter(Boolean);
  const clean = (ch) => (ch || '').replace(/[^A-Za-zÄÖÜäöü]/g, '').toUpperCase();
  let ini = parts.length >= 2
    ? clean(parts[0][0]) + clean(parts[parts.length - 1][0])
    : clean((parts[0] || 'XX').slice(0, 2));
  if (ini.length < 2) ini = (ini + 'XX').slice(0, 2);
  const base = year ? `${ini}${year}` : ini; // ohne Jahrgang: nur Initialen
  let handle = base, n = 1;
  while (db.prepare('SELECT 1 FROM students WHERE username = ?').get(handle)) { n++; handle = `${base}${year ? '-' : ''}${n}`; }
  return handle;
}

// Slots eines Tages inkl. Status (frei / gebucht / geblockt) – FLIESSENDER Tagesplan:
// belegte Stunden stehen fest, dahinter waechst der naechste freie Start mit der
// Dauer der vorigen Stunde + Pause + Abholzeit mit. So bleibt der Tag lueckenlos.
function buildDaySlots(date, studentId = null) {
  const workdays = getSettingRaw('workdays').split(',').map(Number);
  const ov = getOverride(date);
  const isWorkday = !(ov && ov.closed) && workdays.includes(isoDow(date));
  const notOpenYet = !dateOpenForStudents(date, studentId);
  const blocks = db.prepare('SELECT * FROM blocks WHERE date = ?').all(date);
  const bookings = db.prepare(
    "SELECT * FROM bookings WHERE date = ? AND status != 'cancelled'").all(date);
  const isToday = date === todayStr();
  const nowM = toMin(nowHHMM());
  const f = dayFrame(date);
  const slots = [];

  if (!isWorkday) return { slots, isWorkday, blocks, override: ov, shortDay: false };

  // 1) Belegte Stunden (fest im Plan)
  for (const b of bookings) {
    const bs = toMin(b.start_time);
    slots.push({
      start: b.start_time, end: toHHMM(bs + b.duration_min), duration: b.duration_min,
      state: b.status === 'offered' ? 'offered' : 'booked',
      blockTitle: null, bookedByMe: false,
    });
  }
  // 2) Bloecke (Theorie o. a.)
  for (const bl of blocks) {
    slots.push({
      start: bl.start_time, end: bl.end_time,
      duration: Math.max(0, toMin(bl.end_time) - toMin(bl.start_time)),
      state: 'blocked', blockTitle: bl.title, bookedByMe: false,
    });
  }
  // 3) Freie Startzeiten (fliessend). Jeder freie Start bietet, wie lange dort noch passt.
  for (const w of freeStarts(date, studentId)) {
    const past = isToday && w.start <= nowM;
    const maxDur = w.cap - w.start;
    const dur = Math.min(f.lessonMin || 80, maxDur);
    slots.push({
      start: toHHMM(w.start), end: toHHMM(w.start + dur), duration: dur,
      maxDur, state: notOpenYet ? 'toofar' : (past ? 'past' : 'free'),
      blockTitle: null, bookedByMe: false,
    });
  }
  slots.sort((a, b) => toMin(a.start) - toMin(b.start));
  return { slots, isWorkday, blocks, override: ov, shortDay: !!(ov && ov.last_start && !ov.closed) };
}

function weekStartEnd(dateStr) {
  const mon = mondayOf(dateStr);
  return { from: mon, to: addDays(mon, 6) };
}
function monthStartEnd(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  const last = new Date(y, m, 0).getDate(); // Tag 0 des Folgemonats = letzter Tag dieses Monats
  const p2 = (n) => String(n).padStart(2, '0');
  return { from: `${y}-${p2(m)}-01`, to: `${y}-${p2(m)}-${p2(last)}` };
}

// Wie viele Stunden hat ein Schueler in der Woche schon gebucht?
function weekInfoForStudent(studentId, ref = todayStr()) {
  const { from, to } = weekStartEnd(ref);
  const max = Number(getSettingRaw('max_per_week'));
  const count = db.prepare(
    `SELECT COUNT(*) AS n FROM bookings
     WHERE student_id = ? AND date BETWEEN ? AND ? AND status != 'cancelled'`
  ).get(studentId, from, to).n;
  return { from, to, count, max, remaining: Math.max(0, max - count) };
}

// Eine Benachrichtigung fuer einen Schueler anlegen (Portal-Postfach)
// und zusaetzlich an externe Kanaele (E-Mail/Push) uebergeben, sofern konfiguriert.
function notify(studentId, kind, message, date = null, refBookingId = null) {
  db.prepare(`INSERT INTO notifications(student_id,kind,message,date,ref_booking_id,created_at)
    VALUES(?,?,?,?,?,?)`).run(studentId, kind, message, date, refBookingId, new Date().toISOString());
  dispatchExternal(studentId, message);
  pushToStudent(studentId, message); // Handy-Push (falls Gerät angemeldet)
}

// Haken fuer E-Mail / Push. Standardmaessig aus – aktivierbar ueber Umgebungs-
// variablen, ohne dass das Portal sonst etwas braucht. (Details siehe README.)
function dispatchExternal(studentId, message) {
  if (!process.env.FSP_NOTIFY) return; // nicht konfiguriert -> nur Portal-Postfach
  try {
    const st = db.prepare('SELECT name,email FROM students WHERE id = ?').get(studentId);
    // Platzhalter: hier wuerde der echte Versand (SMTP / Web-Push) eingehaengt.
    console.log(`[notify:${process.env.FSP_NOTIFY}] -> ${st?.email}: ${message}`);
  } catch (e) { console.error('notify dispatch', e); }
}

// Alle Schueler ausser einem (fuer Angebots-Benachrichtigungen)
function otherStudentIds(exceptId) {
  return db.prepare('SELECT id FROM students WHERE id != ?').all(exceptId).map((r) => r.id);
}

// Protokoll-Eintrag schreiben (dient zugleich als Fahrlehrer-Benachrichtigung)
function logEvent(type, { actor = 'system', studentId = null, bookingId = null, date = null, detail = null } = {}) {
  let name = null;
  if (studentId) { const st = db.prepare('SELECT name FROM students WHERE id = ?').get(studentId); name = st?.name || null; }
  db.prepare(`INSERT INTO events(at,type,actor,student_id,student_name,booking_id,date,detail)
    VALUES(?,?,?,?,?,?,?,?)`).run(new Date().toISOString(), type, actor, studentId, name, bookingId, date, detail);
}

const dmy = (date) => `${date.slice(8)}.${date.slice(5, 7)}.`;
const wdShort = (date) => ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][isoDow(date) - 1];

// Contigierter Tagesplan: zukuenftige Fahrstunden lueckenlos nach vorne ziehen,
// an Bloecken und bereits gefahrenen/laufenden Stunden vorbei.
function packDay(date) {
  const s = getSettings();
  const brk = s.break_min;
  const ov = getOverride(date);
  if (ov && ov.closed) return { date, moves: [], hasGap: false };
  let start = toMin((ov && ov.start_time) || getSettingRaw('start_time'));
  const isToday = date === todayStr();
  const nowM = toMin(nowHHMM());
  if (isToday) start = Math.max(start, nowM);

  const blocks = db.prepare('SELECT start_time,end_time FROM blocks WHERE date = ?').all(date)
    .map((b) => ({ s: toMin(b.start_time), e: toMin(b.end_time) }));
  const all = db.prepare(
    `SELECT b.*, st.name AS student_name FROM bookings b
     LEFT JOIN students st ON st.id = b.student_id
     WHERE b.date = ? AND b.status IN ('booked','done')`).all(date);

  const fixed = [];      // feste, belegte Intervalle (gefahren oder schon begonnen)
  const movable = [];    // verschiebbare zukuenftige Stunden
  for (const b of all) {
    const bs = toMin(b.start_time);
    if (b.status === 'done' || (isToday && bs <= nowM)) fixed.push({ s: bs, e: bs + b.duration_min });
    else movable.push(b);
  }
  const obstacles = [...blocks, ...fixed];
  movable.sort((a, z) => a.start_time.localeCompare(z.start_time));

  let cursor = start;
  let first = true;
  const moves = [];
  for (const b of movable) {
    const travel = travelMin(b.student_id);   // Abholzeit vor dieser Stunde einrechnen
    // vor der ersten Stunde nur die Abholzeit, sonst zusaetzlich die Pause
    let t = cursor + (first ? travel : brk + travel);
    let changed = true;
    while (changed) {   // an Hindernissen vorbeischieben (inkl. Pause + Abholzeit)
      changed = false;
      for (const o of obstacles) {
        if (overlaps(t, t + b.duration_min, o.s, o.e)) { t = o.e + brk + travel; changed = true; }
      }
    }
    t = Math.ceil(t / 5) * 5;
    moves.push({ id: b.id, from: b.start_time, to: toHHMM(t),
      student_name: b.student_name, student_id: b.student_id, duration: b.duration_min });
    cursor = t + b.duration_min;   // Ende dieser Stunde; Pause + Abholzeit folgen bei der naechsten
    first = false;
  }
  return { date, moves, hasGap: moves.some((m) => m.from !== m.to) };
}

// Tagesplan anwenden (Stunden verschieben + Schueler benachrichtigen). Gibt Anzahl zurueck.
function applyPack(date, label) {
  const plan = packDay(date);
  let moved = 0;
  for (const m of plan.moves) {
    if (m.from === m.to) continue;
    db.prepare('UPDATE bookings SET start_time = ? WHERE id = ?').run(m.to, m.id);
    moved++;
    if (m.student_id) {
      notify(m.student_id, 'shift',
        `Dein Termin am ${wdShort(date)} ${dmy(date)} wurde von ${m.from} auf ${m.to} Uhr verschoben.`, date, m.id);
      logEvent('shift', { actor: 'instructor', studentId: m.student_id, bookingId: m.id, date,
        detail: `${label}: ${m.from} → ${m.to} Uhr (${wdShort(date)} ${dmy(date)})` });
    }
  }
  return moved;
}

// Faellt eine Fahrstunde aus, den Tag automatisch wieder lueckenlos machen:
// die folgenden Stunden ruecken nach vorne (mit Pause + Abholzeit) und die
// betroffenen Schueler werden benachrichtigt. Nur fuer ZUKUENFTIGE Tage und nur,
// wenn in den Einstellungen aktiviert. Gibt die Anzahl verschobener Stunden zurueck.
function autoFillGapsOnCancel(date) {
  if (getSettingRaw('auto_fill_gaps') !== '1') return 0;
  if (date < todayStr()) return 0;                 // Vergangenes nicht anfassen
  if (!packDay(date).hasGap) return 0;             // keine Luecke -> nichts zu tun
  const moved = applyPack(date, 'nachgerückt (Ausfall)');
  if (moved) logEvent('shift', { actor: 'system', date,
    detail: `Ausfall am ${wdShort(date)} ${dmy(date)}: ${moved} Stunde(n) automatisch nach vorne gerückt (lückenlos).` });
  return moved;
}

// Kommende Tage mit einer Luecke, die sich lueckenlos schliessen liesse
// (fliessender Tagesplan: Stunden liessen sich nach vorne ziehen).
function misalignedDays() {
  const rows = db.prepare(
    "SELECT DISTINCT date FROM bookings WHERE status IN ('booked','offered') AND date >= ? ORDER BY date").all(todayStr());
  const days = [];
  for (const { date } of rows) {
    const plan = packDay(date);
    const count = plan.moves.filter((m) => m.from !== m.to).length;
    if (count) days.push({ date, count });
  }
  return { total: days.reduce((a, d) => a + d.count, 0), days };
}

// ---- Sammel-Import: Namen/Datum/Uhrzeit robust erkennen ----
const _normN = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
function matchStudent(students, raw) {
  const q = _normN(raw);
  if (!q) return { error: 'kein Name angegeben' };
  const eq = (v) => _normN(v) === q;
  let hits = students.filter((s) => eq(s.name));
  if (hits.length === 1) return { student: hits[0] };
  hits = students.filter((s) => eq(s.username));
  if (hits.length === 1) return { student: hits[0] };
  const parts = q.split(' ');
  if (parts.length >= 2) {
    const rev = parts.slice().reverse().join(' ');
    hits = students.filter((s) => _normN(s.name) === rev);
    if (hits.length === 1) return { student: hits[0] };
  }
  // alle Namensteile kommen im Schuelernamen vor
  hits = students.filter((s) => { const n = _normN(s.name); return parts.every((p) => n.includes(p)); });
  if (hits.length === 1) return { student: hits[0] };
  if (parts.length === 1) {
    hits = students.filter((s) => _normN(s.name).split(' ').some((w) => w === q));
    if (hits.length === 1) return { student: hits[0] };
    hits = students.filter((s) => _normN(s.name).split(' ').some((w) => w.startsWith(q)));
    if (hits.length === 1) return { student: hits[0] };
  }
  if (hits.length > 1) return { error: `mehrdeutig – ${hits.length} Schüler passen` };
  return { error: 'kein passender Schüler gefunden' };
}
function parseImportDate(str, today) {
  const m = String(str || '').trim().match(/^(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?$/);
  if (!m) return null;
  const d = +m[1], mo = +m[2];
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  const p2 = (n) => String(n).padStart(2, '0');
  const ty = +today.slice(0, 4);
  let year = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : ty;
  let out = `${year}-${p2(mo)}-${p2(d)}`;
  if (!m[3] && out < today) { year = ty + 1; out = `${year}-${p2(mo)}-${p2(d)}`; } // ohne Jahr: nächstes Vorkommen
  const dt = new Date(out + 'T00:00:00');
  if (dt.getMonth() + 1 !== mo || dt.getDate() !== d) return null; // echtes Datum (z.B. 31.2. abfangen)
  return out;
}
function parseImportTime(str) {
  const m = String(str || '').trim().match(/^(\d{1,2})[:.h](\d{2})$/) || String(str || '').trim().match(/^(\d{1,2})$/);
  if (!m) return null;
  const h = +m[1], mi = m[2] != null ? +m[2] : 0;
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}
// Eine Zeile zerlegen – mit Komma/Semikolon/Tab ODER nur mit Leerzeichen.
// Ohne Trennzeichen werden Datum- und Uhrzeit-Token am Muster erkannt,
// alles davor ist der Name (darf Leerzeichen enthalten).
function splitBulkLine(line) {
  if (/[,;\t]/.test(line)) {
    const p = line.split(/\s*[,;\t]\s*/);
    return { name: p[0] || '', date: p[1] || '', time: p[2] || '', dur: p[3] || '' };
  }
  const toks = line.split(/\s+/);
  const dateIdx = toks.findIndex((t) => /^\d{1,2}\.\d{1,2}\.?(\d{2,4})?$/.test(t));
  if (dateIdx < 1) return { name: dateIdx === 0 ? '' : line, date: '', time: '', dur: '' };
  const timeIdx = toks.findIndex((t, i) => i > dateIdx && /^\d{1,2}([:.h]\d{2})?$/.test(t));
  return {
    name: toks.slice(0, dateIdx).join(' '),
    date: toks[dateIdx] || '',
    time: timeIdx >= 0 ? toks[timeIdx] : '',
    dur: timeIdx >= 0 ? (toks[timeIdx + 1] || '') : '',
  };
}
function bulkInstructorBookings(res, body) {
  const commit = !!body.commit;
  const pastAsDone = body.pastAsDone !== false; // vergangene Termine als "gefahren" übernehmen (Standard: ja)
  const s = getSettings();
  const students = db.prepare('SELECT id,name,username FROM students WHERE archived_at IS NULL').all();
  const today = todayStr();
  const lines = String(body.text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const planned = {}; // Datum -> belegte Intervalle (bestehende Buchungen, Blöcke + in diesem Lauf akzeptierte)
  const dayIntervals = (date) => {
    if (!planned[date]) {
      const iv = db.prepare("SELECT start_time,duration_min FROM bookings WHERE date=? AND status!='cancelled'").all(date)
        .map((b) => ({ s: toMin(b.start_time), e: toMin(b.start_time) + b.duration_min }));
      for (const bl of db.prepare('SELECT start_time,end_time FROM blocks WHERE date=?').all(date))
        iv.push({ s: toMin(bl.start_time), e: toMin(bl.end_time) });
      planned[date] = iv;
    }
    return planned[date];
  };
  const rows = [];
  for (const line of lines) {
    const f = splitBulkLine(line);
    const row = { input: line };
    if (!f.name || !f.date || !f.time) { row.status = 'error'; row.msg = 'Format: Name, Datum, Uhrzeit[, Dauer]'; rows.push(row); continue; }
    const match = matchStudent(students, f.name);
    const date = parseImportDate(f.date, today);
    const time = parseImportTime(f.time);
    let dur = f.dur ? parseInt(String(f.dur).replace(/[^\d]/g, ''), 10) : s.lesson_min;
    if (!dur || dur < 10) dur = s.lesson_min; // echte Dauer erhalten (auch kurze Historien-Stunden)
    if (match.error) { row.status = 'error'; row.msg = 'Name: ' + match.error; rows.push(row); continue; }
    row.student = match.student.name; row.studentId = match.student.id;
    if (!date) { row.status = 'error'; row.msg = 'Datum unklar (z. B. 22.7. oder 22.07.2026)'; rows.push(row); continue; }
    if (!time) { row.status = 'error'; row.msg = 'Uhrzeit unklar (z. B. 14:00)'; rows.push(row); continue; }
    row.date = date; row.time = time; row.dur = dur;
    const isPast = date < today || (date === today && toMin(time) <= toMin(nowHHMM()));
    if (isPast) {
      if (!pastAsDone) { row.status = 'error'; row.msg = 'liegt in der Vergangenheit'; rows.push(row); continue; }
      row.done = true; // wird als gefahrene Stunde übernommen
    }
    const ns = toMin(time), ne = ns + dur;
    const iv = dayIntervals(date);
    // Import bildet die Realität ab: nur echte Zeit-Überschneidung blockt
    // (die Pausen-Regel ist eine Planungsvorgabe, kein physisches Muss).
    if (iv.some((x) => overlaps(ns, ne, x.s, x.e))) {
      row.status = 'error'; row.msg = 'Überschneidet einen vorhandenen Termin'; rows.push(row); continue;
    }
    row.status = 'ok'; row.msg = row.done ? 'wird als gefahren übernommen' : 'wird eingetragen';
    iv.push({ s: ns, e: ne }); // für Folgezeilen als belegt vormerken
    rows.push(row);
  }
  const okRows = rows.filter((r) => r.status === 'ok');
  const doneCount = okRows.filter((r) => r.done).length;
  const summary = { rows, okCount: okRows.length, errCount: rows.length - okRows.length, doneCount, futureCount: okRows.length - doneCount };
  if (!commit) return ok(res, { dryRun: true, ...summary });
  let created = 0;
  for (const r of okRows) {
    // Vergangene Stunde -> als "gefahren" (done, bestätigt, anwesend) übernehmen.
    // Zukünftige -> reserviert (confirmed=0), der Schüler bestätigt.
    const status = r.done ? 'done' : 'booked';
    const confirmed = r.done ? 1 : 0;
    const attended = r.done ? 1 : null;
    const info = db.prepare(
      `INSERT INTO bookings(student_id,date,start_time,duration_min,status,confirmed,attended,created_at) VALUES(?,?,?,?,?,?,?,?)`
    ).run(r.studentId, r.date, r.time, r.dur, status, confirmed, attended, new Date().toISOString());
    logEvent('book', { actor: 'instructor', studentId: r.studentId, bookingId: Number(info.lastInsertRowid), date: r.date,
      detail: `${wdShort(r.date)} ${dmy(r.date)} ${r.time} Uhr (${r.dur} Min) – Sammel-Import ${r.done ? '(gefahren)' : '(reserviert)'}` });
    // Nur bei zukünftigen Terminen den Schüler zum Bestätigen anstupsen (nicht bei Historie).
    if (!r.done && r.studentId) notify(r.studentId, 'info',
      `Neuer Termin für dich reserviert: ${wdShort(r.date)} ${dmy(r.date)} um ${r.time} Uhr (${r.dur} Min). Bitte in der App bestätigen.`, r.date, Number(info.lastInsertRowid));
    created++;
  }
  return ok(res, { committed: true, created, ...summary });
}

// ===================== KI-PLANER (Stufe 1) =====================
// Wochentags-Schluessel der Verfuegbarkeit (isoDow 1..7 -> mo..so).
const AV_KEY = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];
// Ein Verfuegbarkeitsfenster normalisieren: [v,b] (alt) oder {v,b,m,p} (neu).
function planNormWin(w) {
  const RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
  if (Array.isArray(w)) { const [v, b] = w; return RE.test(v) && RE.test(b) && v < b ? { v, b } : null; }
  if (w && typeof w === 'object' && RE.test(w.v) && RE.test(w.b) && w.v < w.b)
    return w.m === 'pickup' ? { v: w.v, b: w.b, m: 'pickup', p: w.p || '' } : { v: w.v, b: w.b };
  return null;
}
// Terminvorschlaege erzeugen: fuer jeden Schueler mit hinterlegter Verfuegbarkeit
// wird pro Tag hoechstens ein passender freier Slot vorgeschlagen. Es wird nichts
// gespeichert – der Fahrlehrer entscheidet, was uebernommen wird. In-Memory-Belegung
// verhindert, dass zwei Schueler denselben Slot vorgeschlagen bekommen.
function planSuggestions({ from, to, studentIds }) {
  const s = getSettings();
  const brk = s.break_min;
  const maxWeek = Number(getSettingRaw('max_per_week'));
  const workdays = getSettingRaw('workdays').split(',').map(Number);
  const students = (studentIds && studentIds.length
    ? studentIds.map((id) => db.prepare('SELECT id,name,availability,allowed_durations FROM students WHERE id=? AND archived_at IS NULL').get(id)).filter(Boolean)
    : db.prepare('SELECT id,name,availability,allowed_durations FROM students WHERE archived_at IS NULL ORDER BY name').all());
  // Verfuegbarkeit vorab parsen; Schueler ohne Verfuegbarkeit fallen raus.
  const withAvail = [];
  for (const st of students) {
    let av; try { av = JSON.parse(st.availability || '{}'); } catch { av = {}; }
    if (av && typeof av === 'object' && Object.keys(av).some((k) => Array.isArray(av[k]) && av[k].length)) {
      st._av = av; withAvail.push(st);
    }
  }
  const tentative = {}; // date -> [{s,e}] vorlaeufig belegte Intervalle
  const weekCount = {}; // "sid|weekFrom" -> Anzahl (aus DB vorgeladen)
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dow = isoDow(d);
    if (!workdays.includes(dow)) continue;
    const f = dayFrame(d);
    if (f.closed) continue;
    for (const st of withAvail) {
      const wins = st._av[AV_KEY[dow - 1]];
      if (!Array.isArray(wins) || !wins.length) continue;
      // An diesem Tag schon ein Termin? -> nur ein Vorschlag pro Tag & Schueler.
      if (db.prepare("SELECT 1 FROM bookings WHERE student_id=? AND date=? AND status!='cancelled'").get(st.id, d)) continue;
      // Wochenlimit beachten.
      const wk = weekStartEnd(d).from;
      const key = st.id + '|' + wk;
      if (weekCount[key] === undefined) weekCount[key] = weekInfoForStudent(st.id, d).count;
      if (weekCount[key] >= maxWeek) continue;
      const dur = (String(st.allowed_durations || '80').split(',').map(Number).filter((n) => n > 0)[0]) || s.lesson_min;
      const cands = freeStarts(d, st.id);
      if (!cands.length) continue;
      const tv = tentative[d] || [];
      let chosen = null;
      for (const raw of wins) {
        const w = planNormWin(raw);
        if (!w) continue;
        const wv = toMin(w.v), wb = toMin(w.b);
        for (const c of cands) {
          if (c.start < wv) continue;                       // Start muss im Fenster liegen
          if (c.start + dur > Math.min(wb, c.cap)) continue; // Stunde muss ins Fenster & in den Tag passen
          if (tv.some((t) => overlaps(c.start, c.start + dur + brk, t.s, t.e + brk))) continue; // schon vorgemerkt
          chosen = { start: c.start, w }; break;
        }
        if (chosen) break;
      }
      if (!chosen) continue;
      (tentative[d] ||= []).push({ s: chosen.start, e: chosen.start + dur });
      weekCount[key]++;
      out.push({
        student_id: st.id, student_name: st.name, date: d, weekday: wdShort(d),
        start_time: toHHMM(chosen.start), duration_min: dur,
        mode: chosen.w.m === 'pickup' ? 'pickup' : 'school',
        place: chosen.w.m === 'pickup' ? (chosen.w.p || '') : null,
      });
    }
  }
  return out;
}

// Einen vom Planer bestaetigten Termin als reservierten Vorschlag (confirmed=0)
// anlegen – mit denselben Kollisionspruefungen wie beim normalen Buchen.
function reserveForStudent(studentId, date, start, duration) {
  const s = getSettings();
  const newStart = toMin(start), newEnd = newStart + duration;
  const dayB = db.prepare("SELECT * FROM bookings WHERE date=? AND status!='cancelled'").all(date);
  for (const b of dayB) {
    const bs = toMin(b.start_time), be = bs + b.duration_min;
    if (overlaps(newStart, newEnd + s.break_min, bs, be + s.break_min)) return { error: 'Zeit ist bereits belegt' };
  }
  for (const bl of db.prepare('SELECT * FROM blocks WHERE date=?').all(date))
    if (overlaps(newStart, newEnd, toMin(bl.start_time), toMin(bl.end_time))) return { error: `Zeit ist durch "${bl.title}" belegt` };
  const info = db.prepare(
    `INSERT INTO bookings(student_id,date,start_time,duration_min,status,confirmed,created_at)
     VALUES(?,?,?,?,'booked',0,?)`
  ).run(studentId, date, start, duration, new Date().toISOString());
  const bid = Number(info.lastInsertRowid);
  logEvent('book', { actor: 'instructor', studentId, bookingId: bid, date,
    detail: `${wdShort(date)} ${dmy(date)} ${start} Uhr (${duration} Min) – KI-Planer vorgeschlagen (reserviert)` });
  notify(studentId, 'info',
    `Neuer Termin für dich vorgeschlagen: ${wdShort(date)} ${dmy(date)} um ${start} Uhr (${duration} Min). Bitte in der App annehmen oder ablehnen.`, date, bid);
  return { id: bid };
}

function createBooking(res, sess, body) {
  const s = getSettings();
  const date = body.date;
  const start = body.start_time;
  if (!date || !start) return bad(res, 'Datum und Uhrzeit noetig');

  const isInstructor = sess.kind === 'instructor';
  // Sonderfahrt (feste, lange Dauer je Art) – nur Rang 2 darf sie selbst buchen.
  const sonderType = ['ueberland', 'autobahn', 'nacht'].includes(body.sonder) ? body.sonder : null;
  const duration = sonderType ? sonderMin(sonderType)
    : (Number(body.duration_min) > 0 ? Number(body.duration_min) : s.lesson_min);
  if (sonderType && duration <= 0) return bad(res, 'Sonderfahrt-Dauer ist nicht eingestellt.');

  // Vergangenheit?
  if (date < todayStr() || (date === todayStr() && toMin(start) <= toMin(nowHHMM())))
    return bad(res, 'Dieser Termin liegt in der Vergangenheit');

  const ov = getOverride(date);

  if (!isInstructor) {
    // Arbeitstag / Tages-Ausnahme?
    const workdays = getSettingRaw('workdays').split(',').map(Number);
    if ((ov && ov.closed) || !workdays.includes(isoDow(date)))
      return bad(res, 'An diesem Tag werden keine Fahrstunden angeboten');

    // 14-Tage-Fenster + taegliche Freigabe (der Fahrlehrer darf weiter voraus planen)
    if (!dateOpenForStudents(date, sess.student_id)) {
      const { horizon, rank } = studentRank(sess.student_id);
      const rel = getSettingRaw('release_time');
      return bad(res, `Dieser Tag ist noch nicht buchbar (für dich als Rang ${rank}: bis ${horizon} Tage im Voraus, täglich ab ${rel} Uhr).`);
    }

    // Fliessender Tagesplan: der Start muss einer der aktuell angebotenen freien
    // Startzeiten entsprechen (lueckenlos, inkl. Pause + Abholzeit).
    const free = freeStarts(date, sess.student_id);
    const win = free.find((w) => toHHMM(w.start) === start);
    if (!win)
      return bad(res, 'Diese Startzeit ist gerade nicht (mehr) frei. Bitte lade neu und nimm den nächsten freien Start.');

    if (sonderType) {
      // Sonderfahrten erst ab Rang 2 – feste Dauer, keine allowed_durations-Pruefung.
      const { rank } = studentRank(sess.student_id);
      if (rank < 2)
        return bad(res, `Sonderfahrten kannst du erst ab Rang 2 buchen (ab ${Number(getSettingRaw('rank2_min_lessons'))} gefahrenen Fahrstunden).`);
    } else {
      // Erlaubte Dauer fuer diesen Schueler?
      const stu = db.prepare('SELECT allowed_durations FROM students WHERE id = ?').get(sess.student_id);
      const allowed = (stu?.allowed_durations || '80').split(',').map(Number);
      if (!allowed.includes(duration))
        return bad(res, `Fuer dich sind nur ${allowed.join('/')} Minuten freigegeben.`);
    }

    // Passt die gewuenschte Laenge noch in den Tag (bis zum spaetesten Stundenende)?
    if (toMin(start) + duration > win.cap)
      return bad(res, sonderType
        ? `Diese Sonderfahrt (${duration} Min) passt an diesem Start nicht mehr in den Tag (Ende spätestens ${toHHMM(win.cap)} Uhr). Wähle einen früheren Start oder einen anderen Tag.`
        : `Diese Länge passt an diesem Start nicht mehr in den Tag (Ende spätestens ${toHHMM(win.cap)} Uhr). Wähle eine kürzere Stunde oder einen früheren Start.`);
  }

  const newStart = toMin(start);
  const newEnd = newStart + duration;

  // Kollision mit bestehenden Buchungen (inkl. Pausenabstand)?
  const dayB = db.prepare("SELECT * FROM bookings WHERE date = ? AND status != 'cancelled'").all(date);
  for (const b of dayB) {
    const bs = toMin(b.start_time);
    const be = bs + b.duration_min;
    // Pause zwischen Stunden einhalten
    if (overlaps(newStart, newEnd + s.break_min, bs, be + s.break_min))
      return bad(res, 'Der Termin kollidiert mit einer bestehenden Buchung (inkl. Pause)');
  }
  // Kollision mit Bloecken?
  const dayBlocks = db.prepare('SELECT * FROM blocks WHERE date = ?').all(date);
  for (const bl of dayBlocks) {
    if (overlaps(newStart, newEnd, toMin(bl.start_time), toMin(bl.end_time)))
      return bad(res, `Zeit ist durch "${bl.title}" belegt`);
  }

  let studentId = null;
  if (isInstructor) {
    studentId = body.student_id ? Number(body.student_id) : null;
  } else {
    studentId = sess.student_id;
    const wi = weekInfoForStudent(studentId, date);
    if (wi.remaining <= 0)
      return bad(res, `Pro Woche sind nur ${wi.max} Fahrstunden moeglich. Diese Woche ist voll.`);
    // Selbst-Buchungen pro Tag begrenzen (Standard 1). Fahrlehrer-Eintraege
    // laufen ueber den isInstructor-Zweig und sind davon nicht betroffen.
    const perDayMax = Number(getSettingRaw('student_max_per_day')) || 0;
    if (perDayMax > 0) {
      const sameDay = db.prepare(
        "SELECT COUNT(*) AS n FROM bookings WHERE student_id = ? AND date = ? AND status != 'cancelled'"
      ).get(studentId, date).n;
      if (sameDay >= perDayMax)
        return bad(res, perDayMax === 1
          ? 'Du kannst dir pro Tag nur eine Fahrstunde selbst buchen. Für einen weiteren Termin an diesem Tag sprich bitte deinen Fahrlehrer an.'
          : `Du kannst dir pro Tag höchstens ${perDayMax} Fahrstunden selbst buchen.`);
    }
  }

  // Vom Fahrlehrer FÜR EINEN SCHÜLER eingetragen -> reserviert (confirmed=0), der
  // Schüler bestätigt. Selbst gebucht oder Fahrlehrer-eigener Block -> gleich bestätigt (1).
  const confirmed = (isInstructor && studentId) ? 0 : 1;
  const info = db.prepare(
    `INSERT INTO bookings(student_id,date,start_time,duration_min,status,title,note,lesson_type,confirmed,created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?)`
  ).run(studentId, date, start, duration, 'booked',
    body.title ? String(body.title).trim() : null,
    body.note ? String(body.note).trim() : null,
    sonderType || null, confirmed, new Date().toISOString());
  const bid = Number(info.lastInsertRowid);
  const sonderLbl = sonderType ? { ueberland: 'Überland', autobahn: 'Autobahn', nacht: 'Nachtfahrt' }[sonderType] + '-Sonderfahrt · ' : '';
  logEvent('book', { actor: isInstructor ? 'instructor' : 'student', studentId, bookingId: bid, date,
    detail: `${sonderLbl}${wdShort(date)} ${dmy(date)} ${start} Uhr (${duration} Min)${isInstructor ? ' – vom Fahrlehrer eingetragen' + (studentId ? ' (reserviert)' : '') : ''}` });
  if (isInstructor && studentId) notify(studentId, 'info',
    `Neuer Termin für dich reserviert: ${wdShort(date)} ${dmy(date)} um ${start} Uhr (${duration} Min). Bitte in der App bestätigen.`, date, bid);
  return ok(res, { id: bid });
}

// Statistik (Tacho): gefahrene/gebuchte Stunden Tag & Woche
function statsFor(ref) {
  const s = getSettings();
  const day = ref;
  const { from, to } = weekStartEnd(ref);

  const vacCredit = s.vacation_credit_min;
  const sumMinutes = (whereDate, params) => {
    const bk = db.prepare(
      `SELECT COALESCE(SUM(duration_min),0) AS m FROM bookings
       WHERE ${whereDate} AND status != 'cancelled'`).get(...params).m;
    const blk = db.prepare(
      `SELECT COALESCE(SUM((strftime('%s','2000-01-01 '||end_time)-strftime('%s','2000-01-01 '||start_time))/60),0) AS m
       FROM blocks WHERE ${whereDate} AND count_hours = 1`).get(...params).m;
    // Urlaubstage zaehlen je vacation_credit_min als Arbeitszeit
    const vac = db.prepare(
      `SELECT COUNT(*) AS n FROM day_overrides WHERE ${whereDate} AND type = 'vacation'`).get(...params).n;
    return bk + blk + vac * vacCredit;
  };

  const dayMin = sumMinutes('date = ?', [day]);
  const weekMin = sumMinutes('date BETWEEN ? AND ?', [from, to]);
  const mo = monthStartEnd(ref);
  const monthMin = sumMinutes('date BETWEEN ? AND ?', [mo.from, mo.to]);

  // gefahren (done) getrennt ausweisen
  const dayDone = db.prepare("SELECT COALESCE(SUM(duration_min),0) AS m FROM bookings WHERE date = ? AND status='done'").get(day).m;
  const weekDone = db.prepare("SELECT COALESCE(SUM(duration_min),0) AS m FROM bookings WHERE date BETWEEN ? AND ? AND status='done'").get(from, to).m;
  const monthDone = db.prepare("SELECT COALESCE(SUM(duration_min),0) AS m FROM bookings WHERE date BETWEEN ? AND ? AND status='done'").get(mo.from, mo.to).m;

  // pro Wochentag (fuer kleines Balken-Bild)
  const perDay = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, i);
    perDay.push({ date: d, minutes: sumMinutes('date = ?', [d]) });
  }

  // Kennzahlen der Woche
  const cq = (sql) => db.prepare(sql).get(from, to).n;
  const counts = {
    lessons: cq("SELECT COUNT(*) AS n FROM bookings WHERE date BETWEEN ? AND ? AND status IN ('booked','offered','done') AND student_id IS NOT NULL"),
    driven: cq("SELECT COUNT(*) AS n FROM bookings WHERE date BETWEEN ? AND ? AND status='done' AND (attended IS NULL OR attended=1)"),
    noshow: cq("SELECT COUNT(*) AS n FROM bookings WHERE date BETWEEN ? AND ? AND status='done' AND attended=0"),
    vacationDays: cq("SELECT COUNT(*) AS n FROM day_overrides WHERE date BETWEEN ? AND ? AND type='vacation'"),
  };

  return {
    day, from, to,
    daily: { minutes: dayMin, doneMinutes: dayDone, targetH: s.daily_target_h },
    weekly: { minutes: weekMin, doneMinutes: weekDone, targetH: s.weekly_target_h, loH: s.weekly_lo_h },
    monthly: { minutes: monthMin, doneMinutes: monthDone, targetH: s.monthly_target_h, maxH: s.monthly_max_h, from: mo.from, to: mo.to },
    perDay, counts,
    settings: s,
  };
}

// Faellige Erinnerungen versenden (1 Tag / 3 Std / 30 Min vorher)
function sendDueReminders() {
  const rows = db.prepare(
    "SELECT * FROM bookings WHERE status='booked' AND student_id IS NOT NULL AND date >= ?").all(todayStr());
  let sent = 0;
  // Stufen von "weit weg" nach "nah"; pro Buchung wird nur die naheste faellige
  // gesendet, aeltere faellige Stufen werden nur als erledigt markiert (kein Spam).
  const stages = [
    { flag: 'reminded_1d', h: 24, label: '1 Tag vorher' },
    { flag: 'reminded_3h', h: 3, label: '3 Stunden vorher' },
    { flag: 'reminded_30m', h: 0.5, label: '30 Minuten vorher' },
  ];
  for (const b of rows) {
    const h = hoursUntil(b.date, b.start_time);
    if (h <= 0) continue;
    const due = stages.filter((s) => !b[s.flag] && h <= s.h);
    if (!due.length) continue;
    const toSend = due[due.length - 1]; // die naheste (kleinste) Stufe
    for (const s of due) db.prepare(`UPDATE bookings SET ${s.flag} = 1 WHERE id = ?`).run(b.id);
    notify(b.student_id, 'reminder',
      `Erinnerung (${toSend.label}): Fahrstunde am ${wdShort(b.date)} ${dmy(b.date)} um ${b.start_time} Uhr.`, b.date, b.id);
    sent++;
  }
  return sent;
}

// Naechtliche Server-Pflege: einmal pro Tag (nach 03:00) den Server sauber halten,
// OHNE gueltige Anmeldungen anzutasten. Es werden nur ABGELAUFENE Sitzungen und
// alte, gelesene Postfach-Eintraege entfernt; danach die WAL-Datei zusammengefuehrt
// und der Abfrageplaner optimiert. So bleibt die DB schlank und schnell.
let lastMaintDay = null;
// ===================== WETTER-HINWEIS (DWD via BrightSky, kostenlos) =====================
// Aus den Stundenwerten eines Tages einen Warnhinweis fuer den Tagesstatus ableiten.
// Reine Funktion (fuer Tests) – bekommt die Stundenliste + Arbeitszeitfenster (Stunden).
function classifyWeather(hours, startH, endH) {
  let minT = Infinity, maxPrec = 0, snow = false, sleet = false, rain = false, thunder = false, any = false;
  for (const h of hours || []) {
    const hr = new Date(h.timestamp).getHours();
    if (hr < startH || hr > endH) continue;
    any = true;
    if (typeof h.temperature === 'number') minT = Math.min(minT, h.temperature);
    if (typeof h.precipitation === 'number') maxPrec = Math.max(maxPrec, h.precipitation);
    const c = h.condition || '';
    if (c === 'snow') snow = true;
    else if (c === 'sleet' || c === 'hail') sleet = true;
    else if (c === 'rain') rain = true;
    else if (c === 'thunderstorm') thunder = true;
  }
  if (!any) return null;
  const t = isFinite(minT) ? Math.round(minT) : null;
  if (snow) return { reason: 'snow', label: '❄️ Schnee', detail: `Schnee gemeldet${t !== null ? `, kälteste Stunde ${t}°C` : ''}.` };
  if (t !== null && t <= 1 && (maxPrec > 0 || sleet)) return { reason: 'ice', label: '🧊 Glatteis möglich', detail: `Um den Gefrierpunkt (${t}°C) bei Nässe – Glätte möglich.` };
  if (t !== null && t <= 0) return { reason: 'ice', label: '🧊 Frost', detail: `Frost (${t}°C) – auf überfrierende Nässe achten.` };
  if (thunder) return { reason: 'weather', label: '⛈️ Gewitter', detail: 'Gewitter im Tagesverlauf möglich.' };
  if (maxPrec >= 2.5 || (rain && maxPrec >= 1)) return { reason: 'weather', label: '🌧️ Kräftiger Regen', detail: `Kräftiger Regen (bis ${maxPrec.toFixed(1)} mm/h).` };
  return null; // ruhiges Wetter -> kein Hinweis
}
let _weatherCache = { key: null, at: 0, hint: null };
async function weatherHintFor(date) {
  if (getSettingRaw('weather_enabled') === '0') return null;
  const lat = Number(getSettingRaw('school_lat')) || 52.834;
  const lng = Number(getSettingRaw('school_lng')) || 13.828;
  const key = `${date}|${lat}|${lng}`;
  if (_weatherCache.key === key && Date.now() - _weatherCache.at < 2 * 3600e3) return _weatherCache.hint;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 4500);
    const r = await fetch(`https://api.brightsky.dev/weather?lat=${lat}&lon=${lng}&date=${date}`, {
      signal: ctrl.signal, headers: { Accept: 'application/json' },
    });
    clearTimeout(to);
    if (!r.ok) throw new Error('weather ' + r.status);
    const j = await r.json();
    const f = dayFrame(date);
    const startH = Math.max(0, Math.floor((f.closed ? 6 * 60 : f.dayStart) / 60));
    const endH = Math.min(23, Math.ceil((f.closed ? 20 * 60 : f.workEnd) / 60));
    const hint = classifyWeather(j.weather || [], startH, endH);
    _weatherCache = { key, at: Date.now(), hint };
    return hint;
  } catch {
    // Kein Internet / API-Fehler -> still nichts anzeigen (nie ein Fehler fuer den Nutzer).
    _weatherCache = { key, at: Date.now(), hint: null };
    return null;
  }
}

// Automatische Vorwarnung: ist "weather_autostatus" an und droht heute Glatteis
// oder Schnee, setzt ginoco von selbst den Tagesstatus (Verzoegerung) und
// benachrichtigt die heutigen Fahrschueler – ohne Zutun des Fahrlehrers. Nur wenn
// noch KEIN Status fuer heute gesetzt ist (die manuelle Ansage hat immer Vorrang)
// und es heute noch nicht begonnene Fahrstunden gibt.
let _autoWeatherDay = null;
async function autoWeatherStatus() {
  if (getSettingRaw('weather_autostatus') !== '1') return;
  const date = todayStr();
  if (_autoWeatherDay === date) return;           // heute schon geprueft
  // Schon ein Status gesetzt? -> nicht ueberschreiben.
  if (db.prepare('SELECT 1 FROM day_status WHERE date=?').get(date)) { _autoWeatherDay = date; return; }
  // Gibt es heute ueberhaupt noch nicht begonnene, gebuchte Stunden?
  const nowM = toMin(nowHHMM());
  const studs = db.prepare("SELECT DISTINCT student_id FROM bookings WHERE date=? AND student_id IS NOT NULL AND status='booked'").all(date)
    .filter((r) => true).map((r) => r.student_id);
  const future = db.prepare("SELECT start_time FROM bookings WHERE date=? AND status='booked'").all(date)
    .some((b) => toMin(b.start_time) >= nowM);
  if (!studs.length || !future) return;           // heute nichts (mehr) zu warnen – spaeter erneut versuchen
  const hint = await weatherHintFor(date);
  if (!hint || !(hint.reason === 'ice' || hint.reason === 'snow')) { _autoWeatherDay = date; return; }
  _autoWeatherDay = date; // nur einmal pro Tag ausloesen
  const REASONS = { snow: '❄️ Schnee', ice: '🧊 Glatteis' };
  db.prepare(`INSERT INTO day_status(date,state,minutes,reason,note,updated_at)
    VALUES(?, 'delay', 15, ?, ?, ?)
    ON CONFLICT(date) DO NOTHING`).run(date, hint.reason, 'Automatisch nach Wetterlage – bitte auf Glätte einstellen.', new Date().toISOString());
  const msg = `⚠️ Wetter-Vorwarnung: heute ${REASONS[hint.reason]} möglich. ${hint.detail} Plane etwas mehr Zeit ein und fahre vorsichtig – die Fahrstunde kann sich um ein paar Minuten verschieben.`;
  for (const sid of studs) notify(sid, 'daystatus', msg, date, null);
  logEvent('daystatus', { actor: 'system', date, detail: `Automatische Wetter-Vorwarnung: ${REASONS[hint.reason]} (${studs.length} informiert)` });
}

// Vom Fahrlehrer vorgeschlagene (reservierte, confirmed=0) Termine, auf die der
// Schueler nicht rechtzeitig geantwortet hat, verfallen automatisch: Slot wird
// wieder frei, Fahrlehrer bekommt eine Push. Frist = reserve_expire_min (Standard
// 120 Min), aber immer gedeckelt durch den Termin selbst (spaetestens zum Start).
function expireStaleReservations() {
  const mins = Number(getSettingRaw('reserve_expire_min')) || 0;
  const now = Date.now();
  const rows = db.prepare(
    "SELECT id,student_id,date,start_time,created_at FROM bookings WHERE status='booked' AND confirmed=0"
  ).all();
  let expired = 0;
  for (const b of rows) {
    // Termin bereits begonnen/vorbei? -> Vorschlag ist hinfaellig.
    const lessonPassed = b.date < todayStr() || (b.date === todayStr() && toMin(b.start_time) <= toMin(nowHHMM()));
    // Antwortfrist abgelaufen?
    const proposedAt = Date.parse(b.created_at || '') || now;
    const windowOver = mins > 0 && now >= proposedAt + mins * 60000;
    if (!lessonPassed && !windowOver) continue;
    db.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(b.id);
    expired++;
    logEvent('reserve_expired', { actor: 'system', studentId: b.student_id, bookingId: b.id, date: b.date,
      detail: `${wdShort(b.date)} ${dmy(b.date)} ${b.start_time} Uhr – Vorschlag ohne Antwort verfallen` });
    const st = db.prepare('SELECT name FROM students WHERE id=?').get(b.student_id);
    if (!lessonPassed) {
      pushToInstructor(`⏳ Kein Rückmeldung von ${st?.name || 'einem Fahrschüler'} zum Vorschlag ${wdShort(b.date)} ${dmy(b.date)} ${b.start_time} Uhr – verfallen, der Slot ist wieder frei.`);
      notify(b.student_id, 'info',
        `⏳ Der vorgeschlagene Termin ${wdShort(b.date)} ${dmy(b.date)} um ${b.start_time} Uhr ist ohne deine Antwort verfallen. Frag deinen Fahrlehrer, falls du ihn doch möchtest.`, b.date, b.id);
    }
  }
  return expired;
}

function nightlyMaintenance(force = false) {
  const today = todayStr();
  const hour = Number(nowHHMM().slice(0, 2));
  if (!force) {
    if (lastMaintDay === today) return 0;      // heute schon gelaufen
    if (hour < 3) return 0;                     // erst ab 03:00 Uhr nachts
  }
  lastMaintDay = today;
  let cleaned = 0;
  try {
    // Nur ABGELAUFENE Sitzungen entfernen -> niemand muss sich neu anmelden.
    // (expires wird wie in getSession als Millisekunden gespeichert.)
    cleaned += db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now()).changes || 0;
    // Gelesene Benachrichtigungen aelter als 60 Tage aufraeumen (Postfach schlank halten).
    const cutoff = new Date(Date.now() - 60 * 864e5).toISOString();
    db.prepare('DELETE FROM notifications WHERE read = 1 AND created_at < ?').run(cutoff);
    // Abgelehnte Uebernahme-Angebote zu bereits erledigten/stornierten Buchungen entfernen.
    db.prepare("DELETE FROM offer_declines WHERE booking_id IN (SELECT id FROM bookings WHERE status IN ('done','cancelled'))").run();
    // WAL zusammenfuehren + Planer optimieren (haelt die Datei klein & Abfragen flott).
    try { db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch {}
    try { db.exec('PRAGMA optimize;'); } catch {}
    console.log(`[maintenance] ${today}: ${cleaned} abgelaufene Sitzungen entfernt, DB optimiert.`);
  } catch (e) { console.error('nightlyMaintenance', e); }
  return cleaned;
}

// ---------- statische Dateien ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
};
async function serveStatic(req, res, url) {
  let path = decodeURIComponent(url.pathname);
  if (path === '/') path = '/index.html';
  const full = normalize(join(PUBLIC, path));
  if (!full.startsWith(PUBLIC)) return bad(res, 'Verboten', 403);
  try {
    const data = await readFile(full);
    res.writeHead(200, { 'Content-Type': MIME[extname(full)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    // SPA-Fallback
    try {
      const data = await readFile(join(PUBLIC, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    } catch { bad(res, 'Nicht gefunden', 404); }
  }
}

// ---------- Server ----------
function setSecurityHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');          // Schutz gegen Clickjacking
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self)'); // Standort nur fuer die eigene App
  if (isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
}

const server = createServer(async (req, res) => {
  try {
    setSecurityHeaders(req, res);
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return await serveStatic(req, res, url);
  } catch (err) {
    console.error(err);
    bad(res, 'Serverfehler', 500);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  ginoco laeuft auf  http://localhost:${PORT}  (Bind ${HOST}:${PORT})\n`);
  console.log(`  Fahrlehrer-Login: Standard-PIN 1234 (bitte in den Einstellungen aendern)\n`);
  try { ensureVapidKeys(); } catch (e) { console.error('vapid', e); } // Push-Schlüssel sicherstellen
  // Erinnerungen im Hintergrund pruefen (alle 5 Minuten) + naechtliche Server-Pflege
  try { sendDueReminders(); } catch (e) { console.error(e); }
  try { expireStaleReservations(); } catch (e) { console.error(e); }
  try { autoWeatherStatus().catch(() => {}); } catch (e) { console.error(e); }
  try { nightlyMaintenance(); } catch (e) { console.error(e); }
  setInterval(() => {
    try { sendDueReminders(); } catch (e) { console.error(e); }
    try { expireStaleReservations(); } catch (e) { console.error(e); }
    try { autoWeatherStatus().catch(() => {}); } catch (e) { console.error(e); }
    try { nightlyMaintenance(); } catch (e) { console.error(e); }
  }, 5 * 60 * 1000);
});

// Nur für automatisierte Tests exportiert (keine Wirkung auf den laufenden Server).
export { encryptPush, vapidAuth, b64url, b64urlDecode, ensureVapidKeys, expireStaleReservations, classifyWeather, autoWeatherStatus };
