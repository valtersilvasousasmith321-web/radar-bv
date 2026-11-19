import { log } from "./logger.js";
import { iniciarCronDinamico } from "./scheduler.js";

/**
 * Entrypoint do Worker Radar BV.
 * Mantém o processo vivo (ex: rodando via PM2, Docker ou serviço systemd)
 * e deixa o Cron Dinâmico disparar os pulsos de coleta/redação/publicação.
 */
async function main(): Promise<void> {
  await log("info", "worker", "Worker Radar BV iniciando...");
  iniciarCronDinamico();
  await log("info", "worker", "Worker Radar BV em execução. Aguardando próximos pulsos do Cron Dinâmico.");
}

main().catch(async (err) => {
  console.error("Falha fatal ao iniciar o worker:", err);
  await log("critico", "worker", "Falha fatal ao iniciar o worker", { erro: String(err?.message ?? err) });
  process.exit(1);
});

process.on("unhandledRejection", async (reason) => {
  await log("error", "worker", "unhandledRejection capturado — worker continua rodando", { reason: String(reason) });
});

process.on("uncaughtException", async (err) => {
  await log("critico", "worker", "uncaughtException capturado — worker continua rodando", { erro: String(err?.message ?? err) });
});
