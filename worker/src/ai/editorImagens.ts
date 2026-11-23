import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { config } from "../config.js";
import { log } from "../logger.js";
import { estaDisponivel, marcarIndisponivel, pareceErroDeCota } from "./quotaTracker.js";

/**
 * Editor de Imagens (item 8 do plano) — "lê e entende o resumo da matéria
 * pra achar imagem de verdade compatível (não só por palavra-chave solta).
 * Robô filtra candidatas, IA decide a final."
 *
 * Antes, cada busca de imagem (Unsplash/Pixabay/Pexels) trazia só 1 foto —
 * a primeira que bateu com a palavra-chave em inglês, sem garantia nenhuma
 * de que ela realmente representa o ASSUNTO da matéria (ex: buscar "river
 * drought" podia trazer qualquer rio do mundo, não necessariamente uma cena
 * compatível com uma seca em Roraima). Agora o robô (images.ts) traz um
 * punhado de candidatas de uma vez — o "filtro" barato — e esta IA, pequena
 * e barata, olha a descrição de cada uma junto do contexto real da matéria
 * (título/subtítulo/tags) e escolhe qual delas combina de verdade.
 */

export interface CandidatoImagem {
  url: string;
  credito: string;
  descricao: string;
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

function montarPrompt(contextoMateria: string, candidatos: CandidatoImagem[]): string {
  const lista = candidatos
    .map((c, i) => `${i}. ${c.descricao || "(sem descrição disponível)"}`)
    .join("\n");

  return `Você é o Editor de Imagens do Radar BV, portal de notícias de Boa Vista/Roraima. Sua função é escolher, entre fotos candidatas de banco de imagens, qual combina DE VERDADE com o assunto da matéria — não só por ter uma palavra parecida, mas pelo que a cena da foto realmente mostra.

CONTEXTO DA MATÉRIA (título, subtítulo e tags):
"""
${contextoMateria}
"""

FOTOS CANDIDATAS (descrição de cada uma, vinda do próprio banco de imagens):
${lista}

Responda SOMENTE com um JSON válido, sem comentários, sem markdown, no formato exato:
{"indice": N}

Onde N é o número da foto que melhor representa o assunto da matéria. Se NENHUMA candidata combinar bem de verdade com o assunto, responda {"indice": -1}.`;
}

const groq = config.ia.groqApiKey ? new Groq({ apiKey: config.ia.groqApiKey }) : null;
const genAI = new GoogleGenerativeAI(config.ia.geminiApiKey);
const anthropic = new Anthropic({ apiKey: config.ia.anthropicApiKey });

async function perguntarGroq(prompt: string): Promise<number | null> {
  if (!groq) return null;
  try {
    const resposta = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    });
    const texto = resposta.choices[0]?.message?.content ?? "";
    if (!texto.trim()) return null;
    return extrairJson<{ indice: number }>(texto).indice;
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("groq", String(err?.message ?? err));
    await log("warning", "editorImagens", "Falha ao escolher imagem via Groq", { erro: String(err?.message ?? err) });
    return null;
  }
}

async function perguntarGemini(prompt: string): Promise<number | null> {
  try {
    const modelo = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    const resultado = await modelo.generateContent(prompt);
    const texto = resultado.response.text();
    if (!texto.trim()) return null;
    return extrairJson<{ indice: number }>(texto).indice;
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("gemini", String(err?.message ?? err));
    await log("warning", "editorImagens", "Falha ao escolher imagem via Gemini", { erro: String(err?.message ?? err) });
    return null;
  }
}

async function perguntarClaude(prompt: string): Promise<number | null> {
  try {
    const resposta = await anthropic.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 200,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: prompt }],
    } as any);
    const bloco = resposta.content.find((b: any) => b.type === "text");
    const texto = bloco && (bloco as any).type === "text" ? (bloco as any).text : "";
    if (!texto.trim()) return null;
    return extrairJson<{ indice: number }>(texto).indice;
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("claude", String(err?.message ?? err));
    await log("warning", "editorImagens", "Falha ao escolher imagem via Claude", { erro: String(err?.message ?? err) });
    return null;
  }
}

