// 고장보고서 생성기 — 서비스워커
// 전략:
//  - 앱 쉘(이 페이지 자체, manifest, 아이콘)은 install 시 미리 캐시
//  - Pyodide/Tesseract.js/폰트 등 외부 CDN 요청은 "캐시에 있으면 그걸 쓰고,
//    없으면 받아와서 캐시에 저장" — 한 번만 성공하면 그 다음부터는 완전 오프라인.
//  - APP_VERSION을 바꾸면 이전 캐시를 지우고 새로 받는다(배포할 때마다 올릴 것).

const APP_VERSION = "v1";
const CACHE_NAME = "fault-report-" + APP_VERSION;

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

const CDN_HOSTS = [
  "cdn.jsdelivr.net",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

function isCdnRequest(url) {
  try {
    const u = new URL(url);
    return CDN_HOSTS.includes(u.host);
  } catch (e) {
    return false;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const sameOrigin = req.url.startsWith(self.location.origin);

  if (sameOrigin) {
    // 앱 쉘: 네트워크 우선, 실패하면 캐시(오프라인 대비), 성공하면 캐시 갱신
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  if (isCdnRequest(req.url)) {
    // Pyodide/Tesseract.js/폰트: 캐시 우선(오프라인 최우선), 없으면 받아서 캐시에 저장
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        });
      })
    );
  }
});
