import { config } from "../config.js";
import { log } from "../logger.js";
import { promptRedacaoFallback, promptRedacaoMultiFonte, promptAgrupador, promptTriagemGemini } from "./prompts.js";
import { pareceErroDeCota, marcarIndisponivel } from "./quotaTracker.js";
import type { Editoria, ItemBruto, MateriaRedigida, ResumoGemini } from "../types.js";

/**
 * Mais um elo gratuito na bancada de IA (pendência antiga do plano:
 * "ampliar a bancada de IAs de nuvem grátis" — item Infraestrutura de IA).
 * "open-mistral-nemo" é um modelo aberto de 12B oferecido de graça na
 * camada free da La Plateforme (api.mistral.ai) — sem custo, mas com rate
 * limit baixo (free tier: 1 req/s), então entra só no FIM da cascata,
 * depois da OpenRouter, igual o Groq e a própria OpenRouter já entram
 * depois do Gemini/Claude.
 */
const MODELO_FALLBACK = "open-mistral-nemo";

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

async function chamarMistral(prompt: string): Promise<string> {
  const resposta = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${config.ia.mistralApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODELO_FALLBACK,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    const erro: any = new Error(`Mistral respondeu ${resposta.status}: ${corpo.slice(0, 300)}`);
    erro.status = resposta.status;
    throw erro;
  }

  const dados = (await resposta.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return dados.choices?.[0]?.message?.content ?? "";
}

/** Mais um elo gratuito na cascata de triagem, usado quando Gemini/Claude/Groq/OpenRouter já falharam/estão sem fôlego. */
export async function triarComMistralFallback(item: ItemBruto): Promise<ResumoGemini | null> {
  if (!config.ia.mistralApiKey) return null;

  try {
    const prompt = promptTriagemGemini({
      tituloOriginal: item.tituloOriginal,
      conteudoBruto: item.conteudoBruto,
      editoriaPadrao: item.editoriaPadrao,
    });

    const texto = await chamarMistral(prompt);
    if (!texto.trim()) return null;

    const json = extrairJson<ResumoGemini>(texto);
    if (!json.topicos || json.topicos.length === 0) return null;
    return json;
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("mistral", String(err?.message ?? err));
    await log("error", "mistral", "Falha na triagem (fallback Mistral)", { url: item.url, erro: String(err?.message ?? err) });
    return null;
  }
}

/** Mais um elo gratuito na cascata de redação, usado quando Claude/Gemini/Groq/OpenRouter já falharam/estão sem fôlego. */
export async function redigirComMistralFallback(params: {
  topicos: string[];
  fonteNome: string;
  fonteUrl: string;
  editoriaSugerida: Editoria;
}): Promise<MateriaRedigida | null> {
  return chamarMistralParaRedacao(promptRedacaoFallback(params));
}

/** Curadoria Multi-Fonte — mesmo papel acima, cruzando os tópicos de 2+ fontes já identificadas como o mesmo fato pelo Agrupador. */
export async function redigirMultiFonteComMistralFallback(params: {
  fontes: Array<{ nome: string; topicos: string[] }>;
  editoriaSugerida: Editoria;
}): Promise<MateriaRedigida | null> {
  return chamarMistralParaRedacao(promptRedacaoMultiFonte(params));
}

async function chamarMistralParaRedacao(prompt: string): Promise<MateriaRedigida | null> {
  if (!config.ia.mistralApiKey) return null;

  try {
    const texto = await chamarMistral(prompt);
    if (!texto.trim()) return null;

    const json = extrairJson<any>(texto);
    if (json.insuficiente) return null;
    return json as MateriaRedigida;
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("mistral", String(err?.message ?? err));
    await log("error", "mistral", "Falha no fallback de redação (Mistral)", { erro: String(err?.message ?? err) });
    return null;
  }
}

/** Agrupador — mais um elo gratuito na cascata de agrupamento de pauta. */
export async function agruparComMistralFallback(
  itens: Array<{ indice: number; fonteNome: string; titulo: string; trecho: string }>
): Promise<{ grupos: number[][] } | null> {
  if (!config.ia.mistralApiKey) return null;

  try {
    const prompt = promptAgrupador(itens);
    const texto = await chamarMistral(prompt);
    if (!texto.trim()) return null;
    const json = extrairJson<{ grupos: number[][] }>(texto);
    if (!json.grupos) return null;
    return json;
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("mistral", String(err?.message ?? err));
    await log("error", "mistral", "Falha no agrupamento de pauta (Mistral)", { erro: String(err?.message ?? err) });
    return null;
  }
}

/**
 * Elo genérico (24/11/2026 — auditoria pedida pelo Valter), mesma lógica de
 * perguntarOpenRouter() em openrouter.ts: dá às camadas de segurança acesso
 * à Mistral com um prompt livre, não só triagem/redação/agrupamento.
 */
export async function perguntarMistral(prompt: string, origemLog: string): Promise<string | null> {
  if (!config.ia.mistralApiKey) return null;
  try {
    const texto = await chamarMistral(prompt);
    return texto.trim() || null;
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("mistral", String(err?.message ?? err));
    await log("warning", origemLog, "Falha ao acionar Mistral", { erro: String(err?.message ?? err) });
    return null;
  }
}
