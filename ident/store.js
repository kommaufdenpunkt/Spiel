/**
 * store.js – verschlüsselte Persistenz von ident.
 *
 * Alles liegt unter DATA_DIR (in der Cloud auf ein dauerhaftes Volume legen):
 *   codes.json      Zugangscodes für Bewerber (Einmal-Nummern)
 *   agents.json     Mitarbeiter-Konten (Prüfer/Admin-Logins)
 *   cases.json      abgeschlossene Fälle (Akten, Metadaten)
 *   recordings.json  Metadaten der Aufnahmen
 *   streamers.json   Ordner je Streamer (mcp.4ever1.tv), Zuordnung über die BIGO-ID
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
let streamers = [];   // Ordner je Streamer (mcp.4ever1.tv)
let settings = {};

const DEFAULT_SCRIPT = [
  'Hallo, mein Name ist [dein Name].',
  'Meine BIGO-ID ist [deine BIGO-ID] und ich bin [dein Alter] Jahre alt.',
  'Mit diesem Video bewerbe ich mich bei der Agentur 4EVER1 als Streamerin bzw. Streamer auf BIGO Live.',
  'Ich möchte dem V-System der Agentur 4EVER1 beitreten und kenne die dazugehörigen Regeln.',
  'Mir ist bewusst, dass ich mich in meinen Streams zeigen muss und die allgemeinen BIGO-Regeln einhalte:',
  'keine verbotenen Inhalte, kein Parallelstreaming und kein Streaming auf Konkurrenz-Apps.',
  'Ich wurde über die Transferregeln, also Freigabe und Freikauf, informiert.',
  'Ich bin damit einverstanden, dass meine Angaben und diese Aufnahme gespeichert und zur Bearbeitung meiner Bewerbung an den BIGO-Support weitergeleitet werden.',
  'Hiermit erkläre ich ausdrücklich meinen Wunsch, der Agentur 4EVER1 beizutreten.',
  'Vielen Dank.',
].join('\n');

const DEFAULT_INTRO = [
  'Hey, schön, dass du da bist! 👋',
  '',
  'So läuft deine Audition ab:',
  '1. Du kommst gleich in den Warteraum.',
  '2. Ein Prüfer der Agentur 4EVER1 holt dich ins Gespräch – das können 1 bis 3 Personen sein, also nicht erschrecken.',
  '3. Kurzes Hallo – wie geht’s dir usw.',
  '4. Danach liest du in Ruhe einen kurzen Text in die Kamera. Den siehst du schon im Warteraum und kannst ihn vorher durchlesen.',
  '5. Fertig – das war’s!',
  '',
  'Wichtig: Lade dir das PK-Board herunter – dort findest du das Tutorial und die BIGO-Regeln.',
  '',
  'Wenn du auf „Bereit“ klickst, bist du damit einverstanden, dass ab jetzt die Video- und Tonaufnahme läuft.',
].join('\n');

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
  streamers = load('streamers.json', []);
  settings = load('settings.json', {});
  ordnerNachziehen();
  return { DATA_DIR };
}

/**
 * Alte Ordner auf die neue Zuordnung heben.
 *
 * Früher gab es nur ein Feld für „BIGO-ID", und dort stand bei manchen die Zahl
 * und bei anderen der Name – „Tauchküken" zum Beispiel. Damit war die Person
 * nur unter genau der einen Schreibweise zu finden.
 *
 * Hier wird beides sauber getrennt: steht in der Kennung keine Zahl, dann war
 * es ein Name, und der wandert ins Namensfeld. Nichts wird gelöscht, die
 * Kennung bleibt wie sie war – gefunden wird ab jetzt über beides.
 */
function ordnerNachziehen() {
  let geaendert = false;
  streamers.forEach((s) => {
    if (!Array.isArray(s.aliasse)) { s.aliasse = []; geaendert = true; }
    if (!s.bigoName && s.bigoId && !idSchluessel(s.bigoId)) { s.bigoName = String(s.bigoId).slice(0, 80); geaendert = true; }
  });
  if (geaendert) { try { save('streamers.json', streamers); } catch { /* nur lesend geöffnet */ } }
}

// ---- Mitarbeiter-Konten (Prüfer + Admin) -----------------------------------
function listAgents() {
  return agents.map((a) => ({
    id: a.id, username: a.username, role: a.role, createdAt: a.createdAt,
    createdBy: a.createdBy || '', has2fa: !!a.totpSecret, mustChange: !!a.mustChange, locked: !!a.locked,
    hasPasskey: (a.passkeys || []).length > 0,
    deviceCount: (a.devices || []).length,
  }));
}

