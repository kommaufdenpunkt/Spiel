# 🚗 Fahrschulportal

Ein schlankes Buchungsportal für die Fahrschule: Fahrschüler buchen ihre
Fahrstunden selbst, tauschen sie bei Bedarf untereinander – und der Fahrlehrer
sieht per Tacho, ob das Wochenziel erreicht ist. Alles läuft auf **einem eigenen,
eigenständigen Server** und braucht **keine externen Dienste** (keine Cloud-DB,
keine fremden Pakete).

---

## Schnellstart

Voraussetzung: **Node.js ab Version 22.5** (bringt SQLite und alles Nötige schon mit).

```bash
cd fahrschulportal
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
- **Sperrfrist 36 Std.:** Ab dann steht der Termin fest (kein Absagen/Abgeben mehr).

### Für den Fahrlehrer
- **Tacho / Drehzahlmesser:** zeigt dynamisch die Stunden dieser Woche gegen das
  **Wochenziel** (Standard 25 h) – rot = weit weg, gelb = fast dran, grün =
  Ziel erreicht 🎯. Dazu ein Tages-Tacho und eine Wochen-Balkenübersicht.
- **Kalender – Tag & Woche:** Tagesliste oder **Wochen-Zeitachse Mo–Sa** mit
  farbigen Terminblöcken (Farbe je Fahrschüler), Theoriezeiten schraffiert,
  Tages-Tags für kurze/freie/Urlaubstage. Termin antippen zum Bearbeiten.
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
- **Farb-Themes (augenschonend):** 6 dunkle Paletten zur Auswahl – Nachtblau,
  Aubergine (Lila), Beere (Pink), Waldgrün, Graphit, Mitternacht. Über den
  🎨-Knopf; die Wahl wird pro Gerät gespeichert.
- **Nächste Fahrstunde** mit Countdown (Schüler) und **„Zum Kalender
  hinzufügen"** (iCal-Datei für Handy/PC-Kalender, mit Erinnerung 3 Std vorher).

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
| Kurzer Tag – letzter Slot | 13:35 | Feierabend an markierten Tagen |

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
fahrschulportal/
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
