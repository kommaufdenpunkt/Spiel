// ============================================================
//  FIREBASE-KONFIGURATION  –  EINMALIG AUSFÜLLEN
// ============================================================
//
//  Damit die Schüler-Handys live deiner Folie folgen, brauchst du ein
//  kostenloses Firebase-Projekt (Realtime Database). Anleitung Schritt
//  für Schritt steht in der README.md (Abschnitt „Backend einrichten“).
//
//  Trage hier die Werte aus deiner Firebase-Konsole ein und ersetze die
//  "DEIN_..."-Platzhalter. Solange das nicht passiert, läuft das Tool im
//  Test-Modus (ohne Live-Verbindung) und zeigt einen Hinweis an.
// ------------------------------------------------------------

export const firebaseConfig = {
  apiKey: "DEIN_API_KEY",
  authDomain: "DEIN_PROJEKT.firebaseapp.com",
  databaseURL: "https://DEIN_PROJEKT-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "DEIN_PROJEKT",
  storageBucket: "DEIN_PROJEKT.appspot.com",
  messagingSenderId: "DEINE_SENDER_ID",
  appId: "DEINE_APP_ID"
};

// Wird automatisch erkannt – nichts ändern.
export function istKonfiguriert() {
  return !!firebaseConfig.databaseURL && !firebaseConfig.databaseURL.includes("DEIN_PROJEKT");
}
