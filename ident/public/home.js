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
  // ── Sprungmarken: sofort zeigen, nicht auf Scrollen warten ───────────
  //
  // Die Einblendung haengt am IntersectionObserver – der verlangt 8 %
  // Sichtbarkeit und zieht unten 60 Pixel ab. Springt jemand ueber
  // „Jetzt bewerben" direkt zu #start, landet die Ueberschrift genau im
  // toten Winkel unter der klebenden Kopfleiste und bleibt UNSICHTBAR.
  //
  // Das Formular war da, die Ueberschrift darueber nicht: Eingabefelder
  // ohne Titel. Genau auf dem Weg, den die sieben Bewerben-Knoepfe nehmen.
  //
  // Deshalb: Wer per Sprungmarke kommt, bekommt den ganzen Abschnitt sofort.
  function sofortZeigen(ziel) {
    if (!ziel) return;
    if (ziel.classList && ziel.classList.contains('reveal')) ziel.classList.add('in');
    Array.prototype.forEach.call(ziel.querySelectorAll('.reveal'), function (el) {
      el.style.transitionDelay = '0ms';
      el.classList.add('in');
    });
    Array.prototype.forEach.call(ziel.querySelectorAll('[data-count]'), zaehlen);
  }
  function ausHash() {
    var id = (location.hash || '').replace('#', '');
    if (!id) return;
    var ziel = document.getElementById(id);
    if (ziel) setTimeout(function () { sofortZeigen(ziel); }, 60);
  }
  window.addEventListener('hashchange', ausHash);
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var ziel = document.getElementById(a.getAttribute('href').slice(1));
    if (ziel) setTimeout(function () { sofortZeigen(ziel); }, 60);
  }, true);

  function zeigen(liste) {
    if (!obs) return;
    Array.prototype.forEach.call(liste, function (el, i) {
      if (el.classList.contains('reveal')) return;
      el.classList.add('reveal');
      el.style.transitionDelay = Math.min(i, 5) * 60 + 'ms';
      obs.observe(el);
    });
  }

  // ---- Rechner: Bohnen -> geschätztes Taschengeld ---------------------------
  // Grundlage ist unser eigenes Target: 5.000 Bohnen entsprechen etwa 100 $.
  // Das ist bewusst eine Beispielrechnung und keine Zusage – der Hinweis dazu
  // steht direkt unter dem Regler auf der Seite.
  var TARGET_BOHNEN = 5000, TARGET_DOLLAR = 100;
  function rechner() {
    var reg = $('rBohnen'); if (!reg) return;
    var out = $('rOut'), val = $('rBohnenVal'), bar = $('rBar'), proz = $('rProz'), msg = $('rMsg');
    function zahl(n) { return n.toLocaleString('de-DE'); }
    function neu() {
      var bohnen = parseInt(reg.value, 10) || 0;
      var dollar = Math.round(bohnen / TARGET_BOHNEN * TARGET_DOLLAR);
      var p = Math.round(bohnen / TARGET_BOHNEN * 100);
      if (val) val.textContent = zahl(bohnen);
      if (out) out.textContent = zahl(dollar) + ' $';
      if (proz) proz.textContent = p + ' %';
      if (bar) bar.style.width = Math.min(100, p) + '%';
      if (msg) {
        msg.textContent =
          bohnen === 0 ? 'Zieh den Regler nach rechts – dann siehst du, wie sich das entwickelt.' :
          p < 35 ? 'Noch ein gutes Stück bis zum Target. Genau da helfen wir dir weiter.' :
          p < 70 ? 'Du bist auf dem Weg. Feste Streamzeiten bringen hier am meisten.' :
          p < 100 ? 'Fast am Target – das letzte Stück schaffen wir zusammen.' :
          p === 100 ? 'Target erreicht – genau da wollen wir mit dir hin.' :
          'Deutlich über dem Target. Dann reden wir über ein höheres Ziel.';
      }
    }
    reg.addEventListener('input', neu);
    neu();
  }
  rechner();

  // ---- Bewerbung absenden ----------------------------------------------
  //
  // Vorher führte jeder Bewerben-Knopf auf die Codeabfrage – wer keine
  // Zugangsnummer hatte (also jede Interessentin), war raus. Jetzt landet
  // die Anfrage bei der Teamleitung, und die schickt die Nummer.
  function bewerbung() {
    var f = document.getElementById('bewerbForm');
    if (!f) return;
    var meldung = document.getElementById('bMeldung');
    var knopf = document.getElementById('bSenden');

    function sagen(text, art) {
      if (!meldung) return;
      meldung.textContent = text;
      meldung.className = 'bmeldung' + (art ? ' ' + art : '');
    }

    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var daten = {
        name: (f.name.value || '').trim(),
        alter: (f.alter.value || '').trim(),
        kontakt: (f.kontakt.value || '').trim(),
        bigo: (f.bigo.value || '').trim(),
        // Die BIGO-ID ist die Zahl im Profil. Damit findet die Teamleitung
        // eine Bewerberin eindeutig – Namen gibt es auf BIGO doppelt.
        bigo_id: (f.bigo_id && f.bigo_id.value || '').trim(),
        wann: (f.wann.value || '').trim(),
        webseite: (f.webseite.value || '').trim()
      };
      if (!daten.name) { sagen('Sag uns bitte noch, wie wir dich nennen sollen.', 'fehler'); f.name.focus(); return; }
      if (!daten.kontakt) { sagen('Ohne einen Weg zu dir können wir dir die Nummer nicht schicken.', 'fehler'); f.kontakt.focus(); return; }
      var jahre = parseInt(daten.alter, 10);
      if (daten.alter && jahre && jahre < 18) {
        sagen('Für BIGO musst du mindestens 18 sein. Melde dich gern, sobald es so weit ist.', 'fehler');
        return;
      }

      f.classList.add('faehrt');
      if (knopf) knopf.textContent = 'Wird gesendet \u2026';
      sagen('');

      fetch('/api/bewerbung', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(daten)
      }).then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        f.reset();
        sagen('Angekommen! Wir melden uns bei dir \u2013 meist noch heute. Schau auch im Spam-Ordner nach.', 'ok');
        if (knopf) knopf.textContent = 'Danke dir \u2713';
      }).catch(function () {
        sagen('Das hat gerade nicht geklappt. Schreib uns bitte an support@4ever1.tv \u2013 wir melden uns.', 'fehler');
        if (knopf) knopf.innerHTML = 'Nochmal versuchen <span class="ar">\u2192</span>';
      }).then(function () {
        f.classList.remove('faehrt');
      });
    });
  }
  bewerbung();


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

  // Wer die Seite direkt mit einer Sprungmarke oeffnet (Link aus WhatsApp,
  // Lesezeichen), soll den Abschnitt genauso sofort sehen.
  ausHash();

  zeigen(document.querySelectorAll('.sec-head, .card, .stepline, .stat, .woche, .rechner, .faq details, .contact a, .cta, .phone, #teammanagement .grid > div:first-child, .foot > div'));
})();
