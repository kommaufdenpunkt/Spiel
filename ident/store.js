/**
 * store.js – verschlüsselte Persistenz von ident.
 *
 * Alles liegt unter DATA_DIR (in der Cloud auf ein dauerhaftes Volume legen):
 *   codes.json      Zugangscodes für Bewerber (Einmal-Nummern)
 *   agents.json     Mitarbeiter-Konten (Prüfer/Admin-Logins)
 *   cases.json      abgeschlossene Fälle (Akten, Metadaten)
 *   recordings.json  Metadaten der Aufnahmen
 *   docs/<caseId>/  Ausweis-/Selfie-Bilder (verschlüsselt)
 *   rec/<id>.<ext>   Video-Aufnahmen (verschlüsselt)
 *
 * Ist STORAGE_KEY gesetzt, werden ALLE Inhalte mit AES-256-GCM verschlüsselt.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sec = require('./security.js');

let DATA_DIR = path.join(__dirname, 'data');
let DOC_DIR = path.join(DATA_DIR, 'docs');
let REC_DIR = path.join(DATA_DIR, 'rec');

let codes = [];
let agents = [];
let cases = [];
let recordings = [];

function file(name) { return path.join(DATA_DIR, name); }
function load(name, fallback) {
  const p = file(name);
  let raw;
  try { raw = fs.readFileSync(p, 'utf8'); } catch { return fallback; }
  try {
    if (raw.startsWith('ENC1:')) {
      if (!sec.hasKey()) throw new Error('verschlüsselt, aber kein STORAGE_KEY');
      return JSON.parse(sec.decrypt(Buffer.from(raw.slice(5), 'base64')).toString('utf8'));
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error('Konnte ' + name + ' nicht lesen:', e.message);
    return fallback;
  }
}
function save(name, data) {
  let out = JSON.stringify(data, null, 2);
  if (sec.hasKey()) out = 'ENC1:' + sec.encrypt(Buffer.from(out, 'utf8')).toString('base64');
  const tmp = file(name) + '.tmp';
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, file(name));
}

function init({ dir } = {}) {
  if (dir) { DATA_DIR = dir; DOC_DIR = path.join(DATA_DIR, 'docs'); REC_DIR = path.join(DATA_DIR, 'rec'); }
  fs.mkdirSync(DOC_DIR, { recursive: true });
  fs.mkdirSync(REC_DIR, { recursive: true });
  codes = load('codes.json', []);
  agents = load('agents.json', []);
  cases = load('cases.json', []);
  recordings = load('recordings.json', []);
  return { DATA_DIR };
}

// ---- Mitarbeiter-Konten (Prüfer + Admin) -----------------------------------
function listAgents() {
  return agents.map((a) => ({
    id: a.id, username: a.username, role: a.role, createdAt: a.createdAt,
    createdBy: a.createdBy || '', has2fa: !!a.totpSecret, mustChange: !!a.mustChange, locked: !!a.locked,
  }));
}
function getAgentByUsername(u) {
  const name = String(u || '').trim().toLowerCase();
  return agents.find((a) => a.username.toLowerCase() === name) || null;
}
function getAgentById(id) { return agents.find((a) => a.id === id) || null; }
function addAgent({ username, password, role, createdBy, require2fa = true }) {
  const name = String(username || '').trim();
  if (!name || !password || getAgentByUsername(name)) return null;
  const { salt, hash } = sec.hashPassword(password);
  const rec = {
    id: crypto.randomUUID(), username: name, role: role === 'admin' ? 'admin' : 'agent',
    salt, hash, totpSecret: require2fa ? sec.generateTotpSecret() : '', mustChange: true, locked: false,
    createdAt: new Date().toISOString(), createdBy: String(createdBy || '').slice(0, 60),
  };
  agents.push(rec); save('agents.json', agents);
  return rec; // enthält totpSecret -> einmalig dem Admin zeigen
}
function verifyAgent(username, password) {
  const a = getAgentByUsername(username);
  if (!a || a.locked) return null;
  return sec.verifyPassword(password, a.salt, a.hash) ? a : null;
}
function setAgentPassword(id, password, mustChange) {
  const a = getAgentById(id); if (!a) return false;
  const { salt, hash } = sec.hashPassword(password);
  a.salt = salt; a.hash = hash; a.mustChange = !!mustChange;
  save('agents.json', agents); return true;
}
function changeOwnPassword(username, password) {
  const a = getAgentByUsername(username); if (!a) return false;
  return setAgentPassword(a.id, password, false);
}
function lockAgent(username) {
  const a = getAgentByUsername(username);
  if (a && !a.locked) { a.locked = true; save('agents.json', agents); }
}
function unlockAgent(id) {
  const a = getAgentById(id); if (!a) return false;
  a.locked = false; save('agents.json', agents); return true;
}
function deleteAgent(id) {
  const i = agents.findIndex((a) => a.id === id); if (i < 0) return false;
  agents.splice(i, 1); save('agents.json', agents); return true;
}
function agentCount() { return agents.length; }

// ---- Zugangscodes (Bewerber) ----------------------------------------------
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne 0/O, 1/I
  let c;
  do { c = ''; for (let i = 0; i < 8; i++) c += chars[crypto.randomInt(chars.length)]; }
  while (getCode(c));
  return c;
}
function createCode({ createdBy, note }) {
  const rec = {
    code: genCode(), createdAt: new Date().toISOString(),
    createdBy: String(createdBy || '').slice(0, 60), note: String(note || '').slice(0, 80),
    status: 'open', usedAt: null,
  };
  codes.push(rec); save('codes.json', codes); return rec;
}
function getCode(code) { return codes.find((c) => c.code === String(code || '').toUpperCase()) || null; }
function isCodeUsable(code) { const r = getCode(code); return !!r && r.status === 'open'; }
function consumeCode(code) {
  const r = getCode(code);
  if (r && r.status === 'open') { r.status = 'used'; r.usedAt = new Date().toISOString(); save('codes.json', codes); }
  return r;
}
function revokeCode(code) {
  const r = getCode(code);
  if (r && r.status === 'open') { r.status = 'revoked'; save('codes.json', codes); }
  return r;
}
function listCodes() { return codes.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }

// ---- Dokument-Bilder (verschlüsselt) ---------------------------------------
function docPath(caseId, fileName) {
  const base = path.join(DOC_DIR, caseId);
  const p = path.normalize(path.join(base, fileName));
  if (!p.startsWith(base)) return null; // Pfad-Ausbruch verhindern
  return p;
}
function writeDoc(caseId, label, dataUrl) {
  const m = /^data:(image\/\w+);base64,(.+)$/s.exec(String(dataUrl || ''));
  if (!m) return null;
  const mime = m[1], ext = mime === 'image/png' ? 'png' : 'jpg';
  const safe = String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'bild';
  const dir = path.join(DOC_DIR, caseId);
  fs.mkdirSync(dir, { recursive: true });
  let buf = Buffer.from(m[2], 'base64');
  const enc = sec.hasKey();
  if (enc) buf = sec.encrypt(buf);
  const fileName = `${safe}-${crypto.randomBytes(3).toString('hex')}.${ext}${enc ? '.enc' : ''}`;
  fs.writeFileSync(path.join(dir, fileName), buf);
  return { label: String(label).slice(0, 60), file: fileName, mime, enc };
}
function readDoc(caseId, docRec) {
  const p = docPath(caseId, docRec.file);
  if (!p || !fs.existsSync(p)) return null;
  let buf = fs.readFileSync(p);
  if (docRec.enc) { if (!sec.hasKey()) return null; try { buf = sec.decrypt(buf); } catch { return null; } }
  return { buffer: buf, mime: docRec.mime || 'image/jpeg' };
}

// ---- Fälle / Akten ---------------------------------------------------------
function saveCase(data) {
  const id = crypto.randomUUID();
  const docs = Array.isArray(data.docs)
    ? data.docs.map((d) => writeDoc(id, d.label, d.dataUrl)).filter(Boolean) : [];
  const rec = {
    id, code: String(data.code || '').toUpperCase(),
    bigoName: String(data.bigoName || '').slice(0, 80),
    age: String(data.age || '').slice(0, 10),
    verifiedName: String(data.verifiedName || '').slice(0, 120),
    docType: String(data.docType || '').slice(0, 40),
    docNumber: String(data.docNumber || '').slice(0, 60),
    result: data.result === 'approved' ? 'approved' : (data.result === 'rejected' ? 'rejected' : 'open'),
    rejectReason: String(data.rejectReason || '').slice(0, 200),
    agentName: String(data.agentName || '').slice(0, 60),
    checklist: Array.isArray(data.checklist) ? data.checklist.slice(0, 20) : [],
    createdAt: new Date().toISOString(), docs,
  };
  cases.push(rec); save('cases.json', cases);
  if (rec.code) consumeCode(rec.code);
  return rec;
}
function listCases() { return cases.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
function getCase(id) { return cases.find((c) => c.id === id) || null; }
function deleteCase(id) {
  const i = cases.findIndex((c) => c.id === id); if (i < 0) return false;
  try { fs.rmSync(path.join(DOC_DIR, id), { recursive: true, force: true }); } catch {}
  cases.splice(i, 1); save('cases.json', cases); return true;
}

// ---- Aufnahmen (verschlüsselte Video-Dateien) ------------------------------
function recPath(fileName) {
  const p = path.normalize(path.join(REC_DIR, fileName));
  if (!p.startsWith(REC_DIR)) return null;
  return p;
}
function saveRecording(data) {
  const buffer = Buffer.isBuffer(data.buffer) ? data.buffer : Buffer.from(data.buffer || []);
  if (!buffer.length) return null;
  const id = crypto.randomUUID();
  const ext = String(data.ext || 'webm').toLowerCase().replace(/[^a-z0-9]/g, '') || 'webm';
  const enc = sec.hasKey();
  const fileName = `${id}.${ext}${enc ? '.enc' : ''}`;
  fs.writeFileSync(recPath(fileName), enc ? sec.encrypt(buffer) : buffer);
  const rec = {
    id, file: fileName, mime: String(data.mime || 'video/webm').slice(0, 80), ext, enc,
    bytes: buffer.length, durationSec: Math.max(0, Math.round(Number(data.durationSec) || 0)),
    code: String(data.code || '').slice(0, 20), agentName: String(data.agentName || '').slice(0, 60),
    createdAt: new Date().toISOString(),
  };
  recordings.push(rec); save('recordings.json', recordings); return rec;
}
function listRecordings() { return recordings.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
function getRecording(id) { return recordings.find((r) => r.id === id) || null; }
function readRecording(id) {
  const rec = getRecording(id); if (!rec) return null;
  const p = recPath(rec.file);
  if (!p || !fs.existsSync(p)) return null;
  let buf = fs.readFileSync(p);
  if (rec.enc) { if (!sec.hasKey()) return null; try { buf = sec.decrypt(buf); } catch { return null; } }
  return { buffer: buf, mime: rec.mime || 'video/webm' };
}
function deleteRecording(id) {
  const i = recordings.findIndex((r) => r.id === id); if (i < 0) return false;
  const p = recPath(recordings[i].file); if (p) { try { fs.rmSync(p, { force: true }); } catch {} }
  recordings.splice(i, 1); save('recordings.json', recordings); return true;
}

module.exports = {
  init,
  listAgents, getAgentByUsername, getAgentById, addAgent, verifyAgent,
  setAgentPassword, changeOwnPassword, lockAgent, unlockAgent, deleteAgent, agentCount,
  createCode, getCode, isCodeUsable, consumeCode, revokeCode, listCodes,
  saveCase, listCases, getCase, deleteCase, readDoc,
  saveRecording, listRecordings, getRecording, readRecording, deleteRecording,
};
