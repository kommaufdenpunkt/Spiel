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
ensureColumn('students', 'first_name', 'first_name TEXT');     // Vorname (getrennt gepflegt; name bleibt der kombinierte Anzeigename)
ensureColumn('students', 'last_name', 'last_name TEXT');       // Nachname
ensureColumn('students', 'live_lat', 'live_lat REAL');         // Live-Standort des Schülers (nur im Abhol-Fenster, auf Tipp)
ensureColumn('students', 'live_lng', 'live_lng REAL');
ensureColumn('students', 'live_at', 'live_at TEXT');
ensureColumn('students', 'live_active', 'live_active INTEGER NOT NULL DEFAULT 0');
// Stammdaten fürs Profil (Adresse + Geburtsdatum). Nur der Fahrlehrer sieht sie (DSGVO).
ensureColumn('students', 'birth_date', 'birth_date TEXT');    // Geburtsdatum YYYY-MM-DD (für exaktes Alter / Ausbildungsvertrag)
ensureColumn('students', 'street', 'street TEXT');            // Straße
ensureColumn('students', 'house_no', 'house_no TEXT');        // Hausnummer
ensureColumn('students', 'zip', 'zip TEXT');                  // PLZ
ensureColumn('students', 'city', 'city TEXT');                // Ort

// Absagen ("keine Zeit") auf ein Uebernahme-Angebot
db.exec(`CREATE TABLE IF NOT EXISTS offer_declines (
  booking_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  PRIMARY KEY (booking_id, student_id)
);`);

// Bewertungen (Testimonials). Bleiben dauerhaft erhalten – auch wenn die Akte
// nach bestandener Pruefung geschlossen (archiviert) oder der Zugang geloescht wird.
db.exec(`CREATE TABLE IF NOT EXISTS reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER,                              -- kann NULL werden (Bewertung ueberlebt)
  rating      INTEGER NOT NULL DEFAULT 5,           -- 1..5 Sterne
  text        TEXT NOT NULL,
  author_mode TEXT NOT NULL DEFAULT 'initials',     -- 'full' | 'initials' | 'anon'
  show_photo  INTEGER NOT NULL DEFAULT 0,           -- Profilfoto mitzeigen?
  published   INTEGER NOT NULL DEFAULT 1,           -- vom Fahrlehrer sichtbar geschaltet
  reply       TEXT,                                 -- optionale Antwort des Fahrlehrers
  author_name TEXT,                                 -- Schnappschuss des Anzeigenamens
  created_at  TEXT NOT NULL
);`);
db.exec('CREATE INDEX IF NOT EXISTS idx_reviews_pub ON reviews(published, created_at)');
ensureColumn('reviews', 'featured', 'featured INTEGER NOT NULL DEFAULT 0'); // vom Fahrlehrer angeheftet -> zuerst
// Nachgetragene Fahrstunden: der Fahrschüler bestätigt/unterschreibt sie in der App.
ensureColumn('bookings', 'needs_sign', 'needs_sign INTEGER NOT NULL DEFAULT 0'); // 1 = wartet auf Unterschrift des Schülers
ensureColumn('bookings', 'signed_at', 'signed_at TEXT');   // Zeitpunkt der Unterschrift/Bestätigung
ensureColumn('bookings', 'signature', 'signature TEXT');   // gezeichnete Unterschrift (data-URL, optional)
// Rechnungsdatum: die Stunde wird an X gefahren, erscheint aber auf der Rechnung
// (paralleles Abrechnungsprogramm) unter Y – z.B. wegen der 495-Min-Tagesgrenze.
ensureColumn('bookings', 'invoice_date', 'invoice_date TEXT'); // YYYY-MM-DD (abweichendes Rechnungsdatum)
ensureColumn('bookings', 'invoice_time', 'invoice_time TEXT'); // HH:MM (abweichende Rechnungsuhrzeit)
// An diesem Tag behandelte Ausbildungs-Themen (JSON-Array von Curriculum-Schlüsseln).
ensureColumn('bookings', 'curriculum', 'curriculum TEXT');
// Aufschlüsselung je Kategorie als JSON, z.B. {"geduld":5,"erklaerung":4,...}
// (aus dem geführten "Durchbewerten"-Ablauf). NULL bei alten Bewertungen.
ensureColumn('reviews', 'ratings', 'ratings TEXT');

