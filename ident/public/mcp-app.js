/* mcp-app.js – Streamer-Ordner von 4EVER1.
 *
 * Hier landet jede fertige Audition aus ident.4ever1.tv, sortiert nach der
 * BIGO-ID. Prüfer dürfen alles lesen, ändern darf nur ein Admin.
 */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let token = '', istAdmin = false, alle = [], suchwort = '';

  function toast(m) {
    const t = $('toast'); t.textContent = m; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2400);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function datum(s) { return s ? new Date(s).toLocaleString('de-DE') : ''; }

  async function api(method, path, body) {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;
    let res;
    try { res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined }); }
    catch { return { status: 0, body: {} }; }
    let json = {}; try { json = await res.json(); } catch {}
    return { status: res.status, body: json };
  }

  // ---- Anmeldung -----------------------------------------------------------
  $('loginBtn').addEventListener('click', anmelden);
  $('pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') anmelden(); });
  $('user').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('pass').focus(); });
  async function anmelden() {
    $('loginErr').textContent = 'Prüfe …';
    const name = $('user').value.trim(), pw = $('pass').value;
    let r = await api('POST', '/api/login', { username: name, password: pw });
    // Der Admin-Login läuft über ein leeres Benutzerfeld. Wer dort trotzdem
    // etwas eingetippt hat, soll deswegen nicht scheitern – wir versuchen es
    // einmal still als Admin, statt ihn auf eine Sperre zulaufen zu lassen.
    if ((r.status !== 200 || !r.body.token) && name && r.body && r.body.reason === 'bad-login') {
      const alsAdmin = await api('POST', '/api/login', { username: '', password: pw });
      if (alsAdmin.status === 200 && alsAdmin.body.token) r = alsAdmin;
    }
    if (r.status !== 200 || !r.body.token) {
      const uebrig = r.body && typeof r.body.triesLeft === 'number' ? ' Noch ' + r.body.triesLeft + ' Versuche.' : '';
      const gesperrt = r.status === 429 ? ' Zu viele Versuche – bitte kurz warten.' : '';
      $('loginErr').textContent = 'Anmeldung fehlgeschlagen.' + uebrig + gesperrt;
      $('pass').value = ''; return;
    }
    if (r.body.mustChange) {
      $('loginErr').innerHTML = 'Bitte zuerst auf <b>pruefer.4ever1.tv</b> anmelden und dort dein eigenes Passwort vergeben.';
      return;
    }
    token = r.body.token; istAdmin = r.body.role === 'admin';
    $('loginErr').textContent = '';
    $('whoami').textContent = (r.body.name || '') + (istAdmin ? ' · Admin' : ' · Prüfer');
    $('login').style.display = 'none'; $('app').style.display = '';
    laden();
  }
  $('logout').addEventListener('click', () => {
    token = ''; alle = [];
    $('app').style.display = 'none'; $('login').style.display = '';
    $('pass').value = '';
  });

  // ---- Übersicht -----------------------------------------------------------
  // Daten holen. Mit zeigen=false bleibt die aktuelle Ansicht stehen – sonst
  // würde man beim Speichern aus dem geöffneten Ordner geworfen.
  async function laden(zeigen = true) {
    const r = await api('GET', '/api/streamers');
    alle = (r.body && r.body.streamers) || [];
    if (zeigen) zeigeListe();
  }

  const STATUS = { neu: 'neu', aktiv: 'aktiv', pausiert: 'pausiert', abgelehnt: 'abgelehnt', weg: 'nicht mehr dabei' };
  function statusPill(s) {
    const t = esc(STATUS[s] || s || 'neu');
    if (s === 'aktiv') return `<span class="pill ok">${t}</span>`;
    if (s === 'abgelehnt' || s === 'weg') return `<span class="pill no">${t}</span>`;
    if (s === 'pausiert') return `<span class="pill warn">${t}</span>`;
    return `<span class="pill">${t}</span>`;
  }

  function zeigeListe() {
    $('detail').style.display = 'none';
    const el = $('liste'); el.style.display = '';
    const q = suchwort.trim().toLowerCase();
    const treffer = !q ? alle : alle.filter((s) =>
      (s.bigoId || '').toLowerCase().includes(q) || (s.name || '').toLowerCase().includes(q));

    const zahl = (f) => alle.filter(f).length;
    el.innerHTML = `
      <div class="stats">
        <div class="stat"><b>${alle.length}</b><span>Ordner</span></div>
        <div class="stat"><b>${zahl((s) => s.status === 'aktiv')}</b><span>aktiv</span></div>
        <div class="stat"><b>${zahl((s) => s.status === 'neu')}</b><span>neu</span></div>
        <div class="stat"><b>${alle.reduce((n, s) => n + (s.auditions || []).length, 0)}</b><span>Auditions</span></div>
      </div>
      <div class="bar">
        <input id="suche" placeholder="🔎 BIGO-ID oder Name suchen …" value="${esc(suchwort)}">
        <button id="neuLaden">↻ Aktualisieren</button>
      </div>
      <div class="folders" id="folders"></div>`;

    const f = $('folders');
    if (!treffer.length) {
      f.outerHTML = alle.length
        ? '<div class="empty">Nichts gefunden.</div>'
        : '<div class="empty">Noch keine Ordner.<br><span class="muted">Sobald eine Audition auf ident.4ever1.tv abgeschlossen ist, erscheint sie hier automatisch.</span></div>';
    } else {
      treffer.forEach((s) => {
        const d = document.createElement('div');
        d.className = 'folder';
        const letzte = (s.auditions || [])[0];
        d.innerHTML = `<div class="id">${esc(s.bigoId)}</div>
          <div class="nm">${esc(s.name || 'Name unbekannt')}${s.alter ? ' · ' + esc(s.alter) + ' J.' : ''}</div>
          <div class="row">${statusPill(s.status)}
            <span class="muted">${(s.auditions || []).length} Audition${(s.auditions || []).length === 1 ? '' : 'en'}</span></div>
          <div class="muted" style="margin-top:.3rem;font-size:.76rem">${letzte ? 'zuletzt ' + esc(datum(letzte.eingegangenAm)) : ''}</div>`;
        d.addEventListener('click', () => zeigeOrdner(s.id));
        f.appendChild(d);
      });
    }
    $('suche').addEventListener('input', (e) => { suchwort = e.target.value; zeigeListe(); $('suche').focus(); });
    $('neuLaden').addEventListener('click', laden);
  }

  // ---- Einzelner Ordner ----------------------------------------------------
  function zeigeOrdner(id) {
    const s = alle.find((x) => x.id === id); if (!s) return;
    $('liste').style.display = 'none';
    const el = $('detail'); el.style.display = '';

    const auswahl = Object.keys(STATUS).map((k) =>
      `<option value="${k}"${s.status === k ? ' selected' : ''}>${esc(STATUS[k])}</option>`).join('');

    el.innerHTML = `
      <div class="back"><button id="zurueck">← Alle Ordner</button></div>
      <div class="head">
        <div>
          <h1>${esc(s.bigoId)}</h1>
          <div class="sub">${esc(s.name || 'Name unbekannt')}${s.alter ? ' · ' + esc(s.alter) + ' Jahre' : ''}
            · Ordner seit ${esc(datum(s.angelegtAm))}</div>
        </div>
        <div class="rechts">
          ${istAdmin ? `<select id="statusWahl">${auswahl}</select>` : statusPill(s.status)}
          ${istAdmin ? '<button id="statusSpeichern" class="primary">Status setzen</button>' : ''}
        </div>
      </div>
      <div id="auds"></div>
      <div class="notiz">
        <b style="font-size:.95rem">📝 Notiz zum Streamer</b>
        <p class="muted" style="margin:.2rem 0 .5rem">Gilt für den ganzen Ordner – nicht für eine einzelne Audition.</p>
        <textarea id="notizText" ${istAdmin ? '' : 'readonly'} placeholder="${istAdmin ? 'z. B. Streamt meist abends, sehr zuverlässig …' : 'Nur Admins können hier schreiben.'}">${esc(s.notiz || '')}</textarea>
        ${istAdmin ? '<div style="margin-top:.6rem"><button id="notizSpeichern" class="primary">Notiz speichern</button></div>' : ''}
      </div>`;

    const auds = $('auds');
    if (!(s.auditions || []).length) {
      auds.innerHTML = '<div class="empty">In diesem Ordner liegt noch keine Audition.</div>';
    } else {
      s.auditions.forEach((a) => auds.appendChild(auditionKarte(a)));
    }

    $('zurueck').addEventListener('click', zeigeListe);
    if (istAdmin) {
      $('statusSpeichern').addEventListener('click', async () => {
        const r = await api('POST', '/api/streamer', { id: s.id, status: $('statusWahl').value });
        if (r.status !== 200) { toast('Hat nicht geklappt.'); return; }
        toast('Status gesetzt.'); await laden(false); zeigeOrdner(s.id);
      });
      $('notizSpeichern').addEventListener('click', async () => {
        const r = await api('POST', '/api/streamer', { id: s.id, notiz: $('notizText').value });
        if (r.status !== 200) { toast('Hat nicht geklappt.'); return; }
        toast('Notiz gespeichert.'); await laden(false);   // Ordner bleibt offen
      });
    }
  }

  function ergebnisPill(e) {
    if (e === 'approved') return '<span class="pill ok">✓ freigegeben</span>';
    if (e === 'rejected') return '<span class="pill no">✖ abgelehnt</span>';
    return '<span class="pill warn">offen</span>';
  }
  function dauer(sek) { const m = Math.floor((sek || 0) / 60); return m + ':' + String((sek || 0) % 60).padStart(2, '0'); }

  function auditionKarte(a) {
    const d = document.createElement('div'); d.className = 'aud';
    const auf = a.aufnahme;
    const aufZeile = !auf ? '<span class="muted">keine Aufnahme</span>'
      : `🎬 ${dauer(auf.sekunden)} · ` + (auf.auswertung === 'ok'
        ? `<span class="pill ok">Aufnahme brauchbar</span>`
        : auf.auswertung === 'bad'
          ? `<span class="pill no">nicht brauchbar</span>`
          : '<span class="pill warn">noch nicht ausgewertet</span>')
        + (auf.begruendung ? ' <span class="muted">' + esc(auf.begruendung) + '</span>' : '');

    d.innerHTML = `
      <div class="top">
        <div>
          <h3>Audition vom ${esc(datum(a.erstelltAm))}</h3>
          <div class="meta">
            Prüfer: ${esc(a.pruefer || '—')} · Nummer: ${esc(a.zugangsnummer || '—')}<br>
            ${esc(a.ausweisart || 'Ausweis unbekannt')} · Nr.: ${esc(a.ausweisnummer || '—')}
            ${a.ablehnungsgrund ? '<br>Grund: ' + esc(a.ablehnungsgrund) : ''}
            ${a.notiz ? '<br>Notiz: ' + esc(a.notiz) : ''}
          </div>
        </div>
        ${ergebnisPill(a.ergebnis)}
      </div>
      <div style="margin-top:.6rem">${aufZeile}</div>
      ${auf ? `<video controls preload="metadata" src="/api/recording?id=${encodeURIComponent(auf.id)}&token=${encodeURIComponent(token)}"></video>` : ''}
      <div class="files">${(a.dateien || []).filter((f) => f.art === 'ausweis').map((f) => istAdmin && a.auditionId
        ? `<a href="/api/doc?id=${encodeURIComponent(a.auditionId)}&file=${encodeURIComponent(f.dateiname)}&token=${encodeURIComponent(token)}" target="_blank" rel="noopener">📄 ${esc(f.bezeichnung)}</a>`
        : `<span class="pill">📄 ${esc(f.bezeichnung)}</span>`).join('')}</div>
      ${(a.protokoll || []).length ? `<div class="prot"><b style="font-size:.85rem">Protokoll</b>${
        a.protokoll.map((e) => `<div class="e">${esc(e.text)}<small>${esc(e.autor || '')} · ${esc(datum(e.am))}</small></div>`).join('')
      }</div>` : ''}`;
    return d;
  }
})();
