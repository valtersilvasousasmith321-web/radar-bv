import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { config } from "../config.js";
import { log } from "../logger.js";
import { estaDisponivel, marcarIndisponivel, pareceErroDeCota } from "./quotaTracker.js";
import type { MateriaRedigida } from "../types.js";

/**
 * Revisor/Copydesk (item 9 do plano) — "última checagem antes de publicar.
 * Camada 1 (código, grátis): título, formatação, links, acentuação.
 * Camada 2 (IA leve/rápida, tipo Groq): sempre dá uma olhada final, mesmo
 * que a camada 1 não ache nada — porque só IA pega erro de sentido, tom ou
 * foto incoerente."
 */

export interface ResultadoCamada1 {
  materia: MateriaRedigida;
  achados: string[]; // avisos encontrados/corrigidos — só pra log, nunca bloqueia
}

// Caracteres clássicos de "mojibake" (UTF-8 lido como Latin-1 e vice-versa)
// — não dá pra consertar isso automaticamente com segurança, só sinalizar.
const PADRAO_MOJIBAKE = /Ã[£¡©¢¤¨µ¼½¾]|â€[™œ“”¦]|�/;

/**
 * Camada 1 — puro código, sem custo de IA. Corrige o que dá pra corrigir
 * com segurança (espaço sobrando, limite de tamanho, marcas de código que
 * vazaram) e sinaliza o que não dá (acentuação quebrada) pro log — nunca
 * bloqueia a publicação sozinha, só a Camada 2 (IA) decide isso.
 */
export function revisarCamada1(materiaOriginal: MateriaRedigida): ResultadoCamada1 {
  const achados: string[] = [];
  const materia = { ...materiaOriginal };

  materia.titulo = materia.titulo.trim();
  materia.subtitulo = materia.subtitulo.trim();
  materia.conteudo = materia.conteudo.trim();

  if (materia.titulo.length > 90) {
    achados.push(`Título passou de 90 caracteres (${materia.titulo.length}) — cortado`);
    materia.titulo = materia.titulo.slice(0, 90).trim();
  }
  if (materia.subtitulo.length > 160) {
    achados.push(`Subtítulo passou de 160 caracteres (${materia.subtitulo.length}) — cortado`);
    materia.subtitulo = materia.subtitulo.slice(0, 160).trim();
  }

  // Marcas de bloco de código ou JSON que às vezes vazam da resposta da IA
  // pro corpo da matéria (ex: a IA "pensou em voz alta" no meio do texto).
  if (/```|^\{[\s\S]*\}$/.test(materia.conteudo.trim())) {
    achados.push("Possível vazamento de formatação técnica (```/JSON) no corpo — revisar manualmente");
  }

  // Link cru no meio do texto — a matéria nunca deveria escrever a URL da
  // fonte no corpo (o crédito já aparece separado, ver prompts.ts regra 4).
  if (/https?:\/\//i.test(materia.conteudo)) {
    achados.push("Link cru encontrado no corpo da matéria — revisar manualmente");
  }

  if (PADRAO_MOJIBAKE.test(materia.titulo) || PADRAO_MOJIBAKE.test(materia.conteudo)) {
    achados.push("Possível problema de acentuação/codificação (mojibake) no texto — revisar manualmente");
  }

  if (materia.titulo.length < 10) {
    achados.push("Título muito curto — possível falha na redação");
  }
  if (materia.conteudo.length < 120) {
    achados.push("Corpo da matéria muito curto — possível falha na redação");
  }

  return { materia, achados };
}

