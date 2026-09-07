// Stellt Termine wieder her, die faelschlich automatisch storniert wurden.
//
// Hintergrund: Importierte Zukunfts-Termine wurden mit confirmed=0 angelegt und
// deshalb von expireStaleReservations() als "Vorschlag ohne Antwort" storniert.
// Dieses Skript holt genau die zurueck: storniert + Auto-Verfall + aus einem Import.
//
// Vorschau:    node scripts/restore-imported.mjs
// Wiederherstellen: node scripts/restore-imported.mjs apply
import { db } from '../db.js';

const apply = process.argv[2] === 'apply';

const rows = db.prepare(`
  SELECT b.id, b.date, b.start_time, b.duration_min, b.status, s.name AS student,
         (SELECT e.detail FROM events e
           WHERE e.booking_id = b.id AND e.type = 'book' ORDER BY e.id LIMIT 1) AS bookDetail
    FROM bookings b
    LEFT JOIN students s ON s.id = b.student_id
   WHERE b.status = 'cancelled'
     AND EXISTS (SELECT 1 FROM events e WHERE e.booking_id = b.id AND e.type = 'reserve_expired')
   ORDER BY b.date, b.start_time
`).all();

// Nur Termine aus einem Import (Verlauf-Import / Sammel-Import) zurueckholen –
// echte, vom Schueler nicht beantwortete Vorschlaege bleiben storniert.
const fromImport = rows.filter((r) => /Verlauf-Import|Sammel-Import/.test(r.bookDetail || ''));

console.log(`Automatisch verfallene Termine gesamt: ${rows.length}`);
console.log(`Davon aus einem Import (werden wiederhergestellt): ${fromImport.length}\n`);
for (const r of fromImport) {
  console.log(`  ${r.date} ${r.start_time}  ${String(r.duration_min).padStart(3)} Min  ${r.student || '-'}`);
}
const others = rows.filter((r) => !/Verlauf-Import|Sammel-Import/.test(r.bookDetail || ''));
if (others.length) {
  console.log(`\nNicht angefasst (kein Import, z. B. echte Vorschlaege/Testdaten): ${others.length}`);
  for (const r of others) console.log(`  ${r.date} ${r.start_time}  ${r.student || '-'}`);
}

if (!apply) {
  console.log('\n== VORSCHAU – es wurde nichts geaendert. ==');
  console.log('Zum Wiederherstellen dasselbe Kommando nochmal mit  apply  am Ende.');
} else {
  const upd = db.prepare("UPDATE bookings SET status='booked', confirmed=1 WHERE id=?");
  let n = 0;
  for (const r of fromImport) { upd.run(r.id); n++; }
  console.log(`\n== ${n} Termine wiederhergestellt (status=booked, confirmed=1). ==`);
}
