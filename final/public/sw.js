// This file used to be an offline cache (it made people see an old page after a release).
// The app no longer registers a service worker. Browsers that still have the old one fetch this
// file on their next visit; it clears every cache, unregisters itself and reloads the open tabs,
// then there is no service worker left. Keep this file until old installs are gone.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const windows = await self.clients.matchAll({ type: 'window' });
      for (const client of windows) {
        try {
          await client.navigate(client.url);
        } catch (e) {
          // a tab that cannot be navigated just keeps the page it has; the next load is network-only
        }
      }
    })()
  );
});
