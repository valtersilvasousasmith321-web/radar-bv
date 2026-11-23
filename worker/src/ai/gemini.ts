import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config.js";
import { log } from "../logger.js";
import { promptTriagemGemini, promptRedacaoFallback, promptRedacaoMultiFonte, promptAgrupador } from "./prompts.js";
import { pareceErroDeCota, marcarIndisponivel } from "./quotaTracker.js";
import type { Editoria, ItemBruto, MateriaRedigida, ResumoGemini } from "../types.js";

const genAI = new GoogleGenerativeAI(config.ia.geminiApiKey);
// "gemini-1.5-flash" foi definitivamente aposentado pela Google em 2026 (erro 404).
// Usamos o alias oficial "gemini-flash-latest", que a própria Google atualiza
// automaticamente para a versão estável mais recente da família Flash —
// evita que o sistema quebre de novo a cada futura aposentadoria de modelo.
const modeloFlash = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

function extrairJson<T>(texto: string): T {
  // Remove possíveis blocos de markdown (```json ... ```) que o modelo às vezes devolve
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
    if (pareceErroDeCota(err)) await marcarIndisponivel("gemini", String(err?.message ?? err));
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
  return chamarGeminiParaRedacao(promptRedacaoFallback(params));
}

/**
 * Curadoria Multi-Fonte (item novo, 22/11/2026) — fallback Gemini, mesmo
 * papel do redigirComGeminiFallback acima, só que cruzando os tópicos de
 * 2+ fontes já identificadas como o mesmo fato pelo Agrupador.
 */
export async function redigirMultiFonteComGeminiFallback(params: {
  fontes: Array<{ nome: string; topicos: string[] }>;
  editoriaSugerida: Editoria;
}): Promise<MateriaRedigida | null> {
  return chamarGeminiParaRedacao(promptRedacaoMultiFonte(params));
}

async function chamarGeminiParaRedacao(prompt: string): Promise<MateriaRedigida | null> {
  try {
    const resultado = await modeloFlash.generateContent(prompt);
    const texto = resultado.response.text();
    const json = extrairJson<any>(texto);

    if (json.insuficiente) return null;
    return json as MateriaRedigida;
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("gemini", String(err?.message ?? err));
    await log("error", "gemini", "Falha no fallback de redação do Gemini", { erro: String(err?.message ?? err) });
    return null;
  }
}

/**
 * Agrupador (item novo, 22/11/2026): roda 1x por ciclo (não por item), antes
 * da triagem — identifica quais itens inéditos coletados no mesmo pulso são
 * o MESMO fato contado por fontes diferentes. Ver promptAgrupador.
 */
export async function agruparComGemini(
  itens: Array<{ indice: number; fonteNome: string; titulo: string; trecho: string }>
): Promise<{ grupos: number[][] } | null> {
  try {
    const prompt = promptAgrupador(itens);
    const resultado = await modeloFlash.generateContent(prompt);
    const texto = resultado.response.text();
    const json = extrairJson<{ grupos: number[][] }>(texto);
    if (!json.grupos) return null;
    return json;
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("gemini", String(err?.message ?? err));
    await log("error", "gemini", "Falha no agrupamento de pauta (Gemini)", { erro: String(err?.message ?? err) });
    return null;
  }
}
