/** Mesma lógica de `gerarSlug` do worker (worker/src/queue.ts), replicada
 * aqui pro painel admin poder gerar slug na criação manual de notícia sem
 * depender do worker. Mantém o padrão já usado em todo o resto do site:
 * título normalizado + sufixo curto baseado no timestamp, pra garantir
 * unicidade mesmo com títulos repetidos. */
export function gerarSlug(titulo: string): string {
  const base = titulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  const sufixo = Date.now().toString(36).slice(-5);
  return `${base}-${sufixo}`;
}
