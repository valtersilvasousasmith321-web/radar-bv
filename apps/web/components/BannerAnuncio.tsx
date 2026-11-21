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
    // Banner horizontal (970x250 / 1940x500 — proporção 97:25): a imagem já
    // traz nome, texto e call-to-action prontos, então o cartão só rotula
    // "Publicidade" e mostra a peça inteira, grande o suficiente pra ler.
    return (
      <a
        href={href}
        className="block bg-white border-[1.5px] border-dashed border-slate-300 rounded-xl p-3 shadow-sm transition-shadow hover:shadow-md"
      >
        <span className="block text-[11px] text-slate-400 uppercase tracking-wide mb-2 px-1">Publicidade</span>
        {banner.imagem_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={banner.imagem_url}
            alt={banner.nome_anunciante}
            className="w-full aspect-[97/25] object-cover rounded-lg"
          />
        )}
      </a>
    );
  }

  // Banner vertical de lateral (800x1000 — proporção 4:5): peça própria pra
  // essa caixa estreita, sem precisar cortar nem espremer uma arte larga.
  return (
    <a
      href={href}
      className="block bg-white border border-slate-200 rounded-xl p-3 shadow-sm transition-shadow hover:shadow-md"
    >
      <span className="block text-[11px] text-slate-400 uppercase tracking-wide mb-2 px-1">Publicidade — rede Radar BV</span>
      {banner.imagem_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={banner.imagem_url}
          alt={banner.nome_anunciante}
          className="w-full aspect-[4/5] object-cover rounded-lg"
        />
      )}
    </a>
  );
}
