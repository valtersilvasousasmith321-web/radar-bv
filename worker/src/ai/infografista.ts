import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { config } from "../config.js";
import { log } from "../logger.js";
import { estaDisponivel, marcarIndisponivel, pareceErroDeCota } from "./quotaTracker.js";
import type { MateriaRedigida } from "../types.js";

/**
 * Infografista (item 18 do plano — "Infografia/visualização de dados").
 *
 * Diferente da Charge (item 7, humor/ilustração) e do Editor de Imagens
 * (item 8, foto real compatível), este módulo serve pra explicar visualmente
 * uma notícia que tem dado numérico ou sequência de eventos no meio do
 * texto — ex.: "evolução de casos de dengue", "votos por candidato",
 * "linha do tempo do caso". A maioria das matérias NÃO tem esse tipo de
 * conteúdo, e está tudo bem: só vira infográfico quando realmente ajuda a
 * entender a notícia (reforça o princípio: robô/IA decide o objetivo e
 * barato, não força todo mundo a ter gráfico).
 *
 * Blindagem anti-alucinação igual ao Verificador de Fatos (item 10): todo
 * número/data extraído tem que estar literalmente nos tópicos apurados ou
 * no corpo da matéria — nunca inventado ou estimado pela IA.
 */

export type TipoInfografico = "barra" | "linha" | "linha_do_tempo";

export interface EventoLinhaDoTempo {
  data: string;
  titulo: string;
}

export interface InfograficoDados {
  tipo: TipoInfografico;
  titulo: string;
  /** Pra tipo "barra" e "linha": uma categoria por valor (ex.: meses, bairros, candidatos) */
  categorias?: string[];
  valores?: number[];
  unidade?: string;
  /** Pra tipo "linha_do_tempo": sequência de eventos datados, em ordem cronológica */
  eventos?: EventoLinhaDoTempo[];
  /** De onde vieram os números/datas (citado na própria matéria) */
  fonteDados: string;
}

interface RespostaIA {
  temInfografico: boolean;
  dados?: InfograficoDados;
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

function montarPrompt(materia: MateriaRedigida, topicosApurados: string[]): string {
  return `Você é o Infografista do Radar BV, portal de notícias de Boa Vista/Roraima. Seu trabalho é decidir se esta matéria tem dado numérico comparável (estatística, contagem, valor em R$) ou uma sequência de eventos datados que merece virar um infográfico simples — e, se merecer, extrair os dados EXATOS pra desenhar.

REGRA MAIS IMPORTANTE: só use número ou data que esteja LITERALMENTE escrito nos tópicos apurados ou no corpo da matéria abaixo. Nunca invente, estime ou arredonde um valor que não apareça no texto. Se não houver pelo menos 3 valores numéricos comparáveis (pra gráfico de barra/linha) OU pelo menos 2 eventos com data clara (pra linha do tempo), responda que NÃO tem infográfico — a maioria das notícias não tem, e está certo ser assim.

TÓPICOS APURADOS:
${topicosApurados.length > 0 ? topicosApurados.map((t, i) => `${i + 1}. ${t}`).join("\n") : "(nenhum tópico estruturado disponível — use só o corpo da matéria)"}

MATÉRIA:
Título: ${materia.titulo}
Subtítulo: ${materia.subtitulo}
Corpo: ${materia.conteudo}

Responda SOMENTE com um JSON válido, sem comentários, sem markdown.

Se NÃO houver dado suficiente:
{"temInfografico": false}

Se houver dado numérico comparável (gráfico de barra ou linha — escolha "linha" só se for evolução ao longo do tempo, senão "barra"):
{"temInfografico": true, "dados": {"tipo": "barra ou linha", "titulo": "título curto do gráfico", "categorias": ["categoria1", "categoria2", ...], "valores": [numero1, numero2, ...], "unidade": "ex: casos, R$, %, vagas (ou vazio)", "fonteDados": "de onde vem o dado, como citado na matéria (ex: Secretaria de Saúde de Roraima)"}}

Se houver sequência de eventos datados (linha do tempo):
{"temInfografico": true, "dados": {"tipo": "linha_do_tempo", "titulo": "título curto da linha do tempo", "eventos": [{"data": "ex: 10/11 ou 2026", "titulo": "o que aconteceu, bem curto"}, ...], "fonteDados": "de onde vem, como citado na matéria"}}`;
}

const groq = config.ia.groqApiKey ? new Groq({ apiKey: config.ia.groqApiKey }) : null;
const genAI = new GoogleGenerativeAI(config.ia.geminiApiKey);
const anthropic = new Anthropic({ apiKey: config.ia.anthropicApiKey });

async function perguntarGroq(prompt: string): Promise<RespostaIA | null> {
  if (!groq) return null;
  try {
    const resposta = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    });
    const texto = resposta.choices[0]?.message?.content ?? "";
    if (!texto.trim()) return null;
    return extrairJson<RespostaIA>(texto);
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("groq", String(err?.message ?? err));
    await log("warning", "infografista", "Falha ao avaliar infográfico (Groq)", { erro: String(err?.message ?? err) });
    return null;
  }
}

