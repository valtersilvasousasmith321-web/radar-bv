import type { Metadata } from "next";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import Image from "next/image";
import Cabecalho from "@/components/Cabecalho";
import Rodape from "@/components/Rodape";
import BannerAnuncio from "@/components/BannerAnuncio";
import { CardNoticiaCompacto } from "@/components/CardNoticia";
import { getBanner, getNoticiaPorSlug, getNoticiasRelacionadas } from "@/lib/data";
import { LINK_GRUPO_WHATSAPP } from "@/lib/contatos";
import { NOME_EDITORIA, ORIGEM_IA_LABEL } from "@/lib/types";
import { dataCompleta } from "@/lib/formato";

export const revalidate = 60;

type ParametrosRota = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: ParametrosRota): Promise<Metadata> {
  const { slug } = await params;
  const noticia = await getNoticiaPorSlug(slug);
  if (!noticia) return {};
  return {
    title: noticia.titulo,
    description: noticia.subtitulo ?? undefined,
    openGraph: {
      title: noticia.titulo,
      description: noticia.subtitulo ?? undefined,
      type: "article",
      images: noticia.imagem_url ? [noticia.imagem_url] : undefined,
    },
  };
}

export default async function PaginaNoticia({ params }: ParametrosRota) {
  const { slug } = await params;
  const noticia = await getNoticiaPorSlug(slug);
  if (!noticia) notFound();

  const relacionadas = await getNoticiasRelacionadas(noticia);
  const bannerMeio = await getBanner("meio_materia", { tags: noticia.tags, editoria: noticia.editoria });

  const paragrafos = noticia.conteudo.split("\n\n");
  const meio = Math.ceil(paragrafos.length / 2);

  return (
    <>
      <Cabecalho />
      <main className="max-w-6xl mx-auto w-full px-6 py-10 flex flex-wrap gap-10">
        <article className="flex-[999_1_640px] min-w-0">
          <div className="flex items-center gap-2.5 text-[13px] text-slate-400 mb-4">
            <a href={`/editoria/${noticia.editoria}`} className="text-esmeralda font-bold uppercase text-xs">
              {NOME_EDITORIA[noticia.editoria]}
            </a>
            <span>•</span>
            <span>{dataCompleta(noticia.data_publicacao)}</span>
          </div>

          <h1 className="font-display text-[36px] font-bold text-navy leading-tight">{noticia.titulo}</h1>
          {noticia.subtitulo && <p className="text-lg text-slate-500 mt-3.5 leading-relaxed">{noticia.subtitulo}</p>}

          <div className="mt-6 bg-white border border-slate-200 rounded-[10px] px-4.5 py-3.5 flex flex-wrap items-center gap-2.5 text-[13px] text-slate-600">
            <span className="bg-slate-100 text-navy font-bold px-2.5 py-1 rounded-full text-xs">
              Redigido por {ORIGEM_IA_LABEL[noticia.origem_ia]}
            </span>
            <span>a partir de fatos apurados pelo Gemini</span>
            <span className="text-slate-300">•</span>
            <span>
              Fonte original:{" "}
              <a href={noticia.fonte_url_original} className="text-navy font-semibold hover:underline">
                {noticia.fonte_credito}
              </a>
            </span>
          </div>

          <div className="mt-7 bg-slate-300 rounded-xl overflow-hidden">
            {noticia.imagem_url ? (
              <div className="relative h-[400px]">
                <Image src={noticia.imagem_url} alt="" fill className="object-cover" />
              </div>
            ) : (
              <div role="img" aria-label={`Foto ilustrativa para: ${noticia.titulo}`} className="h-[400px] flex items-center justify-center text-slate-500">
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.6" />
                  <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-2">{noticia.imagem_credito}</p>

          <div className="mt-7">
            {paragrafos.map((p, i) => (
              <Fragment key={i}>
                <p className="text-[17px] leading-[1.75] text-slate-800 mb-5">{p}</p>
                {i === meio - 1 && bannerMeio && (
                  <div className="my-8">
                    <BannerAnuncio banner={bannerMeio} variante="faixa" />
                  </div>
                )}
              </Fragment>
            ))}
          </div>

          <div className="mt-8 pt-6 border-t border-slate-200 flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-500">Compartilhar:</span>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                `${noticia.titulo}\n\nhttps://www.radarbv.com.br/noticia/${noticia.slug}`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-esmeralda text-white font-semibold text-[13px] px-4 py-2 rounded-full"
            >
              WhatsApp
            </a>
          </div>

          {relacionadas.length > 0 && (
            <div className="mt-10">
              <h2 className="text-lg font-bold text-navy border-l-4 border-navy pl-2.5 mb-4.5">Leia também</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4.5">
                {relacionadas.map((n) => (
                  <CardNoticiaCompacto key={n.id} noticia={n} />
                ))}
              </div>
            </div>
          )}
        </article>

        <aside className="flex-[1_1_280px] min-w-[260px] flex flex-col gap-6">
          <BannerAnuncio banner={await getBanner("lateral")} />
          <div className="bg-gradient-to-br from-esmeralda to-emerald-700 rounded-xl p-5 text-white shadow-md">
            <h3 className="text-base font-bold">Receba no WhatsApp</h3>
            <p className="text-[13px] text-emerald-100 mt-1.5 leading-relaxed">
              Resumo das principais notícias direto no seu grupo ou canal.
            </p>
            <a
              href={LINK_GRUPO_WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-3 bg-white text-emerald-800 text-[13px] font-bold px-3.5 py-2 rounded-md shadow-sm transition hover:bg-emerald-50 hover:shadow"
            >
              Entrar no canal
            </a>
          </div>
        </aside>
      </main>
      <Rodape />
    </>
  );
}
