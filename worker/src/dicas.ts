import { supabase } from "./db.js";
import { log } from "./logger.js";
import { julgarDicaBairro } from "./ai/pesquisadorBairro.js";
import { obterImagemParaMateria } from "./images.js";
import { tentarAdquirirTrava, liberarTrava } from "./vigia.js";
import type { DicaBairro } from "./types.js";

/**
 * Pesquisadores por área (item 3 do plano) — frente B: processa as dicas de
 * moradores recebidas via webhook de WhatsApp (apps/web/app/api/dicas/whatsapp).
 *
 * Diferente da esteira normal (collector.ts -> pipeline.ts -> queue.ts):
 * aqui NUNCA se agenda publicação automática. Toda matéria que sai daqui
 * entra como status 'rascunho' — fica invisível ao público até um humano
 * revisar e clicar "Publicar" no painel admin (Notícias -> aba Rascunho),
 * porque é relato de cidadão sem qualquer verificação prévia (ver regra de
 * proteção de identidade em ai/prompts.ts).
 */

function gerarSlug(titulo: string): string {
  const base = titulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  const sufixo = Date.now().toString(36).slice(-5);
  return `${base}-${sufixo}`;
}

async function marcarDescartada(dica: DicaBairro, motivo: string): Promise<void> {
  await supabase
    .from("dicas_bairro")
    .update({ status: "descartada", motivo_descarte: motivo, processado_em: new Date().toISOString() })
    .eq("id", dica.id);
}

/**
 * Processa UMA dica pendente: pede o julgamento da IA, e cria a notícia em
 * rascunho (ou descarta com motivo). Isolado por dica — um erro aqui nunca
 * derruba o processamento das outras dicas do lote (mesmo princípio de
 * Isolamento de Fontes usado em collector.ts).
 */
async function processarUmaDica(dica: DicaBairro): Promise<void> {
  try {
    const resultado = await julgarDicaBairro(dica.mensagem_texto, Boolean(dica.midia_url));

    if (!resultado) {
      // Falha técnica (rede/parse) em todos os provedores — não é uma decisão
      // editorial, então deixa "pendente" pra tentar de novo no próximo ciclo.
      await log("warning", "dicas", "Nenhum provedor de IA conseguiu julgar a dica neste ciclo — tentando de novo depois", {
        dicaId: dica.id,
      });
      return;
    }

    if (!resultado.suficiente) {
      await marcarDescartada(dica, resultado.motivo);
      await log("info", "dicas", "Dica descartada por falta de informação suficiente", { dicaId: dica.id, motivo: resultado.motivo });
      return;
    }

    const { materia } = resultado;

    // Se o morador mandou foto, usa direto (com crédito claro); senão, cai no
    // mesmo banco de imagens de segurança usado pelas matérias normais.
    const imagem = dica.midia_url
      ? { url: dica.midia_url, credito: "Leitor via WhatsApp", eFallback: false }
      : await obterImagemParaMateria("neighborhood street brazil", materia.editoria, {
          titulo: materia.titulo,
          subtitulo: materia.subtitulo ?? "",
          tags: materia.tags ?? [],
        });

    const slug = gerarSlug(materia.titulo);

    const { data, error } = await supabase
      .from("noticias")
      .insert({
        titulo: materia.titulo,
        subtitulo: materia.subtitulo,
        slug,
        conteudo: materia.conteudo,
        editoria: materia.editoria,
        tags: materia.tags,
        imagem_url: imagem.url,
        imagem_credito: imagem.credito,
        imagem_e_fallback: imagem.eFallback,
        fonte_id: null,
        fonte_url_original: "whatsapp://dica-morador",
        fonte_credito: "Relato de morador via WhatsApp",
        origem_ia: "claude",
        status: "rascunho", // SEMPRE rascunho — revisão humana obrigatória
        urgente: false,
      })
      .select("id")
      .single();

    if (error || !data) {
      await log("error", "dicas", "Falha ao salvar rascunho gerado a partir de dica", { dicaId: dica.id, erro: error?.message });
      return; // deixa pendente pra tentar de novo
    }

    await supabase
      .from("dicas_bairro")
      .update({ status: "processada", noticia_id: data.id, processado_em: new Date().toISOString() })
      .eq("id", dica.id);

    await log("info", "dicas", "Rascunho gerado a partir de dica de morador — aguardando revisão no painel admin", {
      dicaId: dica.id,
      noticiaId: data.id,
      titulo: materia.titulo,
    });
  } catch (err: any) {
    await log("error", "dicas", "Falha isolada ao processar dica de morador", { dicaId: dica.id, erro: String(err?.message ?? err) });
  }
}

// Trava monitorada pelo Vigia (item 13) pra este job não sobrepor a si
// mesmo, igual à fila de gotejamento.
const NOME_TRAVA = "processamento-dicas";

/**
 * Job periódico (chamado pelo scheduler): busca dicas pendentes e tenta
 * transformar cada uma em rascunho de notícia. Lote pequeno por ciclo pra
 * não gastar cota de IA de uma vez só caso chegue um pico de mensagens.
 */
export async function processarDicasPendentes(): Promise<void> {
  if (!tentarAdquirirTrava(NOME_TRAVA)) return;

  try {
    const { data: pendentes, error } = await supabase
      .from("dicas_bairro")
      .select("*")
      .eq("status", "pendente")
      .order("criado_em", { ascending: true })
      .limit(10);

    if (error) {
      await log("error", "dicas", "Falha ao buscar dicas pendentes", { erro: error.message });
      return;
    }

    if (!pendentes || pendentes.length === 0) return;

    await log("info", "dicas", `Processando ${pendentes.length} dica(s) de morador pendente(s)`);
    for (const dica of pendentes as DicaBairro[]) {
      await processarUmaDica(dica);
    }
  } finally {
    liberarTrava(NOME_TRAVA);
  }
}
