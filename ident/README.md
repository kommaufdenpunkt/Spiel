# ident – Video-Audition der Agentur 4EVER1

Bewerber melden sich mit einer Zugangsnummer, kommen in einen Warteraum und
werden per Video-Gespräch geprüft. Danach liegt alles in einer Akte und im
Ordner des Streamers.

> **Ehrlicher Hinweis:** Das ist eine **assistierte Video-Ident** – ein Mensch
> prüft. Der Ausweis wird **nicht automatisch ausgelesen**. Das ersetzt kein
> zertifiziertes eIDAS-Verfahren (NFC-Chip, Lebend-Erkennung).

## Wer wohin geht

| Adresse | Für wen | Was |
|---|---|---|
| `4ever1.tv` / `www` | alle | öffentliche Startseite der Agentur (`www` leitet auf die kurze Form) |
| `ident.4ever1.tv` | Bewerber | Zugangsnummer, Warteraum, Audition |
| `mcp.4ever1.tv` | Team | Übersicht, Warteraum, Streamer-Ordner, Zugangsnummern |
| `acp.4ever1.tv` | Admins | Einrichten, Diagnose, Überwachung – **und nur hier lässt sich löschen** |

Der Team-Bereich verlinkt den Adminbereich **nirgends** und erwähnt ihn auch
nicht – auch nicht für angemeldete Admins. `mcp.<domain>/verwaltung` gibt es
nicht mehr; die Adresse antwortet mit „Nicht gefunden". Eine Weiterleitung
gäbe es preis, nach dem niemand fragen soll.

`pruefer.` und `admin.` leiten auf `mcp.` weiter (Übergang, kann später weg).
`mein.4ever1.tv` gehört **nicht** hierher – dort läuft das PK-Board auf einem
anderen Server.

Suchmaschinen sehen nur die Startseite; alle Arbeitsbereiche antworten mit
`Disallow: /`.

## Der Weg einer Audition

1. **Team** (`mcp.`) erzeugt eine **Zugangsnummer** und schickt sie dem Bewerber.
2. **Bewerber** (`ident.`) gibt Nummer, BIGO-ID und Alter ein, stimmt zu.
3. Die **Teamleitung als Comic-Figuren** erklärt den Ablauf; danach die
   ausdrückliche Einwilligung in die Aufzeichnung.
4. **Warteraum** mit Technik-Check: Kamera, Mikrofon (Aussteuerung in Echtzeit),
   Licht (aus dem Bild geschätzt), Verbindung. Dazu die Wartezeit.
5. **Prüfer** nimmt den Nächsten an. Die **Aufnahme startet von selbst**, beide
   Seiten sehen den Hinweis. Kamera lässt sich beidseitig abschalten – das
   Gegenüber bekommt dann eine Meldung statt eines Standbildes.
6. Bewerber lädt Ausweis und Selfie hoch und liest den Text vom Teleprompter
   (Tempo selbst bestimmbar, manuelles Scrollen möglich).
7. **Stopp** → der Prüfer wertet die Aufnahme selbst aus: brauchbar oder nicht,
   bei „nicht" mit Begründung. Das landet in der Akte.
8. **Freigeben oder Ablehnen** → die Akte wird verschlüsselt gespeichert und
   wandert in den **Ordner des Streamers**, zugeordnet über die BIGO-ID.

## Wird die Person schon geführt?

Das prüft ident von selbst – zweimal:

1. **Beim Reinkommen.** Der Bewerber nennt seine BIGO-ID; der Server sieht
   nach und die Warteschlange zeigt „📁 schon im Ordner" samt Zahl der
   Auditions, Status und Vermerken. Der Prüfer weiss es also, **bevor** er
   das Gespräch annimmt.
