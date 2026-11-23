import Link from "next/link";
import { obterResumoDashboard } from "@/lib/admin-data";

const COR_NIVEL: Record<string, string> = {
  info: "text-slate-500",
  warning: "text-amber-600",
  error: "text-red-600",
  critico: "text-red-700 font-bold",
};

export default async function PaginaDashboard() {
  const resumo = await obterResumoDashboard();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Visão geral da redação automatizada.</p>
      </div>

      <div className="grid grid-cols-4 gap-5">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-3xl font-bold text-navy">{resumo.publicadas}</div>
          <div className="text-sm text-slate-500 mt-1">Notícias publicadas</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-3xl font-bold text-esmeralda">{resumo.agendadas}</div>
          <div className="text-sm text-slate-500 mt-1">Na fila de gotejamento</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="text-3xl font-bold text-slate-400">{resumo.rascunhos}</div>
          <div className="text-sm text-slate-500 mt-1">Rascunhos</div>
        </div>
        <Link href="/admin/ouvidoria" className="bg-white rounded-xl border border-slate-200 p-5 hover:border-esmeralda transition-colors">
          <div className={`text-3xl font-bold ${resumo.reclamacoesPendentes > 0 ? "text-amber-600" : "text-slate-400"}`}>
            {resumo.reclamacoesPendentes}
          </div>
          <div className="text-sm text-slate-500 mt-1">Ouvidoria pendente</div>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-navy mb-3">Fontes com erro (Isolamento de Fontes)</h2>
          {resumo.fontesComErro.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhuma fonte com erro — tudo saudável.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {resumo.fontesComErro.map((f: any) => (
                <li key={f.id} className="text-sm flex items-center justify-between gap-3">
                  <span className="text-slate-700">{f.nome}</span>
                  <span className={`text-xs font-semibold ${f.erros_consecutivos >= 10 ? "text-red-600" : "text-amber-600"}`}>
                    {f.erros_consecutivos}/10 erros{f.erros_consecutivos >= 10 ? " — desativada" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/admin/fontes" className="text-xs text-esmeralda font-semibold mt-4 inline-block hover:underline">
            Gerenciar fontes →
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-navy mb-3">Logs recentes</h2>
          {resumo.logsRecentes.length === 0 ? (
            <p className="text-sm text-slate-400">Sem logs ainda.</p>
          ) : (
            <ul className="flex flex-col gap-2 max-h-72 overflow-y-auto">
              {resumo.logsRecentes.map((log: any) => (
                <li key={log.id} className="text-xs border-b border-slate-100 pb-2 last:border-0">
                  <span className={COR_NIVEL[log.nivel] ?? "text-slate-500"}>[{log.origem}]</span>{" "}
                  <span className="text-slate-600">{log.mensagem}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
