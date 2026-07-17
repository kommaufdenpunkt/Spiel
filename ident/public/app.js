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

    // Bewerber -> erst Willkommen/Ablauf zeigen; Kamera startet erst bei "Bereit".
    state.role = 'guest'; state.code = code; state.name = 'Bewerber';
    state.profile = { bigoName: $('bigoInput').value.trim().slice(0, 80), age: $('ageInput').value.trim().slice(0, 10) };
    resetEnter();
    $('lobby').style.display = 'none';
    loadIntro();
    $('onboarding').style.display = '';
  }
  async function loadIntro() { try { const r = await api('GET', '/api/intro'); if (r.status === 200 && $('introText')) $('introText').textContent = r.body.intro || ''; } catch {} }
  if ($('readyBtn')) $('readyBtn').addEventListener('click', async () => {
    const b = $('readyBtn'); b.disabled = true; b.textContent = 'Kamera wird gestartet …';
    if (!(await startCamera())) { b.disabled = false; b.textContent = 'Bereit – in den Warteraum'; toast('Kein Zugriff auf Kamera/Mikrofon. Bitte erlauben.'); return; }
    localTag.textContent = 'Du'; $('onboarding').style.display = 'none';
    b.disabled = false; b.textContent = 'Bereit – in den Warteraum';
    startRoom();
  });
  if ($('backToStart')) $('backToStart').addEventListener('click', () => { $('onboarding').style.display = 'none'; $('lobby').style.display = ''; });
  // Textfelder mit "grow" wachsen mit dem Inhalt (Zeilenumbrüche).
  function autoGrow(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 280) + 'px'; }
  document.querySelectorAll('textarea.grow').forEach((t) => { t.addEventListener('input', () => autoGrow(t)); });
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
      state.localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      // Hinweise an den Encoder: flüssiges Video (Gespräch) + klare Sprache.
      state.localStream.getVideoTracks().forEach((t) => { try { t.contentHint = 'motion'; } catch {} });
      state.localStream.getAudioTracks().forEach((t) => { try { t.contentHint = 'speech'; } catch {} });
      localVideo.srcObject = state.localStream; return true;
    } catch { return false; }
  }
  // Hebt automatisch die Qualitäts-Obergrenze an (Bild schärfer bei guter Leitung,
  // klarer Ton). Bei schlechtem Netz regelt WebRTC selbst wieder herunter.
  async function tuneQuality(pc) {
    for (const sender of pc.getSenders()) {
      if (!sender.track) continue;
      try {
        const p = sender.getParameters();
        if (!p.encodings || !p.encodings.length) p.encodings = [{}];
        if (sender.track.kind === 'video') { p.encodings[0].maxBitrate = 2500000; p.degradationPreference = 'balanced'; }
        else if (sender.track.kind === 'audio') { p.encodings[0].maxBitrate = 64000; }
        await sender.setParameters(p);
      } catch (e) { /* nicht kritisch */ }
    }
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
      const b = document.createElement('button');
      if (w.busy) { b.className = 'good'; b.textContent = '➕ Beitreten'; b.addEventListener('click', () => joinRoom(w.code, true)); }
      else { b.className = 'primary'; b.textContent = '📞 Abholen'; b.addEventListener('click', () => joinRoom(w.code, false)); }
      div.appendChild(b); el.appendChild(div);
    });
  }
  async function joinRoom(code, alreadyRunning) {
    if (!alreadyRunning) {
      const claim = await api('POST', '/api/waiting/claim', { code });
      if (claim.status !== 200) { toast(claim.body && claim.body.by ? 'Wird gerade von ' + claim.body.by + ' übernommen.' : 'Bewerber nicht mehr verfügbar.'); refreshWaiting(); return; }
    }
    clearInterval(state.waitingTimer); state.waitingTimer = 0;
    if (!(await startCamera())) { if (!alreadyRunning) api('POST', '/api/waiting/release', { code }); openWaiting(); toast('Kein Zugriff auf Kamera/Mikrofon.'); return; }
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

  // ================= PASSKEY (Face ID / Fingerabdruck, WebAuthn) =================
  const b64urlToBuf = (s) => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
  const bufToB64url = (buf) => { const u = new Uint8Array(buf); let s = ''; for (const x of u) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const passkeySupported = !!(window.PublicKeyCredential && navigator.credentials);
  if (passkeySupported) {
    if ($('passkeyLoginBtn')) $('passkeyLoginBtn').style.display = '';
    if ($('setupPasskeyBtn')) $('setupPasskeyBtn').style.display = '';
  }
  async function registerPasskey() {
    if (!passkeySupported) { toast('Dieses Gerät unterstützt keine Passkeys.'); return; }
    const o = await api('POST', '/api/passkey/register/options', {});
    if (o.status !== 200) { toast('Einrichtung nicht möglich.'); return; }
    const opt = o.body;
    opt.challenge = b64urlToBuf(opt.challenge);
    opt.user.id = b64urlToBuf(opt.user.id);
    (opt.excludeCredentials || []).forEach((c) => { c.id = b64urlToBuf(c.id); });
    let cred;
    try { cred = await navigator.credentials.create({ publicKey: opt }); } catch (e) { toast('Abgebrochen.'); return; }
    const payload = {
      id: cred.id, rawId: bufToB64url(cred.rawId), type: cred.type,
      response: { attestationObject: bufToB64url(cred.response.attestationObject), clientDataJSON: bufToB64url(cred.response.clientDataJSON) },
      clientExtensionResults: cred.getClientExtensionResults(),
    };
    const v = await api('POST', '/api/passkey/register/verify', payload);
    toast(v.status === 200 ? 'Face ID / Fingerabdruck aktiviert ✓' : 'Einrichtung fehlgeschlagen.');
  }
  async function loginWithPasskey() {
    if (!passkeySupported) { $('lobbyErr').textContent = 'Dieses Gerät unterstützt keine Passkeys.'; return; }
    const username = $('userInput').value.trim();
    if (!username) { $('lobbyErr').textContent = 'Bitte zuerst den Benutzernamen eingeben.'; return; }
    $('lobbyErr').textContent = '';
    const o = await api('POST', '/api/passkey/login/options', { username });
    if (o.status !== 200) { $('lobbyErr').textContent = o.body && o.body.reason === 'no-passkey' ? 'Für diesen Benutzer ist noch kein Face ID / Fingerabdruck eingerichtet.' : 'Passkey-Login nicht möglich.'; return; }
    const opt = o.body;
    opt.challenge = b64urlToBuf(opt.challenge);
    (opt.allowCredentials || []).forEach((c) => { c.id = b64urlToBuf(c.id); });
    let cred;
    try { cred = await navigator.credentials.get({ publicKey: opt }); } catch (e) { return; }
    const response = {
      id: cred.id, rawId: bufToB64url(cred.rawId), type: cred.type,
      response: { authenticatorData: bufToB64url(cred.response.authenticatorData), clientDataJSON: bufToB64url(cred.response.clientDataJSON), signature: bufToB64url(cred.response.signature), userHandle: cred.response.userHandle ? bufToB64url(cred.response.userHandle) : undefined },
      clientExtensionResults: cred.getClientExtensionResults(),
    };
    const r = await api('POST', '/api/passkey/login/verify', { username, response });
    if (r.status !== 200 || !r.body.token) { $('lobbyErr').textContent = 'Anmeldung fehlgeschlagen.'; return; }
    state.token = r.body.token; state.name = r.body.name; state.isAdmin = r.body.role === 'admin'; state.mustChange = !!r.body.mustChange;
    if (state.mustChange) { const ok = await forcePwChange(); if (!ok) return; }
    openWaiting();
  }
  if ($('passkeyLoginBtn')) $('passkeyLoginBtn').addEventListener('click', loginWithPasskey);
  if ($('setupPasskeyBtn')) $('setupPasskeyBtn').addEventListener('click', registerPasskey);

  // ================= TELEPROMPTER (Bewerber liest den Audition-Text ab) =================
  let prompterTimer = null;
  async function loadScript() { try { const r = await api('GET', '/api/script'); if (r.status === 200 && $('prompterText')) $('prompterText').textContent = r.body.script || ''; } catch {} }
  function prompterStop() { if (prompterTimer) clearInterval(prompterTimer); prompterTimer = null; if ($('prompterToggle')) $('prompterToggle').textContent = '▶ Start'; }
  function prompterStart() {
    if (prompterTimer || !$('prompterBox')) return;
    $('prompterToggle').textContent = '⏸ Pause';
    prompterTimer = setInterval(() => {
      const box = $('prompterBox'); const speed = parseInt($('prompterSpeed').value, 10) || 4;
      box.scrollTop += Math.max(1, speed * 0.6);
      if (box.scrollTop + box.clientHeight >= box.scrollHeight - 1) prompterStop();
    }, 40);
  }
  if ($('prompterToggle')) $('prompterToggle').addEventListener('click', () => (prompterTimer ? prompterStop() : prompterStart()));
  if ($('prompterReset')) $('prompterReset').addEventListener('click', () => { prompterStop(); $('prompterBox').scrollTop = 0; });
  loadScript();

  // ================= RAUM / WebRTC =================
  function startRoom() {
    state.caseDone = false;
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
    state.peers = new Map(); state.mainPeerId = null; state.myUploads = state.myUploads || [];
    $('vextras').innerHTML = '';
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}`); state.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: 'join', room: state.code, role: state.role, token: state.token || '', name: state.name }));
    ws.onmessage = async (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      switch (m.type) {
        case 'joined':
          state.role = m.role; state.selfId = m.peerId; setupRoleUI();
          (m.peers || []).forEach((p) => ensurePeer(p.peerId, p.role, p.name, false));
          if ((m.peers || []).length) $('bannerText').textContent = 'Verbunden.';
          break;
        case 'peer-joined': $('bannerText').textContent = 'Verbunden.'; ensurePeer(m.peerId, m.role, m.name, true); break;
        case 'signal': await handleSignal(m.from, m.data); break;
        case 'peer-left': removePeer(m.peerId); break;
        case 'error':
          if (m.reason === 'room-full') toast('Der Raum ist bereits voll.');
          else if (m.reason === 'auth') backToStart('Anmeldung abgelaufen – bitte neu anmelden.');
          else if (m.reason === 'bad-code') backToStart('Ungültige oder bereits benutzte Zugangsnummer.');
          break;
      }
    };
    ws.onclose = () => sysMsg('Verbindung zum Server getrennt.');
  }
  function sig(to, data) { if (state.ws && state.ws.readyState === WebSocket.OPEN) state.ws.send(JSON.stringify({ type: 'signal', to, data })); }
  function isMainRole(role) { return state.role === 'host' ? role === 'guest' : role === 'host'; }

  function ensurePeer(peerId, role, name, initiator) {
    if (state.peers.has(peerId)) return state.peers.get(peerId);
    const pc = new RTCPeerConnection({ iceServers: state.iceServers || FALLBACK_ICE });
    const P = { pc, dc: null, makingOffer: false, ignoreOffer: false, polite: !initiator, initiator, role, name, stream: null, isMain: false };
    state.peers.set(peerId, P);
    if (state.localStream) state.localStream.getTracks().forEach((t) => pc.addTrack(t, state.localStream));
    tuneQuality(pc);
    pc.onnegotiationneeded = async () => { if (!P.initiator) return; try { P.makingOffer = true; await pc.setLocalDescription(); sig(peerId, { description: pc.localDescription }); } catch {} finally { P.makingOffer = false; } };
    pc.onicecandidate = ({ candidate }) => { if (candidate) sig(peerId, { candidate }); };
    pc.ontrack = ({ streams }) => attachStream(peerId, streams[0]);
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'connected') tuneQuality(pc); };
    if (initiator) setupDataChannel(peerId, pc.createDataChannel('app'));
    else pc.ondatachannel = (e) => setupDataChannel(peerId, e.channel);
    return P;
  }
  function attachStream(peerId, stream) {
    const P = state.peers.get(peerId); if (!P) return; P.stream = stream;
    if (state.mainPeerId === peerId) { remoteVideo.srcObject = stream; return; } // ist bereits das Hauptbild (2. Track)
    if (!state.mainPeerId && isMainRole(P.role)) {
      state.mainPeerId = peerId; P.isMain = true;
      remoteVideo.srcObject = stream; remoteWaiting.style.display = 'none';
      remoteTag.textContent = P.role === 'guest' ? 'Bewerber' : (P.name || 'Prüfer');
      if (state.role === 'guest') toast('🎬 Es geht los – der Prüfer ist jetzt da!');
    } else { addTile(peerId, P.name || (P.role === 'host' ? 'Prüfer' : 'Bewerber'), stream); }
  }
  function addTile(peerId, name, stream) {
    let t = document.querySelector('.vextra[data-peer="' + peerId + '"]');
    if (!t) { t = document.createElement('div'); t.className = 'vextra'; t.setAttribute('data-peer', peerId); t.innerHTML = '<video autoplay playsinline></video><span class="etag"></span>'; $('vextras').appendChild(t); }
    t.querySelector('video').srcObject = stream; t.querySelector('.etag').textContent = name;
  }
  function removeTile(peerId) { const t = document.querySelector('.vextra[data-peer="' + peerId + '"]'); if (t) t.remove(); }
  function removePeer(peerId) {
    const P = state.peers.get(peerId); if (P) { try { P.pc.close(); } catch {} }
    state.peers.delete(peerId); removeTile(peerId);
    if (state.mainPeerId === peerId) {
      state.mainPeerId = null; remoteVideo.srcObject = null;
      for (const [pid, pp] of state.peers) { if (pp.stream && isMainRole(pp.role)) { removeTile(pid); attachStream(pid, pp.stream); break; } }
      if (!state.mainPeerId) { remoteWaiting.style.display = ''; remoteWaiting.textContent = 'Warte auf Teilnehmer …'; }
    }
  }
  function closeAllPeers() { if (state.peers) state.peers.forEach((P) => { try { P.pc.close(); } catch {} }); state.peers = new Map(); state.mainPeerId = null; if ($('vextras')) $('vextras').innerHTML = ''; }
  async function handleSignal(from, data) {
    const P = state.peers.get(from); if (!P) return; const pc = P.pc;
    try {
      if (data.description) {
        const collision = data.description.type === 'offer' && (P.makingOffer || pc.signalingState !== 'stable');
        P.ignoreOffer = !P.polite && collision;
        if (P.ignoreOffer) return;
        await pc.setRemoteDescription(data.description);
        if (data.description.type === 'offer') { await pc.setLocalDescription(); sig(from, { description: pc.localDescription }); }
      } else if (data.candidate) { try { await pc.addIceCandidate(data.candidate); } catch {} }
    } catch (e) { /* Perfect Negotiation regelt Kollisionen */ }
  }

  // ---- Datenkanäle je Peer (Chat + Bild-Übertragung + Ergebnis) ----
  const incoming = {}; // key peerId:id -> {label, n, parts}
  function setupDataChannel(peerId, dc) {
    const P = state.peers.get(peerId); if (P) P.dc = dc;
    dc.onopen = () => {
      if (state.role === 'guest') {
        if (state.profile) dcSendTo(dc, { kind: 'profile', bigoName: state.profile.bigoName, age: state.profile.age });
        (state.myUploads || []).forEach((d) => sendDocTo(dc, d.label, d.dataUrl)); // auch später dazugekommene Prüfer bekommen die Bilder
        $('guideStatus').textContent = 'Verbunden mit dem Prüfer. Bitte lade die Bilder hoch.';
      }
    };
    dc.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      const key = peerId + ':' + m.id;
      if (m.kind === 'chat') addChat(m.text, false);
      else if (m.kind === 'doc-start') incoming[key] = { label: m.label, n: m.n, parts: [] };
      else if (m.kind === 'doc-part') { const it = incoming[key]; if (!it) return; it.parts[m.i] = m.part; if (it.parts.filter(Boolean).length === it.n) { onDocReceived(it.label, it.parts.join('')); delete incoming[key]; } }
      else if (m.kind === 'result') onResult(m.result);
      else if (m.kind === 'profile') { if (m.bigoName && !$('vBigoName').value) $('vBigoName').value = m.bigoName; if (m.age && !$('vAge').value) $('vAge').value = m.age; }
    };
  }
  function dcSendTo(dc, obj) { if (dc && dc.readyState === 'open') { dc.send(JSON.stringify(obj)); return true; } return false; }
  function dcBroadcast(obj) { let any = false; if (state.peers) state.peers.forEach((P) => { if (dcSendTo(P.dc, obj)) any = true; }); return any; }
  function sendDocTo(dc, label, dataUrl) { const id = Math.random().toString(36).slice(2); const size = 15000; const n = Math.ceil(dataUrl.length / size); if (!dcSendTo(dc, { kind: 'doc-start', id, label, n })) return; for (let i = 0; i < n; i++) dcSendTo(dc, { kind: 'doc-part', id, i, part: dataUrl.slice(i * size, (i + 1) * size) }); }
  function sendDocAll(label, dataUrl) { if (state.peers) state.peers.forEach((P) => { if (P.dc && P.dc.readyState === 'open') sendDocTo(P.dc, label, dataUrl); }); }

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
    state.myUploads = state.myUploads || []; state.myUploads.push({ label: state.uploadTarget, dataUrl });
    sendDocAll(state.uploadTarget, dataUrl);
    const anyOpen = state.peers && [...state.peers.values()].some((P) => P.dc && P.dc.readyState === 'open');
    if (!anyOpen) toast('Bild gespeichert – wird gesendet, sobald ein Prüfer verbunden ist.');
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
  $('checklist').addEventListener('change', () => { $('approveBtn').disabled = state.caseDone || !checkBoxes().every((c) => c.checked); });

  $('approveBtn').addEventListener('click', () => saveCase('approved'));
  $('rejectBtn').addEventListener('click', () => {
    const reason = prompt('Grund der Ablehnung (optional):', ''); if (reason === null) return;
    saveCase('rejected', reason);
  });
  async function saveCase(result, rejectReason) {
    const body = {
      code: state.code, bigoName: $('vBigoName').value, age: $('vAge').value,
      verifiedName: $('vName').value, docNumber: $('vDocNumber').value, docType: $('vDocType').value,
      note: $('vNote').value,
      result, rejectReason: rejectReason || '', agentName: state.name,
      checklist: checkBoxes().map((c) => ({ label: c.parentElement.textContent.trim(), checked: c.checked })),
      docs: state.docs.concat(state.snaps).map((d) => ({ label: d.label, dataUrl: d.dataUrl })),
    };
    if (state.caseDone) return; // im Gruppengespräch bereits abgeschlossen
    $('approveBtn').disabled = true; $('rejectBtn').disabled = true;
    const r = await api('POST', '/api/case', body);
    if (r.status === 200) {
      state.caseDone = true;
      dcBroadcast({ kind: 'result', result }); // Bewerber + andere Prüfer informieren
      $('reviewStatus').className = 'status ' + (result === 'approved' ? 'ok' : 'bad');
      $('reviewStatus').textContent = result === 'approved' ? '✓ Freigegeben – Akte angelegt.' : '✖ Abgelehnt – Akte angelegt.';
      toast(result === 'approved' ? 'Freigegeben ✓' : 'Abgelehnt');
    } else if (r.body && r.body.reason === 'bad-code') {
      state.caseDone = true; // ein anderer Prüfer war schneller
      $('reviewStatus').className = 'status ok'; $('reviewStatus').textContent = '✓ Wurde bereits von einem anderen Prüfer abgeschlossen.';
    } else {
      $('rejectBtn').disabled = false; $('approveBtn').disabled = !checkBoxes().every((c) => c.checked);
      toast('Speichern fehlgeschlagen. Bitte erneut versuchen.');
    }
  }
  function onResult(result) {
    if (state.role === 'host') { // anderer Prüfer hat den Fall abgeschlossen
      state.caseDone = true; $('approveBtn').disabled = true; $('rejectBtn').disabled = true;
      $('reviewStatus').className = 'status ' + (result === 'approved' ? 'ok' : 'bad');
      $('reviewStatus').textContent = result === 'approved' ? '✓ Ein Prüfer hat bereits freigegeben.' : '✖ Ein Prüfer hat bereits abgelehnt.';
      return;
    }
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
  function sendChat() { const v = $('chatInput').value.trim(); if (!v) return; if (dcBroadcast({ kind: 'chat', text: v })) { addChat(v, true); $('chatInput').value = ''; } else toast('Noch nicht verbunden.'); }
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
    // Nur ~25 fps zeichnen (spart CPU), passend zur Aufnahme-Framerate.
    let lastDraw = 0;
    const draw = (ts) => {
      if (!state.recorder) return;
      if (!lastDraw || ts - lastDraw >= 38) { lastDraw = ts; ctx.fillStyle = '#0d1526'; ctx.fillRect(0, 0, W, H); cover(ctx, remoteVideo, 0, 0, W / 2, H); cover(ctx, localVideo, W / 2, 0, W / 2, H); }
      requestAnimationFrame(draw);
    };
    const canvasStream = canvas.captureStream(25);
    // Audio beider Seiten mischen
    const ac = new (window.AudioContext || window.webkitAudioContext)(); state.audioCtx = ac; const dest = ac.createMediaStreamDestination();
    const audioStreams = [state.localStream]; if (state.peers) state.peers.forEach((P) => { if (P.stream) audioStreams.push(P.stream); });
    audioStreams.forEach((s) => { if (s && s.getAudioTracks && s.getAudioTracks().length) { try { ac.createMediaStreamSource(s).connect(dest); } catch {} } });
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
    try { if (state.ws) state.ws.close(); } catch {} state.ws = null; closeAllPeers();
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
    try { if (state.ws) state.ws.close(); } catch {} state.ws = null; closeAllPeers();
    if (state.localStream) { state.localStream.getTracks().forEach((t) => { try { t.stop(); } catch {} }); state.localStream = null; }
    $('room').classList.remove('active'); $('waitingView').style.display = 'none'; $('lobby').style.display = '';
    $('lobbyErr').textContent = errText || ''; resetEnter();
  }
})();