// ---- Passkeys (Face ID / Fingerabdruck, WebAuthn) --------------------------
function addPasskey(agentId, pk) {
  const a = getAgentById(agentId); if (!a) return false;
  if (!Array.isArray(a.passkeys)) a.passkeys = [];
  a.passkeys.push({ id: pk.id, publicKey: pk.publicKey, counter: pk.counter || 0, createdAt: new Date().toISOString() });
  save('agents.json', agents); return true;
}
function getAgentByPasskeyId(credId) {
  return agents.find((a) => (a.passkeys || []).some((p) => p.id === credId)) || null;
}
function setPasskeyCounter(agentId, credId, counter) {
  const a = getAgentById(agentId); if (!a) return false;
  const p = (a.passkeys || []).find((x) => x.id === credId); if (!p) return false;
  p.counter = counter; save('agents.json', agents); return true;
}
function agentPasskeys(agentId) {
  const a = getAgentById(agentId); return a ? (a.passkeys || []) : [];
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
    // Der Anzeigename auf BIGO (z. B. Tauchküken) - der zweite Weg zur Person.
    bigoNick: String(data.bigoNick || '').slice(0, 80),
    age: String(data.age || '').slice(0, 10),
    verifiedName: String(data.verifiedName || '').slice(0, 120),
    docType: String(data.docType || '').slice(0, 40),
    docNumber: String(data.docNumber || '').slice(0, 60),
    note: String(data.note || '').slice(0, 500),
    result: data.result === 'approved' ? 'approved' : (data.result === 'rejected' ? 'rejected' : 'open'),
    rejectReason: String(data.rejectReason || '').slice(0, 200),
    agentName: String(data.agentName || '').slice(0, 60),
    checklist: Array.isArray(data.checklist) ? data.checklist.slice(0, 20) : [],
    // Wortlaut, der an diesem Tag galt. Der Vorlese-Text ist die Einwilligung,
    // die der Bewerber in die Kamera gesprochen hat – ohne ihn liesse sich
    // später nicht mehr belegen, worin genau eingewilligt wurde.
    skript: String(data.skript || '').slice(0, 20000),
    einleitung: String(data.einleitung || '').slice(0, 20000),
    createdAt: new Date().toISOString(), docs,
    // Übergabe an mcp.4ever1.tv: '' | laeuft | uebergeben | fehlgeschlagen
    mcpStatus: '', mcpText: '', mcpAt: '',
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
    // Auswertung durch den Prüfer: ist die Aufnahme brauchbar geworden?
    quality: '', reviewNote: '', reviewedBy: '', reviewedAt: '',
  };
  recordings.push(rec); save('recordings.json', recordings); return rec;
}
// ---- Aufnahme, die schon während des Gesprächs auf dem Server liegt -------
//
// Bisher sammelte der Browser des Prüfers die ganze Aufnahme im Speicher und
// schickte sie erst beim Stoppen hoch. Bricht dort etwas ab – Browser stürzt,
// Tab zu, Rechner schläft ein, Leitung weg – war die komplette Audition
// verloren. Und zwar rückstandslos: keine Datei, kein Rest, nichts.
//
// Jetzt wandert jedes Stück sofort hierher. Jedes Stück wird einzeln
// verschlüsselt abgelegt; beim Abschluss werden sie in der Reihenfolge zu einer
// Datei zusammengesetzt. Geht unterwegs etwas kaputt, liegt hier trotzdem
// alles, was bis dahin angekommen ist – und lässt sich retten.
function laufPfad(sitzung) {
  const s = String(sitzung || '').replace(/[^a-zA-Z0-9-]/g, '');
  if (s.length < 8) return null;
  const p = path.normalize(path.join(REC_DIR, 'lauf-' + s));
  return p.startsWith(REC_DIR) ? p : null;
}
function beginRecording({ code, agentName, mime, ext }) {
  const sitzung = crypto.randomUUID();
  const dir = laufPfad(sitzung); if (!dir) return null;
  fs.mkdirSync(dir, { recursive: true });
  const kopf = {
    sitzung, code: String(code || '').slice(0, 20), agentName: String(agentName || '').slice(0, 60),
    mime: String(mime || 'video/webm').slice(0, 80),
    ext: String(ext || 'webm').toLowerCase().replace(/[^a-z0-9]/g, '') || 'webm',
    begonnenAm: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dir, 'kopf.json'), JSON.stringify(kopf));
  return kopf;
}
function appendRecordingChunk(sitzung, i, buffer) {
  const dir = laufPfad(sitzung); if (!dir || !fs.existsSync(dir)) return null;
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!buf.length) return { gespeichert: 0 };
  const n = Math.max(0, Math.min(999999, parseInt(i, 10) || 0));
  // Feste Breite, damit die Reihenfolge auch alphabetisch stimmt.
  const name = String(n).padStart(6, '0') + '.part';
  fs.writeFileSync(path.join(dir, name), sec.hasKey() ? sec.encrypt(buf) : buf);
  return { gespeichert: buf.length, teil: n };
}
/** Stücke der Reihe nach zusammensetzen. Fehlt eines, hört es dort auf. */
function laufZusammensetzen(dir) {
  const teile = fs.readdirSync(dir).filter((f) => f.endsWith('.part')).sort();
  const stuecke = []; let erwartet = 0; let luecke = false;
  for (const f of teile) {
    const nr = parseInt(f, 10);
    if (nr !== erwartet) luecke = true;    // ein Stück fehlt – wir merken es
    erwartet = nr + 1;
    let b = fs.readFileSync(path.join(dir, f));
    if (sec.hasKey()) { try { b = sec.decrypt(b); } catch { luecke = true; continue; } }
    stuecke.push(b);
  }
  return { buffer: Buffer.concat(stuecke), anzahl: stuecke.length, luecke };
}
function finishRecording(sitzung, { durationSec, abgebrochen } = {}) {
  const dir = laufPfad(sitzung); if (!dir || !fs.existsSync(dir)) return null;
  let kopf = {};
  try { kopf = JSON.parse(fs.readFileSync(path.join(dir, 'kopf.json'), 'utf8')); } catch {}
  const { buffer, anzahl, luecke } = laufZusammensetzen(dir);
  if (!buffer.length) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} return null; }
  const rec = saveRecording({
    buffer, mime: kopf.mime, ext: kopf.ext, code: kopf.code, agentName: kopf.agentName,
    durationSec: durationSec || 0,
  });
  if (rec) {
    rec.teile = anzahl;
    // Ehrlich bleiben: Wenn Stücke fehlen oder der Prüfer nie abgeschlossen
    // hat, steht das an der Aufnahme dran. Sonst hält man sie für vollständig.
    if (luecke) rec.unvollstaendig = true;
    if (abgebrochen) rec.abgebrochen = true;
    save('recordings.json', recordings);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  return rec;
}
/** Angefangene Aufnahmen, die niemand abgeschlossen hat. */
function offeneAufnahmen() {
  if (!fs.existsSync(REC_DIR)) return [];
  return fs.readdirSync(REC_DIR).filter((f) => f.startsWith('lauf-')).map((f) => {
    const dir = path.join(REC_DIR, f);
    let kopf = {};
    try { kopf = JSON.parse(fs.readFileSync(path.join(dir, 'kopf.json'), 'utf8')); } catch {}
    const teile = fs.readdirSync(dir).filter((x) => x.endsWith('.part'));
    let bytes = 0; teile.forEach((x) => { try { bytes += fs.statSync(path.join(dir, x)).size; } catch {} });
    return { sitzung: kopf.sitzung || f.slice(5), code: kopf.code || '', agentName: kopf.agentName || '',
      begonnenAm: kopf.begonnenAm || '', teile: teile.length, bytes };
  });
}
/**
 * Beim Start retten, was liegengeblieben ist. Eine angefangene Aufnahme ohne
 * Abschluss bedeutet: der Prüfer ist weg, mitten im Gespräch. Das Stück, das
 * schon hier liegt, ist trotzdem eine Audition – die wird nicht weggeworfen.
 */
function aufnahmenRetten() {
  const gerettet = [];
  offeneAufnahmen().forEach((o) => {
    if (!o.teile) { const d = laufPfad(o.sitzung); if (d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} } return; }
    const rec = finishRecording(o.sitzung, { abgebrochen: true });
    if (rec) gerettet.push({ id: rec.id, code: rec.code, bytes: rec.bytes, teile: o.teile });
  });
  return gerettet;
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
// ---- Streamer-Ordner (mcp.4ever1.tv) ---------------------------------------
// Jeder Streamer hat genau einen Ordner, zugeordnet über die BIGO-ID. Dort
// sammelt sich alles: die Audition, spätere Einträge, Notizen.
function ordnerSchluessel(bigoId) { return String(bigoId || '').trim().toLowerCase(); }

