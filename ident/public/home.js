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
        // Im Titelbild liegt das echte Logo bereits im SVG (es wird dort nur
        // entlang der Acht freigelegt). Hier ist also nichts mehr zu
        // tauschen - frueher wurde an dieser Stelle eine Strichzeichnung
        // gegen das Logo ersetzt, und genau dieser Wechsel sah schlecht aus.
        // Auch im Fuß dasselbe Logo – sonst stehen zwei verschiedene
        // Zeichen auf einer Seite, und das fällt sofort auf.
        var fuss = $('footMark');
        if (fuss) {
          var fi = new Image();
          fi.className = 'logo-fuss'; fi.alt = '4EVER1.TV'; fi.src = j.logo;
          fi.onload = function () { fuss.replaceWith(fi); };
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

  zeigen(document.querySelectorAll('.sec-head, .card, .stepline, .stat, .woche, .faq details, .contact a, .cta, .phone, #teammanagement .grid > div:first-child, .foot > div'));

  // ── Hymne im Hintergrund ───────────────────────────────────────────────
  //
  // Sie beginnt beim ERSTEN SCROLLEN - nicht beim Laden. Wer die Seite nur
  // kurz oeffnet und wieder geht, hoert nichts; wer anfaengt zu lesen,
  // bekommt sie dazu.
  //
  // EINSTIEG BEI 1:04. Der Song hat 3:40 und baut sich lange auf. Ich habe
  // die Lautstaerke Sekunde fuer Sekunde vermessen: Bei 1:04 rastet der
  // Refrain ein und bleibt oben (79-83 %), davor sind es 55-66 %. Genau
  // dort steigen wir ein - man landet mitten in der Hymne, nicht im Vorspann.
  //
  // NUR AUF DER STARTSEITE. Auf Impressum, Datenschutz und der
  // Bewerbungsseite bleibt es still.
  //
  // Und eine Ehrlichkeit zur Technik: Browser lassen Ton ohne echte
  // Berührung meist nicht zu, und Scrollen zaehlt oft NICHT als solche.
  // Deshalb wird es beim Scrollen versucht - und wenn der Browser ablehnt,
  // liegt eine zweite Zuendschnur bereit, die beim ersten Tippen zuendet.
  // Der Knopf bleibt in jedem Fall als Notausgang.
  var HYMNE_START = 64; // Sekunden - Refrain-Einsatz, ausgemessen

  function hymne() {
    var knopf = $('tonKnopf');
    var aufStartseite = /\/(index\.html)?$/.test(location.pathname);
    if (!aufStartseite) { if (knopf) knopf.style.display = 'none'; return; }

    var QUELLE = '/musik/hymne.mp3';
    if (knopf) knopf.style.display = 'none';

    fetch(QUELLE, { method: 'HEAD' }).then(function (r) {
      if (!r.ok) return;
      if (knopf) knopf.style.display = '';

      var audio = new Audio(QUELLE);
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = 0;
      var laeuft = false, blende = null, schonVersucht = false;

      function blenden(ziel, fertig) {
        clearInterval(blende);
        blende = setInterval(function () {
          var d = ziel - audio.volume;
          if (Math.abs(d) < 0.02) {
            audio.volume = ziel; clearInterval(blende);
            if (fertig) fertig();
            return;
          }
          audio.volume = Math.max(0, Math.min(1, audio.volume + d * 0.08));
        }, 40);
      }

      function anzeigen(an) {
        if (!knopf) return;
        knopf.setAttribute('aria-pressed', an ? 'true' : 'false');
        knopf.setAttribute('aria-label', an ? 'Musik ausschalten' : 'Musik einschalten');
      }

      function an() {
        // Mitten im Lied einsteigen - aber nur beim allerersten Start.
        // Wer zwischendurch pausiert, soll dort weitermachen, wo er war.
        if (!schonVersucht) {
          schonVersucht = true;
          try { audio.currentTime = HYMNE_START; } catch (e) { /* kommt gleich nochmal */ }
        }
        return audio.play().then(function () {
          // Manche Browser setzen currentTime erst, wenn Daten da sind.
          if (audio.currentTime < 1 && HYMNE_START > 0) {
            try { audio.currentTime = HYMNE_START; } catch (e) {}
          }
          laeuft = true; anzeigen(true); blenden(0.3);
          try { localStorage.setItem('hymne', 'an'); } catch (e) {}
        });
      }

      function aus() {
        blenden(0, function () { audio.pause(); });
        laeuft = false; anzeigen(false);
        try { localStorage.setItem('hymne', 'aus'); } catch (e) {}
      }

      if (knopf) knopf.addEventListener('click', function () { laeuft ? aus() : an(); });

      // Wer ausdruecklich ausgeschaltet hat, wird nicht wieder beschallt.
      var wunsch = null;
      try { wunsch = localStorage.getItem('hymne'); } catch (e) {}
      if (wunsch === 'aus') return;

      var gezuendet = false;
      function zuenden() {
        if (gezuendet) return;
        gezuendet = true;
        window.removeEventListener('scroll', beimScrollen);
        an().catch(function () {
          // Browser hat abgelehnt (kein echter Tastendruck). Zweite
          // Zuendschnur: beim ersten Tippen oder Klicken irgendwo.
          gezuendet = false;
          document.addEventListener('pointerdown', function nochmal() {
            document.removeEventListener('pointerdown', nochmal);
            gezuendet = true;
            an().catch(function () { /* dann bleibt der Knopf */ });
          }, { once: true });
        });
      }
      function beimScrollen() { if (window.scrollY > 60) zuenden(); }
      window.addEventListener('scroll', beimScrollen, { passive: true });
    }).catch(function () { /* keine Datei, kein Knopf */ });
  }
  hymne();

})();