2. **Beim Ausfüllen der Akte.** Während der Prüfer die Ausweisdaten eintippt,
   läuft der Abgleich mit. Drei Wege führen zu einem Treffer:
   - dieselbe **BIGO-ID** – sicher, die Audition wird angehängt
   - dieselbe **Ausweisnummer** – dieselbe Person mit neuer BIGO-ID; dann
     erscheint eine Warnung mit der alten Nummer
   - derselbe **Name und dasselbe Alter** – nur ein Hinweis zum Nachprüfen

Gibt es keinen Treffer, steht da „Neu bei uns – mit der Freigabe wird ein
neuer Ordner angelegt." Es entsteht also nie versehentlich ein zweiter Ordner
für dieselbe Person.

## Streamer-Ordner

Ein Ordner je BIGO-ID mit allen Auditions, Aufnahmen samt Auswertung,
Ausweisbildern, abgehakten Fragen, dem Wortlaut der Texte und Protokollen.
Der **Vorlese-Text wird bei jeder Audition mitgespeichert** – er ist die
Einwilligung, die der Bewerber in die Kamera gesprochen hat. Wird er später
geändert, steht in der alten Akte weiterhin, was an dem Tag galt.

- **Art:** Familie oder Streamer, mit Filter in der Übersicht
- **Status:** neu · aktiv · pausiert · abgelehnt · nicht mehr dabei
- **Vermerke:** Anrufe, Absprachen, Verwarnungen, Lob – mit acht Vorlagen und
  Textaufbereitung vor dem Speichern. Schreiben darf jeder Prüfer, ändern nur
  Admins, löschen nur über `acp.`

## Der blaue Haken (Altersverifikation ohne Audition)

Wer längst dabei ist, muss kein Gespräch nachholen. Der Prüfer öffnet die
Akte, tippt auf **„🪪 Jetzt verifizieren"** und trägt ein, was er gesehen hat:
Name laut Ausweis, Ausweisart, Nummer, Geburtsdatum – dazu die **Grundlage**
(im Videogespräch gesehen · Original vor Ort · aus der Audition-Akte
übernommen · Ausweisbild in der Akte geprüft) und eine Erklärung, die er
abhaken muss:

> Ich habe den Ausweis gesehen, das Gesicht stimmt überein und das
> Geburtsdatum belegt mindestens 18 Jahre.

Ohne Ausweisart und Grundlage nimmt **der Server** es nicht an – das ist keine
Höflichkeitsabfrage im Browser. Wer bestanden hat, trägt danach den blauen
Haken ✓ auf der Ordner-Karte und ganz oben in der Akte, mit Datum, Prüfer und
Grundlage im Tooltip.

- **Nichts wird überschrieben:** jede Prüfung bleibt im Verlauf stehen, auch
  die abgelehnten. Man kann später nachlesen, was wann geprüft wurde.
- **Abgelehnt hebt den Haken auf** – ein abgelaufener Ausweis darf nicht
  weiter als „geprüft" dastehen.
- **Filter „ohne ✓"** in der Ordner-Übersicht zeigt, wer noch fehlt.
- Die **Suche** findet „verifiziert" / „nicht verifiziert", den prüfenden
  Namen und die Ausweisnummer aus der Verifikation.
- Der Haken selbst ist kein Geheimnis: er sagt nur, **dass** geprüft wurde.
  Die Ausweisdaten dahinter liegen hinter der Grundangabe wie alles andere in
  der Akte.

## Am Handy

`mcp.` ist zum Abarbeiten unterwegs gebaut, nicht bloß verkleinert:

- Das Menü sitzt als **Leiste am unteren Rand**, wo der Daumen liegt – Zeichen
  oben, Kurzname darunter, immer sichtbar. Passt nicht alles hinein, schiebt
  man die Leiste seitlich.
- Kein Kasten wird breiter als das Gerät. Feste Mindestbreiten sind aufgehoben,
  damit der Browser die Seite nicht herauszoomt und die Schrift unlesbar wird.
- Alles Antippbare ist mindestens 44 px hoch.

## Adminbereich (`acp.`)

