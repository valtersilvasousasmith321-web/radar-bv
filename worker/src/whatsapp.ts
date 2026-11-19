import { config } from "./config.js";
import { log } from "./logger.js";
import { supabase } from "./db.js";
import type { DestinoWhatsApp, MateriaRedigida } from "./types.js";

/**
 * Gera o resumo curto + link, no formato pronto para disparo em
 * Grupos/Canais de WhatsApp, a cada notícia publicada.
 */
export function gerarResumoWhatsApp(materia: MateriaRedigida, slug: string): string {
  const link = `${config.site.baseUrl}/noticia/${slug}`;
  const prefixo = materia.urgente ? "🔴 *URGENTE*" : "📰 *Radar BV*";
  return `${prefixo}\n\n*${materia.titulo}*\n${materia.subtitulo}\n\nLeia completo: ${link}`;
}

/**
 * Busca os destinos cadastrados pelo painel admin (Fase 3). Se a tabela
 * ainda estiver vazia (admin nunca usado) e houver a variável legada
 * WHATSAPP_WEBHOOK_URL configurada, cai nela como destino único — garante
 * que quem só preencheu o .env (sem passar pelo admin) continua recebendo
 * disparos, sem precisar migrar nada.
 */
async function obterDestinosAtivos(apenasResumoDiario = false): Promise<DestinoWhatsApp[]> {
  const { data, error } = await supabase.from("destinos_whatsapp").select("*").eq("ativo", true);

  if (error) {
    await log("error", "whatsapp", "Falha ao buscar destinos de WhatsApp cadastrados", { erro: error.message });
  }

  let destinos = (data ?? []) as DestinoWhatsApp[];
  if (apenasResumoDiario) destinos = destinos.filter((d) => d.resumo_diario);

  if (destinos.length === 0 && config.whatsapp.webhookUrl) {
    destinos = [
      {
        id: "legado-env",
        nome: "Destino legado (WHATSAPP_WEBHOOK_URL)",
        tipo: "grupo",
        webhook_url: config.whatsapp.webhookUrl,
        ativo: true,
        resumo_diario: true,
      },
    ];
  }

  return destinos;
}

async function dispararWebhook(webhookUrl: string, mensagem: string): Promise<boolean> {
  try {
    const fetch = (await import("node-fetch")).default;
    const resposta = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.whatsapp.webhookToken}`,
      },
      body: JSON.stringify({ mensagem }),
      // timeout real (node-fetch v3 ignora a opção "timeout") — um webhook
      // travado não pode prender a fila de publicação, que roda a cada 1 min.
      signal: AbortSignal.timeout(10_000),
    });

    if (!resposta.ok) {
      await log("warning", "whatsapp", `Webhook retornou status ${resposta.status}`, { webhookUrl });
      return false;
    }
    return true;
  } catch (err: any) {
    await log("error", "whatsapp", "Falha ao disparar mensagem para o webhook do WhatsApp", {
      webhookUrl,
      erro: String(err?.message ?? err),
    });
    return false;
  }
}

/**
 * Envia o resumo de UMA matéria publicada para todos os destinos ativos
 * cadastrados no painel admin (Isolamento de Destinos: um webhook fora do
 * ar não impede o disparo para os demais).
 */
export async function enviarParaWhatsApp(resumo: string): Promise<void> {
  const destinos = await obterDestinosAtivos();
  if (destinos.length === 0) {
    await log("info", "whatsapp", "Nenhum destino de WhatsApp cadastrado/configurado — pulando disparo");
    return;
  }

  for (const destino of destinos) {
    const ok = await dispararWebhook(destino.webhook_url, resumo);
    if (ok) {
      await log("info", "whatsapp", `Resumo da matéria disparado para "${destino.nome}"`);
    }
  }
}
