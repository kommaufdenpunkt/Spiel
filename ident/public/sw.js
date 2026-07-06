/* ident – Service Worker (macht die App installierbar / Home-Bildschirm).
 * Strategie: Netzwerk zuerst (immer aktueller Stand), Cache nur als Fallback,
 * damit ein neues Deploy sofort ankommt. API-/Live-Aufrufe werden NIE gecacht.
 */
const CACHE = 'ident-v1';
const SHELL = ['/', '/index.html', '/app.js', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

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
  const req = e.request;
  if (req.method !== 'GET') return; // Logins, Codes, Fälle etc. immer live
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                 // nur eigene Domain
  if (url.pathname.startsWith('/api/') || url.pathname === '/ice') return; // nie cachen

  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('/index.html')))
  );
});
