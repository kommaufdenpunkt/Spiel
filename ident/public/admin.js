/* ident – Admin-Panel */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let token = '';
  function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2400); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function btn(label, cls, fn) { const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; b.addEventListener('click', fn); return b; }

  async function api(method, path, body) {
    const headers = {}; if (body) headers['Content-Type'] = 'application/json'; if (token) headers['Authorization'] = 'Bearer ' + token;
    let res; try { res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined }); } catch { return { status: 0, body: {} }; }
    let json = {}; try { json = await res.json(); } catch {}
    return { status: res.status, body: json };
  }

  // ---- Login ----
  $('loginBtn').addEventListener('click', login);
  $('pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
  $('totp').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
  async function login() {
    $('loginErr').textContent = '';
    const r = await api('POST', '/api/login', { username: '', password: $('pw').value, totp: $('totp').value.trim() });
    if (r.status === 200 && r.body.token && r.body.role === 'admin') {
      token = r.body.token; $('login').style.display = 'none'; $('dash').classList.add('on');
      $('whoami').textContent = 'Angemeldet als Admin'; show('overview');
    } else $('loginErr').textContent = r.status === 503 ? 'Admin ist auf dem Server nicht konfiguriert.' : 'Anmeldung fehlgeschlagen.';
  }
  $('logout').addEventListener('click', () => { token = ''; $('dash').classList.remove('on'); $('login').style.display = ''; $('pw').value = ''; $('totp').value = ''; });

  document.querySelector('.nav').addEventListener('click', (e) => { const b = e.target.closest('button[data-sec]'); if (b) show(b.dataset.sec); });
  function show(sec) {
    document.querySelectorAll('.nav button[data-sec]').forEach((b) => b.classList.toggle('sel', b.dataset.sec === sec));
    document.querySelectorAll('.section').forEach((s) => s.classList.toggle('on', s.dataset.pane === sec));
    ({ overview: loadOverview, cases: loadCases, rec: loadRec, agents: loadAgents, security: loadSecurity }[sec] || (() => {}))();
  }

  // ---- Übersicht ----
  async function loadOverview() {
    const [ag, cs, rc, se] = await Promise.all([api('GET', '/api/agents'), api('GET', '/api/cases'), api('GET', '/api/recordings'), api('GET', '/api/security')]);
    const cases = cs.body.cases || [];
    const stat = (n, l) => `<div class="stat"><div class="n">${n}</div><div class="l">${esc(l)}</div></div>`;
    $('stats').innerHTML = stat((ag.body.agents || []).length, 'Mitarbeiter')
      + stat(cases.length, 'Fälle')
      + stat(cases.filter((c) => c.result === 'approved').length, 'freigegeben')
      + stat((rc.body.recordings || []).length, 'Aufnahmen')
      + stat((se.body.blocked || []).length, 'gesperrte IPs');
  }

  // ---- Fälle ----
  async function loadCases() {
    const r = await api('GET', '/api/cases'); const list = r.body.cases || [];
    const el = $('caseList'); if (!list.length) { el.innerHTML = '<div class="empty">Noch keine Fälle.</div>'; return; }
    el.innerHTML = '';
    list.forEach((c) => {
      const div = document.createElement('div'); div.className = 'acc';
      const date = new Date(c.createdAt).toLocaleString('de-DE');
      const pill = c.result === 'approved' ? '<span class="pill ok">✓ freigegeben</span>' : (c.result === 'rejected' ? '<span class="pill no">✖ abgelehnt</span>' : '<span class="pill warn">offen</span>');
      const thumbs = (c.docs || []).map((d) => { const src = `/api/doc?id=${c.id}&file=${encodeURIComponent(d.file)}&token=${encodeURIComponent(token)}`; return `<figure><a href="${src}" target="_blank" rel="noopener"><img src="${src}" alt=""></a><figcaption>${esc(d.label)}</figcaption></figure>`; }).join('');
      div.innerHTML = `<div class="top"><div><div class="nm">${esc(c.bigoName || c.verifiedName || '—')}</div><div class="meta">${c.bigoName ? 'BIGO: <b>' + esc(c.bigoName) + '</b> · ' : ''}${c.age ? 'Alter: ' + esc(c.age) + ' · ' : ''}Name: ${esc(c.verifiedName || '-')}<br>${esc(c.docType || '-')} · Nr.: ${esc(c.docNumber || '-')}<br>Nummer: ${esc(c.code || '-')} · Prüfer: ${esc(c.agentName || '-')} · ${esc(date)}${c.rejectReason ? '<br>Grund: ' + esc(c.rejectReason) : ''}</div></div>${pill}</div><div class="thumbs">${thumbs}</div>`;
      const acts = document.createElement('div'); acts.style.marginTop = '.7rem';
      acts.appendChild(btn('🗑 Akte löschen', 'danger', async () => { if (!confirm('Diese Akte inkl. Bilder endgültig löschen?')) return; await api('POST', '/api/case-delete', { id: c.id }); loadCases(); loadOverview(); }));
      div.appendChild(acts); el.appendChild(div);
    });
  }

  // ---- Aufnahmen ----
  async function loadRec() {
    const r = await api('GET', '/api/recordings'); const list = r.body.recordings || [];
    const el = $('recList'); if (!list.length) { el.innerHTML = '<div class="empty">Noch keine Aufnahmen.</div>'; return; }
    el.innerHTML = '';
    list.forEach((rec) => {
      const div = document.createElement('div'); div.className = 'acc';
      const date = new Date(rec.createdAt).toLocaleString('de-DE'); const mm = Math.floor((rec.durationSec || 0) / 60), ss = (rec.durationSec || 0) % 60;
      const mb = (rec.bytes / (1024 * 1024)).toFixed(1); const src = `/api/recording?id=${encodeURIComponent(rec.id)}&token=${encodeURIComponent(token)}`;
      div.innerHTML = `<div class="top"><div><div class="nm">Nummer ${esc(rec.code || '-')}</div><div class="meta">${esc(date)} · Dauer ${mm}:${String(ss).padStart(2, '0')} · ${mb} MB · Prüfer: ${esc(rec.agentName || '-')}</div></div></div><video controls preload="none" src="${src}" style="width:100%;max-height:360px;border-radius:8px;background:#000;margin:.5rem 0"></video>`;
      const acts = document.createElement('div'); const dl = document.createElement('a'); dl.href = src; dl.textContent = '⬇ Herunterladen'; dl.setAttribute('download', 'aufnahme_' + (rec.code || 'x') + '.' + (rec.ext || 'webm')); dl.style.marginRight = '.7rem';
      acts.appendChild(dl); acts.appendChild(btn('🗑 Löschen', 'danger', async () => { if (!confirm('Aufnahme endgültig löschen?')) return; await api('POST', '/api/recording-delete', { id: rec.id }); loadRec(); loadOverview(); }));
      div.appendChild(acts); el.appendChild(div);
    });
  }

  // ---- Mitarbeiter ----
  $('addAgent').addEventListener('click', async () => {
    const username = $('newUser').value.trim(), password = $('newPass').value, role = $('newRole').value;
    const require2fa = $('new2fa').checked;
    if (!username || password.length < 8) { toast('Benutzername + Passwort (mind. 8 Zeichen) nötig.'); return; }
    const r = await api('POST', '/api/agents', { username, password, role, require2fa });
    if (r.status === 200) {
      $('newUser').value = ''; $('newPass').value = ''; $('new2fa').checked = false;
      if (r.body.has2fa) {
        $('agentResult').innerHTML = `
          <div><b>${esc(r.body.username)}</b> wurde angelegt. Jetzt die 2FA einrichten:</div>
          <ol style="margin:.6rem 0 .4rem 1.1rem;padding:0;line-height:1.5">
            <li><b>Authenticator-App</b> auf dem Handy installieren – z. B. <b>Google Authenticator</b>.</li>
            <li>In der App auf <b>„+"</b> → <b>„QR-Code scannen"</b> und den Code unten scannen:</li>
          </ol>
          ${r.body.qr ? `<img src="${r.body.qr}" alt="2FA-QR-Code" style="width:200px;height:200px;background:#fff;padding:8px;border-radius:12px;border:1px solid var(--line)">` : ''}
          <ol start="3" style="margin:.6rem 0 .2rem 1.1rem;padding:0;line-height:1.5">
            <li>Der Prüfer öffnet <b>ident.4ever1.tv/pruefer</b>.</li>
            <li>Eingeben: <b>Benutzername</b> + <b>Startpasswort</b> + den <b>6-stelligen Code</b> aus der App.</li>
            <li>Beim <b>ersten Login</b> setzt der Prüfer sein <b>eigenes Passwort</b>.</li>
          </ol>
          <div class="muted" style="margin-top:.5rem">Klappt das Scannen nicht, Schlüssel manuell eintragen: <code>${esc(r.body.totpSecret)}</code></div>
          <div class="muted" style="margin-top:.3rem">⚠️ Der QR-Code wird <b>nur jetzt</b> angezeigt. Verloren? Prüfer löschen und neu anlegen.</div>`;
      } else {
        $('agentResult').innerHTML = `
          <div><b>${esc(r.body.username)}</b> wurde angelegt – <b>ohne 2FA</b> (nur Benutzername + Passwort).</div>
          <div class="muted" style="margin-top:.4rem">Login des Prüfers auf <b>ident.4ever1.tv/pruefer</b>: Benutzername + Startpasswort (2FA-Feld bleibt leer). Beim ersten Login wird ein eigenes Passwort gesetzt.</div>`;
      }
      loadAgents();
    } else toast(r.body && r.body.reason === 'exists-or-invalid' ? 'Benutzername existiert bereits.' : 'Anlegen fehlgeschlagen.');
  });
  async function loadAgents() {
    const r = await api('GET', '/api/agents'); const list = r.body.agents || [];
    const el = $('agentList'); if (!list.length) { el.innerHTML = '<div class="empty">Noch keine Mitarbeiter.</div>'; return; }
    el.innerHTML = '';
    list.forEach((a) => {
      const div = document.createElement('div'); div.className = 'row';
      div.innerHTML = `<div><b>${esc(a.username)}</b> <span class="pill ${a.role === 'admin' ? 'warn' : 'ok'}">${a.role === 'admin' ? 'Admin' : 'Prüfer'}</span> ${a.locked ? '<span class="pill no">gesperrt</span>' : ''} ${a.mustChange ? '<span class="pill warn">PW-Wechsel offen</span>' : ''}<div class="muted">2FA: ${a.has2fa ? 'aktiv' : 'aus'} · seit ${new Date(a.createdAt).toLocaleDateString('de-DE')}</div></div>`;
      const acts = document.createElement('div'); acts.className = 'acts';
      if (a.locked) acts.appendChild(btn('🔓 Entsperren', '', async () => { await api('POST', '/api/agent-unlock', { id: a.id }); loadAgents(); }));
      acts.appendChild(btn('🔑 PW zurücksetzen', '', async () => { const np = prompt('Neues Startpasswort (mind. 8 Zeichen):'); if (!np || np.length < 8) { toast('Zu kurz.'); return; } const x = await api('POST', '/api/agent-reset', { id: a.id, newPassword: np }); toast(x.body.ok ? 'Zurückgesetzt.' : 'Fehlgeschlagen.'); }));
      acts.appendChild(btn('🗑', 'danger', async () => { if (!confirm('Mitarbeiter löschen?')) return; await api('POST', '/api/agent-delete', { id: a.id }); loadAgents(); loadOverview(); }));
      div.appendChild(acts); el.appendChild(div);
    });
  }

  // ---- Überwachung ----
  async function loadSecurity() {
    const r = await api('GET', '/api/security'); const m = r.body || {};
    const bl = $('blockedList'); const blocked = m.blocked || [];
    bl.innerHTML = blocked.length ? '' : '<div class="empty">Keine IP gesperrt.</div>';
    blocked.forEach((b) => { const div = document.createElement('div'); div.className = 'row'; div.innerHTML = `<div><b>${esc(b.ip)}</b> <span class="muted">${esc(b.reason || '')} · ${new Date(b.at).toLocaleString('de-DE')}</span></div>`; const acts = document.createElement('div'); acts.appendChild(btn('Entsperren', '', async () => { await api('POST', '/api/security-unblock', { ip: b.ip }); loadSecurity(); })); div.appendChild(acts); bl.appendChild(div); });
    const ev = $('eventList'); const events = m.events || [];
    ev.innerHTML = events.length ? '' : '<div class="empty" style="padding:.6rem">Keine Ereignisse.</div>';
    events.forEach((e) => { const row = document.createElement('div'); row.className = 'evrow'; row.innerHTML = `<div class="t">${new Date(e.at).toLocaleString('de-DE')}</div><div><b>${esc(e.type)}</b></div><div>${esc(e.ip)} ${esc(e.detail || '')}</div>`; ev.appendChild(row); });
  }
})();
