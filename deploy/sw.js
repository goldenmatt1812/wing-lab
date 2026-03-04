const CACHE = 'wing-lab-v3';
const ASSETS = ['/', '/index.html', '/icon-192.svg', '/icon-512.svg', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Only cache same-origin http(s) requests — skip chrome-extension:// etc.
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
  e.respondWith(
    fetch(e.request).then(r => {
      const clone = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
      return r;
    }).catch(() => caches.match(e.request))
  );
});
