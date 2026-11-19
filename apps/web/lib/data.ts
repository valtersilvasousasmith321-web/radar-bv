import { supabase } from "./supabase";
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
