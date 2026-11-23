import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { obterNoticiaPorId, listarFotos } from "@/lib/admin-data";
import { atualizarNoticia } from "../actions";

export default async function PaginaEditarNoticia({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string; erro?: string }>;
}) {
  const { id } = await params;
  const { salvo, erro } = await searchParams;
  const [noticia, fotosBanco] = await Promise.all([obterNoticiaPorId(id), listarFotos()]);
  if (!noticia) notFound();

  const acaoComId = atualizarNoticia.bind(null, id);

  return (
    <div className="max-w-3xl flex flex-col gap-6">
      <div>
        <Link href="/admin/noticias" className="text-xs text-slate-400 hover:underline">
          ← Voltar para notícias
        </Link>
        <h1 className="font-display text-2xl font-bold text-navy mt-1">Editar notícia</h1>
        <p className="text-sm text-slate-500 mt-1">
          Status: <span className="font-semibold">{noticia.status}</span> · Editoria:{" "}
          <span className="font-semibold">{noticia.editoria}</span> · Origem: {noticia.origem_ia} · Fonte:{" "}
          <a href={noticia.fonte_url_original} className="text-esmeralda hover:underline" target="_blank" rel="noreferrer">
            {noticia.fonte_credito ?? "ver original"}
          </a>
        </p>
        {noticia.fontes_cruzadas && noticia.fontes_cruzadas.length > 0 && (
          <p className="text-xs text-slate-500 mt-1">
            Curadoria multi-fonte — cruzou {noticia.fontes_cruzadas.length} fontes:{" "}
            {noticia.fontes_cruzadas.map((f, i) => (
              <span key={f.url}>
                {i > 0 && ", "}
                <a href={f.url} className="text-esmeralda hover:underline" target="_blank" rel="noreferrer">
                  {f.nome}
                </a>
              </span>
            ))}
          </p>
        )}
      </div>

      {salvo && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-md px-3.5 py-2.5">
          Alterações salvas.
        </div>
      )}
      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3.5 py-2.5">
          {erro === "campos_obrigatorios" ? "Título e conteúdo são obrigatórios." : `Erro ao salvar: ${erro}`}
        </div>
      )}

      <form
        action={acaoComId}
        encType="multipart/form-data"
        className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col gap-5"
      >
        <div className="pb-4 border-b border-slate-100">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Foto da notícia</label>
          {noticia.imagem_url ? (
            <div className="relative w-full max-w-sm aspect-video rounded-md overflow-hidden bg-slate-100 mb-3">
              <Image src={noticia.imagem_url} alt={noticia.titulo} fill className="object-cover" />
            </div>
          ) : (
            <p className="text-xs text-slate-400 mb-3">Esta notícia ainda não tem foto.</p>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Enviar uma foto nova do seu computador/celular</label>
              <input
                type="file"
                name="nova_foto"
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
                <option value="">Não trocar</option>
                {fotosBanco.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.descricao || f.url.split("/").pop()}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5">
            Se preencher os dois, o arquivo enviado tem prioridade. Deixe ambos em branco pra manter a foto atual.
          </p>

          <div className="mt-3">
            <label className="block text-xs text-slate-500 mb-1">Crédito da foto (texto que aparece embaixo da imagem na matéria)</label>
            <input
              name="imagem_credito"
              defaultValue={noticia.imagem_credito ?? ""}
              placeholder="Ex: Valter / Radar BV"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-esmeralda"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Título</label>
          <input
            name="titulo"
            defaultValue={noticia.titulo}
            required
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-esmeralda"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Subtítulo</label>
          <input
            name="subtitulo"
            defaultValue={noticia.subtitulo ?? ""}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-esmeralda"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Conteúdo</label>
          <textarea
            name="conteudo"
            defaultValue={noticia.conteudo}
            required
            rows={14}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-esmeralda"
          />
          <p className="text-xs text-slate-400 mt-1">Parágrafos separados por linha em branco.</p>
        </div>

        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="destaque" defaultChecked={noticia.destaque} className="rounded" />
            Destaque (hero da home)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="urgente" defaultChecked={noticia.urgente} className="rounded" />
            Urgente
          </label>
        </div>

        <div className="pt-4 border-t border-slate-100">
          <label className="block text-sm font-semibold text-slate-700 mb-1">Registrar nota de correção (Ouvidoria)</label>
          <p className="text-xs text-slate-500 mb-2">
            Preencha só se esta edição está corrigindo um erro apontado por um leitor. O texto aparece publicamente na
            matéria, com a data de hoje. Deixe em branco se é só um ajuste comum, sem erro a corrigir.
          </p>
          <textarea
            name="nova_correcao"
            rows={2}
            placeholder="Ex: Corrigimos o nome do bairro citado na matéria, que estava incorreto."
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-esmeralda"
          />
          {noticia.correcoes?.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              {noticia.correcoes.map((c, i) => (
                <p key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                  <span className="font-semibold">{new Date(c.data).toLocaleDateString("pt-BR")}:</span> {c.texto}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-slate-100 flex justify-end">
          <button type="submit" className="bg-navy text-white font-semibold text-sm px-5 py-2.5 rounded-md hover:bg-slate-800">
            Salvar alterações
          </button>
        </div>
      </form>
    </div>
  );
}
