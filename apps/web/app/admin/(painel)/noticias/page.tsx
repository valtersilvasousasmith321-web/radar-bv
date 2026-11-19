import Link from "next/link";
import { listarNoticias } from "@/lib/admin-data";
import type { StatusNoticia } from "@/lib/admin-types";
import { alterarStatusNoticia, excluirNoticia } from "./actions";
import BotaoConfirmar from "@/components/BotaoConfirmar";

const ABAS: { valor: StatusNoticia | "todas"; label: string }[] = [
  { valor: "todas", label: "Todas" },
  { valor: "publicado", label: "Publicadas" },
  { valor: "agendado", label: "Agendadas" },
  { valor: "rascunho", label: "Rascunho" },
  { valor: "removido", label: "Removidas" },
];

const COR_STATUS: Record<string, string> = {
  publicado: "bg-emerald-100 text-emerald-700",
  agendado: "bg-amber-100 text-amber-700",
  rascunho: "bg-slate-100 text-slate-600",
  erro: "bg-red-100 text-red-700",
  removido: "bg-slate-200 text-slate-500",
};

export default async function PaginaNoticiasAdmin({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filtro = status && status !== "todas" ? (status as StatusNoticia) : undefined;
  const noticias = await listarNoticias(filtro);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy">Notícias</h1>
        <p className="text-sm text-slate-500 mt-1">{noticias.length} notícia(s) nesta visão.</p>
      </div>

      <div className="flex gap-2">
        {ABAS.map((aba) => (
          <Link
            key={aba.valor}
            href={aba.valor === "todas" ? "/admin/noticias" : `/admin/noticias?status=${aba.valor}`}
            className={`text-sm font-medium px-3 py-1.5 rounded-full border ${
              (status ?? "todas") === aba.valor ? "bg-navy text-white border-navy" : "bg-white text-slate-600 border-slate-200"
            }`}
          >
            {aba.label}
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Título</th>
              <th className="text-left px-4 py-3">Editoria</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Publicação</th>
              <th className="text-right px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {noticias.map((n) => (
              <tr key={n.id} className="border-t border-slate-100">
                <td className="px-4 py-3 max-w-sm">
                  <Link href={`/admin/noticias/${n.id}`} className="font-medium text-navy hover:underline line-clamp-1">
                    {n.titulo}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-500">{n.editoria}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${COR_STATUS[n.status]}`}>{n.status}</span>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {n.data_publicacao ? new Date(n.data_publicacao).toLocaleString("pt-BR") : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    {n.status !== "publicado" && (
                      <form action={alterarStatusNoticia.bind(null, n.id, "publicado")}>
                        <button type="submit" className="text-xs text-esmeralda font-semibold hover:underline">
                          Publicar
                        </button>
                      </form>
                    )}
                    {n.status === "publicado" && (
                      <form action={alterarStatusNoticia.bind(null, n.id, "rascunho")}>
                        <button type="submit" className="text-xs text-slate-500 font-semibold hover:underline">
                          Despublicar
                        </button>
                      </form>
                    )}
                    <form action={excluirNoticia.bind(null, n.id)}>
                      <BotaoConfirmar
                        mensagem={`Excluir "${n.titulo}" definitivamente? Isso não pode ser desfeito.`}
                        className="text-xs text-red-600 font-semibold hover:underline"
                      >
                        Excluir
                      </BotaoConfirmar>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {noticias.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Nenhuma notícia nesta visão.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
