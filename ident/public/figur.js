/* figur.js – Mii-/Wii-artiger Figuren-Baukasten + Erklär-Video (Aufklärung)
 * Reine Browser-Technik: SVG-Figuren + Sprachausgabe (speechSynthesis).
 * Kein Netzwerk außer /api/intro (der Aufklärungstext aus dem Admin-Bereich).
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  // ---- Auswahl-Listen (Traits) --------------------------------------------
  var SKIN   = ['#f6d3b8', '#f0c19b', '#e8ac86', '#d69a6e', '#b97a4e', '#8d5524', '#5c3a1e'];
  var HAIR   = ['#1b1b1b', '#3a2a1a', '#6b4423', '#a5642e', '#c9962b', '#d9d0c0', '#9aa0a6', '#e8e4dc', '#7a1f1f'];
  var SHIRT  = ['#3b6ef0', '#23a952', '#e8975d', '#8a4fdb', '#e14b6a', '#1f2937', '#e9eefb', '#0ea5a5'];
  var BG     = ['#20304f', '#2b1f3a', '#123a2e', '#3a2418', '#40263a', '#1f2937', '#0d1320'];

  var FACE   = ['rund', 'oval', 'kantig'];
  var HAIRSTYLE = ['glatze', 'kurz', 'buerste', 'seitenscheitel', 'lockig', 'zopf', 'lang', 'undercut'];
  var BROWS  = ['normal', 'buschig', 'duenn', 'hoch'];
  var EYES   = ['rund', 'schmal', 'gross'];
  var NOSE   = ['klein', 'mittel', 'breit'];
  var BEARD  = ['keiner', 'stoppeln', 'schnauzer', 'ziege', 'vollbart'];
  var GLASS  = ['keine', 'rund', 'eckig', 'sonne'];
  var MOUTH  = ['laecheln', 'neutral', 'grinsen'];

  // Zyklische Steuerungen (Label -> Optionen), landen in #controls
  var CYCLERS = [
    { key: 'face',   label: 'Kopfform',    opts: FACE },
    { key: 'hair',   label: 'Frisur',      opts: HAIRSTYLE },
    { key: 'brows',  label: 'Augenbrauen', opts: BROWS },
    { key: 'eyes',   label: 'Augen',       opts: EYES },
    { key: 'nose',   label: 'Nase',        opts: NOSE },
    { key: 'beard',  label: 'Bart',        opts: BEARD },
    { key: 'glass',  label: 'Brille',      opts: GLASS },
    { key: 'mouth',  label: 'Mund',        opts: MOUTH }
  ];

  // Teamleitung 4EVER1 (Foto-Reihenfolge von links: Gino, Dennis, Lisa)
  var PRESET = [
    { name: 'Gino',   role: 'Für euch & das Optische', face: 0, hair: 1, brows: 0, eyes: 0, nose: 1, beard: 1, glass: 0, mouth: 0, skin: 1, hairColor: 0, shirt: 0, bg: 0 },
    { name: 'Dennis', role: 'Verwaltung & Konflikte',   face: 2, hair: 3, brows: 1, eyes: 1, nose: 1, beard: 4, glass: 0, mouth: 1, skin: 2, hairColor: 1, shirt: 5, bg: 0 },
    { name: 'Lisa',   role: 'Teamleitung & Events',     face: 1, hair: 6, brows: 2, eyes: 2, nose: 0, beard: 0, glass: 0, mouth: 0, skin: 0, hairColor: 5, shirt: 4, bg: 0 }
  ];
  function defaultFig(i) {
    var p = PRESET[i] || PRESET[0];
    var out = {}; for (var k in p) out[k] = p[k];
    return out;
  }

  // ---- Standard-Erklärtext (Team + PK Board) ------------------------------
  // Zeilen mit "Name:" werden von dieser Figur gesprochen, sonst abwechselnd.
  var DEFAULT_SCRIPT = [
    'Gino: Hey, schön dass du da bist! Ich bin Gino und kümmere mich um euch und um alles Optische zusammen mit dem Team.',
    'Lisa: Ich bin Lisa, die Teamleitung. Ich organisiere die Piccos, halte die Events und bin für eure Fragen da.',
    'Dennis: Und ich bin Dennis. Ich verwalte die Agentur und bin da, wenn es mal Konflikte gibt.',
    'Gino: Wir drei sind zusammen die Teamleitung von 4EVER1 und immer für euch ansprechbar.',
    'Dennis: Wenn wir etwas ankündigen oder euch auszahlen, achtet bitte darauf und macht keinen Quatsch.',
    'Lisa: Beleidigungen oder Aussagen gegen die Agentur dulden wir nicht – bleibt bitte fair und respektvoll.',
    'Gino: Ganz wichtig ist unsere App: das PK Board. Dort findet einfach alles statt.',
    'Lisa: Im PK Board gibt es die PK-Cards und alle Ankündigungen. Bitte nutzt die App wirklich.',
    'Dennis: WhatsApp-Gruppen laufen jetzt noch, aber sobald die App online ist, verschwinden sie.',
    'Gino: Das schützt euch – ihr müsst eure Telefonnummer nicht mehr rausgeben.',
    'Lisa: Datenschutz ist uns sehr wichtig. Wir sind niemals verpflichtet, Handynummern weiterzugeben.',
    'Dennis: Lade dir also das PK Board – dort machen wir alles zusammen. Willkommen bei 4EVER1!'
  ].join('\n');

  // ---- Speicher ------------------------------------------------------------
  var KEY = 'ident.figuren.v1';
  var SCRIPT_KEY = 'ident.figuren.script.v1';
  var team = load();
  var cur = 0; // aktiver Tab

  function loadScript() {
    try { var s = localStorage.getItem(SCRIPT_KEY); if (typeof s === 'string' && s.trim()) return s; } catch (e) {}
    return DEFAULT_SCRIPT;
  }
  function saveScript(txt) { try { localStorage.setItem(SCRIPT_KEY, txt); return true; } catch (e) { return false; } }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length === 3) return arr.map(sanitize);
      }
    } catch (e) {}
    return [defaultFig(0), defaultFig(1), defaultFig(2)];
  }
  function sanitize(f) {
    var d = defaultFig(0);
    var out = {};
    for (var k in d) out[k] = (f && typeof f[k] !== 'undefined') ? f[k] : d[k];
    // Zahlen begrenzen
    CYCLERS.forEach(function (c) { out[c.key] = clampIdx(out[c.key], c.opts.length); });
    out.skin = clampIdx(out.skin, SKIN.length);
    out.hairColor = clampIdx(out.hairColor, HAIR.length);
    out.shirt = clampIdx(out.shirt, SHIRT.length);
    out.bg = clampIdx(out.bg, BG.length);
    out.name = String(out.name || '').slice(0, 16);
    out.role = String(out.role || '').slice(0, 48);
    return out;
  }
  function clampIdx(v, n) { v = parseInt(v, 10); if (isNaN(v) || v < 0) v = 0; return v % n; }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(team)); return true; }
    catch (e) { return false; }
  }

  // ---- SVG-Rendering -------------------------------------------------------
  // opts.mouthOpen: Mund für Sprech-Animation öffnen
  function renderFigure(f, opts) {
    opts = opts || {};
    var skin = SKIN[f.skin], hair = HAIR[f.hairColor], shirt = SHIRT[f.shirt], bg = BG[f.bg];
    var dark = shade(skin, -0.18); // Schatten/Kontur

    // Kopf-Geometrie je nach Kopfform
    var cx = 100, cy = 95, rx = 46, ry = 52, corner = 46;
    if (FACE[f.face] === 'oval') { rx = 42; ry = 56; }
    if (FACE[f.face] === 'kantig') { rx = 46; ry = 50; corner = 22; }

    var s = '';
    s += '<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Figur">';
    // Hintergrund
    s += '<rect x="0" y="0" width="200" height="220" rx="18" fill="' + bg + '"/>';
    s += '<ellipse cx="100" cy="215" rx="70" ry="24" fill="' + shade(bg, 0.12) + '"/>';

    // Schultern / Shirt
    s += '<path d="M40 220 q0 -46 60 -46 q60 0 60 46 Z" fill="' + shirt + '"/>';
    s += '<path d="M78 178 q22 20 44 0 l0 14 q-22 16 -44 0 Z" fill="' + shade(shirt, -0.14) + '"/>';
    // Hals
    s += '<rect x="86" y="150" width="28" height="30" rx="12" fill="' + dark + '"/>';

    // Haare hinten (bei langen Frisuren)
    s += hairBack(f, hair, cx, cy, rx, ry);

    // Ohren
    s += '<ellipse cx="' + (cx - rx + 4) + '" cy="' + cy + '" rx="9" ry="13" fill="' + skin + '"/>';
    s += '<ellipse cx="' + (cx + rx - 4) + '" cy="' + cy + '" rx="9" ry="13" fill="' + skin + '"/>';

    // Kopf
    s += roundedFace(cx, cy, rx, ry, corner, skin);

    // Bart (unter Mund, über Haut)
    s += beard(f, cx, cy, ry, hair);

    // Augenbrauen
    s += brows(f, cx, cy, hair);

    // Augen
    s += eyes(f, cx, cy);

    // Nase
    s += nose(f, cx, cy, dark);

    // Mund (Sprech-Animation überschreibt Form)
    s += mouth(f, cx, cy, opts.mouthOpen);

    // Haare oben/vorne
    s += hairFront(f, hair, cx, cy, rx, ry);

    // Brille (ganz oben)
    s += glasses(f, cx, cy);

    s += '</svg>';
    return s;
  }

  function roundedFace(cx, cy, rx, ry, corner, skin) {
    // "kantig" nutzt ein Rechteck mit Radius, sonst Ellipse
    if (corner < 30) {
      var x = cx - rx, y = cy - ry, w = rx * 2, h = ry * 2;
      return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + corner + '" fill="' + skin + '"/>';
    }
    return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + skin + '"/>';
  }

  function eyeXs(cx) { return [cx - 18, cx + 18]; }

  function eyes(f, cx, cy) {
    var xs = eyeXs(cx), ey = cy + 2, kind = EYES[f.eyes], s = '';
    xs.forEach(function (x) {
      if (kind === 'schmal') {
        s += '<rect x="' + (x - 8) + '" y="' + (ey - 3) + '" width="16" height="7" rx="3.5" fill="#fff"/>';
        s += '<circle cx="' + x + '" cy="' + (ey + 0.5) + '" r="3.4" fill="#26313f"/>';
      } else {
        var r = kind === 'gross' ? 9 : 7;
        s += '<ellipse cx="' + x + '" cy="' + ey + '" rx="' + r + '" ry="' + (r + 1) + '" fill="#fff"/>';
        s += '<circle cx="' + x + '" cy="' + (ey + 1) + '" r="' + (r - 3.4) + '" fill="#26313f"/>';
        s += '<circle cx="' + (x + 1.5) + '" cy="' + (ey - 1) + '" r="1.3" fill="#fff"/>';
      }
    });
    return s;
  }

  function brows(f, cx, cy, hair) {
    var xs = eyeXs(cx), by = cy - 12, kind = BROWS[f.brows], s = '';
    var w = kind === 'duenn' ? 12 : 14, th = kind === 'buschig' ? 5 : (kind === 'duenn' ? 2.2 : 3.4);
    var lift = kind === 'hoch' ? -5 : 0;
    xs.forEach(function (x) {
      s += '<rect x="' + (x - w / 2) + '" y="' + (by + lift) + '" width="' + w + '" height="' + th + '" rx="' + (th / 2) + '" fill="' + shade(hair, -0.08) + '"/>';
    });
    return s;
  }

  function nose(f, cx, cy, dark) {
    var kind = NOSE[f.nose], ny = cy + 16;
    var w = kind === 'breit' ? 11 : (kind === 'klein' ? 5 : 8);
    return '<path d="M' + cx + ' ' + (cy + 2) + ' q-' + (w / 2) + ' ' + (ny - cy) + ' 0 ' + (ny - cy - 2) +
           ' q' + (w / 2) + ' 2 ' + (w / 2) + ' -2" fill="none" stroke="' + dark + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' +
           '<ellipse cx="' + cx + '" cy="' + (ny - 1) + '" rx="' + (w / 2 + 1) + '" ry="2.6" fill="' + dark + '" opacity=".35"/>';
  }

  function mouth(f, cx, cy, open) {
    var my = cy + 32;
    if (open) {
      // sprechender, offener Mund
      return '<ellipse cx="' + cx + '" cy="' + my + '" rx="10" ry="8" fill="#5c2b2b"/>' +
             '<ellipse cx="' + cx + '" cy="' + (my + 3) + '" rx="6" ry="3.4" fill="#c0566a"/>';
    }
    var kind = MOUTH[f.mouth];
    if (kind === 'neutral') return '<rect x="' + (cx - 12) + '" y="' + (my - 1.5) + '" width="24" height="3.4" rx="1.7" fill="#7a3b3b"/>';
    if (kind === 'grinsen') return '<path d="M' + (cx - 15) + ' ' + my + ' q15 20 30 0 q-15 6 -30 0 Z" fill="#fff" stroke="#7a3b3b" stroke-width="2"/>';
    return '<path d="M' + (cx - 14) + ' ' + my + ' q14 16 28 0" fill="none" stroke="#7a3b3b" stroke-width="3" stroke-linecap="round"/>';
  }

  function beard(f, cx, cy, ry, hair) {
    var kind = BEARD[f.beard]; if (kind === 'keiner') return '';
    var col = shade(hair, -0.05), s = '';
    if (kind === 'schnauzer') {
      return '<path d="M' + (cx - 14) + ' ' + (cy + 26) + ' q14 -8 28 0 q-14 8 -28 0 Z" fill="' + col + '"/>';
    }
    if (kind === 'ziege') {
      s += '<path d="M' + (cx - 14) + ' ' + (cy + 26) + ' q14 -6 28 0 q-14 6 -28 0 Z" fill="' + col + '"/>';
      s += '<path d="M' + (cx - 8) + ' ' + (cy + 38) + ' q8 12 16 0 q-8 6 -16 0 Z" fill="' + col + '"/>';
      return s;
    }
    if (kind === 'stoppeln') {
      return '<path d="M' + (cx - 34) + ' ' + (cy + 18) + ' q34 44 68 0 q-6 30 -34 30 q-28 0 -34 -30 Z" fill="' + col + '" opacity=".38"/>';
    }
    // vollbart
    s += '<path d="M' + (cx - 36) + ' ' + (cy + 8) + ' q36 60 72 0 q-4 44 -36 44 q-32 0 -36 -44 Z" fill="' + col + '"/>';
    s += '<path d="M' + (cx - 14) + ' ' + (cy + 26) + ' q14 -8 28 0 q-14 8 -28 0 Z" fill="' + shade(col, -0.1) + '"/>';
    return s;
  }

  function glasses(f, cx, cy) {
    var kind = GLASS[f.glass]; if (kind === 'keine') return '';
    var xs = eyeXs(cx), ey = cy + 2, s = '', stroke = '#1b2431';
    var fill = kind === 'sonne' ? '#141a24' : 'none', op = kind === 'sonne' ? '.85' : '1';
    xs.forEach(function (x) {
      if (kind === 'eckig') s += '<rect x="' + (x - 12) + '" y="' + (ey - 10) + '" width="24" height="20" rx="4" fill="' + fill + '" fill-opacity="' + op + '" stroke="' + stroke + '" stroke-width="2.6"/>';
      else s += '<circle cx="' + x + '" cy="' + ey + '" r="11.5" fill="' + fill + '" fill-opacity="' + op + '" stroke="' + stroke + '" stroke-width="2.6"/>';
    });
    s += '<line x1="' + (xs[0] + 12) + '" y1="' + ey + '" x2="' + (xs[1] - 12) + '" y2="' + ey + '" stroke="' + stroke + '" stroke-width="2.6"/>';
    return s;
  }

  function hairBack(f, hair, cx, cy, rx, ry) {
    var style = HAIRSTYLE[f.hair];
    if (style === 'lang') return '<path d="M' + (cx - rx - 4) + ' ' + (cy - 10) + ' q-8 70 18 88 l' + (2 * rx + 8) + ' 0 q26 -18 18 -88 Z" fill="' + hair + '"/>';
    if (style === 'zopf') return '<ellipse cx="' + (cx + rx + 2) + '" cy="' + (cy + 30) + '" rx="10" ry="26" fill="' + hair + '"/>';
    return '';
  }

  function hairFront(f, hair, cx, cy, rx, ry) {
    var style = HAIRSTYLE[f.hair];
    if (style === 'glatze') return '';
    var top = cy - ry, s = '', hl = shade(hair, 0.12);
    if (style === 'buerste') {
      s += '<path d="M' + (cx - rx) + ' ' + (cy - 18) + ' q0 -46 ' + rx + ' -46 q' + rx + ' 0 ' + rx + ' 46 q-' + rx + ' -22 -' + (2 * rx) + ' 0 Z" fill="' + hair + '"/>';
      return s;
    }
    if (style === 'undercut') {
      s += '<path d="M' + (cx - rx) + ' ' + (cy - 20) + ' q6 -44 ' + rx + ' -44 q' + rx + ' 0 ' + rx + ' 44 q-30 -18 -' + (2 * rx) + ' 6 Z" fill="' + hair + '"/>';
      s += '<path d="M' + (cx + 6) + ' ' + (cy - 40) + ' q' + (rx - 6) + ' 4 ' + (rx - 6) + ' 30" fill="none" stroke="' + hl + '" stroke-width="3" opacity=".5"/>';
      return s;
    }
    if (style === 'seitenscheitel') {
      s += '<path d="M' + (cx - rx) + ' ' + (cy - 14) + ' q-2 -50 ' + rx + ' -50 q' + rx + ' 0 ' + rx + ' 44 q-18 -30 -' + (rx + 10) + ' -22 q-' + (rx - 10) + ' 6 -' + (rx - 10) + ' 28 Z" fill="' + hair + '"/>';
      return s;
    }
    if (style === 'lockig') {
      s += '<path d="M' + (cx - rx) + ' ' + (cy - 12) + ' q-4 -30 12 -40 q6 -14 22 -10 q14 -12 30 -2 q18 -4 20 16 q10 8 4 34 q-14 -20 -44 -20 q-30 0 -44 22 Z" fill="' + hair + '"/>';
      return s;
    }
    if (style === 'zopf' || style === 'lang') {
      s += '<path d="M' + (cx - rx) + ' ' + (cy - 6) + ' q-4 -54 ' + rx + ' -54 q' + rx + ' 0 ' + rx + ' 54 q-14 -34 -' + rx + ' -34 q-' + rx + ' 0 -' + rx + ' 34 Z" fill="' + hair + '"/>';
      return s;
    }
    // kurz (Standard)
    s += '<path d="M' + (cx - rx) + ' ' + (cy - 12) + ' q0 -48 ' + rx + ' -48 q' + rx + ' 0 ' + rx + ' 48 q-16 -26 -' + rx + ' -26 q-' + rx + ' 0 -' + rx + ' 26 Z" fill="' + hair + '"/>';
    return s;
  }

  // Farbe abdunkeln/aufhellen (amt: -1..1)
  function shade(hex, amt) {
    var c = hex.replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    var r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
    function m(v) { v = Math.round(v + (amt < 0 ? v * amt : (255 - v) * amt)); return Math.max(0, Math.min(255, v)); }
    function h(v) { return ('0' + m(v).toString(16)).slice(-2); }
    return '#' + h(r) + h(g) + h(b);
  }

  // ---- UI: Tabs, Steuerungen, Swatches ------------------------------------
  function buildTabs() {
    var t = $('teamTabs'); t.innerHTML = '';
    team.forEach(function (f, i) {
      var b = document.createElement('button');
      b.textContent = f.name || ('Person ' + (i + 1));
      if (i === cur) b.className = 'sel';
      b.onclick = function () { cur = i; renderAll(); };
      t.appendChild(b);
    });
  }

  function buildControls() {
    var host = $('controls'); host.innerHTML = '';
    CYCLERS.forEach(function (c) {
      var row = document.createElement('div'); row.className = 'ctrl';
      var lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.textContent = c.label;
      var box = document.createElement('div'); box.className = 'cyc';
      var prev = document.createElement('button'); prev.className = 'iconbtn'; prev.textContent = '‹';
      var val = document.createElement('span'); val.className = 'val';
      var next = document.createElement('button'); next.className = 'iconbtn'; next.textContent = '›';
      function paint() { val.textContent = c.opts[team[cur][c.key]]; }
      prev.onclick = function () { var n = c.opts.length; team[cur][c.key] = (team[cur][c.key] + n - 1) % n; paint(); drawPreview(); };
      next.onclick = function () { var n = c.opts.length; team[cur][c.key] = (team[cur][c.key] + 1) % n; paint(); drawPreview(); };
      paint();
      box.appendChild(prev); box.appendChild(val); box.appendChild(next);
      row.appendChild(lbl); row.appendChild(box);
      host.appendChild(row);
    });
  }

  function buildSwatches(hostId, colors, key) {
    var host = $(hostId); host.innerHTML = '';
    colors.forEach(function (col, i) {
      var sw = document.createElement('span');
      sw.className = 'sw' + (team[cur][key] === i ? ' on' : '');
      sw.style.background = col;
      sw.title = col;
      sw.onclick = function () { team[cur][key] = i; buildSwatches(hostId, colors, key); drawPreview(); };
      host.appendChild(sw);
    });
  }

  function drawPreview() {
    $('preview').innerHTML = renderFigure(team[cur], {});
  }

  function renderAll() {
    buildTabs();
    $('figName').value = team[cur].name || '';
    $('figRole').value = team[cur].role || '';
    buildControls();
    buildSwatches('swSkin', SKIN, 'skin');
    buildSwatches('swHair', HAIR, 'hairColor');
    buildSwatches('swShirt', SHIRT, 'shirt');
    buildSwatches('swBg', BG, 'bg');
    drawPreview();
    drawVideoTeam();
  }

  // ---- Erklär-Video (rechts) ----------------------------------------------
  function drawVideoTeam(activeIdx, mouthOpen) {
    var host = $('videoTeam'); host.innerHTML = '';
    team.forEach(function (f, i) {
      var wrap = document.createElement('div'); wrap.className = 'fig';
      var active = (i === activeIdx);
      wrap.innerHTML = renderFigure(f, { mouthOpen: active && mouthOpen });
      if (active) { wrap.style.transform = 'translateY(-6px) scale(1.06)'; wrap.style.filter = 'drop-shadow(0 8px 18px rgba(91,140,255,.5))'; }
      wrap.style.transition = 'transform .18s ease, filter .18s ease';
      var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = f.name || ('Person ' + (i + 1));
      if (active) nm.style.color = 'var(--accent)';
      wrap.appendChild(nm);
      if (f.role) { var rl = document.createElement('div'); rl.className = 'nm'; rl.style.fontSize = '.68rem'; rl.style.opacity = '.75'; rl.textContent = f.role; wrap.appendChild(rl); }
      host.appendChild(wrap);
    });
  }

  // Skript in vortragbare Einträge zerlegen: {speaker, text}
  // "Name: ..." -> spricht die Figur mit diesem Namen (sonst reihum, speaker = -1)
  function parseScript(text) {
    var lines = String(text || '').split(/\n+/);
    var out = [], rot = 0;
    lines.forEach(function (line) {
      line = line.trim(); if (!line) return;
      var speaker = -1;
      var m = line.match(/^([\wÄÖÜäöüß .-]{1,16}):\s*(.+)$/);
      if (m) {
        var idx = findByName(m[1].trim());
        if (idx >= 0) { speaker = idx; line = m[2].trim(); }
      }
      if (speaker < 0) { speaker = rot % team.length; rot++; }
      out.push({ speaker: speaker, text: line });
    });
    return out;
  }
  function findByName(name) {
    var n = name.toLowerCase();
    for (var i = 0; i < team.length; i++) {
      if (String(team[i].name || '').trim().toLowerCase() === n) return i;
    }
    return -1;
  }

  var player = { on: false, timer: 0, mouthTimer: 0, idx: 0, entries: [], utter: null };

  function stopPlay() {
    player.on = false;
    if (player.mouthTimer) { clearInterval(player.mouthTimer); player.mouthTimer = 0; }
    if (player.timer) { clearTimeout(player.timer); player.timer = 0; }
    try { window.speechSynthesis.cancel(); } catch (e) {}
    drawVideoTeam();
    $('playBtn').disabled = false;
  }

  function pickVoice() {
    var vs = [];
    try { vs = window.speechSynthesis.getVoices() || []; } catch (e) {}
    var de = vs.filter(function (v) { return /de(-|_)/i.test(v.lang) || /german|deutsch/i.test(v.name); });
    return de[0] || vs[0] || null;
  }

  function speakSentence() {
    if (!player.on) return;
    if (player.idx >= player.entries.length) { finishPlay(); return; }
    var entry = player.entries[player.idx];
    var text = entry.text;
    var who = entry.speaker;
    var nm = (team[who] && team[who].name) ? team[who].name : '';
    $('subtitle').innerHTML = (nm ? '<b style="color:var(--accent)">' + esc(nm) + ':</b> ' : '') + esc(text);

    var mouth = false;
    if (player.mouthTimer) clearInterval(player.mouthTimer);
    player.mouthTimer = setInterval(function () { mouth = !mouth; drawVideoTeam(who, mouth); }, 160);
    drawVideoTeam(who, true);

    // Mindest-Anzeigedauer, damit Untertitel lesbar bleiben – auch wenn ein
    // Gerät keine Stimme hat und "onend" sofort feuert.
    var rate = parseFloat($('rate').value) || 1;
    var minMs = Math.max(1400, Math.min(8000, text.length * 60 / rate));
    var started = perfNow(), advanced = false;
    function advanceAfterMin() {
      if (advanced) return; advanced = true;
      var rest = minMs - (perfNow() - started);
      player.timer = setTimeout(nextSentence, rest > 0 ? rest : 0);
    }

    var hasTTS = ('speechSynthesis' in window) && ('SpeechSynthesisUtterance' in window);
    if (hasTTS) {
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'de-DE';
      u.rate = rate;
      u.pitch = 1;
      var v = pickVoice(); if (v) u.voice = v;
      u.onend = advanceAfterMin;
      u.onerror = advanceAfterMin;
      player.utter = u;
      try { window.speechSynthesis.speak(u); }
      catch (e) { fallbackTiming(text); }
      // Sicherheitsnetz: falls "onend" nie kommt, trotzdem weiter
      player.timer = setTimeout(advanceAfterMin, minMs + Math.min(9000, text.length * 90));
    } else {
      fallbackTiming(text);
    }
  }

  function perfNow() { try { return performance.now(); } catch (e) { return 0; } }

  // Ohne Sprachausgabe: Anzeigedauer nach Textlänge
  function fallbackTiming(text) {
    var rate = parseFloat($('rate').value) || 1;
    var ms = Math.max(1600, Math.min(8000, text.length * 62 / rate));
    player.timer = setTimeout(nextSentence, ms);
  }

  function nextSentence() {
    if (!player.on) return;
    if (player.mouthTimer) { clearInterval(player.mouthTimer); player.mouthTimer = 0; }
    player.idx++;
    // kleine Pause zwischen Sätzen
    player.timer = setTimeout(speakSentence, 260);
  }

  function finishPlay() {
    player.on = false;
    if (player.mouthTimer) { clearInterval(player.mouthTimer); player.mouthTimer = 0; }
    $('subtitle').textContent = 'Fertig – willkommen bei 4EVER1! 👍';
    drawVideoTeam();
    $('playBtn').disabled = false;
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function startPlay() {
    if (player.on) return;
    var text = $('scriptBox').value || DEFAULT_SCRIPT;
    player.entries = parseScript(text);
    if (!player.entries.length) { $('subtitle').textContent = 'Kein Text vorhanden.'; return; }
    $('playBtn').disabled = true;
    player.idx = 0; player.on = true;
    // Stimmen ggf. erst nach Event verfügbar
    try { window.speechSynthesis.getVoices(); } catch (e) {}
    speakSentence();
  }

  // ---- Init ----------------------------------------------------------------
  function init() {
    $('figName').addEventListener('input', function () {
      team[cur].name = this.value.slice(0, 16);
      buildTabs();
      drawVideoTeam();
    });
    $('figRole').addEventListener('input', function () {
      team[cur].role = this.value.slice(0, 48);
      drawVideoTeam();
    });
    $('saveBtn').onclick = function () {
      team[cur].name = ($('figName').value || '').slice(0, 16);
      team[cur].role = ($('figRole').value || '').slice(0, 48);
      var ok = save();
      $('saveMsg').textContent = ok ? 'Gespeichert ✓' : 'Speichern nicht möglich';
      $('saveMsg').style.color = ok ? 'var(--good)' : 'var(--warm)';
      renderAll();
      setTimeout(function () { $('saveMsg').textContent = ''; }, 2500);
    };
    $('playBtn').onclick = startPlay;
    $('stopBtn').onclick = stopPlay;

    // Erklär-Text
    $('scriptBox').value = loadScript();
    $('scriptSaveBtn').onclick = function () {
      var ok = saveScript($('scriptBox').value);
      $('scriptMsg').textContent = ok ? 'Gespeichert ✓' : 'Speichern nicht möglich';
      $('scriptMsg').style.color = ok ? 'var(--good)' : 'var(--warm)';
      setTimeout(function () { $('scriptMsg').textContent = ''; }, 2500);
    };
    $('scriptResetBtn').onclick = function () {
      $('scriptBox').value = DEFAULT_SCRIPT;
      $('scriptMsg').textContent = 'Standard-Text geladen';
      $('scriptMsg').style.color = 'var(--dim)';
      setTimeout(function () { $('scriptMsg').textContent = ''; }, 2500);
    };

    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.onvoiceschanged = function () {}; } catch (e) {}
    }
    renderAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
