import { supabase } from "../db.js";
import { log } from "../logger.js";
import { statusProvedores } from "./quotaTracker.js";
import { perguntar, informar, jaInformouHoje } from "../relatorios.js";

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

    // Central de Transparência (item 22): o apagão total já é avisado em
    // tempo real pelo quotaTracker — isto aqui é complementar, porque cobre
    // falha sistêmica mesmo quando NENHUM provedor está formalmente
    // marcado "sem fôlego" (ex.: erro de formato/conteúdo recorrente, não
    // cota). Dedup por hora pra não repetir a cada checagem enquanto durar.
    const marcadorHora = `falha-sistemica-${new Date().toISOString().slice(0, 13)}`;
    if (!(await jaInformouHoje("RH/Supervisão da Equipe de IA", marcadorHora))) {
      await perguntar(
        "RH/Supervisão da Equipe de IA",
        `A equipe de IA não conseguiu redigir ${totalFalhas} matéria(s) na última hora. ${
          indisponiveis.length > 0
            ? `Provedor(es) sem fôlego agora: ${indisponiveis.map((p) => p.provedor).join(", ")}.`
            : "Nenhum provedor está marcado como sem cota — pode ser outro tipo de falha (conteúdo da fonte, formato de resposta)."
        } Vale a pena eu dar uma olhada com mais calma se isso continuar.`,
        { totalFalhasUltimaHora: totalFalhas, provedoresSemFolego: indisponiveis, marcador: marcadorHora }
      );
    }
    return;
  }

  // Auditoria de 24/11/2026 (achado #1): as 4 camadas de segurança
  // (Revisor, Verificador de Fatos, Jurídico, Editor-chefe/duplicação,
  // Editor de Imagens) são "fail-open" por design — se todos os provedores
  // disponíveis falharem, cada uma aprova por padrão em vez de travar a
  // publicação. Isso é correto caso a caso (nunca travar o jornal por uma
  // falha técnica pontual), mas significava que, numa falha sistêmica mais
  // ampla, essas camadas podiam ficar "aprovando tudo sem checar" durante
  // horas sem NINGUÉM ser avisado — o apagão só virava alerta pro lado da
  // redação (pesquisador/redator), nunca pro lado da segurança editorial.
  // Agora conta quantas vezes essas camadas "aprovaram por padrão" na
  // última hora e avisa se passar de um limite — mesmo que a bancada de IA
  // como um todo pareça estar resolvendo itens normalmente.
  const CAMADAS_SEGURANCA = ["revisor", "verificadorFatos", "juridico", "editorChefe", "editorImagens"];
  const LIMITE_FAIL_OPEN = 5;

  const { count: totalFailOpen, error: erroFailOpen } = await supabase
    .from("logs_sistema")
    .select("id", { count: "exact", head: true })
    .eq("nivel", "warning")
    .in("origem", CAMADAS_SEGURANCA)
    .ilike("mensagem", "%por padrão%")
    .gte("criado_em", desde);

  if (erroFailOpen) {
    await log("warning", "gerencia", "Falha ao consultar logs pra supervisão das camadas de segurança", { erro: erroFailOpen.message });
  } else if ((totalFailOpen ?? 0) >= LIMITE_FAIL_OPEN) {
    const marcadorHoraSeguranca = `fail-open-seguranca-${new Date().toISOString().slice(0, 13)}`;
    if (!(await jaInformouHoje("RH/Supervisão da Equipe de IA", marcadorHoraSeguranca))) {
      await perguntar(
        "RH/Supervisão da Equipe de IA",
        `As camadas de segurança editorial (Revisor, Verificador de Fatos, Jurídico, checagem de duplicação, Editor de Imagens) aprovaram matérias "por padrão" (sem checagem de IA de verdade, por falta de provedor disponível) ${totalFailOpen} vez(es) na última hora. Isso pode significar que notícias estão saindo sem a segunda camada de revisão. Vale a pena eu dar uma olhada.`,
        { totalFailOpenUltimaHora: totalFailOpen, marcador: marcadorHoraSeguranca }
      );
    }
  }

  // Mesmo sem falha sistêmica, avisa se algum provedor está escalado num
  // cooldown bem longo (sinal de que a cota diária dele provavelmente não
  // vai voltar tão cedo) — só informativo, pra aparecer no painel futuro.
  const comCooldownLongo = indisponiveis.filter((p) => (p.voltaEmSegundos ?? 0) > 45 * 60);
  if (comCooldownLongo.length > 0) {
    await log("info", "gerencia", "Provedor(es) de IA com cooldown escalado (provável cota diária esgotada)", {
      provedores: comCooldownLongo.map((p) => ({ provedor: p.provedor, voltaEmSegundos: p.voltaEmSegundos })),
    });

    const marcadorDia = `cooldown-longo-${new Date().toISOString().slice(0, 10)}`;
    if (!(await jaInformouHoje("RH/Supervisão da Equipe de IA", marcadorDia))) {
      await informar(
        "RH/Supervisão da Equipe de IA",
        `${comCooldownLongo.map((p) => p.provedor).join(", ")} ${comCooldownLongo.length === 1 ? "está" : "estão"} com cota provavelmente esgotada por hoje (cooldown longo) — o resto da bancada está cobrindo sem problema.`,
        { provedores: comCooldownLongo, marcador: marcadorDia }
      );
    }
  }
}
