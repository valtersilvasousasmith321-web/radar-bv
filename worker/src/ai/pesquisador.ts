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

export interface ResumoServico {
  /** Texto corrido com o apanhado do que foi encontrado (vagas, editais, prazos etc.), já com os nomes/números relevantes. */
  texto: string;
  /** URL real da página oficial de onde a informação veio — vira o link público de "ver fonte" na matéria. */
  urlFonte: string;
  /** true quando a busca não achou nada de verdade pro tema — nesse caso não deve virar matéria nenhuma. */
  semNovidade: boolean;
}

function montarPromptResumoServico(tema: string): string {
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Boa_Vista" });
  return `Você é um pesquisador de serviço público. Use a ferramenta de busca na web pra descobrir o que está REALMENTE em aberto/vigente HOJE (${hoje}) sobre o seguinte tema, em Roraima/Boa Vista:

"${tema}"

Isto NÃO é uma busca por matéria de jornal — é uma busca por informação de SERVIÇO (vaga de emprego aberta, edital com inscrição aberta, prazo de matrícula, etc.), que normalmente fica numa página de listagem/portal, não numa notícia com URL própria. Por isso:

1. Pesquise o quanto for necessário pra achar o que está em aberto agora (vagas específicas com cargo/quantidade, nome e prazo de cada edital, etc.) — não só o nome do programa em geral.
2. Pode e deve citar a página de listagem/portal oficial como fonte (ex: "https://sine.rr.gov.br/vagas"), mesmo sem ser uma notícia — isso é esperado aqui.
3. Nunca invente vaga, edital ou prazo que você não encontrou de verdade na busca.

Responda SOMENTE neste formato, sem nada antes ou depois:

FONTE: <a URL real e navegável da página oficial de onde tirou a informação>
RESUMO: <resumo corrido em português, com os fatos concretos: o que está aberto, quantas vagas/cargos, prazos, onde se inscrever>

Se não achar nada de verdade, concreto e atual sobre esse tema (nem no portal oficial, nem em nenhuma notícia recente), responda SOMENTE com a palavra: NADA`;
}

/**
 * Pesquisa de SERVIÇO (vagas, editais, matrícula) — diferente de
 * pesquisarNoticias: aqui o resultado esperado é um apanhado do que está em
 * aberto agora, não uma lista de matérias com URL individual. Criado em
 * 24/11/2026 porque o Valter flagrou que "Serviço ao Cidadão" nunca
 * publicava nada: o motivo real era que vaga de emprego/edital não existe
 * como "notícia com URL própria" (é listagem de portal), e o prompt de
 * pesquisarNoticias EXIGE url de artigo individual e descarta página de
 * listagem — ou seja, a busca nunca podia achar nada pra esse tipo de
 * conteúdo, por desenho. Esta função usa um prompt próprio que aceita
 * citar a página de listagem como fonte.
 */
export async function pesquisarResumoServico(tema: string): Promise<ResumoServico | null> {
  const prompt = montarPromptResumoServico(tema);

  try {
    const resposta = await anthropic.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 4096,
      output_config: { effort: "low" },
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      messages: [{ role: "user", content: prompt }],
    } as any);

    const bloco = resposta.content.find((b: any) => b.type === "text");
    const texto = bloco && (bloco as any).type === "text" ? (bloco as any).text.trim() : "";
    if (!texto) {
      await log("warning", "pesquisador", "Resumo de serviço via Claude devolveu texto vazio", { tema });
      return null;
    }
    if (/^nada\.?$/i.test(texto)) {
      return { texto: "", urlFonte: "", semNovidade: true };
    }

    const matchFonte = texto.match(/FONTE:\s*(\S+)/i);
    const matchResumo = texto.match(/RESUMO:\s*([\s\S]+)/i);
    const urlFonte = matchFonte?.[1]?.trim() ?? "";
    const resumoTexto = matchResumo?.[1]?.trim() ?? "";

    if (!urlFonte || !resumoTexto || !/^https?:\/\//i.test(urlFonte)) {
      await log("warning", "pesquisador", "Resumo de serviço veio em formato inesperado (sem FONTE/RESUMO válidos) — descartado", {
        tema,
        trechoResposta: texto.slice(0, 300),
      });
      return null;
    }

    return { texto: resumoTexto, urlFonte, semNovidade: false };
  } catch (err: any) {
    await log("error", "pesquisador", "Falha no resumo de serviço via Claude (web_search)", { tema, erro: String(err?.message ?? err) });
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
