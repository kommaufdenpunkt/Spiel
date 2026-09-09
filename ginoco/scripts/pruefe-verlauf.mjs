#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Abgleich: alte Software gegen ginoco-Datenbank. NUR LESEN – aendert nichts.
//
//   sudo -u ginoco node /home/ginoco/spiel/ginoco/scripts/pruefe-verlauf.mjs
//   ... nur einen Schueler:  ... pruefe-verlauf.mjs Katscher
//
// Die Listen unten sind woertlich aus dem alten Programm kopiert – genau so,
// wie sie dort untereinander stehen. Dadurch kann sich beim Uebertragen
// nichts verdrehen. Ein neuer Fahrschueler = ein neuer "### Name"-Block.
// ---------------------------------------------------------------------------
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const hier = dirname(fileURLToPath(import.meta.url));
function ausDienst() {
  try {
    const roh = execFileSync('systemctl', ['show', 'ginoco', '-p', 'Environment', '--value'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const t = roh.split(/\s+/).find((x) => x.startsWith('FSP_DB='));
    return t ? t.slice('FSP_DB='.length) : '';
  } catch { return ''; }
}
const dbPfad = resolve(process.env.FSP_DB || ausDienst() || join(hier, '..', 'fahrschule.db'));
if (!existsSync(dbPfad)) { console.error('Keine Datenbank unter ' + dbPfad); process.exit(1); }
process.env.FSP_DB = dbPfad;
const warnOrig = process.emitWarning;
process.emitWarning = (w, ...r) => { if (/SQLite is an experimental/i.test(String(w))) return; return warnOrig.call(process, w, ...r); };
const { db } = await import('../db.js');

// ===========================================================================
// Woertlich aus dem alten Programm kopiert.
// ===========================================================================
const LISTEN = `
### Lilienthal, Heidi
14.09.26, 11:00 - 13:00
Heidrich Gino
Übungsfahrt
Kl.BA
10.09.26, 11:00 - 12:20
Heidrich Gino
Übungsfahrt
Kl.BA
09.09.26, 11:00 - 12:20
Heidrich Gino
Übungsfahrt
Kl.BA
04.09.26, 11:00 - 13:00
Heidrich Gino
Übungsfahrt
Kl.BA
04.09.26, 10:20 - 11:00
Heidrich Gino
Übungsfahrt
Kl.BA
27.07.26, 06:00 - 07:20
Heidrich Gino
Übungsfahrt
Kl.B
22.07.26, 09:00 - 09:55
Heidrich Gino
Prüfungsfahrt
Kl.BA
22.07.26, 08:10 - 08:50
Heidrich Gino
Übungsfahrt
Kl.BA
10.07.26, 13:10 - 14:30
Heidrich Gino
Übungsfahrt
Kl.B
22.06.26, 11:15 - 12:10
Heidrich Gino
Prüfungsfahrt
Kl.B 197
22.06.26, 10:30 - 11:10
Heidrich Gino
Übungsfahrt
Kl.BA
08.06.26, 14:00 - 14:55
Rechtenbach Tim
Prüfungsfahrt
Kl.B
06.06.26, 12:00 - 14:40
Rechtenbach Tim
Übungsfahrt
Kl.B
05.06.26, 12:00 - 14:40
Rechtenbach Tim
Übungsfahrt
Kl.B
04.06.26, 12:00 - 14:40
Rechtenbach Tim
Übungsfahrt
Kl.B
03.06.26, 11:00 - 13:40
Rechtenbach Tim
Übungsfahrt
Kl.B
02.06.26, 16:00 - 18:40
Rechtenbach Tim
Übungsfahrt
Kl.B
02.06.26, 14:20 - 15:40
Heidrich Gino
Übungsfahrt
Kl.BA
01.06.26, 14:20 - 15:40
Heidrich Gino
Übungsfahrt
Kl.BA
30.05.26, 13:30 - 14:50
Heidrich Gino
Übungsfahrt
Kl.BA
28.05.26, 13:30 - 14:50
Heidrich Gino
Übungsfahrt
Kl.BA
26.05.26, 13:00 - 14:20
Heidrich Gino
Übungsfahrt
Kl.BA
23.05.26, 14:40 - 16:00
Heidrich Gino
Übungsfahrt
Kl.BA
20.05.26, 13:00 - 15:40
Heidrich Gino
Übungsfahrt
Kl.BA
19.05.26, 13:00 - 15:40
Heidrich Gino
Übungsfahrt
Kl.BA
23.04.26, 12:15 - 13:35
Rechtenbach Tim
Übungsfahrt
Kl.B
22.04.26, 10:45 - 12:05
Rechtenbach Tim
Übungsfahrt
Kl.B
20.04.26, 10:45 - 12:05
Rechtenbach Tim
Übungsfahrt
Kl.B
17.04.26, 09:30 - 10:50
Rechtenbach Tim
Übungsfahrt
Kl.B
24.02.25, 12:30 - 13:50
Zieroth André
Übungsfahrt
Kl.B
18.02.25, 18:00 - 20:15
Zieroth André
Nachtfahrt
Kl.B
17.02.25, 09:00 - 10:20
Zieroth André
Übungsfahrt
Kl.B
24.01.25, 16:30 - 18:45
Nachtfahrt
Kl.B 197
22.01.25, 12:45 - 15:45
Autobahnfahrt
Kl.B 197
22.01.25, 09:00 - 12:45
Überlandfahrt
Kl.B 197
26.11.24, 12:00 - 13:00
Übungsfahrt
Kl.BA
06.11.24, 09:30 - 10:30
Übungsfahrt
Kl.B
17.10.24, 10:30 - 11:30
Übungsfahrt
Kl.B
11.08.24, 12:30 - 13:30
Zieroth André
Übungsfahrt
Kl.B
31.07.24, 16:45 - 17:45
Zieroth André
Übungsfahrt
Kl.B
26.07.24, 16:45 - 17:45
Zieroth André
Übungsfahrt
Kl.B
24.07.24, 15:30 - 16:30
Übungsfahrt
Kl.BA
26.06.24, 13:15 - 14:15
Zieroth André
Übungsfahrt
Kl.B

### Katscher, Tiago
09.09.26, 16:50 - 18:50
Heidrich Gino
Übungsfahrt
Kl.BA
02.09.26, 19:00 - 21:00
Heidrich Gino
Übungsfahrt
Kl.BA
30.07.26, 12:30 - 13:40
Zieroth André
Prüfungsfahrt
Kl.A1
30.07.26, 11:00 - 12:20
Zieroth André
Übungsfahrt
Kl.A1
15.07.26, 21:30 - 23:45
Zieroth André
Nachtfahrt
Kl.A1
13.07.26, 15:45 - 17:15
Zieroth André
Autobahnfahrt
Kl.A1
13.07.26, 15:00 - 15:45
Zieroth André
Überlandfahrt
Kl.A1
10.07.26, 12:00 - 14:40
Zieroth André
Übungsfahrt
Kl.A1
16.06.26, 21:30 - 23:00
Zieroth André
Autobahnfahrt
Kl.A1
16.06.26, 18:10 - 21:10
Zieroth André
Überlandfahrt
Kl.A1
29.05.26, 13:00 - 14:20
Zieroth André
Übungsfahrt
Kl.A1
28.05.26, 19:30 - 20:50
Zieroth André
Übungsfahrt
Kl.B
21.05.26, 19:30 - 20:50
Zieroth André
Übungsfahrt
Kl.A1
13.05.26, 18:00 - 19:20
Zieroth André
Übungsfahrt
Kl.A1
08.05.26, 15:00 - 16:20
Zieroth André
Übungsfahrt
Kl.A1
06.05.26, 15:00 - 16:20
Zieroth André
Übungsfahrt
Kl.A1
04.05.26, 15:00 - 16:20
Zieroth André
Übungsfahrt
Kl.A1
10.04.26, 15:00 - 16:20
Zieroth André
Übungsfahrt
Kl.A1
08.04.26, 12:00 - 13:20
Zieroth André
Übungsfahrt
Kl.A1
04.04.26, 15:00 - 16:20
Zieroth André
Übungsfahrt
Kl.A1

### Rahma, Abdul Rahman
14.09.26, 17:30 - 18:50
Heidrich Gino
Übungsfahrt
Kl.B
12.09.26, 17:20 - 18:40
Heidrich Gino
Übungsfahrt
Kl.B
08.09.26, 15:20 - 16:15
Heidrich Gino
Prüfungsfahrt
Kl.B
08.09.26, 14:00 - 15:20
Heidrich Gino
Übungsfahrt
Kl.B
20.08.26, 16:50 - 18:10
Heidrich Gino
Übungsfahrt
Kl.B
17.08.26, 17:35 - 18:55
Heidrich Gino
Übungsfahrt
Kl.B
12.08.26, 17:00 - 18:20
Heidrich Gino
Übungsfahrt
Kl.B
10.08.26, 17:00 - 18:20
Heidrich Gino
Übungsfahrt
Kl.B
18.07.26, 17:30 - 18:50
Heidrich Gino
Übungsfahrt
Kl.B
17.07.26, 17:00 - 18:20
Heidrich Gino
Übungsfahrt
Kl.B
10.07.26, 16:40 - 18:00
Heidrich Gino
Übungsfahrt
Kl.B
`;

// --- Zerlegen ---------------------------------------------------------------
const ARTEN = {
  übungsfahrt: ['normal', 'Übungsfahrt'], prüfungsfahrt: ['normal', 'Prüfungsfahrt'],
  nachtfahrt: ['nacht', 'Nachtfahrt'], autobahnfahrt: ['autobahn', 'Autobahnfahrt'],
  überlandfahrt: ['ueberland', 'Überlandfahrt'],
};
const minute = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const DATUMZEILE = /^(\d{1,2})\.(\d{1,2})\.(\d{2}),\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/;

const schueler = [];
let aktuell = null, eintrag = null;
for (const roh of LISTEN.split('\n')) {
  const z = roh.trim();
  if (!z) continue;
  if (z.startsWith('###')) { aktuell = { name: z.slice(3).trim(), fahrten: [] }; schueler.push(aktuell); eintrag = null; continue; }
  if (!aktuell) continue;
  const m = z.match(DATUMZEILE);
  if (m) {
    eintrag = {
      datum: `20${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`,
      von: m[4].padStart(5, '0'), bis: m[5].padStart(5, '0'),
      dauer: minute(m[5]) - minute(m[4]),
      lehrer: '', art: 'Übungsfahrt', typ: 'normal', klasse: '',
    };
    aktuell.fahrten.push(eintrag);
    continue;
  }
  if (!eintrag) continue;
  const k = z.toLowerCase().replace(/\s+/g, '');
  if (ARTEN[k]) { eintrag.typ = ARTEN[k][0]; eintrag.art = ARTEN[k][1]; continue; }
  if (/^kl\./i.test(z)) { eintrag.klasse = z.replace(/^kl\.\s*/i, '').replace(/\s+/g, ''); continue; }
  eintrag.lehrer = z;                       // alles andere ist der Fahrlehrer
}

// --- Vergleichen ------------------------------------------------------------
const filter = (process.argv[2] || '').toLowerCase();
const dmy = (iso) => iso.split('-').reverse().join('.');
let problemeGesamt = 0;

for (const s of schueler) {
  if (filter && !s.name.toLowerCase().includes(filter)) continue;
  const nach = s.name.split(',')[0].trim();
  const treffer = db.prepare('SELECT id,name FROM students WHERE name LIKE ?').all('%' + nach + '%');
  console.log('\n' + '='.repeat(66));
  console.log(`📋 ${s.name} – ${s.fahrten.length} Fahrten in der alten Software`);
  if (treffer.length !== 1) { console.log(`   ⚠️  In ginoco ${treffer.length === 0 ? 'nicht gefunden' : 'mehrdeutig: ' + treffer.map((t) => t.name).join(', ')}`); problemeGesamt++; continue; }
  const sid = treffer[0].id;
  const ist = db.prepare(
    `SELECT id,date,start_time,duration_min,status,lesson_type,license_class,gearbox,instructor_name,attended,needs_sign,signed_at
     FROM bookings WHERE student_id=? AND status!='cancelled' ORDER BY date DESC, start_time DESC`).all(sid);
  console.log(`   ginoco: ${treffer[0].name} (ID ${sid}) – ${ist.length} Fahrten`);

  const schl = (d, t) => `${d} ${t}`;
  const istMap = new Map(ist.map((b) => [schl(b.date, b.start_time), b]));
  const sollMap = new Map(s.fahrten.map((f) => [schl(f.datum, f.von), f]));
  const fehlt = [], zuviel = [], abweichung = [], klassen = [];

  for (const f of s.fahrten) {
    const b = istMap.get(schl(f.datum, f.von));
    if (!b) { fehlt.push(f); continue; }
    const p = [];
    if (b.duration_min !== f.dauer) p.push(`Dauer ${b.duration_min} statt ${f.dauer} Min`);
    const istL = (b.instructor_name || '').trim();
    const sollL = /^Heidrich/i.test(f.lehrer) ? '' : f.lehrer;
    if (istL.replace(/é/g, 'e') !== sollL.replace(/é/g, 'e')) p.push(`Fahrlehrer "${istL || '(du)'}" statt "${sollL || '(du)'}"`);
    if ((b.lesson_type || 'normal') !== f.typ) p.push(`Art "${b.lesson_type || 'normal'}" statt "${f.typ}"`);
    if (p.length) abweichung.push({ f, b, p });
    // Klasse getrennt sammeln – nur zur Ansicht, nicht als Fehler gewertet.
    const sollK = f.klasse.replace(/^B197$/, 'B 197');
    if ((b.license_class || 'B') !== sollK.replace(/\s/g, '') && sollK) klassen.push({ f, b, sollK });
  }
  for (const b of ist) if (!sollMap.has(schl(b.date, b.start_time))) zuviel.push(b);

  const zeile = (f) => `${dmy(f.datum)} ${f.von}-${f.bis}  ${String(f.dauer).padStart(3)} Min  ${(f.lehrer || 'du').padEnd(16)} ${f.art}${f.klasse ? '  Kl.' + f.klasse : ''}`;
  if (!fehlt.length && !zuviel.length && !abweichung.length) {
    console.log('\n   ✅ Datum, Uhrzeit, Dauer, Fahrlehrer und Fahrt-Art stimmen überein.');
  } else {
    problemeGesamt += fehlt.length + zuviel.length + abweichung.length;
    if (fehlt.length) { console.log(`\n   ❌ FEHLEN in ginoco (${fehlt.length}):`); for (const f of fehlt) console.log('      ' + zeile(f)); }
    if (zuviel.length) { console.log(`\n   ⚠️  NUR in ginoco (${zuviel.length}):`); for (const b of zuviel) console.log(`      ${dmy(b.date)} ${b.start_time}  ${String(b.duration_min).padStart(3)} Min  ${b.instructor_name || 'du'}  [${b.status}]  #${b.id}`); }
    if (abweichung.length) { console.log(`\n   🔎 ABWEICHUNGEN (${abweichung.length}):`); for (const a of abweichung) console.log(`      ${dmy(a.f.datum)} ${a.f.von}  #${a.b.id}\n         ${a.p.join('\n         ')}`); }
  }
  if (klassen.length) {
    const zus = {};
    for (const k of klassen) { const key = `${k.b.license_class || 'B'} statt ${k.sollK}`; zus[key] = (zus[key] || 0) + 1; }
    console.log(`\n   ℹ️  Führerschein-Klasse weicht ab (${klassen.length} Fahrten) – nur zur Ansicht:`);
    for (const [k, n] of Object.entries(zus)) console.log(`      ${n}x  ${k}`);
  }

  const gefahren = ist.filter((b) => b.status === 'done' && b.attended !== 0);
  const summe = gefahren.reduce((n, b) => n + b.duration_min, 0);
  const sonder = {};
  for (const b of gefahren) if (b.lesson_type && b.lesson_type !== 'normal') sonder[b.lesson_type] = (sonder[b.lesson_type] || 0) + b.duration_min;
  console.log(`\n   📊 gefahren: ${gefahren.length} Fahrten, ${summe} Min (${(summe / 45).toFixed(1)} Einheiten)`);
  console.log('      Sonderfahrten: ' + (Object.keys(sonder).length ? Object.entries(sonder).map(([k, v]) => `${k} ${v} Min`).join(', ') : 'keine'));
  const offen = ist.filter((b) => b.status === 'booked');
  if (offen.length) console.log('      noch geplant: ' + offen.map((b) => dmy(b.date) + ' ' + b.start_time).join(', '));
  console.log('      Unterschrift steht aus: ' + gefahren.filter((b) => b.needs_sign === 1 && !b.signed_at).length);
}
console.log('\n' + '='.repeat(66));
console.log(problemeGesamt ? `Fertig – ${problemeGesamt} Punkt(e) zum Anschauen.\n` : 'Fertig – alles sauber.\n');
