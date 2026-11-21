import { log } from "./logger.js";

/**
 * Consertador/Vigia (item 13 do plano — Serviços Gerais) — "observa falha
 * (processo travado, conexão caída, cron que não disparou) e conserta
 * sozinho, sem intervenção manual."
 *
 * Substitui as travas simples (booleanos soltos tipo `pulsoEmExecucao`)
 * espalhadas pelo scheduler/queue/dicas por uma versão monitorada: registra
 * DESDE QUANDO cada trava está presa. Se uma trava ficar presa além do
 * razoável — sinal de que um erro inesperado escapou do try/catch no meio
 * da execução e nunca chegou a liberar a trava — o Vigia destrava sozinho
 * no próximo ciclo de checagem, sem precisar reiniciar o worker na mão.
 *
 * (A parte "conexão caída" já é coberta pelo Supabase client, que tenta de
 * novo sozinho, e pelo PM2, que reinicia o processo inteiro se ele cair de
 * vez — aqui o Vigia cobre especificamente o caso que nem o PM2 pega:
 * processo vivo mas com uma trava interna travada pra sempre.)
 */
interface Trava {
  presa: boolean;
  desde: number | null;
}

const travas = new Map<string, Trava>();
const TIMEOUT_PADRAO_MS = 15 * 60 * 1000; // 15 minutos

/** Tenta adquirir a trava; retorna false se já está presa (mesmo uso de um boolean simples de antes). */
export function tentarAdquirirTrava(nome: string): boolean {
  const atual = travas.get(nome);
  if (atual?.presa) return false;
  travas.set(nome, { presa: true, desde: Date.now() });
  return true;
}

/** Libera a trava — chamar sempre no `finally` de quem adquiriu. */
export function liberarTrava(nome: string): void {
  travas.set(nome, { presa: false, desde: null });
}

/**
 * Roda periodicamente (scheduler): procura travas presas há mais tempo
 * que o razoável e destrava sozinho, registrando a correção no log. Essa
 * é a autossuficiência real pedida no item 13 — o notebook roda sozinho em
 * casa, sem ninguém vigiando 24h, e o sistema precisa se desempacar
 * sozinho se algo travar no meio do caminho.
 */
export async function verificarTravasPresas(): Promise<void> {
  const agora = Date.now();
  for (const [nome, trava] of travas.entries()) {
    if (trava.presa && trava.desde !== null && agora - trava.desde > TIMEOUT_PADRAO_MS) {
      travas.set(nome, { presa: false, desde: null });
      await log(
        "critico",
        "consertador",
        `Trava "${nome}" estava presa há mais de ${Math.round(TIMEOUT_PADRAO_MS / 60000)}min — destravada automaticamente`,
        { presaDesde: new Date(trava.desde).toISOString() },
      );
    }
  }
}
