import Link from "next/link";
import { listarDicas } from "@/lib/admin-data";
import { descartarDicaManualmente } from "./actions";
import BotaoConfirmar from "@/components/BotaoConfirmar";

const COR_STATUS: Record<string, string> = {
  pendente: "bg-amber-100 text-amber-700",
  processada: "bg-emerald-100 text-emerald-700",
  descartada: "bg-slate-200 text-slate-500",
};

export default async function PaginaDicasAdmin() {
  const dicas = await listarDicas();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy">Dicas dos Leitores</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-2xl">
          Relatos de moradores recebidos via WhatsApp (buraco na rua, pequeno furto, acidente local, falta de serviço público...).
          O worker tenta transformar cada dica pendente em rascunho de notícia a cada 15 minutos — mas nunca publica direto: toda
          matéria gerada a partir de uma dica cai em <span className="font-semibold">Notícias → Rascunho</span>, esperando sua
          revisão antes de ir ao ar.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Recebida em</th>
              <th className="text-left px-4 py-3">Remetente</th>
              <th className="text-left px-4 py-3">Mensagem</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {dicas.map((d) => (
              <tr key={d.id} className="border-t border-slate-100 align-top">
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(d.criado_em).toLocaleString("pt-BR")}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                  {d.nome_remetente || "—"}
                  {d.telefone_remetente && <div className="text-xs text-slate-400">{d.telefone_remetente}</div>}
                </td>
                <td className="px-4 py-3 max-w-md">
                  <p className="line-clamp-3 text-slate-700">{d.mensagem_texto}</p>
                  {d.midia_url && (
                    <a href={d.midia_url} target="_blank" className="text-xs text-blue-600 hover:underline">
                      Ver mídia enviada
                    </a>
                  )}
                  {d.motivo_descarte && <p className="text-xs text-slate-400 mt-1">Motivo: {d.motivo_descarte}</p>}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${COR_STATUS[d.status]}`}>{d.status}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    {d.noticia_id && (
                      <Link href={`/admin/noticias/${d.noticia_id}`} className="text-xs text-navy font-semibold hover:underline">
                        Ver rascunho
                      </Link>
                    )}
                    {d.status === "pendente" && (
                      <form action={descartarDicaManualmente.bind(null, d.id)}>
                        <BotaoConfirmar
                          mensagem="Descartar esta dica sem gerar matéria?"
                          className="text-xs text-red-600 font-semibold hover:underline"
                        >
                          Descartar
                        </BotaoConfirmar>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {dicas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Nenhuma dica recebida ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
