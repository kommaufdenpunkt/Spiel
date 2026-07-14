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

  CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);
  CREATE INDEX IF NOT EXISTS idx_blocks_date   ON blocks(date);
  CREATE INDEX IF NOT EXISTS idx_notif_student ON notifications(student_id, read);
`);

// ---- Migrationen fuer bestehende Datenbanken ----
const cols = db.prepare('PRAGMA table_info(students)').all().map((c) => c.name);
if (!cols.includes('allowed_durations')) {
  db.exec("ALTER TABLE students ADD COLUMN allowed_durations TEXT NOT NULL DEFAULT '80'");
}

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
  workdays: '1,2,3,4,5,6',   // 1=Mo ... 7=So
  max_per_week: '2',         // max. Fahrstunden pro Schueler & Woche
  booking_horizon_days: '14',// so viele Tage im Voraus duerfen Schueler buchen
  cancel_hours: '48',        // bis so viele Std. vorher kostenlose Stornierung
  lock_hours: '36',          // ab so viel Std. vorher ist der Termin gesperrt (kein Absagen/Abgeben)
  release_time: '10:00',     // Uhrzeit, zu der taeglich der neue Tag am Horizont oeffnet
  short_day_last_start: '13:35', // letzter Slot an "kurzen Tagen" (frueher Feierabend)
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
    'max_per_week', 'booking_horizon_days', 'cancel_hours', 'lock_hours']) {
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
