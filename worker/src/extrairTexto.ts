import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

const LIMITE_CARACTERES = 10_000;

function limparEspacos(texto: string): string {
  return texto.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** Fallback bem simples: tira tag/script/style na marra, se o Readability falhar ou achar pouco. */
function removerTagsNaMarra(html: string): string {
  const semLixo = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
  return limparEspacos(semLixo);
}

/**
 * Extrai o TEXTO PRINCIPAL de uma página de notícia a partir do HTML bruto,
 * descartando menu, rodapé, anúncios, scripts e widgets — a mesma técnica
 * que navegadores usam no "modo leitura". Antes disso, o HTML inteiro da
 * página (às vezes majoritariamente lixo/boilerplate) era cortado nos
 * primeiros 12 mil caracteres e mandado direto pra IA, o que inchava o
 * prompt, aumentava o "pensamento" interno da IA (e o gasto de tokens/cota
 * nos 3 provedores) e, em páginas muito carregadas, podia até cortar o
 * texto real da notícia fora do que sobrava do limite.
 *
 * Sempre devolve texto puro (nunca HTML), já cortado num tamanho razoável
 * pra entrar no prompt de triagem/redação.
 */
export function extrairTextoPrincipal(html: string, url: string): string {
  try {
    const dom = new JSDOM(html, { url });
    const artigo = new Readability(dom.window.document).parse();
    const texto = artigo?.textContent ? limparEspacos(artigo.textContent) : "";
    // Readability às vezes "acerta" uma página errada (ex: index de categoria
    // disfarçado) e devolve pouca coisa — nesse caso cai pro fallback bruto.
    if (texto.length > 200) {
      return texto.slice(0, LIMITE_CARACTERES);
    }
  } catch {
    // segue pro fallback abaixo
  }
  return removerTagsNaMarra(html).slice(0, LIMITE_CARACTERES);
}
