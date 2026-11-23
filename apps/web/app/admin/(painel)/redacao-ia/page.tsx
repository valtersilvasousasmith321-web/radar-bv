import Link from "next/link";
import { listarRelatorios } from "@/lib/admin-data";
import type { TipoRelatorioRedacao } from "@/lib/admin-types";
import { tempoRelativo } from "@/lib/formato";
import { responderRelatorio, marcarRelatorioComoLido } from "./actions";

const ABAS: { valor: TipoRelatorioRedacao | "todas"; label: string }[] = [
  { valor: "todas", label: "Tudo" },
  { valor: "pergunta", label: "Perguntas" },
  { valor: "informe", label: "Informes" },
];

const COR_PAPEL: Record<string, string> = {
  "Editor-chefe": "bg-indigo-100 text-indigo-700",
  "Editor de Imagens": "bg-fuchsia-100 text-fuchsia-700",
  "Supervisor de Provedores de IA": "bg-amber-100 text-amber-700",
  "RH/Supervisão da Equipe de IA": "bg-sky-100 text-sky-700",
  "Analista de Desempenho": "bg-emerald-100 text-emerald-700",
};

export default async function PaginaRedacaoIA({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo } = await searchParams;
  const filtro = tipo && tipo !== "todas" ? (tipo as TipoRelatorioRedacao) : undefined;

  // Blindagem (23/11/2026): essa página deu "Application error" sem detalhe
  // nenhum pro Valter ver — sem isso, um erro de banco aqui derruba a página
  // inteira e ninguém consegue saber o motivo real sem abrir o Vercel. Com
  // o try/catch, se der erro de novo, aparece a mensagem de verdade na tela
  // em vez do erro genérico do Next.js.
  let relatorios: Awaited<ReturnType<typeof listarRelatorios>> = [];
  let erroCarregamento: string | null = null;
  try {
    relatorios = await listarRelatorios(filtro);
  } catch (err: any) {
    erroCarregamento = String(err?.message ?? err);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy">Central de Transparência</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-2xl">
          Cada área da redação de IA (Editor-chefe, Editor de Imagens, Supervisor de Provedores de IA, RH, Analista de
          Desempenho) relata aqui, em português simples, o que fez e como está indo — não é log técnico. Quando uma área
          marca <span className="font-semibold text-slate-700">Pergunta</span>, ela está pedindo sua opinião ou decisão:
          responda ali embaixo, sem precisar abrir o Supabase.
        </p>
      </div>

      <div className="flex gap-2">
        {ABAS.map((aba) => (
          <Link
            key={aba.valor}
            href={aba.valor === "todas" ? "/admin/redacao-ia" : `/admin/redacao-ia?tipo=${aba.valor}`}
            className={`text-sm font-medium px-3 py-1.5 rounded-full border ${
              (tipo ?? "todas") === aba.valor ? "bg-navy text-white border-navy" : "bg-white text-slate-600 border-slate-200"
            }`}
          >
            {aba.label}
          </Link>
        ))}
      </div>

      {erroCarregamento && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3.5 py-2.5">
          Não consegui carregar os relatos: {erroCarregamento}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {relatorios.map((r) => (
          <div
            key={r.id}
            className={`bg-white rounded-xl border p-5 ${
              r.tipo === "pergunta" && r.status !== "respondido" ? "border-amber-300 ring-1 ring-amber-100" : "border-slate-200"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${COR_PAPEL[r.papel] ?? "bg-slate-100 text-slate-600"}`}>
                  {r.papel}
                </span>
                {r.tipo === "pergunta" && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500 text-white">Pergunta</span>
                )}
                <span className="text-xs text-slate-400">{tempoRelativo(r.criado_em)}</span>
              </div>
              {r.status === "respondido" && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Respondido</span>
              )}
            </div>

            <p className="text-sm text-slate-700 whitespace-pre-wrap mb-4">{r.mensagem}</p>

            {r.resposta_admin && (
              <div className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-600 mb-4">
                <span className="font-semibold">Sua resposta:</span> {r.resposta_admin}
              </div>
            )}

            {r.status !== "respondido" && r.tipo === "pergunta" && (
              <form action={responderRelatorio.bind(null, r.id)} className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-slate-500 mb-1">Sua opinião/decisão</label>
                  <input
                    type="text"
                    name="resposta_admin"
                    placeholder="Ex: pode seguir assim, vou criar as contas do Mistral, prioridade baixa por enquanto..."
                    className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-esmeralda"
                  />
                </div>
                <button
                  type="submit"
                  className="bg-esmeralda text-white text-xs font-semibold px-3 py-2 rounded-md hover:opacity-90 whitespace-nowrap"
                >
                  Responder
                </button>
              </form>
            )}

            {r.status === "novo" && r.tipo === "informe" && (
              <form action={marcarRelatorioComoLido.bind(null, r.id)}>
                <button type="submit" className="text-xs text-slate-400 hover:text-slate-600 underline">
                  Marcar como lido
                </button>
              </form>
            )}
          </div>
        ))}

        {relatorios.length === 0 && !erroCarregamento && (
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-8 text-center text-slate-400 text-sm">
            Nenhum relato por aqui ainda.
          </div>
        )}
      </div>
    </div>
  );
}
