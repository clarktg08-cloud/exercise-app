// Service worker — only registered on the deployed site (see index.html).
// IMPORTANT: bump CACHE_VERSION with every deploy or phones keep the old app.
const CACHE_VERSION = 'v16';
const CACHE_NAME = `exercise-app-${CACHE_VERSION}`;
const ASSETS = [
  '.', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/db.js', 'js/exercises.js', 'js/version.js', 'js/insights.js',
  'js/images.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first with cache fallback: updates arrive promptly online,
// the app still opens in a dead zone at the gym.
//
// Both guards below are lessons from the sibling cannabis-tracker PWA, which
// shipped this exact handler and hit both faults in production.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Only cache real successes. Without this, a 404 or a 500 served
        // mid-deploy gets written into the cache under js/app.js and then
        // handed back as the app the next time the phone is offline.
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(e.request);
        if (hit) return hit;
        // caches.match resolves undefined on a miss, and respondWith(undefined)
        // is a network error — the browser's offline page instead of the app.
        // A navigation falls back to the shell; anything else gets a real
        // Response so the failure is legible.
        if (e.request.mode === 'navigate') {
          const shell = await caches.match(new URL('index.html', self.registration.scope));
          if (shell) return shell;
        }
        return new Response('Offline', { status: 504, statusText: 'Offline' });
      })
  );
});