// ---- Wer ist das? Die Zuordnung ------------------------------------------
//
// Ein Streamer hat zwei Kennungen, und die Leute verwechseln sie ständig:
//   die BIGO-ID   – eine Zahl, z. B. 901234567
//   den Namen     – z. B. „Tauchküken"
//
// Bisher hing der Ordner an genau einem Feld. Wer „Tauchküken" eintippte,
// während der Ordner unter der Zahl lag, bekam einen zweiten Ordner – dieselbe
// Person, zweimal geführt, und die Audition landete im leeren neuen Ordner.
// Genau das darf nicht passieren.
//
// Jetzt hat jeder Ordner beides und dazu frühere Namen. Gesucht wird über alle
// Wege gleichzeitig. Und was fehlt, wird beim Treffer nachgetragen.

/**
 * Zahlen-Kennung: nur Ziffern. „901 234 567" und „901234567" sind dasselbe.
 *
 * Achtung: eine BIGO-ID muss KEINE Zahl sein – „melissa.darlyn" ist genauso
 * eine. Solche werden über die Namens-Kennung gefunden; hier kommt dann leer
 * heraus, und das ist richtig. Nur eine reine Zahlenfolge ist eine Zahl.
 */
function idSchluessel(x) {
  const roh = String(x || '').trim();
  if (!/^[\d\s.\-]+$/.test(roh)) return '';   // Buchstaben drin -> keine Zahl
  const s = roh.replace(/\D+/g, '');
  return s.length >= 4 ? s : '';
}
/**
 * Namens-Kennung: klein, ohne Zeichen, Umlaute aufgelöst.
 * „Tauchküken", „tauchkueken", „Tauch Küken" und „TAUCHKÜKEN_" sind dieselbe
 * Person. Wer das nicht auflöst, führt sie viermal.
 */
function namSchluessel(x) {
  return String(x || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '');
}
/**
 * Das Agentur-Kuerzel „ey" davor bedeutet dasselbe.
 *
 * Bei 4EVER1 setzen sich die Streamer ein „ey" vor den Namen, sobald sie dabei
 * sind: aus „Tauchkueken" wird „eyTauchkueken". Das ist dieselbe Person, und die
 * Akte darf sich davon nicht zweiteilen.
 *
 * Der ungekuerzte Name bleibt trotzdem eine Kennung – sonst wuerde aus einer
 * echten „Eyleen" eine „leen", und die waere ploetzlich mit jemand anderem
 * verwechselbar. Beide Wege gelten, keiner ersetzt den anderen.
 */
function ohneEy(n) {
  return /^ey.{3,}$/.test(n) ? n.slice(2) : '';
}
/** Alle Kennungen, unter denen dieser Ordner zu finden ist. */
function ordnerKennungen(s) {
  const zahlen = new Set(), namen = new Set();
  const dazu = (w) => {
    const z = idSchluessel(w); if (z) zahlen.add(z);
    const n = namSchluessel(w);
    if (n.length >= 3) { namen.add(n); const k = ohneEy(n); if (k) namen.add(k); }
  };
  dazu(s.bigoId); dazu(s.bigoName); dazu(s.bigoIdText);
  (s.aliasse || []).forEach(dazu);
  return { zahlen, namen };
}
/**
 * Den Ordner zu einer Person finden – über die Zahl ODER den Namen.
 * Gibt zusätzlich zurück, worüber der Treffer kam: das will der Prüfer wissen.
 */
function ordnerFinden({ bigoId, bigoName } = {}) {
  const zahl = idSchluessel(bigoId) || idSchluessel(bigoName);
  const name = namSchluessel(bigoName) || namSchluessel(bigoId);
  if (!zahl && name.length < 3) return null;
  // Die Zahl ist der sichere Weg und hat Vorrang.
  if (zahl) {
    const o = streamers.find((s) => ordnerKennungen(s).zahlen.has(zahl));
    if (o) return { ordner: o, weg: 'zahl', sicher: true };
  }
  if (name.length >= 3) {
    // Auch hier beide Formen suchen: wer „eyTauchkueken" eintippt, findet den
    // Ordner „Tauchkueken" – und umgekehrt.
    const kurz = ohneEy(name);
    const o = streamers.find((s) => {
      const k = ordnerKennungen(s).namen;
      return k.has(name) || (kurz && k.has(kurz));
    });
    if (o) return { ordner: o, weg: 'name', sicher: true };
  }
  return null;
}
/**
 * Was fehlt, nachtragen. Wer unter „Tauchküken" geführt wurde und jetzt seine
 * Zahl mitbringt, hat danach beides im Ordner – und wird beim nächsten Mal über
 * beide Wege gefunden. Ein alter Name wird nicht gelöscht, sondern als früherer
 * Name behalten: Leute benennen sich auf BIGO um, und dann muss man sie unter
 * dem alten Namen weiter finden können.
 */
function ordnerZuordnen(ordner, { bigoId, bigoName } = {}) {
  const ergaenzt = [];
  const zahl = idSchluessel(bigoId) || idSchluessel(bigoName);
  const neuName = String(bigoName || '').trim().slice(0, 80);
  // Eine BIGO-ID aus Buchstaben (melissa.darlyn) ist genauso eine Kennung.
  // Hat der Ordner noch keine, wird sie uebernommen.
  const roh = String(bigoId || '').trim();
  if (!zahl && roh && !ordner.bigoIdText && namSchluessel(roh) !== namSchluessel(ordner.bigoId)) {
    ordner.bigoIdText = roh.slice(0, 60); ergaenzt.push('BIGO-ID ' + ordner.bigoIdText);
  }
  if (zahl && !idSchluessel(ordner.bigoId)) {
    // Der Ordner lag unter einem Namen. Der Name wandert ins Namensfeld, die
    // Zahl wird die Kennung – so heisst der Ordner künftig wie überall sonst.
    if (!ordner.bigoName && ordner.bigoId) ordner.bigoName = String(ordner.bigoId).slice(0, 80);
    ordner.bigoId = zahl; ergaenzt.push('BIGO-ID ' + zahl);
  }
  if (neuName && namSchluessel(neuName) !== namSchluessel(ordner.bigoName)) {
    if (ordner.bigoName && namSchluessel(ordner.bigoName).length >= 3) {
      if (!Array.isArray(ordner.aliasse)) ordner.aliasse = [];
      if (!ordner.aliasse.some((a) => namSchluessel(a) === namSchluessel(ordner.bigoName))) {
        ordner.aliasse.unshift(ordner.bigoName);
        ordner.aliasse = ordner.aliasse.slice(0, 10);
        ergaenzt.push('früherer Name ' + ordner.bigoName);
      }
    }
    ordner.bigoName = neuName; ergaenzt.push('Name ' + neuName);
  }
  return ergaenzt;
}
function listStreamers() {
  streamers.forEach((s) => { if (!s.art) s.art = 'streamer'; if (!Array.isArray(s.eintraege)) s.eintraege = []; });
  return streamers.slice().sort((a, b) => String(b.letzteAktivitaet || b.angelegtAm).localeCompare(String(a.letzteAktivitaet || a.angelegtAm)));
}

