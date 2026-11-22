import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { config } from "../config.js";
import { log } from "../logger.js";
import { estaDisponivel, marcarIndisponivel, pareceErroDeCota } from "./quotaTracker.js";
import type { MateriaRedigida } from "../types.js";

/**
 * Jurídico/Compliance Editorial (item 20 do plano — marcado como
 * PRIORITÁRIO) — "camada de proteção jurídica específica pra notícia
 * sensível: não expor menor, usar 'indiciado/suspeito' em vez de 'culpado'
 * antes de condenação, evitar linguagem que vire processo por difamação."
 *
 * Diferente do Revisor (item 9, que cuida de sentido/tom/erro de texto) e
 * do Verificador de Fatos (item 10, que cuida de alucinação da própria IA):
 * este módulo cuida especificamente de RISCO JURÍDICO — mesmo uma matéria
 * bem escrita e fiel aos fatos apurados pode expor o Radar BV a processo se
 * tratar como culpado alguém ainda não condenado, ou expuser a identidade
 * de um menor envolvido em caso sensível.
 */

export interface ResultadoJuridico {
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

function montarPrompt(materia: MateriaRedigida): string {
  return `Você é o setor Jurídico/Compliance Editorial do Radar BV, portal de notícias de Boa Vista/Roraima. Seu único trabalho é checar RISCO JURÍDICO nesta matéria antes de publicar — não é revisão de texto nem checagem de fato, é proteção legal do veículo.

Cheque EXATAMENTE estes 3 pontos:

1. EXPOSIÇÃO DE MENOR: a matéria identifica (nome completo, apelido que o identifique, foto, ou combinação de detalhes que torne reconhecível) uma criança ou adolescente (menor de 18 anos) envolvido em crime (como suspeito, infrator ou vítima), em situação vexatória, ou em contexto de saúde/abuso? Mencionar a idade ou dizer "um adolescente" sem identificar NÃO é problema — o problema é tornar a pessoa reconhecível.

2. PRESUNÇÃO DE INOCÊNCIA: antes de condenação/sentença confirmada, a matéria trata alguém como culpado de forma afirmativa (ex.: chamar de "ladrão", "estuprador", "assassino", "corrupto" como fato, em vez de "suspeito", "indiciado", "investigado", "réu")? Se os tópicos apurados já confirmam condenação/sentença, tratar como culpado está correto e NÃO é problema.

3. RISCO DE DIFAMAÇÃO: a matéria faz acusação grave contra uma pessoa ou empresa NOMEADA como fato estabelecido, sem atribuir a uma fonte/autoridade (ex.: "a prefeitura desviou dinheiro" em vez de "segundo o Ministério Público, a prefeitura teria desviado dinheiro")?

MATÉRIA:
Título: ${materia.titulo}
Subtítulo: ${materia.subtitulo}
Corpo: ${materia.conteudo}

Responda SOMENTE com um JSON válido, sem comentários, sem markdown, no formato exato:
{"aprovado": boolean, "motivo": "string curta explicando a decisão, citando qual dos 3 pontos falhou se houver problema"}

Só reprove (aprovado: false) se houver violação REAL e clara de um dos 3 pontos acima — não seja excessivamente exigente, a maioria das matérias não tem nenhum desses riscos.`;
}

const groq = config.ia.groqApiKey ? new Groq({ apiKey: config.ia.groqApiKey }) : null;
const genAI = new GoogleGenerativeAI(config.ia.geminiApiKey);
const anthropic = new Anthropic({ apiKey: config.ia.anthropicApiKey });

async function perguntarGroq(prompt: string): Promise<ResultadoJuridico | null> {
  if (!groq) return null;
  try {
    const resposta = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    });
    const texto = resposta.choices[0]?.message?.content ?? "";
    if (!texto.trim()) return null;
    return extrairJson<ResultadoJuridico>(texto);
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("groq", String(err?.message ?? err));
    await log("warning", "juridico", "Falha na checagem jurídica (Groq)", { erro: String(err?.message ?? err) });
    return null;
  }
}

async function perguntarGemini(prompt: string): Promise<ResultadoJuridico | null> {
  try {
    const modelo = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    const resultado = await modelo.generateContent(prompt);
    const texto = resultado.response.text();
    if (!texto.trim()) return null;
    return extrairJson<ResultadoJuridico>(texto);
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("gemini", String(err?.message ?? err));
    await log("warning", "juridico", "Falha na checagem jurídica (Gemini)", { erro: String(err?.message ?? err) });
    return null;
  }
}

async function perguntarClaude(prompt: string): Promise<ResultadoJuridico | null> {
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
    return extrairJson<ResultadoJuridico>(texto);
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("claude", String(err?.message ?? err));
    await log("warning", "juridico", "Falha na checagem jurídica (Claude)", { erro: String(err?.message ?? err) });
    return null;
  }
}

/**
 * Checa risco jurídico (exposição de menor, presunção de inocência,
 * difamação). Se todas as IAs falharem tecnicamente, aprova por padrão —
 * igual ao Revisor e ao Verificador de Fatos, é mais uma rede de segurança,
 * nunca pode travar a publicação sozinho por uma falha de rede/cota.
 */
export async function verificarCompliance(materia: MateriaRedigida): Promise<ResultadoJuridico> {
  const prompt = montarPrompt(materia);

  let resultado: ResultadoJuridico | null = null;
  if (estaDisponivel("groq")) resultado = await perguntarGroq(prompt);
  if (!resultado && estaDisponivel("gemini")) resultado = await perguntarGemini(prompt);
  if (!resultado && estaDisponivel("claude")) resultado = await perguntarClaude(prompt);

  if (!resultado) {
    await log("warning", "juridico", "Checagem jurídica indisponível em todos os provedores neste ciclo — aprovando por padrão", {
      titulo: materia.titulo,
    });
    return { aprovado: true, motivo: "Checagem jurídica indisponível neste ciclo — aprovada por padrão" };
  }

  return resultado;
}
