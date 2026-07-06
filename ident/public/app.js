/* ident – Client (Agentur 4ever1)
 *   Bewerber ("guest"): Zugangsnummer -> Ausweis-Fotos + Selfie hochladen -> Live-Video mit Prüfer.
 *   Prüfer ("host"): Login -> Warteraum -> Bewerber abholen -> Bilder prüfen -> freigeben/ablehnen.
 * Die Bilder gehen verschlüsselt (WebRTC-Datenkanal, DTLS) direkt an den Prüfer;
 * die Akte wird erst bei der Freigabe serverseitig (AES-256) gespeichert.
 */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const FALLBACK_ICE = [{ urls: ['stun:stun.l.google.com:19302'] }];

  // App auf dem Home-Bildschirm installierbar machen (PWA).
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }

  const localVideo = $('localVideo'), remoteVideo = $('remoteVideo');
  const remoteWaiting = $('remoteWaiting'), remoteTag = $('remoteTag'), localTag = $('localTag');
  const chatLog = $('chatLog');

  const state = {
    role: 'guest', code: '', token: '', name: '', isAdmin: false, mustChange: false,
    ws: null, pc: null, dc: null, polite: false, makingOffer: false, ignoreOffer: false,
    localStream: null, iceServers: null,
    pendingDocs: [],   // Bewerber: Bilder, die auf den offenen Datenkanal warten
    docs: [],          // Prüfer: empfangene Bilder [{label,dataUrl}]
    snaps: [],         // Prüfer: Live-Fotos
    recorder: null, recChunks: [], recStart: 0, recTimer: 0, recMime: '', recExt: 'webm', audioCtx: null,
    waitingTimer: 0, uploadTarget: '',
  };

  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600); }
  function sysMsg(text) { const d = document.createElement('div'); d.className = 'msg sys'; d.textContent = text; chatLog.appendChild(d); chatLog.scrollTop = chatLog.scrollHeight; }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  const pad = (n) => String(n).padStart(2, '0');

  // ---- API ----
  async function api(method, path, body) {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
    let res;
    try { res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined }); }
    catch { return { status: 0, body: {} }; }
    let json = {}; try { json = await res.json(); } catch {}
    return { status: res.status, body: json };
  }
  async function loadIce() { try { const r = await fetch('ice', { cache: 'no-store' }); return (await r.json()).iceServers; } catch { return FALLBACK_ICE; } }

  // ================= LOBBY =================
  let mode = 'guest';
  const params = new URLSearchParams(location.search);
  const urlCode = (params.get('code') || params.get('raum') || '').toUpperCase();
  if (urlCode) $('codeInput').value = urlCode;
  // Eigener Prüfer-Link (/pruefer, /login, /team, /mitarbeiter oder ?login) ->
  // die Lobby startet direkt im Mitarbeiter-Login statt in der Bewerber-Ansicht.
  const staffPaths = ['/pruefer', '/login', '/team', '/mitarbeiter'];
  const staffHost = location.hostname.toLowerCase().startsWith('pruefer.');
  if (staffHost || staffPaths.includes(location.pathname.toLowerCase()) || params.has('login') || params.has('staff')) mode = 'host';
  setMode(mode);

  $('staffToggle').addEventListener('click', () => { mode = mode === 'guest' ? 'host' : 'guest'; $('lobbyErr').textContent = ''; setMode(mode); });
  function setMode(m) {
    const guest = m !== 'host';
    $('applicantFields').style.display = guest ? '' : 'none';
    $('staffFields').style.display = guest ? 'none' : '';
    $('lobbyTitle').textContent = guest ? 'Audition starten' : 'Mitarbeiter-Anmeldung';
    $('lobbySub').textContent = guest ? 'Gib deine Zugangsnummer ein, die du erhalten hast.' : 'Nur für Prüfer und Admins.';
    $('enterBtn').textContent = guest ? 'Audition starten' : 'Anmelden';
    $('staffToggle').textContent = guest ? 'Mitarbeiter-Login →' : '← Zurück';
  }

  $('enterBtn').addEventListener('click', enterRoom);
  function resetEnter() { $('enterBtn').disabled = false; $('enterBtn').textContent = mode === 'guest' ? 'Audition starten' : 'Anmelden'; }

  async function enterRoom() {
    $('lobbyErr').textContent = '';
    const code = $('codeInput').value.trim().toUpperCase();
    if (mode === 'guest') {
      if (!code) { $('lobbyErr').textContent = 'Bitte gib deine Zugangsnummer ein.'; return; }
      if (!$('consent').checked) { $('lobbyErr').textContent = 'Bitte stimme der Verarbeitung zu, um fortzufahren.'; return; }
    }
    $('enterBtn').disabled = true;

    if (mode === 'host') {
      $('enterBtn').textContent = 'Anmeldung …';
      const r = await api('POST', '/api/login', { username: $('userInput').value.trim(), password: $('passInput').value, totp: $('totpInput').value.trim() });
      if (r.status !== 200 || !r.body.token) { resetEnter(); $('lobbyErr').textContent = loginErr(r); return; }
      state.token = r.body.token; state.name = r.body.name; state.isAdmin = r.body.role === 'admin'; state.mustChange = !!r.body.mustChange;
      if (state.mustChange) { const ok = await forcePwChange(); if (!ok) { resetEnter(); return; } }
      resetEnter(); openWaiting(); return;
    }

    // Bewerber
    $('enterBtn').textContent = 'Kamera wird gestartet …';
    if (!(await startCamera())) { resetEnter(); $('lobbyErr').textContent = 'Kein Zugriff auf Kamera/Mikrofon. Bitte erlauben.'; return; }
    state.role = 'guest'; state.code = code; state.name = 'Bewerber';
    localTag.textContent = 'Du';
    startRoom();
  }
  function loginErr(r) {
    const x = r.body && r.body.reason;
    if (x === 'account-locked') return 'Konto gesperrt (zu viele Fehlversuche). Bitte an den Admin wenden.';
    if (x === 'bad-totp') return 'Passwort ok, aber 2FA-Code falsch.';
    if (x === 'ip-blocked') return 'Login von diesem Standort nicht erlaubt.';
    if (r.status === 503) return 'Admin/Login ist auf dem Server nicht konfiguriert.';
    return 'Anmeldung fehlgeschlagen.';
  }

  async function startCamera() {
    try {
      state.localStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: { echoCancellation: true, noiseSuppression: true } });
      localVideo.srcObject = state.localStream; return true;
    } catch { return false; }
  }

  // erzwungener Passwortwechsel (Erstlogin/Reset)
  async function forcePwChange() {
    const np = prompt('Erster Login: Bitte ein neues Passwort setzen (mind. 8 Zeichen).');
    if (np === null) return false;
    if (String(np).length < 8) { toast('Passwort zu kurz.'); return forcePwChange(); }
    const r = await api('POST', '/api/change-password', { newPassword: np });
    if (r.status === 200) { toast('Passwort gesetzt.'); state.mustChange = false; return true; }
    toast('Passwort konnte nicht gesetzt werden.'); return false;
  }

  // ================= WARTERAUM (Prüfer) =================
  function openWaiting() {
    $('lobby').style.display = 'none';
    $('waitingView').style.display = '';
    $('waitWho').textContent = 'Angemeldet als ' + state.name + (state.isAdmin ? ' (Admin)' : '');
    $('newCodeResult').textContent = '';
    refreshWaiting(); clearInterval(state.waitingTimer); state.waitingTimer = setInterval(refreshWaiting, 3000);
  }
  async function refreshWaiting() { const r = await api('GET', '/api/waiting'); if (r.status === 200) renderWaiting(r.body.waiting || []); }
  function renderWaiting(list) {
    const el = $('waitingList'); el.innerHTML = '';
    if (!list.length) { el.innerHTML = '<p style="color:var(--dim);font-size:.88rem">Niemand wartet gerade. Erzeuge oben eine Zugangsnummer und gib sie an einen Bewerber weiter.</p>'; return; }
    list.forEach((w) => {
      const div = document.createElement('div'); div.className = 'gstep'; div.style.marginBottom = '.5rem';
      const secs = Math.max(0, Math.round((Date.now() - w.joinedAt) / 1000));
      const since = secs < 60 ? secs + ' Sek.' : Math.floor(secs / 60) + ' Min.';
      const st = w.busy ? (w.claimedBy ? 'wird von ' + esc(w.claimedBy) + ' geholt' : 'in Bearbeitung') : 'wartet seit ' + since;
      div.innerHTML = `<span class="gn">👤</span><div class="gt">Bewerber-Nr. ${esc(w.code)}${w.note ? ' · ' + esc(w.note) : ''}<small>${st}</small></div>`;
      const b = document.createElement('button'); b.className = 'primary'; b.textContent = '📞 Abholen'; b.disabled = !!w.busy;
      b.addEventListener('click', () => abholen(w.code)); div.appendChild(b); el.appendChild(div);
    });
  }
  async function abholen(code) {
    const claim = await api('POST', '/api/waiting/claim', { code });
    if (claim.status !== 200) { toast(claim.body && claim.body.by ? 'Wird gerade von ' + claim.body.by + ' übernommen.' : 'Bewerber nicht mehr verfügbar.'); refreshWaiting(); return; }
    clearInterval(state.waitingTimer); state.waitingTimer = 0;
    if (!(await startCamera())) { api('POST', '/api/waiting/release', { code }); openWaiting(); toast('Kein Zugriff auf Kamera/Mikrofon.'); return; }
    state.role = 'host'; state.code = code; localTag.textContent = state.name + ' (Du)';
    $('waitingView').style.display = 'none';
    startRoom();
  }
  // Bewerber-Link: IMMER auf die Bewerber-Seite zeigen – nie auf die Prüfer-
  // Subdomain/den Prüfer-Pfad (sonst landet der Bewerber im Mitarbeiter-Login).
  function applicantLink(code) {
    const host = location.host.replace(/^pruefer\./i, 'ident.');
    return `${location.protocol}//${host}/?code=${encodeURIComponent(code)}`;
  }
  $('newCodeBtn').addEventListener('click', async () => {
    $('newCodeBtn').disabled = true; const r = await api('POST', '/api/code', {}); $('newCodeBtn').disabled = false;
    if (r.status === 200 && r.body.code) {
      const link = applicantLink(r.body.code);
      let copied = false;
      try { await navigator.clipboard.writeText(link); copied = true; } catch {}
      $('newCodeResult').innerHTML = `Nummer: <b>${esc(r.body.code)}</b>${copied ? ' · Link kopiert ✓' : ''}<br><a href="${esc(link)}" target="_blank" rel="noopener" style="word-break:break-all;color:var(--accent)">${esc(link)}</a>`;
    } else $('newCodeResult').textContent = 'Konnte keine Nummer erzeugen.';
  });
  $('waitLogout').addEventListener('click', () => { clearInterval(state.waitingTimer); state.token = ''; state.name = ''; state.isAdmin = false; $('waitingView').style.display = 'none'; $('lobby').style.display = ''; $('passInput').value = ''; $('totpInput').value = ''; });

  // ================= RAUM / WebRTC =================
  function startRoom() {
    $('lobby').style.display = 'none'; $('waitingView').style.display = 'none';
    $('room').classList.add('active');
    setupRoleUI();
    loadIce().then((ice) => { state.iceServers = ice; connectSignaling(); });
    $('bannerText').textContent = state.role === 'host' ? 'Warte auf den Bewerber …' : 'Warte auf den Prüfer …';
  }
  function setupRoleUI() {
    const host = state.role === 'host';
    $('guidePane').style.display = host ? 'none' : '';
    $('reviewPane').style.display = host ? '' : 'none';
    $('recBtn').style.display = host ? '' : 'none';
    $('stopRecBtn').style.display = host ? '' : 'none';
    $('leaveBtn').style.display = host ? '' : 'none';
    // Großes Bild = das Gegenüber: für den Prüfer der Bewerber, für den Bewerber der Prüfer.
    remoteTag.textContent = host ? 'Bewerber' : 'Prüfer';
    remoteWaiting.textContent = host ? 'Warte auf das Video des Bewerbers …' : 'Warte auf den Prüfer …';
  }

  function connectSignaling() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}`); state.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: 'join', room: state.code, role: state.role, token: state.token || '' }));
    ws.onmessage = async (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      switch (m.type) {
        case 'joined': state.role = m.role; setupRoleUI(); break;
        case 'error':
          if (m.reason === 'room-full') toast('Der Raum ist bereits voll.');
          else if (m.reason === 'auth') backToStart('Anmeldung abgelaufen – bitte neu anmelden.');
          else if (m.reason === 'bad-code') backToStart('Ungültige oder bereits benutzte Zugangsnummer.');
          break;
        case 'peer-ready':
          remoteTag.textContent = state.role === 'host' ? 'Bewerber' : 'Prüfer';
          $('bannerText').textContent = 'Verbunden.';
          createPeer(); break;
        case 'signal': await handleSignal(m.data); break;
        case 'peer-left':
          remoteVideo.srcObject = null; remoteWaiting.style.display = ''; remoteWaiting.textContent = 'Gegenüber hat den Raum verlassen.';
          sysMsg('Gegenüber hat den Raum verlassen.'); resetPeer(); break;
      }
    };
    ws.onclose = () => sysMsg('Verbindung zum Server getrennt.');
  }
  function signal(data) { if (state.ws && state.ws.readyState === WebSocket.OPEN) state.ws.send(JSON.stringify({ type: 'signal', data })); }

  function resetPeer() { if (state.pc) { try { state.pc.close(); } catch {} } state.pc = null; state.dc = null; state.makingOffer = false; state.ignoreOffer = false; }
  function createPeer() {
    if (state.pc) return state.pc;
    state.polite = state.role === 'guest';
    const pc = new RTCPeerConnection({ iceServers: state.iceServers || FALLBACK_ICE }); state.pc = pc;
    state.localStream.getTracks().forEach((t) => pc.addTrack(t, state.localStream));
    pc.onnegotiationneeded = async () => { try { state.makingOffer = true; await pc.setLocalDescription(); signal({ description: pc.localDescription }); } catch {} finally { state.makingOffer = false; } };
    pc.onicecandidate = ({ candidate }) => { if (candidate) signal({ candidate }); };
    pc.ontrack = ({ streams }) => { remoteVideo.srcObject = streams[0]; remoteWaiting.style.display = 'none'; };
    pc.onconnectionstatechange = () => { if (['failed', 'disconnected'].includes(pc.connectionState)) $('bannerText').textContent = 'Verbindung gestört – wird neu aufgebaut …'; };
    // Prüfer (impolite) erstellt den Datenkanal; Bewerber empfängt ihn.
    if (state.role === 'host') setupDataChannel(pc.createDataChannel('app'));
    else pc.ondatachannel = (e) => setupDataChannel(e.channel);
    return pc;
  }
  async function handleSignal(data) {
    const pc = createPeer();
    try {
      if (data.description) {
        const offerCollision = data.description.type === 'offer' && (state.makingOffer || pc.signalingState !== 'stable');
        state.ignoreOffer = !state.polite && offerCollision;
        if (state.ignoreOffer) return;
        await pc.setRemoteDescription(data.description);
        if (data.description.type === 'offer') { await pc.setLocalDescription(); signal({ description: pc.localDescription }); }
      } else if (data.candidate) {
        try { await pc.addIceCandidate(data.candidate); } catch { if (!state.ignoreOffer) throw new Error('ice'); }
      }
    } catch (e) { /* ignorieren – Perfect Negotiation regelt Kollisionen */ }
  }

  // ---- Datenkanal (Chat + Bild-Übertragung + Ergebnis) ----
  const incoming = {}; // id -> {label, n, parts:[]}
  function setupDataChannel(dc) {
    state.dc = dc;
    dc.onopen = () => { flushPendingDocs(); if (state.role === 'guest') $('guideStatus').textContent = 'Verbunden mit dem Prüfer. Bitte lade die Bilder hoch.'; };
    dc.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.kind === 'chat') addChat(m.text, false);
      else if (m.kind === 'doc-start') incoming[m.id] = { label: m.label, n: m.n, parts: [] };
      else if (m.kind === 'doc-part') { const it = incoming[m.id]; if (!it) return; it.parts[m.i] = m.part; if (it.parts.filter(Boolean).length === it.n) { onDocReceived(it.label, it.parts.join('')); delete incoming[m.id]; } }
      else if (m.kind === 'result') onResult(m.result);
    };
  }
  function dcSend(obj) { if (state.dc && state.dc.readyState === 'open') { state.dc.send(JSON.stringify(obj)); return true; } return false; }
  function sendDoc(label, dataUrl) {
    const id = Math.random().toString(36).slice(2); const size = 15000; const n = Math.ceil(dataUrl.length / size);
    if (!dcSend({ kind: 'doc-start', id, label, n })) return false;
    for (let i = 0; i < n; i++) dcSend({ kind: 'doc-part', id, i, part: dataUrl.slice(i * size, (i + 1) * size) });
    return true;
  }
  function flushPendingDocs() { if (state.role !== 'guest') return; const q = state.pendingDocs.slice(); state.pendingDocs = []; q.forEach((d) => sendDoc(d.label, d.dataUrl)); }

  // ================= BEWERBER: Bilder hochladen =================
  $('upFront').addEventListener('click', () => pickImage('Ausweis-Vorderseite', 'gs1'));
  $('upBack').addEventListener('click', () => pickImage('Ausweis-Rückseite', 'gs2'));
  $('upSelfie').addEventListener('click', () => pickImage('Selfie mit Ausweis', 'gs3'));
  function pickImage(label, gstepId) { state.uploadTarget = label; state._gstep = gstepId; $('fileInput').value = ''; $('fileInput').click(); }
  $('fileInput').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const dataUrl = await resizeImage(f, 1600, 0.85);
    addShot('guestShots', state.uploadTarget, dataUrl);
    if (state._gstep) $(state._gstep).classList.add('done');
    if (dcSend({ kind: 'ping' }) || (state.dc && state.dc.readyState === 'open')) sendDoc(state.uploadTarget, dataUrl);
    else { state.pendingDocs.push({ label: state.uploadTarget, dataUrl }); toast('Bild gespeichert – wird gesendet, sobald der Prüfer verbunden ist.'); }
    const doneAll = ['gs1', 'gs2', 'gs3'].every((g) => $(g).classList.contains('done'));
    $('guideStatus').className = 'status ' + (doneAll ? 'ok' : 'pending');
    $('guideStatus').textContent = doneAll ? 'Alle Bilder hochgeladen. Der Prüfer meldet sich gleich.' : 'Weiter mit dem nächsten Bild.';
  });
  function resizeImage(file, maxSide, quality) {
    return new Promise((resolve) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        let { width: w, height: h } = img; const s = Math.min(1, maxSide / Math.max(w, h)); w = Math.round(w * s); h = Math.round(h * s);
        const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
      img.src = url;
    });
  }

  // ================= PRÜFER: Bilder empfangen / prüfen =================
  function onDocReceived(label, dataUrl) {
    state.docs.push({ label, dataUrl });
    addShot('hostShots', label, dataUrl);
    $('reviewStatus').className = 'status ok';
    $('reviewStatus').textContent = state.docs.length + ' Bild(er) vom Bewerber erhalten.';
    // Namensfeld noch leer? -> Hinweis
  }
  $('snapDoc').addEventListener('click', () => snapshot('Ausweis (Live)'));
  $('snapFace').addEventListener('click', () => snapshot('Gesicht (Live)'));
  function snapshot(label) {
    if (!remoteVideo.videoWidth) { toast('Noch kein Bild vom Bewerber.'); return; }
    const c = document.createElement('canvas'); c.width = remoteVideo.videoWidth; c.height = remoteVideo.videoHeight;
    c.getContext('2d').drawImage(remoteVideo, 0, 0);
    const url = c.toDataURL('image/jpeg', 0.9); state.snaps.push({ label, dataUrl: url });
    addShot('snapShots', label, url); toast(label + ' aufgenommen');
  }
  function checkBoxes() { return Array.from(document.querySelectorAll('#checklist input[data-chk]')); }
  $('checklist').addEventListener('change', () => { $('approveBtn').disabled = !checkBoxes().every((c) => c.checked); });

  $('approveBtn').addEventListener('click', () => saveCase('approved'));
  $('rejectBtn').addEventListener('click', () => {
    const reason = prompt('Grund der Ablehnung (optional):', ''); if (reason === null) return;
    saveCase('rejected', reason);
  });
  async function saveCase(result, rejectReason) {
    const body = {
      code: state.code, bigoName: $('vBigoName').value, age: $('vAge').value,
      verifiedName: $('vName').value, docNumber: $('vDocNumber').value, docType: $('vDocType').value,
      result, rejectReason: rejectReason || '', agentName: state.name,
      checklist: checkBoxes().map((c) => ({ label: c.parentElement.textContent.trim(), checked: c.checked })),
      docs: state.docs.concat(state.snaps).map((d) => ({ label: d.label, dataUrl: d.dataUrl })),
    };
    $('approveBtn').disabled = true; $('rejectBtn').disabled = true;
    const r = await api('POST', '/api/case', body);
    if (r.status === 200) {
      dcSend({ kind: 'result', result });
      $('reviewStatus').className = 'status ' + (result === 'approved' ? 'ok' : 'bad');
      $('reviewStatus').textContent = result === 'approved' ? '✓ Freigegeben – Akte angelegt.' : '✖ Abgelehnt – Akte angelegt.';
      toast(result === 'approved' ? 'Freigegeben ✓' : 'Abgelehnt');
    } else {
      $('rejectBtn').disabled = false; $('approveBtn').disabled = !checkBoxes().every((c) => c.checked);
      toast(r.body && r.body.reason === 'bad-code' ? 'Zugangsnummer ungültig/verbraucht – evtl. schon abgeschlossen.' : 'Speichern fehlgeschlagen.');
    }
  }
  function onResult(result) { // Bewerber-Seite
    if (result === 'approved') { $('okBadge').classList.add('on'); $('guideStatus').className = 'status ok'; $('guideStatus').textContent = '✓ Deine Audition wurde erfolgreich übermittelt. Viel Erfolg – die Agentur 4EVER1 meldet sich!'; toast('Übermittelt ✓'); }
    else { $('guideStatus').className = 'status bad'; $('guideStatus').textContent = '✖ Die Audition wurde nicht angenommen. Bei Fragen wende dich an die Agentur 4EVER1.'; }
  }

  // ---- gemeinsame Bild-Kachel ----
  function addShot(containerId, label, dataUrl) {
    const el = document.createElement('div'); el.className = 'shot';
    el.innerHTML = `<img src="${dataUrl}" alt=""><div class="cap">${esc(label)}</div>`;
    el.querySelector('img').addEventListener('click', () => { $('lightboxImg').src = dataUrl; $('lightbox').classList.add('on'); });
    $(containerId).appendChild(el);
  }
  $('lightbox').addEventListener('click', () => $('lightbox').classList.remove('on'));

  // ================= CHAT =================
  function addChat(text, me) { const d = document.createElement('div'); d.className = 'msg ' + (me ? 'me' : 'them'); d.textContent = text; chatLog.appendChild(d); chatLog.scrollTop = chatLog.scrollHeight; }
  function sendChat() { const v = $('chatInput').value.trim(); if (!v) return; if (dcSend({ kind: 'chat', text: v })) { addChat(v, true); $('chatInput').value = ''; } else toast('Noch nicht verbunden.'); }
  $('chatSend').addEventListener('click', sendChat);
  $('chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('sel', x === b));
    document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('sel', p.dataset.pane === b.dataset.tab));
  }));

  // ================= MIKRO/KAMERA =================
  $('micBtn').addEventListener('click', () => { const t = state.localStream && state.localStream.getAudioTracks()[0]; if (!t) return; t.enabled = !t.enabled; $('micBtn').textContent = t.enabled ? '🎤 Mikro an' : '🔇 Mikro aus'; });
  $('camBtn').addEventListener('click', () => { const t = state.localStream && state.localStream.getVideoTracks()[0]; if (!t) return; t.enabled = !t.enabled; $('camBtn').textContent = t.enabled ? '📷 Kamera an' : '🚫 Kamera aus'; });

  // ================= AUFNAHME (Prüfer) =================
  function pickMime() { for (const m of ['video/mp4;codecs=h264,aac', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) { const ext = m.startsWith('video/mp4') ? 'mp4' : 'webm'; if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return { mime: m, ext }; } return { mime: '', ext: 'webm' }; }
  $('recBtn').addEventListener('click', startRec);
  $('stopRecBtn').addEventListener('click', stopRec);
  function startRec() {
    if (!window.MediaRecorder) { toast('Browser unterstützt keine Aufnahme.'); return; }
    const W = 1280, H = 480; const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; const ctx = canvas.getContext('2d');
    const draw = () => { ctx.fillStyle = '#0d1526'; ctx.fillRect(0, 0, W, H); cover(ctx, remoteVideo, 0, 0, W / 2, H); cover(ctx, localVideo, W / 2, 0, W / 2, H); if (state.recorder) requestAnimationFrame(draw); };
    const canvasStream = canvas.captureStream(25);
    // Audio beider Seiten mischen
    const ac = new (window.AudioContext || window.webkitAudioContext)(); state.audioCtx = ac; const dest = ac.createMediaStreamDestination();
    [state.localStream, remoteVideo.srcObject].forEach((s) => { if (s && s.getAudioTracks().length) { try { ac.createMediaStreamSource(s).connect(dest); } catch {} } });
    const mixed = new MediaStream([...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const { mime, ext } = pickMime(); state.recMime = mime; state.recExt = ext; state.recChunks = [];
    const rec = mime ? new MediaRecorder(mixed, { mimeType: mime }) : new MediaRecorder(mixed); state.recorder = rec;
    rec.ondataavailable = (e) => { if (e.data && e.data.size) state.recChunks.push(e.data); };
    rec.onstop = finalizeRec; rec.start(1000); draw();
    state.recStart = Date.now(); $('recBadge').classList.add('on'); state.recTimer = setInterval(() => { const s = Math.floor((Date.now() - state.recStart) / 1000); $('recTime').textContent = pad(Math.floor(s / 60)) + ':' + pad(s % 60); }, 500);
    $('recBtn').disabled = true; $('stopRecBtn').disabled = false; toast('Aufnahme läuft');
  }
  function stopRec() { if (state.recorder && state.recorder.state !== 'inactive') state.recorder.stop(); state.recorder = null; clearInterval(state.recTimer); $('recBadge').classList.remove('on'); $('recBtn').disabled = false; $('stopRecBtn').disabled = true; }
  function cover(ctx, v, x, y, w, h) { if (!v || !v.videoWidth) { ctx.fillStyle = '#0d1526'; ctx.fillRect(x, y, w, h); return; } const s = Math.max(w / v.videoWidth, h / v.videoHeight); const dw = v.videoWidth * s, dh = v.videoHeight * s; ctx.drawImage(v, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); }
  async function finalizeRec() {
    const blob = new Blob(state.recChunks, { type: state.recMime || 'video/webm' });
    if (state.audioCtx) { try { state.audioCtx.close(); } catch {} state.audioCtx = null; }
    const dur = state.recStart ? Math.round((Date.now() - state.recStart) / 1000) : 0;
    if (!state.token || !blob.size) return;
    try {
      const res = await fetch('/api/recording?' + new URLSearchParams({ code: state.code, dur: String(dur), ext: state.recExt }), { method: 'POST', headers: { 'Content-Type': state.recMime || 'video/webm', 'Authorization': 'Bearer ' + state.token }, body: blob });
      sysMsg(res.ok ? 'Aufnahme verschlüsselt gespeichert.' : 'Aufnahme konnte nicht gespeichert werden (HTTP ' + res.status + ').');
    } catch { sysMsg('Aufnahme konnte nicht übertragen werden.'); }
  }

  // ================= VERLASSEN (Prüfer -> Warteraum) =================
  $('leaveBtn').addEventListener('click', leaveRoom);
  function leaveRoom() {
    if (state.recorder && state.recorder.state === 'recording') stopRec();
    try { if (state.ws) state.ws.close(); } catch {} state.ws = null; resetPeer();
    if (state.localStream) { state.localStream.getTracks().forEach((t) => { try { t.stop(); } catch {} }); state.localStream = null; }
    resetForNext(); $('room').classList.remove('active'); openWaiting();
  }
  function resetForNext() {
    state.docs = []; state.snaps = []; state.pendingDocs = []; state.recChunks = [];
    ['hostShots', 'snapShots', 'guestShots'].forEach((id) => $(id).innerHTML = '');
    ['vName', 'vDocNumber', 'vDocType'].forEach((id) => $(id).value = '');
    checkBoxes().forEach((c) => c.checked = false); $('approveBtn').disabled = true; $('rejectBtn').disabled = false;
    $('reviewStatus').className = 'status pending'; $('reviewStatus').textContent = 'Warte auf die Bilder des Bewerbers …';
    $('okBadge').classList.remove('on'); chatLog.innerHTML = '';
    remoteVideo.srcObject = null; remoteWaiting.style.display = ''; remoteWaiting.textContent = 'Warte auf Gegenüber …';
  }

  function backToStart(errText) {
    try { if (state.ws) state.ws.close(); } catch {} state.ws = null; resetPeer();
    if (state.localStream) { state.localStream.getTracks().forEach((t) => { try { t.stop(); } catch {} }); state.localStream = null; }
    $('room').classList.remove('active'); $('waitingView').style.display = 'none'; $('lobby').style.display = '';
    $('lobbyErr').textContent = errText || ''; resetEnter();
  }
})();
