import { config } from "../config.js";
import { log } from "../logger.js";
import { perguntar, jaInformouHoje } from "../relatorios.js";

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

  await avisarSeApagaoTotal();
}

/** Todo provedor de nuvem com chave configurada (Ollama fica de fora: é local, não tem cota pra esgotar). */
const CHAVE_CONFIGURADA: Partial<Record<Provedor, boolean>> = {
  gemini: true, // obrigatória (config.ts falha no boot sem ela)
  claude: true, // obrigatória
  groq: !!config.ia.groqApiKey,
  openrouter: !!config.ia.openrouterApiKey,
  mistral: !!config.ia.mistralApiKey,
  cohere: !!config.ia.cohereApiKey,
};

/**
 * Lista dinâmica: só entra na checagem de apagão quem de fato está na
 * bancada (tem chave configurada) — senão o Mistral/Cohere sem chave ainda
 * (nunca marcados "sem fôlego" porque nunca chegam a tentar) ficariam pra
 * sempre contando como "disponíveis", e o apagão nunca seria detectado
 * mesmo com Gemini/Claude/Groq/OpenRouter todos fora do ar.
 */
function provedoresCloudAtivos(): Provedor[] {
  return (Object.keys(CHAVE_CONFIGURADA) as Provedor[]).filter((p) => CHAVE_CONFIGURADA[p]);
}

/**
 * Central de Transparência (item 22): o cenário que realmente merece uma
 * pergunta pro Valter não é "um provedor ficou sem fôlego" (isso é rotina,
 * o fallback em cascata já resolve sozinho) — é todos os provedores de
 * nuvem configurados ficarem indisponíveis AO MESMO TEMPO, porque aí o
 * Radar BV para de produzir matéria nova até algum voltar. Um aviso por dia
 * é suficiente pra não repetir a cada item descartado enquanto durar o apagão.
 */
async function avisarSeApagaoTotal(): Promise<void> {
  const ativos = provedoresCloudAtivos();
  const todosIndisponiveis = ativos.length > 0 && ativos.every((p) => !estaDisponivel(p));
  if (!todosIndisponiveis) return;

  const marcador = `apagao-total-${new Date().toISOString().slice(0, 10)}`;
  if (await jaInformouHoje("Supervisor de Provedores de IA", marcador)) return;

  const faltandoChave = (["mistral", "cohere"] as Provedor[]).filter((p) => !CHAVE_CONFIGURADA[p]);
  const sugestao =
    faltandoChave.length > 0
      ? ` Vale a pena criar a(s) conta(s) de ${faltandoChave.join(" e ")} (ainda sem chave configurada) pra ampliar a bancada e isso não se repetir.`
      : "";

  await perguntar(
    "Supervisor de Provedores de IA",
    `Todos os provedores de IA de nuvem configurados (${ativos.join(", ")}) estão sem fôlego ao mesmo tempo agora — o Radar BV vai parar de produzir matéria nova até algum deles voltar.${sugestao}`,
    { provedoresAtivos: ativos, faltandoChave, marcador }
  );
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
