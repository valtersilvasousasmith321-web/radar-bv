import { log } from "./logger.js";
import { executarPulsoJornalistico } from "./scheduler.js";
import { publicarNoticiasAgendadas } from "./queue.js";

/**
 * Gatilho manual de teste — dispara um pulso jornalístico completo
 * (coleta + IA + agendamento de publicação) na hora, sem esperar o
 * próximo horário do Cron Dinâmico. Útil pra testar se tudo está
 * funcionando de ponta a ponta. Roda uma vez e encerra o processo.
 */
async function main(): Promise<void> {
  await log("info", "teste-manual", "Disparando pulso jornalístico manual de teste...");
  await executarPulsoJornalistico("teste-manual");
  // Publica imediatamente qualquer item que tenha caído na fila de
  // gotejamento, em vez de esperar o cron de 1 em 1 minuto.
  await publicarNoticiasAgendadas();
  await log("info", "teste-manual", "Teste manual concluído. Confira o site e os logs acima.");
  process.exit(0);
}

main().catch(async (err) => {
  console.error("Falha no teste manual:", err);
  await log("critico", "teste-manual", "Falha no teste manual", { erro: String(err?.message ?? err) });
  process.exit(1);
});
