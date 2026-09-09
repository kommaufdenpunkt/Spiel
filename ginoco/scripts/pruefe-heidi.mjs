#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Abgleich: Heidi Lilienthal – alte Software gegen ginoco-Datenbank.
// NUR LESEN. Dieses Skript aendert nichts, es zeigt nur Unterschiede.
//
// Aufruf auf dem Server:
//   sudo -u ginoco node /home/ginoco/spiel/ginoco/scripts/pruefe-heidi.mjs
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

// --- Die Liste aus der alten Software (Datum, von, bis, Fahrlehrer, Art, Klasse)
const SOLL = `
14.09.26 11:00 13:00 Heidrich Gino    | Übungsfahrt    | BA
10.09.26 11:00 12:20 Heidrich Gino    | Übungsfahrt    | BA
09.09.26 11:00 12:20 Heidrich Gino    | Übungsfahrt    | BA
04.09.26 11:00 13:00 Heidrich Gino    | Übungsfahrt    | BA
04.09.26 10:20 11:00 Heidrich Gino    | Übungsfahrt    | BA
27.07.26 06:00 07:20 Heidrich Gino    | Übungsfahrt    | B
22.07.26 09:00 09:55 Heidrich Gino    | Prüfungsfahrt  | BA
22.07.26 08:10 08:50 Heidrich Gino    | Übungsfahrt    | BA
10.07.26 13:10 14:30 Heidrich Gino    | Übungsfahrt    | B
22.06.26 11:15 12:10 Heidrich Gino    | Prüfungsfahrt  | B197
22.06.26 10:30 11:10 Heidrich Gino    | Übungsfahrt    | BA
08.06.26 14:00 14:55 Rechtenbach Tim  | Prüfungsfahrt  | B
06.06.26 12:00 14:40 Rechtenbach Tim  | Übungsfahrt    | B
05.06.26 12:00 14:40 Rechtenbach Tim  | Übungsfahrt    | B
04.06.26 12:00 14:40 Rechtenbach Tim  | Übungsfahrt    | B
03.06.26 11:00 13:40 Rechtenbach Tim  | Übungsfahrt    | B
02.06.26 16:00 18:40 Rechtenbach Tim  | Übungsfahrt    | B
02.06.26 14:20 15:40 Heidrich Gino    | Übungsfahrt    | BA
01.06.26 14:20 15:40 Heidrich Gino    | Übungsfahrt    | BA
30.05.26 13:30 14:50 Heidrich Gino    | Übungsfahrt    | BA
28.05.26 13:30 14:50 Heidrich Gino    | Übungsfahrt    | BA
26.05.26 13:00 14:20 Heidrich Gino    | Übungsfahrt    | BA
23.05.26 14:40 16:00 Heidrich Gino    | Übungsfahrt    | BA
20.05.26 13:00 15:40 Heidrich Gino    | Übungsfahrt    | BA
19.05.26 13:00 15:40 Heidrich Gino    | Übungsfahrt    | BA
23.04.26 12:15 13:35 Rechtenbach Tim  | Übungsfahrt    | B
22.04.26 10:45 12:05 Rechtenbach Tim  | Übungsfahrt    | B
20.04.26 10:45 12:05 Rechtenbach Tim  | Übungsfahrt    | B
17.04.26 09:30 10:50 Rechtenbach Tim  | Übungsfahrt    | B
24.02.25 12:30 13:50 Zieroth André    | Übungsfahrt    | B
18.02.25 18:00 20:15 Zieroth André    | Nachtfahrt     | B
17.02.25 09:00 10:20 Zieroth André    | Übungsfahrt    | B
24.01.25 16:30 18:45 -                | Nachtfahrt     | B197
22.01.25 12:45 15:45 -                | Autobahnfahrt  | B197
22.01.25 09:00 12:45 -                | Überlandfahrt  | B197
26.11.24 12:00 13:00 -                | Übungsfahrt    | BA
06.11.24 09:30 10:30 -                | Übungsfahrt    | B
17.10.24 10:30 11:30 -                | Übungsfahrt    | B
11.08.24 12:30 13:30 Zieroth André    | Übungsfahrt    | B
31.07.24 16:45 17:45 Zieroth André    | Übungsfahrt    | B
26.07.24 16:45 17:45 Zieroth André    | Übungsfahrt    | B
24.07.24 15:30 16:30 -                | Übungsfahrt    | BA
26.06.24 13:15 14:15 Zieroth André    | Übungsfahrt    | B
`.trim().split('\n');

const min = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const ART = { 'Nachtfahrt': 'nacht', 'Autobahnfahrt': 'autobahn', 'Überlandfahrt': 'ueberland' };
const soll = SOLL.map((z) => {
  const [kopf, art, klasse] = z.split('|').map((x) => x.trim());
  const st = kopf.split(/\s+/);
  const [d, m, j] = st[0].split('.');
  return {
    datum: `20${j}-${m}-${d}`, von: st[1], bis: st[2],
    dauer: min(st[2]) - min(st[1]),
    lehrer: st.slice(3).join(' ') === '-' ? '' : st.slice(3).join(' '),
    art, typ: ART[art] || 'normal', pruefung: art === 'Prüfungsfahrt', klasse,
  };
});

