const CACHE_NAME = 'nordic-trip-v1';

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/main.js',
  '/manifest.json'
];

/* ---------- 安裝 ---------- */
self.addEventListener('install', (event) => {
  self.skipWaiting(); // ⭐ 立即啟用新版

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

/* ---------- 啟用 ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim()) // ⭐ 立刻接管頁面
  );
});

/* ---------- 攔截請求 ---------- */
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // ✅ Firebase / Google API 一律直連網路
  if (url.includes('firebase') || url.includes('googleapis')) {
    return event.respondWith(fetch(event.request));
  }

  // ✅ 靜態資源：Cache First
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        // 只快取成功的 GET 請求
        if (
          response &&
          response.status === 200 &&
          event.request.method === 'GET'
        ) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      });
    })
  );
});
