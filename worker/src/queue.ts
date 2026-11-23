import { supabase } from "./db.js";
import { log } from "./logger.js";
import { config } from "./config.js";
import { marcarComoProcessada } from "./collector.js";
import { obterImagemParaMateria } from "./images.js";
import { gerarResumoWhatsApp, enviarParaWhatsApp } from "./whatsapp.js";
import { revisarCamada1, revisarCamada2 } from "./ai/revisor.js";
import { verificarFatos } from "./ai/verificadorFatos.js";
import { verificarCompliance } from "./ai/juridico.js";
import { avaliarInfografico } from "./ai/infografista.js";
import { verificarDuplicacaoReal } from "./ai/editorChefe.js";
import { tentarAdquirirTrava, liberarTrava } from "./vigia.js";
import { notificarNovaNoticia } from "./pushNotificacoes.js";
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
 * Slot de publicação pra matéria urgente (Editor-chefe, item 11): não
 * espera na fila do gotejamento atrás de matérias comuns — publica quase
 * na hora (1 min), sem mexer no `proximoSlotPublicacao` das demais.
 */
function calcularSlotUrgente(): Date {
  return new Date(Date.now() + 60_000);
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
  const { origemIA, palavraChaveImagem } = resultado;

  // Revisor/Copydesk (item 9) — Camada 1: código, grátis, nunca bloqueia
  // sozinha, só limpa o que dá pra limpar com segurança e sinaliza o resto.
  const { materia, achados } = revisarCamada1(resultado.materia);
  if (achados.length > 0) {
    await log("warning", "revisor", "Camada 1 encontrou avisos na matéria", { titulo: materia.titulo, achados });
  }

  // Editor-chefe/Organizador (item 11) — checa duplicação REAL contra as
  // notícias de verdade já na fila/publicadas nas últimas 24h na mesma
  // editoria, antes de gastar imagem/Revisor/Verificador com algo que vai
  // ser descartado de qualquer jeito. Se for duplicata, não cria a notícia
  // — só fecha a Trava de Silêncio pra essa URL, pra não ficar reprocessando.
  const organizacao = await verificarDuplicacaoReal(materia);
  if (organizacao.duplicada) {
    await log("info", "editorChefe", "Matéria descartada por duplicar notícia já existente", {
      titulo: materia.titulo,
      motivo: organizacao.motivo,
    });
    await marcarComoProcessada(fonteId, resultado.fonteUrl, hashUrl);
    return;
  }

  const contextoMateria = [materia.titulo, materia.subtitulo, ...(materia.tags ?? [])].join(" ");
  const imagem = await obterImagemParaMateria(palavraChaveImagem, materia.editoria, contextoMateria);

  // Camada 2 — IA leve, sempre roda (só ela pega erro de sentido/tom/foto
  // incoerente). Se reprovar, a matéria não é perdida: cai como rascunho
  // pra revisão humana em vez de publicar algo com problema real.
  const revisao = await revisarCamada2(materia, imagem.credito, imagem.eFallback);
  if (!revisao.aprovado) {
    await log("warning", "revisor", "Camada 2 reprovou a matéria — enviando como rascunho pra revisão humana", {
      titulo: materia.titulo,
      motivo: revisao.motivo,
    });
  }

  // Verificador de Fatos (item 10) — combate a fake news/desinformação:
  // checa se a matéria redigida não inventou nenhum fato que não estava
  // nos tópicos apurados na triagem. Roda independente do Revisor; se
  // QUALQUER um dos dois reprovar, a matéria vai como rascunho.
  const verificacao = await verificarFatos(materia, resultado.topicosApurados, resultado.fonteNome);
  if (!verificacao.aprovado) {
    await log("warning", "verificadorFatos", "Verificador de Fatos reprovou a matéria — enviando como rascunho pra revisão humana", {
      titulo: materia.titulo,
      motivo: verificacao.motivo,
    });
  }

  // Jurídico/Compliance Editorial (item 20, prioritário) — checa risco
  // jurídico específico: exposição de menor, presunção de inocência e
  // difamação. Roda independente do Revisor e do Verificador de Fatos; se
  // QUALQUER um dos três reprovar, a matéria vai como rascunho.
  const compliance = await verificarCompliance(materia);
  if (!compliance.aprovado) {
    await log("warning", "juridico", "Checagem jurídica reprovou a matéria — enviando como rascunho pra revisão humana", {
      titulo: materia.titulo,
      motivo: compliance.motivo,
    });
  }

  const aprovadoParaPublicar = revisao.aprovado && verificacao.aprovado && compliance.aprovado;

  // Infografista (item 18) — só gera infográfico quando a matéria realmente
  // tem dado numérico comparável ou sequência de eventos datados; a maioria
  // das matérias não tem, e `infografico` fica null nesse caso (não bloqueia
  // nem atrasa a publicação).
  const infografico = await avaliarInfografico(materia, resultado.topicosApurados);

  const slug = gerarSlug(materia.titulo);
  // Editor-chefe/Organizador (item 11) — priorização: matéria urgente não
  // espera atrás das comuns na fila do gotejamento, publica quase na hora.
  const dataPublicacao = materia.urgente ? calcularSlotUrgente() : calcularProximoSlot();
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
      infografico,
      fonte_id: fonteId,
      fonte_url_original: resultado.fonteUrl,
      fonte_credito: resultado.fonteNome,
      fontes_cruzadas: resultado.fontesCruzadas?.map((f) => ({ nome: f.nome, url: f.url })) ?? null,
      origem_ia: origemIA,
      status: aprovadoParaPublicar ? "agendado" : "rascunho",
      urgente: materia.urgente,
      data_publicacao: aprovadoParaPublicar ? dataPublicacao.toISOString() : null,
    })
    .select("id")
    .single();

  if (error || !data) {
    await log("error", "queue", "Falha ao agendar publicação da notícia", { erro: error?.message, titulo: materia.titulo });
    return;
  }

  await marcarComoProcessada(fonteId, resultado.fonteUrl, hashUrl, data.id);

  // Curadoria Multi-Fonte (item novo, 22/11/2026): fecha a Trava de
  // Silêncio pra TODAS as URLs do grupo, não só a principal — senão as
  // outras fontes do mesmo fato ficariam "inéditas" de novo no próximo
  // ciclo e seriam reprocessadas (triagem, busca de imagem etc.) à toa.
  if (resultado.fontesCruzadas) {
    for (const extra of resultado.fontesCruzadas) {
      if (extra.url === resultado.fonteUrl) continue; // já marcada acima — é a própria fonte principal
      await marcarComoProcessada(extra.fonteId, extra.url, extra.hash, data.id);
    }
  }

  await log(
    "info",
    "queue",
    aprovadoParaPublicar
      ? `Notícia agendada para ${dataPublicacao.toISOString()}`
      : "Notícia salva como rascunho (reprovada pelo Revisor ou pelo Verificador de Fatos) — aguardando revisão humana",
    { noticiaId: data.id, titulo: materia.titulo },
  );
}

// Trava monitorada pelo Vigia (item 13) pra esta rotina não sobrepor a si
// mesma (ela roda a cada 1 minuto; se o Supabase ou o webhook do WhatsApp
// demorarem, a próxima chamada do cron não deve iniciar uma segunda leitura/
// publicação em paralelo).
const NOME_TRAVA = "publicacao-agendada";

/**
 * Job periódico (chamado pelo scheduler): publica as notícias cujo
 * `data_publicacao` já chegou, e dispara o resumo para o WhatsApp.
 * Roda a cada 1 minuto — leve, sem custo de IA.
 */
export async function publicarNoticiasAgendadas(): Promise<void> {
  if (!tentarAdquirirTrava(NOME_TRAVA)) return;

  try {
    const agora = new Date().toISOString();
    const { data: pendentes, error } = await supabase
      .from("noticias")
      .select("id, resumo_whatsapp, titulo, subtitulo, slug, editoria")
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
      // Algoritmo de Personalização + Notificações (item 16): notifica só
      // quem ativou push e escolheu acompanhar essa editoria (ou "todas").
      await notificarNovaNoticia(noticia);
    }
  } finally {
    liberarTrava(NOME_TRAVA);
  }
}
