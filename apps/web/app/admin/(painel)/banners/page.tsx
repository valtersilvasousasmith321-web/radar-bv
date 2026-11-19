import { listarBanners } from "@/lib/admin-data";
import { criarBanner, alternarAtivoBanner, excluirBanner } from "./actions";
import BotaoConfirmar from "@/components/BotaoConfirmar";

const LABEL_TIPO: Record<string, string> = {
  patrocinador_externo: "Patrocinador externo",
  interno_ecossistema: "Rede própria",
  captacao_anunciante: "Captação (Anuncie Aqui)",
  adsense: "AdSense",
};

export default async function PaginaBanners({ searchParams }: { searchParams: Promise<{ salvo?: string; erro?: string }> }) {
  const { salvo, erro } = await searchParams;
  const banners = await listarBanners();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy">Banners (Motor de Publicidade)</h1>
        <p className="text-sm text-slate-500 mt-1">Rede própria, patrocinadores, captação e AdSense — resolvidos por contexto (tags/editoria) a cada visualização.</p>
      </div>

      {salvo && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-md px-3.5 py-2.5">Banner cadastrado.</div>}
      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3.5 py-2.5">{erro === "campos_obrigatorios" ? "Nome do anunciante é obrigatório." : erro}</div>}

      <form action={criarBanner} className="bg-white rounded-xl border border-slate-200 p-5 grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Nome do anunciante</label>
          <input name="nome_anunciante" required className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo</label>
          <select name="tipo_anunciante" className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm">
            <option value="captacao_anunciante">Captação (Anuncie Aqui)</option>
            <option value="interno_ecossistema">Rede própria</option>
            <option value="patrocinador_externo">Patrocinador externo</option>
            <option value="adsense">AdSense</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Posição</label>
          <select name="posicao" className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm">
            <option value="topo">Topo</option>
            <option value="meio_materia">Meio da matéria</option>
            <option value="lateral">Lateral</option>
            <option value="rodape">Rodapé</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Prioridade (1-10)</label>
          <input name="prioridade" type="number" min={1} max={10} defaultValue={5} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">URL da imagem</label>
          <input name="imagem_url" type="url" className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Link de destino</label>
          <input name="link_destino" type="url" className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Link do WhatsApp (captação)</label>
          <input name="link_whatsapp" type="url" className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Tags contextuais (separadas por vírgula)</label>
          <input name="tags_contextuais" placeholder="documento, cartorio, imovel" className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <div className="col-span-2">
          <button type="submit" className="bg-navy text-white font-semibold text-sm px-5 py-2.5 rounded-md">
            Adicionar banner
          </button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Anunciante</th>
              <th className="text-left px-4 py-3">Tipo</th>
              <th className="text-left px-4 py-3">Posição</th>
              <th className="text-left px-4 py-3">Métricas</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {banners.map((b) => (
              <tr key={b.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-navy">{b.nome_anunciante}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{LABEL_TIPO[b.tipo_anunciante]}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{b.posicao}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">
                  {b.visualizacoes} views · {b.cliques} clicks
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${b.ativo ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                    {b.ativo ? "ativo" : "inativo"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <form action={alternarAtivoBanner.bind(null, b.id, !b.ativo)}>
                      <button className="text-xs text-esmeralda font-semibold hover:underline">{b.ativo ? "Desativar" : "Ativar"}</button>
                    </form>
                    <form action={excluirBanner.bind(null, b.id)}>
                      <BotaoConfirmar mensagem={`Excluir o banner de "${b.nome_anunciante}"?`} className="text-xs text-red-600 font-semibold hover:underline">
                        Excluir
                      </BotaoConfirmar>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {banners.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Nenhum banner cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
