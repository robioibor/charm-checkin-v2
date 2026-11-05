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

// IMPORTANT: the browser only checks THIS file's own bytes to decide
// whether a new service worker version exists at all -- it never looks
// at index.html, manifest.json, or the icons to make that decision. A
// content-only change to one of those files, with no change here, will
// never be detected or re-cached (this is exactly what happened in the
// Milestone 9 Step 5 deploy). Bump this version string (...-v3, -v4, ...)
// every time index.html, manifest.json, or either icon changes, even if
// nothing in this file's own logic needs to change.
//
// Step 238: added supabase-config.js (same-origin, so it belongs with
// the rest of the required shell) and the Supabase JS library (a
// cross-origin CDN URL, kept in a SEPARATE best-effort cache call
// below -- see the install handler's own comment for why it must
// never be mixed into SHELL_FILES).
const CACHE_NAME = 'charm-checkin-v2-shell-v8';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './supabase-config.js',
];
// Best-effort only -- NOT required for the app shell to work offline.
// cache.addAll() is all-or-nothing: if this cross-origin CDN file were
// included in SHELL_FILES above and it failed to fetch (CDN hiccup,
// installing while offline), the ENTIRE shell install would fail,
// including index.html itself -- exactly the "always launchable
// offline" guarantee this file exists to protect. Kept separate so a
// failure here can never take down the core shell.
const OPTIONAL_FILES = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(SHELL_FILES).then(() =>
        cache.addAll(OPTIONAL_FILES).catch(() => {
          // Swallowed deliberately -- see OPTIONAL_FILES comment above.
        })
      )
    )
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
