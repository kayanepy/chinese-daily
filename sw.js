// Офлайн-кэш: сайт работает без интернета после первого открытия.
// Когда есть интернет — всегда берём свежую версию с сервера (обновления приходят сразу),
// без интернета — отдаём сохранённую копию.
const VERSION = 'zh-daily-v11';
const FILES = [
  './', 'index.html', 'style.css', 'data.js', 'data-hsk34.js', 'examples.js', 'course-hsk1.js', 'course-hsk2.js', 'course-hsk3.js', 'course-hsk4.js', 'lessons.js', 'app.js',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await fetch(e.request, { cache: 'no-cache' });
      if (res && res.ok) cache.put(e.request, res.clone());
      return res;
    } catch (err) {
      return (await cache.match(e.request, { ignoreSearch: true })) || (await cache.match('index.html'));
    }
  })());
});
