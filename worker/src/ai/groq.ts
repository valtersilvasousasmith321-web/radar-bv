import Groq from "groq-sdk";
import { config } from "../config.js";
import { log } from "../logger.js";
import { promptRedacaoFallback, promptRedacaoMultiFonte, promptAgrupador, promptTriagemGemini } from "./prompts.js";
import { pareceErroDeCota, marcarIndisponivel } from "./quotaTracker.js";
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
      // Ampliado de 1200 pra 1800 (22/11/2026): triagem agora extrai de 12 a
      // 18 tópicos (antes 8-12).
      max_tokens: 1800,
      // "openai/gpt-oss-120b" é um modelo de raciocínio: ele gasta tokens
      // "pensando" (reasoning_content) antes do texto final, e em casos
      // extremos isso consumia o orçamento todo e devolvia content vazio.
      // reasoning_effort "low" reduz esse raciocínio ao mínimo necessário.
      reasoning_effort: "low",
    } as any);

    const texto = resposta.choices[0]?.message?.content ?? "";
    if (!texto.trim()) {
      await log("warning", "groq", "Triagem (fallback Groq) devolveu content vazio mesmo com reasoning_effort low", { url: item.url });
      return null;
    }
    const json = extrairJson<ResumoGemini>(texto);

    if (!json.topicos || json.topicos.length === 0) return null;
    return json;
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("groq", String(err?.message ?? err));
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
  return chamarGroqParaRedacao(promptRedacaoFallback(params), params.fonteNome);
}

/**
 * Curadoria Multi-Fonte (item novo, 22/11/2026) — último elo da cascata de
 * redação, mesmo papel do redigirComGroqFallback acima, cruzando os
 * tópicos de 2+ fontes já identificadas como o mesmo fato pelo Agrupador.
 */
export async function redigirMultiFonteComGroqFallback(params: {
  fontes: Array<{ nome: string; topicos: string[] }>;
  editoriaSugerida: Editoria;
}): Promise<MateriaRedigida | null> {
  return chamarGroqParaRedacao(promptRedacaoMultiFonte(params), params.fontes.map((f) => f.nome).join(" + "));
}

async function chamarGroqParaRedacao(prompt: string, rotuloLog: string): Promise<MateriaRedigida | null> {
  if (!groq) {
    await log("warning", "groq", "GROQ_API_KEY não configurada — fallback final indisponível");
    return null;
  }

  try {
    const resposta = await groq.chat.completions.create({
      model: MODELO_FALLBACK,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      // Ampliado de 2000 pra 3000 (22/11/2026): matérias agora miram 7-11
      // parágrafos em vez de 5-8.
      max_tokens: 3000,
      // Mesmo motivo da triagem: reduz o raciocínio interno do modelo pra
      // não disputar espaço com o texto final da matéria.
      reasoning_effort: "low",
    } as any);

    const texto = resposta.choices[0]?.message?.content ?? "";
    if (!texto.trim()) {
      await log("critico", "groq", "Último fallback (Groq) devolveu content vazio mesmo com reasoning_effort low", { fonte: rotuloLog });
      return null;
    }
    const json = extrairJson<any>(texto);
    if (json.insuficiente) return null;
    return json as MateriaRedigida;
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("groq", String(err?.message ?? err));
    await log("critico", "groq", "Falha no último fallback (Groq/Llama) — matéria não pode ser redigida", {
      erro: String(err?.message ?? err),
    });
    return null;
  }
}

/**
 * Agrupador (item novo, 22/11/2026) — último elo da cascata de agrupamento,
 * usado só se Gemini e Claude já falharam/estiverem sem fôlego nesse ciclo.
 */
export async function agruparComGroqFallback(
  itens: Array<{ indice: number; fonteNome: string; titulo: string; trecho: string }>
): Promise<{ grupos: number[][] } | null> {
  if (!groq) return null;

  try {
    const prompt = promptAgrupador(itens);
    const resposta = await groq.chat.completions.create({
      model: MODELO_FALLBACK,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 1200,
      reasoning_effort: "low",
    } as any);

    const texto = resposta.choices[0]?.message?.content ?? "";
    if (!texto.trim()) return null;
    const json = extrairJson<{ grupos: number[][] }>(texto);
    if (!json.grupos) return null;
    return json;
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("groq", String(err?.message ?? err));
    await log("error", "groq", "Falha no agrupamento de pauta (Groq)", { erro: String(err?.message ?? err) });
    return null;
  }
}
