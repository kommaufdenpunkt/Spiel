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
    if (res.status === 401 && state.token) sitzungAbgelaufen();
    return { status: res.status, body: json };
  }

  // Der Anmelde-Nachweis liegt im Arbeitsspeicher des Servers. Startet der
  // Server neu – oder zeigt die Adresse auf einen anderen Server, wie beim
  // Umzug –, gilt er nicht mehr. Vorher zeigte der Bereich dann stumm leere
  // Listen und nichts liess sich mehr anlegen. Jetzt landet man sauber wieder
  // beim Login und weiss auch, warum.
  function sitzungAbgelaufen() {
    if (!state.token) return;
    state.token = ''; state.name = ''; state.isAdmin = false;
    clearInterval(state.waitingTimer); state.waitingTimer = 0;
    if ($('waitingView')) $('waitingView').style.display = 'none';
    if ($('lobby')) $('lobby').style.display = '';
    if ($('passInput')) $('passInput').value = '';
    if ($('totpInput')) $('totpInput').value = '';
    if ($('lobbyErr')) $('lobbyErr').textContent = 'Die Anmeldung gilt nicht mehr – bitte neu anmelden.';
    toast('Anmeldung abgelaufen. Bitte neu anmelden.');
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
  // mcp. ist der Team-Bereich – dort startet die Seite gleich im
  // Mitarbeiter-Login, und der Umweg zur Bewerber-Ansicht entfällt.
  const teamHost = /^(pruefer|mcp)\./.test(location.hostname.toLowerCase());
  const staffHost = teamHost;
  if (staffHost || staffPaths.includes(location.pathname.toLowerCase()) || params.has('login') || params.has('staff')) mode = 'host';
  setMode(mode);
  if (/^mcp\./.test(location.hostname.toLowerCase()) && $('staffToggle')) {
    $('staffToggle').style.display = 'none';   // hier gibt es keine Bewerber-Ansicht
    document.title = '4EVER1 · Team';
  }

  $('staffToggle').addEventListener('click', () => { mode = mode === 'guest' ? 'host' : 'guest'; $('lobbyErr').textContent = ''; setMode(mode); });
  function setMode(m) {
    const guest = m !== 'host';
    $('applicantFields').style.display = guest ? '' : 'none';
    $('staffFields').style.display = guest ? 'none' : '';
    // Der Team-Login bleibt bewusst wortkarg. Wer hierher gehoert, weiss, was
    // das ist. Wer nicht, soll aus der Seite nichts ablesen koennen.
    $('lobbyTitle').textContent = guest ? 'Audition starten' : 'Anmeldung';
    $('lobbySub').textContent = guest ? 'Gib deine Zugangsnummer ein, die du erhalten hast.' : '';
    $('lobbySub').style.display = guest ? '' : 'none';
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
      const nutzer = $('userInput').value.trim(), pw = $('passInput').value;
      let r = await api('POST', '/api/login', { username: nutzer, password: pw, totp: $('totpInput').value.trim(), device: deviceId() });
      // Der Admin-Zugang läuft über ein leeres Benutzerfeld. Wer dort seinen
      // Namen eintippt, würde als Prüfer geprüft, scheitern und auf eine
      // Sperre zulaufen. Deshalb einmal still als Admin versuchen.
      if ((r.status !== 200 || !r.body.token) && nutzer && r.body && r.body.reason === 'bad-login') {
        const alsAdmin = await api('POST', '/api/login', { username: '', password: pw, totp: $('totpInput').value.trim(), device: deviceId() });
        if (alsAdmin.status === 200 && alsAdmin.body.token) r = alsAdmin;
      }
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
  // ---- Warteraum: Team-Figuren erklären den Ablauf ------------------------
  const Fig = window.Figuren;
  let obTeam = Fig ? Fig.defaultTeam() : [];
  let obIntroText = '';
  let obPlayer = null;
  function setupObPlayer() {
    if (!Fig || obPlayer) return;
    obPlayer = Fig.makePlayer({
      teamHost: $('obTeam'), subtitle: $('obSubtitle'),
      getTeam: () => obTeam,
      getScript: () => obIntroText || Fig.DEFAULT_SCRIPT,
      getRate: () => 1,
      onState: (p) => { if ($('obPlayBtn')) $('obPlayBtn').disabled = p; },
      doneText: 'Alles klar? Dann tippe auf „Bereit – in den Warteraum". 👍',
    });
  }
  async function loadIntro() {
    try { const r = await api('GET', '/api/intro'); if (r.status === 200) { obIntroText = r.body.intro || ''; if ($('introText')) $('introText').textContent = obIntroText; } } catch {}
    if (Fig) {
      try { const cfg = await Fig.loadServerConfig(); if (cfg.figures) obTeam = cfg.figures; } catch {}
      setupObPlayer();
      Fig.renderTeamInto($('obTeam'), obTeam);
      if ($('obSubtitle')) $('obSubtitle').textContent = 'Tippe auf „Erklären lassen" – dein Team führt dich durch den Ablauf. Ton bitte anlassen. 🔊';
    }
  }
  if ($('obPlayBtn')) $('obPlayBtn').addEventListener('click', () => { setupObPlayer(); if (obPlayer) obPlayer.start(); });
  if ($('obStopBtn')) $('obStopBtn').addEventListener('click', () => { if (obPlayer) obPlayer.stop(); });
  if ($('readyBtn')) $('readyBtn').addEventListener('click', async () => {
    if ($('consentRec') && !$('consentRec').checked) {
      if ($('consentRecBox')) { $('consentRecBox').style.borderColor = 'var(--bad, #e14b6a)'; $('consentRecBox').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      toast('Bitte bestätige die Einwilligung zur Aufnahme und Speicherung, um fortzufahren.');
      return;
    }
    if (obPlayer) obPlayer.stop();
    const b = $('readyBtn'); b.disabled = true; b.textContent = 'Kamera wird gestartet …';
    if (!(await startCamera())) { b.disabled = false; b.textContent = 'Bereit – in den Warteraum'; toast('Kein Zugriff auf Kamera/Mikrofon. Bitte erlauben.'); return; }
    localTag.textContent = 'Du'; $('onboarding').style.display = 'none';
    b.disabled = false; b.textContent = 'Bereit – in den Warteraum';
    startRoom();
  });
  if ($('backToStart')) $('backToStart').addEventListener('click', () => { if (obPlayer) obPlayer.stop(); $('onboarding').style.display = 'none'; $('lobby').style.display = ''; });
  // Textfelder mit "grow" wachsen mit dem Inhalt (Zeilenumbrüche).
  function autoGrow(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 280) + 'px'; }
  document.querySelectorAll('textarea.grow').forEach((t) => { t.addEventListener('input', () => autoGrow(t)); });
  // ---- Geräte-Kennung (bleibt in diesem Browser) ----
  // Prüfer kommen nur von freigegebenen Geräten herein; der Server kennt davon
  // nur einen Hash.
  function deviceId() {
    const K = 'ident.deviceId';
    let d = '';
    try { d = localStorage.getItem(K) || ''; } catch {}
    if (!d || d.length < 20) {
      const a = new Uint8Array(32); crypto.getRandomValues(a);
      d = Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('');
      try { localStorage.setItem(K, d); } catch {}
    }
    return d;
  }

  function loginErr(r) {
    const x = r.body && r.body.reason;
    if (x === 'account-locked') return 'Konto gesperrt (zu viele Fehlversuche). Bitte an den Admin wenden.';
    if (x === 'bad-totp') {
      // Für dieses Konto ist 2FA aktiv -> Feld einblenden, damit man den Code eingeben kann.
      if ($('totpField')) { $('totpField').style.display = ''; if ($('totpInput')) $('totpInput').focus(); }
      return 'Für dieses Konto ist ein 2FA-Code nötig – bitte unten eingeben.';
    }
    if (x === 'device-missing') return 'Diese Seite ist veraltet. Bitte einmal vollständig neu laden (Strg/Cmd + Umschalt + R) und erneut anmelden.';
    if (x === 'device-not-approved') return 'Dieses Gerät ist nicht freigegeben. Melde dich bei der Teamleitung – dein Gerät muss einmal freigeschaltet werden.';
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
  // Erster Login: eigenes Passwort setzen. Als Formular auf der Seite, damit es
  // niemand versehentlich wegklickt und niemand denkt, sein Passwort sei falsch.
  function forcePwChange() {
    return new Promise((fertig) => {
      const box = $('pwChangeBox'), msg = $('pwMsg'), btn = $('pwSaveBtn');
      if (!box || !btn) { fertig(false); return; }
      $('staffFields').style.display = 'none';
      $('enterBtn').style.display = 'none';
      if ($('staffToggle')) $('staffToggle').style.display = 'none';
      $('lobbyTitle').textContent = 'Eigenes Passwort vergeben';
      $('lobbySub').textContent = 'Nur noch ein Schritt, dann bist du drin.';
      box.style.display = ''; msg.textContent = '';
      $('pwNew1').value = ''; $('pwNew2').value = '';
      setTimeout(() => $('pwNew1').focus(), 60);

      const aufraeumen = () => {
        box.style.display = 'none';
        $('enterBtn').style.display = '';
        if ($('staffToggle')) $('staffToggle').style.display = '';
        btn.removeEventListener('click', speichern);
        $('pwNew2').removeEventListener('keydown', beiEnter);
      };
      const beiEnter = (e) => { if (e.key === 'Enter') speichern(); };
      async function speichern() {
        const a = $('pwNew1').value, b = $('pwNew2').value;
        if (a.length < 8) { msg.textContent = 'Das Passwort muss mindestens 8 Zeichen haben.'; return; }
        if (a !== b) { msg.textContent = 'Die beiden Eingaben sind nicht gleich.'; return; }
        btn.disabled = true; btn.textContent = 'Wird gespeichert …'; msg.textContent = '';
        const r = await api('POST', '/api/change-password', { newPassword: a });
        btn.disabled = false; btn.textContent = 'Passwort speichern und weiter';
        if (r.status === 200) {
          state.mustChange = false; aufraeumen();
          toast('Passwort gespeichert – merk es dir gut.');
          fertig(true);
        } else {
          msg.textContent = 'Das hat nicht geklappt. Bitte noch einmal versuchen.';
        }
      }
      btn.addEventListener('click', speichern);
      $('pwNew2').addEventListener('keydown', beiEnter);
    });
  }

  // ================= WARTERAUM (Prüfer) =================
  function openWaiting() {
    $('lobby').style.display = 'none';
    $('waitingView').style.display = '';
    $('waitWho').textContent = state.name || 'Prüfer';
    $('waitRole').textContent = state.isAdmin ? 'Admin' : 'Prüfer';
    $('waitAvatar').textContent = (state.name || 'P').charAt(0).toUpperCase();
    $('newCodeResult').textContent = '';
    // Der Team-Bereich verlinkt bewusst nichts Administratives – weder für
    // Prüfer noch für Admins. Wer dorthin muss, kennt die Adresse.
    // Ordner im Voraus holen, damit die Kacheln gleich Zahlen zeigen.
    ladeOrdner(false, true);
    ladeNummern().then(() => { if (state.bereich === 'uebersicht') zeichneKacheln(); }).catch(() => {});
    zeigeBereich('uebersicht');
    refreshWaiting(); clearInterval(state.waitingTimer); state.waitingTimer = setInterval(refreshWaiting, 3000);
  }

  // ================= TEAM-BEREICH: Warteraum <-> Streamer-Ordner =============
  // Beides in derselben Oberfläche, damit man sich nicht zweimal anmelden muss.
  function zeigeBereich(was) {
    const bereiche = { uebersicht: 'paneUebersicht', warteraum: 'paneWarteraum', ordner: 'paneOrdner', nummern: 'paneNummern' };
    state.bereich = bereiche[was] ? was : 'uebersicht';
    Object.keys(bereiche).forEach((k) => {
      const el = $(bereiche[k]); if (el) el.style.display = k === state.bereich ? '' : 'none';
      const n = $('nav' + k.charAt(0).toUpperCase() + k.slice(1)); if (n) n.classList.toggle('sel', k === state.bereich);
    });
    // Die rechte Spalte gehört zur Arbeit am Warteraum und zur Übersicht.
    if ($('paneLaufend')) {
      $('paneLaufend').style.display = (state.bereich === 'ordner' || state.bereich === 'nummern') ? 'none' : '';
      zeichneBloecke();   // weggeklickte Blöcke bleiben weg
    }
    if (state.bereich === 'ordner') ladeOrdner();
    if (state.bereich === 'uebersicht') zeichneKacheln();
    if (state.bereich === 'nummern') ladeNummern();
  }
  if ($('navNummern')) $('navNummern').addEventListener('click', () => zeigeBereich('nummern'));
  if ($('navUebersicht')) $('navUebersicht').addEventListener('click', () => zeigeBereich('uebersicht'));
  if ($('navWarteraum')) $('navWarteraum').addEventListener('click', () => zeigeBereich('warteraum'));
  if ($('navOrdner')) $('navOrdner').addEventListener('click', () => zeigeBereich('ordner'));

  // ---- Kacheln der Übersicht ----------------------------------------------
  // Zeigen den Stand in Zahlen und führen mit einem Tippen dorthin.
  function kachel(icon, zahl, titel, unten, klick, ruft) {
    const b = document.createElement('button');
    b.className = 'kachel' + (ruft ? ' ruft' : '');
    b.innerHTML = '<span class="ki">' + icon + '</span>'
      + (zahl !== null ? '<span class="kz">' + esc(String(zahl)) + '</span>' : '')
      + '<span class="kt">' + esc(titel) + '</span>'
      + '<span class="ku">' + esc(unten) + '</span>';
    if (klick) b.addEventListener('click', klick); else b.disabled = true;
    return b;
  }
  function zeichneKacheln() {
    const host = $('kacheln'); if (!host) return;
    const w = state.letzteWarteschlange || { free: 0, running: 0 };
    const ord = state.ordner || [];
    const fam = ord.filter((s) => (s.art || 'streamer') === 'familie').length;
    const offen = ord.reduce((n, s) => n + (s.auditions || []).filter((a) => a.aufnahme && !a.aufnahme.auswertung).length, 0);
    host.innerHTML = '';
    host.appendChild(kachel('🕒', w.free || 0, 'wartet gerade',
      w.free ? 'Antippen und annehmen' : 'Niemand in der Schlange',
      () => zeigeBereich('warteraum'), (w.free || 0) > 0));
    host.appendChild(kachel('🎥', w.running || 0, 'laufende Gespräche',
      'gerade in Bearbeitung', () => zeigeBereich('warteraum')));
    host.appendChild(kachel('📁', ord.length, 'Streamer-Ordner',
      'alle Akten an einem Ort', () => zeigeBereich('ordner')));
    host.appendChild(kachel('👨‍👩‍👧', fam, 'in der Familie',
      'engerer Kreis', () => {
        state.artFilter = 'familie';
        document.querySelectorAll('.artfilter button').forEach((x) => x.classList.toggle('sel', x.dataset.art === 'familie'));
        state.offenerOrdner = null; zeigeBereich('ordner');
      }));
    if (offen) {
      host.appendChild(kachel('🎬', offen, 'Aufnahmen offen',
        'noch nicht ausgewertet', () => zeigeBereich('ordner'), true));
    }
    // Ordner, in denen lange nichts mehr steht - damit die Akte gepflegt bleibt.
    const still = ord.filter((s) => ['aktiv', 'neu'].includes(s.status) && stilleTage(s) >= STILL_AB);
    if (still.length) {
      host.appendChild(kachel('🕰', still.length, 'lange nichts gehört',
        'seit ' + STILL_AB + ' Tagen kein Eintrag', () => {
          state.artFilter = 'still';
          document.querySelectorAll('.artfilter button').forEach((x) => x.classList.remove('sel'));
          state.offenerOrdner = null; zeigeBereich('ordner');
        }, true));
    }
    const offeneNummern = (state.nummern || []).filter((c) => c.status === 'open').length;
    host.appendChild(kachel('🎟', offeneNummern, 'Nummern offen',
      'ausgegeben, noch nicht benutzt', () => zeigeBereich('nummern')));
    host.appendChild(kachel('➕', null, 'Zugangsnummer',
      'für den nächsten Bewerber', () => { zeigeBereich('warteraum'); $('newCodeBtn').click(); }));
    // Keine Kachel für Adminaufgaben – die liegen auf einer eigenen Adresse,
    // und der Team-Bereich verrät sie nicht. Auch Admins nicht.
  }

  // ---- Blöcke rechts wegklicken und zurückholen ----------------------------
  // Die Auswahl bleibt in diesem Browser gespeichert, damit sie nach dem
  // nächsten Anmelden noch gilt.
  const BLOCK_KEY = 'ident.zugeklappt';
  function zugeklappte() {
    try { return JSON.parse(localStorage.getItem(BLOCK_KEY) || '[]'); } catch { return []; }
  }
  function merkeBloecke(liste) { try { localStorage.setItem(BLOCK_KEY, JSON.stringify(liste)); } catch {} }
  function zeichneBloecke() {
    const zu = zugeklappte();
    let sichtbar = 0;
    document.querySelectorAll('.seiten-block').forEach((b) => {
      const versteckt = zu.includes(b.dataset.block);
      b.classList.toggle('zu', versteckt);
      if (!versteckt) sichtbar++;
    });
    // Ist rechts nichts mehr übrig, verschwindet die ganze Spalte – sonst
    // stünde da ein leerer Kasten.
    const spalte = $('paneLaufend');
    if (spalte) spalte.classList.toggle('leer', sichtbar === 0);
    const zurueck = $('blockeZurueck');
    if (zurueck) {
      zurueck.style.display = zu.length ? '' : 'none';
      zurueck.textContent = '↩︎ Ausgeblendetes zeigen (' + zu.length + ')';
    }
  }
  document.querySelectorAll('.block-zu').forEach((k) => {
    k.addEventListener('click', () => {
      const b = k.closest('.seiten-block'); if (!b) return;
      const zu = zugeklappte();
      if (!zu.includes(b.dataset.block)) zu.push(b.dataset.block);
      merkeBloecke(zu); zeichneBloecke();
      toast('Ausgeblendet – links im Menü wieder einblendbar.');
    });
  });
  if ($('blockeZurueck')) $('blockeZurueck').addEventListener('click', () => { merkeBloecke([]); zeichneBloecke(); });
  zeichneBloecke();

  // ---- Zugangsnummern: welche sind noch offen? -----------------------------
  // Eine Nummer wird erzeugt und weitergegeben - danach war bisher nicht mehr
  // zu sehen, welche noch aussteht. Genau das zeigt dieser Bereich.
  async function ladeNummern() {
    const r = await api('GET', '/api/codes');
    state.nummern = (r.body && r.body.codes) || [];
    zeichneNummern();
  }
  function alterText(iso) {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 60) return 'vor ' + min + ' Min';
    const std = Math.round(min / 60);
    if (std < 24) return 'vor ' + std + ' Std';
    return 'vor ' + Math.round(std / 24) + ' Tagen';
  }
  function zeichneNummern() {
    const host = $('nummerInhalt'); if (!host) return;
    const liste = state.nummern || [];
    const offen = liste.filter((c) => c.status === 'open');
    const rest = liste.filter((c) => c.status !== 'open').slice(0, 20);
    host.innerHTML = '';
    const kopf = (t) => { const d = document.createElement('div'); d.className = 'deck-head';
      d.style.marginTop = '.4rem'; d.innerHTML = '<h2 style="font-size:.98rem">' + t + '</h2>'; host.appendChild(d); };

    kopf('Offen (' + offen.length + ')');
    if (!offen.length) host.insertAdjacentHTML('beforeend', '<div class="deck-empty">Keine offene Nummer. Oben eine neue erzeugen.</div>');
    offen.forEach((c) => {
      const tage = (Date.now() - new Date(c.createdAt).getTime()) / 86400000;
      const d = document.createElement('div'); d.className = 'num offen' + (tage > 3 ? ' alt' : '');
      d.innerHTML = '<span class="code">' + esc(c.code) + '</span>'
        + '<span class="info">' + (c.note ? esc(c.note) + '<br>' : '')
        + 'von ' + esc(c.createdBy || '—') + ' · ' + esc(alterText(c.createdAt))
        + (tage > 3 ? ' · <b style="color:var(--warm)">liegt lange</b>' : '') + '</span>';
      const kopieren = document.createElement('button');
      kopieren.textContent = '📋 Kopieren';
      kopieren.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(c.code); toast('Nummer kopiert.'); }
        catch { toast('Kopieren ging nicht – Nummer: ' + c.code); }
      });
      const weg = document.createElement('button');
      weg.className = 'danger'; weg.textContent = '✕ Zurückziehen';
      weg.addEventListener('click', async () => {
        if (!confirm('Nummer ' + c.code + ' zurückziehen? Sie gilt danach nicht mehr.')) return;
        await api('POST', '/api/code-revoke', { code: c.code });
        toast('Zurückgezogen.'); ladeNummern();
      });
      d.appendChild(kopieren); d.appendChild(weg);
      host.appendChild(d);
    });

    if (rest.length) {
      kopf('Erledigt');
      rest.forEach((c) => {
        const d = document.createElement('div'); d.className = 'num';
        d.innerHTML = '<span class="code" style="opacity:.55">' + esc(c.code) + '</span>'
          + '<span class="info">' + (c.note ? esc(c.note) + ' · ' : '')
          + (c.status === 'used' ? 'benutzt' : 'zurückgezogen') + ' · ' + esc(alterText(c.createdAt)) + '</span>';
        host.appendChild(d);
      });
    }
  }
  if ($('nummerNeu')) $('nummerNeu').addEventListener('click', async () => {
    const b = $('nummerNeu'); b.disabled = true;
    const r = await api('POST', '/api/code', { note: $('nummerNotiz').value.trim() });
    b.disabled = false;
    if (r.status !== 200) {
      // Sagen, woran es liegt – „ging nicht" hilft niemandem weiter.
      if (r.status === 401) return;                       // Login-Hinweis kommt schon
      toast(r.status === 0 ? 'Keine Verbindung zum Server.'
        : 'Nummer konnte nicht erzeugt werden (Fehler ' + r.status + ').');
      return;
    }
    $('nummerNotiz').value = '';
    toast('Neue Nummer: ' + r.body.code);
    ladeNummern();
  });

  // ---- Geräte-Test für den Prüfer -----------------------------------------
  // Damit ein stummes Mikrofon vor dem Gespräch auffällt, nicht mittendrin.
  let dkAudio = null;
  if ($('dkTest')) $('dkTest').addEventListener('click', async () => {
    const b = $('dkTest'); b.disabled = true; b.textContent = 'wird geprüft …';
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const v = s.getVideoTracks()[0], a = s.getAudioTracks()[0];
      const g = v && v.getSettings ? v.getSettings() : {};
      setzeCheck('dkCam', v ? 'ok' : 'bad', v ? ('läuft' + (g.width ? ', ' + g.width + '×' + g.height : '')) : 'kein Bild');
      if (!a) { setzeCheck('dkMic', 'bad', 'kein Mikrofon gefunden'); }
      else {
        setzeCheck('dkMic', 'warn', 'Sag mal kurz „Hallo“');
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const an = ctx.createAnalyser(); an.fftSize = 512;
        ctx.createMediaStreamSource(s).connect(an);
        const buf = new Uint8Array(an.fftSize);
        dkAudio = { ctx, gehoert: false, bis: Date.now() + 12000 };
        const tick = () => {
          if (!dkAudio) return;
          an.getByteTimeDomainData(buf);
          let max = 0; for (let i = 0; i < buf.length; i++) { const d = Math.abs(buf[i] - 128); if (d > max) max = d; }
          if ($('dkMicBar')) $('dkMicBar').style.width = Math.min(100, Math.round(max / 40 * 100)) + '%';
          if (max > 7 && !dkAudio.gehoert) { dkAudio.gehoert = true; setzeCheck('dkMic', 'ok', 'Ton kommt an – alles gut'); }
          if (Date.now() > dkAudio.bis) {
            if (!dkAudio.gehoert) setzeCheck('dkMic', 'warn', 'kein Ton gehört – Mikro prüfen');
            try { dkAudio.ctx.close(); } catch {}
            s.getTracks().forEach((t) => { try { t.stop(); } catch {} });
            dkAudio = null; if ($('dkMicBar')) $('dkMicBar').style.width = '0';
            return;
          }
          requestAnimationFrame(tick);
        };
        tick();
      }
      // Das Bild brauchen wir nicht anzuzeigen – nur wissen, dass es geht.
      setTimeout(() => { if (!dkAudio) s.getTracks().forEach((t) => { try { t.stop(); } catch {} }); }, 500);
    } catch {
      setzeCheck('dkCam', 'bad', 'Zugriff nicht erlaubt');
      setzeCheck('dkMic', 'bad', 'Zugriff nicht erlaubt');
    }
    b.disabled = false; b.textContent = 'Kamera & Mikro testen';
  });
  if ($('ordnerNeu')) $('ordnerNeu').addEventListener('click', () => ladeOrdner(true));
  if ($('ordnerSuche')) $('ordnerSuche').addEventListener('input', () => zeichneOrdner());

  // Der Filter startet auf "Alle"; Familie ist einen Klick entfernt.
  state.artFilter = 'alle';
  document.querySelectorAll('.artfilter button').forEach((b) => {
    b.classList.toggle('sel', b.dataset.art === state.artFilter);
    b.addEventListener('click', () => {
      state.artFilter = b.dataset.art;
      document.querySelectorAll('.artfilter button').forEach((x) => x.classList.toggle('sel', x === b));
      state.offenerOrdner = null; zeichneOrdner();
    });
  });

  // Wie viele Tage steht in diesem Ordner nichts Neues? Zaehlt Vermerke und
  // Auditions - die Anlage des Ordners allein reicht nicht.
  function stilleTage(s) {
    const zeiten = [];
    (s.eintraege || []).forEach((e) => zeiten.push(new Date(e.createdAt).getTime()));
    (s.auditions || []).forEach((a) => zeiten.push(new Date(a.eingegangenAm || a.erstelltAm).getTime()));
    if (!zeiten.length) return Math.floor((Date.now() - new Date(s.angelegtAm).getTime()) / 86400000);
    return Math.floor((Date.now() - Math.max(...zeiten)) / 86400000);
  }
  const STILL_AB = 30;   // ab so vielen Tagen gilt ein Ordner als liegengeblieben

  const ORD_STATUS = { neu: 'neu', aktiv: 'aktiv', pausiert: 'pausiert', abgelehnt: 'abgelehnt', weg: 'nicht mehr dabei' };
  function ordPill(s) {
    const t = ORD_STATUS[s] || s || 'neu';
    const k = s === 'aktiv' ? 'ok' : (s === 'abgelehnt' || s === 'weg') ? 'no' : 'warn';
    return '<span class="wait-pill ' + k + '">' + esc(t) + '</span>';
  }
  async function ladeOrdner(neu, still) {
    if (neu) $('ordnerInhalt').innerHTML = '<div class="deck-empty">Wird geladen …</div>';
    const r = await api('GET', '/api/streamers');
    state.ordner = (r.body && r.body.streamers) || [];
    state.offenerOrdner = null;
    if (still) { if (state.bereich === 'uebersicht') zeichneKacheln(); return; }
    zeichneOrdner();
    if (state.bereich === 'uebersicht') zeichneKacheln();
  }
  // ---- Suche quer durch die ganze Akte -------------------------------------
  // Nicht nur BIGO-ID und Name: auch Vermerke, wer sie geschrieben hat,
  // Prüfer, Ausweisnummern, Zugangsnummern, Ablehnungsgründe und das
  // Protokoll. Und die Trefferstelle wird gezeigt - sonst sucht man zwar
  // erfolgreich, weiss aber nicht, warum dieser Ordner dabei ist.
  const STATUSWORT = { neu: 'neu', aktiv: 'aktiv', pausiert: 'pausiert', abgelehnt: 'abgelehnt', raus: 'nicht mehr dabei' };
  const ERGWORT = { approved: 'freigegeben', rejected: 'abgelehnt', open: 'offen' };
  function trefferIn(s, q) {
    const gefunden = [];
    const pruef = (wo, text) => {
      if (!text) return;
      const t = String(text);
      if (t.toLowerCase().includes(q)) gefunden.push({ wo, text: t });
    };
    pruef('BIGO-ID', s.bigoId);
    pruef('Name', s.name);
    pruef('Notiz', s.notiz);
    pruef('Status', STATUSWORT[s.status] || s.status);
    if ((s.art || 'streamer') === 'familie') pruef('Art', 'Familie');
    if (s.herkunft === 'pkboard') pruef('Herkunft', 'aus dem PK-Board übernommen');
    (s.eintraege || []).forEach((e) => {
      pruef('Vermerk', e.text);
      pruef('Vermerk von', e.author);
    });
    (s.auditions || []).forEach((a) => {
      pruef('Prüfer', a.pruefer);
      pruef('Zugangsnummer', a.zugangsnummer);
      pruef('Ausweis-Nr.', a.ausweisnummer);
      pruef('Ausweisart', a.ausweisart);
      pruef('Notiz zur Audition', a.notiz);
      pruef('Ablehnungsgrund', a.ablehnungsgrund);
      pruef('Ergebnis', ERGWORT[a.ergebnis] || a.ergebnis);
      if (a.aufnahme) pruef('Aufnahme', a.aufnahme.begruendung);
      (a.checkliste || []).forEach((c) => pruef('Abgehakt', c));
      (a.protokoll || []).forEach((e) => { pruef('Protokoll', e.text); pruef('Protokoll von', e.autor); });
    });
    return gefunden;
  }
  // Fundstelle mit hervorgehobenem Suchwort, gekürzt auf das Wesentliche.
  function markiere(text, q) {
    const t = String(text);
    const i = t.toLowerCase().indexOf(q);
    if (i < 0) return esc(t.slice(0, 90));
    const von = Math.max(0, i - 28);
    const bis = Math.min(t.length, i + q.length + 46);
    return (von > 0 ? '…' : '') + esc(t.slice(von, i))
      + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>'
      + esc(t.slice(i + q.length, bis)) + (bis < t.length ? '…' : '');
  }
  function trefferZeilen(treffer) {
    if (!treffer || !treffer.length) return '';
    const q = ($('ordnerSuche').value || '').trim().toLowerCase();
    // BIGO-ID und Name stehen schon oben auf der Karte - die muss man nicht
    // nochmal als Fundstelle zeigen.
    const zeigen = treffer.filter((t) => !['BIGO-ID', 'Name'].includes(t.wo));
    if (!zeigen.length) return '';
    const mehr = zeigen.length > 2 ? '<div class="tr-mehr">+ ' + (zeigen.length - 2) + ' weitere Fundstelle'
      + (zeigen.length - 2 === 1 ? '' : 'n') + '</div>' : '';
    return '<div class="tr-fund">' + zeigen.slice(0, 2).map((t) =>
      '<div class="tr-zeile"><b>' + esc(t.wo) + ':</b> ' + markiere(t.text, q) + '</div>').join('') + mehr + '</div>';
  }

  // ---- Akteneinsicht: erst der Grund, dann der Inhalt ----------------------
  // Prüfer müssen sagen, warum sie eine Akte öffnen. Der Grund steht danach in
  // der Akte, für alle sichtbar. Admins kommen ohne Angabe hinein - ihr
  // Zugriff wird trotzdem festgehalten. Kein heimliches Nachschauen.
  async function akteOeffnen(id) {
    if (state.isAdmin) return holeAkte(id, '');
    const grund = await grundFragen();
    if (grund === null) return;               // abgebrochen
    return holeAkte(id, grund);
  }
  async function holeAkte(id, grund) {
    const r = await api('POST', '/api/streamer-oeffnen', { id, grund });
    if (r.status === 400) { toast('Bitte einen Grund angeben (mindestens 5 Zeichen).'); return; }
    if (r.status !== 200 || !r.body.ordner) { toast('Akte konnte nicht geöffnet werden.'); return; }
    // Den vollen Stand in die Liste zurückschreiben, damit die Ansicht ihn hat.
    const i = (state.ordner || []).findIndex((x) => x.id === id);
    if (i >= 0) state.ordner[i] = r.body.ordner; else (state.ordner = state.ordner || []).push(r.body.ordner);
    state.offenerOrdner = id;
    zeichneOrdner();
  }
  function grundFragen() {
    return new Promise((fertig) => {
      const host = $('ordnerInhalt'); if (!host) { fertig(null); return; }
      host.innerHTML = '';
      const k = document.createElement('div');
      k.className = 'grundbox';
      k.innerHTML = '<h3>🔒 Warum möchtest du diese Akte öffnen?</h3>'
        + '<p>In der Akte stehen Ausweisdaten, Aufnahmen und Vermerke. Einsicht wird '
        + 'protokolliert – dein Name, die Uhrzeit und dieser Grund stehen danach in der Akte.</p>'
        + '<div class="grund-schnell">'
        + ['Rückfrage vom Streamer', 'Vorbereitung Audition', 'Vermerk eintragen', 'Beschwerde prüfen', 'Datenabgleich']
          .map((g) => '<button type="button" data-g="' + esc(g) + '">' + esc(g) + '</button>').join('')
        + '</div>'
        + '<input id="grundText" placeholder="oder eigenen Grund eintippen …" maxlength="300">'
        + '<div class="grund-akt"><button id="grundOk" class="primary">Akte öffnen</button>'
        + '<button id="grundAb">Abbrechen</button></div>'
        + '<div class="err" id="grundErr"></div>';
      host.appendChild(k);
      const feld = k.querySelector('#grundText');
      feld.focus();
      k.querySelectorAll('.grund-schnell button').forEach((b) => {
        b.addEventListener('click', () => { feld.value = b.dataset.g; feld.focus(); });
      });
      const ab = () => { fertig(null); state.offenerOrdner = null; zeichneOrdner(); };
      k.querySelector('#grundAb').addEventListener('click', ab);
      const ok = () => {
        const g = feld.value.trim();
        if (g.length < 5) { k.querySelector('#grundErr').textContent = 'Bitte kurz begründen – mindestens 5 Zeichen.'; feld.focus(); return; }
        fertig(g);
      };
      k.querySelector('#grundOk').addEventListener('click', ok);
      feld.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    });
  }

  // Wer hat in diese Akte gesehen - und warum? Steht offen in der Akte.
  function zugriffeBlock(s) {
    const box = document.createElement('div');
    box.className = 'ord-zugriffe';
    const l = (s.zugriffe || []).slice(0, 12);
    box.innerHTML = '<details' + (l.length ? '' : ' hidden') + '><summary>🔒 Akteneinsicht (' + (s.zugriffe || []).length + ')</summary>'
      + '<div class="zg-liste">' + l.map((z) =>
        '<div class="zg"><b>' + esc(z.wer) + '</b>'
        + (z.rolle === 'admin' ? ' <span class="zg-rolle">Admin</span>' : '')
        + '<span class="zg-zeit">' + esc(new Date(z.am).toLocaleString('de-DE')) + '</span>'
        + '<div class="zg-grund">' + esc(z.grund || '—') + '</div></div>').join('')
      + '</div></details>';
    return box;
  }

  function zeichneOrdner() {
    const host = $('ordnerInhalt'); if (!host) return;
    if (state.offenerOrdner) { zeichneEinenOrdner(state.offenerOrdner); return; }
    const q = ($('ordnerSuche').value || '').trim().toLowerCase();
    const f = state.artFilter || 'alle';
    const liste = (state.ordner || [])
      .filter((s) => f === 'alle' || (f === 'still'
        ? (['aktiv', 'neu'].includes(s.status) && stilleTage(s) >= STILL_AB)
        : (s.art || 'streamer') === f))
      .map((s) => ({ s, treffer: q ? trefferIn(s, q) : [] }))
      .filter((x) => !q || x.treffer.length)
      .map((x) => { x.s._treffer = x.treffer; return x.s; });
    if (!liste.length) {
      host.innerHTML = (state.ordner || []).length
        ? '<div class="deck-empty">' + (f === 'familie' ? 'Noch niemand als Familie eingetragen.<br>Ordner öffnen und dort umstellen.'
          : f === 'still' ? 'Bei niemandem ist es still – alle Akten sind gepflegt. 👍' : 'Nichts gefunden.') + '</div>'
        : '<div class="deck-empty">Noch keine Ordner.<br>Sobald eine Audition abgeschlossen ist, erscheint sie hier von selbst.</div>';
      return;
    }
    host.innerHTML = '<div class="ord-grid"></div>';
    const grid = host.querySelector('.ord-grid');
    liste.forEach((s) => {
      const fam = (s.art || 'streamer') === 'familie';
      const d = document.createElement('div'); d.className = 'ord-card' + (fam ? ' familie' : '');
      const n = (s.auditions || []).length;
      d.innerHTML = '<div class="oid">' + esc(s.bigoId) + (fam ? ' <span class="fam-pill">Familie</span>' : '') + '</div>'
        + '<div class="onm">' + esc(s.name || 'Name unbekannt') + (s.alter ? ' · ' + esc(s.alter) + ' J.' : '') + '</div>'
        + '<div class="orow">' + ordPill(s.status)
        + (n === 0 && s.herkunft === 'pkboard'
            ? '<span class="uebernommen" title="Aus dem PK-Board übernommen">aus dem PK-Board · noch keine Audition</span>'
            : '<span class="muted">' + n + ' Audition' + (n === 1 ? '' : 'en') + '</span>')
        + '</div>'
        + trefferZeilen(s._treffer)
        + (['aktiv', 'neu'].includes(s.status) && stilleTage(s) >= STILL_AB
          ? '<div class="muted" style="margin-top:.35rem;font-size:.75rem;color:var(--warm)">🕰 seit '
            + stilleTage(s) + ' Tagen kein Eintrag</div>' : '');
      d.addEventListener('click', () => { akteOeffnen(s.id); });
      grid.appendChild(d);
    });
  }
  // ---- Vermerke: alles, was im Laufe der Zeit dazukommt --------------------
  // Vorlagen, damit man nicht jedes Mal neu formulieren muss. Sie schreiben nur
  // den Anfang ins Feld - den Rest ergaenzt man selbst.
  const VORLAGEN = [
    ['\u{1F4DE} Angerufen', 'Angerufen \u2013 '],
    ['\u{1F4AC} Geschrieben', 'Nachricht geschrieben \u2013 '],
    ['\u{1F515} Meldet sich nicht', 'Meldet sich nicht. Versucht am '],
    ['\u{1F4C9} Streamt zu wenig', 'Streamt zu wenig \u2013 angesprochen auf '],
    ['\u26A0\uFE0F Verwarnung', 'Verwarnung: '],
    ['\u{1F3C6} Lob', 'Lob: '],
    ['\u{1F3AF} Ziel vereinbart', 'Ziel vereinbart: '],
    ['\u23F8 Pause', 'Pause abgesprochen von \u2026 bis \u2026, Grund: '],
  ];
  function vermerkeBlock(s) {
    const wrap = document.createElement('div'); wrap.className = 'ord-aud';
    const liste = s.eintraege || [];
    wrap.innerHTML = '<div class="deck-head" style="margin-bottom:.5rem"><h2 style="font-size:1rem">\u{1F4DD} Vermerke ('
      + liste.length + ')</h2><span class="muted">Anrufe, Absprachen, Auff\u00e4lligkeiten</span></div>';

    const vor = document.createElement('div'); vor.className = 'vorlagen';
    VORLAGEN.forEach((v) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = v[0];
      b.addEventListener('click', () => {
        const ta = wrap.querySelector('.vermerk-feld');
        ta.value = v[1]; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
      });
      vor.appendChild(b);
    });
    wrap.appendChild(vor);

    const ta = document.createElement('textarea');
    ta.className = 'vermerk-feld'; ta.rows = 3;
    ta.placeholder = 'Was ist passiert? Ruhig in eigenen Worten \u2013 der Text l\u00e4sst sich vor dem Speichern aufr\u00e4umen.';
    wrap.appendChild(ta);

    const leiste = document.createElement('div');
    leiste.style.cssText = 'display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin-top:.5rem';
    const speichern = document.createElement('button');
    speichern.className = 'primary'; speichern.textContent = '\u2728 Eintragen';
    const hinweis = document.createElement('span'); hinweis.className = 'muted'; hinweis.style.fontSize = '.8rem';
    speichern.addEventListener('click', async () => {
      const roh = ta.value.trim();
      if (!roh) { hinweis.textContent = 'Bitte erst etwas schreiben.'; return; }
      speichern.disabled = true; hinweis.textContent = 'Text wird aufger\u00e4umt \u2026';
      let text = roh;
      const p = await api('POST', '/api/entry-polish', { text: roh });
      if (p.status === 200 && p.body.text && p.body.text !== roh) {
        const aend = (p.body.changes || []).map((x) => '\u2022 ' + x).join('\n');
        text = confirm('Aufbereiteter Text:\n\n' + p.body.text + '\n\n\u00c4nderungen:\n' + aend + '\n\nSo einpflegen?  (Abbrechen = dein Originaltext)')
          ? p.body.text : roh;
      }
      hinweis.textContent = '';
      const r = await api('POST', '/api/streamer-entry', { id: s.id, text: text, original: roh });
      speichern.disabled = false;
      if (r.status !== 200) { toast('Vermerk konnte nicht gespeichert werden.'); return; }
      ta.value = ''; toast('Vermerk eingetragen.');
      await ladeOrdner(false, true); state.offenerOrdner = s.id; zeichneOrdner();
    });
    leiste.appendChild(speichern); leiste.appendChild(hinweis);
    wrap.appendChild(leiste);

    if (liste.length) {
      const l = document.createElement('div'); l.className = 'vermerk-liste';
      liste.forEach((e) => {
        const d = document.createElement('div'); d.className = 'vermerk';
        d.innerHTML = '<div class="vt"></div><small>' + esc(e.author || '') + ' \u00b7 '
          + esc(new Date(e.createdAt).toLocaleString('de-DE'))
          + (e.editedAt ? ' \u00b7 ge\u00e4ndert von ' + esc(e.editedBy) : '') + '</small>';
        d.querySelector('.vt').textContent = e.text;
        if (state.isAdmin) {
          const acts = document.createElement('div'); acts.className = 'vermerk-acts';
          const bearb = document.createElement('button'); bearb.textContent = '\u270F\uFE0F Bearbeiten';
          bearb.addEventListener('click', async () => {
            const neu = prompt('Vermerk \u00e4ndern:', e.text);
            if (neu === null || !neu.trim()) return;
            const r = await api('POST', '/api/streamer-entry-update', { id: s.id, entryId: e.id, text: neu.trim() });
            if (r.status !== 200) { toast('\u00c4ndern hat nicht geklappt.'); return; }
            await ladeOrdner(false, true); state.offenerOrdner = s.id; zeichneOrdner();
          });
          acts.appendChild(bearb); d.appendChild(acts);
        }
        l.appendChild(d);
      });
      wrap.appendChild(l);
    }
    return wrap;
  }

  function zeichneEinenOrdner(id) {
    const s = (state.ordner || []).find((x) => x.id === id);
    const host = $('ordnerInhalt');
    if (!s) { state.offenerOrdner = null; zeichneOrdner(); return; }
    host.innerHTML = '';
    const zurueck = document.createElement('button');
    zurueck.textContent = '← Alle Ordner'; zurueck.style.marginBottom = '.8rem';
    zurueck.addEventListener('click', () => { state.offenerOrdner = null; zeichneOrdner(); });
    host.appendChild(zurueck);

    const fam = (s.art || 'streamer') === 'familie';
    const kopf = document.createElement('div'); kopf.className = 'ord-aud' + (fam ? ' familie' : '');
    kopf.innerHTML = '<b style="font-size:1.1rem">' + esc(s.bigoId) + '</b> '
      + (fam ? '<span class="fam-pill">Familie</span> ' : '') + ordPill(s.status)
      + '<div class="ometa">' + esc(s.name || 'Name unbekannt') + (s.alter ? ' · ' + esc(s.alter) + ' Jahre' : '')
      + (s.notiz ? '<br>Notiz: ' + esc(s.notiz) : '') + '</div>';
    // Nur Admins entscheiden, wer zur Familie gehört.
    if (state.isAdmin) {
      const zeile = document.createElement('div');
      zeile.style.cssText = 'margin-top:.7rem;display:flex;gap:.5rem;flex-wrap:wrap;align-items:center';
      const um = document.createElement('button');
      um.textContent = fam ? '➖ Aus der Familie nehmen' : '👨‍👩‍👧 Zur Familie hinzufügen';
      um.addEventListener('click', async () => {
        um.disabled = true;
        const r = await api('POST', '/api/streamer', { id: s.id, art: fam ? 'streamer' : 'familie' });
        um.disabled = false;
        if (r.status !== 200) { toast('Hat nicht geklappt.'); return; }
        toast(fam ? 'Aus der Familie genommen.' : 'Zur Familie hinzugefügt.');
        const rr = await api('GET', '/api/streamers');
        state.ordner = (rr.body && rr.body.streamers) || [];
        zeichneOrdner();
      });
      zeile.appendChild(um);
      kopf.appendChild(zeile);
    }
    host.appendChild(kopf);

    host.appendChild(vermerkeBlock(s));
    host.appendChild(zugriffeBlock(s));

    (s.auditions || []).forEach((a) => {
      const auf = a.aufnahme;
      const erg = a.ergebnis === 'approved' ? '<span class="wait-pill ok">✓ freigegeben</span>'
        : a.ergebnis === 'rejected' ? '<span class="wait-pill no">✖ abgelehnt</span>'
          : '<span class="wait-pill warn">offen</span>';
      const aufTxt = !auf ? '<span class="muted">keine Aufnahme</span>'
        : '🎬 ' + Math.floor((auf.sekunden || 0) / 60) + ':' + pad((auf.sekunden || 0) % 60) + ' · '
          + (auf.auswertung === 'ok' ? '<span class="wait-pill ok">brauchbar</span>'
            : auf.auswertung === 'bad' ? '<span class="wait-pill no">nicht brauchbar</span>'
              : '<span class="wait-pill warn">nicht ausgewertet</span>')
          + (auf.begruendung ? ' <span class="muted">' + esc(auf.begruendung) + '</span>' : '');
      const d = document.createElement('div'); d.className = 'ord-aud';
      d.innerHTML = '<div style="display:flex;justify-content:space-between;gap:.6rem;flex-wrap:wrap">'
        + '<b>Audition vom ' + esc(new Date(a.erstelltAm).toLocaleString('de-DE')) + '</b>' + erg + '</div>'
        + '<div class="ometa">Prüfer: ' + esc(a.pruefer || '—') + ' · Nummer: ' + esc(a.zugangsnummer || '—')
        + '<br>' + esc(a.ausweisart || 'Ausweis unbekannt') + ' · Nr.: ' + esc(a.ausweisnummer || '—')
        + (a.ablehnungsgrund ? '<br>Grund: ' + esc(a.ablehnungsgrund) : '') + '</div>'
        + '<div style="margin-top:.45rem">' + aufTxt + '</div>'
        + (auf ? '<video controls preload="metadata" src="/api/recording?id=' + encodeURIComponent(auf.id)
            + '&token=' + encodeURIComponent(state.token) + '"></video>' : '')
        + ausweisBilder(a)
        + hakenListe(a)
        + wortlaut(a)
        + ((a.protokoll || []).length ? '<div class="ord-prot"><b>Protokoll</b>'
            + a.protokoll.map((e) => '<div style="padding:.3rem 0">' + esc(e.text)
              + '<small>' + esc(e.autor || '') + ' · ' + esc(new Date(e.am).toLocaleString('de-DE')) + '</small></div>').join('')
            + '</div>' : '');
      host.appendChild(d);
    });
  }
  // ---- Was in einer Audition steckt, gehört auch in den Ordner ------------
  // Ausweisbilder, abgehakte Fragen und der Wortlaut, der an dem Tag galt.
  // Die Bilder liegen bei der Akte; abgeholt werden sie über deren Nummer.
  function ausweisBilder(a) {
    const bilder = (a.dateien || []).filter((d) => d.art === 'ausweis' && d.dateiname);
    if (!bilder.length || !a.auditionId) return '';
    return '<div class="ord-bilder">' + bilder.map((d) => {
      const src = '/api/doc?id=' + encodeURIComponent(a.auditionId)
        + '&file=' + encodeURIComponent(d.dateiname) + '&token=' + encodeURIComponent(state.token);
      return '<figure><a href="' + src + '" target="_blank" rel="noopener">'
        + '<img src="' + src + '" alt="" loading="lazy"></a>'
        + '<figcaption>' + esc(d.bezeichnung || 'Bild') + '</figcaption></figure>';
    }).join('') + '</div>';
  }
  function hakenListe(a) {
    const l = Array.isArray(a.checkliste) ? a.checkliste : [];
    if (!l.length) return '';
    return '<details class="ord-klapp"><summary>\u2705 Abgehakte Fragen (' + l.length + ')</summary>'
      + '<ul class="ord-haken">' + l.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></details>';
  }
  function wortlaut(a) {
    const t = a.texte || {};
    const teil = (titel, text) => (text
      ? '<details class="ord-klapp"><summary>' + titel + '</summary>'
        + '<div class="ord-wortlaut">' + esc(text) + '</div></details>' : '');
    const beides = teil('\ud83d\udcd6 Vorlese-Text (die gesprochene Einwilligung)', t.vorlese)
      + teil('\ud83d\udc4b Begr\u00fc\u00dfung / Ablauf', t.begruessung);
    return beides || '<div class="muted" style="margin-top:.4rem;font-size:.78rem">'
      + 'Wortlaut nicht mitgespeichert \u2013 Audition von vor dieser \u00c4nderung.</div>';
  }

  // ---- Kennen wir die Person schon? ---------------------------------------
  // Der Bewerber gibt seine BIGO-ID beim Reinkommen an; der Server sieht damit
  // sofort nach. Der Prüfer weiss also schon in der Warteschlange, ob er einen
  // bestehenden Ordner vor sich hat - und liest vorher die Vermerke.
  function bekanntPille(w) {
    if (!w.bekannt) return '';
    return ' <span class="wait-pill bekannt">\ud83d\udcc1 schon im Ordner</span>';
  }
  function bekanntZeile(w) {
    const t = w.bekannt; if (!t) return '';
    const teile = [];
    teile.push(t.auditionen + ' Audition' + (t.auditionen === 1 ? '' : 'en'));
    if (t.status) teile.push('Status: ' + t.status);
    if (t.vermerke) teile.push(t.vermerke + ' Vermerk' + (t.vermerke === 1 ? '' : 'e'));
    if (t.art === 'familie') teile.push('Familie');
    return '<br><span class="bekannt-info">\ud83d\udcc1 ' + esc(t.name || t.bigoId) + ' \u2013 '
      + esc(teile.join(' \u00b7 ')) + '</span>';
  }

  // ---- Ausweisdaten schon im Warteraum -------------------------------------
  // Wer wartet, kann die Zeit nutzen. Der Pruefer bekommt die Angaben beim
  // Verbinden uebertragen und muss im Gespraech nichts mehr abtippen.
  function vorabPaket() {
    const w = (id) => { const e = $(id); return e ? e.value.trim() : ''; };
    return {
      kind: 'profile',
      bigoName: (state.profile && state.profile.bigoName) || '',
      age: (state.profile && state.profile.age) || '',
      ausweisName: w('vaName'), ausweisArt: w('vaArt'), ausweisNr: w('vaNr'),
      // Selbstauskunft des Bewerbers: volljaehrig und echter Ausweis. Ersetzt
      // die Pruefung nicht - der Pruefer sieht sie sich trotzdem an -, macht
      // aber sichtbar, was der Bewerber zugesichert hat.
      echtBestaetigt: !!($('vaEcht') && $('vaEcht').checked),
    };
  }
  function vorabStand() {
    const box = document.querySelector('.vorab'); if (!box) return;
    const p = vorabPaket();
    const fertig = !!(p.ausweisName && p.ausweisArt && p.ausweisNr && p.echtBestaetigt);
    box.classList.toggle('fertig', fertig);
    const st = $('vaStatus');
    if (st) st.textContent = fertig
      ? '✓ Alles da – der Prüfer bekommt es beim Gespräch automatisch.'
      : (p.ausweisName && p.ausweisArt && p.ausweisNr && !p.echtBestaetigt)
        ? 'Bitte noch die Erklärung zu Alter und Echtheit bestätigen.'
        : 'Wird beim Gespräch automatisch übermittelt.';
    // Sitzt schon ein Prüfer im Raum? Dann gleich nachreichen.
    dcBroadcast(p);
  }
  ['vaName', 'vaArt', 'vaNr', 'vaEcht'].forEach((id) => {
    const el = $(id); if (!el) return;
    el.addEventListener('change', vorabStand);
    el.addEventListener('blur', vorabStand);
  });
  if ($('vaBilder')) $('vaBilder').addEventListener('click', () => {
    // Fuehrt in denselben Ablauf wie im Gespraech - die Bilder warten dann
    // auf den Pruefer und gehen los, sobald er da ist.
    const b = $('upFront'); if (b) b.click();
  });

  // ---- Selfie mit Ausweis: aus der laufenden Kamera --------------------------
  // Bewusst kein Datei-Upload: Das Bild entsteht hier und jetzt aus dem
  // eigenen Kamerabild. Ein altes Foto oder eine Montage kommt so nicht
  // hinein. Der Countdown gibt Zeit, den Ausweis richtig zu halten.
  function selfieBuehne() { return document.querySelector('.selfie-buehne'); }
  function selfieKameraAn() {
    const v = $('selfieVideo');
    if (!v || !state.localStream) return;
    if (v.srcObject !== state.localStream) { v.srcObject = state.localStream; v.play().catch(() => {}); }
  }
  function selfieAufnehmen() {
    const v = $('selfieVideo');
    if (!v || !v.videoWidth) { toast('Kamera ist noch nicht bereit – kurz warten.'); return; }
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    const url = c.toDataURL('image/jpeg', 0.9);
    $('selfieVorschau').src = url;
    selfieBuehne().classList.add('zeigt');
    state.selfieEntwurf = url;
    $('selfieStart').style.display = 'none';
    $('selfieNochmal').style.display = '';
    $('selfieOk').style.display = '';
    $('selfieStatus').textContent = 'Sieht man dein Gesicht UND den Ausweis deutlich? Dann „Passt so".';
    $('selfieStatus').classList.remove('ok');
  }
  function selfieCountdown() {
    selfieKameraAn();
    const k = $('selfieCount'); if (!k) return;
    let n = 3;
    k.textContent = n; k.classList.add('an');
    $('selfieStart').disabled = true;
    const t = setInterval(() => {
      n--;
      if (n > 0) { k.textContent = n; return; }
      clearInterval(t);
      k.classList.remove('an');
      $('selfieStart').disabled = false;
      selfieAufnehmen();
    }, 1000);
  }
  function selfieVerwerfen() {
    state.selfieEntwurf = '';
    selfieBuehne().classList.remove('zeigt');
    $('selfieStart').style.display = '';
    $('selfieNochmal').style.display = 'none';
    $('selfieOk').style.display = 'none';
    $('selfieStatus').textContent = 'Noch kein Bild aufgenommen.';
    $('selfieStatus').classList.remove('ok');
    selfieKameraAn();
  }
  function selfieUebernehmen() {
    const url = state.selfieEntwurf; if (!url) return;
    const label = 'Selfie mit Ausweis';
    state.myUploads = state.myUploads || [];
    // Ein zweiter Versuch ersetzt den ersten - sonst sammeln sich Fehlgriffe.
    state.myUploads = state.myUploads.filter((d) => d.label !== label);
    state.myUploads.push({ label, dataUrl: url });
    addShot('guestShots', label, url);
    sendDocAll(label, url);              // Prüfer im Raum bekommt es sofort
    $('selfieOk').style.display = 'none';
    $('selfieStatus').textContent = '✓ Gespeichert. Der Prüfer bekommt es beim Gespräch.';
    $('selfieStatus').classList.add('ok');
    vorabStand();
  }
  if ($('selfieStart')) $('selfieStart').addEventListener('click', selfieCountdown);
  if ($('selfieNochmal')) $('selfieNochmal').addEventListener('click', selfieVerwerfen);
  if ($('selfieOk')) $('selfieOk').addEventListener('click', selfieUebernehmen);

  async function refreshWaiting() {
    const r = await api('GET', '/api/waiting');
    if (r.status === 200) renderWaiting(r.body.waiting || [], r.body);
  }
  // Wartezeit lesbar machen
  function sinceText(sec) {
    if (sec < 60) return sec + ' Sek.';
    const m = Math.floor(sec / 60);
    return m + (m === 1 ? ' Minute' : ' Minuten');
  }
  function renderWaiting(list, info) {
    const queue = list.filter((w) => !w.busy);
    const running = list.filter((w) => w.busy);
    state.letzteWarteschlange = { free: queue.length, running: running.length };
    if (state.bereich === 'uebersicht') zeichneKacheln();
    $('statWaiting').textContent = queue.length;
    $('statRunning').textContent = running.length;
    $('takeNextBtn').disabled = queue.length === 0;
    $('takeNextBtn').textContent = queue.length ? '▶ Nächsten annehmen (' + queue.length + ')' : '▶ Niemand wartet';

    // --- Warteschlange (Mitte) ---
    const el = $('waitingList'); el.innerHTML = '';
    if (!queue.length) {
      el.innerHTML = '<div class="deck-empty">Niemand wartet gerade.<br>Erzeuge links eine <b>Zugangsnummer</b> und gib sie an einen Bewerber weiter.</div>';
    } else {
      queue.forEach((w, i) => {
        const secs = typeof w.waitingSec === 'number' ? w.waitingSec : Math.max(0, Math.round((Date.now() - w.joinedAt) / 1000));
        const div = document.createElement('div');
        div.className = 'deck-card' + (i === 0 ? ' next' : '');
        const pill = '<span class="wait-pill' + (secs > 180 ? ' long' : '') + '">⏱ ' + sinceText(secs) + '</span>';
        div.innerHTML = '<div class="who"><b>' + esc(w.code) + '</b> ' + pill + bekanntPille(w)
          + '<div class="meta">' + (i === 0 ? 'Als Nächster dran' : 'Platz ' + (i + 1) + ' in der Schlange')
          + (w.bigoId ? ' · BIGO-ID ' + esc(w.bigoId) : '')
          + (w.note ? ' · ' + esc(w.note) : '')
          + bekanntZeile(w) + '</div></div>';
        const acts = document.createElement('div'); acts.className = 'acts';
        const b = document.createElement('button');
        b.className = 'primary'; b.textContent = '📞 Abholen';
        b.addEventListener('click', () => joinRoom(w.code, false));
        acts.appendChild(b); div.appendChild(acts); el.appendChild(div);
      });
    }

    // --- Laufende Gespräche (rechts) ---
    const rl = $('runningList'); if (!rl) return;
    rl.innerHTML = '';
    if (!running.length) {
      rl.innerHTML = '<div class="deck-empty">Gerade läuft kein Gespräch.</div>';
      return;
    }
    running.forEach((w) => {
      const div = document.createElement('div'); div.className = 'deck-card busy';
      const wer = (w.hosts && w.hosts.length) ? w.hosts.join(', ') : (w.claimedBy || 'wird geholt');
      div.innerHTML = '<div class="who"><b>' + esc(w.code) + '</b> '
        + (w.live ? '<span class="wait-pill live">● läuft</span>' : '<span class="wait-pill">wird geholt</span>')
        + '<div class="meta">Prüfer: ' + esc(wer) + '</div></div>';
      const acts = document.createElement('div'); acts.className = 'acts';
      const b = document.createElement('button');
      b.className = 'good'; b.textContent = '➕ Dazu';
      b.title = 'Du kommst stumm dazu';
      b.addEventListener('click', () => joinRoom(w.code, true));
      acts.appendChild(b); div.appendChild(acts); rl.appendChild(div);
    });
  }
  if ($('takeNextBtn')) $('takeNextBtn').addEventListener('click', async () => {
    const b = $('takeNextBtn'); b.disabled = true;
    const r = await api('POST', '/api/waiting/next', {});
    if (r.status === 200 && r.body.code) { joinRoom(r.body.code, false); return; }
    b.disabled = false;
    toast(r.status === 404 ? 'Gerade wartet niemand.' : 'Konnte niemanden übernehmen.');
    refreshWaiting();
  });

  async function joinRoom(code, alreadyRunning) {
    if (!alreadyRunning) {
      const claim = await api('POST', '/api/waiting/claim', { code });
      if (claim.status !== 200) { toast(claim.body && claim.body.by ? 'Wird gerade von ' + claim.body.by + ' übernommen.' : 'Bewerber nicht mehr verfügbar.'); refreshWaiting(); return; }
    }
    clearInterval(state.waitingTimer); state.waitingTimer = 0;
    if (!(await startCamera())) { if (!alreadyRunning) api('POST', '/api/waiting/release', { code }); openWaiting(); toast('Kein Zugriff auf Kamera/Mikrofon.'); return; }
    state.role = 'host'; state.code = code; localTag.textContent = state.name + ' (Du)';
    $('waitingView').style.display = 'none';
    // Wer zu einem laufenden Gespräch dazukommt, startet stumm – so wird der
    // Bewerber nicht unterbrochen. Freischalten jederzeit über „Mikro an".
    if (alreadyRunning) { setMic(false); toast('Du bist stumm beigetreten – tippe auf „Mikro an", wenn du sprechen willst.'); }
    else setMic(true);
    startRoom();
  }
  // Bewerber-Link: IMMER auf die Bewerber-Seite zeigen – nie auf die Prüfer-
  // Subdomain/den Prüfer-Pfad (sonst landet der Bewerber im Mitarbeiter-Login).
  function applicantLink(code) {
    const host = location.host.replace(/^(pruefer|admin)\./i, 'ident.');
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
  // Bewerber bestimmt das Tempo selbst – flüssiges Scrollen per requestAnimationFrame.
  let promptRAF = null, promptPos = 0, promptLast = 0;
  async function loadScript() { try { const r = await api('GET', '/api/script'); if (r.status === 200 && $('prompterText')) $('prompterText').textContent = r.body.script || ''; } catch {} }
  function prompterStop() { if (promptRAF) cancelAnimationFrame(promptRAF); promptRAF = null; if ($('prompterToggle')) $('prompterToggle').textContent = '▶ Start'; }
  function prompterStart() {
    const box = $('prompterBox'); if (promptRAF || !box) return;
    $('prompterToggle').textContent = '⏸ Pause';
    promptPos = box.scrollTop; promptLast = 0;
    const step = (ts) => {
      if (!promptLast) promptLast = ts;
      const dt = Math.min(80, ts - promptLast); promptLast = ts;
      const speed = parseInt($('prompterSpeed').value, 10) || 4;
      promptPos += speed * 0.02 * dt; // px pro ms, vom Tempo skaliert
      box.scrollTop = promptPos;
      if (box.scrollTop + box.clientHeight >= box.scrollHeight - 1) { prompterStop(); return; }
      promptRAF = requestAnimationFrame(step);
    };
    promptRAF = requestAnimationFrame(step);
  }
  if ($('prompterToggle')) $('prompterToggle').addEventListener('click', () => (promptRAF ? prompterStop() : prompterStart()));
  if ($('prompterReset')) $('prompterReset').addEventListener('click', () => { prompterStop(); promptPos = 0; $('prompterBox').scrollTop = 0; });
  if ($('prompterSpeed')) {
    try { const sv = localStorage.getItem('ident.prompterSpeed'); if (sv) $('prompterSpeed').value = sv; } catch {}
    const showSpeed = () => { if ($('prompterSpeedVal')) $('prompterSpeedVal').textContent = $('prompterSpeed').value; };
    showSpeed();
    $('prompterSpeed').addEventListener('input', () => { showSpeed(); try { localStorage.setItem('ident.prompterSpeed', $('prompterSpeed').value); } catch {} });
  }
  // Manuelles Scrollen mit dem Auto-Scroll synchronisieren (Bewerber darf jederzeit
  // selbst scrollen; Auto-Scroll macht dann von dort weiter).
  if ($('prompterBox')) $('prompterBox').addEventListener('scroll', () => {
    const box = $('prompterBox');
    if (Math.abs(box.scrollTop - promptPos) > 3) promptPos = box.scrollTop; // vom Nutzer bewegt
  }, { passive: true });
  loadScript();

  // ================= RAUM / WebRTC =================
  function startRoom() {
    state.caseDone = false;
    $('lobby').style.display = 'none'; $('waitingView').style.display = 'none';
    $('room').classList.add('active');
    setupRoleUI();
    loadIce().then((ice) => { state.iceServers = ice; connectSignaling(); });
    $('bannerText').textContent = state.role === 'host' ? 'Warte auf den Bewerber …' : 'Warte auf den Prüfer …';
    if (state.role === 'guest') wroomAn();
  }
  // ================= WARTEZIMMER DES BEWERBERS =================
  // Solange kein Prüfer da ist, prüft der Bewerber hier selbst Kamera, Mikrofon,
  // Licht und Verbindung. Ein totes Mikrofon ist der häufigste Grund, warum ein
  // Video-Gespräch scheitert – das soll vorher auffallen, nicht mittendrin.
  let wroomT = null, wroomAudio = null, wroomStart = 0;
  function setzeCheck(id, zustand, text) {
    const el = $(id); if (!el) return;
    el.classList.remove('ok', 'warn', 'bad');
    if (zustand) el.classList.add(zustand);
    const m = $(id + 'Msg'); if (m && text != null) m.textContent = text;
  }
  function wroomAn() {
    const box = $('wroom'); if (!box || state.role !== 'guest') return;
    box.style.display = '';
    wroomStart = Date.now();
    clearInterval(wroomT);
    wroomT = setInterval(() => {
      const s = Math.floor((Date.now() - wroomStart) / 1000);
      if ($('wroomTimer')) $('wroomTimer').textContent = pad(Math.floor(s / 60)) + ':' + pad(s % 60);
      if (s === 120 && $('wroomSub')) $('wroomSub').textContent = 'Es dauert heute etwas länger – bleib bitte einfach hier, wir kommen zu dir.';
    }, 500);
    pruefeKamera();
    pruefeMikro();
    pruefeLicht();
    selfieKameraAn();
  }
  function wroomAus() {
    const box = $('wroom'); if (box) box.style.display = 'none';
    clearInterval(wroomT); wroomT = null;
    if (wroomAudio) { try { wroomAudio.ctx.close(); } catch {} wroomAudio = null; }
  }
  function pruefeKamera() {
    const t = state.localStream && state.localStream.getVideoTracks()[0];
    if (t && t.readyState === 'live' && !t.muted) {
      const s = t.getSettings ? t.getSettings() : {};
      setzeCheck('wcCam', 'ok', s.width ? 'läuft, ' + s.width + '×' + s.height : 'läuft');
    } else setzeCheck('wcCam', 'bad', 'kein Bild – Kamera freigeben');
  }
  function pruefeMikro() {
    const t = state.localStream && state.localStream.getAudioTracks()[0];
    if (!t || t.readyState !== 'live') { setzeCheck('wcMic', 'bad', 'kein Mikrofon gefunden'); return; }
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const an = ctx.createAnalyser(); an.fftSize = 512;
      ctx.createMediaStreamSource(state.localStream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      wroomAudio = { ctx, an, gehoert: false };
      const tick = () => {
        if (!wroomAudio || !wroomT) return;
        an.getByteTimeDomainData(buf);
        let max = 0;
        for (let i = 0; i < buf.length; i++) { const d = Math.abs(buf[i] - 128); if (d > max) max = d; }
        const p = Math.min(100, Math.round(max / 40 * 100));
        if ($('wcMicBar')) $('wcMicBar').style.width = p + '%';
        if (p > 18 && !wroomAudio.gehoert) {
          wroomAudio.gehoert = true;
          setzeCheck('wcMic', 'ok', 'Ton kommt an – alles gut');
        } else if (!wroomAudio.gehoert && t.enabled === false) {
          setzeCheck('wcMic', 'warn', 'Mikrofon ist stumm geschaltet');
        }
        requestAnimationFrame(tick);
      };
      setzeCheck('wcMic', 'warn', 'Sag mal kurz „Hallo“');
      tick();
    } catch { setzeCheck('wcMic', 'warn', 'Ton kann hier nicht geprüft werden'); }
  }
  // Helligkeit aus einem Videobild schätzen: zu dunkel ist der zweite häufige
  // Grund, warum ein Ausweis auf der Aufnahme später nicht lesbar ist.
  function pruefeLicht() {
    if (!wroomT) return;
    const v = localVideo;
    if (!v || !v.videoWidth) { setTimeout(pruefeLicht, 700); return; }
    try {
      const c = document.createElement('canvas'); c.width = 48; c.height = 27;
      const cx = c.getContext('2d'); cx.drawImage(v, 0, 0, 48, 27);
      const d = cx.getImageData(0, 0, 48, 27).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
      const hell = sum / (d.length / 4);
      if (hell < 45) setzeCheck('wcLight', 'bad', 'zu dunkel – setz dich ans Licht');
      else if (hell < 70) setzeCheck('wcLight', 'warn', 'etwas dunkel – Licht von vorne hilft');
      else if (hell > 225) setzeCheck('wcLight', 'warn', 'sehr hell – Gegenlicht vermeiden');
      else setzeCheck('wcLight', 'ok', 'gut ausgeleuchtet');
    } catch { setzeCheck('wcLight', 'warn', 'kann nicht geprüft werden'); }
    setTimeout(pruefeLicht, 4000);
  }

  function zeigeRec(an) { const el = $('recInfo'); if (el) el.classList.toggle('on', !!an); }

  // Aufnahme läuft von selbst los, sobald der Bewerber im Bild ist.
  function autoRec() {
    if (state.recorder || state.recStarted) return;
    state.recStarted = true;
    setTimeout(() => { if (!state.recorder) { try { startRec(); } catch {} } }, 1200);
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
    closeAllPeers(); state.myUploads = state.myUploads || []; state.leaving = false;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}`); state.ws = ws;
    // BIGO-ID und Alter gehen gleich mit: Der Server schaut damit nach, ob es
    // die Person schon gibt, und der Prüfer sieht es in der Warteschlange -
    // bevor er das Gespräch annimmt, nicht erst danach.
    ws.onopen = () => ws.send(JSON.stringify({
      type: 'join', room: state.code, role: state.role, token: state.token || '', name: state.name,
      bigo: (state.profile && state.profile.bigoName) || '', alter: (state.profile && state.profile.age) || '',
    }));
    ws.onmessage = async (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      switch (m.type) {
        case 'joined':
          state.role = m.role; state.selfId = m.peerId; setupRoleUI();
          setzeCheck('wcNet', 'ok', 'Verbindung steht');
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
    ws.onclose = () => {
      if (state.leaving || !$('room').classList.contains('active')) { sysMsg('Verbindung zum Server getrennt.'); return; }
      sysMsg('Verbindung unterbrochen – neuer Versuch …'); $('bannerText').textContent = 'Verbindung wird wiederhergestellt …';
      setzeCheck('wcNet', 'warn', 'kurz unterbrochen – wir versuchen es erneut');
      clearTimeout(state.reconnectT); state.reconnectT = setTimeout(() => { if (!state.leaving && $('room').classList.contains('active')) connectSignaling(); }, 2500);
    };
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
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'connected') { tuneQuality(pc); $('bannerText').textContent = 'Verbunden.'; }
      else if (s === 'failed') { $('bannerText').textContent = 'Verbindung wird wiederhergestellt …'; if (P.initiator) { try { pc.restartIce(); } catch {} } }
      else if (s === 'disconnected') { $('bannerText').textContent = 'Verbindung instabil …'; }
    };
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
      if (state.role === 'guest') { toast('🎬 Es geht los – der Prüfer ist jetzt da!'); wroomAus(); }
      // Der Bewerber hat der Aufnahme ausdrücklich zugestimmt – also läuft sie
      // von selbst, sobald das Gespräch beginnt. Niemand muss daran denken.
      if (state.role === 'host' && P.role === 'guest') autoRec();
    } else { addTile(peerId, P.name || (P.role === 'host' ? 'Prüfer' : 'Bewerber'), stream); }
    // Hatte der andere die Kamera schon aus, bevor sein Bild hier ankam,
    // dann gleich die Meldung setzen statt eines schwarzen Vierecks.
    if (P.camAus) zeigeCamAus(state.mainPeerId === peerId ? 'remote' : peerId, true, P.name || (P.role === 'host' ? 'Prüfer' : 'Bewerber'));
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
      zeigeCamAus('remote', false);
      for (const [pid, pp] of state.peers) { if (pp.stream && isMainRole(pp.role)) { removeTile(pid); attachStream(pid, pp.stream); break; } }
      if (!state.mainPeerId) {
        remoteWaiting.style.display = '';
        remoteWaiting.textContent = state.role === 'guest' ? 'Warte auf den Prüfer …' : 'Warte auf Teilnehmer …';
        // Prüfer ist weg -> der Bewerber sitzt wieder im Wartezimmer.
        if (state.role === 'guest') { zeigeRec(false); wroomAn(); }
      }
    }
  }
  function closeAllPeers() { if (state.peers) state.peers.forEach((P) => { try { P.pc.close(); } catch {} }); state.peers = new Map(); state.mainPeerId = null; if ($('vextras')) $('vextras').innerHTML = ''; if (remoteVideo) remoteVideo.srcObject = null; }
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
        if (state.profile) dcSendTo(dc, vorabPaket());
        (state.myUploads || []).forEach((d) => sendDocTo(dc, d.label, d.dataUrl)); // auch später dazugekommene Prüfer bekommen die Bilder
        $('guideStatus').textContent = 'Verbunden mit dem Prüfer. Bitte lade die Bilder hoch.';
      }
      // Wer neu dazukommt, soll sofort wissen, ob meine Kamera gerade aus ist
      // und ob aufgezeichnet wird – sonst sieht er ein schwarzes Bild ohne Grund.
      if (!camAn()) dcSendTo(dc, { kind: 'cam', on: false });
      if (state.recorder) dcSendTo(dc, { kind: 'rec', on: true });
    };
    dc.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      const key = peerId + ':' + m.id;
      if (m.kind === 'chat') addChat(m.text, false);
      else if (m.kind === 'doc-start') incoming[key] = { label: m.label, n: m.n, parts: [] };
      else if (m.kind === 'doc-part') { const it = incoming[key]; if (!it) return; it.parts[m.i] = m.part; if (it.parts.filter(Boolean).length === it.n) { onDocReceived(it.label, it.parts.join('')); delete incoming[key]; } }
      else if (m.kind === 'result') onResult(m.result);
      else if (m.kind === 'profile') {
        // Der Bewerber hat im Warteraum schon eingetragen, was im Ausweis
        // steht. Der Pruefer bekommt das Formular ausgefuellt - er prueft nur
        // noch, statt im Gespraech zu tippen.
        const setz = (id, wert) => { if (wert && !$(id).value) $(id).value = wert; };
        setz('vBigoName', m.bigoName);
        setz('vAge', m.age);
        setz('vName', m.ausweisName);
        setz('vDocType', m.ausweisArt);
        setz('vDocNumber', m.ausweisNr);
        if (m.ausweisName || m.ausweisNr) {
          const z = $('zusicherung');
          if (z) {
            z.style.display = '';
            z.className = 'zusicherung ' + (m.echtBestaetigt ? 'ja' : 'nein');
            z.innerHTML = m.echtBestaetigt
              ? '✓ <b>18+ und Echtheit zugesichert.</b> Der Bewerber hat erklärt, volljährig zu sein und '
                + 'einen echten, eigenen Ausweis zu zeigen. <b>Bitte im Bild überprüfen.</b>'
              : '⚠️ <b>Erklärung fehlt.</b> Der Bewerber hat 18+ und Echtheit noch nicht bestätigt – bitte nachfragen.';
          }
        }
        personSuchen();   // gleich nachsehen, ob wir die Person kennen
      }
      // Der Bewerber soll sehen, wenn aufgezeichnet wird – er hat zugestimmt,
      // also darf er es auch jederzeit erkennen.
      else if (m.kind === 'rec') zeigeRec(!!m.on);
      // Gegenüber hat die Kamera aus- oder wieder eingeschaltet.
      else if (m.kind === 'cam') {
        const P = state.peers.get(peerId);
        const wer = P ? (P.name || (P.role === 'host' ? 'Prüfer' : 'Bewerber')) : 'Gegenüber';
        if (P) P.camAus = !m.on;
        zeigeCamAus(state.mainPeerId === peerId ? 'remote' : peerId, !m.on, wer);
      }
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

  // ---- Abgleich beim Ausfuellen der Akte -----------------------------------
  // Waehrend der Pruefer die Ausweisdaten eintippt, wird nachgesehen, ob es
  // die Person schon gibt. Drei Wege: BIGO-ID, Ausweisnummer, Name + Alter.
  // Die Ausweisnummer findet auch jemanden, der mit einer neuen BIGO-ID
  // wiederkommt - genau dann muss der Pruefer stutzig werden.
  let sucheT = 0, letzteSuche = '';
  function personKasten() {
    let k = $('personTreffer');
    if (!k) {
      k = document.createElement('div');
      k.id = 'personTreffer'; k.className = 'treffer';
      const anker = $('vBigoName');
      if (anker && anker.parentNode) anker.parentNode.insertBefore(k, anker);
    }
    return k;
  }
  async function personSuchen() {
    const daten = {
      bigoId: $('vBigoName').value.trim(),
      docNumber: $('vDocNumber').value.trim(),
      name: $('vName').value.trim(),
      age: $('vAge').value.trim(),
    };
    const schluessel = JSON.stringify(daten);
    if (schluessel === letzteSuche) return;
    letzteSuche = schluessel;
    const k = personKasten();
    if (!daten.bigoId && !daten.docNumber && !daten.name) { k.className = 'treffer'; k.innerHTML = ''; return; }
    const r = await api('POST', '/api/person-suche', daten);
    const t = r.body && r.body.treffer;
    if (!t) {
      k.className = 'treffer neu';
      k.innerHTML = '\u2728 <b>Neu bei uns.</b> Mit der Freigabe wird ein neuer Ordner angelegt.';
      return;
    }
    const wieso = t.grund === 'bigo' ? 'gleiche BIGO-ID'
      : t.grund === 'ausweis' ? 'gleiche Ausweisnummer' : 'gleicher Name und gleiches Alter';
    const zeilen = [];
    zeilen.push(t.auditionen + ' Audition' + (t.auditionen === 1 ? '' : 'en'));
    if (t.letzteAudition) zeilen.push('zuletzt ' + new Date(t.letzteAudition).toLocaleDateString('de-DE'));
    if (t.status) zeilen.push('Status: ' + t.status);
    if (t.vermerke) zeilen.push(t.vermerke + ' Vermerk' + (t.vermerke === 1 ? '' : 'e'));
    k.className = 'treffer ' + (t.sicher ? 'da' : 'vielleicht');
    k.innerHTML = (t.sicher ? '\ud83d\udcc1 <b>Kennen wir schon.</b>' : '\u2753 <b>K\u00f6nnte dieselbe Person sein.</b>')
      + ' <span class="muted">(' + esc(wieso) + ')</span>'
      + '<div class="t-name">' + esc(t.name || '\u2014') + ' \u00b7 BIGO-ID ' + esc(t.bigoId) + '</div>'
      + '<div class="t-meta">' + esc(zeilen.join(' \u00b7 ')) + '</div>'
      + (t.andereBigoId ? '<div class="t-warn">\u26a0\ufe0f Damals unter BIGO-ID <b>' + esc(t.andereBigoId)
          + '</b> \u2013 bitte nachfragen, warum sie sich ge\u00e4ndert hat.</div>' : '')
      + (t.notiz ? '<div class="t-meta">Notiz: ' + esc(t.notiz) + '</div>' : '')
      + '<div class="t-meta">' + (t.sicher
        ? 'Die Audition wird an diesen Ordner angeh\u00e4ngt, nicht neu angelegt.'
        : 'Pr\u00fcfe kurz, ob das wirklich dieselbe Person ist.') + '</div>';
  }
  ['vBigoName', 'vAge', 'vName', 'vDocNumber'].forEach((id) => {
    const el = $(id); if (!el) return;
    el.addEventListener('input', () => { clearTimeout(sucheT); sucheT = setTimeout(personSuchen, 450); });
    el.addEventListener('blur', () => { clearTimeout(sucheT); personSuchen(); });
  });

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
  // Mikro an/aus – zentral, damit auch „stumm beitreten" denselben Weg nutzt.
  function setMic(on) {
    const t = state.localStream && state.localStream.getAudioTracks()[0];
    if (t) t.enabled = !!on;
    const b = $('micBtn');
    if (b) { b.textContent = on ? '🎤 Mikro an' : '🔇 Mikro aus (stumm)'; b.classList.toggle('danger', !on); }
  }
  $('micBtn').addEventListener('click', () => { const t = state.localStream && state.localStream.getAudioTracks()[0]; if (!t) return; setMic(!t.enabled); });
  // Kamera an/aus – auch mitten im Gespräch. Der andere sieht dann eine klare
  // Meldung statt eines eingefrorenen Bildes, und in der Aufnahme steht es auch.
  $('camBtn').addEventListener('click', () => setCam(!camAn()));
  function camAn() { const t = state.localStream && state.localStream.getVideoTracks()[0]; return !!(t && t.enabled); }
  function setCam(an) {
    const t = state.localStream && state.localStream.getVideoTracks()[0]; if (!t) return;
    t.enabled = !!an;
    const b = $('camBtn');
    if (b) { b.textContent = an ? '📷 Kamera an' : '🚫 Kamera aus'; b.classList.toggle('danger', !an); }
    zeigeCamAus('local', !an, 'Du');
    dcBroadcast({ kind: 'cam', on: !!an });
  }
  // Blende über dem Bild, wenn jemand seine Kamera ausgeschaltet hat.
  function zeigeCamAus(wo, aus, name) {
    const host = wo === 'local' ? document.querySelector('.vwrap.local')
      : wo === 'remote' ? document.querySelector('.vwrap.remote')
        : document.querySelector('.vextra[data-peer="' + wo + '"]');
    if (!host) return;
    let el = host.querySelector('.camoff');
    if (!aus) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.className = 'camoff'; host.appendChild(el); }
    el.innerHTML = '<span class="co-ic">🚫</span><b>' + esc(name || 'Kamera') + '</b><span>Kamera ist aus</span>';
  }

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
      if (!lastDraw || ts - lastDraw >= 38) {
        lastDraw = ts; ctx.fillStyle = '#0d1526'; ctx.fillRect(0, 0, W, H);
        cover(ctx, remoteVideo, 0, 0, W / 2, H, gegenueberCamAus(), gegenueberName());
        cover(ctx, localVideo, W / 2, 0, W / 2, H, !camAn(), state.name || 'Prüfer');
      }
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
    zeigeRec(true); dcBroadcast({ kind: 'rec', on: true });
  }
  function stopRec() {
    if (state.recorder && state.recorder.state !== 'inactive') state.recorder.stop();
    state.recorder = null; clearInterval(state.recTimer);
    $('recBadge').classList.remove('on'); $('recBtn').disabled = false; $('stopRecBtn').disabled = true;
    zeigeRec(false); dcBroadcast({ kind: 'rec', on: false });
  }
  function cover(ctx, v, x, y, w, h, aus, wer) {
    if (aus || !v || !v.videoWidth) {
      // Kamera aus oder noch kein Bild: sauberer Platzhalter statt Standbild –
      // so ist auf der Aufnahme später klar, dass hier bewusst nichts zu sehen war.
      ctx.fillStyle = '#0d1526'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#7f8fae'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '600 20px -apple-system,Segoe UI,Roboto,sans-serif';
      ctx.fillText(aus ? (wer || 'Kamera') + ' – Kamera aus' : 'kein Bild', x + w / 2, y + h / 2);
      ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      return;
    }
    const s = Math.max(w / v.videoWidth, h / v.videoHeight);
    const dw = v.videoWidth * s, dh = v.videoHeight * s;
    ctx.drawImage(v, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }
  // Ist die Kamera des Gegenübers gerade aus?
  function gegenueberCamAus() { const P = state.mainPeerId && state.peers.get(state.mainPeerId); return !!(P && P.camAus); }
  function gegenueberName() { const P = state.mainPeerId && state.peers.get(state.mainPeerId); return P ? (P.name || (P.role === 'host' ? 'Prüfer' : 'Bewerber')) : 'Gegenüber'; }
  async function finalizeRec() {
    const blob = new Blob(state.recChunks, { type: state.recMime || 'video/webm' });
    if (state.audioCtx) { try { state.audioCtx.close(); } catch {} state.audioCtx = null; }
    const dur = state.recStart ? Math.round((Date.now() - state.recStart) / 1000) : 0;
    if (!state.token || !blob.size) return;
    try {
      const res = await fetch('/api/recording?' + new URLSearchParams({ code: state.code, dur: String(dur), ext: state.recExt }), { method: 'POST', headers: { 'Content-Type': state.recMime || 'video/webm', 'Authorization': 'Bearer ' + state.token }, body: blob });
      sysMsg(res.ok ? 'Aufnahme verschlüsselt gespeichert.' : 'Aufnahme konnte nicht gespeichert werden (HTTP ' + res.status + ').');
      if (res.ok) {
        const j = await res.json().catch(() => null);
        if (j && j.id) recCheckOeffnen(j.id, dur, blob.size);
      }
    } catch { sysMsg('Aufnahme konnte nicht übertragen werden.'); }
  }

  // ---- Aufnahme auswerten: der Prüfer entscheidet selbst, ob sie taugt -----
  // Direkt nach dem Gespräch, solange man noch reagieren kann. Das Ergebnis
  // landet als Eintrag in der Akte des Bewerbers.
  function recCheckOeffnen(id, dauer, bytes) {
    const box = $('recCheck'); if (!box) return;
    state.recCheckId = id;
    const v = $('recCheckVideo');
    // Der eigene Zugriff läuft über das Token – deshalb als Blob laden.
    fetch('/api/recording?id=' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + state.token } })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => { if (b) { if (state.recCheckUrl) URL.revokeObjectURL(state.recCheckUrl); state.recCheckUrl = URL.createObjectURL(b); v.src = state.recCheckUrl; } })
      .catch(() => {});
    const min = Math.floor(dauer / 60), sek = dauer % 60;
    $('recCheckMeta').textContent = 'Länge ' + min + ':' + pad(sek) + ' · ' + (bytes / (1024 * 1024)).toFixed(1) + ' MB · verschlüsselt gespeichert';
    $('recCheckNote').value = ''; $('recCheckMsg').textContent = '';
    box.classList.add('on');
  }
  function recCheckSchliessen() {
    const box = $('recCheck'); if (box) box.classList.remove('on');
    const v = $('recCheckVideo'); if (v) { try { v.pause(); } catch {} v.removeAttribute('src'); v.load(); }
    if (state.recCheckUrl) { URL.revokeObjectURL(state.recCheckUrl); state.recCheckUrl = ''; }
    state.recCheckId = '';
  }
  async function recCheckSenden(quality) {
    if (!state.recCheckId) { recCheckSchliessen(); return; }
    const note = $('recCheckNote').value.trim();
    if (quality === 'bad' && !note) { $('recCheckMsg').textContent = 'Bitte kurz angeben, was nicht in Ordnung war.'; return; }
    $('recCheckOk').disabled = true; $('recCheckBad').disabled = true;
    const r = await api('POST', '/api/recording-review', { id: state.recCheckId, quality, note });
    $('recCheckOk').disabled = false; $('recCheckBad').disabled = false;
    if (r.status !== 200) { $('recCheckMsg').textContent = 'Konnte nicht gespeichert werden. Bitte noch einmal.'; return; }
    toast(quality === 'ok' ? 'Als brauchbar vermerkt.' : 'Als nicht brauchbar vermerkt.');
    sysMsg(r.body && r.body.imFall ? 'Auswertung in der Akte festgehalten.' : 'Auswertung gespeichert – die Akte wird beim Abschluss ergänzt.');
    recCheckSchliessen();
  }
  if ($('recCheckOk')) $('recCheckOk').addEventListener('click', () => recCheckSenden('ok'));
  if ($('recCheckBad')) $('recCheckBad').addEventListener('click', () => recCheckSenden('bad'));
  if ($('recCheckLater')) $('recCheckLater').addEventListener('click', recCheckSchliessen);

  // ================= VERLASSEN (Prüfer -> Warteraum) =================
  $('leaveBtn').addEventListener('click', leaveRoom);
  function leaveRoom() {
    if (state.recorder && state.recorder.state === 'recording') stopRec();
    state.leaving = true; clearTimeout(state.reconnectT); try { if (state.ws) state.ws.close(); } catch {} state.ws = null; closeAllPeers();
    if (state.localStream) { state.localStream.getTracks().forEach((t) => { try { t.stop(); } catch {} }); state.localStream = null; }
    resetForNext(); $('room').classList.remove('active'); openWaiting();
  }
  function resetForNext() {
    state.docs = []; state.snaps = []; state.pendingDocs = []; state.recChunks = []; state.recStarted = false;
    zeigeRec(false); wroomAus();
    document.querySelectorAll('.camoff').forEach((e) => e.remove());
    const cb = $('camBtn'); if (cb) { cb.textContent = '📷 Kamera an'; cb.classList.remove('danger'); }
    ['hostShots', 'snapShots', 'guestShots'].forEach((id) => $(id).innerHTML = '');
    ['vName', 'vDocNumber', 'vDocType'].forEach((id) => $(id).value = '');
    checkBoxes().forEach((c) => c.checked = false); $('approveBtn').disabled = true; $('rejectBtn').disabled = false;
    // Der Abgleich gehoert zum vorigen Bewerber - fuer den naechsten von vorn.
    letzteSuche = ''; const tk = $('personTreffer'); if (tk) { tk.className = 'treffer'; tk.innerHTML = ''; }
    $('reviewStatus').className = 'status pending'; $('reviewStatus').textContent = 'Warte auf die Bilder des Bewerbers …';
    $('okBadge').classList.remove('on'); chatLog.innerHTML = '';
    remoteVideo.srcObject = null; remoteWaiting.style.display = ''; remoteWaiting.textContent = 'Warte auf Gegenüber …';
  }

  function backToStart(errText) {
    state.leaving = true; clearTimeout(state.reconnectT); try { if (state.ws) state.ws.close(); } catch {} state.ws = null; closeAllPeers();
    if (state.localStream) { state.localStream.getTracks().forEach((t) => { try { t.stop(); } catch {} }); state.localStream = null; }
    $('room').classList.remove('active'); $('waitingView').style.display = 'none'; $('lobby').style.display = '';
    $('lobbyErr').textContent = errText || ''; resetEnter();
  }
})();
