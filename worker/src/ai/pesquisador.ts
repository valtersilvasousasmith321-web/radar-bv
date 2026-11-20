import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config.js";
import { log } from "../logger.js";

const anthropic = new Anthropic({ apiKey: config.ia.anthropicApiKey });
const genAI = new GoogleGenerativeAI(config.ia.geminiApiKey);

export interface ResultadoBusca {
  url: string;
  tituloCandidato: string;
  fonteSugerida: string;
}

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

function montarPromptBusca(tema: string, maxResultados: number): string {
  return `Você é um pesquisador de notícias. Use a ferramenta de busca na web para encontrar notícias REAIS, ATUAIS e RECENTES (dos últimos dias) sobre o seguinte tema/assunto:

"${tema}"

Regras importantes:
1. Faça quantas buscas forem necessárias para cobrir bem o tema.
2. Para cada notícia encontrada, você PRECISA da URL da matéria específica (a página de UM artigo individual) — nunca a URL de uma página inicial, categoria, seção ou busca (ex: nunca "site.com/categoria/noticias" ou "site.com/", só "site.com/noticia-especifica-aqui-123").
3. Se só encontrar o link de uma página de categoria/início pra algum resultado, DESCARTE esse resultado — não o inclua na resposta.
4. Ignore resultados da Wikipédia, redes sociais, e páginas que não são notícias jornalísticas.
5. No máximo ${maxResultados} notícias, sem duplicar o mesmo assunto duas vezes.
6. Depois de pesquisar e filtrar, responda SOMENTE com um JSON estrito, sem nenhum texto antes ou depois, no formato:
{"noticias": [{"titulo": "título da notícia", "url": "https://...url-especifica-do-artigo", "fonte": "nome do site/veículo"}]}

Se não encontrar nenhuma notícia que atenda aos critérios, responda {"noticias": []}.`;
}

/**
 * Pesquisador de notícias via Claude com a ferramenta nativa de busca na web
 * (a mesma estrutura de busca que o chat usa por trás dos panos) — em vez de
 * depender de uma única página fixa como fonte, a IA pesquisa o tema na
 * internet de verdade e devolve links de notícias individuais reais e
 * atuais, que entram no mesmo funil de triagem/redação já existente.
 */
async function pesquisarComClaude(tema: string, maxResultados: number): Promise<ResultadoBusca[] | null> {
  try {
    const resposta = await anthropic.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 4096,
      output_config: { effort: "low" },
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      messages: [{ role: "user", content: montarPromptBusca(tema, maxResultados) }],
    } as any);

    const bloco = resposta.content.find((b: any) => b.type === "text");
    const texto = bloco && (bloco as any).type === "text" ? (bloco as any).text : "";
    if (!texto.trim()) {
      await log("warning", "pesquisador", "Busca via Claude devolveu texto final vazio", { tema });
      return null;
    }

    const json = extrairJson<{ noticias: Array<{ titulo: string; url: string; fonte: string }> }>(texto);
    const noticias = (json.noticias ?? [])
      .filter((n) => n.url && n.titulo)
      .map((n) => ({ url: n.url, tituloCandidato: n.titulo, fonteSugerida: n.fonte ?? "" }));

    return noticias;
  } catch (err: any) {
    await log("error", "pesquisador", "Falha na busca via Claude (web_search)", { tema, erro: String(err?.message ?? err) });
    return null;
  }
}

/**
 * Segunda camada da cascata: Gemini com grounding/busca do Google.
 * Melhor esforço — a API de busca do Gemini tem passado por mudanças de
 * formato entre versões de modelo, então se o Google rejeitar ou não achar
 * nada aqui, apenas registramos e seguimos (nunca travamos o ciclo por isso).
 */
async function pesquisarComGemini(tema: string, maxResultados: number): Promise<ResultadoBusca[] | null> {
  try {
    const modelo = genAI.getGenerativeModel({
      model: "gemini-flash-latest",
      tools: [{ googleSearchRetrieval: {} } as any],
    });

    const resultado = await modelo.generateContent(montarPromptBusca(tema, maxResultados));
    const texto = resultado.response.text();
    if (!texto.trim()) return null;

    const json = extrairJson<{ noticias: Array<{ titulo: string; url: string; fonte: string }> }>(texto);
    const noticias = (json.noticias ?? [])
      .filter((n) => n.url && n.titulo)
      .map((n) => ({ url: n.url, tituloCandidato: n.titulo, fonteSugerida: n.fonte ?? "" }));

    return noticias;
  } catch (err: any) {
    await log("warning", "pesquisador", "Busca via Gemini (grounding) indisponível ou falhou", {
      tema,
      erro: String(err?.message ?? err),
    });
    return null;
  }
}

/**
 * Ponto de entrada do pesquisador: recebe um TEMA (não uma URL fixa) e
 * devolve notícias reais e atuais sobre esse tema, encontradas na web —
 * igual ao chat faz quando alguém pede uma notícia. Cascata própria,
 * seguindo a mesma Regra de Ouro das outras etapas (nunca depender de um
 * único provedor): Claude (web_search nativo) -> Gemini (grounding) -> []
 * (nenhum resultado nesse ciclo, sem travar as demais fontes).
 */
export async function pesquisarNoticias(tema: string, maxResultados = 5): Promise<ResultadoBusca[]> {
  let resultados = await pesquisarComClaude(tema, maxResultados);

  if (!resultados || resultados.length === 0) {
    await log("warning", "pesquisador", "Claude sem resultados úteis — acionando Gemini (grounding) como fallback", { tema });
    resultados = await pesquisarComGemini(tema, maxResultados);
  }

  if (!resultados || resultados.length === 0) {
    await log("warning", "pesquisador", "Nenhum resultado de busca encontrado nos dois provedores neste ciclo", { tema });
    return [];
  }

  return resultados;
}
