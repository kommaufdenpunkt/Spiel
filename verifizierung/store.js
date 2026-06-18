/*
 * Persistenter Speicher für Einmalcodes und Verifizierungs-Accounts.
 * ------------------------------------------------------------------
 * Bewusst ohne externe/native Abhängigkeiten (einfaches Deployen):
 *   - Metadaten als JSON-Dateien (codes.json, accounts.json)
 *   - Ausweis-/Beweis-Fotos als einzelne Dateien unter photos/<id>/
 *
 * Alles liegt unter DATA_DIR. In der Cloud (Coolify) muss DATA_DIR auf ein
 * Persistent Volume zeigen, sonst sind die Daten nach einem Redeploy weg.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let DATA_DIR = path.join(__dirname, 'data');
let PHOTO_DIR = path.join(DATA_DIR, 'photos');
let ENC_KEY = null;  // 32-Byte-Schlüssel für Foto-Verschlüsselung (oder null)
let codes = [];      // [{code, createdAt, createdBy, applicantName, status, usedAt}]
let accounts = [];   // [{id, code, ...metadaten, photos:[{label,file,mime,enc}]}]

function load(file, fallback) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); }
  catch { return fallback; } // Datei existiert noch nicht
  if (raw.startsWith('ENC1:')) {
    if (!ENC_KEY) {
      throw new Error(`${file} ist verschlüsselt, aber STORAGE_KEY fehlt. Server-Start abgebrochen, um Datenverlust zu vermeiden.`);
    }
    try {
      return JSON.parse(decryptBuf(Buffer.from(raw.slice(5), 'base64')).toString('utf8'));
    } catch {
      throw new Error(`${file} konnte nicht entschlüsselt werden – falscher STORAGE_KEY? Server-Start abgebrochen, um Überschreiben zu vermeiden.`);
    }
  }
  try { return JSON.parse(raw); } // (noch) unverschlüsselt – wird beim nächsten Speichern verschlüsselt
  catch { return fallback; }
}
function saveAtomic(file, data) {
  const tmp = file + '.tmp';
  let out = JSON.stringify(data, null, 2);
  if (ENC_KEY) out = 'ENC1:' + encryptBuf(Buffer.from(out, 'utf8')).toString('base64');
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, file);
}
function codesFile() { return path.join(DATA_DIR, 'codes.json'); }
function accountsFile() { return path.join(DATA_DIR, 'accounts.json'); }
function securityFile() { return path.join(DATA_DIR, 'security.json'); }
function moderatorsFile() { return path.join(DATA_DIR, 'moderators.json'); }
let secLog = [];
let moderators = [];

function init({ dir, encKey } = {}) {
  if (dir) { DATA_DIR = dir; PHOTO_DIR = path.join(DATA_DIR, 'photos'); }
  // Schlüssel aus Passphrase ableiten (32 Byte für AES-256).
  ENC_KEY = encKey ? crypto.createHash('sha256').update(String(encKey)).digest() : null;
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
  codes = load(codesFile(), []);
  accounts = load(accountsFile(), []);
  secLog = load(securityFile(), []);
  moderators = load(moderatorsFile(), []);
  return { DATA_DIR, encrypted: !!ENC_KEY };
}

// ---- Moderator-Konten (persönliche Logins) ---------------------------------
function listModerators() {
  return moderators.map((m) => ({
    id: m.id, username: m.username, createdAt: m.createdAt,
    createdBy: m.createdBy || '', has2fa: !!m.totpSecret, mustChange: !!m.mustChange,
    locked: !!m.locked,
  }));
}
function lockModerator(username) {
  const m = getModeratorByUsername(username);
  if (m && !m.locked) { m.locked = true; saveAtomic(moderatorsFile(), moderators); }
}
function unlockModerator(id) {
  const m = getModeratorById(id);
  if (!m) return false;
  m.locked = false; saveAtomic(moderatorsFile(), moderators); return true;
}
function getModeratorByUsername(u) {
  const name = String(u || '').trim().toLowerCase();
  return moderators.find((m) => m.username.toLowerCase() === name) || null;
}
function getModeratorById(id) { return moderators.find((m) => m.id === id) || null; }
function verifyModerator(username, password) {
  const m = getModeratorByUsername(username);
  if (!m) return null;
  const h = crypto.scryptSync(String(password), m.salt, 64);
  const stored = Buffer.from(m.hash, 'hex');
  if (h.length === stored.length && crypto.timingSafeEqual(h, stored)) return m;
  return null;
}
function setPassword(m, password, mustChange) {
  m.salt = crypto.randomBytes(16).toString('hex');
  m.hash = crypto.scryptSync(String(password), m.salt, 64).toString('hex');
  m.mustChange = !!mustChange;
  saveAtomic(moderatorsFile(), moderators);
}
function addModerator({ username, password, totpSecret, createdBy }) {
  const name = String(username || '').trim();
  if (!name || !password || getModeratorByUsername(name)) return null;
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const rec = {
    id: crypto.randomUUID(),
    username: name,
    salt, hash,
    totpSecret: totpSecret || '',
    mustChange: true, // beim ersten Login muss das Passwort geändert werden
    createdAt: new Date().toISOString(),
    createdBy: String(createdBy || '').slice(0, 60),
  };
  moderators.push(rec);
  saveAtomic(moderatorsFile(), moderators);
  return rec;
}
// Admin setzt ein neues Passwort -> Person muss es beim nächsten Login ändern.
function resetModeratorPassword(id, newPassword) {
  const m = getModeratorById(id);
  if (!m || !newPassword) return false;
  setPassword(m, newPassword, true);
  return true;
}
// Moderator ändert sein eigenes Passwort -> Zwang aufgehoben.
function changeOwnPassword(username, newPassword) {
  const m = getModeratorByUsername(username);
  if (!m || !newPassword) return false;
  setPassword(m, newPassword, false);
  return true;
}
function deleteModerator(id) {
  const i = moderators.findIndex((m) => m.id === id);
  if (i < 0) return false;
  moderators.splice(i, 1);
  saveAtomic(moderatorsFile(), moderators);
  return true;
}

// Sicherheits-Ereignisse dauerhaft protokollieren (für die Überwachung).
function logSecurity(ev) {
  secLog.push(ev);
  if (secLog.length > 1000) secLog = secLog.slice(-1000);
  saveAtomic(securityFile(), secLog);
}
function getSecurityLog() { return secLog.slice(); }

function encryptBuf(buf) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const ct = Buffer.concat([cipher.update(buf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]); // iv(12) + tag(16) + ciphertext
}
function decryptBuf(buf) {
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

function genCode() {
  // 8 Zeichen ohne leicht verwechselbare (0/O, 1/I).
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do {
    c = '';
    for (let i = 0; i < 8; i++) c += chars[crypto.randomInt(chars.length)];
  } while (getCode(c));
  return c;
}

// ---- Einmalcodes -----------------------------------------------------------
function createCode({ createdBy, applicantName }) {
  const rec = {
    code: genCode(),
    createdAt: new Date().toISOString(),
    createdBy: String(createdBy || '').slice(0, 60),
    applicantName: String(applicantName || '').slice(0, 80),
    status: 'open',   // open | used | revoked
    usedAt: null,
  };
  codes.push(rec);
  saveAtomic(codesFile(), codes);
  return rec;
}
function getCode(code) {
  return codes.find((c) => c.code === String(code || '').toUpperCase()) || null;
}
function isCodeUsable(code) {
  const rec = getCode(code);
  return !!rec && rec.status === 'open';
}
function consumeCode(code) {
  const rec = getCode(code);
  if (rec && rec.status === 'open') {
    rec.status = 'used';
    rec.usedAt = new Date().toISOString();
    saveAtomic(codesFile(), codes);
  }
  return rec;
}
function revokeCode(code) {
  const rec = getCode(code);
  if (rec && rec.status === 'open') {
    rec.status = 'revoked';
    saveAtomic(codesFile(), codes);
  }
  return rec;
}
function listCodes() {
  return codes.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---- Accounts (gespeicherte Verifizierungen) -------------------------------
function writePhoto(accountId, label, dataUrl) {
  const m = /^data:(image\/\w+);base64,(.+)$/s.exec(String(dataUrl || ''));
  if (!m) return null;
  const mime = m[1];
  const ext = mime === 'image/png' ? 'png' : 'jpg';
  const safe = String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'foto';
  const dir = path.join(PHOTO_DIR, accountId);
  fs.mkdirSync(dir, { recursive: true });
  let buf = Buffer.from(m[2], 'base64');
  const enc = !!ENC_KEY;
  if (enc) buf = encryptBuf(buf);
  const file = `${safe}-${crypto.randomBytes(3).toString('hex')}.${ext}${enc ? '.enc' : ''}`;
  fs.writeFileSync(path.join(dir, file), buf);
  return { label: String(label).slice(0, 80), file, mime, enc };
}

// Liefert die (ggf. entschlüsselten) Bilddaten zu einem Foto-Eintrag.
function readPhoto(accountId, photoRec) {
  const p = photoPath(accountId, photoRec.file);
  if (!p || !fs.existsSync(p)) return null;
  let buf = fs.readFileSync(p);
  if (photoRec.enc) {
    if (!ENC_KEY) return null; // verschlüsselt, aber kein Schlüssel -> nicht lesbar
    try { buf = decryptBuf(buf); } catch { return null; }
  }
  return { buffer: buf, mime: photoRec.mime || 'image/jpeg' };
}

function saveAccount(data) {
  const id = crypto.randomUUID();
  const photos = Array.isArray(data.photos)
    ? data.photos.map((p) => writePhoto(id, p.label, p.dataUrl)).filter(Boolean)
    : [];
  const rec = {
    id,
    code: String(data.code || '').toUpperCase(),
    applicantName: String(data.applicantName || '').slice(0, 80),
    firstName: String(data.firstName || '').slice(0, 60),
    lastName: String(data.lastName || '').slice(0, 60),
    bigoId: String(data.bigoId || '').slice(0, 60),
    verifiedName: String(data.verifiedName || '').slice(0, 120),
    docNumber: String(data.docNumber || '').slice(0, 60),
    verified: !!data.verified,
    moderatorName: String(data.moderatorName || '').slice(0, 60),
    roomCode: String(data.roomCode || '').slice(0, 20),
    checklist: Array.isArray(data.checklist) ? data.checklist.slice(0, 20) : [],
    createdAt: new Date().toISOString(),
    photos,
  };
  accounts.push(rec);
  saveAtomic(accountsFile(), accounts);
  if (rec.code) consumeCode(rec.code);
  return rec;
}
function listAccounts() {
  // Nur Metadaten (keine Bilddaten), neueste zuerst.
  return accounts.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
function getAccount(id) {
  return accounts.find((a) => a.id === id) || null;
}
function photoPath(id, file) {
  // Verhindert Pfad-Ausbruch.
  const base = path.join(PHOTO_DIR, id);
  const p = path.normalize(path.join(base, file));
  if (!p.startsWith(base)) return null;
  return p;
}
function deleteAccount(id) {
  const idx = accounts.findIndex((a) => a.id === id);
  if (idx < 0) return false;
  try { fs.rmSync(path.join(PHOTO_DIR, id), { recursive: true, force: true }); } catch {}
  accounts.splice(idx, 1);
  saveAtomic(accountsFile(), accounts);
  return true;
}

module.exports = {
  init, createCode, getCode, isCodeUsable, consumeCode, revokeCode, listCodes,
  saveAccount, listAccounts, getAccount, photoPath, readPhoto, deleteAccount,
  logSecurity, getSecurityLog,
  listModerators, getModeratorByUsername, verifyModerator, addModerator, deleteModerator,
  resetModeratorPassword, changeOwnPassword, lockModerator, unlockModerator,
};
