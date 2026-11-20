// 홈 화면에 추가한 뽀드득이 앱처럼 열리게 하는 작은 일꾼.
// 늘 인터넷에서 새로 받아 오고(그래야 고친 것이 바로 보인다), 받아 온 것은 넣어 두었다가 인터넷이 끊겼을 때만 꺼내 쓴다.
const CACHE = 'poddk-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // 서버(함께 걷기)와 다른 곳은 건드리지 않는다
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (hit) return hit;
      throw err;
    }
  })());
});