/**
 * Dieselbe Liste, aber ohne Inhalte: Wer nicht Admin ist, sieht zunächst nur,
 * DASS es eine Akte gibt – nicht, was drinsteht. Vermerke, Auditionen,
 * Ausweisnummern und Protokolle bleiben draussen, bis ein Grund genannt ist.
 * Das ist keine Anzeige-Entscheidung im Browser, sondern der Server schickt
 * die Inhalte gar nicht erst mit.
 */
function listStreamersKurz() {
  return listStreamers().map((s) => ({
    id: s.id, bigoId: s.bigoId, name: s.name, alter: s.alter,
    status: s.status, art: s.art || 'streamer', herkunft: s.herkunft || '',
    angelegtAm: s.angelegtAm, letzteAktivitaet: s.letzteAktivitaet,
    anzahlAuditions: (s.auditions || []).length,
    anzahlVermerke: (s.eintraege || []).length,
    // Der blaue Haken ist kein Geheimnis - er sagt nur, DASS geprüft wurde.
    verifiziert: s.verifiziert || null,
    verschlossen: true,
  }));
}

/**
 * Akteneinsicht festhalten. Wer eine Akte öffnet, hinterlässt eine Spur –
 * mit Grund. Das steht anschliessend in der Akte selbst, für alle sichtbar.
 * Nicht heimlich: Wer nachsieht, wird gesehen.
 */
function protokolliereZugriff(id, { wer, rolle, grund, ip }) {
  const s = getStreamer(id); if (!s) return null;
  if (!Array.isArray(s.zugriffe)) s.zugriffe = [];
  const rec = {
    id: crypto.randomUUID(),
    wer: String(wer || 'unbekannt').slice(0, 60),
    rolle: rolle === 'admin' ? 'admin' : 'pruefer',
    grund: String(grund || '').slice(0, 300),
    ip: String(ip || '').slice(0, 60),
    am: new Date().toISOString(),
  };
  s.zugriffe.unshift(rec);
  if (s.zugriffe.length > 300) s.zugriffe.length = 300;
  save('streamers.json', streamers);
  return rec;
}
function getStreamer(id) {
  return streamers.find((s) => s.id === id || ordnerSchluessel(s.bigoId) === ordnerSchluessel(id)) || null;
}

/**
 * Kennen wir die Person schon? Sucht in den Ordnern und – falls dort noch
 * nichts liegt – auch in den Akten. Drei Wege führen zu einem Treffer:
 *   1. dieselbe BIGO-ID          (sicher, danach wird zugeordnet)
 *   2. dieselbe Ausweisnummer    (dieselbe Person mit neuer BIGO-ID)
 *   3. derselbe Name + Alter     (schwacher Hinweis, nur zum Nachschauen)
 * Zurück kommt, was der Prüfer wissen muss – nicht die ganze Akte.
 */
