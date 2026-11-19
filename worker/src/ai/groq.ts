import Groq from "groq-sdk";
import { config } from "../config.js";
import { log } from "../logger.js";
import { promptRedacaoFallback } from "./prompts.js";
import type { Editoria, MateriaRedigida } from "../types.js";

const groq = config.ia.groqApiKey ? new Groq({ apiKey: config.ia.groqApiKey }) : null;

function extrairJson<T>(texto: string): T {
  const limpo = texto.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(limpo) as T;
}

/**
 * Último elo do Fallback de IA (Regra de Ouro — item 5): Llama gratuito via
 * Groq. Só é chamado se Claude E Gemini falharem/estourarem cota — garante
 * que o jornal nunca para mesmo num cenário de falha dupla.
 */
export async function redigirComGroqFallback(params: {
  topicos: string[];
  fonteNome: string;
  fonteUrl: string;
  editoriaSugerida: Editoria;
}): Promise<MateriaRedigida | null> {
  if (!groq) {
    await log("warning", "groq", "GROQ_API_KEY não configurada — fallback final indisponível");
    return null;
  }

  try {
    const prompt = promptRedacaoFallback(params);
    const resposta = await groq.chat.completions.create({
      model: "llama-3.1-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 1200,
    });

    const texto = resposta.choices[0]?.message?.content ?? "";
    const json = extrairJson<any>(texto);
    if (json.insuficiente) return null;
    return json as MateriaRedigida;
  } catch (err: any) {
    await log("critico", "groq", "Falha no último fallback (Groq/Llama) — matéria não pode ser redigida", {
      erro: String(err?.message ?? err),
    });
    return null;
  }
}
