import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config.js";
import { log } from "../logger.js";
import { promptTriagemGemini, promptRedacaoFallback } from "./prompts.js";
import type { Editoria, ItemBruto, MateriaRedigida, ResumoGemini } from "../types.js";

const genAI = new GoogleGenerativeAI(config.ia.geminiApiKey);
const modeloFlash = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

function extrairJson<T>(texto: string): T {
  // Remove possíveis blocos de markdown (```json ... ```) que o modelo às vezes devolve
  const limpo = texto.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(limpo) as T;
}

/**
 * 2. Triagem e Resumo Pesado (Google Gemini API - Free Tier).
 * Limpa o HTML/texto bruto, verifica duplicidade semântica (best-effort,
 * via instrução no prompt) e extrai 4-5 tópicos essenciais.
 */
export async function triarComGemini(item: ItemBruto): Promise<ResumoGemini | null> {
  try {
    const prompt = promptTriagemGemini({
      tituloOriginal: item.tituloOriginal,
      conteudoBruto: item.conteudoBruto,
      editoriaPadrao: item.editoriaPadrao,
    });

    const resultado = await modeloFlash.generateContent(prompt);
    const texto = resultado.response.text();
    const json = extrairJson<ResumoGemini>(texto);

    if (!json.topicos || json.topicos.length === 0) {
      await log("info", "gemini", "Triagem sem tópicos aproveitáveis (provável sujeira de página)", { url: item.url });
      return null;
    }
    return json;
  } catch (err: any) {
    await log("error", "gemini", "Falha na triagem do Gemini", { url: item.url, erro: String(err?.message ?? err) });
    return null;
  }
}

/**
 * Fallback de redação final usando Gemini Flash, quando o Claude falha
 * ou atinge limite de cota (Regra de Ouro — item 5, Fallback de IA).
 * Usa o mesmo contrato de JSON estrito do Redator-Chefe.
 */
export async function redigirComGeminiFallback(params: {
  topicos: string[];
  fonteNome: string;
  fonteUrl: string;
  editoriaSugerida: Editoria;
}): Promise<MateriaRedigida | null> {
  try {
    const prompt = promptRedacaoFallback(params);
    const resultado = await modeloFlash.generateContent(prompt);
    const texto = resultado.response.text();
    const json = extrairJson<any>(texto);

    if (json.insuficiente) return null;
    return json as MateriaRedigida;
  } catch (err: any) {
    await log("error", "gemini", "Falha no fallback de redação do Gemini", { erro: String(err?.message ?? err) });
    return null;
  }
}