/**
 * Recebe o punhado de candidatas já filtrado pelo robô (images.ts) e devolve
 * a escolhida pela IA, junto com um aviso de CONFIANÇA (item novo,
 * 22/11/2026 — antes, quando a IA dizia "nenhuma candidata combina"
 * (índice -1) ou todas as IAs falhavam, o código usava a primeira candidata
 * MESMO ASSIM e seguia como se nada tivesse acontecido — não tinha como o
 * chamador (images.ts) saber que aquela escolha era, na real, um palpite
 * fraco. Agora devolve `confiavel: false` nesses casos, pra o Pesquisador de
 * Imagem (abaixo) poder tentar um ângulo de busca diferente antes de aceitar
 * uma foto que a própria IA avisou que não combina bem.
 */
export async function escolherMelhorImagem(
  candidatos: CandidatoImagem[],
  contextoMateria: string,
): Promise<{ escolhida: CandidatoImagem; confiavel: boolean }> {
  if (candidatos.length <= 1) return { escolhida: candidatos[0], confiavel: true };

  let indice: number | null = null;

  if (estaDisponivel("groq")) indice = await perguntarGroq(montarPrompt(contextoMateria, candidatos));
  if (indice === null && estaDisponivel("gemini")) indice = await perguntarGemini(montarPrompt(contextoMateria, candidatos));
  if (indice === null && estaDisponivel("claude")) indice = await perguntarClaude(montarPrompt(contextoMateria, candidatos));

  if (indice === null || indice < 0 || indice >= candidatos.length) {
    if (indice === -1) {
      await log("info", "editorImagens", "IA decidiu que nenhuma candidata combina bem", { contextoMateria });
    }
    return { escolhida: candidatos[0], confiavel: false };
  }

  return { escolhida: candidatos[indice], confiavel: true };
}

function montarPromptPesquisador(materia: { titulo: string; subtitulo: string; tags: string[] }, palavraChaveOriginal: string): string {
  return `Você é o Pesquisador de Imagem do Radar BV, portal de notícias de Boa Vista/Roraima. A busca de foto com a palavra-chave em inglês "${palavraChaveOriginal}" não encontrou nenhuma foto que combine bem com a matéria abaixo, em bancos de imagens internacionais (Unsplash/Pixabay/Pexels).

MATÉRIA:
Título: ${materia.titulo}
Subtítulo: ${materia.subtitulo}
Tags: ${materia.tags.join(", ") || "(nenhuma)"}

Sugira 3 frases de busca ALTERNATIVAS em INGLÊS (2 a 5 palavras cada), pensadas pra achar uma foto GENUINAMENTE compatível com o assunto de verdade da matéria nesses bancos de imagens — cada uma com um ângulo diferente da primeira tentativa: pode focar em outro elemento concreto da cena (um objeto, uma ação, um lugar genérico do tipo certo), usar um termo mais comum/genérico, ou um sinônimo mais buscável. Evite termos ambíguos que possam trazer foto de lugar errado (ex.: nome próprio de cidade/país sozinho). Não repita a palavra-chave original.

Responda SOMENTE com um JSON válido, sem comentários, sem markdown, no formato exato:
{"alternativas": ["string", "string", "string"]}`;
}

async function perguntarGroqAlternativas(prompt: string): Promise<string[] | null> {
  if (!groq) return null;
  try {
    const resposta = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
    });
    const texto = resposta.choices[0]?.message?.content ?? "";
    if (!texto.trim()) return null;
    const json = extrairJson<{ alternativas: string[] }>(texto);
    return json.alternativas?.length ? json.alternativas : null;
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("groq", String(err?.message ?? err));
    await log("warning", "editorImagens", "Falha ao sugerir palavras-chave alternativas via Groq", { erro: String(err?.message ?? err) });
    return null;
  }
}

async function perguntarGeminiAlternativas(prompt: string): Promise<string[] | null> {
  try {
    const modelo = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    const resultado = await modelo.generateContent(prompt);
    const texto = resultado.response.text();
    if (!texto.trim()) return null;
    const json = extrairJson<{ alternativas: string[] }>(texto);
    return json.alternativas?.length ? json.alternativas : null;
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("gemini", String(err?.message ?? err));
    await log("warning", "editorImagens", "Falha ao sugerir palavras-chave alternativas via Gemini", { erro: String(err?.message ?? err) });
    return null;
  }
}

