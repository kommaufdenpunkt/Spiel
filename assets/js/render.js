// Render-Engine: macht aus einem Folien-Objekt sichtbares HTML.
// Unterstützt Text-Folien UND interaktive Spiel-Folien
// (Quiz, Lückentext, Zuordnung, Kreuzworträtsel).
// Wird von Lehrer- und Schüleransicht gemeinsam genutzt.

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

function mische(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- Markieren (nur Schüler): Inhaltsblöcke antippbar machen ----
function markierbar(el, opts, blockId) {
  if (!opts.markieren) return;
  el.classList.add("markierbar");
  const key = opts.markKey;
  const gemerkt = ladeMarkierungen(key);
  if (gemerkt.includes(blockId)) el.classList.add("markiert");
  el.addEventListener("click", () => {
    el.classList.toggle("markiert");
    const set = new Set(ladeMarkierungen(key));
    el.classList.contains("markiert") ? set.add(blockId) : set.delete(blockId);
    localStorage.setItem("mark:" + key, JSON.stringify([...set]));
  });
}
function ladeMarkierungen(key) {
  try { return JSON.parse(localStorage.getItem("mark:" + key) || "[]"); }
  catch { return []; }
}

// ============================================================
export function renderFolie(folie, ziel, opts = {}) {
  ziel.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "folie folie-" + folie.typ;

  const map = {
    titel: rTitel, agenda: rListe, lernziele: rListe, zusammenfassung: rListe,
    inhalt: rInhalt, abschluss: rTitel, frage: rFrage,
    lueckentext: rLueckentext, zuordnung: rZuordnung,
    kreuzwortraetsel: rKreuzwort
  };
  (map[folie.typ] || rInhalt)(folie, wrap, opts);
  ziel.appendChild(wrap);
}

// ---------- Titel / Abschluss ----------
function rTitel(f, w) {
  if (f.kicker) w.insertAdjacentHTML("beforeend", `<div class="kicker">${esc(f.kicker)}</div>`);
  w.insertAdjacentHTML("beforeend", `<h1 class="gross">${esc(f.titel)}</h1>`);
  if (f.untertitel) w.insertAdjacentHTML("beforeend", `<p class="untertitel">${esc(f.untertitel)}</p>`);
  if (f.hinweis) w.insertAdjacentHTML("beforeend", `<div class="hinweis">${esc(f.hinweis)}</div>`);
}

// ---------- Aufzählungen (Agenda/Lernziele/Zusammenfassung) ----------
function rListe(f, w, opts) {
  const icon = f.typ === "zusammenfassung" ? "✓" : f.typ === "agenda" ? "›" : "★";
  w.insertAdjacentHTML("beforeend", `<h2>${esc(f.titel)}</h2>`);
  const ul = document.createElement("ul");
  ul.className = "punkte";
  (f.punkte || []).forEach((p, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="bullet">${icon}</span><span>${esc(p)}</span>`;
    markierbar(li, opts, "l" + i);
    ul.appendChild(li);
  });
  w.appendChild(ul);
}

// ---------- Inhaltsfolie ----------
function rInhalt(f, w, opts) {
  w.insertAdjacentHTML("beforeend", `<h2>${esc(f.titel)}</h2>`);
  if (f.einleitung) w.insertAdjacentHTML("beforeend", `<p class="einleitung">${esc(f.einleitung)}</p>`);
  (f.bloecke || []).forEach((b, i) => {
    const div = document.createElement("div");
    div.className = "block" + (b.betont ? " betont" : "");
    div.innerHTML = `<span class="punkt-icon">${b.betont ? "❗" : "•"}</span><span>${esc(b.text)}</span>`;
    markierbar(div, opts, "b" + i);
    w.appendChild(div);
  });
  if (f.merksatz) w.insertAdjacentHTML("beforeend",
    `<div class="merksatz"><span>💡 Merksatz</span>${esc(f.merksatz)}</div>`);
  if (f.quelle) w.insertAdjacentHTML("beforeend", `<div class="quelle">Quelle: ${esc(f.quelle)}</div>`);
}

// ---------- Quiz ----------
function rFrage(f, w) {
  w.insertAdjacentHTML("beforeend", `<div class="kicker">🧠 ${esc(f.titel || "Mitdenken")}</div>`);
  w.insertAdjacentHTML("beforeend", `<h2 class="frage-text">${esc(f.frage)}</h2>`);
  const box = document.createElement("div");
  box.className = "optionen";
  const rueck = document.createElement("div");
  rueck.className = "rueckmeldung";
  let beantwortet = false;

  f.optionen.forEach((opt, i) => {
    const b = document.createElement("button");
    b.className = "option";
    b.innerHTML = `<span class="opt-marke">${String.fromCharCode(65 + i)}</span><span>${esc(opt)}</span>`;
    b.addEventListener("click", () => {
      if (beantwortet) return;
      beantwortet = true;
      [...box.children].forEach((c, j) => {
        c.classList.add("gesperrt");
        if (j === f.loesung) c.classList.add("richtig");
      });
      if (i !== f.loesung) b.classList.add("falsch");
      rueck.className = "rueckmeldung " + (i === f.loesung ? "gut" : "schlecht");
      rueck.innerHTML = `<strong>${i === f.loesung ? "Richtig! ✅" : "Nicht ganz."}</strong> ${esc(f.erklaerung || "")}`;
    });
    box.appendChild(b);
  });
  w.appendChild(box);
  w.appendChild(rueck);
}

// ---------- Lückentext ----------
function rLueckentext(f, w) {
  w.insertAdjacentHTML("beforeend", `<div class="kicker">✏️ Lückentext</div>`);
  w.insertAdjacentHTML("beforeend", `<h2>${esc(f.titel || "Lückentext")}</h2>`);
  if (f.einleitung) w.insertAdjacentHTML("beforeend", `<p class="einleitung">${esc(f.einleitung)}</p>`);

  const teile = f.text.split(/\[\[(.+?)\]\]/g); // gerade Indizes = Text, ungerade = Lösung
  const loesungen = [];
  for (let i = 1; i < teile.length; i += 2) loesungen.push(teile[i]);
  const bank = mische([...new Set([...loesungen, ...(f.ablenker || [])])]);

  const p = document.createElement("p");
  p.className = "lueckentext";
  const selects = [];
  teile.forEach((t, i) => {
    if (i % 2 === 0) {
      p.appendChild(document.createTextNode(t));
    } else {
      const sel = document.createElement("select");
      sel.className = "luecke";
      sel.dataset.loesung = t;
      sel.innerHTML = `<option value="">— ? —</option>` +
        bank.map((wW) => `<option value="${esc(wW)}">${esc(wW)}</option>`).join("");
      selects.push(sel);
      p.appendChild(sel);
    }
  });
  w.appendChild(p);

  const aktion = document.createElement("div");
  aktion.className = "aktionen";
  const pruefen = knopf("Prüfen ✓", "primaer");
  const rueck = document.createElement("div");
  rueck.className = "rueckmeldung";
  pruefen.addEventListener("click", () => {
    let richtig = 0;
    selects.forEach((s) => {
      const ok = s.value === s.dataset.loesung;
      s.classList.toggle("ok", ok);
      s.classList.toggle("nok", !ok);
      if (ok) richtig++;
    });
    const alle = selects.length;
    rueck.className = "rueckmeldung " + (richtig === alle ? "gut" : "schlecht");
    rueck.innerHTML = `<strong>${richtig} von ${alle} richtig.</strong>` +
      (richtig === alle ? " Stark! ✅" : " Korrigiere die roten Lücken.");
  });
  aktion.appendChild(pruefen);
  w.appendChild(aktion);
  w.appendChild(rueck);
}

// ---------- Zuordnung ----------
function rZuordnung(f, w) {
  w.insertAdjacentHTML("beforeend", `<div class="kicker">🔗 Zuordnung</div>`);
  w.insertAdjacentHTML("beforeend", `<h2>${esc(f.titel || "Zuordnen")}</h2>`);
  if (f.einleitung) w.insertAdjacentHTML("beforeend", `<p class="einleitung">${esc(f.einleitung)}</p>`);

  const rechtsBank = mische(f.paare.map((p) => p.rechts));
  const reihen = [];
  const liste = document.createElement("div");
  liste.className = "zuordnung";
  f.paare.forEach((paar) => {
    const row = document.createElement("div");
    row.className = "z-reihe";
    const sel = document.createElement("select");
    sel.dataset.loesung = paar.rechts;
    sel.innerHTML = `<option value="">— wählen —</option>` +
      rechtsBank.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join("");
    row.innerHTML = `<div class="z-links">${esc(paar.links)}</div><div class="z-pfeil">→</div>`;
    const halter = document.createElement("div");
    halter.className = "z-rechts";
    halter.appendChild(sel);
    row.appendChild(halter);
    reihen.push(sel);
    liste.appendChild(row);
  });
  w.appendChild(liste);

  const aktion = document.createElement("div");
  aktion.className = "aktionen";
  const pruefen = knopf("Prüfen ✓", "primaer");
  const rueck = document.createElement("div");
  rueck.className = "rueckmeldung";
  pruefen.addEventListener("click", () => {
    let richtig = 0;
    reihen.forEach((s) => {
      const ok = s.value === s.dataset.loesung;
      s.classList.toggle("ok", ok);
      s.classList.toggle("nok", !ok);
      if (ok) richtig++;
    });
    rueck.className = "rueckmeldung " + (richtig === reihen.length ? "gut" : "schlecht");
    rueck.innerHTML = `<strong>${richtig} von ${reihen.length} richtig.</strong>` +
      (richtig === reihen.length ? " Perfekt! ✅" : " Versuch die roten nochmal.");
  });
  aktion.appendChild(pruefen);
  w.appendChild(aktion);
  w.appendChild(rueck);
}

// ---------- Kreuzworträtsel ----------
function rKreuzwort(f, w) {
  w.insertAdjacentHTML("beforeend", `<div class="kicker">🧩 Kreuzworträtsel</div>`);
  w.insertAdjacentHTML("beforeend", `<h2>${esc(f.titel || "Kreuzworträtsel")}</h2>`);
  if (f.einleitung) w.insertAdjacentHTML("beforeend", `<p class="einleitung">${esc(f.einleitung)}</p>`);

  const Z = f.groesse.zeilen, S = f.groesse.spalten;
  const loesung = Array.from({ length: Z }, () => Array(S).fill(null));
  const nummern = Array.from({ length: Z }, () => Array(S).fill(0));

  // Lösungsbuchstaben + Startnummern setzen
  const eintraege = f.eintraege.map((e, idx) => ({ ...e, nr: idx + 1 }));
  eintraege.forEach((e) => {
    nummern[e.zeile][e.spalte] = e.nr;
    for (let i = 0; i < e.wort.length; i++) {
      const r = e.zeile + (e.richtung === "senkrecht" ? i : 0);
      const c = e.spalte + (e.richtung === "waagerecht" ? i : 0);
      loesung[r][c] = e.wort[i].toUpperCase();
    }
  });

  const grid = document.createElement("div");
  grid.className = "kw-grid";
  grid.style.gridTemplateColumns = `repeat(${S}, var(--kw-zelle))`;
  const inputs = [];
  for (let r = 0; r < Z; r++) {
    for (let c = 0; c < S; c++) {
      const zelle = document.createElement("div");
      if (loesung[r][c] === null) {
        zelle.className = "kw-leer";
      } else {
        zelle.className = "kw-zelle";
        if (nummern[r][c]) zelle.insertAdjacentHTML("beforeend", `<span class="kw-nr">${nummern[r][c]}</span>`);
        const inp = document.createElement("input");
        inp.maxLength = 1;
        inp.dataset.loesung = loesung[r][c];
        inp.addEventListener("input", () => { inp.value = inp.value.toUpperCase(); inp.classList.remove("ok", "nok"); });
        zelle.appendChild(inp);
        inputs.push(inp);
      }
      grid.appendChild(zelle);
    }
  }
  w.appendChild(grid);

  // Fragen
  const fragen = document.createElement("div");
  fragen.className = "kw-fragen";
  ["waagerecht", "senkrecht"].forEach((richtung) => {
    const teil = eintraege.filter((e) => e.richtung === richtung);
    if (!teil.length) return;
    const h = richtung === "waagerecht" ? "Waagerecht" : "Senkrecht";
    fragen.insertAdjacentHTML("beforeend", `<h3>${h}</h3>`);
    const ul = document.createElement("ul");
    teil.forEach((e) => ul.insertAdjacentHTML("beforeend", `<li><b>${e.nr}.</b> ${esc(e.frage)}</li>`));
    fragen.appendChild(ul);
  });
  w.appendChild(fragen);

  const aktion = document.createElement("div");
  aktion.className = "aktionen";
  const pruefen = knopf("Prüfen ✓", "primaer");
  const zeigen = knopf("Lösung zeigen", "geist");
  const rueck = document.createElement("div");
  rueck.className = "rueckmeldung";
  pruefen.addEventListener("click", () => {
    let richtig = 0;
    inputs.forEach((inp) => {
      const ok = inp.value.toUpperCase() === inp.dataset.loesung;
      inp.classList.toggle("ok", ok);
      inp.classList.toggle("nok", !ok && inp.value !== "");
      if (ok) richtig++;
    });
    rueck.className = "rueckmeldung " + (richtig === inputs.length ? "gut" : "schlecht");
    rueck.innerHTML = `<strong>${richtig} von ${inputs.length} Feldern richtig.</strong>` +
      (richtig === inputs.length ? " Gelöst! ✅" : "");
  });
  zeigen.addEventListener("click", () => {
    inputs.forEach((inp) => { inp.value = inp.dataset.loesung; inp.classList.add("ok"); inp.classList.remove("nok"); });
    rueck.className = "rueckmeldung gut";
    rueck.innerHTML = "<strong>Lösung eingeblendet.</strong>";
  });
  aktion.appendChild(pruefen);
  aktion.appendChild(zeigen);
  w.appendChild(aktion);
  w.appendChild(rueck);
}

function knopf(text, klasse) {
  const b = document.createElement("button");
  b.className = "btn " + (klasse || "");
  b.textContent = text;
  return b;
}
