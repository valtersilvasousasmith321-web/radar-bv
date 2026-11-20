import { supabase } from "./supabase";
import { supabaseAdmin } from "./supabase-admin";
import { BANNERS_DEMO, NOTICIAS_DEMO } from "./dados-demo";
import type { Banner, Editoria, Noticia } from "./types";

/**
 * Busca as últimas notícias publicadas. Usa o Supabase real quando
 * configurado; cai nos dados de demonstração quando não está (ou se a
 * consulta falhar) — o site nunca fica numa tela vazia/quebrada.
 */
export async function getNoticias(opts?: { editoria?: Editoria; limite?: number }): Promise<Noticia[]> {
  if (supabase) {
    let query = supabase
      .from("noticias")
      .select("*")
      .eq("status", "publicado")
      .order("data_publicacao", { ascending: false })
      .limit(opts?.limite ?? 30);

    if (opts?.editoria) query = query.eq("editoria", opts.editoria);

    const { data, error } = await query;
    if (!error && data) return data as Noticia[];
  }

  let lista = NOTICIAS_DEMO;
  if (opts?.editoria) lista = lista.filter((n) => n.editoria === opts.editoria);
  return lista.slice(0, opts?.limite ?? 30);
}

/**
 * Busca notícias publicadas em "páginas", da mais recente pra mais antiga —
 * é o que alimenta a rolagem infinita das páginas de editoria: a pessoa vai
 * descendo e o feed vai carregando sozinho dias e dias pra trás, sem limite
 * (igual os grandes portais de notícia: G1, UOL etc). Como nenhuma notícia
 * é apagada do banco, o histórico completo sempre está acessível assim,
 * sem precisar de uma tela de "arquivo" separada.
 */
export async function getNoticiasPaginadas(opts: {
  editoria?: Editoria;
  offset: number;
  quantidade: number;
}): Promise<{ itens: Noticia[]; temMais: boolean }> {
  if (supabase) {
    let query = supabase
      .from("noticias")
      .select("*")
      .eq("status", "publicado")
      .order("data_publicacao", { ascending: false })
      .range(opts.offset, opts.offset + opts.quantidade); // 1 item a mais, só pra saber se tem próxima página

    if (opts.editoria) query = query.eq("editoria", opts.editoria);

    const { data, error } = await query;
    if (!error && data) {
      const temMais = data.length > opts.quantidade;
      return { itens: data.slice(0, opts.quantidade) as Noticia[], temMais };
    }
  }

  let lista = NOTICIAS_DEMO;
  if (opts.editoria) lista = lista.filter((n) => n.editoria === opts.editoria);
  const fatia = lista.slice(opts.offset, opts.offset + opts.quantidade);
  return { itens: fatia, temMais: opts.offset + opts.quantidade < lista.length };
}

export async function getNoticiaPorSlug(slug: string): Promise<Noticia | null> {
  if (supabase) {
    const { data, error } = await supabase.from("noticias").select("*").eq("slug", slug).eq("status", "publicado").maybeSingle();
    if (!error && data) return data as Noticia;
  }
  return NOTICIAS_DEMO.find((n) => n.slug === slug) ?? null;
}

export async function getNoticiasRelacionadas(noticia: Noticia, limite = 3): Promise<Noticia[]> {
  const todas = await getNoticias({ editoria: noticia.editoria, limite: limite + 1 });
  return todas.filter((n) => n.slug !== noticia.slug).slice(0, limite);
}

/**
 * Banner pra um slot, já considerando o Motor de Publicidade Inteligente
 * (função `obter_banner_contextual` do schema.sql) quando o Supabase
 * está configurado. Sem Supabase, usa o banner de demonstração daquela
 * posição — garante que todo slot de anúncio sempre mostra algo.
 */
