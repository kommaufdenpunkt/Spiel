# Verifizierungs-Video-Raum (Agentur 4ever1 · BIGO LIVE)

Ein kleiner Online-Video-Raum, um **Bewerber zu verifizieren**:
Du erstellst einen Raum, schickst dem Bewerber den Link, ihr seht euch live,
du stellst ihm die Fragen – und das **ganze Gespräch wird als ein Video
aufgenommen** (beide Gesichter, beide Stimmen, plus die jeweils eingeblendete
Frage). Am Ende lädst du das Video herunter und kannst es bei BIGO LIVE
einreichen.

---

## Was kann das Programm?

- **Online-Raum mit Beitritts-Link** – der Bewerber tritt von Handy oder PC bei
  (kein Download, läuft im Browser).
- **Live-Video & -Ton** zwischen dir (Moderator) und dem Bewerber (WebRTC,
  direkt von Browser zu Browser).
- **Fragen-Steuerung** – du klickst dich durch deine Fragen, der Bewerber sieht
  die aktuelle Frage groß; sie wird auch ins Video eingeblendet.
- **Chat-Fenster** zwischen euch.
- **Aufnahme** des kompletten Gesprächs → Download als **MP4** (bzw. WebM, falls
  der Browser kein MP4 aufnehmen kann – siehe unten).

---

## Schnellstart (lokal testen)

Voraussetzung: **Node.js 18 oder neuer** ist installiert.

```bash
cd verifizierung
npm install      # lädt das einzige Paket "ws"
npm start        # startet den Server auf Port 3000
```

Dann im Browser öffnen: <http://localhost:3000>

> Zum echten Testen über das Internet **muss** die Seite über **HTTPS** laufen
> (Browser geben Kamera/Mikro sonst nur auf `localhost` frei). Siehe „Hosten".

---

## So benutzt du es

1. **Du (Moderator):** Seite öffnen → „Ich moderiere" → Name eingeben →
   **Raum betreten**. Der Beitritts-Link wird automatisch in die Zwischenablage
   kopiert und im Chat angezeigt.
2. **Link an den Bewerber schicken** (WhatsApp, E-Mail …).
3. **Bewerber** öffnet den Link → Name eingeben → **beitreten** → Kamera/Mikro
   erlauben.
4. Ihr seht euch. Du klickst rechts auf **„Nächste Frage ▶"** – der Bewerber
   sieht die Frage.
5. **⏺ Aufnahme starten**, das Gespräch führen.
6. Am Ende **⏹ Beenden & speichern** → das Video wird heruntergeladen.

---

## Deine Fragen anpassen

Öffne die Datei **`public/fragen.js`** und trage deine Fragen ein. Die Datei ist
kommentiert und einfach zu bearbeiten – jede Frage steht in `"..."` und endet mit
einem Komma. (Die aktuell hinterlegten Fragen sind nur Platzhalter.)

---

## Hosten (damit der Bewerber von außen beitreten kann)

Der Raum braucht einen **öffentlich erreichbaren Server mit HTTPS**. Einfache
Optionen, die `package.json` direkt erkennen:

- **Render.com**, **Railway.app** oder **Fly.io**: Repo verbinden,
  Start-Befehl `node server.js`, Port wird über die Umgebungsvariable `PORT`
  vorgegeben (ist im Code schon berücksichtigt). HTTPS ist dort automatisch.
- **Eigener VPS:** `npm install && npm start` hinter einem Reverse-Proxy
  (z. B. Caddy oder nginx) mit TLS-Zertifikat.

### TURN-Server (wichtig für zuverlässige Verbindungen)

In vielen Heimnetzen reicht der eingebaute STUN-Server. In Mobilfunknetzen oder
strengen Firmen-/WLAN-Netzen kommt die Direktverbindung aber oft **nicht**
zustande – dann braucht ihr einen **TURN-Server**.

Trage ihn in **`public/app.js`** ganz oben bei `ICE_SERVERS` ein:

```js
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'turn:DEIN_TURN_HOST:3478', username: 'user', credential: 'pass' },
];
```

Einen TURN-Server bekommst du z. B. über einen Anbieter (Metered, Twilio …)
oder selbst gehostet mit **coturn**.

---

## MP4 vs. WebM

Das Programm nimmt **MP4** auf, wenn der Browser das kann (z. B. Safari, neuere
Chrome-Versionen). Kann er es nicht, wird **WebM** gespeichert (gleicher Inhalt,
anderes Containerformat).

Falls BIGO LIVE zwingend MP4 verlangt und du eine WebM-Datei bekommen hast,
kannst du sie kostenlos umwandeln:

- Mit **ffmpeg** (Kommandozeile):
  ```bash
  ffmpeg -i verifizierung_xyz.webm -c:v libx264 -c:a aac verifizierung_xyz.mp4
  ```
- Oder mit einem Online-Konverter / Tool wie **HandBrake** (grafisch).

Tipp: Nimm zum Aufnehmen am besten **Safari (Mac/iPhone)** oder eine aktuelle
**Chrome-Version** – dort ist die MP4-Aufnahme am wahrscheinlichsten.

---

## Datenschutz / Hinweis

Bitte den Bewerber **vor der Aufnahme** über die Aufzeichnung informieren und
sein Einverständnis einholen. Das Video läuft direkt zwischen den beiden
Browsern; der Server vermittelt nur den Verbindungsaufbau und speichert kein
Video.

---

## Aufbau der Dateien

```
verifizierung/
├── server.js            Server: liefert die App aus + vermittelt die Verbindung
├── package.json
├── README.md            diese Anleitung
└── public/
    ├── index.html       Oberfläche
    ├── app.js           Logik (Video, Aufnahme, Chat, Fragen)
    └── fragen.js        >>> HIER deine Fragen eintragen <<<
```
