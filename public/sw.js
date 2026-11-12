// Service worker: what makes Royalty Apartments installable as an app.
//
// - Pages always come fresh from the server, so rooms, payments and logins are never out of date,
//   and nobody's private pages are kept on the phone. With no connection, the offline page shows.
// - Styles, scripts, the logo, icons and built-in photos also come fresh from the server whenever
//   there is a connection, so a page and the files it needs are always the same version. A copy of
//   each is kept on the phone, but it is only used when there is no connection.
//   (Version 2 answered from the stored copy first, so the first visit after an update could pair
//   a new page with an old script, which left the admin dashboard blank.)
//
// Change VERSION whenever this file changes, so phones replace the old copy and delete old files.
const VERSION = 'v3';
const SHELL = `royalty-shell-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [
  OFFLINE_URL,
  '/favicon.svg',
  '/logo.svg',
  '/icon-192.png?v=2',
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

  // Public files: newest from the server, keeping a copy; the stored copy only when offline.
  if (CACHEABLE.test(url.pathname) && !url.pathname.startsWith('/uploads/') && url.pathname !== '/sw.js') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            event.waitUntil(caches.open(SHELL).then((cache) => cache.put(req, copy)));
          }
          return res;
        })
        .catch(() => caches.match(req).then((stored) => stored || Response.error()))
    );
  }
});
