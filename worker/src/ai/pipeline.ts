import { log } from "../logger.js";
import { triarComOllama } from "./ollama.js";
import { triarComGemini, redigirComGeminiFallback } from "./gemini.js";
import { redigirComClaude, triarComClaude } from "./claude.js";
import { redigirComGroqFallback, triarComGroqFallback } from "./groq.js";
import { redigirComOpenRouterFallback, triarComOpenRouterFallback } from "./openrouter.js";
import { estaDisponivel, pareceErroDeCota, marcarIndisponivel } from "./quotaTracker.js";
import type { ItemBruto, MateriaRedigida } from "../types.js";

export interface ResultadoPipeline {
  materia: MateriaRedigida;
  origemIA: "claude" | "gemini" | "groq" | "openrouter";
  palavraChaveImagem: string;
  fonteUrl: string;
  fonteNome: string;
}

/**
 * Orquestra a esteira completa: IA local (Ollama) -> Gemini -> Claude ->
 * Groq na triagem, depois Claude (redação-chefe) -> Fallback automático
 * (Gemini Flash, depois Groq/Llama) em caso de erro ou limite de cota.
 * Implementa a Regra de Ouro por completo:
 *   1. Trava de Silêncio já foi aplicada antes (collector.ts)
 *   2. Triagem com Fallback em cascata (IA local -> Gemini -> Claude ->
 *      Groq/Llama) — a IA local roda no próprio computador, sem cota nem
 *      custo, e faz o "serviço pesado" da triagem na maioria dos casos;
 *      as APIs de nuvem (com teto diário gratuito baixo) só entram quando
 *      a IA local não está disponível ou não resolveu o item.
 *   3. Redação-Chefe Claude, também com Fallback em cascata
 *   4. Blindagem anti-alucinação (embutida nos prompts)
 *   5. Fallback de IA em cascata (cobrindo as etapas 2 e 3)
 */
export async function processarItem(item: ItemBruto): Promise<ResultadoPipeline | null> {
  // --- 2. Triagem e Resumo Pesado, com Fallback em cascata ---
  // A IA local (Ollama) vai na frente: sem cota/custo, poupa o teto diário
  // gratuito do Gemini e do Groq pros casos em que ela não está disponível.
  let resumo = await triarComOllama(item);

  if (resumo) {
    await log("info", "pipeline", "Triagem resolvida pela IA local (Ollama) — sem gastar cota de nuvem", { url: item.url });
  } else if (estaDisponivel("gemini")) {
    resumo = await triarComGemini(item);
  } else {
    await log("info", "pipeline", "Gemini pulado (sem fôlego recente) — indo direto pro Claude", { url: item.url });
  }

  if (!resumo && estaDisponivel("claude")) {
    await log("warning", "pipeline", "Gemini falhou/atingiu cota na triagem — acionando fallback Claude", { url: item.url });
    resumo = await triarComClaude(item);
  } else if (!resumo) {
    await log("info", "pipeline", "Claude pulado (sem fôlego recente) — indo direto pro Groq", { url: item.url });
  }

  if (!resumo && estaDisponivel("groq")) {
    await log("warning", "pipeline", "Claude falhou no fallback de triagem — acionando Groq", { url: item.url });
    resumo = await triarComGroqFallback(item);
  } else if (!resumo) {
    await log("info", "pipeline", "Groq pulado (sem fôlego recente) — indo direto pro OpenRouter", { url: item.url });
  }

  if (!resumo) {
    resumo = await triarComOpenRouterFallback(item);
  }

  if (!resumo) {
    return null; // sujeira de página, ou triagem falhou em todos os provedores
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
  let origemIA: "claude" | "gemini" | "groq" | "openrouter" = "claude";

  if (estaDisponivel("claude")) {
    try {
      materia = await redigirComClaude(paramsRedacao);
    } catch (err: any) {
      if (pareceErroDeCota(err)) await marcarIndisponivel("claude", String(err?.message ?? err));
      await log("warning", "pipeline", "Claude falhou/atingiu cota — acionando fallback Gemini", {
        url: item.url,
        erro: String(err?.message ?? err),
      });
    }
  } else {
    await log("info", "pipeline", "Claude pulado na redação (sem fôlego recente) — indo direto pro Gemini", { url: item.url });
  }

  if (!materia && estaDisponivel("gemini")) {
    origemIA = "gemini";
    materia = await redigirComGeminiFallback(paramsRedacao);
  } else if (!materia) {
    await log("info", "pipeline", "Gemini pulado na redação (sem fôlego recente) — indo direto pro Groq", { url: item.url });
  }

  if (!materia && estaDisponivel("groq")) {
    origemIA = "groq";
    materia = await redigirComGroqFallback(paramsRedacao);
  }

  if (!materia) {
    origemIA = "openrouter";
    materia = await redigirComOpenRouterFallback(paramsRedacao);
  }

  if (!materia) {
    await log("critico", "pipeline", "Todas as IAs da bancada falharam para este item — descartado", {
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
