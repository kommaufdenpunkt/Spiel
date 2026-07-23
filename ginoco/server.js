// Fahrschulportal - HTTP-Server und API.
// Ohne externe Pakete: nur eingebaute Node-Module.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
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
const APP_VERSION = "3.13.1";
// Einstellungen, die Schueler/Oeffentlichkeit sehen duerfen (Rest bleibt beim Fahrlehrer)
const PUBLIC_SETTINGS = ['instructor_name', 'instructor_phone', 'policy_text',
  'cancel_hours', 'lock_hours', 'booking_horizon_days', 'booking_horizon_days_rank2',
  'live_lead_min', 'lesson_min', 'break_min', 'start_time', 'last_start', 'max_per_week', 'release_time'];

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

function createSession(res, kind, studentId = null, secure = false) {
  const token = newToken();
  const expires = Date.now() + SESSION_DAYS * 864e5;
  db.prepare('INSERT INTO sessions(token,kind,student_id,expires) VALUES(?,?,?,?)')
    .run(token, kind, studentId, expires);
  res.setHeader('Set-Cookie',
    `fsp=${token}; HttpOnly; Path=/; Max-Age=${SESSION_DAYS * 86400}; SameSite=Lax${secure ? '; Secure' : ''}`);
  return token;
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
// Gefahrene Sonderfahrten je Art
function sonderCounts(studentId) {
  const rows = db.prepare(
    "SELECT lesson_type AS t, COUNT(*) AS n FROM bookings WHERE student_id=? AND status='done' AND (attended IS NULL OR attended=1) AND lesson_type IN ('ueberland','autobahn','nacht') GROUP BY lesson_type").all(studentId);
  const m = { ueberland: 0, autobahn: 0, nacht: 0 };
  for (const r of rows) m[r.t] = r.n;
  return m;
}
function sonderReq() {
  return { ueberland: Number(getSettingRaw('req_ueberland')), autobahn: Number(getSettingRaw('req_autobahn')), nacht: Number(getSettingRaw('req_nacht')) };
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
    const { pin } = await readBody(req);
    if (!verifyPassword(pin || '', getSettingRaw('instructor_pin'))) { noteLoginFail(req); return bad(res, 'Falsche PIN', 401); }
    noteLoginOk(req);
    const token = createSession(res, 'instructor', null, isHttps(req));
    return ok(res, { role: 'instructor', name: getSettingRaw('instructor_name'), token });
  }

  if (p === '/api/auth/register' && method === 'POST') {
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
      `SELECT id,date,start_time,duration_min,status,gearbox,plate,note,started_at,confirmed
       FROM bookings WHERE student_id = ? AND status != 'cancelled' ORDER BY date, start_time`
    ).all(sess.student_id);
    return ok(res, { bookings: rows, weekInfo: weekInfoForStudent(sess.student_id),
      progress: { ...studentRank(sess.student_id), sonder: sonderCounts(sess.student_id), req: sonderReq() } });
  }

  // Abwesenheit des Fahrlehrers (Urlaub / freie Tage) – nur fuer eingeloggte Nutzer
  if (p === '/api/away' && method === 'GET') {
    if (!sess) return bad(res, 'Bitte anmelden', 401);
    const rows = db.prepare(
      "SELECT date,type FROM day_overrides WHERE closed = 1 AND date >= ? ORDER BY date LIMIT 60").all(todayStr());
    return ok(res, { away: rows });
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
        return ok(res);
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
        return ok(res);
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
      if ('lesson_type' in b) { fields.push('lesson_type=?'); vals.push(['ueberland', 'autobahn', 'nacht', 'normal'].includes(b.lesson_type) ? b.lesson_type : null); }
      if ('meet_label' in b) { fields.push('meet_label=?'); vals.push(b.meet_label ? String(b.meet_label).trim() : null); }
      if ('meet_lat' in b) { fields.push('meet_lat=?'); vals.push(b.meet_lat == null || b.meet_lat === '' ? null : Number(b.meet_lat)); }
      if ('meet_lng' in b) { fields.push('meet_lng=?'); vals.push(b.meet_lng == null || b.meet_lng === '' ? null : Number(b.meet_lng)); }
      if ('attended' in b) { fields.push('attended=?'); vals.push(b.attended == null ? null : (b.attended ? 1 : 0)); }
      if ('late_minutes' in b) { fields.push('late_minutes=?'); vals.push(Math.max(0, Number(b.late_minutes) || 0)); }
      if ('duration_min' in b && Number(b.duration_min) > 0) { fields.push('duration_min=?'); vals.push(newDur); }
      if (!fields.length) return bad(res, 'Nichts zu aendern');
      vals.push(id);
      db.prepare(`UPDATE bookings SET ${fields.join(',')} WHERE id = ?`).run(...vals);

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
      db.prepare('UPDATE bookings SET start_time = ? WHERE id = ?').run(nt, r.id);
      moved++;
      if (r.student_id) {
        notify(r.student_id, 'shift', `Der Fahrlehrer verspätet sich um ${mins} Min. Dein Termin verschiebt sich auf ${nt} Uhr.`, date, r.id);
        logEvent('delay', { actor: 'instructor', studentId: r.student_id, bookingId: r.id, date,
          detail: `Verspätung ${mins} Min: ${r.start_time} → ${nt} Uhr` });
      }
    }
    return ok(res, { moved, minutes: mins });
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
      .filter((b) => b.h > -0.5 && b.h * 60 <= lead)
      .map((b) => ({ id: b.id, student_name: b.student_name, start_time: b.start_time, minutes: Math.round(b.h * 60) }));
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
    const upcoming = db.prepare(
      "SELECT * FROM bookings WHERE student_id=? AND date=? AND status='booked' ORDER BY start_time").all(sess.student_id, todayStr())
      .map((b) => ({ b, h: hoursUntil(b.date, b.start_time) }))
      .filter((x) => x.h > -0.25 && x.h * 60 <= lead)
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
    return ok(res, {
      window: true, active, busy: otherInProgress,
      booking: { date: bk.date, start_time: bk.start_time, minutesToStart: Math.round(upcoming.h * 60) },
      location: active ? { lat: live.lat, lng: live.lng, updated_at: live.updated_at } : null,
      meet, distanceKm, etaMin, lead, announce,
    });
  }

  // Schueler aktualisiert eigene Handynummer
  // Eigenes Profil ansehen (nur der Schüler selbst)
  if (p === '/api/my/profile' && method === 'GET') {
    if (!requireStudent()) return bad(res, 'Bitte anmelden', 401);
    const st = db.prepare('SELECT name,email,phone,birth_year,username,(photo IS NOT NULL) AS has_photo FROM students WHERE id=?').get(sess.student_id);
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
      `SELECT s.id,s.name,s.first_name,s.last_name,s.email,s.phone,s.username,s.birth_year,s.allowed_durations,s.created_at,
        s.home_label,s.home_lat,s.home_lng,s.archived_at,s.notes,
        (s.photo IS NOT NULL) AS has_photo,
        (SELECT COUNT(*) FROM bookings b WHERE b.student_id=s.id AND b.status='done') AS done_count
       FROM students s WHERE s.archived_at IS ${archived ? 'NOT NULL' : 'NULL'} ORDER BY s.name`
    ).all().map((s) => ({ ...s, ...studentRank(s.id), sonder: sonderCounts(s.id) }));
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
    if ('first_name' in b || 'last_name' in b || 'name' in b || 'phone' in b || 'email' in b || 'birth_year' in b || 'notes' in b) {
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
    return ok(res);
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

  // Ausbildungskarte lesen/speichern (Fahrlehrer)
  const trm = p.match(/^\/api\/students\/(\d+)\/training$/);
  if (trm && method === 'GET') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const st = db.prepare('SELECT training FROM students WHERE id=?').get(Number(trm[1]));
    if (!st) return bad(res, 'Schüler nicht gefunden', 404);
    let training = {};
    try { training = st.training ? JSON.parse(st.training) : {}; } catch {}
    return ok(res, { training });
  }
  if (trm && method === 'PUT') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const b = await readBody(req);
    const t = (b && typeof b.training === 'object' && b.training) ? b.training : {};
    // nur boolesche true-Werte speichern, kompakt halten
    const clean = {};
    for (const k of Object.keys(t)) if (t[k]) clean[String(k).slice(0, 80)] = 1;
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
      'weekly_target_h', 'daily_target_h', 'weekly_lo_h', 'monthly_target_h', 'monthly_max_h', 'workdays', 'max_per_week',
      'booking_horizon_days', 'cancel_hours', 'lock_hours', 'release_time', 'short_day_last_start',
      'vacation_credit_min', 'vacation_days_left', 'late_grace_min', 'policy_text',
      'instructor_phone', 'avg_speed_kmh', 'live_lead_min',
      'meet_default_label', 'meet_default_lat', 'meet_default_lng',
      'anonymous_swaps', 'req_ueberland', 'req_autobahn', 'req_nacht',
      'rank2_min_lessons', 'booking_horizon_days_rank2'];
    const emptyOk = new Set(['instructor_phone', 'meet_default_label', 'meet_default_lat', 'meet_default_lng', 'policy_text']);
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

