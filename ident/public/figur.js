/* figur.js – Figuren-Baukasten (nutzt figur-core.js / window.Figuren)
 * Baukasten-UI + Speichern (lokal und – als Admin – serverseitig für alle).
 */
(function () {
  'use strict';
  var F = window.Figuren;
  var $ = function (id) { return document.getElementById(id); };

  var KEY = 'ident.figuren.v2';
  var SCRIPT_KEY = 'ident.figuren.script.v1';

  var team = loadLocal();
  var cur = 0;
  var player = null;
  var token = ''; // Admin-Token (nur im Speicher), nötig für „für alle speichern"

  // ---- Speicher (lokal) ----------------------------------------------------
  function loadLocal() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) { var arr = JSON.parse(raw); if (Array.isArray(arr) && arr.length === 3) return F.sanitizeTeam(arr); }
    } catch (e) {}
    return F.defaultTeam();
  }
  function saveLocal() { try { localStorage.setItem(KEY, JSON.stringify(team)); return true; } catch (e) { return false; } }
  function loadLocalScript() {
    try { var s = localStorage.getItem(SCRIPT_KEY); if (typeof s === 'string' && s.trim()) return s; } catch (e) {}
    return F.DEFAULT_SCRIPT;
  }
  function saveLocalScript(txt) { try { localStorage.setItem(SCRIPT_KEY, txt); return true; } catch (e) { return false; } }

  // ---- Server-Speicher -----------------------------------------------------
  // Gibt Promise<true|false> zurück (true = auch für Bewerber gespeichert)
  function saveServer() {
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch('/api/figures', {
      method: 'POST', credentials: 'same-origin', headers: headers,
      body: JSON.stringify({ figures: team, script: $('scriptBox').value })
    }).then(function (r) { return r.ok; }).catch(function () { return false; });
  }

  // ---- Baukasten-UI --------------------------------------------------------
  function buildTabs() {
    var t = $('teamTabs'); t.innerHTML = '';
    team.forEach(function (f, i) {
      var b = document.createElement('button');
      b.textContent = f.name || ('Person ' + (i + 1));
      if (i === cur) b.className = 'sel';
      b.onclick = function () { cur = i; renderAll(); };
      t.appendChild(b);
    });
  }
  function buildControls() {
    var host = $('controls'); host.innerHTML = '';
    F.CYCLERS.forEach(function (c) {
      var row = document.createElement('div'); row.className = 'ctrl';
      var lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.textContent = c.label;
      var box = document.createElement('div'); box.className = 'cyc';
      var prev = document.createElement('button'); prev.className = 'iconbtn'; prev.textContent = '‹';
      var val = document.createElement('span'); val.className = 'val';
      var next = document.createElement('button'); next.className = 'iconbtn'; next.textContent = '›';
      function paint() { val.textContent = c.opts[team[cur][c.key]]; }
      prev.onclick = function () { var n = c.opts.length; team[cur][c.key] = (team[cur][c.key] + n - 1) % n; paint(); drawPreview(); };
      next.onclick = function () { var n = c.opts.length; team[cur][c.key] = (team[cur][c.key] + 1) % n; paint(); drawPreview(); };
      paint();
      box.appendChild(prev); box.appendChild(val); box.appendChild(next);
      row.appendChild(lbl); row.appendChild(box);
      host.appendChild(row);
    });
  }
  function buildSwatches(hostId, colors, key) {
    var host = $(hostId); host.innerHTML = '';
    colors.forEach(function (col, i) {
      var sw = document.createElement('span');
      sw.className = 'sw' + (team[cur][key] === i ? ' on' : '');
      sw.style.background = col; sw.title = col;
      sw.onclick = function () { team[cur][key] = i; buildSwatches(hostId, colors, key); drawPreview(); };
      host.appendChild(sw);
    });
  }
  function drawPreview() { $('preview').innerHTML = F.renderFigure(team[cur], {}); }
  function drawVideoTeam() { if (player) player.render(); else F.renderTeamInto($('videoTeam'), team); }

  // Bild laden und verkleinern -> data-URL (kompakt).
  // Es wird bewusst NICHT zugeschnitten: Das ganze Bild bleibt erhalten,
  // den Ausschnitt wählt man danach in Ruhe mit Zoom und Verschieben.
  function resizeImage(file, size, q) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var lang = Math.max(img.width, img.height) || 1;
        var f = Math.min(1, size / lang);
        var w = Math.max(1, Math.round(img.width * f)), h = Math.max(1, Math.round(img.height * f));
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#0f1728'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        var out = c.toDataURL('image/jpeg', q), qq = q;
        while (out.length > 800000 && qq > 0.4) { qq -= 0.12; out = c.toDataURL('image/jpeg', qq); }
        resolve(out);
      };
      img.onerror = reject;
      var fr = new FileReader();
      fr.onload = function () { img.src = fr.result; };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  // ---- Zuschnitt: Zoom + Verschieben --------------------------------------
  // Man kann das Bild in der Vorschau direkt mit der Maus bzw. dem Finger
  // schieben; die drei Regler tun dasselbe für alle, die das lieber mögen.
  function cropUI() {
    var box = $('cropBox'); if (!box) return;
    var f = team[cur];
    if (!f.img) { box.style.display = 'none'; return; }
    box.style.display = '';
    if ($('cropZoom')) $('cropZoom').value = f.imgZoom == null ? 1 : f.imgZoom;
    if ($('cropX')) $('cropX').value = f.imgX == null ? 0.5 : f.imgX;
    if ($('cropY')) $('cropY').value = f.imgY == null ? 0.5 : f.imgY;
  }
  function cropSet(k, v) {
    team[cur][k] = parseFloat(v);
    drawPreview(); drawVideoTeam();
  }
  // Ziehen in der Vorschau
  function cropDrag() {
    var host = $('preview'); if (!host) return;
    var akt = null;
    function start(e) {
      var f = team[cur]; if (!f.img) return;
      var p = e.touches ? e.touches[0] : e;
      akt = { x: p.clientX, y: p.clientY, ix: f.imgX == null ? 0.5 : f.imgX, iy: f.imgY == null ? 0.5 : f.imgY,
              w: host.clientWidth || 200, h: host.clientHeight || 220 };
      if (e.cancelable) e.preventDefault();
    }
    function move(e) {
      if (!akt) return;
      var f = team[cur], z = f.imgZoom || 1;
      if (z <= 1) return;                                  // ohne Zoom gibt es nichts zu schieben
      var p = e.touches ? e.touches[0] : e;
      var dx = (p.clientX - akt.x) / (akt.w * (z - 1));
      var dy = (p.clientY - akt.y) / (akt.h * (z - 1));
      f.imgX = Math.max(0, Math.min(1, akt.ix - dx));
      f.imgY = Math.max(0, Math.min(1, akt.iy - dy));
      cropUI(); drawPreview(); drawVideoTeam();
      if (e.cancelable) e.preventDefault();
    }
    function end() { akt = null; }
    host.addEventListener('mousedown', start);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    host.addEventListener('touchstart', start, { passive: false });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
  }

  function renderAll() {
    buildTabs();
    $('figName').value = team[cur].name || '';
    $('figRole').value = team[cur].role || '';
    buildControls();
    buildSwatches('swSkin', F.SKIN, 'skin');
    buildSwatches('swHair', F.HAIR, 'hairColor');
    buildSwatches('swShirt', F.SHIRT, 'shirt');
    buildSwatches('swBg', F.BG, 'bg');
    if ($('imgHint')) $('imgHint').textContent = team[cur].img ? 'Bild aktiv – die Zeichnungs-Einstellungen unten werden dann ignoriert.' : '';
    cropUI();
    drawPreview();
    drawVideoTeam();
  }

  // ---- Init ----------------------------------------------------------------
  function init() {
    player = F.makePlayer({
      teamHost: $('videoTeam'), subtitle: $('subtitle'),
      getTeam: function () { return team; },
      getScript: function () { return $('scriptBox').value || F.DEFAULT_SCRIPT; },
      getRate: function () { return $('rate').value; },
      onState: function (playing) { $('playBtn').disabled = playing; }
    });

    $('figName').addEventListener('input', function () { team[cur].name = this.value.slice(0, 16); buildTabs(); drawVideoTeam(); });
    $('figRole').addEventListener('input', function () { team[cur].role = this.value.slice(0, 48); drawVideoTeam(); });

    $('saveBtn').onclick = function () {
      team[cur].name = ($('figName').value || '').slice(0, 16);
      team[cur].role = ($('figRole').value || '').slice(0, 48);
      var localOk = saveLocal();
      $('saveMsg').textContent = 'Speichern …'; $('saveMsg').style.color = 'var(--dim)';
      saveServer().then(function (serverOk) {
        if (serverOk) { $('saveMsg').textContent = 'Gespeichert ✓ (auch für Bewerber)'; $('saveMsg').style.color = 'var(--good)'; }
        else if (localOk) { $('saveMsg').textContent = 'Lokal gespeichert ✓ – für alle: im Admin einloggen'; $('saveMsg').style.color = 'var(--warm)'; }
        else { $('saveMsg').textContent = 'Speichern nicht möglich'; $('saveMsg').style.color = 'var(--warm)'; }
        setTimeout(function () { $('saveMsg').textContent = ''; }, 4000);
      });
      renderAll();
    };

    $('playBtn').onclick = function () { player.start(); };
    $('stopBtn').onclick = function () { player.stop(); };

    // Bild-Upload / -Entfernen
    if ($('uploadBtn')) $('uploadBtn').onclick = function () { $('figImg').click(); };
    if ($('figImg')) $('figImg').onchange = function (e) {
      var file = e.target.files && e.target.files[0]; if (!file) return;
      $('imgHint').textContent = 'Bild wird verarbeitet …';
      resizeImage(file, 720, 0.82).then(function (url) {
        team[cur].img = url;
        team[cur].imgZoom = 1.35; team[cur].imgX = 0.5; team[cur].imgY = 0.32;  // Startwert: eher aufs Gesicht
        renderAll();
        $('imgHint').textContent = 'Bild aktiv – Ausschnitt unten einstellen, dann „Team speichern".';
      }).catch(function () { $('imgHint').textContent = 'Bild konnte nicht geladen werden.'; });
      e.target.value = '';
    };
    if ($('clearImgBtn')) $('clearImgBtn').onclick = function () {
      team[cur].img = ''; team[cur].imgZoom = 1; team[cur].imgX = 0.5; team[cur].imgY = 0.5; renderAll();
    };

    // Zuschnitt-Regler
    ['cropZoom:imgZoom', 'cropX:imgX', 'cropY:imgY'].forEach(function (paar) {
      var t = paar.split(':'), el = $(t[0]);
      if (el) el.addEventListener('input', function () { cropSet(t[1], this.value); });
    });
    if ($('cropReset')) $('cropReset').onclick = function () {
      team[cur].imgZoom = 1; team[cur].imgX = 0.5; team[cur].imgY = 0.5; renderAll();
    };
    cropDrag();

    $('scriptBox').value = loadLocalScript();
    $('scriptSaveBtn').onclick = function () {
      var localOk = saveLocalScript($('scriptBox').value);
      $('scriptMsg').textContent = 'Speichern …'; $('scriptMsg').style.color = 'var(--dim)';
      saveServer().then(function (serverOk) {
        if (serverOk) { $('scriptMsg').textContent = 'Gespeichert ✓ (auch für Bewerber)'; $('scriptMsg').style.color = 'var(--good)'; }
        else if (localOk) { $('scriptMsg').textContent = 'Lokal gespeichert ✓'; $('scriptMsg').style.color = 'var(--warm)'; }
        else { $('scriptMsg').textContent = 'Speichern nicht möglich'; $('scriptMsg').style.color = 'var(--warm)'; }
        setTimeout(function () { $('scriptMsg').textContent = ''; }, 4000);
      });
    };
    $('scriptResetBtn').onclick = function () {
      $('scriptBox').value = F.DEFAULT_SCRIPT;
      $('scriptMsg').textContent = 'Standard-Text geladen'; $('scriptMsg').style.color = 'var(--dim)';
      setTimeout(function () { $('scriptMsg').textContent = ''; }, 2500);
    };

    // Admin-Login (optional) – ermöglicht „für alle Bewerber speichern"
    if ($('admLogin')) $('admLogin').onclick = function () {
      var msg = $('admMsg');
      msg.textContent = 'Anmeldung …'; msg.style.color = 'var(--dim)';
      fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: '', password: $('admPw').value, totp: ($('admTotp').value || '').trim() })
      }).then(function (r) { return r.json().then(function (b) { return { ok: r.ok, b: b }; }); })
        .then(function (res) {
          if (res.ok && res.b && res.b.token && res.b.role === 'admin') {
            token = res.b.token; $('admPw').value = ''; $('admTotp').value = '';
            msg.textContent = 'Angemeldet ✓ – „Team speichern" gilt jetzt für alle'; msg.style.color = 'var(--good)';
          } else {
            msg.textContent = (res.b && res.b.reason === 'bad-totp') ? 'Passwort ok, aber 2FA-Code falsch' : 'Anmeldung fehlgeschlagen';
            msg.style.color = 'var(--warm)';
          }
        }).catch(function () { msg.textContent = 'Anmeldung nicht möglich'; msg.style.color = 'var(--warm)'; });
    };

    if ('speechSynthesis' in window) { try { window.speechSynthesis.onvoiceschanged = function () {}; } catch (e) {} }

    renderAll();

    // Server-Konfiguration bevorzugen (falls vorhanden), sonst lokal/Standard
    F.loadServerConfig().then(function (cfg) {
      var changed = false;
      if (cfg.figures) { team = cfg.figures; changed = true; }
      if (cfg.script) { $('scriptBox').value = cfg.script; }
      if (changed) { cur = Math.min(cur, team.length - 1); renderAll(); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
