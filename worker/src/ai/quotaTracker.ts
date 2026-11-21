import { log } from "../logger.js";

/**
 * Memória de curto prazo de quais provedores de IA estão "sem fôlego" agora
 * (bateram cota/limite recentemente). Isso resolve um problema real: hoje o
 * pipeline sempre tenta Gemini primeiro pra TODO item, mesmo sabendo (pelos
 * últimos minutos) que ele já falhou várias vezes seguidas por cota — cada
 * tentativa perdida custa uma chamada de rede e alguns segundos, e empurra
 * praticamente todo o volume pro Claude.
 *
 * Com isso, assim que um provedor erra por cota, ele fica marcado como
 * indisponível por um tempo (cooldown) e o pipeline já pula direto pro
 * próximo da fila, sem gastar tentativa com quem a gente já sabe que vai
 * falhar. Puramente em memória — reinicia a cada deploy/restart do worker,
 * o que é o comportamento certo (nunca queremos "lembrar" de uma cota de
 * ontem).
 */

export type Provedor = "ollama" | "gemini" | "claude" | "groq" | "openrouter" | "mistral" | "cohere";

interface Estado {
  indisponivelAte: number;
  motivo: string;
}

const estado = new Map<Provedor, Estado>();

// Nenhum provedor expõe o horário exato em que a cota reseta, então usamos
// uma espera conservadora antes de tentar de novo — tempo suficiente pra não
// insistir à toa, mas curto o bastante pra não deixar o provedor "parado"
// o dia inteiro se o erro foi só um pico passageiro (rate limit) e não a
// cota diária de fato.
const COOLDOWN_PADRAO_MS = 20 * 60 * 1000; // 20 minutos

const PADROES_ERRO_DE_COTA = [
  /quota/i,
  /rate.?limit/i,
  /resource_exhausted/i,
  /too many requests/i,
  /overloaded/i,
  /\b429\b/,
];

/** Reconhece, pelo texto/status do erro, se foi cota/limite — e não outro tipo de falha (ex.: JSON inválido). */
export function pareceErroDeCota(erro: unknown): boolean {
  const status = (erro as any)?.status ?? (erro as any)?.statusCode;
  if (status === 429) return true;
  const texto = String((erro as any)?.message ?? erro ?? "");
  return PADROES_ERRO_DE_COTA.some((padrao) => padrao.test(texto));
}

export function estaDisponivel(provedor: Provedor): boolean {
  const e = estado.get(provedor);
  return !e || Date.now() >= e.indisponivelAte;
}

export async function marcarIndisponivel(
  provedor: Provedor,
  motivo: string,
  cooldownMs: number = COOLDOWN_PADRAO_MS
): Promise<void> {
  const jaEstava = estado.has(provedor) && !estaDisponivel(provedor);
  estado.set(provedor, { indisponivelAte: Date.now() + cooldownMs, motivo });
  if (!jaEstava) {
    await log("info", "quota", `${provedor} sem fôlego — pulando ele por ${Math.round(cooldownMs / 60000)}min`, { motivo });
  }
}

/** Pra exibir no painel do administrador (item 22 do plano) — nunca pro público. */
export function statusProvedores(): Array<{ provedor: Provedor; disponivel: boolean; voltaEmSegundos: number | null }> {
  const agora = Date.now();
  return (Array.from(estado.keys()) as Provedor[]).map((provedor) => {
    const e = estado.get(provedor)!;
    const disponivel = agora >= e.indisponivelAte;
    return { provedor, disponivel, voltaEmSegundos: disponivel ? null : Math.round((e.indisponivelAte - agora) / 1000) };
  });
}
