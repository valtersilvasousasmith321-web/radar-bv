import { log } from "../logger.js";
import { agruparComGemini } from "./gemini.js";
import { agruparComClaude } from "./claude.js";
import { agruparComGroqFallback } from "./groq.js";
import { agruparComOpenRouterFallback } from "./openrouter.js";
import { estaDisponivel } from "./quotaTracker.js";
import type { ItemBruto } from "../types.js";

/**
 * Agrupador de Pauta (proposta de Valter, 22/11/2026, parte 2 — Curadoria
 * Multi-Fonte): roda UMA VEZ por ciclo de coleta, não por item, pra manter
 * o custo baixo. Recebe todos os itens inéditos do ciclo e devolve esses
 * mesmos itens já separados em grupos — cada grupo com 2+ itens é um
 * mesmo fato contado por fontes diferentes (vai pra processarItemMultiFonte
 * no pipeline); cada grupo de 1 item segue o caminho normal de sempre.
 *
 * Com 0 ou 1 item no ciclo, nem vale a pena perguntar pra IA — devolve na
 * hora sem gastar nenhuma chamada.
 *
 * Fail-open (mesma filosofia do resto do sistema): se todas as IAs da
 * cascata falharem, ou se a resposta vier malformada (índice repetido,
 * faltando, fora do intervalo), trata TODOS os itens como grupos de 1 —
 * o comportamento de hoje, nunca perde ou duplica um item por causa de um
 * agrupamento malsucedido.
 */
export async function agruparItensPorAssunto<T extends ItemBruto>(itens: T[]): Promise<T[][]> {
  if (itens.length <= 1) {
    return itens.map((item) => [item]);
  }

  const itensParaPrompt = itens.map((item, indice) => ({
    indice,
    fonteNome: item.fonteNome,
    titulo: item.tituloOriginal,
    trecho: item.conteudoBruto.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  }));

  let resultado: { grupos: number[][] } | null = null;

  if (estaDisponivel("gemini")) {
    resultado = await agruparComGemini(itensParaPrompt);
  }
  if (!resultado && estaDisponivel("claude")) {
    resultado = await agruparComClaude(itensParaPrompt);
  }
  if (!resultado && estaDisponivel("groq")) {
    resultado = await agruparComGroqFallback(itensParaPrompt);
  }
  if (!resultado) {
    resultado = await agruparComOpenRouterFallback(itensParaPrompt);
  }

  const grupos = resultado && validarGrupos(resultado.grupos, itens.length) ? resultado.grupos : null;

  if (!grupos) {
    await log("info", "agrupador", "Agrupamento de pauta indisponível ou inválido neste ciclo — tratando cada item separadamente", {
      totalItens: itens.length,
    });
    return itens.map((item) => [item]);
  }

  const gruposDeItens = grupos.map((indices) => indices.map((i) => itens[i]));
  const totalAgrupados = gruposDeItens.filter((g) => g.length > 1).length;
  if (totalAgrupados > 0) {
    await log("info", "agrupador", `Agrupamento de pauta concluído: ${totalAgrupados} grupo(s) com mais de 1 fonte sobre o mesmo fato`, {
      grupos: gruposDeItens.filter((g) => g.length > 1).map((g) => g.map((i) => i.fonteNome)),
    });
  }
  return gruposDeItens;
}

/** Garante que cada índice de 0..n-1 aparece em exatamente um grupo — senão, descarta o agrupamento inteiro (fail-open). */
function validarGrupos(grupos: unknown, total: number): grupos is number[][] {
  if (!Array.isArray(grupos)) return false;
  const vistos = new Set<number>();
  for (const grupo of grupos) {
    if (!Array.isArray(grupo)) return false;
    for (const indice of grupo) {
      if (typeof indice !== "number" || indice < 0 || indice >= total || vistos.has(indice)) return false;
      vistos.add(indice);
    }
  }
  return vistos.size === total;
}