// Web-Push-Abos (Handy-Benachrichtigungen). Ein Gerät = eine Zeile (endpoint eindeutig).
db.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER,
  kind       TEXT NOT NULL DEFAULT 'student',   -- 'student' | 'instructor'
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TEXT NOT NULL
);`);
db.exec('CREATE INDEX IF NOT EXISTS idx_push_student ON push_subscriptions(student_id)');

// Nachrichten (Fahrschüler <-> Fahrlehrer). Ein Gespräch pro Schüler.
db.exec(`CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id      INTEGER NOT NULL,               -- Gesprächspartner (immer ein Schüler)
  sender          TEXT NOT NULL,                  -- 'student' | 'instructor'
  body            TEXT NOT NULL,
  read_student    INTEGER NOT NULL DEFAULT 0,     -- vom Schüler gelesen
  read_instructor INTEGER NOT NULL DEFAULT 0,     -- vom Fahrlehrer gelesen
  created_at      TEXT NOT NULL
);`);
db.exec('CREATE INDEX IF NOT EXISTS idx_messages_student ON messages(student_id, id)');
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
ensureColumn('bookings', 'started_at', 'started_at TEXT');   // Fahrstunden-Timer: Zeitpunkt, an dem "Start" gedrueckt wurde
// confirmed: hat der Schueler den Termin bestaetigt? DEFAULT 1, damit bestehende
// Buchungen als bestaetigt gelten – nur NEUE vom Fahrlehrer eingetragene Termine
// starten als "reserviert" (0) und muessen vom Schueler bestaetigt werden.
ensureColumn('bookings', 'confirmed', 'confirmed INTEGER NOT NULL DEFAULT 1');
ensureColumn('bookings', 'delay_min', 'delay_min INTEGER NOT NULL DEFAULT 0'); // heutige Verspätung (Min), die der Fahrlehrer angesagt hat – nur für den beruhigenden Live-Status
ensureColumn('bookings', 'ended_at', 'ended_at TEXT');       // Fahrstunde beendet (fürs Protokoll: von–bis)
ensureColumn('bookings', 'feedback', 'feedback TEXT');       // Rückmeldung an den Schüler ("das haben wir gemacht")
// Abholzeit (Minuten) je Schueler – vom Fahrlehrer gepflegt (z.B. Groß Schönebeck = 30).
// NULL = automatisch aus dem Wohnort schaetzen (Luftlinie / Durchschnittstempo).
ensureColumn('students', 'travel_min', 'travel_min INTEGER');
// Von welchem Standort wird die Abholzeit gerechnet? '' = automatisch (naeherer),
// 'main' = Eberswalde, 'finow' = zweiter Standort. Nur relevant fuer die Schaetzung.
ensureColumn('students', 'home_base', 'home_base TEXT');
// Verfuegbarkeit je Wochentag als JSON, z.B. {"mo":[["08:00","12:00"]],"di":[...],...}
// Leer/NULL = keine Angabe. Basis fuer die automatischen Terminvorschlaege.
ensureColumn('students', 'availability', 'availability TEXT');

// Live-Standort des Fahrlehrers (genau eine Zeile)
db.exec(`CREATE TABLE IF NOT EXISTS live_location (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  lat REAL, lng REAL, updated_at TEXT, active INTEGER NOT NULL DEFAULT 0
);`);
db.exec('INSERT OR IGNORE INTO live_location(id,active) VALUES(1,0)');
ensureColumn('live_location', 'eta_min', 'eta_min INTEGER');  // "Ich bin in X Min da" (vom Fahrlehrer gesagt)
ensureColumn('live_location', 'eta_at', 'eta_at TEXT');       // wann gesagt (zum Runterzaehlen)

// Tagesstatus: der Fahrlehrer sagt fuer einen Tag "laeuft planmaessig" oder meldet
// eine Verzoegerung mit Grund (Berufsverkehr, Stau, Schnee, Glatteis, Witterung).
db.exec(`CREATE TABLE IF NOT EXISTS day_status (
  date TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'ok',   -- 'ok' | 'delay'
  minutes INTEGER NOT NULL DEFAULT 0, -- ungefaehre Verzoegerung in Minuten
  reason TEXT,                        -- rush | jam | snow | ice | weather | other
  note TEXT,                          -- optionaler Freitext
  updated_at TEXT
);`);

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
  monthly_max_h: '130',      // Skala-Ende der Monats-Tachouhr (hoechstens)
  workdays: '1,2,3,4,5,6',   // 1=Mo ... 7=So
  max_per_week: '2',         // max. Fahrstunden pro Schueler & Woche
  student_max_per_day: '1',  // max. selbst gebuchte Fahrstunden pro Schueler & Tag (0 = ohne Limit; Fahrlehrer-Eintraege zaehlen nicht)
  reserve_expire_min: '120', // vom Fahrlehrer vorgeschlagener Termin verfaellt nach so vielen Min ohne Antwort (0 = nie); gedeckelt durch den Termin selbst
  weather_enabled: '1',      // Wetter-Hinweis (Glatteis/Schnee/Regen) fuer den Tagesstatus aus dem DWD (BrightSky, kostenlos, kein Schluessel)
  weather_autostatus: '0',   // 1 = bei Glatteis/Schnee automatisch die heutigen Schueler vorwarnen (ohne Zutun des Fahrlehrers)
  booking_horizon_days: '10',// so viele Tage im Voraus duerfen Schueler buchen (Rang 1)
  cancel_hours: '48',        // bis so viele Std. vorher kostenlose Stornierung
  lock_hours: '36',          // ab so viel Std. vorher ist der Termin gesperrt (kein Absagen/Abgeben)
  release_time: '06:00',     // Uhrzeit, zu der taeglich der neue Tag am Horizont oeffnet (frueh: 06:00)
  short_day_last_start: '13:35', // letzter Slot an "kurzen Tagen" (frueher Feierabend)
  vacation_credit_min: '240',// Minuten, die ein Urlaubstag als Arbeitszeit zaehlt
  vacation_days_left: '30',  // verbleibende Urlaubstage (nur zur Anzeige)
  late_grace_min: '20',      // bis so viele Min Verspaetung ok; danach zaehlt die Zeit ab
  instructor_phone: '',      // Handynummer des Fahrlehrers (fuer Anruf/WhatsApp)
  avg_speed_kmh: '30',       // angenommene Durchschnittsgeschwindigkeit fuer die ETA
  // Fliessender Tagesplan: Startzeit der naechsten Stunde wandert mit Dauer + Pause + Abholzeit
  flow_schedule: '1',        // '1' = fliessender, lueckenloser Tagesplan (statt festem Raster)
  auto_fill_gaps: '1',       // '1' = faellt eine Stunde aus, ruecken die folgenden automatisch nach vorne
  // Standort der Fahrschule (Untern Buchen, Eisenbahnstr. 31, 16321 Eberswalde) – Basis fuer die Abholzeit
  school_lat: '52.8300',
  school_lng: '13.8160',
  school_label: 'Eberswalde (Eisenbahnstr. 31)',
  // Zweiter Standort (Finow) – die Abholzeit wird automatisch vom naeheren Standort gerechnet
  school2_label: 'Finow',
  school2_lat: '52.8360',
  school2_lng: '13.6990',
  // Startadresse des Fahrlehrers (von wo aus der Tag beginnt/endet) – Basis fuer „wann losfahren?"
  instructor_home_label: 'Ladeburg, Schmetzdorfer Str. 9',
  instructor_home_lat: '52.7860',
  instructor_home_lng: '13.6360',
  travel_default_min: '0',   // Abholzeit, falls fuer einen Schueler nichts Genaues hinterlegt ist
  live_lead_min: '20',       // so viele Min vor Beginn wird der Live-Standort geteilt
  meet_default_label: '',    // Standard-Treffpunkt (Text)
  meet_default_lat: '',      // Standard-Treffpunkt-Koordinaten (optional)
  meet_default_lng: '',
  anonymous_swaps: '1',      // Tausch anonym (Schueler sehen sich untereinander nicht)
  req_ueberland: '5',        // Soll-Sonderfahrten: Ueberland (5 UE)
  req_autobahn: '4',         // Soll-Sonderfahrten: Autobahn (4 UE)
  req_nacht: '3',            // Soll-Sonderfahrten: Nachtfahrt (3 UE)
  sonder_min_ueberland: '225',// Dauer je Ueberland-Sonderfahrt (Minuten) – 5 UE
  sonder_min_autobahn: '180', // Dauer je Autobahn-Sonderfahrt (Minuten) – 4 UE
  sonder_min_nacht: '135',    // Dauer je Nachtfahrt (Minuten) – 3 UE
  rank2_min_lessons: '15',   // ab so vielen gefahrenen Stunden -> Rang 2 (Sonderfahrten frei)
  booking_horizon_days_rank2: '21', // Rang 2 darf so viele Tage im Voraus buchen
  registration_open: '0',    // '1' = neue Fahrschüler dürfen sich mit Code registrieren, '0' = geschlossen (privat)
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

// Einmalige Anpassung bestehender Installationen auf die neuen Vorgaben
// (fruehe Freigabe 06:00, Monats-Skala bis 130 h). Nur, wenn der Wert noch
// exakt auf dem alten Standard steht – manuell geaenderte Werte bleiben unangetastet.
if (!getSetting.get('mig_flow_v1')) {
  const bump = (key, from, to) => {
    const cur = getSetting.get(key);
    if (cur && cur.value === from) setSetting.run(key, to);
  };
  bump('release_time', '10:00', '06:00');
  bump('monthly_max_h', '100', '130');
  setSetting.run('mig_flow_v1', '1');
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
  // Authenticator-Geheimnis & Wiederherstellungs-Hashes nie ausliefern – nur Status.
  out.totp_enabled = !!out.instructor_totp;
  out.two_factor = out.instructor_2fa === '1';
  // Passkeys: nur den Status (an/aus) ausliefern, nie die gespeicherten Schlüssel.
  let pkCount = 0; try { pkCount = (JSON.parse(out.instructor_passkeys || '[]') || []).length; } catch {}
  out.passkey_enabled = pkCount > 0;
  delete out.instructor_totp; delete out.instructor_totp_pending; delete out.instructor_recovery; delete out.instructor_passkeys;
  // Zahlen als Zahlen liefern
  for (const n of ['lesson_min', 'break_min', 'weekly_target_h', 'daily_target_h', 'weekly_lo_h',
    'monthly_target_h', 'monthly_max_h',
    'max_per_week', 'student_max_per_day', 'reserve_expire_min', 'booking_horizon_days', 'cancel_hours', 'lock_hours',
    'vacation_credit_min', 'vacation_days_left', 'late_grace_min', 'avg_speed_kmh', 'live_lead_min',
    'req_ueberland', 'req_autobahn', 'req_nacht', 'rank2_min_lessons', 'booking_horizon_days_rank2',
    'sonder_min_ueberland', 'sonder_min_autobahn', 'sonder_min_nacht']) {
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