export async function getBanner(posicao: Banner["posicao"], contexto?: { tags?: string[]; editoria?: Editoria }): Promise<Banner | null> {
  if (supabase) {
    const { data, error } = await supabase.rpc("obter_banner_contextual", {
      p_posicao: posicao,
      p_tags: contexto?.tags ?? [],
      p_editoria: contexto?.editoria ?? null,
    });
    if (!error && data && data.length > 0) return data[0] as Banner;
  }
  return BANNERS_DEMO[posicao] ?? null;
}

export interface StatusMesaRedacao {
  /** Rótulo da etapa atual do pulso jornalístico, em português, pronto pra exibir. */
  etapa: string;
  /** ISO do instante desse status (último log relevante), pra calcular "há X min" no cliente. */
  quando: string | null;
  /** Quantas fontes oficiais estão ativas agora (fontes_monitoradas.ativa = true). */
  quantidadeFontes: number;
  /** false quando não há log recente (worker nunca rodou um pulso ou está há mais de 3h parado). */
  ativo: boolean;
}

const LIMITE_INATIVIDADE_MS = 3 * 60 * 60 * 1000; // 3h — depois disso, trata como ocioso, não "travado"

/**
 * Status real da Mesa de Redação, lido do logs_sistema do worker (Supabase,
 * via service_role — tabela sem policy pública, então só pode ser chamado
 * de um Server Component). Sem Supabase configurado, ou sem nenhum log
 * ainda, retorna um estado honesto de "aguardando" em vez de inventar
 * atividade — a barra existe pra dar transparência real, não decoração.
 */
export async function getStatusMesaRedacao(): Promise<StatusMesaRedacao> {
  if (!supabase) {
    return { etapa: "Aguardando o worker ser configurado", quando: null, quantidadeFontes: 0, ativo: false };
  }

  try {
    const db = supabaseAdmin();
    const [{ data: ultimoLog }, { count: quantidadeFontes }] = await Promise.all([
      db
        .from("logs_sistema")
        .select("origem, mensagem, criado_em")
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db.from("fontes_monitoradas").select("id", { count: "exact", head: true }).eq("ativa", true),
    ]);

    if (!ultimoLog) {
      return { etapa: "Aguardando o primeiro pulso do Cron Dinâmico", quando: null, quantidadeFontes: quantidadeFontes ?? 0, ativo: false };
    }

    const idadeMs = Date.now() - new Date(ultimoLog.criado_em).getTime();
    if (idadeMs > LIMITE_INATIVIDADE_MS) {
      return { etapa: "Aguardando o próximo pulso agendado", quando: null, quantidadeFontes: quantidadeFontes ?? 0, ativo: false };
    }

    const etapa = etapaAPartirDoLog(ultimoLog.origem, ultimoLog.mensagem);
    return { etapa, quando: ultimoLog.criado_em, quantidadeFontes: quantidadeFontes ?? 0, ativo: true };
  } catch {
    return { etapa: "Status indisponível no momento", quando: null, quantidadeFontes: 0, ativo: false };
  }
}

function etapaAPartirDoLog(origem: string, mensagem: string): string {
  if (origem === "scheduler") {
    if (mensagem.includes("Iniciando pulso")) return "Coletando fontes oficiais";
    if (mensagem.includes("concluído")) return "Aguardando próximo pulso";
    return "Monitorando fontes";
  }
  if (origem === "collector") return "Coletando fontes oficiais";
  if (origem === "pipeline") {
    if (mensagem.includes("redigida com sucesso via claude")) return "Redigindo — Claude";
    if (mensagem.includes("redigida com sucesso via gemini")) return "Redigindo — Gemini (fallback)";
    if (mensagem.includes("redigida com sucesso via groq")) return "Redigindo — Groq (fallback)";
    if (mensagem.includes("já coberto")) return "Triagem — Gemini";
    return "Triagem — Gemini";
  }
  if (origem === "queue") {
    if (mensagem.includes("publicada")) return "Publicado";
    if (mensagem.includes("agendada")) return "Na fila de publicação";
  }
  return "Monitorando";
}
