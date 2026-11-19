import { listarDestinosWhatsApp } from "@/lib/admin-data";
import { criarDestinoWhatsApp, alternarAtivoDestino, alternarResumoDiarioDestino, excluirDestinoWhatsApp } from "./actions";
import BotaoConfirmar from "@/components/BotaoConfirmar";

export default async function PaginaWhatsApp({ searchParams }: { searchParams: Promise<{ salvo?: string; erro?: string }> }) {
  const { salvo, erro } = await searchParams;
  const destinos = await listarDestinosWhatsApp();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy">Automação WhatsApp</h1>
        <p className="text-sm text-slate-500 mt-1">
          Grupos/canais que recebem o disparo de cada matéria publicada e/ou o resumo diário (às 08h). Cada destino precisa de um
          webhook já configurado no seu provedor (Evolution API, WPPConnect, Z-API ou similar) apontando pro grupo/canal certo —
          nenhuma senha/sessão do WhatsApp fica guardada aqui.
        </p>
      </div>

      {salvo && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-md px-3.5 py-2.5">Destino cadastrado.</div>}
      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3.5 py-2.5">{erro === "campos_obrigatorios" ? "Nome e webhook são obrigatórios." : erro}</div>}

      <form action={criarDestinoWhatsApp} className="bg-white rounded-xl border border-slate-200 p-5 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Nome</label>
          <input name="nome" required placeholder="Ex: Grupo Boa Vista Notícias" className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <div className="min-w-[120px]">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo</label>
          <select name="tipo" className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm">
            <option value="grupo">Grupo</option>
            <option value="canal">Canal</option>
          </select>
        </div>
        <div className="flex-[2] min-w-[260px]">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Webhook URL</label>
          <input name="webhook_url" required type="url" placeholder="https://seu-provedor.com/webhook/..." className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 pb-2">
          <input type="checkbox" name="resumo_diario" defaultChecked className="rounded" />
          Recebe resumo diário
        </label>
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
              <th className="text-left px-4 py-3">Resumo diário</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {destinos.map((d) => (
              <tr key={d.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="font-medium text-navy">{d.nome}</div>
                  <div className="text-xs text-slate-400 truncate max-w-xs">{d.webhook_url}</div>
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs capitalize">{d.tipo}</td>
                <td className="px-4 py-3">
                  <form action={alternarResumoDiarioDestino.bind(null, d.id, !d.resumo_diario)}>
                    <button className={`text-xs font-semibold ${d.resumo_diario ? "text-esmeralda" : "text-slate-400"} hover:underline`}>
                      {d.resumo_diario ? "Sim — clique p/ desligar" : "Não — clique p/ ligar"}
                    </button>
                  </form>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${d.ativo ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                    {d.ativo ? "ativo" : "inativo"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <form action={alternarAtivoDestino.bind(null, d.id, !d.ativo)}>
                      <button className="text-xs text-esmeralda font-semibold hover:underline">{d.ativo ? "Desativar" : "Ativar"}</button>
                    </form>
                    <form action={excluirDestinoWhatsApp.bind(null, d.id)}>
                      <BotaoConfirmar mensagem={`Excluir o destino "${d.nome}"?`} className="text-xs text-red-600 font-semibold hover:underline">
                        Excluir
                      </BotaoConfirmar>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {destinos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Nenhum destino cadastrado — o worker ainda usa a WHATSAPP_WEBHOOK_URL legada (.env), se configurada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
