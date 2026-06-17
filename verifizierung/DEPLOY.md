# Deployment: `verify.4ever1.tv` (Hetzner + Coolify + TURN)

Diese Anleitung bringt den Verifizierungs-Video-Raum produktiv auf deinen
Hetzner-Server unter **https://verify.4ever1.tv** – inklusive eigenem
**TURN-Server** für zuverlässige Verbindungen (auch im Mobilfunknetz).

**Deine Eckdaten:**
- Server: der Server, auf dem **Coolify** läuft (Ubuntu)
- Öffentliche IP des Coolify-Servers: **178.104.82.169**
- Auf dem Server läuft bereits **Coolify** (belegt Ports 80/443) → wir deployen
  die App über Coolify und stellen TURN als eigenen Dienst daneben.

> Reihenfolge: **1) DNS → 2) Geheimnis → 3) Firewall → 4) App in Coolify →
> 5) TURN-Server → 6) Test.**

---

## 1) DNS bei Hetzner einrichten

Hetzner Console → oben Projekt **4ever1** → linkes Menü **DNS** (Hetzner DNS
Console, dns.hetzner.com) → Zone **4ever1.tv** öffnen → **Record hinzufügen**:

| Typ | Name     | Wert / Ziel       | TTL  |
|-----|----------|-------------------|------|
| A   | `verify` | `178.104.82.169` | auto |

⚠️ **Wichtig:** Der A-Eintrag muss auf die IP des **Coolify-Servers**
(`178.104.82.169`) zeigen – **nicht** auf den Server der Hauptseite
(`178.105.238.222`), sonst landet man auf der falschen Seite.

> Den TURN-Server betreiben wir unter **demselben** Namen `verify.4ever1.tv`
> (zeigt ja auf denselben Server). Ein extra `turn`-Eintrag ist **nicht nötig**.

> Prüfen: `nslookup verify.4ever1.tv` sollte 178.104.82.169 liefern.

---

## 2) Gemeinsames Geheimnis erzeugen

Einmal auf dem Server (oder lokal) ausführen und das Ergebnis notieren:

```bash
openssl rand -hex 32
```

Dieses **`TURN_SECRET`** brauchst du an **zwei** Stellen identisch:
in der App (Coolify, Schritt 4) **und** beim TURN-Server (Schritt 5).

---

## 3) Hetzner Cloud Firewall freischalten

