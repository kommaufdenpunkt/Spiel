# 🚗 ginoco — Version 2.1

*Das Fahrschulportal von Gino.*

Ein schlankes Buchungsportal für die Fahrschule: Fahrschüler buchen ihre
Fahrstunden selbst, tauschen sie bei Bedarf untereinander – und der Fahrlehrer
sieht per Tacho, ob das Wochenziel erreicht ist. Alles läuft auf **einem eigenen,
eigenständigen Server** und braucht **keine externen Dienste** (keine Cloud-DB,
keine fremden Pakete).

---

## Schnellstart

Voraussetzung: **Node.js ab Version 22.5** (bringt SQLite und alles Nötige schon mit).

```bash
cd ginoco
npm start          # oder:  node server.js
```

Dann im Browser öffnen: **http://localhost:3000**

- **Fahrlehrer-Login:** Tab „Fahrlehrer" → Standard-PIN **`1234`**
  (bitte sofort unter *Einstellungen → Zugang* ändern).
- **Fahrschüler:** bekommen vom Fahrlehrer einen Zugangscode und legen damit
  unter „Neu (mit Code)" ihr Konto an.

Der Server legt beim ersten Start automatisch die Datenbankdatei
`fahrschule.db` an. Diese Datei enthält alle Daten – einfach mitsichern, wenn
du ein Backup willst.

> Anderer Port? `PORT=8080 node server.js`
> Anderer DB-Ort? `FSP_DB=/pfad/zu/daten.db node server.js`
> Nur lokal binden (hinter Proxy)? `HOST=127.0.0.1 node server.js`

---

## Online stellen (ginoco.de)

Komplette Schritt-für-Schritt-Anleitung für einen deutschen Server mit
automatischem HTTPS: **[deploy/DEPLOY.md](deploy/DEPLOY.md)**.
Fertige Konfig-Dateien liegen im Ordner `deploy/` (Caddyfile, systemd-Dienst).

---

## Was das Portal kann

### Für Fahrschüler
- **Einloggen** mit **Login-Namen (Initialen + Jahrgang, z. B. `MM1997`)** oder
  E-Mail + Passwort. Registrierung **einmalig über einen Code**; die E-Mail ist
  optional. Passwort vergessen? Der Fahrlehrer setzt ein neues (Reset-Button
  im Fahrschüler-Tab).
- **Fahrstunden buchen** – standardmäßig **80-Minuten-Slots** mit **15 Min Pause**
  dazwischen.
- **Max. 2 Fahrstunden pro Woche** (einstellbar).
- **Vorausbuchung bis 14 Tage** (einstellbar) – weiter im Voraus plant nur der
  Fahrlehrer (z. B. Sonderfahrten). Der jeweils äußerste Tag öffnet **täglich zu
  einer festen Uhrzeit** (Standard 10:00), so rollt das Fenster automatisch weiter.
- **Variable Stundenlängen (40 / 80 / 120 Min):** Standard 80 Min; einzelne
  Schüler kann der Fahrlehrer für kürzere/längere Stunden freischalten.
