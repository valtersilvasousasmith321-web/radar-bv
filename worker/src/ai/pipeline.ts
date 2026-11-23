import { log } from "../logger.js";
import { triarComOllama } from "./ollama.js";
import { triarComGemini, redigirComGeminiFallback, redigirMultiFonteComGeminiFallback } from "./gemini.js";
import { redigirComClaude, redigirMultiFonteComClaude, triarComClaude } from "./claude.js";
import { redigirComGroqFallback, redigirMultiFonteComGroqFallback, triarComGroqFallback } from "./groq.js";
import { redigirComOpenRouterFallback, redigirMultiFonteComOpenRouterFallback, triarComOpenRouterFallback } from "./openrouter.js";
import { redigirComMistralFallback, redigirMultiFonteComMistralFallback, triarComMistralFallback } from "./mistral.js";
import { redigirComCohereFallback, redigirMultiFonteComCohereFallback, triarComCohereFallback } from "./cohere.js";
import { estaDisponivel, pareceErroDeCota, marcarIndisponivel } from "./quotaTracker.js";
import type { Editoria, ItemBruto, MateriaRedigida, ResumoGemini } from "../types.js";

type OrigemIA = "claude" | "gemini" | "groq" | "openrouter" | "mistral" | "cohere";

export interface FonteCruzada {
  fonteId: string;
  url: string;
  nome: string;
  hash: string;
}

export interface ResultadoPipeline {
  materia: MateriaRedigida;
  origemIA: OrigemIA;
  palavraChaveImagem: string;
  fonteUrl: string;
  fonteNome: string;
  topicosApurados: string[];
  /**
   * Crédito de Fonte Primária (22/11/2026): o nome que efetivamente vai pro
   * campo público "fonte_credito" da matéria. Nunca é simplesmente o nome
   * do veículo de coleta quando esse veículo é um concorrente comercial
   * (ver FonteMonitorada.creditar_publicamente) — nesses casos, só aparece
   * aqui a fonte primária que a própria IA identificou no texto (um órgão
   * oficial, por exemplo), ou null quando nenhuma foi identificável (nesse
   * caso a matéria simplesmente não exibe nenhuma linha de crédito).
   */
  fonteCreditoPublico: string | null;
  /**
   * Curadoria Multi-Fonte (22/11/2026): presente só quando a matéria veio de
   * processarItemMultiFonte. Lista TODAS as fontes usadas (mesmo quando só
   * 1 sobreviveu à triagem) — queue.ts usa isso pra fechar a Trava de
   * Silêncio de cada URL do grupo e gravar o registro completo no banco.
   */
  fontesCruzadas?: FonteCruzada[];
}

