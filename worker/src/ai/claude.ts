import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { log } from "../logger.js";
import { promptRedacaoChefe, promptTriagemGemini } from "./prompts.js";
import type { Editoria, ItemBruto, MateriaRedigida, ResumoGemini } from "../types.js";

const anthropic = new Anthropic({ apiKey: config.ia.anthropicApiKey });

function extrairJson<T>(texto: string): T {
  const limpo = texto.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(limpo) as T;
}

/**
 * Fallback de TRIAGEM via Claude, usado quando o Gemini falha ou estoura a
 * cota diária do free tier (erro 429) antes mesmo de chegar à redação —
 * sem isso, um dia de cota do Gemini esgotada travava o jornal inteiro,
 * já que nenhum item passava da triagem pra cascata de redação (Regra de
 * Ouro — item 5, Fallback de IA, agora cobrindo também a etapa 2).
 */
export async function triarComClaude(item: ItemBruto): Promise<ResumoGemini | null> {
  try {
    const prompt = promptTriagemGemini({
      tituloOriginal: item.tituloOriginal,
      conteudoBruto: item.conteudoBruto,
      editoriaPadrao: item.editoriaPadrao,
    });

    const resposta = await anthropic.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });

    const bloco = resposta.content[0];
    const texto = bloco.type === "text" ? bloco.text : "";
    const json = extrairJson<ResumoGemini>(texto);

    if (!json.topicos || json.topicos.length === 0) {
      await log("info", "claude", "Triagem (fallback) sem tópicos aproveitáveis", { url: item.url });
      return null;
    }
    return json;
  } catch (err: any) {
    await log("error", "claude", "Falha na triagem de fallback do Claude", { url: item.url, erro: String(err?.message ?? err) });
    return null;
  }
}

/**
 * 3. Redação-Chefe e Revisão (Claude API / Fluxo Enxuto).
 * Recebe APENAS os tópicos já mastigados pelo Gemini — nunca o HTML bruto —
 * para gastar o mínimo possível de tokens. Usa um modelo econômico (Haiku)
 * por padrão; pode ser trocado por Sonnet caso se queira mais qualidade
 * de redação em troca de custo maior.
 *
 * Lança erro em caso de falha/limite de cota — o chamador (pipeline.ts)
 * é responsável por capturar e acionar o fallback.
 */
export async function redigirComClaude(params: {
  topicos: string[];
  fonteNome: string;
  fonteUrl: string;
  editoriaSugerida: Editoria;
}): Promise<MateriaRedigida | null> {
  const prompt = promptRedacaoChefe(params);

  const resposta = await anthropic.messages.create({
    model: "claude-haiku-5-5",
    max_tokens: 1200,
    messages: [{ role: "user", content: prompt }],
  });

  const bloco = resposta.content[0];
  const texto = bloco.type === "text" ? bloco.text : "";
  const json = extrairJson<any>(texto);

  if (json.insuficiente) {
    await log("info", "claude", "Tópicos insuficientes para redigir matéria", { fonte: params.fonteNome });
    return null;
  }
  return json as MateriaRedigida;
}
