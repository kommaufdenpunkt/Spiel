// Setzt wiederhergestellte Termine aus der VERGANGENHEIT auf "gefahren".
//
// Hintergrund: restore-imported.mjs hat faelschlich stornierte Import-Termine
// zurueckgeholt - sie stehen danach als "gebucht/offen". Die in der Vergangenheit
// haben tatsaechlich stattgefunden und sollen als gefahren zaehlen (Statistik,
// Ausbildungsstand, Nachweis).
//
// Angefasst werden NUR Termine, die
//   - status='booked' sind,
//   - VOR heute liegen (heute und Zukunft bleiben unberuehrt),
//   - vom Auto-Verfall betroffen waren UND aus einem Import stammen.
//
// Vorschau:  node scripts/complete-past.mjs
// Anwenden:  node scripts/complete-past.mjs apply
import { db } from '../db.js';

const apply = process.argv[2] === 'apply';
const today = new Date().toISOString().slice(0, 10);

const rows = db.prepare(`
  SELECT b.id, b.date, b.start_time, b.duration_min, s.name AS student,
         (SELECT e.detail FROM events e
           WHERE e.booking_id = b.id AND e.type = 'book' ORDER BY e.id LIMIT 1) AS bookDetail
    FROM bookings b
    LEFT JOIN students s ON s.id = b.student_id
   WHERE b.status = 'booked'
     AND b.date < ?
     AND EXISTS (SELECT 1 FROM events e WHERE e.booking_id = b.id AND e.type = 'reserve_expired')
   ORDER BY b.date, b.start_time
`).all(today);

const fromImport = rows.filter((r) => /Verlauf-Import|Sammel-Import/.test(r.bookDetail || ''));

console.log(`Heute ist ${today} – nur Termine davor werden angefasst.\n`);
console.log(`Offene, wiederhergestellte Termine aus der Vergangenheit: ${fromImport.length}\n`);
let min = 0;
for (const r of fromImport) {
  min += r.duration_min || 0;
  console.log(`  ${r.date} ${r.start_time}  ${String(r.duration_min).padStart(3)} Min  ${r.student || '-'}`);
}
console.log(`\nSumme: ${min} Min (${(min / 60).toFixed(1).replace('.', ',')} h)`);

if (!apply) {
  console.log('\n== VORSCHAU – es wurde nichts geaendert. ==');
  console.log('Zum Uebernehmen dasselbe Kommando nochmal mit  apply  am Ende.');
} else {
  const upd = db.prepare("UPDATE bookings SET status='done', attended=1 WHERE id=?");
  let n = 0;
  for (const r of fromImport) { upd.run(r.id); n++; }
  console.log(`\n== ${n} Termine als gefahren markiert (status=done, erschienen). ==`);
  console.log('Sie zaehlen jetzt in Statistik, Ausbildungsstand und Nachweis.');
}
