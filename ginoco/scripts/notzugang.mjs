#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Notzugang: Fahrlehrer-Passwort direkt auf dem Server neu setzen.
//
// Nur nötig, wenn WEDER das Passwort, NOCH ein Authenticator-Code, NOCH ein
// Notfall-Code zur Hand ist. Im Normalfall geht alles bequemer über
// „Passwort vergessen" in der App.
//
// Aufruf auf dem Server:
//   cd /home/ginoco/spiel
//   DBP=$(systemctl show ginoco -p Environment --value | tr ' ' '\n' | sed -n 's/^FSP_DB=//p')
//   sudo -u ginoco env FSP_DB="$DBP" node ginoco/scripts/notzugang.mjs
//
// Das Passwort wird verdeckt abgefragt und landet daher NICHT in der
// Shell-History. Danach werden auf Wunsch gleich neue Notfall-Codes erzeugt.
// ---------------------------------------------------------------------------
import { createInterface } from 'node:readline/promises';
import { setSettingRaw, hashPassword, genInstructorRecovery, getSettingRaw } from '../db.js';

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

const db_datei = process.env.FSP_DB || '(Standard neben db.js)';
console.log('\n🔐 ginoco – Notzugang: Fahrlehrer-Passwort neu setzen');
console.log('   Datenbank: ' + db_datei + '\n');

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
