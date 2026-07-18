/* figur-core.js – gemeinsame Figuren-Logik (Baukasten + Warteraum)
 * Reine Browser-Technik: SVG-Figuren + Sprachausgabe (speechSynthesis).
 * Stellt window.Figuren bereit. Kein externer Dienst.
 */
(function () {
  'use strict';

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
  var PHONES = ['keine', 'an'];

  // Zyklische Steuerungen (Label -> Optionen)
  var CYCLERS = [
    { key: 'face',   label: 'Kopfform',    opts: FACE },
    { key: 'hair',   label: 'Frisur',      opts: HAIRSTYLE },
    { key: 'brows',  label: 'Augenbrauen', opts: BROWS },
    { key: 'eyes',   label: 'Augen',       opts: EYES },
    { key: 'nose',   label: 'Nase',        opts: NOSE },
    { key: 'beard',  label: 'Bart',        opts: BEARD },
    { key: 'glass',  label: 'Brille',      opts: GLASS },
    { key: 'mouth',  label: 'Mund',        opts: MOUTH },
    { key: 'phones', label: 'Kopfhörer',   opts: PHONES }
  ];

  // Teamleitung 4EVER1 – nach dem Team-Foto voreingestellt (von links: Gino, Dennis, Lisa)
  var PRESET = [
    { name: 'eyfahrlehrer', role: 'Für euch & das Optische', face: 1, hair: 3, brows: 0, eyes: 0, nose: 1, beard: 0, glass: 0, mouth: 0, skin: 1, hairColor: 2, shirt: 5, bg: 0, phones: 1 },
    { name: 'eykeepcool',   role: 'Verwaltung & Konflikte', face: 0, hair: 7, brows: 0, eyes: 1, nose: 1, beard: 1, glass: 0, mouth: 0, skin: 1, hairColor: 4, shirt: 6, bg: 5, phones: 0 },
    { name: 'Lisa',         role: 'Teamleitung & Events',            face: 1, hair: 6, brows: 2, eyes: 2, nose: 0, beard: 0, glass: 0, mouth: 0, skin: 0, hairColor: 1, shirt: 5, bg: 4, phones: 0 }
  ];

  var DEFAULT_SCRIPT = [
    'eyfahrlehrer: Herzlich willkommen bei 4EVER1! Ich bin eyfahrlehrer und begleite dich – gemeinsam mit dem Team kümmere ich mich um euch und um alles rund ums Optische.',
    'Lisa: Ich bin Lisa, eure Teamleitung. Ich organisiere die Piccos, plane unsere Events und bin jederzeit für eure Fragen da.',
    'eykeepcool: Und ich bin eykeepcool. Ich halte die Agentur am Laufen und bin für euch da, wenn es einmal Klärungsbedarf gibt.',
    'eyfahrlehrer: Wir drei sind die Teamleitung von 4EVER1 – und immer nur eine Nachricht von dir entfernt.',
    'Lisa: Ein fairer und respektvoller Umgang ist uns wichtig. Beleidigungen oder Aussagen gegen die Agentur haben bei uns keinen Platz.',
    'eykeepcool: Wenn wir etwas ankündigen oder eine Auszahlung ansteht, gib uns bitte kurz Bescheid – so bleibt alles verlässlich.',
    'eyfahrlehrer: Unser Herzstück ist unsere App: das PK Board. Dort läuft ab jetzt alles zusammen.',
    'Lisa: Im PK Board findest du alle PK-Cards, Ankündigungen und Neuigkeiten – an einem Ort und immer aktuell.',
    'eykeepcool: Unsere WhatsApp-Gruppen laufen noch, doch sobald das PK Board online ist, ziehen wir vollständig dorthin um.',
    'eyfahrlehrer: Das schützt dich: Deine Telefonnummer musst du niemandem mehr weitergeben.',
    'Lisa: Datenschutz nehmen wir ernst. Niemand ist verpflichtet, seine Handynummer herauszugeben – bei uns ganz sicher nicht.',
    'eykeepcool: Lade dir also das PK Board herunter – dort gestalten wir alles gemeinsam.',
    'eyfahrlehrer: Willkommen in der 4EVER1-Familie. Wir freuen uns riesig auf dich!'
  ].join('\n');

  // ---- Helpers ------------------------------------------------------------
  function clampIdx(v, n) { v = parseInt(v, 10); if (isNaN(v) || v < 0) v = 0; return v % n; }
  function defaultFig(i) { var p = PRESET[i] || PRESET[0]; var out = {}; for (var k in p) out[k] = p[k]; return out; }
  function defaultTeam() { return [defaultFig(0), defaultFig(1), defaultFig(2)]; }

  function sanitize(f) {
    var d = defaultFig(0), out = {};
    for (var k in d) out[k] = (f && typeof f[k] !== 'undefined') ? f[k] : d[k];
    CYCLERS.forEach(function (c) { out[c.key] = clampIdx(out[c.key], c.opts.length); });
    out.skin = clampIdx(out.skin, SKIN.length);
    out.hairColor = clampIdx(out.hairColor, HAIR.length);
    out.shirt = clampIdx(out.shirt, SHIRT.length);
    out.bg = clampIdx(out.bg, BG.length);
    out.name = String(out.name || '').slice(0, 16);
    out.role = String(out.role || '').slice(0, 48);
    return out;
  }
  function sanitizeTeam(arr) {
    if (!Array.isArray(arr) || arr.length !== 3) return defaultTeam();
    return arr.map(sanitize);
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function shade(hex, amt) {
    var c = hex.replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    var r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
    function m(v) { v = Math.round(v + (amt < 0 ? v * amt : (255 - v) * amt)); return Math.max(0, Math.min(255, v)); }
    function h(v) { return ('0' + m(v).toString(16)).slice(-2); }
    return '#' + h(r) + h(g) + h(b);
  }

  // ---- SVG-Rendering -------------------------------------------------------
  function renderFigure(f, opts) {
    opts = opts || {};
    var skin = SKIN[f.skin], hair = HAIR[f.hairColor], shirt = SHIRT[f.shirt], bg = BG[f.bg];
    var dark = shade(skin, -0.18);
    var cx = 100, cy = 95, rx = 46, ry = 52, corner = 46;
    if (FACE[f.face] === 'oval') { rx = 42; ry = 56; }
    if (FACE[f.face] === 'kantig') { rx = 46; ry = 50; corner = 22; }

    var s = '<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Figur">';
    s += '<rect x="0" y="0" width="200" height="220" rx="18" fill="' + bg + '"/>';
    s += '<ellipse cx="100" cy="215" rx="70" ry="24" fill="' + shade(bg, 0.12) + '"/>';
    s += '<path d="M40 220 q0 -46 60 -46 q60 0 60 46 Z" fill="' + shirt + '"/>';
    s += '<path d="M78 178 q22 20 44 0 l0 14 q-22 16 -44 0 Z" fill="' + shade(shirt, -0.14) + '"/>';
    s += '<rect x="86" y="150" width="28" height="30" rx="12" fill="' + dark + '"/>';
    s += hairBack(f, hair, cx, cy, rx, ry);
    s += '<ellipse cx="' + (cx - rx + 4) + '" cy="' + cy + '" rx="9" ry="13" fill="' + skin + '"/>';
    s += '<ellipse cx="' + (cx + rx - 4) + '" cy="' + cy + '" rx="9" ry="13" fill="' + skin + '"/>';
    s += roundedFace(cx, cy, rx, ry, corner, skin);
    s += beard(f, cx, cy, ry, hair);
    s += brows(f, cx, cy, hair);
    s += eyes(f, cx, cy);
    s += nose(f, cx, cy, dark);
    s += mouth(f, cx, cy, opts.mouthOpen);
    s += hairFront(f, hair, cx, cy, rx, ry);
    s += glasses(f, cx, cy);
    s += headphones(f, cx, cy, rx, ry);
    s += '</svg>';
    return s;
  }

  function headphones(f, cx, cy, rx, ry) {
    if (!f.phones || PHONES[f.phones] !== 'an') return '';
    var band = '#20242b', cup = '#171a20', pad = '#0e1116', s = '';
    s += '<path d="M' + (cx - rx - 1) + ' ' + cy + ' q0 -' + (ry + 16) + ' ' + (rx + 1) + ' -' + (ry + 16) +
         ' q' + (rx + 1) + ' 0 ' + (rx + 1) + ' ' + (ry + 16) + '" fill="none" stroke="' + band + '" stroke-width="8" stroke-linecap="round"/>';
    [cx - rx - 2, cx + rx + 2].forEach(function (x) {
      s += '<rect x="' + (x - 9) + '" y="' + (cy - 12) + '" width="18" height="30" rx="9" fill="' + cup + '"/>';
      s += '<rect x="' + (x - 5) + '" y="' + (cy - 8) + '" width="10" height="22" rx="5" fill="' + pad + '"/>';
    });
    return s;
  }
  function roundedFace(cx, cy, rx, ry, corner, skin) {
    if (corner < 30) return '<rect x="' + (cx - rx) + '" y="' + (cy - ry) + '" width="' + (rx * 2) + '" height="' + (ry * 2) + '" rx="' + corner + '" fill="' + skin + '"/>';
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
    xs.forEach(function (x) { s += '<rect x="' + (x - w / 2) + '" y="' + (by + lift) + '" width="' + w + '" height="' + th + '" rx="' + (th / 2) + '" fill="' + shade(hair, -0.08) + '"/>'; });
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
    if (open) return '<ellipse cx="' + cx + '" cy="' + my + '" rx="10" ry="8" fill="#5c2b2b"/><ellipse cx="' + cx + '" cy="' + (my + 3) + '" rx="6" ry="3.4" fill="#c0566a"/>';
    var kind = MOUTH[f.mouth];
    if (kind === 'neutral') return '<rect x="' + (cx - 12) + '" y="' + (my - 1.5) + '" width="24" height="3.4" rx="1.7" fill="#7a3b3b"/>';
    if (kind === 'grinsen') return '<path d="M' + (cx - 15) + ' ' + my + ' q15 20 30 0 q-15 6 -30 0 Z" fill="#fff" stroke="#7a3b3b" stroke-width="2"/>';
    return '<path d="M' + (cx - 14) + ' ' + my + ' q14 16 28 0" fill="none" stroke="#7a3b3b" stroke-width="3" stroke-linecap="round"/>';
  }
  function beard(f, cx, cy, ry, hair) {
    var kind = BEARD[f.beard]; if (kind === 'keiner') return '';
    var col = shade(hair, -0.05), s = '';
    if (kind === 'schnauzer') return '<path d="M' + (cx - 14) + ' ' + (cy + 26) + ' q14 -8 28 0 q-14 8 -28 0 Z" fill="' + col + '"/>';
    if (kind === 'ziege') {
      s += '<path d="M' + (cx - 14) + ' ' + (cy + 26) + ' q14 -6 28 0 q-14 6 -28 0 Z" fill="' + col + '"/>';
      s += '<path d="M' + (cx - 8) + ' ' + (cy + 38) + ' q8 12 16 0 q-8 6 -16 0 Z" fill="' + col + '"/>';
      return s;
    }
    if (kind === 'stoppeln') return '<path d="M' + (cx - 34) + ' ' + (cy + 18) + ' q34 44 68 0 q-6 30 -34 30 q-28 0 -34 -30 Z" fill="' + col + '" opacity=".38"/>';
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
    var s = '', hl = shade(hair, 0.12);
    if (style === 'buerste') return '<path d="M' + (cx - rx) + ' ' + (cy - 18) + ' q0 -46 ' + rx + ' -46 q' + rx + ' 0 ' + rx + ' 46 q-' + rx + ' -22 -' + (2 * rx) + ' 0 Z" fill="' + hair + '"/>';
    if (style === 'undercut') {
      s += '<path d="M' + (cx - rx) + ' ' + (cy - 20) + ' q6 -44 ' + rx + ' -44 q' + rx + ' 0 ' + rx + ' 44 q-30 -18 -' + (2 * rx) + ' 6 Z" fill="' + hair + '"/>';
      s += '<path d="M' + (cx + 6) + ' ' + (cy - 40) + ' q' + (rx - 6) + ' 4 ' + (rx - 6) + ' 30" fill="none" stroke="' + hl + '" stroke-width="3" opacity=".5"/>';
      return s;
    }
    if (style === 'seitenscheitel') return '<path d="M' + (cx - rx) + ' ' + (cy - 14) + ' q-2 -50 ' + rx + ' -50 q' + rx + ' 0 ' + rx + ' 44 q-18 -30 -' + (rx + 10) + ' -22 q-' + (rx - 10) + ' 6 -' + (rx - 10) + ' 28 Z" fill="' + hair + '"/>';
    if (style === 'lockig') return '<path d="M' + (cx - rx) + ' ' + (cy - 12) + ' q-4 -30 12 -40 q6 -14 22 -10 q14 -12 30 -2 q18 -4 20 16 q10 8 4 34 q-14 -20 -44 -20 q-30 0 -44 22 Z" fill="' + hair + '"/>';
    if (style === 'zopf' || style === 'lang') return '<path d="M' + (cx - rx) + ' ' + (cy - 6) + ' q-4 -54 ' + rx + ' -54 q' + rx + ' 0 ' + rx + ' 54 q-14 -34 -' + rx + ' -34 q-' + rx + ' 0 -' + rx + ' 34 Z" fill="' + hair + '"/>';
    return '<path d="M' + (cx - rx) + ' ' + (cy - 12) + ' q0 -48 ' + rx + ' -48 q' + rx + ' 0 ' + rx + ' 48 q-16 -26 -' + rx + ' -26 q-' + rx + ' 0 -' + rx + ' 26 Z" fill="' + hair + '"/>';
  }

  // ---- Team-Kacheln rendern ------------------------------------------------
  function renderTeamInto(host, team, activeIdx, mouthOpen) {
    if (!host) return;
    host.innerHTML = '';
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

  // ---- Skript zerlegen -----------------------------------------------------
  function parseScript(text, team) {
    var lines = String(text || '').split(/\n+/), out = [], rot = 0;
    function findByName(name) {
      var n = name.toLowerCase();
      for (var i = 0; i < team.length; i++) if (String(team[i].name || '').trim().toLowerCase() === n) return i;
      return -1;
    }
    lines.forEach(function (line) {
      line = line.trim(); if (!line) return;
      var speaker = -1;
      var m = line.match(/^([\wÄÖÜäöüß .-]{1,16}):\s*(.+)$/);
      if (m) { var idx = findByName(m[1].trim()); if (idx >= 0) { speaker = idx; line = m[2].trim(); } }
      if (speaker < 0) { speaker = rot % team.length; rot++; }
      out.push({ speaker: speaker, text: line });
    });
    return out;
  }

  function perfNow() { try { return performance.now(); } catch (e) { return 0; } }
  function pickVoice() {
    var vs = [];
    try { vs = window.speechSynthesis.getVoices() || []; } catch (e) {}
    var de = vs.filter(function (v) { return /de(-|_)/i.test(v.lang) || /german|deutsch/i.test(v.name); });
    return de[0] || vs[0] || null;
  }

  // ---- Player --------------------------------------------------------------
  // cfg: { teamHost, subtitle, getTeam(), getScript(), getRate?(), onState?(playing), doneText? }
  function makePlayer(cfg) {
    var st = { on: false, timer: 0, mouthTimer: 0, idx: 0, entries: [], team: [] };
    function rate() { try { var r = cfg.getRate ? cfg.getRate() : 1; return parseFloat(r) || 1; } catch (e) { return 1; } }
    function draw(active, open) { renderTeamInto(cfg.teamHost, st.team, active, open); }
    function setSub(html) { if (cfg.subtitle) cfg.subtitle.innerHTML = html; }
    function state(p) { if (cfg.onState) try { cfg.onState(p); } catch (e) {} }

    function clearMouth() { if (st.mouthTimer) { clearInterval(st.mouthTimer); st.mouthTimer = 0; } }
    function clearTimer() { if (st.timer) { clearTimeout(st.timer); st.timer = 0; } }

    function next() {
      if (!st.on) return;
      clearMouth(); st.idx++;
      st.timer = setTimeout(speak, 260);
    }
    function speak() {
      if (!st.on) return;
      if (st.idx >= st.entries.length) { finish(); return; }
      var e = st.entries[st.idx], text = e.text, who = e.speaker;
      var nm = (st.team[who] && st.team[who].name) ? st.team[who].name : '';
      setSub((nm ? '<b style="color:var(--accent)">' + esc(nm) + ':</b> ' : '') + esc(text));
      var mo = false; clearMouth();
      st.mouthTimer = setInterval(function () { mo = !mo; draw(who, mo); }, 160);
      draw(who, true);

      var r = rate();
      var minMs = Math.max(1400, Math.min(8000, text.length * 60 / r));
      var started = perfNow(), advanced = false;
      function advance() { if (advanced) return; advanced = true; var rest = minMs - (perfNow() - started); st.timer = setTimeout(next, rest > 0 ? rest : 0); }

      var hasTTS = ('speechSynthesis' in window) && ('SpeechSynthesisUtterance' in window);
      if (hasTTS) {
        var u = new SpeechSynthesisUtterance(text);
        u.lang = 'de-DE'; u.rate = r; u.pitch = 1;
        var v = pickVoice(); if (v) u.voice = v;
        u.onend = advance; u.onerror = advance;
        try { window.speechSynthesis.speak(u); } catch (ex) { st.timer = setTimeout(next, minMs); return; }
        st.timer = setTimeout(advance, minMs + Math.min(9000, text.length * 90));
      } else {
        st.timer = setTimeout(next, minMs);
      }
    }
    function finish() {
      st.on = false; clearMouth();
      setSub(esc(cfg.doneText || 'Fertig – willkommen bei 4EVER1! 👍'));
      draw(); state(false);
    }
    function start() {
      if (st.on) return;
      st.team = sanitizeTeam(cfg.getTeam());
      st.entries = parseScript(cfg.getScript(), st.team);
      draw();
      if (!st.entries.length) { setSub('Kein Text vorhanden.'); return; }
      st.idx = 0; st.on = true; state(true);
      try { window.speechSynthesis.getVoices(); } catch (e) {}
      speak();
    }
    function stop() {
      st.on = false; clearMouth(); clearTimer();
      try { window.speechSynthesis.cancel(); } catch (e) {}
      draw(); state(false);
    }
    function render() { st.team = sanitizeTeam(cfg.getTeam()); draw(); }
    return { start: start, stop: stop, render: render, isOn: function () { return st.on; } };
  }

  // ---- Server-Konfiguration (Figuren + Text) ------------------------------
  function loadServerConfig() {
    return fetch('/api/figures', { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) return { figures: null, script: null };
        return {
          figures: (j.figures && Array.isArray(j.figures) && j.figures.length === 3) ? sanitizeTeam(j.figures) : null,
          script: (typeof j.script === 'string' && j.script.trim()) ? j.script : null
        };
      })
      .catch(function () { return { figures: null, script: null }; });
  }

  window.Figuren = {
    SKIN: SKIN, HAIR: HAIR, SHIRT: SHIRT, BG: BG, CYCLERS: CYCLERS,
    PRESET: PRESET, DEFAULT_SCRIPT: DEFAULT_SCRIPT,
    defaultTeam: defaultTeam, sanitize: sanitize, sanitizeTeam: sanitizeTeam,
    renderFigure: renderFigure, renderTeamInto: renderTeamInto,
    parseScript: parseScript, makePlayer: makePlayer, loadServerConfig: loadServerConfig
  };
})();