Kantenmenü links nach Aufgaben gruppiert, Arbeitsfläche in der Mitte, rechts
eine Spalte, die den Bereich erklärt, in dem man gerade steht – ausblendbar,
der Browser merkt es sich. Die Übersicht zeigt Kacheln, die selbst sagen, ob
etwas ansteht, und in ihren Bereich führen.

## Sicherheit

- **Ruhende Daten** mit AES-256-GCM verschlüsselt (`STORAGE_KEY`). Ohne
  Schlüssel läuft es, warnt aber beim Start.
- **Übertragung** über HTTPS und WebRTC/DTLS. Ausweisbilder gehen direkt
  zwischen Bewerber und Prüfer, nicht über einen Zwischenspeicher.
- **Konten:** persönliche Logins (scrypt), optional TOTP-2FA und Passkeys.
  Beim ersten Login vergibt jeder sein eigenes Passwort.
- **Missbrauchsschutz:** Konto-Sperre nach Fehlversuchen, IP-Sperre,
  Rate-Limit, optionale Geräte-Bindung (standardmäßig aus), Protokoll aller
  Anmeldeversuche.
- **Löschen** ist nur über `acp.<domain>` möglich – serverseitig erzwungen,
  nicht bloß ausgeblendet.
- **Aufbewahrung:** automatische Löschung nach `RETENTION_DAYS` (Vorgabe 90).

## Betrieb

Läuft als Container hinter einem Reverse-Proxy. Die Einstellungen kommen aus
Umgebungsvariablen, siehe `.env.example`. Pflicht sind `STORAGE_KEY` und
`ADMIN_PASSWORD`; für stabiles Video in Mobilfunknetzen `TURN_HOST` und
`TURN_SECRET`.

**Neue Fassung einspielen** (auf einem Server mit Docker und nginx):

```bash
ssh <server> '/opt/4ever1-ident/src/ident/deploy.sh'          # Zweig main
ssh <server> 'ZWEIG=<zweig> /opt/4ever1-ident/src/ident/deploy.sh'
```

Das Skript holt den Quellcode, baut das Abbild, tauscht den Container und
prüft, ob er antwortet – sonst stellt es die vorige Fassung wieder her. Daten
und Zugangsdaten liegen ausserhalb des Containers und bleiben unberührt.

**Lokal starten:**

```bash
npm install
STORAGE_KEY=test ADMIN_PASSWORD=admin123 DATA_DIR=./data npm start
# http://localhost:8080
```

## Eigene Bilder

Dateien einfach nach `public/` legen, der Server findet sie von selbst:

| Datei | Wirkung |
|---|---|
| `logo.png` (auch `.webp/.jpg/.svg`) | ersetzt das gezeichnete Zeichen auf der Startseite |
| `team.jpg` (auch `.png/.webp`) | echtes Team-Foto über der Teamleitung |

## Aufbau

```
ident/
├── server.js      HTTP-API, Adressen-Verteilung, WebRTC-Signalisierung
├── security.js    Verschlüsselung, Login, 2FA, Missbrauchsschutz, Header
├── store.js       verschlüsselte Ablage (Codes, Konten, Akten, Aufnahmen, Ordner)
├── mcp.js         Übergabe der fertigen Akte in den Streamer-Ordner
├── textpolish.js  räumt Vermerke und Protokoll-Einträge auf (regelbasiert)
├── deploy.sh      Quellcode holen, bauen, tauschen, im Fehlerfall zurück
├── umzug.sh       einmaliger Serverumzug (liest Schlüssel und Daten mit)
├── public/
│   ├── home.html · home.js         öffentliche Startseite
│   ├── index.html · app.js         Bewerber und Team-Bereich
│   ├── admin.html · admin.js       Adminbereich (nur acp.)
│   ├── figur.html · figur.js       Baukasten für die Comic-Figuren
│   └── figur-core.js               Figuren zeichnen und vorlesen
├── views/admin-dash.html           Adminbereich (erst nach dem Login geladen)
└── Dockerfile · .env.example · README.md
```
