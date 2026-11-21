import { supabase } from "../db.js";
import { log } from "../logger.js";
import { statusProvedores } from "./quotaTracker.js";

/**
 * Gerência/RH geral (item 12 do plano) — "supervisiona o desempenho de
 * toda a equipe de IAs, redistribui carga, mantém o sistema autossuficiente
 * (o servidor é um notebook rodando sozinho em casa, sem ninguém vigiando
 * 24h)."
 *
 * A redistribuição de carga (cooldown adaptativo por provedor) já vive no
 * quotaTracker.ts. Esta função é a supervisão periódica: olha pra trás (a
 * última hora) e avisa, de forma clara no log, se a bancada inteira de IA
 * parou de resolver itens — o sintoma mais sério possível, já que sem
 * nenhuma IA disponível o jornal para de publicar sozinho.
 *
 * Só loga quando há algo a reportar (falha sistêmica ou provedor parado há
 * muito tempo) — rodar em silêncio quando está tudo bem, pra não poluir o
 * log com "está tudo ok" a cada ciclo.
 */
export async function supervisionarEquipe(): Promise<void> {
  const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from("logs_sistema")
    .select("id", { count: "exact", head: true })
    .eq("nivel", "critico")
    .eq("origem", "pipeline")
    .gte("criado_em", desde);

  if (error) {
    await log("warning", "gerencia", "Falha ao consultar logs pra supervisão da equipe de IA", { erro: error.message });
    return;
  }

  const totalFalhas = count ?? 0;

  const provedores = statusProvedores();
  const indisponiveis = provedores.filter((p) => !p.disponivel);

  const LIMITE_FALHAS_CRITICAS = 3;

  if (totalFalhas >= LIMITE_FALHAS_CRITICAS) {
    await log(
      "critico",
      "gerencia",
      `A bancada de IA falhou em resolver ${totalFalhas} item(ns) na última hora — pode estar sem nenhum provedor com fôlego`,
      {
        totalFalhasUltimaHora: totalFalhas,
        provedoresSemFolego: indisponiveis.map((p) => ({ provedor: p.provedor, voltaEmSegundos: p.voltaEmSegundos })),
      },
    );
    return;
  }

  // Mesmo sem falha sistêmica, avisa se algum provedor está escalado num
  // cooldown bem longo (sinal de que a cota diária dele provavelmente não
  // vai voltar tão cedo) — só informativo, pra aparecer no painel futuro.
  const comCooldownLongo = indisponiveis.filter((p) => (p.voltaEmSegundos ?? 0) > 45 * 60);
  if (comCooldownLongo.length > 0) {
    await log("info", "gerencia", "Provedor(es) de IA com cooldown escalado (provável cota diária esgotada)", {
      provedores: comCooldownLongo.map((p) => ({ provedor: p.provedor, voltaEmSegundos: p.voltaEmSegundos })),
    });
  }
}
