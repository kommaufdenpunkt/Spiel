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
const SESSION_DAYS = 30;

// ---------- kleine Helfer ----------
const json = (res, code, data) => {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
};
const ok = (res, data = {}) => json(res, 200, data);
const bad = (res, msg, code = 400) => json(res, code, { error: msg });

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

function createSession(res, kind, studentId = null) {
  const token = newToken();
  const expires = Date.now() + SESSION_DAYS * 864e5;
  db.prepare('INSERT INTO sessions(token,kind,student_id,expires) VALUES(?,?,?,?)')
    .run(token, kind, studentId, expires);
  res.setHeader('Set-Cookie',
    `fsp=${token}; HttpOnly; Path=/; Max-Age=${SESSION_DAYS * 86400}; SameSite=Lax`);
  return token;
}

function getSession(req) {
  const token = parseCookies(req).fsp;
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
// Montag der Woche zu einem Datum
function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (dow - 1));
  return d.toISOString().slice(0, 10);
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
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

function getOverride(date) {
  return db.prepare('SELECT * FROM day_overrides WHERE date = ?').get(date) || null;
}

// Slot-Raster fuer ein Datum erzeugen (beruecksichtigt Tages-Ausnahmen / kurze Tage)
function slotGrid(date) {
  const s = getSettings();
  const step = s.lesson_min + s.break_min;
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
function dateOpenForStudents(date) {
  const horizon = Number(getSettingRaw('booking_horizon_days'));
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
    const st = db.prepare('SELECT id,name,email,phone,allowed_durations FROM students WHERE id = ?').get(sess.student_id);
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
    const { pin } = await readBody(req);
    if (!verifyPassword(pin || '', getSettingRaw('instructor_pin'))) return bad(res, 'Falsche PIN', 401);
    createSession(res, 'instructor');
    return ok(res, { role: 'instructor', name: getSettingRaw('instructor_name') });
  }

  if (p === '/api/auth/register' && method === 'POST') {
    const { code, name, email, phone, password } = await readBody(req);
    if (!code || !name || !email || !password) return bad(res, 'Bitte alle Pflichtfelder ausfuellen');
    if (String(password).length < 6) return bad(res, 'Passwort muss mind. 6 Zeichen haben');
    const c = db.prepare('SELECT * FROM codes WHERE code = ?').get(String(code).trim().toUpperCase());
    if (!c) return bad(res, 'Ungueltiger Code');
    if (c.used) return bad(res, 'Dieser Code wurde bereits verwendet');
    const mail = String(email).trim().toLowerCase();
    if (db.prepare('SELECT 1 FROM students WHERE email = ?').get(mail))
      return bad(res, 'E-Mail ist bereits registriert');
    const info = db.prepare('INSERT INTO students(name,email,phone,pass,created_at) VALUES(?,?,?,?,?)')
      .run(String(name).trim(), mail, phone ? String(phone).trim() : null, hashPassword(password), new Date().toISOString());
    const sid = Number(info.lastInsertRowid);
    db.prepare('UPDATE codes SET used = 1, student_id = ? WHERE code = ?').run(sid, c.code);
    createSession(res, 'student', sid);
    return ok(res, { role: 'student', id: sid, name });
  }

  if (p === '/api/auth/login' && method === 'POST') {
    const { email, password } = await readBody(req);
    const st = db.prepare('SELECT * FROM students WHERE email = ?').get(String(email || '').trim().toLowerCase());
    if (!st || !verifyPassword(password || '', st.pass)) return bad(res, 'E-Mail oder Passwort falsch', 401);
    createSession(res, 'student', st.id);
    return ok(res, { role: 'student', id: st.id, name: st.name });
  }

  // ===== Oeffentliche Einstellungen (Slot-Laenge etc. fuer Anzeige) =====
  if (p === '/api/settings' && method === 'GET') {
    return ok(res, { settings: getSettings() });
  }

  // ===== STUDENT: Slots ansehen & buchen =====
  if (p === '/api/slots' && method === 'GET') {
    if (!requireStudent() && !requireInstructor()) return bad(res, 'Bitte anmelden', 401);
    const date = url.searchParams.get('date') || todayStr();
    return ok(res, { date, ...buildDaySlots(date) });
  }

  if (p === '/api/my/bookings' && method === 'GET') {
    if (!requireStudent()) return bad(res, 'Bitte anmelden', 401);
    const rows = db.prepare(
      `SELECT id,date,start_time,duration_min,status,gearbox,plate,note
       FROM bookings WHERE student_id = ? AND status != 'cancelled' ORDER BY date, start_time`
    ).all(sess.student_id);
    return ok(res, { bookings: rows, weekInfo: weekInfoForStudent(sess.student_id) });
  }

  if (p === '/api/bookings' && method === 'POST') {
    if (!requireStudent() && !requireInstructor()) return bad(res, 'Bitte anmelden', 401);
    const body = await readBody(req);
    return createBooking(res, sess, body);
  }

  // /api/bookings/:id  (DELETE = stornieren, PATCH = aktualisieren)
  const bm = p.match(/^\/api\/bookings\/(\d+)$/);
  if (bm) {
    const id = Number(bm[1]);
    const bk = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    if (!bk) return bad(res, 'Buchung nicht gefunden', 404);

    if (method === 'DELETE') {
      if (requireInstructor()) {
        db.prepare("UPDATE bookings SET status='cancelled' WHERE id = ?").run(id);
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
      if ('duration_min' in b && Number(b.duration_min) > 0) { fields.push('duration_min=?'); vals.push(newDur); }
      if (!fields.length) return bad(res, 'Nichts zu aendern');
      vals.push(id);
      db.prepare(`UPDATE bookings SET ${fields.join(',')} WHERE id = ?`).run(...vals);
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
    db.prepare("UPDATE bookings SET status='offered' WHERE id = ?").run(bk.id);
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
    return ok(res);
  }
  // Angebotene Stunden anderer Schueler ansehen
  if (p === '/api/offers' && method === 'GET') {
    if (!requireStudent()) return bad(res, 'Bitte anmelden', 401);
    const rows = db.prepare(
      `SELECT id,date,start_time,duration_min FROM bookings
       WHERE status='offered' AND student_id != ? AND date >= ?
       ORDER BY date, start_time`).all(sess.student_id, todayStr());
    // nur zukuenftige und Stunden, die der Schueler ueberhaupt nehmen koennte
    const offers = rows.filter((r) => hoursUntil(r.date, r.start_time) > 0);
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
    db.prepare("UPDATE bookings SET student_id = ?, status='booked' WHERE id = ?").run(sess.student_id, bk.id);
    return ok(res);
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
    const rows = db.prepare(
      `SELECT s.id,s.name,s.email,s.phone,s.allowed_durations,s.created_at,
        (SELECT COUNT(*) FROM bookings b WHERE b.student_id=s.id AND b.status='done') AS done_count
       FROM students s ORDER BY s.name`
    ).all();
    return ok(res, { students: rows });
  }
  // Erlaubte Slot-Laengen eines Schuelers setzen (z.B. 40-Min-Ausnahme)
  const stm = p.match(/^\/api\/students\/(\d+)$/);
  if (stm && method === 'PATCH') {
    if (!requireInstructor()) return bad(res, 'Nur der Fahrlehrer', 403);
    const b = await readBody(req);
    const durs = Array.isArray(b.allowed_durations) ? b.allowed_durations : String(b.allowed_durations || '').split(',');
    const clean = [...new Set(durs.map(Number).filter((n) => n > 0))].sort((a, z) => a - z);
    if (!clean.length) return bad(res, 'Mindestens eine Dauer noetig');
    db.prepare('UPDATE students SET allowed_durations = ? WHERE id = ?').run(clean.join(','), Number(stm[1]));
    return ok(res, { allowed_durations: clean.join(',') });
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
    if (!b.date) return bad(res, 'Datum noetig');
    const closed = b.closed ? 1 : 0;
    let lastStart = b.last_start || null;
    if (b.short && !lastStart) lastStart = getSettingRaw('short_day_last_start'); // Schnell-Aktion "kurzer Tag"
    if (!closed && lastStart && b.start_time && toMin(lastStart) < toMin(b.start_time))
      return bad(res, 'Letzter Slot darf nicht vor dem Arbeitsbeginn liegen');
    db.prepare(`INSERT INTO day_overrides(date,start_time,last_start,closed,note,created_at)
      VALUES(?,?,?,?,?,?)
      ON CONFLICT(date) DO UPDATE SET start_time=excluded.start_time,last_start=excluded.last_start,closed=excluded.closed,note=excluded.note`)
      .run(b.date, closed ? null : (b.start_time || null), closed ? null : lastStart, closed, b.note ? String(b.note).trim() : null, new Date().toISOString());
    return ok(res);
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
    const { date, start_time, end_time, title, type, count_hours } = await readBody(req);
    if (!date || !start_time || !end_time || !title) return bad(res, 'Datum, Zeit und Titel noetig');
    if (toMin(end_time) <= toMin(start_time)) return bad(res, 'Ende muss nach dem Start liegen');
    db.prepare('INSERT INTO blocks(date,start_time,end_time,title,type,count_hours,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(date, start_time, end_time, String(title).trim(), type || 'block',
        count_hours === false ? 0 : 1, new Date().toISOString());
    return ok(res);
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
    const allowed = ['instructor_name', 'start_time', 'last_start', 'lesson_min', 'break_min',
      'weekly_target_h', 'daily_target_h', 'weekly_lo_h', 'workdays', 'max_per_week',
      'booking_horizon_days', 'cancel_hours', 'lock_hours', 'release_time', 'short_day_last_start'];
    for (const k of allowed) {
      if (k in b && b[k] !== '' && b[k] != null) setSettingRaw(k, b[k]);
    }
    if (b.new_pin) {
      if (String(b.new_pin).length < 4) return bad(res, 'PIN muss mind. 4 Zeichen haben');
      setSettingRaw('instructor_pin', hashPassword(String(b.new_pin)));
    }
    return ok(res, { settings: getSettings() });
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

// Slots eines Tages inkl. Status (frei / gebucht / geblockt)
function buildDaySlots(date) {
  const workdays = getSettingRaw('workdays').split(',').map(Number);
  const ov = getOverride(date);
  const isWorkday = !(ov && ov.closed) && workdays.includes(isoDow(date));
  const notOpenYet = !dateOpenForStudents(date);
  const grid = slotGrid(date);
  const bookings = db.prepare(
    "SELECT * FROM bookings WHERE date = ? AND status != 'cancelled'").all(date);
  const blocks = db.prepare('SELECT * FROM blocks WHERE date = ?').all(date);
  const isToday = date === todayStr();
  const now = nowHHMM();

  const slots = grid.map((g) => {
    const gEnd = toMin(g.start) + g.duration;
    const booking = bookings.find((b) => b.start_time === g.start);
    const blocked = blocks.find((bl) => overlaps(toMin(g.start), gEnd, toMin(bl.start_time), toMin(bl.end_time)));
    const past = isToday && toMin(g.start) <= toMin(now);
    let state = 'free';
    if (booking) state = booking.status === 'offered' ? 'offered' : 'booked';
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
    if (!dateOpenForStudents(date)) {
      const horizon = Number(getSettingRaw('booking_horizon_days'));
      const rel = getSettingRaw('release_time');
      return bad(res, `Dieser Tag ist noch nicht buchbar (Freigabe bis ${horizon} Tage im Voraus, taeglich ab ${rel} Uhr).`);
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

  const info = db.prepare(
    `INSERT INTO bookings(student_id,date,start_time,duration_min,status,title,note,created_at)
     VALUES(?,?,?,?,?,?,?,?)`
  ).run(studentId, date, start, duration, 'booked',
    body.title ? String(body.title).trim() : null,
    body.note ? String(body.note).trim() : null, new Date().toISOString());
  return ok(res, { id: Number(info.lastInsertRowid) });
}

// Statistik (Tacho): gefahrene/gebuchte Stunden Tag & Woche
function statsFor(ref) {
  const s = getSettings();
  const day = ref;
  const { from, to } = weekStartEnd(ref);

  const sumMinutes = (whereDate, params) => {
    const bk = db.prepare(
      `SELECT COALESCE(SUM(duration_min),0) AS m FROM bookings
       WHERE ${whereDate} AND status != 'cancelled'`).get(...params).m;
    const blk = db.prepare(
      `SELECT COALESCE(SUM((strftime('%s','2000-01-01 '||end_time)-strftime('%s','2000-01-01 '||start_time))/60),0) AS m
       FROM blocks WHERE ${whereDate} AND count_hours = 1`).get(...params).m;
    return bk + blk;
  };

  const dayMin = sumMinutes('date = ?', [day]);
  const weekMin = sumMinutes('date BETWEEN ? AND ?', [from, to]);

  // gefahren (done) getrennt ausweisen
  const dayDone = db.prepare("SELECT COALESCE(SUM(duration_min),0) AS m FROM bookings WHERE date = ? AND status='done'").get(day).m;
  const weekDone = db.prepare("SELECT COALESCE(SUM(duration_min),0) AS m FROM bookings WHERE date BETWEEN ? AND ? AND status='done'").get(from, to).m;

  // pro Wochentag (fuer kleines Balken-Bild)
  const perDay = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, i);
    perDay.push({ date: d, minutes: sumMinutes('date = ?', [d]) });
  }

  return {
    day, from, to,
    daily: { minutes: dayMin, doneMinutes: dayDone, targetH: s.daily_target_h },
    weekly: { minutes: weekMin, doneMinutes: weekDone, targetH: s.weekly_target_h, loH: s.weekly_lo_h },
    perDay,
    settings: s,
  };
}

// ---------- statische Dateien ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.json': 'application/json',
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
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return await serveStatic(req, res, url);
  } catch (err) {
    console.error(err);
    bad(res, 'Serverfehler', 500);
  }
});

server.listen(PORT, () => {
  console.log(`\n  Fahrschulportal laeuft auf  http://localhost:${PORT}\n`);
  console.log(`  Fahrlehrer-Login: Standard-PIN 1234 (bitte in den Einstellungen aendern)\n`);
});
