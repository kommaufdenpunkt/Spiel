# Forever One Messenger — Konzept & Plan

**Stand:** 2026-06-03
**Status:** Entwurf zur Freigabe (es wurde noch kein Code gebaut)

Dieses Dokument beschreibt **was** wir bauen und **wie**. Es ist bewusst auch für
Nicht-Techniker verständlich geschrieben. Bitte lies es durch und sag mir, was passt,
was fehlt und was anders sein soll. **Erst danach** fange ich mit dem Bauen an.

---

## 1. Worum geht es? (in einem Satz)

Eine eigene, installierbare Chat-App (PWA) für die Agentur **Forever One**, damit
niemand mehr seine **private Handynummer** herausgeben muss. Login per
**Benutzername / Bigo-ID** statt Telefonnummer. Funktioniert auf **Android, iPhone
und Desktop** wie eine richtige App — mit **Push-Nachrichten** und **Tönen**.

> Wichtig: Wir kopieren WhatsApp **nicht**. Wir bauen ein eigenes, schlankes Werkzeug,
> das genau das kann, was Forever One braucht — und das die Privatsphäre schützt.

---

## 2. Die wichtigsten Funktionen (dein Wunschzettel, geordnet)

### A) Anmeldung & Datenschutz
- Login mit **Benutzername oder Bigo-ID** + Passwort. **Keine** private Handynummer nötig.
- **Registrierung mit Schutz gegen Bots / Massen-Anmeldungen:**
  - **IP-Sperre / Limit:** Von derselben Internet-Adresse sind nur wenige Anmeldungen
    pro Zeitraum erlaubt.
  - **Freischaltung durch Admin:** Neue Anmeldung landet zuerst als „wartend" und ein
    Admin schaltet die Person frei. So kommt garantiert kein Bot durch.
  - Optional zusätzlich: **Einladungs-Codes**, die Admins erzeugen (wer keinen Code hat,
    kommt nicht rein).

### B) Chat
- **Forever One Gruppe:** Der große Gruppen-Chat. **Hier dürfen alle schreiben.**
- **Einzel-Chats (1:1):** Aber **mit Regeln** (siehe Punkt C unten) — nicht jeder darf
  jeden anschreiben.
- **Bilder & Dokumente** verschicken (Fotos, PDFs usw.).

### C) Rechte-System (wer darf wem schreiben)
Das ist dir besonders wichtig. Geplant:
- In der **Forever One Gruppe** dürfen **alle** schreiben.
- Es gibt **Bereiche / Teams** (z. B. ein Admin betreut bestimmte Streamer). Innerhalb
  eines Bereichs darf einzeln geschrieben werden.
- Ein **neuer Streamer** darf **nicht** einfach jeden in der Gruppe einzeln anschreiben.
  Er/sie kann nur mit den **erlaubten** Personen (z. B. dem eigenen Admin / dem eigenen
  Team) einzeln schreiben.
- **Admins** sehen die Bereiche und können einzeln mit den Personen schreiben.
- Kurz: **strikte, einstellbare Regeln**, wer wen privat anschreiben darf.

### D) Die farbigen Tabs (Ankündigungen & Events)
Oben gibt es Tabs/Kanäle, farblich hinterlegt:
- 🔴 **Ankündigungen (rot)** — wichtige Mitteilungen.
- 🔵 **Events (blau)** — Termine/Aktionen zum Abstimmen.
- 🟠 **Sonstige Ankündigungen (orange)** — weniger dringende Infos.

**So funktioniert ein Event (blau):**
- Tab öffnen → unten Nachricht schreiben **oder** auf **„+"** drücken → **neues Event**
  erstellen → mit **Enter** abschicken.
- Andere können **abstimmen: „Nehme teil"** / **„Nehme nicht teil"**.
- Der Ersteller stellt ein, **wie lange die Abstimmung läuft** (Frist) — danach ist
  Schluss.
- Man sieht die **Teilnehmerliste** (wer ist dabei, wer nicht).

**Ankündigungen (rot / orange):**
- Tab öffnen → es öffnet sich die Liste → Admin kann eine Mitteilung reinschreiben.
- (Wer Ankündigungen schreiben darf, legen wir fest — i. d. R. nur Admins.)

### E) Moderation: Time-out / Stummschalten
- **Nur Admins** können einer Person ein **Time-out** geben (wenn sich jemand z. B.
  im Chat aufregt/streitet).
- Dauer einstellbar: **eine Minute, eine Stunde, bis zu mehreren Tagen.**
- Wer Time-out hat, **kann nicht mehr schreiben** (nur mitlesen), bis die Zeit abläuft —
  „damit man sich erst mal beruhigt".

### F) Benachrichtigungen
- **Push-Nachrichten** auf Android, iPhone und Desktop — auch wenn die App geschlossen
  ist. (Sehr wichtig für dich.)
