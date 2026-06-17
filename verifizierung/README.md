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
- **Persönliche Moderator-Logins:** Jede:r aus dem Team hat einen eigenen
  Login (Benutzername + Passwort + eigenes 2FA). Verwaltet wird das über ein
  **Admin-Passwort** (Logins im Browser anlegen/löschen). In jeder Verifizierung
  steht, **wer** sie durchgeführt hat. Die Bewerber-Seite bleibt offen (Code-Beitritt).
- **Ausweis-Verifizierung:** Die Bewerberin lädt Vorder- & Rückseite hoch und
  hält den Ausweis neben ihr Gesicht; der Moderator macht Beweis-Fotos, hakt eine
  Checkliste ab, markiert „verifiziert" und lädt ein **Prüf-Protokoll** herunter.
- **Einmalcode-Pflicht:** Bewerber kommen nur mit einem vom Moderator erzeugten
  **Einmalcode** rein (gilt genau einmal).
- **Accounts:** Jede abgeschlossene Verifizierung wird als Eintrag gespeichert
  (inkl. Fotos) und ist im Moderator-Bereich einsehbar/löschbar.
- **Sicherheit:** 2FA (TOTP) für den Moderator, Brute-Force-Sperre + Honeypot,
  **verschlüsselte** Foto-Speicherung (AES-256).

> ⚠️ **Datenschutz:** Es werden Ausweisdaten dauerhaft gespeichert. Du brauchst
> dafür eine Rechtsgrundlage/Einwilligung und ein Löschkonzept (manueller
> Löschen-Button ist eingebaut). Im Zweifel rechtlichen Rat einholen.

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

0. **Einmalig (Admin):** „Ich moderiere" → Benutzername leer lassen,
   **Admin-Passwort** eingeben → „🛠 Moderatoren verwalten" → die persönlichen
   Logins für dein Team anlegen (jeweils mit eigenem 2FA-Schlüssel).
1. **Du (Moderator):** Seite öffnen → „Ich moderiere" → **Benutzername +
   Passwort + 2FA** → **Raum betreten**. Der Beitritts-Link/Einmalcode wird
   automatisch kopiert und im Chat angezeigt.
2. **Link an den Bewerber schicken** (WhatsApp, E-Mail …) – z. B. mit
   „✉ Einladung kopieren".
3. **Bewerber** öffnet den Link → Name eingeben → **beitreten** → Kamera/Mikro
   erlauben. (Kein Passwort nötig.)
4. **Ausweis:** Bewerber öffnet rechts den Tab **„Ausweis"** → lädt Vorder- &
   Rückseite hoch und hält den Ausweis neben das Gesicht. Du als Moderator siehst
   die Fotos im Tab „Ausweis", machst per Knopf Live-Fotos, hakst die Checkliste
   ab und klickst **„Als verifiziert markieren"**.
5. Du klickst rechts auf **„Nächste Frage ▶"** – der Bewerber sieht die Frage.
6. **⏺ Aufnahme starten**, das Gespräch führen.
7. Am Ende **⏹ Beenden & speichern** (Video) und **„Prüf-Protokoll speichern"**.

---

## Deine Fragen anpassen

Öffne die Datei **`public/fragen.js`** und trage deine Fragen ein. Die Datei ist
kommentiert und einfach zu bearbeiten – jede Frage steht in `"..."` und endet mit
einem Komma. (Die aktuell hinterlegten Fragen sind nur Platzhalter.)

---

## Hosten (damit der Bewerber von außen beitreten kann)

Der Raum braucht einen **öffentlich erreichbaren Server mit HTTPS**.

➡️ **Für die produktive Einrichtung unter `verify.4ever1.tv` (Hetzner + Coolify
+ TURN) gibt es eine eigene Schritt-für-Schritt-Anleitung: siehe
[`DEPLOY.md`](DEPLOY.md).**

Kurzform: Die App läuft als Docker-Container (`Dockerfile` ist enthalten) hinter
Coolifys Proxy, der HTTPS automatisch übernimmt. Der Port kommt über die
Umgebungsvariable `PORT`.

### TURN-Server (wichtig für zuverlässige Verbindungen)

In vielen Heimnetzen reicht STUN. In Mobilfunknetzen oder strengen
Firmen-/WLAN-Netzen kommt die Direktverbindung aber oft **nicht** zustande –
dann braucht ihr einen **TURN-Server**.

Das ist bereits vorbereitet: Ein fertiges **coturn**-Setup liegt unter
[`coturn/`](coturn/). Die App holt sich die TURN-Zugangsdaten automatisch über
ihren `/ice`-Endpunkt – du musst dafür **nichts** im Code ändern, sondern nur
zwei Umgebungsvariablen setzen (siehe `.env.example` und `DEPLOY.md`):

- `TURN_SECRET` – gemeinsames Geheimnis (gleich bei App und coturn)
- `TURN_HOST` – z. B. `verify.4ever1.tv`

Die Zugangsdaten sind **zeitlich begrenzt** (TURN-REST-Verfahren) – es stehen
also keine festen Passwörter im Browser.

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
├── server.js            Server: App + Vermittlung + API (Login/Codes/Accounts)
├── store.js             Persistenz: Codes, Accounts, (verschlüsselte) Fotos
├── security.js          2FA (TOTP), Brute-Force-Sperre, Honeypot, Tokens
├── package.json         (npm run totp = 2FA-Secret erzeugen)
├── Dockerfile           Container-Image (für Coolify/Docker)
├── .env.example         Umgebungsvariablen der App
├── README.md            diese Anleitung
├── DEPLOY.md            Schritt-für-Schritt: verify.4ever1.tv (Hetzner+Coolify)
├── coturn/              TURN-Server (für zuverlässige Verbindungen)
│   ├── docker-compose.yml
│   └── .env.example
└── public/
    ├── index.html       Oberfläche
    ├── app.js           Logik (Video, Aufnahme, Chat, Fragen, Ausweis, Admin)
    └── fragen.js        >>> HIER deine Fragen + Einladungstext eintragen <<<
```
