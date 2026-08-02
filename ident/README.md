# ident – Video-Identifizierung (Agentur 4ever1)

Schlanke, selbst gehostete **Video-Identifizierung** im Stil bekannter Video‑Ident‑Dienste
(IDnow/POSTIDENT), neu und sauber aufgebaut. Läuft unter **ident.4ever1.tv**.

**Ablauf:** Der Bewerber bekommt eine **Zugangsnummer**, öffnet den Link, lädt
**Ausweis‑Vorder-/Rückseite** und ein **Selfie mit Ausweis** hoch und spricht in
einem **Live‑Video** mit einem Prüfer der Agentur. Der Prüfer sieht die Bilder,
kann Live‑Fotos machen, hakt eine Checkliste ab und **gibt frei** oder **lehnt ab** –
dabei wird die Akte verschlüsselt gespeichert.

> ⚠️ **Ehrlicher Hinweis:** Das ist eine **assistierte Video‑Ident** (Prüfung durch
> einen Menschen). Sie liest den Ausweis **nicht automatisch aus** und ersetzt kein
> zertifiziertes eIDAS‑Verfahren (NFC/Chip, Lebend‑Erkennung). Für rechtlich
> „starke" Identifizierung braucht es einen zertifizierten Anbieter.

## Sicherheit
- **Verschlüsselung ruhender Daten:** alle Bilder, Aufnahmen und Akten mit
  **AES‑256‑GCM** (`STORAGE_KEY`). Ohne Schlüssel läuft es zwar, warnt aber laut.
- **Übertragung:** HTTPS (Web) + **WebRTC/DTLS** (Video **und** die Ausweisbilder
  gehen direkt Bewerber↔Prüfer, nicht über einen Server‑Zwischenspeicher).
- **Zugriff:** Nichts ist öffentlich. Bilder/Akten/Aufnahmen nur nach **Admin‑Login**.
  Prüfer melden sich mit **eigenem Login + 2FA** an; das Anlegen läuft über den Admin.
- **Härtung:** persönliche Logins (scrypt), **TOTP‑2FA**, Konto‑Sperre nach
  Fehlversuchen, IP‑Brute‑Force‑Sperre, Rate‑Limit, optionale IP‑Allowlist,
  Sicherheits‑Header (CSP/HSTS), Zugangsnummern gelten genau einmal.

## So funktioniert's
1. **Admin:** `/admin` öffnen → Admin‑Passwort (+2FA) → unter **Mitarbeiter** die
   Prüfer‑Logins anlegen (jeder bekommt einen eigenen 2FA‑Schlüssel, einmalig zeigen).
2. **Prüfer:** Startseite → **„Mitarbeiter‑Login"** → anmelden → **Warteraum** →
   **„Zugangsnummer erzeugen"** und dem Bewerber schicken.
3. **Bewerber:** Link öffnen → **Zugangsnummer** + Einwilligung → **Starten** →
   Kamera/Mikro erlauben → die drei Bilder hochladen.
4. **Prüfer:** **„Abholen"** → Live‑Gespräch, Bilder prüfen, Checkliste, optional
   **Aufnahme** → **Freigeben** oder **Ablehnen** (Akte wird verschlüsselt gespeichert).
