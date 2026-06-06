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

  // ---- ICE-Server (Verbindungsaufbau hinter Routern/Firewalls) -----------
  // STUN reicht in vielen Heimnetzen. Für zuverlässige Verbindungen über
  // schwierige Netze (Firmen-WLAN, mobiles Netz) trägst du hier zusätzlich
  // deinen eigenen TURN-Server ein — siehe README.
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Beispiel TURN (auskommentiert):
    // { urls: 'turn:DEIN_TURN_HOST:3478', username: 'user', credential: 'pass' },
  ];

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
    setRoleUI('guest');
  }

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
    } else {
      $('lobbyTitle').textContent = 'Verifizierung beitreten';
      $('lobbySub').textContent = 'Gib deinen Namen ein und tritt dem Raum bei.';
      $('roomInput').placeholder = 'Raum-Code vom Moderator';
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
    localVideo.srcObject = state.localStream;
    localTag.textContent = name + ' (Du)';

    startRoom();
  }

  // =======================================================================
  //  RAUM
  // =======================================================================
  function startRoom() {
    lobby.style.display = 'none';
    room.classList.add('active');
    setupRoleUI();
    renderQuestions();
    connectSignaling();

    // Moderator: Beitritts-Link direkt anbieten.
    if (state.role === 'host') {
      const link = `${location.origin}${location.pathname}?raum=${state.roomCode}`;
      sysMsg(`Raum-Code: ${state.roomCode}`);
      sysMsg('Beitritts-Link (an Bewerber schicken): ' + link);
      copyToClipboard(link);
      toast('Beitritts-Link kopiert – an den Bewerber schicken');
    } else {
      sysMsg('Du bist dem Raum beigetreten. Warte auf den Moderator …');
    }
  }

  function setupRoleUI() {
    const isHost = state.role === 'host';
    // Aufnahme-Steuerung nur beim Moderator.
    $('recBtn').style.display = isHost ? '' : 'none';
    $('stopBtn').style.display = isHost ? '' : 'none';
    // Fragen-Navigation nur beim Moderator; Gast sieht die Fragen nur.
    qNav.style.display = isHost ? '' : 'none';
    if (!isHost) $('tabFragen').textContent = 'Aktuelle Frage';
  }

  // ---- WebSocket-Signalisierung -----------------------------------------
  function connectSignaling() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}`);
    state.ws = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'join', room: state.roomCode, role: state.role, name: state.name,
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
          break;
        case 'peer-ready':
          remoteTag.textContent = msg.peerName || 'Gegenüber';
          // Der Moderator baut die Verbindung auf (erstellt das Angebot).
          if (state.role === 'host') await startCall(true);
          else if (!state.pc) createPeer(); // Gast bereitet sich vor
          break;
        case 'signal':
          await handleSignal(msg.data);
          break;
        case 'peer-left':
          remoteVideo.srcObject = null;
          remoteWaiting.style.display = '';
          remoteWaiting.textContent = 'Gegenüber hat den Raum verlassen.';
          sysMsg('Gegenüber hat den Raum verlassen.');
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

  // ---- WebRTC ------------------------------------------------------------
  function createPeer() {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    state.pc = pc;

    // Eigene Spuren (Kamera/Mikro) hinzufügen.
    state.localStream.getTracks().forEach((t) => pc.addTrack(t, state.localStream));

    pc.onicecandidate = (e) => {
      if (e.candidate) signal({ kind: 'candidate', candidate: e.candidate });
    };

    pc.ontrack = (e) => {
      state.remoteStream = e.streams[0];
      remoteVideo.srcObject = e.streams[0];
      remoteWaiting.style.display = 'none';
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') sysMsg('Verbunden ✓');
      if (pc.connectionState === 'failed') sysMsg('Verbindung fehlgeschlagen – evtl. TURN-Server nötig (siehe README).');
    };

    // Datenkanal: Moderator erstellt ihn, Gast empfängt ihn.
    if (state.role === 'host') {
      const dc = pc.createDataChannel('verif');
      setupDataChannel(dc);
    } else {
      pc.ondatachannel = (e) => setupDataChannel(e.channel);
    }
    return pc;
  }

  async function startCall(isOfferer) {
    const pc = state.pc || createPeer();
    if (isOfferer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      signal({ kind: 'offer', sdp: pc.localDescription });
    }
  }

  async function handleSignal(data) {
    if (!data) return;
    const pc = state.pc || createPeer();

    if (data.kind === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      signal({ kind: 'answer', sdp: pc.localDescription });
    } else if (data.kind === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    } else if (data.kind === 'candidate') {
      try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch {}
    }
  }

  // ---- Datenkanal: Chat + Fragen-Synchronisation -------------------------
  function setupDataChannel(dc) {
    state.dc = dc;
    dc.onopen = () => {
      // Beim Verbinden aktuelle Frage an den Gast schicken.
      if (state.role === 'host' && state.currentQ >= 0) sendQuestion(state.currentQ);
    };
    dc.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.kind === 'chat') chatMsg(m.text, false, m.from);
      else if (m.kind === 'question') showQuestion(m.index, m.text);
    };
  }

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
      ctx.font = '600 24px -apple-system,Segoe UI,Roboto,sans-serif';
      wrapText(ctx, qBannerText.textContent || '—', 20, H - 48, W - 40, 30);

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

  function wrapText(ctx, text, x, y, maxW, lineH) {
    const words = String(text).split(' ');
    let line = '', yy = y, lines = 0;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, yy);
        line = w; yy += lineH; lines++;
        if (lines >= 1) { /* max 2 Zeilen */ }
      } else line = test;
    }
    ctx.fillText(line, x, yy);
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function copyToClipboard(text) {
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
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