- **Ton-Benachrichtigung**, kurz, und **einstellbar** (an/aus, welcher Ton) — pro Gerät.

### G) Bedienung
- **Mobil-freundlich**, einfach, „easy" — vom Gefühl her wie WhatsApp, aber eigenständig.
- **Installierbar** als App auf dem Home-Bildschirm (PWA).

---

## 3. Was ist eine „PWA" überhaupt? (kurz erklärt)

PWA = **Progressive Web App**. Das ist eine Webseite, die sich wie eine echte App
verhält:
- Man kann sie auf den **Home-Bildschirm** legen (eigenes Icon, Vollbild, kein Browser-Rahmen).
- Sie kann **Push-Benachrichtigungen** schicken.
- Sie funktioniert auf **Android, iPhone und Desktop** mit **einem** Code — wir müssen
  also **nicht** drei getrennte Apps bauen.
- Kein App-Store nötig (spart Gebühren, Wartezeit und Apple/Google-Regeln) —
  Installation direkt über `forever-one.tv`.

> Hinweis iPhone: Apple erlaubt Web-Push für PWAs erst, wenn die App **zum
> Home-Bildschirm hinzugefügt** wurde (ab iOS 16.4). Das bauen wir mit einer kleinen
> Anleitung in der App ein.

---

## 4. Technischer Aufbau (Überblick)

Da du einen **eigenen Node.js-Server** hast, sieht der Aufbau so aus:

```
   [ Handy / PC ]                 [ Dein Server (forever-one.tv) ]
   ┌──────────────┐    HTTPS      ┌───────────────────────────────┐
   │  PWA (App)   │ ◄──────────►  │  Node.js  (Express)           │
   │  im Browser  │   WebSocket   │  - Login / Rechte             │
   │  /Home-Screen│ ◄──────────►  │  - Chat in Echtzeit           │
   └──────────────┘               │  - Events / Abstimmungen      │
        ▲                         │  - Datei-Upload               │
        │  Push                   │  - Push-Versand               │
        │                         │                               │
   [Apple/Google                  │  Datenbank (SQLite/Postgres)  │
    Push-Dienst] ◄────────────────┤  Dateien (Uploads-Ordner)     │
                                  └───────────────────────────────┘
```

### Bausteine (Technologie-Wahl)
| Bereich | Wahl | Warum |
|---|---|---|
| Server | **Node.js + Express** | Du hast Node-Hosting; ideal für Echtzeit. |
| Echtzeit-Chat | **Socket.IO (WebSocket)** | Nachrichten kommen sofort an, automatischer Reconnect. |
| Datenbank | **SQLite** zum Start, später **PostgreSQL** | SQLite = keine extra Installation, perfekt für Start. Umstieg auf Postgres jederzeit möglich, wenn es größer wird. |
| Login/Sicherheit | **bcrypt** (Passwörter) + **JWT/Session-Cookie** | Standard, sicher. |
| Push | **web-push** + **VAPID-Schlüssel** | Offizieller Weg für Web-Push. |
| Datei-Upload | **Multer** + **sharp** (Bild-Vorschau) | Robust, erzeugt Vorschaubilder. |
| Frontend (App) | **Schlankes JavaScript-PWA** (ohne schweres Framework) | Einfach zu warten, schnell, leicht. |
| Betrieb | **Nginx** + **Let's Encrypt (HTTPS)** + **PM2/systemd** | HTTPS ist Pflicht für PWA & Push. |

> Falls du lieber von Anfang an PostgreSQL willst (z. B. weil schon einer läuft):
> kein Problem, sag Bescheid — der Code wird so geschrieben, dass beides geht.

---

## 5. Rollen & Rechte (das Herzstück)

| Rolle | Darf … |
|---|---|
| **Inhaber / Super-Admin** (du) | Alles. Admins ernennen, Grundeinstellungen, alle Bereiche. |
| **Admin** | Mitglieder freischalten, Time-outs vergeben, Ankündigungen & Events erstellen, in allen erlaubten Bereichen einzeln schreiben, sein Team verwalten. |
| **Streamer / Mitglied** | In der Forever One Gruppe schreiben, in erlaubten Bereichen einzeln schreiben, bei Events abstimmen, Ankündigungen lesen. |
| **Wartend (pending)** | Noch nichts — wartet auf Freischaltung durch Admin. |
| **Gesperrt / Time-out** | Nur lesen, nicht schreiben (zeitlich begrenzt oder dauerhaft). |

**Regel-Beispiele für Einzel-Chats:**
- Admin ↔ Mitglied: **immer erlaubt.**
- Mitglied ↔ Mitglied: **nur, wenn erlaubt** (z. B. gleiches Team / vom Admin freigegeben).
- Neuer Streamer → wahllos jeden anschreiben: **gesperrt.**