// Slots eines Tages inkl. Status (frei / gebucht / geblockt)
function buildDaySlots(date, studentId = null) {
  const workdays = getSettingRaw('workdays').split(',').map(Number);
  const ov = getOverride(date);
  const isWorkday = !(ov && ov.closed) && workdays.includes(isoDow(date));
  const notOpenYet = !dateOpenForStudents(date, studentId);
  const grid = slotGrid(date);
  const bookings = db.prepare(
    "SELECT * FROM bookings WHERE date = ? AND status != 'cancelled'").all(date);
  const blocks = db.prepare('SELECT * FROM blocks WHERE date = ?').all(date);
  const isToday = date === todayStr();
  const now = nowHHMM();

  const slots = grid.map((g) => {
    const gStart = toMin(g.start), gEnd = gStart + g.duration;
    const booking = bookings.find((b) => b.start_time === g.start);
    // auch von einer laengeren Buchung (z.B. 120 Min) ueberlappte Slots sind belegt
    const overlapBooking = booking || bookings.find((b) => overlaps(gStart, gEnd, toMin(b.start_time), toMin(b.start_time) + b.duration_min));
    const blocked = blocks.find((bl) => overlaps(gStart, gEnd, toMin(bl.start_time), toMin(bl.end_time)));
    const past = isToday && gStart <= toMin(now);
    let state = 'free';
    if (booking) state = booking.status === 'offered' ? 'offered' : 'booked';
    else if (overlapBooking) state = 'booked';
    else if (blocked) state = 'blocked';
    else if (!isWorkday) state = 'closed';
    else if (past) state = 'past';
    else if (notOpenYet) state = 'toofar';
    return {
      start: g.start, end: g.end, duration: g.duration, state,
      blockTitle: blocked ? blocked.title : null,
      bookedByMe: false, // wird clientseitig anhand my/bookings gesetzt
    };
  });
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
  const moves = [];
  for (const b of movable) {
    let t = cursor;
    let changed = true;
    while (changed) {   // an Hindernissen vorbeischieben (inkl. Pause)
      changed = false;
      for (const o of obstacles) {
        if (overlaps(t, t + b.duration_min, o.s, o.e)) { t = o.e + brk; changed = true; }
      }
    }
    moves.push({ id: b.id, from: b.start_time, to: toHHMM(t),
      student_name: b.student_name, student_id: b.student_id, duration: b.duration_min });
    cursor = t + b.duration_min + brk;
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

// Kommende Schueler-Termine, die nicht (mehr) auf dem aktuellen Raster liegen
function misalignedDays() {
  const rows = db.prepare(
    "SELECT DISTINCT date FROM bookings WHERE status IN ('booked','offered') AND student_id IS NOT NULL AND date >= ? ORDER BY date").all(todayStr());
  const days = [];
  for (const { date } of rows) {
    const grid = new Set(slotGrid(date).map((g) => g.start));
    const off = db.prepare("SELECT start_time FROM bookings WHERE date=? AND status IN ('booked','offered') AND student_id IS NOT NULL").all(date)
      .filter((bk) => !grid.has(bk.start_time));
    if (off.length) days.push({ date, count: off.length });
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

function createBooking(res, sess, body) {
  const s = getSettings();
  const date = body.date;
  const start = body.start_time;
  if (!date || !start) return bad(res, 'Datum und Uhrzeit noetig');

  const isInstructor = sess.kind === 'instructor';
  const duration = Number(body.duration_min) > 0 ? Number(body.duration_min) : s.lesson_min;

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

    // Passt der Start ins (tagesabhaengige) Raster?
    const grid = slotGrid(date);
    if (!grid.some((g) => g.start === start))
      return bad(res, 'Ungueltige Uhrzeit');

    // Erlaubte Dauer fuer diesen Schueler?
    const stu = db.prepare('SELECT allowed_durations FROM students WHERE id = ?').get(sess.student_id);
    const allowed = (stu?.allowed_durations || '80').split(',').map(Number);
    if (!allowed.includes(duration))
      return bad(res, `Fuer dich sind nur ${allowed.join('/')} Minuten freigegeben.`);

    // Nicht ueber das regulaere Arbeitsende hinaus (z.B. 120 Min am letzten Slot)
    const lastSlotEnd = toMin((ov && ov.last_start) || getSettingRaw('last_start')) + s.lesson_min;
    if (toMin(start) + duration > lastSlotEnd)
      return bad(res, `Diese Länge passt an diesem Slot nicht mehr in den Tag (Ende spätestens ${toHHMM(lastSlotEnd)} Uhr). Wähle einen früheren Slot.`);

    // Der letzte Slot des Tages nur als volle Stunde (>= 80 Min), keine 40-Min-Kurzstunde
    const lastGridStart = grid.length ? grid[grid.length - 1].start : null;
    if (start === lastGridStart && duration < 80)
      return bad(res, 'Der letzte Slot des Tages ist nur als 80- oder 120-Minuten-Stunde buchbar. Wähle einen früheren Slot für eine kürzere Stunde.');
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
  }

  // Vom Fahrlehrer FÜR EINEN SCHÜLER eingetragen -> reserviert (confirmed=0), der
  // Schüler bestätigt. Selbst gebucht oder Fahrlehrer-eigener Block -> gleich bestätigt (1).
  const confirmed = (isInstructor && studentId) ? 0 : 1;
  const info = db.prepare(
    `INSERT INTO bookings(student_id,date,start_time,duration_min,status,title,note,confirmed,created_at)
     VALUES(?,?,?,?,?,?,?,?,?)`
  ).run(studentId, date, start, duration, 'booked',
    body.title ? String(body.title).trim() : null,
    body.note ? String(body.note).trim() : null, confirmed, new Date().toISOString());
  const bid = Number(info.lastInsertRowid);
  logEvent('book', { actor: isInstructor ? 'instructor' : 'student', studentId, bookingId: bid, date,
    detail: `${wdShort(date)} ${dmy(date)} ${start} Uhr (${duration} Min)${isInstructor ? ' – vom Fahrlehrer eingetragen' + (studentId ? ' (reserviert)' : '') : ''}` });
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
  // Erinnerungen im Hintergrund pruefen (alle 5 Minuten)
  try { sendDueReminders(); } catch (e) { console.error(e); }
  setInterval(() => { try { sendDueReminders(); } catch (e) { console.error(e); } }, 5 * 60 * 1000);
});
