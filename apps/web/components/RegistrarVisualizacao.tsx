"use client";

import { useEffect, useRef } from "react";

/**
 * Componente invisível (item 15 — Analista de Desempenho/Estratégia):
 * registra 1 visualização real da notícia assim que a página carrega no
 * navegador do leitor. Fica num componente cliente separado (em vez de
 * incrementar direto no Server Component da página) porque a página usa
 * `revalidate` (cache) — incrementar ali contaria "visualização" só uma
 * vez por regeneração de cache, não por leitor de verdade.
 */
export default function RegistrarVisualizacao({ id }: { id: string }) {
  const jaEnviou = useRef(false);

  useEffect(() => {
    if (jaEnviou.current) return;
    jaEnviou.current = true;

    fetch("/api/metricas/visualizar-noticia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
      keepalive: true,
    }).catch(() => {
      // Silencioso de propósito — métrica nunca pode atrapalhar a leitura.
    });
  }, [id]);

  return null;
}