function suchePerson({ bigoId, bigoName, docNumber, name, age }) {
  const norm = (x) => String(x || '').trim().toLowerCase();
  const nurZiffern = (x) => String(x || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const bId = norm(bigoId), dNr = nurZiffern(docNumber), nm = norm(name), alt = norm(age);
  const nick = String(bigoName || '').trim();
  if (!bId && !nick && !dNr && !nm) return null;

  const treffer = (ordner, grund, sicher) => ({
    grund, sicher,
    ordnerId: ordner.id, bigoId: ordner.bigoId, bigoName: ordner.bigoName || '',
    aliasse: ordner.aliasse || [],
    name: ordner.name || '', alter: ordner.alter || '',
    status: ordner.status || 'neu', art: ordner.art || 'streamer',
    auditionen: (ordner.auditions || []).length,
    letzteAudition: (ordner.auditions || []).map((a) => a.erstelltAm).sort().pop() || '',
    letzteAktivitaet: ordner.letzteAktivitaet || ordner.angelegtAm || '',
    vermerke: (ordner.eintraege || []).length,
    notiz: ordner.notiz || '',
  });

  // Zahl oder Name – beides führt zum Ordner. Der Weg wird mitgesagt, damit der
  // Prüfer weiss, worauf der Treffer beruht.
  const fund = ordnerFinden({ bigoId: bigoId, bigoName: bigoName || bigoId });
  if (fund) return treffer(fund.ordner, fund.weg === 'zahl' ? 'bigo' : 'bigoname', true);
  if (dNr) {
    // Die Ausweisnummer steht in den Akten, nicht im Ordner – über sie führt
    // der Weg zur BIGO-ID und damit zum Ordner.
    const f = cases.find((c) => nurZiffern(c.docNumber) && nurZiffern(c.docNumber) === dNr);
    if (f) {
      const t = ordnerFinden({ bigoId: f.bigoName, bigoName: f.bigoName });
      if (t) return { ...treffer(t.ordner, 'ausweis', true),
        andereBigoId: namSchluessel(f.bigoName) !== namSchluessel(bigoId || bigoName) ? f.bigoName : '' };
    }
  }
  if (nm) {
    const f = cases.find((c) => norm(c.verifiedName) === nm && (!alt || norm(c.age) === alt));
    if (f) {
      const t = ordnerFinden({ bigoId: f.bigoName, bigoName: f.bigoName });
      if (t) return treffer(t.ordner, 'name', false);
    }
  }
  return null;
}
/**
 * Ordner anlegen, ohne dass eine Audition stattgefunden hat.
 *
 * Wer schon im PK-Board mitläuft, soll auch hier eine Akte haben – sonst
 * fangen wir bei jedem bestehenden Streamer bei null an. Der Ordner ist von
 * Anfang an da, Vermerke lassen sich pflegen, und wenn später doch eine
 * Audition kommt, hängt sie sich einfach an.
 *
 * Gibt es den Ordner schon, wird NICHTS überschrieben – nur ergänzt, was
 * bisher leer war. Das Skript darf also jederzeit erneut laufen.
 */
function ordnerAnlegen({ bigoId, bigoName, name, alter, art, notiz, herkunft, status }) {
  const id = String(bigoId || '').trim();
  const nick = String(bigoName || '').trim();
  if (!id && !nick) return { angelegt: false, grund: 'keine-bigo-id' };
  const jetzt = new Date().toISOString();

  // Suchen über Zahl UND Namen – nicht nur über das eine Feld.
  const fund = ordnerFinden({ bigoId: id, bigoName: nick });
  const vorhanden = fund && fund.ordner;
  if (vorhanden) {
    // Nur Lücken füllen. Was das Team hier gepflegt hat, bleibt unangetastet.
    let geaendert = false;
    if (!vorhanden.name && name) { vorhanden.name = String(name).slice(0, 120); geaendert = true; }
    if (!vorhanden.alter && alter) { vorhanden.alter = String(alter).slice(0, 10); geaendert = true; }
    const zu = ordnerZuordnen(vorhanden, { bigoId: id, bigoName: nick });
    if (zu.length) geaendert = true;
    if (geaendert) save('streamers.json', streamers);
    return { angelegt: false, ergaenzt: geaendert, zugeordnet: zu, weg: fund.weg, ordner: vorhanden };
  }

  const ordner = {
    id: crypto.randomUUID(),
    bigoId: idSchluessel(id) || idSchluessel(nick) || id || nick,
    bigoName: nick || (idSchluessel(id) ? '' : id),
    aliasse: [],
    name: String(name || '').slice(0, 120),
    alter: String(alter || '').slice(0, 10),
    status: ['neu', 'aktiv', 'pausiert', 'abgelehnt', 'raus'].includes(status) ? status : 'aktiv',
    notiz: String(notiz || '').slice(0, 500),
    art: art === 'familie' ? 'familie' : 'streamer',
    // Woher kommt dieser Ordner? Ein übernommener sieht anders aus als einer,
    // der aus einer Audition entstanden ist – das soll man sehen.
    herkunft: String(herkunft || 'uebernommen').slice(0, 40),
    angelegtAm: jetzt, letzteAktivitaet: jetzt,
    auditions: [], eintraege: [],
  };
  streamers.push(ordner);
  save('streamers.json', streamers);
  return { angelegt: true, ordner };
}

/**
 * Eine fertige Audition in den Ordner des Streamers legen. Gibt es noch keinen
 * Ordner, wird er angelegt. Kommt dieselbe Audition ein zweites Mal (etwa beim
 * Nachschicken), wird der vorhandene Eintrag aktualisiert statt verdoppelt.
 */
function ablegen(paket) {
  const roh = String((paket.streamer && paket.streamer.bigoId) || '').trim();
  const rohName = String((paket.streamer && paket.streamer.bigoName) || '').trim();
  if (!roh && !rohName) return null;
  const jetzt = new Date().toISOString();

  // Erst suchen – über Zahl UND Namen. Sonst entsteht ein zweiter Ordner für
  // jemanden, den wir längst führen.
  const fund = ordnerFinden({ bigoId: roh, bigoName: rohName });
  let ordner = fund && fund.ordner;
  let zugeordnet = [];
  if (ordner) {
    zugeordnet = ordnerZuordnen(ordner, { bigoId: roh, bigoName: rohName });
  }
  const bigoId = idSchluessel(roh) || idSchluessel(rohName) || roh || rohName;
  if (!ordner) {
    ordner = {
      id: crypto.randomUUID(), bigoId,
      bigoName: rohName || (idSchluessel(roh) ? '' : roh),
      aliasse: [],
      name: String((paket.streamer && paket.streamer.name) || '').slice(0, 120),
      alter: String((paket.streamer && paket.streamer.alter) || '').slice(0, 10),
      status: 'neu', notiz: '',
      // Familie = engerer Kreis, sichtbar unter mein.4ever1.tv. Neue kommen
      // erst einmal als normale Streamer herein.
      art: 'streamer',
      angelegtAm: jetzt, letzteAktivitaet: jetzt,
      auditions: [],
    };
    streamers.push(ordner);
  }
  // Name und Alter nachziehen, falls sie beim ersten Mal fehlten
  if (!ordner.name && paket.streamer && paket.streamer.name) ordner.name = String(paket.streamer.name).slice(0, 120);
  if (!ordner.alter && paket.streamer && paket.streamer.alter) ordner.alter = String(paket.streamer.alter).slice(0, 10);
  // Wurde etwas zugeordnet, steht das als Vermerk in der Akte. Sonst wundert
  // sich später jemand, warum die Kennung anders lautet als früher.
  if (zugeordnet.length) {
    if (!Array.isArray(ordner.eintraege)) ordner.eintraege = [];
    ordner.eintraege.unshift({
      id: crypto.randomUUID(), text: 'Zugeordnet über die Audition: ' + zugeordnet.join(', ') + '.',
      author: 'System', kind: 'zuordnung', am: jetzt,
    });
  }

  const a = paket.audition || {};
  const eintrag = {
    auditionId: String(a.id || '').slice(0, 60),
    zugangsnummer: String(a.zugangsnummer || '').slice(0, 20),
    ergebnis: a.ergebnis === 'approved' ? 'approved' : (a.ergebnis === 'rejected' ? 'rejected' : 'open'),
    ablehnungsgrund: String(a.ablehnungsgrund || '').slice(0, 300),
    pruefer: String(a.pruefer || '').slice(0, 60),
    ausweisart: String(a.ausweisart || '').slice(0, 40),
    ausweisnummer: String(a.ausweisnummer || '').slice(0, 60),
    notiz: String(a.notiz || '').slice(0, 500),
    erstelltAm: String(a.erstelltAm || jetzt),
    // Was der Prüfer abgehakt hat und welcher Wortlaut galt – beides gehört
    // dauerhaft in den Ordner, nicht nur in die Akte auf der anderen Seite.
    // Die Fragen kommen als {label, checked} - hier wird daraus lesbarer Text,
    // damit im Ordner steht, was tatsaechlich abgehakt wurde.
    checkliste: Array.isArray(a.checkliste) ? a.checkliste.slice(0, 20).map((x) => {
      if (x && typeof x === 'object') return ((x.checked ? '\u2611 ' : '\u2610 ') + String(x.label || '')).slice(0, 300);
      return String(x).slice(0, 300);
    }) : [],
    texte: {
      vorlese: String((paket.texte && paket.texte.vorlese) || '').slice(0, 20000),
      begruessung: String((paket.texte && paket.texte.begruessung) || '').slice(0, 20000),
    },
    aufnahme: paket.aufnahme || null,
    protokoll: Array.isArray(paket.protokoll) ? paket.protokoll.slice(0, 200) : [],
    dateien: Array.isArray(paket.dateien) ? paket.dateien.slice(0, 20).map((d) => ({
      art: String(d.art || '').slice(0, 20), bezeichnung: String(d.bezeichnung || '').slice(0, 80),
      dateiname: String(d.dateiname || '').slice(0, 120),
    })) : [],
    eingegangenAm: jetzt,
  };
  const i = ordner.auditions.findIndex((x) => x.auditionId && x.auditionId === eintrag.auditionId);
  if (i >= 0) ordner.auditions[i] = eintrag; else ordner.auditions.unshift(eintrag);

  // Ordner-Status ergibt sich aus der jüngsten Audition
  if (eintrag.ergebnis === 'approved') ordner.status = 'aktiv';
  else if (eintrag.ergebnis === 'rejected' && ordner.status === 'neu') ordner.status = 'abgelehnt';
  ordner.letzteAktivitaet = jetzt;
  save('streamers.json', streamers);
  return ordner;
}
/**
 * Altersverifikation eintragen – ohne Audition.
 *
 * Für alle, die längst dabei sind: kein Gespräch, kein Teleprompter. Der
 * Prüfer sieht den Ausweis (live oder im Video), vergleicht ihn mit dem
 * Gesicht, hakt ab – fertig. Das Ergebnis bleibt dauerhaft in der Akte, mit
 * Datum, Prüfer und Grundlage. Wer bestanden hat, trägt den blauen Haken.
 *
 * Eine erneute Verifikation überschreibt die alte nicht: beide bleiben stehen,
 * damit man später nachvollziehen kann, was wann geprüft wurde.
 */
function verifikationEintragen(id, { geprueftVon, nameLautAusweis, ausweisart, ausweisnummer,
                                     geburtsdatum, ergebnis, notiz, grundlage }) {
  const s = getStreamer(id); if (!s) return null;
  if (!Array.isArray(s.verifikationen)) s.verifikationen = [];
  const jetzt = new Date().toISOString();
  const rec = {
    id: crypto.randomUUID(),
    ergebnis: ergebnis === 'bestanden' ? 'bestanden' : 'abgelehnt',
    geprueftVon: String(geprueftVon || 'Unbekannt').slice(0, 60),
    nameLautAusweis: String(nameLautAusweis || '').slice(0, 120),
    ausweisart: String(ausweisart || '').slice(0, 40),
    ausweisnummer: String(ausweisnummer || '').slice(0, 60),
    geburtsdatum: String(geburtsdatum || '').slice(0, 20),
    // Woran wurde geprüft: im Videogespräch, im Original vor Ort, aus der Akte
    grundlage: String(grundlage || '').slice(0, 80),
    notiz: String(notiz || '').slice(0, 500),
    am: jetzt,
  };
  s.verifikationen.unshift(rec);
  if (s.verifikationen.length > 50) s.verifikationen.length = 50;
  // Der blaue Haken hängt an der jüngsten bestandenen Prüfung.
  if (rec.ergebnis === 'bestanden') {
    s.verifiziert = { am: jetzt, von: rec.geprueftVon, grundlage: rec.grundlage };
    if (!s.name && rec.nameLautAusweis) s.name = rec.nameLautAusweis;
  } else {
    // Abgelehnt hebt einen früheren Haken auf – sonst stimmt die Anzeige nicht.
    s.verifiziert = null;
  }
  s.letzteAktivitaet = jetzt;
  save('streamers.json', streamers);
  return rec;
}

// ---- Vermerke im Streamer-Ordner ------------------------------------------
// Alles, was im Laufe der Zeit dazukommt: Anrufe, Absprachen, Auffälligkeiten.
function streamerEintraege(s) { if (!Array.isArray(s.eintraege)) s.eintraege = []; return s.eintraege; }
function addStreamerEintrag(id, { text, author, original }) {
  const s = getStreamer(id); if (!s) return null;
  const t = String(text || '').trim().slice(0, 4000); if (!t) return null;
  const rec = {
    id: crypto.randomUUID(), text: t,
    original: original && String(original).trim() !== t ? String(original).slice(0, 4000) : '',
    author: String(author || '').slice(0, 60),
    createdAt: new Date().toISOString(), editedAt: '', editedBy: '',
  };
  streamerEintraege(s).unshift(rec);          // neueste zuerst
  s.letzteAktivitaet = rec.createdAt;
  save('streamers.json', streamers); return rec;
}
function updateStreamerEintrag(id, eintragId, { text, editor }) {
  const s = getStreamer(id); if (!s) return false;
  const e = streamerEintraege(s).find((x) => x.id === eintragId); if (!e) return false;
  const t = String(text || '').trim().slice(0, 4000); if (!t) return false;
  e.text = t; e.editedAt = new Date().toISOString(); e.editedBy = String(editor || '').slice(0, 60);
  save('streamers.json', streamers); return true;
}
function deleteStreamerEintrag(id, eintragId) {
  const s = getStreamer(id); if (!s) return false;
  const liste = streamerEintraege(s);
  const i = liste.findIndex((x) => x.id === eintragId); if (i < 0) return false;
  liste.splice(i, 1); save('streamers.json', streamers); return true;
}

function setStreamer(id, { name, status, notiz, art }) {
  const s = getStreamer(id); if (!s) return null;
  if (name != null) s.name = String(name).slice(0, 120);
  if (status != null && ['neu', 'aktiv', 'pausiert', 'abgelehnt', 'weg'].includes(status)) s.status = status;
  if (notiz != null) s.notiz = String(notiz).slice(0, 2000);
  if (art != null && ['familie', 'streamer'].includes(art)) s.art = art;
  s.letzteAktivitaet = new Date().toISOString();
  save('streamers.json', streamers); return s;
}
function deleteStreamer(id) {
  const i = streamers.findIndex((s) => s.id === id); if (i < 0) return false;
  streamers.splice(i, 1); save('streamers.json', streamers); return true;
}
function streamerCount() { return streamers.length; }

/** Stand der Übergabe an mcp.4ever1.tv in der Akte festhalten. */
function setCaseMcp(caseId, { status, text }) {
  const c = getCase(caseId); if (!c) return null;
  c.mcpStatus = String(status || '').slice(0, 20);
  c.mcpText = String(text || '').slice(0, 300);
  c.mcpAt = new Date().toISOString();
  save('cases.json', cases); return c;
}
/** Aufnahme zu einer Zugangsnummer finden (eine Audition = eine Aufnahme). */
function getRecordingByCode(code) {
  const c = String(code || '').toUpperCase();
  if (!c) return null;
  return recordings.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).find((r) => String(r.code).toUpperCase() === c) || null;
}

