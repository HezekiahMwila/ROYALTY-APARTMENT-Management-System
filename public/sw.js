// Service worker: what makes Royalty Apartments installable as an app.
//
// - Pages always come fresh from the server, so rooms, payments and logins are never out of date,
//   and nobody's private pages are kept on the phone. With no connection, the offline page shows.
// - The look of the app (styles, scripts, logo, icons, built-in photos) is kept on the phone so the
//   app opens quickly, and is refreshed in the background each time it is used.
//
// Change VERSION whenever this file changes, so phones replace the old copy.
const VERSION = 'v2';
const SHELL = `royalty-shell-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [
  OFFLINE_URL,
  '/favicon.svg',
  '/logo.svg',
  '/icon-192.png?v=2',
  '/style.css',
  '/theme.js',
  '/ui.js',
];
// Only these kinds of public files are kept on the phone. Uploaded payment screenshots,
// problem photos and profile pictures (/uploads/) are private and are never stored.
const CACHEABLE = /\.(css|js|svg|png|jpg|jpeg|webp|ico|woff2?)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('royalty-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // forms (payments, reports, logins) always go straight to the server
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Pages: always from the network; the offline page if there is no connection.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Public files: answer from the phone straight away, and update the stored copy in the background.
  if (CACHEABLE.test(url.pathname) && !url.pathname.startsWith('/uploads/') && url.pathname !== '/sw.js') {
    event.respondWith(
      caches.open(SHELL).then((cache) =>
        cache.match(req).then((stored) => {
          const fresh = fetch(req)
            .then((res) => {
              if (res.ok && res.type === 'basic') cache.put(req, res.clone());
              return res;
            })
            .catch(() => stored);
          if (stored) {
            event.waitUntil(fresh.catch(() => {}));
            return stored;
          }
          return fresh;
        })
      )
    );
  }
});
