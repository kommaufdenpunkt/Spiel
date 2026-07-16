'use strict';
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
function applyTheme(key) {
  const t = THEMES[key] || THEMES.nachtblau;
  for (const [k, v] of Object.entries(t.vars)) document.documentElement.style.setProperty(k, v);
  try { localStorage.setItem('fsp-theme', key); } catch {}
  state.theme = THEMES[key] ? key : 'nachtblau';
}
function loadTheme() {
  let key = 'nachtblau';
  try { key = localStorage.getItem('fsp-theme') || 'nachtblau'; } catch {}
  applyTheme(key);
}
loadTheme();

function openThemePicker() {
  const cur = state.theme || 'nachtblau';
  modal(`<h3>Farbe wählen</h3>
    <p class="hint">Alle Themes sind dunkel und augenschonend (kein grelles Weiß, guter Kontrast). Deine Wahl wird auf diesem Gerät gespeichert.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem">
      ${Object.entries(THEMES).map(([k, t]) => `<button class="sec" data-theme="${k}" style="justify-content:flex-start;display:flex;align-items:center;gap:.5rem;${k === cur ? 'outline:2px solid ' + t.dot : ''}">
        <span style="width:16px;height:16px;border-radius:50%;background:${t.dot};display:inline-block"></span>${t.label}${k === cur ? ' ✓' : ''}</button>`).join('')}
    </div>
    <div class="actions"><button class="sec" onclick="window.__closeModal()">Schließen</button></div>`);
  document.querySelectorAll('[data-theme]').forEach((b) => b.onclick = () => { applyTheme(b.dataset.theme); toast('Farbe geändert ✓', 'ok'); openThemePicker(); });
}
window.__openThemePicker = openThemePicker;

async function openProfileModal() {
  const ip = state.settings?.instructor_phone;
  let pr = { name: state.user?.name || '', email: '', phone: state.user?.phone || '', birth_year: '', username: state.user?.username || '' };
  try { const r = await api('/api/my/profile'); if (r.profile) pr = { ...pr, ...r.profile }; } catch {}
  modal(`<h3>Mein Profil</h3>
    <div class="err hidden" id="pf-err"></div>
    <p class="hint">Vervollständige deine Daten. Sie sind <strong>nur für deinen Fahrlehrer</strong> sichtbar – kein anderer Fahrschüler sieht sie.</p>
    <div class="field"><label>Name</label><input id="pf-name" value="${esc(pr.name || '')}" placeholder="Vor- und Nachname"></div>
    <div class="row">
      <div class="field"><label>Handynummer</label><input id="pf-phone" value="${esc(pr.phone || '')}" placeholder="z.B. 0151 23456789"></div>
      <div class="field" style="max-width:130px"><label>Jahrgang</label><input id="pf-year" type="number" value="${pr.birth_year || ''}" min="1930" max="2015" placeholder="1997"></div>
    </div>
    <div class="field"><label>E-Mail (optional)</label><input id="pf-email" type="email" value="${esc(pr.email || '')}"></div>
    <div class="field"><label>Login-Name (fest, ändert sich nicht)</label><input value="${esc(pr.username || '')}" readonly></div>
    ${ip ? `<div class="field"><label>Fahrschule erreichen</label><div class="inline">${contactButtons(ip)}</div></div>` : ''}
    <div class="actions"><button class="sec" onclick="window.__closeModal()">Schließen</button><button id="pf-save">Speichern</button></div>`);
  $('#pf-save').onclick = async () => {
    try {
      await api('/api/my/profile', { method: 'PATCH', body: {
        name: $('#pf-name').value, phone: $('#pf-phone').value,
        email: $('#pf-email').value || null, birth_year: $('#pf-year').value || null } });
      state.user.name = $('#pf-name').value.trim(); state.user.phone = $('#pf-phone').value.trim();
      closeModal(); toast('Profil gespeichert ✓', 'ok'); render();
    } catch (e) { const el = $('#pf-err'); if (el) { el.textContent = e.message; el.classList.remove('hidden'); } else toast(e.message, 'err'); }
  };
}
window.__openPhone = openProfileModal;   // Alias (alte Aufrufe)
window.__openProfile = openProfileModal;

