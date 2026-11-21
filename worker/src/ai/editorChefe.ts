import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { config } from "../config.js";
import { supabase } from "../db.js";
import { log } from "../logger.js";
import { estaDisponivel, marcarIndisponivel, pareceErroDeCota } from "./quotaTracker.js";
import type { MateriaRedigida } from "../types.js";

/**
 * Editor-chefe/Organizador (item 11 do plano) — "recebe o que cada
 * pesquisador de área trouxe, prioriza, evita duplicação, manda pro fluxo
 * de publicação na ordem certa."
 *
 * Duas responsabilidades:
 *
 * 1. Duplicação REAL entre fontes diferentes: a triagem (pipeline.ts) já
 *    pergunta pra IA se "assuntoJaCoberto", mas sem nenhum dado real do
 *    banco — é a IA "achando" por conta própria, sem embasamento. Aqui, a
 *    checagem usa as notícias de verdade já agendadas/publicadas/em
 *    rascunho na mesma editoria nas últimas 24h, então detecta duplicação
 *    de verdade entre fontes diferentes (ex: duas fontes de RSS cobrindo o
 *    mesmo acidente).
 *
 * 2. Priorização: notícia marcada como urgente pelo Redator não espera na
 *    fila do gotejamento atrás de matérias comuns — publica quase na hora.
 */

export interface ResultadoOrganizacao {
  duplicada: boolean;
  motivo: string;
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

function montarPrompt(materia: MateriaRedigida, candidatas: { titulo: string; subtitulo: string }[]): string {
  const lista = candidatas.map((c, i) => `${i + 1}. ${c.titulo} — ${c.subtitulo}`).join("\n");
  return `Você é o Editor-chefe do Radar BV, portal de notícias de Boa Vista/Roraima. Sua função aqui é só uma: evitar publicar a MESMA notícia duas vezes quando ela vem de fontes diferentes (ex: duas fontes de RSS cobrindo o mesmo acidente, ou um pesquisador de bairro relatando algo que uma fonte oficial já publicou).

NOTÍCIA NOVA, esperando pra ser publicada:
Título: ${materia.titulo}
Subtítulo: ${materia.subtitulo}

NOTÍCIAS JÁ NA FILA/PUBLICADAS NAS ÚLTIMAS 24H (mesma editoria):
${lista}

Pergunta: a notícia nova trata do MESMO evento/fato específico que alguma das notícias já na lista (não apenas o mesmo tema geral — tem que ser o mesmo acontecimento)? Duas matérias sobre o mesmo assunto genérico (ex: "trânsito em Boa Vista") mas eventos diferentes NÃO são duplicatas.

Responda SOMENTE com um JSON válido, sem comentários, sem markdown, no formato exato:
{"duplicada": boolean, "motivo": "string curta explicando a decisão"}`;
}

const groq = config.ia.groqApiKey ? new Groq({ apiKey: config.ia.groqApiKey }) : null;
const genAI = new GoogleGenerativeAI(config.ia.geminiApiKey);
const anthropic = new Anthropic({ apiKey: config.ia.anthropicApiKey });

async function perguntarGroq(prompt: string): Promise<ResultadoOrganizacao | null> {
  if (!groq) return null;
  try {
    const resposta = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    });
    const texto = resposta.choices[0]?.message?.content ?? "";
    if (!texto.trim()) return null;
    return extrairJson<ResultadoOrganizacao>(texto);
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("groq", String(err?.message ?? err));
    await log("warning", "editorChefe", "Falha na checagem de duplicação (Groq)", { erro: String(err?.message ?? err) });
    return null;
  }
}

async function perguntarGemini(prompt: string): Promise<ResultadoOrganizacao | null> {
  try {
    const modelo = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    const resultado = await modelo.generateContent(prompt);
    const texto = resultado.response.text();
    if (!texto.trim()) return null;
    return extrairJson<ResultadoOrganizacao>(texto);
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("gemini", String(err?.message ?? err));
    await log("warning", "editorChefe", "Falha na checagem de duplicação (Gemini)", { erro: String(err?.message ?? err) });
    return null;
  }
}

async function perguntarClaude(prompt: string): Promise<ResultadoOrganizacao | null> {
  try {
    const resposta = await anthropic.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 250,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: prompt }],
    } as any);
    const bloco = resposta.content.find((b: any) => b.type === "text");
    const texto = bloco && (bloco as any).type === "text" ? (bloco as any).text : "";
    if (!texto.trim()) return null;
    return extrairJson<ResultadoOrganizacao>(texto);
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("claude", String(err?.message ?? err));
    await log("warning", "editorChefe", "Falha na checagem de duplicação (Claude)", { erro: String(err?.message ?? err) });
    return null;
  }
}

/**
 * Checa se a matéria é duplicata de algo real já na fila/publicado nas
 * últimas 24h, na mesma editoria. Busca as candidatas direto no banco
 * (nada de "achismo" da IA sem dado) e só gasta uma chamada de IA se
 * houver candidatas de verdade pra comparar. Nunca bloqueia a publicação
 * sozinho por falha técnica — aprova (não-duplicada) por padrão nesse caso.
 */
export async function verificarDuplicacaoReal(materia: MateriaRedigida): Promise<ResultadoOrganizacao> {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: candidatas, error } = await supabase
    .from("noticias")
    .select("titulo, subtitulo")
    .eq("editoria", materia.editoria)
    .in("status", ["publicado", "agendado", "rascunho"])
    .gte("criado_em", desde)
    .limit(15);

  if (error) {
    await log("warning", "editorChefe", "Falha ao buscar candidatas pra checagem de duplicação — aprovando por padrão", {
      erro: error.message,
    });
    return { duplicada: false, motivo: "Falha ao consultar o banco — checagem pulada" };
  }

  if (!candidatas || candidatas.length === 0) {
    return { duplicada: false, motivo: "Nenhuma notícia recente na mesma editoria pra comparar" };
  }

  const prompt = montarPrompt(materia, candidatas);

  let resultado: ResultadoOrganizacao | null = null;
  if (estaDisponivel("groq")) resultado = await perguntarGroq(prompt);
  if (!resultado && estaDisponivel("gemini")) resultado = await perguntarGemini(prompt);
  if (!resultado && estaDisponivel("claude")) resultado = await perguntarClaude(prompt);

  if (!resultado) {
    await log("warning", "editorChefe", "Checagem de duplicação indisponível em todos os provedores — aprovando por padrão", {
      titulo: materia.titulo,
    });
    return { duplicada: false, motivo: "Editor-chefe indisponível neste ciclo — aprovado por padrão" };
  }

  return resultado;
}
