// Echtzeit-Schicht über Firebase Realtime Database.
// Lehrer schreibt den Stand (Thema + aktuelle Folie), Schüler hören zu.
// Fällt sauber zurück, wenn noch kein Backend eingerichtet ist.

import { firebaseConfig, istKonfiguriert } from "./firebase-config.js";

let db = null;
let fb = null;        // geladenes Firebase-Database-Modul
let bereitP = null;   // Promise: Initialisierung

async function bereit() {
  if (!istKonfiguriert()) return false;
  if (bereitP) return bereitP;
  bereitP = (async () => {
    const appMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    fb = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js");
    const app = appMod.initializeApp(firebaseConfig);
    db = fb.getDatabase(app);
    return true;
  })();
  return bereitP;
}

export function konfiguriert() {
  return istKonfiguriert();
}

const pfad = (code) => "raeume/" + code;

// ---- Lehrer: Stand setzen ----
export async function setStand(code, stand) {
  if (!(await bereit())) return false;
  await fb.update(fb.ref(db, pfad(code)), { ...stand, aktualisiert: Date.now() });
  return true;
}

// ---- Lehrer: Teilnehmer beobachten ----
export async function beobachteTeilnehmer(code, cb) {
  if (!(await bereit())) return () => {};
  const r = fb.ref(db, pfad(code) + "/teilnehmer");
  const ab = fb.onValue(r, (snap) => {
    const v = snap.val() || {};
    cb(Object.keys(v).length);
  });
  return ab;
}

// ---- Schüler: Stand abonnieren ----
export async function abonniere(code, cb) {
  if (!(await bereit())) return () => {};
  const r = fb.ref(db, pfad(code));
  const ab = fb.onValue(r, (snap) => cb(snap.val()));
  return ab;
}

// ---- Schüler: Anwesenheit melden (verschwindet beim Verlassen) ----
export async function meldeAnwesenheit(code) {
  if (!(await bereit())) return () => {};
  const id = "t_" + Math.random().toString(36).slice(2, 9);
  const r = fb.ref(db, pfad(code) + "/teilnehmer/" + id);
  await fb.set(r, true);
  fb.onDisconnect(r).remove();
  return () => fb.remove(r);
}