Hetzner Console → **Firewalls** (oder Server → Reiter „Firewall"). Falls eine
Firewall aktiv ist, folgende **eingehenden** Regeln ergänzen (zusätzlich zu den
bestehenden für SSH 22 und HTTP/HTTPS 80/443):

| Protokoll | Port          | Zweck            |
|-----------|---------------|------------------|
| TCP       | `3478`        | TURN             |
| UDP       | `3478`        | TURN             |
| UDP       | `49160-49200` | TURN Relay-Ports |

(Quelle: `0.0.0.0/0` und `::/0` – muss von überall erreichbar sein.)

> Falls auf dem Server zusätzlich `ufw` aktiv ist:
> ```bash
> sudo ufw allow 3478/tcp && sudo ufw allow 3478/udp && sudo ufw allow 49160:49200/udp
> ```

---

## 4) App in Coolify deployen

1. Coolify öffnen → Projekt wählen → **+ New** → **Application**.
2. Quelle: dein Git-Repository (Branch `claude/applicant-verification-video-room-yL1UC`
   bzw. nach dem Merge `main`).
3. **Build Pack: Dockerfile.**
4. **Base Directory:** `/verifizierung`  (wichtig – der Code liegt in diesem
   Unterordner, dort liegen `Dockerfile` und `package.json`).
5. **Port / Ports Exposes:** `3000`.
6. **Domains:** `https://verify.4ever1.tv` eintragen → Coolify holt automatisch
   ein Let's-Encrypt-Zertifikat (HTTPS).
7. **Environment Variables** setzen:
   - `MODERATOR_PASSWORD` = (frei wählbares Passwort für den Moderator-Zugang) **Pflicht**
   - `TURN_SECRET` = (das Geheimnis aus Schritt 2)
   - `TURN_HOST` = `verify.4ever1.tv`
   - `DATA_DIR` = `/data`  (Speicherort der Accounts – siehe Schritt 4b)
   - `STORAGE_KEY` = (`openssl rand -hex 32`) – verschlüsselt die Ausweis-Fotos
   - *(optional, empfohlen)* `MODERATOR_TOTP_SECRET` = (2FA, siehe Schritt 4c)
8. **Persistent Storage** anlegen (Schritt 4b) **bevor** du deployst.
9. **Deploy** klicken.

> **Wichtig:** Ohne `MODERATOR_PASSWORD` ist der Moderator-Zugang gesperrt
> (die Bewerber-Seite funktioniert weiterhin). Dieses Passwort gibst du nur an
> Personen, die Räume eröffnen dürfen.
> **Den `STORAGE_KEY` sicher aufbewahren** – ohne ihn sind gespeicherte Fotos
> nicht mehr lesbar.

### 4b) Persistent Storage (damit Accounts Redeploys überleben)
In Coolify bei der App → **Persistent Storage** → **Add** →
- **Name:** `verify-data`
- **Mount Path (im Container):** `/data`
→ Speichern. Damit liegen Codes, Accounts und Fotos dauerhaft auf dem Server
(unter `/data`), nicht im Container, der bei jedem Deploy neu gebaut wird.

### 4c) 2FA für den Moderator (optional, empfohlen)
1. Secret erzeugen (lokal oder auf dem Server):
   ```bash
   cd verifizierung && npm run totp
   ```
2. Den ausgegebenen Wert als `MODERATOR_TOTP_SECRET` in die App-Env eintragen.
3. Denselben Schlüssel in einer **Authenticator-App** (Google/Microsoft
   Authenticator) per **manueller Eingabe** hinzufügen (oder die ausgegebene
   `otpauth://`-URL als QR verwenden).
4. Beim Moderator-Login wird dann zusätzlich der 6-stellige Code abgefragt.

> WebSockets: Coolifys Proxy (Traefik) leitet die WebSocket-Verbindung
> automatisch weiter – es ist keine Extra-Konfiguration nötig.
> Health-Check: `/healthz` (vom Container-Image bereits eingebaut).

Nach dem Deploy ist die App unter **https://verify.4ever1.tv** erreichbar.
(Sie funktioniert sofort – zunächst über STUN; TURN kommt in Schritt 5 dazu.)

---

## 5) TURN-Server (coturn) starten

Den Ordner `verifizierung/coturn/` auf den Server bringen (per `git clone`/`pull`
oder direkt anlegen). Dann:

```bash
cd verifizierung/coturn
cp .env.example .env
nano .env        # TURN_SECRET (gleich wie in der App!) und EXTERNAL_IP prüfen
docker compose up -d
docker compose logs -f      # kurz prüfen, dann mit Strg+C beenden
```

**Alternativ in Coolify:** + New → **Docker Compose** → Inhalt von
`coturn/docker-compose.yml` einfügen → Environment Variables `TURN_SECRET`,
`TURN_REALM=verify.4ever1.tv`, `EXTERNAL_IP=178.104.82.169` setzen → Deploy.

> `.env` enthält das Geheimnis und gehört **nicht** ins Git (ist über
> `.gitignore` ausgeschlossen).

---

## 6) Funktion testen

1. **HTTPS/App:** https://verify.4ever1.tv öffnen → „Ich moderiere" → Raum
   betreten. Der Beitritts-Link wird kopiert.
2. **TURN:** Mit dem
   [WebRTC Trickle ICE Test](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/)
   prüfen. Trage ein:
   - `turn:verify.4ever1.tv:3478?transport=udp`
   - Username/Credential: einmal `https://verify.4ever1.tv/ice` im Browser
     aufrufen und die dort angezeigten `username`/`credential` kopieren.
   - „Gather candidates" → es sollten Einträge vom Typ **`relay`** erscheinen.
     Dann funktioniert TURN. ✅
3. **End-to-End:** Link auf einem zweiten Gerät / im Mobilfunknetz öffnen,
   beitreten – ihr solltet euch sehen und hören.

---

## 7) Fragen & Texte anpassen

- Fragen + Einladungstext: `verifizierung/public/fragen.js`
  (Platzhalter `[SYSTEM]` ersetzen!).
- Nach Änderungen im Repo: in Coolify **Redeploy** klicken.

---

## Optional: noch zuverlässiger (TURN über TLS/443)

In sehr strengen Netzen ist nur Port 443 offen. Da Coolify bereits 443 belegt,
bräuchte man dafür eine **zweite IP** (Hetzner „Primäre IPs"/Floating IP) und
coturn mit `turns` auf 5349/443 plus Zertifikat für `verify.4ever1.tv`. Für die
allermeisten Fälle reicht das obige UDP/TCP-3478-Setup. Sag Bescheid, wenn du
das TLS-Upgrade brauchst.

---

## Datenschutz-Hinweis

Das Video läuft direkt zwischen den Browsern (Ende-zu-Ende, DTLS-verschlüsselt);
der Server und TURN vermitteln nur. Es wird serverseitig **nichts gespeichert** –
die Aufnahme entsteht ausschließlich lokal im Browser des Moderators. Bitte die
Bewerberin vor der Aufnahme über die Aufzeichnung informieren.
