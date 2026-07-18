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

  function renderAll() {
    buildTabs();
    $('figName').value = team[cur].name || '';
    $('figRole').value = team[cur].role || '';
    buildControls();
    buildSwatches('swSkin', F.SKIN, 'skin');
    buildSwatches('swHair', F.HAIR, 'hairColor');
    buildSwatches('swShirt', F.SHIRT, 'shirt');
    buildSwatches('swBg', F.BG, 'bg');
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
