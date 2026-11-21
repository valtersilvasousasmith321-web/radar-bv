"use client";

import { useState } from "react";

export default function BotaoCompartilhar({
  titulo,
  url,
  className,
}: {
  titulo: string;
  url: string;
  className?: string;
}) {
  const [copiado, setCopiado] = useState(false);

  async function compartilhar() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: titulo, url });
        return;
      } catch {
        // pessoa cancelou o menu nativo — não faz nada
        return;
      }
    }

    // navegador sem suporte ao menu nativo (ex.: desktop): copia o link
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(`${titulo}\n\n${url}`)}`,
        "_blank"
      );
    }
  }

  return (
    <button
      type="button"
      onClick={compartilhar}
      className={className}
    >
      {copiado ? "Link copiado!" : "Compartilhar"}
    </button>
  );
}
