'use strict';
// ginoco Team-Portal – ein Datentopf, mehrere Zugänge:
//   👑 Inhaber/Admin · 🚗 Fahrlehrer · 🏢 Büro · 🧾 Abrechnung (fsmanager/DataPart) · 📊 Steuerbüro
// Jede Rolle sieht nur die Bereiche, die sie wirklich braucht.

const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euro = (c) => (Number(c || 0) / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dmy = (s) => s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : '';
const dmyIso = (iso) => { const d = new Date(iso); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; };
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const initials = (n) => String(n || '?').split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();
let toastTimer;
function toast(msg, kind = '', ms = 3200) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast ' + kind; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
async function api(path, opts = {}) {
  const res = await fetch(path, { method: opts.method || 'GET', headers: opts.body ? { 'Content-Type': 'application/json' } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let data = {}; try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data.error || 'Fehler');
  return data;
}
function modal(html) {
  closeModal();
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">${html}</div>`;
  bg.addEventListener('click', (e) => { if (e.target === bg) closeModal(); });
  document.body.appendChild(bg); return bg;
}
function closeModal() { document.querySelectorAll('.modal-bg').forEach((m) => m.remove()); }
function confirmBox(text, okLabel = 'Ja') {
  return new Promise((resolve) => {
    const m = modal(`<h3>Sicher?</h3><p>${esc(text)}</p><div class="acts"><button class="ghost" id="c-no">Abbrechen</button><button id="c-ok">${esc(okLabel)}</button></div>`);
    $('#c-no', m).onclick = () => { closeModal(); resolve(false); };
    $('#c-ok', m).onclick = () => { closeModal(); resolve(true); };
  });
}

const state = { me: null, roles: {}, classes: [], counts: {}, school: '', view: null, tick: null };
const brandHTML = (tag) => `<div class="p-brand"><img class="logo" src="/logo.svg?v=3630" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'🚗'}))"><span class="brandname">ginoco</span>${tag ? `<span class="tag">${esc(tag)}</span>` : ''}</div>`;

// Welche Rolle zeigt die Subdomain? (buero. / abrechnung. / steuer. / team.)
function hostRole() {
  const sub = location.hostname.split('.')[0];
  return { buero: 'buero', abrechnung: 'abrechnung', steuer: 'steuer', team: 'fahrlehrer', admin: 'admin' }[sub] || null;
}

// ====================== Login ======================
function renderLogin(err = '') {
  const hr = hostRole();
  const R = { admin: 'Inhaber', fahrlehrer: 'Fahrlehrer', buero: 'Büro', abrechnung: 'Abrechnung', steuer: 'Steuerbüro' };
  app.innerHTML = `<div class="p-login"><div class="card">
    ${brandHTML(hr ? R[hr] : 'Team')}
    <p class="hint" style="margin-top:0">Zugang für ${hr ? '<strong>' + R[hr] + '</strong>' : 'Team, Büro, Abrechnung &amp; Steuerbüro'}. Fahrschüler melden sich in der <a href="/" style="color:var(--brand)">Fahrschüler-App</a> an.</p>
    <div class="field"><label>Benutzername</label><input id="l-user" autocomplete="username" autocapitalize="none" placeholder="z.B. anna"></div>
    <div class="field"><label>Passwort</label><input id="l-pass" type="password" autocomplete="current-password"></div>
    <label class="inline" style="font-size:.85rem"><input type="checkbox" id="l-rem" checked style="width:auto"> Angemeldet bleiben</label>
    <div class="err" id="l-err">${esc(err)}</div>
    <button class="main" id="l-go">Anmelden</button>
    <details style="margin-top:1rem"><summary class="hint" style="cursor:pointer">Inhaber? Mit der Fahrlehrer-PIN anmelden</summary>
      <div class="field" style="margin-top:.5rem"><label>PIN / Passwort des Inhabers</label><input id="l-pin" type="password"></div>
      <button class="sec" id="l-pin-go" style="width:100%">Als Inhaber anmelden</button>
    </details>
    <div class="p-roles"><span>👑 Inhaber</span><span>🚗 Fahrlehrer</span><span>🏢 Büro</span><span>🧾 Abrechnung</span><span>📊 Steuerbüro</span></div>
  </div></div>`;
  const go = async () => {
    try {
      await api('/api/auth/staff', { method: 'POST', body: { username: $('#l-user').value, password: $('#l-pass').value, remember: $('#l-rem').checked } });
      boot();
    } catch (e) { $('#l-err').textContent = e.message; }
  };
  $('#l-go').onclick = go;
  $('#l-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  $('#l-pin-go').onclick = async () => {
    try {
      const r = await api('/api/auth/instructor', { method: 'POST', body: { pin: $('#l-pin').value, remember: true } });
      if (r.need2fa) { $('#l-err').textContent = 'Dein Inhaber-Zugang hat 2FA – bitte in der Fahrlehrer-App anmelden, dann hier neu laden.'; return; }
      boot();
    } catch (e) { $('#l-err').textContent = e.message; }
  };
}

// ====================== Shell ======================
// Bereiche je Rolle. Der Inhaber sieht alles.
const VIEWS = [
  ['__grp', 'Überblick'],
  { k: 'start', ic: '🏠', l: 'Start', roles: ['admin', 'fahrlehrer', 'buero', 'abrechnung', 'steuer'] },
  { k: 'fahrzeuge', ic: '🚘', l: 'Fahrzeuge', roles: ['admin', 'fahrlehrer', 'buero'], cnt: 'busyCars' },
  ['__grp', 'Büro'],
  { k: 'anmeldungen', ic: '🆕', l: 'Neue Anmeldungen', roles: ['admin', 'buero'], cnt: 'pendingSignups', warn: true },
  { k: 'schueler', ic: '🧑‍🎓', l: 'Fahrschüler & Akten', roles: ['admin', 'buero', 'fahrlehrer', 'abrechnung'] },
  { k: 'theorie', ic: '📚', l: 'Theorie & QR', roles: ['admin', 'fahrlehrer', 'buero'] },
  ['__grp', 'Geld'],
  { k: 'abrechnung', ic: '🧾', l: 'Abrechnung', roles: ['admin', 'abrechnung', 'buero'], cnt: 'openBilling' },
  { k: 'steuer', ic: '📊', l: 'Steuerbüro', roles: ['admin', 'steuer', 'abrechnung'] },
  { k: 'preise', ic: '💶', l: 'Preise', roles: ['admin'] },
  ['__grp', 'Team'],
  { k: 'abwesenheit', ic: '🌴', l: 'Urlaub & Krank', roles: ['admin', 'fahrlehrer', 'buero', 'abrechnung'], cnt: 'openAbsences', warn: true },
  { k: 'team', ic: '👥', l: 'Team & Zugänge', roles: ['admin', 'buero'] },
  { k: 'konto', ic: '🔐', l: 'Mein Konto', roles: ['admin', 'fahrlehrer', 'buero', 'abrechnung', 'steuer'] },
];
const canSee = (v) => state.me.kind === 'owner' || v.roles.includes(state.me.role);
function myViews() { return VIEWS.filter((v) => Array.isArray(v) || canSee(v)); }

function renderShell() {
  const me = state.me;
  const roleLbl = me.kind === 'owner' ? '👑 Inhaber' : `${state.roles[me.role]?.icon || ''} ${state.roles[me.role]?.label || me.role}`;
  let nav = '';
  for (const v of myViews()) {
    if (Array.isArray(v)) { nav += `<div class="grp">${esc(v[1])}</div>`; continue; }
    const n = v.cnt ? state.counts[v.cnt] : 0;
    nav += `<button data-v="${v.k}" class="${state.view === v.k ? 'active' : ''}"><span class="ic">${v.ic}</span>${esc(v.l)}${n ? `<span class="cnt ${v.warn ? 'warn' : ''}">${n}</span>` : ''}</button>`;
  }
  app.innerHTML = `<div class="p-shell">
    <aside class="p-side" id="side">
      ${brandHTML('Team')}
      <div class="me"><strong>${esc(me.name)}</strong><span>${roleLbl}${state.school ? ' · ' + esc(state.school) : ''}</span></div>
      <nav class="p-nav" id="nav">${nav}</nav>
      <div class="foot"><a class="btnlike" href="/" title="Fahrlehrer-/Schüler-App">🚗 App</a><button class="ghost" id="reload">🔄</button><button class="ghost" id="logout">Abmelden</button></div>
    </aside>
    <div>
      <div class="p-topbar"><button class="burger" id="burger">☰</button><span class="t">ginoco Team</span><span class="muted" style="font-size:.8rem;margin-left:auto">${esc(me.name)}</span></div>
      <main class="p-main" id="main"></main>
    </div>
  </div>`;
  $('#nav').querySelectorAll('button').forEach((b) => b.onclick = () => { go(b.dataset.v); $('#side').classList.remove('open'); $('.p-overlay')?.remove(); });
  $('#burger').onclick = () => { $('#side').classList.add('open'); const o = document.createElement('div'); o.className = 'p-overlay'; o.onclick = () => { $('#side').classList.remove('open'); o.remove(); }; document.body.appendChild(o); };
  $('#logout').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); location.reload(); };
  $('#reload').onclick = () => boot();
}
function go(view) {
  state.view = view; location.hash = view;
  clearInterval(state.tick); state.tick = null;
  $('#nav').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.v === view));
  const fn = { start: viewStart, fahrzeuge: viewFahrzeuge, anmeldungen: viewAnmeldungen, schueler: viewSchueler, theorie: viewTheorie,
    abrechnung: viewAbrechnung, steuer: viewSteuer, preise: viewPreise, abwesenheit: viewAbwesenheit, team: viewTeam, konto: viewKonto }[view] || viewStart;
  const m = $('#main'); m.innerHTML = '<div class="boot">Lädt…</div>';
  fn(m).catch((e) => { m.innerHTML = `<div class="card"><p class="hint">⚠️ ${esc(e.message)}</p></div>`; });
}
async function refreshCounts() {
  try { const d = await api('/api/portal/me'); state.counts = d.counts; } catch { return; }
  $('#nav')?.querySelectorAll('button').forEach((b) => {
    const v = VIEWS.find((x) => !Array.isArray(x) && x.k === b.dataset.v); if (!v || !v.cnt) return;
    const n = state.counts[v.cnt]; let c = b.querySelector('.cnt');
    if (!n) { c?.remove(); return; }
    if (!c) { c = document.createElement('span'); c.className = 'cnt ' + (v.warn ? 'warn' : ''); b.appendChild(c); }
    c.textContent = n;
  });
}

