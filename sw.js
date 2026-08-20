// Service worker — only registered on the deployed site (see index.html).
// IMPORTANT: bump CACHE_VERSION with every deploy or phones keep the old app.
const CACHE_VERSION = 'v4';
const CACHE_NAME = `exercise-app-${CACHE_VERSION}`;
const ASSETS = [
  '.', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/db.js', 'js/exercises.js', 'js/version.js', 'js/insights.js',
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
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
