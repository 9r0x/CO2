/* Offline cache for the app shell. Registered only when served over https (GitHub Pages).
 * Network first so updates arrive promptly; cache fallback when offline.
 * The ?v= numbers must match the links in index.html. */
var CACHE = 'breathtrainer-v30';
var FILES = [
  './', './index.html', './css/style.css?v=30',
  './js/presets.js?v=30', './js/schedule.js?v=30', './js/tones.js?v=30', './js/storage.js?v=30',
  './js/log.js?v=30', './js/player.js?v=30', './js/state.js?v=30', './js/ui.js?v=30',
  './js/setup.js?v=30', './js/actions.js?v=30', './js/session.js?v=30', './js/done.js?v=30', './js/history.js?v=30', './js/settings.js?v=30',
  './js/app.js?v=30'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

/* Network first, but only for 3 s: a phone with a dead route must still start from the cache.
 * When the cache has nothing (the first load after an update) the slow network answer is used after all. */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) { return; }
  var net = fetch(e.request);
  function store(res) {
    if (res.ok) {
      var copy = res.clone();
      e.waitUntil(caches.open(CACHE).then(function (c) { return c.put(e.request, copy); }));
    }
    return res;
  }
  var timeout = new Promise(function (resolve, reject) { setTimeout(function () { reject(new Error('slow network')); }, 3000); });
  e.respondWith(
    Promise.race([net, timeout]).then(store).catch(function () {
      return caches.match(e.request).then(function (hit) { return hit || net.then(store); });
    })
  );
});