// ---------- Geführter Einstieg (Tutorial) für Fahrschüler ----------
const TOUR = [
  { icon: '👋', title: 'Willkommen bei ginoco', text: 'Hier buchst du deine Fahrstunden selbst – schnell und von überall. In ein paar kurzen Schritten zeige ich dir, wie es geht. Du kannst jederzeit auf „Überspringen“ tippen.' },
  { icon: '📅', title: '1. Fahrstunde buchen', text: 'Wähle oben einen Tag (mit ‹ › oder über das Datum). Freie Zeiten sind <strong>grün</strong> und mit „FREI“ markiert. Tippe auf <strong>Buchen</strong>, wähle die Dauer (z. B. 80 Min) und bestätige mit „Ja, verbindlich buchen“. Fertig! ✅' },
  { icon: '📋', title: '2. Deine Termine', text: 'Oben unter <strong>„Meine Termine“</strong> siehst du alle gebuchten Stunden mit Datum, Uhrzeit und Treffpunkt. Über <strong>„Zum Kalender hinzufügen“</strong> landen sie in deinem Handy-Kalender.' },
  { icon: '🔄', title: '3. Doch keine Zeit?', text: 'Kannst du an dem Tag nicht: Tippe bei der Stunde auf <strong>„Zur Übernahme anbieten“</strong> – ein anderer Fahrschüler kann sie dann übernehmen (anonym, keiner sieht deinen Namen). Ist es noch früh genug, kannst du auch einfach <strong>„Stornieren“</strong>.' },
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

// ---------- API ----------
async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data.error || 'Fehler');
  return data;
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
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast ' + kind; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function modal(html) {
  closeModal();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">${html}</div>`;
  bg.addEventListener('click', (e) => { if (e.target === bg) closeModal(); });
  document.body.appendChild(bg);
  return bg;
}
function closeModal() { const m = $('.modal-bg'); if (m) m.remove(); }

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
    <div class="brand"><span class="logo">🚗</span> ginoco</div>
    <div class="who">
      <span class="role">${u.role === 'instructor' ? 'Fahrlehrer' : 'Fahrschüler'}</span>
      <strong>${esc(u.name || '')}</strong>${u.username ? `<span class="pill">${esc(u.username)}</span>` : ''}
      ${state.liveSharing ? '<button class="ghost sm" onclick="window.__stopLive()" title="Standort-Teilen beenden" style="color:var(--good)">🛰️ Live · Stopp</button>' : ''}
      ${u.role === 'student' ? '<button class="ghost sm" onclick="window.__openTour()" title="Kurze Einführung">❓</button>' : ''}
      ${u.role === 'student' ? '<button class="ghost sm" onclick="window.__openProfile()" title="Mein Profil">👤</button>' : ''}
      <button class="ghost sm" onclick="window.__openThemePicker()" title="Farbe wählen">🎨</button>
      <button class="ghost sm" id="logout">Abmelden</button>
    </div>
  </header>`;
}
function wireLogout() {
  const b = $('#logout');
  if (b) b.onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); state.user = null; render(); };
}

// ---------- Edge-Menüs (links: Navigation, rechts: Aktionen) ----------
// Wie die Kantenleisten am Samsung-Edge: kleiner Griff am Bildschirmrand,
// antippen -> Leiste fährt herein. Große Tap-Flächen, ideal am Handy.
// Logisch gruppiert: Übersicht → Fahrschüler → Planung → System.
// Einträge mit '__group' sind nur Überschriften (nicht anklickbar).
const INSTR_NAV = [
  ['__group', 'Übersicht'],
  ['heute', '📊 Heute & Ziele'], ['kalender', '📅 Kalender'],
  ['__group', 'Fahrschüler'],
  ['schueler', '🧑‍🎓 Fahrschüler'], ['codes', '🔑 Zugangscodes'],
  ['__group', 'Planung'],
  ['arbeitszeiten', '🕒 Arbeitszeiten'], ['theorie', '📚 Theorie & Ausnahmen'],
  ['__group', 'System'],
  ['protokoll', '📋 Protokoll'], ['einstellungen', '⚙️ Einstellungen'],
];
function mountEdgeMenus(role) {
  document.querySelectorAll('.edge-root').forEach((n) => n.remove());
  const leftItems = role === 'instructor'
    ? INSTR_NAV.map(([tab, l]) => tab === '__group'
        ? `<div class="edge-group">${l}</div>`
        : `<button data-nav="${tab}">${l}${tab === 'protokoll' ? ' <span id="ev-badge"></span>' : ''}</button>`).join('')
    : [['week-card', '📅 Meine Woche'], ['notif-card', '🔔 Mitteilungen'],
       ['offers-card', '🎁 Angebote'], ['slots', '🚗 Termin buchen']]
        .map(([id, l]) => `<button data-scroll="${id}">${l}</button>`).join('');
  const rightItems = [
    '<button data-act="theme">🎨 Farbe wählen</button>',
    role === 'student' ? '<button data-act="phone">👤 Mein Profil</button>' : '',
    state.liveSharing ? '<button data-act="live">🛰️ Live-Standort beenden</button>' : '',
    '<button data-act="reload">🔄 Aktualisieren</button>',
    '<button data-act="logout">🚪 Abmelden</button>',
  ].filter(Boolean).join('');
  const root = document.createElement('div');
  root.className = 'edge-root';
  root.innerHTML = `
    <button class="edge-handle left" aria-label="Menü öffnen">☰</button>
    <button class="edge-handle right" aria-label="Aktionen öffnen">⋯</button>
    <div class="edge-overlay"></div>
    <aside class="edge-panel left"><div class="edge-title">Menü</div>${leftItems}</aside>
    <aside class="edge-panel right"><div class="edge-title">Aktionen</div>${rightItems}</aside>`;
  document.body.appendChild(root);
  const close = () => root.classList.remove('open-left', 'open-right');
  root.querySelector('.edge-handle.left').onclick = () => { close(); root.classList.add('open-left'); };
  root.querySelector('.edge-handle.right').onclick = () => { close(); root.classList.add('open-right'); };
  root.querySelector('.edge-overlay').onclick = close;
  // aktiven Tab markieren (Fahrlehrer)
  if (role === 'instructor') root.querySelectorAll('[data-nav]').forEach((b) =>
    b.classList.toggle('active', b.dataset.nav === state.instrTab));
  root.querySelectorAll('[data-nav]').forEach((b) => b.onclick = () => {
    state.instrTab = b.dataset.nav; close(); drawInstrTab();
    root.querySelectorAll('[data-nav]').forEach((x) => x.classList.toggle('active', x === b));
  });
  root.querySelectorAll('[data-scroll]').forEach((b) => b.onclick = () => {
    close(); const el = document.getElementById(b.dataset.scroll);
    if (el && !el.classList.contains('hidden')) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else toast('Dieser Bereich ist gerade nicht verfügbar', 'err');
  });
  root.querySelectorAll('[data-act]').forEach((b) => b.onclick = async () => {
    close(); const a = b.dataset.act;
    if (a === 'theme') window.__openThemePicker?.();
    else if (a === 'phone') window.__openPhone?.();
    else if (a === 'live') window.__stopLive?.();
    else if (a === 'reload') location.reload();
    else if (a === 'logout') { await api('/api/auth/logout', { method: 'POST' }); state.user = null; render(); }
  });
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
  const TABS = mode === 'admin'
    ? [['instr', 'Fahrlehrer']]
    : mode === 'student'
      ? [['login', 'Anmelden'], ['register', 'Neu (mit Code)']]
      : [['login', 'Anmelden'], ['register', 'Neu (mit Code)'], ['instr', 'Fahrlehrer']];
  let tab = TABS[0][0];
  const tagline = mode === 'admin' ? 'Fahrlehrer-Bereich' : 'Fahrstunden einfach online buchen';
  const draw = () => {
    app.innerHTML = `<div class="auth-wrap"><div class="auth">
      <div class="logo-big">🚗</div>
      <h1>ginoco</h1>
      <div class="tag">${tagline}</div>
      <div class="card">
        ${TABS.length > 1 ? `<div class="tabs">
          ${TABS.map(([t, l]) => `<button data-t="${t}" class="${tab === t ? 'active' : ''}">${l}</button>`).join('')}
        </div>` : ''}
        <div id="authbody"></div>
      </div>
      <div class="center"><button class="ghost sm" onclick="window.__openThemePicker()">🎨 Farbe wählen</button></div>
    </div></div>`;
    app.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => { tab = b.dataset.t; draw(); });
    const body = $('#authbody');
    if (tab === 'login') body.innerHTML = loginForm();
    else if (tab === 'register') body.innerHTML = registerForm();
    else body.innerHTML = instrForm();
    wireAuth(tab);
  };
  draw();
}

const errBox = () => `<div class="err hidden" id="autherr"></div>`;
function showErr(msg) { const e = $('#autherr'); if (e) { e.textContent = msg; e.classList.remove('hidden'); } }

function loginForm() {
  return `${errBox()}
    <div class="field"><label>Login-Name oder E-Mail</label><input id="l-email" autocomplete="username" placeholder="z.B. MM1997"></div>
    <div class="field"><label>Passwort</label><input id="l-pw" type="password" autocomplete="current-password"></div>
    <div class="form-actions"><button id="l-go">Anmelden</button></div>
    <p class="hint" style="margin-top:.6rem">Passwort vergessen? Melde dich bei deinem Fahrlehrer – er setzt dir ein neues.</p>`;
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
    <div class="field"><label>PIN</label><input id="i-pin" type="password" autocomplete="current-password"></div>
    <div class="form-actions"><button id="i-go">Anmelden</button></div>`;
}

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
        await api('/api/auth/instructor', { method: 'POST', body: { pin: $('#i-pin').value } });
        done();
      } catch (e) { showErr(e.message); }
    };
  }
  app.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const b = app.querySelector('.form-actions button'); if (b) b.click(); }
  }));
}

// ====================== FAHRSCHÜLER ======================
async function renderStudent() {
  app.innerHTML = header() + `<main>
    <div class="card hidden" id="live-card"></div>
    <div class="card hidden" id="notif-card"></div>
    <div class="card" id="week-card"></div>
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
      <div class="slots" id="slots"></div>
    </div>
  </main>`;
  const horizon = state.settings?.booking_horizon_days || 14;
  $('#horizon-note').textContent = `(bis ${horizon} Tage im Voraus)`;
  wireLogout();
  $('#dpick').value = state.date;
  $('#prev').onclick = () => { state.date = addDays(state.date, -1); syncStudent(); };
  $('#next').onclick = () => { state.date = addDays(state.date, 1); syncStudent(); };
  $('#dpick').onchange = (e) => { state.date = e.target.value; syncStudent(); };
  mountEdgeMenus('student');
  syncStudent();
  // Beim ersten Mal automatisch die kurze Einführung zeigen
  let tourDone = false;
  try { tourDone = localStorage.getItem('ginoco-tour-done') === '1'; } catch {}
  if (!tourDone && !state._tourShown) { state._tourShown = true; setTimeout(openTour, 500); }
}

