'use strict';
// ====================== Fahrschulportal – Frontend ======================
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const WD_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

const state = { user: null, settings: null, date: todayStr(), instrTab: 'heute' };

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

// ---------- Datum ----------
function todayStr() { return new Date().toISOString().slice(0, 10); }
function parseD(s) { return new Date(s + 'T00:00:00'); }
function isoDow(s) { const d = parseD(s).getDay(); return d === 0 ? 7 : d; }
function addDays(s, n) { const d = parseD(s); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function mondayOf(s) { return addDays(s, -(isoDow(s) - 1)); }
function fmtDay(s) { const d = parseD(s); return `${WD_LONG[isoDow(s) - 1]}, ${d.getDate()}. ${MON[d.getMonth()]} ${d.getFullYear()}`; }
function fmtShort(s) { const d = parseD(s); return `${d.getDate()}.${d.getMonth() + 1}.`; }
function hoursUntil(date, start) { return (new Date(`${date}T${start}:00`).getTime() - Date.now()) / 36e5; }
function daysAhead(date) { return Math.round((parseD(date).getTime() - parseD(todayStr()).getTime()) / 864e5); }
function minToH(m) { return (m / 60); }
function hLabel(m) { const h = Math.floor(m / 60), mm = m % 60; return mm ? `${h}:${String(mm).padStart(2, '0')} h` : `${h} h`; }

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
    <div class="brand"><span class="logo">🚗</span> Fahrschulportal</div>
    <div class="who">
      <span class="role">${u.role === 'instructor' ? 'Fahrlehrer' : 'Fahrschüler'}</span>
      <strong>${esc(u.name || '')}</strong>
      <button class="ghost sm" id="logout">Abmelden</button>
    </div>
  </header>`;
}
function wireLogout() {
  const b = $('#logout');
  if (b) b.onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); state.user = null; render(); };
}

// ====================== LOGIN ======================
function renderAuth() {
  let tab = 'login';
  const draw = () => {
    app.innerHTML = `<div class="auth-wrap"><div class="auth">
      <div class="logo-big">🚗</div>
      <h1>Fahrschulportal</h1>
      <div class="tag">Fahrstunden einfach online buchen</div>
      <div class="card">
        <div class="tabs">
          <button data-t="login" class="${tab === 'login' ? 'active' : ''}">Anmelden</button>
          <button data-t="register" class="${tab === 'register' ? 'active' : ''}">Neu (mit Code)</button>
          <button data-t="instr" class="${tab === 'instr' ? 'active' : ''}">Fahrlehrer</button>
        </div>
        <div id="authbody"></div>
      </div>
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
    <div class="field"><label>E-Mail</label><input id="l-email" type="email" autocomplete="username"></div>
    <div class="field"><label>Passwort</label><input id="l-pw" type="password" autocomplete="current-password"></div>
    <div class="form-actions"><button id="l-go">Anmelden</button></div>`;
}
function registerForm() {
  return `${errBox()}
    <p class="hint">Du hast von deinem Fahrlehrer einen Zugangscode bekommen? Damit legst du hier einmalig dein Konto an.</p>
    <div class="field"><label>Zugangscode</label><input id="r-code" placeholder="XXXX-XXXX" style="text-transform:uppercase"></div>
    <div class="field"><label>Name</label><input id="r-name" autocomplete="name"></div>
    <div class="row">
      <div class="field"><label>E-Mail</label><input id="r-email" type="email"></div>
      <div class="field"><label>Telefon (optional)</label><input id="r-phone"></div>
    </div>
    <div class="field"><label>Passwort (mind. 6 Zeichen)</label><input id="r-pw" type="password"></div>
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
        await api('/api/auth/login', { method: 'POST', body: { email: $('#l-email').value, password: $('#l-pw').value } });
        done();
      } catch (e) { showErr(e.message); }
    };
  } else if (tab === 'register') {
    $('#r-go').onclick = async () => {
      try {
        await api('/api/auth/register', { method: 'POST', body: {
          code: $('#r-code').value, name: $('#r-name').value, email: $('#r-email').value,
          phone: $('#r-phone').value, password: $('#r-pw').value } });
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
    <div class="card hidden" id="notif-card"></div>
    <div class="card" id="week-card"></div>
    <div class="card hidden" id="offers-card"></div>
    <div class="card">
      <h2>Termin buchen <span class="sub" id="horizon-note"></span></h2>
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
  $('#prev').onclick = () => { state.date = addDays(state.date, 1); syncStudent(); };
  $('#next').onclick = () => { state.date = addDays(state.date, 1); syncStudent(); };
  $('#prev').onclick = () => { state.date = addDays(state.date, -1); syncStudent(); };
  $('#dpick').onchange = (e) => { state.date = e.target.value; syncStudent(); };
  syncStudent();
}

let myBookingsCache = [];
async function syncStudent() {
  $('#dlabel').textContent = fmtDay(state.date);
  $('#dpick').value = state.date;
  try {
    const [mine, day, off, notif] = await Promise.all([
      api('/api/my/bookings'), api('/api/slots?date=' + state.date),
      api('/api/offers'), api('/api/my/notifications')]);
    myBookingsCache = mine.bookings;
    renderNotifications(notif.notifications, notif.unread);
    renderWeekCard(mine.weekInfo, mine.bookings);
    renderOffers(off.offers, mine.weekInfo);
    renderSlots(day.slots, mine.bookings);
  } catch (e) { toast(e.message, 'err'); }
}

function renderWeekCard(wi, bookings) {
  const upcoming = bookings.filter((b) => b.date >= todayStr()).sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
  const remainColor = wi.remaining > 0 ? 'good' : 'bad';
  $('#week-card').innerHTML = `
    <h2>Meine Fahrstunden <span class="sub">diese Woche (${fmtShort(wi.from)}–${fmtShort(wi.to)})</span></h2>
    <div class="inline" style="margin-bottom:1rem">
      <span class="pill" style="background:${wi.remaining > 0 ? 'var(--good-bg)' : 'var(--bad-bg)'};color:var(--${remainColor})">
        ${wi.count} von ${wi.max} gebucht · noch ${wi.remaining} frei
      </span>
    </div>
    ${upcoming.length ? `<div class="blist">${upcoming.map(studentBookingItem).join('')}</div>`
      : '<p class="muted">Noch keine kommenden Termine gebucht.</p>'}`;
  const c = $('#week-card');
  c.querySelectorAll('[data-cancel]').forEach((b) => b.onclick = () => cancelBooking(b.dataset.cancel));
  c.querySelectorAll('[data-offer]').forEach((b) => b.onclick = () => offerBooking(b.dataset.offer));
  c.querySelectorAll('[data-withdraw]').forEach((b) => b.onclick = () => withdrawOffer(b.dataset.withdraw));
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
      <div class="meta">${st} ${gear} ${b.plate ? '· ' + esc(b.plate) : ''}
        ${b.status === 'booked' && soon ? `<span class="muted">· in ${h < 1 ? '<1' : Math.round(h)} h</span>` : ''}</div>
    </div>
    <div class="inline">${actions}</div>
  </div>`;
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
      ${canTake ? `<button class="sm" data-take="${o.id}">Übernehmen</button>` : ''}</div>`).join('')}</div>`;
  card.querySelectorAll('[data-take]').forEach((b) => b.onclick = () => takeOffer(b.dataset.take));
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
  const allowed = String(state.user?.allowed_durations || '80').split(',').map(Number).sort((a, b) => a - b);
  const durSelect = allowed.length > 1
    ? `<div class="field"><label>Dauer wählen</label><select id="bk-dur">${allowed.map((d) => `<option value="${d}" ${d === 80 ? 'selected' : ''}>${d} Minuten</option>`).join('')}</select></div>`
    : '';
  modal(`<h3>Termin verbindlich buchen?</h3>
    <div class="warnbox">
      Bist du wirklich sicher, dass du diesen Termin nehmen willst?
    </div>
    <p style="margin:.6rem 0 .2rem"><strong>${WD_LONG[isoDow(state.date) - 1]}, ${fmtShort(state.date)} um ${start} Uhr</strong>${allowed.length > 1 ? '' : ` · ${dur} Min`}</p>
    ${durSelect}
    <ul class="hint" style="margin:.4rem 0 0;padding-left:1.1rem">
      <li>Kostenfrei stornieren nur bis <strong>${cancelH} Std.</strong> vorher.</li>
      <li>Ab <strong>${lockH} Std.</strong> vorher steht der Termin fest – dann keine Absage mehr.</li>
      <li>Im Zeitfenster dazwischen kannst du die Stunde anderen zur Übernahme anbieten.</li>
    </ul>
    <div class="actions">
      <button class="sec" onclick="window.__closeModal()">Abbrechen</button>
      <button id="bk-confirm">Ja, verbindlich buchen</button>
    </div>`);
  $('#bk-confirm').onclick = async () => {
    const chosen = $('#bk-dur') ? Number($('#bk-dur').value) : dur;
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
  app.innerHTML = header() + `<main>
    <div class="navtabs">
      <button data-tab="heute">Heute & Ziele</button>
      <button data-tab="kalender">Kalender</button>
      <button data-tab="codes">Zugangscodes</button>
      <button data-tab="schueler">Fahrschüler</button>
      <button data-tab="theorie">Theorie & Ausnahmen</button>
      <button data-tab="arbeitszeiten">Arbeitszeiten</button>
      <button data-tab="einstellungen">Einstellungen</button>
    </div>
    <div id="itab"></div>
  </main>`;
  wireLogout();
  const tabs = app.querySelectorAll('.navtabs button');
  tabs.forEach((b) => b.onclick = () => { state.instrTab = b.dataset.tab; drawInstrTab(); });
  drawInstrTab();
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
  if (t === 'einstellungen') return tabEinstellungen();
}

// ---- Tab: Heute & Ziele (Tacho) ----
async function tabHeute() {
  const box = $('#itab');
  box.innerHTML = `<div class="card"><h2>Wochenziel</h2><div id="gauge"></div></div>
    <div class="card"><h2>Heute <span class="sub" id="today-sub"></span></h2><div id="today-list"></div></div>`;
  try {
    const stats = await api('/api/instructor/stats?date=' + todayStr());
    renderGauge($('#gauge'), stats);
    const ov = await api('/api/instructor/overview?from=' + todayStr() + '&to=' + todayStr());
    $('#today-sub').textContent = fmtDay(todayStr());
    renderInstrDay($('#today-list'), todayStr(), ov.bookings, ov.blocks);
  } catch (e) { toast(e.message, 'err'); }
}

function gaugeSVG(minutes, targetH, loH) {
  const value = minutes / 60;
  const maxH = Math.max(targetH * 1.4, value * 1.05, targetH + 2);
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
      <div class="meta"><strong>${who}</strong> ${b.student_phone ? '· ' + esc(b.student_phone) : ''}</div>
      <div class="meta">${st} ${gear} ${b.plate ? '· 🚘 ' + esc(b.plate) : ''} ${b.note ? '· ' + esc(b.note) : ''}</div>
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
    <div class="row">
      <div class="field"><label>Dauer (Min)</label><input id="m-dur" type="number" value="${b.duration_min}" min="10" step="5"></div>
      <div class="field"><label>Status</label>
        <select id="m-status">
          <option value="booked" ${b.status === 'booked' ? 'selected' : ''}>gebucht</option>
          <option value="done" ${b.status === 'done' ? 'selected' : ''}>gefahren ✓</option>
        </select></div>
    </div>
    <div class="field"><label>Notiz (optional)</label><input id="m-note" value="${esc(b.note || '')}"></div>
    <div class="actions">
      <button class="sec" onclick="window.__closeModal()">Abbrechen</button>
      <button id="m-save">Speichern</button>
    </div>`);
  $('#m-save').onclick = async () => {
    try {
      const body = { gearbox: $('#m-gear').value, plate: $('#m-plate').value, duration_min: Number($('#m-dur').value),
        status: $('#m-status').value, note: $('#m-note').value };
      if ($('#m-date').value !== b.date) body.date = $('#m-date').value;
      if ($('#m-time').value !== b.start_time) body.start_time = $('#m-time').value;
      await api('/api/bookings/' + id, { method: 'PATCH', body });
      closeModal(); toast('Gespeichert ✓', 'ok'); drawInstrTab();
    } catch (e) { toast(e.message, 'err'); }
  };
}
window.__closeModal = closeModal;

