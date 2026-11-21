// Service Worker do Radar BV — PWA instalável.
// Estratégia: network-first para páginas/API (notícias mudam o tempo todo,
// nunca queremos mostrar conteúdo velho por engano), cache-first para
// estáticos (ícones, manifest) que raramente mudam.

const VERSAO_CACHE = "radar-bv-v2";
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

// Item 16 — Algoritmo de Personalização + Notificações: recebe o push
// enviado pelo worker (ver worker/src/pushNotificacoes.ts) e mostra a
// notificação nativa do sistema operacional/navegador.
self.addEventListener("push", (event) => {
  let dados = { titulo: "Radar BV", corpo: "Nova notícia", url: "/" };
  try {
    if (event.data) dados = { ...dados, ...event.data.json() };
  } catch {
    // payload sem JSON válido — usa os valores padrão acima
  }

  event.waitUntil(
    self.registration.showNotification(dados.titulo, {
      body: dados.corpo,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: dados.url },
    })
  );
});

// Clique na notificação: abre (ou foca, se já tiver aberta) a notícia.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientes) => {
      for (const cliente of clientes) {
        if (cliente.url === url && "focus" in cliente) return cliente.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
