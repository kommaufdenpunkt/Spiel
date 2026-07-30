/* home.js – Startseite von 4EVER1.
 * Zeigt oben ein echtes Team-Foto, sofern eines hinterlegt ist (/team.jpg),
 * sonst die gezeichneten Figuren. Blendet Abschnitte beim Scrollen sanft ein.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var y = $('year'); if (y) y.textContent = new Date().getFullYear();

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---- Echtes Team-Foto, falls vorhanden -----------------------------------
  // Liegt eine Datei team.jpg (oder .png/.webp) im Ordner public, wird sie oben
  // groß gezeigt. Fehlt sie, bleiben die gezeichneten Figuren stehen.
  function tryPhoto() {
    var hero = $('heroFigs'); if (!hero) return;
    fetch('/api/site').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.teamPhoto) return;               // kein Foto -> Figuren bleiben
      hero.innerHTML = '';
      var box = document.createElement('div');
      box.className = 'team-photo';
      box.innerHTML = '<img src="' + j.teamPhoto + '" alt="Die Teamleitung von 4EVER1" loading="eager">';
      hero.appendChild(box);
    }).catch(function () {});
  }

  // ---- Gezeichnete Figuren (Rückfallebene + Team-Bereich) ------------------
  var F = window.Figuren;
  if (F) {
    var team = F.defaultTeam();
    var draw = function () {
      var hero = $('heroFigs');
      if (hero && !hero.querySelector('.team-photo')) {
        hero.innerHTML = '';
        team.forEach(function (f, i) {
          var d = document.createElement('div'); d.className = 'fig';
          d.innerHTML = F.renderFigure(f, { seed: i });
          var n = document.createElement('div'); n.className = 'nm'; n.textContent = f.name || '';
          d.appendChild(n); hero.appendChild(d);
        });
      }
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
    };
    draw();
    F.loadServerConfig().then(function (cfg) {
      if (cfg && cfg.figures) { team = cfg.figures; draw(); }
    }).catch(function () {});
  }
  tryPhoto();

  // ---- Abschnitte beim Scrollen sanft einblenden ---------------------------
  var ziele = document.querySelectorAll('section > .wrap > *, .trust-in, .hero > div');
  if ('IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function (eintraege) {
      eintraege.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -60px 0px', threshold: 0.08 });
    Array.prototype.forEach.call(ziele, function (el) { el.classList.add('reveal'); obs.observe(el); });
  }
})();
