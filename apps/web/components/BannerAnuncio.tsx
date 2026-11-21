"use client";

import { useState } from "react";
import type { Banner } from "@/lib/types";

/**
 * Renderiza um banner já resolvido pelo Motor de Publicidade Inteligente
 * (lib/data.ts -> getBanner -> função obter_banner_contextual do Supabase).
 * Sempre rotulado "Publicidade" — transparência com o leitor é parte da
 * identidade do Radar BV, não só uma exigência do AdSense.
 *
 * Precisa ser client component por causa do onError da imagem: um banner
 * cadastrado com uma URL que não existe de verdade (ou que falha por
 * qualquer motivo) não pode deixar a caixa vazia — sempre cai no texto
 * (nome + call-to-action), que funciona com ou sem imagem.
 */
export default function BannerAnuncio({ banner, variante = "caixa" }: { banner: Banner | null; variante?: "caixa" | "faixa" }) {
  const [imagemFalhou, setImagemFalhou] = useState(false);

  if (!banner) return null;

  const href = banner.link_whatsapp ?? banner.link_destino ?? "#";
  const mostrarImagem = Boolean(banner.imagem_url) && !imagemFalhou;
  const textoBotao = banner.tipo_anunciante === "captacao_anunciante" ? "Fale com o comercial" : "Saiba mais";

  if (variante === "faixa") {
    // Banner horizontal (970x250 / 1940x500 — proporção 97:25): quando a
    // imagem carrega, ela já traz nome, texto e call-to-action prontos. Sem
    // imagem (ou se ela falhar), mostra nome + botão em texto mesmo.
    return (
      <a
        href={href}
        className="block bg-white border-[1.5px] border-dashed border-slate-300 rounded-xl p-3 shadow-sm transition-shadow hover:shadow-md"
      >
        <span className="block text-[11px] text-slate-400 uppercase tracking-wide mb-2 px-1">Publicidade</span>
        {mostrarImagem ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={banner.imagem_url!}
            alt={banner.nome_anunciante}
            className="w-full aspect-[97/25] object-cover rounded-lg"
            onError={() => setImagemFalhou(true)}
          />
        ) : (
          <div className="bg-gradient-to-r from-navy to-slate-900 rounded-lg px-6 py-5 flex flex-wrap items-center justify-between gap-4 text-white">
            <h3 className="text-[17px] font-bold">{banner.nome_anunciante}</h3>
            <span className="bg-gradient-to-r from-esmeralda to-emerald-600 text-white font-semibold text-sm px-5 py-2.5 rounded-lg whitespace-nowrap">
              {textoBotao}
            </span>
          </div>
        )}
      </a>
    );
  }

  // Banner vertical de lateral (800x1000 — proporção 4:5): peça própria pra
  // essa caixa estreita. Sem imagem (ou se ela falhar), mostra nome + botão.
  return (
    <a
      href={href}
      className="block bg-white border border-slate-200 rounded-xl p-3 shadow-sm transition-shadow hover:shadow-md"
    >
      <span className="block text-[11px] text-slate-400 uppercase tracking-wide mb-2 px-1">Publicidade — rede Radar BV</span>
      {mostrarImagem ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={banner.imagem_url!}
          alt={banner.nome_anunciante}
          className="w-full aspect-[4/5] object-cover rounded-lg"
          onError={() => setImagemFalhou(true)}
        />
      ) : (
        <div className="bg-gradient-to-br from-navy to-slate-900 rounded-lg p-5 text-white flex flex-col justify-between aspect-[4/5]">
          <h3 className="text-base font-bold">{banner.nome_anunciante}</h3>
          <span className="inline-block bg-leitura text-navy text-[13px] font-semibold px-3.5 py-2 rounded-md self-start">
            {textoBotao}
          </span>
        </div>
      )}
    </a>
  );
}