---

## 6. Datenmodell (welche Daten wir speichern)

Vereinfacht, die wichtigsten „Tabellen":

- **users** — Benutzer (Benutzername, Bigo-ID, Passwort verschlüsselt, Anzeigename,
  Avatar, Rolle, Status, zuletzt-online).
- **teams** — Bereiche/Teams.
- **team_members** — wer ist in welchem Team (mit Rolle im Team).
- **channels** — Kanäle/Tabs (Typ: Gruppe / Ankündigung-rot / Event-blau /
  Sonstiges-orange; wer darf posten).
- **messages** — Nachrichten (Text/Bild/Datei/System, Absender, Zeit).
- **attachments** — Datei-Anhänge (Bild, PDF …, mit Vorschau).
- **direct_threads** — Einzel-Chat-Verläufe zwischen zwei Personen.
- **events** — Events (Titel, Beschreibung, Termin, Abstimmungs-Frist).
- **event_votes** — Stimmen (wer nimmt teil / nicht teil).
- **mutes** — Time-outs (wer, von wem, Grund, bis wann).
- **push_subscriptions** — Push-Anmeldungen pro Gerät.
- **user_settings** — Einstellungen (Ton an/aus, welcher Ton, Benachrichtigungen).
- **invites** — Einladungs-Codes (optional).
- **audit_log** — Protokoll wichtiger Aktionen (für Nachvollziehbarkeit/Sicherheit).

---

## 7. Sicherheit & Missbrauchsschutz

- **HTTPS** überall (Pflicht für PWA & Push).
- **Passwörter** nur verschlüsselt gespeichert (bcrypt) — nie im Klartext.
- **IP-Limit** bei Registrierung + Login (gegen Massen-Anmeldung / Brute-Force).
- **Admin-Freischaltung** neuer Konten (kein Bot kommt durch).
- **Datei-Uploads** werden geprüft (Typ & Größe), Bilder bekommen Vorschau.
- **Schutz vor Code-Einschleusung** (XSS) in Nachrichten.
- **Protokoll** wichtiger Admin-Aktionen (wer hat wen freigeschaltet / Time-out gegeben).

---

## 8. Bauplan in Etappen (Roadmap)

Damit du jederzeit etwas Lauffähiges siehst, baue ich in Etappen. Nach jeder Etappe
kannst du es ausprobieren und Feedback geben.

| Etappe | Inhalt | Ergebnis |
|---|---|---|
| **0. Fundament** | Projekt-Setup, PWA-Grundgerüst (installierbar, Icon, Vollbild), Server-Grundgerüst | App lässt sich öffnen & installieren |
| **1. Anmeldung** | Registrierung (mit IP-Limit + Admin-Freischaltung), Login, Rollen | Konten anlegen & einloggen |
| **2. Chat-Kern** | Forever One Gruppe (Echtzeit) + Einzel-Chat mit Rechte-System | Schreiben & sofort empfangen |
| **3. Dateien** | Bilder & Dokumente senden (mit Vorschau) | Fotos/PDFs verschicken |
| **4. Ankündigungen** | Kanäle 🔴 rot & 🟠 orange | Mitteilungen posten/lesen |
| **5. Events** | 🔵 blau: Event mit „+" erstellen, abstimmen, Frist, Teilnehmerliste | Abstimmungen durchführen |
| **6. Benachrichtigungen** | Push (Android/iOS/Desktop) + einstellbare Töne | Hinweise auch bei geschlossener App |
| **7. Moderation** | Time-out/Stummschalten, **Wort-/Beleidigungsfilter**, **Mitglied entfernen + IP-Sperre**, Admin-Bereich | Admins moderieren |
| **8. Extras** | **Markierte Nachrichten**, **Sprachnachricht „einmal abspielbar"** | Komfort-Funktionen |
| **9. Feinschliff** | Sicherheit, Design, Deployment-Anleitung | Bereit für echten Betrieb |

---

## 9. Offene Fragen an dich (für den Feinschliff)

Diese kannst du **jetzt oder später** beantworten — sie blockieren den Start nicht:

1. **Name/Logo:** Soll die App „Forever One" heißen? Hast du ein Logo/Farben (CIor.)?
2. **Domain:** Läuft sie auf `forever-one.tv` direkt oder z. B. `chat.forever-one.tv`?
3. **Sprache:** Oberfläche nur **Deutsch**, oder auch Englisch? (Bigo ist international.)
4. **Wer darf Ankündigungen/Events erstellen** — nur Admins, oder bestimmte Mitglieder?
5. **Einzel-Chat-Regel im Detail:** Sollen Mitglieder im **gleichen Team** sich
   gegenseitig schreiben dürfen, oder wirklich **nur** mit dem Admin?
