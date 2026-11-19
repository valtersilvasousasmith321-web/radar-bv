// Service Worker do Radar BV — PWA instalável.
// Estratégia: network-first para páginas/API (notícias mudam o tempo todo,
// nunca queremos mostrar conteúdo velho por engano), cache-first para
// estáticos (ícones, manifest) que raramente mudam.

const VERSAO_CACHE = "radar-bv-v1";
const ESTATICOS = ["/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSAO_CACHE).then((cache) => cache.addAll(ESTATICOS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(chaves.filter((c) => c !== VERSAO_CACHE).map((c) => caches.delete(c)))
    )
  );
  self.clients.claim();
});

function ehEstatico(url) {
  return ESTATICOS.some((caminho) => url.pathname === caminho) || url.pathname.startsWith("/icons/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (ehEstatico(url)) {
    event.respondWith(
      caches.match(request).then((cacheado) => cacheado ?? fetch(request))
    );
    return;
  }

  // Network-first para navegação e dados: tenta a rede, cai no cache
  // (última versão vista) só se o dispositivo estiver offline.
  event.respondWith(
    fetch(request)
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(VERSAO_CACHE).then((cache) => cache.put(request, copia)).catch(() => {});
        return resposta;
      })
      .catch(() => caches.match(request))
  );
});
