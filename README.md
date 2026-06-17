# Fahrschule Live – Theorie zum Mitmachen

Ein leichtgewichtiges Web-Tool für den theoretischen Fahrschulunterricht.
Der Fahrlehrer zeigt die Lektion (Beamer/Bildschirm), die Schüler steigen per
**QR-Code** mit dem Handy ein und **folgen live** der aktuellen Folie.

**Das Besondere:**
- 📱 Schüler steigen ohne App nur über den QR-Code ein.
- 🔒 **Kein Vorblättern** – Schüler sehen immer höchstens die Folie, die der Lehrer gerade zeigt.
- 🖍️ **Markieren** – Schüler tippen Punkte an, um sie zu markieren (bleibt auf dem Gerät gespeichert) → perfekt für Screenshots.
- 🧩 **Mitmach-Folien** statt nur Text: Quiz, Lückentext, Zuordnung und Kreuzworträtsel mit Sofort-Feedback.
- ✅ Inhalte fachlich gestützt auf die amtliche **StVO** (gesetze-im-internet.de) – kein urheberrechtlich geschütztes Lehrwerk-Material.

## Themenübersicht

12 Grundstoff-Themen (alle Klassen) + 2 Themen „Klasse B – Auto-Technik" (13/14).

| Status | Thema |
|---|---|
| ✅ fertig | **Thema 5 – Grundregel, Vorfahrt und Verkehrsregelungen** (27 Folien) |
| ✅ fertig | **Thema 6 – Verkehrszeichen und Verkehrseinrichtungen** (20 Folien) |
| 🛠️ geplant | Themen 1–4, 7–12 (Grundstoff) sowie 13–14 (Auto-Technik) |

Weitere Themen entstehen Schritt für Schritt nach demselben Muster.

## Aufbau

```
index.html        Startseite (Rolle wählen / Code eingeben)
lehrer.html       Lehrer-Konsole (QR, Steuerung, Beamer-Ansicht)
schueler.html     Schüler-Ansicht (folgt live, markieren)
CNAME             Custom-Domain für GitHub Pages → ginoco.de
assets/css/app.css
assets/js/
  sync.js             Live-Verbindung der Geräte (WebRTC/PeerJS, ohne Server)
  firebase-config.js  optionale Alternative (Firebase) – wird aktuell NICHT genutzt
  render.js           Render-Engine für alle Folien-/Spieltypen
  lehrer.js / schueler.js
  daten/themen.js     Register aller 14 Themen
  daten/thema-05.js   Inhalt von Thema 5
```

## Live-Verbindung – ohne Einrichtung

Die Schüler-Handys folgen dem Lehrer-Gerät über eine **direkte Verbindung**
(WebRTC über PeerJS). Es ist **kein Konto, keine Datenbank und keine
Konfiguration** nötig – einfach Lehrer-Seite öffnen, QR-Code zeigen, fertig.

- Das Lehrer-Gerät ist der „Sender" (Host), der Raum-Code ist die Adresse.
- Jedes Schüler-Handy verbindet sich über den QR-Code/Code direkt damit.
- Spät dazukommende Schüler bekommen sofort die aktuelle Folie.

**Wann läuft es am besten?** Im selben Raum/WLAN praktisch immer. Bei Schülern in
sehr restriktiven Fremd-Netzen kann eine reine Direktverbindung selten scheitern
(dafür bräuchte es einen Relay-/TURN-Server) – für den Klassenraum ist das aber
der reibungsloseste Weg.

### Optionale Alternative: Firebase
In `assets/js/firebase-config.js` liegt eine vorbereitete Firebase-Konfiguration
bereit (aktuell **nicht** aktiv). Wer später eine serverbasierte Variante mit
Relay/Verlauf möchte, kann darauf umstellen – sag einfach Bescheid.

## Veröffentlichen auf ginoco.de (GitHub Pages)

1. Im Repository **Settings → Pages → Source: Deploy from branch** wählen.
2. Als Branch den Veröffentlichungs-Branch wählen (z. B. `main`) und Ordner `/ (root)`.
3. Unter **Custom domain** `ginoco.de` eintragen (die `CNAME`-Datei liegt bereits im Repo).
4. Beim Domain-Anbieter die DNS-Einträge auf GitHub Pages zeigen lassen
   (A-Records auf die GitHub-Pages-IPs bzw. CNAME auf `<user>.github.io`).
5. „Enforce HTTPS" aktivieren.

QR-Codes und Beitritts-Links nutzen automatisch die Domain, unter der die Seite
gerade läuft – auf ginoco.de zeigen sie also auf ginoco.de.

## So läuft eine Stunde ab

1. Du öffnest **ginoco.de/lehrer.html** → es entsteht automatisch ein Raum-Code (z. B. `ABCD`).
2. Du wählst oben das Thema (aktuell: Thema 5).
3. Du zeigst den **QR-Code** (Knopf „QR groß zeigen" für den Beamer).
4. Schüler scannen → ihr Handy hängt im Raum und folgt jeder Folie.
5. Mit **Weiter/Zurück** (oder Pfeiltasten/Leertaste) steuerst du; die Schüler kommen mit, können markieren und mitraten.

## Neues Thema ergänzen

1. Datei `assets/js/daten/thema-06.js` nach dem Vorbild von `thema-05.js` anlegen.
2. In `assets/js/daten/themen.js` beim passenden Eintrag `verfuegbar: true` setzen
   und im `lader`-Objekt `"06": () => import("./thema-06.js")` ergänzen.

Fertig – das Thema ist sofort auswählbar.
