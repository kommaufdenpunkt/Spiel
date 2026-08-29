/* ginoco Service Worker – immer frisch + Offline-Grundgerüst.
   Strategie: NETWORK-FIRST für die App-Hülle (HTML/CSS/JS). Es wird immer zuerst
   die frische Version vom Server geladen; der Cache dient nur als Rückfall, wenn
   gerade kein Netz da ist. So sieht man Änderungen sofort – ganz ohne Hard-Refresh.
   Anmeldungen bleiben bestehen (Sitzung liegt im Cookie, nicht im Cache).
   API-Aufrufe (/api/...) laufen ohnehin immer direkt übers Netz – nie aus dem Cache. */
const CACHE = 'ginoco-shell-v15';
const SHELL = ['/', '/index.html', '/app.js', '/qr.js', '/styles.css', '/manifest.webmanifest',
  '/logo.svg', '/favicon.svg', '/favicon.ico', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  // Sofort aktiv werden – neue Version wartet nicht auf Schließen aller Tabs.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // Daten immer frisch aus dem Netz
  // Network-first: frische Hülle laden, Cache im Hintergrund aktualisieren,
  // bei Netzausfall aus dem Cache liefern.
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      try {
        const resp = await fetch(e.request, { cache: 'no-store' });
        if (resp && resp.status === 200) cache.put(e.request, resp.clone()).catch(() => {});
        return resp;
      } catch {
        // offline -> letzte bekannte Version, sonst die App-Startseite
        return (await cache.match(e.request)) || (await cache.match('/index.html'));
      }
    })
  );
});

// Erlaubt der App, ein sofortiges Update anzustoßen (skipWaiting per Nachricht).
self.addEventListener('message', (e) => { if (e.data === 'skip-waiting') self.skipWaiting(); });

// Handy-Benachrichtigung empfangen -> anzeigen.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'Ginoco';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png',
    lang: 'de', dir: 'ltr', vibrate: [80, 40, 80], tag: 'ginoco', renotify: true,
    data: { url: d.url || '/' },
  }));
});
// Tippt der Nutzer auf die Nachricht -> App öffnen/fokussieren.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) { if ('focus' in c) { c.navigate && c.navigate(url); return c.focus(); } }
    return clients.openWindow(url);
  }));
});
