// Офлайн-кэш: сайт работает без интернета после первого открытия.
// При изменении файлов увеличивайте VERSION, чтобы телефоны получили обновление.
const VERSION = 'zh-daily-v5';
const FILES = [
  './', 'index.html', 'style.css', 'data.js', 'data-hsk34.js', 'examples.js', 'lessons.js', 'app.js',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Сначала из кэша (мгновенно и офлайн), параллельно тихо обновляем кэш из сети.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(e.request, { ignoreSearch: true });
      const network = fetch(e.request)
        .then((res) => { if (res && res.ok) cache.put(e.request, res.clone()); return res; })
        .catch(() => null);
      return cached || (await network) || cache.match('index.html');
    })
  );
});