async function perguntarClaudeAlternativas(prompt: string): Promise<string[] | null> {
  try {
    const resposta = await anthropic.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 300,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: prompt }],
    } as any);
    const bloco = resposta.content.find((b: any) => b.type === "text");
    const texto = bloco && (bloco as any).type === "text" ? (bloco as any).text : "";
    if (!texto.trim()) return null;
    const json = extrairJson<{ alternativas: string[] }>(texto);
    return json.alternativas?.length ? json.alternativas : null;
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("claude", String(err?.message ?? err));
    await log("warning", "editorImagens", "Falha ao sugerir palavras-chave alternativas via Claude", { erro: String(err?.message ?? err) });
    return null;
  }
}

/**
 * Pesquisador de Imagem (item novo, 22/11/2026 — pedido direto de Valter:
 * "se não achasse a imagem, achasse algo compatível"). Entra em cena só
 * quando a primeira busca falhou de verdade (0 candidatas encontradas, ou
 * o Editor de Imagens acima disse que nenhuma combina bem) — em vez de já
 * desistir pro fallback institucional genérico, pede à IA 2-3 ângulos de
 * busca DIFERENTES a partir do conteúdo real da matéria, pra dar mais uma
 * (ou três) chances de achar uma foto de banco livre que realmente combine,
 * antes de aceitar a imagem genérica como último recurso.
 */
export async function sugerirPalavrasChaveAlternativas(
  materia: { titulo: string; subtitulo: string; tags: string[] },
  palavraChaveOriginal: string,
): Promise<string[]> {
  const prompt = montarPromptPesquisador(materia, palavraChaveOriginal);

  let alternativas: string[] | null = null;
  if (estaDisponivel("groq")) alternativas = await perguntarGroqAlternativas(prompt);
  if (!alternativas && estaDisponivel("gemini")) alternativas = await perguntarGeminiAlternativas(prompt);
  if (!alternativas && estaDisponivel("claude")) alternativas = await perguntarClaudeAlternativas(prompt);

  if (!alternativas) {
    await log("warning", "editorImagens", "Pesquisador de Imagem indisponível neste ciclo — sem palavras-chave alternativas pra tentar", {
      titulo: materia.titulo,
    });
    return [];
  }
  return alternativas;
}

/**
 * Verificador de Imagem (item novo, 22/11/2026 — flagrado por Valter: matéria
 * de "Brasil & Mundo" sobre incêndio na Indonésia, terremoto no Peru, FBI
 * nos EUA etc. saindo ilustrada com a foto REAL do 5º Distrito de Polícia de
 * Boa Vista). O Banco de Imagens Próprias (buscarImagemBancoProprio em
 * images.ts) já tem uma regra rígida excluindo a editoria "brasil_mundo" —
 * mas aquele caso específico veio de um worker rodando código antigo, de
 * antes dessa exclusão existir (reforça por que esse Verificador é uma
 * segunda camada independente, e não só mais uma regra escrita à mão: regra
 * fixa falha quando o código não foi atualizado a tempo, ou quando a
 * editoria vem rotulada errado; uma IA olhando o par foto+matéria pega isso
 * de qualquer jeito).
 *
 * Diferença para o Editor de Imagens acima: aquele ESCOLHE a melhor entre
 * candidatas de banco livre (fotos genéricas, trocar uma pela outra é barato
 * e nunca embaraçoso). Este AQUI é chamado só quando a foto é uma foto REAL
 * E RECONHECÍVEL de um local/objeto específico de Boa Vista/Roraima (prédio
 * público, viatura, hospital nomeado) — nesse caso usar a foto errada não é
 * só "uma imagem meia-boca", é afirmar visualmente que o fato aconteceu ali,
 * quando não aconteceu. Por isso a régua é mais rígida: só aprova se a
 * matéria for GENUINAMENTE sobre aquele local/órgão específico.
 */
