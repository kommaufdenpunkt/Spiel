// Thema 5 – Grundregel, Vorfahrt und Verkehrsregelungen
// Grundstoff (alle Klassen). Inhalte in eigenen Worten, fachlich gestützt auf die
// StVO (§§ 1, 8, 9, 9a, 19, 36, 37) – amtliche Quelle: gesetze-im-internet.de.
// Keine Übernahme urheberrechtlich geschützter Lehrwerke.

export default {
  id: "05",
  nummer: 5,
  bereich: "Grundstoff",
  titel: "Grundregel, Vorfahrt und Verkehrsregelungen",
  dauer: "ca. 90 Min (Doppelstunde)",
  folien: [
    {
      typ: "titel",
      kicker: "Grundstoff · Thema 5",
      titel: "Grundregel, Vorfahrt und Verkehrsregelungen",
      untertitel: "Wer darf zuerst? Und warum Rücksicht die wichtigste Regel ist.",
      hinweis: "Scanne den QR-Code, um live mitzumachen. Markieren erlaubt – Vorblättern nicht 😉"
    },

    {
      typ: "agenda",
      titel: "Das nehmen wir uns heute vor",
      punkte: [
        "Die Grundregel (§ 1 StVO) – Vertrauen & Rücksicht",
        "Vorfahrt: „rechts vor links“ (§ 8 StVO)",
        "Vorfahrt durch Verkehrszeichen",
        "Linksabbieger & Gegenverkehr (§ 9 StVO)",
        "Kreisverkehr",
        "Ampeln, Grünpfeil & Dauerlichtzeichen (§ 37 StVO)",
        "Polizeibeamte (§ 36 StVO) & die Rangfolge",
        "Bahnübergänge (§ 19 StVO)"
      ]
    },

    {
      typ: "lernziele",
      titel: "Lernziele",
      punkte: [
        "Du erkennst, wer Vorfahrt hat – durch Regel, Zeichen oder Ampel.",
        "Du schätzt ein, wie viel Platz und Zeit du zum Queren einer Kreuzung brauchst.",
        "Du kennst die Rangfolge der Verkehrsregelungen und wendest sie an.",
        "Du verstehst, dass Vorfahrt etwas ist, das man gewährt – nicht erzwingt."
      ]
    },

    {
      typ: "inhalt",
      titel: "§ 1 StVO – Die Grundregel",
      einleitung: "Über allen Einzelregeln steht ein einziger Satz – das Fundament des Straßenverkehrs.",
      bloecke: [
        { text: "Ständige Vorsicht und gegenseitige Rücksicht sind Pflicht.", betont: true },
        { text: "Niemand darf geschädigt, gefährdet oder mehr als unvermeidbar behindert oder belästigt werden." },
        { text: "Vertrauensgrundsatz: Ich darf darauf vertrauen, dass sich andere regelkonform verhalten – aber nur, solange nichts auf das Gegenteil hindeutet." },
        { text: "Heißt im Alltag: Im Zweifel verzichte ich auf mein Recht, statt einen Unfall zu riskieren." }
      ],
      merksatz: "Vorfahrt nimmt man nicht – Vorfahrt wird gewährt."
    },

    {
      typ: "inhalt",
      titel: "Was bedeutet „Vorfahrt“?",
      einleitung: "Vorfahrt regelt, wer an Kreuzungen und Einmündungen zuerst fahren darf.",
      bloecke: [
        { text: "Vorfahrtberechtigt = darf zuerst fahren." },
        { text: "Wartepflichtig = muss warten und darf nur weiterfahren, wenn niemand gefährdet oder wesentlich behindert wird.", betont: true },
        { text: "Ist die Kreuzung unübersichtlich, darf man sich vorsichtig hineintasten, bis man Sicht hat." },
        { text: "Wichtig: Vorfahrt gilt für die ganze Kreuzung, nicht nur für die erste Fahrspur." }
      ],
      quelle: "§ 8 StVO"
    },

    {
      typ: "inhalt",
      titel: "„Rechts vor links“",
      einleitung: "Die Grundregel der Vorfahrt – immer dann, wenn nichts anderes geregelt ist.",
      bloecke: [
        { text: "An Kreuzungen/Einmündungen hat Vorfahrt, wer von rechts kommt.", betont: true },
        { text: "Gilt nur, wenn keine Verkehrszeichen und keine Ampel etwas anderes vorgeben." },
        { text: "Ausnahme: Wer aus einem Feld-/Waldweg oder von einem Grundstück kommt, muss Vorfahrt gewähren – auch wenn er „von rechts“ käme." },
        { text: "Faustregel zum Üben: Erst nach Zeichen und Ampel schauen – erst dann gilt rechts vor links." }
      ],
      quelle: "§ 8 Abs. 1 StVO"
    },

    {
      typ: "inhalt",
      titel: "Wo gilt KEIN „rechts vor links“?",
      einleitung: "Nicht jede Einmündung ist eine echte Kreuzung. Der Bordstein verrät es dir.",
      bloecke: [
        { text: "Abgesenkter oder abgerundeter Bordstein = du kommst aus einem Grundstück, Parkplatz, einer Tankstelle, einem Hof oder verkehrsberuhigten Bereich. Dann gilt NICHT „rechts vor links“ – du musst warten und alle anderen durchlassen.", betont: true },
        { text: "Wer aus einem Feld- oder Waldweg auf die Straße einbiegt, muss Vorfahrt gewähren – auch wenn er „von rechts“ käme.", betont: true },
        { text: "Gleiches gilt beim Anfahren vom Fahrbahnrand und beim Ausfahren aus einem Grundstück: andere haben Vorrang, notfalls einweisen lassen." },
        { text: "Durchgehender, hoher Bordstein = echte Kreuzung, hier kann „rechts vor links“ gelten." }
      ],
      merksatz: "Abgesenkter Bordstein heißt: Ich komme von „irgendwo“ – also warte ich.",
      quelle: "§ 8 und § 10 StVO"
    },

    {
      typ: "frage",
      titel: "Mitdenken",
      frage: "Du verlässt einen Parkplatz über einen abgesenkten Bordstein auf die Straße. Wer hat Vorrang?",
      optionen: [
        "Ich – ich komme ja „von rechts“.",
        "Der fließende Verkehr auf der Straße – ich muss warten.",
        "Wer zuerst hupt."
      ],
      loesung: 1,
      erklaerung: "Der abgesenkte Bordstein zeigt: Es ist keine echte Kreuzung. Beim Einfahren aus einem Grundstück/Parkplatz gilt § 10 StVO – der fließende Verkehr hat Vorrang."
    },

    {
      typ: "frage",
      titel: "Mitdenken",
      frage: "An einer Kreuzung ohne Schilder und ohne Ampel treffen sich vier Autos gleichzeitig. Was gilt zuerst?",
      optionen: [
        "Wer am schnellsten ist, fährt zuerst.",
        "Jeder gewährt dem Fahrzeug von rechts Vorfahrt.",
        "Der größere Wagen hat Vorrang."
      ],
      loesung: 1,
      erklaerung: "Ohne Zeichen und Ampel gilt „rechts vor links“. Bei der klassischen Vierer-Pattsituation gewinnt die Rücksicht: man verständigt sich und lässt nacheinander fahren."
    },

    {
      typ: "inhalt",
      titel: "Vorfahrt durch Verkehrszeichen",
      einleitung: "Zeichen heben „rechts vor links“ auf. Diese vier musst du sicher unterscheiden:",
      bloecke: [
        { text: "Zeichen 205 „Vorfahrt gewähren!“ (auf der Spitze stehendes Dreieck): warten." },
        { text: "Zeichen 206 „Halt! Vorfahrt gewähren!“ (STOP, Achteck): anhalten ist Pflicht – auch wenn frei ist.", betont: true },
        { text: "Zeichen 301 „Vorfahrt“: an der nächsten Kreuzung hast du Vorfahrt." },
        { text: "Zeichen 306 „Vorfahrtstraße“ (gelbe Raute): Vorfahrt entlang des ganzen Straßenzugs, bis Zeichen 307 das Ende anzeigt." }
      ],
      quelle: "§ 8 Abs. 1 StVO i. V. m. Anlage 2/3"
    },

    {
      typ: "inhalt",
      titel: "Die Form verrät das Zeichen",
      einleitung: "Verkehrszeichen sind an Form und Farbe unverwechselbar – du erkennst sie sogar von hinten oder bei Schnee.",
      bloecke: [
        { text: "Dreieck mit Spitze nach unten = „Vorfahrt gewähren!“ (Zeichen 205).", betont: true },
        { text: "Achteck (rot) = „Halt! Vorfahrt gewähren!“ – STOP (Zeichen 206). Diese Form gibt es nur einmal.", betont: true },
        { text: "Gelbe Raute (auf der Spitze stehendes Quadrat) = Vorfahrtstraße (Zeichen 306)." },
        { text: "Dreieck mit Spitze nach oben (rot umrandet) = Gefahrzeichen: „Achtung!“" },
        { text: "Runder Rand in Rot = Verbot/Beschränkung. Runder, blauer Grund = Gebot (z. B. vorgeschriebene Fahrtrichtung)." }
      ],
      merksatz: "Schon an der Form erkennst du das Zeichen – das macht es unverwechselbar.",
      quelle: "StVO, Anlagen 1–3"
    },

    {
      typ: "zuordnung",
      titel: "Zeichen zuordnen",
      einleitung: "Welche Bedeutung gehört zu welchem Zeichen? Wähle für jedes Zeichen die passende Bedeutung.",
      paare: [
        { links: "Zeichen 206 – STOP (Achteck)", rechts: "Anhalten ist Pflicht, dann Vorfahrt gewähren" },
        { links: "Zeichen 205 – Dreieck (Spitze unten)", rechts: "Vorfahrt gewähren (warten)" },
        { links: "Zeichen 306 – gelbe Raute", rechts: "Vorfahrtstraße" },
        { links: "Zeichen 215 – Pfeile im Kreis", rechts: "Kreisverkehr" }
      ]
    },

    {
      typ: "inhalt",
      titel: "Abknickende Vorfahrt",
      einleitung: "Ein Sonderfall, der oft übersehen wird.",
      bloecke: [
        { text: "Ein Zusatzschild mit dickem, abknickendem Pfeil zeigt: die Vorfahrtstraße macht einen Knick." },
        { text: "Wer dem Knick folgt, bleibt vorfahrtberechtigt – muss aber blinken, obwohl er auf der Vorfahrtstraße bleibt.", betont: true },
        { text: "Wer geradeaus weiterfährt, verlässt die Vorfahrtstraße und wird wartepflichtig." }
      ],
      merksatz: "Dem Knick folgen = blinken, obwohl man Vorfahrt hat."
    },

    {
      typ: "inhalt",
      titel: "Linksabbieger & Gegenverkehr",
      einleitung: "Auch ohne Kreuzungsschild gibt es klare Vorränge beim Abbiegen.",
      bloecke: [
        { text: "Wer links abbiegt, muss entgegenkommende Fahrzeuge durchlassen, die geradeaus fahren oder rechts abbiegen.", betont: true },
        { text: "Beim Abbiegen ist besondere Rücksicht auf Fußgänger und Radfahrer geboten – notfalls warten." },
        { text: "Zwei Linksabbieger aus entgegengesetzter Richtung fahren in der Regel voreinander (links an links vorbei), sofern Verkehr/Markierung nichts anderes erfordern." }
      ],
      quelle: "§ 9 StVO"
    },

    {
      typ: "inhalt",
      titel: "Kreisverkehr",
      einleitung: "Beim Zeichen 215 (Kreisverkehr), meist mit „Vorfahrt gewähren“ kombiniert:",
      bloecke: [
        { text: "Der Verkehr im Kreis hat Vorfahrt – beim Einfahren wartest du." },
        { text: "Beim Einfahren wird NICHT geblinkt.", betont: true },
        { text: "Im Kreis selbst wird NICHT geblinkt." },
        { text: "Erst beim Verlassen (Ausfahren) rechts blinken." }
      ],
      merksatz: "Rein ohne Blinker, raus mit Blinker."
    },

    {
      typ: "frage",
      titel: "Mitdenken",
      frage: "Du fährst in einen beschilderten Kreisverkehr ein. Wann blinkst du?",
      optionen: [
        "Beim Einfahren links, beim Verlassen rechts.",
        "Gar nicht – im Kreisverkehr blinkt man nie.",
        "Nur beim Verlassen rechts."
      ],
      loesung: 2,
      erklaerung: "Beim Einfahren und im Kreis blinkst du nicht. Nur beim Verlassen blinkst du rechts, damit Wartende erkennen, dass du herausfährst."
    },

    {
      typ: "inhalt",
      titel: "Verkehrsregelungen – die Rangfolge",
      einleitung: "Wenn sich mehrere Regelungen widersprechen, gilt eine feste Reihenfolge.",
      bloecke: [
        { text: "1. Polizeibeamte (Weisungen gehen allem vor)", betont: true },
        { text: "2. Lichtzeichen / Ampel" },
        { text: "3. Verkehrszeichen (Schilder)" },
        { text: "4. Allgemeine Regeln (z. B. rechts vor links)" }
      ],
      merksatz: "Polizei schlägt Ampel, Ampel schlägt Schild, Schild schlägt „rechts vor links“."
    },

    {
      typ: "lueckentext",
      titel: "Lückentext: Wer regelt wen?",
      einleitung: "Wähle in jeder Lücke das passende Wort.",
      text: "Wenn sich Regelungen widersprechen, geht die [[Polizei]] allen vor. Danach gilt die [[Ampel]], dann das [[Schild]] und zuletzt die Regel [[rechts]] vor links. Eine gelbe Ampel bedeutet: vor der Kreuzung [[warten]].",
      ablenker: ["links", "Grün", "fahren", "Hupe"]
    },

    {
      typ: "inhalt",
      titel: "Die Ampel (Wechsellichtzeichen)",
      einleitung: "Anordnung: Rot oben, Gelb in der Mitte, Grün unten.",
      bloecke: [
        { text: "Reihenfolge: Grün → Gelb → Rot → Rot+Gelb → Grün." },
        { text: "Grün: Der Verkehr ist freigegeben." },
        { text: "Gelb: Vor der Kreuzung auf das nächste Zeichen warten (nicht „schnell noch rüber“).", betont: true },
        { text: "Rot: Halt vor der Kreuzung." },
        { text: "Rot+Gelb: Gleich wird es grün – vorbereiten, aber noch NICHT losfahren." }
      ],
      quelle: "§ 37 StVO"
    },

    {
      typ: "inhalt",
      titel: "Grünpfeil – zwei Dinge nicht verwechseln!",
      einleitung: "Es gibt zwei „grüne Pfeile“ mit unterschiedlicher Bedeutung.",
      bloecke: [
        { text: "Grünpfeil-SCHILD (grünes Blechschild rechts neben Rot): Erst vollständig anhalten! Dann ist Rechtsabbiegen erlaubt, wenn niemand gefährdet wird.", betont: true },
        { text: "Vorrang haben dabei Querverkehr sowie Fußgänger und Radfahrer." },
        { text: "Grüner LEUCHT-Pfeil (im Ampelsignal): freie Fahrt in Pfeilrichtung – ohne anzuhalten, aber mit Rücksicht auf Fußgänger." }
      ],
      merksatz: "Schild = erst halten, dann tasten. Leuchtpfeil = freie Fahrt."
    },

    {
      typ: "inhalt",
      titel: "Dauerlichtzeichen",
      einleitung: "Vor allem über Fahrstreifen (z. B. auf Autobahnen oder vor Tunneln).",
      bloecke: [
        { text: "Rote, gekreuzte Schrägbalken (X): Dieser Fahrstreifen ist gesperrt – verlassen.", betont: true },
        { text: "Grüner, nach unten gerichteter Pfeil: Dieser Fahrstreifen ist frei." },
        { text: "Ein blinkender gelber Pfeil schräg nach unten weist auf den danebenliegenden Streifen aus." }
      ],
      quelle: "§ 37 Abs. 3 StVO"
    },

    {
      typ: "inhalt",
      titel: "Zeichen & Weisungen der Polizei",
      einleitung: "Polizeibeamte regeln den Verkehr mit Körperhaltung und Armen – das gilt vor allem anderen.",
      bloecke: [
        { text: "Brust oder Rücken zeigt zu dir = HALT (wie Rot).", betont: true },
        { text: "Die Seite (Schulter) zeigt zu dir = freie Fahrt (wie Grün)." },
        { text: "Ein Arm hoch gehoben = vor der Kreuzung warten (wie Gelb) – für alle Richtungen." },
        { text: "Weisungen der Polizei gehen Ampeln und Schildern immer vor." }
      ],
      quelle: "§ 36 StVO"
    },

    {
      typ: "inhalt",
      titel: "Bahnübergänge",
      einleitung: "Das Andreaskreuz gibt dem Schienenverkehr immer Vorrang.",
      bloecke: [
        { text: "Andreaskreuz = Schienenfahrzeuge haben Vorrang." },
        { text: "Anhalten musst du bei: rotem Blinklicht oder Rotlicht, sich schließenden/geschlossenen Schranken, dem Zeichen eines Bahnbediensteten oder herannahendem Zug.", betont: true },
        { text: "Auf dem Übergang nicht halten oder überholen – und mit angepasster Geschwindigkeit annähern." }
      ],
      quelle: "§ 19 StVO"
    },

    {
      typ: "frage",
      titel: "Mitdenken",
      frage: "Die Ampel zeigt Grün, doch ein Polizeibeamter steht mit der Brust zu dir und hat den Verkehr für deine Richtung gestoppt. Was tust du?",
      optionen: [
        "Ich fahre – Grün gilt.",
        "Ich halte an – die Weisung der Polizei geht vor.",
        "Ich huppe und fahre langsam weiter."
      ],
      loesung: 1,
      erklaerung: "Die Rangfolge entscheidet: Polizei vor Ampel. Brust/Rücken zur Fahrtrichtung bedeutet Halt – auch wenn die Ampel Grün zeigt."
    },

    {
      typ: "kreuzwortraetsel",
      titel: "Kreuzworträtsel zum Schluss",
      einleitung: "Trage die Begriffe aus Thema 5 ein. Tippe auf ein Feld und schreibe los.",
      groesse: { zeilen: 5, spalten: 11 },
      eintraege: [
        { wort: "VORFAHRT", zeile: 0, spalte: 0, richtung: "waagerecht", frage: "Wer darf zuerst fahren?" },
        { wort: "STOP", zeile: 1, spalte: 0, richtung: "waagerecht", frage: "Wort auf dem achteckigen Zeichen 206 – Anhalten ist Pflicht." },
        { wort: "POLIZEI", zeile: 2, spalte: 4, richtung: "waagerecht", frage: "Ihre Weisungen gehen allem vor." },
        { wort: "ROT", zeile: 0, spalte: 2, richtung: "senkrecht", frage: "Diese Ampelfarbe bedeutet: Halt!" },
        { wort: "AMPEL", zeile: 0, spalte: 4, richtung: "senkrecht", frage: "Regelt mit Rot, Gelb und Grün." },
        { wort: "GELB", zeile: 1, spalte: 9, richtung: "senkrecht", frage: "Ampelfarbe: vor der Kreuzung warten." }
      ]
    },

    {
      typ: "zusammenfassung",
      titel: "Das nimmst du mit",
      punkte: [
        "Über allem steht § 1: Vorsicht und gegenseitige Rücksicht.",
        "Reihenfolge prüfen: Polizei → Ampel → Schild → rechts vor links.",
        "Wartepflichtig heißt: nur fahren, wenn niemand gefährdet/wesentlich behindert wird.",
        "Kreisverkehr: rein ohne Blinker, raus mit Blinker.",
        "Grünpfeil-Schild: erst anhalten, dann vorsichtig rechts abbiegen.",
        "Andreaskreuz: Schiene hat immer Vorrang."
      ]
    },

    {
      typ: "abschluss",
      titel: "Geschafft – Thema 5 ✅",
      untertitel: "Gute Zeit zum Markieren und für einen Screenshot der Merksätze.",
      hinweis: "Nächstes Mal: Thema 6. Fragen? Jetzt ist der Moment."
    }
  ]
};
