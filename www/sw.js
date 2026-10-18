/* Dosia Service Worker.
   - In der installierten App (Capacitor, https://localhost) wird KEIN Service Worker
     gebraucht – die Dateien liegen ohnehin in der APK. Eine aeltere Version hat sich dort
     faelschlich registriert und alte Dateien aus dem Cache ausgeliefert. Diese Version
     loescht deshalb in der App alle Caches, meldet sich ab und laedt die Seite neu.
   - In der Browser-/PWA-Version: network-first, Cache nur als Offline-Fallback,
     damit Updates sofort ankommen. */
const CACHE = 'dosia-v2';
const ASSETS = ['./', './index.html', './app.js', './manifest.webmanifest', './icon.svg'];
const IN_APP = self.location.hostname === 'localhost' && self.location.protocol !== 'http:';

self.addEventListener('install', e => {
  if (IN_APP) { self.skipWaiting(); return; }
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  if (IN_APP) {
    e.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(c => c.navigate(c.url));
    })());
    return;
  }
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (IN_APP) return; // nichts abfangen
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req))
  );
});
