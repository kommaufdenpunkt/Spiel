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

## Wer ist das? Zahl und Name

Ein Streamer hat **zwei** Kennungen, und die Leute verwechseln sie ständig:
die **BIGO-ID** (eine Zahl, `901234567`) und den **Namen** (`Tauchküken`).
Früher hing der Ordner an genau einem Feld – wer den Namen eintippte, während der
Ordner unter der Zahl lag, bekam einen zweiten Ordner. Dieselbe Person, zweimal
geführt, und die Audition landete im leeren neuen Ordner.

Jetzt hat jeder Ordner **beides** plus frühere Namen, und gesucht wird über alle
Wege gleichzeitig. Als dieselbe Person erkannt werden:

| Eingetippt | erkannt, weil |
|---|---|
| `Tauchküken` · `tauchkueken` · `TAUCHKÜKEN` | ü → ue, klein/groß egal |
| `Tauch Küken` · `Tauchküken_` | Leer- und Sonderzeichen zählen nicht |
| `eyTauchküken` | das Agentur-Kürzel **ey** davor bedeutet dasselbe |
| `901 234 567` · `901234567` | bei Zahlen zählen nur die Ziffern |

Was fehlt, wird beim Treffer **nachgetragen**: wer unter „Tauchküken" geführt
wurde und seine Zahl mitbringt, hat danach beides im Ordner. Ein alter Name wird
nicht gelöscht, sondern als **früherer Name** behalten – Leute benennen sich auf
BIGO um, und dann muss man sie unter dem alten Namen weiter finden. Jede
Zuordnung steht als Vermerk in der Akte.

Der ungekürzte Name bleibt trotzdem eine eigene Kennung: sonst würde aus einer
echten „Eyleen" eine „leen". Beide Wege gelten, keiner ersetzt den anderen.

## Das Geburtsdatum – und warum die Akte davon lebt

