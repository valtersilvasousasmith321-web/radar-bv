import Image from "next/image";
import { listarFotos } from "@/lib/admin-data";
import { EDITORIAS } from "@/lib/types";
import { enviarFoto, excluirFoto } from "./actions";
import BotaoConfirmar from "@/components/BotaoConfirmar";

const MENSAGENS_ERRO: Record<string, string> = {
  sem_arquivo: "Escolha um arquivo de imagem antes de enviar.",
};

export default async function PaginaFotos({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string; erro?: string }>;
}) {
  const { salvo, erro } = await searchParams;
  const fotos = await listarFotos();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy">Banco de fotos</h1>
        <p className="text-sm text-slate-500 mt-1">
          Fotos suas, prontas pra usar em notícias — pra trocar a imagem de uma matéria já publicada ou pra ilustrar
          algo em tempo real (ex: um acidente) antes mesmo de escrever a notícia. {fotos.length} foto(s) guardada(s).
        </p>
      </div>

      {salvo && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-md px-3.5 py-2.5">
          Feito.
        </div>
      )}
      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3.5 py-2.5">
          {MENSAGENS_ERRO[erro] ?? `Erro: ${erro}`}
        </div>
      )}

      <form
        action={enviarFoto}
        encType="multipart/form-data"
        className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col gap-4 max-w-xl"
      >
        <h2 className="font-semibold text-slate-800">Enviar nova foto</h2>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Arquivo de imagem</label>
          <input
            type="file"
            name="arquivo"
            accept="image/*"
            required
            className="w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-slate-100 file:text-slate-700 file:font-semibold hover:file:bg-slate-200"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Descrição (opcional)</label>
          <input
            name="descricao"
            placeholder='Ex: "Acidente na BR-174, km 12 — foto do local"'
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-esmeralda"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Editoria (opcional)</label>
          <select
            name="editoria"
            defaultValue=""
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-esmeralda"
          >
            <option value="">Sem editoria específica</option>
            {EDITORIAS.map((e) => (
              <option key={e.slug} value={e.slug}>
                {e.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="self-start bg-navy text-white font-semibold text-sm px-5 py-2.5 rounded-md hover:bg-slate-800"
        >
          Enviar foto
        </button>
      </form>

      {fotos.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma foto enviada ainda.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {fotos.map((foto) => (
            <div key={foto.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
              <div className="relative aspect-video bg-slate-100">
                <Image src={foto.url} alt={foto.descricao ?? "Foto do banco"} fill className="object-cover" />
              </div>
              <div className="p-3 flex flex-col gap-1.5 flex-1">
                {foto.descricao && <p className="text-xs text-slate-700 line-clamp-2">{foto.descricao}</p>}
                {foto.editoria && <p className="text-[11px] text-slate-400">{foto.editoria}</p>}
                <form action={excluirFoto.bind(null, foto.id)} className="mt-auto pt-1">
                  <BotaoConfirmar
                    mensagem="Excluir esta foto do banco? Isso não afeta notícias que já usam essa imagem, mas remove o arquivo do Storage."
                    className="text-xs text-red-600 hover:underline"
                  >
                    Excluir
                  </BotaoConfirmar>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
