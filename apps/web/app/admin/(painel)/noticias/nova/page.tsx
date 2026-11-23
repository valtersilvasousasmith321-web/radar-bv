import Link from "next/link";
import { listarFotos } from "@/lib/admin-data";
import { EDITORIAS } from "@/lib/types";
import { criarNoticiaManual } from "../actions";

const MENSAGENS_ERRO: Record<string, string> = {
  campos_obrigatorios: "Título, conteúdo e editoria são obrigatórios.",
};

export default async function PaginaNovaNoticiaManual({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  const fotosBanco = await listarFotos();

  return (
    <div className="max-w-3xl flex flex-col gap-6">
      <div>
        <Link href="/admin/noticias" className="text-xs text-slate-400 hover:underline">
          ← Voltar para notícias
        </Link>
        <h1 className="font-display text-2xl font-bold text-navy mt-1">Nova notícia manual</h1>
        <p className="text-sm text-slate-500 mt-1">
          Pra quando você mesmo viu algo e quer publicar direto, sem passar pela redação de IA. Coloque a foto, o
          texto, e publica — fica marcada como redigida pela equipe do Radar BV.
        </p>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3.5 py-2.5">
          {MENSAGENS_ERRO[erro] ?? `Erro ao criar: ${erro}`}
        </div>
      )}

      <form
        action={criarNoticiaManual}
        encType="multipart/form-data"
        className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col gap-5"
      >
        <div className="pb-4 border-b border-slate-100">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Foto</label>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Enviar do computador/celular</label>
              <input
                type="file"
                name="foto"
                accept="image/*"
                className="w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-slate-100 file:text-slate-700 file:font-semibold hover:file:bg-slate-200"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Ou escolher do banco de fotos</label>
              <select
                name="foto_banco_id"
                defaultValue=""
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-esmeralda"
              >
                <option value="">Nenhuma</option>
                {fotosBanco.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.descricao || f.url.split("/").pop()}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-xs text-slate-500 mb-1">Crédito da foto (opcional)</label>
            <input
              name="imagem_credito"
              placeholder="Ex: Valter / Radar BV"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-esmeralda"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Título</label>
          <input
            name="titulo"
            required
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-esmeralda"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Subtítulo</label>
          <input
            name="subtitulo"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-esmeralda"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Editoria</label>
          <select
            name="editoria"
            required
            defaultValue=""
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-esmeralda"
          >
            <option value="" disabled>
              Selecione...
            </option>
            {EDITORIAS.map((e) => (
              <option key={e.slug} value={e.slug}>
                {e.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Conteúdo</label>
          <textarea
            name="conteudo"
            required
            rows={14}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-esmeralda"
          />
          <p className="text-xs text-slate-400 mt-1">Parágrafos separados por linha em branco.</p>
        </div>

        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="destaque" className="rounded" />
            Destaque (hero da home)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="urgente" className="rounded" />
            Urgente
          </label>
        </div>

        <p className="text-xs text-slate-400">
          Ao salvar, a notícia já entra como <span className="font-semibold">publicada</span>.
        </p>

        <div className="pt-2 border-t border-slate-100 flex justify-end">
          <button type="submit" className="bg-navy text-white font-semibold text-sm px-5 py-2.5 rounded-md hover:bg-slate-800">
            Publicar notícia
          </button>
        </div>
      </form>
    </div>
  );
}
