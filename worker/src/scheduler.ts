import cron from "node-cron";
import { log } from "./logger.js";
import { executarCicloDeColeta } from "./collector.js";
import { processarItem } from "./ai/pipeline.js";
import { agendarPublicacao, publicarNoticiasAgendadas } from "./queue.js";
import { executarResumoDiario } from "./resumoDiario.js";
import { processarDicasPendentes } from "./dicas.js";

/**
 * Trava de execução única (mutex em memória). Evita que dois pulsos
 * jornalísticos corram ao mesmo tempo — cenário que, sem essa trava,
 * acontecia por um bug real encontrado na auditoria: dois cron jobs
 * disparando no mesmo minuto (ver histórico abaixo) podiam coletar o
 * MESMO item inédito em paralelo antes que a Trava de Silêncio tivesse
 * chance de gravar o hash no banco, gastando tokens em duplicidade e
 * podendo publicar a mesma notícia duas vezes.
 */
let pulsoEmExecucao = false;

export async function executarPulsoJornalistico(origem: string): Promise<void> {
  if (pulsoEmExecucao) {
    await log("warning", "scheduler", `Pulso (${origem}) ignorado — já há um pulso em execução`);
    return;
  }
  pulsoEmExecucao = true;

  try {
    await log("info", "scheduler", `Iniciando pulso jornalístico (${origem})`);

    const itensInéditos = await executarCicloDeColeta();
    if (itensInéditos.length === 0) {
      await log("info", "scheduler", "Nenhum item inédito neste pulso");
      return;
    }

    // Itens processados em série (não em paralelo) para não estourar rate
    // limit das APIs de IA gratuitas/baratas.
    for (const item of itensInéditos) {
      try {
        const resultado = await processarItem(item);
        if (resultado) {
          await agendarPublicacao(resultado, item.fonteId, item.hash);
        }
      } catch (err: any) {
        // Isolamento também no nível do item: um erro inesperado em 1 item
        // não interrompe o processamento dos demais itens do ciclo.
        await log("error", "scheduler", "Erro inesperado ao processar item — pulando para o próximo", {
          url: item.url,
          erro: String(err?.message ?? err),
        });
      }
    }

    await log("info", "scheduler", `Pulso jornalístico (${origem}) concluído: ${itensInéditos.length} itens processados`);
  } finally {
    pulsoEmExecucao = false;
  }
}

/**
 * Gera a lista exata de horários "HH:MM" entre `inicioMin` e `fimMin`
 * (minutos desde 00:00), avançando de `passoMin` em `passoMin` a partir
 * de `inicioMin`. Determinístico — nada de módulo rodando a cada tick.
 */
function gerarHorarios(inicioMin: number, fimMin: number, passoMin: number): string[] {
  const horarios: string[] = [];
  for (let m = inicioMin; m <= fimMin; m += passoMin) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    horarios.push(`${min} ${h} * * *`);
  }
  return horarios;
}

/**
 * Cron Dinâmico (Regra de Ouro — item 1):
 * - a cada 45 min entre 07h00 e 18h30
 * - a cada 1h30 entre 18h31 e 23h00
 * - 1 única vez às 05h30 da madrugada
 *
 * IMPORTANTE (correção de auditoria): a primeira versão deste scheduler
 * usava dois cron jobs sobrepostos pra tentar cobrir a janela diurna (um
 * disparando nos minutos 0 e 45 de cada hora, outro a cada quarto de hora
 * com checagem de módulo). Isso fazia o pulso disparar em dobro em vários
 * horários (ex: 7:00, 7:45) e disparar pulsos extras fora da cadência
 * pedida (ex: 8:00, 8:45, 9:00). A correção abaixo gera os horários
 * exatos uma única vez — sem módulo, sem sobreposição — e cada horário
 * tem exatamente 1 cron job.
 */
export function iniciarCronDinamico(): void {
  const TZ = process.env.TZ ?? "America/Boa_Vista";

  // Pulso diurno: 07:00 até 18:30 (inclusive), de 45 em 45 min.
  // Resultado: 07:00, 07:45, 08:30, 09:15, 10:00, 10:45, 11:30, 12:15,
  //            13:00, 13:45, 14:30, 15:15, 16:00, 16:45, 17:30, 18:15
  const horariosDiurnos = gerarHorarios(7 * 60, 18 * 60 + 30, 45);
  for (const horario of horariosDiurnos) {
    cron.schedule(horario, () => executarPulsoJornalistico("diurno-45min"), { timezone: TZ });
  }

  // Pulso noturno: a cada 1h30 entre 18h31 e 23h00 -> 18:45, 20:15, 21:45, 23:00
  for (const horario of ["45 18 * * *", "15 20 * * *", "45 21 * * *", "0 23 * * *"]) {
    cron.schedule(horario, () => executarPulsoJornalistico("noturno-1h30"), { timezone: TZ });
  }

  // Pulso único da madrugada: 05h30
  cron.schedule("30 5 * * *", () => executarPulsoJornalistico("madrugada-05h30"), { timezone: TZ });

  // Fila de Gotejamento: verifica a cada 1 minuto se há notícia agendada
  // para publicar agora. Operação leve, sem custo de IA.
  cron.schedule("* * * * *", () => publicarNoticiasAgendadas(), { timezone: TZ });

  // Resumo diário (Fase 3 — Automação WhatsApp): 1x por dia, às 08h00,
  // consolida as notícias das últimas 24h num único disparo pros destinos
  // marcados como `resumo_diario = true`. Dedupe por dia fica a cargo do
  // Supabase (constraint unique), então mesmo com restart não duplica.
  cron.schedule("0 8 * * *", () => executarResumoDiario(), { timezone: TZ });

  // Pesquisadores por área, frente B (item 3 — Denúncias/dicas via WhatsApp):
  // a cada 15 minutos, tenta transformar dicas pendentes de moradores em
  // rascunho de notícia. Não precisa ser tão frequente quanto a Fila de
  // Gotejamento — dica de morador não é "ao vivo" como uma matéria agendada,
  // e sempre vai pra revisão humana antes de qualquer publicação.
  cron.schedule("*/15 * * * *", () => processarDicasPendentes(), { timezone: TZ });

  log("info", "scheduler", "Cron Dinâmico iniciado com sucesso", {
    timezone: TZ,
    horariosDiurnos: horariosDiurnos.length,
  });
}