/** Auswertung des Prüfers festhalten: taugt die Aufnahme etwas? */
function reviewRecording(id, data) {
  const rec = getRecording(id); if (!rec) return null;
  const q = String(data.quality || '');
  rec.quality = (q === 'ok' || q === 'bad') ? q : '';
  rec.reviewNote = String(data.note || '').slice(0, 300);
  rec.reviewedBy = String(data.by || '').slice(0, 60);
  rec.reviewedAt = new Date().toISOString();
  save('recordings.json', recordings);
  return rec;
}
function deleteRecording(id) {
  const i = recordings.findIndex((r) => r.id === id); if (i < 0) return false;
  const p = recPath(recordings[i].file); if (p) { try { fs.rmSync(p, { force: true }); } catch {} }
  recordings.splice(i, 1); save('recordings.json', recordings); return true;
}

// Löscht Akten + Aufnahmen, die älter als `days` Tage sind (Datenschutz-Frist).
function purgeOlderThan(days) {
  if (!days || days <= 0) return 0;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let n = 0;
  cases.slice().forEach((c) => { const t = new Date(c.createdAt).getTime(); if (t && t < cutoff) { deleteCase(c.id); n++; } });
  recordings.slice().forEach((r) => { const t = new Date(r.createdAt).getTime(); if (t && t < cutoff) { deleteRecording(r.id); n++; } });
  return n;
}

