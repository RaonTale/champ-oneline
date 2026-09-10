// ?쒕퉬?ㅼ썙而????ㅽ봽?쇱씤 吏?? ?덉쟾 ?꾨왂:
//  쨌 HTML(navigate): ?ㅽ듃?뚰겕 ?곗꽑 ????긽 理쒖떊, ?ㅽ봽?쇱씤?대㈃ 罹먯떆濡??대갚
//  쨌 ?뺤쟻 ?먯썝: stale-while-revalidate ??罹먯떆濡?利됱떆 ?묐떟 + 諛깃렇?쇱슫??媛깆떊
//  쨌 泥?諛⑸Ц(?⑤씪?? ??紐⑤뱺 ?먯썝??罹먯떆?섏뼱 ?댄썑 ?ㅽ봽?쇱씤 ?숈옉
const CACHE = 'champcalc-v5';
const CORE = [
  './', './index.html', './manifest.webmanifest',
  './assets/favicon.svg', './assets/icon-192.png', './assets/icon-512.png', './assets/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE);
    // ?꾧컧 ?ㅽ봽?쇱씠???꾨━罹먯떆(?꾩쟾 ?ㅽ봽?쇱씤) ???ㅽ뙣?대룄 ?ㅼ튂??吏꾪뻾?쒕떎.
    try {
      const list = await fetch('./assets/sprites/list.json').then(r => r.json());
      await Promise.allSettled(list.map(f => c.add('./assets/sprites/' + f)));
    } catch (e) { /* 臾댁떆 */ }
    await self.skipWaiting();
  })());
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
  if (url.origin !== self.location.origin) return; // ?몃?(CDN ????嫄대뱶由ъ? ?딆쓬

  // HTML 臾몄꽌: ?ㅽ듃?뚰겕 ?곗꽑(理쒖떊 諛고룷 利됱떆 諛섏쁺), ?ㅽ뙣 ??罹먯떆
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

  // ?뺤쟻 ?먯썝(css/js/?곗씠???꾩씠肄?: stale-while-revalidate
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