5. **Admin:** unter **Fälle**/**Aufnahmen** einsehen/löschen.

## Streamer-Ordner (mcp.4ever1.tv)

Ist eine Audition abgeschlossen, wandert die komplette Akte automatisch in den
Ordner des Streamers. Zugeordnet wird über die **BIGO-ID** – die ändert sich
nicht, anders als der angezeigte Name.

Der Ordner liegt **auf demselben Server** und ist unter `mcp.4ever1.tv`
erreichbar (alternativ `mein.4ever1.tv`). Dort sieht man je Streamer alle
Auditions, Aufnahmen samt Auswertung, Protokolle und Ausweisbilder; Admins
können Status (`neu / aktiv / pausiert / abgelehnt / nicht mehr dabei`) und eine
Notiz pflegen. Prüfer dürfen lesen, ändern dürfen nur Admins.

Weil beides auf demselben Server läuft, geht nichts über das Netz – die Ablage
kann nicht scheitern und der Prüfer wartet nicht darauf.

### Ordner woanders betreiben (optional)

Soll der Ordner später bei einem anderen System liegen, genügt `MCP_URL`. Dann
schickt ident die Akte als JSON dorthin. Ohne `MCP_URL` bleibt alles hier.

| Variable | Bedeutung |
|---|---|
| `MCP_URL` | Adresse, die die Akte entgegennimmt (POST, JSON) |
| `MCP_TOKEN` | Schlüssel, wird als `Authorization: Bearer …` mitgeschickt |
| `MCP_AUTO` | `off` = nur von Hand übergeben (Vorgabe: automatisch) |
| `PUBLIC_URL` | eigene Adresse, z. B. `https://ident.4ever1.tv` – nötig für die Abhol-Links |

**Was gesendet wird** (gekürzt):

```jsonc
{
  "quelle": "ident.4ever1.tv", "version": 1,
  "streamer": { "bigoId": "streamer4711", "name": "Lena Muster", "alter": "24" },
  "audition": { "ergebnis": "approved", "pruefer": "eyDennis",
                "ausweisart": "Personalausweis", "ausweisnummer": "…", … },
  "aufnahme": { "sekunden": 95, "auswertung": "ok", "begruendung": "…" },
  "protokoll": [ { "text": "…", "autor": "eyDennis", "am": "…" } ],
  "dateien": [ { "art": "ausweis",  "bezeichnung": "Ausweis vorne", "url": "https://…/api/pull?…" },
               { "art": "aufnahme", "bezeichnung": "Video der Audition", "url": "https://…/api/pull?…" } ]
}
```

Die Bilder und das Video werden **nicht** mitgeschickt, sondern über die Links
abgeholt. Diese Links sind unterschrieben (HMAC) und gelten **24 Stunden** –
danach und bei jedem manipulierten Link antwortet der Server mit `403`.

Die Gegenstelle soll mit `2xx` antworten. Klappt es nicht, versucht ident es
nach 15 Sekunden, 1 Minute und 5 Minuten erneut. Danach steht der Grund in der
Akte und man kann sie im Adminbereich von Hand nachschicken. Der Prüfer wartet
nie darauf – die Übergabe läuft im Hintergrund.

## Betrieb (Coolify → ident.4ever1.tv)
1. Repo/Ordner `ident/` als App in Coolify anlegen (Dockerfile‑Build).
2. **Domain:** `ident.4ever1.tv` als DNS‑A‑Record auf den Server, in Coolify als
   Domain hinterlegen (TLS via Let's Encrypt automatisch).
3. **Volume** mounten und `DATA_DIR` daraufsetzen (z. B. `/data`).
4. **Umgebungsvariablen** aus `.env.example` setzen – mindestens `STORAGE_KEY`,
   `ADMIN_PASSWORD`, `ADMIN_TOTP_SECRET`. Für stabiles Video `TURN_HOST`/`TURN_SECRET`.
5. Deployen. Erreichbar: Bewerber/Prüfer unter `/`, Admin unter `/admin`.

## Lokal starten
```
npm install
STORAGE_KEY=test ADMIN_PASSWORD=admin123 DATA_DIR=./data npm start
# http://localhost:8080  (Admin: http://localhost:8080/admin)
```

## Aufbau
```
ident/
├── server.js     HTTP-API + WebRTC-Signalisierung
├── security.js   Krypto, Login, 2FA, Missbrauchsschutz, Header
├── store.js      verschlüsselte Ablage (Codes, Mitarbeiter, Fälle, Aufnahmen)
├── public/
│   ├── index.html / app.js   Bewerber- & Prüfer-App
│   └── admin.html / admin.js  Admin-Panel
├── Dockerfile · .env.example · README.md
```