function getScript() { return typeof settings.script === 'string' ? settings.script : DEFAULT_SCRIPT; }
function setScript(text) { settings.script = String(text || '').slice(0, 8000); save('settings.json', settings); return true; }
function getIntro() { return typeof settings.intro === 'string' ? settings.intro : DEFAULT_INTRO; }
function setIntro(text) { settings.intro = String(text || '').slice(0, 8000); save('settings.json', settings); return true; }
function getAdminTotp() { return typeof settings.adminTotp === 'string' ? settings.adminTotp : ''; }
function setAdminTotp(secret) { settings.adminTotp = String(secret || ''); save('settings.json', settings); return true; }

// ---- Geräte-Bindung an/aus (vom Betreiber selbst geschaltet) ---------------
// Standardmäßig AUS: Erst wenn hier eingeschaltet wird, dürfen sich nur noch
// freigegebene Geräte anmelden. So kann sich niemand versehentlich aussperren.
function getDeviceLock(kind) {
  const k = kind === 'agent' ? 'deviceLockAgent' : 'deviceLockAdmin';
  return settings[k] === true;
}
function setDeviceLock(kind, on) {
  const k = kind === 'agent' ? 'deviceLockAgent' : 'deviceLockAdmin';
  settings[k] = !!on; save('settings.json', settings); return true;
}

// ---- Geräte-Bindung für Mitarbeiter (Prüfer) -------------------------------
// Wie beim Admin: ein Prüfer kommt nur von freigegebenen Geräten hinein.
// Gespeichert wird nur der Hash der Gerätekennung.
function agentDeviceList(a) { if (!Array.isArray(a.devices)) a.devices = []; return a.devices; }
function agentDevices(agentId) {
  const a = getAgentById(agentId); if (!a) return [];
  return agentDeviceList(a).map((d) => ({ id: d.id, name: d.name, addedAt: d.addedAt, lastSeen: d.lastSeen || '' }));
}
function findAgentDevice(agent, hash) {
  if (!agent || !hash) return null;
  return agentDeviceList(agent).find((d) => d.hash === hash) || null;
}
function addAgentDevice(agentId, { hash, name }) {
  const a = getAgentById(agentId); if (!a || !hash) return null;
  const list = agentDeviceList(a);
  if (list.some((d) => d.hash === hash)) return null;
  const rec = { id: crypto.randomUUID(), hash, name: String(name || 'Gerät').slice(0, 60), addedAt: new Date().toISOString(), lastSeen: '' };
  list.push(rec); save('agents.json', agents); return rec;
}
function touchAgentDevice(agentId, hash) {
  const a = getAgentById(agentId); if (!a) return false;
  const d = findAgentDevice(a, hash); if (!d) return false;
  d.lastSeen = new Date().toISOString(); save('agents.json', agents); return true;
}
function renameAgentDevice(agentId, deviceId, name) {
  const a = getAgentById(agentId); if (!a) return false;
  const d = agentDeviceList(a).find((x) => x.id === deviceId); if (!d) return false;
  d.name = String(name || '').slice(0, 60) || d.name;
  save('agents.json', agents); return true;
}
function removeAgentDevice(agentId, deviceId) {
  const a = getAgentById(agentId); if (!a) return false;
  const list = agentDeviceList(a); const i = list.findIndex((d) => d.id === deviceId);
  if (i < 0) return false;
  list.splice(i, 1); save('agents.json', agents); return true;
}
/** Alle Geräte eines Prüfers lösen – beim nächsten Login wird neu gebunden. */
function resetAgentDevices(agentId) {
  const a = getAgentById(agentId); if (!a) return false;
  a.devices = []; save('agents.json', agents); return true;
}

// ---- Anmelde-Protokoll (dauerhaft) -----------------------------------------
// Hält fest, wer sich wann angemeldet hat – und vor allem, wer es versucht hat.
// Bleibt anders als die Ereignisliste im Speicher auch nach einem Neustart
// erhalten. Verschlüsselt gespeichert, auf die letzten Einträge begrenzt.
const LOGIN_LOG_MAX = 800;
function loginLog() { if (!Array.isArray(settings.loginLog)) settings.loginLog = []; return settings.loginLog; }
function addLoginEvent({ ok, kind, who, ip, detail }) {
  const list = loginLog();
  list.push({
    at: new Date().toISOString(),
    ok: !!ok,
    kind: String(kind || 'login').slice(0, 20),      // admin | agent | passkey | device
    who: String(who || '').slice(0, 60),             // versuchter Benutzername
    ip: String(ip || '').slice(0, 60),
    detail: String(detail || '').slice(0, 120),      // z. B. Grund des Fehlschlags
  });
  if (list.length > LOGIN_LOG_MAX) list.splice(0, list.length - LOGIN_LOG_MAX);
  save('settings.json', settings); return true;
}
function listLoginEvents(limit) {
  const n = Math.max(1, Math.min(500, parseInt(limit, 10) || 200));
  return loginLog().slice(-n).reverse();
}
function loginFailCount(hours) {
  const since = Date.now() - (Math.max(1, parseInt(hours, 10) || 24) * 3600 * 1000);
  return loginLog().filter((e) => !e.ok && new Date(e.at).getTime() >= since).length;
}
function clearLoginLog() { settings.loginLog = []; save('settings.json', settings); return true; }

