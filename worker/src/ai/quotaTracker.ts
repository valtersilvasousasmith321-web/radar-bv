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
  cooldownAtualMs: number;
  ultimaFalhaEm: number;
}

const estado = new Map<Provedor, Estado>();

// Nenhum provedor expõe o horário exato em que a cota reseta, então usamos
// uma espera conservadora antes de tentar de novo — tempo suficiente pra não
// insistir à toa, mas curto o bastante pra não deixar o provedor "parado"
// o dia inteiro se o erro foi só um pico passageiro (rate limit) e não a
// cota diária de fato.
const COOLDOWN_PADRAO_MS = 20 * 60 * 1000; // 20 minutos

// Gerência/RH geral (item 12) — redistribuição de carga adaptativa: se um
// provedor volta do cooldown e falha de novo quase na hora (sinal de que a
// cota diária ainda não resetou de verdade, não foi só um pico passageiro),
// dobra o tempo de espera da próxima vez, até um teto — em vez de ficar
// batendo nele a cada 20min o dia inteiro à toa.
const COOLDOWN_MAXIMO_MS = 2 * 60 * 60 * 1000; // 2 horas

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
  cooldownMsBase: number = COOLDOWN_PADRAO_MS
): Promise<void> {
  const agora = Date.now();
  const anterior = estado.get(provedor);
  const jaEstava = !!anterior && !estaDisponivel(provedor);

  // Se a última falha foi há pouco tempo (menos de 1.5x o cooldown anterior),
  // é sinal de que voltou e falhou de novo rapidinho — escalona. Senão,
  // passou tempo suficiente sem erro, volta pro cooldown base.
  const falhouDeNovoRapido = !!anterior && agora - anterior.ultimaFalhaEm < anterior.cooldownAtualMs * 1.5;
  const cooldownMs = falhouDeNovoRapido
    ? Math.min(anterior.cooldownAtualMs * 2, COOLDOWN_MAXIMO_MS)
    : cooldownMsBase;

  estado.set(provedor, {
    indisponivelAte: agora + cooldownMs,
    motivo,
    cooldownAtualMs: cooldownMs,
    ultimaFalhaEm: agora,
  });

  if (!jaEstava) {
    await log("info", "quota", `${provedor} sem fôlego — pulando ele por ${Math.round(cooldownMs / 60000)}min`, {
      motivo,
      escalonado: falhouDeNovoRapido,
    });
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
