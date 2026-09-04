// 서비스워커 — 오프라인 지원. 안전 전략:
//  · HTML(navigate): 네트워크 우선 → 항상 최신, 오프라인이면 캐시로 폴백
//  · 정적 자원: stale-while-revalidate → 캐시로 즉시 응답 + 백그라운드 갱신
//  · 첫 방문(온라인) 때 모든 자원이 캐시되어 이후 오프라인 동작
const CACHE = 'champcalc-v3';
const CORE = [
  './', './index.html', './manifest.webmanifest',
  './assets/favicon.svg', './assets/icon-192.png', './assets/icon-512.png', './assets/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return; // 외부(CDN 등)는 건드리지 않음

  // HTML 문서: 네트워크 우선(최신 배포 즉시 반영), 실패 시 캐시
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // 정적 자원(css/js/데이터/아이콘): stale-while-revalidate
  e.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req)
        .then(res => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
