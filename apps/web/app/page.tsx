import Cabecalho from "@/components/Cabecalho";
import MesaDeRedacao from "@/components/MesaDeRedacao";
import Rodape from "@/components/Rodape";
import BannerAnuncio from "@/components/BannerAnuncio";
import { CardNoticiaCompacto, CardNoticiaDestaque, CardNoticiaLinha } from "@/components/CardNoticia";
import { getBanner, getNoticias, getStatusMesaRedacao } from "@/lib/data";

// Revalida a cada 60s — notícias novas aparecem sem precisar de rebuild manual.
export const revalidate = 60;

export default async function Home() {
  const noticias = await getNoticias({ limite: 12 });
  const urgente = noticias.find((n) => n.urgente);
  const destaque = noticias.find((n) => n.destaque) ?? noticias[0];
  const secundarias = noticias.filter((n) => n.id !== destaque?.id).slice(0, 3);
  const roraima = (await getNoticias({ editoria: "roraima", limite: 4 })).length
    ? await getNoticias({ editoria: "roraima", limite: 4 })
    : noticias.slice(3, 7);
  const mundo = await getNoticias({ editoria: "brasil_mundo", limite: 4 });

  const statusMesaRedacao = await getStatusMesaRedacao();
  const bannerTopo = await getBanner("topo");
  const bannerLateral1 = await getBanner("lateral", { tags: ["tecnologia", "engenharia"], editoria: "economia" });
  const bannerLateral2 = await getBanner("lateral", { tags: ["documento", "cartorio"], editoria: destaque?.editoria });

  return (
    <>
      <Cabecalho />
      <MesaDeRedacao status={statusMesaRedacao} />

      {urgente && (
        <div className="bg-gradient-to-r from-urgente to-red-700 shadow-sm">
          <a href={`/noticia/${urgente.slug}`} className="max-w-6xl mx-auto px-6 py-2.5 flex items-center gap-3 hover:opacity-95 transition-opacity">
            <span className="bg-white text-urgente text-[11px] font-bold px-2 py-0.5 rounded whitespace-nowrap animate-pulse">
              URGENTE
            </span>
            <span className="text-white font-semibold text-[15px]">{urgente.titulo}</span>
          </a>
        </div>
      )}

      <main className="max-w-6xl mx-auto w-full px-6 py-8 flex flex-wrap gap-8">
        <div className="flex-[999_1_720px] min-w-0 flex flex-col gap-10">
          <section className="grid md:grid-cols-2 gap-6">
            {destaque && <CardNoticiaDestaque noticia={destaque} />}
            <div className="flex flex-col gap-5">
              {secundarias.map((n) => (
                <CardNoticiaLinha key={n.id} noticia={n} />
              ))}
            </div>
          </section>

          {bannerTopo && <BannerAnuncio banner={bannerTopo} variante="faixa" />}

          <SecaoEditoria titulo="Roraima" href="/editoria/roraima" corBorda="border-esmeralda" itens={roraima} />
          <SecaoEditoria titulo="Brasil & Mundo" href="/editoria/brasil_mundo" corBorda="border-navy" itens={mundo} />
        </div>

        <aside className="flex-[1_1_280px] min-w-[260px] flex flex-col gap-6">
          <BannerAnuncio banner={bannerLateral1} />
          <ListaMaisLidas noticias={noticias} />
          <BannerAnuncio banner={bannerLateral2} />
          <div className="bg-gradient-to-br from-esmeralda to-emerald-700 rounded-xl p-5 text-white shadow-md">
            <h3 className="text-base font-bold">Receba no WhatsApp</h3>
            <p className="text-[13px] text-emerald-100 mt-1.5 leading-relaxed">
              Resumo das principais notícias direto no seu grupo ou canal, sem precisar abrir o site.
            </p>
            <a
              href="https://wa.me/5595984308025"
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

function SecaoEditoria({
  titulo,
  href,
  corBorda,
  itens,
}: {
  titulo: string;
  href: string;
  corBorda: string;
  itens: Awaited<ReturnType<typeof getNoticias>>;
}) {
  if (itens.length === 0) return null;
  return (
    <section aria-labelledby={`titulo-${href}`}>
      <div className="flex items-baseline justify-between mb-4">
        <h2 id={`titulo-${href}`} className={`text-xl font-bold text-navy border-l-4 ${corBorda} pl-2.5`}>
          {titulo}
        </h2>
        <a href={href} className="text-sm font-semibold text-esmeralda hover:underline">
          Ver tudo
        </a>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        {itens.map((n) => (
          <CardNoticiaCompacto key={n.id} noticia={n} />
        ))}
      </div>
    </section>
  );
}

function ListaMaisLidas({ noticias }: { noticias: Awaited<ReturnType<typeof getNoticias>> }) {
  const top = [...noticias].sort((a, b) => b.visualizacoes - a.visualizacoes).slice(0, 4);
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h3 className="text-sm font-bold text-navy uppercase tracking-wide">Mais lidas</h3>
      <ol className="list-none mt-3.5 flex flex-col gap-3.5">
        {top.map((n, i) => (
          <li key={n.id} className="flex gap-3">
            <span className="font-display text-[22px] font-bold text-slate-300">{String(i + 1).padStart(2, "0")}</span>
            <a href={`/noticia/${n.slug}`} className="text-sm font-semibold text-navy leading-snug hover:underline">
              {n.titulo}
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