// ====================== Start ======================
async function viewStart(m) {
  const c = state.counts; const me = state.me;
  const tiles = [];
  const t = (k, n, l, cls = '') => { if (canSee(VIEWS.find((v) => !Array.isArray(v) && v.k === k))) tiles.push(`<div class="tile ${cls}" data-go="${k}"><div class="n">${n}</div><div class="l">${l}</div></div>`); };
  t('anmeldungen', c.pendingSignups, 'neue Anmeldungen warten', c.pendingSignups ? 'warn' : 'good');
  t('fahrzeuge', c.busyCars, 'Fahrzeuge gerade unterwegs', c.busyCars ? 'bad' : 'good');
  t('abrechnung', c.openBilling, 'Fahrstunden noch nicht abgerechnet', c.openBilling ? 'warn' : 'good');
  t('abwesenheit', c.openAbsences, 'offene Urlaubsanträge', c.openAbsences ? 'warn' : 'good');
  const R = { admin: 'Du siehst alles: Fahrzeuge, Büro, Abrechnung, Steuer, Preise und Team.', fahrlehrer: 'Dein Bereich: Fahrzeuge buchen, deine Fahrschüler, Theorie-QR, Urlaub & Krankmeldung.',
    buero: 'Dein Bereich: neue Anmeldungen freischalten, Fahrschüler zuweisen, Fahrzeuge, Theorie.', abrechnung: 'Dein Bereich: gefahrene Fahrstunden sehen und als abgerechnet markieren.', steuer: 'Dein Bereich: Monatssummen und Jahresübersicht – ohne Schülerdaten.' };
  m.innerHTML = `<h1>Hallo ${esc(me.name.split(' ')[0])} 👋</h1><p class="lead">${R[me.kind === 'owner' ? 'admin' : me.role]}</p>
    <div class="tiles">${tiles.join('')}</div>
    <div class="card"><h2>So greift alles ineinander</h2>
      <div class="kv">
        <span>🧑‍🎓 Fahrschüler</span><div>meldet sich selbst an → Akte entsteht automatisch → Büro schaltet frei und weist den Fahrlehrer zu.</div>
        <span>🚗 Fahrlehrer</span><div>fährt, schließt die Stunde ab (Dauer, Schalter/Automatik, Kennzeichen) → landet in der Akte und in der Abrechnung.</div>
        <span>🚘 Schaltwagen</span><div>werden geteilt: vorher buchen, alle sehen die Uhr, Push an das Team.</div>
        <span>🧾 Abrechnung</span><div>sieht nur, was gefahren wurde (Datum, Uhrzeit, Minuten, Preis) und hakt „abgerechnet" ab.</div>
        <span>📊 Steuerbüro</span><div>bekommt nur die Monatssummen – keine Namen.</div>
        <span>📚 Theorie</span><div>QR-Code an der Wand, wechselt alle 5 Minuten – Schüler scannen, Anwesenheit steht in der Akte.</div>
      </div></div>`;
  m.querySelectorAll('[data-go]').forEach((el) => el.onclick = () => go(el.dataset.go));
}

