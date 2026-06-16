// Schüler-Ansicht: folgt live dem Lehrer.
// - kann NICHT über die aktuelle Lehrer-Folie hinaus blättern
// - kann zurückblättern und alles bisher Gezeigte erneut ansehen
// - kann Inhalte markieren (bleibt lokal gespeichert)

import { ladeThema, themaInfo } from "./daten/themen.js";
import { renderFolie } from "./render.js";
import { abonniere, meldeAnwesenheit, konfiguriert } from "./sync.js";

const $ = (id) => document.getElementById(id);

const url = new URL(location.href);
const raum = (url.searchParams.get("raum") || "").toUpperCase();

let thema = null;
let themaId = null;
let lehrerFolie = 0;     // wo der Lehrer gerade ist (= obere Grenze)
let meineFolie = 0;      // wo der Schüler gerade schaut
let folge = true;        // automatisch dem Lehrer folgen?

if (!raum) {
  $("banner").innerHTML = `<div class="banner">Kein Raum-Code. Bitte über den QR-Code deines Fahrlehrers oder die Startseite beitreten.</div>`;
}

if (!konfiguriert()) {
  $("banner").innerHTML = `<div class="banner"><b>Noch keine Live-Verbindung:</b> Der Unterrichtsraum ist erst aktiv,
    wenn dein Fahrlehrer das Backend eingerichtet hat. Frag kurz nach 🙂</div>`;
}

function markKey(i) { return `${raum}:${themaId}:${i}`; }

function zeige() {
  if (!thema) return;
  const f = thema.folien[meineFolie];
  renderFolie(f, $("folie"), { markieren: true, markKey: markKey(meineFolie) });
  $("nr").textContent = meineFolie + 1;
  $("gesamt").textContent = thema.folien.length;
  $("balken").style.width = ((lehrerFolie + 1) / thema.folien.length * 100) + "%";
  $("zurueck").disabled = meineFolie === 0;
  $("weiter").disabled = meineFolie >= lehrerFolie;   // KEIN Vorblättern
  livePilleSetzen();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function livePilleSetzen() {
  const aktuell = folge && meineFolie === lehrerFolie;
  $("livePille").className = "pille live-pille " + (aktuell ? "an" : "warn");
  $("liveText").textContent = aktuell ? "Live" : "Tippen zum Aufholen";
  $("ampel").classList.toggle("live", aktuell);
}

// Eigenes Blättern (nur innerhalb des Erlaubten)
$("weiter").addEventListener("click", () => {
  if (meineFolie < lehrerFolie) { meineFolie++; folge = (meineFolie === lehrerFolie); zeige(); }
});
$("zurueck").addEventListener("click", () => {
  if (meineFolie > 0) { meineFolie--; folge = false; zeige(); }
});
$("livePille").addEventListener("click", () => { folge = true; meineFolie = lehrerFolie; zeige(); });

async function wechsleThema(neuId) {
  themaId = neuId;
  thema = await ladeThema(themaId);
  const info = themaInfo(themaId);
  $("kopfThema").textContent = info ? `Thema ${info.nummer}: ${thema?.titel || ""}` : "";
}

// ---- Live zuhören ----
if (raum && konfiguriert()) {
  meldeAnwesenheit(raum);
  abonniere(raum, async (stand) => {
    if (!stand || stand.thema == null) {
      $("kopfThema").textContent = "warte auf den Fahrlehrer…";
      return;
    }
    if (stand.thema !== themaId) {
      await wechsleThema(stand.thema);
      meineFolie = 0; folge = true;
    }
    if (!thema) return;
    lehrerFolie = Math.min(stand.folie ?? 0, thema.folien.length - 1);
    if (folge) meineFolie = lehrerFolie;
    if (meineFolie > lehrerFolie) meineFolie = lehrerFolie; // Sicherheitsnetz
    zeige();
  });
}
