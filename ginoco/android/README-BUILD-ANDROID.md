# Ginoco – Android-App für den Google Play Store (TWA)

Das ist die **Android-App** von Ginoco. Sie zeigt die Fahrschul-Buchung von
**https://ginoco.de** in einer **Trusted Web Activity (TWA)** – das ist die
echte Chrome-Engine im Vollbild, ohne Adressleiste. Vorteil gegenüber einer
einfachen WebView-Hülle: **Push-Benachrichtigungen, Standort, Foto-Upload und
Service-Worker funktionieren voll** – genau wie im Browser.

- **Name:** Ginoco
- **Package (App-ID):** `de.ginoco.app`
- **Ziel:** Android 5.0 (API 21) und neuer

> Warum TWA und nicht eine eigene WebView wie bei iOS? Weil eure
> **Push-Benachrichtigungen** in einer TWA auf Android wirklich ankommen –
> in einer nackten WebView (und im iOS-Wrapper) nicht.

---

## Voraussetzungen (einmalig)

1. **Node.js** (18+) – hast du schon.
2. **Bubblewrap** installieren:
   ```
   npm install -g @bubblewrap/cli
   ```
   Beim ersten `bubblewrap`-Aufruf bietet es an, ein **JDK 17** und die
   **Android-SDK-Kommandozeilentools** selbst herunterzuladen – einfach mit
   „yes" bestätigen. (Kein Android Studio nötig.)
3. Ein **Google-Play-Entwicklerkonto** – einmalig **25 $**:
   [play.google.com/console](https://play.google.com/console)

---

## In 6 Schritten in den Play Store

### 1. Projekt erzeugen
Im Ordner `ginoco/android/`:
```
cd ginoco/android
bubblewrap init --manifest https://ginoco.de/manifest.webmanifest
```
- **Application ID / package:** `de.ginoco.app`
- **Include support for Push notifications?** → **Yes** (wichtig!)
- **Display mode:** `standalone`, **Orientation:** `portrait`
- Rest kannst du mit Enter bestätigen (die Werte stehen als Vorlage in
  `twa-manifest.json`).

> Bubblewrap fragt beim Bauen nach einem **Signatur-Schlüssel (Keystore)**.
> Lass einen neuen erstellen und **bewahre die `.jks`-Datei + das Passwort
> sicher auf** – ohne sie kannst du später keine Updates veröffentlichen!

### 2. Bauen
```
bubblewrap build
```
Ergebnis: **`app-release-bundle.aab`** (das lädst du in den Play Store) und
`app-release-signed.apk` (zum lokalen Testen auf einem Handy).

Am Ende zeigt Bubblewrap den **SHA-256-Fingerabdruck** deines Schlüssels.
Du kannst ihn jederzeit erneut anzeigen:
```
keytool -list -v -keystore android-keystore.jks -alias ginoco
```

### 3. Fingerabdruck in Ginoco eintragen
Cockpit (**mcp.ginoco.de**) → **⚙️ Einstellungen → 📱 Android-App (Play Store)**
→ den **SHA-256-Fingerabdruck** einfügen → **Speichern**.

Danach prüfen: **https://ginoco.de/.well-known/assetlinks.json** muss den
Fingerabdruck zeigen. Erst dann startet die App **ohne Adressleiste** (sonst
läuft sie noch als „Custom Tab" mit sichtbarer URL).

> **Wichtig – Play App Signing:** Google signiert deine App beim
> Veröffentlichen oft **neu** mit einem eigenen Schlüssel. Der Fingerabdruck,
> der dann zählt, steht im Play Console unter
> **Release → Einrichtung → App-Signatur → „Zertifikat des App-Signaturschlüssels" (SHA-256)**.
> Trag am besten **beide** Fingerabdrücke (Upload-Schlüssel **und**
> App-Signaturschlüssel) mit Komma getrennt in Ginoco ein.

### 4. App im Play Console anlegen
[play.google.com/console](https://play.google.com/console) → **App erstellen**:
- Name: **Ginoco**
- Sprache: Deutsch, App/Spiel: **App**, kostenlos
- Package: **de.ginoco.app**

### 5. Release hochladen
**Test → Interner Test** (oder **Produktion**) → **Neuen Release erstellen** →
die **`app-release-bundle.aab`** hochladen → Release speichern & prüfen.

### 6. Store-Eintrag & Prüfung
- **Grafik:** App-Icon (512×512 = `public/icon-512.png`), Feature-Grafik
  (1024×500), 2–8 Screenshots (die iOS-Screenshots aus dem Scratchpad passen).
- **Beschreibung/Keywords:** aus `ginoco-appstore.txt` übernehmen.
- **Demo-Zugang für die Prüfung:** `appletest` / `PlayReview2026!`
  (unter „App-Zugang" hinterlegen).
- **Datensicherheit** ausfüllen (Standort für die Abholung, Konto-Daten).
- **Zur Prüfung einreichen.**

---

## Gut zu wissen

- **Immer aktuell:** Die TWA zeigt stets die Live-PWA von ginoco.de – App-Updates
  im Store sind nur nötig, wenn sich Icon, Name oder das TWA-Gerüst ändern.
- **Push:** funktioniert über den vorhandenen Service Worker + VAPID – nichts
  Zusätzliches nötig.
- **Standort/Fotos:** Chrome fragt beim ersten Mal um Erlaubnis, genau wie im
  Browser.
- **assetlinks.json** wird vom Server dynamisch aus der Einstellung
  `android_fingerprint` erzeugt (`server.js` → `serveAssetLinks`).

## Aufbau
```
android/
  twa-manifest.json           ← Vorlage/Config für Bubblewrap
  README-BUILD-ANDROID.md     ← diese Anleitung
  (nach `bubblewrap build` entstehen hier app-release-bundle.aab,
   android-keystore.jks u. a. – der Keystore gehört NICHT ins Git!)
```
