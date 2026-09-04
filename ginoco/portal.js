// Portal-System: ein Datentopf, mehrere Zugänge.
//   Fahrschüler · Fahrlehrer · Büro · Abrechnung (fsmanager/DataPart) · Steuerbüro · Inhaber (Admin)
// Dieses Modul bündelt alles, was über den einzelnen Fahrlehrer hinausgeht:
//   Team-Konten & Rollen, Fahrzeuge (Schaltwagen-Uhr), Preise & Abrechnung,
//   Führerscheinklassen, Urlaub/Krankmeldung, Theorieunterricht mit QR-Anwesenheit.
// Es wird von server.js mit den nötigen Helfern (db, ok, bad, push …) verdrahtet.
import { createHmac, randomBytes } from 'node:crypto';

// ---------- Rollen ----------
export const ROLES = {
  admin:      { label: 'Inhaber / Admin',   icon: '👑' },
  fahrlehrer: { label: 'Fahrlehrer',        icon: '🚗' },
  buero:      { label: 'Büro',              icon: '🏢' },
  abrechnung: { label: 'Abrechnung',        icon: '🧾' },
  steuer:     { label: 'Steuerbüro',        icon: '📊' },
};
// Welche Bereiche des Fahrlehrer-APIs (server.js) ein Team-Konto mitbenutzen darf.
// admin & fahrlehrer: alles (Kalender, Schüler, …). Büro: nur Schülerverwaltung.
function staffAllowedPath(role, p) {
  if (role === 'admin' || role === 'fahrlehrer') return true;
  if (role === 'buero') return /^\/api\/(students|codes|instructor\/(signups|events|messages|overview))/.test(p);
  return false;
}

// ---------- Führerscheinklassen (inkl. Schlüsselzahlen / Aufstieg) ----------
export const CLASSES = [
  ['AM',   'Kleinkraftrad / Roller (AM)'],
  ['A1',   'Leichtkraftrad (A1)'],
  ['A2',   'Motorrad bis 35 kW (A2)'],
  ['A',    'Motorrad (A)'],
  ['A1>A2','Aufstieg A1 → A2'],
  ['A2>A', 'Aufstieg A2 → A'],
  ['B',    'Pkw (B)'],
  ['B197', 'Pkw – Automatik mit Schalt-Nachweis (B197)'],
  ['B96',  'Pkw mit Anhänger bis 4,25 t (B96)'],
  ['BE',   'Pkw mit Anhänger (BE)'],
  ['C1',   'Lkw bis 7,5 t (C1)'],
  ['C1E',  'Lkw bis 7,5 t mit Anhänger (C1E)'],
  ['C',    'Lkw (C)'],
  ['CE',   'Lkw mit Anhänger (CE)'],
  ['L',    'Traktor (L)'],
  ['T',    'Traktor (T)'],
];
const CLASS_KEYS = new Set(CLASSES.map((c) => c[0]));

// Standard-Preisliste (Euro). Fahrstunde = 1 Einheit à price_unit_min (Standard 40 Min).
// Im Team-Portal unter „Preise" für jede Klasse anpassbar.
function defaultPrices() {
  const row = (grund, fs, sonder, pt, pp) => ({ grund, fahrstunde: fs, sonderfahrt: sonder, pruef_theorie: pt, pruef_praxis: pp });
  return {
    AM: row(250, 40, 45, 60, 120), A1: row(350, 45, 55, 70, 180), A2: row(400, 48, 58, 70, 200), A: row(450, 50, 60, 70, 220),
    'A1>A2': row(200, 48, 58, 0, 200), 'A2>A': row(200, 50, 60, 0, 220),
    B: row(450, 45, 55, 80, 250), B197: row(450, 45, 55, 80, 250), B96: row(150, 50, 60, 0, 0), BE: row(250, 55, 65, 0, 220),
    C1: row(500, 70, 80, 90, 300), C1E: row(500, 75, 85, 90, 320), C: row(600, 80, 90, 90, 350), CE: row(600, 85, 95, 90, 380),
    L: row(200, 45, 50, 60, 120), T: row(300, 55, 60, 60, 180),
  };
}

