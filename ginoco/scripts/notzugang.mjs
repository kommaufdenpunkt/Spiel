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
// Das Passwort wird zeichenweise im Rohmodus gelesen und nur als * angezeigt;
// es steht also weder auf dem Schirm noch in der Shell-History.
// Danach werden auf Wunsch gleich neue Notfall-Codes erzeugt.
// ---------------------------------------------------------------------------
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
// Node meldet "SQLite is an experimental feature" – das rutscht sonst mitten
// in die Passwort-Eingabe. Hier ist es reines Rauschen, also weg damit.
const warnenOriginal = process.emitWarning;
process.emitWarning = (w, ...rest) => {
  if (/SQLite is an experimental/i.test(String(w))) return;
  return warnenOriginal.call(process, w, ...rest);
};
const { db, setSettingRaw, hashPassword, genInstructorRecovery, getSettingRaw } = await import('../db.js');

// ---------------------------------------------------------------------------
// Eingabe. Bewusst OHNE readline: dessen Maskierung haengt an internen
// Methoden (_writeToOutput) und hat am echten Terminal nicht zuverlaessig
// verdeckt. Hier lesen wir im Rohmodus Zeichen fuer Zeichen und entscheiden
// selbst, was auf dem Schirm landet.
// ---------------------------------------------------------------------------
let restStapel = null;                    // fuer nicht-interaktive Aufrufe (Tests)
async function zeileAusStapel() {
  if (restStapel === null) {
    let roh = '';
    for await (const stueck of process.stdin) roh += stueck;
    restStapel = roh.split('\n');
  }
  return restStapel.length ? restStapel.shift() : '';
}

function leseZeile(text, verdeckt) {
  if (!process.stdin.isTTY) {
    process.stdout.write(text);
    return zeileAusStapel().then((a) => { process.stdout.write((verdeckt ? '***' : a) + '\n'); return a; });
  }
  return new Promise((fertig) => {
    process.stdout.write(text);
    const ein = process.stdin;
    const vorher = ein.isRaw;
    ein.setRawMode(true); ein.resume(); ein.setEncoding('utf8');
    let puffer = '';
    const aufhoeren = () => { ein.removeListener('data', beiZeichen); ein.setRawMode(vorher); ein.pause(); };
    const beiZeichen = (stueck) => {
      for (const z of stueck) {
        if (z === '\r' || z === '\n') { aufhoeren(); process.stdout.write('\n'); fertig(puffer); return; }
        if (z === '\u0003') { aufhoeren(); process.stdout.write('\n^C\n'); process.exit(130); }   // Strg+C
        if (z === '\u0004') { aufhoeren(); process.stdout.write('\n');  fertig(puffer); return; }  // Strg+D
        if (z === '\u007f' || z === '\b') {                                                    // Rueckschritt
          if (puffer.length) { puffer = puffer.slice(0, -1); process.stdout.write('\b \b'); }
          continue;
        }
        if (z < ' ') continue;                       // sonstige Steuerzeichen ignorieren
        puffer += z;
        process.stdout.write(verdeckt ? '*' : z);
      }
    };
    ein.on('data', beiZeichen);
  });
}
const frage = (text) => leseZeile(text, false);
const frageVerdeckt = (text) => leseZeile(text, true);

// Dieselbe Regel wie im Portal.
function passwortProblem(pw) {
  pw = String(pw || '');
  if (pw.length < 8) return 'mindestens 8 Zeichen';
  if (!/[A-Za-zÄÖÜäöüß]/.test(pw)) return 'einen Buchstaben';
  if (!/[0-9]/.test(pw)) return 'eine Zahl';
  if (!/[^A-Za-z0-9ÄÖÜäöüß]/.test(pw)) return 'ein Sonderzeichen (z. B. ! ? # @)';
  return null;
}

const beenden = (code) => process.exit(code);

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
