// Live-Sync OHNE Server-Einrichtung.
// Die Geräte verbinden sich direkt miteinander (WebRTC über PeerJS):
//   Lehrer = Host ("Sender"), Schüler = Gast.
// Es ist KEIN Konto, KEINE Datenbank und KEINE Konfiguration nötig.
// (Eine optionale Firebase-Variante liegt weiterhin in firebase-config.js bereit.)

let PeerLib = null;
async function ladePeer() {
  if (!PeerLib) {
    const m = await import("https://esm.sh/peerjs@1.5.4");
    PeerLib = m.Peer || m.default;
  }
  return PeerLib;
}

// Namensraum, damit kurze Raum-Codes nicht mit fremden PeerJS-Apps kollidieren.
const PREFIX = "fahrschule-live-2026-";

export function konfiguriert() { return true; } // kein Setup nötig

// ============================================================
//  LEHRER: Host starten
// ============================================================
export async function starteHost(code, { onTeilnehmer, onStatus } = {}) {
  const Peer = await ladePeer();
  const verbindungen = new Set();
  let letzterStand = null;
  let peer = null;

  function baue() {
    peer = new Peer(PREFIX + code, { debug: 1 });

    peer.on("open", () => onStatus && onStatus("bereit"));

    peer.on("connection", (conn) => {
      conn.on("open", () => {
        verbindungen.add(conn);
        onTeilnehmer && onTeilnehmer(verbindungen.size);
        if (letzterStand) { try { conn.send(letzterStand); } catch {} }
      });
      const weg = () => { if (verbindungen.delete(conn)) onTeilnehmer && onTeilnehmer(verbindungen.size); };
      conn.on("close", weg);
      conn.on("error", weg);
    });

    peer.on("disconnected", () => { try { peer.reconnect(); } catch {} });

    peer.on("error", (err) => {
      if (err && err.type === "unavailable-id") { onStatus && onStatus("id-belegt"); return; }
      onStatus && onStatus("verbinde");
      // Verbindung zum Vermittlungs-Server verloren → neu aufbauen
      setTimeout(() => { try { peer.destroy(); } catch {} baue(); }, 3000);
    });
  }

  baue();
  window.addEventListener("beforeunload", () => { try { peer.destroy(); } catch {} });

  return {
    sende(stand) {
      letzterStand = stand;
      for (const c of verbindungen) { try { c.send(stand); } catch {} }
    },
    anzahl() { return verbindungen.size; }
  };
}

// ============================================================
//  SCHÜLER: mit dem Host verbinden (mit automatischem Wiederverbinden)
// ============================================================
export async function verbinde(code, { onStand, onStatus } = {}) {
  const Peer = await ladePeer();
  let peer = null, conn = null, lebt = true, timer = null;

  function planeNeu() {
    if (!lebt) return;
    clearTimeout(timer);
    timer = setTimeout(() => { verbindeMitHost(); }, 2500);
  }

  function verbindeMitHost() {
    if (!lebt || !peer || peer.destroyed) return;
    onStatus && onStatus("verbinde");
    conn = peer.connect(PREFIX + code, { reliable: true });
    let offen = false;
    conn.on("open", () => { offen = true; onStatus && onStatus("verbunden"); });
    conn.on("data", (d) => onStand && onStand(d));
    conn.on("close", () => { onStatus && onStatus("getrennt"); planeNeu(); });
    conn.on("error", () => { if (!offen) planeNeu(); });
  }

  function baue() {
    peer = new Peer(undefined, { debug: 1 });
    peer.on("open", () => verbindeMitHost());
    peer.on("disconnected", () => { try { peer.reconnect(); } catch {} });
    peer.on("error", (err) => {
      // Host noch nicht online / nicht erreichbar → erneut versuchen
      onStatus && onStatus(err && err.type === "peer-unavailable" ? "warten" : "verbinde");
      planeNeu();
    });
  }

  baue();
  window.addEventListener("beforeunload", () => { lebt = false; try { peer.destroy(); } catch {} });

  return { trenne() { lebt = false; clearTimeout(timer); try { peer.destroy(); } catch {} } };
}