6. **Einladungs-Codes** zusätzlich zur Admin-Freischaltung — ja/nein?
7. **Daten/Server:** Hast du schon einen Server, oder soll ich auch eine Empfehlung
   (z. B. Hetzner) + Einrichtungsanleitung mitliefern?

---

## 10. Ergänzungen (zweite Wunsch-Runde)

Diese Punkte sind nach dem ersten Entwurf dazugekommen und fest eingeplant:

### 10.1 Mitglied entfernen + komplette Sperre (IP-Sperre)
- Ein Admin kann sagen: **„Du bist kein Mitglied der Agentur mehr."** → Konto wird
  **vom Server gelöscht/deaktiviert** und die Person ist **komplett ausgesperrt**.
- Zusätzlich **IP-Sperre**: Die Person kann die Seite dann **gar nicht mehr aufrufen**
  (nicht nur „nicht einloggen", sondern die Seite lädt erst gar nicht).
- Wird in einer **Sperrliste** auf dem Server hinterlegt.
- Hinweis ehrlich gesagt: Eine IP-Sperre hält **technisch versierte** Leute nicht 100 %
  ab (man kann die IP wechseln / VPN). Für den normalen Fall „ehemaliges Mitglied soll
  weg" funktioniert sie aber sehr gut. Wir kombinieren sie deshalb mit Konto-Löschung
  und (optional) Geräte-Sperre für **höchstmögliche** Sicherheit.

### 10.2 Login-/Startseite (Landing Page)
- Kurze, klare Startseite **„Nur für Forever One Mitglieder"**.
- **Großes Forever-One-Logo mittig**, darunter ein großer **Einloggen**-Button.
- Klick auf den Button → Login-Felder (Benutzername/Bigo-ID + Passwort) erscheinen.
- Schlicht, hochwertig, auf **höchste Sicherheit** ausgelegt.

### 10.3 Wort-/Beleidigungsfilter
- Eingebauter **Wortfilter**: Beleidigungen/verbotene Wörter werden blockiert oder
  zensiert (`****`).
- Wortliste ist **anpassbar** durch Admins (Wörter hinzufügen/entfernen).
- **Anti-Spam:** automatisches Erkennen von Spam (zu schnell, zu oft, gleiche
  Nachricht mehrfach) → Hinweis / automatischer kurzer Time-out.

> ❓ **Rückfrage „Fridolin":** Du hast „Fridolin kümmert sich um die Spams" gesagt.
> Meinst du damit **a)** einen automatischen Helfer/Bot (den wir „Fridolin" nennen),
> der Spam & verbotene Wörter überwacht — **oder b)** eine echte Person/Admin namens
> Fridolin? Sag kurz Bescheid, dann baue ich es passend.

### 10.4 Markierte / fixierte Nachrichten
- Man kann eine Nachricht **markieren/fixieren** (wie „mit Stern versehen").
- Diese sind später jederzeit abrufbar unter **Profil → Einstellungen → Markierte
  Nachrichten** und werden **automatisch gespeichert**.

### 10.5 Nur PWA zuerst (Apps später)
- **Erst die PWA** für **iOS und Android** (und Desktop) — das ist jetzt das Wichtigste.
- Echte Store-Apps (Apple/Google) kommen **später**, wenn die PWA steht.

### 10.6 Echtzeit
- Alles aktualisiert **sofort / live** (neue Nachrichten, Abstimmungen, Time-outs) —
  kein Neuladen nötig.

### 10.7 Sprachnachricht „einmal abspielbar"
- Wie bei WhatsApp „einmal ansehen": Eine **Sprachnachricht**, die der Empfänger
  **nur einmal** abspielen kann; danach ist sie für ihn verbraucht.
- **Für Admins (uns) bleibt sie immer einsehbar** — sie wird auf dem Server
  **hinterlegt/protokolliert**, sobald jemand sie als „einmal abspielbar" sendet.
- Solche Nachrichten bekommen eine **orange Markierung** zur Kennzeichnung.

### 10.8 Gelöschte Person → Nachrichten
- Wird eine Person gelöscht, werden **ihre Nachrichten für normale Mitglieder
  entfernt** (verschwinden automatisch).
- **Admins können sie aber weiterhin sehen** (im Gruppen-Verlauf), für
  Nachvollziehbarkeit/Moderation.

---

## 11. Was du als Nächstes tust

➡️ **Lies das Konzept durch und sag mir:**
- Passt die Richtung so? 👍
- Was möchtest du anders/zusätzlich?
- Mit welcher Etappe sollen wir starten (Vorschlag: **Etappe 0 + 1** zusammen)?

Sobald du „los geht's" sagst, beginne ich mit dem Bauen — Schritt für Schritt, und
committe nach jeder Etappe, damit du den Fortschritt sehen kannst.
