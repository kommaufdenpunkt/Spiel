#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Notzugang: Fahrlehrer-Passwort direkt auf dem Server neu setzen.
//
// Nur nötig, wenn WEDER das Passwort, NOCH ein Authenticator-Code, NOCH ein
// Notfall-Code zur Hand ist. Im Normalfall geht alles bequemer über
// „Passwort vergessen" in der App.
//
// Aufruf auf dem Server – EINE Zeile, mehr nicht:
//   sudo -u ginoco node /home/ginoco/spiel/ginoco/scripts/notzugang.mjs
//
// Den Datenbank-Pfad sucht sich das Skript selbst aus dem systemd-Dienst.
// Mit FSP_DB=/pfad/zur.db davor lässt er sich auch vorgeben.
//
// Das Passwort wird verdeckt abgefragt und landet daher NICHT in der
// Shell-History. Danach werden auf Wunsch gleich neue Notfall-Codes erzeugt.
// ---------------------------------------------------------------------------
import { createInterface } from 'node:readline/promises';
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

// Den Pfad zur echten Datenbank klaeren, BEVOR db.js geladen wird – db.js
// liest FSP_DB beim Import. Vorher lief das Skript sonst still gegen eine
// leere Datenbank neben db.js, und das Passwort aenderte sich nirgends.
const hierher = dirname(fileURLToPath(import.meta.url));
const standard = resolve(join(hierher, '..', 'fahrschule.db'));
function ausDienst() {
  try {
    const roh = execFileSync('systemctl', ['show', 'ginoco', '-p', 'Environment', '--value'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const t = roh.split(/\s+/).find((x) => x.startsWith('FSP_DB='));
    return t ? t.slice('FSP_DB='.length) : '';
  } catch { return ''; }
}
const vomDienst = process.env.FSP_DB ? '' : ausDienst();
const quelle = process.env.FSP_DB ? 'FSP_DB (von dir vorgegeben)'
  : vomDienst ? 'aus dem systemd-Dienst ginoco' : 'Standardpfad neben db.js';
let dbPfad = resolve(process.env.FSP_DB || vomDienst || standard);
if (!existsSync(dbPfad)) {
  console.error(`\n❌ Keine Datenbank unter: ${dbPfad}`);
  console.error('   Das Skript legt hier bewusst nichts Neues an – sonst änderst du ein Passwort,');
  console.error('   das der laufende Dienst gar nicht benutzt.');
  console.error('   Richtigen Pfad herausfinden:  systemctl show ginoco -p Environment');
  console.error('   und dann:  sudo -u ginoco env FSP_DB=/pfad/zur.db node ' + process.argv[1] + '\n');
  process.exit(1);
}
process.env.FSP_DB = dbPfad;
const { db, setSettingRaw, hashPassword, genInstructorRecovery, getSettingRaw } = await import('../db.js');

// EIN Eingabekanal fuer das ganze Skript – ein zweiter wuerde stdin schliessen.
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
let verdeckt = false;
const schreibOriginal = rl._writeToOutput ? rl._writeToOutput.bind(rl) : null;
if (schreibOriginal) rl._writeToOutput = (t) => { if (verdeckt) { if (t.trim()) process.stdout.write('*'); return; } schreibOriginal(t); };

// Wird das Skript nicht am Terminal ausgefuehrt (Pipe, z. B. im Test), liest
// readline nur eine Zeile und schliesst dann – deshalb dort alles auf einmal
// einlesen und die Antworten der Reihe nach abarbeiten.
let stapel = null;
async function stapelZeile() {
  if (stapel === null) {
    let roh = '';
    for await (const chunk of process.stdin) roh += chunk;
    stapel = roh.split('\n');
  }
  return stapel.length ? stapel.shift() : '';
}
const frage = async (text) => {
  if (!process.stdin.isTTY) { process.stdout.write(text); const a = await stapelZeile(); process.stdout.write(a + '\n'); return a; }
  return rl.question(text);
};
// Eingabe ohne Anzeige (wie bei sudo) – nur am echten Terminal, sonst normal.
async function frageVerdeckt(text) {
  if (!process.stdin.isTTY) { process.stdout.write(text); const a = await stapelZeile(); process.stdout.write('***\n'); return a; }
  process.stdout.write(text);
  verdeckt = true;
  try { return await rl.question(''); }
  finally { verdeckt = false; process.stdout.write('\n'); }
}

// Dieselbe Regel wie im Portal.
function passwortProblem(pw) {
  pw = String(pw || '');
  if (pw.length < 8) return 'mindestens 8 Zeichen';
  if (!/[A-Za-zÄÖÜäöüß]/.test(pw)) return 'einen Buchstaben';
  if (!/[0-9]/.test(pw)) return 'eine Zahl';
  if (!/[^A-Za-z0-9ÄÖÜäöüß]/.test(pw)) return 'ein Sonderzeichen (z. B. ! ? # @)';
  return null;
}

const beenden = (code) => { rl.close(); process.exit(code); };

const kb = Math.round(statSync(dbPfad).size / 1024);
// Ein leeres db.js legt beim ersten Oeffnen selbst ein Standard-Passwort an –
// "Passwort vorhanden" beweist also gar nichts. Echte Daten tun das:
// eine benutzte Fahrschule hat Fahrschueler und Termine.
const zahl = (t) => { try { return db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n; } catch { return 0; } };
const schueler = zahl('students'), termine = zahl('bookings');
console.log('\n🔐 ginoco – Notzugang: Fahrlehrer-Passwort neu setzen');
console.log('   Datenbank: ' + dbPfad + `  (${kb} KB)`);
console.log('   Ermittelt: ' + quelle);
console.log(`   Inhalt:    ${schueler} Fahrschüler, ${termine} Termine`);
if (!schueler && !termine) {
  console.error('\n❌ Diese Datenbank ist leer – keine Fahrschüler, keine Termine.');
  console.error('   Das ist fast sicher die falsche Datei (eine frisch angelegte legt sich still selbst an).');
  console.error('   Hier wird nichts geändert.');
  console.error('   Richtigen Pfad zeigen:  systemctl show ginoco -p Environment');
  console.error('   Dann:  sudo -u ginoco env FSP_DB=/pfad/zur.db node ' + process.argv[1] + '\n');
  process.exit(1);
}
console.log('   Sieht nach der echten Fahrschule aus ✓\n');

const pw1 = await frageVerdeckt('Neues Passwort: ');
const problem = passwortProblem(pw1.trim());
if (problem) { console.error('❌ Passwort braucht ' + problem + '. Nichts geändert.'); beenden(1); }
const pw2 = await frageVerdeckt('Zur Sicherheit noch einmal: ');
if (pw1.trim() !== pw2.trim()) { console.error('❌ Die beiden Eingaben stimmen nicht überein. Nichts geändert.'); beenden(1); }

setSettingRaw('instructor_pin', hashPassword(pw1.trim()));
console.log('\n✅ Passwort gesetzt. Du kannst dich jetzt damit anmelden.');

const rest = (() => { try { return (JSON.parse(getSettingRaw('instructor_recovery') || '[]') || []).length; } catch { return 0; } })();
console.log(`   Notfall-Codes derzeit: ${rest}`);
const w = (await frage('\nGleich neue Notfall-Codes erzeugen? [j/N] ')).trim().toLowerCase();
if (w === 'j' || w === 'ja' || w === 'y') {
  const codes = genInstructorRecovery(8);
  console.log('\n🚨 Deine acht Notfall-Codes – jeder funktioniert genau EINMAL.');
  console.log('   Jetzt abschreiben, danach sind sie nirgends mehr lesbar:\n');
  codes.forEach((c, i) => console.log(`   ${String(i + 1).padStart(2)}.  ${c}`));
  console.log('\n   Eingabe im Fenster „Passwort vergessen" statt des Authenticator-Codes.');
  if (rest) console.log('   (Die ' + rest + ' bisherigen Codes sind damit ungültig.)');
}
console.log('\nFertig. Bitte gleich in der App unter Einstellungen → Zugang & Kontakt');
console.log('einen Authenticator einrichten, damit dieser Weg nie wieder nötig ist.\n');
rl.close();
