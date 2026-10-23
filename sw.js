// CHaRM Check-In V2 -- minimal offline app-shell cache.
//
// Caches this app's own files so it can launch with no network at all,
// including after a full device restart. Cache-first: the shell is
// always served from cache when present, with a network fallback only
// if something isn't cached yet -- deliberately never network-first, so
// a genuinely offline launch can't stall waiting on a network request
// that will never resolve.
//
// Updates are intentionally NOT applied automatically. A new version of
// this file installs in the background and stays in the "waiting"
// state -- standard service worker behavior, left as the default on
// purpose -- until every open instance of the app is fully closed and
// relaunched. Nothing in this file forces an existing session to reload.
// See index.html's checkForAppUpdate(), which lets the page explicitly
// ask the browser to check for a new version while online, without ever
// triggering a reload itself.

const CACHE_NAME = 'charm-checkin-v2-shell-v1';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
