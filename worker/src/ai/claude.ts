import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { log } from "../logger.js";
import { promptRedacaoChefe, promptTriagemGemini } from "./prompts.js";
import type { Editoria, ItemBruto, MateriaRedigida, ResumoGemini } from "../types.js";

const anthropic = new Anthropic({ apiKey: config.ia.anthropicApiKey });

function extrairJson<T>(texto: string): T {
  const limpo = texto.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(limpo) as T;
  } catch {
    // Claude às vezes devolve texto antes/depois do JSON ("Aqui está:\n{...}")
    // ou a resposta vem vazia/cortada — tenta extrair só o bloco {...} antes de desistir.
    const match = limpo.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Resposta vazia ou sem JSON reconhecível: "${limpo.slice(0, 200)}"`);
    return JSON.parse(match[0]) as T;
  }
}

/**
 * Fallback de TRIAGEM via Claude, usado quando o Gemini falha ou estoura a
 * cota diária do free tier (erro 429) antes mesmo de chegar à redação —
 * sem isso, um dia de cota do Gemini esgotada travava o jornal inteiro,
 * já que nenhum item passava da triagem pra cascata de redação (Regra de
 * Ouro — item 5, Fallback de IA, agora cobrindo também a etapa 2).
 */
export async function triarComClaude(item: ItemBruto): Promise<ResumoGemini | null> {
  try {
    const prompt = promptTriagemGemini({
      tituloOriginal: item.tituloOriginal,
      conteudoBruto: item.conteudoBruto,
      editoriaPadrao: item.editoriaPadrao,
    });

    const resposta = await anthropic.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 1500,
      // O Haiku 5.5 "pensa" (thinking) por padrão em todo pedido, e esse
      // pensamento consome do MESMO limite de max_tokens da resposta final —
      // em notícias mais complexas, o pensamento comia o espaço e cortava o
      // JSON no meio. "effort: low" reduz esse pensamento ao mínimo, e o
      // max_tokens maior dá uma margem de segurança extra.
      output_config: { effort: "low" },
      messages: [{ role: "user", content: prompt }],
    } as any);

    // Em prompts mais longos o Haiku às vezes devolve um bloco de "thinking"
    // (vazio/oculto) ANTES do bloco de texto — nunca assumir que é o [0].
    const bloco = resposta.content.find((b) => b.type === "text");
    const texto = bloco && bloco.type === "text" ? bloco.text : "";
    const json = extrairJson<ResumoGemini>(texto);

    if (!json.topicos || json.topicos.length === 0) {
      await log("info", "claude", "Triagem (fallback) sem tópicos aproveitáveis", { url: item.url });
      return null;
    }
    return json;
  } catch (err: any) {
    await log("error", "claude", "Falha na triagem de fallback do Claude", { url: item.url, erro: String(err?.message ?? err) });
    return null;
  }
}

/**
 * 3. Redação-Chefe e Revisão (Claude API / Fluxo Enxuto).
 * Recebe APENAS os tópicos já mastigados pelo Gemini — nunca o HTML bruto —
 * para gastar o mínimo possível de tokens. Usa um modelo econômico (Haiku)
 * por padrão; pode ser trocado por Sonnet caso se queira mais qualidade
 * de redação em troca de custo maior.
 *
 * Lança erro em caso de falha/limite de cota — o chamador (pipeline.ts)
 * é responsável por capturar e acionar o fallback.
 */
export async function redigirComClaude(params: {
  topicos: string[];
  fonteNome: string;
  fonteUrl: string;
  editoriaSugerida: Editoria;
}): Promise<MateriaRedigida | null> {
  const prompt = promptRedacaoChefe(params);

  const resposta = await anthropic.messages.create({
    model: "claude-haiku-5-5",
    max_tokens: 2000,
    // Mesmo motivo da triagem: reduz o "pensamento" interno que disputava
    // espaço com o texto final da matéria redigida.
    output_config: { effort: "low" },
    messages: [{ role: "user", content: prompt }],
  } as any);

  // Mesmo cuidado da triagem: o Haiku pode devolver um bloco de "thinking"
  // antes do bloco de texto em prompts mais longos como este.
  const bloco = resposta.content.find((b) => b.type === "text");
  const texto = bloco && bloco.type === "text" ? bloco.text : "";
  const json = extrairJson<any>(texto);

  if (json.insuficiente) {
    await log("info", "claude", "Tópicos insuficientes para redigir matéria", { fonte: params.fonteNome });
    return null;
  }
  return json as MateriaRedigida;
}
