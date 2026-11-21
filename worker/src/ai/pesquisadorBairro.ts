import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { config } from "../config.js";
import { log } from "../logger.js";
import { promptPesquisadorBairro } from "./prompts.js";
import { estaDisponivel, marcarIndisponivel, pareceErroDeCota } from "./quotaTracker.js";
import type { ResultadoDicaIA } from "../types.js";

/**
 * Pesquisador de Bairro via dica de morador (item 3 do plano, frente B —
 * Denúncias/dicas via WhatsApp). Módulo isolado dos demais (claude.ts,
 * gemini.ts, groq.ts) de propósito: usa um prompt e um contrato de saída
 * diferentes (pode responder "insuficiente" com motivo), e o relato de
 * cidadão não passa pela Triagem normal — vai direto pra uma única etapa
 * de julgamento editorial da IA (ver prompts.ts: proteção de identidade,
 * nunca afirmar como fato comprovado).
 *
 * Mesma Regra de Ouro de Fallback em cascata das demais etapas: Claude ->
 * Gemini -> Groq, pulando quem estiver "sem fôlego" (quotaTracker).
 */

const anthropic = new Anthropic({ apiKey: config.ia.anthropicApiKey });
const genAI = new GoogleGenerativeAI(config.ia.geminiApiKey);
const groq = config.ia.groqApiKey ? new Groq({ apiKey: config.ia.groqApiKey }) : null;

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

/** Nunca confia em "urgente" vindo da IA pra relato de morador não verificado — força false sempre. */
function normalizar(json: any): ResultadoDicaIA {
  if (!json.suficiente) {
    return { suficiente: false, motivo: String(json.motivo ?? "Relato sem informação suficiente.") };
  }
  return {
    suficiente: true,
    materia: {
      titulo: String(json.titulo ?? "").slice(0, 90),
      subtitulo: String(json.subtitulo ?? "").slice(0, 160),
      conteudo: String(json.conteudo ?? ""),
      editoria: json.editoria,
      tags: Array.isArray(json.tags) ? json.tags : [],
      urgente: false,
    },
  };
}

async function tentarClaude(prompt: string): Promise<ResultadoDicaIA | null> {
  try {
    const resposta = await anthropic.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 1500,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: prompt }],
    } as any);
    const bloco = resposta.content.find((b: any) => b.type === "text");
    const texto = bloco && (bloco as any).type === "text" ? (bloco as any).text : "";
    if (!texto.trim()) return null;
    return normalizar(extrairJson<any>(texto));
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("claude", String(err?.message ?? err));
    await log("error", "pesquisadorBairro", "Falha no julgamento da dica via Claude", { erro: String(err?.message ?? err) });
    return null;
  }
}

async function tentarGemini(prompt: string): Promise<ResultadoDicaIA | null> {
  try {
    const modelo = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    const resultado = await modelo.generateContent(prompt);
    const texto = resultado.response.text();
    if (!texto.trim()) return null;
    return normalizar(extrairJson<any>(texto));
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("gemini", String(err?.message ?? err));
    await log("warning", "pesquisadorBairro", "Falha no julgamento da dica via Gemini", { erro: String(err?.message ?? err) });
    return null;
  }
}

async function tentarGroq(prompt: string): Promise<ResultadoDicaIA | null> {
  if (!groq) return null;
  try {
    const resposta = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });
    const texto = resposta.choices[0]?.message?.content ?? "";
    if (!texto.trim()) return null;
    return normalizar(extrairJson<any>(texto));
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("groq", String(err?.message ?? err));
    await log("warning", "pesquisadorBairro", "Falha no julgamento da dica via Groq", { erro: String(err?.message ?? err) });
    return null;
  }
}

/**
 * Ponto de entrada: recebe o texto bruto de uma dica de morador e devolve
 * o julgamento editorial da IA — ou null se todos os provedores falharam
 * tecnicamente (erro de rede/parse, não confundir com "suficiente: false",
 * que é uma decisão editorial válida).
 */
export async function julgarDicaBairro(mensagem: string, temMidia: boolean): Promise<ResultadoDicaIA | null> {
  const prompt = promptPesquisadorBairro({ mensagem, temMidia });

  let resultado: ResultadoDicaIA | null = null;

  if (estaDisponivel("claude")) {
    resultado = await tentarClaude(prompt);
  }
  if (!resultado && estaDisponivel("gemini")) {
    resultado = await tentarGemini(prompt);
  }
  if (!resultado && estaDisponivel("groq")) {
    resultado = await tentarGroq(prompt);
  }

  return resultado;
}