const schueler = db.prepare("SELECT id,name FROM students WHERE name LIKE '%Lilienthal%'").all();
if (schueler.length !== 1) { console.error('Erwarte genau eine Heidi Lilienthal, gefunden:', schueler); process.exit(1); }
const sid = schueler[0].id;
const ist = db.prepare(
  `SELECT id,date,start_time,duration_min,status,lesson_type,license_class,instructor_name,attended,signed_at
   FROM bookings WHERE student_id=? AND status!='cancelled' ORDER BY date DESC, start_time DESC`).all(sid);

console.log(`\n📋 Abgleich für ${schueler[0].name} (ID ${sid})`);
console.log(`   Datenbank: ${dbPfad}`);
console.log(`   Alte Software: ${soll.length} Fahrten · ginoco: ${ist.length} Fahrten\n`);

const schl = (d, t) => `${d} ${t}`;
const istMap = new Map(); for (const b of ist) istMap.set(schl(b.date, b.start_time), b);
const sollMap = new Map(); for (const s of soll) sollMap.set(schl(s.datum, s.von), s);

const fehlt = [], zuviel = [], abweichung = [];
for (const s of soll) {
  const b = istMap.get(schl(s.datum, s.von));
  if (!b) { fehlt.push(s); continue; }
  const probleme = [];
  if (b.duration_min !== s.dauer) probleme.push(`Dauer ${b.duration_min} statt ${s.dauer} Min`);
  const istLehrer = (b.instructor_name || '').trim();
  const sollLehrer = s.lehrer === 'Heidrich Gino' ? '' : s.lehrer;   // du selbst = leer
  if (istLehrer !== sollLehrer)
    probleme.push(`Fahrlehrer "${istLehrer || '(du)'}" statt "${sollLehrer || '(du)'}"`);
  if ((b.lesson_type || 'normal') !== s.typ) probleme.push(`Art "${b.lesson_type || 'normal'}" statt "${s.typ}"`);
  if (probleme.length) abweichung.push({ s, b, probleme });
}
for (const b of ist) if (!sollMap.has(schl(b.date, b.start_time))) zuviel.push(b);

const zeile = (s) => `${s.datum.split('-').reverse().join('.')} ${s.von}-${s.bis}  ${String(s.dauer).padStart(3)} Min  ${(s.lehrer || 'du').padEnd(16)} ${s.art}${s.klasse !== 'B' ? ' (Kl.' + s.klasse + ')' : ''}`;

if (!fehlt.length && !zuviel.length && !abweichung.length) {
  console.log('✅ Alles stimmt überein – Datum, Uhrzeit, Dauer, Fahrlehrer und Fahrt-Art.\n');
} else {
  if (fehlt.length) {
    console.log(`❌ FEHLEN in ginoco (${fehlt.length}):`);
    for (const s of fehlt) console.log('   ' + zeile(s));
    console.log('');
  }
  if (zuviel.length) {
    console.log(`⚠️  NUR in ginoco, nicht in der alten Software (${zuviel.length}):`);
    for (const b of zuviel) console.log(`   ${b.date.split('-').reverse().join('.')} ${b.start_time}  ${String(b.duration_min).padStart(3)} Min  ${b.instructor_name || 'du'}  [${b.status}]  #${b.id}`);
    console.log('');
  }
  if (abweichung.length) {
    console.log(`🔎 ABWEICHUNGEN (${abweichung.length}):`);
    for (const a of abweichung) console.log(`   ${a.s.datum.split('-').reverse().join('.')} ${a.s.von}  #${a.b.id}\n      ${a.probleme.join('\n      ')}`);
    console.log('');
  }
}

// Zusatzinfo: Summen und Sonderfahrten
const gefahren = ist.filter((b) => b.status === 'done' && b.attended !== 0);
const summe = gefahren.reduce((n, b) => n + b.duration_min, 0);
const sonder = {};
for (const b of gefahren) if (b.lesson_type && b.lesson_type !== 'normal') sonder[b.lesson_type] = (sonder[b.lesson_type] || 0) + b.duration_min;
console.log('📊 In ginoco als gefahren gebucht: ' + gefahren.length + ' Fahrten, ' + summe + ' Min (' + (summe / 45).toFixed(1) + ' Einheiten à 45 Min)');
console.log('   Sonderfahrten: ' + (Object.keys(sonder).length ? Object.entries(sonder).map(([k, v]) => `${k} ${v} Min`).join(', ') : 'keine'));
const offen = ist.filter((b) => b.status === 'booked');
if (offen.length) console.log('   Noch offen (geplant): ' + offen.map((b) => b.date.split('-').reverse().join('.') + ' ' + b.start_time).join(', '));
const ohneSig = gefahren.filter((b) => !b.signed_at);
console.log('   Ohne Unterschrift: ' + ohneSig.length);
console.log('');
