// Thema 6 – Verkehrszeichen und Verkehrseinrichtungen
// Grundstoff (alle Klassen). Inhalte in eigenen Worten, fachlich gestützt auf die
// StVO (§§ 39–43 sowie Anlagen 1–4). Amtliche Quelle: gesetze-im-internet.de.

export default {
  id: "06",
  nummer: 6,
  bereich: "Grundstoff",
  titel: "Verkehrszeichen und Verkehrseinrichtungen",
  dauer: "ca. 90 Min (Doppelstunde)",
  folien: [
    {
      typ: "titel",
      kicker: "Grundstoff · Thema 6",
      titel: "Verkehrszeichen und Verkehrseinrichtungen",
      untertitel: "An Form und Farbe erkennst du sofort, was gilt.",
      hinweis: "Scanne den QR-Code, um live mitzumachen. Markieren erlaubt – Vorblättern nicht 😉"
    },

    {
      typ: "agenda",
      titel: "Das nehmen wir uns heute vor",
      punkte: [
        "Wozu Verkehrszeichen? (§ 39 StVO)",
        "Die drei großen Gruppen: Gefahr-, Vorschrift- und Richtzeichen",
        "Gefahrzeichen – dreieckig & warnend (§ 40)",
        "Vorschriftzeichen – Verbote und Gebote (§ 41)",
        "Richtzeichen – Hinweise & Erleichterungen (§ 42)",
        "Zusatzzeichen richtig lesen",
        "Verkehrseinrichtungen – rot-weiß (§ 43)"
      ]
    },

    {
      typ: "lernziele",
      titel: "Lernziele",
      punkte: [
        "Du ordnest jedes Zeichen an Form und Farbe einer Gruppe zu.",
        "Du unterscheidest Warnung, Verbot, Gebot und Hinweis.",
        "Du liest Zusatzzeichen und weißt, ab wann und wie lange ein Zeichen gilt.",
        "Du erkennst Verkehrseinrichtungen und folgst ihrer Führung."
      ]
    },

    {
      typ: "inhalt",
      titel: "Wozu Verkehrszeichen?",
      einleitung: "Verkehrszeichen ordnen den Verkehr dort, wo allgemeine Regeln nicht genügen.",
      bloecke: [
        { text: "Verkehrszeichen gehen den allgemeinen Regeln vor (z. B. einem „rechts vor links“).", betont: true },
        { text: "Ein Zeichen gilt ab der Stelle, an der es steht." },
        { text: "Sinnbilder sind bundesweit einheitlich – so verstehst du sie überall sofort." },
        { text: "Verbote auf einer Strecke gelten bis zur ausdrücklichen Aufhebung oder bis zur nächsten Kreuzung/Einmündung." }
      ],
      quelle: "§ 39 StVO"
    },

    {
      typ: "inhalt",
      titel: "Drei große Gruppen + Einrichtungen",
      einleitung: "So ist das ganze System aufgebaut:",
      bloecke: [
        { text: "Gefahrzeichen: dreieckig, roter Rand, Spitze oben – warnen." },
        { text: "Vorschriftzeichen: rund – ordnen an (Verbote in Rot, Gebote in Blau)." },
        { text: "Richtzeichen: meist blau, rechteckig – geben Hinweise und Erleichterungen." },
        { text: "Verkehrseinrichtungen: rot-weiß – leiten, sichern oder sperren (z. B. Baken, Leitkegel, Schranken).", betont: true }
      ],
      merksatz: "Dreieck warnt, Rund ordnet an, Rechteck weist hin."
    },

    {
      typ: "inhalt",
      titel: "Gefahrzeichen",
      einleitung: "Sie sagen: „Achtung, hier kann es gefährlich werden – sei bremsbereit.“",
      bloecke: [
        { text: "Form: Dreieck mit roter Umrandung, Spitze nach oben.", betont: true },
        { text: "Beispiele: Kurve, Gefälle, Kinder, Wildwechsel, Baustelle, Bahnübergang." },
        { text: "Außerhalb geschlossener Ortschaften stehen sie meist 150–250 m vor der Gefahrstelle." },
        { text: "Weicht der Abstand ab, sagt es ein Zusatzzeichen (z. B. „100 m“)." }
      ],
      quelle: "§ 40 StVO"
    },

    {
      typ: "frage",
      titel: "Mitdenken",
      frage: "Ein dreieckiges Schild mit Spitze nach oben und rotem Rand – was bedeutet das?",
      optionen: [
        "Ein Verbot, hier weiterzufahren.",
        "Eine Warnung – sei aufmerksam und bremsbereit.",
        "Eine unverbindliche Empfehlung."
      ],
      loesung: 1,
      erklaerung: "Das Dreieck mit Spitze oben ist immer ein Gefahrzeichen. Es verbietet nichts, fordert dich aber zu erhöhter Aufmerksamkeit und Bremsbereitschaft auf."
    },

    {
      typ: "inhalt",
      titel: "Vorschriftzeichen – Verbote",
      einleitung: "Runde Zeichen mit rotem Rand schränken ein oder verbieten.",
      bloecke: [
        { text: "Verbot der Einfahrt (rundes Schild, weißer Balken) – nicht hineinfahren, oft Einbahnstraße von der falschen Seite.", betont: true },
        { text: "Zulässige Höchstgeschwindigkeit (Zahl im roten Ring)." },
        { text: "Überholverbot, Halt- und Parkverbote." },
        { text: "Verbot für Fahrzeuge bestimmter Art (z. B. Lkw, Krafträder)." }
      ],
      quelle: "§ 41 StVO"
    },

    {
      typ: "inhalt",
      titel: "Vorschriftzeichen – Gebote",
      einleitung: "Runde Zeichen mit blauem Grund schreiben etwas vor – das musst du tun.",
      bloecke: [
        { text: "Vorgeschriebene Fahrtrichtung (weißer Pfeil auf blauem Grund).", betont: true },
        { text: "Kreisverkehr (drei Pfeile im Kreis)." },
        { text: "Radweg, Gehweg, gemeinsamer oder getrennter Rad- und Gehweg." }
      ],
      merksatz: "Roter Ring = verbietet/beschränkt. Blauer Grund = schreibt vor."
    },

    {
      typ: "zuordnung",
      titel: "Form & Farbe zuordnen",
      einleitung: "Welche Bedeutung gehört zu welcher Form/Farbe?",
      paare: [
        { links: "Dreieck, Spitze oben, roter Rand", rechts: "Gefahrzeichen – Achtung!" },
        { links: "Rund mit rotem Rand", rechts: "Verbot / Beschränkung" },
        { links: "Rund, blauer Grund", rechts: "Gebot – das musst du tun" },
        { links: "Rechteckig, blau", rechts: "Richtzeichen – Hinweis/Erleichterung" },
        { links: "Klein, weiß mit schwarzem Rand", rechts: "Zusatzzeichen – ergänzt das Hauptschild" }
      ]
    },

    {
      typ: "inhalt",
      titel: "Richtzeichen",
      einleitung: "Meist blau und rechteckig – sie geben Hinweise oder besondere Regelungen.",
      bloecke: [
        { text: "Autobahn und Kraftfahrstraße (Beginn besonderer Regeln)." },
        { text: "Ortstafel: Ab hier gilt „innerorts“ – in der Regel 50 km/h.", betont: true },
        { text: "Vorfahrtstraße (gelbe Raute), Einbahnstraße, Parkplatz, Sackgasse." }
      ],
      quelle: "§ 42 StVO"
    },

    {
      typ: "inhalt",
      titel: "Zusatzzeichen richtig lesen",
      einleitung: "Das kleine weiße Schild mit schwarzem Rand unter dem Hauptzeichen.",
      bloecke: [
        { text: "Es erweitert oder beschränkt das Zeichen darüber – immer mitlesen!", betont: true },
        { text: "Beispiele: „bei Nässe“, Zeitangaben, „Anlieger frei“, Gewichts- oder Richtungsangaben." },
        { text: "Ohne das Hauptzeichen hat ein Zusatzzeichen keine Bedeutung." }
      ],
      merksatz: "Erst das große Schild, dann das kleine darunter – beides zusammen ergibt die Regel."
    },

    {
      typ: "lueckentext",
      titel: "Lückentext: Form & Farbe",
      einleitung: "Wähle in jeder Lücke das passende Wort.",
      text: "Gefahrzeichen sind [[dreieckig]] und warnen dich. Ein rundes Zeichen mit rotem Rand ist ein [[Verbot]]. Blaue runde Zeichen sind [[Gebote]]. Blaue rechteckige Zeichen sind [[Richtzeichen]]. Rot-weiße [[Verkehrseinrichtungen]] leiten oder sperren den Verkehr.",
      ablenker: ["eckig", "Erlaubnis", "Empfehlung", "grün"]
    },

    {
      typ: "inhalt",
      titel: "Verkehrseinrichtungen",
      einleitung: "Rot-weiße Einrichtungen führen, sichern oder sperren den Verkehr (§ 43).",
      bloecke: [
        { text: "Schranken, Sperrpfosten und Absperrgeräte sperren ab." },
        { text: "Leitbaken, Leitschwellen und Leitkegel (Pylonen) leiten dich z. B. an Baustellen.", betont: true },
        { text: "Rot-weiße Streifen heißen immer: Hier nicht durch – folge der Führung." }
      ],
      quelle: "§ 43 StVO"
    },

    {
      typ: "inhalt",
      titel: "Leitpfosten & Warnbaken",
      einleitung: "Zwei Helfer am Fahrbahnrand und vor Bahnübergängen.",
      bloecke: [
        { text: "Leitpfosten (weiß mit schwarzem Kopf) zeigen den Fahrbahnrand – rechts mit rechteckigem, links mit rundem Rückstrahler." },
        { text: "Warnbaken mit schrägen Streifen kündigen einen Bahnübergang an.", betont: true },
        { text: "Drei Streifen ≈ 240 m, zwei ≈ 160 m, ein Streifen ≈ 80 m vor dem Übergang." }
      ],
      merksatz: "Drei Streifen, zwei Streifen, ein Streifen – der Bahnübergang kommt näher."
    },

    {
      typ: "frage",
      titel: "Mitdenken",
      frage: "Du siehst am Straßenrand eine Bake mit drei schrägen Streifen. Was kündigt sie an?",
      optionen: [
        "Das Ende der Autobahn.",
        "Einen Bahnübergang – er beginnt in etwa 240 m.",
        "Eine Geschwindigkeitsbegrenzung."
      ],
      loesung: 1,
      erklaerung: "Die dreistreifige Bake steht rund 240 m vor dem Bahnübergang. Mit jeder Bake (zwei, dann ein Streifen) kommst du dem Übergang näher."
    },

    {
      typ: "inhalt",
      titel: "Rangordnung – kurz wiederholt",
      einleitung: "Widersprechen sich Regelungen, gilt diese Reihenfolge:",
      bloecke: [
        { text: "1. Polizeibeamte", betont: true },
        { text: "2. Lichtzeichen / Ampel" },
        { text: "3. Verkehrszeichen" },
        { text: "4. Allgemeine Regeln (z. B. rechts vor links)" }
      ],
      merksatz: "Polizei schlägt Ampel, Ampel schlägt Schild, Schild schlägt „rechts vor links“."
    },

    {
      typ: "kreuzwortraetsel",
      titel: "Kreuzworträtsel zum Schluss",
      einleitung: "Trage die Begriffe aus Thema 6 ein. Tippe auf ein Feld und schreibe los.",
      groesse: { zeilen: 9, spalten: 9 },
      eintraege: [
        { wort: "DREIECK", zeile: 4, spalte: 2, richtung: "waagerecht", frage: "Form der Gefahrzeichen (Spitze oben)." },
        { wort: "VERBOT", zeile: 3, spalte: 4, richtung: "senkrecht", frage: "Ein rundes Zeichen mit rotem Rand spricht ein … aus." },
        { wort: "ZUSATZ", zeile: 8, spalte: 0, richtung: "waagerecht", frage: "…-zeichen: kleines weißes Schild unter dem Hauptschild." },
        { wort: "GEBOT", zeile: 6, spalte: 2, richtung: "waagerecht", frage: "Ein blaues rundes Zeichen ordnet ein … an." },
        { wort: "RAUTE", zeile: 0, spalte: 6, richtung: "senkrecht", frage: "Form des Zeichens „Vorfahrtstraße“ (gelb)." },
        { wort: "BLAU", zeile: 1, spalte: 4, richtung: "waagerecht", frage: "Grundfarbe der Gebots- und Richtzeichen." },
        { wort: "BAKE", zeile: 2, spalte: 8, richtung: "senkrecht", frage: "Schräge Streifen kündigen damit den Bahnübergang an." }
      ]
    },

    {
      typ: "zusammenfassung",
      titel: "Das nimmst du mit",
      punkte: [
        "Dreieck warnt, Rund ordnet an, Rechteck weist hin.",
        "Roter Ring = Verbot/Beschränkung, blauer Grund = Gebot.",
        "Zusatzzeichen immer mitlesen – es verändert die Regel.",
        "Verkehrszeichen gelten ab ihrem Standort und gehen allgemeinen Regeln vor.",
        "Rot-weiße Einrichtungen leiten oder sperren – folge ihrer Führung.",
        "Baken vor dem Bahnübergang: drei, zwei, ein Streifen."
      ]
    },

    {
      typ: "abschluss",
      titel: "Geschafft – Thema 6 ✅",
      untertitel: "Gute Zeit zum Markieren und für einen Screenshot der Merksätze.",
      hinweis: "Nächstes Mal geht es weiter im Grundstoff. Fragen? Jetzt ist der Moment."
    }
  ]
};
