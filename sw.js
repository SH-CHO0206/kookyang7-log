// Offline support: data.json is fetched fresh when online (falls back to the last copy offline); other files are cached.
const C='ky7-v1',CORE=['./','index.html','analyze.js','basemap.json','manifest.webmanifest','icon-192.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(CORE)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.origin!==location.origin)return;
  if(u.pathname.endsWith('data.json')){e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put('data.json',cp));return r}).catch(()=>caches.match('data.json')));return}
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))});