function montarPromptVerificacao(materia: { titulo: string; subtitulo: string; editoria: string; tags: string[] }, descricaoFoto: string): string {
  return `Você é o Verificador de Imagem do Radar BV, portal de notícias de Boa Vista/Roraima. Uma foto REAL E ESPECÍFICA — não uma foto genérica de banco de imagens, mas uma foto de verdade de um prédio, viatura, hospital ou outro local/órgão reconhecível de Boa Vista/Roraima — foi escolhida pra ilustrar a matéria abaixo.

Por ser uma foto real e reconhecível, ela só pode ser usada se a matéria for GENUINAMENTE sobre esse local/órgão/tema específico mostrado na foto — nunca como ilustração "parecida", "do mesmo assunto geral" ou "mais ou menos relacionada". Em especial: REPROVE sempre que a matéria tratar de um fato ocorrido fora de Roraima (outro estado brasileiro, ou outro país) — uma foto real daqui nunca pode ilustrar um fato que aconteceu em outro lugar, mesmo que o tema pareça parecido (ex.: notícia de polícia em outro país/estado NUNCA pode usar foto de uma delegacia real de Boa Vista).

MATÉRIA:
Título: ${materia.titulo}
Subtítulo: ${materia.subtitulo}
Editoria: ${materia.editoria}
Tags: ${materia.tags.join(", ") || "(nenhuma)"}

FOTO ESCOLHIDA (descrição real e específica do que ela mostra):
"${descricaoFoto}"

A matéria é genuinamente sobre o que essa foto mostra? Responda SOMENTE com um JSON válido, sem comentários, sem markdown, no formato exato:
{"aprovado": boolean, "motivo": "string curta"}`;
}

async function perguntarGroqVerificacao(prompt: string): Promise<{ aprovado: boolean; motivo?: string } | null> {
  if (!groq) return null;
  try {
    const resposta = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    });
    const texto = resposta.choices[0]?.message?.content ?? "";
    if (!texto.trim()) return null;
    return extrairJson<{ aprovado: boolean; motivo?: string }>(texto);
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("groq", String(err?.message ?? err));
    await log("warning", "editorImagens", "Falha ao verificar imagem via Groq", { erro: String(err?.message ?? err) });
    return null;
  }
}

async function perguntarGeminiVerificacao(prompt: string): Promise<{ aprovado: boolean; motivo?: string } | null> {
  try {
    const modelo = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    const resultado = await modelo.generateContent(prompt);
    const texto = resultado.response.text();
    if (!texto.trim()) return null;
    return extrairJson<{ aprovado: boolean; motivo?: string }>(texto);
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("gemini", String(err?.message ?? err));
    await log("warning", "editorImagens", "Falha ao verificar imagem via Gemini", { erro: String(err?.message ?? err) });
    return null;
  }
}

async function perguntarClaudeVerificacao(prompt: string): Promise<{ aprovado: boolean; motivo?: string } | null> {
  try {
    const resposta = await anthropic.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 200,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: prompt }],
    } as any);
    const bloco = resposta.content.find((b: any) => b.type === "text");
    const texto = bloco && (bloco as any).type === "text" ? (bloco as any).text : "";
    if (!texto.trim()) return null;
    return extrairJson<{ aprovado: boolean; motivo?: string }>(texto);
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("claude", String(err?.message ?? err));
    await log("warning", "editorImagens", "Falha ao verificar imagem via Claude", { erro: String(err?.message ?? err) });
    return null;
  }
}

/**
 * Roda a cascata (Groq -> Gemini -> Claude) pra validar uma foto do Banco de
 * Imagens Próprias contra o conteúdo real da matéria. Fail-open: se as 3
 * IAs falharem, aprova por padrão (nunca trava a publicação por causa do
 * Verificador estar indisponível) — mas ISSO nunca é o único filtro: a
 * exclusão rígida de "brasil_mundo" em images.ts continua valendo sempre,
 * mesmo com o Verificador fora do ar.
 */
export async function validarImagemBancoProprio(
  descricaoFoto: string,
  materia: { titulo: string; subtitulo: string; editoria: string; tags: string[] }
): Promise<{ aprovado: boolean; motivo?: string }> {
  const prompt = montarPromptVerificacao(materia, descricaoFoto);

  let resultado: { aprovado: boolean; motivo?: string } | null = null;

  if (estaDisponivel("groq")) resultado = await perguntarGroqVerificacao(prompt);
  if (!resultado && estaDisponivel("gemini")) resultado = await perguntarGeminiVerificacao(prompt);
  if (!resultado && estaDisponivel("claude")) resultado = await perguntarClaudeVerificacao(prompt);

  if (!resultado) {
    await log("warning", "editorImagens", "Verificador de Imagem indisponível neste ciclo — foto do banco próprio aprovada por padrão (fail-open)", {
      descricaoFoto,
      titulo: materia.titulo,
    });
    return { aprovado: true };
  }

  if (!resultado.aprovado) {
    await log("info", "editorImagens", "Verificador de Imagem reprovou foto do banco próprio — buscando outra opção", {
      descricaoFoto,
      titulo: materia.titulo,
      motivo: resultado.motivo,
    });
  }

  return resultado;
}
