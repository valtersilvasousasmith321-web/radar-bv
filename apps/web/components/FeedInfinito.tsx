"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CardNoticiaCompacto } from "@/components/CardNoticia";
import type { Editoria, Noticia } from "@/lib/types";

const QUANTIDADE_POR_PAGINA = 12;

/**
 * Feed com rolagem infinita, do jeito que os grandes portais de notícia
 * (G1, UOL, etc.) funcionam: a pessoa vai descendo a página e o próprio
 * feed vai carregando sozinho o que veio antes — ontem, anteontem, semana
 * passada, e assim por diante, sem fim — em vez de uma lista fixa que para
 * numa certa quantidade de notícias.
 */
export default function FeedInfinito({
  editoria,
  itensIniciais,
  temMaisInicial,
}: {
  editoria: Editoria;
  itensIniciais: Noticia[];
  temMaisInicial: boolean;
}) {
  const [itens, setItens] = useState(itensIniciais);
  const [temMais, setTemMais] = useState(temMaisInicial);
  const [carregando, setCarregando] = useState(false);
  const sentinelaRef = useRef<HTMLDivElement | null>(null);

  const carregarMais = useCallback(async () => {
    setCarregando(true);
    try {
      const resposta = await fetch(
        `/api/noticias?editoria=${editoria}&offset=${itens.length}&quantidade=${QUANTIDADE_POR_PAGINA}`
      );
      if (!resposta.ok) return;
      const dados: { itens: Noticia[]; temMais: boolean } = await resposta.json();
      setItens((atual) => [...atual, ...dados.itens]);
      setTemMais(dados.temMais);
    } finally {
      setCarregando(false);
    }
  }, [editoria, itens.length]);

  useEffect(() => {
    if (!temMais) return;
    const sentinela = sentinelaRef.current;
    if (!sentinela) return;

    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas[0].isIntersecting && !carregando) {
          carregarMais();
        }
      },
      { rootMargin: "600px" } // começa a carregar um pouco antes de chegar no fim, pra não ter soluço
    );

    observador.observe(sentinela);
    return () => observador.disconnect();
  }, [carregarMais, carregando, temMais]);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
        {itens.map((n) => (
          <CardNoticiaCompacto key={n.id} noticia={n} />
        ))}
      </div>

      {temMais && (
        <div ref={sentinelaRef} className="flex justify-center py-10">
          {carregando ? (
            <span className="text-sm text-slate-400">Carregando mais notícias…</span>
          ) : (
            <button
              onClick={carregarMais}
              className="text-sm font-semibold text-esmeralda hover:underline"
            >
              Carregar mais notícias
            </button>
          )}
        </div>
      )}

      {!temMais && itens.length > 0 && (
        <p className="text-center text-sm text-slate-400 py-10">
          Você chegou ao início do nosso arquivo de notícias.
        </p>
      )}
    </>
  );
}