export function createPortal(ctx) {
  const { db, ok, bad, readBody, hashPassword, verifyPassword, passwordProblem,
    getSettingRaw, setSettingRaw, getSettings, createSession, loginBlocked, noteLoginFail, noteLoginOk,
    isHttps, logEvent, notify, pushToInstructor, pushRaw } = ctx;

  const nowIso = () => new Date().toISOString();
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  const esc = (s) => String(s ?? '');

  // ---------- Wer ist da? ----------
  // Inhaber (PIN-Login, kind='instructor') hat alle Rollen. Team-Konten genau ihre Rolle.
  function who(sess) {
    if (!sess) return null;
    if (sess.kind === 'instructor') return { kind: 'owner', role: 'admin', id: 0, name: getSettingRaw('instructor_name') || 'Inhaber', roles: Object.keys(ROLES) };
    if (sess.kind === 'staff') {
      const st = db.prepare('SELECT id,name,role,phone,email,color,active,vacation_days FROM staff WHERE id=?').get(sess.staff_id);
      if (!st || !st.active) return null;
      return { kind: 'staff', role: st.role, id: st.id, name: st.name, phone: st.phone, email: st.email, color: st.color, vacation_days: st.vacation_days, roles: [st.role] };
    }
    if (sess.kind === 'student') return { kind: 'student', role: 'student', id: sess.student_id, roles: ['student'] };
    return null;
  }
  const can = (w, ...roles) => !!w && (w.kind === 'owner' || roles.includes(w.role));
  const isTeam = (w) => !!w && (w.kind === 'owner' || w.kind === 'staff');

  // ---------- Preise ----------
  function priceList() {
    let saved = {};
    try { saved = JSON.parse(getSettingRaw('price_list') || '{}') || {}; } catch {}
    const base = defaultPrices();
    for (const k of Object.keys(saved)) base[k] = { ...(base[k] || {}), ...saved[k] };
    return base;
  }
  const unitMin = () => Math.max(10, Number(getSettingRaw('price_unit_min')) || 40);
  const noshowPct = () => Math.min(100, Math.max(0, Number(getSettingRaw('price_noshow_pct') || 75)));
  // Preis einer Fahrstunde in Cent: Einheiten (Dauer / Einheit, gerundet) × Satz der Klasse.
  function lessonPriceCents(b, licenseClass) {
    if (b.price_cents != null) return b.price_cents;           // eingefroren beim Abrechnen
    const pl = priceList()[licenseClass] || priceList().B;
    const units = Math.max(1, Math.round((Number(b.duration_min) || 0) / unitMin()));
    const sonder = ['ueberland', 'autobahn', 'nacht'].includes(b.lesson_type);
    let euro = units * (sonder ? pl.sonderfahrt : pl.fahrstunde);
    if (b.attended === 0) euro = euro * noshowPct() / 100;
    return Math.round(euro * 100);
  }

  // ---------- Push an das Team ----------
  function staffName(kind, id) {
    if (kind === 'instructor') return getSettingRaw('instructor_name') || 'Inhaber';
    const s = db.prepare('SELECT name FROM staff WHERE id=?').get(id); return s ? s.name : 'Team';
  }
  function pushToTeam(message, url = '/portal', { exceptKind = null, exceptId = null, roles = ['admin', 'fahrlehrer'] } = {}) {
    try {
      if (!(exceptKind === 'instructor')) pushToInstructor(message, url);
      const subs = db.prepare(`SELECT ps.* FROM push_subscriptions ps JOIN staff s ON s.id = ps.staff_id
        WHERE ps.kind='staff' AND s.active=1 AND s.role IN (${roles.map(() => '?').join(',')})`).all(...roles);
      for (const s of subs) {
        if (exceptKind === 'staff' && s.staff_id === exceptId) continue;
        pushRaw(s, message, url, 'Ginoco Team');
      }
    } catch (e) { console.error('pushToTeam', e); }
  }

  // ---------- Fahrzeuge ----------
  function vehicleStatus(v, now = Date.now()) {
    const nowI = new Date(now).toISOString();
    const cur = db.prepare(`SELECT * FROM vehicle_bookings WHERE vehicle_id=? AND returned_at IS NULL AND start_at<=? AND end_at>? ORDER BY start_at LIMIT 1`).get(v.id, nowI, nowI);
    const next = db.prepare(`SELECT * FROM vehicle_bookings WHERE vehicle_id=? AND returned_at IS NULL AND start_at>? ORDER BY start_at LIMIT 5`).all(v.id, nowI);
    return { ...v, shared: !!v.shared, active: !!v.active, current: cur || null, upcoming: next,
      free: !cur, free_until: cur ? null : (next[0] ? next[0].start_at : null) };
  }
  function vehicleConflict(vehicleId, startIso, endIso, ignoreId = 0) {
    return db.prepare(`SELECT id,by_name,start_at,end_at FROM vehicle_bookings WHERE vehicle_id=? AND id<>? AND returned_at IS NULL AND start_at<? AND end_at>? LIMIT 1`)
      .get(vehicleId, ignoreId, endIso, startIso);
  }
  const hhmm = (iso) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const dmy = (iso) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`; };

  // ---------- Theorie-Codes ----------
  const THEORY_WINDOW_MS = 5 * 60 * 1000; // alle 5 Minuten ein neuer Code
  function theoryToken(sess, win = Math.floor(Date.now() / THEORY_WINDOW_MS)) {
    const sig = createHmac('sha256', sess.secret).update(`${sess.id}:${win}`).digest('base64url').slice(0, 10);
    return `${sess.id}.${win}.${sig}`;
  }
  function theoryVerify(token) {
    const m = /^(\d+)\.(\d+)\.([A-Za-z0-9_-]{10})$/.exec(String(token || ''));
    if (!m) return { error: 'Code ungültig' };
    const s = db.prepare('SELECT * FROM theory_sessions WHERE id=?').get(Number(m[1]));
    if (!s) return { error: 'Theoriestunde nicht gefunden' };
    if (s.ended_at) return { error: 'Diese Theoriestunde ist bereits beendet' };
    const cur = Math.floor(Date.now() / THEORY_WINDOW_MS);
    const win = Number(m[2]);
    if (win < cur - 1 || win > cur) return { error: 'Der Code ist abgelaufen – bitte den aktuellen Code scannen' };
    if (theoryToken(s, win) !== token) return { error: 'Code ungültig' };
    return { session: s };
  }
  const THEORY_LESSONS = {
    1: 'Persönliche Voraussetzungen / Risikofaktor Mensch', 2: 'Rechtliche Rahmenbedingungen', 3: 'Verkehrszeichen und Verkehrseinrichtungen',
    4: 'Straßenverkehrssystem und seine Nutzung', 5: 'Vorfahrt', 6: 'Verkehrsregelungen', 7: 'Geschwindigkeit, Abstand, umweltschonende Fahrweise',
    8: 'Andere Teilnehmer im Straßenverkehr', 9: 'Verkehrsverhalten bei Fahrmanövern, Verkehrsbeobachtung', 10: 'Ruhender Verkehr',
    11: 'Verhalten in besonderen Situationen, Folgen von Verstößen', 12: 'Lebenslanges Lernen', 13: 'Technische Bedingungen, Personen- und Güterbeförderung (B)', 14: 'Fahren mit Solokraftfahrzeugen und Zügen (B)',
  };

  // ---------- Abrechnungs-Liste ----------
  function billingRows({ from, to, status = 'all', studentId = null }) {
    const where = ["b.status='done'", 'b.student_id IS NOT NULL'];
    const vals = [];
    if (from) { where.push('COALESCE(b.invoice_date,b.date) >= ?'); vals.push(from); }
    if (to) { where.push('COALESCE(b.invoice_date,b.date) <= ?'); vals.push(to); }
    if (status === 'open') where.push('b.billed_at IS NULL');
    if (status === 'billed') where.push('b.billed_at IS NOT NULL');
    if (studentId) { where.push('b.student_id = ?'); vals.push(studentId); }
    const rows = db.prepare(`SELECT b.id,b.student_id,b.date,b.start_time,b.duration_min,b.gearbox,b.plate,b.lesson_type,b.attended,b.late_minutes,
        b.invoice_date,b.invoice_time,b.price_cents,b.billed_at,b.billed_by,b.vehicle_id,b.started_at,b.ended_at,b.signed_at,b.instr_signed_at,
        s.name AS student_name,s.license_class,s.instructor_id,v.plate AS vehicle_plate
      FROM bookings b JOIN students s ON s.id=b.student_id LEFT JOIN vehicles v ON v.id=b.vehicle_id
      WHERE ${where.join(' AND ')} ORDER BY COALESCE(b.invoice_date,b.date) DESC, b.start_time DESC`).all(...vals);
    return rows.map((r) => ({ ...r, attended: r.attended == null ? 1 : r.attended, bill_date: r.invoice_date || r.date, bill_time: r.invoice_time || r.start_time,
      units: Math.max(1, Math.round((r.duration_min || 0) / unitMin())), price_cents: lessonPriceCents(r, r.license_class),
      instructor_name: r.instructor_id ? staffName('staff', r.instructor_id) : staffName('instructor') }));
  }
  function csv(rows, cols) {
    const q = (v) => { const s = v == null ? '' : String(v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return '﻿' + cols.map((c) => q(c[0])).join(';') + '\n' + rows.map((r) => cols.map((c) => q(c[1](r))).join(';')).join('\n') + '\n';
  }
  const euro = (c) => (c / 100).toFixed(2).replace('.', ',');
  const typeLbl = (t) => ({ ueberland: 'Überland', autobahn: 'Autobahn', nacht: 'Nachtfahrt' }[t] || 'Übungsfahrt');

  // ====================================================================
  //                              API
  // ====================================================================
  async function handle(req, res, url, sess) {
    const p = url.pathname;
    const method = req.method;
    const w = who(sess);
    const deny = (msg = 'Kein Zugriff für diese Rolle') => bad(res, msg, sess ? 403 : 401);

    // ----- Team-Login -----
    if (p === '/api/auth/staff' && method === 'POST') {
      if (loginBlocked(req)) return bad(res, 'Zu viele Fehlversuche. Bitte in ein paar Minuten erneut versuchen.', 429);
      const b = await readBody(req);
      const user = String(b.username || '').trim().toLowerCase();
      const st = db.prepare('SELECT * FROM staff WHERE lower(username)=? AND active=1').get(user);
      if (!st || !verifyPassword(String(b.password || ''), st.pass)) { noteLoginFail(req); return bad(res, 'Benutzername oder Passwort falsch', 401); }
      noteLoginOk(req);
      const token = createSession(res, 'staff', null, isHttps(req), b.remember !== false, st.id);
      return ok(res, { role: 'staff', staff_role: st.role, name: st.name, id: st.id, token });
    }
    if (p === '/api/portal/me' && method === 'GET') {
      if (!isTeam(w)) return deny('Bitte anmelden');
      const pendingSignups = db.prepare('SELECT COUNT(*) c FROM students WHERE registered_self=1 AND approved=0 AND deleted_at IS NULL').get().c;
      const openAbs = db.prepare("SELECT COUNT(*) c FROM absences WHERE status='offen'").get().c;
      const openBill = db.prepare("SELECT COUNT(*) c FROM bookings WHERE status='done' AND student_id IS NOT NULL AND billed_at IS NULL").get().c;
      const busyCars = db.prepare("SELECT COUNT(*) c FROM vehicle_bookings WHERE returned_at IS NULL AND start_at<=? AND end_at>?").get(nowIso(), nowIso()).c;
      return ok(res, { me: w, roles: ROLES, classes: CLASSES, school: getSettingRaw('school_name') || '',
        counts: { pendingSignups, openAbsences: openAbs, openBilling: openBill, busyCars } });
    }

    // ----- Team-Konten (nur Inhaber/Admin) -----
    if (p === '/api/portal/staff' && method === 'GET') {
      if (!can(w, 'admin', 'buero')) return deny();
      const rows = db.prepare('SELECT id,name,role,username,phone,email,color,active,vacation_days,created_at FROM staff ORDER BY active DESC, role, name').all()
        .map((s) => ({ ...s, active: !!s.active,
          students: db.prepare('SELECT COUNT(*) c FROM students WHERE instructor_id=? AND archived_at IS NULL AND deleted_at IS NULL').get(s.id).c }));
      return ok(res, { staff: rows, roles: ROLES });
    }
    if (p === '/api/portal/staff' && method === 'POST') {
      if (!can(w, 'admin')) return deny();
      const b = await readBody(req);
      const name = String(b.name || '').trim(), username = String(b.username || '').trim().toLowerCase();
      const role = String(b.role || '');
      if (!name || !username) return bad(res, 'Name und Benutzername angeben');
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) return bad(res, 'Benutzername: 3–30 Zeichen, nur Buchstaben, Zahlen, Punkt, Minus');
      if (!ROLES[role]) return bad(res, 'Unbekannte Rolle');
      const pw = String(b.password || '');
      const prob = passwordProblem(pw); if (prob) return bad(res, 'Passwort: ' + prob);
      if (db.prepare('SELECT 1 FROM staff WHERE lower(username)=?').get(username)) return bad(res, 'Benutzername ist schon vergeben');
      const info = db.prepare('INSERT INTO staff(name,role,username,pass,phone,email,color,vacation_days,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(name, role, username, hashPassword(pw), b.phone ? String(b.phone).trim() : null, b.email ? String(b.email).trim() : null,
          /^#[0-9a-fA-F]{6}$/.test(b.color || '') ? b.color : null, Math.max(0, Number(b.vacation_days) || 30), nowIso());
      logEvent('staff', { actor: 'instructor', detail: `👥 Team-Konto angelegt: ${name} (${ROLES[role].label}, ${username})` });
      return ok(res, { id: Number(info.lastInsertRowid) });
    }
    const stm = p.match(/^\/api\/portal\/staff\/(\d+)$/);
    if (stm && method === 'PATCH') {
      if (!can(w, 'admin')) return deny();
      const id = Number(stm[1]); const b = await readBody(req);
      const cur = db.prepare('SELECT * FROM staff WHERE id=?').get(id); if (!cur) return bad(res, 'Konto nicht gefunden', 404);
      const f = [], v = [];
      if ('name' in b && String(b.name).trim()) { f.push('name=?'); v.push(String(b.name).trim()); }
      if ('role' in b && ROLES[b.role]) { f.push('role=?'); v.push(b.role); }
      if ('phone' in b) { f.push('phone=?'); v.push(b.phone ? String(b.phone).trim() : null); }
      if ('email' in b) { f.push('email=?'); v.push(b.email ? String(b.email).trim() : null); }
      if ('color' in b) { f.push('color=?'); v.push(/^#[0-9a-fA-F]{6}$/.test(b.color || '') ? b.color : null); }
      if ('active' in b) { f.push('active=?'); v.push(b.active ? 1 : 0); }
      if ('vacation_days' in b) { f.push('vacation_days=?'); v.push(Math.max(0, Number(b.vacation_days) || 0)); }
      if ('password' in b && b.password) { const prob = passwordProblem(String(b.password)); if (prob) return bad(res, 'Passwort: ' + prob); f.push('pass=?'); v.push(hashPassword(String(b.password))); }
      if (!f.length) return ok(res, { changed: false });
      v.push(id); db.prepare(`UPDATE staff SET ${f.join(',')} WHERE id=?`).run(...v);
      if ('active' in b && !b.active) db.prepare("DELETE FROM sessions WHERE kind='staff' AND staff_id=?").run(id);
      return ok(res, { changed: true });
    }
    if (stm && method === 'DELETE') {
      if (!can(w, 'admin')) return deny();
      const id = Number(stm[1]);
      db.prepare("DELETE FROM sessions WHERE kind='staff' AND staff_id=?").run(id);
      db.prepare('UPDATE students SET instructor_id=NULL WHERE instructor_id=?').run(id);
      db.prepare('DELETE FROM staff WHERE id=?').run(id);
      return ok(res, { deleted: true });
    }
    // Eigenes Passwort ändern (jedes Team-Konto)
    if (p === '/api/portal/password' && method === 'POST') {
      if (!w || w.kind !== 'staff') return deny();
      const b = await readBody(req);
      const cur = db.prepare('SELECT pass FROM staff WHERE id=?').get(w.id);
      if (!verifyPassword(String(b.old || ''), cur.pass)) return bad(res, 'Altes Passwort stimmt nicht');
      const prob = passwordProblem(String(b.password || '')); if (prob) return bad(res, 'Passwort: ' + prob);
      db.prepare('UPDATE staff SET pass=? WHERE id=?').run(hashPassword(String(b.password)), w.id);
      return ok(res, { changed: true });
    }

    // ----- Fahrzeuge & Schaltwagen-Uhr -----
    if (p === '/api/portal/vehicles' && method === 'GET') {
      if (!isTeam(w)) return deny('Bitte anmelden');
      const all = url.searchParams.get('all') === '1' && can(w, 'admin');
      const rows = db.prepare(`SELECT * FROM vehicles ${all ? '' : 'WHERE active=1'} ORDER BY sort, id`).all().map((v) => vehicleStatus(v));
      return ok(res, { vehicles: rows, now: nowIso(), me: { kind: w.kind === 'owner' ? 'instructor' : 'staff', id: w.id, name: w.name } });
    }
    if (p === '/api/portal/vehicles' && method === 'POST') {
      if (!can(w, 'admin')) return deny();
      const b = await readBody(req);
      const plate = String(b.plate || '').trim().toUpperCase(), name = String(b.name || '').trim() || 'Fahrzeug';
      if (!plate) return bad(res, 'Kennzeichen angeben');
      if (db.prepare('SELECT 1 FROM vehicles WHERE plate=?').get(plate)) return bad(res, 'Dieses Kennzeichen gibt es schon');
      const gearbox = b.gearbox === 'automatik' ? 'automatik' : 'schalt';
      const info = db.prepare('INSERT INTO vehicles(name,plate,gearbox,color,shared,owner_id,sort,created_at) VALUES(?,?,?,?,?,?,?,?)')
        .run(name, plate, gearbox, /^#[0-9a-fA-F]{6}$/.test(b.color || '') ? b.color : '#4d8dff', b.shared === false ? 0 : 1, b.owner_id ? Number(b.owner_id) : null, Number(b.sort) || 0, nowIso());
      return ok(res, { id: Number(info.lastInsertRowid) });
    }
    const vm = p.match(/^\/api\/portal\/vehicles\/(\d+)$/);
    if (vm && method === 'PATCH') {
      if (!can(w, 'admin')) return deny();
      const id = Number(vm[1]); const b = await readBody(req); const f = [], v = [];
      if ('name' in b) { f.push('name=?'); v.push(String(b.name).trim() || 'Fahrzeug'); }
      if ('plate' in b && String(b.plate).trim()) { f.push('plate=?'); v.push(String(b.plate).trim().toUpperCase()); }
      if ('gearbox' in b) { f.push('gearbox=?'); v.push(b.gearbox === 'automatik' ? 'automatik' : 'schalt'); }
      if ('color' in b && /^#[0-9a-fA-F]{6}$/.test(b.color)) { f.push('color=?'); v.push(b.color); }
      if ('shared' in b) { f.push('shared=?'); v.push(b.shared ? 1 : 0); }
      if ('owner_id' in b) { f.push('owner_id=?'); v.push(b.owner_id ? Number(b.owner_id) : null); }
      if ('active' in b) { f.push('active=?'); v.push(b.active ? 1 : 0); }
      if ('sort' in b) { f.push('sort=?'); v.push(Number(b.sort) || 0); }
      if (!f.length) return ok(res, { changed: false });
      v.push(id); try { db.prepare(`UPDATE vehicles SET ${f.join(',')} WHERE id=?`).run(...v); } catch { return bad(res, 'Kennzeichen schon vergeben'); }
      return ok(res, { changed: true });
    }
    const vbm = p.match(/^\/api\/portal\/vehicles\/(\d+)\/book$/);
    if (vbm && method === 'POST') {
      if (!can(w, 'admin', 'fahrlehrer', 'buero')) return deny();
      const veh = db.prepare('SELECT * FROM vehicles WHERE id=? AND active=1').get(Number(vbm[1]));
      if (!veh) return bad(res, 'Fahrzeug nicht gefunden', 404);
      const b = await readBody(req);
      const start = b.start_at ? new Date(b.start_at) : new Date();
      if (isNaN(start)) return bad(res, 'Startzeit ungültig');
      let end;
      if (b.end_at) end = new Date(b.end_at);
      else end = new Date(start.getTime() + Math.max(5, Math.min(24 * 60, Number(b.duration_min) || 80)) * 60000);
      if (isNaN(end) || end <= start) return bad(res, 'Endzeit muss nach dem Start liegen');
      if (start.getTime() < Date.now() - 10 * 60000) return bad(res, 'Startzeit liegt in der Vergangenheit');
      const sI = start.toISOString(), eI = end.toISOString();
      const c = vehicleConflict(veh.id, sI, eI);
      if (c) return bad(res, `${veh.plate} ist dann schon belegt: ${c.by_name} (${hhmm(c.start_at)}–${hhmm(c.end_at)} Uhr)`, 409);
      const byKind = w.kind === 'owner' ? 'instructor' : 'staff';
      const info = db.prepare('INSERT INTO vehicle_bookings(vehicle_id,by_kind,by_id,by_name,start_at,end_at,note,created_at) VALUES(?,?,?,?,?,?,?,?)')
        .run(veh.id, byKind, w.id, w.name, sI, eI, b.note ? String(b.note).trim().slice(0, 200) : null, nowIso());
      const today = ymd(start) === ymd(new Date());
      const msg = `🚘 ${veh.plate} gebucht von ${w.name}: ${today ? 'heute' : dmy(sI)} ${hhmm(sI)}–${hhmm(eI)} Uhr${b.note ? ' · ' + String(b.note).trim().slice(0, 60) : ''}`;
      logEvent('vehicle', { actor: byKind, detail: msg });
      pushToTeam(msg, '/portal#fahrzeuge', { exceptKind: byKind, exceptId: w.id });
      return ok(res, { id: Number(info.lastInsertRowid), start_at: sI, end_at: eI });
    }
    const vrm = p.match(/^\/api\/portal\/vehicle-bookings\/(\d+)\/(return|extend)$/);
    if (vrm && method === 'POST') {
      if (!can(w, 'admin', 'fahrlehrer', 'buero')) return deny();
      const vb = db.prepare('SELECT vb.*, v.plate FROM vehicle_bookings vb JOIN vehicles v ON v.id=vb.vehicle_id WHERE vb.id=?').get(Number(vrm[1]));
      if (!vb) return bad(res, 'Buchung nicht gefunden', 404);
      const mine = (w.kind === 'owner' && vb.by_kind === 'instructor') || (w.kind === 'staff' && vb.by_kind === 'staff' && vb.by_id === w.id);
      if (!mine && !can(w, 'admin', 'buero')) return bad(res, 'Nur wer gebucht hat (oder das Büro) kann das ändern', 403);
      if (vrm[2] === 'return') {
        db.prepare('UPDATE vehicle_bookings SET returned_at=? WHERE id=?').run(nowIso(), vb.id);
        const msg = `✅ ${vb.plate} ist wieder frei (${w.name}, ${hhmm(nowIso())} Uhr)`;
        logEvent('vehicle', { actor: w.kind === 'owner' ? 'instructor' : 'staff', detail: msg });
        pushToTeam(msg, '/portal#fahrzeuge', { exceptKind: w.kind === 'owner' ? 'instructor' : 'staff', exceptId: w.id });
        return ok(res, { returned: true });
      }
      const b = await readBody(req);
      const add = Math.max(5, Math.min(12 * 60, Number(b.minutes) || 40));
      const newEnd = new Date(new Date(vb.end_at).getTime() + add * 60000).toISOString();
      const c = vehicleConflict(vb.vehicle_id, vb.start_at, newEnd, vb.id);
      if (c) return bad(res, `Verlängern geht nicht – ab ${hhmm(c.start_at)} Uhr hat ${c.by_name} das Auto`, 409);
      db.prepare('UPDATE vehicle_bookings SET end_at=? WHERE id=?').run(newEnd, vb.id);
      pushToTeam(`⏱️ ${vb.plate}: ${w.name} braucht das Auto bis ${hhmm(newEnd)} Uhr`, '/portal#fahrzeuge', { exceptKind: w.kind === 'owner' ? 'instructor' : 'staff', exceptId: w.id });
      return ok(res, { end_at: newEnd });
    }
    const vdm = p.match(/^\/api\/portal\/vehicle-bookings\/(\d+)$/);
    if (vdm && method === 'DELETE') {
      if (!can(w, 'admin', 'fahrlehrer', 'buero')) return deny();
      const vb = db.prepare('SELECT * FROM vehicle_bookings WHERE id=?').get(Number(vdm[1]));
      if (!vb) return bad(res, 'Buchung nicht gefunden', 404);
      const mine = (w.kind === 'owner' && vb.by_kind === 'instructor') || (w.kind === 'staff' && vb.by_kind === 'staff' && vb.by_id === w.id);
      if (!mine && !can(w, 'admin', 'buero')) return bad(res, 'Nur wer gebucht hat (oder das Büro) kann stornieren', 403);
      db.prepare('DELETE FROM vehicle_bookings WHERE id=?').run(vb.id);
      return ok(res, { deleted: true });
    }
    if (p === '/api/portal/vehicle-log' && method === 'GET') {
      if (!isTeam(w)) return deny('Bitte anmelden');
      const rows = db.prepare('SELECT vb.*, v.plate, v.name AS vehicle_name FROM vehicle_bookings vb JOIN vehicles v ON v.id=vb.vehicle_id ORDER BY start_at DESC LIMIT 200').all();
      return ok(res, { log: rows });
    }

    // ----- Preise (lesen: Team; schreiben: Admin) -----
    if (p === '/api/portal/prices' && method === 'GET') {
      if (!isTeam(w)) return deny('Bitte anmelden');
      return ok(res, { prices: priceList(), classes: CLASSES, unit_min: unitMin(), noshow_pct: noshowPct(), school_name: getSettingRaw('school_name') || '' });
    }
    if (p === '/api/portal/prices' && method === 'PUT') {
      if (!can(w, 'admin')) return deny();
      const b = await readBody(req);
      if (b.prices && typeof b.prices === 'object') {
        const clean = {};
        for (const [k, row] of Object.entries(b.prices)) {
          if (!CLASS_KEYS.has(k) || !row || typeof row !== 'object') continue;
          clean[k] = {};
          for (const f of ['grund', 'fahrstunde', 'sonderfahrt', 'pruef_theorie', 'pruef_praxis']) {
            if (f in row) clean[k][f] = Math.max(0, Math.round(Number(String(row[f]).replace(',', '.')) * 100) / 100 || 0);
          }
        }
        setSettingRaw('price_list', JSON.stringify(clean));
      }
      if ('unit_min' in b && Number(b.unit_min) >= 10) setSettingRaw('price_unit_min', String(Math.round(Number(b.unit_min))));
      if ('noshow_pct' in b) setSettingRaw('price_noshow_pct', String(Math.min(100, Math.max(0, Number(b.noshow_pct) || 0))));
      if ('school_name' in b) setSettingRaw('school_name', String(b.school_name).trim().slice(0, 80));
      logEvent('prices', { actor: 'instructor', detail: `💶 Preisliste aktualisiert (${w.name})` });
      return ok(res, { saved: true, prices: priceList() });
    }

    // ----- Abrechnung (fsmanager / DataPart) -----
    if ((p === '/api/portal/billing' || p === '/api/portal/billing.csv') && method === 'GET') {
      if (!can(w, 'admin', 'abrechnung', 'steuer', 'buero')) return deny();
      const q = url.searchParams;
      const rows = billingRows({ from: isDate(q.get('from')) ? q.get('from') : null, to: isDate(q.get('to')) ? q.get('to') : null,
        status: q.get('status') || 'all', studentId: Number(q.get('student_id')) || null });
      if (p.endsWith('.csv')) {
        const body = csv(rows, [['Rechnungsdatum', (r) => r.bill_date], ['Uhrzeit', (r) => r.bill_time], ['Fahrschüler', (r) => r.student_name], ['Klasse', (r) => r.license_class],
          ['Gefahren am', (r) => r.date], ['Beginn', (r) => r.start_time], ['Minuten', (r) => r.duration_min], ['Einheiten', (r) => r.units], ['Art', (r) => typeLbl(r.lesson_type)],
          ['Getriebe', (r) => r.gearbox === 'schalt' ? 'Schalter' : r.gearbox === 'automatik' ? 'Automatik' : ''], ['Fahrzeug', (r) => r.vehicle_plate || r.plate || ''],
          ['Erschienen', (r) => r.attended ? 'ja' : 'nein'], ['Fahrlehrer', (r) => r.instructor_name], ['Preis EUR', (r) => euro(r.price_cents)], ['Abgerechnet', (r) => r.billed_at ? r.billed_at.slice(0, 10) : '']]);
        res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="abrechnung.csv"' });
        return res.end(body);
      }
      const sum = rows.reduce((a, r) => a + r.price_cents, 0), open = rows.filter((r) => !r.billed_at).reduce((a, r) => a + r.price_cents, 0);
      return ok(res, { rows, total_cents: sum, open_cents: open, unit_min: unitMin() });
    }
    if (p === '/api/portal/billing/mark' && method === 'POST') {
      if (!can(w, 'admin', 'abrechnung')) return deny();
      const b = await readBody(req);
      const ids = (Array.isArray(b.ids) ? b.ids : [b.id]).map(Number).filter(Boolean);
      if (!ids.length) return bad(res, 'Keine Fahrstunden gewählt');
      const billed = b.billed !== false;
      const upd = billed
        ? db.prepare("UPDATE bookings SET billed_at=?, billed_by=?, price_cents=COALESCE(price_cents, ?) WHERE id=? AND status='done'")
        : db.prepare("UPDATE bookings SET billed_at=NULL, billed_by=NULL, price_cents=NULL WHERE id=?");
      let n = 0;
      for (const id of ids) {
        if (billed) {
          const r = db.prepare('SELECT b.*, s.license_class FROM bookings b JOIN students s ON s.id=b.student_id WHERE b.id=?').get(id);
          if (!r) continue;
          n += upd.run(nowIso(), w.name, lessonPriceCents(r, r.license_class), id).changes;
        } else n += upd.run(id).changes;
      }
      logEvent('billing', { actor: w.kind === 'owner' ? 'instructor' : 'staff', detail: `🧾 ${n} Fahrstunde(n) ${billed ? 'als abgerechnet markiert' : 'wieder geöffnet'} (${w.name})` });
      return ok(res, { changed: n });
    }
    // Steuerbüro: Monatssummen (nur Zahlen, keine Schülerdaten)
    if ((p === '/api/portal/tax' || p === '/api/portal/tax.csv') && method === 'GET') {
      if (!can(w, 'admin', 'steuer', 'abrechnung')) return deny();
      const year = /^\d{4}$/.test(url.searchParams.get('year') || '') ? url.searchParams.get('year') : String(new Date().getFullYear());
      const rows = billingRows({ from: `${year}-01-01`, to: `${year}-12-31` });
      const months = {};
      for (let m = 1; m <= 12; m++) months[`${year}-${String(m).padStart(2, '0')}`] = { month: `${year}-${String(m).padStart(2, '0')}`, lessons: 0, minutes: 0, units: 0, cents: 0, billed_cents: 0, open_cents: 0, sonder: 0, noshow: 0, byClass: {} };
      for (const r of rows) {
        const k = r.bill_date.slice(0, 7); const mo = months[k]; if (!mo) continue;
        mo.lessons++; mo.minutes += r.duration_min || 0; mo.units += r.units; mo.cents += r.price_cents;
        if (r.billed_at) mo.billed_cents += r.price_cents; else mo.open_cents += r.price_cents;
        if (['ueberland', 'autobahn', 'nacht'].includes(r.lesson_type)) mo.sonder++;
        if (!r.attended) mo.noshow++;
        mo.byClass[r.license_class] = (mo.byClass[r.license_class] || 0) + r.price_cents;
      }
      const list = Object.values(months);
      if (p.endsWith('.csv')) {
        const body = csv(list, [['Monat', (r) => r.month], ['Fahrstunden', (r) => r.lessons], ['Minuten', (r) => r.minutes], ['Einheiten', (r) => r.units],
          ['Umsatz EUR', (r) => euro(r.cents)], ['davon abgerechnet EUR', (r) => euro(r.billed_cents)], ['offen EUR', (r) => euro(r.open_cents)], ['Sonderfahrten', (r) => r.sonder], ['Nicht erschienen', (r) => r.noshow]]);
        res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="steuer-${year}.csv"` });
        return res.end(body);
      }
      const activeStudents = db.prepare('SELECT COUNT(*) c FROM students WHERE approved=1 AND archived_at IS NULL AND deleted_at IS NULL').get().c;
      return ok(res, { year, months: list, total_cents: list.reduce((a, m) => a + m.cents, 0), active_students: activeStudents });
    }

    // ----- Büro: Fahrschüler-Übersicht, Klasse & Fahrlehrer-Zuweisung -----
    if (p === '/api/portal/students' && method === 'GET') {
      if (!can(w, 'admin', 'buero', 'fahrlehrer', 'abrechnung')) return deny();
      const scope = url.searchParams.get('scope') || 'active';
      const where = scope === 'archived' ? 's.archived_at IS NOT NULL' : scope === 'pending' ? 's.approved=0 AND s.registered_self=1' : 's.archived_at IS NULL AND s.approved=1';
      const onlyMine = w.kind === 'staff' && w.role === 'fahrlehrer';
      const rows = db.prepare(`SELECT s.id,s.name,s.first_name,s.last_name,s.phone,s.email,s.username,s.birth_date,s.city,s.zip,s.street,s.house_no,
          s.license_class,s.instructor_id,s.class_note,s.exam_date,s.created_at,s.archived_at,s.approved,s.registered_self,s.email_verified,
          (SELECT COUNT(*) FROM bookings b WHERE b.student_id=s.id AND b.status='done' AND (b.attended IS NULL OR b.attended=1)) AS done_count,
          (SELECT COALESCE(SUM(duration_min),0) FROM bookings b WHERE b.student_id=s.id AND b.status='done' AND (b.attended IS NULL OR b.attended=1)) AS done_min,
          (SELECT COUNT(*) FROM bookings b WHERE b.student_id=s.id AND b.status='done' AND b.billed_at IS NULL) AS open_bill,
          (SELECT COUNT(DISTINCT ts.lesson_no) FROM theory_attendance ta JOIN theory_sessions ts ON ts.id=ta.session_id WHERE ta.student_id=s.id) AS theory_count
        FROM students s WHERE s.deleted_at IS NULL AND ${where} ${onlyMine ? 'AND s.instructor_id=?' : ''} ORDER BY s.name`).all(...(onlyMine ? [w.id] : []))
        .map((s) => ({ ...s, approved: !!s.approved, email_verified: !!s.email_verified, registered_self: !!s.registered_self,
          instructor_name: s.instructor_id ? staffName('staff', s.instructor_id) : staffName('instructor') }));
      const instructors = [{ id: 0, name: staffName('instructor') + ' (Inhaber)' }, ...db.prepare("SELECT id,name FROM staff WHERE role='fahrlehrer' AND active=1 ORDER BY name").all()];
      return ok(res, { students: rows, instructors, classes: CLASSES });
    }
    const psm = p.match(/^\/api\/portal\/students\/(\d+)$/);
    if (psm && method === 'PATCH') {
      if (!can(w, 'admin', 'buero', 'fahrlehrer')) return deny();
      const id = Number(psm[1]); const b = await readBody(req); const f = [], v = [];
      const st = db.prepare('SELECT id,name FROM students WHERE id=? AND deleted_at IS NULL').get(id); if (!st) return bad(res, 'Fahrschüler nicht gefunden', 404);
      if ('license_class' in b) { if (!CLASS_KEYS.has(b.license_class)) return bad(res, 'Unbekannte Klasse'); f.push('license_class=?'); v.push(b.license_class); }
      if ('instructor_id' in b) {
        const iid = Number(b.instructor_id) || null;
        if (iid && !db.prepare("SELECT 1 FROM staff WHERE id=? AND role='fahrlehrer' AND active=1").get(iid)) return bad(res, 'Fahrlehrer nicht gefunden');
        f.push('instructor_id=?'); v.push(iid);
      }
      if ('class_note' in b) { f.push('class_note=?'); v.push(b.class_note ? String(b.class_note).trim().slice(0, 120) : null); }
      if (!f.length) return ok(res, { changed: false });
      v.push(id); db.prepare(`UPDATE students SET ${f.join(',')} WHERE id=?`).run(...v);
      if ('instructor_id' in b) {
        const name = staffName(b.instructor_id ? 'staff' : 'instructor', Number(b.instructor_id));
        logEvent('assign', { actor: 'staff', studentId: id, detail: `👤 ${st.name} → Fahrlehrer ${name} (${w.name})` });
        notify(id, 'info', `Dein Fahrlehrer ist ${name}. Bei Fragen melde dich gern im Büro.`);
      }
      return ok(res, { changed: true });
    }
    // Akte eines Schülers fürs Portal (Fahrstunden + Theorie + Kosten)
    const pam = p.match(/^\/api\/portal\/students\/(\d+)\/akte$/);
    if (pam && method === 'GET') {
      if (!can(w, 'admin', 'buero', 'fahrlehrer', 'abrechnung')) return deny();
      const id = Number(pam[1]);
      const st = db.prepare('SELECT id,name,phone,email,username,license_class,instructor_id,class_note,exam_date,created_at,birth_date,street,house_no,zip,city FROM students WHERE id=? AND deleted_at IS NULL').get(id);
      if (!st) return bad(res, 'Fahrschüler nicht gefunden', 404);
      const lessons = billingRows({ studentId: id });
      const theory = db.prepare('SELECT ts.lesson_no, ts.title, ts.date, ta.at FROM theory_attendance ta JOIN theory_sessions ts ON ts.id=ta.session_id WHERE ta.student_id=? ORDER BY ts.date').all(id);
      const pl = priceList()[st.license_class] || priceList().B;
      return ok(res, { student: { ...st, instructor_name: st.instructor_id ? staffName('staff', st.instructor_id) : staffName('instructor') },
        lessons, theory, prices: pl, total_cents: lessons.reduce((a, r) => a + r.price_cents, 0), open_cents: lessons.filter((r) => !r.billed_at).reduce((a, r) => a + r.price_cents, 0), lessons_map: THEORY_LESSONS });
    }

    // ----- Urlaub / Krankmeldung -----
    if (p === '/api/portal/absences' && method === 'GET') {
      if (!isTeam(w)) return deny('Bitte anmelden');
      const all = can(w, 'admin', 'buero');
      const rows = all
        ? db.prepare('SELECT * FROM absences ORDER BY status=\'offen\' DESC, from_date DESC LIMIT 300').all()
        : db.prepare('SELECT * FROM absences WHERE by_kind=? AND by_id=? ORDER BY from_date DESC LIMIT 100').all('staff', w.id);
      const year = String(new Date().getFullYear());
      const used = (kind, id) => db.prepare("SELECT from_date,to_date FROM absences WHERE by_kind=? AND by_id=? AND kind='urlaub' AND status='genehmigt' AND from_date LIKE ?").all(kind, id, year + '%')
        .reduce((a, r) => a + (Math.round((new Date(r.to_date) - new Date(r.from_date)) / 864e5) + 1), 0);
      const my = w.kind === 'staff' ? { days: w.vacation_days, used: used('staff', w.id) } : { days: Number(getSettingRaw('vacation_days_left')) || 30, used: used('instructor', 0) };
      return ok(res, { absences: rows, vacation: my, all });
    }
    if (p === '/api/portal/absences' && method === 'POST') {
      if (!can(w, 'admin', 'fahrlehrer', 'buero', 'abrechnung')) return deny();
      const b = await readBody(req);
      const kind = ['urlaub', 'krank', 'frei'].includes(b.kind) ? b.kind : 'urlaub';
      if (!isDate(b.from_date) || !isDate(b.to_date) || b.to_date < b.from_date) return bad(res, 'Zeitraum ungültig');
      const byKind = w.kind === 'owner' ? 'instructor' : 'staff';
      // Krankmeldung: sofort gemeldet (keine Genehmigung). Der Inhaber genehmigt sich selbst.
      const status = kind === 'krank' ? 'gemeldet' : (w.kind === 'owner' ? 'genehmigt' : 'offen');
      const info = db.prepare('INSERT INTO absences(by_kind,by_id,by_name,kind,from_date,to_date,note,status,decided_by,decided_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .run(byKind, w.id, w.name, kind, b.from_date, b.to_date, b.note ? String(b.note).trim().slice(0, 300) : null, status,
          status === 'genehmigt' ? w.name : null, status === 'genehmigt' ? nowIso() : null, nowIso());
      const lbl = { urlaub: '🌴 Urlaub', krank: '🤒 Krankmeldung', frei: '📅 Freier Tag' }[kind];
      const span = b.from_date === b.to_date ? dmy(b.from_date) : `${dmy(b.from_date)}–${dmy(b.to_date)}`;
      const msg = `${lbl} ${status === 'offen' ? 'beantragt' : 'gemeldet'}: ${w.name}, ${span}${b.note ? ' · ' + String(b.note).trim().slice(0, 60) : ''}`;
      logEvent('absence', { actor: byKind, detail: msg });
      if (w.kind !== 'owner') pushToTeam(msg, '/portal#abwesenheit', { roles: ['admin', 'buero'] });
      return ok(res, { id: Number(info.lastInsertRowid), status });
    }
    const adm = p.match(/^\/api\/portal\/absences\/(\d+)\/(genehmigt|abgelehnt|delete)$/);
    if (adm && method === 'POST') {
      const a = db.prepare('SELECT * FROM absences WHERE id=?').get(Number(adm[1])); if (!a) return bad(res, 'Antrag nicht gefunden', 404);
      if (adm[2] === 'delete') {
        const mine = (w.kind === 'owner' && a.by_kind === 'instructor') || (w.kind === 'staff' && a.by_id === w.id);
        if (!mine && !can(w, 'admin')) return deny();
        db.prepare('DELETE FROM absences WHERE id=?').run(a.id); return ok(res, { deleted: true });
      }
      if (!can(w, 'admin')) return deny();
      db.prepare('UPDATE absences SET status=?, decided_by=?, decided_at=? WHERE id=?').run(adm[2], w.name, nowIso(), a.id);
      const msg = `${adm[2] === 'genehmigt' ? '✅ genehmigt' : '❌ abgelehnt'}: ${a.kind === 'urlaub' ? 'Urlaub' : 'Freier Tag'} ${a.by_name} ${dmy(a.from_date)}–${dmy(a.to_date)} (${w.name})`;
      logEvent('absence', { actor: 'instructor', detail: msg });
      if (a.by_kind === 'staff') {
        const subs = db.prepare("SELECT * FROM push_subscriptions WHERE kind='staff' AND staff_id=?").all(a.by_id);
        for (const s of subs) pushRaw(s, msg, '/portal#abwesenheit', 'Ginoco Team');
      }
      return ok(res, { status: adm[2] });
    }

    // ----- Theorieunterricht mit QR-Anwesenheit -----
    if (p === '/api/portal/theory' && method === 'GET') {
      if (!can(w, 'admin', 'fahrlehrer', 'buero')) return deny();
      const rows = db.prepare('SELECT ts.*, (SELECT COUNT(*) FROM theory_attendance ta WHERE ta.session_id=ts.id) AS attendees FROM theory_sessions ts ORDER BY started_at DESC LIMIT 60').all();
      return ok(res, { sessions: rows, lessons: THEORY_LESSONS, window_min: THEORY_WINDOW_MS / 60000 });
    }
    if (p === '/api/portal/theory' && method === 'POST') {
      if (!can(w, 'admin', 'fahrlehrer', 'buero')) return deny();
      const b = await readBody(req);
      const no = Math.min(14, Math.max(1, Number(b.lesson_no) || 1));
      const date = isDate(b.date) ? b.date : ymd(new Date());
      const info = db.prepare('INSERT INTO theory_sessions(date,lesson_no,title,secret,by_name,started_at) VALUES(?,?,?,?,?,?)')
        .run(date, no, b.title ? String(b.title).trim().slice(0, 120) : THEORY_LESSONS[no], randomBytes(24).toString('hex'), w.name, nowIso());
      logEvent('theory', { actor: 'instructor', detail: `📚 Theorie Lektion ${no} gestartet (${w.name})` });
      return ok(res, { id: Number(info.lastInsertRowid) });
    }
    const thm = p.match(/^\/api\/portal\/theory\/(\d+)\/(code|end|attendance)$/);
    if (thm) {
      if (!can(w, 'admin', 'fahrlehrer', 'buero')) return deny();
      const s = db.prepare('SELECT * FROM theory_sessions WHERE id=?').get(Number(thm[1])); if (!s) return bad(res, 'Theoriestunde nicht gefunden', 404);
      if (thm[2] === 'end' && method === 'POST') { db.prepare('UPDATE theory_sessions SET ended_at=? WHERE id=?').run(nowIso(), s.id); return ok(res, { ended: true }); }
      if (thm[2] === 'code' && method === 'GET') {
        if (s.ended_at) return bad(res, 'Diese Theoriestunde ist beendet');
        const win = Math.floor(Date.now() / THEORY_WINDOW_MS);
        const token = theoryToken(s, win);
        const base = (getSettingRaw('public_url') || '').replace(/\/$/, '') || `${isHttps(req) ? 'https' : 'http'}://${req.headers.host}`;
        const attendees = db.prepare('SELECT ta.at, st.name FROM theory_attendance ta JOIN students st ON st.id=ta.student_id WHERE ta.session_id=? ORDER BY ta.at').all(s.id);
        return ok(res, { token, url: `${base}/?theorie=${token}`, valid_until: (win + 1) * THEORY_WINDOW_MS, lesson_no: s.lesson_no, title: s.title, attendees });
      }
      if (thm[2] === 'attendance' && method === 'POST') { // manuell nachtragen
        const b = await readBody(req); const sid = Number(b.student_id);
        if (!db.prepare('SELECT 1 FROM students WHERE id=?').get(sid)) return bad(res, 'Fahrschüler nicht gefunden');
        db.prepare('INSERT OR IGNORE INTO theory_attendance(session_id,student_id,at) VALUES(?,?,?)').run(s.id, sid, nowIso());
        return ok(res, { added: true });
      }
    }
    // Schüler: Code einlösen (gescannt mit der Handykamera -> /?theorie=TOKEN)
    if (p === '/api/my/theory/checkin' && method === 'POST') {
      if (!w || w.kind !== 'student') return bad(res, 'Bitte als Fahrschüler anmelden', 401);
      const b = await readBody(req);
      const r = theoryVerify(b.token);
      if (r.error) return bad(res, r.error);
      const s = r.session;
      const ins = db.prepare('INSERT OR IGNORE INTO theory_attendance(session_id,student_id,at) VALUES(?,?,?)').run(s.id, w.id, nowIso());
      if (ins.changes) logEvent('theory', { actor: 'student', studentId: w.id, detail: `📚 Theorie Lektion ${s.lesson_no} – Anwesenheit per QR bestätigt` });
      return ok(res, { checked_in: true, already: !ins.changes, lesson_no: s.lesson_no, title: s.title, date: s.date });
    }
    if (p === '/api/my/theory' && method === 'GET') {
      if (!w || w.kind !== 'student') return bad(res, 'Bitte anmelden', 401);
      const rows = db.prepare('SELECT ts.lesson_no, ts.title, ts.date, ta.at FROM theory_attendance ta JOIN theory_sessions ts ON ts.id=ta.session_id WHERE ta.student_id=? ORDER BY ts.date').all(w.id);
      const st = db.prepare('SELECT license_class FROM students WHERE id=?').get(w.id);
      const need = /^B/.test(st?.license_class || 'B') ? 14 : 12;
      return ok(res, { theory: rows, lessons: THEORY_LESSONS, need, done: new Set(rows.map((r) => r.lesson_no)).size });
    }
    // Schüler: Kosten & Rechnung (was wurde gefahren, was kostet es, was ist abgerechnet)
    if (p === '/api/my/costs' && method === 'GET') {
      if (!w || w.kind !== 'student') return bad(res, 'Bitte anmelden', 401);
      const st = db.prepare('SELECT license_class FROM students WHERE id=?').get(w.id);
      const rows = billingRows({ studentId: w.id }).map((r) => ({ id: r.id, date: r.date, start_time: r.start_time, bill_date: r.bill_date, bill_time: r.bill_time, duration_min: r.duration_min,
        units: r.units, lesson_type: r.lesson_type, gearbox: r.gearbox, plate: r.vehicle_plate || r.plate, attended: r.attended, price_cents: r.price_cents, billed: !!r.billed_at }));
      const pl = priceList()[st?.license_class || 'B'] || priceList().B;
      return ok(res, { lessons: rows, license_class: st?.license_class || 'B', prices: pl, unit_min: unitMin(),
        total_cents: rows.reduce((a, r) => a + r.price_cents, 0), billed_cents: rows.filter((r) => r.billed).reduce((a, r) => a + r.price_cents, 0) });
    }
    return false; // nicht unsere Route
  }

  return { handle, who, can, staffAllowedPath, priceList, lessonPriceCents, pushToTeam, THEORY_LESSONS };
}
