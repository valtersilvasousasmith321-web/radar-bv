import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { log } from "../logger.js";
import { promptRedacaoChefe } from "./prompts.js";
import type { Editoria, MateriaRedigida } from "../types.js";

const anthropic = new Anthropic({ apiKey: config.ia.anthropicApiKey });

function extrairJson<T>(texto: string): T {
  const limpo = texto.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(limpo) as T;
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
