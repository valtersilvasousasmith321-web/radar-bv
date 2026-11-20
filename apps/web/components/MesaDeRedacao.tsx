import type { StatusMesaRedacao } from "@/lib/data";
import { tempoRelativo } from "@/lib/formato";

/**
 * Faixa "Mesa de Redação IA" — o diferencial de transparência do Radar BV:
 * mostra o status real da esteira de produção (lib/data.ts ->
 * getStatusMesaRedacao, lido do logs_sistema do worker), em vez de um
 * texto fixo fingindo atividade. Quando o worker está parado/ocioso, diz
 * isso honestamente em vez de inventar "Redigindo" o tempo todo.
 */
export default function MesaDeRedacao({ status }: { status: StatusMesaRedacao }) {
  const descricao = status.quando
    ? `${status.etapa} — ${tempoRelativo(status.quando)}`
    : status.etapa;

  return (
    <div className="bg-gradient-to-r from-navy via-slate-900 to-navy border-b border-slate-800 shadow-inner">
      <div className="max-w-6xl mx-auto px-6 py-2.5 flex flex-wrap items-center gap-6 text-[13px] text-slate-400">
        <span className="font-bold text-slate-50 uppercase text-[11px] tracking-wide whitespace-nowrap">
          Mesa de Redação IA
        </span>
        <div className="flex items-center gap-2">
          <span
            className={`w-[7px] h-[7px] rounded-full inline-block ${
              status.ativo ? "bg-emerald-400 animate-pulse" : "bg-slate-600"
            }`}
          />
          <span className={status.ativo ? "text-slate-200" : "text-slate-500"}>{descricao}</span>
        </div>
        {status.quantidadeFontes > 0 && (
          <span className="hidden sm:inline">
            {status.quantidadeFontes} {status.quantidadeFontes === 1 ? "fonte oficial monitorada" : "fontes oficiais monitoradas"}
          </span>
        )}
        <span className="ml-auto text-slate-600 whitespace-nowrap hidden lg:inline">
          Toda matéria mostra qual IA redigiu e a fonte original.
        </span>
      </div>
    </div>
  );
}
