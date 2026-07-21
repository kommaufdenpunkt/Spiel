// Datenbank-Schicht fuer das Fahrschulportal.
// Nutzt das in Node 22 eingebaute SQLite (keine externen Pakete noetig).
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.FSP_DB || join(__dirname, 'fahrschule.db');

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS students (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL UNIQUE,
    phone      TEXT,
    pass       TEXT NOT NULL,
    allowed_durations TEXT NOT NULL DEFAULT '80',  -- erlaubte Slot-Laengen (Komma), z.B. '40,80,120'
    created_at TEXT NOT NULL
  );

  -- Tages-Ausnahmen: kurzer Tag (frueherer Feierabend) oder ganz frei
  CREATE TABLE IF NOT EXISTS day_overrides (
    date       TEXT PRIMARY KEY,     -- YYYY-MM-DD
    start_time TEXT,                 -- abweichender Arbeitsbeginn (NULL = Standard)
    last_start TEXT,                 -- abweichender letzter Slot (NULL = Standard)
    closed     INTEGER NOT NULL DEFAULT 0,  -- 1 = ganzer Tag frei
    note       TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS codes (
    code       TEXT PRIMARY KEY,
    note       TEXT,
    used       INTEGER NOT NULL DEFAULT 0,
    student_id INTEGER,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    kind       TEXT NOT NULL,           -- 'student' | 'instructor'
    student_id INTEGER,
    expires    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id   INTEGER,               -- NULL = vom Fahrlehrer selbst erstellt
    date         TEXT NOT NULL,         -- YYYY-MM-DD
    start_time   TEXT NOT NULL,         -- HH:MM
    duration_min INTEGER NOT NULL,
    status       TEXT NOT NULL DEFAULT 'booked',  -- booked | done | cancelled
    gearbox      TEXT,                  -- 'schalt' | 'automatik' | NULL
    plate        TEXT,                  -- Kennzeichen, optional
    title        TEXT,                  -- fuer Fahrlehrer-eigene Termine
    note         TEXT,
    created_at   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS blocks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date        TEXT NOT NULL,
    start_time  TEXT NOT NULL,
    end_time    TEXT NOT NULL,
    title       TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'block',  -- 'theorie' | 'block' | 'frei'
    count_hours INTEGER NOT NULL DEFAULT 1,     -- zaehlt die Zeit als Arbeitszeit?
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id     INTEGER NOT NULL,
    kind           TEXT NOT NULL,        -- 'offer' | 'shift' | 'info'
    message        TEXT NOT NULL,
    date           TEXT,                 -- betroffener Tag (optional)
    ref_booking_id INTEGER,
    read           INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL
  );

  -- Protokoll / Ereignis-Log (dient auch als Fahrlehrer-Benachrichtigungen)
  CREATE TABLE IF NOT EXISTS events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    at           TEXT NOT NULL,
    type         TEXT NOT NULL,   -- book|cancel_student|cancel_instr|offer|take|shift|delay|done|noshow|vacation|reminder
    actor        TEXT,            -- 'student' | 'instructor' | 'system'
    student_id   INTEGER,
    student_name TEXT,            -- denormalisiert (bleibt lesbar im Protokoll)
    booking_id   INTEGER,
    date         TEXT,
    detail       TEXT,
    seen         INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);
  CREATE INDEX IF NOT EXISTS idx_blocks_date   ON blocks(date);
  CREATE INDEX IF NOT EXISTS idx_notif_student ON notifications(student_id, read);
  CREATE INDEX IF NOT EXISTS idx_events_at ON events(at);
