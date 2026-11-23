import "dotenv/config";

/**
 * Configuração central do worker. Falha rápido (fail-fast) se faltar
 * alguma chave obrigatória, exceto as de fallback (Groq) e imagens
 * (Unsplash/Pexels), que são opcionais — o sistema deve rodar sem elas,
 * apenas com funcionalidade reduzida (Regra de Ouro: o jornal nunca pode parar).
 */
function obrigatoria(nome: string): string {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(`[config] Variável de ambiente obrigatória ausente: ${nome}`);
  }
  return valor;
}

export const config = {
  supabase: {
    url: obrigatoria("SUPABASE_URL"),
    serviceRoleKey: obrigatoria("SUPABASE_SERVICE_ROLE_KEY"),
  },
  ia: {
    geminiApiKey: obrigatoria("GEMINI_API_KEY"),
    anthropicApiKey: obrigatoria("ANTHROPIC_API_KEY"),
    groqApiKey: process.env.GROQ_API_KEY ?? "",
    // Bancada de IA maior (item "Infraestrutura de IA" do plano): mais um
    // elo gratuito na cascata pra espalhar o uso e bater cota com menos
    // frequência. Opcional — some sozinho da cascata se a chave não for
    // configurada ainda.
    openrouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
    // Mais 2 elos gratuitos na cascata (22/11/2026, a pedido do Valter —
    // "ampliar a bancada de IA pra reduzir apagão total"). Opcionais, iguais
    // à OpenRouter: sem a chave, o provedor some sozinho da cascata.
    mistralApiKey: process.env.MISTRAL_API_KEY ?? "",
    cohereApiKey: process.env.COHERE_API_KEY ?? "",
    // IA própria/local via Ollama (serviço pesado da triagem, sem cota/custo
    // nenhum — roda no próprio computador). Totalmente opcional: se o Ollama
    // não estiver instalado/rodando, o sistema cai sozinho pra cascata de
    // nuvem (Gemini -> Claude -> Groq), sem quebrar nada.
    ollamaUrl: process.env.OLLAMA_URL ?? "http://127.0.0.1:11434",
    ollamaModel: process.env.OLLAMA_MODEL ?? "llama3.2:3b",
  },
  imagens: {
    unsplashAccessKey: process.env.UNSPLASH_ACCESS_KEY ?? "",
    pexelsApiKey: process.env.PEXELS_API_KEY ?? "",
    pixabayApiKey: process.env.PIXABAY_API_KEY ?? "",
  },
  whatsapp: {
    webhookUrl: process.env.WHATSAPP_WEBHOOK_URL ?? "",
    webhookToken: process.env.WHATSAPP_WEBHOOK_TOKEN ?? "",
  },
  site: {
    // "www." é obrigatório aqui: o domínio sem www tem ficado fora do ar /
    // com timeout de conexão (SSL/DNS do apex), enquanto o www funciona normal.
    baseUrl: process.env.SITE_BASE_URL ?? "https://www.radarbv.com.br",
  },

  // Algoritmo de Personalização + Notificações (item 16) — Web Push.
  // Chave pública igual à configurada em NEXT_PUBLIC_VAPID_PUBLIC_KEY no
  // Vercel (apps/web) — a privada NUNCA vai pro Vercel/navegador, só fica
  // aqui no worker. Opcional: sem as duas chaves, o envio de notificação
  // simplesmente não roda (nunca derruba a publicação da notícia).
  pushNotificacoes: {
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
    vapidContatoEmail: process.env.VAPID_CONTATO_EMAIL ?? "contato@radarbv.com.br",
  },

  /**
   * Janelas do Cron Dinâmico (Regra de Ouro — item 1):
   * - a cada 45 min entre 07h00 e 18h30
   * - a cada 1h30 entre 18h31 e 23h00
   * - 1 única vez às 05h30 da madrugada
   * Expressões em cron padrão (min hora * * *), avaliadas no fuso America/Boa_Vista.
   */
  cron: {
    pulsoDiurno: "*/45 7-18 * * *", // refinado em scheduler.ts para parar em 18h30
    pulsoNoturno: "0 19,20,21,22,23 * * *", // aproximação de 1h30 (ver scheduler.ts)
    pulsoMadrugada: "30 5 * * *",
  },

  /** Fila de Gotejamento: intervalo mínimo/máximo entre publicações (minutos) */
  gotejamento: {
    minMinutos: 20,
    maxMinutos: 30,
  },

  /** Janela de deduplicação semântica aplicada pelo Gemini (horas) */
  dedupHoras: 24,
};
