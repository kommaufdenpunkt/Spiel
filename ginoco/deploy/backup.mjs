// Sicheres Backup der Ginoco-Datenbank – konsistent, auch während der Server läuft.
// Nutzt SQLite "VACUUM INTO" (sauberer Snapshot) und behält die letzten N Backups.
// Aufruf:  node deploy/backup.mjs
// Optional über Umgebungsvariablen steuerbar:
//   FSP_DB      = Pfad zur Datenbank (Standard: ../fahrschule.db)
//   BACKUP_DIR  = Zielordner        (Standard: <db-ordner>/backups)
//   BACKUP_KEEP = wie viele behalten (Standard: 14)
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DB = process.env.FSP_DB || join(HERE, '..', 'fahrschule.db');
const OUT = process.env.BACKUP_DIR || join(dirname(DB), 'backups');
const KEEP = Math.max(1, Number(process.env.BACKUP_KEEP || 14));

mkdirSync(OUT, { recursive: true });
const stamp = new Date().toISOString().slice(0, 19).replace(/T/, '_').replace(/:/g, '-');
const dest = join(OUT, `ginoco-${stamp}.db`);

const db = new DatabaseSync(DB);
db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
db.close();

// Rotation: nur die letzten KEEP Backups behalten
const files = readdirSync(OUT)
  .filter((f) => f.startsWith('ginoco-') && f.endsWith('.db'))
  .map((f) => ({ f, t: statSync(join(OUT, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t);
let removed = 0;
for (const { f } of files.slice(KEEP)) { unlinkSync(join(OUT, f)); removed++; }

console.log(`✓ Backup erstellt: ${dest}`);
console.log(`  ${Math.min(files.length, KEEP)} Backup(s) behalten, ${removed} alte gelöscht.`);