async function instrCancel(id) {
  if (!confirm('Diesen Termin stornieren?')) return;
  try { await api('/api/bookings/' + id, { method: 'DELETE' }); toast('Storniert', 'ok'); drawInstrTab(); }
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
  box.innerHTML = `<div class="card">
    <div class="dateline">
      <button class="sec sm" id="k-prev">‹</button>
      <span class="day" id="k-label"></span>
      <button class="sec sm" id="k-next">›</button>
      <input type="date" id="k-date" style="max-width:170px">
      <button class="ghost sm" id="k-gap" style="margin-left:auto">🧩 Lücken schließen</button>
      <button class="sm" id="k-add">+ Eigener Termin</button>
    </div>
    <div id="k-list"></div>
  </div>`;
  $('#k-date').value = state.date;
  $('#k-prev').onclick = () => { state.date = addDays(state.date, -1); loadK(); };
  $('#k-next').onclick = () => { state.date = addDays(state.date, 1); loadK(); };
  $('#k-date').onchange = (e) => { state.date = e.target.value; loadK(); };
  $('#k-add').onclick = () => openAddBooking();
  $('#k-gap').onclick = () => openGapModal();
  loadK();
}
async function loadK() {
  $('#k-label').textContent = fmtDay(state.date);
  $('#k-date').value = state.date;
  try {
    const ov = await api('/api/instructor/overview?from=' + state.date + '&to=' + state.date);
    window.__instrBookings = ov.bookings;
    renderInstrDay($('#k-list'), state.date, ov.bookings, ov.blocks);
  } catch (e) { toast(e.message, 'err'); }
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
    </div>
    <div id="c-list"></div>
  </div>`;
  $('#c-gen').onclick = async () => {
    try { const r = await api('/api/codes', { method: 'POST', body: { note: $('#c-note').value } });
      $('#c-note').value = ''; toast('Code ' + r.code + ' erstellt', 'ok'); loadCodes(); }
    catch (e) { toast(e.message, 'err'); }
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
async function tabSchueler() {
  const box = $('#itab');
  box.innerHTML = `<div class="card"><h2>Fahrschüler <span class="sub">erlaubte Stundenlängen zuweisen</span></h2>
    <p class="hint">Standard sind 80-Minuten-Stunden. Wenn ein Schüler ausnahmsweise auch 40 oder 120 Minuten fahren darf, hier freischalten – nur dann kann er das im Buchen-Dialog wählen.</p>
    <div id="s-list"></div></div>`;
  try {
    const { students } = await api('/api/students');
    if (!students.length) { $('#s-list').innerHTML = '<p class="muted">Noch keine Fahrschüler registriert. Erzeuge im Tab „Zugangscodes“ einen Code.</p>'; return; }
    $('#s-list').innerHTML = `<table>
      <tr><th>Name</th><th>Kontakt</th><th>Gefahren</th><th>Erlaubte Längen (Min)</th></tr>
      ${students.map((s) => {
        const durs = String(s.allowed_durations || '80').split(',').map(Number);
        const boxes = [40, 80, 120].map((d) => `<label style="margin:0;font-weight:600"><input type="checkbox" data-sdur="${s.id}" value="${d}" ${durs.includes(d) ? 'checked' : ''} style="width:auto"> ${d}</label>`).join(' ');
        return `<tr>
          <td><strong>${esc(s.name)}</strong></td>
          <td>${esc(s.email)}<br><span class="muted">${esc(s.phone || '')}</span></td>
          <td>${s.done_count} Std.</td>
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
  } catch (e) { toast(e.message, 'err'); }
}

// ---- Tab: Arbeitszeiten / Dienstplan (kurze Tage, freie Tage) ----
async function tabArbeitszeiten() {
  const s = state.settings;
  const box = $('#itab');
  box.innerHTML = `<div class="card">
    <h2>Arbeitszeiten & Dienstplan</h2>
    <p class="hint">Trage hier ein, wenn ein Tag <strong>kürzer</strong> sein soll (z.B. wenn deine Frau frei hat – früher Feierabend) oder du ganz <strong>frei</strong> hast. Die buchbaren Slots passen sich für Schüler automatisch an.</p>
    <div class="row">
      <div class="field"><label>Datum</label><input type="date" id="w-date" value="${state.date}"></div>
      <div class="field" style="max-width:210px"><label>Art</label>
        <select id="w-type">
          <option value="short">Kurzer Tag (früher Feierabend)</option>
          <option value="free">Ganzer Tag frei</option>
          <option value="custom">Eigene Zeiten</option>
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
    times.style.display = t === 'free' ? 'none' : 'flex';
    if (t === 'short') { $('#w-start').value = s.start_time; $('#w-last').value = s.short_day_last_start || '13:35'; }
    updateWPreview();
  };
  const updateWPreview = () => {
    if (typeSel.value === 'free') { $('#w-preview').textContent = 'Ganzer Tag frei – keine Slots.'; return; }
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
    const body = { date: $('#w-date').value };
    if (t === 'free') body.closed = true;
    else { body.start_time = $('#w-start').value; body.last_start = $('#w-last').value; }
    try { await api('/api/day-overrides', { method: 'POST', body }); toast('Eingetragen ✓', 'ok'); loadOverrides(); }
    catch (e) { toast(e.message, 'err'); }
  };
  loadOverrides();
}
async function loadOverrides() {
  try {
    const { overrides } = await api('/api/day-overrides');
    $('#w-list').innerHTML = overrides.length ? `<h2 style="font-size:.95rem">Eingetragene Tage</h2><div class="blist">${
      overrides.map((o) => `<div class="bitem warm">
        <div><div class="when">${WD[isoDow(o.date) - 1]} ${fmtShort(o.date)}</div>
        <div class="meta">${o.closed ? '🌴 ganzer Tag frei' : `✂️ kurzer Tag · ${o.start_time || state.settings.start_time}–letzter Slot ${o.last_start || '?'}`}</div></div>
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
          <div class="field"><label>Kostenlos stornieren bis (Std. vorher)</label><input id="e-cancel" type="number" value="${s.cancel_hours}" min="0"></div>
          <div class="field"><label>Sperrfrist – fest ab (Std. vorher)</label><input id="e-lock" type="number" value="${s.lock_hours}" min="0"></div>
        </div>
      </div>
      <div>
        <h2 style="font-size:.95rem">Ziele (Tacho)</h2>
        <div class="field"><label>Wochenziel (Stunden)</label><input id="e-wt" type="number" value="${s.weekly_target_h}" step="0.5"></div>
        <div class="field"><label>Untere Zielspanne (Stunden)</label><input id="e-wlo" type="number" value="${s.weekly_lo_h}" step="0.5"></div>
        <div class="field"><label>Tagesziel (Stunden)</label><input id="e-dt" type="number" value="${s.daily_target_h}" step="0.5"></div>
        <div class="hint" id="e-preview"></div>
        <h2 style="font-size:.95rem;margin-top:1.4rem">Zugang</h2>
        <div class="field"><label>Angezeigter Name</label><input id="e-name" value="${esc(s.instructor_name)}"></div>
        <div class="field"><label>Neue PIN (leer lassen = unverändert)</label><input id="e-pin" type="password" placeholder="mind. 4 Zeichen"></div>
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
    $('#e-preview').innerHTML = `Ergibt <strong>${times.length} Slots/Tag</strong> um ${times.join(', ') || '–'} (${daily.toFixed(1)} h/Tag).`;
  };
  ['e-start', 'e-last', 'e-lesson', 'e-break'].forEach((id) => $('#' + id).oninput = updatePreview);
  updatePreview();
  $('#e-save').onclick = async () => {
    const workdays = [...box.querySelectorAll('[data-day]')].filter((c) => c.checked).map((c) => c.dataset.day).join(',');
    try {
      const r = await api('/api/instructor/settings', { method: 'PUT', body: {
        start_time: $('#e-start').value, last_start: $('#e-last').value,
        lesson_min: Number($('#e-lesson').value), break_min: Number($('#e-break').value),
        weekly_target_h: Number($('#e-wt').value), weekly_lo_h: Number($('#e-wlo').value),
        daily_target_h: Number($('#e-dt').value), workdays: workdays || '1,2,3,4,5',
        max_per_week: Number($('#e-max').value), instructor_name: $('#e-name').value,
        booking_horizon_days: Number($('#e-horizon').value), cancel_hours: Number($('#e-cancel').value),
        lock_hours: Number($('#e-lock').value),
        release_time: $('#e-release').value, short_day_last_start: $('#e-shortlast').value,
        new_pin: $('#e-pin').value || undefined } });
      state.settings = r.settings; state.user.name = r.settings.instructor_name;
      toast('Einstellungen gespeichert ✓', 'ok'); $('#e-msg').textContent = 'Gespeichert.';
    } catch (e) { toast(e.message, 'err'); }
  };
}

// Für Kalender-Modal: instrBookings global halten
window.__instrBookings = [];
const _origRenderInstrDay = renderInstrDay;
