/*
 * Verifizierungs-Video-Raum — Server
 * ----------------------------------
 * Zwei Aufgaben:
 *   1. Statische Dateien aus /public ausliefern (die eigentliche Web-App).
 *   2. WebSocket-"Signalisierung": Der Server vermittelt nur die Verbindung
 *      zwischen Moderator (du) und Bewerber. Das eigentliche Video läuft
 *      danach direkt von Browser zu Browser (WebRTC) — es geht NICHT über
 *      diesen Server.
 *
 * Pro Raum sind genau 2 Teilnehmer erlaubt: der Moderator ("host") und
 * der Bewerber ("guest"). Der Server merkt sich, wer in welchem Raum ist,
 * und leitet die Aushandlungs-Nachrichten (SDP / ICE) an den jeweils
 * anderen weiter.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------------------------------------------------------------------------
// 1) Statischer Datei-Server
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

const server = http.createServer((req, res) => {
  // Nur den Pfad-Teil verwenden, Query-Parameter ignorieren.
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  // Pfad sicher auflösen (kein Ausbruch aus /public).
  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Nicht gefunden');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------------------------------------------------------------------------
// 2) WebSocket-Signalisierung
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ server });

/** rooms: Map<roomCode, { host?: ws, guest?: ws }> */
const rooms = new Map();

function send(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function otherPeer(room, ws) {
  if (!room) return null;
  return room.host === ws ? room.guest : room.host;
}

wss.on('connection', (ws) => {
  ws.roomCode = null;
  ws.role = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'join') {
      const code = String(msg.room || '').trim().toUpperCase();
      if (!code) {
        send(ws, { type: 'error', reason: 'no-room' });
        return;
      }
      let room = rooms.get(code);
      if (!room) {
        room = {};
        rooms.set(code, room);
      }

      // Rolle bestimmen: Erster im Raum ist host, zweiter ist guest.
      let role = msg.role === 'host' ? 'host' : 'guest';
      if (role === 'host' && room.host && room.host !== ws) {
        // Es gibt schon einen Moderator -> als Gast behandeln.
        role = 'guest';
      }
      if (role === 'guest' && room.guest && room.guest !== ws) {
        send(ws, { type: 'error', reason: 'room-full' });
        return;
      }

      ws.roomCode = code;
      ws.role = role;
      room[role] = ws;
      ws.peerName = String(msg.name || '').slice(0, 60);

      send(ws, { type: 'joined', role, room: code });

      // Wenn beide da sind: dem Moderator Bescheid geben, dass er die
      // Verbindung aufbauen (das WebRTC-Angebot erstellen) soll.
      if (room.host && room.guest) {
        send(room.host, { type: 'peer-ready', peerName: room.guest.peerName });
        send(room.guest, { type: 'peer-ready', peerName: room.host.peerName });
      }
      return;
    }

    // Aushandlungs-Nachrichten (Angebot/Antwort/ICE) + Chat-Fallback:
    // einfach an den anderen Teilnehmer im Raum weiterleiten.
    if (msg.type === 'signal') {
      const room = rooms.get(ws.roomCode);
      const peer = otherPeer(room, ws);
      send(peer, { type: 'signal', data: msg.data });
      return;
    }
  });

  ws.on('close', () => {
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    const peer = otherPeer(room, ws);
    send(peer, { type: 'peer-left' });
    if (room.host === ws) room.host = undefined;
    if (room.guest === ws) room.guest = undefined;
    if (!room.host && !room.guest) rooms.delete(ws.roomCode);
  });
});

server.listen(PORT, () => {
  console.log(`Verifizierungs-Raum läuft auf http://localhost:${PORT}`);
});
