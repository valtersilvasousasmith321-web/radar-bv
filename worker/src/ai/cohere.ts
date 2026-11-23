import { config } from "../config.js";
import { log } from "../logger.js";
import { promptRedacaoFallback, promptRedacaoMultiFonte, promptAgrupador, promptTriagemGemini } from "./prompts.js";
import { pareceErroDeCota, marcarIndisponivel } from "./quotaTracker.js";
import type { Editoria, ItemBruto, MateriaRedigida, ResumoGemini } from "../types.js";

/**
 * Último elo da bancada de IA (pendência antiga do plano: "ampliar a
 * bancada de IAs de nuvem grátis"). A chave trial da Cohere é gratuita e
 * nunca expira, mas é bem limitada (20 req/min, 1.000 chamadas/mês no
 * total) — por isso entra só como o ÚLTIMO recurso da cascata, depois de
 * Gemini, Claude, Groq, OpenRouter e Mistral já terem sido tentados.
 */
const MODELO_FALLBACK = "command-a-03-2025";

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

async function chamarCohere(prompt: string): Promise<string> {
  const resposta = await fetch("https://api.cohere.com/v2/chat", {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${config.ia.cohereApiKey}`,
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
    const erro: any = new Error(`Cohere respondeu ${resposta.status}: ${corpo.slice(0, 300)}`);
    erro.status = resposta.status;
    throw erro;
  }

  const dados = (await resposta.json()) as {
    message?: { content?: Array<{ type?: string; text?: string }> };
  };
  // A API v2 da Cohere devolve o texto dentro de message.content[] (array de
  // blocos tipados) — pega o primeiro bloco de texto encontrado.
  const bloco = dados.message?.content?.find((c) => c?.text);
  return bloco?.text ?? "";
}

/** Último elo da cascata de triagem — só tentado se nenhum outro provedor resolveu. */
export async function triarComCohereFallback(item: ItemBruto): Promise<ResumoGemini | null> {
  if (!config.ia.cohereApiKey) return null;

  try {
    const prompt = promptTriagemGemini({
      tituloOriginal: item.tituloOriginal,
      conteudoBruto: item.conteudoBruto,
      editoriaPadrao: item.editoriaPadrao,
    });

    const texto = await chamarCohere(prompt);
    if (!texto.trim()) return null;

    const json = extrairJson<ResumoGemini>(texto);
    if (!json.topicos || json.topicos.length === 0) return null;
    return json;
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("cohere", String(err?.message ?? err));
    await log("error", "cohere", "Falha na triagem (último fallback Cohere)", { url: item.url, erro: String(err?.message ?? err) });
    return null;
  }
}

/** Último elo da cascata de redação — só tentado se nenhum outro provedor resolveu. */
export async function redigirComCohereFallback(params: {
  topicos: string[];
  fonteNome: string;
  fonteUrl: string;
  editoriaSugerida: Editoria;
}): Promise<MateriaRedigida | null> {
  return chamarCohereParaRedacao(promptRedacaoFallback(params));
}

/** Curadoria Multi-Fonte — mesmo papel acima, cruzando os tópicos de 2+ fontes já identificadas como o mesmo fato pelo Agrupador. */
export async function redigirMultiFonteComCohereFallback(params: {
  fontes: Array<{ nome: string; topicos: string[] }>;
  editoriaSugerida: Editoria;
}): Promise<MateriaRedigida | null> {
  return chamarCohereParaRedacao(promptRedacaoMultiFonte(params));
}

async function chamarCohereParaRedacao(prompt: string): Promise<MateriaRedigida | null> {
  if (!config.ia.cohereApiKey) return null;

  try {
    const texto = await chamarCohere(prompt);
    if (!texto.trim()) return null;

    const json = extrairJson<any>(texto);
    if (json.insuficiente) return null;
    return json as MateriaRedigida;
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("cohere", String(err?.message ?? err));
    await log("error", "cohere", "Falha no último fallback de redação (Cohere)", { erro: String(err?.message ?? err) });
    return null;
  }
}

/** Agrupador — último elo da cascata de agrupamento de pauta. */
export async function agruparComCohereFallback(
  itens: Array<{ indice: number; fonteNome: string; titulo: string; trecho: string }>
): Promise<{ grupos: number[][] } | null> {
  if (!config.ia.cohereApiKey) return null;

  try {
    const prompt = promptAgrupador(itens);
    const texto = await chamarCohere(prompt);
    if (!texto.trim()) return null;
    const json = extrairJson<{ grupos: number[][] }>(texto);
    if (!json.grupos) return null;
    return json;
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("cohere", String(err?.message ?? err));
    await log("error", "cohere", "Falha no agrupamento de pauta (Cohere)", { erro: String(err?.message ?? err) });
    return null;
  }
}
