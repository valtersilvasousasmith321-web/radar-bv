import { listarFontes } from "@/lib/admin-data";
import { EDITORIAS } from "@/lib/types";
import { criarFonte, reativarFonte, desativarFonte, excluirFonte } from "./actions";
import BotaoConfirmar from "@/components/BotaoConfirmar";

export default async function PaginaFontes({ searchParams }: { searchParams: Promise<{ salvo?: string; erro?: string }> }) {
  const { salvo, erro } = await searchParams;
  const fontes = await listarFontes();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy">Fontes monitoradas</h1>
        <p className="text-sm text-slate-500 mt-1">De onde o coletor busca notícias. Uma fonte com 10 erros seguidos é desativada automaticamente (Isolamento de Fontes).</p>
      </div>

      {salvo && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-md px-3.5 py-2.5">Fonte cadastrada.</div>}
      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3.5 py-2.5">{erro === "campos_obrigatorios" ? "Nome e URL são obrigatórios." : erro}</div>}

      <form action={criarFonte} className="bg-white rounded-xl border border-slate-200 p-5 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Nome</label>
          <input name="nome" required className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" placeholder="Ex: Secretaria de Saúde RR" />
        </div>
        <div className="flex-[2] min-w-[260px]">
          <label className="block text-xs font-semibold text-slate-600 mb-1">URL (feed RSS ou página)</label>
          <input name="url_base" required type="url" className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" placeholder="https://..." />
        </div>
        <div className="min-w-[120px]">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo</label>
          <select name="tipo" className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm">
            <option value="rss">RSS</option>
            <option value="html">HTML</option>
            <option value="api">API</option>
          </select>
        </div>
        <div className="min-w-[160px]">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Editoria padrão</label>
          <select name="editoria_padrao" className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm">
            <option value="">—</option>
            {EDITORIAS.map((e) => (
              <option key={e.slug} value={e.slug}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="bg-navy text-white font-semibold text-sm px-4 py-2 rounded-md h-[38px]">
          Adicionar
        </button>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Nome</th>
              <th className="text-left px-4 py-3">Tipo</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Erros</th>
              <th className="text-right px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {fontes.map((f) => (
              <tr key={f.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="font-medium text-navy">{f.nome}</div>
                  <div className="text-xs text-slate-400 truncate max-w-xs">{f.url_base}</div>
                </td>
                <td className="px-4 py-3 text-slate-500 uppercase text-xs">{f.tipo}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${f.ativa ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                    {f.ativa ? "ativa" : "desativada"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={f.erros_consecutivos >= 10 ? "text-red-600 font-semibold" : f.erros_consecutivos > 0 ? "text-amber-600" : "text-slate-400"}>
                    {f.erros_consecutivos}/10
                  </span>
                  {f.ultimo_erro && <div className="text-xs text-slate-400 truncate max-w-xs">{f.ultimo_erro}</div>}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    {f.ativa ? (
                      <form action={desativarFonte.bind(null, f.id)}>
                        <button className="text-xs text-slate-500 font-semibold hover:underline">Desativar</button>
                      </form>
                    ) : (
                      <form action={reativarFonte.bind(null, f.id)}>
                        <button className="text-xs text-esmeralda font-semibold hover:underline">Reativar</button>
                      </form>
                    )}
                    <form action={excluirFonte.bind(null, f.id)}>
                      <BotaoConfirmar mensagem={`Excluir a fonte "${f.nome}"?`} className="text-xs text-red-600 font-semibold hover:underline">
                        Excluir
                      </BotaoConfirmar>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {fontes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Nenhuma fonte cadastrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