/** "X", "X e Y" ou "X, Y e Z" — junta nomes de fonte pro crédito público multi-fonte. */
function juntarNomes(nomes: string[]): string | null {
  if (nomes.length === 0) return null;
  if (nomes.length === 1) return nomes[0];
  if (nomes.length === 2) return `${nomes[0]} e ${nomes[1]}`;
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/**
 * Crédito de Fonte Primária (22/11/2026 — a pedido do Valter: "não pode
 * parecer que a gente copiou o G1/Folha, tem que buscar a fonte principal
 * do jeito que eles fazem"). Prioridade:
 *   1. A fonte primária que a própria IA identificou dentro do texto
 *      apurado (ex.: "Ministério da Saúde") — sempre a mais específica e
 *      honesta, usada independente de qual veículo foi coletado.
 *   2. Na ausência dela, os nomes das fontes de coleta que PODEM aparecer
 *      publicamente (creditarPublicamente === true) — comportamento igual
 *      ao de sempre para fontes oficiais, agências e "busca".
 *   3. Se nada sobrar (nenhuma fonte primária achada E a(s) fonte(s) de
 *      coleta são veículo(s) concorrente(s) marcados como não-creditáveis),
 *      null — a matéria sai sem nenhuma linha de crédito, em vez de citar
 *      um concorrente.
 */
function calcularCreditoPublico(fontePrimaria: string | null | undefined, fontes: Array<{ nome: string; creditarPublicamente: boolean }>): string | null {
  const primariaLimpa = fontePrimaria?.trim();
  if (primariaLimpa) return primariaLimpa;
  return juntarNomes(fontes.filter((f) => f.creditarPublicamente).map((f) => f.nome));
}

/** Triagem com Fallback em cascata (IA local -> Gemini -> Claude -> Groq -> OpenRouter -> Mistral -> Cohere) — compartilhada entre o caminho de fonte única e o multi-fonte. */
async function triarComCascata(item: ItemBruto): Promise<ResumoGemini | null> {
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

  if (!resumo && estaDisponivel("openrouter")) {
    resumo = await triarComOpenRouterFallback(item);
  } else if (!resumo) {
    await log("info", "pipeline", "OpenRouter pulado (sem fôlego recente) — indo direto pro Mistral", { url: item.url });
  }

  // Mistral e Cohere (22/11/2026, a pedido do Valter — "ampliar a bancada
  // de IA"): dois elos a mais no fim da cascata, cada um com sua própria
  // cota gratuita independente — quanto mais longa a cascata, menor a
  // chance de um apagão total travar a produção de notícia.
  if (!resumo && estaDisponivel("mistral")) {
    resumo = await triarComMistralFallback(item);
  } else if (!resumo) {
    await log("info", "pipeline", "Mistral pulado (sem fôlego recente) — indo direto pra Cohere", { url: item.url });
  }

  if (!resumo && estaDisponivel("cohere")) {
    resumo = await triarComCohereFallback(item);
  }

  if (!resumo) return null; // sujeira de página, ou triagem falhou em todos os provedores

  if (resumo.assuntoJaCoberto) {
    await log("info", "pipeline", "Assunto já coberto nas últimas 24h — descartado", { url: item.url });
    return null;
  }
  if (resumo.conteudoDesatualizado) {
    await log("info", "pipeline", "Conteúdo descreve evento/prazo já encerrado como futuro/atual — descartado por estar desatualizado", {
      url: item.url,
    });
    return null;
  }

  return resumo;
}

/** Redação-Chefe com Fallback em cascata (Claude -> Gemini -> Groq -> OpenRouter -> Mistral -> Cohere) — fonte única. */
async function redigirComCascata(paramsRedacao: {
  topicos: string[];
  fonteNome: string;
  fonteUrl: string;
  editoriaSugerida: Editoria;
}): Promise<{ materia: MateriaRedigida; origemIA: OrigemIA } | null> {
  let materia: MateriaRedigida | null = null;
  let origemIA: OrigemIA = "claude";

  if (estaDisponivel("claude")) {
    try {
      materia = await redigirComClaude(paramsRedacao);
    } catch (err: any) {
      if (pareceErroDeCota(err)) await marcarIndisponivel("claude", String(err?.message ?? err));
      await log("warning", "pipeline", "Claude falhou/atingiu cota — acionando fallback Gemini", {
        fonte: paramsRedacao.fonteNome,
        erro: String(err?.message ?? err),
      });
    }
  } else {
    await log("info", "pipeline", "Claude pulado na redação (sem fôlego recente) — indo direto pro Gemini", { fonte: paramsRedacao.fonteNome });
  }

  if (!materia && estaDisponivel("gemini")) {
    origemIA = "gemini";
    materia = await redigirComGeminiFallback(paramsRedacao);
  } else if (!materia) {
    await log("info", "pipeline", "Gemini pulado na redação (sem fôlego recente) — indo direto pro Groq", { fonte: paramsRedacao.fonteNome });
  }

  if (!materia && estaDisponivel("groq")) {
    origemIA = "groq";
    materia = await redigirComGroqFallback(paramsRedacao);
  }

  if (!materia && estaDisponivel("openrouter")) {
    origemIA = "openrouter";
    materia = await redigirComOpenRouterFallback(paramsRedacao);
  }

  if (!materia && estaDisponivel("mistral")) {
    origemIA = "mistral";
    materia = await redigirComMistralFallback(paramsRedacao);
  }

  if (!materia) {
    origemIA = "cohere";
    materia = await redigirComCohereFallback(paramsRedacao);
  }

  if (!materia) return null;
  return { materia, origemIA };
}

/** Redação-Chefe com Fallback em cascata — Curadoria Multi-Fonte (mesma ordem, prompt diferente). */
async function redigirMultiFonteComCascata(paramsRedacao: {
  fontes: Array<{ nome: string; topicos: string[] }>;
  editoriaSugerida: Editoria;
}): Promise<{ materia: MateriaRedigida; origemIA: OrigemIA } | null> {
  let materia: MateriaRedigida | null = null;
  let origemIA: OrigemIA = "claude";
  const rotulo = paramsRedacao.fontes.map((f) => f.nome).join(" + ");

  if (estaDisponivel("claude")) {
    try {
      materia = await redigirMultiFonteComClaude(paramsRedacao);
    } catch (err: any) {
      if (pareceErroDeCota(err)) await marcarIndisponivel("claude", String(err?.message ?? err));
      await log("warning", "pipeline", "Claude falhou/atingiu cota na redação multi-fonte — acionando fallback Gemini", {
        fontes: rotulo,
        erro: String(err?.message ?? err),
      });
    }
  }

  if (!materia && estaDisponivel("gemini")) {
    origemIA = "gemini";
    materia = await redigirMultiFonteComGeminiFallback(paramsRedacao);
  }

  if (!materia && estaDisponivel("groq")) {
    origemIA = "groq";
    materia = await redigirMultiFonteComGroqFallback(paramsRedacao);
  }

  if (!materia && estaDisponivel("openrouter")) {
    origemIA = "openrouter";
    materia = await redigirMultiFonteComOpenRouterFallback(paramsRedacao);
  }

  if (!materia && estaDisponivel("mistral")) {
    origemIA = "mistral";
    materia = await redigirMultiFonteComMistralFallback(paramsRedacao);
  }

  if (!materia) {
    origemIA = "cohere";
    materia = await redigirMultiFonteComCohereFallback(paramsRedacao);
  }

  if (!materia) return null;
  return { materia, origemIA };
}

/**
 * Orquestra a esteira completa de FONTE ÚNICA: IA local (Ollama) -> Gemini
 * -> Claude -> Groq na triagem, depois Claude (redação-chefe) -> Fallback
 * automático (Gemini Flash, depois Groq/Llama, depois OpenRouter) em caso
 * de erro ou limite de cota.
 */
export async function processarItem(item: ItemBruto): Promise<ResultadoPipeline | null> {
  const resumo = await triarComCascata(item);
  if (!resumo) return null;

  const paramsRedacao = {
    topicos: resumo.topicos,
    fonteNome: item.fonteNome,
    fonteUrl: item.url,
    editoriaSugerida: resumo.editoriaSugerida,
  };

  const resultado = await redigirComCascata(paramsRedacao);
  if (!resultado) {
    await log("critico", "pipeline", "Todas as IAs da bancada falharam para este item — descartado", { url: item.url });
    return null;
  }

  await log("info", "pipeline", `Matéria redigida com sucesso via ${resultado.origemIA}`, { url: item.url, titulo: resultado.materia.titulo });

  return {
    materia: resultado.materia,
    origemIA: resultado.origemIA,
    palavraChaveImagem: resumo.palavraChaveImagem,
    fonteUrl: item.url,
    fonteNome: item.fonteNome,
    topicosApurados: resumo.topicos,
    fonteCreditoPublico: calcularCreditoPublico(resultado.materia.fontePrimaria, [
      { nome: item.fonteNome, creditarPublicamente: item.creditarPublicamente },
    ]),
  };
}

/**
 * Curadoria Multi-Fonte (proposta de Valter, 22/11/2026, parte 2): recebe um
 * grupo de 2+ itens que o Agrupador (agrupador.ts) identificou como o MESMO
 * fato contado por fontes diferentes no mesmo ciclo. Roda a MESMA triagem
 * de sempre em cada item do grupo (pra extrair os tópicos de cada fonte
 * isoladamente), e então:
 *   - se só 1 fonte sobreviver à triagem (as outras descartadas por sujeira/
 *     já coberto/desatualizado), cai pro caminho normal de fonte única —
 *     sem perder a apuração já feita.
 *   - se 2+ sobreviverem, cruza os tópicos de todas numa única matéria via
 *     promptRedacaoMultiFonte (extrai fatos -> cruza fontes -> acrescenta
 *     parágrafo de contexto exclusivo Radar BV).
 * Sempre devolve `fontesCruzadas` preenchido (mesmo com 1 item só), pra
 * queue.ts saber exatamente qual URL/hash fechar na Trava de Silêncio.
 */
export async function processarItemMultiFonte(
  itens: Array<ItemBruto & { hash: string }>
): Promise<ResultadoPipeline | null> {
  const apuracoes: Array<{ item: ItemBruto & { hash: string }; resumo: ResumoGemini }> = [];

  for (const item of itens) {
    const resumo = await triarComCascata(item);
    if (resumo) apuracoes.push({ item, resumo });
  }

  if (apuracoes.length === 0) return null;

  if (apuracoes.length === 1) {
    const { item, resumo } = apuracoes[0];
    const resultado = await redigirComCascata({
      topicos: resumo.topicos,
      fonteNome: item.fonteNome,
      fonteUrl: item.url,
      editoriaSugerida: resumo.editoriaSugerida,
    });
    if (!resultado) {
      await log("critico", "pipeline", "Todas as IAs da bancada falharam (grupo multi-fonte reduzido a 1 item) — descartado", { url: item.url });
      return null;
    }
    return {
      materia: resultado.materia,
      origemIA: resultado.origemIA,
      palavraChaveImagem: resumo.palavraChaveImagem,
      fonteUrl: item.url,
      fonteNome: item.fonteNome,
      topicosApurados: resumo.topicos,
      fonteCreditoPublico: calcularCreditoPublico(resultado.materia.fontePrimaria, [
        { nome: item.fonteNome, creditarPublicamente: item.creditarPublicamente },
      ]),
      fontesCruzadas: [{ fonteId: item.fonteId, url: item.url, nome: item.fonteNome, hash: item.hash }],
    };
  }

  const paramsRedacao = {
    fontes: apuracoes.map((a) => ({ nome: a.item.fonteNome, topicos: a.resumo.topicos })),
    editoriaSugerida: apuracoes[0].resumo.editoriaSugerida,
  };

  const resultado = await redigirMultiFonteComCascata(paramsRedacao);
  if (!resultado) {
    await log("critico", "pipeline", "Todas as IAs da bancada falharam na redação multi-fonte — descartado", {
      fontes: apuracoes.map((a) => a.item.fonteNome),
    });
    return null;
  }

  const principal = apuracoes[0];
  const nomes = apuracoes.map((a) => a.item.fonteNome);
  const fonteCreditoFormatado = juntarNomes(nomes) ?? nomes[0];

  await log("info", "pipeline", `Matéria multi-fonte redigida com sucesso via ${resultado.origemIA}`, { fontes: nomes, titulo: resultado.materia.titulo });

  return {
    materia: resultado.materia,
    origemIA: resultado.origemIA,
    palavraChaveImagem: principal.resumo.palavraChaveImagem,
    fonteUrl: principal.item.url,
    fonteNome: fonteCreditoFormatado,
    topicosApurados: apuracoes.flatMap((a) => a.resumo.topicos),
    fonteCreditoPublico: calcularCreditoPublico(
      resultado.materia.fontePrimaria,
      apuracoes.map((a) => ({ nome: a.item.fonteNome, creditarPublicamente: a.item.creditarPublicamente }))
    ),
    fontesCruzadas: apuracoes.map((a) => ({ fonteId: a.item.fonteId, url: a.item.url, nome: a.item.fonteNome, hash: a.item.hash })),
  };
}
