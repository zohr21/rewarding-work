/*
 * Service worker for Rewarding Work.
 * Generated into dist/sw.js at build time by pwa/integration.mjs, which fills in
 * __VERSION__ (a hash of the build) and __PRECACHE__ (every file in the build).
 *
 * Strategy
 *  - install:  cache every page and asset, so the whole site works offline.
 *  - pages:    network first (you get updates when online), cached copy when offline.
 *              Includes the client-side router's fetch() of pages, not just navigations.
 *  - assets:   cache first (file names are content-hashed, so they never go stale).
 *  - activate: delete caches from older builds, but keep the previous one. For a few
 *              minutes after a deploy a browser can still show the old page (GitHub
 *              Pages lets it cache HTML for 10 minutes), and that page needs the old
 *              build's CSS/JS, which are no longer on the server.
 */
const VERSION = '__VERSION__';
const PRECACHE = /* __PRECACHE__ */ [];
const CACHE = `rw-${VERSION}`;
const SCOPE = self.registration.scope; // e.g. https://user.github.io/rewarding-work/
const toUrl = (path) => new URL(path, SCOPE).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map(toUrl)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        // keys() lists caches oldest first: keep this build's and the one before it.
        const older = keys.filter((k) => k.startsWith('rw-') && k !== CACHE);
        return Promise.all(older.slice(0, -1).map((k) => caches.delete(k)));
      })
      .then(() => self.clients.claim()),
  );
});

/** Cache keys a page URL may be stored under: /x, /x/ and /x/index.html are the same page. */
function pageKeys(href) {
  const url = new URL(href);
  url.search = '';
  url.hash = '';
  const path = url.pathname;
  if (path.endsWith('/')) return [`${url.origin}${path}index.html`];
  if (/\.[a-z0-9]+$/i.test(path)) return [url.href];
  return [`${url.origin}${path}/index.html`, url.href];
}

async function handlePage(request) {
  const cache = await caches.open(CACHE);
  try {
    // no-cache: always check with the server, so we never pair a stale page from the
    // browser's HTTP cache with this build's (differently named) CSS/JS.
    const response = await fetch(request, { cache: 'no-cache' });
    // Keep the offline copy fresh. Redirects/opaque responses are passed through, not cached.
    if (response.ok && response.type === 'basic' && !response.redirected) {
      cache.put(pageKeys(request.url)[0], response.clone());
    }
    return response;
  } catch {
    for (const key of pageKeys(request.url)) {
      const hit = await cache.match(key, { ignoreVary: true });
      if (hit) return hit;
    }
    return (
      (await cache.match(toUrl('404.html'), { ignoreVary: true })) ??
      (await cache.match(toUrl('index.html'), { ignoreVary: true })) ??
      Response.error()
    );
  }
}

async function handleAsset(request) {
  const cache = await caches.open(CACHE);
  // ignoreVary: module scripts are requested with an Origin header; precached copies were
  // stored without one, so a `Vary: Origin` response header would otherwise never match.
  const opts = { ignoreSearch: true, ignoreVary: true };
  const hit = (await cache.match(request, opts)) ?? (await caches.match(request, opts)); // then the previous build's
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') cache.put(request, response.clone());
  return response;
}

/** Page requests: real navigations, and the client-side router's fetch() of a page URL. */
function isPage(request) {
  if (request.mode === 'navigate') return true;
  if (request.destination !== '') return false; // <script>, <img>, <link> …
  const path = new URL(request.url).pathname;
  return path.endsWith('/') || path.endsWith('.html') || !/\.[a-z0-9]+$/i.test(path);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (!request.url.startsWith(SCOPE)) return; // other origins / paths: let the browser handle it
  event.respondWith(isPage(request) ? handlePage(request) : handleAsset(request));
});

// Clicking a timer notification focuses the open app (or opens the timer).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(SCOPE));
      return open ? open.focus() : self.clients.openWindow(toUrl('timer/'));
    }),
  );
});
