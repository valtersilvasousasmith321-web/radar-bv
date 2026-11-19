import { config } from "./config.js";
import { log } from "./logger.js";
import { supabase } from "./db.js";
import type { DestinoWhatsApp, NoticiaParaResumo } from "./types.js";

const NOME_EDITORIA: Record<string, string> = {
  boa_vista: "Boa Vista",
  roraima: "Roraima",
  policia: "Polícia",
  politica: "Política",
  economia: "Economia",
  esportes: "Esportes",
  brasil_mundo: "Brasil & Mundo",
};

/**
 * Monta o texto do resumo diário: até 8 notícias publicadas nas últimas
 * 24h, urgentes primeiro, uma linha por matéria com link direto.
 */
export function montarTextoResumoDiario(noticias: NoticiaParaResumo[]): string {
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Boa_Vista" });
  const ordenadas = [...noticias].sort((a, b) => Number(b.urgente) - Number(a.urgente)).slice(0, 8);

  const linhas = ordenadas.map((n) => {
    const marcador = n.urgente ? "🔴" : "•";
    const link = `${config.site.baseUrl}/noticia/${n.slug}`;
    return `${marcador} *${n.titulo}* (${NOME_EDITORIA[n.editoria] ?? n.editoria})\n${link}`;
  });

  return `📰 *Radar BV — Resumo do dia ${hoje}*\n\n${linhas.join("\n\n")}\n\nMais em ${config.site.baseUrl}`;
}

async function buscarNoticiasDasUltimas24h(): Promise<NoticiaParaResumo[]> {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("noticias")
    .select("id, titulo, slug, editoria, urgente")
    .eq("status", "publicado")
    .gte("data_publicacao", desde)
    .order("data_publicacao", { ascending: false });

  if (error) {
    await log("error", "resumo_diario", "Falha ao buscar notícias das últimas 24h", { erro: error.message });
    return [];
  }
  return (data ?? []) as NoticiaParaResumo[];
}

async function obterDestinosParaResumoDiario(): Promise<DestinoWhatsApp[]> {
  const { data, error } = await supabase
    .from("destinos_whatsapp")
    .select("*")
    .eq("ativo", true)
    .eq("resumo_diario", true);

  if (error) {
    await log("error", "resumo_diario", "Falha ao buscar destinos do resumo diário", { erro: error.message });
    return [];
  }

  let destinos = (data ?? []) as DestinoWhatsApp[];
  if (destinos.length === 0 && config.whatsapp.webhookUrl) {
    destinos = [
      { id: "legado-env", nome: "Destino legado (WHATSAPP_WEBHOOK_URL)", tipo: "grupo", webhook_url: config.whatsapp.webhookUrl, ativo: true, resumo_diario: true },
    ];
  }
  return destinos;
}

/** Data de "hoje" no formato YYYY-MM-DD, usada tanto pra ler quanto pra
 * gravar — nunca depende do default `current_date` do Postgres, que roda
 * no fuso do servidor do banco e pode divergir do Node perto da virada do
 * dia (ex: 23h59 UTC vs já é outro dia em America/Boa_Vista). Gravar o
 * mesmo valor que se usa pra comparar elimina essa divergência por completo. */
function dataDeHojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Já foi enviado o resumo de hoje pra este destino? (dedupe via Supabase) */
async function jaEnviouHoje(destinoId: string): Promise<boolean> {
  if (destinoId === "legado-env") return false; // destino legado não tem linha própria pra dedupar — best-effort
  const { data } = await supabase
    .from("resumos_diarios_enviados")
    .select("id")
    .eq("destino_id", destinoId)
    .eq("data_envio", dataDeHojeISO())
    .maybeSingle();
  return !!data;
}

async function marcarComoEnviadoHoje(destinoId: string): Promise<void> {
  if (destinoId === "legado-env") return;
  await supabase.from("resumos_diarios_enviados").insert({ destino_id: destinoId, data_envio: dataDeHojeISO() });
}

/**
 * Job diário (Fase 3): compila as notícias publicadas nas últimas 24h e
 * dispara um único resumo consolidado pros destinos marcados para
 * `resumo_diario = true`. Isolamento de Destinos + dedupe por dia (a
 * constraint unique(destino_id, data_envio) garante no máximo 1 envio
 * por destino mesmo que o cron dispare 2x ou o worker reinicie no meio).
 */
export async function executarResumoDiario(): Promise<void> {
  const noticias = await buscarNoticiasDasUltimas24h();
  if (noticias.length === 0) {
    await log("info", "resumo_diario", "Nenhuma notícia publicada nas últimas 24h — resumo diário não enviado");
    return;
  }

  const destinos = await obterDestinosParaResumoDiario();
  if (destinos.length === 0) {
    await log("info", "resumo_diario", "Nenhum destino configurado para resumo diário — pulando");
    return;
  }

  const texto = montarTextoResumoDiario(noticias);
  const fetch = (await import("node-fetch")).default;

  for (const destino of destinos) {
    if (await jaEnviouHoje(destino.id)) {
      await log("info", "resumo_diario", `Resumo diário já enviado hoje para "${destino.nome}" — pulando`);
      continue;
    }

    try {
      const resposta = await fetch(destino.webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.whatsapp.webhookToken}` },
        body: JSON.stringify({ mensagem: texto }),
        signal: AbortSignal.timeout(10_000),
      });

      if (resposta.ok) {
        await marcarComoEnviadoHoje(destino.id);
        await log("info", "resumo_diario", `Resumo diário enviado para "${destino.nome}" (${noticias.length} notícias)`);
      } else {
        await log("warning", "resumo_diario", `Webhook do resumo diário retornou status ${resposta.status}`, { destino: destino.nome });
      }
    } catch (err: any) {
      await log("error", "resumo_diario", "Falha ao enviar resumo diário", {
        destino: destino.nome,
        erro: String(err?.message ?? err),
      });
    }
  }
}
