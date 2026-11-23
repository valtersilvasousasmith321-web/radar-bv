"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Noticia } from "@/lib/types";
import { NOME_EDITORIA, ORIGEM_IA_LABEL } from "@/lib/types";
import { tempoRelativo } from "@/lib/formato";
import { CORES_EDITORIA, FotoOuPlaceholder } from "@/components/CardNoticia";

const INTERVALO_MS = 7000;

/**
 * Carrossel de manchetes no topo da home — substitui a foto única fixa.
 * Antes, só existia UMA notícia "destaque" no topo; se ninguém atualizasse
 * essa marcação manual, ela ficava presa ali indefinidamente mesmo com o
 * resto do site atualizando por baixo normalmente (foi exatamente o que
 * confundiu o usuário). Com várias manchetes alternando automaticamente,
 * não existe mais "uma photo travada" — sempre tem conteúdo novo girando
 * no topo, igual ao g1 e ao Folha BV.
 */
export function CarrosselDestaques({ itens }: { itens: Noticia[] }) {
  const [indice, setIndice] = useState(0);
  const total = itens.length;

  useEffect(() => {
    if (total <= 1) return;
    const timer = setInterval(() => {
      setIndice((i) => (i + 1) % total);
    }, INTERVALO_MS);
    return () => clearInterval(timer);
  }, [total]);

  // Se a lista de itens mudar (nova notícia publicada, revalidate do Next),
  // volta pro início em vez de apontar pra um índice que não existe mais.
  useEffect(() => {
    setIndice(0);
  }, [itens.map((n) => n.id).join(",")]);

  if (total === 0) return null;
  const atual = itens[indice];

  return (
    <article className="md:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="relative group">
        <Link href={`/noticia/${atual.slug}`} className="relative block">
          <FotoOuPlaceholder noticia={atual} altura="h-[320px]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-navy/40 to-transparent" />
        </Link>

        {total > 1 && (
          <>
            <button
              type="button"
              aria-label="Manchete anterior"
              onClick={() => setIndice((i) => (i - 1 + total) % total)}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-navy/40 hover:bg-navy/70 text-white rounded-full w-8 h-8 flex items-center justify-center transition opacity-0 group-hover:opacity-100 focus:opacity-100"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Próxima manchete"
              onClick={() => setIndice((i) => (i + 1) % total)}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-navy/40 hover:bg-navy/70 text-white rounded-full w-8 h-8 flex items-center justify-center transition opacity-0 group-hover:opacity-100 focus:opacity-100"
            >
              ›
            </button>

            <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5">
              {itens.map((n, i) => (
                <button
                  key={n.id}
                  type="button"
                  aria-label={`Ver manchete ${i + 1} de ${total}`}
                  aria-current={i === indice}
                  onClick={() => setIndice(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === indice ? "w-6 bg-white" : "w-1.5 bg-white/60 hover:bg-white/90"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="p-6">
        <span className={`font-bold text-xs uppercase tracking-wide ${CORES_EDITORIA[atual.editoria]}`}>
          {NOME_EDITORIA[atual.editoria]}
        </span>
        <h2 className="font-display text-[26px] font-bold text-navy mt-2 leading-tight">
          <Link href={`/noticia/${atual.slug}`} className="hover:text-urgente transition-colors">
            {atual.titulo}
          </Link>
        </h2>
        {atual.subtitulo && <p className="text-[15px] text-slate-500 mt-2.5 leading-relaxed">{atual.subtitulo}</p>}
        <div className="flex items-center gap-2 mt-4 text-xs text-slate-400 flex-wrap">
          <span className="bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-full">
            Redação IA Radar BV (Modelo {ORIGEM_IA_LABEL[atual.origem_ia]})
          </span>
          {atual.fonte_credito && (
            <>
              <span>•</span>
              <a href={atual.fonte_url_original} className="hover:text-navy hover:underline">
                Com informações de: {atual.fonte_credito}
              </a>
            </>
          )}
          <span>•</span>
          <span>{tempoRelativo(atual.data_publicacao)}</span>
        </div>
      </div>
    </article>
  );
}