async function perguntarGemini(prompt: string): Promise<RespostaIA | null> {
  try {
    const modelo = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    const resultado = await modelo.generateContent(prompt);
    const texto = resultado.response.text();
    if (!texto.trim()) return null;
    return extrairJson<RespostaIA>(texto);
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("gemini", String(err?.message ?? err));
    await log("warning", "infografista", "Falha ao avaliar infográfico (Gemini)", { erro: String(err?.message ?? err) });
    return null;
  }
}

async function perguntarClaude(prompt: string): Promise<RespostaIA | null> {
  try {
    const resposta = await anthropic.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 600,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: prompt }],
    } as any);
    const bloco = resposta.content.find((b: any) => b.type === "text");
    const texto = bloco && (bloco as any).type === "text" ? (bloco as any).text : "";
    if (!texto.trim()) return null;
    return extrairJson<RespostaIA>(texto);
  } catch (err: any) {
    if (pareceErroDeCota(err)) await marcarIndisponivel("claude", String(err?.message ?? err));
    await log("warning", "infografista", "Falha ao avaliar infográfico (Claude)", { erro: String(err?.message ?? err) });
    return null;
  }
}

function validar(dados: InfograficoDados | undefined): dados is InfograficoDados {
  if (!dados) return false;
  if (dados.tipo === "linha_do_tempo") {
    return Array.isArray(dados.eventos) && dados.eventos.length >= 2 && dados.eventos.every((e) => e.data && e.titulo);
  }
  if (dados.tipo === "barra" || dados.tipo === "linha") {
    return (
      Array.isArray(dados.categorias) &&
      Array.isArray(dados.valores) &&
      dados.categorias.length >= 3 &&
      dados.categorias.length === dados.valores.length &&
      dados.valores.every((v) => typeof v === "number" && Number.isFinite(v))
    );
  }
  return false;
}

/**
 * Decide se a matéria merece infográfico e, se sim, retorna os dados já
 * validados pra desenhar. Falha segura: se todas as IAs falharem ou o
 * resultado vier malformado, não bloqueia a publicação — só não gera
 * infográfico pra essa matéria (igual a maioria não deveria ter mesmo).
 */
export async function avaliarInfografico(
  materia: MateriaRedigida,
  topicosApurados: string[],
): Promise<InfograficoDados | null> {
  const prompt = montarPrompt(materia, topicosApurados);

  let resultado: RespostaIA | null = null;
  if (estaDisponivel("groq")) resultado = await perguntarGroq(prompt);
  if (!resultado && estaDisponivel("gemini")) resultado = await perguntarGemini(prompt);
  if (!resultado && estaDisponivel("claude")) resultado = await perguntarClaude(prompt);

  if (!resultado) {
    await log("info", "infografista", "Infografista indisponível neste ciclo — matéria publicada sem infográfico", {
      titulo: materia.titulo,
    });
    return null;
  }

  if (!resultado.temInfografico) return null;

  if (!validar(resultado.dados)) {
    await log("warning", "infografista", "IA sinalizou infográfico mas os dados vieram incompletos/inválidos — descartado", {
      titulo: materia.titulo,
      dados: resultado.dados,
    });
    return null;
  }

  await log("info", "infografista", `Infográfico gerado (${resultado.dados.tipo})`, { titulo: materia.titulo });
  return resultado.dados;
}
