/* StudyBase service worker — een kleine, veilige offline-laag (network-first, cache fallback voor shell). */
const CACHE = 'studybase-v1';
const SHELL = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* API: nooit stale data serveren — netwerk eerst, korte foutmelding offline */
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname.startsWith('/api/apps/') && url.pathname.includes('/serve')) {
      event.respondWith(caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        const fetchP = fetch(req).then((res) => { cache.put(req, res.clone()); return res; }).catch(() => hit);
        return fetchP || Response.error();
      }));
      return;
    }
    if (url.pathname === '/api/flashcards/due') {
      /* Offline flashcard-laten-herhalen: laatste antwoorden cachen als leesdata */
      event.respondWith(fetch(req).then((res) => {
        caches.open(CACHE).then((c) => c.put(req, res.clone()));
        return res;
      }).catch(() => caches.match(req).then((r) => r || Response.error())));
      return;
    }
    return;
  }

  /* Document bestanden: cache-als-online (geen persoonlijke data lekken via stale API-antwoorden) */
  if (url.pathname.startsWith('/_next/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      const fetchP = fetch(req).then((res) => { cache.put(req, res.clone()); return res; });
      return hit || fetchP;
    }));
    return;
  }

  /* Navigatie: netwerk eerst, shell als fallback */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/').then((r) => r || Response.error()))
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
