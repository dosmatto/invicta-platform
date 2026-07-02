// Service Worker do app de Coleta (PWA offline).
//
// Estratégia:
//  • /coleta (documento): network-first, com fallback pro cache — o app abre
//    sem internet depois da 1ª visita online.
//  • /_next/static, /icons, /images: cache-first (assets imutáveis por hash).
//  • Tiles (ESRI satélite / OSM) e glyphs do mapa: cache-first — alimentado
//    também pelo botão "Baixar mapa offline" (a página grava direto no cache).
//  • Todo o resto: passa direto pra rede (não interfere no app desktop).

const VERSAO = 'v1';
const CACHE_SHELL = 'coleta-shell-' + VERSAO;
const CACHE_ASSETS = 'coleta-assets';
const CACHE_TILES = 'coleta-tiles'; // compartilhado com o download offline da página

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_SHELL)
      .then((c) => c.add('/coleta').catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('coleta-shell-') && k !== CACHE_SHELL).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function ehTileOuGlyph(url) {
  return (
    url.hostname === 'server.arcgisonline.com' ||
    url.hostname === 'tile.openstreetmap.org' ||
    url.hostname === 'fonts.openmaptiles.org'
  );
}

function ehAssetLocal(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/_next/static/') ||
      url.pathname.startsWith('/icons/') ||
      url.pathname.startsWith('/images/') ||
      url.pathname === '/manifest-coleta.webmanifest')
  );
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Documento do app de coleta: network-first + fallback cache
  if (req.mode === 'navigate' && url.origin === self.location.origin && url.pathname.startsWith('/coleta')) {
    e.respondWith(
      fetch(req)
        .then((resp) => {
          const clone = resp.clone();
          caches.open(CACHE_SHELL).then((c) => c.put('/coleta', clone)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match('/coleta').then((r) => r ?? Response.error()))
    );
    return;
  }

  // Assets do app (hash imutável): cache-first
  if (ehAssetLocal(url)) {
    e.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((resp) => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_ASSETS).then((c) => c.put(req, clone)).catch(() => {});
          }
          return resp;
        });
      })
    );
    return;
  }

  // Tiles de mapa e glyphs: cache-first
  if (ehTileOuGlyph(url)) {
    e.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req)
          .then((resp) => {
            if (resp.ok) {
              const clone = resp.clone();
              caches.open(CACHE_TILES).then((c) => c.put(req, clone)).catch(() => {});
            }
            return resp;
          })
          .catch(() => Response.error());
      })
    );
    return;
  }

  // Demais requisições: comportamento padrão do navegador (não intercepta).
});
