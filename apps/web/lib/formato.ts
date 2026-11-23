export function tempoRelativo(iso: string | null): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.round(h / 24);
  return `há ${d}d`;
}

export function dataCompleta(iso: string | null): string {
  if (!iso) return "";
  // Bug flagrado por Valter em 23/11/2026: faltava "timeZone" aqui, então a
  // hora exibida usava o fuso do SERVIDOR (Vercel roda em UTC), não o fuso
  // real de Boa Vista/Roraima (UTC-4) — por isso a maioria das matérias
  // aparecia com a mesma hora "errada" (deslocada 4h pra frente do horário
  // real em que foram publicadas). O dado salvo (data_publicacao) sempre
  // esteve certo; só a exibição estava sem fuso horário definido.
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Boa_Vista",
  });
}
