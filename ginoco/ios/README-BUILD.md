# Ginoco – iOS-App für den App Store

Das ist die **echte, native iOS-App** von Ginoco (nicht Ginoso!).
Sie zeigt die Fahrschul-Buchung von **https://ginoco.de** in einem nativen
WKWebView-Fenster – ohne Browser-Rahmen, mit eigenem Icon, eigenem Startbildschirm,
bleibender Anmeldung und „nach unten ziehen zum Aktualisieren".

- **Name:** Ginoco
- **Bundle-ID:** `de.ginoco.app`
- **Ziel-iOS:** 16.0 und neuer (iPhone + iPad)

---

## In 6 Schritten in den App Store

### 1. Projekt öffnen
Öffne in Xcode die Datei:
```
ginoco/ios/Ginoco.xcodeproj
```
> Achtung: **Ginoco** öffnen – nicht das alte **Ginoso**-Projekt (das ist die
> Preisgedächtnis-App unter `~/code/preisapp/ios`).

### 2. Signieren (dein Apple-Konto)
Links im Projekt-Navigator oben auf **Ginoco** (blaues Icon) →
Reiter **Signing & Capabilities**:
- **Team:** dein Apple-Developer-Konto wählen
- Haken bei **Automatically manage signing**
- **Bundle Identifier** muss `de.ginoco.app` sein

### 3. Testen
Oben ein iPhone-Simulator (z. B. iPhone 15) wählen → ▶︎ **Run**.
Es muss ginoco.de laden und die Anmeldung funktionieren.

### 4. App in App Store Connect anlegen
[appstoreconnect.apple.com](https://appstoreconnect.apple.com) →
**Meine Apps → + → Neue App**:
- Plattform: iOS
- Name: **Ginoco**
- Bundle-ID: **de.ginoco.app**
- SKU: z. B. `ginoco-ios`

### 5. Archivieren & hochladen
- Oben Gerät auf **Any iOS Device (arm64)** stellen
- Menü **Product → Archive**
- Im Organizer: **Distribute App → App Store Connect → Upload**

### 6. Store-Eintrag ausfüllen & einreichen
In App Store Connect: Screenshots (6,7" iPhone = 1290×2796, liegen im
Scratchpad als `ios-1`…`ios-5`), Beschreibung/Keywords (siehe
`ginoco-appstore.txt`), Demo-Login für die Prüfung
(**appletest / PlayReview2026!**), Datenschutz-Angaben → **Zur Prüfung einreichen**.

---

## Gut zu wissen

- **Anmeldung bleibt erhalten:** persistenter Cookie-Speicher – nach dem
  Schließen ist man noch angemeldet.
- **Externe Links** (Telefon, Mail, fremde Webseiten) öffnen im System, nicht
  in der App.
- **Web-Push im Wrapper:** Push-Nachrichten über den Service Worker laufen auf
  iOS nur im „Zum Home-Bildschirm"-Modus zuverlässig, nicht im WKWebView.
  Für echte App-Push-Nachrichten bräuchte es später APNs (separate Erweiterung).
  Für die Store-Einreichung ist das **nicht** nötig.
- **Apple-Richtlinie 4.2:** Reine Web-Hüllen können abgelehnt werden, wenn sie
  „nur eine Webseite" sind. Ginoco hat echte App-Funktion (Konten, Buchung,
  Ausbildungsnachweis) und app-typisches Verhalten (kein Browser-Rahmen,
  Pull-to-Refresh, native Link-Behandlung) – das erfüllt die Anforderung in
  aller Regel.

## Aufbau
```
ios/
  Ginoco.xcodeproj/        ← das Projekt (in Xcode öffnen)
  Ginoco/
    GinocoApp.swift        ← App-Einstieg
    ContentView.swift      ← Vollbild-Ansicht
    WebView.swift          ← native WKWebView-Hülle um ginoco.de
    Assets.xcassets/       ← App-Icon (1024) + Akzentfarbe
```
Das App-Icon wird beim Bearbeiten von `public/icon-512.png` **nicht** automatisch
mitgezogen – bei einem neuen Icon einfach `Assets.xcassets/AppIcon.appiconset/AppIcon.png`
(1024×1024, ohne Transparenz) ersetzen.
