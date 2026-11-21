import { supabase } from "../db.js";
import { log } from "../logger.js";

/**
 * Analista de Desempenho/Estratégia (item 15 do plano) — "acompanha
 * estatística real do portal (o que rende, o que é fraco, onde ganha/perde
 * audiência)."
 *
 * Puro código (robô serve a IA — item transversal): não gasta nenhuma
 * chamada de IA, só agrega os números reais de visualizações/cliques que
 * passaram a ser registrados de verdade (ver migracao-metricas-desempenho.sql
 * e as rotas /api/metricas/*). Sem essa instrumentação, a coluna
 * `visualizacoes` sempre ficava em 0 — não existia estatística real nenhuma
 * pra analisar antes deste item.
 *
 * Gera um relatório semanal (log, por enquanto — alimenta o futuro Painel
 * do Administrador, item 22): editoria que mais rende, qual é mais fraca, e
 * o desempenho geral de banners (CTR). A parte "propor criação de cargos
 * novos" do plano fica fora da automação por enquanto — é uma decisão
 * estratégica sobre a arquitetura do próprio sistema, melhor feita
 * revisando este relatório em conversa do que uma IA barata decidindo
 * sozinha criar um cargo novo.
 */
export async function gerarRelatorioDesempenho(): Promise<void> {
  const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: noticias, error: erroNoticias } = await supabase
    .from("noticias")
    .select("editoria, visualizacoes")
    .eq("status", "publicado")
    .gte("criado_em", desde);

  if (erroNoticias) {
    await log("warning", "analista", "Falha ao buscar notícias pro relatório de desempenho", { erro: erroNoticias.message });
    return;
  }

  if (!noticias || noticias.length === 0) {
    await log("info", "analista", "Relatório semanal de desempenho: nenhuma notícia publicada nos últimos 7 dias");
    return;
  }

  const porEditoria = new Map<string, { total: number; soma: number }>();
  for (const n of noticias) {
    const atual = porEditoria.get(n.editoria) ?? { total: 0, soma: 0 };
    atual.total += 1;
    atual.soma += n.visualizacoes ?? 0;
    porEditoria.set(n.editoria, atual);
  }

  const resumoEditorias = Array.from(porEditoria.entries())
    .map(([editoria, { total, soma }]) => ({
      editoria,
      noticiasPublicadas: total,
      visualizacoesTotais: soma,
      mediaPorNoticia: Math.round((soma / total) * 10) / 10,
    }))
    .sort((a, b) => b.mediaPorNoticia - a.mediaPorNoticia);

  const melhorEditoria = resumoEditorias.length > 1 ? resumoEditorias[0] : null;
  const piorEditoria = resumoEditorias.length > 1 ? resumoEditorias[resumoEditorias.length - 1] : null;

  const { data: banners, error: erroBanners } = await supabase
    .from("banners_publicidade")
    .select("visualizacoes, cliques")
    .eq("ativo", true);

  let resumoBanners: { impressoes: number; cliques: number; ctrPercentual: number } | null = null;
  if (!erroBanners && banners && banners.length > 0) {
    const impressoes = banners.reduce((acc, b) => acc + (b.visualizacoes ?? 0), 0);
    const cliques = banners.reduce((acc, b) => acc + (b.cliques ?? 0), 0);
    resumoBanners = {
      impressoes,
      cliques,
      ctrPercentual: impressoes > 0 ? Math.round((cliques / impressoes) * 1000) / 10 : 0,
    };
  }

  await log("info", "analista", "Relatório semanal de desempenho do portal", {
    periodoDias: 7,
    totalNoticiasPublicadas: noticias.length,
    porEditoria: resumoEditorias,
    editoriaComMelhorDesempenho: melhorEditoria?.editoria ?? null,
    editoriaComDesempenhoMaisFraco: piorEditoria?.editoria ?? null,
    banners: resumoBanners,
  });
}
