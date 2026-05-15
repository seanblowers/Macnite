// Macnite service worker — keep the site always fresh.
// We don't ship offline support, so the strategy is: serve nothing from
// cache, take over the page immediately on update, and nuke any stale
// caches a previous service worker may have left behind.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
