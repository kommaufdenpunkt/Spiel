'use strict';
// Tab-Icon hart erzwingen: manche Browser (v.a. Safari) halten ein altes
// Favicon extrem zäh. Wir entfernen alle Icon-Links und setzen frische mit
// neuer Version – so wird das aktuelle Emblem verlässlich geladen.
(function forceFavicon() {
  try {
    const v = '?v=3631';
    document.querySelectorAll('link[rel~="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]').forEach((l) => l.remove());
    const add = (rel, href, type, sizes) => { const l = document.createElement('link'); l.rel = rel; l.href = href; if (type) l.type = type; if (sizes) l.sizes = sizes; document.head.appendChild(l); };
    add('shortcut icon', '/favicon.ico' + v);
    add('icon', '/favicon.ico' + v, 'image/x-icon', 'any');
    add('icon', '/favicon.svg' + v, 'image/svg+xml');
    add('apple-touch-icon', '/apple-touch-icon.png' + v);
  } catch {}
})();
// ====================== Fahrschulportal – Frontend ======================
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const WD_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const MON_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const state = { user: null, settings: null, date: todayStr(), instrTab: 'heute' };

// ---------- Farb-Themes (dunkel, augenschonend) ----------
// Kein reines Schwarz (weniger Halo/Blendung), Text kontrastreich (>= WCAG AA).
const THEMES = {
  unternbuchen: { label: 'Untern Buchen', dot: 'linear-gradient(135deg,#f5c518,#ef7d1a)', vars: {
    '--bg': '#0a0a0c', '--bg2': '#060608', '--bg-glow': '#2a1e07', '--card': '#141317', '--card2': '#1c1a1f',
    '--line': '#2d2a31', '--brand': '#f2a01a', '--brand-dark': '#d8850f', '--ink': '#f4eee1', '--muted': '#a89e8a' } },
  nachtblau: { label: 'Nachtblau', dot: '#4d8dff', vars: {
    '--bg': '#0e131a', '--bg2': '#0a0e14', '--bg-glow': '#182233', '--card': '#161d27', '--card2': '#1c2531',
    '--line': '#28323f', '--brand': '#4d8dff', '--brand-dark': '#3a6fd4', '--ink': '#e7edf5', '--muted': '#93a1b3' } },
  aubergine: { label: 'Aubergine (Lila)', dot: '#a877f0', vars: {
    '--bg': '#14101c', '--bg2': '#0f0b16', '--bg-glow': '#2c2042', '--card': '#1e1830', '--card2': '#251d3a',
    '--line': '#352a4a', '--brand': '#a877f0', '--brand-dark': '#8f5fe0', '--ink': '#ece7f5', '--muted': '#a79bbb' } },
  beere: { label: 'Beere (Pink)', dot: '#ec6ba6', vars: {
    '--bg': '#190f15', '--bg2': '#130a10', '--bg-glow': '#3d1e30', '--card': '#271722', '--card2': '#301c29',
    '--line': '#472c3c', '--brand': '#ec6ba6', '--brand-dark': '#d64f8d', '--ink': '#f3e7ee', '--muted': '#bd9aaa' } },
  waldgruen: { label: 'Waldgrün', dot: '#35c07d', vars: {
    '--bg': '#0b1512', '--bg2': '#08100d', '--bg-glow': '#153025', '--card': '#13201b', '--card2': '#182821',
    '--line': '#26382f', '--brand': '#35c07d', '--brand-dark': '#2aa568', '--ink': '#e6f0ea', '--muted': '#8fa99b' } },
  graphit: { label: 'Graphit', dot: '#8a93a6', vars: {
    '--bg': '#121316', '--bg2': '#0d0e11', '--bg-glow': '#24262c', '--card': '#1b1d22', '--card2': '#22242a',
    '--line': '#32353d', '--brand': '#7c8cf0', '--brand-dark': '#6172e0', '--ink': '#e8eaef', '--muted': '#9a9fab' } },
  mitternacht: { label: 'Mitternacht', dot: '#5aa0ff', vars: {
    '--bg': '#08090c', '--bg2': '#050609', '--bg-glow': '#141821', '--card': '#111319', '--card2': '#161922',
    '--line': '#262a34', '--brand': '#5aa0ff', '--brand-dark': '#3f7fd6', '--ink': '#e9edf3', '--muted': '#8b93a2' } },
};
// Schriftarten (nur systemeigene Stacks – nichts wird nachgeladen, funktioniert offline)
const FONTS = {
  system:   { label: 'Standard',   stack: 'system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif' },
  rounded:  { label: 'Abgerundet', stack: 'ui-rounded,"SF Pro Rounded","Segoe UI",system-ui,sans-serif' },
  modern:   { label: 'Modern',     stack: '"Segoe UI",Roboto,"Helvetica Neue",system-ui,sans-serif' },
  klassisch:{ label: 'Klassisch',  stack: 'Georgia,"Times New Roman",Times,serif' },
  technisch:{ label: 'Technisch',  stack: 'ui-monospace,"SF Mono",Menlo,Consolas,monospace' },
};
// Freie Akzentfarben (Buttons, Reiter, Hervorhebungen)
const ACCENTS = ['#4d8dff', '#35c07d', '#a877f0', '#ec6ba6', '#e6934d', '#3fb6c4', '#e5605f', '#c9a13b'];
// Menü-Hintergründe (die beiden aufklappenden Menüseiten) – dunkle, ruhige Töne
const EDGES = ['#111319', '#141a24', '#161421', '#101a17', '#1c1620', '#1a1712', '#0f1720', '#201a1a'];
// Textfarben – bewusst nur helle, gut lesbare Töne (alle Themes sind dunkel)
const INKS = {
  standard: { label: 'Standard', dot: '#e7edf5', val: '' },
  weiss:    { label: 'Kräftig',  dot: '#ffffff', val: '#ffffff' },
  warm:     { label: 'Warm',     dot: '#f2e7d6', val: '#f2e7d6' },
  kuehl:    { label: 'Kühl',     dot: '#d8e6fb', val: '#d8e6fb' },
  mint:     { label: 'Mint',     dot: '#d6f2e4', val: '#d6f2e4' },
  rose:     { label: 'Rosé',     dot: '#f7dcea', val: '#f7dcea' },
  // Metallic-Töne (Farbpunkt schimmert, Schrift bleibt auf dem dunklen Design gut lesbar)
  gold:     { label: 'Gold',     dot: 'linear-gradient(135deg,#9a7b1e,#f0d675,#b58f28)', val: '#e7c860' },
  bronze:   { label: 'Bronze',   dot: 'linear-gradient(135deg,#7a4a22,#d99a5c,#8a5a2a)', val: '#daa066' },
  carbon:   { label: 'Carbon',   dot: 'linear-gradient(135deg,#3a4048,#aeb6c2,#2c313a)', val: '#c3cad6' },
  schwarz:  { label: 'Metallic Schwarz', dot: 'linear-gradient(135deg,#14171c,#565c66,#0c0e12)', val: '#b3b9c2' },
};
const SIZES = { klein: '93%', normal: '100%', gross: '112%', xl: '125%' };
const SIZE_LABEL = { klein: 'Klein', normal: 'Normal', gross: 'Groß', xl: 'Sehr groß' };

function shade(hex, pct) { // pct<0 dunkelt ab
  const n = parseInt(String(hex).replace('#', ''), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.max(0, Math.min(255, Math.round(c * (1 + pct / 100)))));
  return '#' + ch.map((x) => x.toString(16).padStart(2, '0')).join('');
}
function applyThemeVars(key) {
  const t = THEMES[key] || THEMES.unternbuchen;
  for (const [k, v] of Object.entries(t.vars)) document.documentElement.style.setProperty(k, v);
}
function applyAppearance() {
  applyThemeVars(state.theme || 'unternbuchen');
  const p = state.prefs || {}, root = document.documentElement;
  if (p.accent) { root.style.setProperty('--brand', p.accent); root.style.setProperty('--brand-dark', shade(p.accent, -16)); }
  if (p.ink) root.style.setProperty('--ink', p.ink);
  // Menü-Farbe: färbt die Menü-Panels + Kacheln (frei wählbar)
  if (p.edge) {
    root.style.setProperty('--edge-bg', p.edge);
    root.style.setProperty('--edge-tile', shade(p.edge, 16));
    root.style.setProperty('--edge-line', shade(p.edge, 40));
  } else {
    root.style.removeProperty('--edge-bg'); root.style.removeProperty('--edge-tile'); root.style.removeProperty('--edge-line');
  }
  root.style.setProperty('--font', (FONTS[p.font] || FONTS.system).stack);
  root.style.fontSize = SIZES[p.size] || '100%';
}
function loadAppearance() {
  const p = {};
  try {
    state.theme = localStorage.getItem('fsp-theme') || 'unternbuchen';
    p.accent = localStorage.getItem('fsp-accent') || '';
    p.font = localStorage.getItem('fsp-font') || 'system';
    p.ink = localStorage.getItem('fsp-ink') || '';
    p.edge = localStorage.getItem('fsp-edge') || '';
    p.size = localStorage.getItem('fsp-size') || 'normal';
  } catch {}
  state.prefs = p;
  applyAppearance();
}
loadAppearance();

// ---------- Benachrichtigungston (kurzer Zwei-Ton-Klang, ohne externe Datei) ----------
let _audioCtx = null;
let _soundOn = true;
try { _soundOn = localStorage.getItem('fsp-sound') !== '0'; } catch {}
function setSoundOn(on) { _soundOn = !!on; try { localStorage.setItem('fsp-sound', on ? '1' : '0'); } catch {} if (on) { unlockAudio(); playChime(); } }
function unlockAudio() {
  try {
    if (!_audioCtx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) _audioCtx = new AC(); }
    if (_audioCtx && _audioCtx.state === 'suspended') _audioCtx.resume();
  } catch {}
}
// Audio erst nach der ersten Nutzer-Interaktion freischalten (Browser-Vorgabe).
window.addEventListener('pointerdown', unlockAudio, { passive: true });
window.addEventListener('keydown', unlockAudio, { passive: true });
function playChime() {
  if (!_soundOn) return;
  unlockAudio();
  if (!_audioCtx) return;
  try {
    const t = _audioCtx.currentTime;
    [880, 1174.66].forEach((f, i) => {
      const o = _audioCtx.createOscillator(), g = _audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      o.connect(g); g.connect(_audioCtx.destination);
      const s = t + i * 0.13;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.2, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.34);
      o.start(s); o.stop(s + 0.36);
    });
  } catch {}
}
// Merkt sich die letzten Zähler, um „neu eingegangen" zu erkennen.
let _lastNotifUnread = null, _lastMsgUnread = null;
function chimeOnIncrease(kind, value) {
  const prev = kind === 'notif' ? _lastNotifUnread : _lastMsgUnread;
  if (prev != null && value > prev) playChime();
  if (kind === 'notif') _lastNotifUnread = value; else _lastMsgUnread = value;
}

function setTheme(key) { state.theme = THEMES[key] ? key : 'unternbuchen'; try { localStorage.setItem('fsp-theme', state.theme); } catch {} applyAppearance(); }
function savePref(k, v) {
  state.prefs = state.prefs || {};
  state.prefs[k] = v;
  try { if (v) localStorage.setItem('fsp-' + k, v); else localStorage.removeItem('fsp-' + k); } catch {}
  applyAppearance();
}
function resetAppearance() {
  state.theme = 'unternbuchen'; state.prefs = { font: 'system', size: 'normal', accent: '', ink: '', edge: '' };
  try { ['fsp-theme', 'fsp-accent', 'fsp-font', 'fsp-ink', 'fsp-edge', 'fsp-size'].forEach((k) => localStorage.removeItem(k)); } catch {}
  applyAppearance();
}

function openThemePicker() {
  const cur = state.theme || 'unternbuchen';
  const p = state.prefs || {};
  const accent = p.accent || (THEMES[cur] || THEMES.unternbuchen).dot;
  const swatch = (bg, on, extra = '') => `width:30px;height:30px;border-radius:50%;background:${bg};display:inline-block;border:2px solid ${on ? 'var(--ink)' : 'transparent'};${extra}`;
  modal(`<h3>🎨 Aussehen</h3>
    <p class="hint">Gestalte ginoco, wie es dir gefällt – alles wird auf diesem Gerät gespeichert.</p>

    <div class="ap-sec"><div class="ap-label">Thema</div>
      <div class="ap-grid2">
        ${Object.entries(THEMES).map(([k, t]) => `<button class="sec" data-theme="${k}" style="justify-content:flex-start;display:flex;align-items:center;gap:.5rem;${k === cur ? 'outline:2px solid ' + t.dot : ''}">
          <span style="width:16px;height:16px;border-radius:50%;background:${t.dot}"></span>${t.label}${k === cur ? ' ✓' : ''}</button>`).join('')}
      </div>
    </div>

    <div class="ap-sec"><div class="ap-label">Akzentfarbe <span class="muted">(Buttons & Reiter)</span></div>
      <div class="ap-swatches">
        ${ACCENTS.map((c) => `<button data-accent="${c}" title="${c}" style="${swatch(c, (p.accent || '').toLowerCase() === c.toLowerCase())}"></button>`).join('')}
        <label class="ap-free" title="Eigene Farbe">🎨<input type="color" id="ap-accent-free" value="${accent}"></label>
      </div>
    </div>

    <div class="ap-sec"><div class="ap-label">Schriftart</div>
      <div class="ap-fonts">
        ${Object.entries(FONTS).map(([k, f]) => `<button class="sec" data-font="${k}" style="font-family:${f.stack};${(p.font || 'system') === k ? 'outline:2px solid var(--brand)' : ''}">${f.label}${(p.font || 'system') === k ? ' ✓' : ''}</button>`).join('')}
      </div>
    </div>

    <div class="ap-sec"><div class="ap-label">Textfarbe</div>
      <div class="ap-swatches">
        ${Object.entries(INKS).map(([k, i]) => `<button data-ink="${i.val}" title="${i.label}" style="${swatch(i.dot, (p.ink || '') === i.val)}"></button>`).join('')}
      </div>
    </div>

    <div class="ap-sec"><div class="ap-label">Menü-Farbe <span class="muted">(die zwei Menüseiten)</span></div>
      <div class="ap-swatches">
        ${EDGES.map((c) => `<button data-edge="${c}" title="${c}" style="${swatch(c, (p.edge || '').toLowerCase() === c.toLowerCase())}"></button>`).join('')}
        <label class="ap-free" title="Eigene Farbe">🎨<input type="color" id="ap-edge-free" value="${p.edge || '#111319'}"></label>
        <button class="ghost sm" data-edge="" style="margin-left:.4rem">Standard</button>
      </div>
    </div>

    <div class="ap-sec"><div class="ap-label">Schriftgröße</div>
      <div class="ap-grid2">
        ${Object.keys(SIZES).map((k) => `<button class="sec" data-size="${k}" style="${(p.size || 'normal') === k ? 'outline:2px solid var(--brand)' : ''}">${SIZE_LABEL[k]}${(p.size || 'normal') === k ? ' ✓' : ''}</button>`).join('')}
      </div>
    </div>

    <div class="ap-sec"><div class="ap-label">Benachrichtigungston</div>
      <label class="ck-line" style="justify-content:flex-start"><input type="checkbox" id="ap-sound" ${_soundOn ? 'checked' : ''}> 🔊 Ton bei neuen Benachrichtigungen</label>
    </div>

    <div class="actions" style="justify-content:space-between">
      <button class="ghost sm" id="ap-reset">Zurücksetzen</button>
      <button class="sec" onclick="window.__closeModal()">Fertig</button>
    </div>`, 'wide');

  const reopen = () => openThemePicker();
  document.querySelectorAll('[data-theme]').forEach((b) => b.onclick = () => { setTheme(b.dataset.theme); reopen(); });
  document.querySelectorAll('[data-accent]').forEach((b) => b.onclick = () => { savePref('accent', b.dataset.accent); reopen(); });
  document.querySelectorAll('[data-font]').forEach((b) => b.onclick = () => { savePref('font', b.dataset.font); reopen(); });
  document.querySelectorAll('[data-ink]').forEach((b) => b.onclick = () => { savePref('ink', b.dataset.ink); reopen(); });
  document.querySelectorAll('[data-edge]').forEach((b) => b.onclick = () => { savePref('edge', b.dataset.edge); reopen(); });
  document.querySelectorAll('[data-size]').forEach((b) => b.onclick = () => { savePref('size', b.dataset.size); reopen(); });
  const free = $('#ap-accent-free');
  if (free) {
    free.oninput = () => { state.prefs.accent = free.value; applyAppearance(); };           // live-Vorschau
    free.onchange = () => { savePref('accent', free.value); reopen(); };                     // festhalten
  }
  const efree = $('#ap-edge-free');
  if (efree) {
    efree.oninput = () => { state.prefs.edge = efree.value; applyAppearance(); };            // live-Vorschau
    efree.onchange = () => { savePref('edge', efree.value); reopen(); };                     // festhalten
  }
  const snd = $('#ap-sound');
  if (snd) snd.onchange = () => setSoundOn(snd.checked);
  const rst = $('#ap-reset');
  if (rst) rst.onclick = () => { resetAppearance(); toast('Auf Standard zurückgesetzt', 'ok'); reopen(); };
}
window.__openThemePicker = openThemePicker;

function initials(name) {
  return String(name || '').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '🙂';
}
// Durchsuchbare Fahrschüler-Auswahl (tippen -> Vorschläge / Auto-Fill) statt langer Dropdowns.
function studentPicker(id, students, { placeholder = 'Name tippen …', style = '' } = {}) {
  const listId = id + '-dl';
  return `<input id="${id}" list="${listId}" placeholder="${esc(placeholder)}" autocomplete="off" style="${style}">
    <datalist id="${listId}">${students.map((s) => `<option value="${esc(s.name)}"></option>`).join('')}</datalist>`;
}
function resolveStudentId(el, students) {
  const v = String((el && el.value) || '').trim().toLowerCase();
  if (!v) return '';
  let hit = students.find((s) => String(s.name || '').toLowerCase() === v)
    || students.find((s) => String(s.username || '').toLowerCase() === v);
  if (!hit) { const m = students.filter((s) => String(s.name || '').toLowerCase().includes(v)); if (m.length === 1) hit = m[0]; }
  return hit ? String(hit.id) : '';
}
// Bild vor dem Hochladen im Browser verkleinern (spart Speicher & Datenvolumen)
function fileToResizedDataUrl(file, maxPx = 400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('Bitte ein Bild auswählen'));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width, h = img.height;
      const scale = Math.min(1, maxPx / Math.max(w, h));
      w = Math.max(1, Math.round(w * scale)); h = Math.max(1, Math.round(h * scale));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht geladen werden')); };
    img.src = url;
  });
}
function ageFromDate(bd) {
  if (!bd || !/^\d{4}-\d{2}-\d{2}$/.test(bd)) return null;
  const [y, m, d] = bd.split('-').map(Number);
  const now = new Date();
  let a = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) a--;
  return (a >= 0 && a < 120) ? a : null;
}
// Profil als eigener Bereich ganz oben (kein Popup) – ein-/ausklappbar.
async function renderProfileCard() {
  const card = $('#profile-card');
  if (!card) return;
  const ip = state.settings?.instructor_phone;
  let pr = { name: state.user?.name || '', email: '', phone: state.user?.phone || '', birth_year: '', birth_date: '', street: '', house_no: '', zip: '', city: '', username: state.user?.username || '', has_photo: false };
  try { const r = await api('/api/my/profile'); if (r.profile) pr = { ...pr, ...r.profile }; } catch {}
  const open = !!state.profileOpen;
  const age = ageFromDate(pr.birth_date);
  const ageBadge = (bd) => { const a = ageFromDate(bd); return a == null ? '' : `${a} Jahre`; };
  const avatarInner = pr.has_photo
    ? `<img src="/api/my/photo?t=${Date.now()}" alt="Profilfoto">`
    : `<span>${esc(initials(pr.name))}</span>`;
  const summary = [pr.username, age != null ? age + ' Jahre' : null, pr.city].filter(Boolean).join(' · ') || 'Tippe zum Vervollständigen';
  card.classList.remove('hidden');
  card.innerHTML = `
    <div class="pfc-head" id="pfc-head">
      <span class="pfc-av">${avatarInner}</span>
      <div class="pfc-meta">
        <div class="pfc-name">${esc(pr.name || 'Mein Profil')}</div>
        <div class="pfc-sub">${esc(summary)}</div>
      </div>
      <button class="sec sm" id="pfc-toggle">${open ? 'Zuklappen ▲' : 'Bearbeiten ▾'}</button>
    </div>
    <div class="pfc-body ${open ? '' : 'hidden'}" id="pfc-body">
      <div class="pf-hero" style="margin-top:.6rem">
        <div class="pf-avatar-lg">
          <span class="pf-av-inner" id="pf-av-inner">${avatarInner}</span>
          <label class="pf-cam" title="Foto ändern">📷<input type="file" id="pf-file" accept="image/*" hidden></label>
        </div>
        <button class="ghost sm ${pr.has_photo ? '' : 'hidden'}" id="pf-photo-del" style="margin-top:.4rem">Foto entfernen</button>
      </div>
      <div class="pf-privacy">🔒 Nur dein Fahrlehrer sieht dein Profil – kein anderer Fahrschüler.</div>
      <div class="err hidden" id="pf-err"></div>
      <div class="pf-sec">
        <div class="pf-sec-h">👤 Persönliches</div>
        <div class="field"><label>Name</label><input id="pf-name" value="${esc(pr.name || '')}" placeholder="Vor- und Nachname"></div>
        <div class="row">
          <div class="field"><label>Geburtsdatum</label><input id="pf-bdate" type="date" value="${esc(pr.birth_date || '')}" max="2015-12-31"></div>
          <div class="field" style="max-width:110px"><label>Alter</label><input id="pf-age" value="${ageBadge(pr.birth_date)}" placeholder="—" readonly></div>
        </div>
      </div>
      <div class="pf-sec">
        <div class="pf-sec-h">🏠 Adresse</div>
        <button class="geo-btn" id="pf-geo" type="button">📍 Aktuellen Standort übernehmen</button>
        <div class="hint" style="margin:.35rem 0 .7rem">Faul zuhause? Ein Tipp füllt Straße, PLZ und Ort automatisch – du ergänzt nur die Hausnummer.</div>
        <div class="row">
          <div class="field" style="flex:2"><label>Straße</label><input id="pf-street" value="${esc(pr.street || '')}" placeholder="z.B. Bahnhofstraße"></div>
          <div class="field" style="max-width:110px"><label>Hausnr.</label><input id="pf-houseno" value="${esc(pr.house_no || '')}" placeholder="12a"></div>
        </div>
        <div class="row">
          <div class="field" style="max-width:130px"><label>PLZ</label><input id="pf-zip" inputmode="numeric" value="${esc(pr.zip || '')}" placeholder="89073"></div>
          <div class="field" style="flex:2"><label>Ort</label><input id="pf-city" value="${esc(pr.city || '')}" placeholder="z.B. Ulm"></div>
        </div>
      </div>
      <div class="pf-sec">
        <div class="pf-sec-h">📞 Kontakt</div>
        <div class="field"><label>Handynummer</label><input id="pf-phone" inputmode="tel" value="${esc(pr.phone || '')}" placeholder="z.B. 0151 23456789"></div>
        <div class="field"><label>E-Mail (optional)</label><input id="pf-email" type="email" value="${esc(pr.email || '')}" placeholder="name@mail.de"></div>
      </div>
      <div class="pf-sec">
        <div class="pf-sec-h">🔑 Zugang</div>
        <div class="field"><label>Login-Name (fest, ändert sich nicht)</label><input value="${esc(pr.username || '')}" readonly></div>
        ${ip ? `<div class="field"><label>Fahrschule erreichen</label><div class="inline">${contactButtons(ip)}</div></div>` : ''}
      </div>
      <div class="actions"><button id="pf-save">Speichern</button></div>
    </div>`;
  const setOpen = (o) => {
    state.profileOpen = o;
    $('#pfc-body').classList.toggle('hidden', !o);
    $('#pfc-toggle').textContent = o ? 'Zuklappen ▲' : 'Bearbeiten ▾';
  };
  $('#pfc-head').onclick = () => setOpen(!state.profileOpen);
  const avEl = $('#pf-av-inner'), delBtn = $('#pf-photo-del');
  $('#pf-bdate').oninput = () => { const a = ageFromDate($('#pf-bdate').value); $('#pf-age').value = a == null ? '' : a + ' Jahre'; };
  $('#pf-file').onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      await api('/api/my/profile', { method: 'PATCH', body: { photo: dataUrl } });
      pr.has_photo = true;
      avEl.innerHTML = `<img src="${dataUrl}" alt="Profilfoto">`;
      const hav = card.querySelector('.pfc-av'); if (hav) hav.innerHTML = `<img src="${dataUrl}" alt="">`;
      delBtn.classList.remove('hidden');
      toast('Foto gespeichert ✓', 'ok');
    } catch (err) { toast(err.message, 'err'); }
    e.target.value = '';
  };
  delBtn.onclick = async () => {
    try {
      await api('/api/my/profile', { method: 'PATCH', body: { photo: null } });
      pr.has_photo = false;
      avEl.innerHTML = `<span>${esc(initials($('#pf-name').value || pr.name))}</span>`;
      const hav = card.querySelector('.pfc-av'); if (hav) hav.innerHTML = `<span>${esc(initials($('#pf-name').value || pr.name))}</span>`;
      delBtn.classList.add('hidden');
      toast('Foto entfernt', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  };
  const geoBtn = $('#pf-geo');
  if (geoBtn) geoBtn.onclick = async () => {
    const orig = geoBtn.textContent;
    geoBtn.disabled = true; geoBtn.textContent = '📍 Suche deinen Standort …';
    try {
      const c = await getPosOnce();
      const parts = await geocodeAddressParts(c.latitude, c.longitude);
      if (!parts || (!parts.street && !parts.city)) { toast('Adresse nicht gefunden – bitte manuell eintragen.', 'err'); return; }
      if (parts.street) $('#pf-street').value = parts.street;
      if (parts.house_no) $('#pf-houseno').value = parts.house_no;
      if (parts.zip) $('#pf-zip').value = parts.zip;
      if (parts.city) $('#pf-city').value = parts.city;
      toast(parts.house_no ? 'Standort übernommen ✓' : 'Standort übernommen ✓ – bitte Hausnummer ergänzen.', 'ok');
    } catch (e) { toast('Standort nicht verfügbar: ' + e.message, 'err'); }
    finally { geoBtn.disabled = false; geoBtn.textContent = orig; }
  };
  $('#pf-save').onclick = async () => {
    try {
      await api('/api/my/profile', { method: 'PATCH', body: {
        name: $('#pf-name').value, phone: $('#pf-phone').value,
        email: $('#pf-email').value || null,
        birth_date: $('#pf-bdate').value || null,
        street: $('#pf-street').value || null, house_no: $('#pf-houseno').value || null,
        zip: $('#pf-zip').value || null, city: $('#pf-city').value || null } });
      state.user.name = $('#pf-name').value.trim(); state.user.phone = $('#pf-phone').value.trim();
      toast('Profil gespeichert ✓', 'ok');
      renderProfileCard();   // Kopf-Zusammenfassung auffrischen, aufgeklappt lassen
    } catch (e) { const el = $('#pf-err'); if (el) { el.textContent = e.message; el.classList.remove('hidden'); } else toast(e.message, 'err'); }
  };
}
// „Mein Profil“ öffnen: Karte oben aufklappen + hinscrollen (statt Popup)
window.__openProfile = () => {
  state.profileOpen = true;
  const c = $('#profile-card');
  if (c) { renderProfileCard().then(() => c.scrollIntoView({ behavior: 'smooth', block: 'start' })); }
};
window.__openPhone = window.__openProfile;   // Alias (alte Aufrufe)

// ---------- Geführter Einstieg (Tutorial) für Fahrschüler ----------
const TOUR = [
  { icon: '👋', title: 'Willkommen bei ginoco', text: 'Hier buchst du deine Fahrstunden selbst – schnell und von überall. In ein paar kurzen Schritten zeige ich dir, wie es geht. Du kannst jederzeit auf „Überspringen“ tippen.' },
  { icon: '📅', title: '1. Fahrstunde buchen', text: 'Am schnellsten geht’s mit <strong>🔎 Nächster freier Termin</strong> – ein Tipp und du landest direkt beim nächsten freien Tag. Oder blättere mit ‹ › durch die Tage. Freie Zeiten sind <strong>grün</strong> und mit „FREI“ markiert. Tippe auf <strong>Buchen</strong>, wähle die Dauer (z. B. 80 Min) und bestätige mit „Ja, verbindlich buchen“. Fertig! ✅' },
  { icon: '📋', title: '2. Deine Termine', text: 'Oben unter <strong>„Meine Termine“</strong> siehst du alle gebuchten Stunden mit Datum, Uhrzeit und Treffpunkt. Über <strong>„Zum Kalender hinzufügen“</strong> landen sie in deinem Handy-Kalender.' },
  { icon: '🎁', title: '3. Doch keine Zeit?', text: 'Kannst du an dem Tag nicht: Tippe bei der Stunde auf <strong>„🎁 Ins Angebot geben“</strong> – deine Stunde landet dann in den <strong>Angeboten</strong>, und ein anderer Fahrschüler kann sie übernehmen (auf Wunsch anonym – keiner muss deinen Namen sehen). Übernimmt niemand, bleibt sie einfach bei dir. Ist es noch früh genug, kannst du auch <strong>„Stornieren“</strong>.' },
  { icon: '👤', title: '4. Dein Profil', text: 'Tippe oben auf <strong>👤</strong> und vervollständige deine Daten (Name, Handynummer, Jahrgang). Die sieht <strong>nur dein Fahrlehrer</strong> – kein anderer Fahrschüler.' },
  { icon: '🎉', title: 'Los geht’s!', text: 'Das war’s schon. Viel Erfolg beim Üben! 🚗 Diese Einführung findest du jederzeit wieder über das <strong>❓</strong> oben rechts.' },
];
function openTour() {
  let i = 0;
  const finish = () => { try { localStorage.setItem('ginoco-tour-done', '1'); } catch {} closeModal(); };
  const draw = () => {
    const s = TOUR[i];
    modal(`<div style="text-align:center">
        <div style="font-size:2.8rem;line-height:1;margin:.2rem 0 .3rem">${s.icon}</div>
        <h3 style="margin:.1rem 0 .6rem">${esc(s.title)}</h3>
        <p style="font-size:.96rem;line-height:1.65;color:var(--ink);margin:0 .2rem">${s.text}</p>
        <div class="tour-dots">${TOUR.map((_, k) => `<span class="${k === i ? 'on' : ''}"></span>`).join('')}</div>
      </div>
      <div class="actions" style="justify-content:space-between;align-items:center">
        <button class="ghost sm" id="tour-skip">Überspringen</button>
        <div class="inline" style="gap:.4rem">
          ${i > 0 ? '<button class="sec sm" id="tour-prev">Zurück</button>' : ''}
          <button class="sm" id="tour-next">${i < TOUR.length - 1 ? 'Weiter ›' : 'Los geht’s 🚗'}</button>
        </div>
      </div>`);
    $('#tour-skip').onclick = finish;
    const prev = $('#tour-prev'); if (prev) prev.onclick = () => { i--; draw(); };
    $('#tour-next').onclick = () => { if (i < TOUR.length - 1) { i++; draw(); } else finish(); };
  };
  draw();
}
window.__openTour = openTour;

// ---------- Was ist neu? (Changelog) ----------
const CHANGELOG_VER = '3.72';
const CHANGELOG = [
  { v: '3.72', d: '26.08.2026', title: '🔓 Face ID / Passkey für den Fahrlehrer', items: [
    '🔓 <strong>Passkey-Login:</strong> Der Fahrlehrer meldet sich jetzt per <strong>Face ID / Touch ID</strong> an – ohne Passwort, phishing-sicher. Einrichten unter 🔐 Zugang.',
    '🔐 Zur Erinnerung: Es gibt außerdem echtes Passwort, Authenticator (2-Faktor) und „Passwort vergessen".'] },
  { v: '3.71', d: '25.08.2026', title: '✨ Feiner Feinschliff', items: [
    '🔁 <strong>Wiederholungs-Vorschlag:</strong> Beim Abschließen einer Fahrstunde schlägt Ginoco dem Fahrlehrer vor, was sich zu üben lohnt – zuletzt 🔴 oder lange her.',
    '🎛️ <strong>Edleres Menü:</strong> Das seitliche Menü glänzt jetzt eleganter – schlankere Griffe, sanfter Schimmer, feinere Kacheln.'] },
  { v: '3.70', d: '25.08.2026', title: '🎓 Prüfungsreife, Übersicht & mehr Nachweis', items: [
    '🎓 <strong>Prüfungsreife-Check:</strong> „Bin ich bald so weit?" – zeigt dir auf einen Blick, was noch fehlt: offene Sonderfahrten, rote ADK-Punkte und Ausbildungsabschnitte.',
    '🌄 <strong>Sonderfahrten korrekt gezählt:</strong> Eine Überlandfahrt (225 Min) zählt jetzt als 5 von 5 Einheiten – nicht mehr als „1".',
    '📄 <strong>Nachweis mit Ausbildungsstand:</strong> Der gedruckte Fahrstunden-Nachweis enthält jetzt eine Zusammenfassung – welche Aufgabe wie oft geübt wurde und wie sie sitzt.',
    '🧑‍🏫 <strong>Für den Fahrlehrer:</strong> Gesamtübersicht aller Fahrschüler – wer hat rote Punkte, wer ist fast prüfungsreif.'] },
  { v: '3.69', d: '25.08.2026', title: '🌄 Sonderfahrten selbst buchen (ab Rang 2)', items: [
    '🌄 Ab <strong>Rang 2</strong> (15 Fahrstunden) buchst du deine Pflicht-Sonderfahrten selbst: Überland (225 Min), Autobahn (180 Min) und Nachtfahrt (135 Min).',
    '🗓️ Eigener Bereich in „Meine Woche": Tag wählen – Ginoco zeigt dir nur die Startzeiten, an denen die lange Fahrt noch komplett in den Tag passt.',
    '🚦 Rang 1 sieht 10 Tage im Voraus; ab Rang 2 mehr – und eben die Sonderfahrten.'] },
  { v: '3.68', d: '25.08.2026', title: '📊 Fortschritt im Detail & freie Wunschzeit', items: [
    '🕒 <strong>Freie Wunschzeit:</strong> An freien Tagen wählst du deine Startzeit selbst (z. B. 15:00). Sobald jemand bucht, öffnen sich die Slots davor & danach lückenlos – wer zuerst bucht, gibt den Takt vor.',
    '🚦 <strong>Stand je Aufgabe:</strong> Dein Fahrlehrer bewertet beim Abschließen jede Übung – 🔴 muss noch geübt · 🟡 geübt · 🟢 sitzt ganz gut.',
    '📋 <strong>Ausbildungskarte je Fahrstunde:</strong> Bei jeder Stunde siehst (und lädst) du, was ihr gemacht habt – als sauberes PDF.',
    '📈 <strong>Zusammenfassung:</strong> Wie oft hast du z. B. eingeparkt – je Tag und insgesamt? Alles in „Ausbildungs-Übersicht", inkl. „das üben wir noch".',
    '🔢 <strong>Statistik:</strong> Fahrstunden gesamt (à 80 Min zählt 1, 120 Min = 1,5), davon Schaltstunden, und deine gefahrene Zeit.'] },
  { v: '3.67', d: '24.08.2026', title: '📋 „Was habt ihr heute gemacht?"', items: [
    '📋 Beim Abschließen einer Fahrstunde hakt der Fahrlehrer direkt ab, welche Themen der Ausbildungskarte (Klasse B) heute dran waren – mit Suche.',
    '🗓️ Das wird pro Tag protokolliert: In deiner Ausbildungskarte steht bei jedem Punkt das Datum, an dem ihr es gemacht habt.',
    '✍️ Danach Unterschrift anfordern → du bestätigst per Touch → alles gespeichert.'] },
  { v: '3.66', d: '24.08.2026', title: '📄 Nachweis & Unterschrift beim Abschließen', items: [
    '📄 Fahrstunden-Nachweis neu: Querformat, Ginoco-Logo & Fahrschul-Kopf, aufgeräumte Tabelle.',
    '✍️ Beim Abschließen einer Fahrstunde kann der Fahrlehrer direkt deine Unterschrift anfordern – du bekommst sie ins Postfach und unterschreibst per Touch.',
    '🧑‍🎓 Fahrschüler-Karten aufgeräumt: Login klar als 🔑-Zeile, lange Namen brechen sauber um.'] },
  { v: '3.65', d: '23.08.2026', title: '🔐 Sicherer Fahrlehrer-Zugang', items: [
    '🔑 Login mit PIN oder richtigem Passwort und „Angemeldet bleiben".',
    '📷 Authenticator (2-Faktor) per QR-Code einrichten – einfach mit der Authenticator-App abscannen (oder Schlüssel manuell). Optional bei jeder Anmeldung ein 6-stelliger Code.',
    '🆘 „Passwort vergessen": mit dem Authenticator-Code setzt du dir selbst ein neues Passwort – ganz ohne E-Mail.',
    '🎡 Tab-Icon (Lenkrad-Emblem) wird verlässlich geladen – auch wenn der Browser das alte Symbol gecacht hatte.'] },
  { v: '3.63', d: '23.08.2026', title: '🧾 Rechnungsdatum im Protokoll', items: [
    '🧾 Im Protokoll siehst du jetzt bei jeder Stunde, unter welchem Datum sie auf der Rechnung erscheint – gefahren am … · auf der Rechnung am …',
    '📄 Steht auch auf dem ausgedruckten Fahrstunden-Nachweis, damit alles zusammenpasst.'] },
  { v: '3.62', d: '23.08.2026', title: '✍️ Unterschreiben & Töne', items: [
    '✍️ Nachgetragene Fahrstunden bestätigst du jetzt selbst: Dein Fahrlehrer trägt eine Stunde nach, du bekommst eine Benachrichtigung und unterschreibst mit dem Finger direkt in der App.',
    '📄 Deine Unterschrift erscheint auf dem Fahrstunden-Nachweis („✓ vom Fahrschüler bestätigt").',
    '🔊 Neuer Benachrichtigungston bei neuen Mitteilungen – an/aus unter 🎨 Aussehen.',
    '✨ Fahrlehrer-Bereich aufgeräumt: übersichtlichere Fahrschüler-Karten mit klaren Symbol-Schaltflächen.'] },
  { v: '3.61', d: '21.08.2026', title: '⭐ Bewertung – jetzt richtig gut', items: [
    '🧩 Neuer geführter Ablauf: Du bewertest Schritt für Schritt – Geduld, Erklärungen, Pünktlichkeit, Freundlichkeit und dein Fahrgefühl. Einfach Stern antippen, es geht von allein weiter.',
    '📸 Foto direkt beim Bewerten hochladen – kein Umweg mehr übers Profil. Mit Vorschau, natürlich freiwillig.',
    '🙋 Du bestimmst, wie dein Name erscheint (voll, abgekürzt oder anonym) – mit Live-Vorschau.',
    '✅ Am Ende siehst du deine Bewertung im Überblick, bevor du sie abschickst.'] },
  { v: '3.60', d: '20.08.2026', title: '🎉 Was gibt es Neues? – Das große Ginoco-Update', items: [
    '✉️ <strong>Schreiben in der App:</strong> Du kannst deinem Fahrlehrer jetzt direkt in Ginoco schreiben – Fragen, kurz Bescheid geben, alles an einem Ort. Wie ein Chat.',
    '🔔 <strong>Handy-Benachrichtigungen:</strong> Erinnerungen, Verschiebungen, Absagen und Angebote kommen als Push aufs Handy – auch wenn die App zu ist. Einmal erlauben unter „🔔 Mitteilungen".',
    '📅 <strong>Lückenloses Buchen:</strong> Der Tag fließt – die nächste Fahrstunde schließt automatisch an die vorige an (inkl. Pause und Abholzeit). Fällt eine Stunde aus, rücken die folgenden nach.',
    '📍 <strong>Live-Abholung:</strong> Kurz vor der Fahrstunde siehst du, wo dein Fahrlehrer gerade ist und wann er da ist – „Wo sollen wir dich einsammeln?" inklusive.',
    '⭐ <strong>Bewertungen:</strong> Nach bestandener Prüfung darfst du Ginoco & die Fahrschule bewerten – mit Sternen, Text und wahlweise vollem Namen, abgekürzt oder anonym.',
    '🔑 <strong>Passwort vergessen:</strong> Neues Passwort anfordern – die Anfrage landet direkt bei deinem Fahrlehrer, der es sicher neu setzt.',
    '📲 <strong>App installieren:</strong> Ginoco lässt sich wie eine echte App aufs Handy legen – neues Logo, sauberer „ginoco"-Schriftzug und schnellerer Start.'] },
  { v: '3.59', d: '20.08.2026', title: 'Nachrichten in der App', items: [
    '✉️ Schreib direkt in der App mit deinem Fahrlehrer – Fragen, Bescheid geben, alles an einem Ort (wie ein Chat).',
    '🔔 Neue Nachrichten kommen per Push aufs Handy; gelesen/ungelesen wird angezeigt.',
    '🧑‍🏫 Der Fahrlehrer hat einen eigenen „Nachrichten"-Bereich mit allen Gesprächen und ungelesen-Zähler.'] },
  { v: '3.58', d: '20.08.2026', title: 'Passwort-Anfragen, Recht & App-Reif', items: [
    '🔑 „Passwort vergessen"-Anfragen erscheinen jetzt oben im Fahrlehrer-Dashboard – mit Ein-Tipp-Zurücksetzen und fertigen Zugangsdaten zum Weitergeben.',
    '📄 Datenschutzerklärung & Impressum (Vorlagen) hinzugefügt – verlinkt auf der Startseite, nötig für den App-Store.',
    '📲 App-Reif: Digital-Asset-Links vorbereitet – Ginoco lässt sich als echte Play-Store-/App-Store-App verpacken.'] },
  { v: '3.57', d: '20.08.2026', title: 'Neues Ginoco-Logo & Schriftzug', items: [
    '🎨 Beim Öffnen begrüßt dich jetzt das Ginoco-Lenkrad-Emblem in Orange-Gelb und ein klarer „ginoco"-Schriftzug.',
    '✨ Auch oben in der Kopfzeile: Emblem + Schriftzug im Marken-Look.'] },
  { v: '3.56', d: '20.08.2026', title: 'Handy-Benachrichtigungen (Push)', items: [
    '🔔 Echte Push-Nachrichten aufs Handy – auch wenn die App zu ist: Erinnerungen, Verschiebungen, Absagen, Angebote.',
    '👉 Einschalten unter „🔔 Mitteilungen" → „Benachrichtigungen einschalten" (einmal erlauben). Mit Test-Knopf.',
    '🔒 Datenschutzfreundlich & ohne fremde Dienste – die Schlüssel erzeugt Ginoco selbst.'] },
  { v: '3.55', d: '20.08.2026', title: 'Untern-Buchen-Look & Bewertungen ausgebaut', items: [
    '🎨 Neues Standard-Design im Look der Fahrschule Untern Buchen (Schwarz + warmes Orange). Jederzeit umstellbar unter 🎨 Aussehen.',
    '⭐ Bewertungen-Bereich stark erweitert: Durchschnitt & Sterne-Verteilung, Filter (Alle/Sichtbar/Verborgen/Top), „⭐ Top" anheften, selbst eintragen, bearbeiten, kopieren.',
    '✅ „Echter Fahrschüler"-Haken bei Portal-Bewertungen; nach bestandener Prüfung wird automatisch um eine Bewertung gebeten.'] },
  { v: '3.53', d: '20.08.2026', title: 'Passwort vergessen', items: [
    '🔑 Fahrschüler können ein neues Passwort anfordern – die Anfrage landet direkt beim Fahrlehrer (im Protokoll), der es neu setzt und mitteilt.',
    '🔒 Sicher & ohne Konto-Verrat: die Antwort ist immer gleich, egal ob es den Login gibt.'] },
  { v: '3.52', d: '20.08.2026', title: 'Zwei Standorte (Eberswalde + Finow)', items: [
    '📍 Zweiter Standort Finow: die Abholzeit wird automatisch vom näheren Standort gerechnet.',
    '🎛️ Pro Fahrschüler wählbar, ab welchem Standort geschätzt wird (automatisch/Eberswalde/Finow) – plus feste Abholzeit in Minuten.',
    '🧪 Über 4.000 Zufalls-Prüfungen bestanden: nie Doppelbuchen, nie eine offene Lücke.'] },
  { v: '3.51', d: '20.08.2026', title: 'Bewertungen & Empfehlungen', items: [
    '⭐ Fahrschüler können eine Bewertung abgeben – mit Sternen, freiem Text und wahlweise vollem Namen, abgekürzt (Lena M.) oder anonym, optional mit Profilfoto.',
    '🎉 Nach bestandener Prüfung wird man freundlich um eine Bewertung gebeten – die Akte bleibt erhalten, nichts wird gelöscht.',
    '↔️ Auf der Startseite laufen die Empfehlungen als Laufschrift durch – echte Stimmen zur Fahrschule Untern Buchen (Eberswalde).',
    '🛠️ Der Fahrlehrer moderiert alles (sichtbar/verbergen, antworten, löschen) im neuen Bereich „Bewertungen".'] },
  { v: '3.50', d: '20.08.2026', title: 'Fließender Tagesplan – lückenlos', items: [
    '🔄 Der Tag fließt: die Startzeit der nächsten Fahrstunde wächst automatisch mit der Dauer der vorigen (40/80/120 Min) – plus 15 Min Pause und deiner Abholzeit. So bleibt alles lückenlos.',
    '🚗 Abholzeit je Fahrschüler: trag beim Schüler ein, wie lange die Fahrt dorthin dauert (z. B. Groß Schönebeck = 30 Min) – sie wird vor jeder Stunde eingerechnet.',
    '🧩 Fällt eine Stunde aus, rücken die folgenden automatisch nach vorne – die betroffenen Schüler werden benachrichtigt.',
    '⏰ Neue Tage öffnen jetzt früh um 06:00 Uhr; Monats-Skala bis 130 Std.',
    '🧹 Nachts hält sich der Server selbst sauber – ganz ohne neu anzumelden. Und die App lädt immer frisch (kein Hard-Refresh mehr nötig).'] },
  { v: '3.49', d: '19.08.2026', title: 'Meine Fahrstunden & Nachtragen', items: [
    '📖 Fahrschüler sehen jetzt „Meine Fahrstunden“ – tabellarisch mit Datum & Uhrzeit, Dauer, Art, Verspätung und Vermerk.',
    '➕ Fahrlehrer kann Fahrstunden nachtragen (echtes Fahrdatum, z. B. 18.08. 20:00) – das Eintragedatum wird zusätzlich vermerkt.',
    '📄 Fahrstunden-Nachweis zum Ausdrucken (Tabelle mit Unterschriftsfeldern).'] },
  { v: '3.48', d: '26.07.2026', title: 'Karte aufgewertet & runder Look', items: [
    '🗺️ Live-Karte zeigt jetzt die echte Fahrzeit über die Straße (statt grober Schätzung).',
    '🎯 „Zentrieren“-Knopf – schaust du auf der Karte herum, bleibt die Ansicht stehen, bis du zurücktippst.',
    '🎉 Klarer Hinweis „Dein Fahrlehrer ist da!“, wenn er ganz nah ist.',
    '🛞 Drehender Reifen als Lade-Symbol, wenn der Server kurz braucht – plus runderer, weicherer Look.'] },
  { v: '3.47', d: '26.07.2026', title: 'Privatmodus', items: [
    '🔒 Ginoco läuft jetzt im Privatmodus: neue Anmeldungen sind geschlossen – nur du (und bestehende Zugänge) nutzen die App.',
    '⚙️ Jederzeit umschaltbar unter Einstellungen → „Privatmodus & Registrierung“, falls du später Fahrschüler einladen willst.'] },
  { v: '3.46', d: '26.07.2026', title: 'Neue Live-Karte direkt in der App', items: [
    '🗺️ Echte Live-Karte in Ginoco: der Fahrlehrer-Punkt bewegt sich live, die Route wird eingezeichnet – kein Wechsel zu Google Maps mehr nötig.',
    '📍 Entfernung & Ankunftszeit direkt dabei; die Karte aktualisiert sich automatisch.',
    '🔒 Datenschutzfreundlich über OpenStreetMap, ohne fremde Tracker.'] },
  { v: '3.45', d: '26.07.2026', title: 'Läuft alles? – Live-Status vor der Fahrstunde', items: [
    '✅ Schon ~1 Std vorher siehst du: „Alles läuft planmäßig" – oder „wir starten etwas später".',
    '🍦 Freundliche Frage vorab: „Wo sollen wir dich einsammeln?" – noch beim Eisessen? Kein Problem, kurz Bescheid geben.',
    '⏱️ Fahrlehrer kann mit einem Tipp „+10/+15/+30 Min später" ansagen – die Fahrschüler werden automatisch informiert.'] },
  { v: '3.44', d: '26.07.2026', title: 'Menü beidseitig & frei einfärbbar', items: [
    '↔️ Das Menü öffnet links und rechts gleichzeitig – mit dem ✕ in der Mitte schließt du beide zusammen.',
    '🎨 Menü-Farbe frei wählbar: färbe die beiden Menüseiten, wie es dir gefällt (Aussehen → Menü-Farbe).',
    '🔲 Auch bei geöffnetem Menü immer zwei Kacheln nebeneinander.'] },
  { v: '3.42', d: '26.07.2026', title: 'Schönere Anmeldung & Tages-Überblick', items: [
    '🎨 Aufgehübschte Login-/Registrierungsseite (buntes Logo, Feature-Chips).',
    '📱 Fahrlehrer-„Heute": Begrüßung + Kurzüberblick (Stunden heute, nächste Stunde).'] },
  { v: '3.41', d: '26.07.2026', title: 'Suche in der Ausbildungskarte', items: [
    '🔍 Suchleiste in der Ausbildungskarte – tippe z.B. „Kreisverkehr“ und hake direkt ab, ohne Scrollen.'] },
  { v: '3.40', d: '26.07.2026', title: 'Theorie sammeln eintragen', items: [
    '📋 Mehrere Theorie-Termine auf einmal eintragen (Datum, Von, Bis, Titel – mit Vorschau).'] },
  { v: '3.39', d: '26.07.2026', title: 'Ausbildungskarte im Vollbild', items: [
    '📋 Ausbildungskarte öffnet jetzt als große Vollbild-Seite (statt engem Fenster).',
    '🚗 Direkt aus der Fahrstunde abhakbar: Knopf „Ausbildungskarte abhaken“.'] },
  { v: '3.38', d: '25.07.2026', title: 'Feinschliff rundum', items: [
    '🏠 Einladendere Startseite: große Begrüßung + prominente „nächste Fahrstunde“.',
    '🔔 Mitteilungen schöner dargestellt (Karten mit Icon).',
    '📊 Protokoll mit Statistik-Überblick; 🗓️ Kalender hübscher.'] },
  { v: '3.37', d: '25.07.2026', title: 'Ausbildungskarte griffbereit', items: [
    '📋 Deine Ausbildungskarte jetzt direkt auf der Startseite (Knopf in der Fortschritts-Karte).',
    '🆕 Oben siehst du, was dein Fahrlehrer zuletzt abgehakt hat.'] },
  { v: '3.35', d: '25.07.2026', title: 'Ausbildungskarte: PDF & Einsicht', items: [
    '📄 Fahrlehrer kann die Ausbildungskarte als PDF drucken/speichern (mit Unterschriftsfeldern).',
    '👀 Fahrschüler sehen ihre eigene Ausbildungskarte jetzt selbst (nur lesen) – im Menü „Ausbildungskarte“.'] },
  { v: '3.34', d: '25.07.2026', title: 'Einheitlicher Look & Hilfe', items: [
    '💬 Kleine „?“-Erklärungen direkt an kniffligen Feldern (z. B. Sperrfrist, Rang 2, Sonderfahrten).',
    '🎴 Einheitliches Karten-Design: überall gleiche Rundungen und ruhige Abstände.'] },
  { v: '3.33', d: '25.07.2026', title: 'Neuer, edlerer Look', items: [
    '✨ Feiner Schliff überall: weiche Übergänge, sanftes Ein-/Ausklappen.',
    '👆 Knöpfe und Kacheln geben jetzt spürbares Tipp-Feedback.',
    '🪟 Fenster blenden elegant ein statt hart aufzupoppen.'] },
  { v: '3.32', d: '25.07.2026', title: 'Standort & Neuigkeiten', items: [
    '📍 Adresse per aktuellem Standort automatisch ausfüllen – du ergänzt nur die Hausnummer.',
    '✨ Dieses „Was ist neu?“-Fenster – hier siehst du künftig alle Verbesserungen.'] },
  { v: '3.31', d: '25.07.2026', title: 'Schneller & sauberer', items: [
    '⚡ ginoco startet schneller (App lädt aus dem Cache).',
    '🪟 Fenster schließen jetzt sauber ab – kein Überlappen mehr.',
    '🛰️ Live-Karte mit Straßennamen und „Dein Fahrlehrer ist auf dem Weg zu dir“.'] },
  { v: '3.30', d: '25.07.2026', title: 'Angebote & Bedienung', items: [
    '🎁 Fahrstunden einfacher „Ins Angebot geben“ (früher „Feed“).',
    '🧑‍🎓 Fahrschüler-Liste und Einstellungen komplett aufgeräumt.',
    '🎨 Neue Metallic-Schriftfarben: Gold, Bronze, Carbon, Metallic Schwarz.'] },
];
function markWhatsNewSeen() { try { localStorage.setItem('ginoco-cl-seen', CHANGELOG_VER); } catch {} }
function hasUnseenNews() { try { return localStorage.getItem('ginoco-cl-seen') !== CHANGELOG_VER; } catch { return false; } }
function openWhatsNew() {
  markWhatsNewSeen();
  document.querySelectorAll('.edge-handle.right').forEach((h) => h.classList.remove('hasnew'));
  modal(`<h3>✨ Was ist neu?</h3>
    <p class="hint">Die letzten Verbesserungen in ginoco:</p>
    ${CHANGELOG.map((c) => `<div class="wn-block">
      <div class="wn-h"><span class="wn-v">v${c.v}</span> <strong>${esc(c.title)}</strong> <span class="muted">· ${c.d}</span></div>
      <ul class="wn-list">${c.items.map((i) => `<li>${i}</li>`).join('')}</ul>
    </div>`).join('')}
    <div class="actions"><button onclick="window.__closeModal()">Alles klar 🚗</button></div>`, 'wide');
}
window.__openWhatsNew = openWhatsNew;

// ---------- API ----------
// Reifen-Ladeanzeige: erscheint nur, wenn der Server kurz braucht (> 400 ms).
let _apiInflight = 0, _apiTimer = null;
function _ensureLoader() {
  let el = document.getElementById('app-loader');
  if (!el) {
    el = document.createElement('div'); el.id = 'app-loader';
    el.innerHTML = '<span class="tire" aria-hidden="true">🛞</span><span class="al-tx">Einen Moment …</span>';
    el.setAttribute('role', 'status'); el.setAttribute('aria-label', 'Lädt');
    document.body.appendChild(el);
  }
  return el;
}
function _apiLoading(on) {
  if (on) {
    _apiInflight++;
    if (_apiInflight === 1 && !_apiTimer) _apiTimer = setTimeout(() => { _ensureLoader().classList.add('show'); }, 400);
  } else {
    _apiInflight = Math.max(0, _apiInflight - 1);
    if (_apiInflight === 0) { clearTimeout(_apiTimer); _apiTimer = null; document.getElementById('app-loader')?.classList.remove('show'); }
  }
}
async function api(path, opts = {}) {
  _apiLoading(true);
  try {
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error(data.error || 'Fehler');
    return data;
  } finally { _apiLoading(false); }
}

// ---------- Datum (durchgehend LOKALE Zeit, nie toISOString -> sonst TZ-Versatz) ----------
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function todayStr() { return ymd(new Date()); }
function parseD(s) { return new Date(s + 'T00:00:00'); }
function isoDow(s) { const d = parseD(s).getDay(); return d === 0 ? 7 : d; }
function addDays(s, n) { const d = parseD(s); d.setDate(d.getDate() + n); return ymd(d); }
function addMonths(s, n) { const d = parseD(s); d.setMonth(d.getMonth() + n); return ymd(d); }
function firstOfMonth(s) { const d = parseD(s); return ymd(new Date(d.getFullYear(), d.getMonth(), 1)); }
function mondayOf(s) { return addDays(s, -(isoDow(s) - 1)); }
function fmtDay(s) { const d = parseD(s); return `${WD_LONG[isoDow(s) - 1]}, ${d.getDate()}. ${MON[d.getMonth()]} ${d.getFullYear()}`; }
function fmtShort(s) { const d = parseD(s); return `${d.getDate()}.${d.getMonth() + 1}.`; }
function hoursUntil(date, start) { return (new Date(`${date}T${start}:00`).getTime() - Date.now()) / 36e5; }
function daysAhead(date) { return Math.round((parseD(date).getTime() - parseD(todayStr()).getTime()) / 864e5); }
function minToH(m) { return (m / 60); }
function hLabel(m) { const h = Math.floor(m / 60), mm = m % 60; return mm ? `${h}:${String(mm).padStart(2, '0')} h` : `${h} h`; }

// ---------- Kontakt / Geo ----------
function telLink(p) { return 'tel:' + String(p || '').replace(/[^+\d]/g, ''); }
function waNumber(p) { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '49' + d.slice(1); return d; }
function waLink(p) { return 'https://wa.me/' + waNumber(p); }
function contactButtons(phone, waText) {
  if (!phone) return '';
  const t = waText ? '?text=' + encodeURIComponent(waText) : '';
  return `<a class="pill" href="${telLink(phone)}" style="text-decoration:none">📞 Anrufen</a>
    <a class="pill" href="${waLink(phone)}${t}" target="_blank" rel="noopener" style="text-decoration:none">💬 WhatsApp</a>`;
}
function getPosOnce() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Kein GPS verfügbar'));
    navigator.geolocation.getCurrentPosition((p) => resolve(p.coords), (e) => reject(new Error(e.message)), { enableHighAccuracy: true, timeout: 12000 });
  });
}
// Adresse aus Koordinaten (OpenStreetMap/Nominatim). Fehler werden still verschluckt.
async function reverseGeocode(lat, lng) {
  try {
    const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const r = await fetch(u, { headers: { 'Accept-Language': 'de' } });
    if (!r.ok) return null;
    const a = (await r.json()).address || {};
    const street = [a.road, a.house_number].filter(Boolean).join(' ');
    const city = a.city || a.town || a.village || a.suburb || '';
    const out = [street, [a.postcode, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return out || null;
  } catch { return null; }
}
// Adresse aus Koordinaten in Einzelfeldern (für das Profil-Auto-Ausfüllen).
async function geocodeAddressParts(lat, lng) {
  try {
    const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const r = await fetch(u, { headers: { 'Accept-Language': 'de' } });
    if (!r.ok) return null;
    const a = (await r.json()).address || {};
    return {
      street: a.road || a.pedestrian || a.footway || a.residential || '',
      house_no: a.house_number || '',
      zip: a.postcode || '',
      city: a.city || a.town || a.village || a.suburb || a.municipality || '',
    };
  } catch { return null; }
}
// Live-Standort teilen (Fahrlehrer)
let liveWatchId = null;
function startLiveShare() {
  if (!navigator.geolocation) { toast('GPS nicht verfügbar', 'err'); return; }
  liveWatchId = navigator.geolocation.watchPosition(async (p) => {
    try { await api('/api/instructor/location', { method: 'POST', body: { lat: p.coords.latitude, lng: p.coords.longitude } }); } catch {}
    if (state.instrTab === 'heute') { const el = $('#live-instr'); if (el) el.dataset.ts = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); }
  }, (e) => { toast('Standort-Fehler: ' + e.message, 'err'); stopLiveShare(); },
    { enableHighAccuracy: true, maximumAge: 8000, timeout: 20000 });
  state.liveSharing = true;
  if (state.user?.role === 'instructor') renderInstructor();
  toast('Standort wird geteilt 🛰️', 'ok');
}
function stopLiveShare() {
  if (liveWatchId != null) navigator.geolocation.clearWatch(liveWatchId);
  liveWatchId = null; state.liveSharing = false;
  api('/api/instructor/location/stop', { method: 'POST' }).catch(() => {});
  if (state.user?.role === 'instructor') renderInstructor();
}
window.__startLive = startLiveShare;
window.__stopLive = stopLiveShare;

// ---------- UI-Helfer ----------
let toastTimer;
function toast(msg, kind = '', ms = 3200) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast ' + kind; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
// Kurzer, edler Erfolgs-Moment nach einer Buchung: gezeichneter Haken + zarte
// Konfetti + ein Auto, das einmal durchfährt. Respektiert „Bewegung reduzieren“.
let celebrateBusy = false;
function celebrate(label) {
  if (celebrateBusy) return; celebrateBusy = true;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const colors = ['var(--brand)', 'var(--good)', 'var(--warn)', '#ffffff'];
  const conf = reduce ? '' : Array.from({ length: 16 }, (_, i) => {
    const l = Math.round(6 + Math.random() * 88);
    const d = (Math.random() * 0.35).toFixed(2);
    const r = Math.round(Math.random() * 360);
    return `<i style="left:${l}%;--d:${d}s;--r:${r}deg;background:${colors[i % colors.length]}"></i>`;
  }).join('');
  const ov = document.createElement('div');
  ov.className = 'celebrate';
  ov.innerHTML = `
    <div class="cel-conf">${conf}</div>
    <div class="cel-card">
      <svg class="cel-check" viewBox="0 0 52 52" aria-hidden="true">
        <circle class="cel-ring" cx="26" cy="26" r="24"/>
        <path class="cel-tick" d="M15 27 l7 7 l15 -16"/>
      </svg>
      <div class="cel-label">${esc(label || 'Gebucht')}</div>
    </div>
    ${reduce ? '' : '<div class="cel-car">🚗</div>'}`;
  document.body.appendChild(ov);
  setTimeout(() => ov.classList.add('out'), reduce ? 700 : 1500);
  setTimeout(() => { ov.remove(); celebrateBusy = false; }, reduce ? 1000 : 1980);
}
// ---------- Kontext-Hilfe: kleiner „?“ neben Feldern -> Erklär-Blase ----------
function helpDot(text) { return `<button type="button" class="help-dot" data-help="${esc(text)}" aria-label="Erklärung">?</button>`; }
let helpTimer = null;
function showHelp(text) {
  document.getElementById('help-pop')?.remove();
  const el = document.createElement('div');
  el.id = 'help-pop'; el.className = 'help-pop';
  el.innerHTML = `<span>${esc(text)}</span><button class="help-x" aria-label="schließen">✕</button>`;
  document.body.appendChild(el);
  const close = () => { el.remove(); document.removeEventListener('click', onDoc, true); };
  el.querySelector('.help-x').onclick = close;
  const onDoc = (e) => { if (!el.contains(e.target) && !e.target.closest('.help-dot')) close(); };
  setTimeout(() => document.addEventListener('click', onDoc, true), 60);
  clearTimeout(helpTimer); helpTimer = setTimeout(close, 10000);
}
document.addEventListener('click', (e) => {
  const d = e.target.closest('.help-dot');
  if (d) { e.preventDefault(); e.stopPropagation(); showHelp(d.dataset.help); }
});
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function modal(html, extra) {
  closeModal();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  const m = document.createElement('div');
  m.className = 'modal' + (extra === 'wide' ? ' wide' : '');
  m.innerHTML = html;
  // Inhalt in einen eigenen Scroll-Bereich packen; die Aktionsleiste (falls vorhanden)
  // bleibt als fester Footer außen – so überlappt nichts und nichts scheint durch.
  const actions = m.querySelector(':scope > .actions');
  const body = document.createElement('div');
  body.className = 'modal-body';
  while (m.firstChild && m.firstChild !== actions) body.appendChild(m.firstChild);
  m.insertBefore(body, m.firstChild);
  bg.appendChild(m);
  bg.addEventListener('click', (e) => { if (e.target === bg) closeModal(); });
  document.body.appendChild(bg);
  const pwa = document.getElementById('pwa-install'); if (pwa) pwa.style.display = 'none';  // überlappt sonst das Fenster
  return bg;
}
function closeModal() {
  const m = $('.modal-bg'); if (m) m.remove();
  if (!$('.modal-bg')) { const pwa = document.getElementById('pwa-install'); if (pwa) pwa.style.display = ''; }
}

// ====================== Boot ======================
(async function boot() {
  try {
    const [me, s] = await Promise.all([api('/api/auth/me'), api('/api/settings')]);
    state.user = me.user; state.settings = s.settings;
  } catch (e) { /* settings evtl. ohne login */ }
  render();
})();

function render() {
  if (!state.user) return renderAuth();
  if (state.user.role === 'instructor') return renderInstructor();
  return renderStudent();
}

function header() {
  const u = state.user;
  return `<header>
    <div class="brand"><img class="logo" src="/logo.svg?v=3630" alt="" width="24" height="24" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'logo',textContent:'🚗'}))"> <span class="brandname">ginoco</span></div>
    <div class="who">
      <span class="role">${u.role === 'instructor' ? 'Fahrlehrer' : 'Fahrschüler'}</span>
      ${u.role === 'instructor' ? '' : `<strong>${esc(u.name || '')}</strong>`}${u.username ? `<span class="pill">${esc(u.username)}</span>` : ''}
      ${state.liveSharing ? '<button class="ghost sm" onclick="window.__stopLive()" title="Standort-Teilen beenden" style="color:var(--good)">🛰️ Live · Stopp</button>' : ''}
      ${u.role === 'student' ? '<button class="ghost sm" onclick="window.__openTour()" title="Kurze Einführung">❓</button>' : ''}
      ${u.role === 'student' ? '<button class="ghost sm" onclick="window.__openProfile()" title="Mein Profil">👤</button>' : ''}
      <button class="ghost sm" onclick="window.__openThemePicker()" title="Aussehen & Farben">🎨</button>
      <button class="ghost sm" id="logout">Abmelden</button>
    </div>
  </header>`;
}
function wireLogout() {
  const b = $('#logout');
  if (b) b.onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); state.user = null; render(); };
}

// ---------- Edge-Menüs (links: Navigation, rechts: Aktionen) ----------
// Kachel-Menüs am Bildschirmrand: kleiner Griff antippen -> Leiste fährt herein.
// Jeder Eintrag ist eine Kachel (Icon oben, Text drunter), logisch gruppiert.
// Einträge [key, icon, label]; ['__group', Titel] ist eine Gruppen-Überschrift.
const INSTR_NAV = [
  ['__group', 'Übersicht'],
  ['heute', '📊', 'Heute & Ziele'], ['kalender', '📅', 'Kalender'],
  ['__group', 'Fahrschüler'],
  ['schueler', '🧑‍🎓', 'Fahrschüler'], ['nachrichten', '✉️', 'Nachrichten'], ['codes', '🔑', 'Zugangscodes'],
  ['__group', 'Planung'],
  ['arbeitszeiten', '🕒', 'Arbeitszeiten'], ['theorie', '📚', 'Theorie'],
  ['__group', 'System'],
  ['bewertungen', '⭐', 'Bewertungen'],
  ['protokoll', '📋', 'Protokoll'], ['einstellungen', '⚙️', 'Einstellungen'],
];
const STUDENT_NAV = [
  ['__group', 'Übersicht'],
  ['week-card', '📅', 'Meine Woche'], ['slots', '🚗', 'Termin buchen'],
  ['lessons-card', '📖', 'Meine Fahrstunden'],
  ['__group', 'Mehr'],
  ['messages-card', '✉️', 'Nachrichten'],
  ['notif-card', '🔔', 'Mitteilungen'], ['offers-card', '🎁', 'Angebote'],
  ['review-card', '⭐', 'Bewertung'],
];
// Flache Liste (mit '__group'-Markern) -> gruppierte Kacheln
function edgeTilesHTML(items, attr) {
  let html = '', open = false;
  for (const it of items) {
    if (it[0] === '__group') {
      if (open) html += '</div></div>';
      html += `<div class="edge-groupwrap"><div class="edge-group">${esc(it[1])}</div><div class="edge-tiles">`;
      open = true;
    } else {
      const [key, icon, label] = it;
      const badge = key === 'protokoll' ? '<span id="ev-badge" class="et-badge"></span>' : '';
      html += `<button class="edge-tile" ${attr}="${key}"><span class="et-ic">${icon}</span><span class="et-lb">${esc(label)}</span>${badge}</button>`;
    }
  }
  if (open) html += '</div></div>';
  return html;
}
function mountEdgeMenus(role) {
  document.querySelectorAll('.edge-root').forEach((n) => n.remove());
  const leftItems = role === 'instructor'
    ? edgeTilesHTML(INSTR_NAV, 'data-nav')
    : edgeTilesHTML(STUDENT_NAV, 'data-scroll');
  const live = state.liveSharing ? [['live', '🛰️', 'Live beenden']] : [];
  const rightGroups = role === 'student'
    ? [['__group', 'Anpassen'], ['theme', '🎨', 'Aussehen'], ['phone', '👤', 'Mein Profil'], ['training', '📋', 'Ausbildungskarte'], ['tour', '❓', 'Einführung'], ['whatsnew', '✨', 'Was ist neu?'],
       ['__group', 'Konto'], ...live, ['reload', '🔄', 'Aktualisieren'], ['logout', '🚪', 'Abmelden']]
    : [['__group', 'Anpassen'], ['theme', '🎨', 'Aussehen'], ['whatsnew', '✨', 'Was ist neu?'],
       ['__group', 'Konto'], ...live, ['reload', '🔄', 'Aktualisieren'], ['logout', '🚪', 'Abmelden']];
  const rightItems = edgeTilesHTML(rightGroups, 'data-act');
  const root = document.createElement('div');
  root.className = 'edge-root';
  root.innerHTML = `
    <button class="edge-handle left" aria-label="Menü öffnen">☰</button>
    <button class="edge-handle right" aria-label="Menü öffnen">⋯</button>
    <div class="edge-overlay"></div>
    <button class="edge-x" aria-label="Menü schließen">✕</button>
    <aside class="edge-panel left"><div class="edge-title">Menü</div>${leftItems}</aside>
    <aside class="edge-panel right"><div class="edge-title">Aktionen</div>${rightItems}</aside>`;
  document.body.appendChild(root);
  // Beide Seiten öffnen sich zeitgleich; das ✕ in der Mitte schließt beide.
  const open = () => root.classList.add('open-both');
  const close = () => root.classList.remove('open-both', 'open-left', 'open-right');
  root.querySelector('.edge-handle.left').onclick = open;
  root.querySelector('.edge-handle.right').onclick = open;
  root.querySelector('.edge-overlay').onclick = close;
  root.querySelector('.edge-x').onclick = close;
  // aktive Kachel markieren (Fahrlehrer)
  if (role === 'instructor') root.querySelectorAll('[data-nav]').forEach((b) =>
    b.classList.toggle('active', b.dataset.nav === state.instrTab));
  root.querySelectorAll('[data-nav]').forEach((b) => b.onclick = () => {
    state.instrTab = b.dataset.nav; close(); drawInstrTab();
    root.querySelectorAll('[data-nav]').forEach((x) => x.classList.toggle('active', x === b));
  });
  // Leere Bereiche (Feed/Mitteilungen) nicht mit Fehler abweisen, sondern
  // freundlich mit Leer-Zustand zeigen. Beim nächsten Sync werden sie – falls
  // weiterhin leer – wieder ausgeblendet.
  const EMPTY_SECTION = {
    'offers-card': '<h2>🎁 Angebote</h2><p class="muted">Gerade gibt niemand eine Fahrstunde ab. Schau später wieder rein – hier erscheinen freie Stunden, die du übernehmen kannst.</p>',
    'notif-card': '<h2>🔔 Mitteilungen</h2><p class="muted">Keine neuen Mitteilungen. Hier landen z.B. neue Termine, Verschiebungen oder Angebote.</p>',
    'lesson-card': '<h2>🚗 Deine Fahrstunde</h2><p class="muted">Rund um deine nächste Fahrstunde erscheint hier der Start-Knopf und der Fahrzeit-Timer.</p>',
    'live-card': '<h2>📍 Treffpunkt</h2><p class="muted">Kurz vor deiner Fahrstunde siehst du hier den Treffpunkt und wo dein Fahrlehrer gerade ist.</p>',
    'lessons-card': '<h2>📖 Meine Fahrstunden</h2><p class="muted">Sobald du deine erste Fahrstunde gefahren bist, erscheint sie hier – mit Datum, Uhrzeit, Dauer und Vermerk. Daraus kannst du dir jederzeit einen Nachweis drucken.</p>',
    'messages-card': '<h2>✉️ Nachrichten</h2><p class="muted">Schreib deinem Fahrlehrer – z. B. eine Frage oder kurz Bescheid, wenn du dich verspätest. Der Chat lädt gleich.</p>',
    'review-card': '<h2>⭐ Bewertung</h2><p class="muted">Hier kannst du Ginoco und deine Fahrschule bewerten. Nach bestandener Prüfung wirst du freundlich um eine Empfehlung gebeten.</p>',
  };
  root.querySelectorAll('[data-scroll]').forEach((b) => b.onclick = () => {
    close(); const id = b.dataset.scroll; const el = document.getElementById(id);
    if (!el) { toast('Dieser Bereich ist gerade nicht verfügbar', 'err'); return; }
    // Verstecktes/leeres Ziel: freundlichen Leer-Zustand zeigen, damit ein
    // Menüpunkt nie ins Nichts scrollt. Beim nächsten Sync füllt/versteckt
    // sich die Kachel wieder von selbst.
    if (el.classList.contains('hidden')) {
      if (EMPTY_SECTION[id]) el.innerHTML = EMPTY_SECTION[id];
      el.classList.remove('hidden');
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  root.querySelectorAll('[data-act]').forEach((b) => b.onclick = async () => {
    close(); const a = b.dataset.act;
    if (a === 'theme') window.__openThemePicker?.();
    else if (a === 'phone') window.__openPhone?.();
    else if (a === 'training') window.__openMyTraining?.();
    else if (a === 'tour') window.__openTour?.();
    else if (a === 'whatsnew') window.__openWhatsNew?.();
    else if (a === 'live') window.__stopLive?.();
    else if (a === 'reload') location.reload();
    else if (a === 'logout') { await api('/api/auth/logout', { method: 'POST' }); state.user = null; render(); }
  });
  // Kleiner „Neu“-Punkt am ⋯-Griff, solange es ungesehene Updates gibt
  if (hasUnseenNews()) root.querySelector('.edge-handle.right')?.classList.add('hasnew');
}

// ====================== LOGIN ======================
// Portal-Modus je nach Adresse:
//  mcp.ginoco.de      -> nur Fahrlehrer-Zugang
//  ginoco.de / www    -> nur Fahrschüler (Anmelden + Registrieren)
//  sonst (localhost, neu., IP) -> alles (zum Testen)
function portalMode() {
  const h = location.hostname;
  if (h === 'mcp.ginoco.de' || h.startsWith('mcp.')) return 'admin';
  if (h === 'ginoco.de' || h === 'www.ginoco.de') return 'student';
  return 'all';
}
function renderAuth() {
  const mode = portalMode();
  const regOpen = state.settings?.registration_open === '1'; // privat, wenn geschlossen
  const reg = regOpen ? [['register', 'Neu (mit Code)']] : [];
  const TABS = mode === 'admin'
    ? [['instr', 'Fahrlehrer']]
    : mode === 'student'
      ? [['login', 'Anmelden'], ...reg]
      : [['login', 'Anmelden'], ...reg, ['instr', 'Fahrlehrer']];
  let tab = TABS[0][0];
  const tagline = mode === 'admin' ? 'Fahrlehrer-Bereich' : 'Fahrstunden einfach online buchen';
  const draw = () => {
    app.innerHTML = `<div class="auth-wrap"><div class="auth">
      <div class="auth-hero">
        <div class="auth-logo"><img src="/logo.svg?v=3630" alt="Ginoco" width="70" height="70" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'🚗'}))"></div>
        <h1 class="auth-name">ginoco</h1>
        <div class="tag">${tagline}</div>
      </div>
      ${mode === 'admin' ? `<div class="auth-feats">
        <span>📅 Tagesplan</span><span>🧑‍🎓 Fahrschüler</span><span>⭐ Bewertungen</span><span>🔔 Push</span>
      </div>` : `<div class="auth-feats">
        <span>📅 Selbst buchen</span><span>🎁 Tauschen</span><span>📍 Live-Abholung</span>
      </div>`}
      <div class="card">
        ${TABS.length > 1 ? `<div class="tabs">
          ${TABS.map(([t, l]) => `<button data-t="${t}" class="${tab === t ? 'active' : ''}">${l}</button>`).join('')}
        </div>` : ''}
        <div id="authbody"></div>
      </div>
      <div class="center"><button class="ghost sm" onclick="window.__openThemePicker()">🎨 Aussehen</button></div>
      <div class="center legal-links"><a href="/datenschutz.html">Datenschutz</a> · <a href="/impressum.html">Impressum</a></div>
      ${mode !== 'admin' ? '<div class="rev-marquee" id="rev-marquee" hidden></div>' : ''}
    </div></div>`;
    app.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => { tab = b.dataset.t; draw(); });
    const body = $('#authbody');
    if (tab === 'login') body.innerHTML = loginForm();
    else if (tab === 'register') body.innerHTML = registerForm();
    else body.innerHTML = instrForm();
    wireAuth(tab);
    if (mode !== 'admin') loadReviewMarquee();
  };
  draw();
}

// Bewertungen als Laufschrift (rechts -> links) auf der Startseite.
async function loadReviewMarquee() {
  const el = $('#rev-marquee');
  if (!el) return;
  let reviews = [];
  try { reviews = (await api('/api/reviews')).reviews || []; } catch { return; }
  if (!reviews.length) return;
  const stars = (n) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
  const card = (r) => `<div class="rev-card${r.featured ? ' feat' : ''}">
    <div class="rev-stars">${stars(r.rating)}${r.featured ? ' <span class="rev-toptag">★ Top</span>' : ''}</div>
    <div class="rev-text">„${esc(r.text)}"</div>
    <div class="rev-who">${r.photo ? `<img class="rev-pic" src="${esc(r.photo)}" alt="">` : '<span class="rev-pic ph">🙂</span>'}<span>${esc(r.author)}</span>${r.verified ? '<span class="rev-verif" title="Echter Fahrschüler">✓</span>' : ''}</div>
  </div>`;
  // Inhalt doppelt fuer nahtlose Endlosschleife
  const items = reviews.map(card).join('');
  el.innerHTML = `<div class="rev-title">Das sagen Fahrschüler über Ginoco &amp; die Fahrschule Untern Buchen (Eberswalde)</div>
    <div class="rev-track" style="--rev-n:${reviews.length}">${items}${items}</div>`;
  el.hidden = false;
}

const errBox = () => `<div class="err hidden" id="autherr"></div>`;
function showErr(msg) { const e = $('#autherr'); if (e) { e.textContent = msg; e.classList.remove('hidden'); } }

function loginForm() {
  return `${errBox()}
    <div class="field"><label>Login-Name oder E-Mail</label><input id="l-email" autocomplete="username" placeholder="z.B. MM1997"></div>
    <div class="field"><label>Passwort</label><input id="l-pw" type="password" autocomplete="current-password"></div>
    <div class="form-actions"><button id="l-go">Anmelden</button></div>
    <p class="hint" style="margin-top:.6rem">Passwort vergessen? <a href="#" id="l-forgot" class="linklike">Neues anfordern</a> – dein Fahrlehrer setzt dir dann eins.</p>`;
}
function openForgotModal() {
  modal(`<h3>Passwort vergessen</h3>
    <p class="hint">Gib deinen Login-Namen oder deine E-Mail ein. Dein Fahrlehrer bekommt Bescheid und setzt dir ein neues Passwort – er teilt es dir persönlich mit.</p>
    ${errBox()}
    <div class="field"><label>Login-Name oder E-Mail</label><input id="fg-login" autocomplete="username" placeholder="z.B. MM1997"></div>
    <div class="actions">
      <button class="sec" onclick="window.__closeModal()">Abbrechen</button>
      <button id="fg-go">Anfordern</button>
    </div>`);
  $('#fg-go').onclick = async () => {
    const login = $('#fg-login').value.trim();
    if (!login) { showErr('Bitte Login-Name oder E-Mail eingeben.'); return; }
    try {
      await api('/api/auth/reset-request', { method: 'POST', body: { login } });
      closeModal();
      toast('Angefragt ✓ – dein Fahrlehrer meldet sich mit einem neuen Passwort.', 'ok');
    } catch (e) { showErr(e.message); }
  };
}
function registerForm() {
  return `${errBox()}
    <p class="hint">Du hast von deinem Fahrlehrer einen Zugangscode bekommen? Damit legst du hier einmalig dein Konto an. Deinen Login-Namen bekommst du danach angezeigt.</p>
    <div class="field"><label>Zugangscode</label><input id="r-code" placeholder="XXXX-XXXX" style="text-transform:uppercase"></div>
    <div class="row">
      <div class="field"><label>Name</label><input id="r-name" autocomplete="name" placeholder="Vor- und Nachname"></div>
      <div class="field" style="max-width:130px"><label>Jahrgang</label><input id="r-year" type="number" placeholder="1997" min="1930" max="2015"></div>
    </div>
    <div class="row">
      <div class="field"><label>E-Mail (optional)</label><input id="r-email" type="email"></div>
      <div class="field"><label>Telefon (optional)</label><input id="r-phone"></div>
    </div>
    <div class="field"><label>Passwort</label><input id="r-pw" type="password"><div class="hint" style="margin:.3rem 0 0">Mind. 8 Zeichen, mit Buchstabe, Zahl und Sonderzeichen (z. B. ! ? # @).</div></div>
    <div class="form-actions"><button id="r-go">Konto erstellen</button></div>`;
}
function instrForm() {
  return `${errBox()}
    <p class="hint">Zugang nur für den Fahrlehrer.</p>
    <div class="field"><label>PIN oder Passwort</label><input id="i-pin" type="password" autocomplete="current-password"></div>
    <div class="field hidden" id="i-2fa-wrap"><label>Authenticator-Code</label><input id="i-code" inputmode="numeric" autocomplete="one-time-code" placeholder="6-stelliger Code"></div>
    <label class="ck-line" style="justify-content:flex-start;margin:.1rem 0 .3rem"><input type="checkbox" id="i-remember" checked> Angemeldet bleiben</label>
    <div class="form-actions"><button id="i-go">Anmelden</button></div>
    ${state.settings?.passkey_enabled ? '<div class="or-sep">oder</div><button id="i-passkey" class="sec" type="button" style="width:100%">🔓 Mit Face ID / Passkey anmelden</button>' : ''}
    <p class="hint" style="margin-top:.6rem"><a href="#" id="i-recover" class="linklike">Passwort vergessen?</a></p>`;
}
// Authenticator-Bereich in den Einstellungen (Status + Aktionen).
function renderAuthSection() {
  const box = $('#e-auth-body'); if (!box) return;
  const enabled = !!state.settings?.totp_enabled;
  const twofa = !!state.settings?.two_factor;
  if (!enabled) {
    box.innerHTML = `<p class="hint">Richte einen Authenticator ein (z.&nbsp;B. Google/Microsoft Authenticator). Damit kannst du dein Passwort selbst zurücksetzen („Passwort vergessen") und optional bei jeder Anmeldung einen Code verlangen.</p>
      <button class="sm" id="au-setup">🔐 Authenticator einrichten</button>`;
    $('#au-setup').onclick = openTotpSetup;
  } else {
    box.innerHTML = `<p class="hint" style="color:var(--good)">✓ Authenticator ist eingerichtet – „Passwort vergessen" läuft darüber.</p>
      <label class="ck-line" style="justify-content:flex-start"><input type="checkbox" id="au-2fa" ${twofa ? 'checked' : ''}> Bei jeder Anmeldung einen Code verlangen (2-Faktor)</label>
      <button class="ghost sm" id="au-disable" style="margin-top:.5rem;color:var(--bad)">Authenticator entfernen</button>`;
    $('#au-2fa').onchange = async () => {
      const cb = $('#au-2fa');
      try { const r = await api('/api/instructor/totp/2fa', { method: 'POST', body: { on: cb.checked } }); state.settings.two_factor = r.two_factor; toast('Gespeichert ✓', 'ok'); }
      catch (e) { toast(e.message, 'err'); cb.checked = !cb.checked; }
    };
    $('#au-disable').onclick = openTotpDisable;
  }
  box.insertAdjacentHTML('beforeend', '<div id="e-passkey" style="border-top:1px solid var(--line);margin-top:.8rem;padding-top:.2rem"></div>');
  renderPasskeySection();
}
// QR-Code (dunkel auf weiß) als scharfes SVG in ein Element zeichnen.
function renderQR(el, text) {
  if (!el) return;
  if (!window.qrEncode) { el.innerHTML = '<span class="hint">QR-Code nicht verfügbar – bitte Schlüssel manuell eingeben.</span>'; return; }
  let m; try { m = window.qrEncode(text); } catch { el.innerHTML = '<span class="hint">QR-Code konnte nicht erzeugt werden.</span>'; return; }
  const q = 4, size = m.size + q * 2; let rects = '';
  for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) if (m.get(x, y)) rects += `<rect x="${x + q}" y="${y + q}" width="1" height="1"/>`;
  el.innerHTML = `<svg viewBox="0 0 ${size} ${size}" width="230" height="230" shape-rendering="crispEdges" role="img" aria-label="QR-Code für Authenticator"><rect width="${size}" height="${size}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
}
async function openTotpSetup() {
  let d; try { d = await api('/api/instructor/totp/setup', { method: 'POST' }); } catch (e) { toast(e.message, 'err'); return; }
  const keyPretty = d.secret.replace(/(.{4})/g, '$1 ').trim();
  modal(`<h3>🔐 Authenticator einrichten</h3>
    <p class="hint">Scanne den QR-Code mit deiner Authenticator-App (z.&nbsp;B. Google/Microsoft Authenticator) – „Konto hinzufügen" → „QR-Code scannen".</p>
    <div class="au-qr" id="au-qr"></div>
    <p class="hint center" style="margin:.4rem 0">Am Handy stattdessen: <a class="linklike" href="${esc(d.otpauth)}">📲 direkt in die App übernehmen</a></p>
    <details class="au-manual"><summary>QR geht nicht? Schlüssel manuell eingeben</summary>
      <div class="au-key"><span class="hint">Typ: zeitbasiert / TOTP:</span><code id="au-secret">${keyPretty}</code>
        <button class="ghost sm" id="au-copy">📋 Kopieren</button></div>
    </details>
    ${errBox()}
    <div class="field" style="margin-top:.5rem"><label>Zur Bestätigung: 6-stelliger Code aus der App</label><input id="au-code" inputmode="numeric" autocomplete="one-time-code" placeholder="6-stelliger Code"></div>
    <label class="ck-line" style="justify-content:flex-start"><input type="checkbox" id="au-req"> Bei jeder Anmeldung einen Code verlangen (2-Faktor)</label>
    <div class="actions"><button class="sec" onclick="window.__closeModal()">Abbrechen</button><button id="au-go">Aktivieren</button></div>`);
  renderQR($('#au-qr'), d.otpauth);
  $('#au-copy').onclick = () => navigator.clipboard.writeText(d.secret).then(() => toast('Schlüssel kopiert ✓', 'ok')).catch(() => toast('Kopieren nicht möglich', 'err'));
  $('#au-go').onclick = async () => {
    try {
      const r = await api('/api/instructor/totp/confirm', { method: 'POST', body: { code: $('#au-code').value.trim(), require_login: $('#au-req').checked } });
      state.settings.totp_enabled = true; state.settings.two_factor = r.two_factor;
      closeModal(); toast('Authenticator aktiviert ✓', 'ok'); renderAuthSection();
    } catch (e) { showErr(e.message); }
  };
}
function openTotpDisable() {
  modal(`<h3>Authenticator entfernen</h3>
    <p class="hint">Zur Sicherheit brauche ich dein <strong>Passwort</strong> oder einen <strong>aktuellen Code</strong>.</p>${errBox()}
    <div class="field"><label>Passwort oder aktueller Code</label><input id="ad-pw" type="password" autocomplete="off"></div>
    <div class="actions"><button class="sec" onclick="window.__closeModal()">Abbrechen</button><button id="ad-go" class="danger">Entfernen</button></div>`);
  $('#ad-go').onclick = async () => {
    const v = $('#ad-pw').value;
    try { await api('/api/instructor/totp/disable', { method: 'POST', body: { password: v, code: v } }); state.settings.totp_enabled = false; state.settings.two_factor = false; closeModal(); toast('Authenticator entfernt', 'ok'); renderAuthSection(); }
    catch (e) { showErr(e.message); }
  };
}
// Passwort vergessen (Fahrlehrer): mit dem Authenticator-Code ein neues Passwort setzen.
function openInstrForgotModal() {
  modal(`<h3>🔑 Passwort vergessen</h3>
    <p class="hint">Gib den aktuellen <strong>6-stelligen Code</strong> aus deiner Authenticator-App ein und wähle ein neues Passwort. (Funktioniert nur, wenn du vorher einen Authenticator eingerichtet hast.)</p>
    ${errBox()}
    <div class="field"><label>Authenticator-Code</label><input id="fp-code" inputmode="numeric" autocomplete="one-time-code" placeholder="6-stelliger Code"></div>
    <div class="field"><label>Neues Passwort</label><input id="fp-pw" type="password" autocomplete="new-password"><div class="hint" style="margin:.3rem 0 0">Mind. 8 Zeichen, mit Buchstabe, Zahl und Sonderzeichen.</div></div>
    <div class="actions"><button class="sec" onclick="window.__closeModal()">Abbrechen</button><button id="fp-go">Neu setzen & anmelden</button></div>`);
  $('#fp-go').onclick = async () => {
    const code = $('#fp-code').value.trim(), np = $('#fp-pw').value;
    const prob = pwProblem(np);
    if (prob) { showErr('Neues Passwort braucht ' + prob + '.'); return; }
    try {
      await api('/api/auth/instructor/forgot', { method: 'POST', body: { code, new_password: np } });
      await api('/api/auth/instructor', { method: 'POST', body: { pin: np, remember: true, code } });
      closeModal();
      const [me, s] = await Promise.all([api('/api/auth/me'), api('/api/settings')]);
      state.user = me.user; state.settings = s.settings; render();
      toast('Passwort neu gesetzt ✓', 'ok');
    } catch (e) { showErr(e.message); }
  };
}

// ---------- Passkeys / Face ID / Touch ID (WebAuthn) ----------
const waSupported = () => !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
function b64urlToBuf(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  const bin = atob(s); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b.buffer;
}
function bufToB64url(buf) {
  const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function passkeyRegister() {
  if (!waSupported()) { toast('Dieses Gerät/dieser Browser unterstützt keine Passkeys.', 'err'); return; }
  try {
    const o = await api('/api/instructor/passkey/register/options', { method: 'POST' });
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: b64urlToBuf(o.challenge), rp: o.rp,
      user: { id: b64urlToBuf(o.user.id), name: o.user.name, displayName: o.user.displayName },
      pubKeyCredParams: o.pubKeyCredParams, authenticatorSelection: o.authenticatorSelection,
      timeout: o.timeout, attestation: o.attestation,
      excludeCredentials: (o.excludeCredentials || []).map((c) => ({ id: b64urlToBuf(c.id), type: c.type })),
    } });
    if (!cred) { toast('Abgebrochen', 'err'); return; }
    const r = await api('/api/instructor/passkey/register/verify', { method: 'POST', body: {
      clientDataJSON: bufToB64url(cred.response.clientDataJSON), attestationObject: bufToB64url(cred.response.attestationObject),
    } });
    toast(r.already ? 'Passkey war schon gespeichert' : 'Passkey/Face ID gespeichert ✓', 'ok');
    try { const s = await api('/api/settings'); state.settings = s.settings; } catch {}
    renderAuthSection();
  } catch (e) { toast(e && e.name === 'NotAllowedError' ? 'Abgebrochen oder Zeitüberschreitung.' : (e.message || 'Einrichtung fehlgeschlagen'), 'err'); }
}
async function passkeyLogin() {
  if (!waSupported()) { showErr('Dieses Gerät/dieser Browser unterstützt keine Passkeys.'); return; }
  try {
    const o = await api('/api/instructor/passkey/auth/options', { method: 'POST' });
    if (!o.allowCredentials || !o.allowCredentials.length) { showErr('Auf diesem Server ist noch kein Passkey hinterlegt. Erst mit PIN/Passwort anmelden und Face ID einrichten.'); return; }
    const assertion = await navigator.credentials.get({ publicKey: {
      challenge: b64urlToBuf(o.challenge), rpId: o.rpId, timeout: o.timeout, userVerification: o.userVerification,
      allowCredentials: o.allowCredentials.map((c) => ({ id: b64urlToBuf(c.id), type: c.type })),
    } });
    if (!assertion) { showErr('Abgebrochen'); return; }
    await api('/api/instructor/passkey/auth/verify', { method: 'POST', body: {
      id: assertion.id, clientDataJSON: bufToB64url(assertion.response.clientDataJSON),
      authenticatorData: bufToB64url(assertion.response.authenticatorData), signature: bufToB64url(assertion.response.signature),
    } });
    const [me, s] = await Promise.all([api('/api/auth/me'), api('/api/settings')]);
    state.user = me.user; state.settings = s.settings; render();
    toast('Angemeldet mit Face ID ✓', 'ok');
  } catch (e) { showErr(e && e.name === 'NotAllowedError' ? 'Abgebrochen oder Zeitüberschreitung.' : (e.message || 'Passkey-Anmeldung fehlgeschlagen')); }
}
async function renderPasskeySection() {
  const box = document.getElementById('e-passkey'); if (!box) return;
  let list = [];
  try { const r = await api('/api/instructor/passkeys'); list = r.passkeys || []; } catch {}
  const rows = list.map((k) => `<div class="pk-row"><span>🔑 ${esc(k.label)}</span><button class="ghost sm" data-pkdel="${esc(k.id)}" style="color:var(--bad)">Entfernen</button></div>`).join('');
  box.innerHTML = `<h4 style="margin:1rem 0 .3rem">🔓 Passkey / Face ID</h4>
    <p class="hint">Anmeldung per Gesicht oder Fingerabdruck – ohne Passwort, phishing-sicher. Am schnellsten &amp; sichersten.</p>
    ${rows || '<p class="hint">Noch kein Passkey hinterlegt.</p>'}
    <button class="sm" id="pk-add" ${waSupported() ? '' : 'disabled'} style="margin-top:.5rem">➕ Face ID / Passkey einrichten</button>
    ${waSupported() ? '' : '<div class="hint" style="margin-top:.3rem">Dieses Gerät/dieser Browser unterstützt keine Passkeys.</div>'}`;
  const add = document.getElementById('pk-add'); if (add) add.onclick = passkeyRegister;
  box.querySelectorAll('[data-pkdel]').forEach((b) => b.onclick = async () => {
    if (!confirm('Diesen Passkey entfernen?')) return;
    try { await api('/api/instructor/passkey/delete', { method: 'POST', body: { id: b.dataset.pkdel } }); try { const s = await api('/api/settings'); state.settings = s.settings; } catch {} renderAuthSection(); }
    catch (e) { toast(e.message, 'err'); }
  });
}
window.__passkeyLogin = passkeyLogin; window.__passkeyRegister = passkeyRegister;

function wireAuth(tab) {
  const done = async () => {
    const [me, s] = await Promise.all([api('/api/auth/me'), api('/api/settings')]);
    state.user = me.user; state.settings = s.settings; render();
  };
  if (tab === 'login') {
    $('#l-go').onclick = async () => {
      try {
        await api('/api/auth/login', { method: 'POST', body: { login: $('#l-email').value, password: $('#l-pw').value } });
        done();
      } catch (e) { showErr(e.message); }
    };
    const fg = $('#l-forgot'); if (fg) fg.onclick = (ev) => { ev.preventDefault(); openForgotModal(); };
  } else if (tab === 'register') {
    $('#r-go').onclick = async () => {
      const prob = pwProblem($('#r-pw').value);
      if (prob) { showErr('Passwort braucht ' + prob + '.'); return; }
      try {
        const r = await api('/api/auth/register', { method: 'POST', body: {
          code: $('#r-code').value, name: $('#r-name').value, email: $('#r-email').value,
          phone: $('#r-phone').value, password: $('#r-pw').value, birth_year: $('#r-year').value } });
        if (r.username) toast('Konto erstellt · Dein Login-Name: ' + r.username, 'ok');
        done();
      } catch (e) { showErr(e.message); }
    };
  } else {
    $('#i-go').onclick = async () => {
      try {
        const body = { pin: $('#i-pin').value, remember: $('#i-remember')?.checked !== false };
        const code = $('#i-code'); if (code && code.value.trim()) body.code = code.value.trim();
        const r = await api('/api/auth/instructor', { method: 'POST', body });
        if (r && r.need2fa) {                       // Authenticator-Code nachfordern
          $('#i-2fa-wrap')?.classList.remove('hidden');
          const c = $('#i-code'); if (c) c.focus();
          showErr('Bitte gib den 6-stelligen Code aus deiner Authenticator-App ein.');
          return;
        }
        done();
      } catch (e) { showErr(e.message); }
    };
    const rc = $('#i-recover'); if (rc) rc.onclick = (ev) => { ev.preventDefault(); openInstrForgotModal(); };
    const pk = $('#i-passkey'); if (pk) pk.onclick = passkeyLogin;
  }
  app.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const b = app.querySelector('.form-actions button'); if (b) b.click(); }
  }));
}

// ====================== FAHRSCHÜLER ======================
async function renderStudent() {
  app.innerHTML = header() + `<main>
    <div class="card hidden" id="lesson-card"></div>
    <div class="card hidden" id="live-card"></div>
    <div class="card hidden" id="notif-card"></div>
    <div class="card hidden" id="profile-card"></div>
    <div class="card" id="week-card"></div>
    <div class="card hidden" id="lessons-card"></div>
    <div class="card" id="messages-card"></div>
    <div class="card hidden" id="review-card"></div>
    <div class="card hidden" id="offers-card"></div>
    <div class="card">
      <h2>Termin buchen <span class="sub" id="horizon-note"></span></h2>
      <div class="hint hidden" id="away-note"></div>
      <div class="dateline">
        <button class="sec sm" id="prev">‹</button>
        <span class="day" id="dlabel"></span>
        <button class="sec sm" id="next">›</button>
        <input type="date" id="dpick" style="max-width:170px">
      </div>
      <div class="inline" style="margin:.1rem 0 .7rem">
        <button class="sec sm" id="find-free">🔎 Nächsten freien Termin</button>
        <button class="ghost sm" id="go-today">Heute</button>
      </div>
      <div id="book-cal"></div>
      <div class="slots" id="slots"></div>
    </div>
  </main>`;
  state.calMonth = firstOfMonth(state.date);
  const horizon = state.settings?.booking_horizon_days || 14;
  $('#horizon-note').textContent = `(bis ${horizon} Tage im Voraus)`;
  wireLogout();
  $('#dpick').value = state.date;
  $('#prev').onclick = () => { state.date = addDays(state.date, -1); syncStudent(); };
  $('#next').onclick = () => { state.date = addDays(state.date, 1); syncStudent(); };
  $('#dpick').onchange = (e) => { state.date = e.target.value; syncStudent(); };
  $('#find-free').onclick = () => jumpToNextFree();
  $('#go-today').onclick = () => { state.date = todayStr(); syncStudent(); };
  mountEdgeMenus('student');
  renderProfileCard();
  syncStudent();
  // Beim ersten Mal automatisch die kurze Einführung zeigen
  let tourDone = false;
  try { tourDone = localStorage.getItem('ginoco-tour-done') === '1'; } catch {}
  if (!tourDone && !state._tourShown) { state._tourShown = true; setTimeout(openTour, 500); }
}

let myBookingsCache = [];
let myStats = null, myAdk = null, myProgress = null;
async function syncStudent() {
  $('#dlabel').textContent = fmtDay(state.date);
  $('#dpick').value = state.date;
  try {
    const [mine, day, off, notif, away] = await Promise.all([
      api('/api/my/bookings'), api('/api/slots?date=' + state.date),
      api('/api/offers'), api('/api/my/notifications'), api('/api/away')]);
    myBookingsCache = mine.bookings;
    myStats = mine.stats || null; myAdk = mine.adk || null; myProgress = mine.progress || null;
    renderAway(away.away);
    renderNotifications(notif.notifications, notif.unread);
    renderLessonTimer(mine.bookings);
    refreshStudentLive();
    renderWeekCard(mine.weekInfo, mine.bookings, mine.progress);
    renderMyLessons(mine.bookings);
    renderReviewCard(mine.progress);
    renderStudentMessages();
    { const hn = $('#horizon-note'); if (hn && mine.progress) hn.textContent = `(bis ${mine.progress.horizon} Tage im Voraus · Rang ${mine.progress.rank})`; }
    renderOffers(off.offers, mine.weekInfo);
    state.lastSlotStart = day.slots.length ? day.slots[day.slots.length - 1].start : null;
    renderSlots(day.slots, mine.bookings);
    // Kalender folgt dem gewählten Tag: beim Blättern in einen neuen Monat springt er mit.
    state.calMonth = firstOfMonth(state.date);
    renderBookingCalendar();
  } catch (e) { toast(e.message, 'err'); }
}

// ---------- „Meine Fahrstunden" (Schüler-Historie, tabellarisch) ----------
function addMinHHMM(hhmm, min) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const t = h * 60 + m + (Number(min) || 0);
  return String(Math.floor(t / 60) % 24).padStart(2, '0') + ':' + String(((t % 60) + 60) % 60).padStart(2, '0');
}
function lessonTypeLabel(t) { return { ueberland: '🌄 Überland', autobahn: '🛣️ Autobahn', nacht: '🌙 Nachtfahrt' }[t] || 'Normal'; }
function fmtDT(date, time) {
  const d = parseD(date);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + (time ? ', ' + time + ' Uhr' : '');
}
// Eintrag-Zeitpunkt (created_at, ISO) als lokales „TT.MM.JJJJ, HH:MM Uhr“.
function fmtEntry(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return fmtDT(String(ts).slice(0, 10));
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' Uhr';
}
function renderMyLessons(bookings) {
  const card = $('#lessons-card'); if (!card) return;
  const done = (bookings || []).filter((b) => b.status === 'done')
    .sort((a, z) => (z.date + z.start_time).localeCompare(a.date + a.start_time));
  if (!done.length) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  const driven = done.filter((b) => b.attended !== 0);
  const totalMin = driven.reduce((s, b) => s + (b.duration_min || 0), 0);
  const toSign = done.filter((b) => b.needs_sign);
  const rows = done.map((b) => {
    const noshow = b.attended === 0;
    const late = b.late_minutes || 0;
    const entryDate = b.created_at ? String(b.created_at).slice(0, 10) : null;
    const nachgetragen = entryDate && entryDate !== b.date;
    const adkN = lessonAdkParse(b.curriculum).length;
    const sign = b.needs_sign
      ? `<button class="sm ml-sign" data-sign="${b.id}">✍️ Unterschreiben</button>`
      : (b.signed_at ? `<span class="pill" style="background:var(--good-bg);color:var(--good)">✓ unterschrieben</span>` : '');
    return `<tr class="${noshow ? 'ml-noshow' : ''} ${b.needs_sign ? 'ml-tosign' : ''}">
      <td class="ml-when" data-label="Wann">${nachgetragen ? '<span class="ml-drovelbl">gefahren am</span>' : ''}<strong>${fmtDT(b.date, b.start_time)}</strong>${nachgetragen ? `<span class="ml-entry">nachgetragen · eingetragen am ${fmtEntry(b.created_at)}</span>` : ''}${b.invoice_date ? `<span class="ml-entry ml-inv">🧾 auf der Rechnung: ${fmtDT(b.invoice_date)}${b.invoice_time ? ' ' + b.invoice_time + ' Uhr' : ''}</span>` : ''}${sign ? `<div class="ml-signcell">${sign}</div>` : ''}</td>
      <td data-label="Ende">${noshow ? '—' : 'bis ' + addMinHHMM(b.start_time, b.duration_min)}</td>
      <td data-label="Dauer">${noshow ? '🚫 nicht da' : (b.duration_min + ' Min')}</td>
      <td data-label="Art">${noshow ? '' : lessonTypeLabel(b.lesson_type)}</td>
      <td data-label="Verspätung">${late ? `⏱️ ${late} Min` : ''}</td>
      <td class="ml-note" data-label="Vermerk">${b.feedback ? esc(b.feedback) : ''}${adkN ? `<button class="linkbtn ml-adk" data-adk="${b.id}">📋 Ausbildungskarte (${adkN})</button>` : ''}</td>
    </tr>`;
  }).join('');
  const banner = toSign.length
    ? `<div class="sign-banner">✍️ <div><strong>${toSign.length} Fahrstunde${toSign.length === 1 ? '' : 'n'} warten auf deine Unterschrift.</strong><br><span>Dein Fahrlehrer hat sie nachgetragen – bitte kurz bestätigen.</span></div><button class="sm" id="ml-sign-first">Jetzt unterschreiben</button></div>`
    : '';
  card.innerHTML = `<h2>📖 Meine Fahrstunden</h2>
    <p class="hint">Alle deine gefahrenen Stunden – mit Datum &amp; Uhrzeit, Dauer, Art und Vermerk. Bei jeder Stunde kannst du die Ausbildungskarte öffnen: <em>was</em> ihr geübt habt und wie es sitzt.</p>
    ${banner}
    ${statStripHtml(myStats)}
    ${adkNeedWorkHtml(myAdk)}
    <div class="inline" style="margin:.4rem 0 .6rem;flex-wrap:wrap">
      <button class="sec sm" id="ml-adk-all">📋 Ausbildungs-Übersicht</button>
      <button class="sec sm" id="ml-print" style="margin-left:auto">📄 Nachweis drucken</button>
    </div>
    <div class="ml-wrap"><table class="ml-table">
      <thead><tr><th>Datum &amp; Uhrzeit</th><th>Ende</th><th>Dauer</th><th>Art</th><th>Verspät.</th><th>Vermerk / Ausbildungskarte</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  const pb = $('#ml-print'); if (pb) pb.onclick = () => printLessonProof(state.user?.name || 'Fahrschüler', done, myAdk, myStats);
  const ab = $('#ml-adk-all'); if (ab) ab.onclick = () => openMyTraining();
  card.querySelectorAll('[data-sign]').forEach((btn) => btn.onclick = () => {
    const bk = done.find((x) => x.id === Number(btn.dataset.sign)); if (bk) openSignModal(bk);
  });
  card.querySelectorAll('[data-adk]').forEach((btn) => btn.onclick = () => {
    const bk = done.find((x) => x.id === Number(btn.dataset.adk)); if (bk) openLessonAdk(bk, state.user?.name || 'Fahrschüler');
  });
  const sf = $('#ml-sign-first'); if (sf) sf.onclick = () => openSignModal(toSign[0]);
}

// Unterschrift-Fenster: der Fahrschüler bestätigt & unterschreibt eine nachgetragene Fahrstunde.
function openSignModal(l) {
  if (!l) return;
  const art = (l.lesson_type && l.lesson_type !== 'normal') ? ' · ' + lessonTypeLabel(l.lesson_type) : '';
  modal(`<h3>✍️ Fahrstunde bestätigen</h3>
    <p class="hint">Bestätige, dass diese Fahrstunde stattgefunden hat. Deine Unterschrift kommt auf deinen Fahrstunden-Nachweis.</p>
    <div class="sign-lesson">📅 <strong>${fmtDT(l.date, l.start_time)}</strong> · ${l.duration_min} Min${art}${l.late_minutes ? ` · ⏱️ ${l.late_minutes} Min zu spät` : ''}${l.feedback ? `<div class="sign-note">„${esc(l.feedback)}"</div>` : ''}</div>
    <label class="sign-lb">Deine Unterschrift <span class="muted">(mit dem Finger malen)</span></label>
    <div class="sign-pad-wrap">
      <canvas id="sign-pad" class="sign-pad"></canvas>
      <button type="button" class="ghost sm sign-clear" id="sign-clear">Löschen</button>
    </div>
    <label class="ck-line" style="justify-content:flex-start"><input type="checkbox" id="sign-ok"> Ich bestätige, dass ich diese Fahrstunde gefahren bin.</label>
    <div class="actions"><button class="sec" onclick="window.__closeModal()">Später</button><button id="sign-go" disabled>Bestätigen ✍️</button></div>`);
  const canvas = $('#sign-pad');
  const ctx = canvas.getContext('2d');
  let drawn = false, drawing = false, last = null;
  // Auflösung an Anzeige anpassen (scharfe Linie)
  const fit = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, r.width, r.height);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  };
  setTimeout(fit, 30);
  const pos = (e) => { const r = canvas.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top }; };
  const start = (e) => { e.preventDefault(); drawing = true; last = pos(e); };
  const move = (e) => { if (!drawing) return; e.preventDefault(); const p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; drawn = true; };
  const end = () => { drawing = false; };
  canvas.addEventListener('pointerdown', start); canvas.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  $('#sign-clear').onclick = () => { fit(); drawn = false; };
  const ok = $('#sign-ok'), go = $('#sign-go');
  ok.onchange = () => { go.disabled = !ok.checked; };
  go.onclick = async () => {
    go.disabled = true; go.textContent = 'Wird gespeichert …';
    const body = {};
    if (drawn) { try { body.signature = canvas.toDataURL('image/png'); } catch {} }
    try {
      await api('/api/my/bookings/' + l.id + '/sign', { method: 'POST', body });
      closeModal(); toast('Unterschrieben – danke! ✓', 'ok'); syncStudent();
    } catch (e) { go.disabled = false; go.textContent = 'Bestätigen ✍️'; toast(e.message, 'err'); }
  };
}

// ---------- Nachrichten an den Fahrlehrer (Schüler) ----------
function msgTime(iso) {
  try { return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}
async function renderStudentMessages() {
  const card = $('#messages-card'); if (!card) return;
  let data = {};
  try { data = await api('/api/my/messages'); } catch { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  const msgs = data.messages || [];
  const who = data.instructorName || 'Fahrlehrer';
  const bubbles = msgs.length
    ? msgs.map((m) => `<div class="msg ${m.sender === 'student' ? 'me' : 'them'}">
        <div class="msg-b">${esc(m.body)}</div><div class="msg-t">${m.sender === 'student' ? 'Du' : esc(who)} · ${msgTime(m.created_at)}</div>
      </div>`).join('')
    : `<p class="hint">Noch keine Nachrichten. Schreib deinem Fahrlehrer – z. B. eine Frage oder Bescheid, wenn du dich verspätest.</p>`;
  card.innerHTML = `<h2>✉️ Nachrichten <span class="sub">an ${esc(who)}</span></h2>
    <div class="msg-list" id="msg-list">${bubbles}</div>
    <div class="msg-compose">
      <textarea id="msg-in" rows="2" maxlength="2000" placeholder="Nachricht schreiben …"></textarea>
      <button class="sm" id="msg-send">Senden</button>
    </div>`;
  const list = $('#msg-list'); if (list) list.scrollTop = list.scrollHeight;
  const send = async () => {
    const body = $('#msg-in').value.trim(); if (!body) return;
    $('#msg-send').disabled = true;
    try { await api('/api/my/messages', { method: 'POST', body: { body } }); $('#msg-in').value = ''; await renderStudentMessages(); }
    catch (e) { toast(e.message, 'err'); }
    finally { const b = $('#msg-send'); if (b) b.disabled = false; }
  };
  $('#msg-send').onclick = send;
  $('#msg-in').onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } };
}

// ---------- Bewertung abgeben (Schüler) ----------
const REV_STARS = (n) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
// Kategorien fürs geführte „Durchbewerten" (Reihenfolge = Ablauf). Schlüssel
// müssen mit REVIEW_CATS in server.js übereinstimmen.
const REVIEW_CATS = [
  { k: 'geduld',     icon: '🧘', q: 'Wie geduldig war dein Fahrlehrer?',            label: 'Geduld & Ruhe',        hint: 'Ruhe bewahrt, auch wenn’s mal hakt?' },
  { k: 'erklaerung', icon: '💡', q: 'Wie verständlich waren die Erklärungen?',      label: 'Erklärungen',          hint: 'Alles gut erklärt, sodass es Klick gemacht hat?' },
  { k: 'puenktlich', icon: '⏰', q: 'Wie zuverlässig & pünktlich war er?',          label: 'Zuverlässigkeit',      hint: 'Termine gehalten, pünktlich da?' },
  { k: 'freundlich', icon: '😊', q: 'Wie freundlich war der Umgang?',               label: 'Freundlichkeit',       hint: 'Nett, motivierend, auf Augenhöhe?' },
  { k: 'sicher',     icon: '🚗', q: 'Wie sicher hast du dich beim Fahren gefühlt?', label: 'Sicheres Gefühl',      hint: 'Gut aufgehoben und sicher unterwegs?' },
];
const revCatLabel = (k) => (REVIEW_CATS.find((c) => c.k === k) || {}).label || k;
const revCatIcon = (k) => (REVIEW_CATS.find((c) => c.k === k) || {}).icon || '⭐';
function revNamePreview(mode) {
  const nm = (state.user?.name || '').trim();
  if (mode === 'anon' || !nm) return mode === 'anon' ? 'Anonym' : 'Ein Fahrschüler';
  if (mode === 'full') return nm;
  const parts = nm.split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}
async function renderReviewCard(progress) {
  const card = $('#review-card'); if (!card) return;
  let data = {};
  try { data = await api('/api/my/review'); } catch { card.classList.add('hidden'); return; }
  const r = data.review;
  const passed = data.passed;
  card.classList.remove('hidden');
  const modeLabel = { full: 'mit vollem Namen', initials: 'mit abgekürztem Namen', anon: 'anonym' };
  const head = passed
    ? `<div class="rev-pass">🎉 <div><strong>Herzlichen Glückwunsch – bestanden!</strong><br><span>Deine Akte bleibt erhalten. Magst du anderen erzählen, wie deine Ausbildung war?</span></div></div>`
    : `<p class="hint">Wenn du magst, hinterlass eine Bewertung – sie erscheint als Empfehlung auf der Startseite von Ginoco.</p>`;
  const chips = r && r.ratings
    ? `<div class="rev-mine-chips">${REVIEW_CATS.filter((c) => r.ratings[c.k]).map((c) => `<span class="rev-chip">${c.icon} ${esc(c.label)} <b>${r.ratings[c.k]}★</b></span>`).join('')}</div>`
    : '';
  const body = r
    ? `<div class="rev-mine">
        <div class="rev-stars">${REV_STARS(r.rating)}</div>
        ${chips}
        <div class="rev-text">„${esc(r.text)}"</div>
        <div class="hint" style="margin-top:.4rem">Angezeigt ${modeLabel[r.author_mode] || ''}${r.show_photo ? ' · mit Foto' : ''}${r.published ? '' : ' · wird gerade geprüft'}${r.reply ? '' : ''}</div>
        ${r.reply ? `<div class="rev-reply">↩︎ <em>${esc(r.reply)}</em></div>` : ''}
        <button class="sec sm" id="rev-edit" style="margin-top:.6rem">Bewertung bearbeiten</button>
      </div>`
    : `<button id="rev-new">⭐ Bewertung schreiben</button>`;
  card.innerHTML = `<h2>⭐ Bewertung</h2>${head}${body}`;
  const open = () => openReviewModal(r, !!data.hasPhoto);
  const n = $('#rev-new'); if (n) n.onclick = open;
  const e = $('#rev-edit'); if (e) e.onclick = open;
}
// Geführter Bewertungs-Assistent ("Durchbewerten"): kurzer Erklärungs-Rundgang,
// dann je eine freundliche Frage pro Kategorie mit großen Sternen, danach Worte,
// Foto (direkt hochladbar) und Anzeige-Name – zum Schluss eine Übersicht.
// Selbsterklärend, Schritt für Schritt, mit Fortschritt und Zurück/Weiter.
function openReviewModal(existing, hasPhoto) {
  const S = {
    step: 0,
    ratings: Object.assign({}, existing && existing.ratings ? existing.ratings : {}),
    text: (existing && existing.text) || '',
    mode: (existing && existing.author_mode) || 'initials',
    showPhoto: !!(existing && existing.show_photo),
    hasPhoto: !!hasPhoto,     // Profilfoto bereits vorhanden?
    photoData: null,          // neu ausgewähltes Foto (data-URL)
  };
  const steps = ['intro', ...REVIEW_CATS.map((c) => 'cat:' + c.k), 'text', 'photo', 'name', 'summary'];
  const catCount = REVIEW_CATS.length;
  const go = (d) => { S.step = Math.max(0, Math.min(steps.length - 1, S.step + d)); draw(); };
  const answered = () => REVIEW_CATS.filter((c) => S.ratings[c.k]).length;
  const overall = () => { const v = REVIEW_CATS.map((c) => S.ratings[c.k]).filter(Boolean); return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : 0; };

  function bigStars(current, onPick) {
    const wrap = document.createElement('div');
    wrap.className = 'rev-bigstars';
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'rev-bigstar' + (i <= current ? ' on' : '');
      b.textContent = '★'; b.dataset.v = i;
      b.onclick = () => { onPick(i); b.blur(); };
      wrap.appendChild(b);
    }
    return wrap;
  }

  async function submit() {
    if ((S.text || '').trim().length < 5) { S.step = steps.indexOf('text'); draw(); toast('Bitte schreib kurz ein, zwei Sätze.', 'err'); return; }
    const btn = $('#rev-go'); if (btn) { btn.disabled = true; btn.textContent = 'Wird gesendet …'; }
    const body = {
      rating: overall() || undefined,
      ratings: S.ratings,
      text: S.text.trim(),
      author_mode: S.mode,
      show_photo: S.mode !== 'anon' ? S.showPhoto : false,
    };
    if (S.photoData) body.photo = S.photoData;
    try { await api('/api/my/review', { method: 'POST', body }); closeModal(); toast('Danke für deine Bewertung ⭐', 'ok'); syncStudent(); }
    catch (e) { if (btn) { btn.disabled = false; btn.textContent = 'Bewertung abschicken'; } toast(e.message, 'err'); }
  }

  function draw() {
    const kind = steps[S.step];
    let html = '';
    // Fortschritt (nur während der Kategorie-Fragen)
    if (kind.startsWith('cat:')) {
      const idx = REVIEW_CATS.findIndex((c) => 'cat:' + c.k === kind);
      html += `<div class="rev-prog"><div class="rev-prog-bar" style="width:${Math.round(((idx + 1) / catCount) * 100)}%"></div></div>
        <div class="rev-prog-tx">Frage ${idx + 1} von ${catCount}</div>`;
    }

    if (kind === 'intro') {
      html += `<div class="rev-intro">
        <div class="rev-intro-emoji">⭐</div>
        <h3>${existing ? 'Bewertung bearbeiten' : 'Erzähl, wie deine Ausbildung war'}</h3>
        <p>In ein paar kurzen Fragen bewertest du deinen Fahrlehrer – Stern antippen, fertig. Dauert unter einer Minute.</p>
        <ul class="rev-intro-list">
          <li>🧩 Schritt für Schritt – eine Frage nach der anderen</li>
          <li>📸 Wenn du magst, direkt ein Foto dazu</li>
          <li>🙈 Du bestimmst, ob dein Name erscheint (auch anonym)</li>
        </ul>
        <p class="rev-intro-why">Deine echte Rückmeldung hilft anderen Fahrschülern – und deinem Fahrlehrer, noch besser zu werden.</p>
      </div>
      <div class="actions">
        <button class="sec" onclick="window.__closeModal()">Später</button>
        <button id="rev-go">Los geht’s →</button>
      </div>`;
    } else if (kind.startsWith('cat:')) {
      const c = REVIEW_CATS.find((x) => 'cat:' + x.k === kind);
      const cur = S.ratings[c.k] || 0;
      html += `<div class="rev-catq">
        <div class="rev-cat-ic">${c.icon}</div>
        <h3>${esc(c.q)}</h3>
        <p class="rev-cat-hint">${esc(c.hint)}</p>
        <div id="rev-stars-mount"></div>
        <div class="rev-cat-val" id="rev-cat-val">${cur ? '★'.repeat(cur) + ' – ' + revRatingWord(cur) : 'Tippe einen Stern an'}</div>
      </div>
      <div class="actions">
        <button class="sec" id="rev-back">← Zurück</button>
        ${cur ? `<button id="rev-go">Weiter →</button>` : `<button class="ghost" id="rev-skip">Überspringen</button>`}
      </div>`;
    } else if (kind === 'text') {
      html += `<div class="rev-step">
        <h3>💬 Deine Worte</h3>
        <p class="hint">Was möchtest du anderen mitgeben? Ein, zwei ehrliche Sätze reichen völlig.</p>
        <textarea id="rev-text" rows="5" maxlength="800" placeholder="z. B. Super Fahrlehrer, sehr geduldig, erklärt alles ruhig – Fahrschule Untern Buchen in Eberswalde. Klare Empfehlung!" style="resize:vertical">${esc(S.text)}</textarea>
        <div class="rev-count"><span id="rev-count">${(S.text || '').length}</span>/800</div>
      </div>
      <div class="actions">
        <button class="sec" id="rev-back">← Zurück</button>
        <button id="rev-go">Weiter →</button>
      </div>`;
    } else if (kind === 'photo') {
      const prev = S.photoData
        ? `<img src="${S.photoData}" alt="Vorschau">`
        : (S.hasPhoto ? `<img src="/api/my/photo?t=${Date.now()}" alt="Dein Foto">` : `<span class="rev-photo-ph">🙂</span>`);
      const have = S.photoData || S.hasPhoto;
      html += `<div class="rev-step rev-photo-step">
        <h3>📸 Foto dazu? (freiwillig)</h3>
        <p class="hint">Mit Foto wirkt deine Empfehlung persönlicher. Ganz wie du magst.</p>
        <div class="rev-photo-prev" id="rev-photo-prev">${prev}</div>
        <input type="file" id="rev-file" accept="image/*" hidden>
        <div class="rev-photo-btns">
          <button class="sec sm" id="rev-pick">${have ? 'Anderes Foto' : '📷 Foto auswählen'}</button>
          ${have ? `<button class="ghost sm" id="rev-photo-clear">Kein Foto</button>` : ''}
        </div>
        ${have ? `<label class="ck-line" id="rev-show-line"><input type="checkbox" id="rev-show" ${S.showPhoto ? 'checked' : ''}> Foto bei meiner Bewertung anzeigen</label>` : ''}
      </div>
      <div class="actions">
        <button class="sec" id="rev-back">← Zurück</button>
        <button id="rev-go">Weiter →</button>
      </div>`;
    } else if (kind === 'name') {
      const card = (v, title, sub) => `<button type="button" class="rev-namecard ${S.mode === v ? 'on' : ''}" data-mode="${v}">
        <div class="rev-nc-t">${title}</div><div class="rev-nc-s">${sub}</div></button>`;
      html += `<div class="rev-step">
        <h3>🙋 Wie soll dein Name erscheinen?</h3>
        <p class="hint">Öffentlich sichtbar auf der Startseite. Du entscheidest.</p>
        <div class="rev-namecards">
          ${card('full', 'Voller Name', esc(revNamePreview('full')))}
          ${card('initials', 'Abgekürzt', esc(revNamePreview('initials')))}
          ${card('anon', 'Anonym', 'Ein Fahrschüler')}
        </div>
        ${S.mode === 'anon' && (S.photoData || S.hasPhoto) ? '<p class="hint">Bei „Anonym" wird kein Foto angezeigt.</p>' : ''}
      </div>
      <div class="actions">
        <button class="sec" id="rev-back">← Zurück</button>
        <button id="rev-go">Weiter →</button>
      </div>`;
    } else if (kind === 'summary') {
      const ov = overall();
      const chips = REVIEW_CATS.filter((c) => S.ratings[c.k]).map((c) =>
        `<span class="rev-chip">${c.icon} ${esc(c.label)} <b>${S.ratings[c.k]}★</b></span>`).join('') || '<span class="hint">Keine Einzelnoten – kein Problem.</span>';
      const showPic = S.mode !== 'anon' && S.showPhoto && (S.photoData || S.hasPhoto);
      const pic = showPic ? (S.photoData ? `<img src="${S.photoData}" alt="">` : `<img src="/api/my/photo?t=${Date.now()}" alt="">`) : `<span class="rev-photo-ph sm">🙂</span>`;
      html += `<div class="rev-step rev-summary">
        <h3>✅ Passt das so?</h3>
        <div class="rev-sum-head">
          <div class="rev-sum-stars">${ov ? '★'.repeat(ov) + '☆'.repeat(5 - ov) : '—'}</div>
          <div class="rev-sum-name">${pic}<span>${esc(revNamePreview(S.mode))}</span></div>
        </div>
        <div class="rev-sum-chips">${chips}</div>
        <div class="rev-sum-text">„${esc(S.text.trim() || '…')}"</div>
      </div>
      <div class="actions">
        <button class="sec" id="rev-back">← Zurück</button>
        <button id="rev-go">Bewertung abschicken</button>
      </div>`;
    }

    modal(`<div class="rev-wiz">${html}</div>`);

    // Kategorie-Sterne montieren
    if (kind.startsWith('cat:')) {
      const c = REVIEW_CATS.find((x) => 'cat:' + x.k === kind);
      const mount = $('#rev-stars-mount');
      if (mount) mount.appendChild(bigStars(S.ratings[c.k] || 0, (v) => {
        S.ratings[c.k] = v;
        // alle Sterne bis v aufleuchten lassen
        mount.querySelectorAll('.rev-bigstar').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) <= v));
        const lbl = $('#rev-cat-val'); if (lbl) lbl.textContent = '★'.repeat(v) + ' – ' + revRatingWord(v);
        // sanft automatisch weiter (Frage-Antwort-Gefühl)
        setTimeout(() => { if (S.step < steps.indexOf('summary')) go(1); }, 340);
      }));
      const sk = $('#rev-skip'); if (sk) sk.onclick = () => go(1);
    }
    // Text
    const ta = $('#rev-text');
    if (ta) { ta.oninput = () => { S.text = ta.value; const c = $('#rev-count'); if (c) c.textContent = ta.value.length; }; ta.focus(); }
    // Foto
    const pick = $('#rev-pick'), file = $('#rev-file');
    if (pick && file) {
      pick.onclick = () => file.click();
      file.onchange = async () => {
        const f = file.files && file.files[0]; if (!f) return;
        try { S.photoData = await fileToResizedDataUrl(f, 400, 0.82); S.showPhoto = true; draw(); }
        catch (e) { toast(e.message, 'err'); }
      };
    }
    const clr = $('#rev-photo-clear'); if (clr) clr.onclick = () => { S.photoData = null; S.hasPhoto = false; S.showPhoto = false; draw(); };
    const show = $('#rev-show'); if (show) show.onchange = () => { S.showPhoto = show.checked; };
    // Anzeige-Name
    document.querySelectorAll('.rev-namecard').forEach((b) => b.onclick = () => { S.mode = b.dataset.mode; draw(); });
    // Navigation
    const back = $('#rev-back'); if (back) back.onclick = () => go(-1);
    const goBtn = $('#rev-go');
    if (goBtn) goBtn.onclick = () => { if (steps[S.step] === 'summary') submit(); else go(1); };
  }

  draw();
}
function revRatingWord(n) { return ['', 'geht so', 'okay', 'gut', 'sehr gut', 'top!'][n] || ''; }
// Druckbarer Fahrstunden-Nachweis (Tabelle + Unterschriften) + optional ADK-Zusammenfassung
function printLessonProof(name, done, adk, stats) {
  const school = esc(state.settings?.instructor_name || 'Fahrschule');
  const today = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const list = (done || []).slice().sort((a, z) => (a.date + a.start_time).localeCompare(z.date + z.start_time));
  const driven = list.filter((b) => b.attended !== 0);
  const totalMin = driven.reduce((s, b) => s + (b.duration_min || 0), 0);
  const rows = list.map((b, i) => {
    const noshow = b.attended === 0;
    const late = b.late_minutes || 0;
    const entryDate = b.created_at ? String(b.created_at).slice(0, 10) : null;
    const nachgetragen = entryDate && entryDate !== b.date;
    const artL = { ueberland: 'Überland', autobahn: 'Autobahn', nacht: 'Nachtfahrt' }[b.lesson_type] || 'Normal';
    return `<tr>
      <td class="c">${i + 1}</td>
      <td>${nachgetragen ? '<span class="entry-lbl">gefahren am</span> ' : ''}${fmtDT(b.date, b.start_time)}${nachgetragen ? `<br><span class="entry">nachgetragen · eingetragen am ${fmtEntry(b.created_at)}</span>` : ''}</td>
      <td class="c inv-col">${b.invoice_date ? `<strong>${fmtDT(b.invoice_date)}</strong>${b.invoice_time ? '<br>' + b.invoice_time + ' Uhr' : ''}` : '<span class="wg">wie gefahren</span>'}</td>
      <td class="c">${noshow ? '—' : addMinHHMM(b.start_time, b.duration_min)}</td>
      <td class="c">${noshow ? 'nicht erschienen' : b.duration_min + ' Min'}</td>
      <td class="c">${noshow ? '' : artL}</td>
      <td class="c">${late ? late + ' Min' : ''}</td>
      <td>${esc(b.feedback || '')}</td>
      <td class="c sig-col">${b.signature ? `<img class="sig-img" src="${b.signature}" alt="Unterschrift">` : (b.signed_at ? `<span class="sig-ok">✔</span><br><span class="entry">${fmtDT(String(b.signed_at).slice(0, 10))}</span>` : '')}</td>
    </tr>`;
  }).join('');
  const addr = esc(state.settings?.school_label || '');
  // Optionale zweite Seite: Ausbildungsstand (Häufigkeit je Aufgabe + letzter Stand)
  const statLine = stats ? `${fmtUnits(stats.units)} Fahrstunden (à ${stats.unit || 80} Min) · ${fmtUnits(stats.schalt.units)} Schalt · ${fmtUnits(stats.automatik.units)} Automatik · ${fmtUnits(stats.hours)} h gefahren` : '';
  const adkSection = (adk && adk.distinct) ? `
    <div class="adk-page">
      <h2 class="adk-h">Ausbildungsstand – was wurde geübt (${adk.distinct} Aufgaben)</h2>
      ${statLine ? `<div class="sum2">${statLine}</div>` : ''}
      <table class="adk-t"><thead><tr><th>Aufgabe</th><th class="c">Termine</th><th class="c">Stand</th></tr></thead><tbody>
      ${CURRICULUM.map((sec) => {
        const its = sec.items.map((it, i) => {
          const k = currKey(sec.key, i); const agg = adk.items[k]; if (!agg) return '';
          const m = agg.lastStatus ? currStatusMeta(agg.lastStatus) : null;
          const days = Object.entries(agg.days || {}).sort((a, z) => a[0].localeCompare(z[0])).map(([d, n]) => `${fmtDMY2(d)}${n > 1 ? ` (${n}×)` : ''}`).join(', ');
          return `<tr><td>${esc(it)}${days ? `<div class="adk-days">${days}</div>` : ''}</td><td class="c">${agg.count}×</td><td class="c">${m ? m.tiny : ''}</td></tr>`;
        }).filter(Boolean).join('');
        return its ? `<tr class="adk-sec"><td colspan="3">${esc(sec.title)}</td></tr>${its}` : '';
      }).filter(Boolean).join('')}
      </tbody></table>
      ${adk.needWork && adk.needWork.length ? `<div class="adk-red"><strong>Das üben wir noch:</strong> ${adk.needWork.map(currLabel).filter(Boolean).map(esc).join(' · ')}</div>` : ''}
    </div>` : '';
  const LOGO = `<svg width="48" height="48" viewBox="-8 -8 116 116" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gc" x1="6" y1="96" x2="92" y2="8" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#e9530a"/><stop offset=".32" stop-color="#f6890d"/><stop offset=".62" stop-color="#ffc21a"/><stop offset=".85" stop-color="#ffe27a"/><stop offset="1" stop-color="#f7c40f"/></linearGradient></defs><path d="M87.6 36.3 A40 40 0 1 1 64.98 12.9" stroke="url(#gc)" stroke-width="14" stroke-linecap="round"/><circle cx="50" cy="50" r="10" stroke="url(#gc)" stroke-width="10"/><g stroke="url(#gc)" stroke-width="13" stroke-linecap="round"><line x1="35" y1="50" x2="17" y2="50"/><line x1="65" y1="50" x2="83" y2="50"/><line x1="50" y1="65" x2="50" y2="83"/></g><polygon points="62.1,44.2 78.9,13 52.7,36.8" fill="url(#gc)"/><g stroke="url(#gc)" stroke-width="6" stroke-linecap="round"><line x1="73.9" y1="11.8" x2="78.1" y2="5.1"/><line x1="82.4" y1="18.7" x2="88.1" y2="13.2"/><line x1="89" y1="27.5" x2="95.9" y2="23.5"/></g></svg>`;
  const doc = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Fahrstunden-Nachweis – ${esc(name)}</title>
    <style>
      @page{size:A4 landscape;margin:12mm 14mm}
      *{box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;margin:0;padding:20px 24px}
      .head{display:flex;align-items:center;gap:16px;border-bottom:3px solid #f2a01a;padding-bottom:12px;margin-bottom:14px}
      .brand{display:flex;align-items:center;gap:12px;flex:1}
      .brand .school{font-size:18px;font-weight:800;line-height:1.15}
      .brand .addr{font-size:11px;color:#666;margin-top:2px}
      .titleblock{text-align:right}
      .titleblock h1{font-size:21px;margin:0;color:#111;letter-spacing:.01em}
      .titleblock .stud{font-size:14px;margin-top:3px;font-weight:600}
      .titleblock .meta{font-size:11px;color:#666;margin-top:2px}
      .sum{font-size:13px;margin:2px 0 12px;color:#333}.sum b{color:#111}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}
      th{background:#faf3e2;color:#7a5300;font-size:10.5px;text-transform:uppercase;letter-spacing:.03em}
      tbody tr:nth-child(even){background:#fbfaf7}
      td.c{text-align:center;white-space:nowrap} .entry{font-size:10px;color:#777}
      .entry-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.04em;color:#999;font-weight:700}
      td.inv-col{color:#b26a00;font-weight:600} td.inv-col .wg{color:#aaa;font-weight:400;font-style:italic}
      td.sig-col{text-align:center;vertical-align:middle}
      .sig-img{height:36px;max-width:150px;object-fit:contain;display:block;margin:0 auto}
      .sig-ok{color:#0a7d3b;font-weight:700;font-size:14px}
      tr{break-inside:avoid}
      .sign{margin-top:32px;display:flex;gap:64px}
      .sign div{flex:1;border-top:1px solid #333;padding-top:6px;font-size:11px;color:#444}
      .foot{margin-top:14px;font-size:10px;color:#777;border-top:1px solid #ddd;padding-top:8px;line-height:1.55}
      .adk-page{page-break-before:always;padding-top:4px}
      .adk-h{font-size:16px;margin:0 0 6px;color:#111;border-bottom:2px solid #f2a01a;padding-bottom:6px}
      .sum2{font-size:12px;color:#333;margin:6px 0 10px;font-weight:600}
      .adk-t{width:100%;border-collapse:collapse;font-size:11.5px}
      .adk-t th,.adk-t td{border:1px solid #ccc;padding:4px 8px;text-align:left;vertical-align:top}
      .adk-t th{background:#faf3e2;color:#7a5300;font-size:10px;text-transform:uppercase}
      .adk-t td.c{text-align:center;white-space:nowrap}
      .adk-t tr.adk-sec td{background:#f3f3f0;font-weight:700;color:#333}
      .adk-days{font-size:9.5px;color:#888;margin-top:2px}
      .adk-red{margin-top:12px;font-size:11.5px;padding:8px 10px;border:1px solid #e0a;border-left:4px solid #d0306a;border-radius:6px;background:#fdf0f5;color:#8a1c46}
    </style></head><body>
    <div class="head">
      <div class="brand">${LOGO}<div><div class="school">${school}</div>${addr ? `<div class="addr">${addr}</div>` : ''}</div></div>
      <div class="titleblock"><h1>Fahrstunden-Nachweis</h1><div class="stud">${esc(name)}</div><div class="meta">Stand: ${today}</div></div>
    </div>
    <div class="sum"><b>${driven.length} gefahrene Fahrstunden · ${hLabel(totalMin)} gesamt</b></div>
    <table><thead><tr><th>#</th><th>Datum &amp; Uhrzeit (gefahren)</th><th>Auf der Rechnung</th><th>Ende</th><th>Dauer</th><th>Art</th><th>Verspätung</th><th>Vermerk</th><th>Unterschrift</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <div class="sign"><div>Unterschrift Fahrlehrer</div><div>Unterschrift Fahrschüler</div></div>
    ${adkSection}
    <div class="foot">Erstellt mit ginoco · ${today}. „Nachgetragen" = später eingetragene Fahrstunde; maßgeblich ist das angegebene Fahrdatum. „Auf der Rechnung" = Datum/Uhrzeit, unter dem die Stunde in der Abrechnung geführt wird (kann vom Fahrdatum abweichen); „wie gefahren" = identisch zum Fahrdatum. Mit ✔ markierte Stunden hat der Fahrschüler in der App bestätigt.</div>
    <script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { toast('Bitte Pop-ups erlauben, um den Nachweis zu drucken.', 'err'); return; }
  w.document.open(); w.document.write(doc); w.document.close();
}

// Monatskalender mit Ampel-Tagen: grün = frei, rot = ausgebucht, grau = zu/vorbei.
async function renderBookingCalendar() {
  const el = $('#book-cal'); if (!el) return;
  if (!state.calMonth) state.calMonth = firstOfMonth(state.date);
  const first = parseD(state.calMonth);
  const y = first.getFullYear(), mo = first.getMonth();
  const fromD = ymd(new Date(y, mo, 1)), toD = ymd(new Date(y, mo + 1, 0));
  let days = [];
  try { days = (await api(`/api/availability?from=${fromD}&to=${toD}`)).days; } catch { return; }
  const map = {}; days.forEach((d) => map[d.date] = d);
  const startDow = isoDow(fromD), inMonth = new Date(y, mo + 1, 0).getDate(), today = todayStr();
  let cells = '';
  for (let i = 1; i < startDow; i++) cells += '<span class="bcal-empty"></span>';
  for (let dd = 1; dd <= inMonth; dd++) {
    const ds = ymd(new Date(y, mo, dd));
    const info = map[ds] || { state: 'closed', free: 0 };
    const clickable = ['free', 'full', 'toofar'].includes(info.state);
    const cls = ['bcal-day', info.state, ds === state.date ? 'sel' : '', ds === today ? 'today' : ''].filter(Boolean).join(' ');
    cells += `<button class="${cls}" data-day="${ds}" ${clickable ? '' : 'disabled'}>
      <span class="bc-num">${dd}</span>${info.state === 'free' ? `<span class="bc-free">${info.free} frei</span>` : ''}</button>`;
  }
  el.innerHTML = `<div class="bcal">
    <div class="bcal-head">
      <button class="sec sm" data-cmo="-1">‹</button><strong>${MON_LONG[mo]} ${y}</strong><button class="sec sm" data-cmo="1">›</button>
    </div>
    <div class="bcal-grid bcal-wd">${WD.map((w) => `<span>${w}</span>`).join('')}</div>
    <div class="bcal-grid">${cells}</div>
    <div class="bcal-legend"><span><i class="lg free"></i> frei</span><span><i class="lg full"></i> ausgebucht</span><span><i class="lg off"></i> zu / vorbei</span></div>
  </div>`;
  el.querySelectorAll('[data-day]').forEach((b) => b.onclick = () => { state.date = b.dataset.day; syncStudent(); const s = $('#slots'); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  el.querySelectorAll('[data-cmo]').forEach((b) => b.onclick = () => { state.calMonth = addMonths(state.calMonth, Number(b.dataset.cmo)); renderBookingCalendar(); });
}

function greetWord() {
  const h = new Date().getHours();
  if (h < 5) return 'Schön, dass du da bist';
  if (h < 11) return 'Guten Morgen';
  if (h < 18) return 'Guten Tag';
  return 'Guten Abend';
}
function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }

// Naechsten freien Termin vom Server holen und dorthin springen.
async function jumpToNextFree(fromDate) {
  toast('Suche nächsten freien Termin …');
  let next = null;
  try { next = (await api('/api/next-free' + (fromDate ? '?from=' + fromDate : ''))).next; } catch (e) { toast(e.message, 'err'); return; }
  if (!next) { toast('In den nächsten Tagen ist leider kein Termin frei. Schau später nochmal.', 'err'); return; }
  state.date = next.date;
  syncStudent();
  const el = document.getElementById('slots');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  toast(`Freier Termin: ${WD_LONG[isoDow(next.date) - 1]}, ${fmtShort(next.date)} ✓`, 'ok');
}
window.__jumpNextFree = jumpToNextFree;

function renderWeekCard(wi, bookings, progress) {
  const allUpcoming = bookings.filter((b) => b.date >= todayStr() && b.status !== 'done')
    .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
  const upcoming = bookings.filter((b) => b.date >= todayStr()).sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
  const remainColor = wi.remaining > 0 ? 'good' : 'bad';
  const next = allUpcoming.find((b) => b.status === 'booked');
  const gname = firstName(state.user?.name);
  const reservedCount = upcoming.filter((b) => b.status === 'booked' && b.confirmed === 0).length;
  $('#week-card').innerHTML = `
    <div class="greet-big">${greetWord()}${gname ? ', <strong>' + esc(gname) + '</strong>' : ''} 👋</div>
    ${next ? `<div class="next-hero">
      <div class="nh-ic">🚗</div>
      <div class="nh-body">
        <div class="nh-label">Deine nächste Fahrstunde</div>
        <div class="nh-when">${WD_LONG[isoDow(next.date) - 1]}, ${fmtShort(next.date)}</div>
        <div class="nh-time">🕐 ${next.start_time} Uhr · ${next.duration_min} Min${next.meet_label ? ` · 📍 ${esc(next.meet_label)}` : ''}</div>
      </div>
      <div class="nh-count">${countdownLabel(next.date, next.start_time)}</div>
    </div>` : ''}
    <h2>Meine Fahrstunden <span class="sub">diese Woche (${fmtShort(wi.from)}–${fmtShort(wi.to)})</span></h2>
    ${reservedCount ? `<div class="reserve-note">🔶 <strong>${reservedCount} Termin${reservedCount === 1 ? '' : 'e'}</strong> von deinem Fahrlehrer eingetragen – bitte unten mit <strong>✅ Bestätigen</strong> zusagen.</div>` : ''}
    <div class="inline" style="margin-bottom:1rem">
      <span class="pill" style="background:${wi.remaining > 0 ? 'var(--good-bg)' : 'var(--bad-bg)'};color:var(--${remainColor})">
        ${wi.count} von ${wi.max} gebucht · noch ${wi.remaining} frei
      </span>
      ${upcoming.length ? '<button class="ghost sm" id="ical-btn">📅 Zum Kalender hinzufügen</button>' : ''}
    </div>
    ${progress ? studentProgress(progress) : ''}
    ${upcoming.length ? `<div class="blist">${upcoming.map(studentBookingItem).join('')}</div>`
      : `<div class="empty-book">
          <div class="eb-icon">🚗</div>
          <div class="eb-title">Noch keine Fahrstunde gebucht</div>
          <p class="eb-text">Bereit für die nächste Stunde? Ich springe dir direkt zum nächsten freien Termin – dann nur noch Uhrzeit antippen und buchen.</p>
          <button id="eb-find">🔎 Nächsten freien Termin finden</button>
        </div>`}`;
  const c = $('#week-card');
  c.querySelectorAll('[data-confirm]').forEach((b) => b.onclick = () => confirmBooking(b.dataset.confirm));
  c.querySelectorAll('[data-cancel]').forEach((b) => b.onclick = () => cancelBooking(b.dataset.cancel));
  c.querySelectorAll('[data-offer]').forEach((b) => b.onclick = () => offerBooking(b.dataset.offer));
  c.querySelectorAll('[data-withdraw]').forEach((b) => b.onclick = () => withdrawOffer(b.dataset.withdraw));
  const ic = $('#ical-btn');
  if (ic) ic.onclick = () => exportICS(upcoming);
  const ef = $('#eb-find');
  if (ef) ef.onclick = () => jumpToNextFree();
}

function pbar(have, need, color) {
  const pct = need > 0 ? Math.min(100, Math.round((have / need) * 100)) : 100;
  return `<div class="pbar"><div style="width:${pct}%;background:${color}"></div></div>`;
}
function studentProgress(p) {
  const toRank2 = Math.max(0, p.rank2Min - p.doneCount);
  const sonder = [['ueberland', p.sonder?.ueberland || 0, p.req.ueberland],
    ['autobahn', p.sonder?.autobahn || 0, p.req.autobahn], ['nacht', p.sonder?.nacht || 0, p.req.nacht]];
  return `<div class="progress-card">
    <div class="pc-head">
      <span class="rank-badge ${p.rank >= 2 ? 'r2' : ''}">🏅 Rang ${p.rank}</span>
      <span class="pc-drives"><strong>${p.doneCount}</strong> Fahrstunden gefahren</span>
    </div>
    ${p.rank < 2
      ? `<div class="pc-block">
          <div class="pc-line"><span>Weg zu Rang 2</span><span class="muted">${p.doneCount}/${p.rank2Min}</span></div>
          ${pbar(p.doneCount, p.rank2Min, 'var(--brand)')}
          <div class="hint" style="margin:.3rem 0 0">Noch <strong>${toRank2}</strong> Fahrstunde${toRank2 === 1 ? '' : 'n'} – dann siehst du <strong>${state.settings?.booking_horizon_days_rank2 || 21} Tage</strong> im Voraus.</div>
        </div>`
      : `<div class="pc-block"><span class="pill" style="background:var(--good-bg);color:var(--good)">✅ Rang 2 – du siehst ${p.horizon} Tage im Voraus</span></div>`}
    <div class="pc-sonder">
      <div class="pc-sonder-title">Sonderfahrten ${helpDot('Pflichtfahrten für die Führerscheinprüfung: Überlandfahrten, Autobahn und Nachtfahrt. Die Zahlen zeigen, wie viele du schon hast.')}
        ${p.rank >= 2 ? '<span class="pill" style="background:var(--good-bg);color:var(--good);margin-left:.3rem">ab Rang 2 buchbar</span>' : ''}</div>
      <div class="pc-tiles">
      ${sonder.map(([k, have, need]) => {
        const done = have >= need;
        const dur = Number(state.settings?.['sonder_min_' + k]) || { ueberland: 225, autobahn: 180, nacht: 135 }[k];
        return `<div class="pc-tile ${done ? 'done' : ''}" style="--tc:${TYPE_COLORS[k]}">
          <span class="pc-tile-ic">${TYPE_ICON[k]}</span>
          <span class="pc-tile-lb">${TYPE_LABEL[k]}</span>
          <span class="pc-tile-count">${done ? '✓ ' : ''}${have}/${need}</span>
          ${pbar(have, need, done ? 'var(--good)' : TYPE_COLORS[k])}
          ${p.rank >= 2 && !done ? `<button class="sf-book" onclick="window.__openSonderBooking('${k}')">+ ${dur} Min buchen</button>` : ''}
        </div>`;
      }).join('')}
      </div>
      ${p.rank < 2 ? `<div class="hint" style="margin:.3rem 0 0">Sonderfahrten kannst du ab <strong>Rang 2</strong> (${p.rank2Min} Fahrstunden) selbst buchen.</div>` : ''}
    </div>
    <div class="pc-actions">
      <button class="pc-adk" onclick="window.__openMyTraining()">📋 Ausbildungskarte</button>
      <button class="pc-adk" onclick="window.__openExamReadiness()">🎓 Prüfungsreife</button>
    </div>
  </div>`;
}

// Sonderfahrt buchen (nur Rang 2): feste, lange Dauer – Tag wählen, passenden Start nehmen.
function openSonderBooking(type) {
  const dur = Number(state.settings?.['sonder_min_' + type]) || { ueberland: 225, autobahn: 180, nacht: 135 }[type];
  const label = TYPE_LABEL[type], icon = TYPE_ICON[type];
  modal(`<h3>${icon} ${label} buchen</h3>
    <p class="hint">Sonderfahrt mit fester Länge: <strong>${dur} Min</strong>. Wähle einen Tag – ich zeige dir die freien Startzeiten, an denen die ${label} noch komplett in den Tag passt.</p>
    <div class="field"><label>Tag</label><input type="date" id="sf-date" value="${state.date}" min="${todayStr()}"></div>
    <div id="sf-slots" class="sf-slots"><span class="hint">Wähle einen Tag …</span></div>
    <div class="actions"><button onclick="window.__closeModal()">Schließen</button></div>`);
  const load = async () => {
    const d = $('#sf-date').value; const box = $('#sf-slots');
    if (!d) return;
    box.innerHTML = '<span class="hint">Lädt…</span>';
    try {
      const r = await api('/api/slots?date=' + d);
      const fits = (r.slots || []).filter((s) => s.state === 'free' && Number(s.maxDur || s.duration) >= dur);
      if (!fits.length) {
        box.innerHTML = `<div class="warnbox">An diesem Tag passt die ${esc(label)} (${dur} Min) nicht mehr in den Tagesplan. Wähle einen anderen, freieren Tag – am besten früh am Tag, damit der lange Block Platz hat.</div>`;
        return;
      }
      box.innerHTML = `<div class="sf-list">${fits.map((s) => `<button class="sec sf-pick" data-start="${s.start}">🕒 ${s.start} Uhr <span class="muted">– endet ${addMinHHMM(s.start, dur)}</span></button>`).join('')}</div>`;
      box.querySelectorAll('[data-start]').forEach((b) => b.onclick = () => confirmSonder(type, dur, d, b.dataset.start));
    } catch (e) { box.innerHTML = `<div class="warnbox">${esc(e.message)}</div>`; }
  };
  $('#sf-date').onchange = load; load();
}
function confirmSonder(type, dur, date, start) {
  modal(`<h3>${TYPE_ICON[type]} ${TYPE_LABEL[type]} verbindlich buchen?</h3>
    <p style="margin:.5rem 0"><strong>${WD_LONG[isoDow(date) - 1]}, ${fmtShort(date)} um ${start} Uhr</strong><br>${dur} Min · endet ${addMinHHMM(start, dur)} Uhr</p>
    <div class="warnbox">Sonderfahrten sind Pflichtfahrten für die Prüfung. Die Buchung ist verbindlich.</div>
    <div class="actions"><button class="sec" onclick="window.__closeModal()">Abbrechen</button><button id="sf-go">Ja, verbindlich buchen</button></div>`);
  $('#sf-go').onclick = async () => {
    try {
      await api('/api/bookings', { method: 'POST', body: { date, start_time: start, sonder: type } });
      closeModal(); celebrate(TYPE_LABEL[type] + ' gebucht'); toast(TYPE_LABEL[type] + ' gebucht ✓', 'ok'); syncStudent();
    } catch (e) { toast(e.message, 'err'); }
  };
}
window.__openSonderBooking = openSonderBooking;

function countdownLabel(date, start) {
  const h = hoursUntil(date, start);
  if (h <= 0) return 'jetzt';
  const days = Math.floor(h / 24);
  if (days >= 1) { const rh = Math.round(h - days * 24); return `in ${days} Tag${days > 1 ? 'en' : ''}${rh ? ` ${rh} Std` : ''}`; }
  if (h >= 1) return `in ${Math.round(h)} Std`;
  return `in ${Math.max(1, Math.round(h * 60))} Min`;
}

// ---------- Datei-Download / iCal ----------
function downloadFile(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function icsDate(date, hhmm) { return date.replace(/-/g, '') + 'T' + hhmm.replace(':', '') + '00'; }
function exportICS(bookings) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''); // YYYYMMDDTHHMMSSZ
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ginoco//DE', 'CALSCALE:GREGORIAN'];
  for (const b of bookings) {
    const end = addMin(b.start_time, b.duration_min);
    lines.push('BEGIN:VEVENT', `UID:fsp-${b.id}@ginoco`, `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(b.date, b.start_time)}`, `DTEND:${icsDate(b.date, end)}`,
      'SUMMARY:Fahrstunde 🚗', `DESCRIPTION:Fahrstunde (${b.duration_min} Min)`, 'BEGIN:VALARM',
      'TRIGGER:-PT3H', 'ACTION:DISPLAY', 'DESCRIPTION:Fahrstunde in 3 Stunden', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  downloadFile('fahrstunden.ics', lines.join('\r\n'), 'text/calendar');
  toast('Kalenderdatei heruntergeladen ✓', 'ok');
}

function studentBookingItem(b) {
  const gear = b.gearbox ? `<span class="badge ${b.gearbox}">${b.gearbox === 'schalt' ? 'Schalter' : 'Automatik'}</span>` : '';
  const cancelH = state.settings?.cancel_hours || 24;
  const h = hoursUntil(b.date, b.start_time);
  const soon = h < cancelH;
  let st, actions = '';
  if (b.status === 'done') {
    st = '<span class="badge done">gefahren</span>';
  } else if (b.status === 'offered') {
    st = '<span class="badge offer">🎁 im Angebot</span>';
    actions = `<button class="ghost sm" data-withdraw="${b.id}">Zurücknehmen</button>`;
  } else if (b.confirmed === 0) {
    // Vom Fahrlehrer reservierter Termin – der Schüler bestätigt ihn zuerst.
    st = '<span class="badge reserved">🔶 reserviert</span>';
    actions = `<button class="sm" data-confirm="${b.id}">✅ Bestätigen</button>`
      + (h >= cancelH ? ` <button class="ghost sm" data-cancel="${b.id}">Passt nicht</button>` : '');
  } else {
    st = '<span class="badge booked">✅ bestätigt</span>';
    const lockH = state.settings?.lock_hours || 36;
    if (h < lockH) {
      // gesperrt: Termin steht fest
      actions = `<span class="pill">🔒 fest gebucht</span>`;
    } else if (soon) {
      // zwischen Sperr- und Storno-Frist: nur noch ins Angebot geben
      actions = `<button class="sm" data-offer="${b.id}" title="Kostenfreies Storno nur bis ${cancelH} h vorher – gib die Stunde stattdessen ins Angebot">🎁 Ins Angebot geben</button>`;
    } else {
      actions = `<button class="sm" data-offer="${b.id}">🎁 Ins Angebot geben</button>
        <button class="ghost sm" data-cancel="${b.id}">Stornieren</button>`;
    }
  }
  const fb = (b.status === 'done' && b.feedback) ? `<div class="lesson-fb">📝 ${esc(b.feedback)}</div>` : '';
  return `<div class="bitem">
    <div>
      <div class="when">${WD[isoDow(b.date) - 1]} ${fmtShort(b.date)} · ${b.start_time} <span class="muted" style="font-weight:400">(${b.duration_min} Min)</span></div>
      <div class="meta">${st} ${typeBadge(b.lesson_type)} ${gear} ${b.plate ? '· ' + esc(b.plate) : ''}
        ${b.status === 'booked' && soon ? `<span class="muted">· in ${h < 1 ? '<1' : Math.round(h)} h</span>` : ''}</div>
      ${fb}
    </div>
    <div class="inline">${actions}</div>
  </div>`;
}

// ---------- Abholung: Schüler teilt Standort / setzt Abholort ----------
let myWatchId = null;
function startMyShare() {
  if (!navigator.geolocation) { toast('GPS nicht verfügbar', 'err'); return; }
  myWatchId = navigator.geolocation.watchPosition(async (pos) => {
    try { await api('/api/my/location', { method: 'POST', body: { lat: pos.coords.latitude, lng: pos.coords.longitude } }); } catch {}
  }, (e) => { toast('Standort-Fehler: ' + e.message, 'err'); stopMyShare(); },
    { enableHighAccuracy: true, maximumAge: 8000, timeout: 20000 });
  state.myShareActive = true;
  toast('Dein Standort wird geteilt 📍', 'ok');
  refreshStudentLive();
}
function stopMyShare() {
  if (myWatchId != null) navigator.geolocation.clearWatch(myWatchId);
  myWatchId = null; state.myShareActive = false;
  api('/api/my/location/stop', { method: 'POST' }).catch(() => {});
  refreshStudentLive();
}
window.__startMyShare = startMyShare;
window.__stopMyShare = stopMyShare;
async function openPickupModal(cur) {
  modal(`<h3>📍 Wo sollen wir dich abholen?</h3>
    <p class="hint">Sag deinem Fahrlehrer, von wo du abgeholt werden möchtest. Du kannst auch deinen aktuellen Standort übernehmen.</p>
    <div class="field"><label>Abholort</label><input id="pk-label" value="${esc(cur || '')}" placeholder="z.B. vor der Schule, am Bahnhof …"></div>
    <button class="sec sm" id="pk-here" type="button">📍 Aktuellen Standort übernehmen</button>
    <div class="hint" id="pk-info" style="margin:.4rem 0 0"></div>
    <div class="actions"><button class="sec" onclick="window.__closeModal()">Abbrechen</button><button id="pk-save">Speichern</button></div>`);
  let lat = null, lng = null;
  $('#pk-here').onclick = async () => {
    try {
      const c = await getPosOnce(); lat = c.latitude; lng = c.longitude;
      const addr = await reverseGeocode(lat, lng);
      if (addr && !$('#pk-label').value.trim()) $('#pk-label').value = addr;
      $('#pk-info').innerHTML = `✓ Standort übernommen (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    } catch (e) { toast(e.message, 'err'); }
  };
  $('#pk-save').onclick = async () => {
    try {
      await api('/api/my/pickup', { method: 'POST', body: { label: $('#pk-label').value, lat, lng } });
      closeModal(); toast('Abholort gespeichert ✓', 'ok'); refreshStudentLive();
    } catch (e) { toast(e.message, 'err'); }
  };
}
window.__openPickup = openPickupModal;

// ---------- Live-Verfolgung (Schüler) ----------
let studentLivePoll = null;
// ---------- Live-Karte (Leaflet + OpenStreetMap, lokal gehostet) ----------
let _leafletPromise = null;
function ensureLeaflet() {
  if (window.L) return Promise.resolve();
  if (_leafletPromise) return _leafletPromise;
  _leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = '/vendor/leaflet/leaflet.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = '/vendor/leaflet/leaflet.js';
    s.onload = () => resolve();
    s.onerror = () => { _leafletPromise = null; reject(new Error('Karte konnte nicht geladen werden')); };
    document.head.appendChild(s);
  });
  return _leafletPromise;
}
const _liveMaps = {}; // id -> Karten-Objekt (map, marker, route, zustand)
function _carIcon() { return L.divIcon({ className: 'lm-car', html: '🚗', iconSize: [36, 36], iconAnchor: [18, 18] }); }
function _meetIcon() { return L.divIcon({ className: 'lm-pin', html: '📍', iconSize: [30, 34], iconAnchor: [15, 30] }); }
function _youIcon() { return L.divIcon({ className: 'lm-you', html: '🧍', iconSize: [30, 34], iconAnchor: [15, 30] }); }
// Ansicht so einstellen, dass beide Punkte sichtbar sind (programmatisch, ohne „userMoved" zu setzen)
function _fitLive(m) {
  if (!m || !m.pts) return;
  m._prog = true;
  if (m.pts.length > 1) m.map.fitBounds(m.pts, { padding: [42, 42], maxZoom: 16, animate: m.fitted });
  else m.map.setView(m.pts[0], 15);
  m.map.once('moveend', () => { m._prog = false; });
}
async function initLiveMap(id) {
  await ensureLeaflet();
  const el = document.getElementById(id);
  if (!el || !window.L) return null;
  destroyLiveMap(id);
  const map = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
  const tl = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  const m = { map, tl, car: null, meet: null, route: null, routeKey: '', fitted: false,
    userMoved: false, _prog: false, pts: null, routeInfo: null, onRoute: null };
  _liveMaps[id] = m;
  // Schaut der Nutzer selbst herum, wird die Ansicht nicht mehr automatisch verschoben.
  map.on('dragstart', () => { m.userMoved = true; });
  map.on('zoomstart', () => { if (!m._prog) m.userMoved = true; });
  // „Zentrieren"-Knopf – holt die Ansicht auf beide Punkte zurück.
  const Rc = L.Control.extend({ options: { position: 'topright' }, onAdd() {
    const b = L.DomUtil.create('button', 'lm-recenter');
    b.type = 'button'; b.title = 'Ansicht zentrieren'; b.setAttribute('aria-label', 'Ansicht zentrieren'); b.textContent = '◎';
    L.DomEvent.disableClickPropagation(b);
    L.DomEvent.on(b, 'click', () => { m.userMoved = false; _fitLive(m); });
    return b;
  } });
  map.addControl(new Rc());
  const dropLoader = () => { const l = el.querySelector('.lm-loading'); if (l) l.remove(); };
  // Falls die Kacheln nicht laden (kein Internet): kurzer Hinweis.
  let okT = 0, errT = 0;
  tl.on('tileload', () => { okT++; dropLoader(); });
  tl.on('tileerror', () => { errT++; if (okT === 0 && errT >= 3 && !m._hinted) {
    m._hinted = true; dropLoader(); const h = L.DomUtil.create('div', 'lm-hint', el);
    h.textContent = '🛰️ Karte lädt gerade nicht – Internetverbindung?'; } });
  setTimeout(dropLoader, 4000); // Notausstieg, damit der Reifen nicht ewig dreht
  setTimeout(() => { try { map.invalidateSize(); } catch {} }, 60);
  return m;
}
function destroyLiveMap(id) {
  const m = _liveMaps[id];
  if (m) { try { m.map.remove(); } catch {} delete _liveMaps[id]; }
}
// aPos/bPos = [lat,lng]. aIcon = Icon für den beweglichen Punkt (Auto oder Schüler).
// onRoute(info|null) wird aufgerufen, sobald die echte Straßen-Route (Entfernung+Fahrzeit) da ist.
async function updateLiveMap(id, aPos, aIcon, bPos, bLabel, bIcon, onRoute) {
  const m = _liveMaps[id];
  if (!m || !window.L) return;
  m.onRoute = onRoute || null;
  if (!m.car) m.car = L.marker(aPos, { icon: aIcon }).addTo(m.map);
  else m.car.setLatLng(aPos);
  const pts = [aPos];
  if (bPos) {
    if (!m.meet) { m.meet = L.marker(bPos, { icon: bIcon || _meetIcon() }).addTo(m.map); if (bLabel) m.meet.bindPopup(bLabel); }
    else m.meet.setLatLng(bPos);
    pts.push(bPos);
    const key = aPos.map((x) => x.toFixed(3)).join(',') + '|' + bPos.map((x) => x.toFixed(4)).join(',');
    if (key !== m.routeKey) { m.routeKey = key; _drawRoute(id, aPos, bPos); }
  }
  m.pts = pts;
  if (!m.userMoved) _fitLive(m); // nur solange der Nutzer nicht selbst herumschiebt
  m.fitted = true;
}
async function _drawRoute(id, a, b) {
  const m = _liveMaps[id]; if (!m) return;
  const straight = () => {
    if (!_liveMaps[id]) return;
    if (m.route) m.map.removeLayer(m.route);
    m.route = L.polyline([a, b], { color: '#4d8dff', weight: 4, dashArray: '6,8', opacity: .7 }).addTo(m.map);
    m.routeInfo = null; if (m.onRoute) m.onRoute(null);
  };
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`;
    const r = await fetch(url); const j = await r.json();
    const rt = j.routes && j.routes[0];
    const co = rt && rt.geometry && rt.geometry.coordinates;
    if (co && _liveMaps[id]) {
      const ll = co.map((c) => [c[1], c[0]]);
      if (m.route) m.map.removeLayer(m.route);
      m.route = L.polyline(ll, { color: '#4d8dff', weight: 5, opacity: .85 }).addTo(m.map);
      // Echte Straßen-Werte: Entfernung (km) + Fahrzeit (Min)
      m.routeInfo = { km: rt.distance / 1000, min: Math.max(1, Math.round(rt.duration / 60)) };
      if (m.onRoute) m.onRoute(m.routeInfo);
    } else straight();
  } catch { straight(); }
}

// Karte für den Fahrlehrer-Standort: stellt sicher, dass Leaflet + Karte bereit sind,
// bevor Icons (die L brauchen) erzeugt werden – dann Position aktualisieren.
async function renderCarMap(id, carPos, meetPos, label, onRoute) {
  try {
    await ensureLeaflet();
    if (!_liveMaps[id]) { if (!(await initLiveMap(id))) return; }
    await updateLiveMap(id, carPos, _carIcon(), meetPos, label, _meetIcon(), onRoute);
  } catch {}
}

async function refreshStudentLive() {
  const card = $('#live-card'); if (!card) return;
  let d;
  try { d = await api('/api/my/live'); } catch { return; }
  if (!d.window) {
    card.classList.add('hidden');
    card.dataset.mode = '';
    destroyLiveMap('live-map');
    if (studentLivePoll) { clearInterval(studentLivePoll); studentLivePoll = null; }
    return;
  }
  card.classList.remove('hidden');
  const phone = state.settings?.instructor_phone;
  const contact = phone ? `<div class="inline" style="margin-top:.6rem">${contactButtons(phone, 'Hallo, ich warte am Treffpunkt auf dich.')}</div>` : '';
  // "Ich bin in X Min da" – vom Fahrlehrer gesagt (hat Vorrang, ist verlässlicher als die GPS-Schätzung)
  const announce = d.announce
    ? `<div class="announce">🚗 Dein Fahrlehrer ist ${d.announce.remaining > 0 ? `in <strong>~${d.announce.remaining} Min</strong> da` : '<strong>gleich da</strong>'}</div>`
    : '';
  // Abholung: Abholort setzen + eigenen Standort teilen (damit dich der Fahrlehrer genau findet)
  const sharing = state.myShareActive;
  const pickupControls = `<div class="pickup-box">
    <div class="pb-line"><span class="muted">Dein Abholort:</span> <strong>${d.meet?.label ? esc(d.meet.label) : 'noch nicht gesetzt'}</strong></div>
    <div class="inline" style="margin-top:.5rem;gap:.5rem">
      <button class="sec sm" id="pk-edit">📍 Abholort ${d.meet?.label ? 'ändern' : 'wählen'}</button>
      ${sharing
        ? '<button class="danger sm" id="my-share-stop">📍 Standort-Teilen beenden</button>'
        : '<button class="sm" id="my-share">📍 Meinen Standort teilen</button>'}
    </div>
    <div class="hint" style="margin:.4rem 0 0">${sharing ? '📍 Dein Standort wird geteilt – dein Fahrlehrer sieht jetzt genau, wo du bist.' : 'Teile deinen Standort, damit dich dein Fahrlehrer genau findet. Läuft nur jetzt und stoppt nach Beginn.'}</div>
  </div>`;
  // Beruhigender Status ganz oben (planmäßig / etwas später) – gilt in jeder Phase
  const delayMin = d.booking.delayMin || 0;
  const statusBanner = delayMin > 0
    ? `<div class="run-status late">⏱️ <div><strong>Wir starten heute etwas später.</strong><br><span>Deine Fahrstunde verschiebt sich um ~${delayMin} Min auf <strong>${d.booking.start_time} Uhr</strong>. Kein Stress – nimm dir die Zeit.</span></div></div>`
    : `<div class="run-status ok">✅ <div><strong>Alles läuft planmäßig.</strong><br><span>Beginn um <strong>${d.booking.start_time} Uhr</strong> (in ${d.booking.minutesToStart} Min).</span></div></div>`;
  if (d.phase === 'soon') {
    // ~1 Stunde vorher: freundlich nach dem Abholort fragen (in Gino's Ton)
    card.dataset.mode = 'soon'; destroyLiveMap('live-map');
    card.innerHTML = `<h2>🚗 Deine nächste Fahrstunde</h2>
      ${statusBanner}
      ${announce}
      <div class="pickup-ask">
        <div class="pa-q">Wo sollen wir dich einsammeln?</div>
        <p class="hint" style="margin:.3rem 0 0">Noch beim Eisessen oder mit Kumpels unterwegs? Kein Problem – sag einfach kurz Bescheid, wo genau du bist, dann findet dich dein Fahrlehrer sofort.</p>
      </div>
      ${pickupControls}
      <p class="hint">Sobald dein Fahrlehrer losfährt (ca. ${d.lead} Min vorher), siehst du hier live auf der Karte, wo er ist und wann du rausgehen musst.</p>${contact}`;
  } else if (!d.active) {
    card.dataset.mode = 'pickup'; destroyLiveMap('live-map');
    const note = d.busy
      ? 'Dein Fahrlehrer ist gerade noch in einer Fahrstunde. Sein Standort wird geteilt, sobald er unterwegs zu dir ist.'
      : `Sobald dein Fahrlehrer seinen Standort teilt (ca. ${d.lead} Min vorher), kannst du hier live sehen, wo er ist und wann er da ist.`;
    card.innerHTML = `<h2>📍 Treffpunkt</h2>
      ${statusBanner}
      ${announce}
      <p>Deine Fahrstunde beginnt in <strong>${d.booking.minutesToStart} Min</strong> (${d.booking.start_time} Uhr).</p>
      ${pickupControls}
      <p class="hint">${note}</p>${contact}`;
  } else {
    const loc = d.location;
    const upd = new Date(loc.updated_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const meetPill = d.meet?.label ? `<div class="inline" style="margin-top:.5rem"><span class="pill">📍 Treffpunkt: ${esc(d.meet.label)}</span></div>` : '';
    const setEl = (id, html) => { const e = document.getElementById(id); if (e) e.innerHTML = html; };
    // Hero + Kacheln aus den besten verfügbaren Werten bauen.
    // Priorität: Fahrlehrer-Ansage > echte Straßen-Fahrzeit (Route) > grobe Luftlinien-Schätzung.
    const applyEta = (info) => {
      const etaMin = d.announce ? d.announce.remaining : (info ? info.min : d.etaMin);
      const km = info ? info.km : d.distanceKm;
      const arrived = (km != null && km < 0.12) || (etaMin != null && etaMin <= 0);
      const goNow = !arrived && etaMin != null && etaMin <= 2;
      const hero = arrived
        ? `<div class="live-hero go"><span class="lh-ic">🎉</span><div><div class="lh-big">Dein Fahrlehrer ist da!</div><div class="lh-sub">Geh zum Treffpunkt – er wartet auf dich.</div></div></div>`
        : goNow
          ? `<div class="live-hero go"><span class="lh-ic">🚶</span><div><div class="lh-big">Jetzt rausgehen!</div><div class="lh-sub">Dein Fahrlehrer ist gleich da.</div></div></div>`
          : `<div class="live-hero"><span class="lh-ic">🚗</span><div><div class="lh-big">${etaMin != null ? `Fahrlehrer in ~${etaMin} Min da` : 'Fahrlehrer unterwegs'}</div><div class="lh-sub">${info ? 'Echte Fahrzeit über die Straße.' : 'Er ist auf dem Weg zu dir – wir sagen Bescheid, wann du raus musst.'}</div></div></div>`;
      const distStr = km != null ? (km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1) + ' km') : null;
      const distPill = distStr ? `<span class="pill">🚗 ${distStr}${info ? ' Fahrweg' : ' Luftlinie'}</span>` : '';
      setEl('live-hero', hero);
      setEl('live-pills', `${distPill}<span class="pill">aktualisiert ${upd}</span>`);
    };
    // Karte NUR EINMAL aufbauen und danach live aktualisieren (sonst würde der Punkt „springen")
    if (card.dataset.mode !== 'live' || !$('#live-map')) {
      card.dataset.mode = 'live';
      card.innerHTML = `<h2>🛰️ Dein Fahrlehrer ist unterwegs</h2>
        <div id="live-hero"></div>
        <div class="inline" id="live-pills" style="margin-bottom:.6rem"></div>
        <div id="live-map" class="live-map"><div class="lm-loading"><span class="tire">🛞</span><span>Karte lädt …</span></div></div>
        <div id="live-meet"></div>
        <div id="live-pickup"></div>
        <p class="hint" style="margin-top:.4rem">🛰️ Die Karte aktualisiert sich automatisch – du siehst live, wo dein Fahrlehrer ist und wann du rausgehen musst.</p>
        <div id="live-contact"></div>`;
    }
    applyEta(null);                 // sofort mit der Schätzung anzeigen
    setEl('live-meet', meetPill);
    setEl('live-pickup', pickupControls);
    setEl('live-contact', contact);
    const carPos = [loc.lat, loc.lng];
    const meetPos = d.meet?.lat != null ? [d.meet.lat, d.meet.lng] : null;
    renderCarMap('live-map', carPos, meetPos, d.meet?.label ? esc(d.meet.label) : null, applyEta); // echte Werte, sobald die Route da ist
  }
  const pe = $('#pk-edit'); if (pe) pe.onclick = () => openPickupModal(d.meet?.label);
  const ms = $('#my-share'); if (ms) ms.onclick = () => startMyShare();
  const mss = $('#my-share-stop'); if (mss) mss.onclick = () => stopMyShare();
  if (!studentLivePoll) studentLivePoll = setInterval(refreshStudentLive, 15000);
}

// ---------- Fahrstunden-Timer (Schüler drückt „Start", Fahrzeit läuft) ----------
let lessonTick = null;
// Welche Fahrstunde ist gerade „dran"? Heute, kurz vor Beginn bis kurz nach Ende.
function currentLessonInfo(bookings) {
  const today = todayStr(), now = Date.now();
  const cands = bookings.filter((b) => b.date === today && (b.status === 'booked' || b.status === 'done'))
    .sort((a, z) => a.start_time.localeCompare(z.start_time));
  for (const b of cands) {
    if (b.started_at) {
      const elapsedMin = (now - new Date(b.started_at).getTime()) / 60000;
      if (elapsedMin < b.duration_min + 15) return { b, started: true };
      continue; // schon lange vorbei
    }
    const minsToStart = (new Date(`${b.date}T${b.start_time}:00`).getTime() - now) / 60000;
    if (minsToStart <= 10 && minsToStart >= -30) return { b, started: false };
  }
  return null;
}
function renderLessonTimer(bookings) {
  const card = $('#lesson-card'); if (!card) return;
  if (lessonTick) { clearInterval(lessonTick); lessonTick = null; }
  const info = currentLessonInfo(bookings);
  if (!info) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  const b = info.b;
  const draw = () => {
    if (!info.started) {
      card.innerHTML = `<h2>🚗 Deine Fahrstunde</h2>
        <p>Heute um <strong>${b.start_time} Uhr</strong> · ${b.duration_min} Min Fahrzeit.</p>
        <p class="hint">Drück auf Start, sobald deine Fahrstunde beginnt – dann läuft deine Fahrzeit.</p>
        <button class="lesson-start" id="lt-start">▶️ Fahrstunde starten</button>`;
      $('#lt-start').onclick = () => startLesson(b.id);
      return;
    }
    const elapsedSec = Math.floor((Date.now() - new Date(b.started_at).getTime()) / 1000);
    const totalSec = b.duration_min * 60;
    const remain = Math.max(0, totalSec - elapsedSec);
    const mm = Math.floor(remain / 60), ss = remain % 60;
    const pct = Math.min(100, Math.round(elapsedSec / totalSec * 100));
    const startedLbl = new Date(b.started_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    card.innerHTML = `<h2>🚗 Fahrstunde läuft</h2>
      ${remain <= 0
        ? `<div class="lesson-timer done"><span class="lt-clock">✅ Zeit um</span></div>
           <p class="hint">Deine ${b.duration_min}-Minuten-Fahrstunde ist abgelaufen. Super gemacht!</p>`
        : `<div class="lesson-timer"><span class="lt-clock">${mm}:${String(ss).padStart(2, '0')}</span><span class="lt-sub">Fahrzeit übrig</span></div>
           <div class="lt-bar"><div style="width:${pct}%"></div></div>`}
      <div class="inline" style="margin-top:.7rem;justify-content:space-between">
        <span class="muted" style="font-size:.82rem">Start ${startedLbl} · ${b.duration_min} Min</span>
        <button class="ghost sm" id="lt-reset">Zurücksetzen</button>
      </div>`;
    $('#lt-reset').onclick = () => resetLesson(b.id);
  };
  draw();
  if (info.started) lessonTick = setInterval(draw, 1000);
}
async function startLesson(id) {
  try {
    const r = await api('/api/bookings/' + id + '/start', { method: 'POST' });
    const bk = myBookingsCache.find((x) => x.id == id); if (bk) bk.started_at = r.started_at;
    renderLessonTimer(myBookingsCache); toast('Fahrstunde gestartet – gute Fahrt! 🚗', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}
async function resetLesson(id) {
  if (!confirm('Timer zurücksetzen? Die Fahrzeit beginnt dann neu.')) return;
  try {
    await api('/api/bookings/' + id + '/start', { method: 'POST', body: { reset: true } });
    const bk = myBookingsCache.find((x) => x.id == id); if (bk) bk.started_at = null;
    renderLessonTimer(myBookingsCache); toast('Zurückgesetzt', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

function renderAway(away) {
  const el = $('#away-note');
  if (!el) return;
  const vac = (away || []).filter((a) => a.type === 'vacation');
  if (!vac.length) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const dates = vac.map((a) => `${WD[isoDow(a.date) - 1]} ${fmtShort(a.date)}`).join(', ');
  el.innerHTML = `🌴 <strong>Fahrlehrer im Urlaub:</strong> ${dates} – an diesen Tagen keine Fahrstunden.`;
}

// ---- Handy-Benachrichtigungen (Web Push) ----
function urlB64ToUint8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
async function pushState() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
    const reg = await navigator.serviceWorker.ready;
    return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
  } catch { return 'unsupported'; }
}
async function enablePush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { toast('Dein Gerät unterstützt keine Push-Nachrichten', 'err'); return; }
    if (Notification.permission === 'denied') { toast('Benachrichtigungen sind blockiert – bitte in den Browser-Einstellungen für ginoco.de wieder erlauben.', 'err'); refreshPushCtl(); return; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Ohne Erlaubnis keine Benachrichtigungen. Tippe im Browser-Fenster auf „Erlauben".', 'err'); refreshPushCtl(); return; }
    const reg = await navigator.serviceWorker.ready;
    const { key } = await api('/api/push/key');
    if (!key) { toast('Push ist gerade nicht bereit', 'err'); return; }
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(key) });
    const j = sub.toJSON();
    await api('/api/push/subscribe', { method: 'POST', body: { endpoint: j.endpoint, keys: j.keys } });
    toast('Benachrichtigungen an 🔔', 'ok'); refreshPushCtl();
  } catch (e) { toast('Push fehlgeschlagen: ' + e.message, 'err'); }
}
async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {}); await sub.unsubscribe(); }
    toast('Benachrichtigungen aus', 'ok'); refreshPushCtl();
  } catch (e) { toast(e.message, 'err'); }
}
async function refreshPushCtl() {
  const el = $('#push-ctl'); if (!el) return;
  const st = await pushState();
  const blocked = ('Notification' in window) && Notification.permission === 'denied';
  if (st === 'unsupported') {
    el.innerHTML = '<span class="hint">🔔 <strong>Handy-Benachrichtigungen</strong> gehen auf diesem Gerät leider nicht. Tipp fürs iPhone: die Seite über das Teilen-Symbol „Zum Home-Bildschirm" hinzufügen und die App von dort öffnen.</span>';
    return;
  }
  if (blocked && st !== 'on') {
    el.innerHTML = `<div class="hint">🔕 <strong>Benachrichtigungen sind blockiert.</strong> So erlaubst du sie wieder:
      <br>• <strong>Handy:</strong> im Browser oben auf das Schloss-/„aA"-Symbol neben der Adresse tippen → „Benachrichtigungen" → „Erlauben".
      <br>• <strong>PC:</strong> auf das Schloss-Symbol links neben der Adresse klicken → „Benachrichtigungen: Zulassen".
      Danach diese Seite neu laden.</div>`;
    return;
  }
  if (st === 'on') {
    el.innerHTML = `<span class="pill" style="background:var(--good-bg);color:var(--good)">🔔 Benachrichtigungen sind an</span>
      <button class="ghost sm" id="push-test">Test senden</button><button class="ghost sm" id="push-off">Ausschalten</button>`;
  } else {
    el.innerHTML = `<div class="hint" style="margin-bottom:.5rem">🔔 <strong>Handy-Benachrichtigungen einschalten:</strong> Erinnerungen, Verschiebungen, Absagen und Angebote direkt aufs Handy – auch wenn die App geschlossen ist. Beim nächsten Schritt fragt dein Browser einmal um Erlaubnis – bitte auf „Erlauben" tippen.</div>
      <button class="sm" id="push-on">🔔 Jetzt einschalten</button>`;
  }
  const on = $('#push-on'); if (on) on.onclick = enablePush;
  const off = $('#push-off'); if (off) off.onclick = disablePush;
  const test = $('#push-test'); if (test) test.onclick = async () => { try { await api('/api/push/test', { method: 'POST' }); toast('Test-Benachrichtigung gesendet 🔔', 'ok'); } catch (e) { toast(e.message, 'err'); } };
}
function renderNotifications(notifs, unread) {
  const card = $('#notif-card');
  card.classList.remove('hidden'); // immer sichtbar – wegen Push-Schalter
  chimeOnIncrease('notif', unread || 0); // Ton, wenn neue Mitteilungen dazugekommen sind
  const icon = (k) => k === 'offer' ? '🎁' : k === 'shift' ? '🕐' : k === 'reminder' ? '⏰' : k === 'sign' ? '✍️' : 'ℹ️';
  const list = (notifs && notifs.length)
    ? `<div class="notif-list">${notifs.map((n) => {
        const needsSign = n.kind === 'sign' && n.ref_booking_id && (myBookingsCache || []).some((b) => b.id === n.ref_booking_id && b.needs_sign);
        return `<div class="notif ${n.read ? '' : 'unread'}">
        <span class="notif-ic">${icon(n.kind)}</span>
        <div class="notif-body"><div class="notif-msg">${esc(n.message)}</div>
          <div class="notif-time">${new Date(n.created_at).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
          ${needsSign ? `<button class="sm notif-sign" data-sign="${n.ref_booking_id}" style="margin-top:.5rem">✍️ Jetzt unterschreiben</button>` : ''}</div>
        ${n.read ? '' : '<span class="notif-dot"></span>'}
      </div>`; }).join('')}</div>
      ${unread ? '<div style="margin-top:.8rem"><button class="sec sm" id="notif-read">Alle als gelesen markieren</button></div>' : ''}`
    : '<p class="hint">Keine Mitteilungen.</p>';
  card.innerHTML = `<h2>🔔 Mitteilungen ${unread ? `<span class="badge offer">${unread} neu</span>` : ''}</h2>
    <div class="push-ctl" id="push-ctl"></div>
    ${list}`;
  const b = $('#notif-read');
  if (b) b.onclick = async () => { try { await api('/api/my/notifications/read', { method: 'POST' }); syncStudent(); } catch (e) { toast(e.message, 'err'); } };
  card.querySelectorAll('[data-sign]').forEach((btn) => btn.onclick = () => {
    const bk = (myBookingsCache || []).find((x) => x.id === Number(btn.dataset.sign));
    if (bk) openSignModal(bk); else toast('Fahrstunde nicht gefunden', 'err');
  });
  refreshPushCtl();
}

function renderOffers(offers, wi) {
  const card = $('#offers-card');
  if (!offers.length) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  const canTake = wi.remaining > 0;
  card.innerHTML = `<h2>🎁 Angebote <span class="sub">Fahrstunden, die andere abgeben</span></h2>
    ${!canTake ? '<p class="hint">Du hast diese Woche schon dein Limit erreicht – Übernahme aus dieser Woche ist gesperrt.</p>' : ''}
    <div class="blist">${offers.map((o) => `<div class="bitem warm">
      <div><div class="when">${WD[isoDow(o.date) - 1]} ${fmtShort(o.date)} · ${o.start_time} <span class="muted" style="font-weight:400">(${o.duration_min} Min)</span></div>
      <div class="meta">${o.from ? `<span class="pill">🙋 von ${esc(o.from)}</span>` : '<span class="pill">🕶️ anonym</span>'} <span class="muted">· möchtest du übernehmen?</span></div></div>
      <div class="inline">
        ${canTake ? `<button class="sm" data-take="${o.id}">Übernehmen</button>` : ''}
        <button class="ghost sm" data-decline="${o.id}">Keine Zeit</button>
      </div></div>`).join('')}</div>`;
  card.querySelectorAll('[data-take]').forEach((b) => b.onclick = () => takeOffer(b.dataset.take));
  card.querySelectorAll('[data-decline]').forEach((b) => b.onclick = () => declineOffer(b.dataset.decline));
}

function offerBooking(id) {
  const vorname = firstName(state.user?.name);
  modal(`<h3>🎁 Ins Angebot geben</h3>
    <p class="hint">Deine Stunde kommt in die <strong>Angebote</strong> – andere Fahrschüler können sie übernehmen. Übernimmt niemand, bleibt sie ganz normal bei dir.</p>
    <p style="margin:.5rem 0 .3rem">Möchtest du dabei erkennbar sein?</p>
    <div class="offer-choice">
      <button class="sec" id="of-anon">🕶️ Anonym abgeben<span class="oc-sub">Niemand sieht, dass die Stunde von dir ist</span></button>
      ${vorname ? `<button class="sec" id="of-named">🙋 Mit „${esc(vorname)}" abgeben<span class="oc-sub">Andere sehen nur deinen Vornamen</span></button>` : ''}
    </div>
    <div class="actions"><button class="sec" onclick="window.__closeModal()">Abbrechen</button></div>`);
  const go = async (named) => {
    try { await api('/api/bookings/' + id + '/offer', { method: 'POST', body: { named } }); closeModal(); toast('Ins Angebot gestellt ✓', 'ok'); syncStudent(); }
    catch (e) { toast(e.message, 'err'); }
  };
  $('#of-anon').onclick = () => go(false);
  const n = $('#of-named'); if (n) n.onclick = () => go(true);
}
async function withdrawOffer(id) {
  try { await api('/api/bookings/' + id + '/withdraw', { method: 'POST' }); toast('Angebot zurückgenommen', 'ok'); syncStudent(); }
  catch (e) { toast(e.message, 'err'); }
}
async function takeOffer(id) {
  try { await api('/api/bookings/' + id + '/take', { method: 'POST' }); celebrate('Übernommen'); toast('Fahrstunde übernommen ✓', 'ok'); syncStudent(); }
  catch (e) { toast(e.message, 'err'); }
}
async function declineOffer(id) {
  try { await api('/api/bookings/' + id + '/decline', { method: 'POST' }); toast('Abgelehnt', 'ok'); syncStudent(); }
  catch (e) { toast(e.message, 'err'); }
}

function renderSlots(slots, mine) {
  const mineToday = new Set(mine.filter((b) => b.date === state.date && b.status !== 'cancelled').map((b) => b.start_time));
  const el = $('#slots');
  const dayName = WD_LONG[isoDow(state.date) - 1];
  if (!slots.length) {
    el.innerHTML = `<div class="empty-book">
      <div class="eb-icon">📅</div>
      <div class="eb-title">${dayName} keine Fahrstunden</div>
      <p class="eb-text">An diesem Tag bietet dein Fahrlehrer keine Termine an. Lass mich den nächsten freien Tag für dich suchen.</p>
      <button data-find-next="${state.date}">🔎 Nächsten freien Termin finden</button>
    </div>`;
    el.querySelector('[data-find-next]').onclick = () => jumpToNextFree(addDays(state.date, 1));
    return;
  }
  el.innerHTML = slots.map((s) => {
    const mineHere = mineToday.has(s.start);
    let cls = s.state, inner = '';
    let sub = `${s.start}–${s.end} · ${s.duration} Min`;
    // Freier (fliessender) Start: Dauer waehlt der Schüler selbst -> passende Beschriftung.
    if (s.state === 'free' && !mineHere) {
      const md = Number(s.maxDur || s.duration);
      const my = String(state.user?.allowed_durations || '80').split(',').map(Number).filter((n) => n > 0 && n <= md).sort((a, b) => a - b);
      sub = my.length > 1 ? `frei ab ${s.start} Uhr · ${my.join('/')} Min wählbar` : `frei ab ${s.start} Uhr · ${my[0] || s.duration} Min`;
    }
    if (mineHere) {
      // Nur frei stornierbar, solange die Storno-Frist nicht erreicht ist –
      // sonst 🔒 (Verwalten/Anbieten geht oben unter „Meine Fahrstunden").
      const cancelH = state.settings?.cancel_hours || 48;
      const freeCancel = hoursUntil(state.date, s.start) >= cancelH;
      inner = `<span class="tag b">Dein Termin</span>`
        + (freeCancel ? `<button class="ghost sm" data-cancel-time="${s.start}">Stornieren</button>`
                      : `<span class="pill">🔒 gebucht</span>`);
      cls = 'booked';
    } else if (s.state === 'free') {
      inner = `<span class="tag g">frei</span><button class="sm" data-book="${s.start}" data-dur="${s.duration}" data-maxdur="${s.maxDur || s.duration}">Buchen</button>`;
    } else if (s.state === 'booked') {
      inner = `<span class="tag x">belegt</span>`;
    } else if (s.state === 'offered') {
      inner = `<span class="tag x">wird abgegeben</span>`;
    } else if (s.state === 'blocked') {
      inner = `<span class="tag x">${esc(s.blockTitle || 'belegt')}</span>`;
    } else if (s.state === 'past') {
      inner = `<span class="tag x">vorbei</span>`;
    } else if (s.state === 'toofar') {
      inner = `<span class="tag x">noch nicht buchbar</span>`;
    } else {
      inner = `<span class="tag x">geschlossen</span>`;
    }
    return `<div class="slot ${cls}">
      <div class="time">${s.start}</div>
      <div class="dur">${sub}</div>
      ${inner}
    </div>`;
  }).join('');
  // Tag hat Slots, aber nichts Freies (alles belegt/vorbei) und keiner gehört mir:
  // sanfter Hinweis + Sprung zum nächsten freien Termin.
  const anyFree = slots.some((s) => s.state === 'free');
  const anyMine = slots.some((s) => mineToday.has(s.start));
  if (!anyFree && !anyMine) {
    el.insertAdjacentHTML('beforeend', `<div class="slots-hint">
      An diesem Tag ist gerade nichts frei.
      <button class="sec sm" data-find-next>🔎 Nächsten freien Termin</button>
    </div>`);
    el.querySelector('[data-find-next]').onclick = () => jumpToNextFree(addDays(state.date, 1));
  }
  el.querySelectorAll('[data-book]').forEach((b) => b.onclick = () => bookSlot(b.dataset.book, Number(b.dataset.dur), Number(b.dataset.maxdur || 0)));
  el.querySelectorAll('[data-cancel-time]').forEach((b) => b.onclick = () => {
    const bk = myBookingsCache.find((x) => x.date === state.date && x.start_time === b.dataset.cancelTime);
    if (bk) cancelBooking(bk.id);
  });
}

function bookSlot(start, dur, maxDur) {
  const cancelH = state.settings?.cancel_hours || 48;
  const lockH = state.settings?.lock_hours || 36;
  let allowed = String(state.user?.allowed_durations || '80').split(',').map(Number).filter((n) => n > 0).sort((a, b) => a - b);
  // Fliessender Tagesplan: nur Dauern anbieten, die an diesem Start noch in den Tag passen.
  const cap = Number(maxDur) > 0 ? Number(maxDur) : Infinity;
  const fits = allowed.filter((d) => d <= cap);
  if (!fits.length) {
    modal(`<h3>Termin buchen</h3>
      <div class="warnbox">An diesem Start passt keine deiner freigegebenen Fahrstunden-Längen mehr in den Tag${cap < Infinity ? ` (nur noch ${cap} Min bis Feierabend)` : ''}. Bitte wähle einen früheren Start.</div>
      <div class="actions"><button class="sec" onclick="window.__closeModal()">Schließen</button></div>`);
    return;
  }
  allowed = fits;
  const defDur = allowed.includes(80) ? 80 : allowed[allowed.length - 1];
  const durSelect = allowed.length > 1
    ? `<div class="field"><label>Dauer wählen</label><select id="bk-dur">${allowed.map((d) => `<option value="${d}" ${d === defDur ? 'selected' : ''}>${d} Minuten</option>`).join('')}</select></div>`
    : '';
  modal(`<h3>Termin verbindlich buchen?</h3>
    <div class="warnbox">
      Bist du wirklich sicher, dass du diesen Termin nehmen willst?
    </div>
    <p style="margin:.6rem 0 .2rem"><strong>${WD_LONG[isoDow(state.date) - 1]}, ${fmtShort(state.date)} um ${start} Uhr</strong>${allowed.length > 1 ? '' : ` · ${allowed[0]} Min`}</p>
    ${durSelect}
    <ul class="hint" style="margin:.4rem 0 .4rem;padding-left:1.1rem">
      <li>Kostenfrei stornieren nur bis <strong>${cancelH} Std.</strong> vorher.</li>
      <li>Ab <strong>${lockH} Std.</strong> vorher steht der Termin fest – dann keine Absage mehr.</li>
      <li>Im Zeitfenster dazwischen kannst du die Stunde anderen zur Übernahme anbieten.</li>
    </ul>
    ${state.settings?.policy_text ? `<div class="hint" style="border-top:1px solid var(--line);padding-top:.5rem;white-space:pre-line">${esc(state.settings.policy_text)}</div>` : ''}
    <div class="actions">
      <button class="sec" onclick="window.__closeModal()">Abbrechen</button>
      <button id="bk-confirm">Ja, verbindlich buchen</button>
    </div>`);
  $('#bk-confirm').onclick = async () => {
    const chosen = $('#bk-dur') ? Number($('#bk-dur').value) : allowed[0];
    try {
      await api('/api/bookings', { method: 'POST', body: { date: state.date, start_time: start, duration_min: chosen } });
      closeModal(); celebrate('Termin gebucht'); toast('Termin gebucht ✓', 'ok'); syncStudent();
    } catch (e) { toast(e.message, 'err'); }
  };
}
async function cancelBooking(id) {
  if (!confirm('Diesen Termin wirklich stornieren?')) return;
  try { await api('/api/bookings/' + id, { method: 'DELETE' }); toast('Storniert', 'ok'); syncStudent(); }
  catch (e) { toast(e.message, 'err'); }
}
async function confirmBooking(id) {
  try { await api('/api/bookings/' + id + '/confirm', { method: 'POST' }); toast('Termin bestätigt ✓', 'ok'); syncStudent(); }
  catch (e) { toast(e.message, 'err'); }
}

// ====================== FAHRLEHRER ======================
function renderInstructor() {
  // Navigation läuft über das linke Edge-Menü (☰ am Bildschirmrand) –
  // daher keine obere Tab-Leiste mehr.
  app.innerHTML = header() + `<main>
    <div id="itab"></div>
  </main>`;
  wireLogout();
  drawInstrTab();
  mountEdgeMenus('instructor');
  refreshEventBadge();
}

async function refreshEventBadge() {
  try {
    const { unseen } = await api('/api/instructor/events');
    const el = $('#ev-badge');
    if (el) el.innerHTML = unseen ? `<span class="badge offer">${unseen}</span>` : '';
  } catch {}
}

function drawInstrTab() {
  app.querySelectorAll('.navtabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.instrTab));
  const t = state.instrTab;
  if (t !== 'nachrichten') openConvo = null;
  if (t === 'heute') return tabHeute();
  if (t === 'kalender') return tabKalender();
  if (t === 'codes') return tabCodes();
  if (t === 'schueler') return tabSchueler();
  if (t === 'nachrichten') return tabNachrichten();
  if (t === 'theorie') return tabTheorie();
  if (t === 'arbeitszeiten') return tabArbeitszeiten();
  if (t === 'bewertungen') return tabBewertungen();
  if (t === 'protokoll') return tabProtokoll();
  if (t === 'einstellungen') return tabEinstellungen();
}

// ---- Tab: Nachrichten (Fahrlehrer) ----
let openConvo = null; // { id, name }
async function tabNachrichten() {
  const box = $('#itab');
  if (openConvo) return convoView(openConvo.id, openConvo.name);
  box.innerHTML = '<div class="card"><h2>✉️ Nachrichten</h2><p class="hint">Lädt…</p></div>';
  let data = {};
  try { data = await api('/api/instructor/messages'); } catch (e) { box.innerHTML = `<div class="card"><p class="err">${esc(e.message)}</p></div>`; return; }
  const cs = data.conversations || [];
  const rows = cs.map((c) => `<button class="convo ${c.unread > 0 ? 'unread' : ''}" data-convo="${c.student_id}" data-name="${esc(c.student_name || '')}">
      <div class="convo-top"><strong>${esc(c.student_name || 'Fahrschüler')}</strong>
        ${c.unread > 0 ? `<span class="badge offer">${c.unread}</span>` : ''}
        <span class="hint" style="margin-left:auto">${msgTime(c.last_at)}</span></div>
      <div class="convo-last">${c.last_sender === 'instructor' ? '↩︎ ' : ''}${esc(String(c.last_body || '').slice(0, 80))}</div>
    </button>`).join('');
  box.innerHTML = `<div class="card">
    <h2>✉️ Nachrichten ${data.totalUnread ? `<span class="badge offer">${data.totalUnread} neu</span>` : ''}</h2>
    <p class="hint">Schreib mit deinen Fahrschülern. Neue Nachrichten schicken dir eine Push-Benachrichtigung (falls aktiviert). Du kannst auch ein Gespräch mit einem Schüler beginnen.</p>
    <button class="sec sm" id="msg-new" style="margin-bottom:.6rem">✏️ Neue Nachricht an …</button>
    <div class="convo-list">${cs.length ? rows : '<p class="hint">Noch keine Nachrichten.</p>'}</div>
  </div>`;
  box.querySelectorAll('[data-convo]').forEach((b) => b.onclick = () => { openConvo = { id: Number(b.dataset.convo), name: b.dataset.name }; convoView(openConvo.id, openConvo.name); });
  $('#msg-new').onclick = async () => {
    let students = [];
    try { students = (await api('/api/students')).students || []; } catch (e) { toast(e.message, 'err'); return; }
    if (!students.length) { toast('Noch keine Fahrschüler', 'err'); return; }
    modal(`<h3>Neue Nachricht</h3>
      <div class="field"><label>An</label><select id="mn-stu">${students.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Nachricht</label><textarea id="mn-body" rows="3" maxlength="2000"></textarea></div>
      <div class="actions"><button class="sec" onclick="window.__closeModal()">Abbrechen</button><button id="mn-go">Senden</button></div>`);
    $('#mn-go').onclick = async () => {
      const sid = Number($('#mn-stu').value), body = $('#mn-body').value.trim();
      if (!body) return;
      try { await api('/api/instructor/messages', { method: 'POST', body: { student_id: sid, body } }); closeModal(); openConvo = { id: sid, name: students.find((s) => s.id === sid)?.name || '' }; convoView(sid, openConvo.name); toast('Gesendet ✓', 'ok'); }
      catch (e) { toast(e.message, 'err'); }
    };
  };
}
async function convoView(sid, name) {
  const box = $('#itab');
  box.innerHTML = '<div class="card"><p class="hint">Lädt…</p></div>';
  let data = {};
  try { data = await api('/api/instructor/messages/' + sid); } catch (e) { box.innerHTML = `<div class="card"><p class="err">${esc(e.message)}</p></div>`; return; }
  const nm = data.student?.name || name || 'Fahrschüler';
  const bubbles = (data.messages || []).map((m) => `<div class="msg ${m.sender === 'instructor' ? 'me' : 'them'}">
      <div class="msg-b">${esc(m.body)}</div><div class="msg-t">${m.sender === 'instructor' ? 'Du' : esc(nm)} · ${msgTime(m.created_at)}</div></div>`).join('')
    || '<p class="hint">Noch keine Nachrichten in diesem Gespräch.</p>';
  box.innerHTML = `<div class="card">
    <div class="inline" style="margin-bottom:.5rem"><button class="ghost sm" id="convo-back">← Zurück</button><h2 style="margin:0">${esc(nm)}</h2></div>
    <div class="msg-list" id="msg-list">${bubbles}</div>
    <div class="msg-compose"><textarea id="ci-body" rows="2" maxlength="2000" placeholder="Antwort schreiben …"></textarea><button class="sm" id="ci-send">Senden</button></div>
  </div>`;
  const list = $('#msg-list'); if (list) list.scrollTop = list.scrollHeight;
  $('#convo-back').onclick = () => { openConvo = null; tabNachrichten(); };
  const send = async () => {
    const body = $('#ci-body').value.trim(); if (!body) return;
    $('#ci-send').disabled = true;
    try { await api('/api/instructor/messages', { method: 'POST', body: { student_id: sid, body } }); $('#ci-body').value = ''; await convoView(sid, nm); }
    catch (e) { toast(e.message, 'err'); }
    finally { const b = $('#ci-send'); if (b) b.disabled = false; }
  };
  $('#ci-send').onclick = send;
  $('#ci-body').onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } };
}

// ---- Tab: Bewertungen (Moderation) ----
let revFilter = 'alle';
const revStars = (n) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
async function tabBewertungen() {
  const box = $('#itab');
  box.innerHTML = '<div class="card"><h2>⭐ Bewertungen</h2><p class="hint">Lädt…</p></div>';
  let reviews = [];
  try { reviews = (await api('/api/instructor/reviews')).reviews || []; } catch (e) { box.innerHTML = `<div class="card"><p class="err">${esc(e.message)}</p></div>`; return; }
  reviews.forEach((r) => { if (typeof r.ratings === 'string') { try { r.ratings = JSON.parse(r.ratings); } catch { r.ratings = null; } } });
  const modeL = { full: 'voller Name', initials: 'abgekürzt', anon: 'anonym' };
  const total = reviews.length;
  const visible = reviews.filter((r) => r.published).length;
  const avg = total ? (reviews.reduce((s, r) => s + r.rating, 0) / total) : 0;
  // Durchschnitt je Kategorie ("Durchbewerten"-Auswertung) – nur aus Bewertungen mit Aufschlüsselung.
  const catAvg = REVIEW_CATS.map((c) => {
    const vals = reviews.map((r) => r.ratings && r.ratings[c.k]).filter((x) => x >= 1 && x <= 5);
    return { ...c, avg: vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null, n: vals.length };
  });
  const catAny = catAvg.some((c) => c.n > 0);
  const catAvgHTML = catAny ? `<div class="rev-catavg">
    <div class="rev-catavg-h">Durchschnitt je Kategorie</div>
    <div class="rev-catavg-grid">${catAvg.map((c) => `<div class="rev-catavg-item ${c.avg == null ? 'empty' : ''}">
      <span class="rev-ca-ic">${c.icon}</span>
      <span class="rev-ca-lb">${esc(c.label)}</span>
      <span class="rev-ca-val">${c.avg == null ? '–' : c.avg.toFixed(1) + '★'}</span>
      <span class="rev-ca-bar"><span style="width:${c.avg == null ? 0 : Math.round(c.avg / 5 * 100)}%"></span></span>
    </div>`).join('')}</div></div>` : '';
  // Sterne-Verteilung 5..1
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, c: reviews.filter((r) => r.rating === n).length }));
  const maxc = Math.max(1, ...dist.map((d) => d.c));
  const distHTML = dist.map((d) => `<div class="rev-dist-row"><span class="rev-dist-lbl">${d.n}★</span>
    <span class="rev-dist-bar"><span style="width:${Math.round(d.c / maxc * 100)}%"></span></span>
    <span class="rev-dist-c">${d.c}</span></div>`).join('');

  // Filter anwenden
  const shown = reviews.filter((r) =>
    revFilter === 'sichtbar' ? r.published :
    revFilter === 'verborgen' ? !r.published :
    revFilter === 'top' ? r.featured : true);

  const card = (r) => `<div class="rev-mod ${r.published ? '' : 'hidden-rev'} ${r.featured ? 'is-top' : ''}">
    <div class="rev-mod-top">
      <span class="rev-stars">${revStars(r.rating)}</span>
      ${r.featured ? '<span class="tag top">⭐ Top</span>' : ''}
      ${r.published ? '<span class="tag g">sichtbar</span>' : '<span class="tag x">verborgen</span>'}
      <span class="hint" style="margin-left:auto">${r.created_at ? r.created_at.slice(0, 10) : ''}</span>
    </div>
    <div class="rev-text">„${esc(r.text)}"</div>
    ${r.ratings ? `<div class="rev-mine-chips">${REVIEW_CATS.filter((c) => r.ratings[c.k]).map((c) => `<span class="rev-chip">${c.icon} ${esc(c.label)} <b>${r.ratings[c.k]}★</b></span>`).join('')}</div>` : ''}
    ${r.reply ? `<div class="rev-reply">↩︎ <em>${esc(r.reply)}</em></div>` : ''}
    <div class="rev-mod-who">
      <span class="pill">${esc(r.author_name || 'Ein Fahrschüler')}</span>
      <span class="hint">wird ${modeL[r.author_mode] || 'angezeigt'}${r.show_photo ? ' · mit Foto' : ''}${r.archived_at ? ' · bestanden ✓' : ''}${r.student_name && r.author_mode !== 'full' ? ` · von ${esc(r.student_name)}` : ''}</span>
    </div>
    <div class="rev-actions">
      <button class="ghost sm" data-feat="${r.id}" data-to="${r.featured ? 0 : 1}">${r.featured ? '☆ Top lösen' : '⭐ Top'}</button>
      <button class="sec sm" data-pub="${r.id}" data-to="${r.published ? 0 : 1}">${r.published ? '🙈 Verbergen' : '👁️ Sichtbar'}</button>
      <button class="ghost sm" data-edit="${r.id}">✏️ Bearbeiten</button>
      <button class="ghost sm" data-reply="${r.id}">↩︎ Antworten</button>
      <button class="ghost sm" data-copy="${r.id}">📋 Kopieren</button>
      <button class="danger sm" data-del="${r.id}">🗑️</button>
    </div>
  </div>`;

  const fTab = (k, l) => `<button class="rev-ftab ${revFilter === k ? 'active' : ''}" data-filter="${k}">${l}</button>`;
  box.innerHTML = `<div class="card">
    <div class="rev-head">
      <div class="rev-avg"><div class="rev-avg-num">${total ? avg.toFixed(1) : '–'}</div>
        <div class="rev-avg-stars">${revStars(Math.round(avg))}</div>
        <div class="hint">${total} Bewertung${total === 1 ? '' : 'en'} · ${visible} sichtbar</div></div>
      <div class="rev-dist">${distHTML}</div>
    </div>
    ${catAvgHTML}
    <p class="hint">Sichtbare Bewertungen laufen auf der Startseite als Laufschrift. „⭐ Top" hebt eine Stimme hervor (läuft ganz vorne). Bewertungen bleiben dauerhaft erhalten – auch nach bestandener Prüfung.</p>
    <div class="rev-toolbar">
      <div class="rev-ftabs">${fTab('alle', 'Alle')}${fTab('sichtbar', 'Sichtbar')}${fTab('verborgen', 'Verborgen')}${fTab('top', '⭐ Top')}</div>
      <button class="sm" id="rev-add">➕ Eintragen</button>
    </div>
    <div class="rev-modlist">${shown.length ? shown.map(card).join('') : '<p class="hint" style="padding:.6rem 0">Keine Bewertungen in dieser Ansicht.' + (total ? '' : ' Deine Fahrschüler geben in ihrem Portal unter „⭐ Bewertung" eine ab – oder trag selbst eine ein (z. B. mündliches Lob).') + '</p>'}</div>
  </div>`;

  box.querySelectorAll('[data-filter]').forEach((b) => b.onclick = () => { revFilter = b.dataset.filter; tabBewertungen(); });
  const patch = async (id, body) => { try { await api('/api/instructor/reviews/' + id, { method: 'PATCH', body }); tabBewertungen(); } catch (e) { toast(e.message, 'err'); } };
  box.querySelectorAll('[data-pub]').forEach((b) => b.onclick = () => patch(b.dataset.pub, { published: Number(b.dataset.to) }));
  box.querySelectorAll('[data-feat]').forEach((b) => b.onclick = () => patch(b.dataset.feat, { featured: Number(b.dataset.to) }));
  box.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    if (!confirm('Diese Bewertung wirklich dauerhaft löschen?')) return;
    try { await api('/api/instructor/reviews/' + b.dataset.del, { method: 'DELETE' }); toast('Gelöscht', 'ok'); tabBewertungen(); }
    catch (e) { toast(e.message, 'err'); }
  });
  box.querySelectorAll('[data-copy]').forEach((b) => b.onclick = () => {
    const r = reviews.find((x) => x.id === Number(b.dataset.copy));
    const txt = `${revStars(r.rating)} „${r.text}" – ${r.author_name || 'Ein Fahrschüler'}`;
    navigator.clipboard.writeText(txt).then(() => toast('Kopiert ✓', 'ok')).catch(() => toast('Kopieren nicht möglich', 'err'));
  });
  box.querySelectorAll('[data-reply]').forEach((b) => b.onclick = () => {
    const r = reviews.find((x) => x.id === Number(b.dataset.reply));
    modal(`<h3>Auf Bewertung antworten</h3>
      <div class="rev-text">„${esc(r.text)}"</div>
      <div class="field" style="margin-top:.6rem"><label>Deine Antwort (öffentlich sichtbar)</label>
        <textarea id="rv-reply" rows="3" style="resize:vertical">${esc(r.reply || '')}</textarea></div>
      <div class="actions"><button class="sec" onclick="window.__closeModal()">Abbrechen</button><button id="rv-reply-go">Speichern</button></div>`);
    $('#rv-reply-go').onclick = async () => {
      try { await api('/api/instructor/reviews/' + r.id, { method: 'PATCH', body: { reply: $('#rv-reply').value } }); closeModal(); toast('Antwort gespeichert ✓', 'ok'); tabBewertungen(); }
      catch (e) { toast(e.message, 'err'); }
    };
  });
  box.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openRevEdit(reviews.find((x) => x.id === Number(b.dataset.edit))));
  $('#rev-add').onclick = () => openRevEdit(null);
}
// Bewertung bearbeiten (Sterne + Text) bzw. neu eintragen (mit Name)
function openRevEdit(r) {
  const isNew = !r;
  const cur = r || { rating: 5, text: '', author_name: '', featured: 0 };
  const starBtns = [1, 2, 3, 4, 5].map((i) => `<button type="button" class="rev-star" data-v="${i}">★</button>`).join('');
  modal(`<h3>${isNew ? 'Bewertung eintragen' : 'Bewertung bearbeiten'}</h3>
    ${errBox()}
    ${isNew ? '<p class="hint">Trag ein mündliches Lob oder eine bestehende Rezension ein – erscheint als Empfehlung auf der Startseite.</p>' : ''}
    <div class="field"><label>Sterne</label><div class="rev-starpick" id="rev-e-star" data-v="${cur.rating}">${starBtns}</div></div>
    ${isNew ? '<div class="field"><label>Name (wie er angezeigt wird)</label><input id="rev-e-name" value="' + esc(cur.author_name || '') + '" placeholder="z. B. Lena M. oder Anonym"></div>' : ''}
    <div class="field"><label>Text</label><textarea id="rev-e-text" rows="4" maxlength="800" style="resize:vertical" placeholder="z. B. Super Fahrlehrer, sehr geduldig – klare Empfehlung!">${esc(cur.text || '')}</textarea></div>
    <label class="ck-line"><input type="checkbox" id="rev-e-feat" ${cur.featured ? 'checked' : ''}> ⭐ Als Top anheften (läuft ganz vorne)</label>
    <div class="actions"><button class="sec" onclick="window.__closeModal()">Abbrechen</button><button id="rev-e-go">${isNew ? 'Eintragen' : 'Speichern'}</button></div>`);
  const pick = $('#rev-e-star');
  const paint = () => pick.querySelectorAll('.rev-star').forEach((x) => x.classList.toggle('on', Number(x.dataset.v) <= Number(pick.dataset.v)));
  pick.querySelectorAll('.rev-star').forEach((x) => x.onclick = () => { pick.dataset.v = x.dataset.v; paint(); });
  paint();
  $('#rev-e-go').onclick = async () => {
    const body = { rating: Number(pick.dataset.v) || 5, text: $('#rev-e-text').value.trim(), featured: $('#rev-e-feat').checked ? 1 : 0 };
    if (body.text.length < 5) { showErr('Bitte ein paar Worte schreiben.'); return; }
    try {
      if (isNew) { body.author_name = $('#rev-e-name').value.trim(); await api('/api/instructor/reviews', { method: 'POST', body }); }
      else await api('/api/instructor/reviews/' + r.id, { method: 'PATCH', body });
      closeModal(); toast('Gespeichert ✓', 'ok'); tabBewertungen();
    } catch (e) { showErr(e.message); }
  };
}

// ---- Tab: Heute & Ziele (Tacho) ----
// Offene „Passwort vergessen"-Anfragen auf dem Dashboard – mit Ein-Tipp-Reset
async function renderResetRequests() {
  const el = $('#reset-reqs'); if (!el) return;
  let reqs = [];
  try { reqs = (await api('/api/instructor/reset-requests')).requests || []; } catch { return; }
  if (!reqs.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="card resetreq">
    <h2>🔑 Passwort-Anfragen <span class="badge offer">${reqs.length}</span></h2>
    <p class="hint">Diese Fahrschüler haben „Passwort vergessen" angetippt. Tipp auf „Zurücksetzen" – du bekommst ein neues Passwort zum Weitergeben.</p>
    ${reqs.map((r) => `<div class="rr-item">
      <div><strong>${esc(r.student_name)}</strong> <span class="pill">${esc(r.username || '')}</span>
        <div class="hint">angefragt ${fmtDT(String(r.at).slice(0, 10), String(r.at).slice(11, 16))}</div></div>
      <button class="sm" data-rr="${r.student_id}" data-rrname="${esc(r.student_name)}" data-rruser="${esc(r.username || '')}">🔑 Zurücksetzen</button>
    </div>`).join('')}
  </div>`;
  el.querySelectorAll('[data-rr]').forEach((b) => b.onclick = () => openResetModal(Number(b.dataset.rr), b.dataset.rrname, b.dataset.rruser));
}
async function tabHeute() {
  const box = $('#itab');
  const gname = firstName(state.settings?.instructor_name || state.user?.name || '');
  box.innerHTML = `<div class="card hidden" id="live-card"></div>
    <div id="reset-reqs"></div>
    <div class="card">
      <div class="greet-big">${greetWord()}${gname ? ', <strong>' + esc(gname) + '</strong>' : ''} 👋</div>
      <div id="today-strip"></div>
      <h2 style="margin-top:.3rem">Wochenziel</h2><div id="gauge"></div><div id="tiles"></div>
    </div>
    <div class="card"><h2>Heute <span class="sub" id="today-sub"></span></h2><div id="today-list"></div></div>`;
  try {
    renderLiveInstr();
    renderResetRequests();
    const stats = await api('/api/instructor/stats?date=' + todayStr());
    renderGauge($('#gauge'), stats);
    renderTiles($('#tiles'), stats);
    const ov = await api('/api/instructor/overview?from=' + todayStr() + '&to=' + todayStr());
    $('#today-sub').textContent = fmtDay(todayStr());
    renderInstrDay($('#today-list'), todayStr(), ov.bookings, ov.blocks);
    // Kurzüberblick für heute: wie viele Stunden, nächste offen
    const hm = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
    const nowD = new Date(), nowM = nowD.getHours() * 60 + nowD.getMinutes();
    const todays = (ov.bookings || []).filter((b) => b.status !== 'cancelled').sort((a, b) => a.start_time.localeCompare(b.start_time));
    const next = todays.find((b) => b.status === 'booked' && hm(b.start_time) + (b.duration_min || 0) > nowM);
    const strip = `<div class="today-strip">
      <div class="ts-item"><b>${todays.length}</b><span>Fahrstunden heute</span></div>
      ${next ? `<div class="ts-item accent"><b>${next.start_time}</b><span>nächste: ${esc((next.student_name || next.title || '').split(' ')[0] || 'Termin')}</span></div>`
        : `<div class="ts-item"><b>✓</b><span>keine offene Stunde mehr</span></div>`}
    </div>`;
    const strEl = $('#today-strip'); if (strEl) strEl.innerHTML = strip;
  } catch (e) { toast(e.message, 'err'); }
}

async function renderLiveInstr() {
  const card = $('#live-card'); if (!card) return;
  let st;
  try { st = await api('/api/instructor/live-status'); } catch { return; }
  const sharing = state.liveSharing;
  const soon = st.upcoming[0];
  if (!sharing && !soon) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  const etaSaid = st.eta ? `<span class="pill" style="background:var(--good-bg);color:var(--good)">✅ gesagt: in ${st.eta.remaining} Min</span>` : '';
  // Abholort + Live-Standort des nächsten Schülers (Uber-Style)
  let studentBox = '';
  if (soon) {
    const vn = esc((soon.student_name || '').split(' ')[0]);
    const m = soon.meet || {}, sl = soon.studentLive;
    studentBox = `<div class="pickup-box">
      <div class="pb-line"><span class="muted">Abholort ${vn}:</span> <strong>${m.label ? esc(m.label) : '– noch nicht gesetzt –'}</strong></div>`;
    if (sl) {
      const route = `https://www.google.com/maps/dir/?api=1&destination=${sl.lat},${sl.lng}`;
      const upd = new Date(sl.updated_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      studentBox += `<div class="inline" style="margin:.45rem 0"><span class="pill" style="background:var(--good-bg);color:var(--good)">📍 ${vn} teilt Standort · ${upd}</span></div>
        <div id="instr-live-map" class="live-map" style="height:220px"><div class="lm-loading"><span class="tire">🛞</span><span>Karte lädt …</span></div></div>
        <a class="pill" href="${route}" target="_blank" rel="noopener" style="text-decoration:none;background:var(--brand);color:#fff;margin-top:.5rem;display:inline-block">🧭 Route zu ${vn} (Navi öffnen)</a>`;
      // Karte nach dem Rendern initialisieren (Schüler-Punkt + Treffpunkt)
      setTimeout(() => {
        initLiveMap('instr-live-map').then(() => {
          const meetPos = (m.lat != null && m.lng != null) ? [m.lat, m.lng] : null;
          updateLiveMap('instr-live-map', [sl.lat, sl.lng], _youIcon(), meetPos, m.label ? esc(m.label) : null, _meetIcon());
        });
      }, 30);
    } else {
      studentBox += `<div class="hint" style="margin:.35rem 0 0">Sobald ${vn} den Standort teilt, siehst du hier genau, wo er/sie steht.</div>`;
    }
    studentBox += `</div>`;
  }
  card.innerHTML = `<h2>🛰️ Live-Standort</h2>
    ${soon ? `<p class="hint">In <strong>${soon.minutes} Min</strong> beginnt die Fahrstunde mit <strong>${esc(soon.student_name)}</strong> (${soon.start_time} Uhr). Teile deinen Standort, damit ${esc(soon.student_name.split(' ')[0])} sieht, wann du da bist.</p>`
      : '<p class="hint">Du kannst deinen Standort mit dem nächsten Fahrschüler teilen.</p>'}
    ${studentBox}
    <div class="eta-row">
      <span class="muted" style="font-size:.85rem">Bescheid geben:</span>
      <button class="sec sm" data-eta="5">in 5 Min da</button>
      <button class="sec sm" data-eta="10">in 10 Min</button>
      <button class="sec sm" data-eta="15">in 15 Min</button>
      ${etaSaid}${st.eta ? '<button class="ghost sm" data-eta="0">zurücknehmen</button>' : ''}
    </div>
    ${soon ? `<div class="eta-row">
      <span class="muted" style="font-size:.85rem">Später anfangen:</span>
      <button class="sec sm" data-delay="10">+10 Min</button>
      <button class="sec sm" data-delay="15">+15 Min</button>
      <button class="sec sm" data-delay="30">+30 Min</button>
      <span class="hint" style="width:100%;margin:.1rem 0 0">Verschiebt die heutigen Termine & sagt den Fahrschülern automatisch Bescheid.</span>
    </div>` : ''}
    ${sharing
      ? `<div class="inline"><span class="pill" style="background:var(--good-bg);color:var(--good)" id="live-instr" data-ts="">📍 Standort wird geteilt …</span>
         <button class="danger sm" id="live-stop">Teilen beenden</button></div>`
      : `<button id="live-start">🛰️ Standort jetzt teilen</button>
         <p class="hint" style="margin-top:.5rem">Dein Browser fragt einmal nach der Standort-Erlaubnis. Läuft, solange die App offen ist.</p>`}`;
  if (sharing) $('#live-stop').onclick = () => stopLiveShare();
  else $('#live-start').onclick = () => startLiveShare();
  card.querySelectorAll('[data-eta]').forEach((b) => b.onclick = async () => {
    const m = Number(b.dataset.eta);
    try {
      await api('/api/instructor/eta', { method: 'POST', body: { minutes: m } });
      toast(m ? `Dem Schüler gesagt: in ${m} Min da ✓` : 'Ansage zurückgenommen', 'ok');
      renderLiveInstr();
    } catch (e) { toast(e.message, 'err'); }
  });
  card.querySelectorAll('[data-delay]').forEach((b) => b.onclick = async () => {
    const m = Number(b.dataset.delay);
    if (!confirm(`Heutige Termine um ${m} Min nach hinten schieben? Die Fahrschüler werden benachrichtigt.`)) return;
    try {
      const r = await api('/api/instructor/delay-today', { method: 'POST', body: { minutes: m } });
      toast(`${r.moved} Termin(e) um ${r.minutes} Min verschoben ✓`, 'ok');
      renderLiveInstr();
    } catch (e) { toast(e.message, 'err'); }
  });
}

function renderTiles(el, stats) {
  const c = stats.counts || {};
  const targetMin = (stats.weekly.targetH || 0) * 60;
  const pct = targetMin > 0 ? Math.round((stats.weekly.minutes / targetMin) * 100) : 0;
  el.innerHTML = `<div class="tiles">
    <div class="tile brand"><div class="n">${c.lessons || 0}</div><div class="l">Fahrstunden diese Woche</div></div>
    <div class="tile good"><div class="n">${c.driven || 0}</div><div class="l">davon gefahren</div></div>
    <div class="tile ${c.noshow ? 'bad' : ''}"><div class="n">${c.noshow || 0}</div><div class="l">nicht erschienen</div></div>
    <div class="tile"><div class="n">${pct}%</div><div class="l">vom Wochenziel</div></div>
    ${c.vacationDays ? `<div class="tile"><div class="n">🌴 ${c.vacationDays}</div><div class="l">Urlaubstage (Woche)</div></div>` : ''}
  </div>`;
}

function gaugeSVG(minutes, targetH, loH, maxHFixed) {
  const value = minutes / 60;
  const maxH = maxHFixed ? Math.max(maxHFixed, value * 1.02) : Math.max(targetH * 1.4, value * 1.05, targetH + 2);
  const R = 74, cx = 100, cy = 96, sw = 15;
  // f in [0,1]: 0 = links, 1 = rechts, Bogen ueber oben
  const P = (f) => {
    const A = Math.PI * (1 - Math.min(1, Math.max(0, f)));
    return [cx + R * Math.cos(A), cy - R * Math.sin(A)];
  };
  const f = (h) => Math.min(1, Math.max(0, h / maxH));
  const arc = (f0, f1, color, w) => {
    if (f1 <= f0 + 0.001) return '';
    const [x0, y0] = P(f0), [x1, y1] = P(f1);
    return `<path d="M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" `
      + `stroke="${color}" stroke-width="${w || sw}" fill="none"/>`;
  };
  const vf = f(value);
  const [nx, ny] = P(vf);
  const [tx, ty] = P(f(targetH));
  const done = value >= targetH;
  return `<svg viewBox="0 0 200 112" width="220" height="123">
    ${arc(0, 1, '#232e3b')}
    ${arc(0, f(loH), '#e5605f')}
    ${arc(f(loH), f(targetH), '#e6b23a')}
    ${arc(f(targetH), 1, '#35c07d')}
    <line x1="${tx.toFixed(1)}" y1="${(ty - 9).toFixed(1)}" x2="${tx.toFixed(1)}" y2="${(ty + 9).toFixed(1)}" stroke="#0e131a" stroke-width="2"/>
    <line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="#e7edf5" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="6" fill="#e7edf5"/>
    <text x="14" y="110" font-size="9" fill="#93a1b3">0</text>
    <text x="172" y="110" font-size="9" fill="#93a1b3">${Math.round(maxH)} h</text>
    ${done ? '<text x="100" y="60" font-size="17" text-anchor="middle">🎯</text>' : ''}
  </svg>`;
}

function renderGauge(el, stats) {
  const w = stats.weekly, d = stats.daily;
  el.innerHTML = `<div class="gauge-wrap">
    <div class="gauge">
      ${gaugeSVG(w.minutes, w.targetH, w.loH)}
      <div class="val">${minToH(w.minutes).toFixed(1).replace('.0', '')} h</div>
      <div class="cap">diese Woche · Ziel ${w.targetH} h</div>
      <div class="goal">${w.minutes / 60 >= w.targetH ? '✅ Ziel erreicht!' : `noch ${((w.targetH * 60 - w.minutes) / 60).toFixed(1)} h`} · davon gefahren ${minToH(w.doneMinutes).toFixed(1)} h</div>
    </div>
    <div class="gauge">
      ${gaugeSVG(d.minutes, d.targetH, d.targetH * 0.8)}
      <div class="val">${minToH(d.minutes).toFixed(1).replace('.0', '')} h</div>
      <div class="cap">heute · Ziel ${d.targetH} h</div>
    </div>
    ${stats.monthly ? `<div class="gauge">
      ${gaugeSVG(stats.monthly.minutes, stats.monthly.targetH, stats.monthly.targetH * 0.75, stats.monthly.maxH)}
      <div class="val">${minToH(stats.monthly.minutes).toFixed(1).replace('.0', '')} h</div>
      <div class="cap">dieser Monat · Ziel ${stats.monthly.targetH} h</div>
      <div class="goal">${stats.monthly.minutes / 60 >= stats.monthly.targetH ? '✅ Ziel erreicht!' : `noch ${((stats.monthly.targetH * 60 - stats.monthly.minutes) / 60).toFixed(1)} h`} · davon gefahren ${minToH(stats.monthly.doneMinutes).toFixed(1)} h</div>
    </div>` : ''}
    <div style="flex:1;min-width:260px">
      <div class="cap muted" style="margin-bottom:.3rem">Woche im Überblick</div>
      <div class="weekbars">${weekBars(stats)}</div>
    </div>
  </div>`;
}

function weekBars(stats) {
  const max = Math.max(60, ...stats.perDay.map((d) => d.minutes), stats.weekly.targetH / 7 * 60);
  return stats.perDay.map((d, i) => {
    const h = Math.round((d.minutes / max) * 100);
    return `<div class="b" title="${WD[i]} ${fmtShort(d.date)}: ${hLabel(d.minutes)}">
      <div class="bar ${d.date === todayStr() ? 'today' : ''}" style="height:${h}%"></div>
      <div class="lbl">${WD[i]}</div>
    </div>`;
  }).join('');
}

// ---- Tag-Liste (Fahrlehrer) mit Aktionen ----
function renderInstrDay(el, date, bookings, blocks) {
  window.__instrBookings = bookings;
  const items = [];
  for (const bl of blocks) items.push({ kind: 'block', ...bl });
  for (const b of bookings) items.push({ kind: 'booking', ...b });
  items.sort((a, b) => a.start_time.localeCompare(b.start_time));
  if (!items.length) { el.innerHTML = '<p class="muted">Keine Termine an diesem Tag.</p>'; return; }
  el.innerHTML = `<div class="blist">${items.map((it) => it.kind === 'block' ? blockItem(it) : instrBookingItem(it)).join('')}</div>`;
  el.querySelectorAll('[data-mark]').forEach((b) => b.onclick = () => openMarkModal(b.dataset.mark));
  el.querySelectorAll('[data-cancel]').forEach((b) => b.onclick = () => instrCancel(b.dataset.cancel));
  el.querySelectorAll('[data-delblock]').forEach((b) => b.onclick = () => delBlock(b.dataset.delblock));
}

function instrBookingItem(b) {
  const gear = b.gearbox ? `<span class="badge ${b.gearbox}">${b.gearbox === 'schalt' ? 'Schalter' : 'Automatik'}</span>` : '';
  const st = b.status === 'done' ? '<span class="badge done">gefahren</span>'
    : b.status === 'offered' ? '<span class="badge offer">🔄 wird abgegeben</span>'
    : b.confirmed === 0 ? '<span class="badge reserved">🔶 reserviert (wartet auf Bestätigung)</span>'
    : '<span class="badge booked">✅ bestätigt</span>';
  const who = b.student_name ? esc(b.student_name) : (b.title ? esc(b.title) : 'Eigener Termin');
  const end = addMin(b.start_time, b.duration_min);
  return `<div class="bitem">
    <div>
      <div class="when">${b.start_time}–${end} <span class="muted" style="font-weight:400">(${b.duration_min} Min)</span></div>
      <div class="meta"><strong>${who}</strong> ${b.student_phone ? '· ' + esc(b.student_phone) + ' ' + contactButtons(b.student_phone, `Hallo ${(b.student_name || '').split(' ')[0]}, wegen deiner Fahrstunde am ${fmtShort(b.date)} um ${b.start_time} Uhr:`) : ''}</div>
      <div class="meta">${st} ${typeBadge(b.lesson_type)} ${gear} ${b.plate ? '· 🚘 ' + esc(b.plate) : ''} ${b.meet_label ? '· 📍 ' + esc(b.meet_label) : ''} ${b.note ? '· ' + esc(b.note) : ''}</div>
    </div>
    <div class="inline">
      <button class="sec sm" data-mark="${b.id}">Bearbeiten</button>
      <button class="ghost sm" data-cancel="${b.id}">Stornieren</button>
    </div>
  </div>`;
}
function blockItem(bl) {
  const label = bl.type === 'theorie' ? '📚 Theorie' : (bl.type === 'frei' ? '🌴 Frei' : '⛔ Blockiert');
  return `<div class="bitem warm">
    <div>
      <div class="when">${bl.start_time}–${bl.end_time}</div>
      <div class="meta">${label} · <strong>${esc(bl.title)}</strong> ${bl.count_hours ? '<span class="pill">zählt als Arbeitszeit</span>' : ''}</div>
    </div>
    <button class="ghost sm" data-delblock="${bl.id}">Löschen</button>
  </div>`;
}

function addMin(hhmm, min) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + min;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// Modal: Stunde bearbeiten / abschließen
function openMarkModal(id) {
  const b = window.__instrBookings.find((x) => String(x.id) === String(id));
  if (!b) return;
  modal(`<h3>Fahrstunde bearbeiten</h3>
    <div class="row">
      <div class="field"><label>Datum (verschieben)</label><input type="date" id="m-date" value="${b.date}"></div>
      <div class="field"><label>Uhrzeit (vorziehen/zurück)</label><input id="m-time" value="${b.start_time}"></div>
    </div>
    <div class="field"><label>Getriebe</label>
      <select id="m-gear">
        <option value="">– noch offen –</option>
        <option value="schalt" ${b.gearbox === 'schalt' ? 'selected' : ''}>Schalter</option>
        <option value="automatik" ${b.gearbox === 'automatik' ? 'selected' : ''}>Automatik</option>
      </select></div>
    <div class="field"><label>Kennzeichen (optional)</label><input id="m-plate" value="${esc(b.plate || '')}" placeholder="z.B. B-FS 1234"></div>
    <div class="field"><label>Fahrt-Art (für Sonderfahrten-Protokoll)</label>
      <select id="m-type">
        <option value="">Normal</option>
        <option value="ueberland" ${b.lesson_type === 'ueberland' ? 'selected' : ''}>🌄 Überland</option>
        <option value="autobahn" ${b.lesson_type === 'autobahn' ? 'selected' : ''}>🛣️ Autobahn</option>
        <option value="nacht" ${b.lesson_type === 'nacht' ? 'selected' : ''}>🌙 Nachtfahrt</option>
      </select></div>
    <div class="row">
      <div class="field"><label>Erschienen?</label>
        <select id="m-att">
          <option value="" ${b.attended == null ? 'selected' : ''}>– offen –</option>
          <option value="1" ${b.attended === 1 ? 'selected' : ''}>Ja, da gewesen</option>
          <option value="0" ${b.attended === 0 ? 'selected' : ''}>Nein, nicht erschienen</option>
        </select></div>
      <div class="field"><label>Verspätung (Min)</label><input id="m-late" type="number" value="${b.late_minutes || 0}" min="0" step="5"></div>
    </div>
    <div class="row">
      <div class="field"><label>Dauer (Min)</label><input id="m-dur" type="number" value="${b.duration_min}" min="0" step="5"></div>
      <div class="field"><label>Status</label>
        <select id="m-status">
          <option value="booked" ${b.status === 'booked' ? 'selected' : ''}>gebucht</option>
          <option value="done" ${b.status === 'done' ? 'selected' : ''}>abgeschlossen ✓</option>
        </select></div>
    </div>
    <div class="field"><label>📝 Rückmeldung an den Schüler <span class="muted">(sieht der Schüler – „das haben wir gemacht")</span></label>
      <textarea id="m-feedback" rows="3" placeholder="z.B. Heute Kreisverkehr & Vorfahrt geübt – nächstes Mal Einparken." style="resize:vertical">${esc(b.feedback || '')}</textarea></div>
    ${b.student_id ? `<label class="ck-line" style="justify-content:flex-start" id="m-sign-line"><input type="checkbox" id="m-sign" ${b.signed_at ? '' : 'checked'}> ✍️ Beim Abschließen Unterschrift vom Fahrschüler anfordern <span class="muted">(landet per Push im Postfach)</span></label>${b.signed_at ? '<div class="hint" style="margin:.1rem 0 .4rem">✓ Diese Stunde ist bereits unterschrieben.</div>' : ''}` : ''}
    ${b.student_id ? '<div id="m-recos" class="mk-recos"></div>' : ''}
    ${b.student_id ? `<details class="mk-curr" id="m-curr-wrap"><summary>📋 Was habt ihr heute gemacht? <span class="muted">(Ausbildungskarte Klasse B)</span></summary>
      <input id="m-curr-search" placeholder="🔎 suchen (z. B. Kreisverkehr)" autocomplete="off" style="margin:.5rem 0">
      <div id="m-curr-list" class="mk-curr-list"><span class="hint">Lädt…</span></div>
    </details>` : ''}
    ${b.student_id ? `<button class="adk-open" id="m-adk" type="button">📋 Ausbildungskarte abhaken (Vollbild)</button>` : ''}
    <div class="field"><label>Grund (bei Absage/Nichterscheinen, optional)</label><input id="m-reason" value="${esc(b.reason || '')}"></div>
    <div class="field"><label>Interne Notiz (nur für dich)</label><input id="m-note" value="${esc(b.note || '')}"></div>
    <div class="field"><label>Treffpunkt (für Live-Standort & Navigation)</label>
      <div class="inline"><input id="m-meet" value="${esc(b.meet_label || '')}" placeholder="z.B. vor der Schule" style="flex:1">
        <button class="sec sm" id="m-meet-here" type="button">📍 Standort</button></div>
      <div class="hint" id="m-meet-info" style="margin:.3rem 0 0">${b.meet_lat != null ? '✓ Koordinaten hinterlegt (ETA möglich)' : 'Ohne Koordinaten nur als Text.'}</div>
    </div>
    <div class="hint" id="m-hint"></div>
    <div class="actions">
      <button class="sec" onclick="window.__closeModal()">Abbrechen</button>
      <button id="m-save">Speichern</button>
    </div>`);
  let meetLat = b.meet_lat, meetLng = b.meet_lng;
  const adkBtn = $('#m-adk');
  if (adkBtn) adkBtn.onclick = () => { closeModal(); openTrainingCard(b.student_id, b.student_name || ''); };
  // „Was habt ihr heute gemacht?" – Ausbildungskarte pro Fahrstunde abhaken,
  // je Punkt mit Stand: 🔴 muss noch geübt · 🟡 geübt · 🟢 sitzt ganz gut.
  let currDone = {};            // Zeitstempel je Punkt (früher erledigt)
  let currAdk = { items: {} };  // Gesamt-Häufigkeit + letzter Stand je Punkt
  const renderCurr = () => {
    const list = $('#m-curr-list'); if (!list) return;
    list.innerHTML = CURRICULUM.map((sec) => `<div class="mk-sec"><div class="mk-sec-t">${esc(sec.title)}</div>${sec.items.map((it, i) => {
      const k = currKey(sec.key, i);
      const agg = currAdk.items[k];
      const prev = agg && agg.count
        ? `<em class="mk-prev">schon ${agg.count}×${agg.lastStatus ? ' · ' + currStatusMeta(agg.lastStatus).dot + ' ' + currStatusMeta(agg.lastStatus).tiny : ''}</em>`
        : (currDone[k] ? '<em class="mk-prev">schon geübt</em>' : '');
      return `<div class="mk-item2" data-txt="${esc((sec.title + ' ' + it).toLowerCase())}">
        <span class="mk-lbl">${esc(it)} ${prev}</span>
        <div class="mk-seg" data-cc="${k}">
          <button type="button" class="st-mehr" data-s="mehr" title="muss noch geübt werden">🔴</button>
          <button type="button" class="st-geuebt" data-s="geuebt" title="geübt">🟡</button>
          <button type="button" class="st-ok" data-s="ok" title="sitzt ganz gut">🟢</button>
        </div></div>`;
    }).join('')}</div>`).join('');
    list.querySelectorAll('.mk-seg').forEach((seg) => seg.querySelectorAll('button').forEach((btn) => btn.onclick = () => {
      const wasOn = btn.classList.contains('on');
      seg.querySelectorAll('button').forEach((b2) => b2.classList.remove('on'));
      if (!wasOn) btn.classList.add('on');
    }));
  };
  // Empfehlung fürs Wiederholen: zuletzt 🔴 oder lange nicht mehr geübt.
  const renderRecos = () => {
    const box = $('#m-recos'); if (!box) return;
    const items = currAdk.items || {};
    const red = (currAdk.needWork || []).slice();
    const now = Date.now(); const STALE = 21 * 864e5;
    const daysAgo = (d) => d ? Math.round((now - (Date.parse(d + 'T12:00:00') || now)) / 864e5) : null;
    const stale = Object.keys(items).filter((k) => !red.includes(k) && items[k].lastStatus !== 'ok' && items[k].lastDate && (now - (Date.parse(items[k].lastDate + 'T12:00:00') || now)) > STALE)
      .sort((a, z) => (items[a].lastDate || '').localeCompare(items[z].lastDate || ''));
    const recos = [...red.map((k) => ({ k, why: 'red' })), ...stale.map((k) => ({ k, why: 'stale' }))].slice(0, 8);
    if (!recos.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="mk-recos-t">🔁 Vorschlag fürs Wiederholen</div>
      <div class="mk-recos-list">${recos.map((r) => {
        const lbl = currLabel(r.k); if (!lbl) return '';
        const dz = daysAgo(items[r.k] && items[r.k].lastDate);
        return `<button type="button" class="mk-reco ${r.why}" data-reco="${r.k}">${r.why === 'red' ? '🔴' : '🕒'} ${esc(lbl)}${dz != null ? ` <span>· vor ${dz} T</span>` : ''}</button>`;
      }).join('')}</div>`;
    box.querySelectorAll('[data-reco]').forEach((btn) => btn.onclick = () => {
      const wrap = $('#m-curr-wrap'); if (wrap) wrap.open = true;
      const seg = document.querySelector(`#m-curr-list .mk-seg[data-cc="${btn.dataset.reco}"]`);
      const item = seg && seg.closest('.mk-item2');
      if (item) { item.style.display = ''; item.scrollIntoView({ block: 'center', behavior: 'smooth' }); item.classList.add('reco-flash'); setTimeout(() => item.classList.remove('reco-flash'), 1600); }
    });
  };
  if (b.student_id) {
    api('/api/students/' + b.student_id + '/training').then((r) => { currDone = r.training || {}; currAdk = r.adk || { items: {} }; renderCurr(); renderRecos(); })
      .catch(() => { const el = $('#m-curr-list'); if (el) el.innerHTML = '<span class="hint">Ausbildungskarte nicht ladbar.</span>'; });
    const cs = $('#m-curr-search');
    if (cs) cs.oninput = () => { const q = cs.value.trim().toLowerCase(); document.querySelectorAll('#m-curr-list .mk-item2').forEach((l) => { l.style.display = (!q || l.dataset.txt.includes(q)) ? '' : 'none'; }); };
  }
  $('#m-meet-here').onclick = async () => {
    try { const c = await getPosOnce(); meetLat = c.latitude; meetLng = c.longitude;
      $('#m-meet-info').innerHTML = `✓ Koordinaten übernommen (${meetLat.toFixed(4)}, ${meetLng.toFixed(4)})`; toast('Treffpunkt gesetzt', 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  };
  const grace = state.settings?.late_grace_min || 20;
  const baseDur = b.duration_min;
  const recalc = () => {
    const late = Number($('#m-late').value) || 0;
    const hint = $('#m-hint');
    if (late > grace) {
      const suggested = Math.max(0, baseDur - late);
      hint.innerHTML = `Mehr als ${grace} Min zu spät → die Zeit läuft ab dem vereinbarten Beginn. Vorschlag: <strong>${suggested} Min</strong> Fahrzeit. <button class="sec sm" id="m-apply-dur" type="button">übernehmen</button>`;
      const ab = $('#m-apply-dur'); if (ab) ab.onclick = () => { $('#m-dur').value = suggested; };
    } else { hint.textContent = ''; }
  };
  $('#m-late').oninput = recalc; recalc();
  $('#m-save').onclick = async () => {
    try {
      const att = $('#m-att').value;
      const body = { gearbox: $('#m-gear').value, plate: $('#m-plate').value, duration_min: Number($('#m-dur').value),
        status: $('#m-status').value, note: $('#m-note').value, reason: $('#m-reason').value,
        feedback: $('#m-feedback').value,
        late_minutes: Number($('#m-late').value) || 0, attended: att === '' ? null : (att === '1'),
        lesson_type: $('#m-type').value || 'normal',
        meet_label: $('#m-meet').value, meet_lat: meetLat ?? '', meet_lng: meetLng ?? '' };
      if ($('#m-date').value !== b.date) body.date = $('#m-date').value;
      if ($('#m-time').value !== b.start_time) body.start_time = $('#m-time').value;
      const sign = $('#m-sign');
      if (sign && sign.checked && $('#m-status').value === 'done' && att !== '0') body.request_sign = true;
      // heute behandelte Ausbildungs-Themen mit Stand mitschicken ({k, s})
      const curr = [...document.querySelectorAll('#m-curr-list .mk-seg')].map((seg) => {
        const on = seg.querySelector('button.on');
        return on ? { k: seg.dataset.cc, s: on.dataset.s } : null;
      }).filter(Boolean);
      if (curr.length) body.curriculum = curr;
      await api('/api/bookings/' + id, { method: 'PATCH', body });
      closeModal(); toast(body.request_sign ? 'Abgeschlossen ✓ – Unterschrift angefordert' : 'Gespeichert ✓', 'ok'); refreshEventBadge(); drawInstrTab();
    } catch (e) { toast(e.message, 'err'); }
  };
}
window.__closeModal = closeModal;
window.__openMarkModal = openMarkModal;

// Fahrstunde NACHTRAGEN (Fahrlehrer): gefahrene Stunde mit echtem Datum+Uhrzeit eintragen
function openLogLessonModal(sid, name) {
  const s = state.settings || {};
  modal(`<h3>➕ Fahrstunde nachtragen</h3>
    <p class="hint">Trage eine bereits gefahrene Stunde für <strong>${esc(name)}</strong> ein – mit dem <strong>echten Fahrdatum &amp; Uhrzeit</strong>. Das Eintragedatum (heute) wird automatisch zusätzlich vermerkt, damit klar ist: gefahren am X, eingetragen am Y.</p>
    <div class="row">
      <div class="field"><label>Fahrdatum</label><input type="date" id="lg-date" value="${todayStr()}"></div>
      <div class="field"><label>Uhrzeit (Beginn)</label><input id="lg-time" value="" placeholder="z.B. 20:00"></div>
    </div>
    <div class="row">
      <div class="field"><label>Dauer (Min)</label><input type="number" id="lg-dur" value="${s.lesson_min || 80}" min="5" step="5"></div>
      <div class="field"><label>Verspätung (Min)</label><input type="number" id="lg-late" value="0" min="0" step="5"></div>
    </div>
    <div class="field"><label>Fahrt-Art</label>
      <select id="lg-type"><option value="">Normal</option><option value="ueberland">🌄 Überland</option><option value="autobahn">🛣️ Autobahn</option><option value="nacht">🌙 Nachtfahrt</option></select></div>
    <label class="ck-line"><input type="checkbox" id="lg-att" checked> Fahrschüler ist erschienen (gefahren)</label>
    <div class="field"><label>Vermerk <span class="muted">(sieht der Fahrschüler – z.B. Verlauf/Besonderes)</span></label>
      <textarea id="lg-note" rows="3" placeholder="z.B. 20 Min zu spät gekommen, restliche 60 Min gefahren – Kreisverkehr & Vorfahrt geübt." style="resize:vertical"></textarea></div>
    <details class="lg-inv"><summary>🧾 Abweichendes Rechnungsdatum (optional)</summary>
      <p class="hint">Falls diese Stunde auf der Rechnung an einem anderen Tag/Uhrzeit erscheint (z.B. wegen der 495-Min-Tagesgrenze deines Abrechnungsprogramms). Der Fahrschüler sieht dann im Protokoll: gefahren am … · auf der Rechnung am …</p>
      <div class="row">
        <div class="field"><label>Rechnungsdatum</label><input type="date" id="lg-invdate"></div>
        <div class="field"><label>Rechnungsuhrzeit</label><input id="lg-invtime" placeholder="z.B. 09:00"></div>
      </div>
    </details>
    <div class="actions"><button class="sec" onclick="window.__closeModal()">Abbrechen</button><button id="lg-save">Nachtragen</button></div>`);
  $('#lg-save').onclick = async () => {
    const date = $('#lg-date').value, time = $('#lg-time').value.trim();
    if (!date || !time) { toast('Bitte Fahrdatum und Uhrzeit angeben', 'err'); return; }
    try {
      await api('/api/instructor/log-lesson', { method: 'POST', body: {
        student_id: sid, date, start_time: time,
        duration_min: Number($('#lg-dur').value), late_minutes: Number($('#lg-late').value) || 0,
        lesson_type: $('#lg-type').value || 'normal', attended: $('#lg-att').checked,
        feedback: $('#lg-note').value,
        invoice_date: $('#lg-invdate').value || '', invoice_time: $('#lg-invtime').value.trim() } });
      closeModal(); toast('Fahrstunde nachgetragen ✓', 'ok');
      try { refreshEventBadge(); } catch {}
      if (typeof tabSchueler === 'function' && $('#itab')) { /* Liste ggf. aktuell halten */ }
    } catch (e) { toast(e.message, 'err'); }
  };
}

// Rechnungsdaten verwalten (Fahrlehrer): pro gefahrener Stunde ein abweichendes
// Rechnungsdatum/-zeit setzen. Zeigt die Minuten je Rechnungstag (Warnung > 495).
function openInvoiceModal(sid, name) {
  modal(`<h3>🧾 Rechnungsdaten – ${esc(name)}</h3>
    <p class="hint">Eine Stunde wird an ihrem <strong>Fahrdatum</strong> gefahren, kann aber auf der <strong>Rechnung</strong> an einem anderen Tag/Uhrzeit erscheinen (z.&nbsp;B. wegen der 495-Min-Tagesgrenze deines Abrechnungsprogramms). Trag hier das Rechnungsdatum ein – der Fahrschüler sieht im Protokoll <em>beides</em>.</p>
    <div id="inv-body"><p class="hint">Lädt…</p></div>
    <div class="actions"><button onclick="window.__closeModal()">Fertig</button></div>`, 'wide');
  const render = async () => {
    const box = $('#inv-body'); if (!box) return;
    let data; try { data = await api('/api/students/' + sid + '/lessons'); } catch (e) { box.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
    const lessons = (data.lessons || []).filter((l) => l.attended !== 0)
      .sort((a, z) => (a.date + a.start_time).localeCompare(z.date + z.start_time));
    // Minuten je Rechnungstag (Rechnungsdatum, sonst Fahrdatum)
    const byDay = {};
    lessons.forEach((l) => { const d = l.invoice_date || l.date; byDay[d] = (byDay[d] || 0) + (l.duration_min || 0); });
    const dayRows = Object.keys(byDay).sort().map((d) => {
      const m = byDay[d];
      return `<div class="inv-day"><span>${fmtDT(d)}</span><span>${m} Min (${(m / 60).toFixed(1).replace('.', ',')} h)</span></div>`;
    }).join('');
    const rows = lessons.map((l) => {
      const art = (l.lesson_type && l.lesson_type !== 'normal') ? ' · ' + lessonTypeLabel(l.lesson_type) : '';
      return `<div class="inv-row" data-id="${l.id}">
        <div class="inv-drove">🚗 <strong>${fmtDT(l.date, l.start_time)}</strong> · ${l.duration_min} Min${art}${l.invoice_date ? ` <span class="pill" style="background:var(--good-bg);color:var(--good)">🧾 ${fmtDT(l.invoice_date)}${l.invoice_time ? ' ' + l.invoice_time : ''}</span>` : ''}</div>
        <div class="inv-fields">
          <input type="date" class="inv-d" value="${l.invoice_date || ''}" aria-label="Rechnungsdatum">
          <input class="inv-t" placeholder="HH:MM" value="${l.invoice_time || ''}" aria-label="Rechnungsuhrzeit">
          <button class="sm inv-save">Speichern</button>
          ${l.invoice_date ? '<button class="ghost sm inv-clr" title="Zurücksetzen">✕</button>' : ''}
        </div>
      </div>`;
    }).join('');
    box.innerHTML = `<div class="inv-days"><div class="inv-days-h">Minuten je Rechnungstag</div>${dayRows || '<span class="hint">–</span>'}</div>
      <div class="inv-list">${rows || '<p class="hint">Noch keine gefahrenen Stunden zum Abrechnen.</p>'}</div>`;
    box.querySelectorAll('.inv-row').forEach((row) => {
      const id = row.dataset.id;
      row.querySelector('.inv-save').onclick = async () => {
        try {
          await api('/api/bookings/' + id, { method: 'PATCH', body: { invoice_date: row.querySelector('.inv-d').value, invoice_time: row.querySelector('.inv-t').value.trim() } });
          toast('Gespeichert ✓', 'ok'); render();
        } catch (e) { toast(e.message, 'err'); }
      };
      const clr = row.querySelector('.inv-clr');
      if (clr) clr.onclick = async () => {
        try { await api('/api/bookings/' + id, { method: 'PATCH', body: { invoice_date: '', invoice_time: '' } }); toast('Zurückgesetzt', 'ok'); render(); }
        catch (e) { toast(e.message, 'err'); }
      };
    });
  };
  render();
}

async function instrCancel(id) {
  const reason = prompt('Grund für die Absage (optional, z.B. Krankheit) – wird dem Schüler mitgeteilt:');
  if (reason === null) return; // abgebrochen
  const q = reason.trim() ? '?reason=' + encodeURIComponent(reason.trim()) : '';
  try { await api('/api/bookings/' + id + q, { method: 'DELETE' }); toast('Abgesagt · Schüler informiert', 'ok'); refreshEventBadge(); drawInstrTab(); }
  catch (e) { toast(e.message, 'err'); }
}
async function delBlock(id) {
  if (!confirm('Eintrag löschen?')) return;
  try { await api('/api/blocks/' + id, { method: 'DELETE' }); toast('Gelöscht', 'ok'); drawInstrTab(); }
  catch (e) { toast(e.message, 'err'); }
}

// ---- Tab: Kalender (Tag & eigener Termin) ----
async function tabKalender() {
  const box = $('#itab');
  const mode = state.calMode || 'tag';
  box.innerHTML = `<div class="card">
    <div class="dateline">
      <div class="viewtoggle">
        <button data-mode="tag" class="${mode === 'tag' ? 'active' : ''}">Tag</button>
        <button data-mode="woche" class="${mode === 'woche' ? 'active' : ''}">Woche</button>
        <button data-mode="monat" class="${mode === 'monat' ? 'active' : ''}">Monat</button>
      </div>
      <button class="sec sm" id="k-prev">‹</button>
      <span class="day" id="k-label"></span>
      <button class="sec sm" id="k-next">›</button>
      <input type="date" id="k-date" style="max-width:160px">
      ${mode === 'tag' ? '<button class="ghost sm" id="k-block" style="margin-left:auto"></button>' : ''}
      <button class="ghost sm" id="k-late"${mode === 'tag' ? '' : ' style="margin-left:auto"'}>⏱️ Ich komme später</button>
      <button class="ghost sm" id="k-gap">🧩 Lücken schließen</button>
      <button class="ghost sm" id="k-bulk">📋 Sammel-Eintragen</button>
      <button class="sm" id="k-add">+ Eigener Termin</button>
    </div>
    <div id="k-list"></div>
  </div>`;
  box.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => { state.calMode = b.dataset.mode; tabKalender(); });
  $('#k-date').value = state.date;
  const shift = (dir) => {
    if (mode === 'monat') state.date = addMonths(state.date, dir);
    else state.date = addDays(state.date, dir * (mode === 'woche' ? 7 : 1));
    loadK();
  };
  $('#k-prev').onclick = () => shift(-1);
  $('#k-next').onclick = () => shift(1);
  $('#k-date').onchange = (e) => { state.date = e.target.value; loadK(); };
  $('#k-add').onclick = () => openAddBooking();
  $('#k-gap').onclick = () => openGapModal();
  $('#k-bulk').onclick = () => openBulkBooking();
  $('#k-late').onclick = () => openLateModal();
  loadK();
}

// ---- Sammel-Eintragen: bestehende Termine schnell übernehmen ----
async function openBulkBooking() {
  let students = [];
  try { students = (await api('/api/students')).students; } catch {}
  const nameList = students.map((s) => esc(s.name)).join(' · ');
  modal(`<h3>📋 Termine sammeln eintragen</h3>
    <p class="hint" style="margin-bottom:.5rem">Trag deine schon vereinbarten Fahrstunden hier untereinander ein – eine pro Zeile. Ich prüfe alles und zeige dir erst eine Vorschau, bevor etwas gespeichert wird.</p>
    <div class="bulk-help">
      <div class="bh-row"><span class="bh-k">Aufbau</span><span><b>Name, Datum, Uhrzeit, Dauer</b> <span class="muted">(Dauer optional → ${state.settings?.lesson_min || 80} Min)</span></span></div>
      <div class="bh-row"><span class="bh-k">Beispiel</span><code>Maria, 22.7., 14:00, 80</code></div>
      <div class="bh-row"><span class="bh-k">Geht auch</span><span class="muted">22.07.2026 · 14 Uhr ohne Jahr (nimmt das nächste Vorkommen)</span></div>
    </div>
    ${students.length ? `<details class="bulk-names"><summary>Deine ${students.length} Fahrschüler anzeigen</summary><div class="bn-list">${nameList}</div></details>` : '<p class="hint">Noch keine Fahrschüler angelegt.</p>'}
    <div class="field"><label>Termine (eine pro Zeile)</label>
      <textarea id="bk-text" rows="7" placeholder="Maria, 22.7., 14:00, 80&#10;Jason, 22.7., 16:00&#10;Lea, 24.7., 12:00, 120"></textarea></div>
    <label class="bulk-past"><input type="checkbox" id="bk-past" checked> Vergangene Termine als <strong>„gefahren"</strong> übernehmen <span class="muted">(für die Historie / gefahrene Stunden)</span></label>
    <div id="bk-preview"></div>
    <div class="actions" style="justify-content:space-between">
      <button class="sec" onclick="window.__closeModal()">Abbrechen</button>
      <div class="inline" style="gap:.5rem">
        <button class="sec" id="bk-check">Vorschau prüfen</button>
        <button id="bk-commit" disabled>Eintragen</button>
      </div>
    </div>`, 'wide');
  const preview = $('#bk-preview');
  const commitBtn = $('#bk-commit');
  const runCheck = async (commit) => {
    const text = $('#bk-text').value;
    if (!text.trim()) { toast('Bitte erst Termine eintragen', 'err'); return; }
    const pastAsDone = $('#bk-past') ? $('#bk-past').checked : true;
    try {
      const r = await api('/api/instructor/bookings/bulk', { method: 'POST', body: { text, commit, pastAsDone } });
      if (commit && r.committed) {
        closeModal();
        const extra = r.doneCount ? ` (${r.futureCount} neu · ${r.doneCount} als gefahren)` : '';
        toast(`${r.created} Termin${r.created === 1 ? '' : 'e'} eingetragen ✓${extra}`, 'ok');
        if (state.instrTab === 'kalender') loadK(); else drawInstrTab();
        return;
      }
      renderBulkPreview(preview, r);
      commitBtn.disabled = r.okCount === 0;
      commitBtn.textContent = r.okCount ? `${r.okCount} Termin${r.okCount === 1 ? '' : 'e'} eintragen` : 'Eintragen';
    } catch (e) { toast(e.message, 'err'); }
  };
  $('#bk-check').onclick = () => runCheck(false);
  commitBtn.onclick = () => runCheck(true);
}
function renderBulkPreview(el, r) {
  const icon = (row) => row.status !== 'ok' ? '⚠️' : row.done ? '🅿️' : '✅';
  const line = (row) => {
    const head = row.status === 'ok'
      ? `<b>${esc(row.student)}</b> · ${WD[isoDow(row.date) - 1]} ${fmtShort(row.date)} · ${row.time} <span class="muted">(${row.dur} Min)</span>${row.done ? ' <span class="pill" style="background:var(--good-bg);color:var(--good)">gefahren</span>' : ''}`
      : `<span class="muted">${esc(row.input)}</span>`;
    return `<div class="bulk-row ${row.status}">
      <span class="br-ic">${icon(row)}</span>
      <div><div>${head}</div><div class="br-msg ${row.status}">${esc(row.msg)}${row.status !== 'ok' && row.student ? ' · erkannt: ' + esc(row.student) : ''}</div></div>
    </div>`;
  };
  el.innerHTML = `<div class="bulk-summary">
      ${r.futureCount ? `<span class="pill" style="background:var(--booked);color:#8fb4ff">🗓️ ${r.futureCount} neu</span>` : ''}
      ${r.doneCount ? `<span class="pill" style="background:var(--good-bg);color:var(--good)">🅿️ ${r.doneCount} gefahren</span>` : ''}
      ${!r.futureCount && !r.doneCount ? `<span class="pill">0 bereit</span>` : ''}
      ${r.errCount ? `<span class="pill" style="background:var(--bad-bg);color:var(--bad)">⚠️ ${r.errCount} zu prüfen</span>` : ''}
    </div>
    <div class="bulk-list">${r.rows.map(line).join('')}</div>
    ${r.errCount ? '<p class="hint">Zeilen mit ⚠️ werden übersprungen. Korrigier sie oben und prüfe erneut – oder trag den Rest schon mal ein.</p>' : ''}`;
}
async function loadK() {
  const mode = state.calMode || 'tag';
  $('#k-date').value = state.date;
  if (mode === 'woche') {
    const mon = mondayOf(state.date);
    const sat = addDays(mon, 5);
    $('#k-label').textContent = `Woche ${fmtShort(mon)}–${fmtShort(sat)}`;
    try {
      const ov = await api(`/api/instructor/overview?from=${mon}&to=${sat}`);
      window.__instrBookings = ov.bookings;
      renderWeek($('#k-list'), mon, ov);
    } catch (e) { toast(e.message, 'err'); }
    return;
  }
  if (mode === 'monat') {
    const first = firstOfMonth(state.date);
    const gridStart = mondayOf(first);
    const gridEnd = addDays(gridStart, 41); // 6 Wochen
    $('#k-label').textContent = `${MON_LONG[parseD(first).getMonth()]} ${parseD(first).getFullYear()}`;
    try {
      const ov = await api(`/api/instructor/overview?from=${gridStart}&to=${gridEnd}`);
      window.__instrBookings = ov.bookings;
      renderMonth($('#k-list'), first, gridStart, ov);
    } catch (e) { toast(e.message, 'err'); }
    return;
  }
  $('#k-label').textContent = fmtDay(state.date);
  try {
    const ov = await api('/api/instructor/overview?from=' + state.date + '&to=' + state.date);
    window.__instrBookings = ov.bookings;
    renderInstrDay($('#k-list'), state.date, ov.bookings, ov.blocks);
    const blocked = (ov.overrides || []).some((o) => o.date === state.date && o.closed);
    if (blocked) $('#k-list').insertAdjacentHTML('afterbegin',
      '<div class="day-blocked">🚫 <strong>Tag komplett gesperrt</strong> – Fahrschüler können an diesem Tag nichts buchen.</div>');
    setDayBlockBtn(blocked);
  } catch (e) { toast(e.message, 'err'); }
}
// Ein-Tipp-Knopf: ganzen Tag sperren / wieder freigeben
function setDayBlockBtn(blocked) {
  const btn = $('#k-block');
  if (!btn) return;
  btn.textContent = blocked ? '🔓 Tag freigeben' : '🚫 Tag sperren';
  btn.classList.toggle('danger', !blocked);
  btn.onclick = async () => {
    try {
      if (blocked) {
        await api('/api/day-overrides/' + state.date, { method: 'DELETE' });
        toast('Tag wieder freigegeben ✓', 'ok');
      } else {
        const send = (force) => api('/api/day-overrides', { method: 'POST', body: force ? { type: 'free', date: state.date, force: true } : { type: 'free', date: state.date } });
        try { await send(false); }
        catch (e) {
          if (/schon .* Termin/.test(e.message) && confirm(e.message + '\n\nTrotzdem sperren? Denk daran, die Schüler an dem Tag zu informieren.')) await send(true);
          else throw e;
        }
        toast('Tag komplett gesperrt 🚫', 'ok');
      }
      loadK();
    } catch (e) { toast(e.message, 'err'); }
  };
}

// Farbe je Fahrschüler (stabil über die id)
const WK_COLORS = ['#4d8dff', '#35c07d', '#b079f0', '#e6934d', '#e06b9a', '#3fb6c4', '#c9a13b', '#7c8cf0'];
function studentColor(id) { return id ? WK_COLORS[id % WK_COLORS.length] : '#5a6b80'; }
// Standardfarben je Fahrt-Art (Sonderfahrten + normale Stunde)
const TYPE_COLORS = { ueberland: '#2f9e57', autobahn: '#2f6fd0', nacht: '#6d4bb0', normal: '#5b6b7d' };
const TYPE_ICON = { ueberland: '🌄', autobahn: '🛣️', nacht: '🌙', normal: '🚗' };
const TYPE_LABEL = { ueberland: 'Überland', autobahn: 'Autobahn', nacht: 'Nachtfahrt', normal: 'Normale Stunde' };
// Einheitliches, farbiges Abzeichen für die Fahrt-Art
function typeBadge(type) {
  const t = TYPE_LABEL[type] ? type : 'normal';
  const c = TYPE_COLORS[t];
  return `<span class="type-badge" style="background:${c}22;color:${c};border-color:${c}66">${TYPE_ICON[t]} ${TYPE_LABEL[t]}</span>`;
}

function renderWeek(el, monday, ov) {
  const s = state.settings;
  const toM = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const days = Array.from({ length: 6 }, (_, i) => addDays(monday, i));
  // Zeitbereich dynamisch: Standard-Arbeitszeit, erweitert um alle Termine/Blöcke
  let lo = toM(s.start_time), hi = toM(s.last_start) + s.lesson_min;
  for (const b of ov.bookings) { lo = Math.min(lo, toM(b.start_time)); hi = Math.max(hi, toM(b.start_time) + b.duration_min); }
  for (const bl of ov.blocks) { lo = Math.min(lo, toM(bl.start_time)); hi = Math.max(hi, toM(bl.end_time)); }
  lo = Math.floor(lo / 60) * 60; hi = Math.ceil(hi / 60) * 60;
  const total = Math.max(60, hi - lo);
  const HPH = 42; // px pro Stunde
  const bodyH = total / 60 * HPH;
  const y = (min) => (min - lo) / total * bodyH;
  const ovByDate = {}; for (const o of ov.overrides) ovByDate[o.date] = o;
  const today = todayStr();

  const hourLabels = [];
  for (let t = lo; t < hi; t += 60) hourLabels.push(`<div class="wk-hour"><span>${String(t / 60).padStart(2, '0')}:00</span></div>`);
  const hourLines = hourLabels.map(() => '<div class="wk-hour"></div>').join('');

  const dayCol = (d) => {
    const isToday = d === today;
    const ovd = ovByDate[d];
    let inner = '';
    if (ovd && ovd.closed) {
      inner += `<div class="wk-block closed">${ovd.type === 'vacation' ? '🌴 Urlaub' : '🏖️ frei'}</div>`;
    }
    for (const bl of ov.blocks.filter((x) => x.date === d)) {
      const top = y(toM(bl.start_time)), h = Math.max(16, y(toM(bl.end_time)) - top);
      inner += `<div class="wk-block blk" style="top:${top}px;height:${h}px" title="${esc(bl.title)}">
        <div class="t">${bl.start_time}</div>${esc(bl.title)}</div>`;
    }
    for (const b of ov.bookings.filter((x) => x.date === d)) {
      const top = y(toM(b.start_time)), h = Math.max(20, b.duration_min / total * bodyH);
      const col = b.status === 'offered' ? '#e6b23a' : (TYPE_COLORS[b.lesson_type] || studentColor(b.student_id));
      const who = b.student_name || b.title || 'Termin';
      const tIco = TYPE_ICON[b.lesson_type] || '';
      const badge = b.status === 'done' ? ' ✓' : b.status === 'offered' ? ' 🔄' : '';
      inner += `<div class="wk-block" data-wk="${b.id}" style="top:${top}px;height:${h}px;background:${col}"
        title="${b.start_time} ${esc(who)}"><div class="t">${b.start_time}${badge} ${tIco}</div>${esc(who)}</div>`;
    }
    return `<div class="wk-body ${isToday ? 'today' : ''}" style="height:${bodyH}px">${hourLines}${inner}</div>`;
  };

  el.innerHTML = `<div class="weekwrap"><div class="weekgrid">
    <div class="wk-corner"></div>
    ${days.map((d) => {
      const ovd = ovByDate[d];
      const tag = ovd ? (ovd.type === 'vacation' ? '🌴 Urlaub' : ovd.closed ? '🏖️ frei' : `✂️ kurz bis ${ovd.last_start || ''}`) : '';
      return `<div class="wk-head ${d === today ? 'today' : ''}">${WD[isoDow(d) - 1]}<span class="sub">${fmtShort(d)}</span>${tag ? `<span class="daytag">${tag}</span>` : ''}</div>`;
    }).join('')}
    <div class="wk-times">${hourLabels.join('')}</div>
    ${days.map(dayCol).join('')}
  </div></div>
  <div class="hint" style="margin-top:.7rem">Tipp: auf einen Termin tippen zum Bearbeiten/Abschließen. Farbe = Fahrschüler (bzw. Fahrt-Art), 🔄 = wird abgegeben, ✓ = gefahren.</div>
  <div class="legend"><span class="muted">Fahrt-Arten:</span>
    <span class="legend-chip"><span class="sw" style="background:${TYPE_COLORS.ueberland}"></span>🌄 Überland</span>
    <span class="legend-chip"><span class="sw" style="background:${TYPE_COLORS.autobahn}"></span>🛣️ Autobahn</span>
    <span class="legend-chip"><span class="sw" style="background:${TYPE_COLORS.nacht}"></span>🌙 Nachtfahrt</span>
    <span class="legend-chip"><span class="sw" style="background:${TYPE_COLORS.normal}"></span>🚗 Normale Stunde</span>
  </div>`;
  el.querySelectorAll('[data-wk]').forEach((b) => b.onclick = () => openMarkModal(b.dataset.wk));
}

// ---- Monatsansicht ----
function renderMonth(el, firstDay, gridStart, ov) {
  const monthIdx = parseD(firstDay).getMonth();
  const today = todayStr();
  const workdays = (state.settings?.workdays || '1,2,3,4,5,6').split(',').map(Number);
  // Termine/Bloecke/Overrides nach Datum sammeln
  const byDate = {};
  for (const b of ov.bookings) (byDate[b.date] ||= { books: [], blocks: [] }).books.push(b);
  for (const bl of ov.blocks) (byDate[bl.date] ||= { books: [], blocks: [] }).blocks.push(bl);
  const ovByDate = {}; for (const o of ov.overrides) ovByDate[o.date] = o;

  const heads = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => `<div class="m-head">${d}</div>`).join('');
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    const inMonth = parseD(d).getMonth() === monthIdx;
    const info = byDate[d] || { books: [], blocks: [] };
    const ovd = ovByDate[d];
    const dn = parseD(d).getDate();
    const isWorkday = workdays.includes(isoDow(d)) && !(ovd && ovd.closed);
    const cnt = info.books.length;
    const dots = info.books.slice(0, 8).map((b) => {
      const c = b.status === 'offered' ? '#e6b23a' : (TYPE_COLORS[b.lesson_type] || studentColor(b.student_id));
      return `<span class="m-dot" style="background:${c}" title="${b.start_time} ${esc(b.student_name || b.title || '')}"></span>`;
    }).join('');
    let tag = '';
    if (ovd && ovd.type === 'vacation') tag = '🌴 Urlaub';
    else if (ovd && ovd.closed) tag = '🏖️ frei';
    else if (ovd && ovd.last_start) tag = '✂️ kurz';
    else if (info.blocks.some((b) => b.type === 'theorie')) tag = '📚 Theorie';
    cells += `<div class="m-cell ${inMonth ? '' : 'out'} ${d === today ? 'today' : ''} ${isWorkday ? '' : 'off'}" data-day="${d}">
      <div class="m-day"><span>${dn}</span>${cnt ? `<span class="cnt">${cnt}</span>` : ''}</div>
      ${tag ? `<div class="m-tag">${tag}</div>` : ''}
      <div class="m-dots">${dots}</div>
    </div>`;
  }
  el.innerHTML = `<div class="monthgrid">${heads}${cells}</div>
    <p class="hint" style="margin-top:.7rem">Tipp: auf einen Tag tippen öffnet die Tagesansicht. Zahl = Anzahl Fahrstunden, Punkte = Fahrschüler/Fahrt-Art.</p>`;
  el.querySelectorAll('[data-day]').forEach((c) => c.onclick = () => { state.date = c.dataset.day; state.calMode = 'tag'; tabKalender(); });
}

function openLateModal() {
  modal(`<h3>Ich verspäte mich</h3>
    <p class="hint">Alle noch nicht begonnenen Termine an diesem Tag (${fmtShort(state.date)}) rücken um die angegebene Zeit nach hinten. Die betroffenen Fahrschüler werden automatisch benachrichtigt.</p>
    <div class="field"><label>Verspätung in Minuten</label><input id="late-min" type="number" value="10" min="1" step="5"></div>
    <div class="actions">
      <button class="sec" onclick="window.__closeModal()">Abbrechen</button>
      <button id="late-go">Termine nachrücken</button>
    </div>`);
  $('#late-go').onclick = async () => {
    try {
      const r = await api('/api/instructor/delay-today', { method: 'POST', body: { date: state.date, minutes: Number($('#late-min').value) } });
      closeModal(); toast(`${r.moved} Termin(e) um ${r.minutes} Min verschoben ✓`, 'ok'); loadK();
    } catch (e) { toast(e.message, 'err'); }
  };
}

async function openGapModal() {
  let plan;
  try { plan = await api('/api/instructor/gap-proposal?date=' + state.date); }
  catch (e) { toast(e.message, 'err'); return; }
  const changes = plan.moves.filter((m) => m.from !== m.to);
  if (!plan.hasGap) {
    modal(`<h3>Lücken schließen</h3>
      <p class="hint">Für ${fmtDay(state.date)} gibt es keine Lücke – die Fahrstunden liegen bereits lückenlos hintereinander. 👍</p>
      <div class="actions"><button class="sec" onclick="window.__closeModal()">Schließen</button></div>`);
    return;
  }
  modal(`<h3>Lücken schließen – Vorschlag</h3>
    <p class="hint">Damit der Tag lückenlos ist, würden diese Fahrstunden nach vorne rücken. Die betroffenen Fahrschüler werden automatisch benachrichtigt.</p>
    <div class="blist">${changes.map((m) => `<div class="bitem warm">
      <div><div class="when">${esc(m.student_name || 'Termin')} <span class="muted" style="font-weight:400">(${m.duration} Min)</span></div>
      <div class="meta">${m.from} Uhr &nbsp;→&nbsp; <strong style="color:var(--good)">${m.to} Uhr</strong></div></div>
    </div>`).join('')}</div>
    <div class="actions">
      <button class="sec" onclick="window.__closeModal()">Abbrechen</button>
      <button id="gap-apply">${changes.length} Verschiebung${changes.length > 1 ? 'en' : ''} anwenden</button>
    </div>`);
  $('#gap-apply').onclick = async () => {
    try {
      const r = await api('/api/instructor/apply-shift', { method: 'POST', body: { date: state.date } });
      closeModal(); toast(`${r.moved} Termin(e) verschoben ✓`, 'ok'); loadK();
    } catch (e) { toast(e.message, 'err'); }
  };
}

async function openAddBooking() {
  let students = [];
  try { students = (await api('/api/students')).students; } catch {}
  const s = state.settings;
  modal(`<h3>Eigenen Termin anlegen</h3>
    <p class="hint">Frei buchen – für einen Fahrschüler oder als Sondertermin (z.B. Prüfung).</p>
    <div class="field"><label>Datum</label><input type="date" id="a-date" value="${state.date}"></div>
    <div class="row">
      <div class="field"><label>Uhrzeit</label><input id="a-time" value="${s.start_time || '12:00'}" placeholder="HH:MM"></div>
      <div class="field"><label>Dauer (Min)</label><input id="a-dur" type="number" value="${s.lesson_min}" step="5" min="10"></div>
    </div>
    <div class="field"><label>Fahrschüler <span class="muted" style="font-weight:400">(optional)</span></label>
      ${studentPicker('a-student', students, { placeholder: '🔍 Namen tippen …' })}</div>
    <div class="field" style="margin-bottom:0"><label>Titel <span class="muted" style="font-weight:400">(wenn kein Fahrschüler)</span></label><input id="a-title" placeholder="z.B. Prüfung, Sonderfahrt"></div>
    <div class="actions">
      <button class="sec" onclick="window.__closeModal()">Abbrechen</button>
      <button id="a-save">Anlegen</button>
    </div>`);
  $('#a-save').onclick = async () => {
    try {
      await api('/api/bookings', { method: 'POST', body: {
        date: $('#a-date').value, start_time: $('#a-time').value, duration_min: Number($('#a-dur').value),
        student_id: resolveStudentId($('#a-student'), students) || null, title: $('#a-title').value } });
      closeModal(); toast('Termin angelegt ✓', 'ok');
      state.date = $('#a-date').value; if (state.instrTab === 'kalender') loadK(); else drawInstrTab();
    } catch (e) { toast(e.message, 'err'); }
  };
}

// ---- Tab: Codes ----
async function tabCodes() {
  const box = $('#itab');
  box.innerHTML = `<div class="card">
    <h2>Zugangscodes <span class="sub">für neue Fahrschüler</span></h2>
    <p class="hint">Erzeuge einen Code und gib ihn an deinen Fahrschüler weiter. Damit legt er einmalig sein Konto an – danach ist der Code verbraucht.</p>
    <div class="inline" style="margin-bottom:1rem">
      <input id="c-note" placeholder="Notiz, z.B. Name des Schülers" style="max-width:260px">
      <button id="c-gen">+ Code erzeugen</button>
      <button class="ghost" id="c-test" style="margin-left:auto">🧪 Testschüler anlegen</button>
    </div>
    <p class="hint" style="margin-top:-.5rem">Mit „Testschüler" legst du sofort ein fertiges Demo-Konto an – zum Ausprobieren der Schüler-Ansicht (z. B. in einem zweiten/privaten Browserfenster).</p>
    <div id="c-list"></div>
  </div>`;
  $('#c-gen').onclick = async () => {
    try { const r = await api('/api/codes', { method: 'POST', body: { note: $('#c-note').value } });
      $('#c-note').value = ''; toast('Code ' + r.code + ' erstellt', 'ok'); loadCodes(); }
    catch (e) { toast(e.message, 'err'); }
  };
  $('#c-test').onclick = async () => {
    try {
      const r = await api('/api/instructor/test-student', { method: 'POST' });
      const share = `${r.name} – Login zum Testen:\nLogin-Name: ${r.username}\nPasswort: ${r.password}`;
      modal(`<h3>🧪 Testschüler angelegt</h3>
        <p class="hint">So kannst du die Schüler-Ansicht ausprobieren: öffne ein <strong>zweites (oder privates) Browserfenster</strong> auf dieselbe Adresse und melde dich mit diesen Daten an.</p>
        <pre style="background:#0f151d;border:1px solid var(--line);border-radius:8px;padding:.7rem;white-space:pre-wrap;font-size:.9rem">${esc(share)}</pre>
        <div class="actions"><button class="sec" id="ts-copy">📋 Kopieren</button><button onclick="window.__closeModal()">Fertig</button></div>`);
      $('#ts-copy').onclick = () => { navigator.clipboard?.writeText(share); toast('Kopiert', 'ok'); };
      toast('Testschüler ' + r.username + ' angelegt', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  };
  loadCodes();
}
async function loadCodes() {
  try {
    const { codes } = await api('/api/codes');
    $('#c-list').innerHTML = codes.length ? `<table>
      <tr><th>Code</th><th>Status</th><th>Notiz / Schüler</th><th></th></tr>
      ${codes.map((c) => `<tr>
        <td><span class="codechip">${c.code}</span></td>
        <td>${c.used ? '<span class="badge done">verwendet</span>' : '<span class="badge booked">offen</span>'}</td>
        <td>${esc(c.student_name || c.note || '–')}</td>
        <td>${c.used ? '' : `<button class="ghost sm" data-copy="${c.code}">Kopieren</button> <button class="ghost sm" data-del="${c.code}">Löschen</button>`}</td>
      </tr>`).join('')}
    </table>` : '<p class="muted">Noch keine Codes erstellt.</p>';
    $('#c-list').querySelectorAll('[data-copy]').forEach((b) => b.onclick = () => {
      navigator.clipboard?.writeText(b.dataset.copy); toast('Code kopiert: ' + b.dataset.copy, 'ok');
    });
    $('#c-list').querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      try { await api('/api/codes/' + b.dataset.del, { method: 'DELETE' }); loadCodes(); } catch (e) { toast(e.message, 'err'); }
    });
  } catch (e) { toast(e.message, 'err'); }
}

// ---- Tab: Schüler ----
async function tabSchueler(scope) {
  scope = scope || state._schuelerScope || 'active';
  state._schuelerScope = scope;
  const box = $('#itab');
  box.innerHTML = `<div class="card">
    <div class="inline" style="justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.6rem">
      <h2 style="margin:.1rem 0">Fahrschüler <span class="sub">anlegen & verwalten</span></h2>
      <div class="inline" style="gap:.4rem">
        <button class="sm sec" id="s-bulk">📋 Liste einfügen</button>
        <button class="sm" id="s-add">➕ Fahrschüler anlegen</button>
      </div>
    </div>
    <div class="tabs" style="max-width:340px;margin:.2rem 0 .8rem">
      <button id="sc-active" class="${scope === 'active' ? 'active' : ''}">Aktiv <span id="sc-ac"></span></button>
      <button id="sc-arch" class="${scope === 'archived' ? 'active' : ''}">✅ Archiv <span id="sc-arc"></span></button>
    </div>
    <p class="hint">${scope === 'archived'
      ? 'Bestandene / archivierte Fahrschüler. Ihre Daten und Fahrstunden bleiben einsehbar; sie tauchen nicht in der aktiven Liste auf. Über „Reaktivieren“ kommen sie zurück.'
      : 'Lege Fahrschüler an – jeder bekommt automatisch Login + Startpasswort. Über die Zeilen: bearbeiten, Notiz, Stundenlängen (40/80/120), Treffpunkt, Zugangsdaten, archivieren (bestanden) oder löschen.'}</p>
    <div id="s-list"></div></div>`;
  $('#s-add').onclick = () => openCreateStudentModal();
  $('#s-bulk').onclick = () => openBulkStudentModal();
  $('#sc-active').onclick = () => tabSchueler('active');
  $('#sc-arch').onclick = () => tabSchueler('archived');
  try {
    const { students, req, activeCount, archivedCount } = await api('/api/students' + (scope === 'archived' ? '?scope=archived' : ''));
    if ($('#sc-ac')) $('#sc-ac').textContent = activeCount != null ? `(${activeCount})` : '';
    if ($('#sc-arc')) $('#sc-arc').textContent = archivedCount != null ? `(${archivedCount})` : '';
    if (!students.length) { $('#s-list').innerHTML = `<p class="muted">${scope === 'archived' ? 'Noch keine archivierten Fahrschüler.' : 'Noch keine aktiven Fahrschüler. Lege oben welche an.'}</p>`; return; }
    const sonderCell = (s) => ['ueberland', 'autobahn', 'nacht'].map((k) => {
      const have = s.sonder?.[k] || 0, need = req[k]; const done = have >= need;
      return `<span class="pill" style="${done ? 'background:var(--good-bg);color:var(--good)' : ''}">${TYPE_ICON[k]} ${have}/${need}</span>`;
    }).join(' ');
    const sonderDone = (s) => ['ueberland', 'autobahn', 'nacht'].every((k) => (s.sonder?.[k] || 0) >= req[k]);
    const nearReady = (s) => sonderDone(s) && !s.redCount && (s.adkDistinct || 0) >= CURR_TOTAL * 0.8;
    // Gesamtübersicht: Kennzahlen über alle (angezeigten) Fahrschüler
    const nRed = students.filter((s) => s.redCount > 0).length;
    const nNear = students.filter(nearReady).length;
    const nR2 = students.filter((s) => s.rank >= 2).length;
    const ovBar = scope === 'archived' ? '' : `<div class="ov-bar">
      <div class="ov-tile"><b>${students.length}</b><span>Fahrschüler</span></div>
      <div class="ov-tile ${nRed ? 'warn' : ''}"><b>${nRed}</b><span>mit 🔴 offen</span></div>
      <div class="ov-tile"><b>${nR2}</b><span>Rang 2</span></div>
      <div class="ov-tile ${nNear ? 'good' : ''}"><b>${nNear}</b><span>fast prüfungsreif</span></div>
    </div>`;
    $('#s-list').innerHTML = `
      ${ovBar}
      <div class="inline" style="margin-bottom:.7rem;gap:.5rem">
        <input id="s-search" placeholder="🔍 Suchen: Name, Login-Name, Telefon oder E-Mail …" style="flex:1" autocomplete="off">
        <span class="pill" id="s-count">${students.length}</span>
      </div>
      <p class="muted hidden" id="s-noresult">Keine Treffer.</p>
      <div class="stu-grid">
      ${students.map((s) => {
        const searchStr = [s.name, s.username, s.email, s.phone].filter(Boolean).join(' ').toLowerCase();
        const durs = String(s.allowed_durations || '80').split(',').map(Number);
        const boxes = [40, 80, 120].map((d) => `<label class="dur-chip ${durs.includes(d) ? 'on' : ''}"><input type="checkbox" data-sdur="${s.id}" value="${d}" ${durs.includes(d) ? 'checked' : ''}> ${d}</label>`).join('');
        const hasHome = s.home_label || s.home_lat != null;
        const homeCell = hasHome
          ? `<span class="pill" style="background:var(--good-bg);color:var(--good)">📍 ${esc(s.home_label || 'gesetzt')}</span>`
          : `<span class="muted">– nicht vereinbart –</span>`;
        const isArch = !!s.archived_at;
        const av = s.has_photo ? `<img src="/api/students/${s.id}/photo" alt="">` : `<span>${esc(initials(s.name))}</span>`;
        const contact = s.phone
          ? `<span class="muted">${esc(s.phone)}</span> ${contactButtons(s.phone, `Hallo ${s.name.split(' ')[0]}, hier ${state.settings?.instructor_name || 'deine Fahrschule'}:`)}`
          : (s.email ? `<span class="muted">${esc(s.email)}</span>` : '<span class="muted">– kein Kontakt –</span>');
        return `<div class="stu-card" data-search="${esc(searchStr)}">
          <div class="stu-head">
            <span class="stu-av">${av}</span>
            <div class="stu-namewrap">
              <div class="stu-name">${esc(s.name)}${s.birth_year ? ` <span class="muted">(${s.birth_year})</span>` : ''}</div>
              <div class="stu-login">🔑 <span class="codechip">${esc(s.username || '–')}</span></div>
            </div>
            <div class="stu-hours"><b>${s.done_count}</b><span>Std.</span></div>
          </div>
          <div class="stu-chips">
            <span class="pill" style="${s.rank >= 2 ? 'background:var(--good-bg);color:var(--good)' : ''}">🏆 Rang ${s.rank} · ${s.horizon} T</span>
            ${s.units ? `<span class="pill">🚗 ${fmtUnits(s.units)} FS${s.schaltUnits ? ' · ' + fmtUnits(s.schaltUnits) + ' Schalt' : ''}</span>` : ''}
            ${s.redCount ? `<span class="pill" style="background:rgba(255,70,70,.16);color:#ff6b6b">🔴 ${s.redCount} offen</span>` : ''}
            ${!isArch && nearReady(s) ? '<span class="pill" style="background:var(--good-bg);color:var(--good)">🎓 fast prüfungsreif</span>' : ''}
            ${isArch ? '<span class="pill" style="background:var(--good-bg);color:var(--good)">✅ bestanden</span>' : ''}
          </div>
          ${s.notes ? `<div class="stu-note" title="${esc(s.notes)}">📝 ${esc(s.notes.length > 80 ? s.notes.slice(0, 80) + '…' : s.notes)}</div>` : ''}
          <div class="stu-info">
            <div class="sir"><span class="sil">📞</span><span class="siv">${contact}</span></div>
            <div class="sir"><span class="sil">📍</span><span class="siv">${homeCell}
              <button class="linklike" data-home="${s.id}" data-sname="${esc(s.name)}" data-hlabel="${esc(s.home_label || '')}" data-hlat="${s.home_lat != null ? s.home_lat : ''}" data-hlng="${s.home_lng != null ? s.home_lng : ''}">${hasHome ? 'ändern' : 'festlegen'}</button></span></div>
            <div class="sir"><span class="sil">🎯</span><span class="siv stu-sonder">${sonderCell(s)}</span></div>
            <div class="sir"><span class="sil">⏱️</span><span class="siv stu-lengths">${boxes}<button class="linklike" data-savedur="${s.id}">speichern</button></span></div>
          </div>
          <div class="stu-actions">
            <button class="iconbtn" data-edit="${s.id}" title="Bearbeiten" aria-label="Bearbeiten"><span class="ib-ic">✏️</span><span class="ib-lb">Bearbeiten</span></button>
            <button class="iconbtn" data-log="${s.id}" data-lname="${esc(s.name)}" title="Fahrstunde nachtragen" aria-label="Fahrstunde nachtragen"><span class="ib-ic">➕</span><span class="ib-lb">Nachtragen</span></button>
            <button class="iconbtn" data-invoice="${s.id}" data-iname="${esc(s.name)}" title="Rechnungsdaten" aria-label="Rechnungsdaten"><span class="ib-ic">🧾</span><span class="ib-lb">Rechnung</span></button>
            <button class="iconbtn" data-proof="${s.id}" data-pname="${esc(s.name)}" title="Nachweis drucken" aria-label="Nachweis drucken"><span class="ib-ic">📄</span><span class="ib-lb">Nachweis</span></button>
            <button class="iconbtn" data-card="${s.id}" data-cname="${esc(s.name)}" title="Ausbildungskarte" aria-label="Ausbildungskarte"><span class="ib-ic">📋</span><span class="ib-lb">Karte</span></button>
            <button class="iconbtn" data-reset="${s.id}" data-uname="${esc(s.username || '')}" data-sname="${esc(s.name)}" title="Zugangsdaten" aria-label="Zugangsdaten"><span class="ib-ic">🔑</span><span class="ib-lb">Zugang</span></button>
            ${isArch
              ? `<button class="iconbtn ok" data-react="${s.id}" title="Reaktivieren" aria-label="Reaktivieren"><span class="ib-ic">↩︎</span><span class="ib-lb">Zurück</span></button>`
              : `<button class="iconbtn ok" data-arch="${s.id}" data-aname="${esc(s.name)}" title="Als bestanden ins Archiv" aria-label="Bestanden"><span class="ib-ic">✅</span><span class="ib-lb">Bestanden</span></button>`}
            <button class="iconbtn danger stu-del" data-del="${s.id}" data-dname="${esc(s.name)}" title="Löschen" aria-label="Löschen"><span class="ib-ic">🗑️</span><span class="ib-lb">Löschen</span></button>
          </div>
        </div>`;
      }).join('')}
      </div>`;
    // Längen-Chips: optisch mitschalten
    $('#s-list').querySelectorAll('[data-sdur]').forEach((cb) => cb.onchange = () =>
      cb.closest('.dur-chip')?.classList.toggle('on', cb.checked));
    $('#s-list').querySelectorAll('[data-savedur]').forEach((btn) => btn.onclick = async () => {
      const id = btn.dataset.savedur;
      const vals = [...$('#s-list').querySelectorAll(`[data-sdur="${id}"]`)].filter((c) => c.checked).map((c) => Number(c.value));
      if (!vals.length) { toast('Mindestens eine Länge wählen', 'err'); return; }
      try { await api('/api/students/' + id, { method: 'PATCH', body: { allowed_durations: vals } }); toast('Gespeichert ✓', 'ok'); }
      catch (e) { toast(e.message, 'err'); }
    });
    $('#s-list').querySelectorAll('[data-reset]').forEach((btn) => btn.onclick = () =>
      openResetModal(btn.dataset.reset, btn.dataset.sname, btn.dataset.uname));
    $('#s-list').querySelectorAll('[data-home]').forEach((btn) => btn.onclick = () =>
      openStandortModal(btn.dataset.home, btn.dataset.sname, btn.dataset.hlabel, btn.dataset.hlat, btn.dataset.hlng));
    $('#s-list').querySelectorAll('[data-edit]').forEach((btn) => btn.onclick = () =>
      openEditStudentModal(students.find((x) => x.id === Number(btn.dataset.edit))));
    $('#s-list').querySelectorAll('[data-card]').forEach((btn) => btn.onclick = () =>
      openTrainingCard(btn.dataset.card, btn.dataset.cname));
    $('#s-list').querySelectorAll('[data-log]').forEach((btn) => btn.onclick = () =>
      openLogLessonModal(Number(btn.dataset.log), btn.dataset.lname));
    $('#s-list').querySelectorAll('[data-invoice]').forEach((btn) => btn.onclick = () =>
      openInvoiceModal(Number(btn.dataset.invoice), btn.dataset.iname));
    $('#s-list').querySelectorAll('[data-proof]').forEach((btn) => btn.onclick = async () => {
      try { const r = await api('/api/students/' + btn.dataset.proof + '/lessons');
        if (!r.lessons.length) { toast('Noch keine gefahrenen Stunden für den Nachweis.', 'err'); return; }
        printLessonProof(r.name || btn.dataset.pname, r.lessons, r.adk, r.stats);
      } catch (e) { toast(e.message, 'err'); }
    });
    $('#s-list').querySelectorAll('[data-del]').forEach((btn) => btn.onclick = () =>
      deleteStudent(btn.dataset.del, btn.dataset.dname));
    $('#s-list').querySelectorAll('[data-arch]').forEach((btn) => btn.onclick = async () => {
      if (!confirm(`„${btn.dataset.aname}" als bestanden markieren und ins Archiv verschieben? Daten & Fahrstunden bleiben einsehbar, du kannst jederzeit reaktivieren.`)) return;
      try { await api('/api/students/' + btn.dataset.arch + '/archive', { method: 'POST' }); toast('Ins Archiv verschoben ✅', 'ok'); tabSchueler(); }
      catch (e) { toast(e.message, 'err'); }
    });
    $('#s-list').querySelectorAll('[data-react]').forEach((btn) => btn.onclick = async () => {
      try { await api('/api/students/' + btn.dataset.react + '/reactivate', { method: 'POST' }); toast('Reaktiviert ↩︎', 'ok'); tabSchueler(); }
      catch (e) { toast(e.message, 'err'); }
    });
    // Suche: filtert die Zeilen nach Name / Login / Telefon / E-Mail
    const search = $('#s-search');
    if (search) search.oninput = () => {
      const q = search.value.trim().toLowerCase();
      let shown = 0;
      $('#s-list').querySelectorAll('.stu-card[data-search]').forEach((tr) => {
        const match = !q || tr.dataset.search.includes(q);
        tr.style.display = match ? '' : 'none';
        if (match) shown++;
      });
      $('#s-count').textContent = shown;
      $('#s-noresult').classList.toggle('hidden', shown > 0);
    };
  } catch (e) { toast(e.message, 'err'); }
}

// Neuen Fahrschüler anlegen – zeigt danach Login + Startpasswort zum Weitergeben
function openCreateStudentModal() {
  modal(`<h3>Fahrschüler anlegen</h3>
    ${errBox()}
    <div class="row">
      <div class="field"><label>Vorname *</label><input id="cs-first" placeholder="z.B. Maria" autocomplete="off"></div>
      <div class="field"><label>Nachname *</label><input id="cs-last" placeholder="z.B. Bieber" autocomplete="off"></div>
    </div>
    <div class="row">
      <div class="field" style="max-width:130px"><label>Jahrgang (optional)</label><input id="cs-year" type="number" placeholder="1997" min="1930" max="2015"></div>
      <div class="field"><label>Telefon (optional)</label><input id="cs-phone" placeholder="0151 …"></div>
    </div>
    <div class="field"><label>Login-Name (optional – sonst automatisch)</label><input id="cs-user" placeholder="z.B. MB1997" style="text-transform:uppercase"></div>
    <div class="field"><label>Erlaubte Stundenlängen</label>
      <div class="inline">${[40, 80, 120].map((d) => `<label style="margin:0;font-weight:600"><input type="checkbox" class="cs-dur" value="${d}" ${d === 80 ? 'checked' : ''} style="width:auto"> ${d} Min</label>`).join(' ')}</div></div>
    <div class="actions">
      <button class="sec" onclick="window.__closeModal()">Abbrechen</button>
      <button id="cs-go">Anlegen</button>
    </div>`);
  $('#cs-go').onclick = async () => {
    const first = $('#cs-first').value.trim(), last = $('#cs-last').value.trim();
    if (!first || !last) { showErr('Bitte Vor- und Nachname eingeben.'); return; }
    const durs = [...document.querySelectorAll('.cs-dur')].filter((c) => c.checked).map((c) => Number(c.value));
    const body = { first_name: first, last_name: last, birth_year: $('#cs-year').value || undefined, phone: $('#cs-phone').value || undefined,
      username: $('#cs-user').value.trim() || undefined, allowed_durations: durs.length ? durs : [80] };
    try {
      const r = await api('/api/students', { method: 'POST', body });
      showCredentials(r, `Fahrschüler „${r.name}" angelegt`);
      tabSchueler();
    } catch (e) { showErr(e.message); }
  };
}

// Mehrere Fahrschüler auf einmal anlegen (Liste einfügen)
function openBulkStudentModal() {
  modal(`<h3>Mehrere Fahrschüler anlegen</h3>
    ${errBox()}
    <p class="hint">Füge deine Namensliste ein – <strong>eine Person pro Zeile</strong>, als „Nachname, Vorname". Ein Jahrgang am Zeilenende ist optional (fließt in den Login ein).</p>
    <div class="field"><textarea id="bulk-text" rows="9" placeholder="Bieber, Maria&#10;Christke, Jason&#10;Franke, Lea-Michelle 2001&#10;…"></textarea></div>
    <p class="hint">Jeder bekommt automatisch einen Login (Initialen, ggf. + Jahrgang) und ein Startpasswort. Danach kannst du alle Zugangsdaten kopieren.</p>
    <div class="actions">
      <button class="sec" onclick="window.__closeModal()">Abbrechen</button>
      <button id="bulk-go">Alle anlegen</button>
    </div>`);
  $('#bulk-go').onclick = async () => {
    const text = $('#bulk-text').value.trim();
    if (!text) { showErr('Bitte eine Namensliste einfügen.'); return; }
    try {
      const r = await api('/api/students/bulk', { method: 'POST', body: { text } });
      showBulkResults(r);
      tabSchueler();
    } catch (e) { showErr(e.message); }
  };
}

function showBulkResults(r) {
  const rows = (r.created || []).map((c) => `${c.name}\t${c.username}\t${c.password}`).join('\n');
  const errList = (r.errors || []).length
    ? `<p class="hint" style="color:var(--warn)">${r.errors.length} Zeile(n) übersprungen: ${r.errors.map((e) => esc(e.line)).join('; ')}</p>` : '';
  modal(`<h3>${(r.created || []).length} Fahrschüler angelegt ✓</h3>
    <p class="hint">Alle Zugangsdaten – kopiere sie dir weg (jede Zeile: Name · Login · Passwort). Passwörter sind nur jetzt sichtbar.</p>
    ${errList}
    <div style="max-height:46vh;overflow:auto;border:1px solid var(--line);border-radius:10px">
    <table><tr><th>Name</th><th>Login</th><th>Passwort</th></tr>
    ${(r.created || []).map((c) => `<tr><td>${esc(c.name)}</td><td><span class="codechip">${esc(c.username)}</span></td><td><span class="codechip">${esc(c.password)}</span></td></tr>`).join('')}
    </table></div>
    <div class="actions">
      <button class="sec" id="bulk-copy">📋 Alle kopieren</button>
      <button onclick="window.__closeModal()">Fertig</button>
    </div>`);
  $('#bulk-copy').onclick = () => {
    const txt = 'Name\tLogin\tPasswort\n' + rows;
    navigator.clipboard.writeText(txt).then(() => toast('Alle Zugangsdaten kopiert ✓', 'ok')).catch(() => toast('Kopieren nicht möglich', 'err'));
  };
}

// Stammdaten bearbeiten
function openEditStudentModal(s) {
  if (!s) return;
  // Vorname/Nachname aus den Feldern; Fallback: kombinierten Namen zerlegen (letztes Wort = Nachname)
  let first = s.first_name || '', last = s.last_name || '';
  if (!first && !last) { const parts = String(s.name || '').trim().split(/\s+/); last = parts.length > 1 ? parts.pop() : ''; first = parts.join(' '); }
  modal(`<h3>${esc(s.name)} bearbeiten</h3>
    ${errBox()}
    <div class="row">
      <div class="field"><label>Vorname</label><input id="es-first" value="${esc(first)}"></div>
      <div class="field"><label>Nachname</label><input id="es-last" value="${esc(last)}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Geburtsdatum</label><input id="es-bdate" type="date" value="${esc(s.birth_date || '')}" max="2015-12-31"></div>
      <div class="field"><label>Telefon</label><input id="es-phone" value="${esc(s.phone || '')}"></div>
    </div>
    <div class="field"><label>E-Mail</label><input id="es-email" type="email" value="${esc(s.email || '')}"></div>
    <div class="row">
      <div class="field" style="flex:2"><label>Straße</label><input id="es-street" value="${esc(s.street || '')}"></div>
      <div class="field" style="max-width:110px"><label>Hausnr.</label><input id="es-houseno" value="${esc(s.house_no || '')}"></div>
    </div>
    <div class="row">
      <div class="field" style="max-width:130px"><label>PLZ</label><input id="es-zip" inputmode="numeric" value="${esc(s.zip || '')}"></div>
      <div class="field" style="flex:2"><label>Ort</label><input id="es-city" value="${esc(s.city || '')}"></div>
    </div>
    <div class="row">
      <div class="field"><label>🚗 Abholzeit (Min)</label>
        <input id="es-travel" inputmode="numeric" value="${s.travel_min != null ? s.travel_min : ''}" placeholder="z.B. 30"></div>
      <div class="field" style="max-width:180px"><label>Standort</label>
        <select id="es-base">
          <option value="" ${!s.home_base ? 'selected' : ''}>Automatisch (näher)</option>
          <option value="main" ${s.home_base === 'main' ? 'selected' : ''}>Eberswalde</option>
          <option value="finow" ${s.home_base === 'finow' ? 'selected' : ''}>Finow</option>
        </select></div>
    </div>
    <div class="hint" style="margin:-.2rem 0 .2rem">Abholzeit wird im Tagesplan vor jeder Fahrstunde eingerechnet. Leer lassen = automatisch schätzen${s.travel_est ? ` (aktuell ≈ ${s.travel_est} Min)` : ''} – vom gewählten (oder näheren) Standort aus.</div>
    <div class="field"><label>📝 Notiz / Karteikarte (nur für dich)</label>
      <textarea id="es-notes" rows="4" placeholder="z.B. Ausbildungsstand, was noch geübt werden muss, Besonderheiten …" style="resize:vertical">${esc(s.notes || '')}</textarea></div>
    <div class="actions">
      <button class="sec" onclick="window.__closeModal()">Abbrechen</button>
      <button id="es-go">Speichern</button>
    </div>`);
  $('#es-go').onclick = async () => {
    try {
      await api('/api/students/' + s.id, { method: 'PATCH', body: {
        first_name: $('#es-first').value, last_name: $('#es-last').value,
        birth_date: $('#es-bdate').value || null,
        street: $('#es-street').value || null, house_no: $('#es-houseno').value || null,
        zip: $('#es-zip').value || null, city: $('#es-city').value || null,
        phone: $('#es-phone').value || null, email: $('#es-email').value || null,
        travel_min: $('#es-travel').value.trim() === '' ? '' : $('#es-travel').value.trim(),
        home_base: $('#es-base').value || null,
        notes: $('#es-notes').value || null } });
      closeModal(); toast('Gespeichert ✓', 'ok'); tabSchueler();
    } catch (e) { const el = $('#autherr'); if (el) { el.textContent = e.message; el.classList.remove('hidden'); } else toast(e.message, 'err'); }
  };
}

async function deleteStudent(id, name) {
  if (!confirm(`„${name}" wirklich löschen? Alle Buchungen dieses Schülers werden mitgelöscht. Das kann nicht rückgängig gemacht werden.`)) return;
  try { await api('/api/students/' + id, { method: 'DELETE' }); toast('Fahrschüler gelöscht', 'ok'); tabSchueler(); }
  catch (e) { toast(e.message, 'err'); }
}

// ---------- Ausbildungsdiagrammkarte (BVF) pro Fahrschüler ----------
const CURRICULUM = [
  { key: 'grund', title: 'Grundstufe – Einweisung & Bedienung', items: [
    'Besonderheiten beim Einsteigen', 'Einstellen: Sitz', 'Einstellen: Spiegel', 'Einstellen: Lenkrad', 'Einstellen: Kopfstütze',
    'Lenkradhaltung', 'Pedale', 'Gurt anlegen/anpassen', 'Schalt-/Wählhebel', 'Zündschloss', 'Motor anlassen',
    'Anfahr-/Anhalteübungen', 'Schaltübungen hochschalten', 'Schaltübungen runterschalten', 'Lenkübungen'] },
  { key: 'grundfahr', title: 'Grundfahraufgaben', items: [
    'Rückwärtsfahren', 'Umkehren', 'Gefahrbremsung', 'Einparken längs vorwärts', 'Einparken längs rückwärts', 'Einparken quer vorwärts', 'Einparken quer rückwärts'] },
  { key: 'aufbau', title: 'Aufbaustufe – Umweltschonend, vorausschauend, Blickschulung', items: [
    'Rollen und Schalten', 'Abbremsen und Schalten', 'Bremsübung degressiv', 'Zielbremsung', 'Bremsen in Gefahrsituationen',
    'Gefälle/Steigung: Anhalten', 'Gefälle/Steigung: Anfahren', 'Gefälle/Steigung: Rückwärts', 'Gefälle/Steigung: Sichern', 'Gefälle/Steigung: Schalten',
    'Tastgeschwindigkeit', 'Bedienungs- & Kontrolleinrichtungen', 'Örtliche Besonderheiten'] },
  { key: 'leistung', title: 'Leistungsstufe – Schwierige Verkehrssituationen', items: [
    'Fahrbahnbenutzung / Einordnen', 'Markierungen', 'Fahrstreifenwechsel links', 'Fahrstreifenwechsel rechts', 'Vorbeifahren/Überholen',
    'Abbiegen rechts', 'Abbiegen links', 'Abbiegen mehrspurig', 'Radweg/Sonderstreifen', 'Straßenbahnen/Einbahnstraßen',
    'Vorfahrt: rechts vor links', 'Grünpfeil', 'Polizeibeamte', 'Geschwindigkeit/Abstand',
    'Fußgängerüberwege', 'Kinder', 'ÖPNV/Schulbus', 'Ältere/Behinderte', 'Radfahrer/Mofa', 'Verkehrsberuhigter Bereich',
    'Schwierige Verkehrsführung', 'Engpass', 'Kreisverkehr', 'Bahnübergang', 'Kritische Verkehrssituationen', 'Schwung nutzen'] },
  { key: 'ueberland', title: '🌄 Überlandfahrten', items: [
    'Angepasste Geschwindigkeit/Gangwahl', 'Abstand vorne', 'Abstand hinten', 'Abstand seitlich', 'Beobachtung/Spiegel', 'Verkehrszeichen',
    'Kreuzungen/Einmündungen', 'Kurven', 'Steigungen', 'Gefälle', 'Alleen', 'Überholen',
    'Liegenbleiben + Absichern', 'Fußgänger', 'Einfahren in Ortschaften', 'Wild/Tiere', 'Leistungsgrenze', 'Ablenkung', 'Orientierung'] },
  { key: 'autobahn', title: '🛣️ Autobahn', items: [
    'Fahrtplanung', 'Einfahren in BAB', 'Fahrstreifenwahl', 'Geschwindigkeit', 'Abstand vorne', 'Abstand hinten', 'Abstand seitlich',
    'Überholen', 'Schilder/Markierungen', 'Vorbeifahren/Anschlussstellen', 'Rast-/Parkplätze/Tankstellen', 'Verhalten bei Unfällen',
    'Dichter Verkehr/Stau', 'Leistungsgrenze', 'Konfliktsituationen', 'Ablenkung', 'Verlassen der BAB'] },
  { key: 'dunkel', title: '🌙 Dämmerung / Dunkelheit', items: [
    'Beleuchtung kontrollieren', 'Beleuchtung benutzen', 'Beleuchtung einstellen', 'Fernlicht', 'Beleuchtete Straßen', 'Unbeleuchtete Straßen', 'Parken',
    'Schlechte Witterung', 'Bahnübergänge', 'Tiere', 'Unbeleuchtete Verkehrsteilnehmer', 'Blendung', 'Orientierung', 'Abschlussbesprechung'] },
  { key: 'reife', title: '🎓 Reife- und Teststufe', items: [
    'Selbstständiges Fahren innerorts', 'Selbstständiges Fahren außerorts', 'Verantwortungsbewusstes Fahren', 'Testfahrt unter Prüfungsbedingungen', 'Wiederholung/Vertiefung', 'Leistungsbewertung'] },
];
const CURR_TOTAL = CURRICULUM.reduce((n, s) => n + s.items.length, 0);
const currKey = (sk, i) => `${sk}:${i}`;
function currLabel(key) { const [sk, i] = String(key).split(':'); const s = CURRICULUM.find((x) => x.key === sk); return s ? s.items[Number(i)] : null; }
function currSection(key) { const sk = String(key).split(':')[0]; return CURRICULUM.find((x) => x.key === sk); }
// Stand einer Aufgabe nach einer Fahrstunde
const CURR_STATUS = {
  mehr:   { short: 'muss noch geübt werden', tiny: 'muss noch', dot: '🔴', cls: 'st-mehr' },
  geuebt: { short: 'geübt',                  tiny: 'geübt',     dot: '🟡', cls: 'st-geuebt' },
  ok:     { short: 'sitzt ganz gut',         tiny: 'sitzt',     dot: '🟢', cls: 'st-ok' },
};
const currStatusMeta = (s) => CURR_STATUS[s] || CURR_STATUS.geuebt;
// Zahl mit deutschem Komma, „,0" weglassen (14, 14,5)
function fmtUnits(u) { const n = Math.round((Number(u) || 0) * 10) / 10; return (Number.isInteger(n) ? String(n) : n.toFixed(1)).replace('.', ','); }
function fmtDMY2(d) { try { return parseD(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch { return d; } }
// Statistik-Kacheln: Fahrstunden (à 80 Min), Termine, Schalt/Automatik, Zeit
function statStripHtml(stats) {
  if (!stats) return '';
  const s = stats;
  const cell = (val, lbl) => `<div class="adk-stat"><b>${val}</b><span>${lbl}</span></div>`;
  const parts = [
    cell(fmtUnits(s.units), `Fahrstunden<br>à ${s.unit || 80} Min`),
    cell(s.sessions || 0, 'Termine'),
  ];
  if (s.schalt && s.schalt.sessions) parts.push(cell(fmtUnits(s.schalt.units), 'Schaltstunden'));
  if (s.automatik && s.automatik.sessions) parts.push(cell(fmtUnits(s.automatik.units), 'Automatik'));
  parts.push(cell(fmtUnits(s.hours) + ' h', 'gefahrene Zeit'));
  return `<div class="adk-stats">${parts.join('')}</div>`;
}
// „Muss noch geübt werden" – Punkte, deren letzter Stand 🔴 war
function adkNeedWorkHtml(adk) {
  if (!adk || !adk.needWork || !adk.needWork.length) return '';
  const items = adk.needWork.map((k) => currLabel(k)).filter(Boolean);
  if (!items.length) return '';
  return `<div class="adk-need"><div class="adk-need-t">🔴 Das üben wir noch (${items.length})</div>
    <ul>${items.map((it) => `<li>${esc(it)}</li>`).join('')}</ul></div>`;
}
// Häufigkeits-Übersicht: je geübte Aufgabe wie oft gesamt (+ letzter Stand, + je Tag)
function adkFreqHtml(adk) {
  if (!adk || !adk.items || !adk.distinct) return '<p class="hint">Noch keine Ausbildungspunkte protokolliert. Der Fahrlehrer hakt sie beim Abschließen einer Fahrstunde ab.</p>';
  const rows = CURRICULUM.map((sec) => {
    const its = sec.items.map((it, i) => {
      const k = currKey(sec.key, i); const agg = adk.items[k];
      if (!agg) return '';
      const days = Object.entries(agg.days || {}).sort((a, z) => a[0].localeCompare(z[0]))
        .map(([d, n]) => `${fmtDMY2(d)}${n > 1 ? ` (${n}×)` : ''}`).join(' · ');
      const m = agg.lastStatus ? currStatusMeta(agg.lastStatus) : null;
      return `<tr><td>${esc(it)}${days ? `<div class="adk-day">${days}</div>` : ''}</td>
        <td class="st">${m ? `<span class="badge ${m.cls}">${m.dot} ${m.tiny}</span>` : ''}</td>
        <td class="n"><strong>${agg.count}×</strong></td></tr>`;
    }).filter(Boolean).join('');
    if (!its) return '';
    return `<tr class="adk-sec-row"><td colspan="3" style="padding-top:.5rem"><strong>${esc(sec.title)}</strong></td></tr>${its}`;
  }).filter(Boolean).join('');
  return `<table class="adk-freq"><tbody>${rows}</tbody></table>`;
}
// Ausbildungspunkte, die in EINER Fahrstunde behandelt wurden (aus bookings.curriculum)
function lessonAdkParse(cur) {
  if (!cur) return [];
  let arr = []; try { arr = typeof cur === 'string' ? JSON.parse(cur) : cur; } catch { return []; }
  if (!Array.isArray(arr)) return [];
  return arr.map((raw) => {
    const k = typeof raw === 'string' ? raw : (raw && raw.k);
    if (!k) return null;
    let s = (raw && typeof raw === 'object' && raw.s) ? raw.s : 'geuebt';
    return { k, s, label: currLabel(k), section: currSection(k)?.title || '' };
  }).filter((x) => x && x.label);
}
// Fenster: was wurde in dieser Fahrstunde gemacht (+ Download-PDF)
function openLessonAdk(lesson, name) {
  const items = lessonAdkParse(lesson.curriculum);
  const when = fmtDT(lesson.date, lesson.start_time);
  if (!items.length) {
    modal(`<h3>📋 Ausbildungskarte</h3><p class="hint">Für die Fahrstunde am ${when} wurden keine Ausbildungspunkte protokolliert.</p>
      <div class="actions"><button onclick="window.__closeModal()">Schließen</button></div>`);
    return;
  }
  // nach Abschnitt gruppieren
  const bySec = {};
  for (const it of items) (bySec[it.section] = bySec[it.section] || []).push(it);
  const body = Object.entries(bySec).map(([sec, its]) => `<div class="mk-sec"><div class="mk-sec-t">${esc(sec)}</div>
    ${its.map((it) => { const m = currStatusMeta(it.s); return `<div class="tc-item ro on">${m.dot} ${esc(it.label)} <span class="badge ${m.cls}" style="margin-left:auto">${m.tiny}</span></div>`; }).join('')}</div>`).join('');
  modal(`<h3>📋 Diese Fahrstunde</h3>
    <p class="hint"><strong>${when}</strong> · ${lesson.duration_min} Min${lesson.gearbox ? ' · ' + (lesson.gearbox === 'schalt' ? 'Schalter' : 'Automatik') : ''}${lesson.plate ? ' · 🚘 ' + esc(lesson.plate) : ''}<br>${items.length} Ausbildungspunkt${items.length === 1 ? '' : 'e'} bearbeitet.</p>
    <div style="max-height:52vh;overflow:auto;margin:.2rem -.1rem;padding:0 .1rem">${body}</div>
    <div class="actions"><button class="sec" id="la-pdf">📄 Als PDF</button><button onclick="window.__closeModal()">Schließen</button></div>`, 'wide');
  const pb = $('#la-pdf'); if (pb) pb.onclick = () => printLessonAdk(lesson, name || state.user?.name || 'Fahrschüler');
}
// Eine Fahrstunden-ADK als sauberes weißes PDF (Browser-Druck -> „Als PDF sichern")
function printLessonAdk(lesson, name) {
  const items = lessonAdkParse(lesson.curriculum);
  const when = fmtDT(lesson.date, lesson.start_time);
  const school = esc(state.settings?.instructor_name || 'Fahrschule');
  const bySec = {};
  for (const it of items) (bySec[it.section] = bySec[it.section] || []).push(it);
  const secs = Object.entries(bySec).map(([sec, its]) => `<section><h2>${esc(sec)}</h2><div class="items">${its.map((it) => {
    const m = currStatusMeta(it.s);
    return `<div class="it"><span class="bx">☑</span> <span>${esc(it.label)}</span> <em class="st ${m.cls}">${m.tiny}</em></div>`;
  }).join('')}</div></section>`).join('');
  const doc = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Fahrstunde ${esc(when)} – ${esc(name)}</title>
    <style>*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:26px 30px;max-width:760px}
    .head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px}
    .head h1{font-size:19px;margin:0}.head .meta{font-size:12px;color:#444;text-align:right;line-height:1.5}
    section{break-inside:avoid;margin:0 0 12px}h2{font-size:14px;margin:0 0 6px;border-bottom:1px solid #ccc;padding-bottom:3px}
    .it{font-size:12.5px;line-height:1.9;display:flex;align-items:center;gap:6px}.bx{font-size:14px}
    .st{margin-left:auto;font-style:normal;font-size:11px;border:1px solid #bbb;border-radius:6px;padding:1px 7px}
    .st.st-mehr{color:#c0392b;border-color:#e6a}.st.st-ok{color:#1e8449;border-color:#9d9}.st.st-geuebt{color:#9a6b00;border-color:#eca}
    .foot{margin-top:20px;font-size:11px;color:#666;border-top:1px solid #ccc;padding-top:8px}
    .sign{margin-top:30px;display:flex;gap:40px}.sign div{flex:1;border-top:1px solid #111;padding-top:4px;font-size:11px;color:#444}
    @media print{body{padding:0}}</style></head><body>
    <div class="head"><div><h1>Ausbildungsnachweis – Fahrstunde</h1><div style="font-size:13px;margin-top:2px">${esc(name)} · ${esc(when)} · ${lesson.duration_min} Min${lesson.gearbox ? ' · ' + (lesson.gearbox === 'schalt' ? 'Schalter' : 'Automatik') : ''}</div></div>
      <div class="meta">${school}</div></div>
    ${secs || '<p>Keine Punkte.</p>'}
    <div class="sign"><div>Unterschrift Fahrlehrer</div><div>Unterschrift Fahrschüler</div></div>
    <div class="foot">Erstellt mit ginoco</div>
    <script>window.onload=function(){setTimeout(function(){window.print()},200)}<\/script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { toast('Bitte Pop-ups erlauben, um das PDF zu erzeugen.', 'err'); return; }
  w.document.open(); w.document.write(doc); w.document.close();
}

async function openTrainingCard(id, name) {
  let training = {}, adk = null, stats = null;
  try { const r = await api('/api/students/' + id + '/training'); training = r.training || {}; adk = r.adk; stats = r.stats; } catch (e) { toast(e.message, 'err'); return; }
  const doneCount = () => Object.values(training).filter(Boolean).length;
  const barInner = () => {
    const d = doneCount(), pct = Math.round((d / CURR_TOTAL) * 100);
    return `<div class="fp-prog-row"><span>Ausbildungsfortschritt</span><span id="tc-pct">${d}/${CURR_TOTAL} · ${pct}%</span></div>
      <div class="fp-prog-bar"><div id="tc-fill" style="width:${pct}%"></div></div>`;
  };
  const sections = CURRICULUM.map((s) => {
    const done = s.items.filter((_, i) => training[currKey(s.key, i)]).length;
    return `<details class="tc-sec" open>
      <summary>${esc(s.title)} <span class="pill" data-secpill="${s.key}">${done}/${s.items.length}</span></summary>
      <div class="tc-items">${s.items.map((it, i) => {
        const k = currKey(s.key, i); const v = training[k];
        const dt = (typeof v === 'number' && v > 1e12) ? `<span class="tc-date">${new Date(v).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>` : '';
        return `<label class="tc-item"><input type="checkbox" data-tc="${k}" data-sk="${s.key}" ${v ? 'checked' : ''}> <span>${esc(it)}</span>${dt}</label>`;
      }).join('')}</div>
    </details>`;
  }).join('');
  // Vollbild-Seite (nicht als enges Fenster) – viel Platz zum Abhaken
  const ov = document.createElement('div');
  ov.className = 'fp-overlay';
  ov.innerHTML = `<div class="fp">
    <div class="fp-head">
      <button class="fp-back" id="tc-back">‹ Zurück</button>
      <div class="fp-title">📋 Ausbildungskarte <span>${esc(name)}</span></div>
      <button class="sec sm" id="tc-pdf">📄 PDF</button>
    </div>
    <div class="fp-sub">Hake ab, was ${esc((name || '').split(' ')[0])} schon geübt/beherrscht hat. Den Stand je Punkt (🔴🟡🟢) und die Häufigkeit setzt du beim Abschließen der Fahrstunde. Speichert automatisch.</div>
    ${statStripHtml(stats)}
    ${adkNeedWorkHtml(adk)}
    <div class="fp-progwrap"><div id="tc-bar">${barInner()}</div>
      <input id="tc-search" class="fp-search" placeholder="🔍 Punkt suchen … (z.B. Kreisverkehr, Einparken)" autocomplete="off"></div>
    <div class="fp-body">
      <details class="tc-sec"><summary>📊 Häufigkeit – wie oft was geübt wurde (${adk ? adk.distinct : 0})</summary><div style="padding:0 .1rem">${adkFreqHtml(adk)}</div></details>
      ${sections}</div>
    <div class="fp-noresult hidden" id="tc-noresult">Kein Punkt gefunden.</div>
  </div>`;
  document.body.appendChild(ov);
  // Live-Suche: filtert die Punkte, blendet leere Abschnitte aus
  const search = ov.querySelector('#tc-search');
  search.oninput = () => {
    const q = search.value.trim().toLowerCase();
    let anyShown = false;
    ov.querySelectorAll('.tc-sec').forEach((sec) => {
      let secShown = 0;
      sec.querySelectorAll('.tc-item').forEach((it) => {
        const match = !q || it.textContent.toLowerCase().includes(q);
        it.style.display = match ? '' : 'none';
        if (match) secShown++;
      });
      sec.style.display = secShown ? '' : 'none';
      if (q && secShown) sec.open = true;
      if (secShown) anyShown = true;
    });
    ov.querySelector('#tc-noresult').classList.toggle('hidden', anyShown);
  };
  const pwa = document.getElementById('pwa-install'); if (pwa) pwa.style.display = 'none';
  const close = () => { ov.remove(); const p = document.getElementById('pwa-install'); if (p) p.style.display = ''; };
  ov.querySelector('#tc-back').onclick = close;
  ov.querySelector('#tc-pdf').onclick = () => printTrainingCard(name, training);
  const refreshBar = () => { const t = ov.querySelector('#tc-bar'); if (t) t.innerHTML = barInner(); };
  let saveTimer = null;
  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(async () => {
    try { await api('/api/students/' + id + '/training', { method: 'PUT', body: { training } }); } catch (e) { toast(e.message, 'err'); }
  }, 500); };
  ov.querySelectorAll('[data-tc]').forEach((cb) => cb.onchange = () => {
    if (cb.checked) training[cb.dataset.tc] = Date.now();   // Zeitstempel = „zuletzt abgehakt“
    else delete training[cb.dataset.tc];
    const sec = CURRICULUM.find((s) => s.key === cb.dataset.sk);
    const done = sec.items.filter((_, i) => training[currKey(sec.key, i)]).length;
    const pill = ov.querySelector(`[data-secpill="${cb.dataset.sk}"]`); if (pill) pill.textContent = `${done}/${sec.items.length}`;
    refreshBar(); save();
  });
}

// Ausbildungskarte als sauberes, weißes PDF (über den Drucken-Dialog des Browsers -> „Als PDF sichern")
function printTrainingCard(name, training) {
  const done = Object.values(training).filter(Boolean).length;
  const pct = CURR_TOTAL ? Math.round((done / CURR_TOTAL) * 100) : 0;
  const today = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const school = esc(state.settings?.instructor_name || 'Fahrschule');
  const secs = CURRICULUM.map((s) => {
    const dn = s.items.filter((_, i) => training[currKey(s.key, i)]).length;
    const items = s.items.map((it, i) => {
      const on = !!training[currKey(s.key, i)];
      return `<div class="it"><span class="bx">${on ? '☑' : '☐'}</span> <span class="${on ? 'dn' : ''}">${esc(it)}</span></div>`;
    }).join('');
    return `<section><h2>${esc(s.title)} <em>${dn}/${s.items.length}</em></h2><div class="items">${items}</div></section>`;
  }).join('');
  const doc = `<!doctype html><html lang="de"><head><meta charset="utf-8">
    <title>Ausbildungskarte – ${esc(name)}</title>
    <style>
      *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:28px 30px;max-width:820px}
      .head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px}
      .head h1{font-size:20px;margin:0} .head .meta{font-size:12px;color:#444;text-align:right;line-height:1.5}
      .prog{margin:10px 0 16px;font-size:13px} .bar{height:10px;background:#e6e6e6;border-radius:5px;overflow:hidden;margin-top:4px}
      .bar>i{display:block;height:100%;width:${pct}%;background:#111}
      section{break-inside:avoid;margin:0 0 12px} h2{font-size:14px;margin:0 0 6px;border-bottom:1px solid #ccc;padding-bottom:3px}
      h2 em{font-style:normal;color:#666;font-weight:normal;font-size:12px;float:right}
      .items{columns:2;column-gap:26px} .it{font-size:12px;line-height:1.7;break-inside:avoid} .bx{font-size:13px}
      .dn{text-decoration:none} .foot{margin-top:20px;font-size:11px;color:#666;border-top:1px solid #ccc;padding-top:8px}
      .sign{margin-top:34px;display:flex;gap:40px} .sign div{flex:1;border-top:1px solid #111;padding-top:4px;font-size:11px;color:#444}
      @media print{body{padding:0}}
    </style></head><body>
    <div class="head"><div><h1>Ausbildungskarte</h1><div style="font-size:13px;margin-top:2px">${esc(name)}</div></div>
      <div class="meta">${school}<br>Stand: ${today}</div></div>
    <div class="prog"><strong>Ausbildungsfortschritt: ${done}/${CURR_TOTAL} (${pct}%)</strong><div class="bar"><i></i></div></div>
    ${secs}
    <div class="sign"><div>Unterschrift Fahrlehrer</div><div>Unterschrift Fahrschüler</div></div>
    <div class="foot">Erstellt mit ginoco · ${today}</div>
    <script>window.onload=function(){setTimeout(function(){window.print()},200)}<\/script>
  </body></html>`;
  const w = window.open('', '_blank');
  if (!w) { toast('Bitte Pop-ups erlauben, um das PDF zu erzeugen.', 'err'); return; }
  w.document.open(); w.document.write(doc); w.document.close();
}

// Schüler sieht seine eigene Ausbildungskarte (nur Lesen) – mit Stand, Häufigkeit & Statistik
async function openMyTraining() {
  let training = {}, adk = myAdk, stats = myStats;
  try { const r = await api('/api/my/training'); training = r.training || {}; } catch (e) { toast(e.message, 'err'); return; }
  // adk/stats ggf. frisch holen, falls noch nicht geladen
  if (!adk || !stats) { try { const m = await api('/api/my/bookings'); adk = m.adk; stats = m.stats; myAdk = adk; myStats = stats; } catch {} }
  const done = Object.values(training).filter(Boolean).length;
  const pct = CURR_TOTAL ? Math.round((done / CURR_TOTAL) * 100) : 0;
  const sections = CURRICULUM.map((s) => {
    const dn = s.items.filter((_, i) => training[currKey(s.key, i)]).length;
    const items = s.items.map((it, i) => {
      const k = currKey(s.key, i); const on = !!training[k];
      const agg = adk && adk.items && adk.items[k];
      const m = agg && agg.lastStatus ? currStatusMeta(agg.lastStatus) : null;
      const extra = agg ? `<span class="tc-date">${agg.count}×${m ? ' · ' + m.dot : ''}</span>` : '';
      return `<div class="tc-item ro${on ? ' on' : ''}"><span>${on ? '✅' : '⬜'} ${esc(it)}</span>${extra}</div>`;
    }).join('');
    return `<details class="tc-sec"${dn ? ' open' : ''}><summary>${esc(s.title)} <span class="pill">${dn}/${s.items.length}</span></summary>
      <div class="tc-items">${items}</div></details>`;
  }).join('');
  modal(`<h3>📋 Deine Ausbildungskarte</h3>
    <p class="hint">Dein Ausbildungsstand: <em>was</em> ihr geübt habt, wie oft und wie gut es sitzt. Die Häkchen &amp; Bewertung setzt dein Fahrlehrer.</p>
    ${statStripHtml(stats)}
    <div style="margin:.3rem 0 .5rem">
      <div style="display:flex;justify-content:space-between;font-size:.82rem;color:var(--muted)"><span>Ausbildungsfortschritt</span><span>${done}/${CURR_TOTAL} · ${pct}%</span></div>
      <div style="height:9px;background:#0f151d;border-radius:6px;overflow:hidden;margin-top:.25rem"><div style="height:100%;width:${pct}%;background:var(--brand)"></div></div>
    </div>
    ${adkNeedWorkHtml(adk)}
    <div style="max-height:52vh;overflow:auto;margin:.2rem -.2rem 0;padding:0 .2rem">
      <details class="tc-sec"><summary>📊 Häufigkeit – wie oft was geübt wurde</summary><div style="padding:0 .1rem">${adkFreqHtml(adk)}</div></details>
      ${sections}
    </div>
    <div class="actions"><button onclick="window.__closeModal()">Schließen</button></div>`, 'wide');
}
window.__openMyTraining = openMyTraining;

// Prüfungsreife-Check: was fehlt noch bis zur Prüfung? (Sonderfahrten, rote ADK-Punkte,
// Ausbildungsabschnitte, Fahrstunden). Die endgültige Entscheidung trifft der Fahrlehrer.
async function openExamReadiness() {
  const prog = myProgress; const adk = myAdk; const stats = myStats;
  let training = {};
  try { const r = await api('/api/my/training'); training = r.training || {}; } catch {}
  if ((!adk || !stats) ) { try { const m = await api('/api/my/bookings'); adk = m.adk; stats = m.stats; myAdk = adk; myStats = stats; myProgress = m.progress; } catch {} }
  const req = (prog && prog.req) || { ueberland: 5, autobahn: 4, nacht: 3 };
  const have = (prog && prog.sonder) || { ueberland: 0, autobahn: 0, nacht: 0 };
  const sonderRows = ['ueberland', 'autobahn', 'nacht'].map((k) => ({ k, have: have[k] || 0, need: req[k] || 0, ok: (have[k] || 0) >= (req[k] || 0) }));
  const sonderOpen = sonderRows.filter((r) => !r.ok);
  const red = ((adk && adk.needWork) || []).map(currLabel).filter(Boolean);
  const sections = CURRICULUM.map((s) => { const done = s.items.filter((_, i) => training[currKey(s.key, i)]).length; return { title: s.title, done, total: s.items.length }; });
  const openSections = sections.filter((s) => s.done === 0);
  const coveredItems = sections.reduce((n, s) => n + s.done, 0);
  const covPct = CURR_TOTAL ? Math.round(coveredItems / CURR_TOTAL * 100) : 0;
  const units = (stats && stats.units) || 0;
  const ready = sonderOpen.length === 0 && red.length === 0 && openSections.length === 0 && coveredItems > 0;
  const line = (ok, txt, sub) => `<div class="er-line ${ok ? 'ok' : 'todo'}"><span class="er-ic">${ok ? '✅' : '⬜'}</span><div><div>${txt}</div>${sub ? `<div class="er-sub">${sub}</div>` : ''}</div></div>`;
  const sonderSub = sonderOpen.length
    ? 'Noch offen: ' + sonderOpen.map((r) => `${TYPE_LABEL[r.k]} ${r.have}/${r.need} UE`).join(' · ')
    : `Alle Pflichtfahrten komplett (${sonderRows.map((r) => `${r.have}/${r.need}`).join(' · ')})`;
  const redSub = red.length ? red.slice(0, 8).map(esc).join(' · ') + (red.length > 8 ? ' …' : '') : 'Nichts steht mehr auf 🔴.';
  const secSub = openSections.length ? 'Noch nicht begonnen: ' + openSections.map((s) => esc(s.title.replace(/^[^ ]+ /, ''))).slice(0, 6).join(' · ') : `Alle Abschnitte begonnen · ${coveredItems}/${CURR_TOTAL} Punkte (${covPct}%)`;
  modal(`<h3>🎓 Bin ich bald prüfungsreif?</h3>
    <div class="er-verdict ${ready ? 'ok' : ''}">${ready
      ? '🎉 Sieht stark aus! Sprich deinen Fahrlehrer auf den Prüfungstermin an.'
      : 'Fast geschafft – das fehlt noch. Deinen Prüfungstermin bespricht am Ende dein Fahrlehrer.'}</div>
    ${statStripHtml(stats)}
    <div class="er-list">
      ${line(sonderOpen.length === 0, '🌄 Sonderfahrten', sonderSub)}
      ${line(red.length === 0, '🚦 Nichts steht mehr auf „muss noch geübt werden"', redSub)}
      ${line(openSections.length === 0, '📋 Alle Ausbildungsabschnitte begonnen', secSub)}
      ${line(units > 0, '🚗 Fahrstunden gesammelt', `${fmtUnits(units)} Fahrstunden (à 80 Min)`)}
    </div>
    <p class="hint" style="margin-top:.5rem">Das ist eine Selbsteinschätzung aus deinem Ausbildungsstand. Ob du wirklich zur Prüfung angemeldet wirst, entscheidet dein Fahrlehrer.</p>
    <div class="actions"><button class="sec" onclick="window.__openMyTraining()">📋 Ausbildungskarte</button><button onclick="window.__closeModal()">Schließen</button></div>`, 'wide');
}
window.__openExamReadiness = openExamReadiness;

// Zugangsdaten-Anzeige mit Kopier-Funktion (nach Anlegen)
function showCredentials(r, title) {
  modal(`<h3>${esc(title)}</h3>
    <p class="hint">Gib diese Zugangsdaten an den Fahrschüler weiter. Das Passwort ist nur jetzt sichtbar – du kannst es später aber jederzeit zurücksetzen.</p>
    <div class="field"><label>Login-Name</label><input id="cr-user" value="${esc(r.username)}" readonly></div>
    <div class="field"><label>Passwort</label><input id="cr-pw" value="${esc(r.password)}" readonly></div>
    <div class="actions">
      <button class="sec" id="cr-copy">📋 Kopieren</button>
      <button onclick="window.__closeModal()">Fertig</button>
    </div>`);
  $('#cr-copy').onclick = () => {
    const txt = `ginoco Login\nAdresse: https://ginoco.de\nLogin-Name: ${r.username}\nPasswort: ${r.password}`;
    navigator.clipboard.writeText(txt).then(() => toast('Kopiert ✓', 'ok')).catch(() => toast('Kopieren nicht möglich', 'err'));
  };
}

// Festen Treffpunkt (Standort) eines Schuelers festlegen – wird als Standard fuer dessen Fahrstunden genutzt
function openStandortModal(id, name, label, lat, lng) {
  modal(`<h3>Treffpunkt für ${esc(name)}</h3>
    <p class="hint">Der Ort, an dem du ${esc((name || '').split(' ')[0])} normalerweise abholst. Er wird bei jeder Fahrstunde automatisch als Treffpunkt genutzt – du musst ihn dann nicht mehr einzeln eintragen.</p>
    <div class="field"><label>Adresse / Beschreibung</label>
      <input id="st-label" value="${esc(label || '')}" placeholder="z.B. Bahnhof Musterstadt, Gleis-Eingang"></div>
    <div style="margin:.2rem 0 .7rem"><button class="sec sm" id="st-here" type="button">📍 Aktueller Standort übernehmen</button>
      <span class="hint" id="st-here-info" style="margin-left:.5rem"></span></div>
    <div class="inline">
      <div class="field" style="flex:1"><label>Breitengrad (optional)</label><input id="st-lat" value="${esc(lat || '')}" placeholder="z.B. 52.5200"></div>
      <div class="field" style="flex:1"><label>Längengrad (optional)</label><input id="st-lng" value="${esc(lng || '')}" placeholder="z.B. 13.4050"></div>
    </div>
    <p class="hint" style="margin-top:-.4rem">Tipp: Wenn du gerade beim Treffpunkt stehst, tippe oben auf „Aktueller Standort übernehmen“ – Koordinaten und Adresse werden automatisch ausgefüllt. Alternativ Koordinaten aus Google Maps per Rechtsklick.</p>
    <div class="actions">
      <button class="ghost" id="st-clear" type="button">Treffpunkt entfernen</button>
      <button class="sec" onclick="window.__closeModal()">Abbrechen</button>
      <button id="st-save">Speichern</button>
    </div>`);
  const save = async (body, msg) => {
    try { await api('/api/students/' + id, { method: 'PATCH', body }); toast(msg, 'ok'); closeModal(); tabSchueler(); }
    catch (e) { toast(e.message, 'err'); }
  };
  $('#st-save').onclick = () => {
    const l = $('#st-label').value.trim();
    const la = $('#st-lat').value.trim(), lo = $('#st-lng').value.trim();
    if (!l && !la) { toast('Bitte eine Adresse eingeben', 'err'); return; }
    if ((la && !lo) || (!la && lo)) { toast('Bitte Breiten- UND Längengrad eingeben (oder beide leer)', 'err'); return; }
    save({ home_label: l, home_lat: la || null, home_lng: lo || null }, 'Treffpunkt gespeichert ✓');
  };
  $('#st-clear').onclick = () => save({ home_label: null, home_lat: null, home_lng: null }, 'Treffpunkt entfernt');
  $('#st-here').onclick = async () => {
    const info = $('#st-here-info');
    info.textContent = 'GPS wird ermittelt …';
    try {
      const c = await getPosOnce();
      $('#st-lat').value = c.latitude.toFixed(6);
      $('#st-lng').value = c.longitude.toFixed(6);
      info.textContent = '✓ Koordinaten übernommen';
      if (!$('#st-label').value.trim()) {
        const addr = await reverseGeocode(c.latitude, c.longitude);
        if (addr) { $('#st-label').value = addr; info.textContent = '✓ Standort & Adresse übernommen'; }
      }
    } catch (e) { info.textContent = ''; toast(e.message || 'GPS nicht verfügbar', 'err'); }
  };
}

// Starkes, aber lesbares Zufallspasswort: Buchstaben + Zahl + Sonderzeichen
function randomPassword() {
  const lower = 'abcdefghijkmnpqrstuvwxyz';   // ohne l/o
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // ohne I/O
  const digit = '23456789';
  const special = '!?#@%+*';
  const pick = (set) => { const b = new Uint8Array(1); crypto.getRandomValues(b); return set[b[0] % set.length]; };
  // je Kategorie mind. eins, dann auffuellen, dann mischen
  const chars = [pick(lower), pick(upper), pick(digit), pick(special)];
  const all = lower + upper + digit + special;
  while (chars.length < 10) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) { const b = new Uint8Array(1); crypto.getRandomValues(b); const j = b[0] % (i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}
// Client-seitige Passwort-Pruefung (Server prueft nochmal)
function pwProblem(pw) {
  pw = String(pw || '');
  if (pw.length < 8) return 'mindestens 8 Zeichen';
  if (!/[A-Za-zÄÖÜäöüß]/.test(pw)) return 'einen Buchstaben';
  if (!/[0-9]/.test(pw)) return 'eine Zahl';
  if (!/[^A-Za-z0-9ÄÖÜäöüß]/.test(pw)) return 'ein Sonderzeichen (z. B. ! ? # @)';
  return null;
}

function openResetModal(id, name, username) {
  modal(`<h3>Zugangsdaten für ${esc(name)}</h3>
    <div class="field"><label>Login-Name (bleibt immer gleich)</label>
      <div class="inline"><input id="rs-user" value="${esc(username || '–')}" readonly style="flex:1"><button class="sec sm" id="rs-ucopy" type="button">📋 Login</button></div></div>
    <p class="hint">Das Passwort ist verschlüsselt gespeichert und lässt sich aus Sicherheitsgründen nicht anzeigen. Zum Weitergeben erzeugst du hier ein <strong>neues</strong> Passwort (das alte wird dann ungültig).</p>
    <div class="field"><label>Neues Passwort (mind. 8 Zeichen, mit Zahl & Sonderzeichen)</label>
      <div class="inline"><input id="rs-pw" value="${randomPassword()}" style="flex:1"><button class="sec sm" id="rs-gen" type="button">🎲 Neu</button></div>
    </div>
    <div id="rs-done" class="hidden"></div>
    <div class="actions">
      <button class="sec" onclick="window.__closeModal()">Abbrechen</button>
      <button id="rs-save">Passwort setzen</button>
    </div>`);
  $('#rs-gen').onclick = () => { $('#rs-pw').value = randomPassword(); };
  $('#rs-ucopy').onclick = () => { navigator.clipboard?.writeText(username || ''); toast('Login kopiert', 'ok'); };
  $('#rs-save').onclick = async () => {
    const pw = $('#rs-pw').value.trim();
    const prob = pwProblem(pw);
    if (prob) { toast('Passwort braucht ' + prob, 'err'); return; }
    try {
      await api('/api/students/' + id + '/reset-password', { method: 'POST', body: { new_password: pw } });
      const share = `Hallo ${name}, dein Zugang zu ginoco (Fahrschule):\nLogin-Name: ${username}\nPasswort: ${pw}`;
      $('#rs-done').classList.remove('hidden');
      $('#rs-done').innerHTML = `<div class="warnbox" style="margin-top:.4rem">✓ Passwort gesetzt. Diese Zugangsdaten weitergeben:</div>
        <pre style="background:#0f151d;border:1px solid var(--line);border-radius:8px;padding:.7rem;white-space:pre-wrap;font-size:.85rem;margin:.5rem 0">${esc(share)}</pre>
        <button class="sec sm" id="rs-copy">📋 Kopieren</button>`;
      $('#rs-save').textContent = 'Fertig'; $('#rs-save').onclick = closeModal;
      $('#rs-copy').onclick = () => { navigator.clipboard?.writeText(share); toast('Zugangsdaten kopiert', 'ok'); };
      toast('Passwort gesetzt ✓', 'ok');
      if (document.getElementById('reset-reqs')) renderResetRequests(); // Anfrage-Banner aktualisieren
    } catch (e) { toast(e.message, 'err'); }
  };
}

// ---- Tab: Arbeitszeiten / Dienstplan (kurze Tage, freie Tage) ----
const WTYPES = [
  ['short', '✂️', 'Kürzer', 'früher Feierabend'],
  ['free', '🏖️', 'Frei', 'ganzer Tag zu'],
  ['vacation', '🌴', 'Urlaub', 'zählt als Arbeitszeit'],
];
async function tabArbeitszeiten() {
  const s = state.settings;
  const box = $('#itab');
  state.wType = state.wType || 'short';
  state.wMonth = firstOfMonth(state.date);
  state.wSelected = new Set();
  box.innerHTML = `<div class="card">
    <h2>Arbeitszeiten & Dienstplan <span class="sub">Resturlaub: ${s.vacation_days_left ?? '–'} Tage</span></h2>
    <p class="hint">Trag ein, wenn ein Tag anders läuft – die buchbaren Zeiten passen sich für die Schüler automatisch an.</p>
    <div class="ap-label">Was ist an dem Tag / den Tagen?</div>
    <div class="seg" id="w-seg">
      ${WTYPES.map(([t, ic, lb, sub]) => `<button data-t="${t}" class="${state.wType === t ? 'active' : ''}">
        <span class="seg-ic">${ic}</span><span class="seg-lb">${lb}</span><span class="seg-sub">${sub}</span></button>`).join('')}
    </div>
    <div id="w-single">
      <div class="row"><div class="field"><label>Datum</label><input type="date" id="w-date" value="${state.date}"></div></div>
      <div class="row" id="w-times">
        <div class="field"><label>Arbeitsbeginn</label><input id="w-start" value="${s.start_time}"></div>
        <div class="field"><label>Letzter Slot</label><input id="w-last" value="${s.short_day_last_start || '13:35'}"></div>
      </div>
    </div>
    <div id="w-multi" class="hidden">
      <p class="hint" style="margin:.1rem 0 .5rem">Tippe die Tage an – auch mehrere. Nochmal tippen hebt die Auswahl auf.</p>
      <div id="w-cal"></div>
      <div id="w-selinfo" style="margin:.5rem 0 0"></div>
    </div>
    <div class="inline" style="margin:.6rem 0 1rem"><button id="w-add">Eintragen</button>
      <span class="hint" style="margin:0" id="w-preview"></span></div>
    <div id="w-list"></div>
  </div>`;
  const single = $('#w-single'), multi = $('#w-multi');
  const updateSel = () => {
    const n = state.wSelected.size;
    $('#w-selinfo').innerHTML = n
      ? `<span class="pill" style="background:var(--good-bg);color:var(--good)">${n} Tag${n === 1 ? '' : 'e'} gewählt</span> <button class="ghost sm" id="w-clear">leeren</button>`
      : '<span class="muted" style="font-size:.85rem">Noch keine Tage gewählt.</span>';
    const c = $('#w-clear'); if (c) c.onclick = () => { state.wSelected.clear(); drawWorkCal(); updateWPreview(); };
  };
  const drawWorkCal = () => {
    const first = parseD(state.wMonth), y = first.getFullYear(), mo = first.getMonth();
    const startDow = isoDow(ymd(new Date(y, mo, 1))), inMonth = new Date(y, mo + 1, 0).getDate(), today = todayStr();
    let cells = '';
    for (let i = 1; i < startDow; i++) cells += '<span class="mc-empty"></span>';
    for (let d = 1; d <= inMonth; d++) {
      const ds = ymd(new Date(y, mo, d)), past = ds < today, sel = state.wSelected.has(ds);
      cells += `<button class="mc-day${sel ? ' sel' : ''}${ds === today ? ' today' : ''}" data-day="${ds}" ${past ? 'disabled' : ''}>${d}</button>`;
    }
    $('#w-cal').innerHTML = `<div class="minical">
      <div class="mc-head"><button class="sec sm" data-wmo="-1">‹</button><strong>${MON_LONG[mo]} ${y}</strong><button class="sec sm" data-wmo="1">›</button></div>
      <div class="mc-grid mc-wd">${WD.map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="mc-grid">${cells}</div></div>`;
    $('#w-cal').querySelectorAll('[data-day]').forEach((el) => el.onclick = () => {
      const d = el.dataset.day;
      if (state.wSelected.has(d)) state.wSelected.delete(d); else state.wSelected.add(d);
      el.classList.toggle('sel'); updateSel(); updateWPreview();
    });
    $('#w-cal').querySelectorAll('[data-wmo]').forEach((el) => el.onclick = () => { state.wMonth = addMonths(state.wMonth, Number(el.dataset.wmo)); drawWorkCal(); });
    updateSel();
  };
  const updateWPreview = () => {
    const t = state.wType;
    if (t === 'short') {
      const step = s.lesson_min + s.break_min, toM = (x) => { const [h, m] = x.split(':').map(Number); return h * 60 + m; };
      const list = [];
      for (let x = toM($('#w-start').value); x <= toM($('#w-last').value); x += step) list.push(`${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`);
      $('#w-preview').textContent = `${list.length} Slots: ${list.join(', ') || '–'}`;
    } else {
      const n = state.wSelected.size;
      $('#w-preview').textContent = n ? `${t === 'vacation' ? 'Urlaub' : 'Frei'}: ${n} Tag${n === 1 ? '' : 'e'}${t === 'vacation' ? ` · je ${s.vacation_credit_min} Min` : ''}` : '';
    }
  };
  const sync = () => {
    const t = state.wType;
    single.classList.toggle('hidden', t !== 'short');
    multi.classList.toggle('hidden', t === 'short');
    if (t === 'short') { $('#w-start').value = s.start_time; $('#w-last').value = s.short_day_last_start || '13:35'; }
    else drawWorkCal();
    updateWPreview();
  };
  $('#w-seg').querySelectorAll('[data-t]').forEach((b) => b.onclick = () => {
    state.wType = b.dataset.t;
    $('#w-seg').querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('active', x === b));
    sync();
  });
  ['w-start', 'w-last', 'w-date'].forEach((id) => $('#' + id).oninput = updateWPreview);
  sync();
  $('#w-add').onclick = async () => {
    const t = state.wType;
    let body;
    if (t === 'short') { body = { date: $('#w-date').value, type: 'short', start_time: $('#w-start').value, last_start: $('#w-last').value }; }
    else {
      if (!state.wSelected.size) { toast('Bitte erst Tage antippen', 'err'); return; }
      body = { type: t, dates: [...state.wSelected] };
    }
    const send = async (force) => api('/api/day-overrides', { method: 'POST', body: force ? { ...body, force: true } : body });
    const done = (r) => { toast(`Eingetragen ✓${r.days > 1 ? ` (${r.days} Tage)` : ''}`, 'ok'); state.wSelected.clear(); loadOverrides(); if (t !== 'short') drawWorkCal(); updateWPreview(); };
    try { done(await send(false)); }
    catch (e) {
      if (/schon .* Termin/.test(e.message) && confirm(e.message + '\n\nTrotzdem eintragen?')) {
        try { done(await send(true)); } catch (e2) { toast(e2.message, 'err'); }
      } else { toast(e.message, 'err'); }
    }
  };
  loadOverrides();
}
async function loadOverrides() {
  try {
    const { overrides } = await api('/api/day-overrides');
    $('#w-list').innerHTML = overrides.length ? `<div class="inline" style="justify-content:space-between;margin-bottom:.5rem">
        <h2 style="font-size:.95rem;margin:0">Eingetragene Tage</h2><span class="pill">${overrides.length}</span></div><div class="blist">${
      overrides.map((o) => `<div class="bitem warm">
        <div><div class="when">${o.type === 'vacation' ? '🌴' : o.closed ? '🏖️' : '✂️'} ${WD_LONG[isoDow(o.date) - 1]}, ${fmtShort(o.date)}</div>
        <div class="meta">${o.type === 'vacation' ? 'Urlaub' : o.closed ? 'ganzer Tag frei' : `kurzer Tag · ${o.start_time || state.settings.start_time}–${o.last_start || '?'}`}</div></div>
        <button class="ghost sm" data-delov="${o.date}">Löschen</button></div>`).join('')
    }</div>` : '<p class="muted">Keine besonderen Tage eingetragen.</p>';
    $('#w-list').querySelectorAll('[data-delov]').forEach((b) => b.onclick = async () => {
      try { await api('/api/day-overrides/' + b.dataset.delov, { method: 'DELETE' }); loadOverrides(); } catch (e) { toast(e.message, 'err'); }
    });
  } catch (e) { toast(e.message, 'err'); }
}

// ---- Tab: Theorie & Ausnahmen ----
const BLOCK_META = { theorie: ['📚', 'Theorie'], block: ['⛔', 'Blockiert'], frei: ['🌴', 'Frei / Urlaub'] };
// --- Sammel-Theorie: mehrere Termine auf einmal ---
function parseImportDateClient(s) {
  s = String(s || '').trim(); let m;
  if (m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)) return `${m[1]}-${m[2]}-${m[3]}`;
  if (m = s.match(/^(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?$/)) {
    const d = +m[1], mo = +m[2]; let y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : null;
    const pad = (n) => String(n).padStart(2, '0');
    if (!y) { y = parseD(todayStr()).getFullYear(); if (`${y}-${pad(mo)}-${pad(d)}` < todayStr()) y++; }
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
  return null;
}
function parseTimeClient(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})[:.]?(\d{2})?$/); if (!m) return null;
  const h = +m[1], mi = m[2] ? +m[2] : 0; if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}
function parseTheoryLine(line) {
  const raw = String(line).trim(); if (!raw) return null;
  const c = raw.split(',').map((x) => x.trim());
  if (c.length < 3) return { ok: false, input: raw, msg: 'Format: Datum, Von, Bis, Titel' };
  const date = parseImportDateClient(c[0]), from = parseTimeClient(c[1]), to = parseTimeClient(c[2]);
  const title = c.slice(3).join(', ');
  const hm = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  if (!date) return { ok: false, input: raw, msg: 'Datum unklar' };
  if (!from || !to) return { ok: false, input: raw, msg: 'Uhrzeit unklar' };
  if (hm(to) <= hm(from)) return { ok: false, input: raw, msg: '„Bis“ muss nach „Von“ liegen' };
  return { ok: true, date, from, to, title };
}
function openBulkTheory() {
  modal(`<h3>📋 Theorie sammeln eintragen</h3>
    <p class="hint" style="margin-bottom:.5rem">Trag deine Theorie-Termine hier untereinander ein – <strong>eine pro Zeile</strong>: <code>Datum, Von, Bis, Titel</code>. Ich prüfe alles und zeige dir eine Vorschau, bevor etwas gespeichert wird.</p>
    <div class="bulk-help">
      <div class="bh-row"><span class="bh-k">Beispiel</span><code>6.8., 17:00, 20:00, Theorie 1</code></div>
      <div class="bh-row"><span class="bh-k">Geht auch</span><span class="muted">06.08.2026 · 17 (= 17:00) · Jahr weglassen nimmt das nächste Vorkommen</span></div>
    </div>
    <div class="row">
      <div class="field" style="max-width:200px"><label>Art</label>
        <select id="bt-type"><option value="theorie">📚 Theorie</option><option value="block">⛔ Blockiert</option><option value="frei">🌴 Frei / Urlaub</option></select></div>
      <div class="field"><label style="opacity:0">.</label><label class="inline" style="margin:0;font-weight:600"><input type="checkbox" id="bt-count" checked style="width:auto"> zählt als Arbeitszeit</label></div>
    </div>
    <div class="field"><label>Termine (eine pro Zeile)</label>
      <textarea id="bt-text" rows="7" placeholder="6.8., 17:00, 20:00, Theorie 1&#10;13.8., 17:00, 20:00, Theorie 2&#10;20.8., 18:00, 21:00, Theorie 3"></textarea></div>
    <div id="bt-preview"></div>
    <div class="actions" style="justify-content:space-between">
      <button class="sec" onclick="window.__closeModal()">Abbrechen</button>
      <div class="inline" style="gap:.5rem">
        <button class="sec" id="bt-check">Vorschau prüfen</button>
        <button id="bt-commit" disabled>Eintragen</button>
      </div>
    </div>`, 'wide');
  const preview = $('#bt-preview'), commitBtn = $('#bt-commit');
  let parsed = [];
  const check = () => {
    parsed = $('#bt-text').value.split('\n').map(parseTheoryLine).filter(Boolean);
    const ok = parsed.filter((r) => r.ok), err = parsed.filter((r) => !r.ok);
    preview.innerHTML = `<div class="bulk-summary">
        ${ok.length ? `<span class="pill" style="background:var(--good-bg);color:var(--good)">✅ ${ok.length} bereit</span>` : '<span class="pill">0 bereit</span>'}
        ${err.length ? `<span class="pill" style="background:var(--bad-bg);color:var(--bad)">⚠️ ${err.length} zu prüfen</span>` : ''}
      </div>
      <div class="bulk-list">${parsed.map((r) => r.ok
        ? `<div class="bulk-row ok"><span class="br-ic">✅</span><div><b>${WD[isoDow(r.date) - 1]} ${fmtShort(r.date)}</b> · ${r.from}–${r.to}${r.title ? ' · ' + esc(r.title) : ''}</div></div>`
        : `<div class="bulk-row error"><span class="br-ic">⚠️</span><div><span class="muted">${esc(r.input)}</span><div class="br-msg error">${esc(r.msg)}</div></div></div>`).join('')}</div>`;
    commitBtn.disabled = ok.length === 0;
    commitBtn.textContent = ok.length ? `${ok.length} eintragen` : 'Eintragen';
  };
  $('#bt-check').onclick = check;
  commitBtn.onclick = async () => {
    const ok = parsed.filter((r) => r.ok);
    if (!ok.length) { check(); return; }
    const type = $('#bt-type').value, count = $('#bt-count').checked;
    let done = 0;
    for (const r of ok) {
      try {
        await api('/api/blocks', { method: 'POST', body: {
          date: r.date, start_time: r.from, end_time: r.to,
          title: r.title || (type === 'theorie' ? 'Theorieunterricht' : type === 'frei' ? 'Frei' : 'Blockiert'),
          type, count_hours: count, repeat_weekly: 1 } });
        done++;
      } catch (e) { /* eine Zeile fehlgeschlagen – weiter */ }
    }
    closeModal();
    toast(`${done} Termin${done === 1 ? '' : 'e'} eingetragen ✓`, 'ok');
    if (state.instrTab === 'theorie') loadBlocks();
  };
}
async function tabTheorie() {
  const box = $('#itab');
  box.innerHTML = `<div class="card">
    <h2>Theorie & Ausnahmen</h2>
    <p class="hint">Blockiere Zeiten, in denen keine Fahrstunden buchbar sein sollen – z.B. Theorieunterricht (auch als <strong>Serie</strong>), Sondertermine oder Freistunden.</p>
    <div class="row">
      <div class="field"><label>Datum</label><input type="date" id="t-date" value="${state.date}"></div>
      <div class="field"><label>Von</label><input id="t-from" value="17:00"></div>
      <div class="field"><label>Bis</label><input id="t-to" value="20:00"></div>
    </div>
    <div class="row">
      <div class="field"><label>Titel</label><input id="t-title" placeholder="z.B. Theorieunterricht"></div>
      <div class="field" style="max-width:180px"><label>Art</label>
        <select id="t-type">
          <option value="theorie">📚 Theorie</option>
          <option value="block">⛔ Blockiert</option>
          <option value="frei">🌴 Frei / Urlaub</option>
        </select></div>
    </div>
    <div class="row">
      <div class="field" style="max-width:230px"><label>Wiederholen</label>
        <select id="t-repeat">
          <option value="1">Einmalig</option>
          <option value="4">Wöchentlich · 4 Wochen</option>
          <option value="6">Wöchentlich · 6 Wochen</option>
          <option value="8">Wöchentlich · 8 Wochen</option>
          <option value="12">Wöchentlich · 12 Wochen</option>
        </select></div>
      <div class="field"><label style="opacity:0">.</label>
        <label class="inline" style="margin:0;font-weight:600"><input type="checkbox" id="t-count" checked style="width:auto"> zählt als Arbeitszeit</label></div>
    </div>
    <div class="inline" style="margin:.2rem 0 1rem">
      <button id="t-add">Eintragen</button>
      <button class="sec" id="t-bulk">📋 Mehrere auf einmal</button>
      <span class="hint" style="margin:0" id="t-preview"></span>
    </div>
    <div id="t-list"></div>
  </div>`;
  $('#t-bulk').onclick = () => openBulkTheory();
  const updatePreview = () => {
    const n = Number($('#t-repeat').value);
    if (n <= 1) { $('#t-preview').textContent = ''; return; }
    const days = Array.from({ length: n }, (_, i) => fmtShort(addDays($('#t-date').value, i * 7)));
    $('#t-preview').textContent = `Legt ${n} Termine an: ${days.slice(0, 5).join(', ')}${n > 5 ? ' …' : ''}`;
  };
  $('#t-repeat').onchange = updatePreview;
  $('#t-date').oninput = updatePreview;
  $('#t-add').onclick = async () => {
    try {
      const r = await api('/api/blocks', { method: 'POST', body: {
        date: $('#t-date').value, start_time: $('#t-from').value, end_time: $('#t-to').value,
        title: $('#t-title').value, type: $('#t-type').value, count_hours: $('#t-count').checked,
        repeat_weekly: Number($('#t-repeat').value) } });
      $('#t-title').value = ''; $('#t-repeat').value = '1'; updatePreview();
      toast(`Eingetragen ✓${r.created > 1 ? ` (${r.created} Termine)` : ''}`, 'ok'); loadBlocks();
    } catch (e) { toast(e.message, 'err'); }
  };
  loadBlocks();
}
async function loadBlocks() {
  try {
    const from = todayStr(), to = addDays(from, 120);
    const ov = await api('/api/instructor/overview?from=' + from + '&to=' + to);
    const bl = ov.blocks;
    // nach Datum gruppiert, mit Icons – übersichtlicher
    $('#t-list').innerHTML = bl.length ? `<div class="inline" style="justify-content:space-between;margin-bottom:.5rem">
        <h2 style="font-size:.95rem;margin:0">Kommende Einträge</h2><span class="pill">${bl.length}</span></div>
      <div class="blist">${bl.map((b) => {
        const [ic, lb] = BLOCK_META[b.type] || ['⛔', b.type];
        return `<div class="bitem warm">
          <div><div class="when">${ic} ${WD_LONG[isoDow(b.date) - 1]}, ${fmtShort(b.date)} · ${b.start_time}–${b.end_time}</div>
          <div class="meta"><strong>${esc(b.title)}</strong> · ${lb} ${b.count_hours ? '<span class="pill">Arbeitszeit</span>' : ''}</div></div>
          <button class="ghost sm" data-delblock="${b.id}">Löschen</button></div>`;
      }).join('')}</div>` : '<p class="muted">Keine kommenden Ausnahmen.</p>';
    $('#t-list').querySelectorAll('[data-delblock]').forEach((b) => b.onclick = () => delBlock(b.dataset.delblock));
  } catch (e) { toast(e.message, 'err'); }
}

// ---- Tab: Protokoll (Ereignis-Log fuer den Chef) ----
const EV_META = {
  book: ['📅', 'Gebucht'], cancel_student: ['❌', 'Storniert (Schüler)'], cancel_instr: ['❌', 'Abgesagt (Fahrlehrer)'],
  offer: ['🔄', 'Angeboten'], take: ['✅', 'Übernommen'], shift: ['🕐', 'Verschoben'],
  delay: ['⏱️', 'Verspätung'], done: ['🚗', 'Gefahren'], noshow: ['🚫', 'Nicht erschienen'],
  vacation: ['🌴', 'Urlaub'], reminder: ['🔔', 'Erinnerung'], info: ['ℹ️', 'Info'],
  reset: ['🔑', 'Passwort vergessen'], message: ['✉️', 'Nachricht'],
};
async function tabProtokoll() {
  const box = $('#itab');
  let students = [];
  try { students = (await api('/api/students')).students; } catch {}
  state._students = students;
  box.innerHTML = `<div class="card">
    <h2>Protokoll <span class="sub">alle Vorgänge – für deine Unterlagen</span></h2>
    <div class="inline" style="margin-bottom:1rem">
      ${studentPicker('pr-student', students, { placeholder: '🔍 Alle Fahrschüler – oder Namen tippen', style: 'max-width:240px' })}
      <input type="date" id="pr-from" style="max-width:160px">
      <input type="date" id="pr-to" style="max-width:160px">
      <button class="sec sm" id="pr-go">Filtern</button>
      <button class="ghost sm" id="pr-csv" style="margin-left:auto">⬇️ Als CSV (Excel)</button>
    </div>
    <div id="pr-list"></div>
  </div>`;
  $('#pr-go').onclick = loadProtokoll;
  $('#pr-csv').onclick = exportProtokollCSV;
  await loadProtokoll();
  // als gesehen markieren + Glocke zuruecksetzen
  try { await api('/api/instructor/events/seen', { method: 'POST' }); refreshEventBadge(); } catch {}
}
async function loadProtokoll() {
  const q = new URLSearchParams();
  const sid = resolveStudentId($('#pr-student'), state._students || []);
  if (sid) q.set('student_id', sid);
  if ($('#pr-from').value) q.set('from', $('#pr-from').value);
  if ($('#pr-to').value) q.set('to', $('#pr-to').value);
  try {
    const { events } = await api('/api/instructor/events?' + q.toString());
    if (!events.length) { $('#pr-list').innerHTML = '<p class="muted">Keine Einträge.</p>'; return; }
    const counts = {}; for (const e of events) counts[e.type] = (counts[e.type] || 0) + 1;
    const order = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const stats = `<div class="pr-stats">
      <div class="pr-stat total"><b>${events.length}</b><span>Vorgänge gesamt</span></div>
      ${order.map((t) => { const [ic, lbl] = EV_META[t] || ['•', t]; return `<div class="pr-stat"><b>${counts[t]}</b><span>${ic} ${esc(lbl)}</span></div>`; }).join('')}
    </div>`;
    $('#pr-list').innerHTML = stats + `<table>
      <tr><th>Wann</th><th>Vorgang</th><th>Fahrschüler</th><th>Details</th></tr>
      ${events.map((e) => {
        const [ic, lbl] = EV_META[e.type] || ['•', e.type];
        const d = new Date(e.at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
        return `<tr>
          <td class="muted" style="white-space:nowrap">${d}</td>
          <td>${ic} ${lbl}</td>
          <td>${esc(e.student_name || '–')}</td>
          <td class="muted">${esc(e.detail || '')}</td>
        </tr>`;
      }).join('')}
    </table>`;
  } catch (e) { toast(e.message, 'err'); }
}

async function exportProtokollCSV() {
  const q = new URLSearchParams();
  const sid = resolveStudentId($('#pr-student'), state._students || []);
  if (sid) q.set('student_id', sid);
  if ($('#pr-from').value) q.set('from', $('#pr-from').value);
  if ($('#pr-to').value) q.set('to', $('#pr-to').value);
  try {
    const { events } = await api('/api/instructor/events?' + q.toString());
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Datum/Zeit', 'Vorgang', 'Fahrschüler', 'Details'].map(cell).join(';')];
    for (const e of events) {
      const [, lbl] = EV_META[e.type] || ['', e.type];
      rows.push([new Date(e.at).toLocaleString('de-DE'), lbl, e.student_name || '', e.detail || ''].map(cell).join(';'));
    }
    downloadFile('protokoll.csv', '﻿' + rows.join('\r\n'), 'text/csv;charset=utf-8');
    toast('Protokoll als CSV heruntergeladen ✓', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

function promptRealign(mis) {
  modal(`<h3>Termine ans neue Raster anpassen?</h3>
    <div class="warnbox">Durch die geänderten Zeiten/Pause passen <strong>${mis.total} Termin(e)</strong> an ${mis.days.length} Tag(en) nicht mehr genau ins Raster.</div>
    <p class="hint">Neue Buchungen nutzen sofort das neue Raster. Bestehende Termine behalten erstmal ihre Zeit. Du kannst sie hier lückenlos ans neue Raster rücken – die betroffenen Fahrschüler werden automatisch benachrichtigt.</p>
    <div class="blist" style="max-height:180px;overflow:auto">${mis.days.map((d) => `<div class="bitem"><div class="when">${WD[isoDow(d.date) - 1]} ${fmtShort(d.date)}</div><span class="pill">${d.count} Termin(e)</span></div>`).join('')}</div>
    <div class="actions">
      <button class="sec" onclick="window.__closeModal()">Später</button>
      <button id="ra-go">Alle anpassen</button>
    </div>`);
  $('#ra-go').onclick = async () => {
    try { const r = await api('/api/instructor/realign', { method: 'POST', body: {} });
      closeModal(); toast(`${r.moved} Termin(e) an ${r.days} Tag(en) angepasst ✓`, 'ok'); refreshEventBadge(); }
    catch (e) { toast(e.message, 'err'); }
  };
}

// ---- Tab: Einstellungen ----
function tabEinstellungen() {
  const s = state.settings;
  const days = (s.workdays || '1,2,3,4,5,6').split(',').map(Number);
  const box = $('#itab');
  const sec = (icon, title, sub, body, open) => `<details class="sset"${open ? ' open' : ''}>
    <summary><span class="sset-ic">${icon}</span><span class="sset-tx"><span class="sset-tt">${title}</span><span class="sset-sub">${sub}</span></span><span class="sset-chev">▾</span></summary>
    <div class="sset-body">${body}</div></details>`;
  box.innerHTML = `<div class="card">
    <h2>Einstellungen <span class="sub">alles an einem Ort</span></h2>
    <p class="hint">Tippe einen Bereich an, um ihn zu öffnen. Änderungen unten mit „Speichern“ sichern – das gilt für alle Bereiche zusammen.</p>

    ${sec('🕒', 'Zeiten & Slots', 'Arbeitszeiten, Dauer, Pausen, Arbeitstage', `
      <div class="row"><div class="field"><label>Arbeitsbeginn (erster Slot)</label><input id="e-start" value="${s.start_time}"></div>
        <div class="field"><label>Letzter buchbarer Slot</label><input id="e-last" value="${s.last_start}"></div></div>
      <div class="row"><div class="field"><label>Dauer Fahrstunde (Min)</label><input id="e-lesson" type="number" value="${s.lesson_min}" step="5"></div>
        <div class="field"><label>Pause dazwischen (Min)</label><input id="e-break" type="number" value="${s.break_min}" step="5"></div></div>
      <div class="field"><label>Arbeitstage</label>
        <div class="daypick" id="e-days">${WD.map((d, i) => `<label class="dur-chip ${days.includes(i + 1) ? 'on' : ''}"><input type="checkbox" data-day="${i + 1}" ${days.includes(i + 1) ? 'checked' : ''}> ${d}</label>`).join('')}</div></div>
      <div class="row"><div class="field"><label>Tägliche Freigabe-Uhrzeit ${helpDot('Ab dieser Uhrzeit wird der jeweils nächste Tag zum Buchen freigeschaltet.')}</label><input id="e-release" value="${s.release_time || '10:00'}"></div>
        <div class="field"><label>Letzter Slot an kurzen Tagen ${helpDot('An „Kürzer“-Tagen ist das die späteste buchbare Startzeit.')}</label><input id="e-shortlast" value="${s.short_day_last_start || '13:35'}"></div></div>
      <div class="hint" id="e-preview" style="margin-top:.3rem"></div>`, true)}

    ${sec('🔄', 'Fließender Tagesplan', 'Lückenlos, Pause + Abholzeit, automatisch nachrücken', `
      <label class="ck-line"><input type="checkbox" id="e-flow" ${s.flow_schedule !== '0' ? 'checked' : ''}> Fließender, lückenloser Tagesplan (Startzeit der nächsten Stunde wächst mit Dauer + Pause + Abholzeit)</label>
      <label class="ck-line" style="margin-top:.4rem"><input type="checkbox" id="e-autofill" ${s.auto_fill_gaps !== '0' ? 'checked' : ''}> Fällt eine Stunde aus, folgende automatisch nach vorne rücken (Schüler werden benachrichtigt)</label>
      <div class="field" style="margin-top:.6rem"><label>Standort 1 – Name</label><input id="e-schoollabel" value="${esc(s.school_label || 'Eberswalde (Eisenbahnstr. 31)')}"></div>
      <div class="row">
        <div class="field"><label>Standort 1 – Breite (lat) ${helpDot('Hauptstandort als Startpunkt für die Abholzeit-Schätzung. Eisenbahnstr. 31, Eberswalde.')}</label><input id="e-schoollat" value="${esc(s.school_lat || '')}" placeholder="52.8300"></div>
        <div class="field"><label>Standort 1 – Länge (lng)</label><input id="e-schoollng" value="${esc(s.school_lng || '')}" placeholder="13.8160"></div></div>
      <div class="field"><label>Standort 2 – Name ${helpDot('Zweiter Standort (z. B. Finow). Die Abholzeit wird automatisch vom näheren Standort gerechnet – oder du wählst pro Schüler den Standort.')}</label><input id="e-school2label" value="${esc(s.school2_label || 'Finow')}"></div>
      <div class="row">
        <div class="field"><label>Standort 2 – Breite (lat)</label><input id="e-school2lat" value="${esc(s.school2_lat || '')}" placeholder="52.8360"></div>
        <div class="field"><label>Standort 2 – Länge (lng)</label><input id="e-school2lng" value="${esc(s.school2_lng || '')}" placeholder="13.6990"></div></div>
      <div class="field"><label>Standard-Abholzeit (Min) ${helpDot('Wird genutzt, wenn beim Schüler keine eigene Abholzeit und kein Wohnort hinterlegt ist.')}</label><input id="e-travdef" type="number" value="${s.travel_default_min || '0'}" min="0" step="5"></div>
      <div class="hint" style="margin:.3rem 0 0">Abholzeit pro Schüler: Fahrschüler → bearbeiten → 🚗 Abholzeit (feste Minuten) und „Standort für Schätzung". Ohne feste Minuten wird aus dem Wohnort geschätzt – vom gewählten oder näheren der beiden Standorte.</div>`)}

    ${sec('📅', 'Buchung & Stornierung', 'Vorausbuchung, Limits, Fristen, Aufklärungstext', `
      <div class="row"><div class="field"><label>Max. Fahrstunden pro Schüler & Woche</label><input id="e-max" type="number" value="${s.max_per_week}" min="1"></div>
        <div class="field"><label>Selbst-Buchung pro Tag ${helpDot('So viele Fahrstunden darf sich ein Fahrschüler pro Tag selbst buchen. 0 = ohne Limit. Deine eigenen Einträge sind nicht betroffen.')}</label><input id="e-maxday" type="number" value="${s.student_max_per_day}" min="0"></div>
        <div class="field"><label>Vorausbuchung (Tage)</label><input id="e-horizon" type="number" value="${s.booking_horizon_days}" min="1"></div></div>
      <div class="row"><div class="field"><label>Kostenlos stornieren bis (Std. vorher) ${helpDot('Bis so viele Stunden vor Beginn darf der Fahrschüler kostenlos absagen.')}</label><input id="e-cancel" type="number" value="${s.cancel_hours}" min="0"></div>
        <div class="field"><label>Sperrfrist – fest ab (Std. vorher) ${helpDot('Ab so vielen Stunden vor Beginn steht der Termin fest – kein Absagen oder Ins-Angebot-Geben mehr.')}</label><input id="e-lock" type="number" value="${s.lock_hours}" min="0"></div></div>
      <div class="field"><label>Toleranz Verspätung (Min) ${helpDot('So viele Minuten Verspätung gelten noch nicht als „nicht erschienen“.')}</label><input id="e-grace" type="number" value="${s.late_grace_min}" step="5"></div>
      <div class="field"><label>Aufklärungstext (wird beim Buchen gezeigt)</label><textarea id="e-policy" rows="4" style="resize:vertical">${esc(s.policy_text || '')}</textarea></div>`)}

    ${sec('🎯', 'Ziele (Tacho)', 'Wochen-, Tages- und Monatsziel', `
      <div class="row"><div class="field"><label>Wochenziel (Stunden)</label><input id="e-wt" type="number" value="${s.weekly_target_h}" step="0.5"></div>
        <div class="field"><label>Untere Zielspanne (Stunden)</label><input id="e-wlo" type="number" value="${s.weekly_lo_h}" step="0.5"></div></div>
      <div class="field"><label>Tagesziel (Stunden)</label><input id="e-dt" type="number" value="${s.daily_target_h}" step="0.5"></div>
      <div class="row"><div class="field"><label>Monatsziel (Std, mind. 80)</label><input id="e-mt" type="number" value="${s.monthly_target_h}" min="80" step="1"></div>
        <div class="field"><label>Monat Skala-Ende (höchstens)</label><input id="e-mmax" type="number" value="${s.monthly_max_h}" min="80" step="1"></div></div>`)}

    ${sec('🏆', 'Sonderfahrten & Rang', 'Soll-Fahrten, Rang-Aufstieg, anonymer Tausch', `
      <div class="row"><div class="field"><label>Soll Überland</label><input id="e-req-u" type="number" value="${s.req_ueberland}" min="0"></div>
        <div class="field"><label>Soll Autobahn</label><input id="e-req-a" type="number" value="${s.req_autobahn}" min="0"></div>
        <div class="field"><label>Soll Nachtfahrt</label><input id="e-req-n" type="number" value="${s.req_nacht}" min="0"></div></div>
      <div class="row"><div class="field"><label>Rang 2 ab (gefahrene Stunden) ${helpDot('Ab so vielen gefahrenen Stunden steigt ein Fahrschüler in Rang 2 auf und darf weiter im Voraus buchen.')}</label><input id="e-rank2" type="number" value="${s.rank2_min_lessons}" min="1"></div>
        <div class="field"><label>Rang 2: Vorausbuchung (Tage) ${helpDot('So viele Tage im Voraus darf ein Rang-2-Fahrschüler buchen.')}</label><input id="e-horizon2" type="number" value="${s.booking_horizon_days_rank2}" min="1"></div></div>
      <label class="ck-line"><input type="checkbox" id="e-anon" ${s.anonymous_swaps === '1' ? 'checked' : ''}> Tausch anonym (Schüler sehen nicht, von wem ein Termin kommt)</label>`)}

    ${sec('🌴', 'Urlaub', 'Urlaubskonto & Gutschrift', `
      <div class="row"><div class="field"><label>Urlaubstag zählt (Min) ${helpDot('So viele Minuten werden pro Urlaubstag deinem Arbeitszeit-/Stundenkonto gutgeschrieben.')}</label><input id="e-vaccredit" type="number" value="${s.vacation_credit_min}" step="10"></div>
        <div class="field"><label>Resturlaub (Tage)</label><input id="e-vacdays" type="number" value="${s.vacation_days_left}" step="1"></div></div>`)}

    ${sec('🛰️', 'Live-Standort & Treffpunkt', 'Abholung, ETA-Tempo, Standard-Treffpunkt', `
      <div class="row"><div class="field"><label>Standort teilen ab (Min vorher) ${helpDot('So viele Minuten vor Beginn kann der Live-Standort mit dem Fahrschüler geteilt werden.')}</label><input id="e-lead" type="number" value="${s.live_lead_min}" min="1"></div>
        <div class="field"><label>Ø Tempo für ETA (km/h) ${helpDot('Durchschnittstempo zur groben Schätzung der Ankunftszeit auf der Live-Karte.')}</label><input id="e-speed" type="number" value="${s.avg_speed_kmh}" min="5"></div></div>
      <div class="field"><label>Standard-Treffpunkt (nur Rückfall)</label>
        <div class="inline"><input id="e-meet" value="${esc(s.meet_default_label || '')}" placeholder="z.B. Fahrschule / Bahnhof" style="flex:1">
          <button class="sec sm" id="e-meet-here" type="button">📍 Standort</button></div>
        <div class="hint" id="e-meet-info" style="margin:.3rem 0 0">${s.meet_default_lat ? '✓ Koordinaten hinterlegt' : 'Ohne Koordinaten nur als Text.'}</div>
        <div class="hint" style="margin:.3rem 0 0">Wird nur genutzt, wenn weder beim Schüler noch beim Termin ein Treffpunkt gesetzt ist.</div></div>`)}

    ${sec('🔒', 'Privatmodus & Registrierung', 'Wer darf sich neu anmelden?', `
      <label class="ck-line"><input type="checkbox" id="e-reg-open" ${s.registration_open === '1' ? 'checked' : ''}> Neue Fahrschüler dürfen sich mit Code registrieren</label>
      <div class="hint" style="margin:.4rem 0 0">Ist der Haken <strong>weg</strong>, läuft Ginoco im <strong>Privatmodus</strong>: Auf der Startseite gibt es keinen „Neu (mit Code)“-Reiter mehr und niemand Neues kann sich anmelden. Deine bestehenden Zugänge (und du selbst) funktionieren weiter. Du kannst das jederzeit wieder öffnen, wenn du Fahrschüler einladen willst.</div>`, s.registration_open !== '1')}

    ${sec('👤', 'Zugang & Kontakt', 'Name, Handynummer, Passwort', `
      <div class="field"><label>Angezeigter Name</label><input id="e-name" value="${esc(s.instructor_name)}"></div>
      <div class="field"><label>Deine Handynummer (Schüler können anrufen/schreiben)</label><input id="e-phone" value="${esc(s.instructor_phone || '')}" placeholder="z.B. 0151 23456789"></div>
      <div class="field"><label>Neues Fahrlehrer-Passwort (leer = unverändert)</label><input id="e-pin" type="password" autocomplete="new-password" placeholder="mind. 8 Zeichen, mit Zahl & Sonderzeichen"></div>
      <div class="sec-auth" id="e-auth"><div class="sec-auth-h">🔐 Authenticator (2-Faktor & „Passwort vergessen")</div>
        <div id="e-auth-body"><span class="hint">Lädt…</span></div></div>`)}

    <div class="actions" style="justify-content:flex-start"><button id="e-save">💾 Alles speichern</button><span id="e-msg" class="muted"></span></div>
  </div>`;
  const updatePreview = () => {
    const start = $('#e-start').value, last = $('#e-last').value;
    const lesson = Number($('#e-lesson').value), br = Number($('#e-break').value);
    const step = lesson + br;
    const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const times = [];
    for (let t = toMin(start); t <= toMin(last); t += step) times.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
    const daily = (times.length * lesson) / 60;
    $('#e-preview').innerHTML = `Ergibt <strong>${times.length} Slots/Tag</strong> (je ${lesson} Min + ${br} Min Pause) um ${times.join(', ') || '–'} (${daily.toFixed(1)} h/Tag).`;
  };
  ['e-start', 'e-last', 'e-lesson', 'e-break'].forEach((id) => $('#' + id).oninput = updatePreview);
  updatePreview();
  renderAuthSection();
  // Arbeitstage-Chips optisch mitschalten
  box.querySelectorAll('#e-days [data-day]').forEach((cb) => cb.onchange = () =>
    cb.closest('.dur-chip')?.classList.toggle('on', cb.checked));
  let meetLat = s.meet_default_lat || '', meetLng = s.meet_default_lng || '';
  $('#e-meet-here').onclick = async () => {
    try { const c = await getPosOnce(); meetLat = c.latitude; meetLng = c.longitude;
      $('#e-meet-info').innerHTML = `✓ Koordinaten übernommen (${meetLat.toFixed(4)}, ${meetLng.toFixed(4)})`; toast('Treffpunkt gesetzt', 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  };
  $('#e-save').onclick = async () => {
    const workdays = [...box.querySelectorAll('[data-day]')].filter((c) => c.checked).map((c) => c.dataset.day).join(',');
    try {
      const r = await api('/api/instructor/settings', { method: 'PUT', body: {
        start_time: $('#e-start').value, last_start: $('#e-last').value,
        lesson_min: Number($('#e-lesson').value), break_min: Number($('#e-break').value),
        weekly_target_h: Number($('#e-wt').value), weekly_lo_h: Number($('#e-wlo').value),
        daily_target_h: Number($('#e-dt').value),
        monthly_target_h: Number($('#e-mt').value), monthly_max_h: Number($('#e-mmax').value),
        workdays: workdays || '1,2,3,4,5',
        max_per_week: Number($('#e-max').value), student_max_per_day: Number($('#e-maxday').value), instructor_name: $('#e-name').value,
        booking_horizon_days: Number($('#e-horizon').value), cancel_hours: Number($('#e-cancel').value),
        lock_hours: Number($('#e-lock').value),
        release_time: $('#e-release').value, short_day_last_start: $('#e-shortlast').value,
        vacation_credit_min: Number($('#e-vaccredit').value), vacation_days_left: Number($('#e-vacdays').value),
        late_grace_min: Number($('#e-grace').value), policy_text: $('#e-policy').value,
        instructor_phone: $('#e-phone').value, live_lead_min: Number($('#e-lead').value),
        avg_speed_kmh: Number($('#e-speed').value), meet_default_label: $('#e-meet').value,
        meet_default_lat: meetLat === '' ? '' : String(meetLat), meet_default_lng: meetLng === '' ? '' : String(meetLng),
        anonymous_swaps: $('#e-anon').checked ? '1' : '0',
        req_ueberland: Number($('#e-req-u').value), req_autobahn: Number($('#e-req-a').value), req_nacht: Number($('#e-req-n').value),
        rank2_min_lessons: Number($('#e-rank2').value), booking_horizon_days_rank2: Number($('#e-horizon2').value),
        registration_open: $('#e-reg-open').checked ? '1' : '0',
        flow_schedule: $('#e-flow').checked ? '1' : '0',
        auto_fill_gaps: $('#e-autofill').checked ? '1' : '0',
        school_label: $('#e-schoollabel').value.trim(),
        school_lat: $('#e-schoollat').value.trim(), school_lng: $('#e-schoollng').value.trim(),
        school2_label: $('#e-school2label').value.trim(),
        school2_lat: $('#e-school2lat').value.trim(), school2_lng: $('#e-school2lng').value.trim(),
        travel_default_min: Number($('#e-travdef').value) || 0,
        new_pin: $('#e-pin').value || undefined } });
      state.settings = r.settings; state.user.name = r.settings.instructor_name;
      toast('Einstellungen gespeichert ✓', 'ok'); $('#e-msg').textContent = 'Gespeichert.';
      if (r.misaligned && r.misaligned.total > 0) promptRealign(r.misaligned);
    } catch (e) { toast(e.message, 'err'); }
  };
}

// Für Kalender-Modal: instrBookings global halten
window.__instrBookings = [];
const _origRenderInstrDay = renderInstrDay;

// ====================== PWA: "App installieren"-Angebot ======================
(function () {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (standalone) return; // laeuft schon als installierte App
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let deferred = null;

  function ensureBtn() {
    let b = document.getElementById('pwa-install');
    if (!b) {
      b = document.createElement('button');
      b.id = 'pwa-install';
      b.className = 'pwa-install';
      b.innerHTML = '📲 App installieren';
      b.onclick = onClick;
      document.body.appendChild(b);
    }
    return b;
  }
  function hide() { const b = document.getElementById('pwa-install'); if (b) b.remove(); }

  async function onClick() {
    if (deferred) {
      deferred.prompt();
      const res = await deferred.userChoice.catch(() => ({}));
      deferred = null;
      if (res && res.outcome === 'accepted') hide();
    } else if (isIOS && typeof modal === 'function') {
      modal(`<h3>ginoco als App installieren</h3>
        <p class="hint">So legst du ginoco wie eine echte App auf deinen Startbildschirm:</p>
        <ol class="hint" style="padding-left:1.1rem;line-height:1.6">
          <li>Tippe unten in Safari auf das <strong>Teilen-Symbol</strong> (Viereck mit Pfeil nach oben).</li>
          <li>Wähle <strong>„Zum Home-Bildschirm"</strong>.</li>
          <li>Auf <strong>„Hinzufügen"</strong> tippen – fertig. 🚗</li>
        </ol>
        <div class="actions"><button onclick="window.__closeModal()">Alles klar</button></div>`);
    }
  }

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; ensureBtn(); });
  window.addEventListener('appinstalled', hide);
  // iOS liefert kein beforeinstallprompt -> Button trotzdem anbieten (fuehrt zur Anleitung)
  if (isIOS) window.addEventListener('load', ensureBtn);
})();
