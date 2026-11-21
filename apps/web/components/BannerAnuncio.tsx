import type { Banner } from "@/lib/types";

/**
 * Renderiza um banner já resolvido pelo Motor de Publicidade Inteligente
 * (lib/data.ts -> getBanner -> função obter_banner_contextual do Supabase).
 * Sempre rotulado "Publicidade" — transparência com o leitor é parte da
 * identidade do Radar BV, não só uma exigência do AdSense.
 */
export default function BannerAnuncio({ banner, variante = "caixa" }: { banner: Banner | null; variante?: "caixa" | "faixa" }) {
  if (!banner) return null;

  const href = banner.link_whatsapp ?? banner.link_destino ?? "#";

  if (variante === "faixa") {
    return (
      <div className="bg-white border-[1.5px] border-dashed border-slate-300 rounded-xl px-6 py-5 flex flex-wrap items-center justify-between gap-4 shadow-sm transition-shadow hover:shadow-md">
        <div className="flex items-center gap-4 min-w-0">
          {banner.imagem_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={banner.imagem_url}
              alt={banner.nome_anunciante}
              className="w-40 sm:w-56 aspect-[97/25] object-cover rounded-md shrink-0"
            />
          )}
          <div>
            <span className="text-[11px] text-slate-400 uppercase tracking-wide">Publicidade</span>
            <h3 className="text-[17px] font-bold text-navy mt-1">{banner.nome_anunciante}</h3>
          </div>
        </div>
        <a href={href} className="bg-gradient-to-r from-esmeralda to-emerald-600 text-white font-semibold text-sm px-5 py-2.5 rounded-lg whitespace-nowrap shadow-sm transition hover:shadow-md hover:brightness-110">
          {banner.tipo_anunciante === "captacao_anunciante" ? "Fale com o comercial" : "Saiba mais"}
        </a>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <span className="text-[11px] text-slate-400 uppercase tracking-wide">Publicidade — rede Radar BV</span>
      <div className="mt-3 bg-gradient-to-br from-navy to-slate-900 rounded-[10px] overflow-hidden text-white shadow-md">
        {banner.imagem_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={banner.imagem_url}
            alt={banner.nome_anunciante}
            className="w-full aspect-[97/25] object-cover"
          />
        )}
        <div className="p-5">
          <h3 className="text-base font-bold">{banner.nome_anunciante}</h3>
          <a href={href} className="inline-block mt-3 bg-leitura text-navy text-[13px] font-semibold px-3.5 py-2 rounded-md hover:bg-white">
            Saiba mais
          </a>
        </div>
      </div>
    </div>
  );
}