Der Beispielausweis erklärte es von Anfang an („3 · Geburtstag"), aber es gab
**kein Feld dafür**. Damit blieb die Akte hinterher unvollständig, und „18+" war
eine Behauptung statt einer Angabe, die man nachrechnen kann.

Jetzt trägt die Bewerberin es im Warteraum ein, direkt unter dem Namen:

- **Beim Tippen wird mitgerechnet.** Neben dem Feld steht „24 Jahre", grün ab 18,
  rot darunter. Unmögliche Daten (31.02.) werden erkannt. Angenommen wird
  `03.07.1999`, `3.7.1999`, `1999-07-03` und `07/03/1999` – abgewiesen nur, was
  wirklich kein Datum ist.
- **Der Prüfer bekommt es übertragen** und sieht darunter: „✓ 24 Jahre –
  volljährig". Weicht es um mehr als ein Jahr von dem ab, was sie selbst
  angegeben hat, steht dort „Ausweis sagt 24, angegeben war 27 – bitte
  nachsehen." Genau so fällt ein falsch abgetippter Ausweis auf.
- **Es wandert in die Akte:** an die Audition, in die Stammdaten, auf das
  Ausweisblatt (PDF) und in die vorausgefüllte Altersverifikation.

## Vor der Freigabe: was landet gleich in der Akte?

Über dem Freigabe-Knopf steht, was die Akte nachher enthält – **vorher**, nicht
hinterher. Fehlt etwas, steht da:

> ⚠️ Die Akte bliebe unvollständig – 2 von 7 fehlt
> Freigeben kannst du trotzdem. Nur: was jetzt fehlt, fehlt nachher auch.

Geprüft werden BIGO-ID, Name, Geburtsdatum, Ausweisart, Nummer, mindestens zwei
Ausweisbilder und die Aufnahme. Es hält niemanden auf – man weiss es nur
vorher, statt es Wochen später in einer halben Akte zu entdecken.

Und sobald die Akte gespeichert ist, wandelt der Server die Aufnahme **im
Hintergrund** in MP4 und in die kleine Fassung. Wer die Akte später öffnet,
findet beides fertig vor, statt beim Herunterladen zu warten.

## Der Ablauf: erst fertig, dann abholen

Die Bewerberin bestimmt, wann es losgeht:

1. **Zugangsnummer** – wird sofort geprüft, nicht erst im Warteraum.
2. **Aufklärung** – kleine Kästen zum Aufklappen: Was ist BIGO Live? Was sind
   Bohnen und was passiert damit? Was musst du tun? Was macht die Agentur? Und
   was passiert mit deinen Ausweisdaten?
3. **Eintragen** – Ausweisdaten und Selfie mit Ausweis. Dazu ein gezeichneter
   **Beispielausweis**, der zeigt, welches Feld wo steht – die meisten suchen bei
   „Ausweisnummer" die falsche Zahl.
4. **„Ich bin fertig – ihr könnt mich holen"** – der Knopf geht erst auf, wenn
   die drei Schritte erledigt sind.

**Erst danach** kann der Prüfer abholen. Vorher steht in der Schlange
„✍ füllt noch aus" und der Knopf ist gesperrt – auch serverseitig, nicht bloß
ausgegraut. „Nächsten annehmen" überspringt sie. Nach drei Minuten erscheint
zusätzlich „⚠ Trotzdem holen", damit niemand festhängt, der nicht weiterkommt;
dieser Griff wird protokolliert.

## Abgebrochene Auditions – die Aufnahme geht nicht verloren

Bricht ein Gespräch ab – Leitung weg, Browser zu, niemand klickt auf
„Freigeben" –, dann **liegt die Aufnahme lose da** und gehört zu keiner Akte.
Das Gespräch hat stattgefunden, das Video ist da, aber die Akte weiss nichts
davon.

Im Unterordner **🎬 Auditions** einer geöffneten Akte stehen deshalb oben die
**„Aufnahmen ohne Akte"** mit Nummer, Datum, Länge und Größe. Ein Tippen auf
**„📥 In diese Akte"** sortiert sie ein – als Audition mit dem Ergebnis
**offen**, gekennzeichnet als nachträglich zugeordnet, und mit einem Vermerk, wer
es getan hat. Der Grund für die Akteneinsicht wurde ja beim Öffnen schon genannt.

## Herunterladen und weitergeben

- **⬇ Video herunterladen** – neben jeder Aufnahme. Die Datei heisst
  `Audition-<Nummer>-<Datum>.mp4`, nicht „recording": damit kann jemand etwas
  anfangen, der sie weitergeben soll. Jeder Abruf steht im Protokoll.
- **📱 Aufs Handy speichern** – der Weg für iPhone und Android. **Zwei Tipper,
  und das mit Absicht:** der erste holt das Video (und wandelt es um, falls
  nötig), der zweite öffnet den Teilen-Dialog des Systems – Fotos, Dateien,
  WhatsApp, Mail. Safari erlaubt das Teilen nur direkt aus einem Fingertipp
  heraus; würde man erst laden und dann teilen, lehnt das iPhone ab.
  Kann das Gerät keine Dateien teilen (Rechner), wird schlicht heruntergeladen.
- **📄 Ausweisblatt (PDF)** – im Unterordner *Ausweise*, je Audition eines.

Beides enthält Ausweisdaten und Gesichter. Es gehört zum BIGO-Support und
nirgendwo anders hin.

### Das Format: MP4, damit die Datei etwas wert ist

Browser nehmen unterschiedlich auf. Chrome am Rechner liefert meist **WEBM** –
das kann ein iPhone nicht in „Fotos" legen, WhatsApp schickt es nicht weiter,
und der BIGO-Support kann damit nichts anfangen. Die Aufnahme wäre da, aber
nicht verwendbar.

Deshalb wandelt der Server um: **H.264 High / yuv420p / AAC-LC in MP4** mit
`+faststart`. Das nimmt jedes Upload-Portal an, jedes Handy spielt es, und es
startet ohne die ganze Datei zu laden.

**Drei Fassungen, drei Zwecke** – überall zum Herunterladen, in `mcp.` in der
Akte und im acp bei den Aufnahmen wie in der Fall-Akte:

| Fassung | Wofür | Grösse (gemessen) |
|---|---|---|
| **MP4** | hochladen, im Management einreichen, auf dem iPhone ansehen | 3 Min ≈ 20 MB |
| **MP4 klein** | WhatsApp – dort ist bei **16 MB** Schluss | 3 / 10 / 20 Min → 13,8 / 14,1 / 14,5 MB |
| **Original** | unverändert, wie der Browser aufgenommen hat | wie aufgenommen |

Die kleine Fassung wird aus **Dauer und Grenze zurückgerechnet**: Bitrate so,
dass die Datei unter 16 MB landet. Wird es knapp, gibt zuerst der Ton nach
(64 → 48 → 32 kbit) und dann die Bildbreite (854 → 640 → 480) – ein kleineres
Bild bei gleicher Bitrate ist schärfer als ein grosses, das verschmiert. Bei
x264 mit *capped CRF* (`-crf 30 -maxrate`), damit eine **kurze** Aufnahme nicht
grösser wird als die normale Fassung; mit fester Bitrate passierte genau das,
und dann wäre „klein" eine Lüge. Reicht es trotzdem nicht (halbe Stunde und
mehr), steht die echte Grösse am Knopf und ein Hinweis, dass WhatsApp sie nur
noch als Datei nimmt.

