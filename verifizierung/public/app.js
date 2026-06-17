/*
 * Verifizierungs-Video-Raum — Client
 * ----------------------------------
 * Läuft im Browser. Zwei Rollen:
 *   - "host"  = du (Moderator): steuerst die Fragen und nimmst das Video auf.
 *   - "guest" = der Bewerber: tritt über den Link bei und sieht die Fragen.
 *
 * Ablauf grob:
 *   Lobby -> Kamera/Mikro holen -> über WebSocket dem Raum beitreten ->
 *   WebRTC-Verbindung Browser↔Browser aufbauen -> Gespräch -> Aufnahme ->
 *   "Beenden" lädt das fertige Video herunter.
 */

(() => {
  'use strict';

  // ---- ICE-Server --------------------------------------------------------
  // Werden zur Laufzeit vom Server (/ice) geholt: STUN + ggf. TURN mit
  // zeitlich begrenzten Zugangsdaten. Fällt auf öffentliches STUN zurück,
  // falls der Abruf fehlschlägt.
  const FALLBACK_ICE = [{ urls: 'stun:stun.l.google.com:19302' }];

  async function loadIceServers() {
    try {
      const r = await fetch('ice', { cache: 'no-store' });
      const j = await r.json();
      if (j && Array.isArray(j.iceServers) && j.iceServers.length) return j.iceServers;
    } catch { /* ignorieren */ }
    return FALLBACK_ICE;
  }

  // ---- DOM-Kürzel --------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const lobby = $('lobby'), room = $('room');
  const localVideo = $('localVideo'), remoteVideo = $('remoteVideo');
  const remoteWaiting = $('remoteWaiting'), remoteTag = $('remoteTag'), localTag = $('localTag');
  const qBannerText = $('qBannerText'), qList = $('qList'), qNav = $('qNav');
  const chatLog = $('chatLog');
  const recBadge = $('recBadge'), recTime = $('recTime');

  const FRAGEN = window.VERIFIZIERUNGS_FRAGEN || [];
  const TITEL = window.VERIFIZIERUNGS_TITEL || 'Verifizierung';

  // ---- Zustand -----------------------------------------------------------
  const state = {
    role: 'host',
    name: '',
    roomCode: '',
    ws: null,
    pc: null,
    dc: null,            // Datenkanal (Chat + Fragen-Sync)
    inviteLink: '',
    iceServers: null,
    // Perfect-Negotiation-Zustand
    polite: false,
    makingOffer: false,
    ignoreOffer: false,
    localStream: null,
    remoteStream: null,
    currentQ: -1,
    // Aufnahme
    recorder: null,
    chunks: [],
    recStream: null,
    audioCtx: null,
    rafId: 0,
    recStart: 0,
    recTimer: 0,
    recMime: '',
    recExt: 'webm',
    // Verifizierung
    verified: false,
    snapshots: [],       // [{label, url, filename}]
    pendingPhotos: [],   // vom Bewerber hochgeladene Fotos, die noch gesendet werden
    modPassword: '',
  };

  // =======================================================================
  //  LOBBY
  // =======================================================================
  let pickedRole = 'host';

  // Wenn die Seite mit ?raum=CODE geöffnet wird, ist man Bewerber.
  const params = new URLSearchParams(location.search);
  const urlRoom = (params.get('raum') || params.get('room') || '').toUpperCase();
  if (urlRoom) {
    pickedRole = 'guest';
    $('roomInput').value = urlRoom;
  }
  setRoleUI(pickedRole);

  $('rolePick').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-role]');
    if (!btn) return;
    pickedRole = btn.dataset.role;
    setRoleUI(pickedRole);
  });

  function setRoleUI(role) {
    document.querySelectorAll('#rolePick button').forEach((b) =>
      b.classList.toggle('sel', b.dataset.role === role));
    if (role === 'host') {
      $('lobbyTitle').textContent = 'Video-Verifizierung starten';
      $('lobbySub').textContent = 'Erstelle einen Raum und schicke dem Bewerber den Beitritts-Link.';
      $('roomInput').placeholder = 'leer lassen = neuer Raum';
      $('passField').style.display = '';   // Moderator braucht Passwort
    } else {
      $('lobbyTitle').textContent = 'Verifizierung beitreten';
      $('lobbySub').textContent = 'Gib deinen Namen ein und tritt dem Raum bei.';
      $('roomInput').placeholder = 'Raum-Code vom Moderator';
      $('passField').style.display = 'none';
    }
  }

  function genRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  $('enterBtn').addEventListener('click', enterRoom);

  async function enterRoom() {
    const name = $('nameInput').value.trim();
    let code = $('roomInput').value.trim().toUpperCase();
    $('lobbyErr').textContent = '';

    if (!name) { $('lobbyErr').textContent = 'Bitte gib deinen Namen ein.'; return; }
    if (pickedRole === 'guest' && !code) {
      $('lobbyErr').textContent = 'Bitte gib den Raum-Code ein, den du erhalten hast.';
      return;
    }
    const modPassword = $('passInput').value;
    if (pickedRole === 'host' && !modPassword) {
      $('lobbyErr').textContent = 'Bitte gib das Moderator-Passwort ein.';
      return;
    }
    if (pickedRole === 'host' && !code) code = genRoomCode();

    $('enterBtn').disabled = true;
    $('enterBtn').textContent = 'Kamera wird gestartet …';

    try {
      state.localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (err) {
      $('enterBtn').disabled = false;
      $('enterBtn').textContent = 'Raum betreten';
      $('lobbyErr').textContent = 'Kein Zugriff auf Kamera/Mikrofon. Bitte im Browser erlauben.';
      return;
    }

    state.role = pickedRole;
    state.name = name;
    state.roomCode = code;
    state.modPassword = modPassword;
    localVideo.srcObject = state.localStream;
    localTag.textContent = name + ' (Du)';

    startRoom();
  }

  // Zurück zum Startbildschirm (z. B. bei falschem Moderator-Passwort).
  function backToLobby(errText) {
    try { if (state.ws) state.ws.close(); } catch {}
    state.ws = null;
    if (state.localStream) {
      state.localStream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
      state.localStream = null;
    }
    room.classList.remove('active');
    lobby.style.display = '';
    $('enterBtn').disabled = false;
    $('enterBtn').textContent = 'Raum betreten';
    $('lobbyErr').textContent = errText || '';
    $('passInput').value = '';
  }

  // =======================================================================
  //  RAUM
  // =======================================================================
  async function startRoom() {
    lobby.style.display = 'none';
    room.classList.add('active');
    setupRoleUI();
    renderQuestions();
    state.iceServers = await loadIceServers();
    connectSignaling();

    // Moderator: Beitritts-Link + fertige Einladung anbieten.
    if (state.role === 'host') {
      state.inviteLink = `${location.origin}${location.pathname}?raum=${state.roomCode}`;
      sysMsg(`Raum-Code: ${state.roomCode}`);
      sysMsg('Beitritts-Link: ' + state.inviteLink);
      copyInvitation();
    } else {
      sysMsg('Du bist dem Raum beigetreten. Warte auf den Moderator …');
    }
  }

  function setupRoleUI() {
    const isHost = state.role === 'host';
    // Aufnahme-Steuerung + Einladung nur beim Moderator.
    $('recBtn').style.display = isHost ? '' : 'none';
    $('stopBtn').style.display = isHost ? '' : 'none';
    $('inviteBtn').style.display = isHost ? '' : 'none';
    // Fragen-Navigation nur beim Moderator; Gast sieht die Fragen nur.
    qNav.style.display = isHost ? '' : 'none';
    if (!isHost) $('tabFragen').textContent = 'Aktuelle Frage';
    // Ausweis-Tab: Moderator prüft, Bewerber lädt hoch.
    $('verifyHost').style.display = isHost ? '' : 'none';
    $('verifyGuest').style.display = isHost ? 'none' : '';
  }

  // ---- WebSocket-Signalisierung -----------------------------------------
  function connectSignaling() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}`);
    state.ws = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'join', room: state.roomCode, role: state.role, name: state.name,
        password: state.modPassword || '',
      }));
    };

    ws.onmessage = async (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }

      switch (msg.type) {
        case 'joined':
          // Server kann uns eine andere Rolle zuweisen (z. B. Raum hatte schon Host).
          state.role = msg.role;
          setupRoleUI();
          break;
        case 'error':
          if (msg.reason === 'room-full') toast('Der Raum ist bereits voll (2 Personen).');
          else if (msg.reason === 'bad-password') backToLobby('Falsches Moderator-Passwort.');
          else if (msg.reason === 'mod-not-configured') backToLobby('Moderator-Zugang ist serverseitig noch nicht eingerichtet.');
          break;
        case 'peer-ready':
          remoteTag.textContent = msg.peerName || 'Gegenüber';
          // Beide Seiten richten die Verbindung ein; die Aushandlung läuft
          // dann automatisch über onnegotiationneeded.
          createPeer();
          break;
        case 'signal':
          await handleSignal(msg.data);
          break;
        case 'peer-left':
          remoteVideo.srcObject = null;
          remoteWaiting.style.display = '';
          remoteWaiting.textContent = 'Gegenüber hat den Raum verlassen.';
          sysMsg('Gegenüber hat den Raum verlassen.');
          // Alte Verbindung sauber schließen, damit ein erneuter Beitritt
          // (z. B. nach Verbindungsabbruch der Bewerberin) frisch aufbaut.
          resetPeer();
          break;
      }
    };

    ws.onclose = () => sysMsg('Verbindung zum Server getrennt.');
  }

  function signal(data) {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({ type: 'signal', data }));
    }
  }

  // ---- WebRTC ("Perfect Negotiation") ------------------------------------
  // Beide Seiten dürfen die Verbindung aushandeln; bei Kollisionen gibt die
  // "höfliche" Seite (der Gast) nach. Das macht den Aufbau robust und erlaubt
  // automatische Neu-Aushandlung / ICE-Neustart bei kurzen Störungen.

  // Verbindung vollständig zurücksetzen (z. B. wenn das Gegenüber geht).
  function resetPeer() {
    if (state.pc) { try { state.pc.close(); } catch {} }
    state.pc = null;
    state.dc = null;
    state.remoteStream = null;
    state.makingOffer = false;
    state.ignoreOffer = false;
  }

  function createPeer() {
    if (state.pc) return state.pc;
    state.polite = (state.role === 'guest');
    const pc = new RTCPeerConnection({ iceServers: state.iceServers || FALLBACK_ICE });
    state.pc = pc;

    // Eigene Spuren (Kamera/Mikro) hinzufügen.
    state.localStream.getTracks().forEach((t) => pc.addTrack(t, state.localStream));

    pc.onnegotiationneeded = async () => {
      try {
        state.makingOffer = true;
        await pc.setLocalDescription();
        signal({ description: pc.localDescription });
      } catch (e) {
        console.warn('Aushandlung:', e);
      } finally {
        state.makingOffer = false;
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) signal({ candidate });
    };

    pc.ontrack = (e) => {
      state.remoteStream = e.streams[0];
      remoteVideo.srcObject = e.streams[0];
      remoteWaiting.style.display = 'none';
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') sysMsg('Verbunden ✓');
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        sysMsg('Verbindung gestört – versuche automatisch neu zu verbinden …');
        try { pc.restartIce(); } catch {}
      }
    };

    // Datenkanal: Moderator erstellt ihn, Gast empfängt ihn.
    if (state.role === 'host') {
      setupDataChannel(pc.createDataChannel('verif'));
    } else {
      pc.ondatachannel = (e) => setupDataChannel(e.channel);
    }
    return pc;
  }

  async function handleSignal(data) {
    if (!data) return;
    const pc = createPeer();
    try {
      if (data.description) {
        const offerCollision = data.description.type === 'offer' &&
          (state.makingOffer || pc.signalingState !== 'stable');
        state.ignoreOffer = !state.polite && offerCollision;
        if (state.ignoreOffer) return;
        await pc.setRemoteDescription(data.description);
        if (data.description.type === 'offer') {
          await pc.setLocalDescription();
          signal({ description: pc.localDescription });
        }
      } else if (data.candidate) {
        try { await pc.addIceCandidate(data.candidate); }
        catch (e) { if (!state.ignoreOffer) throw e; }
      }
    } catch (e) {
      console.warn('Signal:', e);
    }
  }

  // ---- Datenkanal: Chat + Fragen-Synchronisation -------------------------
  function setupDataChannel(dc) {
    state.dc = dc;
    dc.onopen = () => {
      // Beim Verbinden aktuelle Frage an den Gast schicken.
      if (state.role === 'host' && state.currentQ >= 0) sendQuestion(state.currentQ);
      // Bewerber: noch nicht gesendete Ausweis-Fotos jetzt nachschicken.
      if (state.role !== 'host' && state.pendingPhotos.length) {
        const queue = state.pendingPhotos.splice(0);
        queue.forEach((p) => sendPhoto(p.side, p.url));
      }
    };
    dc.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.kind === 'chat') chatMsg(m.text, false, m.from);
      else if (m.kind === 'question') showQuestion(m.index, m.text);
      else if (m.kind === 'verified') { if (state.role !== 'host') { setGuestVerified(); } }
      else if (m.kind === 'photo-start') incoming[m.id] = { side: m.side, total: m.total, parts: [] };
      else if (m.kind === 'photo-chunk') { const p = incoming[m.id]; if (p) p.parts[m.seq] = m.data; }
      else if (m.kind === 'photo-end') {
        const p = incoming[m.id]; if (!p) return;
        delete incoming[m.id];
        onPhotoReceived(p.side, p.parts.join(''));
      }
    };
  }

  // Hilfsfunktion: sende ein JSON-Objekt über den Datenkanal (wenn offen).
  function dcSend(obj) {
    if (state.dc && state.dc.readyState === 'open') {
      state.dc.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }

  // Eingehende (gechunkte) Fotos zwischenspeichern.
  const incoming = {};

  // =======================================================================
  //  FRAGEN
  // =======================================================================
  function renderQuestions() {
    qList.innerHTML = '';
    FRAGEN.forEach((q, i) => {
      const div = document.createElement('div');
      div.className = 'qitem';
      div.dataset.i = i;
      div.innerHTML = `<span class="num">${i + 1}.</span>${escapeHtml(q)}`;
      if (state.role === 'host') {
        div.addEventListener('click', () => gotoQuestion(i));
      }
      qList.appendChild(div);
    });
  }

  function gotoQuestion(i) {
    if (i < 0 || i >= FRAGEN.length) return;
    state.currentQ = i;
    showQuestion(i, FRAGEN[i]);
    sendQuestion(i);
  }

  function sendQuestion(i) {
    if (state.dc && state.dc.readyState === 'open') {
      state.dc.send(JSON.stringify({ kind: 'question', index: i, text: FRAGEN[i] }));
    }
  }

  // Zeigt eine Frage im Banner + markiert sie in der Liste (beide Rollen).
  function showQuestion(i, text) {
    state.currentQ = i;
    qBannerText.textContent = text || '—';
    document.querySelectorAll('.qitem').forEach((el) => {
      const idx = Number(el.dataset.i);
      el.classList.toggle('current', idx === i);
      el.classList.toggle('done', idx < i);
    });
    const cur = qList.querySelector('.qitem.current');
    if (cur) cur.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  $('nextQ').addEventListener('click', () => gotoQuestion(Math.min(state.currentQ + 1, FRAGEN.length - 1)));
  $('prevQ').addEventListener('click', () => gotoQuestion(Math.max(state.currentQ - 1, 0)));

  // =======================================================================
  //  TABS
  // =======================================================================
  document.querySelector('.tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('sel', b === btn));
    document.querySelectorAll('.tabpane').forEach((p) => p.classList.toggle('sel', p.dataset.pane === tab));
  });

  // =======================================================================
  //  CHAT
  // =======================================================================
  function sendChat() {
    const inp = $('chatInput');
    const text = inp.value.trim();
    if (!text) return;
    if (state.dc && state.dc.readyState === 'open') {
      state.dc.send(JSON.stringify({ kind: 'chat', text, from: state.name }));
      chatMsg(text, true, state.name);
      inp.value = '';
    } else {
      toast('Noch nicht verbunden – Chat bald verfügbar.');
    }
  }
  $('chatSend').addEventListener('click', sendChat);
  $('chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

  function chatMsg(text, isMe, from) {
    const div = document.createElement('div');
    div.className = 'msg ' + (isMe ? 'me' : 'them');
    div.textContent = (from && !isMe ? from + ': ' : '') + text;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
  }
  function sysMsg(text) {
    const div = document.createElement('div');
    div.className = 'msg sys';
    div.textContent = text;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  // =======================================================================
  //  MEDIEN-STEUERUNG (Mikro / Kamera ein-aus)
  // =======================================================================
  $('micBtn').addEventListener('click', () => {
    const tr = state.localStream.getAudioTracks()[0];
    if (!tr) return;
    tr.enabled = !tr.enabled;
    $('micBtn').textContent = tr.enabled ? '🎤 Mikro an' : '🔇 Mikro aus';
  });
  $('camBtn').addEventListener('click', () => {
    const tr = state.localStream.getVideoTracks()[0];
    if (!tr) return;
    tr.enabled = !tr.enabled;
    $('camBtn').textContent = tr.enabled ? '📷 Kamera an' : '🚫 Kamera aus';
  });

  // Fertige Einladungs-Nachricht (inkl. Link) in die Zwischenablage kopieren.
  $('inviteBtn').addEventListener('click', copyInvitation);

  function buildInvitation() {
    const tpl = window.EINLADUNGS_TEXT || '{LINK}';
    return tpl.replace(/\{LINK\}/g, state.inviteLink);
  }

  function copyInvitation() {
    const text = buildInvitation();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => toast('Einladung kopiert – jetzt an die Bewerberin schicken'),
        () => showInvitationFallback(text)
      );
    } else {
      showInvitationFallback(text);
    }
  }

  // Falls das automatische Kopieren nicht erlaubt ist (z. B. ohne HTTPS):
  // Text im Chat anzeigen, damit man ihn manuell markieren/kopieren kann.
  function showInvitationFallback(text) {
    sysMsg('Einladung (bitte markieren & kopieren):');
    sysMsg(text);
    toast('Automatisches Kopieren blockiert – Text steht im Chat');
  }

  // =======================================================================
  //  AUSWEIS-VERIFIZIERUNG
  //  - Bewerber lädt Vorder-/Rückseite hoch (+ optional Foto Ausweis+Gesicht).
  //    Bilder gehen verkleinert & verschlüsselt direkt an den Moderator.
  //  - Moderator kann zusätzlich live Fotos aus dem Video machen, eine
  //    Checkliste abhaken, als "verifiziert" markieren und ein Protokoll laden.
  // =======================================================================

  // ---- gemeinsame Helfer ----
  function downloadDataUrl(dataUrl, filename) {
    const a = document.createElement('a');
    a.href = dataUrl; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => a.remove(), 500);
  }
  function safeApplicantName() {
    return (remoteTag.textContent || 'bewerber')
      .replace(/\(.*?\)/g, '').replace(/[^a-z0-9äöüß ]/gi, '').trim()
      .replace(/\s+/g, '_') || 'bewerber';
  }
  function stampNow() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  // Datei -> verkleinerte JPEG-DataURL (damit sie über den Datenkanal passt).
  function fileToDataUrl(file, maxDim = 1100, maxLen = 200000) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          let q = 0.85, url = c.toDataURL('image/jpeg', q);
          while (url.length > maxLen && q > 0.4) { q -= 0.1; url = c.toDataURL('image/jpeg', q); }
          resolve(url);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ---- BEWERBER: Fotos hochladen + (gechunkt) an den Moderator senden ----
  let pendingSide = '';
  function pickFile(side) { pendingSide = side; const f = $('fileInput'); f.value = ''; f.click(); }
  if ($('upFront')) $('upFront').addEventListener('click', () => pickFile('Ausweis Vorderseite'));
  if ($('upBack')) $('upBack').addEventListener('click', () => pickFile('Ausweis Rückseite'));
  if ($('upSelfie')) $('upSelfie').addEventListener('click', () => pickFile('Ausweis + Gesicht'));
  if ($('fileInput')) $('fileInput').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    let url;
    try { url = await fileToDataUrl(file); }
    catch { toast('Bild konnte nicht geladen werden.'); return; }
    addGuestShot(pendingSide, url);
    const sent = sendPhoto(pendingSide, url);
    toast(sent ? pendingSide + ' gesendet ✓'
               : pendingSide + ' gespeichert – wird gesendet, sobald der Moderator da ist');
  });

  function sendPhoto(side, dataUrl) {
    if (!state.dc || state.dc.readyState !== 'open') {
      state.pendingPhotos.push({ side, url: dataUrl });
      return false;
    }
    const id = Math.random().toString(36).slice(2);
    const CHUNK = 16000;
    const total = Math.ceil(dataUrl.length / CHUNK);
    dcSend({ kind: 'photo-start', id, side, total });
    for (let i = 0; i < total; i++) {
      dcSend({ kind: 'photo-chunk', id, seq: i, data: dataUrl.slice(i * CHUNK, (i + 1) * CHUNK) });
    }
    dcSend({ kind: 'photo-end', id });
    return true;
  }

  function addGuestShot(label, dataUrl) {
    const el = document.createElement('div');
    el.className = 'shot';
    el.innerHTML = `<img src="${dataUrl}" alt=""><div class="cap">${escapeHtml(label)} ✓</div>`;
    $('guestShots').appendChild(el);
  }

  function setGuestVerified() {
    const vs = $('verifyGuest').querySelector('.vstatus');
    if (vs) { vs.className = 'vstatus ok'; vs.textContent = '✓ Du wurdest verifiziert.'; }
    $('verifyBadge').classList.add('on');
    toast('✓ Du wurdest verifiziert.');
  }

  // ---- MODERATOR: empfangene Fotos, eigene Schnappschüsse, Prüfung ----
  function onPhotoReceived(side, dataUrl) {
    addShot(side + ' (hochgeladen)', dataUrl);
    sysMsg(`Bewerber hat „${side}" hochgeladen.`);
    toast(`„${side}" vom Bewerber erhalten`);
  }

  function addShot(label, dataUrl) {
    const filename = `verifizierung_${safeApplicantName()}_${slug(label)}_${stampNow()}.jpg`;
    state.snapshots.push({ label, url: dataUrl, filename });
    const el = document.createElement('div');
    el.className = 'shot';
    el.innerHTML =
      `<img src="${dataUrl}" alt=""><button class="dl" title="Speichern">⤓</button>` +
      `<div class="cap">${escapeHtml(label)}</div>`;
    el.querySelector('.dl').addEventListener('click', () => downloadDataUrl(dataUrl, filename));
    $('shots').appendChild(el);
  }

  function captureSnapshot(label) {
    if (!remoteVideo.videoWidth) { toast('Noch kein Bild vom Bewerber.'); return; }
    const c = document.createElement('canvas');
    c.width = remoteVideo.videoWidth; c.height = remoteVideo.videoHeight;
    c.getContext('2d').drawImage(remoteVideo, 0, 0);
    const url = c.toDataURL('image/jpeg', 0.9);
    addShot(label, url);
    downloadDataUrl(url, `verifizierung_${safeApplicantName()}_${slug(label)}_${stampNow()}.jpg`);
    toast(label + ' aufgenommen & gespeichert');
  }
  if ($('snapId')) $('snapId').addEventListener('click', () => captureSnapshot('Ausweis (Live-Foto)'));
  if ($('snapFace')) $('snapFace').addEventListener('click', () => captureSnapshot('Gesicht (Live-Foto)'));

  // Checkliste -> "Als verifiziert markieren" erst freigeben, wenn alles geprüft.
  function checkBoxes() { return Array.from(document.querySelectorAll('#checklist input[data-chk]')); }
  if ($('checklist')) $('checklist').addEventListener('change', () => {
    $('markVerified').disabled = !checkBoxes().every((c) => c.checked);
  });

  if ($('markVerified')) $('markVerified').addEventListener('click', () => {
    setVerified(true);
    dcSend({ kind: 'verified' });
    toast('Bewerber als verifiziert markiert ✓');
  });

  function setVerified(v) {
    state.verified = v;
    $('verifyBadge').classList.toggle('on', v);
    const vs = $('vstatus');
    if (vs) {
      vs.className = v ? 'vstatus ok' : 'vstatus pending';
      vs.textContent = v ? 'Status: VERIFIZIERT ✓' : 'Status: noch nicht verifiziert';
    }
  }

  if ($('downloadReport')) $('downloadReport').addEventListener('click', () => {
    const cb = checkBoxes();
    const lines = [
      'VERIFIZIERUNGS-PROTOKOLL',
      'Agentur 4ever1 · BIGO LIVE',
      '========================================',
      `Datum/Uhrzeit:   ${new Date().toLocaleString('de-DE')}`,
      `Raum-Code:       ${state.roomCode}`,
      `Moderator:       ${state.name}`,
      `Bewerber (Angabe): ${remoteTag.textContent || '-'}`,
      `Name laut Ausweis: ${$('verifiedName').value || '-'}`,
      `Ausweis-Nr.:     ${$('verifiedDoc').value || '-'}`,
      '',
      'Prüf-Checkliste:',
      ...cb.map((c) => `  [${c.checked ? 'x' : ' '}] ${c.parentElement.textContent.trim()}`),
      '',
      `Beweis-Fotos (separat gespeichert): ${state.snapshots.length}`,
      ...state.snapshots.map((s) => `  - ${s.label}: ${s.filename}`),
      '',
      `ERGEBNIS: ${state.verified ? 'VERIFIZIERT ✓' : 'NICHT verifiziert'}`,
      '',
      'Hinweis: Das Gesprächsvideo wurde separat gespeichert.',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    downloadDataUrl(url, `pruefprotokoll_${safeApplicantName()}_${stampNow()}.txt`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Prüf-Protokoll gespeichert');
  });

  // =======================================================================
  //  AUFNAHME (nur Moderator)
  //  Beide Videos werden auf eine Leinwand gezeichnet, beide Tonspuren
  //  gemischt -> EIN Video mit beiden Gesichtern, Stimmen und der jeweils
  //  eingeblendeten Frage. Ergebnis wird als Datei heruntergeladen.
  // =======================================================================
  function pickMime() {
    // MP4 bevorzugen (von BIGO gewünscht); sonst WebM als Rückfall.
    const cands = [
      ['video/mp4;codecs=h264,aac', 'mp4'],
      ['video/mp4', 'mp4'],
      ['video/webm;codecs=vp9,opus', 'webm'],
      ['video/webm;codecs=vp8,opus', 'webm'],
      ['video/webm', 'webm'],
    ];
    for (const [m, ext] of cands) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return { mime: m, ext };
    }
    return { mime: '', ext: 'webm' };
  }

  $('recBtn').addEventListener('click', startRecording);
  $('stopBtn').addEventListener('click', stopRecording);

  async function startRecording() {
    if (!window.MediaRecorder) { toast('Dein Browser unterstützt keine Aufnahme.'); return; }

    const W = 1280, H = 720;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Audio mischen (eigenes Mikro + Ton des Gegenübers).
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC();
    state.audioCtx = ac;
    const dest = ac.createMediaStreamDestination();
    try { ac.createMediaStreamSource(state.localStream).connect(dest); } catch {}
    if (state.remoteStream && state.remoteStream.getAudioTracks().length) {
      try { ac.createMediaStreamSource(state.remoteStream).connect(dest); } catch {}
    }

    // Zeichen-Schleife: zwei Videohälften + Kopf + aktuelle Frage.
    const draw = () => {
      ctx.fillStyle = '#06090d';
      ctx.fillRect(0, 0, W, H);

      const half = W / 2;
      drawCover(ctx, localVideo, 0, 60, half - 1, H - 160);
      drawCover(ctx, remoteVideo, half + 1, 60, half - 1, H - 160);

      // Kopfzeile
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(0, 0, W, 56);
      ctx.fillStyle = '#e6edf3';
      ctx.font = '600 22px -apple-system,Segoe UI,Roboto,sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(TITEL, 20, 28);
      ctx.fillStyle = '#8b949e';
      ctx.font = '18px -apple-system,Segoe UI,Roboto,sans-serif';
      const ts = new Date().toLocaleString('de-DE');
      ctx.textAlign = 'right';
      ctx.fillText(ts, W - 20, 28);
      ctx.textAlign = 'left';

      // "Verifiziert"-Badge mittig in der Kopfzeile (sobald markiert)
      if (state.verified) {
        ctx.fillStyle = '#9ae6b4';
        ctx.font = '600 18px -apple-system,Segoe UI,Roboto,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('✓ VERIFIZIERT', W / 2, 28);
        ctx.textAlign = 'left';
      }

      // Namen
      ctx.fillStyle = '#000a';
      ctx.fillRect(12, H - 150, 200, 30);
      ctx.fillRect(half + 12, H - 150, 200, 30);
      ctx.fillStyle = '#fff';
      ctx.font = '16px -apple-system,Segoe UI,Roboto,sans-serif';
      ctx.fillText(state.name + ' (Moderator)', 20, H - 135);
      ctx.fillText(remoteTag.textContent || 'Bewerber', half + 20, H - 135);

      // Frage-Banner unten
      ctx.fillStyle = '#101722';
      ctx.fillRect(0, H - 100, W, 100);
      ctx.fillStyle = '#3b82f6';
      ctx.font = '600 14px -apple-system,Segoe UI,Roboto,sans-serif';
      ctx.fillText('AKTUELLE FRAGE', 20, H - 78);
      ctx.fillStyle = '#e6edf3';
      ctx.font = '600 22px -apple-system,Segoe UI,Roboto,sans-serif';
      wrapText(ctx, qBannerText.textContent || '—', 20, H - 50, W - 40, 26, 2);

      state.rafId = requestAnimationFrame(draw);
    };
    draw();

    const canvasStream = canvas.captureStream(30);
    const recStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);
    state.recStream = recStream;

    const { mime, ext } = pickMime();
    state.recMime = mime; state.recExt = ext;
    const rec = mime ? new MediaRecorder(recStream, { mimeType: mime })
                     : new MediaRecorder(recStream);
    state.recorder = rec;
    state.chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) state.chunks.push(e.data); };
    rec.onstop = finalizeRecording;
    rec.start(1000);

    // UI
    state.recStart = Date.now();
    recBadge.classList.add('on');
    state.recTimer = setInterval(updateRecTime, 500);
    $('recBtn').disabled = true;
    $('stopBtn').disabled = false;
    sysMsg('Aufnahme gestartet.');
    toast('Aufnahme läuft');
  }

  function updateRecTime() {
    const s = Math.floor((Date.now() - state.recStart) / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    recTime.textContent = `Aufnahme ${mm}:${ss}`;
  }

  function stopRecording() {
    if (state.recorder && state.recorder.state !== 'inactive') state.recorder.stop();
    cancelAnimationFrame(state.rafId);
    clearInterval(state.recTimer);
    recBadge.classList.remove('on');
    $('stopBtn').disabled = true;
    $('recBtn').disabled = false;
  }

  function finalizeRecording() {
    const type = state.recMime || 'video/webm';
    const blob = new Blob(state.chunks, { type });
    if (state.audioCtx) { try { state.audioCtx.close(); } catch {} state.audioCtx = null; }

    const safeName = (remoteTag.textContent || 'bewerber')
      .replace(/[^a-z0-9äöüß ]/gi, '').trim().replace(/\s+/g, '_') || 'bewerber';
    const d = new Date();
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
    const filename = `verifizierung_${safeName}_${stamp}.${state.recExt}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);

    sysMsg(`Video gespeichert: ${filename}`);
    if (state.recExt !== 'mp4') {
      sysMsg('Hinweis: Dein Browser hat als WebM aufgenommen. Falls BIGO zwingend MP4 verlangt, siehe README (Umwandlung).');
      toast('Video als WebM gespeichert (siehe README für MP4)');
    } else {
      toast('Video als MP4 gespeichert');
    }
  }

  // =======================================================================
  //  HILFSFUNKTIONEN
  // =======================================================================
  function drawCover(ctx, video, x, y, w, h) {
    if (!video || !video.videoWidth) {
      ctx.fillStyle = '#0b0f14';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#8b949e';
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('(kein Bild)', x + w / 2, y + h / 2);
      ctx.textAlign = 'left';
      return;
    }
    const vr = video.videoWidth / video.videoHeight;
    const tr = w / h;
    let sx, sy, sw, sh;
    if (vr > tr) { sh = video.videoHeight; sw = sh * tr; sx = (video.videoWidth - sw) / 2; sy = 0; }
    else { sw = video.videoWidth; sh = sw / tr; sx = 0; sy = (video.videoHeight - sh) / 2; }
    ctx.drawImage(video, sx, sy, sw, sh, x, y, w, h);
  }

  // Bricht Text auf maxW um und zeigt höchstens maxLines Zeilen; bei zu
  // langem Text wird die letzte Zeile mit "…" gekürzt (damit nichts unten
  // aus dem Videobild läuft).
  function wrapText(ctx, text, x, y, maxW, lineH, maxLines = 2) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const all = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        all.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) all.push(line);

    let lines = all;
    if (all.length > maxLines) {
      lines = all.slice(0, maxLines);
      let last = lines[maxLines - 1];
      while (last && ctx.measureText(last + ' …').width > maxW) {
        last = last.slice(0, -1).trimEnd();
      }
      lines[maxLines - 1] = last + ' …';
    }
    lines.forEach((ln, idx) => ctx.fillText(ln, x, y + idx * lineH));
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  let toastTimer = 0;
  function toast(text) {
    const t = $('toast');
    t.textContent = text; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
  }

  // Vor dem Schließen warnen, falls noch aufgenommen wird.
  window.addEventListener('beforeunload', (e) => {
    if (state.recorder && state.recorder.state === 'recording') {
      e.preventDefault(); e.returnValue = '';
    }
  });
})();
