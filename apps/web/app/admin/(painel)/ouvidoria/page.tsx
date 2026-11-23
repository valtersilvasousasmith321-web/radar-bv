import Link from "next/link";
import { listarReclamacoes } from "@/lib/admin-data";
import type { StatusReclamacao } from "@/lib/admin-types";
import { atualizarStatusReclamacao } from "./actions";
import BotaoConfirmar from "@/components/BotaoConfirmar";

const ABAS: { valor: StatusReclamacao | "todas"; label: string }[] = [
  { valor: "todas", label: "Todas" },
  { valor: "pendente", label: "Pendentes" },
  { valor: "respondida", label: "Respondidas" },
  { valor: "arquivada", label: "Arquivadas" },
];

const COR_STATUS: Record<string, string> = {
  pendente: "bg-amber-100 text-amber-700",
  respondida: "bg-emerald-100 text-emerald-700",
  arquivada: "bg-slate-200 text-slate-500",
};

export default async function PaginaOuvidoriaAdmin({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filtro = status && status !== "todas" ? (status as StatusReclamacao) : undefined;
  const reclamacoes = await listarReclamacoes(filtro);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy">Ouvidoria</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-2xl">
          Relatos enviados pelo leitor pelo formulário público — apontamento de erro numa matéria específica ou reclamação
          geral do portal. Nenhuma IA participa daqui: é você quem lê e decide, igual um jornal de verdade faz com carta
          do leitor. Se o relato apontar um erro real numa matéria, registre a correção direto na edição da notícia (ela
          aparece publicamente lá) — aqui você só marca o andamento do atendimento ao leitor.
        </p>
      </div>

      <div className="flex gap-2">
        {ABAS.map((aba) => (
          <Link
            key={aba.valor}
            href={aba.valor === "todas" ? "/admin/ouvidoria" : `/admin/ouvidoria?status=${aba.valor}`}
            className={`text-sm font-medium px-3 py-1.5 rounded-full border ${
              (status ?? "todas") === aba.valor ? "bg-navy text-white border-navy" : "bg-white text-slate-600 border-slate-200"
            }`}
          >
            {aba.label}
          </Link>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {reclamacoes.map((r) => (
          <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${COR_STATUS[r.status]}`}>{r.status}</span>
                <span className="text-xs text-slate-400">{new Date(r.criado_em).toLocaleString("pt-BR")}</span>
              </div>
              {r.noticia_id && (
                <Link href={`/admin/noticias/${r.noticia_id}`} className="text-xs text-navy font-semibold hover:underline">
                  Ver matéria relacionada
                </Link>
              )}
            </div>

            <div className="text-xs text-slate-500 mb-2">
              {r.nome || "Anônimo"}
              {r.email && <span className="text-slate-400"> · {r.email}</span>}
            </div>

            <p className="text-sm text-slate-700 whitespace-pre-wrap mb-4">{r.mensagem}</p>

            {r.resposta_admin && (
              <div className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-600 mb-4">
                <span className="font-semibold">Resposta registrada:</span> {r.resposta_admin}
              </div>
            )}

            <div className="flex flex-wrap items-end gap-3">
              <form action={atualizarStatusReclamacao.bind(null, r.id, "respondida")} className="flex flex-1 min-w-[260px] items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-slate-500 mb-1">Resposta/anotação interna (opcional)</label>
                  <input
                    type="text"
                    name="resposta_admin"
                    defaultValue={r.resposta_admin ?? ""}
                    placeholder="Ex: corrigido na matéria, encaminhado, trote..."
                    className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-esmeralda"
                  />
                </div>
                <button
                  type="submit"
                  className="bg-esmeralda text-white text-xs font-semibold px-3 py-2 rounded-md hover:opacity-90 whitespace-nowrap"
                >
                  Marcar como respondida
                </button>
              </form>
              <form action={atualizarStatusReclamacao.bind(null, r.id, "arquivada")}>
                <BotaoConfirmar
                  mensagem="Arquivar esta reclamação?"
                  className="bg-slate-100 text-slate-600 text-xs font-semibold px-3 py-2 rounded-md hover:bg-slate-200 whitespace-nowrap"
                >
                  Arquivar
                </BotaoConfirmar>
              </form>
            </div>
          </div>
        ))}

        {reclamacoes.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-8 text-center text-slate-400 text-sm">
            Nenhuma reclamação nesta visão.
          </div>
        )}
      </div>
    </div>
  );
}
