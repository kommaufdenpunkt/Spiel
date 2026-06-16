// Lehrer-Konsole: Raum erstellen, QR zeigen, Folien steuern,
// und den Stand live an alle Schüler senden.

import { THEMEN, ladeThema, themaInfo } from "./daten/themen.js";
import { renderFolie } from "./render.js";
import { setStand, beobachteTeilnehmer, konfiguriert } from "./sync.js";

const $ = (id) => document.getElementById(id);

// ---- Raum-Code bestimmen (oder erzeugen) ----
const url = new URL(location.href);
let raum = (url.searchParams.get("raum") || "").toUpperCase();
if (!raum) {
  const buchst = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // ohne I/O zur Verwechslungs-Vermeidung
  raum = Array.from({ length: 4 }, () => buchst[Math.floor(Math.random() * buchst.length)]).join("");
  url.searchParams.set("raum", raum);
  history.replaceState(null, "", url);
}

let themaId = (url.searchParams.get("thema") || "05");
let thema = null;
let index = 0;

// ---- Themenauswahl füllen ----
THEMEN.forEach((t) => {
  const o = document.createElement("option");
  o.value = t.id;
  o.textContent = `Thema ${t.nummer}: ${t.titel}` + (t.verfuegbar ? "" : " (in Vorbereitung)");
  o.disabled = !t.verfuegbar;
  $("themaWahl").appendChild(o);
});
$("themaWahl").value = themaInfo(themaId)?.verfuegbar ? themaId : "05";
themaId = $("themaWahl").value;

// ---- QR-Code + Link ----
const schuelerLink = new URL("schueler.html", location.href);
schuelerLink.searchParams.set("raum", raum);
const linkText = schuelerLink.toString();

$("raumCode").textContent = raum;
$("codeGross").textContent = raum;
$("raumLink").textContent = linkText;
$("domainName").textContent = location.hostname || "ginoco.de";

function macheQR(ziel, text, groesse) {
  ziel.innerHTML = "";
  if (window.QRCode) {
    new window.QRCode(ziel, { text, width: groesse, height: groesse, correctLevel: window.QRCode.CorrectLevel.M });
  } else {
    ziel.innerHTML = `<div style="color:#000;padding:1rem;font-size:.8rem">QR-Bibliothek nicht geladen.<br>Link:<br>${text}</div>`;
  }
}
macheQR($("qrBox"), linkText, 200);

// QR groß (Beamer)
$("qrGross").addEventListener("click", () => {
  macheQR($("qrGrossBox"), linkText, 460);
  $("overlay").classList.add("an");
});
$("overlayZu").addEventListener("click", () => $("overlay").classList.remove("an"));

// ---- Status / Banner ----
function statusSetzen() {
  const live = konfiguriert();
  $("ampel").classList.toggle("live", live);
  $("statusPille").className = "pille " + (live ? "an" : "warn");
  $("statusText").textContent = live ? "Live verbunden" : "Test-Modus";
  if (!live) {
    $("banner").innerHTML = `<div class="banner"><b>Test-Modus:</b> Du kannst die Lektion schon durchklicken,
      aber Schüler-Handys folgen noch nicht automatisch. Trage dafür einmalig deine Firebase-Daten in
      <code>assets/js/firebase-config.js</code> ein (Anleitung in der README).</div>`;
  }
}
statusSetzen();

// ---- Thema laden & anzeigen ----
async function ladeUndZeige(neuId, startIndex = 0) {
  themaId = neuId;
  thema = await ladeThema(themaId);
  if (!thema) return;
  index = Math.min(startIndex, thema.folien.length - 1);
  const info = themaInfo(themaId);
  $("kopfThema").textContent = `Thema ${info.nummer}: ${thema.titel}`;
  $("gesamt").textContent = thema.folien.length;
  url.searchParams.set("thema", themaId);
  history.replaceState(null, "", url);
  zeige();
}

function zeige() {
  renderFolie(thema.folien[index], $("folie"), { interaktiv: true });
  $("nr").textContent = index + 1;
  $("balken").style.width = ((index + 1) / thema.folien.length * 100) + "%";
  $("zurueck").disabled = index === 0;
  $("weiter").disabled = index === thema.folien.length - 1;
  senden();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function senden() {
  setStand(raum, { thema: themaId, folie: index, titel: thema.titel, gesamt: thema.folien.length });
}

$("weiter").addEventListener("click", () => { if (index < thema.folien.length - 1) { index++; zeige(); } });
$("zurueck").addEventListener("click", () => { if (index > 0) { index--; zeige(); } });
document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, select, textarea")) return; // nicht beim Tippen blättern
  if ($("overlay").classList.contains("an")) return;       // nicht hinter dem QR-Vollbild
  if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); $("weiter").click(); }
  if (e.key === "ArrowLeft") { e.preventDefault(); $("zurueck").click(); }
});

$("themaWahl").addEventListener("change", (e) => ladeUndZeige(e.target.value, 0));

// ---- Teilnehmer zählen ----
beobachteTeilnehmer(raum, (n) => { $("teilnehmerZahl").textContent = n; });

ladeUndZeige(themaId, 0);
