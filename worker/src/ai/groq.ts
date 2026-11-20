import Groq from "groq-sdk";
import { config } from "../config.js";
import { log } from "../logger.js";
import { promptRedacaoFallback, promptTriagemGemini } from "./prompts.js";
import type { Editoria, ItemBruto, MateriaRedigida, ResumoGemini } from "../types.js";

const groq = config.ia.groqApiKey ? new Groq({ apiKey: config.ia.groqApiKey }) : null;

// "llama-3.1-70b-versatile" e "llama-3.3-70b-versatile" foram aposentados pela
// Groq em 16/08/2026. Seguimos a recomendação oficial da própria Groq
// (console.groq.com/docs/deprecations) e usamos "openai/gpt-oss-120b".
const MODELO_FALLBACK = "openai/gpt-oss-120b";

function extrairJson<T>(texto: string): T {
  const limpo = texto.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(limpo) as T;
  } catch {
    const match = limpo.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Resposta vazia ou sem JSON reconhecível: "${limpo.slice(0, 200)}"`);
    return JSON.parse(match[0]) as T;
  }
}

/**
 * Último elo do Fallback de TRIAGEM (item 2): só é chamado se Gemini E
 * Claude falharem/estourarem cota nessa etapa — mesma lógica do fallback
 * final de redação, agora cobrindo a triagem também, pra nenhum item ser
 * descartado por falha dupla antes mesmo de chegar à redação.
 */
export async function triarComGroqFallback(item: ItemBruto): Promise<ResumoGemini | null> {
  if (!groq) {
    await log("warning", "groq", "GROQ_API_KEY não configurada — fallback final de triagem indisponível");
    return null;
  }

  try {
    const prompt = promptTriagemGemini({
      tituloOriginal: item.tituloOriginal,
      conteudoBruto: item.conteudoBruto,
      editoriaPadrao: item.editoriaPadrao,
    });

    const resposta = await groq.chat.completions.create({
      model: MODELO_FALLBACK,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 500,
    });

    const texto = resposta.choices[0]?.message?.content ?? "";
    const json = extrairJson<ResumoGemini>(texto);

    if (!json.topicos || json.topicos.length === 0) return null;
    return json;
  } catch (err: any) {
    await log("critico", "groq", "Falha no último fallback de triagem (Groq/Llama)", { url: item.url, erro: String(err?.message ?? err) });
    return null;
  }
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
      model: MODELO_FALLBACK,
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