- Prüfen, ob der Server es kann: `netzcheck.sh`, Punkt 6.
- **Alte Aufnahmen nachziehen:** acp → 🎬 Aufnahmen → `🔄 Jetzt alle umwandeln`.
  Läuft im Hintergrund, eine nach der anderen, mit Fortschritt („17 von 42");
  die Seite kann man dabei zumachen. Sonst wird jede Datei erst beim ersten
  Herunterladen gerechnet – also genau dann, wenn man sie braucht.
- **Der Server bleibt dabei bedienbar.** ffmpeg läuft asynchron in einem eigenen
  Prozess, immer nur einer. Mit `spawnSync` stand Node still, solange gerechnet
  wurde: bei einer Viertelstunde Gespräch ein bis zwei Minuten, in denen niemand
  ins mcp kommt und laufende Gespräche ihre Verbindung verlieren.

Im Einzelnen:

- **Einmal** je Aufnahme. Danach liegt das MP4 verschlüsselt neben dem Original
  und wird von dort ausgeliefert – der zweite Abruf kommt in Millisekunden.
- Das Original bleibt unangetastet. Gelöscht wird dabei nichts.
- Fehlt `ffmpeg` **oder H.264**, kommt das Original – lieber die Datei im
  falschen Format als gar keine. Der Browser sagt dann, was das bedeutet
  (`X-Umwandlung`), und beim Start steht es im Log:
  `[rec] MP4-Umwandlung bereit (Bild: libx264, Ton: aac).`
  Welcher Encoder da ist, wird einmal nachgesehen statt vorausgesetzt –
  `libx264` bevorzugt, `libopenh264` als Ersatz.
- Der **Videoplayer in der Akte** hat zwei Quellen: zuerst das Original (kein
  Umwandeln nötig), und wenn der Browser das nicht kann – ein iPhone spielt kein
  WEBM – nimmt er von selbst die MP4-Fassung. `preload="none"`: erst beim
  Antippen, sonst würde jedes Öffnen der Akte eine Umwandlung auslösen.

## Die Akte in Unterordnern

Eine Akte mit allem untereinander liest niemand. Also sechs Unterordner mit Zahl
daran, die man einzeln aufklappt:

- **📋 Stammdaten** – was dauerhaft zur Person gehört: Name laut Ausweis,
  Geburtsdatum, Ausweisart und -nummer, Anschrift, Erreichbarkeit. Die Zahl am
  Ordner zeigt `3/4`: wie viele der vier wichtigen Felder gefüllt sind.
  **Füllt sich von selbst** aus jeder Audition und jeder Verifikation – aber nur
  die leeren Felder, was gepflegt wurde bleibt stehen. Jede Änderung steht mit
  altem und neuem Wert in den Vermerken. `Aa Schreibweise richten` macht aus
  „tabea tauch" ein „Tabea Tauch" und aus der Ausweisnummer Grossbuchstaben.
- **🪪 Ausweise & Dokumente** – die Bilder und je Audition ein **Ausweisblatt als
  PDF**: Deckblatt mit allen Angaben, danach jede Aufnahme in Originalgröße.
  Gebaut ohne fremde Bibliothek (`pdf.js`), JPEG wandert unverändert hinein.
- **✓ Altersverifikation** – der Verlauf. Das Formular ist **vorausgefüllt** aus
  Stammdaten und der jüngsten Audition, inklusive „woran hast du geprüft".
  Oben steht, woher die Angaben stammen. Zu tun bleibt: mit dem Ausweisbild
  vergleichen, Erklärung anhaken, bestätigen. Die Erklärung bleibt bewusst ein
  eigener Handgriff – sie ist der Kern der Prüfung, nicht Beiwerk.
- **🎬 Auditions** – Gespräche, Aufnahmen, abgehakte Fragen, Wortlaut
- **📝 Vermerke**
- **🔒 Akteneinsicht** – wer wann mit welchem Grund

Der Kopf zeigt ohne Aufklappen: Kennung, Name auf BIGO, frühere Namen, Status
und den blauen Haken. Das ist die Frage, die man als erste hat.

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

### Und wenn doch zwei Akten dastehen

Es sagt sich von selbst: sobald eine Kennung dazukommt, die schon einem anderen
Ordner gehört, steht in **beiden** Akten ein Vermerk („dieselbe Person liegt noch
unter … in einer zweiten Akte") und im Log eine `[akte]`-Zeile. Vorher fiel das
erst auf, wenn jemand im acp nachsah – und bis dahin hatte man in beiden Akten
gearbeitet.

Passiert, wenn eine Akte erst nur unter der Nummer lag und der Spitzname später
nachgetragen wurde – unter dem gab es dann schon eine. Im **acp → 📁
Streamer-Akten** steht das oben:

> ⚠ Dieselbe Person liegt 2-mal in den Akten

Vorgeschlagen zum Behalten wird die Akte mit der Arbeit darin (Auditionen zählen
am meisten). **Zusammenführen wirft nichts weg:** Auditionen, Verifikationen,
Vermerke, Einsichten und Aufnahmen wandern in die eine Akte, der frühere Name
bleibt als Alias erhalten – die Person wird also weiter unter beiden Kennungen
gefunden. Der blaue Haken bleibt, wenn eine der beiden ihn hatte. Erst danach
verschwindet die leere Hülle, und das steht als Vermerk in der Akte.

Löschen gibt es weiterhin auch – aber bei einer Doppelung ist Zusammenführen der
richtige Weg, denn dabei geht nichts verloren.

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

## Die Aufnahme liegt schon während des Gesprächs auf dem Server

Der Prüfer-Browser zeichnet beide Seiten in **ein** Bild (Bewerber links, Prüfer
rechts, beide Tonspuren gemischt) – ein Raum, eine Datei. Neu ist, wohin sie
geht: **jedes Stück wandert sofort zum Server**, einzeln verschlüsselt.

Vorher sammelte der Browser alles im Speicher und schickte es erst beim
Stoppen. Stürzte er ab, war die komplette Audition weg – rückstandslos. Jetzt:

- Beim Start entsteht ein Lauf (`/api/rec/start`), danach geht sekündlich ein
  Stück hoch (`/api/rec/chunk`), beim Stoppen wird zusammengesetzt
  (`/api/rec/finish`). Der Prüfer sieht „↑ läuft auf dem Server mit".
- **Bricht der Prüfer weg**, bleibt der Lauf liegen. Beim nächsten Start des
  Dienstes wird er zu einer Aufnahme zusammengesetzt und als **abgebrochen**
  gekennzeichnet – damit niemand sie für vollständig hält. Fehlen Stücke, steht
  `unvollständig` dran.
- Der alte Weg am Stück (`POST /api/recording`) bleibt als **Rückfalltür**:
  schafft der Browser das Mitlaufen nicht, geht es am Ende noch einmal komplett.
  Lieber doppelt als gar nicht.
- `GET /api/rec/offen` (nur Admin) zeigt, was gerade offen hängt.

**Der Vorlese-Text steht mit im Video.** Der Bewerber schickt den Satz, den er
gerade vor sich hat; der Prüfer sieht ihn als „Liest gerade" und brennt ihn
unten in die Aufnahme ein. Damit zeigt die Aufnahme nicht nur, *dass* jemand
geredet hat, sondern *was er in dem Moment vor sich hatte* – der Unterschied
zwischen einem Video und einem Nachweis der Einwilligung.

## Der Vorlese-Text: geschrieben, wie man spricht

Wer ablesen und dabei in die Kamera schauen soll, braucht grosse Schrift und
kurze Sätze. Also:

### Satz für Satz statt scrollender Block

Der laufende Textblock war das falsche Werkzeug. Wer **in die Kamera** sprechen
soll, schaut zwischendurch hoch – und findet die Stelle nicht wieder, weil der
Text inzwischen weitergelaufen ist. Also die Karten-Darstellung, und die ist
jetzt der Normalfall:

- **Ein Satz, gross, in der Mitte.** Der nächste klein und blass darunter, damit
  man weiss, was kommt, ohne den aktuellen aus den Augen zu verlieren.
- **Weiter geht es, wenn sie weiter ist** – Knopf, Tippen auf den Satz, oder
  Leertaste/Pfeiltaste. Kein Regler bestimmt das Tempo.
- **Oben „4 / 18" und ein Balken.** Wer weiss, dass noch vier Sätze kommen,
  liest ruhiger.
- Der Text ist ohnehin so geschrieben – ein Satz pro Zeile, leere Zeilen sind
  Pausen –, die Karten fallen also von selbst richtig.
- Der Satz, der gerade dransteht, wird **ins Video gebrannt** und dem Prüfer als
  „Liest gerade" gezeigt. Im Kartenmodus ist das exakt, statt aus der Scrollhöhe
  geschätzt.
- **`📜 Als Fließtext`** schaltet auf die alte Darstellung mit Selbstlauf und
  Tempo-Regler. Die Wahl bleibt gemerkt.

- **Standardgrösse 1,9 rem** (rund 30 px am Telefon), einstellbar über `A−` /
  `A+` bis 3,4 rem. Die Einstellung bleibt für das nächste Mal gemerkt.
- **`⛶ Groß`** legt den Text über den ganzen Bildschirm und vergrössert ihn noch
  einmal um ein Drittel (rund 48 px). Das ist der eigentliche Weg zum Ablesen:
  im kleinen Kasten stehen bei grosser Schrift nur drei Zeilen, und wer
  zwischendurch in die Kamera schaut, verliert die Stelle. Das eigene Bild
  braucht man dabei nicht. Die Bedienung wandert mit nach unten, Escape oder
  `✕ Kleiner` führt zurück, der Selbstlauf läuft dort genauso.
- **Ein Satz pro Zeile**, jeder in einem Atemzug sprechbar. Leere Zeilen sind
  Pausen.
- **Abkürzungen ausgeschrieben.** Wer „bzw." oder „V-System" vor sich hat,
  stolpert oder liest es falsch vor – im Text steht „Vau-System", und „4EVER1"
  steht als „Forever One" da, so heisst es gesprochen. Der geschriebene Name
  gehört in die Akte und in den Vertrag, nicht in den Vorlese-Text.
- Im Video wird die Zeile mit 27 px eingebrannt statt mit 20 – die Aufnahme wird
  weitergegeben und dort auf einem Telefon gelesen, nicht am grossen Bildschirm.

## Wer einlädt, führt durch

Dennis und Lisa sollen Auditionen allein durchführen können, ohne auf jemanden
zu warten. Der Zugangscode merkt sich, **wer ihn erzeugt hat**:

- Beim Erzeugen gibt es **„📤 Einladung verschicken"** – Systemdialog mit
  fertigem Text und Link (WhatsApp, Signal, Mail), am Rechner in die Ablage.
- In der Warteschlange steht bei eigenen Terminen **„✉ von dir eingeladen"**,
  bei fremden **„✉ Einladung von Lisa"**.
- **„Nächsten annehmen"** nimmt nur eigene Einladungen und solche ohne Absender.
  Wartet nur ein fremder Termin, sagt es das statt ihn wegzuschnappen.
- Übernehmen kann man ihn trotzdem – der Knopf heisst dann „📞 Für Lisa
  übernehmen", fragt einmal nach und schreibt es ins Protokoll. Einspringen soll
  möglich sein, nur nicht aus Versehen.
- Die Aufnahme darf **jeder Prüfer** sehen und speichern, dem die Akte offensteht
  – nicht nur der, der das Gespräch geführt hat. Sonst blieb in ihrer Akte ein
  schwarzes Videofeld, obwohl alles andere daraus gezeigt wurde. Der Abruf steht
  in der Akte (einmal je Stunde, sonst würde Spulen das Protokoll zumüllen).

## Der blaue Haken (Altersverifikation ohne Audition)

Wer längst dabei ist, muss kein Gespräch nachholen. Der Prüfer öffnet die
Akte, tippt auf **„🪪 Jetzt verifizieren"** und trägt ein, was er gesehen hat:
Name laut Ausweis, Ausweisart, Nummer, Geburtsdatum – dazu die **Grundlage**
(im Videogespräch gesehen · Original vor Ort · aus der Audition-Akte
übernommen · Ausweisbild in der Akte geprüft) und eine Erklärung, die er
abhaken muss:

> Ich habe den Ausweis gesehen, das Gesicht stimmt überein und das
> Geburtsdatum belegt mindestens 18 Jahre.

**Vorausgefüllt ist alles, was schon in der Akte steht** – Name, Geburtsdatum,
Ausweisart und -nummer aus den Stammdaten und der jüngsten Audition, dazu die
passende Grundlage. Oben steht, woher es kommt („✅ Schon ausgefüllt aus:
Audition vom …"). Es abzutippen wäre nicht nur Arbeit, sondern eine zweite
Fehlerquelle. Zu tun bleibt: mit dem Ausweisbild darüber vergleichen, anhaken,
bestätigen.

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

**📁 Streamer-Akten** ist der Bereich, in dem die Akte aufgebaut wird:

- oben die **doppelten Akten** mit einem Knopf zum Zusammenführen
- darunter jede Akte mit Kennung, Ausweisdaten, Zahl der Auditionen und
  Verifikationen, früheren Namen und dem blauen Haken
- die **Stammdaten direkt zum Bearbeiten**, dazu `🪪 Aus der Akte übernehmen`
  (holt, was Auditionen und Verifikationen schon hergeben) und `🗑 Akte löschen`
- fehlt etwas, steht es als Satz dabei: „Es fehlen noch: Geburtsdatum."
- Suche über BIGO-ID, Name, frühere Namen und Ausweisnummer

**📖 Audition-Texte** hat jetzt `↺ Unseren Vorschlag einsetzen`: setzt den Text
in das Feld, gespeichert wird erst mit dem Knopf daneben – versehentlich
überschreiben kann man also nichts.

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
- **Der einzige Weg in eine Akte** ist `POST /api/streamer-oeffnen` mit
  genanntem Grund. Es gibt keine zweite Tür: `GET /api/streamer` antwortet 410.
  Auch eine Altersverifikation schreibt sich ins Einsichtsprotokoll der Akte –
  sonst wäre sie ein stiller Weg an der Grundangabe vorbei.
- **Alles ab `/api/change-password`** liegt hinter einer gemeinsamen Sperre im
  Server (`ab hier: gültiges Login nötig`). Ohne gültiges Login kommt von dort
  nichts heraus – auch kein 410 und keine Fehlermeldung, die etwas verrät.
  Wer die Wirkung einer einzelnen Route prüft, muss sich also anmelden;
  ein nackter `curl` bekommt überall 401 und beweist damit nichts.
- **Kein Durchprobieren:** `/api/person-suche` prüft die Anmeldung zusätzlich
  selbst. Die Antwort nennt Name, Alter und Status – die Stelle ist es wert,
  nicht allein auf die Sperre weiter oben zu vertrauen.
- **Aufbewahrung:** automatische Löschung nach `RETENTION_DAYS` (Vorgabe 90).

## Betrieb

Läuft als Container hinter einem Reverse-Proxy. Die Einstellungen kommen aus
Umgebungsvariablen, siehe `.env.example`. Pflicht sind `STORAGE_KEY` und
`ADMIN_PASSWORD`; für stabiles Video in Mobilfunknetzen `TURN_HOST` und
`TURN_SECRET`.

**Neue Fassung einspielen** (auf einem Server mit Docker und nginx):

```bash
ssh <server> '/opt/4ever1-ident/src/ident/deploy.sh'                 # Zweig main
ssh <server> '/opt/4ever1-ident/src/ident/deploy.sh claude/mein-zweig'
```

Der ganze Pfad heisst `4ever1-ident` (mit Bindestrich), nicht `4ever1/ident`.
`ZWEIG=<zweig> …` geht weiterhin, der Zweig hinten dran ist nur bequemer.

Das Skript holt den Quellcode, baut das Abbild, tauscht den Container und
prüft, ob er antwortet – sonst stellt es die vorige Fassung wieder her. Daten
und Zugangsdaten liegen ausserhalb des Containers und bleiben unberührt.

Im Abbild steckt **`ffmpeg`** (für MP4, siehe oben). Der erste Bau danach dauert
etwas länger und das Abbild wächst um rund 30 MB – dafür ist jede Aufnahme
weitergabefähig. Fehlt `ffmpeg`, läuft alles weiter, nur bleibt die Datei im
Originalformat; im Log steht dann eine Zeile `[rec] ffmpeg ist nicht installiert`.

**Was im Log über Aufnahmen steht** (`docker logs 4ever1-ident | grep '\[rec\]'`):

```
[rec] begonnen <sitzung> nummer=ABC12345 von=dennis art=webm
[rec] Stück 1 angekommen (<sitzung>)          # dann jedes zehnte
[rec] fertig <id> nummer=ABC12345 812 kB 47s
[rec] MP4 erzeugt <id> 640 kB
```

**Wenn man nicht mehr hineinkommt** (acp. oder mcp.):

```bash
ssh <server> '/opt/4ever1-ident/src/ident/notzugang.sh'            # nachsehen, woran es liegt
ssh <server> '/opt/4ever1-ident/src/ident/notzugang.sh --sperre-weg'
```

Das Skript zeigt zuerst nur die Lage: läuft der Dienst, ist die Gerätebindung
an, ist 2FA an, welche Geräte sind freigegeben, und die letzten Anmeldeversuche
mit Grund. Erst mit einem Schalter greift es ein – `--sperre-weg` (Neustart,
löst Fehlversuch- und IP-Sperren), `--geraete-auf`, `--zweifach-aus`,
`--alles-auf`. Nichts davon löscht Daten.

Ein Zugang über Facebook, Google o. ä. ist bewusst **nicht** eingebaut: damit
hinge die Akte an einem fremden Konto, das gesperrt oder übernommen werden
kann. Wer den Server hat, schliesst sich selbst auf.

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
├── pdf.js         Ausweisblatt als PDF, ohne fremde Bibliothek
├── textpolish.js  räumt Vermerke und Protokoll-Einträge auf (regelbasiert)
├── deploy.sh      Quellcode holen, bauen, tauschen, im Fehlerfall zurück
├── notzugang.sh   wieder hineinkommen, wenn Sperre, Gerätebindung oder 2FA zu ist
├── sicherung.sh   nächtliche Sicherung (--einrichten legt den Zeitplan an)
├── pkboard-import.sh  Mitglieder aus dem PK-Board als Akten übernehmen
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
