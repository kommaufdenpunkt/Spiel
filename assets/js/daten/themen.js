// Register aller Unterrichtsthemen.
// 12 Grundstoff-Themen (alle Klassen) + 2 Klassen-B-Themen "Auto-Technik" (13/14).
// "verfuegbar: true" = Inhalt ist gebaut. Rest folgt Schritt für Schritt.

export const THEMEN = [
  { id: "01", nummer: 1,  bereich: "Grundstoff", titel: "Persönliche Voraussetzungen / Risikofaktor Mensch", verfuegbar: false },
  { id: "02", nummer: 2,  bereich: "Grundstoff", titel: "Risikofaktor Mensch (Teil 2)", verfuegbar: false },
  { id: "03", nummer: 3,  bereich: "Grundstoff", titel: "Rechtliche Rahmenbedingungen", verfuegbar: false },
  { id: "04", nummer: 4,  bereich: "Grundstoff", titel: "Straßenverkehrssystem und seine Nutzung", verfuegbar: false },
  { id: "05", nummer: 5,  bereich: "Grundstoff", titel: "Grundregel, Vorfahrt und Verkehrsregelungen", verfuegbar: true },
  { id: "06", nummer: 6,  bereich: "Grundstoff", titel: "Verkehrszeichen und Verkehrseinrichtungen", verfuegbar: false },
  { id: "07", nummer: 7,  bereich: "Grundstoff", titel: "Geschwindigkeit, Abstand und umweltschonende Fahrweise", verfuegbar: false },
  { id: "08", nummer: 8,  bereich: "Grundstoff", titel: "Andere Teilnehmer im Straßenverkehr", verfuegbar: false },
  { id: "09", nummer: 9,  bereich: "Grundstoff", titel: "Verkehrsverhalten bei Fahrmanövern, Verkehrsbeobachtung", verfuegbar: false },
  { id: "10", nummer: 10, bereich: "Grundstoff", titel: "Ruhender Verkehr", verfuegbar: false },
  { id: "11", nummer: 11, bereich: "Grundstoff", titel: "Verhalten in besonderen Situationen, Folgen von Verstößen", verfuegbar: false },
  { id: "12", nummer: 12, bereich: "Grundstoff", titel: "Lebenslanges Lernen / Folgen von Verstößen", verfuegbar: false },
  { id: "13", nummer: 13, bereich: "Klasse B – Auto-Technik", titel: "Technische Bedingungen / Personen- und Güterbeförderung (Teil 1)", verfuegbar: false },
  { id: "14", nummer: 14, bereich: "Klasse B – Auto-Technik", titel: "Fahren mit Solokraftfahrzeugen und Zügen / Umweltschonung (Teil 2)", verfuegbar: false }
];

const lader = {
  "05": () => import("./thema-05.js")
};

export async function ladeThema(id) {
  if (!lader[id]) return null;
  const mod = await lader[id]();
  return mod.default;
}

export function themaInfo(id) {
  return THEMEN.find((t) => t.id === id) || null;
}
