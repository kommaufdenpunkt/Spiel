/* home.js – Startseite von 4EVER1.TV.
 * Holt echtes Logo und Team-Foto vom Server (falls hinterlegt), zeichnet die
 * Teamleitung, kümmert sich ums Handy-Menü, den Fortschrittsbalken, die
 * hochzählenden Zahlen und das sanfte Einblenden beim Scrollen.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var y = $('year'); if (y) y.textContent = new Date().getFullYear();
  var sanft = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---- Menü auf dem Handy ---------------------------------------------------
  var burger = $('burger'), links = $('navLinks');
  function menu(auf) {
    document.body.classList.toggle('menu', auf);
    if (burger) burger.setAttribute('aria-expanded', auf ? 'true' : 'false');
  }
  if (burger) burger.addEventListener('click', function () { menu(!document.body.classList.contains('menu')); });
  if (links) links.addEventListener('click', function (e) { if (e.target.closest('a')) menu(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') menu(false); });

  // ---- Kopfzeile andocken + Fortschrittsbalken ------------------------------
  var hdr = $('hdr'), prog = $('prog'), tick = false;
  function beimScrollen() {
    var oben = window.pageYOffset || document.documentElement.scrollTop;
    if (hdr) hdr.classList.toggle('stuck', oben > 8);
    if (prog) {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      prog.style.width = (max > 0 ? Math.min(100, (oben / max) * 100) : 0) + '%';
    }
    tick = false;
  }
  window.addEventListener('scroll', function () {
    if (!tick) { tick = true; window.requestAnimationFrame(beimScrollen); }
  }, { passive: true });
  beimScrollen();

  // ---- Zahlen hochzählen ---------------------------------------------------
  function zaehlen(el) {
    var ziel = parseInt(el.getAttribute('data-count'), 10);
    if (!ziel || sanft) return;
    var start = null, dauer = 900;
    function schritt(t) {
      if (start === null) start = t;
      var p = Math.min(1, (t - start) / dauer);
      el.textContent = Math.round(ziel * (1 - Math.pow(1 - p, 3)));
      if (p < 1) window.requestAnimationFrame(schritt);
    }
    el.textContent = '0';
    window.requestAnimationFrame(schritt);
  }

  // ---- Abschnitte beim Scrollen sanft einblenden ---------------------------
  var obs = null;
  if ('IntersectionObserver' in window && !sanft) {
    obs = new IntersectionObserver(function (eintraege) {
      eintraege.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        Array.prototype.forEach.call(e.target.querySelectorAll('[data-count]'), zaehlen);
        obs.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -60px 0px', threshold: 0.08 });
  }
  function zeigen(liste) {
    if (!obs) return;
    Array.prototype.forEach.call(liste, function (el, i) {
      if (el.classList.contains('reveal')) return;
      el.classList.add('reveal');
      el.style.transitionDelay = Math.min(i, 5) * 60 + 'ms';
      obs.observe(el);
    });
  }

  // ---- Echtes Logo und Team-Foto, falls hinterlegt --------------------------
  // Liegt logo.png im Ordner public, ersetzt es das gezeichnete Zeichen oben.
  // Liegt team.jpg dort, erscheint es groß über der Teamleitung.
  function vomServer() {
    fetch('/api/site').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j) return;
      if (j.logo) {
        var art = $('brandArt');
        if (art) {
          var alt = art.querySelector('.mark-big');
          if (alt) {
            var i = new Image();
            i.className = 'logo-img'; i.alt = '4EVER1.TV'; i.src = j.logo;
            i.onload = function () { alt.replaceWith(i); };
          }
        }
        var kopf = $('brandLink');
        if (kopf) {
          var k = new Image();
          k.alt = '4EVER1.TV'; k.src = j.logo;
          k.onload = function () { kopf.innerHTML = ''; kopf.appendChild(k); };
        }
      }
      if (j.teamPhoto) {
        var host = $('teamPhoto'); if (!host) return;
        var img = new Image();
        img.alt = 'Die Teamleitung von 4EVER1.TV';
        img.onload = function () {
          var box = document.createElement('div');
          box.className = 'team-photo';
          box.appendChild(img);
          var cap = document.createElement('div');
          cap.className = 'cap';
          cap.innerHTML = '<b>Unsere Teamleitung</b><span>Drei feste Ansprechpartner für dich</span>';
          box.appendChild(cap);
          host.appendChild(box);
          zeigen([box]);
        };
        img.src = j.teamPhoto;
      }
    }).catch(function () {});
  }

  // ---- Teamleitung zeichnen ------------------------------------------------
  var F = window.Figuren;
  if (F) {
    var team = F.defaultTeam();
    var draw = function () {
      var grid = $('teamGrid'); if (!grid) return;
      grid.innerHTML = '';
      team.forEach(function (f, i) {
        var c = document.createElement('div'); c.className = 'member' + (f.img ? ' foto' : '');
        c.innerHTML = '<div class="ring">' + F.renderFigure(f, { seed: i + 3 }) + '</div>'
          + '<div class="nm">' + esc(f.name || '') + '</div>'
          + '<div class="role">' + esc(f.role || '') + '</div>';
        grid.appendChild(c);
      });
      zeigen(grid.querySelectorAll('.member'));
    };
    draw();
    F.loadServerConfig().then(function (cfg) {
      if (cfg && cfg.figures) { team = cfg.figures; draw(); }
    }).catch(function () {});
  }
  vomServer();

  zeigen(document.querySelectorAll('.sec-head, .card, .stepline, .stat, .faq details, .contact a, .cta, .phone, #teammanagement .grid > div:first-child, #voraussetzungen .grid > div, .foot > div'));
})();
