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
 * a escolhida pela IA. Com 0 ou 1 candidata, nem gasta chamada de IA — não
 * há o que decidir. Se todas as IAs falharem ou nenhuma combinar bem, cai
 * de volta pra primeira candidata (sempre uma foto de verdade é melhor que
 * travar a publicação ou usar só o fallback genérico).
 */
export async function escolherMelhorImagem(candidatos: CandidatoImagem[], contextoMateria: string): Promise<CandidatoImagem> {
  if (candidatos.length <= 1) return candidatos[0];

  let indice: number | null = null;

  if (estaDisponivel("groq")) indice = await perguntarGroq(montarPrompt(contextoMateria, candidatos));
  if (indice === null && estaDisponivel("gemini")) indice = await perguntarGemini(montarPrompt(contextoMateria, candidatos));
  if (indice === null && estaDisponivel("claude")) indice = await perguntarClaude(montarPrompt(contextoMateria, candidatos));

  if (indice === null || indice < 0 || indice >= candidatos.length) {
    if (indice === -1) {
      await log("info", "editorImagens", "IA decidiu que nenhuma candidata combina bem — usando a primeira mesmo assim", {
        contextoMateria,
      });
    }
    return candidatos[0];
  }

  return candidatos[indice];
}
