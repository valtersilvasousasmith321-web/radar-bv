import { log } from "../logger.js";
import { triarComGemini, redigirComGeminiFallback } from "./gemini.js";
import { redigirComClaude, triarComClaude } from "./claude.js";
import { redigirComGroqFallback, triarComGroqFallback } from "./groq.js";
import type { ItemBruto, MateriaRedigida } from "../types.js";

export interface ResultadoPipeline {
  materia: MateriaRedigida;
  origemIA: "claude" | "gemini" | "groq";
  palavraChaveImagem: string;
  fonteUrl: string;
  fonteNome: string;
}

/**
 * Orquestra a esteira completa: Gemini (triagem) -> Claude (redação-chefe)
 * -> Fallback automático (Gemini Flash, depois Groq/Llama) em caso de
 * erro ou limite de cota. Implementa a Regra de Ouro por completo:
 *   1. Trava de Silêncio já foi aplicada antes (collector.ts)
 *   2. Triagem com Fallback em cascata (Gemini -> Claude -> Groq/Llama) —
 *      sem isso, a cota diária do Gemini (free tier) esgotada travava o
 *      jornal inteiro, já que nenhum item passava da triagem.
 *   3. Redação-Chefe Claude, também com Fallback em cascata
 *   4. Blindagem anti-alucinação (embutida nos prompts)
 *   5. Fallback de IA em cascata (cobrindo as etapas 2 e 3)
 */
export async function processarItem(item: ItemBruto): Promise<ResultadoPipeline | null> {
  // --- 2. Triagem e Resumo Pesado, com Fallback em cascata ---
  let resumo = await triarComGemini(item);

  if (!resumo) {
    await log("warning", "pipeline", "Gemini falhou/atingiu cota na triagem — acionando fallback Claude", { url: item.url });
    resumo = await triarComClaude(item);
  }

  if (!resumo) {
    await log("warning", "pipeline", "Claude falhou no fallback de triagem — acionando último fallback (Groq)", { url: item.url });
    resumo = await triarComGroqFallback(item);
  }

  if (!resumo) {
    return null; // sujeira de página, ou triagem falhou nos 3 provedores
  }
  if (resumo.assuntoJaCoberto) {
    await log("info", "pipeline", "Assunto já coberto nas últimas 24h — descartado", { url: item.url });
    return null;
  }

  const paramsRedacao = {
    topicos: resumo.topicos,
    fonteNome: item.fonteNome,
    fonteUrl: item.url,
    editoriaSugerida: resumo.editoriaSugerida,
  };

  // --- 3. Redação-Chefe (Claude) com Fallback automático em cascata ---
  let materia: MateriaRedigida | null = null;
  let origemIA: "claude" | "gemini" | "groq" = "claude";

  try {
    materia = await redigirComClaude(paramsRedacao);
  } catch (err: any) {
    await log("warning", "pipeline", "Claude falhou/atingiu cota — acionando fallback Gemini", {
      url: item.url,
      erro: String(err?.message ?? err),
    });
  }

  if (!materia) {
    origemIA = "gemini";
    materia = await redigirComGeminiFallback(paramsRedacao);
  }

  if (!materia) {
    origemIA = "groq";
    materia = await redigirComGroqFallback(paramsRedacao);
  }

  if (!materia) {
    await log("critico", "pipeline", "Todas as IAs (Claude, Gemini, Groq) falharam para este item — descartado", {
      url: item.url,
    });
    return null;
  }

  await log("info", "pipeline", `Matéria redigida com sucesso via ${origemIA}`, { url: item.url, titulo: materia.titulo });

  return {
    materia,
    origemIA,
    palavraChaveImagem: resumo.palavraChaveImagem,
    fonteUrl: item.url,
    fonteNome: item.fonteNome,
  };
}
