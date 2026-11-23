import { supabase } from "./db.js";
import { log } from "./logger.js";

/**
 * Central de Transparência (item 22 do plano) — canal pelo qual cada área da
 * redação de IA fala diretamente com o Valter, em português simples, sem
 * precisar que ele abra o Supabase ou leia logs técnicos. Duas formas:
 *
 *   - informar(): um relato — "isso aconteceu, você não precisa fazer nada".
 *   - perguntar(): além de informar, sinaliza que a área gostaria de uma
 *     opinião/decisão dele; aparece destacado no painel até ele responder.
 *
 * Segue a mesma filosofia fail-open do resto do sistema: nunca lança
 * exceção, nunca atrasa nem derruba o pipeline por causa disto. Se a
 * gravação falhar, só avisa no console — a notícia nunca para por causa de
 * um relatório que não foi salvo.
 */

export type PapelRedacao =
  | "Editor-chefe"
  | "Editor de Imagens"
  | "Supervisor de Provedores de IA"
  | "RH/Supervisão da Equipe de IA"
  | "Analista de Desempenho";

async function registrar(
  papel: PapelRedacao,
  tipo: "informe" | "pergunta",
  mensagem: string,
  detalhes?: Record<string, unknown>
): Promise<void> {
  try {
    const { error } = await supabase.from("relatorios_redacao").insert({
      papel,
      tipo,
      mensagem,
      detalhes: detalhes ?? null,
    });
    if (error) throw error;
  } catch (err) {
    // Nunca propaga pro pipeline — um relatório perdido não pode derrubar
    // a produção de notícias (mesma regra do logger.ts).
    console.error(`[relatorios] falha ao registrar relato de ${papel}:`, err);
  }
}

export async function informar(papel: PapelRedacao, mensagem: string, detalhes?: Record<string, unknown>): Promise<void> {
  await registrar(papel, "informe", mensagem, detalhes);
}

export async function perguntar(papel: PapelRedacao, mensagem: string, detalhes?: Record<string, unknown>): Promise<void> {
  await registrar(papel, "pergunta", mensagem, detalhes);
  await log("warning", "relatorios", `${papel} pediu a opinião do Valter: ${mensagem}`, detalhes);
}

/**
 * Dedup diário simples: evita que um relato (ex.: o resumo diário do
 * Editor-chefe) seja gravado mais de uma vez no mesmo dia, mesmo se o
 * worker reiniciar ou o cron disparar 2x. Identifica o relato do dia por
 * uma marca própria em `detalhes.marcador`.
 */
export async function jaInformouHoje(papel: PapelRedacao, marcador: string): Promise<boolean> {
  try {
    const inicioDoDia = new Date();
    inicioDoDia.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from("relatorios_redacao")
      .select("id, detalhes")
      .eq("papel", papel)
      .gte("criado_em", inicioDoDia.toISOString())
      .limit(50);

    if (error) throw error;
    return (data ?? []).some((r: any) => r?.detalhes?.marcador === marcador);
  } catch (err) {
    console.error(`[relatorios] falha ao checar dedup diário de ${papel}:`, err);
    // Em caso de falha na checagem, prefere arriscar duplicar (raro) a
    // nunca mais mandar o resumo diário por um erro transitório de leitura.
    return false;
  }
}