`);

// ---- Migrationen fuer bestehende Datenbanken ----
function ensureColumn(table, col, ddl) {
  const has = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
  if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
ensureColumn('students', 'allowed_durations', "allowed_durations TEXT NOT NULL DEFAULT '80'");
ensureColumn('students', 'username', 'username TEXT');       // Login-Handle (Initialen+Jahrgang), zusaetzlich zur E-Mail
ensureColumn('students', 'birth_year', 'birth_year INTEGER');

// E-Mail optional machen: falls die Spalte noch NOT NULL ist, Tabelle einmalig umbauen.
const emailCol = db.prepare('PRAGMA table_info(students)').all().find((c) => c.name === 'email');
if (emailCol && emailCol.notnull === 1) {
  db.exec(`
    CREATE TABLE students_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      pass TEXT NOT NULL,
      allowed_durations TEXT NOT NULL DEFAULT '80',
      username TEXT,
      birth_year INTEGER,
      created_at TEXT NOT NULL
    );
    INSERT INTO students_new (id,name,email,phone,pass,allowed_durations,username,birth_year,created_at)
      SELECT id,name,email,phone,pass,allowed_durations,username,birth_year,created_at FROM students;
    DROP TABLE students;
    ALTER TABLE students_new RENAME TO students;
  `);
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_students_username ON students(username) WHERE username IS NOT NULL');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_students_email ON students(email) WHERE email IS NOT NULL');

// Fester Treffpunkt/Standort pro Schueler (mit dem Schueler abgesprochen) – NACH der
// evtl. Tabellen-Neuanlage oben, damit die Spalten nicht wieder verloren gehen.
ensureColumn('students', 'home_label', 'home_label TEXT');
ensureColumn('students', 'home_lat', 'home_lat REAL');
ensureColumn('students', 'home_lng', 'home_lng REAL');
ensureColumn('students', 'archived_at', 'archived_at TEXT');   // gesetzt = bestanden/archiviert (aus aktiver Liste)
ensureColumn('students', 'notes', 'notes TEXT');               // Karteikarte / Notizen des Fahrlehrers
ensureColumn('students', 'training', 'training TEXT');         // Ausbildungsdiagrammkarte (JSON: abgehakte Punkte)
ensureColumn('students', 'photo', 'photo TEXT');               // Profilfoto (data-URL, vom Schueler selbst hochgeladen; nur fuer den Fahrlehrer sichtbar)

// Absagen ("keine Zeit") auf ein Uebernahme-Angebot
db.exec(`CREATE TABLE IF NOT EXISTS offer_declines (
  booking_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  PRIMARY KEY (booking_id, student_id)
);`);
ensureColumn('bookings', 'attended', 'attended INTEGER');            // 1 = da, 0 = nicht erschienen, NULL = offen
ensureColumn('bookings', 'late_minutes', 'late_minutes INTEGER NOT NULL DEFAULT 0');
ensureColumn('bookings', 'reason', 'reason TEXT');
ensureColumn('bookings', 'reminded_1d', 'reminded_1d INTEGER NOT NULL DEFAULT 0');
ensureColumn('bookings', 'reminded_3h', 'reminded_3h INTEGER NOT NULL DEFAULT 0');
ensureColumn('bookings', 'reminded_30m', 'reminded_30m INTEGER NOT NULL DEFAULT 0');
ensureColumn('day_overrides', 'type', "type TEXT NOT NULL DEFAULT 'short'");  // short | free | vacation
ensureColumn('bookings', 'meet_label', 'meet_label TEXT');   // Treffpunkt (Text)
ensureColumn('bookings', 'meet_lat', 'meet_lat REAL');       // Treffpunkt-Koordinaten (optional)
ensureColumn('bookings', 'meet_lng', 'meet_lng REAL');
ensureColumn('bookings', 'lesson_type', 'lesson_type TEXT'); // normal | ueberland | autobahn | nacht
ensureColumn('bookings', 'offer_named', 'offer_named INTEGER NOT NULL DEFAULT 0'); // 1 = Anbieter zeigt beim Feed-Angebot freiwillig seinen Vornamen

// Live-Standort des Fahrlehrers (genau eine Zeile)
db.exec(`CREATE TABLE IF NOT EXISTS live_location (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  lat REAL, lng REAL, updated_at TEXT, active INTEGER NOT NULL DEFAULT 0
);`);
db.exec('INSERT OR IGNORE INTO live_location(id,active) VALUES(1,0)');

// ---- Voreinstellungen (einmalig setzen) ----
const DEFAULTS = {
  instructor_name: 'Fahrlehrer',
  start_time: '12:00',       // frühester Slot-Start
  last_start: '16:45',       // letzter buchbarer Slot-Start (ergibt 4 Slots/Tag)
  lesson_min: '80',          // Dauer einer Fahrstunde in Minuten
  break_min: '15',           // Pause zwischen zwei Fahrstunden
  weekly_target_h: '25',     // Wochenziel in Stunden
  daily_target_h: '5.3',     // Tagesziel in Stunden (4 Slots)
  weekly_lo_h: '25',         // untere Zielspanne (gelb -> gruen)
  monthly_target_h: '80',    // Monatsziel in Stunden (mind. 80, gruen ab hier)
  monthly_max_h: '100',      // Skala-Ende der Monats-Tachouhr (hoechstens)
  workdays: '1,2,3,4,5,6',   // 1=Mo ... 7=So
  max_per_week: '2',         // max. Fahrstunden pro Schueler & Woche
  booking_horizon_days: '14',// so viele Tage im Voraus duerfen Schueler buchen
  cancel_hours: '48',        // bis so viele Std. vorher kostenlose Stornierung
  lock_hours: '36',          // ab so viel Std. vorher ist der Termin gesperrt (kein Absagen/Abgeben)
  release_time: '10:00',     // Uhrzeit, zu der taeglich der neue Tag am Horizont oeffnet
  short_day_last_start: '13:35', // letzter Slot an "kurzen Tagen" (frueher Feierabend)
  vacation_credit_min: '240',// Minuten, die ein Urlaubstag als Arbeitszeit zaehlt
  vacation_days_left: '30',  // verbleibende Urlaubstage (nur zur Anzeige)
  late_grace_min: '20',      // bis so viele Min Verspaetung ok; danach zaehlt die Zeit ab
  instructor_phone: '',      // Handynummer des Fahrlehrers (fuer Anruf/WhatsApp)
  avg_speed_kmh: '30',       // angenommene Durchschnittsgeschwindigkeit fuer die ETA
  live_lead_min: '20',       // so viele Min vor Beginn wird der Live-Standort geteilt
  meet_default_label: '',    // Standard-Treffpunkt (Text)
  meet_default_lat: '',      // Standard-Treffpunkt-Koordinaten (optional)
  meet_default_lng: '',
  anonymous_swaps: '1',      // Tausch anonym (Schueler sehen sich untereinander nicht)
  req_ueberland: '5',        // Soll-Sonderfahrten: Ueberland
  req_autobahn: '4',         // Soll-Sonderfahrten: Autobahn
  req_nacht: '3',            // Soll-Sonderfahrten: Nachtfahrt
  rank2_min_lessons: '15',   // ab so vielen gefahrenen Stunden -> Rang 2
  booking_horizon_days_rank2: '21', // Rang 2 darf so viele Tage im Voraus buchen
  policy_text: 'Gebuchte Termine sind verbindlich. Kostenfrei stornieren nur bis '
    + '48 Std. vorher; ab 36 Std. vorher steht der Termin fest. Bei Nichterscheinen '
    + 'werden bis zu 75 % berechnet. Ab 20 Min Verspätung verkürzt sich die Fahrstunde '
    + 'entsprechend (die Zeit läuft ab dem vereinbarten Beginn).',
};

const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSetting = db.prepare(
  'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
);

for (const [k, v] of Object.entries(DEFAULTS)) {
  if (!getSetting.get(k)) setSetting.run(k, v);
}

// Standard-PIN nur beim allerersten Start setzen (1234). Aenderbar in den Einstellungen.
if (!getSetting.get('instructor_pin')) {
  setSetting.run('instructor_pin', hashPassword('1234'));
}

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  delete out.instructor_pin; // niemals nach aussen geben
  // Zahlen als Zahlen liefern
  for (const n of ['lesson_min', 'break_min', 'weekly_target_h', 'daily_target_h', 'weekly_lo_h',
    'monthly_target_h', 'monthly_max_h',
    'max_per_week', 'booking_horizon_days', 'cancel_hours', 'lock_hours',
    'vacation_credit_min', 'vacation_days_left', 'late_grace_min', 'avg_speed_kmh', 'live_lead_min',
    'req_ueberland', 'req_autobahn', 'req_nacht', 'rank2_min_lessons', 'booking_horizon_days_rank2']) {
    out[n] = Number(out[n]);
  }
  return out;
}

export function getSettingRaw(key) {
  const r = getSetting.get(key);
  return r ? r.value : null;
}

export function setSettingRaw(key, value) {
  setSetting.run(key, String(value));
}

// ---- Passwoerter / PINs ----
export function hashPassword(pw) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(pw), salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(pw, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [saltHex, hashHex] = stored.split(':');
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(String(pw), salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
