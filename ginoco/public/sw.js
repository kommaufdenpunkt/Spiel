/* ginoco Service Worker – schnelles Laden + Offline-Grundgerüst.
   Strategie: Stale-While-Revalidate für die App-Hülle (sofort aus dem Cache,
   Aktualisierung läuft im Hintergrund). Ein Hard-Refresh (Cmd+Shift+R) umgeht
   den Cache und lädt garantiert frisch. API-Aufrufe (/api/...) laufen immer
   direkt übers Netz – nie aus dem Cache. */
const CACHE = 'ginoco-shell-v2';
const SHELL = ['/', '/index.html', '/app.js', '/styles.css', '/manifest.webmanifest',
  '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
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
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request);
      // Im Hintergrund frische Version holen und Cache aktualisieren (für den nächsten Start).
      const network = fetch(e.request).then((resp) => {
        if (resp && resp.status === 200) cache.put(e.request, resp.clone()).catch(() => {});
        return resp;
      }).catch(() => null);
      // Sofort aus dem Cache liefern (rasant), sonst aufs Netz warten.
      return cached || (await network) || cache.match('/index.html');
    })
  );
});