let myBookingsCache = [];
async function syncStudent() {
  $('#dlabel').textContent = fmtDay(state.date);
  $('#dpick').value = state.date;
  try {
    const [mine, day, off, notif, away] = await Promise.all([
      api('/api/my/bookings'), api('/api/slots?date=' + state.date),
      api('/api/offers'), api('/api/my/notifications'), api('/api/away')]);
    myBookingsCache = mine.bookings;
    renderAway(away.away);
    renderNotifications(notif.notifications, notif.unread);
    refreshStudentLive();
    renderWeekCard(mine.weekInfo, mine.bookings, mine.progress);
    { const hn = $('#horizon-note'); if (hn && mine.progress) hn.textContent = `(bis ${mine.progress.horizon} Tage im Voraus · Rang ${mine.progress.rank})`; }
    renderOffers(off.offers, mine.weekInfo);
    state.lastSlotStart = day.slots.length ? day.slots[day.slots.length - 1].start : null;
    renderSlots(day.slots, mine.bookings);
  } catch (e) { toast(e.message, 'err'); }
}

function renderWeekCard(wi, bookings, progress) {
  const allUpcoming = bookings.filter((b) => b.date >= todayStr() && b.status !== 'done')
    .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
  const upcoming = bookings.filter((b) => b.date >= todayStr()).sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
  const remainColor = wi.remaining > 0 ? 'good' : 'bad';
  const next = allUpcoming.find((b) => b.status === 'booked');
  $('#week-card').innerHTML = `
    <h2>Meine Fahrstunden <span class="sub">diese Woche (${fmtShort(wi.from)}–${fmtShort(wi.to)})</span></h2>
    ${next ? `<div class="bitem" style="background:var(--booked);border-color:var(--booked-b);margin-bottom:.8rem">
      <div><div class="meta" style="color:var(--muted)">Deine nächste Fahrstunde</div>
      <div class="when" style="font-size:1.05rem">${WD_LONG[isoDow(next.date) - 1]}, ${fmtShort(next.date)} · ${next.start_time} Uhr</div></div>
      <div class="pill" style="background:var(--brand);color:#fff">${countdownLabel(next.date, next.start_time)}</div>
    </div>` : ''}
    <div class="inline" style="margin-bottom:1rem">
      <span class="pill" style="background:${wi.remaining > 0 ? 'var(--good-bg)' : 'var(--bad-bg)'};color:var(--${remainColor})">
        ${wi.count} von ${wi.max} gebucht · noch ${wi.remaining} frei
      </span>
      ${upcoming.length ? '<button class="ghost sm" id="ical-btn">📅 Zum Kalender hinzufügen</button>' : ''}
    </div>
    ${progress ? studentProgress(progress) : ''}
    ${upcoming.length ? `<div class="blist">${upcoming.map(studentBookingItem).join('')}</div>`
      : '<p class="muted">Noch keine kommenden Termine gebucht.</p>'}`;
  const c = $('#week-card');
  c.querySelectorAll('[data-cancel]').forEach((b) => b.onclick = () => cancelBooking(b.dataset.cancel));
  c.querySelectorAll('[data-offer]').forEach((b) => b.onclick = () => offerBooking(b.dataset.offer));
  c.querySelectorAll('[data-withdraw]').forEach((b) => b.onclick = () => withdrawOffer(b.dataset.withdraw));
  const ic = $('#ical-btn');
  if (ic) ic.onclick = () => exportICS(upcoming);
}

function studentProgress(p) {
  const toRank2 = Math.max(0, p.rank2Min - p.doneCount);
  const sonder = ['ueberland', 'autobahn', 'nacht'].map((k) => {
    const have = p.sonder?.[k] || 0, need = p.req[k], done = have >= need;
    return `<span class="pill" style="${done ? 'background:var(--good-bg);color:var(--good)' : ''}">${TYPE_ICON[k]} ${TYPE_LABEL[k]} ${have}/${need}</span>`;
  }).join(' ');
  return `<div style="background:var(--card2);border:1px solid var(--line);border-radius:11px;padding:.7rem .9rem;margin-bottom:1rem">
    <div class="inline" style="margin-bottom:.4rem">
      <span class="pill" style="background:${p.rank >= 2 ? 'var(--good-bg);color:var(--good)' : 'var(--brand);color:#fff'}">🏅 Rang ${p.rank}</span>
      <span class="muted" style="font-size:.82rem">${p.doneCount} Fahrstunden gefahren · ${p.rank >= 2 ? `du siehst ${p.horizon} Tage im Voraus` : `noch ${toRank2} bis Rang 2 (dann ${state.settings?.booking_horizon_days_rank2 || 21} Tage voraus)`}</span>
    </div>
    <div class="inline">${sonder}</div>
  </div>`;
}

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
    st = '<span class="badge offer">🔄 zur Übernahme angeboten</span>';
    actions = `<button class="ghost sm" data-withdraw="${b.id}">Angebot zurücknehmen</button>`;
  } else {
    st = '<span class="badge booked">gebucht</span>';
    const lockH = state.settings?.lock_hours || 36;
    if (h < lockH) {
      // gesperrt: Termin steht fest
      actions = `<span class="pill">🔒 fest gebucht</span>`;
    } else if (soon) {
      // zwischen Sperr- und Storno-Frist: nur anbieten
      actions = `<button class="sm" data-offer="${b.id}" title="Kostenfreies Storno nur bis ${cancelH} h vorher – biete die Stunde anderen an">Zur Übernahme anbieten</button>`;
    } else {
      actions = `<button class="ghost sm" data-cancel="${b.id}">Stornieren</button>
        <button class="ghost sm" data-offer="${b.id}">Anbieten</button>`;
    }
  }
  return `<div class="bitem">
    <div>
      <div class="when">${WD[isoDow(b.date) - 1]} ${fmtShort(b.date)} · ${b.start_time} <span class="muted" style="font-weight:400">(${b.duration_min} Min)</span></div>
      <div class="meta">${st} ${typeBadge(b.lesson_type)} ${gear} ${b.plate ? '· ' + esc(b.plate) : ''}
        ${b.status === 'booked' && soon ? `<span class="muted">· in ${h < 1 ? '<1' : Math.round(h)} h</span>` : ''}</div>
    </div>
    <div class="inline">${actions}</div>
  </div>`;
}

