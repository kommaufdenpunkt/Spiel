/*
 * =====================================================================
 *  AUDITION- / VERIFIZIERUNGS-FRAGEN  (BIGO LIVE · Agentur 4ever1)
 * =====================================================================
 *
 *  Diese Liste folgt den BIGO-Vorgaben aus "Anforderungen an Audition
 *  Videos" (2.1 Selbstvorstellung, 2.2 Einwilligung & Absichten,
 *  2.3 Talentdemonstration) sowie dem Verhaltenskodex 6.0 (A.4 Konto-Regeln).
 *
 *  IDEE: Du (Moderator) liest die jeweilige Aussage vor – sie wird der
 *  Bewerberin angezeigt UND ins Video eingeblendet – und sie bestätigt
 *  jeweils mit "Ja". So muss sie fast nur "Ja" sagen.
 *
 *  >>> WICHTIG: Drei Punkte muss BIGO als gesprochene Aussage hören und
 *      lassen sich NICHT mit Ja/Nein erledigen (am Anfang markiert mit
 *      "[BITTE SELBST SPRECHEN]"): die kurze Selbstvorstellung und – falls
 *      gewünscht – die Talent-Vorstellung. Alles andere ist Ja/Nein.
 *
 *  ANPASSEN:
 *    - [SYSTEM]  -> tragt euer beantragtes System ein (z. B. euer Gehalts-/
 *                   Streamer-System). Steht in eckigen Klammern.
 *    - 60k / 2 Monate / 4 Monate -> nur ändern, falls eure Vorgaben abweichen.
 *    - Jede Frage steht in "..." und endet mit einem Komma.
 * =====================================================================
 */

window.VERIFIZIERUNGS_FRAGEN = [

  // ---- Identität ----------------------------------------------------
  "Bitte halte deinen Ausweis gut sichtbar in die Kamera und nenne deinen vollen Namen.",

  // ---- 2.1 Selbstvorstellung  [BITTE SELBST SPRECHEN] ---------------
  "[BITTE SELBST SPRECHEN] Stell dich bitte kurz und sympathisch vor: Wer bist du, hast du Streaming-Erfahrung und warum möchtest du auf BIGO LIVE streamen?",

  // ---- 2.2 Einwilligung & Absichten  (Ja / Nein) --------------------
  "Ist dir bewusst, dass du dieses Video als Audition für eine Bewerbung bei BIGO LIVE aufnimmst?  — Bitte bestätige mit Ja.",
  "Möchtest du der Agentur 4ever1 auf BIGO LIVE beitreten?  — Ja?",
  "Möchtest du in das [SYSTEM] eintreten, dessen Regeln dir bekannt sind?  — Ja?",
  "Sind dir die Anforderungen und Regeln des Gehaltssystems sowie der Fan-Ränge bekannt?  — Ja?",
  "Ist dir bewusst, dass du dich während der Livestreams zeigen musst (Gesicht sichtbar)?  — Ja?",
  "Wurdest du über das Gehaltssystem aufgeklärt?  — Ja?",
  "Ist dir bewusst, dass ein Agenturwechsel nur mit Einverständnis des Agenturinhabers ODER nach mindestens 2 Monaten Streaming mit einem Mindeststarter von 60k möglich ist?  — Ja?",
  "Ist dir bewusst, dass du für deinen ersten Freikauf-Transfer mindestens 4 Monate in der aktuellen Agentur bleiben musst und erst danach ein zweiter Freikauf möglich ist?  — Ja?",
  "Sind dir die allgemeinen Regeln und die Live-Richtlinien von BIGO LIVE bekannt und stimmst du diesen zu?  — Ja?",
  "Bewirbst du dich freiwillig und aus eigenem Willen?  — Ja?",

  // ---- Verhaltenskodex 6.0 / A.4 Konto-Regeln  (Ja / Nein) ----------
  "Besitzt du nur einen einzigen, echten BIGO-Account?  — Ja?",
  "Bestätigst du, dass dein Account nur von dir genutzt wird (kein Account-Sharing)?  — Ja?",
  "Bestätigst du, dass dies eine echte Audition ist und kein Account an Dritte übertragen wird?  — Ja?",
  "Liegt dein Wohnsitz in der DACH-Region (Deutschland, Österreich oder Schweiz)?  — Ja?",
  "Bestätigst du, dass du keinen VPN nutzt, um deinen Standort zu verschleiern?  — Ja?",

  // ---- 2.3 Talentdemonstration (optional) ---------------------------
  "Möchtest du einen Talent-Tag erhalten?  — Ja oder Nein?",
  "[BITTE SELBST SPRECHEN – nur falls Talent gewünscht] Nenne bitte kurz dein Talent und zeige eine kurze Demonstration.",

  // ---- Abschluss ----------------------------------------------------
  "Möchtest du der Agentur 4ever1 hiermit verbindlich beitreten?  — Ja?",
  "Hast du noch Fragen an uns?",
];

// Titel/Beschriftung, die oben im aufgenommenen Video erscheint:
window.VERIFIZIERUNGS_TITEL = "Audition · Agentur 4ever1 · BIGO LIVE";

/*
 * ---------------------------------------------------------------------
 *  EINLADUNGS-NACHRICHT
 * ---------------------------------------------------------------------
 *  Diesen Text kopiert der "Einladung kopieren"-Knopf in die Zwischen-
 *  ablage – du fügst ihn dann in WhatsApp/E-Mail ein und schickst ihn der
 *  Bewerberin. {LINK} wird automatisch durch den echten Beitritts-Link
 *  ersetzt. Den Wortlaut kannst du frei ändern.
 * ---------------------------------------------------------------------
 */
window.EINLADUNGS_TEXT =
`Hallo 👋

für deine BIGO-Audition bei der Agentur 4ever1 machen wir ein kurzes Video-Gespräch.
Klick einfach auf den Link, gib deinen Namen ein und erlaube Kamera & Mikrofon:

👉 {LINK}

Bitte halte deinen Ausweis bereit. Ich stelle dir ein paar Fragen – du musst eigentlich nur bestätigen. Dauert nur ein paar Minuten. 🙂`;