- **Verbindliche Buchung** mit Sicherheitsabfrage („Bist du wirklich sicher?").
- **Stornieren** kostenlos bis **48 Std.** vorher.
- **Übernahme-Marktplatz:** Wer kurzfristig nicht kann, bietet die Stunde den
  anderen Fahrschülern an. Alle anderen bekommen eine **Benachrichtigung im
  Portal-Postfach** („möchtest du sie übernehmen?"); wer sie übernimmt, bekommt
  den Slot – der Anbieter wird informiert, dass er frei ist.
- **Postfach / Benachrichtigungen:** Glocke mit ungelesenen Meldungen (Angebot
  frei, Termin verschoben, …).
- **„Keine Zeit" auf ein Angebot:** wer nicht kann, klickt es weg. Lehnen **alle**
  anderen ab, wird die Stunde wieder fest dem Anbieter zugeordnet
  (zahlungspflichtig) – er wird benachrichtigt.
- **Anonymer Tausch (Datenschutz):** Schüler sehen im Feed und in den
  Benachrichtigungen **nicht**, von wem ein Termin kommt oder wer ihn übernimmt –
  es ist egal, wichtig ist nur, dass er übernommen wird. Nur der Fahrlehrer sieht
  im Protokoll die Namen (Nachvollziehbarkeit). Abschaltbar in den Einstellungen.
- **Rang-System:** Ab X gefahrenen Stunden (Standard 15) wird ein Schüler
  **Rang 2** und darf **weiter im Voraus** buchen (Standard 21 statt 14 Tage) –
  so kommen fortgeschrittene Schüler früher an Sonderfahrten, Anfänger sehen die
  Tage erst nach und nach.

### Sonderfahrten (für die Fahrlehrer-Seite)
- Beim Abschließen einer Stunde wählst du die **Fahrt-Art**: Normal, 🌄 Überland,
  🛣️ Autobahn, 🌙 Nachtfahrt. Diese werden **automatisch pro Schüler gezählt**
  (Soll einstellbar, Standard 5 / 4 / 3) und im Protokoll vermerkt.
- In der **Wochen-Zeitachse** haben die Fahrt-Arten eigene **Farben**; Schüler und
  Fahrlehrer sehen den Fortschritt (z. B. „Autobahn 1/4").
- **Sperrfrist 36 Std.:** Ab dann steht der Termin fest (kein Absagen/Abgeben mehr).

### Für den Fahrlehrer
- **Tacho / Drehzahlmesser:** zeigt dynamisch die Stunden dieser Woche gegen das
  **Wochenziel** (Standard 25 h) – rot = weit weg, gelb = fast dran, grün =
  Ziel erreicht 🎯. Dazu ein Tages-Tacho und eine Wochen-Balkenübersicht.
- **Kalender – Tag / Woche / Monat:** Tagesliste, **Wochen-Zeitachse Mo–Sa** mit
  farbigen Terminblöcken (Farbe je Fahrschüler/Fahrt-Art) oder **Monatsübersicht**
  (Anzahl Fahrstunden pro Tag + farbige Punkte, Theorie/Urlaub-Tags, heute
  markiert; Tag antippen öffnet die Tagesansicht). Theoriezeiten schraffiert.
- **Stunde abschließen:** pro Fahrstunde **Schalter/Automatik** wählen und
  optional das **Kennzeichen** eintragen; Dauer anpassbar (z. B. letzte Stunde
  nur 20 statt 80 Min).
- **Termine verschieben** (vorziehen/zurückziehen) für nahtlose Übergänge.
- **Protokoll:** jeder Vorgang wird mitgeloggt (gebucht, storniert – von wem,
  angeboten, übernommen, verschoben, gefahren/nicht erschienen, Urlaub) – ein
  eigener Tab, filterbar nach Schüler/Zeitraum, den du deinem Chef vorlegen kannst.
- **Fahrlehrer-Glocke:** du wirst über jede Schüler-Aktion informiert (bucht,
  sagt ab, übernimmt) – ungelesen-Zähler am Protokoll-Tab.
- **3 Erinnerungen** an den Schüler automatisch: 1 Tag / 3 Std / 30 Min vorher.
- **„Ich komme später":** ein Klick verschiebt alle noch offenen Termine des
  Tages um X Minuten nach hinten (Verspätungs-Kette) und benachrichtigt alle.
- **Urlaub:** Urlaubstage zählen je 240 Min als Arbeitszeit, Resturlaub-Zähler,
  Schüler sehen „Fahrlehrer im Urlaub". Kurzer Tag wird gesperrt, wenn dort
  schon Termine liegen (mit „trotzdem"-Bestätigung).
- **Stunde abschließen:** erschienen ja/nein + Grund, Verspätungs-Minuten
  (ab 20 Min Verspätung schlägt das Portal die verkürzte Fahrzeit vor),
  Schalter/Automatik, Kennzeichen – alles landet im Protokoll.
- **Lücken schließen (ein Klick):** Entsteht durch eine Absage eine Lücke,
  erkennt das Portal sie und schlägt eine **Verschiebe-Kette** vor (z. B.
  13:35→12:00, 16:45→13:35), damit der Tag lückenlos ist. Du bestätigst per
  Klick – die betroffenen Fahrschüler werden automatisch benachrichtigt.
  Theorie-/Blockzeiten werden dabei übersprungen.
- **Zugangscodes** erzeugen und an neue Fahrschüler weitergeben.
- **Theorie & Ausnahmen:** Zeiten blockieren (z. B. Theorieunterricht 17–20 Uhr,
  Urlaub, Sonderfahrten). Blockzeiten können wahlweise als Arbeitszeit zählen.
- **Arbeitszeiten / Dienstplan:** einzelne Tage als **kurzen Tag** (früher
  Feierabend, z. B. wenn die Frau frei hat) oder als **ganzen freien Tag**
  markieren. Die buchbaren Slots passen sich für die Schüler automatisch an.
- **Wochen-Kennzahlen:** Kacheln über dem Tacho (Fahrstunden, gefahren,
  nicht erschienen, % vom Wochenziel).
- **Protokoll als CSV** exportieren (öffnet in Excel) – für die Unterlagen.
- **Alles einstellbar:** Arbeitsbeginn/-ende, Slot-Dauer, Pause, Arbeitstage
  (Mo–Sa), Wochen-/Tagesziel, Stornofristen, Vorausbuchungsfenster, PIN.

### Für beide
- **Edge-Menüs (Kantenleisten):** Wie beim Samsung-Edge – kleine Griffe am
  **linken** und **rechten** Bildschirmrand. Antippen, und die Leiste fährt
  herein: **links die Navigation** (alle Bereiche als große Tap-Flächen),
  **rechts die Aktionen** (Farbe wählen, Aktualisieren, Handynummer, Abmelden).
  Besonders praktisch am Handy.
- **Farb-Themes (augenschonend):** 6 dunkle Paletten zur Auswahl – Nachtblau,
  Aubergine (Lila), Beere (Pink), Waldgrün, Graphit, Mitternacht. Über den
  🎨-Knopf; die Wahl wird pro Gerät gespeichert.
- **Nächste Fahrstunde** mit Countdown (Schüler) und **„Zum Kalender
  hinzufügen"** (iCal-Datei für Handy/PC-Kalender, mit Erinnerung 3 Std vorher).

### Kontakt & Live-Standort
- **Handynummern:** Schüler hinterlegen ihre Nummer (📱 im Kopf), der Fahrlehrer
  seine in den Einstellungen. Überall gibt es **📞 Anrufen** und **💬 WhatsApp**
  (mit vorbereitetem Text) – kein Abtippen nötig.
- **Live-Standort mit ETA:** Der Fahrlehrer teilt (ab ~20 Min vor der Stunde, per
  Tipp) seinen Standort. Der Schüler sieht ihn **live auf der Karte**, dazu
  **Entfernung und geschätzte Ankunftszeit** zum Treffpunkt und einen
  **„Route öffnen"**-Link.
- **Fester Treffpunkt pro Schüler:** Mit jedem Schüler wird ein fester Abhol-/
  Treffpunkt abgesprochen (Tab *Fahrschüler* → *Treffpunkt festlegen*: Adresse,
  optional Koordinaten für die ETA). Dieser wird bei **jeder** Fahrstunde des
  Schülers automatisch als Treffpunkt genutzt – kein erneutes Eintragen.
  Reihenfolge: an der Stunde hinterlegt → fester Schüler-Standort → globaler
  Standard.
  - *Technik-Hinweis:* Standort-Teilen läuft, solange die App offen ist (Web-App);
    echtes Hintergrund-Tracking bei geschlossener App kann nur eine native App.
    Die Karte nutzt OpenStreetMap (braucht Internet), die ETA ist eine Schätzung
    (Luftlinie ÷ Ø-Tempo, einstellbar).

### Sicherheit
- **Starke Passwörter (mit Sonderzeichen):** Schüler-Passwörter und das
  Fahrlehrer-Passwort brauchen mind. 8 Zeichen mit Buchstabe, Zahl und
  Sonderzeichen. Der Passwort-Reset erzeugt auf Wunsch ein starkes Zufallspasswort.
- **Brute-Force-Schutz:** nach mehreren Fehlversuchen wird der Login kurz gesperrt.
- **Sichere Cookies:** HttpOnly + SameSite; hinter HTTPS zusätzlich Secure.
- **Sicherheits-Header:** nosniff, X-Frame-Options (Clickjacking-Schutz),
  Referrer-Policy, HSTS (bei HTTPS).
- Passwörter/PIN sind mit scrypt + Salt gehasht; die PIN wird nie ausgeliefert.

### Passwort vergessen?
Bewusst **kein E-Mail-Reset** (viele Schüler haben keine E-Mail hinterlegt).
Stattdessen: Der Schüler meldet sich beim Fahrlehrer (z. B. per WhatsApp), und
der Fahrlehrer vergibt im **Fahrschüler-Tab → „Passwort zurücksetzen"** ein
neues Passwort (per Knopf zufällig erzeugbar). Das Portal zeigt danach eine
fertige Weitergabe-Info (Login-Name + Passwort) mit Kopier-Knopf. Der
Login-Name bleibt unverändert.

---

## Voreinstellungen (alle im Menü änderbar)

| Einstellung | Standard | Bedeutung |
|---|---|---|
| Arbeitsbeginn | 12:00 | frühester Slot |
| Letzter Slot | 16:45 | letzter buchbarer Start → ergibt **4 Slots/Tag** |
| Fahrstunde | 80 Min | Dauer einer Stunde |
| Pause | 15 Min | Puffer zwischen zwei Stunden |
| Arbeitstage | Mo–Sa | wählbar |
| Wochenziel | 25 h | Tacho-Ziel |
| Max/Woche | 2 | Fahrstunden je Schüler & Woche |
| Vorausbuchung | 14 Tage | Buchungsfenster der Schüler |
| Tägliche Freigabe | 10:00 | ab wann der äußerste Tag öffnet |
| Kostenlos stornieren | 48 h vorher | danach nur noch anbieten |
| Sperrfrist | 36 h vorher | Termin steht fest |
| Pause zwischen Stunden | 15 Min | frei einstellbar, steuert das ganze Raster |
| Kurzer Tag – letzter Slot | 13:35 | Feierabend an markierten Tagen |

**Flexible Pausen:** Die Pause zwischen den Fahrstunden ist frei einstellbar
(Standard 15 Min). Sie steuert automatisch **alles**: die Slot-Zeiten, die
Vorschau und die Kollisions-/Pausenprüfung beim Buchen. Änderst du die Pause
(oder Dauer/Start), rechnet das Raster sofort neu. Liegen bereits gebuchte
Termine dann nicht mehr genau im neuen Raster, meldet das Portal das nach dem
Speichern und bietet **„Termine ans neue Raster anpassen"** an – die Termine
rücken lückenlos, die betroffenen Fahrschüler werden benachrichtigt.

**Rechnung dahinter:** 4 Slots × 80 Min = 320 Min = **5,3 h/Tag**.
Bei 6 Arbeitstagen sind das rund **32 h/Woche** – dein Ziel von 25–30 h ist damit
gut erreichbar. Über die Slot-Vorschau in den Einstellungen siehst du sofort,
wie viele Slots deine Zeiten ergeben; einfach `Letzter Slot` anpassen, wenn du
mal einen Slot mehr oder weniger willst.

---

## Technik (kurz)

- **Backend:** ein einziger Node-Prozess (`server.js`) – HTTP-Server + JSON-API,
  Datenbank über das in Node eingebaute SQLite (`node:sqlite`), Passwörter/PIN
  sicher gehasht (scrypt). **Keine npm-Abhängigkeiten**, kein `npm install` nötig.
- **Frontend:** statische Dateien im Ordner `public/` (eine SPA aus `index.html`,
  `styles.css`, `app.js`) im dunklen Design.
- **Datenhaltung:** alles in `fahrschule.db` (SQLite-Datei im Projektordner).

```
ginoco/
├── server.js        # Server + komplette API
├── db.js            # Datenbank-Schema, Einstellungen, Passwort-Hashing
├── package.json
└── public/
    ├── index.html
    ├── styles.css
    └── app.js
```

### Hinweis zum Betrieb
Damit Fahrschüler von zu Hause zugreifen können, muss der Server dauerhaft
erreichbar laufen (z. B. auf einem kleinen Server/VPS, hinter HTTPS). Lokal zum
Ausprobieren reicht `node server.js` und der Aufruf über `localhost`.
Die Benachrichtigungen laufen aktuell **im Portal-Postfach** (die Schüler sehen
sie beim nächsten Login inkl. Glocke). **E-Mail und Push sind bereits
vorbereitet**: Im Code gibt es dafür den Haken `dispatchExternal()`; er wird
aktiv, sobald die Umgebungsvariable `FSP_NOTIFY` gesetzt und der eigentliche
Versand (SMTP für E-Mail bzw. Web-Push) dort eingehängt ist. Ohne Konfiguration
bleibt alles beim Portal-Postfach – nichts muss eingerichtet werden.

---

## Vorbereitet für eine native App (iOS/Android)

Die komplette Funktionalität steckt in einer sauberen **JSON-API** – eine native
App kann dieselben Endpunkte nutzen. Damit das ohne Browser-Cookies geht, gibt es
**Token-Login**:

- **Login** (`POST /api/auth/login`, `/api/auth/register`, `/api/auth/instructor`)
  liefert im JSON ein Feld **`token`**.
- Alle weiteren Aufrufe können den Token per Header senden:
  `Authorization: Bearer <token>` (statt Cookie). Der Web-Client nutzt weiter
  Cookies – beides funktioniert parallel.
- `GET /api/version` liefert Version und unterstützte Auth-Verfahren.

**Wichtigste Endpunkte** (alle unter `/api`):

| Zweck | Methode & Pfad |
|---|---|
| Version/Health | `GET /version` |
| Anmelden / Registrieren | `POST /auth/login · /auth/register · /auth/instructor` |
| Wer bin ich | `GET /auth/me` |
| Einstellungen (öffentlich) | `GET /settings` |
| Freie Slots eines Tages | `GET /slots?date=YYYY-MM-DD` |
| Eigene Buchungen | `GET /my/bookings` · `POST /bookings` · `DELETE /bookings/:id` |
| Tauschen | `POST /bookings/:id/offer · /take · /decline · /withdraw` · `GET /offers` |
| Postfach | `GET /my/notifications` · `POST /my/notifications/read` |
| Handynummer | `PATCH /my/profile` |
| Live-Standort (Schüler) | `GET /my/live` |
| Live-Standort (Fahrlehrer) | `POST /instructor/location` · `/location/stop` |
| Übersicht/Statistik/Protokoll | `GET /instructor/overview · /stats · /events` |

**Background-Standort:** Der Endpunkt `POST /api/instructor/location {lat,lng}`
ist schon da – eine native App kann genau hier ihre Hintergrund-Position
hinschicken (was der Web-App bei geschlossener App verwehrt bleibt). Der Rest
(Karte, ETA, Anzeige beim Schüler) funktioniert dann unverändert weiter.