// ---------- Live-Verfolgung (Schüler) ----------
let studentLivePoll = null;
async function refreshStudentLive() {
  const card = $('#live-card'); if (!card) return;
  let d;
  try { d = await api('/api/my/live'); } catch { return; }
  if (!d.window) {
    card.classList.add('hidden');
    if (studentLivePoll) { clearInterval(studentLivePoll); studentLivePoll = null; }
    return;
  }
  card.classList.remove('hidden');
  const phone = state.settings?.instructor_phone;
  const contact = phone ? `<div class="inline" style="margin-top:.6rem">${contactButtons(phone, 'Hallo, ich warte am Treffpunkt auf dich.')}</div>` : '';
  if (!d.active) {
    const note = d.busy
      ? 'Dein Fahrlehrer ist gerade noch in einer Fahrstunde. Sein Standort wird geteilt, sobald er unterwegs zu dir ist.'
      : `Sobald dein Fahrlehrer seinen Standort teilt (ca. ${d.lead} Min vorher), kannst du hier live sehen, wo er ist und wann er da ist.`;
    card.innerHTML = `<h2>📍 Treffpunkt</h2>
      <p>Deine Fahrstunde beginnt in <strong>${d.booking.minutesToStart} Min</strong> (${d.booking.start_time} Uhr).</p>
      ${d.meet?.label ? `<p class="meta">Treffpunkt: <strong>${esc(d.meet.label)}</strong></p>` : ''}
      <p class="hint">${note}</p>${contact}`;
  } else {
    const loc = d.location;
    const dd = 0.008, bbox = [loc.lng - dd, loc.lat - dd, loc.lng + dd, loc.lat + dd].join(',');
    const mapSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${loc.lat},${loc.lng}`;
    const route = d.meet?.lat != null
      ? `https://www.google.com/maps/dir/?api=1&origin=${loc.lat},${loc.lng}&destination=${d.meet.lat},${d.meet.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`;
    const upd = new Date(loc.updated_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    card.innerHTML = `<h2>🛰️ Dein Fahrlehrer ist unterwegs</h2>
      <div class="inline" style="margin-bottom:.6rem">
        ${d.etaMin != null ? `<span class="pill" style="background:var(--good-bg);color:var(--good);font-size:.95rem">🚗 ca. ${d.etaMin} Min</span>` : ''}
        ${d.distanceKm != null ? `<span class="pill">${d.distanceKm < 1 ? Math.round(d.distanceKm * 1000) + ' m' : d.distanceKm.toFixed(1) + ' km'} entfernt</span>` : ''}
        <span class="pill">aktualisiert ${upd}</span>
      </div>
      <iframe title="Karte" src="${mapSrc}" style="width:100%;height:300px;border:1px solid var(--line);border-radius:10px" loading="lazy"></iframe>
      <div class="inline" style="margin-top:.6rem">
        ${d.meet?.label ? `<span class="pill">📍 ${esc(d.meet.label)}</span>` : ''}
        <a class="pill" href="${route}" target="_blank" rel="noopener" style="text-decoration:none;background:var(--brand);color:#fff">🧭 Route öffnen</a>
      </div>
      <p class="hint" style="margin-top:.4rem">Entfernung ist Luftlinie, ETA eine Schätzung.</p>${contact}`;
  }
  if (!studentLivePoll) studentLivePoll = setInterval(refreshStudentLive, 15000);
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

function renderNotifications(notifs, unread) {
  const card = $('#notif-card');
  if (!notifs || !notifs.length) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  const icon = (k) => k === 'offer' ? '🔄' : k === 'shift' ? '🕐' : 'ℹ️';
  card.innerHTML = `<h2>🔔 Benachrichtigungen ${unread ? `<span class="badge offer">${unread} neu</span>` : ''}</h2>
    <div class="blist">${notifs.map((n) => `<div class="bitem ${n.read ? '' : 'warm'}">
      <div><div class="meta" style="font-size:.9rem;color:var(--ink)">${icon(n.kind)} ${esc(n.message)}</div>
      <div class="meta">${new Date(n.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div></div>
    </div>`).join('')}</div>
    ${unread ? '<div style="margin-top:.8rem"><button class="sec sm" id="notif-read">Als gelesen markieren</button></div>' : ''}`;
  const b = $('#notif-read');
  if (b) b.onclick = async () => { try { await api('/api/my/notifications/read', { method: 'POST' }); syncStudent(); } catch (e) { toast(e.message, 'err'); } };
}

function renderOffers(offers, wi) {
  const card = $('#offers-card');
  if (!offers.length) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  const canTake = wi.remaining > 0;
  card.innerHTML = `<h2>🔄 Freie Übernahme-Angebote <span class="sub">Fahrstunden, die andere abgeben</span></h2>
    ${!canTake ? '<p class="hint">Du hast diese Woche schon dein Limit erreicht – Übernahme aus dieser Woche ist gesperrt.</p>' : ''}
    <div class="blist">${offers.map((o) => `<div class="bitem warm">
      <div><div class="when">${WD[isoDow(o.date) - 1]} ${fmtShort(o.date)} · ${o.start_time} <span class="muted" style="font-weight:400">(${o.duration_min} Min)</span></div>
      <div class="meta">Möchtest du diese Fahrstunde übernehmen?</div></div>
      <div class="inline">
        ${canTake ? `<button class="sm" data-take="${o.id}">Übernehmen</button>` : ''}
        <button class="ghost sm" data-decline="${o.id}">Keine Zeit</button>
      </div></div>`).join('')}</div>`;
  card.querySelectorAll('[data-take]').forEach((b) => b.onclick = () => takeOffer(b.dataset.take));
  card.querySelectorAll('[data-decline]').forEach((b) => b.onclick = () => declineOffer(b.dataset.decline));
}

async function offerBooking(id) {
  if (!confirm('Diese Fahrstunde anderen Fahrschülern zur Übernahme anbieten?')) return;
  try { await api('/api/bookings/' + id + '/offer', { method: 'POST' }); toast('Angeboten – andere können jetzt übernehmen', 'ok'); syncStudent(); }
  catch (e) { toast(e.message, 'err'); }
}
async function withdrawOffer(id) {
  try { await api('/api/bookings/' + id + '/withdraw', { method: 'POST' }); toast('Angebot zurückgenommen', 'ok'); syncStudent(); }
  catch (e) { toast(e.message, 'err'); }
}
async function takeOffer(id) {
  try { await api('/api/bookings/' + id + '/take', { method: 'POST' }); toast('Fahrstunde übernommen ✓', 'ok'); syncStudent(); }
  catch (e) { toast(e.message, 'err'); }
}
async function declineOffer(id) {
  try { await api('/api/bookings/' + id + '/decline', { method: 'POST' }); toast('Abgelehnt', 'ok'); syncStudent(); }
  catch (e) { toast(e.message, 'err'); }
}

function renderSlots(slots, mine) {
  const mineToday = new Set(mine.filter((b) => b.date === state.date && b.status !== 'cancelled').map((b) => b.start_time));
  const el = $('#slots');
  if (!slots.length) { el.innerHTML = '<p class="muted">Für diesen Tag gibt es keine Slots.</p>'; return; }
  el.innerHTML = slots.map((s) => {
    const mineHere = mineToday.has(s.start);
    let cls = s.state, inner = '';
    if (mineHere) {
      inner = `<span class="tag b">Dein Termin</span><button class="ghost sm" data-cancel-time="${s.start}">Stornieren</button>`;
      cls = 'booked';
    } else if (s.state === 'free') {
      inner = `<span class="tag g">frei</span><button class="sm" data-book="${s.start}" data-dur="${s.duration}">Buchen</button>`;
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
      <div class="dur">${s.start}–${s.end} · ${s.duration} Min</div>
      ${inner}
    </div>`;
  }).join('');
  el.querySelectorAll('[data-book]').forEach((b) => b.onclick = () => bookSlot(b.dataset.book, Number(b.dataset.dur)));
  el.querySelectorAll('[data-cancel-time]').forEach((b) => b.onclick = () => {
    const bk = myBookingsCache.find((x) => x.date === state.date && x.start_time === b.dataset.cancelTime);
    if (bk) cancelBooking(bk.id);
  });
}

function bookSlot(start, dur) {
  const cancelH = state.settings?.cancel_hours || 48;
  const lockH = state.settings?.lock_hours || 36;
  let allowed = String(state.user?.allowed_durations || '80').split(',').map(Number).filter((n) => n > 0).sort((a, b) => a - b);
  // Der letzte Slot des Tages ist nur als volle Stunde (>= 80 Min) buchbar.
  const isLast = state.lastSlotStart && start === state.lastSlotStart;
  if (isLast) allowed = allowed.filter((d) => d >= 80);
  if (!allowed.length) {
    modal(`<h3>Termin buchen</h3>
      <div class="warnbox">Der letzte Slot des Tages ist nur als 80- oder 120-Minuten-Stunde buchbar – dafür bist du nicht freigeschaltet. Bitte wähle einen früheren Slot.</div>
      <div class="actions"><button class="sec" onclick="window.__closeModal()">Schließen</button></div>`);
    return;
  }
  const defDur = allowed.includes(80) ? 80 : allowed[0];
  const durSelect = allowed.length > 1
    ? `<div class="field"><label>Dauer wählen</label><select id="bk-dur">${allowed.map((d) => `<option value="${d}" ${d === defDur ? 'selected' : ''}>${d} Minuten</option>`).join('')}</select></div>`
    : '';
  modal(`<h3>Termin verbindlich buchen?</h3>
    <div class="warnbox">
      Bist du wirklich sicher, dass du diesen Termin nehmen willst?
    </div>
    <p style="margin:.6rem 0 .2rem"><strong>${WD_LONG[isoDow(state.date) - 1]}, ${fmtShort(state.date)} um ${start} Uhr</strong>${allowed.length > 1 ? '' : ` · ${allowed[0]} Min`}</p>
    ${isLast ? '<div class="hint" style="margin:.2rem 0 .3rem">Letzter Slot des Tages – nur als volle Stunde (80 oder 120 Min).</div>' : ''}
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
      closeModal(); toast('Termin gebucht ✓', 'ok'); syncStudent();
    } catch (e) { toast(e.message, 'err'); }
  };
}
async function cancelBooking(id) {
  if (!confirm('Diesen Termin wirklich stornieren?')) return;
  try { await api('/api/bookings/' + id, { method: 'DELETE' }); toast('Storniert', 'ok'); syncStudent(); }
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
  if (t === 'heute') return tabHeute();
  if (t === 'kalender') return tabKalender();
  if (t === 'codes') return tabCodes();
  if (t === 'schueler') return tabSchueler();
  if (t === 'theorie') return tabTheorie();
  if (t === 'arbeitszeiten') return tabArbeitszeiten();
  if (t === 'protokoll') return tabProtokoll();
  if (t === 'einstellungen') return tabEinstellungen();
}

// ---- Tab: Heute & Ziele (Tacho) ----
async function tabHeute() {
  const box = $('#itab');
  box.innerHTML = `<div class="card hidden" id="live-card"></div>
    <div class="card"><h2>Wochenziel</h2><div id="gauge"></div><div id="tiles"></div></div>
    <div class="card"><h2>Heute <span class="sub" id="today-sub"></span></h2><div id="today-list"></div></div>`;
  try {
    renderLiveInstr();
    const stats = await api('/api/instructor/stats?date=' + todayStr());
    renderGauge($('#gauge'), stats);
    renderTiles($('#tiles'), stats);
    const ov = await api('/api/instructor/overview?from=' + todayStr() + '&to=' + todayStr());
    $('#today-sub').textContent = fmtDay(todayStr());
    renderInstrDay($('#today-list'), todayStr(), ov.bookings, ov.blocks);
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
  card.innerHTML = `<h2>🛰️ Live-Standort</h2>
    ${soon ? `<p class="hint">In <strong>${soon.minutes} Min</strong> beginnt die Fahrstunde mit <strong>${esc(soon.student_name)}</strong> (${soon.start_time} Uhr). Teile deinen Standort, damit ${esc(soon.student_name.split(' ')[0])} sieht, wann du da bist.</p>`
      : '<p class="hint">Du kannst deinen Standort mit dem nächsten Fahrschüler teilen.</p>'}
    ${sharing
      ? `<div class="inline"><span class="pill" style="background:var(--good-bg);color:var(--good)" id="live-instr" data-ts="">📍 Standort wird geteilt …</span>
         <button class="danger sm" id="live-stop">Teilen beenden</button></div>`
      : `<button id="live-start">🛰️ Standort jetzt teilen</button>
         <p class="hint" style="margin-top:.5rem">Dein Browser fragt einmal nach der Standort-Erlaubnis. Läuft, solange die App offen ist.</p>`}`;
  if (sharing) $('#live-stop').onclick = () => stopLiveShare();
  else $('#live-start').onclick = () => startLiveShare();
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
    : '<span class="badge booked">gebucht</span>';
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
    <div class="field"><label>Grund (bei Absage/Nichterscheinen, optional)</label><input id="m-reason" value="${esc(b.reason || '')}"></div>
    <div class="field"><label>Notiz (optional)</label><input id="m-note" value="${esc(b.note || '')}"></div>
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
        late_minutes: Number($('#m-late').value) || 0, attended: att === '' ? null : (att === '1'),
        lesson_type: $('#m-type').value || 'normal',
        meet_label: $('#m-meet').value, meet_lat: meetLat ?? '', meet_lng: meetLng ?? '' };
      if ($('#m-date').value !== b.date) body.date = $('#m-date').value;
      if ($('#m-time').value !== b.start_time) body.start_time = $('#m-time').value;
      await api('/api/bookings/' + id, { method: 'PATCH', body });
      closeModal(); toast('Gespeichert ✓', 'ok'); refreshEventBadge(); drawInstrTab();
    } catch (e) { toast(e.message, 'err'); }
  };
}
window.__closeModal = closeModal;

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
      <button class="ghost sm" id="k-late" style="margin-left:auto">⏱️ Ich komme später</button>
      <button class="ghost sm" id="k-gap">🧩 Lücken schließen</button>
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
  $('#k-late').onclick = () => openLateModal();
  loadK();
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
  } catch (e) { toast(e.message, 'err'); }
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
    <p class="hint">Als Fahrlehrer kannst du frei buchen (z.B. für einen Schüler eintragen oder eine Sonderstunde).</p>
    <div class="field"><label>Datum</label><input type="date" id="a-date" value="${state.date}"></div>
    <div class="row">
      <div class="field"><label>Uhrzeit</label><input id="a-time" value="${s.start_time || '12:00'}" placeholder="HH:MM"></div>
      <div class="field"><label>Dauer (Min)</label><input id="a-dur" type="number" value="${s.lesson_min}" step="5" min="10"></div>
    </div>
    <div class="field"><label>Fahrschüler (optional)</label>
      <select id="a-student"><option value="">– kein Schüler / Sonstiges –</option>
        ${students.map((st) => `<option value="${st.id}">${esc(st.name)}</option>`).join('')}
      </select></div>
    <div class="field"><label>Titel (falls kein Schüler)</label><input id="a-title" placeholder="z.B. Prüfung, Sonderfahrt"></div>
    <div class="actions">
      <button class="sec" onclick="window.__closeModal()">Abbrechen</button>
      <button id="a-save">Anlegen</button>
    </div>`);
  $('#a-save').onclick = async () => {
    try {
      await api('/api/bookings', { method: 'POST', body: {
        date: $('#a-date').value, start_time: $('#a-time').value, duration_min: Number($('#a-dur').value),
        student_id: $('#a-student').value || null, title: $('#a-title').value } });
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
    $('#s-list').innerHTML = `
      <div class="inline" style="margin-bottom:.7rem;gap:.5rem">
        <input id="s-search" placeholder="🔍 Suchen: Name, Login-Name, Telefon oder E-Mail …" style="flex:1" autocomplete="off">
        <span class="pill" id="s-count">${students.length}</span>
      </div>
      <p class="muted hidden" id="s-noresult">Keine Treffer.</p>
      <table>
      <tr><th>Name</th><th>Login-Name</th><th>Kontakt</th><th>Treffpunkt</th><th>Gefahren / Rang</th><th>Sonderfahrten</th><th>Erlaubte Längen (Min)</th></tr>
      ${students.map((s) => {
        const searchStr = [s.name, s.username, s.email, s.phone].filter(Boolean).join(' ').toLowerCase();
        const durs = String(s.allowed_durations || '80').split(',').map(Number);
        const boxes = [40, 80, 120].map((d) => `<label style="margin:0;font-weight:600"><input type="checkbox" data-sdur="${s.id}" value="${d}" ${durs.includes(d) ? 'checked' : ''} style="width:auto"> ${d}</label>`).join(' ');
        const hasHome = s.home_label || s.home_lat != null;
        const homeCell = hasHome
          ? `<span class="pill" style="background:var(--good-bg);color:var(--good)">📍 ${esc(s.home_label || 'gesetzt')}</span>`
          : `<span class="muted">– nicht vereinbart –</span>`;
        const isArch = !!s.archived_at;
        return `<tr data-search="${esc(searchStr)}">
          <td><strong>${esc(s.name)}</strong>${s.birth_year ? ` <span class="muted">(${s.birth_year})</span>` : ''}
            ${isArch ? '<br><span class="pill" style="background:var(--good-bg);color:var(--good)">✅ bestanden</span>' : ''}
            ${s.notes ? `<br><span class="muted" title="${esc(s.notes)}" style="font-size:.78rem">📝 ${esc(s.notes.length > 40 ? s.notes.slice(0, 40) + '…' : s.notes)}</span>` : ''}
            <div class="inline" style="margin-top:.3rem;gap:.3rem;flex-wrap:wrap">
              <button class="ghost sm" data-edit="${s.id}">✏️ Bearbeiten</button>
              ${isArch
                ? `<button class="ghost sm" data-react="${s.id}" style="color:var(--brand)">↩︎ Reaktivieren</button>`
                : `<button class="ghost sm" data-arch="${s.id}" data-aname="${esc(s.name)}" style="color:var(--good)">✅ Bestanden</button>`}
              <button class="ghost sm" data-del="${s.id}" data-dname="${esc(s.name)}" style="color:var(--bad)">🗑️</button>
            </div></td>
          <td><span class="codechip">${esc(s.username || '–')}</span><br><button class="ghost sm" data-reset="${s.id}" data-uname="${esc(s.username || '')}" data-sname="${esc(s.name)}" style="margin-top:.3rem">🔑 Zugangsdaten</button></td>
          <td>${esc(s.email || '')}<br><span class="muted">${esc(s.phone || '–')}</span>${s.phone ? '<br>' + contactButtons(s.phone, `Hallo ${s.name.split(' ')[0]}, hier ${state.settings?.instructor_name || 'deine Fahrschule'}:`) : ''}</td>
          <td>${homeCell}<br><button class="ghost sm" data-home="${s.id}" data-sname="${esc(s.name)}" data-hlabel="${esc(s.home_label || '')}" data-hlat="${s.home_lat != null ? s.home_lat : ''}" data-hlng="${s.home_lng != null ? s.home_lng : ''}" style="margin-top:.3rem">Treffpunkt festlegen</button></td>
          <td>${s.done_count} Std.<br><span class="pill" style="background:${s.rank >= 2 ? 'var(--good-bg);color:var(--good)' : ''}">Rang ${s.rank} · ${s.horizon} Tage</span></td>
          <td>${sonderCell(s)}</td>
          <td><div class="inline">${boxes} <button class="sec sm" data-savedur="${s.id}">Speichern</button></div></td>
        </tr>`;
      }).join('')}
    </table>`;
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
      $('#s-list').querySelectorAll('tr[data-search]').forEach((tr) => {
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
    <div class="field"><label>Name *</label><input id="cs-name" placeholder="Vor- und Nachname" autocomplete="off"></div>
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
    const name = $('#cs-name').value.trim();
    if (!name) { showErr('Bitte einen Namen eingeben.'); return; }
    const durs = [...document.querySelectorAll('.cs-dur')].filter((c) => c.checked).map((c) => Number(c.value));
    const body = { name, birth_year: $('#cs-year').value || undefined, phone: $('#cs-phone').value || undefined,
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
  modal(`<h3>${esc(s.name)} bearbeiten</h3>
    ${errBox()}
    <div class="field"><label>Name</label><input id="es-name" value="${esc(s.name)}"></div>
    <div class="row">
      <div class="field" style="max-width:130px"><label>Jahrgang</label><input id="es-year" type="number" value="${s.birth_year || ''}" min="1930" max="2015"></div>
      <div class="field"><label>Telefon</label><input id="es-phone" value="${esc(s.phone || '')}"></div>
    </div>
    <div class="field"><label>E-Mail</label><input id="es-email" type="email" value="${esc(s.email || '')}"></div>
    <div class="field"><label>📝 Notiz / Karteikarte (nur für dich)</label>
      <textarea id="es-notes" rows="4" placeholder="z.B. Ausbildungsstand, was noch geübt werden muss, Besonderheiten …" style="resize:vertical">${esc(s.notes || '')}</textarea></div>
    <div class="actions">
      <button class="sec" onclick="window.__closeModal()">Abbrechen</button>
      <button id="es-go">Speichern</button>
    </div>`);
  $('#es-go').onclick = async () => {
    try {
      await api('/api/students/' + s.id, { method: 'PATCH', body: {
        name: $('#es-name').value, birth_year: $('#es-year').value || null,
        phone: $('#es-phone').value || null, email: $('#es-email').value || null,
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
    } catch (e) { toast(e.message, 'err'); }
  };
}

// ---- Tab: Arbeitszeiten / Dienstplan (kurze Tage, freie Tage) ----
async function tabArbeitszeiten() {
  const s = state.settings;
  const box = $('#itab');
  box.innerHTML = `<div class="card">
    <h2>Arbeitszeiten & Dienstplan <span class="sub">Resturlaub: ${s.vacation_days_left ?? '–'} Tage</span></h2>
    <p class="hint">Trage hier ein, wenn ein Tag <strong>kürzer</strong> sein soll (z.B. wenn deine Frau frei hat – früher Feierabend), du ganz <strong>frei</strong> hast oder <strong>Urlaub</strong> nimmst. Urlaubstage zählen je ${s.vacation_credit_min} Min als Arbeitszeit. Die buchbaren Slots passen sich für Schüler automatisch an.</p>
    <div class="row">
      <div class="field"><label>Datum</label><input type="date" id="w-date" value="${state.date}"></div>
      <div class="field" style="max-width:210px"><label>Art</label>
        <select id="w-type">
          <option value="short">Kurzer Tag (früher Feierabend)</option>
          <option value="free">Ganzer Tag frei</option>
          <option value="vacation">Urlaub (${s.vacation_credit_min} Min)</option>
        </select></div>
    </div>
    <div class="row" id="w-times">
      <div class="field"><label>Arbeitsbeginn</label><input id="w-start" value="${s.start_time}"></div>
      <div class="field"><label>Letzter Slot</label><input id="w-last" value="${s.short_day_last_start || '13:35'}"></div>
    </div>
    <div class="inline" style="margin:.2rem 0 1rem"><button id="w-add">Eintragen</button>
      <span class="hint" style="margin:0" id="w-preview"></span></div>
    <div id="w-list"></div>
  </div>`;
  const typeSel = $('#w-type');
  const times = $('#w-times');
  const syncType = () => {
    const t = typeSel.value;
    times.style.display = (t === 'free' || t === 'vacation') ? 'none' : 'flex';
    if (t === 'short') { $('#w-start').value = s.start_time; $('#w-last').value = s.short_day_last_start || '13:35'; }
    updateWPreview();
  };
  const updateWPreview = () => {
    if (typeSel.value === 'free') { $('#w-preview').textContent = 'Ganzer Tag frei – keine Slots.'; return; }
    if (typeSel.value === 'vacation') { $('#w-preview').textContent = `Urlaub – zählt ${s.vacation_credit_min} Min als Arbeitszeit.`; return; }
    const step = s.lesson_min + s.break_min;
    const toM = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const times2 = [];
    for (let t = toM($('#w-start').value); t <= toM($('#w-last').value); t += step) times2.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
    $('#w-preview').textContent = `${times2.length} Slots: ${times2.join(', ') || '–'}`;
  };
  typeSel.onchange = syncType;
  ['w-start', 'w-last'].forEach((id) => $('#' + id).oninput = updateWPreview);
  syncType();
  $('#w-add').onclick = async () => {
    const t = typeSel.value;
    const body = { date: $('#w-date').value, type: t };
    if (t === 'short') { body.start_time = $('#w-start').value; body.last_start = $('#w-last').value; }
    try {
      await api('/api/day-overrides', { method: 'POST', body });
      toast('Eingetragen ✓', 'ok'); loadOverrides();
    } catch (e) {
      // Bei bestehenden Terminen nachfragen, ob trotzdem
      if (/schon .* Termin/.test(e.message) && confirm(e.message + '\n\nTrotzdem eintragen?')) {
        try { await api('/api/day-overrides', { method: 'POST', body: { ...body, force: true } }); toast('Eingetragen ✓', 'ok'); loadOverrides(); }
        catch (e2) { toast(e2.message, 'err'); }
      } else { toast(e.message, 'err'); }
    }
  };
  loadOverrides();
}
async function loadOverrides() {
  try {
    const { overrides } = await api('/api/day-overrides');
    $('#w-list').innerHTML = overrides.length ? `<h2 style="font-size:.95rem">Eingetragene Tage</h2><div class="blist">${
      overrides.map((o) => `<div class="bitem warm">
        <div><div class="when">${WD[isoDow(o.date) - 1]} ${fmtShort(o.date)}</div>
        <div class="meta">${o.type === 'vacation' ? '🌴 Urlaub' : o.closed ? '🏖️ ganzer Tag frei' : `✂️ kurzer Tag · ${o.start_time || state.settings.start_time}–letzter Slot ${o.last_start || '?'}`}</div></div>
        <button class="ghost sm" data-delov="${o.date}">Löschen</button></div>`).join('')
    }</div>` : '<p class="muted">Keine besonderen Tage eingetragen.</p>';
    $('#w-list').querySelectorAll('[data-delov]').forEach((b) => b.onclick = async () => {
      try { await api('/api/day-overrides/' + b.dataset.delov, { method: 'DELETE' }); loadOverrides(); } catch (e) { toast(e.message, 'err'); }
    });
  } catch (e) { toast(e.message, 'err'); }
}

// ---- Tab: Theorie & Ausnahmen ----
async function tabTheorie() {
  const box = $('#itab');
  box.innerHTML = `<div class="card">
    <h2>Theorie & Ausnahmen</h2>
    <p class="hint">Blockiere Zeiten, in denen keine Fahrstunden buchbar sein sollen – z.B. Theorieunterricht, Urlaub oder Sondertermine.</p>
    <div class="row">
      <div class="field"><label>Datum</label><input type="date" id="t-date" value="${state.date}"></div>
      <div class="field"><label>Von</label><input id="t-from" value="17:00"></div>
      <div class="field"><label>Bis</label><input id="t-to" value="20:00"></div>
    </div>
    <div class="row">
      <div class="field"><label>Titel</label><input id="t-title" placeholder="z.B. Theorieunterricht"></div>
      <div class="field" style="max-width:180px"><label>Art</label>
        <select id="t-type">
          <option value="theorie">Theorie</option>
          <option value="block">Blockiert</option>
          <option value="frei">Frei / Urlaub</option>
        </select></div>
    </div>
    <div class="inline" style="margin:.4rem 0 1rem">
      <label style="margin:0"><input type="checkbox" id="t-count" checked style="width:auto"> zählt als Arbeitszeit (fürs Wochenziel)</label>
      <button id="t-add" style="margin-left:auto">Eintragen</button>
    </div>
    <div id="t-list"></div>
  </div>`;
  $('#t-add').onclick = async () => {
    try {
      await api('/api/blocks', { method: 'POST', body: {
        date: $('#t-date').value, start_time: $('#t-from').value, end_time: $('#t-to').value,
        title: $('#t-title').value, type: $('#t-type').value, count_hours: $('#t-count').checked } });
      $('#t-title').value = ''; toast('Eingetragen ✓', 'ok'); loadBlocks();
    } catch (e) { toast(e.message, 'err'); }
  };
  loadBlocks();
}
async function loadBlocks() {
  try {
    const from = todayStr(), to = addDays(from, 60);
    const ov = await api('/api/instructor/overview?from=' + from + '&to=' + to);
    const bl = ov.blocks;
    $('#t-list').innerHTML = bl.length ? `<h2 style="font-size:.95rem">Kommende Einträge</h2><div class="blist">${
      bl.map((b) => `<div class="bitem warm">
        <div><div class="when">${WD[isoDow(b.date) - 1]} ${fmtShort(b.date)} · ${b.start_time}–${b.end_time}</div>
        <div class="meta"><strong>${esc(b.title)}</strong> · ${b.type} ${b.count_hours ? '<span class="pill">Arbeitszeit</span>' : ''}</div></div>
        <button class="ghost sm" data-delblock="${b.id}">Löschen</button></div>`).join('')
    }</div>` : '<p class="muted">Keine kommenden Ausnahmen.</p>';
    $('#t-list').querySelectorAll('[data-delblock]').forEach((b) => b.onclick = () => delBlock(b.dataset.delblock));
  } catch (e) { toast(e.message, 'err'); }
}

// ---- Tab: Protokoll (Ereignis-Log fuer den Chef) ----
const EV_META = {
  book: ['📅', 'Gebucht'], cancel_student: ['❌', 'Storniert (Schüler)'], cancel_instr: ['❌', 'Abgesagt (Fahrlehrer)'],
  offer: ['🔄', 'Angeboten'], take: ['✅', 'Übernommen'], shift: ['🕐', 'Verschoben'],
  delay: ['⏱️', 'Verspätung'], done: ['🚗', 'Gefahren'], noshow: ['🚫', 'Nicht erschienen'],
  vacation: ['🌴', 'Urlaub'], reminder: ['🔔', 'Erinnerung'], info: ['ℹ️', 'Info'],
};
async function tabProtokoll() {
  const box = $('#itab');
  let students = [];
  try { students = (await api('/api/students')).students; } catch {}
  box.innerHTML = `<div class="card">
    <h2>Protokoll <span class="sub">alle Vorgänge – für deine Unterlagen</span></h2>
    <div class="inline" style="margin-bottom:1rem">
      <select id="pr-student" style="max-width:220px"><option value="">Alle Fahrschüler</option>
        ${students.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
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
  if ($('#pr-student').value) q.set('student_id', $('#pr-student').value);
  if ($('#pr-from').value) q.set('from', $('#pr-from').value);
  if ($('#pr-to').value) q.set('to', $('#pr-to').value);
  try {
    const { events } = await api('/api/instructor/events?' + q.toString());
    if (!events.length) { $('#pr-list').innerHTML = '<p class="muted">Keine Einträge.</p>'; return; }
    $('#pr-list').innerHTML = `<table>
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
  if ($('#pr-student').value) q.set('student_id', $('#pr-student').value);
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
  box.innerHTML = `<div class="card">
    <h2>Einstellungen</h2>
    <div class="grid2">
      <div>
        <h2 style="font-size:.95rem">Slots & Zeiten</h2>
        <div class="row"><div class="field"><label>Arbeitsbeginn (erster Slot)</label><input id="e-start" value="${s.start_time}"></div>
          <div class="field"><label>Letzter buchbarer Slot</label><input id="e-last" value="${s.last_start}"></div></div>
        <div class="row"><div class="field"><label>Dauer Fahrstunde (Min)</label><input id="e-lesson" type="number" value="${s.lesson_min}" step="5"></div>
          <div class="field"><label>Pause dazwischen (Min)</label><input id="e-break" type="number" value="${s.break_min}" step="5"></div></div>
        <div class="field"><label>Arbeitstage</label>
          <div class="inline" id="e-days">${WD.map((d, i) => `<label style="margin:0;font-weight:600"><input type="checkbox" data-day="${i + 1}" ${days.includes(i + 1) ? 'checked' : ''} style="width:auto"> ${d}</label>`).join('')}</div>
        </div>
        <div class="row">
          <div class="field"><label>Max. Fahrstunden pro Schüler & Woche</label><input id="e-max" type="number" value="${s.max_per_week}" min="1"></div>
          <div class="field"><label>Vorausbuchung (Tage)</label><input id="e-horizon" type="number" value="${s.booking_horizon_days}" min="1"></div>
        </div>
        <div class="row">
          <div class="field"><label>Tägliche Freigabe-Uhrzeit</label><input id="e-release" value="${s.release_time || '10:00'}"></div>
          <div class="field"><label>Letzter Slot an kurzen Tagen</label><input id="e-shortlast" value="${s.short_day_last_start || '13:35'}"></div>
        </div>
        <div class="row">
          <div class="field"><label>Urlaubstag zählt (Min)</label><input id="e-vaccredit" type="number" value="${s.vacation_credit_min}" step="10"></div>
          <div class="field"><label>Resturlaub (Tage)</label><input id="e-vacdays" type="number" value="${s.vacation_days_left}" step="1"></div>
          <div class="field"><label>Toleranz Verspätung (Min)</label><input id="e-grace" type="number" value="${s.late_grace_min}" step="5"></div>
        </div>
        <div class="field"><label>Aufklärungstext (wird beim Buchen gezeigt)</label><textarea id="e-policy" rows="4" style="resize:vertical">${esc(s.policy_text || '')}</textarea></div>
        <div class="row">
          <div class="field"><label>Kostenlos stornieren bis (Std. vorher)</label><input id="e-cancel" type="number" value="${s.cancel_hours}" min="0"></div>
          <div class="field"><label>Sperrfrist – fest ab (Std. vorher)</label><input id="e-lock" type="number" value="${s.lock_hours}" min="0"></div>
        </div>
      </div>
      <div>
        <h2 style="font-size:.95rem">Ziele (Tacho)</h2>
        <div class="field"><label>Wochenziel (Stunden)</label><input id="e-wt" type="number" value="${s.weekly_target_h}" step="0.5"></div>
        <div class="field"><label>Untere Zielspanne (Stunden)</label><input id="e-wlo" type="number" value="${s.weekly_lo_h}" step="0.5"></div>
        <div class="field"><label>Tagesziel (Stunden)</label><input id="e-dt" type="number" value="${s.daily_target_h}" step="0.5"></div>
        <div class="row">
          <div class="field"><label>Monatsziel (Std, mind. 80)</label><input id="e-mt" type="number" value="${s.monthly_target_h}" min="80" step="1"></div>
          <div class="field"><label>Monat Skala-Ende (höchstens)</label><input id="e-mmax" type="number" value="${s.monthly_max_h}" min="80" step="1"></div>
        </div>
        <div class="hint" id="e-preview"></div>
        <h2 style="font-size:.95rem;margin-top:1.4rem">Zugang</h2>
        <div class="field"><label>Angezeigter Name</label><input id="e-name" value="${esc(s.instructor_name)}"></div>
        <div class="field"><label>Deine Handynummer (Schüler können anrufen/schreiben)</label><input id="e-phone" value="${esc(s.instructor_phone || '')}" placeholder="z.B. 0151 23456789"></div>
        <div class="field"><label>Neues Fahrlehrer-Passwort (leer lassen = unverändert)</label><input id="e-pin" type="password" placeholder="mind. 8 Zeichen, mit Zahl & Sonderzeichen"></div>

        <h2 style="font-size:.95rem;margin-top:1.4rem">Live-Standort</h2>
        <div class="row">
          <div class="field"><label>Standort teilen ab (Min vorher)</label><input id="e-lead" type="number" value="${s.live_lead_min}" min="1"></div>
          <div class="field"><label>Ø Tempo für ETA (km/h)</label><input id="e-speed" type="number" value="${s.avg_speed_kmh}" min="5"></div>
        </div>
        <div class="field"><label>Standard-Treffpunkt (nur Rückfall)</label>
          <div class="inline"><input id="e-meet" value="${esc(s.meet_default_label || '')}" placeholder="z.B. Fahrschule / Bahnhof" style="flex:1">
            <button class="sec sm" id="e-meet-here" type="button">📍 Standort</button></div>
          <div class="hint" id="e-meet-info" style="margin:.3rem 0 0">${s.meet_default_lat ? '✓ Koordinaten hinterlegt' : 'Ohne Koordinaten nur als Text.'}</div>
          <div class="hint" style="margin:.3rem 0 0">Wird nur genutzt, wenn weder beim Schüler noch bei der Fahrstunde ein Treffpunkt gesetzt ist. Pro Schüler: Reiter „Fahrschüler" → „Treffpunkt festlegen". Pro Termin: Fahrstunde öffnen → Feld „Treffpunkt".</div>
        </div>

        <h2 style="font-size:.95rem;margin-top:1.4rem">Datenschutz, Sonderfahrten & Rang</h2>
        <div class="field"><label style="font-weight:600;color:var(--ink)"><input type="checkbox" id="e-anon" ${s.anonymous_swaps === '1' ? 'checked' : ''} style="width:auto"> Tausch anonym (Schüler sehen nicht, von wem ein Termin kommt)</label></div>
        <div class="row">
          <div class="field"><label>Soll Überland</label><input id="e-req-u" type="number" value="${s.req_ueberland}" min="0"></div>
          <div class="field"><label>Soll Autobahn</label><input id="e-req-a" type="number" value="${s.req_autobahn}" min="0"></div>
          <div class="field"><label>Soll Nachtfahrt</label><input id="e-req-n" type="number" value="${s.req_nacht}" min="0"></div>
        </div>
        <div class="row">
          <div class="field"><label>Rang 2 ab (gefahrene Stunden)</label><input id="e-rank2" type="number" value="${s.rank2_min_lessons}" min="1"></div>
          <div class="field"><label>Rang 2: Vorausbuchung (Tage)</label><input id="e-horizon2" type="number" value="${s.booking_horizon_days_rank2}" min="1"></div>
        </div>
      </div>
    </div>
    <div class="inline" style="margin-top:.6rem"><button id="e-save">Speichern</button><span id="e-msg" class="muted"></span></div>
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
        max_per_week: Number($('#e-max').value), instructor_name: $('#e-name').value,
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
