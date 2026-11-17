/*
 * Admin PWA service worker (hand-written, no build plugin).
 * - Pages: network first, cached copy of the app shell when offline (with an "offline" note from the app).
 * - Hashed build files (main-XXXX.js, chunk-*.js, styles-*.css) and icons: cache first — their names change on every build.
 * - API calls and anything cross-origin (API, CDN, S3 uploads) are never cached: admin data must always be live.
 */
const SHELL = 'admin-shell-v1';
const ASSETS = 'admin-assets-v1';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(c => c.addAll(['/', '/manifest.webmanifest', '/icons/icon-192.png'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== ASSETS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;           // API / CDN / S3: straight to the network

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req)
      .then(res => { const copy = res.clone(); caches.open(SHELL).then(c => c.put('/', copy)); return res; })
      .catch(() => caches.match('/').then(r => r || Response.error())));
    return;
  }

  if (/\/(main|chunk|polyfills|styles|scripts)-[A-Z0-9]+\.(js|css)$/.test(url.pathname) || url.pathname.startsWith('/icons/')
      || /\.(woff2?|ttf)$/.test(url.pathname)) {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(ASSETS).then(c => c.put(req, copy)); }
      return res;
    })));
  }
});
