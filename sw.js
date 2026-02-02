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
  const request = event.request;
  const url = new URL(request.url);

  // Firebase / Google API 一律走網路
  if (url.origin.includes('googleapis') || url.origin.includes('firebase')) {
    return event.respondWith(fetch(request));
  }

  // 只處理 GET
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).catch(() => {
        // ⭐⭐⭐ 關鍵：HTML fallback
        if (request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
