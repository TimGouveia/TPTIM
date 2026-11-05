/* Service Worker do Teleprompter
 * Estratégia: cache primeiro, atualizando em segundo plano (stale-while-revalidate).
 * Na primeira visita ONLINE, o app e as bibliotecas de CDN são guardados.
 * Depois disso tudo abre sem internet.
 *
 * Ao alterar qualquer arquivo do app, aumente o número de VERSION para
 * forçar a atualização do cache nos aparelhos.
 */
const VERSION = 'teleprompter-v2';

const LOCAL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

// Mesmas URLs usadas no index.html
const CDN_ASSETS = [
  'https://cdn.tailwindcss.com/3.4.17',
  'https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js',
  'https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js',
  'https://cdn.jsdelivr.net/npm/@babel/standalone@7.26.0/babel.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      await cache.addAll(LOCAL_ASSETS);
      // CDNs: no-cors guarda a resposta mesmo sem cabeçalhos CORS
      await Promise.all(
        CDN_ASSETS.map(async (url) => {
          try {
            const res = await fetch(new Request(url, { mode: 'no-cors' }));
            await cache.put(url, res);
          } catch (err) {
            /* será guardado na primeira requisição real */
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

async function handle(request) {
  const cache = await caches.open(VERSION);
  let cached = await cache.match(request);
  if (!cached && request.mode === 'navigate') {
    cached = await cache.match('./index.html');
  }

  const network = fetch(request)
    .then((response) => {
      if (response && (response.ok || response.type === 'opaque')) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    // atualiza em segundo plano, responde na hora com o cache
    network.catch(() => {});
    return cached;
  }
  return (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (!/^https?:$/.test(new URL(request.url).protocol)) return;
  event.respondWith(handle(request));
});
