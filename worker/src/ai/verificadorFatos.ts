import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { config } from "../config.js";
import { log } from "../logger.js";
import { estaDisponivel, marcarIndisponivel, pareceErroDeCota } from "./quotaTracker.js";
import type { MateriaRedigida } from "../types.js";

/**
 * Verificador de Fatos (item 10 do plano) — "braço dedicado ao combate a
 * fake news/desinformação."
 *
 * Diferente do Revisor (item 9, que avalia sentido/tom/foto de forma geral),
 * este módulo faz uma checagem bem específica: todo fato concreto (nome,
 * número, data, citação, lugar) que aparece no corpo final da matéria
 * precisa estar rastreável nos tópicos apurados na triagem — ou seja, o
 * texto escrito pela IA redatora não pode ter inventado ou distorcido
 * nenhum detalhe que não estava na apuração original. É a rede de segurança
 * final contra alucinação da própria IA, não contra a fonte externa (a
 * fonte já é avaliada em outras etapas da esteira).
 */

export interface ResultadoVerificacaoFatos {
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

function montarPrompt(materia: MateriaRedigida, topicosApurados: string[], fonteNome: string): string {
  return `Você é o Verificador de Fatos do Radar BV, portal de notícias de Boa Vista/Roraima. Seu único trabalho é checar se a matéria REDIGIDA abaixo não inventou nenhum fato que não estava na apuração original (os tópicos extraídos da fonte "${fonteNome}").

Você não está checando se a fonte original é verdadeira — isso é responsabilidade de outra etapa. Você está checando se a IA que escreveu a matéria foi fiel ao que foi apurado, sem adicionar nomes, números, datas, citações ou lugares que não aparecem nos tópicos apurados.

TÓPICOS APURADOS (fatos confirmados na fonte original):
${topicosApurados.map((t, i) => `${i + 1}. ${t}`).join("\n")}

MATÉRIA REDIGIDA (o que foi publicado a partir desses tópicos):
Título: ${materia.titulo}
Subtítulo: ${materia.subtitulo}
Corpo: ${materia.conteudo}

Pergunta: a matéria redigida contém algum fato concreto (nome próprio, número/estatística, data, citação entre aspas, local específico) que NÃO está presente, nem pode ser razoavelmente inferido, dos tópicos apurados acima? Pequenas reformulações de estilo e conectivos jornalísticos normais NÃO contam como problema — só fatos inventados ou distorcidos.

Responda SOMENTE com um JSON válido, sem comentários, sem markdown, no formato exato:
{"aprovado": boolean, "motivo": "string curta explicando a decisão"}

Só reprove (aprovado: false) se encontrar um fato claramente inventado ou distorcido — não seja excessivamente exigente com paráfrases razoáveis.`;
}

const groq = config.ia.groqApiKey ? new Groq({ apiKey: config.ia.groqApiKey }) : null;
const genAI = new GoogleGenerativeAI(config.ia.geminiApiKey);
const anthropic = new Anthropic({ apiKey: config.ia.anthropicApiKey });

async function perguntarGroq(prompt: string): Promise<ResultadoVerificacaoFatos | null> {
  if (!groq) return null;
  try {
    const resposta = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    });
    const texto = resposta.choices[0]?.message?.content ?? "";
    if (!texto.trim()) return null;
    return extrairJson<ResultadoVerificacaoFatos>(texto);
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("groq", String(err?.message ?? err));
    await log("warning", "verificadorFatos", "Falha na verificação (Groq)", { erro: String(err?.message ?? err) });
    return null;
  }
}

async function perguntarGemini(prompt: string): Promise<ResultadoVerificacaoFatos | null> {
  try {
    const modelo = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    const resultado = await modelo.generateContent(prompt);
    const texto = resultado.response.text();
    if (!texto.trim()) return null;
    return extrairJson<ResultadoVerificacaoFatos>(texto);
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("gemini", String(err?.message ?? err));
    await log("warning", "verificadorFatos", "Falha na verificação (Gemini)", { erro: String(err?.message ?? err) });
    return null;
  }
}

async function perguntarClaude(prompt: string): Promise<ResultadoVerificacaoFatos | null> {
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
    return extrairJson<ResultadoVerificacaoFatos>(texto);
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("claude", String(err?.message ?? err));
    await log("warning", "verificadorFatos", "Falha na verificação (Claude)", { erro: String(err?.message ?? err) });
    return null;
  }
}

/**
 * Checa se a matéria redigida é fiel aos tópicos apurados. Se todas as IAs
 * falharem tecnicamente, aprova por padrão — este verificador é uma camada
 * extra de segurança, nunca pode travar a publicação sozinho por uma falha
 * de rede/cota. Se não houver tópicos apurados (ex: item sem apuração
 * estruturada), aprova direto sem gastar chamada de IA.
 */
export async function verificarFatos(
  materia: MateriaRedigida,
  topicosApurados: string[],
  fonteNome: string,
): Promise<ResultadoVerificacaoFatos> {
  if (!topicosApurados || topicosApurados.length === 0) {
    return { aprovado: true, motivo: "Sem tópicos apurados pra comparar — verificação pulada" };
  }

  const prompt = montarPrompt(materia, topicosApurados, fonteNome);

  let resultado: ResultadoVerificacaoFatos | null = null;
  if (estaDisponivel("groq")) resultado = await perguntarGroq(prompt);
  if (!resultado && estaDisponivel("gemini")) resultado = await perguntarGemini(prompt);
  if (!resultado && estaDisponivel("claude")) resultado = await perguntarClaude(prompt);

  if (!resultado) {
    await log("warning", "verificadorFatos", "Verificador indisponível em todos os provedores neste ciclo — aprovando por padrão", {
      titulo: materia.titulo,
    });
    return { aprovado: true, motivo: "Verificador de Fatos indisponível neste ciclo — aprovado por padrão" };
  }

  return resultado;
}
