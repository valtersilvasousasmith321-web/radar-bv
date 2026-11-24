import { config } from "../config.js";
import { log } from "../logger.js";
import { promptRedacaoFallback, promptRedacaoMultiFonte, promptAgrupador, promptTriagemGemini } from "./prompts.js";
import { pareceErroDeCota, marcarIndisponivel } from "./quotaTracker.js";
import type { Editoria, ItemBruto, MateriaRedigida, ResumoGemini } from "../types.js";

// Modelo gratuito do catálogo da OpenRouter (sufixo ":free"). Escolhido por
// ser um dos mais estáveis/disponíveis da camada grátis no momento — se a
// OpenRouter aposentar este modelo no futuro, troca só essa constante.
const MODELO_FALLBACK = "meta-llama/llama-3.3-70b-instruct:free";

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

async function chamarOpenRouter(prompt: string): Promise<string> {
  const resposta = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${config.ia.openrouterApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": config.site.baseUrl,
      "X-Title": "Radar BV",
    },
    body: JSON.stringify({
      model: MODELO_FALLBACK,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    const erro: any = new Error(`OpenRouter respondeu ${resposta.status}: ${corpo.slice(0, 300)}`);
    erro.status = resposta.status;
    throw erro;
  }

  const dados = (await resposta.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return dados.choices?.[0]?.message?.content ?? "";
}

/**
 * Mais um elo gratuito na cascata de triagem (bancada de IA maior), usado
 * quando Gemini, Claude e Groq já falharam/estão sem fôlego nesse ciclo.
 */
export async function triarComOpenRouterFallback(item: ItemBruto): Promise<ResumoGemini | null> {
  if (!config.ia.openrouterApiKey) return null;

  try {
    const prompt = promptTriagemGemini({
      tituloOriginal: item.tituloOriginal,
      conteudoBruto: item.conteudoBruto,
      editoriaPadrao: item.editoriaPadrao,
    });

    const texto = await chamarOpenRouter(prompt);
    if (!texto.trim()) return null;

    const json = extrairJson<ResumoGemini>(texto);
    if (!json.topicos || json.topicos.length === 0) return null;
    return json;
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("openrouter", String(err?.message ?? err));
    await log("error", "openrouter", "Falha na triagem (fallback OpenRouter)", { url: item.url, erro: String(err?.message ?? err) });
    return null;
  }
}

/**
 * Mais um elo gratuito na cascata de redação, usado quando Claude, Gemini e
 * Groq já falharam/estão sem fôlego nesse ciclo.
 */
export async function redigirComOpenRouterFallback(params: {
  topicos: string[];
  fonteNome: string;
  fonteUrl: string;
  editoriaSugerida: Editoria;
}): Promise<MateriaRedigida | null> {
  return chamarOpenRouterParaRedacao(promptRedacaoFallback(params));
}

/**
 * Curadoria Multi-Fonte (item novo, 22/11/2026) — último elo da cascata de
 * redação, cruzando os tópicos de 2+ fontes já identificadas como o mesmo
 * fato pelo Agrupador.
 */
export async function redigirMultiFonteComOpenRouterFallback(params: {
  fontes: Array<{ nome: string; topicos: string[] }>;
  editoriaSugerida: Editoria;
}): Promise<MateriaRedigida | null> {
  return chamarOpenRouterParaRedacao(promptRedacaoMultiFonte(params));
}

async function chamarOpenRouterParaRedacao(prompt: string): Promise<MateriaRedigida | null> {
  if (!config.ia.openrouterApiKey) return null;

  try {
    const texto = await chamarOpenRouter(prompt);
    if (!texto.trim()) return null;

    const json = extrairJson<any>(texto);
    if (json.insuficiente) return null;
    return json as MateriaRedigida;
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("openrouter", String(err?.message ?? err));
    await log("error", "openrouter", "Falha no fallback de redação (OpenRouter)", { erro: String(err?.message ?? err) });
    return null;
  }
}

/**
 * Agrupador (item novo, 22/11/2026) — último elo da cascata de agrupamento.
 */
export async function agruparComOpenRouterFallback(
  itens: Array<{ indice: number; fonteNome: string; titulo: string; trecho: string }>
): Promise<{ grupos: number[][] } | null> {
  if (!config.ia.openrouterApiKey) return null;

  try {
    const prompt = promptAgrupador(itens);
    const texto = await chamarOpenRouter(prompt);
    if (!texto.trim()) return null;
    const json = extrairJson<{ grupos: number[][] }>(texto);
    if (!json.grupos) return null;
    return json;
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("openrouter", String(err?.message ?? err));
    await log("error", "openrouter", "Falha no agrupamento de pauta (OpenRouter)", { erro: String(err?.message ?? err) });
    return null;
  }
}

/**
 * Elo genérico (24/11/2026 — auditoria pedida pelo Valter): até aqui só
 * triagem/redação/agrupamento tinham acesso aos 7 provedores da bancada.
 * As camadas de segurança (Revisor Camada 2, Verificador de Fatos,
 * Jurídico/Compliance, checagem de duplicação do Editor-chefe) só tentavam
 * Groq -> Gemini -> Claude — se os 2 gratuitos mais usados caíssem junto
 * (já aconteceu hoje com Claude+Gemini na busca), essas checagens caíam
 * direto no "aprovado por padrão" sem nunca tentar OpenRouter/Mistral/
 * Cohere, que ficavam disponíveis e nunca eram usados. Esta função deixa
 * qualquer módulo de segurança acionar a OpenRouter com um prompt livre
 * (sem exigir o formato de triagem/redação), do mesmo jeito que já faz a
 * cascata principal.
 */
export async function perguntarOpenRouter(prompt: string, origemLog: string): Promise<string | null> {
  if (!config.ia.openrouterApiKey) return null;
  try {
    const texto = await chamarOpenRouter(prompt);
    return texto.trim() || null;
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("openrouter", String(err?.message ?? err));
    await log("warning", origemLog, "Falha ao acionar OpenRouter", { erro: String(err?.message ?? err) });
    return null;
  }
}
