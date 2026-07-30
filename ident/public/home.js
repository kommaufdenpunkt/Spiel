/* home.js – Startseite von 4EVER1.
 * Zeigt die Team-Figuren (dieselben wie im Warteraum) und füllt das Jahr.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var y = $('year'); if (y) y.textContent = new Date().getFullYear();

  var F = window.Figuren;
  if (!F) return;

  var team = F.defaultTeam();

  function draw() {
    // Bühne: die drei Figuren nebeneinander
    var hero = $('heroFigs');
    if (hero) {
      hero.innerHTML = '';
      team.forEach(function (f, i) {
        var d = document.createElement('div'); d.className = 'fig';
        d.innerHTML = F.renderFigure(f, { seed: i });
        var n = document.createElement('div'); n.className = 'nm'; n.textContent = f.name || '';
        d.appendChild(n); hero.appendChild(d);
      });
    }
    // Team-Bereich: mit Rolle
    var grid = $('teamGrid');
    if (grid) {
      grid.innerHTML = '';
      team.forEach(function (f, i) {
        var c = document.createElement('div'); c.className = 'member';
        c.innerHTML = F.renderFigure(f, { seed: i + 3 })
          + '<div class="nm">' + esc(f.name || '') + '</div>'
          + '<div class="role">' + esc(f.role || '') + '</div>';
        grid.appendChild(c);
      });
    }
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  draw();
  // Falls das Team im Admin angepasst wurde, die gespeicherte Fassung nachladen.
  F.loadServerConfig().then(function (cfg) {
    if (cfg && cfg.figures) { team = cfg.figures; draw(); }
  }).catch(function () {});
})();
