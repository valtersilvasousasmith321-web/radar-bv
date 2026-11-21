import { supabase } from "./db.js";
import { log } from "./logger.js";
import { config } from "./config.js";
import { marcarComoProcessada } from "./collector.js";
import { obterImagemParaMateria } from "./images.js";
import { gerarResumoWhatsApp, enviarParaWhatsApp } from "./whatsapp.js";
import type { ResultadoPipeline } from "./ai/pipeline.js";

function gerarSlug(titulo: string): string {
  const base = titulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  const sufixo = Date.now().toString(36).slice(-5);
  return `${base}-${sufixo}`;
}

/** Guarda o próximo horário livre de publicação em memória do processo */
let proximoSlotPublicacao: number | null = null;

/** Calcula o próximo horário de publicação respeitando 20-30min entre posts */
function calcularProximoSlot(): Date {
  const agora = Date.now();
  const base = proximoSlotPublicacao && proximoSlotPublicacao > agora ? proximoSlotPublicacao : agora;

  const { minMinutos, maxMinutos } = config.gotejamento;
  const intervaloMin = minMinutos + Math.random() * (maxMinutos - minMinutos);
  const proximo = base + intervaloMin * 60_000;

  proximoSlotPublicacao = proximo;
  return new Date(proximo);
}

/**
 * Fila de Gotejamento (Regra de Ouro — item 6): se o coletor captura várias
 * notícias de uma vez, salva todas no banco já, mas agenda `data_publicacao`
 * em intervalos de 20-30min entre si, para manter o portal sempre vivo ao
 * longo do dia em vez de publicar tudo de uma vez.
 *
 * Também: gera a imagem (com fallback de segurança), grava a notícia como
 * "agendado", marca a URL como processada (fecha a Trava de Silêncio) e
 * prepara o resumo de WhatsApp (disparado quando o status virar "publicado").
 */
export async function agendarPublicacao(resultado: ResultadoPipeline, fonteId: string, hashUrl: string): Promise<void> {
  const { materia, origemIA, palavraChaveImagem } = resultado;

  const contextoMateria = [materia.titulo, materia.subtitulo, ...(materia.tags ?? [])].join(" ");
  const imagem = await obterImagemParaMateria(palavraChaveImagem, materia.editoria, contextoMateria);
  const slug = gerarSlug(materia.titulo);
  const dataPublicacao = calcularProximoSlot();
  const resumoWhatsApp = gerarResumoWhatsApp(materia, slug);

  const { data, error } = await supabase
    .from("noticias")
    .insert({
      titulo: materia.titulo,
      subtitulo: materia.subtitulo,
      slug,
      conteudo: materia.conteudo,
      resumo_whatsapp: resumoWhatsApp,
      editoria: materia.editoria,
      tags: materia.tags,
      imagem_url: imagem.url,
      imagem_credito: imagem.credito,
      imagem_e_fallback: imagem.eFallback,
      fonte_id: fonteId,
      fonte_url_original: resultado.fonteUrl,
      fonte_credito: resultado.fonteNome,
      origem_ia: origemIA,
      status: "agendado",
      urgente: materia.urgente,
      data_publicacao: dataPublicacao.toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    await log("error", "queue", "Falha ao agendar publicação da notícia", { erro: error?.message, titulo: materia.titulo });
    return;
  }

  await marcarComoProcessada(fonteId, resultado.fonteUrl, hashUrl, data.id);
  await log("info", "queue", `Notícia agendada para ${dataPublicacao.toISOString()}`, { noticiaId: data.id, titulo: materia.titulo });
}

// Trava simples para esta rotina não sobrepor a si mesma (ela roda a cada
// 1 minuto; se o Supabase ou o webhook do WhatsApp demorarem, a próxima
// chamada do cron não deve iniciar uma segunda leitura/publicação em paralelo).
let publicacaoEmExecucao = false;

/**
 * Job periódico (chamado pelo scheduler): publica as notícias cujo
 * `data_publicacao` já chegou, e dispara o resumo para o WhatsApp.
 * Roda a cada 1 minuto — leve, sem custo de IA.
 */
export async function publicarNoticiasAgendadas(): Promise<void> {
  if (publicacaoEmExecucao) return;
  publicacaoEmExecucao = true;

  try {
    const agora = new Date().toISOString();
    const { data: pendentes, error } = await supabase
      .from("noticias")
      .select("id, resumo_whatsapp")
      .eq("status", "agendado")
      .lte("data_publicacao", agora);

    if (error) {
      await log("error", "queue", "Falha ao buscar notícias agendadas para publicar", { erro: error.message });
      return;
    }

    for (const noticia of pendentes ?? []) {
      const { error: erroUpdate } = await supabase.from("noticias").update({ status: "publicado" }).eq("id", noticia.id);
      if (erroUpdate) {
        await log("error", "queue", "Falha ao publicar notícia agendada", { noticiaId: noticia.id, erro: erroUpdate.message });
        continue;
      }
      await log("info", "queue", "Notícia publicada", { noticiaId: noticia.id });
      if (noticia.resumo_whatsapp) {
        await enviarParaWhatsApp(noticia.resumo_whatsapp);
      }
    }
  } finally {
    publicacaoEmExecucao = false;
  }
}
