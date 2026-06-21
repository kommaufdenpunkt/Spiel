/* Moderatoren-Panel — Admin-Übersicht (nutzt die vorhandenen /api-Endpunkte). */
(() => {
  const $ = (id) => document.getElementById(id);
  let token = '';

  // ---- kleine API-Hilfe ----
  async function api(method, path, body) {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = 'Bearer ' + token;
    let res;
    try { res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined }); }
    catch { return { status: 0, body: {} }; }
    let json = {};
    try { json = await res.json(); } catch {}
    return { status: res.status, body: json };
  }

  let toastT;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---- Login ----
  $('loginBtn').addEventListener('click', login);
  $('pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
  $('totp').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });

  async function login() {
    $('loginErr').textContent = '';
    const password = $('pw').value;
    const totp = $('totp').value.trim();
    if (!password) { $('loginErr').textContent = 'Bitte Admin-Passwort eingeben.'; return; }
    $('loginBtn').disabled = true; $('loginBtn').textContent = 'Anmelden …';
    const r = await api('POST', '/api/login', { username: '', password, totp });
    $('loginBtn').disabled = false; $('loginBtn').textContent = 'Anmelden';
    if (r.status === 200 && r.body.token && r.body.role === 'admin') {
      token = r.body.token;
      $('login').style.display = 'none';
      $('dash').classList.add('on');
      $('whoami').style.display = 'flex';
      $('whoName').textContent = '👤 ' + (r.body.name || 'Admin');
      showSection('overview');
    } else if (r.status === 403) {
      $('loginErr').textContent = 'Zu viele Fehlversuche oder Zugang gesperrt – bitte später.';
    } else if (r.body && r.body.reason === 'bad-totp') {
      $('loginErr').textContent = 'Falscher 2FA-Code.';
    } else if (r.body && r.body.reason === 'mod-not-configured') {
      $('loginErr').textContent = 'Admin-Zugang ist serverseitig nicht eingerichtet.';
    } else {
      $('loginErr').textContent = 'Falsches Passwort oder kein Admin-Zugang.';
    }
  }

  $('logoutBtn').addEventListener('click', () => {
    token = '';
    $('dash').classList.remove('on');
    $('whoami').style.display = 'none';
    $('login').style.display = 'flex';
    $('pw').value = ''; $('totp').value = '';
  });

  // ---- Navigation ----
  document.querySelector('.nav').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-sec]');
    if (b) showSection(b.dataset.sec);
  });
  function showSection(sec) {
    document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('sel', b.dataset.sec === sec));
    document.querySelectorAll('.section').forEach((s) => s.classList.toggle('on', s.dataset.pane === sec));
    if (sec === 'overview') loadOverview();
    if (sec === 'moderators') loadModerators();
    if (sec === 'accounts') loadAccounts();
    if (sec === 'reports') loadRecordings();
    if (sec === 'security') loadSecurity();
  }

  // ---- Übersicht ----
  async function loadOverview() {
    const [mods, accs, sec, recs] = await Promise.all([
      api('GET', '/api/moderators'), api('GET', '/api/accounts'), api('GET', '/api/security'),
      api('GET', '/api/recordings'),
    ]);
    const m = (mods.body.moderators || []);
    const a = (accs.body.accounts || []);
    const verified = a.filter((x) => x.verified).length;
    const blocked = (sec.body.blocked || []).length;
    const locked = m.filter((x) => x.locked).length;
    const rec = (recs.body.recordings || []).length;
    $('stats').innerHTML =
      stat(m.length, 'Moderatoren' + (locked ? ` (${locked} gesperrt)` : '')) +
      stat(a.length, 'Verifizierungen') +
      stat(verified, 'davon verifiziert') +
      stat(rec, 'Aufnahmen') +
      stat(blocked, 'gesperrte IPs');
  }
  function stat(n, l) { return `<div class="stat"><div class="n">${n}</div><div class="l">${esc(l)}</div></div>`; }

  // ---- Moderatoren ----
  $('addMod').addEventListener('click', addModerator);
  async function addModerator() {
    const username = $('newUser').value.trim();
    const password = $('newPass').value;
    if (!username || !password) { $('newModInfo').textContent = 'Benutzername und Passwort eingeben.'; return; }
    const r = await api('POST', '/api/moderators', { username, password });
    if (r.status !== 200) {
      $('newModInfo').textContent = r.body && r.body.reason === 'exists-or-invalid'
        ? 'Benutzername existiert bereits oder ist ungültig.' : 'Anlegen fehlgeschlagen.';
      return;
    }
    $('newUser').value = ''; $('newPass').value = '';
    $('newModInfo').innerHTML = `✅ <b>${esc(r.body.username)}</b> angelegt. <b>2FA-Schlüssel</b> (sicher an die Person geben, ` +
      `manuell in die Authenticator-App eintragen): <code>${esc(r.body.totpSecret)}</code>`;
    loadModerators();
  }

  async function loadModerators() {
    const r = await api('GET', '/api/moderators');
    const list = r.body.moderators || [];
    const el = $('modList');
    if (!list.length) { el.innerHTML = '<div class="empty">Noch keine Logins angelegt.</div>'; return; }
    el.innerHTML = '';
    list.forEach((m) => {
      const row = document.createElement('div');
      row.className = 'row';
      const date = new Date(m.createdAt).toLocaleDateString('de-DE');
      const flags = (m.has2fa ? '<span class="pill ok">2FA</span> ' : '<span class="pill no">kein 2FA</span> ') +
        (m.mustChange ? '<span class="pill warn">muss PW ändern</span> ' : '') +
        (m.locked ? '<span class="pill no">🔒 gesperrt</span>' : '');
      row.innerHTML = `<div><b>${esc(m.username)}</b> <span class="muted">· seit ${date}</span><br>${flags}</div>`;
      const acts = document.createElement('div'); acts.className = 'acts';
      if (m.locked) acts.appendChild(btn('🔓 Entsperren', async () => {
        await api('POST', '/api/moderator-unlock', { id: m.id }); toast('Entsperrt'); loadModerators();
      }));
      acts.appendChild(btn('🔑 PW zurücksetzen', async () => {
        const np = prompt(`Neues Passwort für „${m.username}" (min. 8 Zeichen). Die Person muss es beim nächsten Login ändern.`);
        if (np == null) return;
        if (np.length < 8) { toast('Mindestens 8 Zeichen.'); return; }
        const x = await api('POST', '/api/moderator-reset', { id: m.id, newPassword: np });
        toast(x.status === 200 ? 'Zurückgesetzt' : 'Fehlgeschlagen'); loadModerators();
      }));
      const del = btn('🗑', async () => {
        if (!confirm(`Login „${m.username}" löschen?`)) return;
        await api('POST', '/api/moderator-delete', { id: m.id }); loadModerators();
      });
      del.classList.add('danger');
      acts.appendChild(del);
      row.appendChild(acts);
      el.appendChild(row);
    });
  }
  function btn(label, fn) { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', fn); return b; }

  // ---- Personalakten ----
  async function loadAccounts() {
    const r = await api('GET', '/api/accounts');
    const list = r.body.accounts || [];
    const el = $('accList');
    if (!list.length) { el.innerHTML = '<div class="empty">Noch keine Verifizierungen gespeichert.</div>'; return; }
    el.innerHTML = '';
    list.forEach((a) => {
      const div = document.createElement('div'); div.className = 'acc';
      const date = new Date(a.createdAt).toLocaleString('de-DE');
      const thumbs = (a.photos || []).map((p) => {
        const src = `/api/photo?id=${a.id}&file=${encodeURIComponent(p.file)}&token=${encodeURIComponent(token)}`;
        return `<figure><a href="${src}" target="_blank" rel="noopener"><img src="${src}" alt=""></a><figcaption>${esc(p.label)}</figcaption></figure>`;
      }).join('');
      div.innerHTML =
        `<div class="top"><div><div class="nm">${esc(a.verifiedName || ((a.firstName || '') + ' ' + (a.lastName || '')).trim() || '—')}</div>` +
        `<div class="meta">BIGO-ID: ${esc(a.bigoId || '-')} · Ausweis-Nr.: ${esc(a.docNumber || '-')}<br>` +
        `Moderator: ${esc(a.moderatorName || '-')} · ${esc(date)}</div></div>` +
        `<span class="pill ${a.verified ? 'ok' : 'no'}">${a.verified ? '✓ verifiziert' : 'nicht verifiziert'}</span></div>` +
        `<div class="thumbs">${thumbs}</div>`;
      const acts = document.createElement('div'); acts.style.marginTop = '.7rem';
      const del = btn('🗑 Akte löschen', async () => {
        if (!confirm('Diese Verifizierung inkl. Fotos endgültig löschen?')) return;
        await api('POST', '/api/account-delete', { id: a.id }); loadAccounts(); loadOverview();
      });
      del.classList.add('danger');
      acts.appendChild(del); div.appendChild(acts);
      el.appendChild(div);
    });
  }

  // ---- Aufnahmen ----
  async function loadRecordings() {
    const r = await api('GET', '/api/recordings');
    const list = r.body.recordings || [];
    const el = $('repList');
    if (!list.length) { el.innerHTML = '<div class="empty">Noch keine Aufnahmen.</div>'; return; }
    el.innerHTML = '';
    list.forEach((rec) => {
      const div = document.createElement('div'); div.className = 'acc';
      const date = new Date(rec.createdAt).toLocaleString('de-DE');
      const mm = Math.floor((rec.durationSec || 0) / 60), ss = (rec.durationSec || 0) % 60;
      const dur = mm + ':' + String(ss).padStart(2, '0');
      const mb = (rec.bytes / (1024 * 1024)).toFixed(1);
      const src = `/api/recording?id=${encodeURIComponent(rec.id)}&token=${encodeURIComponent(token)}`;
      div.innerHTML =
        `<div class="top"><div><div class="nm">${esc(rec.applicantName || 'Bewerber')}</div>` +
        `<div class="meta">${esc(date)} · Dauer ${dur} · ${mb} MB · Raum ${esc(rec.roomCode || '-')}<br>` +
        `Moderator: ${esc(rec.moderatorName || '-')}</div></div></div>` +
        `<video controls preload="none" src="${src}" style="width:100%;max-height:360px;border-radius:8px;background:#000;margin:.5rem 0"></video>`;
      const acts = document.createElement('div'); acts.style.marginTop = '.4rem';
      const dl = document.createElement('a');
      dl.href = src; dl.textContent = '⬇ Herunterladen'; dl.style.marginRight = '.7rem';
      dl.setAttribute('download', 'aufnahme_' + (rec.applicantName || 'bewerber').replace(/\s+/g, '_') + '.' + (rec.ext || 'webm'));
      const del = btn('🗑 Aufnahme löschen', async () => {
        if (!confirm('Diese Aufnahme endgültig löschen?')) return;
        await api('POST', '/api/recording-delete', { id: rec.id }); loadRecordings(); loadOverview();
      });
      del.classList.add('danger');
      acts.appendChild(dl); acts.appendChild(del); div.appendChild(acts);
      el.appendChild(div);
    });
  }

  // ---- Überwachung ----
  $('refreshSec').addEventListener('click', loadSecurity);
  async function loadSecurity() {
    const r = await api('GET', '/api/security');
    const data = r.body || { blocked: [], events: [] };
    const bl = $('blockedList');
    if (!data.blocked.length) bl.innerHTML = '<div class="empty">Keine IP gesperrt. 👍</div>';
    else {
      bl.innerHTML = '';
      data.blocked.forEach((b) => {
        const row = document.createElement('div'); row.className = 'row';
        row.innerHTML = `<span>🚫 ${esc(b.ip)} <span class="muted">· noch ~${b.minutesLeft} Min.</span></span>`;
        row.appendChild(btn('Entsperren', async () => {
          await api('POST', '/api/security-unblock', { ip: b.ip }); loadSecurity();
        }));
        bl.appendChild(row);
      });
    }
    const ev = $('eventList');
    if (!data.events.length) { ev.innerHTML = '<div class="evrow"><span>—</span><span>keine</span><span>Noch keine Ereignisse.</span></div>'; return; }
    ev.innerHTML = '';
    data.events.forEach((e) => {
      const row = document.createElement('div'); row.className = 'evrow';
      row.innerHTML = `<span class="t">${esc(new Date(e.time).toLocaleString('de-DE'))}</span>` +
        `<span class="ty ${esc(e.type)}">${esc(e.type)}</span>` +
        `<span>${esc(e.ip)}${e.detail ? ' · ' + esc(e.detail) : ''}</span>`;
      ev.appendChild(row);
    });
  }
})();
