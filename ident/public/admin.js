/* ident – Admin-Panel */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let token = '';
  function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2400); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  // acp.<domain> ist der Diagnose-Bereich: nur dort darf endgültig gelöscht
  // werden. Im Tagesgeschäft (mcp./verwaltung) sind die Knöpfe gar nicht da.
  const AUF_ACP = /^acp\./.test(location.hostname.toLowerCase());
  function btn(label, cls, fn) { const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; b.addEventListener('click', fn); return b; }

  async function api(method, path, body) {
    const headers = {}; if (body) headers['Content-Type'] = 'application/json'; if (token) headers['Authorization'] = 'Bearer ' + token;
    let res; try { res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined }); } catch { return { status: 0, body: {} }; }
    let json = {}; try { json = await res.json(); } catch {}
    if (res.status === 401 && token) sitzungAbgelaufen();
    return { status: res.status, body: json };
  }

  // Der Anmelde-Nachweis lebt im Arbeitsspeicher des Servers. Nach einem
  // Neustart gilt er nicht mehr – dann zurück zum Login statt leerer Seiten.
  function sitzungAbgelaufen() {
    if (!token) return;
    token = '';
    $('dash').style.display = 'none';
    $('login').style.display = '';
    $('pw').value = ''; if ($('totp')) $('totp').value = '';
    $('loginErr').textContent = 'Die Anmeldung gilt nicht mehr – bitte neu anmelden.';
  }

  // ---- Geräte-Kennung ----
  // Bleibt dauerhaft in diesem Browser. Nur freigegebene Geräte dürfen sich
  // anmelden; der Server kennt davon nur einen Hash.
  const DEV_KEY = 'ident.deviceId';
  function deviceId() {
    let d = '';
    try { d = localStorage.getItem(DEV_KEY) || ''; } catch {}
    if (!d || d.length < 20) {
      const a = new Uint8Array(32); crypto.getRandomValues(a);
      d = Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('');
      try { localStorage.setItem(DEV_KEY, d); } catch {}
    }
    return d;
  }

  // ---- Login ----
  $('loginBtn').addEventListener('click', login);
  $('pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
  $('totp').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
  let lockTimer = 0;
  function setLocked(sec) {
    clearInterval(lockTimer);
    $('loginBtn').disabled = true; $('pw').disabled = true;
    const tick = () => {
      if (sec <= 0) { clearInterval(lockTimer); $('loginBtn').disabled = false; $('pw').disabled = false; $('loginErr').textContent = 'Du kannst es wieder versuchen.'; return; }
      const m = Math.floor(sec / 60), s = sec % 60;
      $('loginErr').textContent = 'Zu viele Fehlversuche. Gesperrt für ' + (m ? m + ' Min ' : '') + (s < 10 ? '0' : '') + s + ' Sek.';
      sec--;
    };
    tick(); lockTimer = setInterval(tick, 1000);
  }
  async function login() {
    $('loginErr').textContent = 'Prüfe …';
    const r = await api('POST', '/api/login', { username: '', password: $('pw').value, totp: $('totp').value.trim(), device: deviceId() });
    if (r.status === 200 && r.body.token && r.body.role === 'admin') {
      token = r.body.token; $('loginErr').textContent = ''; await openDash();
    } else if (r.status === 429 || (r.body && r.body.reason === 'locked')) {
      setLocked(parseInt((r.body && r.body.retryAfterSec) || 900, 10));
    } else if (r.body && r.body.reason === 'device-missing') {
      $('loginErr').innerHTML = 'Diese Seite ist veraltet. Bitte einmal <b>vollständig neu laden</b>'
        + ' (Windows: Strg + Umschalt + R · Mac: Cmd + Umschalt + R) und erneut anmelden.';
    } else if (r.body && r.body.reason === 'device-not-approved') {
      showClaim();
    } else if (r.body && r.body.reason === 'bad-totp') {
      // 2FA ist aktiv -> Feld einblenden, damit der Code eingegeben werden kann.
      $('totpField').style.display = ''; $('totp').focus();
      $('loginErr').textContent = 'Ein 2FA-Code ist nötig – bitte unten eingeben.';
    } else if (r.status === 503) {
      $('loginErr').textContent = 'Auf dem Server nicht konfiguriert.';
    } else {
      const left = r.body && typeof r.body.triesLeft === 'number' ? r.body.triesLeft : null;
      $('loginErr').textContent = 'Anmeldung fehlgeschlagen.' + (left !== null ? ' Noch ' + left + ' Versuch' + (left === 1 ? '' : 'e') + ' bis zur Sperre.' : '');
      $('pw').value = ''; $('pw').focus();
    }
  }
  // Dieses Gerät ist noch nicht freigegeben -> Freischaltung anbieten.
  function showClaim() {
    if ($('claimBox')) { $('claimBox').style.display = ''; $('claimCode').focus(); return; }
    const box = document.createElement('div');
    box.id = 'claimBox';
    box.style.cssText = 'margin-top:1rem;padding:.9rem;border:1px solid var(--line);border-radius:12px;background:var(--panel2)';
    box.innerHTML = '<div style="font-size:.88rem;line-height:1.5">Dieses Gerät ist nicht freigegeben.<br>'
      + 'Erzeuge auf einem <b>bereits freigegebenen Gerät</b> einen Freischalt-Code (Sicherheit → Geräte) und gib ihn hier ein.</div>'
      + '<div style="display:flex;gap:.5rem;margin-top:.7rem;flex-wrap:wrap">'
      + '<input id="claimCode" inputmode="numeric" placeholder="6-stelliger Code" style="max-width:150px">'
      + '<button id="claimBtn" class="primary">Freischalten</button></div>'
      + '<div id="claimMsg" class="muted" style="margin-top:.5rem"></div>';
    $('loginErr').after(box);
    $('claimBtn').addEventListener('click', async () => {
      const r = await api('POST', '/api/admin-devices/claim', {
        password: $('pw').value, code: $('claimCode').value.trim(), device: deviceId(),
      });
      if (r.status === 200) {
        $('claimMsg').textContent = 'Gerät freigeschaltet ✓ – melde dich jetzt an.';
        setTimeout(() => { box.style.display = 'none'; login(); }, 900);
      } else if (r.status === 429) {
        box.style.display = 'none'; setLocked(parseInt((r.body && r.body.retryAfterSec) || 900, 10));
      } else {
        const left = r.body && typeof r.body.triesLeft === 'number' ? ' Noch ' + r.body.triesLeft + ' Versuche.' : '';
        $('claimMsg').textContent = 'Code oder Passwort falsch.' + left;
      }
    });
    $('claimCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('claimBtn').click(); });
    $('loginErr').textContent = '';
    $('claimCode').focus();
  }

  // Die Oberfläche wird erst nach dem Login vom Server geholt – erst danach
  // können ihre Schaltflächen verknüpft werden.
  async function openDash() {
    if (!$('dash').dataset.ready) {
      const r = await fetch('/api/admin-shell', { headers: { Authorization: 'Bearer ' + token } });
      if (!r.ok) { $('loginErr').textContent = 'Oberfläche konnte nicht geladen werden.'; return false; }
      $('dash').innerHTML = await r.text();
      $('dash').dataset.ready = '1';
      bindDash();
    }
    $('login').style.display = 'none'; $('dash').classList.add('on');
    $('whoami').textContent = AUF_ACP ? 'Diagnose · Admin' : 'Verwaltung · Admin';
    hinweisBereich();
    show('overview');
    return true;
  }

  // Kurz erklären, wo man gerade ist – Löschen gibt es nur im Diagnose-Bereich.
  function hinweisBereich() {
    if ($('bereichHinweis')) return;
    const d = document.createElement('div');
    d.id = 'bereichHinweis'; d.className = 'note';
    d.style.cssText = 'margin:0 0 1rem';
    d.innerHTML = AUF_ACP
      ? '🩺 <b>Diagnose-Bereich.</b> Hier siehst du die Überwachung – und nur hier lässt sich endgültig löschen. Bitte mit Bedacht.'
      : '⚙️ <b>Verwaltung.</b> Endgültiges Löschen von Akten, Aufnahmen und Konten geht bewusst nicht hier, sondern nur über <b>acp.4ever1.tv</b>.';
    const inhalt = document.querySelector('.content');
    if (inhalt) inhalt.prepend(d);
  }

  function bindDash() {
    $('logout').addEventListener('click', () => { token = ''; $('dash').classList.remove('on'); $('login').style.display = ''; $('pw').value = ''; $('totp').value = ''; });
    document.querySelector('.nav').addEventListener('click', (e) => { const b = e.target.closest('button[data-sec]'); if (b) show(b.dataset.sec); });
    if ($('scriptSave')) $('scriptSave').addEventListener('click', saveScript);
    if ($('introSave')) $('introSave').addEventListener('click', saveIntro);
    if ($('caseSearch')) $('caseSearch').addEventListener('input', (e) => renderCases(e.target.value));
    if ($('addAgent')) $('addAgent').addEventListener('click', addAgent);
    if ($('loginLogClear')) $('loginLogClear').addEventListener('click', async () => {
      if (!confirm('Anmelde-Protokoll wirklich leeren? Die Einträge sind danach weg.')) return;
      await api('POST', '/api/login-log-clear', {}); loadLoginLog();
    });
    if ($('devInvite')) $('devInvite').addEventListener('click', async () => {
      const r = await api('POST', '/api/admin-devices/invite', {});
      if (r.status !== 200) { toast('Konnte keinen Code erzeugen.'); return; }
      $('devInviteOut').innerHTML = 'Freischalt-Code: <b style="font-size:1.4rem;letter-spacing:.18em">' + esc(r.body.code) + '</b>'
        + '<div class="muted" style="margin-top:.4rem">Gültig für ' + r.body.validMin + ' Minuten und nur einmal verwendbar.<br>'
        + 'Auf dem neuen Gerät <b>admin.4ever1.tv</b> öffnen, Passwort eingeben – dann erscheint das Code-Feld.</div>';
    });
  }
  function show(sec) {
    document.querySelectorAll('.nav button[data-sec]').forEach((b) => b.classList.toggle('sel', b.dataset.sec === sec));
    document.querySelectorAll('.section').forEach((s) => s.classList.toggle('on', s.dataset.pane === sec));
    ({ overview: loadOverview, cases: loadCases, rec: loadRec, agents: loadAgents, script: loadScriptEditor, adminsec: loadA2fa, security: loadSecurity }[sec] || (() => {}))();
  }
  // ---- Freigegebene Geräte ----
  async function loadDevices() {
    const r = await api('GET', '/api/admin-devices');
    const list = (r.body && r.body.devices) || [];
    const on = !!(r.body && r.body.lockOn);
    const forced = !!(r.body && r.body.lockEnvForced);

    // Schalter mit Erklärung – hier entscheidest du, wann die Bindung greift.
    const box = $('devLockBox');
    if (box) {
      box.innerHTML = '';
      const zeile = document.createElement('div');
      zeile.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:.8rem;flex-wrap:wrap';
      const txt = document.createElement('div');
      txt.innerHTML = on
        ? '🔒 <b style="color:var(--good)">Geräte-Bindung ist EIN</b><div class="muted">Nur die unten gelisteten Geräte kommen herein.</div>'
        : '🔓 <b>Geräte-Bindung ist AUS</b><div class="muted">Derzeit reicht das Passwort – von jedem Gerät.<br>'
          + 'Benutzte Geräte werden trotzdem gemerkt: beim Einschalten sind sie sofort freigegeben.</div>';
      zeile.appendChild(txt);
      if (forced) {
        const hint = document.createElement('span'); hint.className = 'muted';
        hint.textContent = 'per Server-Variable festgelegt';
        zeile.appendChild(hint);
      } else {
        zeile.appendChild(btn(on ? 'Ausschalten' : '🔒 Jetzt einschalten', on ? 'danger' : 'primary', async () => {
          if (!on && !confirm('Geräte-Bindung einschalten?\n\nDanach kommen nur noch die ' + list.length + ' unten gelisteten Geräte herein.\nBitte vorher prüfen, ob dort nur eure eigenen Geräte stehen – fremde vorher entfernen.')) return;
          const rr = await api('POST', '/api/device-lock', { kind: 'admin', on: !on, device: deviceId() });
          if (rr.status !== 200) { toast('Umschalten nicht möglich.'); return; }
          toast(!on ? 'Geräte-Bindung ist jetzt EIN.' : 'Geräte-Bindung ist jetzt AUS.');
          loadDevices();
        }));
      }
      box.appendChild(zeile);
    }

    const el = $('devList'); if (!el) return;
    if (!list.length) { el.innerHTML = '<div class="empty">Noch kein Gerät gemerkt. Sobald sich jemand anmeldet, erscheint das Gerät hier.</div>'; return; }
    el.insertAdjacentHTML('beforebegin', '');
    el.innerHTML = '';
    list.forEach((d) => {
      const div = document.createElement('div'); div.className = 'row';
      const seen = d.lastSeen ? new Date(d.lastSeen).toLocaleString('de-DE') : '–';
      const info = document.createElement('div');
      info.innerHTML = '<b>' + esc(d.name) + '</b><div class="muted">Zuletzt benutzt: ' + esc(seen) + '</div>';
      const acts = document.createElement('div'); acts.className = 'acts';
      acts.appendChild(btn('✏️ Umbenennen', '', async () => {
        const name = prompt('Name für dieses Gerät:', d.name); if (name === null) return;
        await api('POST', '/api/admin-devices/rename', { id: d.id, name }); loadDevices();
      }));
      acts.appendChild(btn('🗑 Entfernen', 'danger', async () => {
        if (!confirm('„' + d.name + '" wirklich entfernen? Dieses Gerät kann sich dann nicht mehr anmelden.')) return;
        const rr = await api('POST', '/api/admin-devices/remove', { id: d.id });
        if (rr.status === 400) toast('Das letzte Gerät kann nicht entfernt werden.');
        loadDevices();
      }));
      div.appendChild(info); div.appendChild(acts); el.appendChild(div);
    });
  }

  async function loadA2fa() {
    loadDevices();
    const s = (await api('GET', '/api/admin-2fa/status')).body || {};
    const st = $('a2faStatus'), setup = $('a2faSetup'); setup.innerHTML = '';
    if (s.envForced) { st.innerHTML = '🔐 Admin-2FA ist über eine Server-Variable (ADMIN_TOTP_SECRET) fest aktiv.'; return; }
    if (s.off) { st.innerHTML = '⚠️ Admin-2FA ist per Notausgang (ADMIN_2FA_OFF) abgeschaltet.'; return; }
    if (s.active) {
      st.innerHTML = '✅ Admin-2FA ist <b>AKTIV</b> – beim Login brauchst du einen 6-stelligen Code.';
      setup.appendChild(btn('2FA deaktivieren', 'danger', async () => { if (!confirm('Admin-2FA wirklich deaktivieren?')) return; await api('POST', '/api/admin-2fa/disable', {}); loadA2fa(); }));
    } else {
      st.innerHTML = 'Admin-2FA ist derzeit <b>AUS</b> (nur Passwort).';
      setup.appendChild(btn('🔐 2FA einrichten', 'primary', startA2faSetup));
    }
  }
  async function startA2faSetup() {
    const r = await api('POST', '/api/admin-2fa/setup', {}); if (r.status !== 200) { toast('Fehler.'); return; }
    $('a2faSetup').innerHTML = `
      <div>Mit <b>Google Authenticator</b> diesen QR scannen, dann den Code eingeben und <b>Aktivieren</b>:</div>
      ${r.body.qr ? `<img src="${r.body.qr}" alt="QR" style="width:200px;height:200px;background:#fff;padding:8px;border-radius:12px;margin:.6rem 0">` : ''}
      <div class="muted">Oder Schlüssel manuell eintragen: <code>${esc(r.body.secret)}</code></div>
      <div style="display:flex;gap:.5rem;align-items:center;margin-top:.7rem;flex-wrap:wrap">
        <input id="a2faCode" inputmode="numeric" placeholder="6-stelliger Code" style="max-width:180px">
        <button id="a2faActivate" class="primary">Aktivieren</button><span id="a2faMsg" class="muted"></span>
      </div>`;
    $('a2faActivate').addEventListener('click', async () => {
      const rr = await api('POST', '/api/admin-2fa/activate', { code: $('a2faCode').value.trim() });
      if (rr.status === 200) { $('a2faMsg').textContent = 'Aktiviert ✓'; setTimeout(loadA2fa, 900); }
      else $('a2faMsg').textContent = 'Code falsch – bitte erneut versuchen.';
    });
  }
  async function loadScriptEditor() {
    const s = await api('GET', '/api/script'); if (s.status === 200) $('scriptText').value = s.body.script || '';
    const i = await api('GET', '/api/intro'); if (i.status === 200) $('introTextEdit').value = i.body.intro || '';
  }
  async function saveScript() {
    const r = await api('POST', '/api/script', { script: $('scriptText').value });
    $('scriptMsg').textContent = r.status === 200 ? 'Gespeichert ✓' : 'Fehler beim Speichern';
    setTimeout(() => { $('scriptMsg').textContent = ''; }, 2500);
  }
  async function saveIntro() {
    const r = await api('POST', '/api/intro', { intro: $('introTextEdit').value });
    $('introMsg').textContent = r.status === 200 ? 'Gespeichert ✓' : 'Fehler beim Speichern';
    setTimeout(() => { $('introMsg').textContent = ''; }, 2500);
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
  let allCases = [];
  let mcpAn = false;
  async function loadCases() {
    const [r, m] = await Promise.all([api('GET', '/api/cases'), api('GET', '/api/mcp-status')]);
    allCases = r.body.cases || [];
    mcpAn = !!(m.body && m.body.aktiv);
    renderCases($('caseSearch') ? $('caseSearch').value : '');
  }
  function statusText(res) { return res === 'approved' ? 'freigegeben' : (res === 'rejected' ? 'abgelehnt' : 'offen'); }
  function renderCases(term) {
    const el = $('caseList'); const q = String(term || '').trim().toLowerCase();
    const list = !q ? allCases : allCases.filter((c) => [c.bigoName, c.age, c.verifiedName, c.code, c.docNumber, c.agentName, c.note, statusText(c.result)].join(' ').toLowerCase().includes(q));
    if (!allCases.length) { el.innerHTML = '<div class="empty">Noch keine Fälle.</div>'; return; }
    if (!list.length) { el.innerHTML = '<div class="empty">Keine Treffer für „' + esc(term) + '".</div>'; return; }
    el.innerHTML = '';
    list.forEach((c) => {
      const div = document.createElement('div'); div.className = 'acc';
      const date = new Date(c.createdAt).toLocaleString('de-DE');
      const pill = c.result === 'approved' ? '<span class="pill ok">✓ freigegeben</span>' : (c.result === 'rejected' ? '<span class="pill no">✖ abgelehnt</span>' : '<span class="pill warn">offen</span>');
      const thumbs = (c.docs || []).map((d) => { const src = `/api/doc?id=${c.id}&file=${encodeURIComponent(d.file)}&token=${encodeURIComponent(token)}`; return `<figure><a href="${src}" target="_blank" rel="noopener"><img src="${src}" alt=""></a><figcaption>${esc(d.label)}</figcaption></figure>`; }).join('');
      // Zugehörige Video-Aufnahme direkt in der Akte anzeigen
      const rc = c.recording;
      const recBlock = rc
        ? `<div style="margin-top:.7rem;padding-top:.7rem;border-top:1px solid var(--line)">
             <div class="muted" style="margin-bottom:.35rem">🎬 Aufnahme des Gesprächs · ${(rc.bytes / (1024 * 1024)).toFixed(1)} MB${rc.durationSec ? ' · ' + Math.floor(rc.durationSec / 60) + ':' + String(rc.durationSec % 60).padStart(2, '0') : ''}</div>
             ${qualiPill(rc)}
             <video src="/api/recording?id=${encodeURIComponent(rc.id)}&token=${encodeURIComponent(token)}" controls preload="metadata" style="width:100%;max-width:340px;border-radius:10px;border:1px solid var(--line);background:#000"></video>
           </div>`
        : '<div class="muted" style="margin-top:.6rem">🎬 Keine Aufnahme zu dieser Akte gefunden.</div>';
      div.innerHTML = `<div class="top"><div><div class="nm">${esc(c.bigoName || c.verifiedName || '—')}</div><div class="meta">${c.bigoName ? 'BIGO-ID: <b>' + esc(c.bigoName) + '</b> · ' : ''}${c.age ? 'Alter: ' + esc(c.age) + ' · ' : ''}Name: ${esc(c.verifiedName || '-')}<br>${esc(c.docType || '-')} · Nr.: ${esc(c.docNumber || '-')}<br>Nummer: ${esc(c.code || '-')} · Prüfer: ${esc(c.agentName || '-')} · ${esc(date)}${c.note ? '<br>Notiz: ' + esc(c.note) : ''}${c.rejectReason ? '<br>Grund: ' + esc(c.rejectReason) : ''}</div></div>${pill}</div><div class="thumbs">${thumbs}</div>${recBlock}${mcpZeile(c)}`;
      const acts = document.createElement('div'); acts.style.marginTop = '.7rem'; acts.style.display = 'flex'; acts.style.gap = '.4rem'; acts.style.flexWrap = 'wrap';
      acts.appendChild(btn('📄 Export / PDF', '', () => window.open(`/api/case-export?id=${c.id}&token=${encodeURIComponent(token)}`, '_blank')));
      if (mcpAn) {
        acts.appendChild(btn(c.mcpStatus === 'uebergeben' ? '📤 Erneut an MCP' : '📤 An MCP übergeben', '', async (e) => {
          const b = e.target; b.disabled = true; b.textContent = 'Wird übergeben …';
          const r = await api('POST', '/api/mcp-push', { id: c.id });
          toast(r.status === 200 ? 'An MCP übergeben.' : 'Übergabe hat nicht geklappt – Grund steht in der Akte.');
          loadCases();
        }));
      }
      if (AUF_ACP) acts.appendChild(btn('🗑 Akte löschen', 'danger', async () => { if (!confirm('Diese Akte inkl. Bilder endgültig löschen?')) return; await api('POST', '/api/case-delete', { id: c.id }); loadCases(); loadOverview(); }));
      div.appendChild(acts);
      div.appendChild(entriesBlock(c));
      el.appendChild(div);
    });
  }

  // ---- Protokoll-Einträge in der Akte ----
  // Text wird vor dem Speichern aufgeräumt; der Nutzer entscheidet, ob er den
  // verbesserten Vorschlag übernimmt.
  // Stand der Übergabe an mcp.4ever1.tv
  function mcpZeile(c) {
    const wann = c.mcpAt ? new Date(c.mcpAt).toLocaleString('de-DE') : '';
    if (c.mcpStatus === 'uebergeben') return `<div style="margin-top:.5rem"><span class="pill ok">📤 an MCP übergeben</span> <span class="muted">${wann}</span></div>`;
    if (c.mcpStatus === 'laeuft') return `<div style="margin-top:.5rem"><span class="pill warn">⏳ Übergabe läuft …</span></div>`;
    if (c.mcpStatus === 'fehlgeschlagen') return `<div style="margin-top:.5rem"><span class="pill no">📤 Übergabe fehlgeschlagen</span> <span class="muted">${esc(c.mcpText || '')} ${wann}</span></div>`;
    return '';
  }

  // Auswertung des Prüfers: taugt die Aufnahme etwas?
  function qualiPill(rc) {
    if (!rc || !rc.quality) {
      return '<div class="muted" style="margin-bottom:.4rem">⏳ Noch nicht ausgewertet.</div>';
    }
    const wann = rc.reviewedAt ? new Date(rc.reviewedAt).toLocaleString('de-DE') : '';
    const wer = rc.reviewedBy ? ' von ' + esc(rc.reviewedBy) : '';
    const note = rc.reviewNote ? ' – ' + esc(rc.reviewNote) : '';
    return rc.quality === 'ok'
      ? `<div style="margin-bottom:.4rem"><span class="pill ok">✓ Aufnahme brauchbar</span> <span class="muted">${wer}${wann ? ', ' + wann : ''}${note}</span></div>`
      : `<div style="margin-bottom:.4rem"><span class="pill no">⚠ Aufnahme nicht brauchbar</span> <span class="muted">${wer}${wann ? ', ' + wann : ''}${note}</span></div>`;
  }

  function entriesBlock(c) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-top:.9rem;padding-top:.8rem;border-top:1px solid var(--line)';
    const head = document.createElement('div');
    head.className = 'muted'; head.style.marginBottom = '.5rem';
    head.textContent = '📝 Protokoll (' + ((c.entries || []).length) + ')';
    wrap.appendChild(head);

    (c.entries || []).forEach((e) => {
      const row = document.createElement('div');
      row.style.cssText = 'background:#0f1728;border:1px solid var(--line);border-radius:10px;padding:.6rem .7rem;margin-bottom:.45rem';
      const when = new Date(e.createdAt).toLocaleString('de-DE');
      const txt = document.createElement('div');
      txt.style.cssText = 'white-space:pre-wrap;font-size:.9rem;line-height:1.5';
      txt.textContent = e.text;
      const meta = document.createElement('div');
      meta.className = 'muted'; meta.style.marginTop = '.35rem';
      meta.textContent = e.author + ' · ' + when + (e.editedAt ? ' · bearbeitet von ' + e.editedBy : '');
      row.appendChild(txt); row.appendChild(meta);
      const ea = document.createElement('div'); ea.style.cssText = 'display:flex;gap:.35rem;margin-top:.45rem;flex-wrap:wrap';
      ea.appendChild(btn('✏️ Bearbeiten', '', async () => {
        const neu = prompt('Eintrag bearbeiten:', e.text); if (neu === null) return;
        const r = await api('POST', '/api/entry-update', { caseId: c.id, entryId: e.id, text: neu });
        if (r.status !== 200) toast('Ändern nicht möglich.'); loadCases();
      }));
      ea.appendChild(btn('🗑', 'danger', async () => {
        if (!confirm('Diesen Eintrag löschen?')) return;
        await api('POST', '/api/entry-delete', { caseId: c.id, entryId: e.id }); loadCases();
      }));
      row.appendChild(ea);
      wrap.appendChild(row);
    });

    // Neuer Eintrag
    const ta = document.createElement('textarea');
    ta.placeholder = 'Neuer Protokoll-Eintrag …';
    ta.style.cssText = 'width:100%;min-height:70px;font-family:inherit;font-size:.9rem;padding:.55rem .7rem;border-radius:10px;border:1px solid var(--line);background:#0f1728;color:var(--ink);line-height:1.5';
    wrap.appendChild(ta);
    const bar = document.createElement('div'); bar.style.cssText = 'display:flex;gap:.4rem;margin-top:.45rem;flex-wrap:wrap;align-items:center';
    const msg = document.createElement('span'); msg.className = 'muted';
    bar.appendChild(btn('✨ Eintrag hinzufügen', 'primary', async () => {
      const raw = ta.value.trim(); if (!raw) { toast('Bitte etwas schreiben.'); return; }
      msg.textContent = 'Text wird aufbereitet …';
      const p = await api('POST', '/api/entry-polish', { text: raw });
      let final = raw;
      if (p.status === 200 && p.body.changed) {
        const liste = (p.body.changes || []).map((x) => '• ' + x).join('\n');
        final = confirm('Aufbereiteter Text:\n\n' + p.body.text + '\n\nÄnderungen:\n' + liste + '\n\nSo einpflegen?  (Abbrechen = Originaltext)')
          ? p.body.text : raw;
      }
      const r = await api('POST', '/api/entry', { caseId: c.id, text: final, original: raw });
      msg.textContent = '';
      if (r.status !== 200) { toast('Eintrag konnte nicht gespeichert werden.'); return; }
      ta.value = ''; loadCases();
    }));
    bar.appendChild(msg);
    wrap.appendChild(bar);
    return wrap;
  }

  // ---- Aufnahmen ----
  async function loadRec() {
    const r = await api('GET', '/api/recordings'); const list = r.body.recordings || [];
    const el = $('recList'); if (!list.length) { el.innerHTML = '<div class="empty">Noch keine Aufnahmen.</div>'; return; }
    el.className = 'reclist'; el.innerHTML = '';
    list.forEach((rec) => {
      const div = document.createElement('div'); div.className = 'reccard';
      const date = new Date(rec.createdAt).toLocaleString('de-DE'); const mm = Math.floor((rec.durationSec || 0) / 60), ss = (rec.durationSec || 0) % 60;
      const mb = (rec.bytes / (1024 * 1024)).toFixed(1); const src = `/api/recording?id=${encodeURIComponent(rec.id)}&token=${encodeURIComponent(token)}`;
      const title = rec.bigoName || rec.name || ('Nummer ' + (rec.code || '-'));
      const pill = rec.result === 'approved' ? '<span class="pill ok">✓ freigegeben</span>' : (rec.result === 'rejected' ? '<span class="pill no">✖ abgelehnt</span>' : '');
      div.innerHTML = `
        <div class="recvid"><video controls playsinline preload="metadata" src="${src}#t=0.1"></video><span class="recdur">${mm}:${String(ss).padStart(2, '0')}</span></div>
        <div class="recbody">
          <div class="rectop"><div class="nm">${esc(title)}</div>${pill}</div>
          <div class="meta">${rec.bigoName && rec.name ? 'Name: ' + esc(rec.name) + ' · ' : ''}Nr.: ${esc(rec.code || '-')}<br>${esc(date)} · ${mb} MB · Prüfer: ${esc(rec.agentName || '-')}</div>
          ${qualiPill(rec)}
        </div>`;
      const acts = document.createElement('div'); acts.className = 'recacts';
      // Admins können die Einschätzung nachtragen oder korrigieren.
      acts.appendChild(btn(rec.quality === 'ok' ? '✓ brauchbar' : '✅ Als brauchbar', '', async () => {
        await api('POST', '/api/recording-review', { id: rec.id, quality: 'ok', note: rec.reviewNote || '' });
        loadRec(); loadCases();
      }));
      acts.appendChild(btn('⚠️ Nicht brauchbar', '', async () => {
        const grund = prompt('Was war nicht in Ordnung?', rec.reviewNote || '');
        if (grund === null || !grund.trim()) return;
        await api('POST', '/api/recording-review', { id: rec.id, quality: 'bad', note: grund.trim() });
        loadRec(); loadCases();
      }));
      acts.appendChild(btn('🔍 Groß ansehen', '', () => window.open(src, '_blank')));
      const dl = document.createElement('a'); dl.href = src; dl.className = 'reclink'; dl.textContent = '⬇ Herunterladen'; dl.setAttribute('download', 'audition_' + (rec.bigoName || rec.code || 'x') + '.' + (rec.ext || 'webm'));
      acts.appendChild(dl);
      if (AUF_ACP) acts.appendChild(btn('🗑 Löschen', 'danger', async () => { if (!confirm('Aufnahme endgültig löschen?')) return; await api('POST', '/api/recording-delete', { id: rec.id }); loadRec(); loadOverview(); }));
      div.appendChild(acts); el.appendChild(div);
    });
  }

  // ---- Mitarbeiter ----
  async function addAgent() {
    const username = $('newUser').value.trim(), password = $('newPass').value, role = $('newRole').value;
    const require2fa = $('new2fa') ? $('new2fa').checked : false;
    if (!username || password.length < 8) { toast('Benutzername + Passwort (mind. 8 Zeichen) nötig.'); return; }
    const r = await api('POST', '/api/agents', { username, password, role, require2fa });
    if (r.status === 200) {
      $('newUser').value = ''; $('newPass').value = ''; if ($('new2fa')) $('new2fa').checked = false;
      if (r.body.has2fa) {
        $('agentResult').innerHTML = `
          <div><b>${esc(r.body.username)}</b> wurde angelegt. Jetzt die 2FA einrichten:</div>
          <ol style="margin:.6rem 0 .4rem 1.1rem;padding:0;line-height:1.5">
            <li><b>Authenticator-App</b> auf dem Handy installieren – z. B. <b>Google Authenticator</b>.</li>
            <li>In der App auf <b>„+"</b> → <b>„QR-Code scannen"</b> und den Code unten scannen:</li>
          </ol>
          ${r.body.qr ? `<img src="${r.body.qr}" alt="2FA-QR-Code" style="width:200px;height:200px;background:#fff;padding:8px;border-radius:12px;border:1px solid var(--line)">` : ''}
          <ol start="3" style="margin:.6rem 0 .2rem 1.1rem;padding:0;line-height:1.5">
            <li>Der Prüfer öffnet <b>pruefer.4ever1.tv</b>.</li>
            <li>Eingeben: <b>Benutzername</b> + <b>Startpasswort</b> + den <b>6-stelligen Code</b> aus der App.</li>
            <li>Beim <b>ersten Login</b> setzt der Prüfer sein <b>eigenes Passwort</b>.</li>
          </ol>
          <div class="muted" style="margin-top:.5rem">Klappt das Scannen nicht, Schlüssel manuell eintragen: <code>${esc(r.body.totpSecret)}</code></div>
          <div class="muted" style="margin-top:.3rem">⚠️ Der QR-Code wird <b>nur jetzt</b> angezeigt. Verloren? Prüfer löschen und neu anlegen.</div>`;
      } else {
        $('agentResult').innerHTML = `
          <div><b>${esc(r.body.username)}</b> wurde angelegt – <b>ohne 2FA</b> (nur Benutzername + Passwort).</div>
          <div class="muted" style="margin-top:.4rem">Login des Prüfers auf <b>pruefer.4ever1.tv</b>: Benutzername + Startpasswort (2FA-Feld bleibt leer). Beim ersten Login wird ein eigenes Passwort gesetzt.</div>`;
      }
      loadAgents();
    } else toast(r.body && r.body.reason === 'exists-or-invalid' ? 'Benutzername existiert bereits.' : 'Anlegen fehlgeschlagen.');
  }
  // Geräte eines Prüfers anzeigen und verwalten
  async function showAgentDevices(a, row) {
    const old = row.querySelector('.devbox'); if (old) { old.remove(); return; }
    const box = document.createElement('div'); box.className = 'devbox';
    box.style.cssText = 'width:100%;margin-top:.6rem;padding-top:.6rem;border-top:1px solid var(--line)';
    const r = await api('GET', '/api/agent-devices?id=' + encodeURIComponent(a.id));
    const list = (r.body && r.body.devices) || [];
    if (r.body && r.body.lockOff) {
      box.innerHTML = '<div class="note" style="color:var(--warn)">⚠️ Die Geräte-Bindung für Prüfer ist per Notausgang (AGENT_DEVICE_LOCK=off) abgeschaltet.</div>';
    } else if (!list.length) {
      box.innerHTML = '<div class="muted">Noch kein Gerät gebunden. Das erste Gerät, mit dem sich <b>' + esc(a.username) + '</b> anmeldet, wird automatisch gebunden – danach kommt nur dieses Gerät herein.</div>';
    } else {
      box.innerHTML = '<div class="muted" style="margin-bottom:.4rem">Nur diese Geräte dürfen sich als <b>' + esc(a.username) + '</b> anmelden:</div>';
      list.forEach((d) => {
        const line = document.createElement('div'); line.className = 'row';
        const seen = d.lastSeen ? new Date(d.lastSeen).toLocaleString('de-DE') : '–';
        const info = document.createElement('div');
        info.innerHTML = '<b>' + esc(d.name) + '</b><div class="muted">Zuletzt benutzt: ' + esc(seen) + '</div>';
        const ac = document.createElement('div'); ac.className = 'acts';
        ac.appendChild(btn('✏️ Umbenennen', '', async () => {
          const nn = prompt('Name für dieses Gerät (z. B. „Dennis Samsung"):', d.name); if (nn === null) return;
          await api('POST', '/api/agent-device-rename', { id: a.id, deviceId: d.id, name: nn });
          box.remove(); showAgentDevices(a, row);
        }));
        ac.appendChild(btn('🗑 Entfernen', 'danger', async () => {
          if (!confirm('Gerät „' + d.name + '" entfernen?\n\n' + a.username + ' kann sich damit nicht mehr anmelden. Beim nächsten Login von einem Gerät wird dieses neu gebunden.')) return;
          await api('POST', '/api/agent-device-remove', { id: a.id, deviceId: d.id });
          box.remove(); showAgentDevices(a, row); loadAgents();
        }));
        line.appendChild(info); line.appendChild(ac); box.appendChild(line);
      });
    }
    const bar = document.createElement('div'); bar.style.cssText = 'margin-top:.5rem;display:flex;gap:.4rem;flex-wrap:wrap';
    bar.appendChild(btn('↺ Neues Gerät zulassen', 'primary', async () => {
      if (!confirm('Alle Geräte von ' + a.username + ' lösen?\n\nDas nächste Gerät, mit dem er/sie sich anmeldet, wird automatisch gebunden.')) return;
      await api('POST', '/api/agent-devices-reset', { id: a.id });
      toast('Geräte gelöst – nächster Login bindet das neue Gerät.');
      box.remove(); loadAgents();
    }));
    box.appendChild(bar);
    row.appendChild(box);
  }

  async function loadAgents() {
    const r = await api('GET', '/api/agents'); const list = r.body.agents || [];
    const el = $('agentList'); if (!list.length) { el.innerHTML = '<div class="empty">Noch keine Mitarbeiter.</div>'; return; }
    el.innerHTML = '';
    list.forEach((a) => {
      const div = document.createElement('div'); div.className = 'row';
      div.innerHTML = `<div><b>${esc(a.username)}</b> <span class="pill ${a.role === 'admin' ? 'warn' : 'ok'}">${a.role === 'admin' ? 'Admin' : 'Prüfer'}</span> ${a.locked ? '<span class="pill no">gesperrt</span>' : ''} ${a.mustChange ? '<span class="pill warn">PW-Wechsel offen</span>' : ''}<div class="muted">2FA: ${a.has2fa ? 'aktiv' : 'aus'} · Geräte: ${a.deviceCount || 0} · Face ID/Fingerabdruck: ${a.hasPasskey ? 'ja' : 'nein'} · seit ${new Date(a.createdAt).toLocaleDateString('de-DE')}</div></div>`;
      const acts = document.createElement('div'); acts.className = 'acts';
      if (a.locked) acts.appendChild(btn('🔓 Entsperren', '', async () => { await api('POST', '/api/agent-unlock', { id: a.id }); loadAgents(); }));
      acts.appendChild(btn('🔑 PW zurücksetzen', '', async () => { const np = prompt('Neues Startpasswort (mind. 8 Zeichen):'); if (!np || np.length < 8) { toast('Zu kurz.'); return; } const x = await api('POST', '/api/agent-reset', { id: a.id, newPassword: np }); toast(x.body.ok ? 'Zurückgesetzt.' : 'Fehlgeschlagen.'); }));
      acts.appendChild(btn('📱 Geräte', '', () => showAgentDevices(a, div)));
      if (AUF_ACP) acts.appendChild(btn('🗑', 'danger', async () => { if (!confirm('Mitarbeiter löschen?')) return; await api('POST', '/api/agent-delete', { id: a.id }); loadAgents(); loadOverview(); }));
      div.appendChild(acts); el.appendChild(div);
    });
  }

  // ---- Überwachung ----
  // ---- Anmelde-Protokoll: wer hat sich angemeldet / es versucht ----
  async function loadLoginLog() {
    const r = await api('GET', '/api/login-log');
    const evs = (r.body && r.body.events) || [];
    const sum = $('loginFailSum');
    if (sum) sum.innerHTML = evs.length
      ? 'Fehlversuche in den letzten 24 Stunden: <b style="color:' + ((r.body.fails24h || 0) > 0 ? 'var(--bad)' : 'var(--good)') + '">' + (r.body.fails24h || 0) + '</b> · insgesamt ' + evs.length + ' Einträge'
      : 'Noch keine Anmeldeversuche protokolliert.';
    const el = $('loginLogList'); if (!el) return;
    if (!evs.length) { el.innerHTML = '<div class="empty">Noch keine Einträge.</div>'; return; }
    const art = { admin: 'Admin', agent: 'Prüfer', passkey: 'Face ID', device: 'Gerät' };
    el.innerHTML = evs.map((e) => {
      const t = new Date(e.at).toLocaleString('de-DE');
      const mark = e.ok ? '<span style="color:var(--good)">✓ erfolgreich</span>' : '<span style="color:var(--bad)">✗ fehlgeschlagen</span>';
      return '<div class="evrow"' + (e.ok ? '' : ' style="background:#2a1618"') + '>'
        + '<span class="t">' + esc(t) + '</span>'
        + '<span>' + mark + '</span>'
        + '<span>' + esc(e.who || '—') + ' <span class="muted">(' + esc(art[e.kind] || e.kind) + ')</span>'
        + (e.detail ? ' · ' + esc(e.detail) : '') + ' · <span class="muted">' + esc(e.ip || '') + '</span></span>'
        + '</div>';
    }).join('');
  }

  async function loadSecurity() {
    loadLoginLog();
    const r = await api('GET', '/api/security'); const m = r.body || {};
    const bl = $('blockedList'); const blocked = m.blocked || [];
    bl.innerHTML = blocked.length ? '' : '<div class="empty">Keine IP gesperrt.</div>';
    blocked.forEach((b) => { const div = document.createElement('div'); div.className = 'row'; div.innerHTML = `<div><b>${esc(b.ip)}</b> <span class="muted">${esc(b.reason || '')} · ${new Date(b.at).toLocaleString('de-DE')}</span></div>`; const acts = document.createElement('div'); acts.appendChild(btn('Entsperren', '', async () => { await api('POST', '/api/security-unblock', { ip: b.ip }); loadSecurity(); })); div.appendChild(acts); bl.appendChild(div); });
    const ev = $('eventList'); const events = m.events || [];
    ev.innerHTML = events.length ? '' : '<div class="empty" style="padding:.6rem">Keine Ereignisse.</div>';
    events.forEach((e) => { const row = document.createElement('div'); row.className = 'evrow'; row.innerHTML = `<div class="t">${new Date(e.at).toLocaleString('de-DE')}</div><div><b>${esc(e.type)}</b></div><div>${esc(e.ip)} ${esc(e.detail || '')}</div>`; ev.appendChild(row); });
  }
})();
