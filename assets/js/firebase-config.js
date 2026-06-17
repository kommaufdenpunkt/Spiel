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
  apiKey: "AIzaSyBJkfPl1Jv04eVQpvYmPVSJ_wOXPz7CZak",
  authDomain: "ginoco-68964.firebaseapp.com",
  databaseURL: "https://ginoco-68964-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "ginoco-68964",
  storageBucket: "ginoco-68964.firebasestorage.app",
  messagingSenderId: "100465372476",
  appId: "1:100465372476:web:06eb5affbd655f366f8239",
  measurementId: "G-MXC3QLG24Z"
};

// Wird automatisch erkannt – nichts ändern.
export function istKonfiguriert() {
  return !!firebaseConfig.databaseURL && !firebaseConfig.databaseURL.includes("DEIN_PROJEKT");
}