// ---- Protokoll-Einträge in der Akte ----------------------------------------
// Fortlaufende Notizen zu einer Akte (Teamleitung schreibt, Admin darf ändern).
function caseEntries(c) { if (!Array.isArray(c.entries)) c.entries = []; return c.entries; }
function addCaseEntry(caseId, { text, author, original, kind }) {
  const c = getCase(caseId); if (!c) return null;
  const t = String(text || '').trim().slice(0, 4000); if (!t) return null;
  const rec = {
    id: crypto.randomUUID(), text: t,
    original: original && String(original).trim() !== t ? String(original).slice(0, 4000) : '',
    author: String(author || '').slice(0, 60),
    // 'recording' = automatisch beim Auswerten der Aufnahme angelegt
    kind: String(kind || '').slice(0, 20),
    createdAt: new Date().toISOString(), editedAt: '', editedBy: '',
  };
  caseEntries(c).push(rec); save('cases.json', cases); return rec;
}
function updateCaseEntry(caseId, entryId, { text, editor }) {
  const c = getCase(caseId); if (!c) return false;
  const e = caseEntries(c).find((x) => x.id === entryId); if (!e) return false;
  const t = String(text || '').trim().slice(0, 4000); if (!t) return false;
  e.text = t; e.editedAt = new Date().toISOString(); e.editedBy = String(editor || '').slice(0, 60);
  save('cases.json', cases); return true;
}
function deleteCaseEntry(caseId, entryId) {
  const c = getCase(caseId); if (!c) return false;
  const list = caseEntries(c); const i = list.findIndex((x) => x.id === entryId);
  if (i < 0) return false;
  list.splice(i, 1); save('cases.json', cases); return true;
}

// ---- Geräte-Freigabe für den Admin-Bereich ---------------------------------
// Nur freigegebene Geräte dürfen sich anmelden. Jedes Gerät hat eine eigene,
// zufällige Kennung; gespeichert wird nur deren Hash (das Klartext-Geheimnis
// liegt allein im Browser des Geräts).
function adminDevices() { if (!Array.isArray(settings.adminDevices)) settings.adminDevices = []; return settings.adminDevices; }
function listAdminDevices() {
  return adminDevices().map((d) => ({ id: d.id, name: d.name, addedAt: d.addedAt, lastSeen: d.lastSeen || '' }));
}
function adminDeviceCount() { return adminDevices().length; }
function findAdminDevice(hash) {
  if (!hash) return null;
  return adminDevices().find((d) => d.hash === hash) || null;
}
function addAdminDevice({ hash, name }) {
  if (!hash) return null;
  const list = adminDevices();
  if (list.some((d) => d.hash === hash)) return null;
  const rec = { id: crypto.randomUUID(), hash, name: String(name || 'Gerät').slice(0, 60), addedAt: new Date().toISOString(), lastSeen: '' };
  list.push(rec); save('settings.json', settings); return rec;
}
function touchAdminDevice(hash) {
  const d = findAdminDevice(hash); if (!d) return false;
  d.lastSeen = new Date().toISOString(); save('settings.json', settings); return true;
}
function renameAdminDevice(id, name) {
  const d = adminDevices().find((x) => x.id === id); if (!d) return false;
  d.name = String(name || '').slice(0, 60) || d.name; save('settings.json', settings); return true;
}
function removeAdminDevice(id) {
  const list = adminDevices(); const i = list.findIndex((d) => d.id === id);
  if (i < 0) return false;
  list.splice(i, 1); save('settings.json', settings); return true;
}
// Figuren (Team-Avatare) + zugehöriger Erklär-Text – null = Standard im Client verwenden
function getFigures() { return Array.isArray(settings.figures) ? settings.figures : null; }
function setFigures(arr) { settings.figures = Array.isArray(arr) ? arr.slice(0, 3) : null; save('settings.json', settings); return true; }
function getFigureScript() { return typeof settings.figureScript === 'string' ? settings.figureScript : null; }
function setFigureScript(text) { settings.figureScript = (typeof text === 'string') ? text.slice(0, 8000) : null; save('settings.json', settings); return true; }

module.exports = {
  init, getScript, setScript, getIntro, setIntro, getAdminTotp, setAdminTotp,
  addCaseEntry, updateCaseEntry, deleteCaseEntry,
  addLoginEvent, listLoginEvents, loginFailCount, clearLoginLog,
  getDeviceLock, setDeviceLock,
  agentDevices, findAgentDevice, addAgentDevice, touchAgentDevice,
  removeAgentDevice, resetAgentDevices, renameAgentDevice,
  listAdminDevices, adminDeviceCount, findAdminDevice, addAdminDevice,
  touchAdminDevice, renameAdminDevice, removeAdminDevice,
  getFigures, setFigures, getFigureScript, setFigureScript,
  listAgents, getAgentByUsername, getAgentById, addAgent, verifyAgent,
  setAgentPassword, changeOwnPassword, lockAgent, unlockAgent, deleteAgent, agentCount,
  addPasskey, getAgentByPasskeyId, setPasskeyCounter, agentPasskeys,
  createCode, getCode, isCodeUsable, consumeCode, revokeCode, listCodes,
  suchePerson, ordnerAnlegen, ordnerFinden, ordnerZuordnen, idSchluessel, namSchluessel, listStreamersKurz, protokolliereZugriff, verifikationEintragen,
  saveCase, listCases, getCase, deleteCase, readDoc, purgeOlderThan,
  saveRecording, listRecordings, getRecording, readRecording, reviewRecording, deleteRecording,
  beginRecording, appendRecordingChunk, finishRecording, offeneAufnahmen, aufnahmenRetten,
  setCaseMcp, getRecordingByCode,
  ablegen, listStreamers, getStreamer, setStreamer, deleteStreamer, streamerCount,
  addStreamerEintrag, updateStreamerEintrag, deleteStreamerEintrag,
};