export interface ResultadoCamada2 {
  aprovado: boolean;
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

function montarPrompt(materia: MateriaRedigida, imagemCredito: string, imagemEFallback: boolean): string {
  return `Você é o Revisor/Copydesk do Radar BV, portal de notícias de Boa Vista/Roraima. Esta é a ÚLTIMA checagem antes da matéria ir pro ar — um olhar de revisor humano experiente, não um corretor automático de português.

Avalie:
1. SENTIDO: o texto faz sentido de ponta a ponta? Título e corpo falam da mesma coisa? Não tem frase quebrada, repetida ou contraditória?
2. TOM: a linguagem é jornalística e sóbria, sem sensacionalismo/clickbait, sem adjetivo alarmista gratuito?
3. FOTO: a legenda/crédito da imagem escolhida faz sentido com o assunto da matéria, ou parece completamente fora de contexto?

MATÉRIA:
Título: ${materia.titulo}
Subtítulo: ${materia.subtitulo}
Corpo: ${materia.conteudo}

IMAGEM ESCOLHIDA: ${imagemEFallback ? "imagem institucional padrão (fallback — não precisa bater com o assunto)" : imagemCredito}

Responda SOMENTE com um JSON válido, sem comentários, sem markdown, no formato exato:
{"aprovado": boolean, "motivo": "string curta explicando a decisão"}

Só reprove (aprovado: false) se houver um problema REAL que um leitor notaria — não seja excessivamente exigente por pequenos detalhes de estilo.`;
}

const groq = config.ia.groqApiKey ? new Groq({ apiKey: config.ia.groqApiKey }) : null;
const genAI = new GoogleGenerativeAI(config.ia.geminiApiKey);
const anthropic = new Anthropic({ apiKey: config.ia.anthropicApiKey });

async function perguntarGroq(prompt: string): Promise<ResultadoCamada2 | null> {
  if (!groq) return null;
  try {
    const resposta = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });
    const texto = resposta.choices[0]?.message?.content ?? "";
    if (!texto.trim()) return null;
    return extrairJson<ResultadoCamada2>(texto);
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("groq", String(err?.message ?? err));
    await log("warning", "revisor", "Falha na Camada 2 (Groq)", { erro: String(err?.message ?? err) });
    return null;
  }
}

async function perguntarGemini(prompt: string): Promise<ResultadoCamada2 | null> {
  try {
    const modelo = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    const resultado = await modelo.generateContent(prompt);
    const texto = resultado.response.text();
    if (!texto.trim()) return null;
    return extrairJson<ResultadoCamada2>(texto);
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("gemini", String(err?.message ?? err));
    await log("warning", "revisor", "Falha na Camada 2 (Gemini)", { erro: String(err?.message ?? err) });
    return null;
  }
}

async function perguntarClaude(prompt: string): Promise<ResultadoCamada2 | null> {
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
    return extrairJson<ResultadoCamada2>(texto);
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("claude", String(err?.message ?? err));
    await log("warning", "revisor", "Falha na Camada 2 (Claude)", { erro: String(err?.message ?? err) });
    return null;
  }
}

/**
 * Camada 2 — sempre roda, mesmo que a Camada 1 não tenha achado nada
 * (só IA pega erro de sentido/tom/foto incoerente). Se todas as IAs
 * falharem tecnicamente, aprova por padrão — o Revisor é uma rede de
 * segurança a mais, nunca pode travar a publicação sozinho por uma falha
 * de rede.
 */
export async function revisarCamada2(
  materia: MateriaRedigida,
  imagemCredito: string,
  imagemEFallback: boolean,
): Promise<ResultadoCamada2> {
  const prompt = montarPrompt(materia, imagemCredito, imagemEFallback);

  let resultado: ResultadoCamada2 | null = null;
  if (estaDisponivel("groq")) resultado = await perguntarGroq(prompt);
  if (!resultado && estaDisponivel("gemini")) resultado = await perguntarGemini(prompt);
  if (!resultado && estaDisponivel("claude")) resultado = await perguntarClaude(prompt);

  if (!resultado) {
    await log("warning", "revisor", "Camada 2 indisponível em todos os provedores neste ciclo — aprovando por padrão", {
      titulo: materia.titulo,
    });
    return { aprovado: true, motivo: "Revisor indisponível neste ciclo — aprovado por padrão" };
  }

  return resultado;
}
