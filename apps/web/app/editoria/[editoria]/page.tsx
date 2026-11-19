import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Cabecalho from "@/components/Cabecalho";
import Rodape from "@/components/Rodape";
import BannerAnuncio from "@/components/BannerAnuncio";
import { CardNoticiaCompacto } from "@/components/CardNoticia";
import { getBanner, getNoticias } from "@/lib/data";
import { EDITORIAS, NOME_EDITORIA, type Editoria } from "@/lib/types";

export const revalidate = 60;

function ehEditoriaValida(valor: string): valor is Editoria {
  return EDITORIAS.some((e) => e.slug === valor);
}

export function generateStaticParams() {
  return EDITORIAS.map((e) => ({ editoria: e.slug }));
}

type ParametrosRota = { params: Promise<{ editoria: string }> };

export async function generateMetadata({ params }: ParametrosRota): Promise<Metadata> {
  const { editoria: valor } = await params;
  if (!ehEditoriaValida(valor)) return {};
  return { title: NOME_EDITORIA[valor] };
}

export default async function PaginaEditoria({ params }: ParametrosRota) {
  const { editoria: valor } = await params;
  if (!ehEditoriaValida(valor)) notFound();
  const editoria = valor;

  const noticias = await getNoticias({ editoria, limite: 18 });
  const bannerTopo = await getBanner("topo", { editoria });
  const bannerLateral = await getBanner("lateral", { editoria });

  return (
    <>
      <Cabecalho />
      <main className="max-w-6xl mx-auto w-full px-6 py-10 flex flex-wrap gap-10">
        <section className="flex-[999_1_640px] min-w-0">
          <h1 className="font-display text-3xl font-bold text-navy border-l-4 border-esmeralda pl-3 mb-6">
            {NOME_EDITORIA[editoria]}
          </h1>

          {bannerTopo && (
            <div className="mb-7">
              <BannerAnuncio banner={bannerTopo} variante="faixa" />
            </div>
          )}

          {noticias.length === 0 ? (
            <p className="text-slate-500">Ainda não há notícias publicadas nesta editoria.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
              {noticias.map((n) => (
                <CardNoticiaCompacto key={n.id} noticia={n} />
              ))}
            </div>
          )}
        </section>

        <aside className="flex-[1_1_280px] min-w-[260px] flex flex-col gap-6">
          <BannerAnuncio banner={bannerLateral} />
        </aside>
      </main>
      <Rodape />
    </>
  );
}