// ====================== Fahrzeuge (Schaltwagen-Uhr) ======================
const carSvg = (color) => `<svg class="carimg" viewBox="0 0 120 52" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M10 36c-4 0-6-2-6-6v-6c0-3 2-5 5-6l16-3 12-10c2-1 4-2 7-2h22c3 0 6 1 8 3l10 9 20 3c4 1 6 3 6 7v5c0 4-2 6-6 6H10z" fill="${color}"/>
  <path d="M38 17l9-8c1-1 3-2 5-2h10v10H38zM66 7h8c2 0 4 1 5 2l8 8H66V7z" fill="#0e131a" opacity=".85"/>
  <circle cx="30" cy="38" r="9" fill="#0e131a"/><circle cx="30" cy="38" r="4.5" fill="#93a1b3"/>
  <circle cx="92" cy="38" r="9" fill="#0e131a"/><circle cx="92" cy="38" r="4.5" fill="#93a1b3"/>
  <rect x="4" y="27" width="6" height="3" rx="1.5" fill="#ffd166"/><rect x="110" y="27" width="6" height="3" rx="1.5" fill="#ff6b6b"/>
</svg>`;
const clockSvg = () => {
  const R = 90, C = 2 * Math.PI * R;
  let ticks = ''; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; ticks += `<line x1="${100 + Math.cos(a) * 78}" y1="${100 + Math.sin(a) * 78}" x2="${100 + Math.cos(a) * 82}" y2="${100 + Math.sin(a) * 82}"/>`; }
  return `<svg viewBox="0 0 200 200"><circle class="track" cx="100" cy="100" r="${R}"/><g class="ticks">${ticks}</g><circle class="ring" cx="100" cy="100" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg>`;
};
const vState = { data: null };
async function viewFahrzeuge(m) {
  const d = await api('/api/portal/vehicles' + (state.me.kind === 'owner' ? '?all=1' : ''));
  vState.data = d;
  const isAdmin = state.me.kind === 'owner' || state.me.role === 'admin';
  m.innerHTML = `<h1>🚘 Fahrzeuge</h1><p class="lead">Jeder Fahrlehrer hat sein Automatik-Auto – die <strong>Schaltwagen teilen wir uns</strong>. Wer einen braucht, bucht ihn hier vorab; alle sehen die Uhr, das Team bekommt eine Push-Nachricht. Rot = gerade erst los · Orange = dauert noch · Gelb = bald wieder frei · Grün = frei.</p>
    <div class="cars" id="cars"></div>
    <div class="inline" style="margin-top:1rem">${isAdmin ? '<button class="sec" id="v-add">＋ Fahrzeug anlegen</button>' : ''}<button class="ghost" id="v-log">📋 Verlauf</button></div>`;
  renderCars();
  state.tick = setInterval(tickCars, 1000);
  // alle 30 s frische Daten (jemand anders könnte gebucht haben)
  const poll = setInterval(async () => { if (state.view !== 'fahrzeuge') return clearInterval(poll); try { vState.data = await api('/api/portal/vehicles' + (state.me.kind === 'owner' ? '?all=1' : '')); renderCars(); } catch {} }, 30000);
  if (isAdmin) $('#v-add').onclick = () => editVehicle(null);
  $('#v-log').onclick = showVehicleLog;
}
function carPhase(v, now) {
  if (!v.current) return { cls: 'free', frac: 1 };
  const s = new Date(v.current.start_at).getTime(), e = new Date(v.current.end_at).getTime();
  const frac = Math.max(0, Math.min(1, (e - now) / Math.max(1, e - s)));
  const rem = e - now;
  const cls = rem <= 10 * 60000 || frac < 0.2 ? 'soon' : frac < 0.6 ? 'mid' : 'busy';
  return { cls, frac, rem, end: e };
}
function renderCars() {
  const box = $('#cars'); if (!box) return;
  const d = vState.data; const now = Date.now();
  const mine = (b) => b && ((d.me.kind === 'instructor' && b.by_kind === 'instructor') || (d.me.kind === 'staff' && b.by_kind === 'staff' && b.by_id === d.me.id));
  const isAdmin = state.me.kind === 'owner' || state.me.role === 'admin' || state.me.role === 'buero';
  box.innerHTML = d.vehicles.map((v) => {
    const ph = carPhase(v, now);
    const cur = v.current;
    const up = v.upcoming.slice(0, 3);
    return `<div class="car ${ph.cls} ${cur ? 'pulse' : ''} ${v.active ? '' : 'inactive'}" data-id="${v.id}">
      <div class="inline" style="justify-content:space-between"><div><span class="plate">${esc(v.plate)}</span><span class="gear">${v.gearbox === 'schalt' ? '🕹️ Schalter' : '⚙️ Automatik'}</span></div>
        ${state.me.kind === 'owner' || state.me.role === 'admin' ? `<button class="ghost sm" data-edit="${v.id}" title="Bearbeiten">✏️</button>` : ''}</div>
      <div class="cname">${esc(v.name)}${v.shared ? '' : ' · fest zugeordnet'}${v.active ? '' : ' · <span class="tag bad">inaktiv</span>'}</div>
      <div class="clock">${clockSvg()}<div class="mid">${carSvg(v.color)}<div class="big" data-big></div><div class="sml" data-sml></div></div></div>
      <div class="state" data-state></div>
      <div class="acts">
        ${cur ? (mine(cur) || isAdmin ? `<button data-return="${cur.id}">✅ Zurück – frei</button><button class="sec" data-extend="${cur.id}">＋40 Min</button>` : '') + `<button class="ghost" data-book="${v.id}">📅 Vorab buchen</button>`
             : `<button data-book="${v.id}" data-now="1">🚘 Jetzt nehmen</button><button class="ghost" data-book="${v.id}">📅 Vorab buchen</button>`}
      </div>
      ${up.length ? `<div class="next">${up.map((b) => `<div><span>📌 ${dmyIso(b.start_at) === dmyIso(now) ? 'heute' : dmyIso(b.start_at)} ${hhmm(b.start_at)}–${hhmm(b.end_at)} · ${esc(b.by_name)}${b.note ? ' · ' + esc(b.note) : ''}</span>${mine(b) || isAdmin ? `<button data-del="${b.id}">✕</button>` : ''}</div>`).join('')}</div>` : ''}
    </div>`;
  }).join('') || '<p class="hint">Noch keine Fahrzeuge angelegt.</p>';
  box.querySelectorAll('[data-book]').forEach((b) => b.onclick = () => bookVehicle(Number(b.dataset.book), !!b.dataset.now));
  box.querySelectorAll('[data-return]').forEach((b) => b.onclick = async () => { try { await api(`/api/portal/vehicle-bookings/${b.dataset.return}/return`, { method: 'POST' }); toast('Fahrzeug ist wieder frei ✓', 'ok'); await reloadCars(); } catch (e) { toast(e.message, 'err'); } });
  box.querySelectorAll('[data-extend]').forEach((b) => b.onclick = async () => { try { await api(`/api/portal/vehicle-bookings/${b.dataset.extend}/extend`, { method: 'POST', body: { minutes: 40 } }); toast('Um 40 Minuten verlängert ✓', 'ok'); await reloadCars(); } catch (e) { toast(e.message, 'err'); } });
  box.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (!await confirmBox('Diese Vorab-Buchung stornieren?', 'Stornieren')) return; try { await api(`/api/portal/vehicle-bookings/${b.dataset.del}`, { method: 'DELETE' }); await reloadCars(); } catch (e) { toast(e.message, 'err'); } });
  box.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => editVehicle(d.vehicles.find((v) => v.id === Number(b.dataset.edit))));
  tickCars();
}
async function reloadCars() { vState.data = await api('/api/portal/vehicles' + (state.me.kind === 'owner' ? '?all=1' : '')); renderCars(); refreshCounts(); }
function tickCars() {
  const d = vState.data; if (!d) return; const now = Date.now();
  let changed = false;
  for (const v of d.vehicles) {
    const el = $(`.car[data-id="${v.id}"]`); if (!el) continue;
    if (v.current && new Date(v.current.end_at).getTime() <= now) { changed = true; continue; }
    if (!v.current && v.upcoming[0] && new Date(v.upcoming[0].start_at).getTime() <= now) { changed = true; continue; }
    const ph = carPhase(v, now);
    el.classList.remove('free', 'soon', 'mid', 'busy'); el.classList.add(ph.cls);
    const ring = el.querySelector('.ring'); const C = 2 * Math.PI * 90;
    ring.style.strokeDashoffset = String(C * (1 - ph.frac));
    const big = el.querySelector('[data-big]'), sml = el.querySelector('[data-sml]'), st = el.querySelector('[data-state]');
    if (v.current) {
      const s = Math.max(0, Math.floor(ph.rem / 1000)); const h = Math.floor(s / 3600), mi = Math.floor((s % 3600) / 60), se = s % 60;
      big.textContent = h ? `${h}:${pad(mi)}:${pad(se)}` : `${mi}:${pad(se)}`;
      sml.textContent = `frei ab ${hhmm(v.current.end_at)} Uhr`;
      st.innerHTML = `${ph.cls === 'soon' ? '🟡 Bald wieder frei' : ph.cls === 'mid' ? '🟠 Noch unterwegs' : '🔴 Gerade erst los'}<span class="who">${esc(v.current.by_name)} · seit ${hhmm(v.current.start_at)} Uhr${v.current.note ? ' · ' + esc(v.current.note) : ''}</span>`;
    } else {
      big.textContent = 'FREI';
      const nx = v.upcoming[0];
      sml.textContent = nx ? `bis ${dmyIso(nx.start_at) === dmyIso(now) ? '' : dmyIso(nx.start_at) + ' '}${hhmm(nx.start_at)} Uhr` : 'keine Buchung';
      st.innerHTML = `🟢 Verfügbar<span class="who">${nx ? 'nächste Buchung: ' + esc(nx.by_name) : 'einfach nehmen'}</span>`;
    }
  }
  if (changed) reloadCars().catch(() => {});
}
function bookVehicle(vid, now) {
  const v = vState.data.vehicles.find((x) => x.id === vid); if (!v) return;
  const d = new Date(); d.setMinutes(d.getMinutes() + 5 - (d.getMinutes() % 5));
  const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  let dur = 80;
  const mm = modal(`<h3>🚘 ${esc(v.plate)} ${now ? 'jetzt nehmen' : 'vorab buchen'}</h3>
    <p class="hint" style="margin-top:0">${esc(v.name)} · ${v.gearbox === 'schalt' ? 'Schalter' : 'Automatik'}. Das Team bekommt eine Push-Nachricht, die Uhr läuft ab Start.</p>
    ${now ? '' : `<div class="field"><label>Start</label><input type="datetime-local" id="vb-start" value="${local}"></div>`}
    <label class="hint" style="margin:0">Wie lange?</label>
    <div class="dur-chips" id="vb-chips">${[40, 80, 120, 160, 240].map((x) => `<button data-d="${x}" class="${x === dur ? 'on' : ''}">${x} Min</button>`).join('')}<button data-d="0">bis Feierabend</button></div>
    <div class="field"><label>Notiz (optional, z.B. Schüler / Sonderfahrt)</label><input id="vb-note" maxlength="200" placeholder="z.B. Überlandfahrt mit Lena"></div>
    <div class="acts"><button class="ghost" id="vb-x">Abbrechen</button><button id="vb-ok">${now ? '🚘 Los geht’s' : '📅 Buchen'}</button></div>`);
  $('#vb-chips', mm).querySelectorAll('button').forEach((b) => b.onclick = () => { dur = Number(b.dataset.d); $('#vb-chips', mm).querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); });
  $('#vb-x', mm).onclick = closeModal;
  $('#vb-ok', mm).onclick = async () => {
    try {
      const body = { note: $('#vb-note', mm).value };
      const startEl = $('#vb-start', mm); const start = startEl && startEl.value ? new Date(startEl.value) : new Date();
      if (!now) body.start_at = start.toISOString();
      if (dur) body.duration_min = dur; else { const e = new Date(start); e.setHours(20, 0, 0, 0); if (e <= start) e.setDate(e.getDate() + 1); body.end_at = e.toISOString(); }
      await api(`/api/portal/vehicles/${vid}/book`, { method: 'POST', body });
      closeModal(); toast(now ? 'Gute Fahrt! Die Uhr läuft 🚘' : 'Vorab gebucht ✓', 'ok'); await reloadCars();
    } catch (e) { toast(e.message, 'err', 5000); }
  };
}
function editVehicle(v) {
  const mm = modal(`<h3>${v ? '✏️ Fahrzeug bearbeiten' : '＋ Fahrzeug anlegen'}</h3>
    <div class="row"><div class="field" style="flex:1"><label>Bezeichnung</label><input id="ve-name" value="${esc(v?.name || '')}" placeholder="z.B. Audi A4 Avant"></div>
      <div class="field" style="flex:1"><label>Kennzeichen</label><input id="ve-plate" value="${esc(v?.plate || '')}" placeholder="EW-AZ 11" style="text-transform:uppercase"></div></div>
    <div class="row"><div class="field" style="flex:1"><label>Getriebe</label><select id="ve-gear"><option value="schalt" ${v?.gearbox !== 'automatik' ? 'selected' : ''}>Schalter</option><option value="automatik" ${v?.gearbox === 'automatik' ? 'selected' : ''}>Automatik</option></select></div>
      <div class="field" style="flex:1"><label>Farbe</label><input type="color" id="ve-color" value="${esc(v?.color || '#4d8dff')}" style="height:42px;padding:.2rem"></div>
      <div class="field" style="flex:1"><label>Reihenfolge</label><input type="number" id="ve-sort" value="${v?.sort ?? 0}"></div></div>
    <label class="inline"><input type="checkbox" id="ve-shared" ${!v || v.shared ? 'checked' : ''} style="width:auto"> Geteiltes Fahrzeug (buchbar)</label><br>
    <label class="inline" style="margin-top:.4rem"><input type="checkbox" id="ve-active" ${!v || v.active ? 'checked' : ''} style="width:auto"> Aktiv</label>
    <div class="acts"><button class="ghost" id="ve-x">Abbrechen</button><button id="ve-ok">Speichern</button></div>`);
  $('#ve-x', mm).onclick = closeModal;
  $('#ve-ok', mm).onclick = async () => {
    const body = { name: $('#ve-name', mm).value, plate: $('#ve-plate', mm).value, gearbox: $('#ve-gear', mm).value, color: $('#ve-color', mm).value, sort: Number($('#ve-sort', mm).value), shared: $('#ve-shared', mm).checked, active: $('#ve-active', mm).checked };
    try { await api(v ? `/api/portal/vehicles/${v.id}` : '/api/portal/vehicles', { method: v ? 'PATCH' : 'POST', body }); closeModal(); toast('Gespeichert ✓', 'ok'); await reloadCars(); } catch (e) { toast(e.message, 'err'); }
  };
}
async function showVehicleLog() {
  const { log } = await api('/api/portal/vehicle-log');
  modal(`<h3>📋 Fahrzeug-Verlauf</h3><div class="tblwrap"><table class="p"><tr><th>Fahrzeug</th><th>Wer</th><th>Von</th><th>Bis</th><th>Notiz</th></tr>
    ${log.map((r) => `<tr><td>${esc(r.plate)}</td><td>${esc(r.by_name)}</td><td>${dmyIso(r.start_at)} ${hhmm(r.start_at)}</td><td>${r.returned_at ? hhmm(r.returned_at) + ' ✓' : hhmm(r.end_at)}</td><td>${esc(r.note || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Noch nichts gebucht.</td></tr>'}</table></div>
    <div class="acts"><button class="ghost" onclick="closeModal()">Schließen</button></div>`);
}

// ====================== Büro: Neue Anmeldungen ======================
async function viewAnmeldungen(m) {
  const [{ signups }, { instructors, classes }] = await Promise.all([api('/api/instructor/signups'), api('/api/portal/students?scope=pending')]);
  m.innerHTML = `<h1>🆕 Neue Anmeldungen</h1><p class="lead">Wer sich in der App selbst angemeldet hat, taucht hier auf. Anrufen oder per WhatsApp melden, Klasse &amp; Fahrlehrer festlegen, freischalten – fertig. Die Akte ist durch die Anmeldung schon angelegt.</p>
    <div class="list" id="su-list">${signups.map((s) => {
      const tel = (s.phone || '').replace(/[^\d+]/g, '');
      const wa = tel ? `https://wa.me/${tel.replace(/^0/, '49').replace('+', '')}?text=${encodeURIComponent(`Hallo ${s.first_name || s.name}, hier ist die ${state.school || 'Fahrschule'} – danke für deine Anmeldung! Wann passt es dir für ein kurzes Gespräch?`)}` : '';
      return `<div class="item pending" data-id="${s.id}">
        <div><div class="t"><span class="avatar">${initials(s.name)}</span>${esc(s.name)} ${s.email_verified ? '<span class="tag good">E-Mail bestätigt</span>' : '<span class="tag warn">E-Mail offen</span>'}</div>
          <div class="m">${s.birth_date ? 'geb. ' + dmy(s.birth_date) + ' · ' : ''}${esc([s.street, s.house_no].filter(Boolean).join(' '))}${s.zip || s.city ? ', ' + esc([s.zip, s.city].filter(Boolean).join(' ')) : ''}<br>📞 ${esc(s.phone || '–')} · ✉️ ${esc(s.email || '–')} · angemeldet ${dmyIso(s.created_at)}</div>
          <div class="inline" style="margin-top:.5rem"><select data-cls style="max-width:200px">${classes.map((c) => `<option value="${c[0]}" ${c[0] === 'B' ? 'selected' : ''}>${esc(c[1])}</option>`).join('')}</select>
            <select data-instr style="max-width:200px">${instructors.map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join('')}</select></div></div>
        <div class="acts">${tel ? `<a class="btnlike" href="tel:${esc(tel)}">📞 Anrufen</a><a class="btnlike wa" href="${wa}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}
          <button data-ok="${s.id}">✅ Freischalten</button><button class="ghost" data-no="${s.id}">🗑️</button></div></div>`;
    }).join('') || '<div class="card"><p class="hint" style="margin:0">Keine offenen Anmeldungen – alles erledigt 🎉</p></div>'}</div>`;
  m.querySelectorAll('[data-ok]').forEach((b) => b.onclick = async () => {
    const row = b.closest('.item'); const id = b.dataset.ok;
    try {
      await api(`/api/portal/students/${id}`, { method: 'PATCH', body: { license_class: row.querySelector('[data-cls]').value, instructor_id: Number(row.querySelector('[data-instr]').value) } });
      await api(`/api/instructor/signups/${id}/approve`, { method: 'POST' });
      toast('Freigeschaltet – der Schüler kann jetzt buchen ✓', 'ok'); row.remove(); refreshCounts();
    } catch (e) { toast(e.message, 'err'); }
  });
  m.querySelectorAll('[data-no]').forEach((b) => b.onclick = async () => {
    if (!await confirmBox('Anmeldung ablehnen und entfernen?', 'Entfernen')) return;
    try { await api(`/api/instructor/signups/${b.dataset.no}/reject`, { method: 'POST' }); b.closest('.item').remove(); refreshCounts(); } catch (e) { toast(e.message, 'err'); }
  });
}

// ====================== Fahrschüler & Akten ======================
const sState = { scope: 'active', q: '' };
async function viewSchueler(m) {
  const d = await api('/api/portal/students?scope=' + sState.scope);
  const canEdit = state.me.kind === 'owner' || ['admin', 'buero', 'fahrlehrer'].includes(state.me.role);
  const list = d.students.filter((s) => !sState.q || s.name.toLowerCase().includes(sState.q) || (s.username || '').toLowerCase().includes(sState.q));
  m.innerHTML = `<h1>🧑‍🎓 Fahrschüler &amp; Akten</h1><p class="lead">Klasse, Fahrlehrer, gefahrene Stunden, Theorie und offene Abrechnung auf einen Blick. Tipp auf einen Namen öffnet die Akte.</p>
    <div class="filters"><div class="field"><label>Suche</label><input id="s-q" value="${esc(sState.q)}" placeholder="Name oder Login"></div>
      <div class="field"><label>Bereich</label><select id="s-scope"><option value="active" ${sState.scope === 'active' ? 'selected' : ''}>Aktiv</option><option value="archived" ${sState.scope === 'archived' ? 'selected' : ''}>Archiv (bestanden)</option></select></div>
      <span class="hint" style="margin:0 0 .4rem">${list.length} Fahrschüler</span></div>
    <div class="tblwrap"><table class="p"><tr><th>Name</th><th>Klasse</th><th>Fahrlehrer</th><th class="r">Fahrstunden</th><th class="r">Theorie</th><th class="r">offen</th><th>Prüfung</th></tr>
      ${list.map((s) => `<tr><td><a href="#" data-akte="${s.id}" style="color:var(--ink);font-weight:700;text-decoration:none"><span class="avatar">${initials(s.name)}</span>${esc(s.name)}</a><div class="hint" style="margin:0">${esc(s.username || '')} · 📞 ${esc(s.phone || '–')}</div></td>
        <td>${canEdit ? `<select data-cls="${s.id}">${d.classes.map((c) => `<option value="${c[0]}" ${c[0] === s.license_class ? 'selected' : ''}>${c[0]}</option>`).join('')}</select>` : `<span class="tag brand">${esc(s.license_class)}</span>`}</td>
        <td>${canEdit && state.me.role !== 'fahrlehrer' ? `<select data-instr="${s.id}">${d.instructors.map((i) => `<option value="${i.id}" ${(s.instructor_id || 0) === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select>` : esc(s.instructor_name)}</td>
        <td class="r">${s.done_count} <span class="muted">(${Math.round(s.done_min / 60 * 10) / 10} h)</span></td>
        <td class="r">${s.theory_count}/${/^B/.test(s.license_class) ? 14 : 12}</td>
        <td class="r">${s.open_bill ? `<span class="tag warn">${s.open_bill}</span>` : '<span class="tag good">✓</span>'}</td>
        <td>${s.exam_date ? dmy(s.exam_date) : '<span class="muted">–</span>'}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Niemand gefunden.</td></tr>'}</table></div>`;
  $('#s-q').oninput = (e) => { sState.q = e.target.value.toLowerCase(); viewSchueler(m); };
  $('#s-scope').onchange = (e) => { sState.scope = e.target.value; viewSchueler(m); };
  m.querySelectorAll('[data-cls]').forEach((el) => el.onchange = async () => { try { await api(`/api/portal/students/${el.dataset.cls}`, { method: 'PATCH', body: { license_class: el.value } }); toast('Klasse gespeichert ✓', 'ok'); } catch (e) { toast(e.message, 'err'); } });
  m.querySelectorAll('[data-instr]').forEach((el) => el.onchange = async () => { try { await api(`/api/portal/students/${el.dataset.instr}`, { method: 'PATCH', body: { instructor_id: Number(el.value) } }); toast('Fahrlehrer zugewiesen ✓', 'ok'); } catch (e) { toast(e.message, 'err'); } });
  m.querySelectorAll('[data-akte]').forEach((el) => el.onclick = (e) => { e.preventDefault(); openAkte(Number(el.dataset.akte)); });
}
const typeLbl = (t) => ({ ueberland: '🌄 Überland', autobahn: '🛣️ Autobahn', nacht: '🌙 Nacht' }[t] || 'Übungsfahrt');
async function openAkte(id) {
  const d = await api(`/api/portal/students/${id}/akte`);
  const s = d.student; const need = /^B/.test(s.license_class) ? 14 : 12;
  const done = new Set(d.theory.map((t) => t.lesson_no));
  modal(`<h3><span class="avatar">${initials(s.name)}</span>${esc(s.name)} <span class="tag brand">${esc(s.license_class)}</span></h3>
    <div class="kv" style="margin-bottom:.8rem"><span>Fahrlehrer</span><div>${esc(s.instructor_name)}</div><span>Kontakt</span><div>📞 ${esc(s.phone || '–')} · ✉️ ${esc(s.email || '–')}</div>
      <span>Adresse</span><div>${esc([s.street, s.house_no].filter(Boolean).join(' '))}${s.zip || s.city ? ', ' + esc([s.zip, s.city].filter(Boolean).join(' ')) : ''}</div>
      <span>Geboren</span><div>${s.birth_date ? dmy(s.birth_date) : '–'}</div><span>Angemeldet</span><div>${dmyIso(s.created_at)}</div>${s.class_note ? `<span>Hinweis</span><div>${esc(s.class_note)}</div>` : ''}
      <span>Prüfung</span><div>${s.exam_date ? dmy(s.exam_date) : '–'}</div></div>
    <h4 style="margin:.6rem 0 .3rem">📚 Theorie ${done.size}/${need}</h4>
    <div class="lesson-grid">${Array.from({ length: need }, (_, i) => i + 1).map((n) => `<span class="${done.has(n) ? 'on' : ''}" title="${esc(d.lessons_map[n] || '')}">${n}</span>`).join('')}</div>
    <h4 style="margin:.9rem 0 .3rem">🚗 Fahrstunden ${d.lessons.length} · ${euro(d.total_cents)}${d.open_cents ? ` · <span class="tag warn">offen ${euro(d.open_cents)}</span>` : ''}</h4>
    <div class="tblwrap"><table class="p" style="min-width:420px"><tr><th>Datum</th><th>Art</th><th class="r">Min</th><th>Auto</th><th class="r">Preis</th><th></th></tr>
      ${d.lessons.map((l) => `<tr class="${l.billed_at ? 'billed' : ''}"><td>${dmy(l.date)} ${l.start_time}${l.invoice_date ? `<div class="hint" style="margin:0">🧾 ${dmy(l.invoice_date)}</div>` : ''}</td><td>${typeLbl(l.lesson_type)}${l.attended ? '' : ' <span class="tag bad">nicht da</span>'}</td><td class="r">${l.duration_min}</td><td>${esc(l.vehicle_plate || l.plate || '')}${l.gearbox === 'schalt' ? ' 🕹️' : l.gearbox === 'automatik' ? ' ⚙️' : ''}</td><td class="r">${euro(l.price_cents)}</td><td>${l.billed_at ? '✓' : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Noch keine Fahrstunden.</td></tr>'}</table></div>
    <div class="acts"><button class="ghost" onclick="closeModal()">Schließen</button></div>`);
}

// ====================== Theorie & QR ======================
let qrTimer = null;
async function viewTheorie(m) {
  const d = await api('/api/portal/theory');
  const open = d.sessions.find((s) => !s.ended_at);
  m.innerHTML = `<h1>📚 Theorie &amp; QR-Anwesenheit</h1><p class="lead">Theoriestunde starten → der QR-Code kommt an die Wand/Beamer und <strong>wechselt alle ${d.window_min} Minuten</strong>. Die Fahrschüler scannen ihn mit der Handykamera, ihre Anwesenheit landet sofort in der Akte. Nachträglich scannen geht nicht – nur der aktuelle Code zählt.</p>
    ${open ? '' : `<div class="card"><h2>Theoriestunde starten</h2><div class="row">
      <div class="field" style="flex:2"><label>Lektion</label><select id="th-no">${Object.entries(d.lessons).map(([n, t]) => `<option value="${n}">${n} – ${esc(t)}</option>`).join('')}</select></div>
      <div class="field"><label>Datum</label><input type="date" id="th-date" value="${todayStr()}"></div></div>
      <button id="th-start">▶️ Starten &amp; QR zeigen</button></div>`}
    <div id="th-live"></div>
    <div class="card"><h2>Letzte Theoriestunden</h2><div class="tblwrap"><table class="p" style="min-width:420px"><tr><th>Datum</th><th>Lektion</th><th>Von</th><th class="r">Teilnehmer</th><th></th></tr>
      ${d.sessions.map((s) => `<tr><td>${dmy(s.date)}</td><td><strong>${s.lesson_no}</strong> ${esc(s.title || '')}</td><td>${esc(s.by_name || '')}</td><td class="r">${s.attendees}</td><td>${s.ended_at ? '<span class="tag">beendet</span>' : '<span class="tag good">läuft</span>'}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Noch keine.</td></tr>'}</table></div></div>`;
  if (!open) $('#th-start').onclick = async () => { try { await api('/api/portal/theory', { method: 'POST', body: { lesson_no: Number($('#th-no').value), date: $('#th-date').value } }); viewTheorie(m); } catch (e) { toast(e.message, 'err'); } };
  else showTheoryLive(open, m);
}
function drawQR(el, text) {
  if (!el || !window.qrEncode) return;
  let q; try { q = window.qrEncode(text); } catch { el.innerHTML = '<span class="hint">QR zu lang</span>'; return; }
  const n = q.size, cv = document.createElement('canvas'); cv.width = cv.height = n; const c = cv.getContext('2d');
  c.fillStyle = '#fff'; c.fillRect(0, 0, n, n); c.fillStyle = '#000';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.get(x, y)) c.fillRect(x, y, 1, 1);
  el.innerHTML = ''; el.appendChild(cv);
}
async function showTheoryLive(s, m) {
  const box = $('#th-live');
  box.innerHTML = `<div class="card"><h2>▶️ Läuft: Lektion ${s.lesson_no} – ${esc(s.title || '')}</h2>
    <div class="qr-stage"><div><div class="qr-box" id="qr"></div><div class="qr-timer"><i id="qr-bar" style="width:100%"></i></div>
      <div class="qr-meta">Neuer Code in <strong id="qr-left">–</strong> · <span id="qr-url" class="muted"></span></div>
      <div class="inline" style="margin-top:.6rem"><button id="qr-big">🖥️ Groß anzeigen</button><button class="ghost" id="qr-end">⏹️ Theoriestunde beenden</button></div></div>
      <div><h4 style="margin:0 0 .4rem">Anwesend <span id="att-n" class="tag good">0</span></h4><div class="att" id="att"></div>
        <div class="inline" style="margin-top:.6rem"><button class="ghost sm" id="att-add">＋ manuell nachtragen</button></div></div></div></div>`;
  let cur = null;
  const load = async () => {
    try {
      const d = await api(`/api/portal/theory/${s.id}/code`);
      if (!cur || cur.token !== d.token) { drawQR($('#qr'), d.url); const big = $('#qr-big-box'); if (big) drawQR(big, d.url); }
      cur = d;
      $('#qr-url').textContent = d.url;
      $('#att').innerHTML = d.attendees.map((a) => `<div><span>${esc(a.name)}</span><span class="muted">${hhmm(a.at)}</span></div>`).join('') || '<div class="muted">Noch niemand gescannt.</div>';
      $('#att-n').textContent = d.attendees.length;
    } catch (e) { toast(e.message, 'err'); }
  };
  await load();
  clearInterval(qrTimer);
  qrTimer = setInterval(() => {
    if (state.view !== 'theorie' || !cur) return clearInterval(qrTimer);
    const left = Math.max(0, cur.valid_until - Date.now()); const total = 5 * 60000;
    $('#qr-left').textContent = `${Math.floor(left / 60000)}:${pad(Math.floor((left % 60000) / 1000))}`;
    $('#qr-bar').style.width = (left / total * 100) + '%';
    const bl = $('#qr-big-left'); if (bl) bl.textContent = $('#qr-left').textContent;
    if (left <= 0 || Math.floor(left / 1000) % 15 === 0) load();
  }, 1000);
  $('#qr-end').onclick = async () => { if (!await confirmBox('Theoriestunde beenden? Danach kann niemand mehr scannen.', 'Beenden')) return; await api(`/api/portal/theory/${s.id}/end`, { method: 'POST' }); clearInterval(qrTimer); viewTheorie(m); };
  $('#qr-big').onclick = () => {
    const big = document.createElement('div'); big.className = 'qr-big';
    big.innerHTML = `<button class="close ghost" id="qr-big-x">✕ Schließen</button><h2>📚 Lektion ${s.lesson_no} – ${esc(s.title || '')}</h2><div class="qr-box" id="qr-big-box"></div><h2>Handykamera drauf halten → Anwesenheit ✓ · neuer Code in <span id="qr-big-left"></span></h2>`;
    document.body.appendChild(big); if (cur) drawQR($('#qr-big-box'), cur.url);
    $('#qr-big-x').onclick = () => big.remove();
    big.requestFullscreen?.().catch(() => {});
  };
  $('#att-add').onclick = async () => {
    const { students } = await api('/api/portal/students');
    const mm = modal(`<h3>Anwesenheit nachtragen</h3><div class="field"><label>Fahrschüler</label><select id="aa-s">${students.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div>
      <div class="acts"><button class="ghost" onclick="closeModal()">Abbrechen</button><button id="aa-ok">Eintragen</button></div>`);
    $('#aa-ok', mm).onclick = async () => { try { await api(`/api/portal/theory/${s.id}/attendance`, { method: 'POST', body: { student_id: Number($('#aa-s', mm).value) } }); closeModal(); load(); } catch (e) { toast(e.message, 'err'); } };
  };
}

// ====================== Abrechnung (fsmanager / DataPart) ======================
const bState = { from: null, to: null, status: 'open' };
async function viewAbrechnung(m) {
  if (!bState.from) { const d = new Date(); bState.from = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`; bState.to = todayStr(); }
  const q = `from=${bState.from}&to=${bState.to}&status=${bState.status}`;
  const d = await api('/api/portal/billing?' + q);
  const canMark = state.me.kind === 'owner' || ['admin', 'abrechnung'].includes(state.me.role);
  m.innerHTML = `<h1>🧾 Abrechnung</h1><p class="lead">Genau das, was die Abrechnung braucht: <strong>wann</strong> gefahren wurde (Datum + Uhrzeit), wie lange, welches Auto, welcher Preis. Weicht das Rechnungsdatum vom Fahrdatum ab, steht hier das <strong>Rechnungsdatum</strong>. Abgerechnet → Haken setzen.</p>
    <div class="filters"><div class="field"><label>Von</label><input type="date" id="b-from" value="${bState.from}"></div><div class="field"><label>Bis</label><input type="date" id="b-to" value="${bState.to}"></div>
      <div class="field"><label>Status</label><select id="b-status"><option value="open" ${bState.status === 'open' ? 'selected' : ''}>Offen</option><option value="billed" ${bState.status === 'billed' ? 'selected' : ''}>Abgerechnet</option><option value="all" ${bState.status === 'all' ? 'selected' : ''}>Alle</option></select></div>
      <a class="btnlike" href="/api/portal/billing.csv?${q}">⬇️ CSV (Excel)</a>${canMark && bState.status !== 'billed' && d.rows.some((r) => !r.billed_at) ? '<button id="b-all">✅ Alle sichtbaren als abgerechnet</button>' : ''}</div>
    <div class="sum"><div><b>${d.rows.length}</b><span>Fahrstunden</span></div><div><b>${euro(d.total_cents)}</b><span>Summe</span></div><div><b>${euro(d.open_cents)}</b><span>davon offen</span></div><div><b>${d.unit_min} Min</b><span>= 1 Einheit</span></div></div>
    <div class="tblwrap"><table class="p"><tr>${canMark ? '<th></th>' : ''}<th>Rechnung am</th><th>Fahrschüler</th><th>Kl.</th><th>Gefahren</th><th class="r">Min</th><th class="r">Einh.</th><th>Art</th><th>Auto</th><th>Fahrlehrer</th><th class="r">Preis</th><th>Status</th></tr>
      ${d.rows.map((r) => `<tr class="${r.billed_at ? 'billed' : ''}">${canMark ? `<td><input type="checkbox" data-sel="${r.id}" style="width:auto"></td>` : ''}
        <td><strong>${dmy(r.bill_date)}</strong> ${r.bill_time}${r.invoice_date ? ' <span class="tag">🧾</span>' : ''}</td><td>${esc(r.student_name)}</td><td><span class="tag brand">${esc(r.license_class)}</span></td>
        <td>${dmy(r.date)} ${r.start_time}${r.started_at ? `<div class="hint" style="margin:0">echt ${hhmm(r.started_at)}${r.ended_at ? '–' + hhmm(r.ended_at) : ''}</div>` : ''}</td><td class="r">${r.duration_min}</td><td class="r">${r.units}</td>
        <td>${typeLbl(r.lesson_type)}${r.attended ? '' : ' <span class="tag bad">nicht da</span>'}</td><td>${esc(r.vehicle_plate || r.plate || '')}${r.gearbox === 'schalt' ? ' 🕹️' : r.gearbox === 'automatik' ? ' ⚙️' : ''}</td><td>${esc(r.instructor_name)}</td>
        <td class="r"><strong>${euro(r.price_cents)}</strong></td><td>${r.billed_at ? `<span class="tag good" title="${esc(r.billed_by || '')}">✓ ${dmyIso(r.billed_at)}</span>${canMark ? ` <button class="ghost sm" data-unmark="${r.id}" title="wieder öffnen">↩︎</button>` : ''}` : canMark ? `<button class="sm" data-mark="${r.id}">abgerechnet</button>` : '<span class="tag warn">offen</span>'}</td></tr>`).join('') || `<tr><td colspan="12" class="muted">Nichts in diesem Zeitraum.</td></tr>`}</table></div>
    ${canMark ? '<div class="inline" style="margin-top:.6rem"><button class="sec" id="b-sel">✅ Markierte als abgerechnet</button></div>' : ''}`;
  const re = () => viewAbrechnung(m);
  $('#b-from').onchange = (e) => { bState.from = e.target.value; re(); }; $('#b-to').onchange = (e) => { bState.to = e.target.value; re(); }; $('#b-status').onchange = (e) => { bState.status = e.target.value; re(); };
  const mark = async (ids, billed) => { try { const r = await api('/api/portal/billing/mark', { method: 'POST', body: { ids, billed } }); toast(`${r.changed} Fahrstunde(n) ${billed ? 'abgerechnet ✓' : 'wieder geöffnet'}`, 'ok'); re(); refreshCounts(); } catch (e) { toast(e.message, 'err'); } };
  m.querySelectorAll('[data-mark]').forEach((b) => b.onclick = () => mark([Number(b.dataset.mark)], true));
  m.querySelectorAll('[data-unmark]').forEach((b) => b.onclick = () => mark([Number(b.dataset.unmark)], false));
  const all = $('#b-all'); if (all) all.onclick = async () => { const ids = d.rows.filter((r) => !r.billed_at).map((r) => r.id); if (await confirmBox(`${ids.length} Fahrstunden als abgerechnet markieren?`, 'Ja, alle')) mark(ids, true); };
  const sel = $('#b-sel'); if (sel) sel.onclick = () => { const ids = [...m.querySelectorAll('[data-sel]:checked')].map((c) => Number(c.dataset.sel)); if (!ids.length) return toast('Erst Zeilen ankreuzen', 'err'); mark(ids, true); };
}

// ====================== Steuerbüro ======================
async function viewSteuer(m) {
  const year = state._taxYear || new Date().getFullYear();
  const d = await api('/api/portal/tax?year=' + year);
  const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const max = Math.max(1, ...d.months.map((x) => x.cents));
  m.innerHTML = `<h1>📊 Steuerbüro</h1><p class="lead">Monatssummen aus den gefahrenen Fahrstunden – nur Zahlen, keine Schülerdaten. Als CSV für die Buchhaltung exportierbar.</p>
    <div class="filters"><div class="field"><label>Jahr</label><select id="tx-year">${[0, 1, 2, 3].map((i) => { const y = new Date().getFullYear() - i; return `<option value="${y}" ${y === Number(year) ? 'selected' : ''}>${y}</option>`; }).join('')}</select></div>
      <a class="btnlike" href="/api/portal/tax.csv?year=${year}">⬇️ CSV (Excel)</a></div>
    <div class="sum"><div><b>${euro(d.total_cents)}</b><span>Umsatz ${year}</span></div><div><b>${d.months.reduce((a, x) => a + x.lessons, 0)}</b><span>Fahrstunden</span></div><div><b>${Math.round(d.months.reduce((a, x) => a + x.minutes, 0) / 60)} h</b><span>Fahrzeit</span></div><div><b>${d.active_students}</b><span>aktive Fahrschüler</span></div></div>
    <div class="tblwrap"><table class="p"><tr><th>Monat</th><th></th><th class="r">Fahrstunden</th><th class="r">Stunden</th><th class="r">Sonderfahrten</th><th class="r">nicht ersch.</th><th class="r">Umsatz</th><th class="r">abgerechnet</th><th class="r">offen</th></tr>
      ${d.months.map((x, i) => `<tr><td><strong>${MON[i]}</strong></td><td style="min-width:120px"><div class="progress"><i style="width:${x.cents / max * 100}%"></i></div></td><td class="r">${x.lessons}</td><td class="r">${Math.round(x.minutes / 6) / 10}</td><td class="r">${x.sonder}</td><td class="r">${x.noshow}</td><td class="r"><strong>${euro(x.cents)}</strong></td><td class="r">${euro(x.billed_cents)}</td><td class="r">${x.open_cents ? `<span class="tag warn">${euro(x.open_cents)}</span>` : '–'}</td></tr>`).join('')}</table></div>`;
  $('#tx-year').onchange = (e) => { state._taxYear = e.target.value; viewSteuer(m); };
}

// ====================== Preise ======================
async function viewPreise(m) {
  const d = await api('/api/portal/prices');
  const F = [['grund', 'Grundbetrag'], ['fahrstunde', `Fahrstunde (${d.unit_min} Min)`], ['sonderfahrt', `Sonderfahrt (${d.unit_min} Min)`], ['pruef_theorie', 'Vorstellung Theorie'], ['pruef_praxis', 'Vorstellung Praxis']];
  m.innerHTML = `<h1>💶 Preise</h1><p class="lead">Preisklassen je Führerscheinklasse. Eine <strong>Fahrstunde = ${d.unit_min} Minuten</strong>; eine 80-Minuten-Stunde sind also 2 Einheiten. Überland/Autobahn/Nacht laufen als Sonderfahrt. Bei Nichterscheinen werden ${d.noshow_pct} % berechnet.</p>
    <div class="card"><div class="row"><div class="field"><label>Name der Fahrschule</label><input id="pr-school" value="${esc(d.school_name)}"></div><div class="field"><label>Minuten je Einheit</label><input type="number" id="pr-unit" value="${d.unit_min}" min="10" style="width:110px"></div><div class="field"><label>Nichterscheinen %</label><input type="number" id="pr-noshow" value="${d.noshow_pct}" min="0" max="100" style="width:110px"></div></div>
    <div class="tblwrap"><table class="p price-grid"><tr><th>Klasse</th>${F.map((f) => `<th class="r">${f[1]} €</th>`).join('')}</tr>
      ${d.classes.map(([k, l]) => `<tr><td>${esc(k)}<span class="cl">${esc(l)}</span></td>${F.map((f) => `<td class="r"><input data-k="${k}" data-f="${f[0]}" value="${(d.prices[k]?.[f[0]] ?? 0).toString().replace('.', ',')}" inputmode="decimal"></td>`).join('')}</tr>`).join('')}</table></div>
    <div class="acts" style="justify-content:flex-start;margin-top:1rem"><button id="pr-save">💾 Preise speichern</button></div></div>`;
  $('#pr-save').onclick = async () => {
    const prices = {};
    m.querySelectorAll('input[data-k]').forEach((i) => { (prices[i.dataset.k] ||= {})[i.dataset.f] = i.value; });
    try { await api('/api/portal/prices', { method: 'PUT', body: { prices, unit_min: Number($('#pr-unit').value), noshow_pct: Number($('#pr-noshow').value), school_name: $('#pr-school').value } }); toast('Preise gespeichert ✓', 'ok'); } catch (e) { toast(e.message, 'err'); }
  };
}

// ====================== Urlaub & Krank ======================
async function viewAbwesenheit(m) {
  const d = await api('/api/portal/absences');
  const isAdmin = state.me.kind === 'owner' || state.me.role === 'admin';
  const K = { urlaub: '🌴 Urlaub', krank: '🤒 Krank', frei: '📅 Frei' };
  const S = { offen: ['pending', '⏳ wartet auf Genehmigung'], genehmigt: ['ok', '✅ genehmigt'], abgelehnt: ['bad', '❌ abgelehnt'], gemeldet: ['ok', '📨 gemeldet'] };
  m.innerHTML = `<h1>🌴 Urlaub &amp; Krankmeldung</h1><p class="lead">Urlaub wird beantragt und vom Inhaber genehmigt. Eine Krankmeldung ist sofort gemeldet – das Büro bekommt eine Push-Nachricht. Resturlaub ${new Date().getFullYear()}: <strong>${d.vacation.days - d.vacation.used}</strong> von ${d.vacation.days} Tagen.</p>
    <div class="card"><h2>Einreichen</h2><div class="row">
      <div class="field"><label>Art</label><select id="ab-kind"><option value="urlaub">🌴 Urlaub</option><option value="krank">🤒 Krankmeldung</option><option value="frei">📅 Freier Tag</option></select></div>
      <div class="field"><label>Von</label><input type="date" id="ab-from" value="${todayStr()}"></div><div class="field"><label>Bis</label><input type="date" id="ab-to" value="${todayStr()}"></div>
      <div class="field" style="flex:1"><label>Notiz</label><input id="ab-note" placeholder="optional"></div></div>
      <button id="ab-go">📨 Einreichen</button></div>
    <h2 style="font-size:1.05rem">${d.all ? 'Alle Anträge' : 'Meine Anträge'}</h2>
    <div class="list">${d.absences.map((a) => { const st = S[a.status] || ['', a.status]; return `<div class="item ${st[0]}"><div><div class="t">${K[a.kind] || a.kind} · ${esc(a.by_name)}</div><div class="m">${dmy(a.from_date)}${a.to_date !== a.from_date ? ' – ' + dmy(a.to_date) : ''} (${Math.round((new Date(a.to_date) - new Date(a.from_date)) / 864e5) + 1} Tag(e))${a.note ? ' · ' + esc(a.note) : ''}<br>${st[1]}${a.decided_by ? ' von ' + esc(a.decided_by) : ''}</div></div>
      <div class="acts">${isAdmin && a.status === 'offen' ? `<button data-dec="genehmigt" data-id="${a.id}">✅ Genehmigen</button><button class="ghost" data-dec="abgelehnt" data-id="${a.id}">❌</button>` : ''}${(isAdmin || (state.me.kind === 'staff' && a.by_id === state.me.id && a.status === 'offen')) ? `<button class="ghost" data-del="${a.id}">🗑️</button>` : ''}</div></div>`; }).join('') || '<div class="card"><p class="hint" style="margin:0">Noch keine Anträge.</p></div>'}</div>`;
  $('#ab-go').onclick = async () => {
    try { const r = await api('/api/portal/absences', { method: 'POST', body: { kind: $('#ab-kind').value, from_date: $('#ab-from').value, to_date: $('#ab-to').value, note: $('#ab-note').value } }); toast(r.status === 'offen' ? 'Eingereicht – wartet auf Genehmigung' : 'Gemeldet ✓', 'ok'); viewAbwesenheit(m); refreshCounts(); } catch (e) { toast(e.message, 'err'); }
  };
  m.querySelectorAll('[data-dec]').forEach((b) => b.onclick = async () => { try { await api(`/api/portal/absences/${b.dataset.id}/${b.dataset.dec}`, { method: 'POST' }); viewAbwesenheit(m); refreshCounts(); } catch (e) { toast(e.message, 'err'); } });
  m.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (!await confirmBox('Antrag löschen?', 'Löschen')) return; try { await api(`/api/portal/absences/${b.dataset.del}/delete`, { method: 'POST' }); viewAbwesenheit(m); refreshCounts(); } catch (e) { toast(e.message, 'err'); } });
}

// ====================== Team & Zugänge ======================
async function viewTeam(m) {
  const d = await api('/api/portal/staff');
  const isAdmin = state.me.kind === 'owner' || state.me.role === 'admin';
  m.innerHTML = `<h1>👥 Team &amp; Zugänge</h1><p class="lead">Jeder bekommt genau den Zugang, den er braucht. Fahrlehrer arbeiten zusätzlich in der Fahrlehrer-App (Kalender, Stunden abschließen). Adressen: <code>buero.</code>, <code>abrechnung.</code>, <code>steuer.</code>, <code>team.</code> vor der Domain öffnen direkt dieses Portal – oder überall <code>/portal</code>.</p>
    ${isAdmin ? '<div class="inline" style="margin-bottom:1rem"><button id="st-add">＋ Zugang anlegen</button></div>' : ''}
    <div class="list">${d.staff.map((s) => `<div class="item ${s.active ? '' : 'bad'}"><div><div class="t"><span class="avatar" style="${s.color ? 'background:' + esc(s.color) : ''}">${initials(s.name)}</span>${esc(s.name)} <span class="tag brand">${d.roles[s.role]?.icon || ''} ${esc(d.roles[s.role]?.label || s.role)}</span>${s.active ? '' : ' <span class="tag bad">deaktiviert</span>'}</div>
      <div class="m">Login <code>${esc(s.username)}</code>${s.phone ? ' · 📞 ' + esc(s.phone) : ''}${s.email ? ' · ✉️ ' + esc(s.email) : ''}${s.role === 'fahrlehrer' ? ` · ${s.students} Fahrschüler · ${s.vacation_days} Urlaubstage` : ''}</div></div>
      <div class="acts">${isAdmin ? `<button class="sec" data-edit="${s.id}">✏️</button><button class="ghost" data-del="${s.id}">🗑️</button>` : ''}</div></div>`).join('') || '<div class="card"><p class="hint" style="margin:0">Noch keine Team-Konten. Lege z.B. „Büro", „Abrechnung" und deine Fahrlehrer an.</p></div>'}</div>`;
  if (!isAdmin) return;
  $('#st-add').onclick = () => editStaff(null, d.roles, m);
  m.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => editStaff(d.staff.find((s) => s.id === Number(b.dataset.edit)), d.roles, m));
  m.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (!await confirmBox('Zugang endgültig löschen? (Deaktivieren geht auch über ✏️)', 'Löschen')) return; try { await api(`/api/portal/staff/${b.dataset.del}`, { method: 'DELETE' }); viewTeam(m); } catch (e) { toast(e.message, 'err'); } });
}
function genPw() { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; let s = ''; for (let i = 0; i < 9; i++) s += a[Math.floor(Math.random() * a.length)]; return s + '#' + Math.floor(Math.random() * 90 + 10); }
function editStaff(s, roles, m) {
  const mm = modal(`<h3>${s ? '✏️ Zugang bearbeiten' : '＋ Zugang anlegen'}</h3>
    <div class="row"><div class="field" style="flex:1"><label>Name</label><input id="se-name" value="${esc(s?.name || '')}"></div><div class="field" style="flex:1"><label>Rolle</label><select id="se-role">${Object.entries(roles).map(([k, r]) => `<option value="${k}" ${s?.role === k ? 'selected' : ''}>${r.icon} ${esc(r.label)}</option>`).join('')}</select></div></div>
    <div class="row"><div class="field" style="flex:1"><label>Benutzername</label><input id="se-user" value="${esc(s?.username || '')}" ${s ? 'disabled' : ''} autocapitalize="none" placeholder="z.B. anna"></div>
      <div class="field" style="flex:1"><label>${s ? 'Neues Passwort (leer = unverändert)' : 'Passwort'}</label><div class="inline"><input id="se-pw" value="${s ? '' : genPw()}" style="flex:1"><button class="ghost sm" id="se-gen" type="button">🎲</button></div></div></div>
    <div class="row"><div class="field" style="flex:1"><label>Handy</label><input id="se-phone" value="${esc(s?.phone || '')}"></div><div class="field" style="flex:1"><label>E-Mail</label><input id="se-mail" value="${esc(s?.email || '')}"></div></div>
    <div class="row"><div class="field"><label>Farbe (Fahrlehrer)</label><input type="color" id="se-color" value="${esc(s?.color || '#4d8dff')}" style="height:42px;padding:.2rem"></div><div class="field"><label>Urlaubstage / Jahr</label><input type="number" id="se-vac" value="${s?.vacation_days ?? 30}" style="width:110px"></div>
      ${s ? `<div class="field"><label>Status</label><label class="inline"><input type="checkbox" id="se-active" ${s.active ? 'checked' : ''} style="width:auto"> aktiv</label></div>` : ''}</div>
    <p class="hint">Passwort: mind. 8 Zeichen mit Buchstabe, Zahl und Sonderzeichen. Zugangsdaten am besten persönlich weitergeben.</p>
    <div class="acts"><button class="ghost" id="se-x">Abbrechen</button><button id="se-ok">Speichern</button></div>`);
  $('#se-gen', mm).onclick = () => { $('#se-pw', mm).value = genPw(); };
  $('#se-x', mm).onclick = closeModal;
  $('#se-ok', mm).onclick = async () => {
    const body = { name: $('#se-name', mm).value, role: $('#se-role', mm).value, phone: $('#se-phone', mm).value, email: $('#se-mail', mm).value, color: $('#se-color', mm).value, vacation_days: Number($('#se-vac', mm).value) };
    const pw = $('#se-pw', mm).value; if (pw) body.password = pw;
    if (!s) body.username = $('#se-user', mm).value; else body.active = $('#se-active', mm).checked;
    try {
      await api(s ? `/api/portal/staff/${s.id}` : '/api/portal/staff', { method: s ? 'PATCH' : 'POST', body });
      closeModal();
      if (!s || pw) modal(`<h3>✅ Zugang ${s ? 'aktualisiert' : 'angelegt'}</h3><p>Diese Daten weitergeben:</p><div class="kv"><span>Adresse</span><div><code>${esc(location.origin)}/portal</code></div><span>Benutzer</span><div><code>${esc(s ? s.username : body.username.toLowerCase())}</code></div><span>Passwort</span><div><code>${esc(pw)}</code></div></div><div class="acts"><button onclick="closeModal()">Alles klar</button></div>`);
      else toast('Gespeichert ✓', 'ok');
      viewTeam(m);
    } catch (e) { toast(e.message, 'err', 5000); }
  };
}

// ====================== Mein Konto ======================
async function viewKonto(m) {
  const me = state.me;
  const pushOk = 'serviceWorker' in navigator && 'PushManager' in window;
  m.innerHTML = `<h1>🔐 Mein Konto</h1><p class="lead">${esc(me.name)} · ${me.kind === 'owner' ? 'Inhaber (PIN-Zugang aus der Fahrlehrer-App)' : (state.roles[me.role]?.label || me.role)}</p>
    <div class="card"><h2>🔔 Push-Benachrichtigungen</h2><p class="hint">Fahrzeug gebucht / wieder frei, neue Anmeldung, Urlaub genehmigt – direkt aufs Handy. ${pushOk ? '' : 'Auf diesem Gerät nicht verfügbar (iPhone: Seite zum Home-Bildschirm hinzufügen).'}</p>
      <div class="inline"><button id="push-on" ${pushOk ? '' : 'disabled'}>🔔 Einschalten</button><button class="ghost" id="push-off">🔕 Aus</button></div></div>
    ${me.kind === 'staff' ? `<div class="card"><h2>Passwort ändern</h2><div class="row"><div class="field"><label>Altes Passwort</label><input type="password" id="pw-old"></div><div class="field"><label>Neues Passwort</label><input type="password" id="pw-new"></div></div><button id="pw-go">Ändern</button></div>` : ''}`;
  $('#push-on').onclick = enablePush; $('#push-off').onclick = disablePush;
  const pg = $('#pw-go'); if (pg) pg.onclick = async () => { try { await api('/api/portal/password', { method: 'POST', body: { old: $('#pw-old').value, password: $('#pw-new').value } }); toast('Passwort geändert ✓', 'ok'); } catch (e) { toast(e.message, 'err'); } };
}
function urlB64ToUint8(b64) { const p = '='.repeat((4 - b64.length % 4) % 4); const s = (b64 + p).replace(/-/g, '+').replace(/_/g, '/'); const raw = atob(s); return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))); }
async function enablePush() {
  try {
    if (Notification.permission === 'denied') return toast('Benachrichtigungen sind im Browser blockiert.', 'err');
    if ((await Notification.requestPermission()) !== 'granted') return toast('Ohne Erlaubnis keine Push-Nachrichten.', 'err');
    const reg = await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready;
    const { key } = await api('/api/push/key'); if (!key) return toast('Push ist nicht eingerichtet', 'err');
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(key) });
    const j = sub.toJSON(); await api('/api/push/subscribe', { method: 'POST', body: { endpoint: j.endpoint, keys: j.keys } });
    toast('Push an 🔔', 'ok');
  } catch (e) { toast('Push fehlgeschlagen: ' + e.message, 'err'); }
}
async function disablePush() {
  try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) { await api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {}); await sub.unsubscribe(); } toast('Push aus', 'ok'); } catch (e) { toast(e.message, 'err'); }
}

// ====================== Boot ======================
async function boot() {
  let d;
  try { d = await api('/api/portal/me'); } catch { return renderLogin(); }
  state.me = d.me; state.roles = d.roles; state.classes = d.classes; state.counts = d.counts; state.school = d.school;
  renderShell();
  const h = location.hash.replace('#', '');
  const first = myViews().find((v) => !Array.isArray(v) && v.k === h) ? h : 'start';
  go(first);
  setInterval(refreshCounts, 60000);
}
window.closeModal = closeModal;
window.addEventListener('hashchange', () => { const h = location.hash.replace('#', ''); if (state.me && h && h !== state.view && myViews().find((v) => !Array.isArray(v) && v.k === h)) go(h); });
boot();
