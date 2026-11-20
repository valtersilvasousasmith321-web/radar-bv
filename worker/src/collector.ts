import crypto from "node:crypto";
import https from "node:https";
import Parser from "rss-parser";
import fetch from "node-fetch";
import { supabase } from "./db.js";
import { log } from "./logger.js";
import { pesquisarNoticias } from "./ai/pesquisador.js";
import type { FonteMonitorada, ItemBruto } from "./types.js";

// Identifica como navegador comum — muitos sites .gov.br e de imprensa
// bloqueiam (403) requisições sem User-Agent, por padrão de segurança (WAF).
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Vários sites .gov.br rodam servidores com TLS mal configurado (certificado
// autoassinado, handshake antigo incompatível com os padrões atuais do Node).
// Como aqui só LEMOS conteúdo público (nunca enviamos dado sensível), relaxar
// a validação do certificado é um risco aceitável para não perder a fonte
// inteira por causa de uma configuração ruim do lado deles.
const agenteTlsPermissivo = new https.Agent({
  rejectUnauthorized: false,
  minVersion: "TLSv1",
  // Alguns servidores .gov.br respondem "unrecognized_name" (alerta TLS 112)
  // porque não reconhecem o nome enviado no SNI (Server Name Indication) —
  // comum em servidores antigos com um único certificado "pega-tudo".
  // servername: "" instrui o Node a não enviar SNI algum, contornando isso.
  servername: "",
});

// Usado só para INTERPRETAR o XML (parseString) — quem busca o feed na rede
// agora é o fetch + agenteTlsPermissivo em coletarRss, não mais o rss-parser.
const rssParser = new Parser({ timeout: 15_000 });

/** Gera hash estável a partir da URL (chave da Trava de Silêncio) */
function gerarHash(url: string): string {
  return crypto.createHash("sha256").update(url.trim().toLowerCase()).digest("hex");
}

/**
 * Trava de Silêncio (Regra de Ouro — item 1):
 * Antes de acionar QUALQUER IA, verifica se a URL já foi processada.
 * Se sim, encerra ali mesmo — custo zero de tokens.
 * Retorna `true` se o item é INÉDITO (deve seguir pro pipeline de IA).
 */
async function ehInedito(url: string): Promise<{ inedito: boolean; hash: string }> {
  const hash = gerarHash(url);
  const { data, error } = await supabase
    .from("urls_processadas")
    .select("id")
    .eq("hash_conteudo", hash)
    .maybeSingle();

  if (error) {
    // Em caso de falha na verificação, por segurança, tratamos como "já visto"
    // para nunca gastar tokens indevidamente em caso de instabilidade do banco.
    await log("warning", "collector", "Falha ao consultar trava de silêncio; assumindo já processado", {
      url,
      error: error.message,
    });
    return { inedito: false, hash };
  }

  return { inedito: !data, hash };
}

/** Marca a URL como processada, fechando a Trava de Silêncio para ela */
export async function marcarComoProcessada(
  fonteId: string,
  url: string,
  hash: string,
  noticiaId?: string
): Promise<void> {
  const { error } = await supabase.from("urls_processadas").insert({
    fonte_id: fonteId,
    url,
    hash_conteudo: hash,
    noticia_id: noticiaId ?? null,
  });
  if (error) {
    await log("error", "collector", "Falha ao marcar URL como processada", { url, error: error.message });
  }
}

/** Busca as fontes ativas cadastradas em `fontes_monitoradas` */
async function buscarFontesAtivas(): Promise<FonteMonitorada[]> {
  const { data, error } = await supabase.from("fontes_monitoradas").select("*").eq("ativa", true);

  if (error) {
    await log("error", "collector", "Falha ao buscar fontes monitoradas", { error: error.message });
    return [];
  }
  return data as FonteMonitorada[];
}

/**
 * Extrai itens de uma fonte do tipo RSS.
 *
 * Antes, isso usava rssParser.parseURL(), que faz sua PRÓPRIA requisição por
 * dentro (https.get nativo do Node), repassando o agente TLS via
 * `requestOptions`. Isso funciona na teoria, mas é um segundo caminho de rede
 * paralelo ao do coletarHtml — e foi exatamente nesse caminho que as fontes
 * .gov.br continuaram falhando mesmo depois da correção, então não dá mais
 * pra confiar nele sem reserva.
 *
 * Agora buscamos o XML nós mesmos com o MESMO fetch + agente já comprovado em
 * coletarHtml, e só então entregamos o texto já baixado para o rssParser
 * interpretar (parseString, não parseURL). Um único caminho de rede pro
 * sistema inteiro — mais fácil de confiar e de depurar no futuro.
 */
async function coletarRss(fonte: FonteMonitorada): Promise<ItemBruto[]> {
  const resposta = await fetch(fonte.url_base, {
    signal: AbortSignal.timeout(15_000),
    headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml,application/xml,text/xml" },
    agent: fonte.url_base.startsWith("https:") ? agenteTlsPermissivo : undefined,
  });
  if (!resposta.ok) {
    throw new Error(`HTTP ${resposta.status} ao buscar feed ${fonte.url_base}`);
  }
  const xml = await resposta.text();
  const feed = await rssParser.parseString(xml);
  return (feed.items ?? []).slice(0, 20).map((item) => ({
    fonteId: fonte.id,
    fonteNome: fonte.nome,
    url: item.link ?? fonte.url_base,
    tituloOriginal: item.title ?? "(sem título)",
    // Testado contra feeds reais: rss-parser expõe <content:encoded> tanto em
    // "content:encoded" quanto, na ausência dele, mapeia <description> em "content".
    conteudoBruto: item["content:encoded"] ?? item.content ?? "",
    editoriaPadrao: fonte.editoria_padrao,
    publicadoEm: item.pubDate,
  }));
}

/**
 * Extrai links de notícias individuais de uma página de listagem/categoria
 * (ex: portal.../categoria/roraima/, que mistura várias manchetes, menu e
 * barra lateral num só HTML). Sem isso, a página inteira virava "1 item" e
 * nenhuma IA conseguia separar notícia de lixo de página — o verdadeiro
 * motivo de tantas fontes caírem em "sujeira de página" na triagem.
 *
 * Heurística: mesmo domínio da fonte + último segmento do caminho com cara
 * de slug de notícia (tem hífen e é razoavelmente longo) — filtra fora
 * menu, rodapé, redes sociais, tags/categorias e paginação.
 */
function extrairLinksDeArtigos(html: string, urlBase: string): Array<{ url: string; tituloCandidato: string }> {
  const hostBase = new URL(urlBase).hostname;
  const vistos = new Map<string, string>(); // url -> título candidato
  const regexAncora = /<a\s+[^>]*href=["']([^"'#]+)["'][^>]*>(.*?)<\/a>/gis;

  let match: RegExpExecArray | null;
  while ((match = regexAncora.exec(html)) !== null) {
    const hrefBruto = match[1].trim();
    if (!hrefBruto || hrefBruto.startsWith("javascript:") || hrefBruto.startsWith("mailto:") || hrefBruto.startsWith("tel:")) {
      continue;
    }

    let absoluta: URL;
    try {
      absoluta = new URL(hrefBruto, urlBase);
    } catch {
      continue;
    }
    if (absoluta.hostname !== hostBase) continue; // só notícias do próprio site da fonte

    const segmentos = absoluta.pathname.split("/").filter(Boolean);
    const ultimoSegmento = segmentos[segmentos.length - 1] ?? "";
    // Páginas de categoria/tag/página de listagem não têm cara de notícia individual.
    const pareceListagem = /^(categoria|category|tag|tudo-sobre|page|pagina|busca|search)$/i.test(segmentos[0] ?? "") || /^\d+$/.test(ultimoSegmento);
    const pareceArtigo = ultimoSegmento.length > 15 && ultimoSegmento.includes("-") && !pareceListagem;
    if (!pareceArtigo) continue;

    const textoAncora = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const urlLimpa = absoluta.toString();
    const tituloAtual = vistos.get(urlLimpa);
    // Mantém o maior texto de âncora encontrado pro mesmo link (a 1ª ocorrência costuma ser só uma imagem/ícone)
    if (!tituloAtual || textoAncora.length > tituloAtual.length) {
      vistos.set(urlLimpa, textoAncora);
    }
  }

  return Array.from(vistos.entries())
    .map(([url, tituloCandidato]) => ({ url, tituloCandidato }))
    .slice(0, 10);
}

/**
 * Busca o HTML de UMA URL de artigo específico, com o mesmo User-Agent e
 * agente TLS permissivo usados no resto do coletor. Retorna null em caso de
 * falha (isolado — quem chama decide o que fazer, nunca propaga o erro).
 * Compartilhado entre coletarHtml (links extraídos de página de listagem) e
 * coletarBusca (links encontrados pelo pesquisador via busca na web).
 */
async function buscarConteudoDeUrl(url: string): Promise<string | null> {
  try {
    const resposta = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      agent: url.startsWith("https:") ? agenteTlsPermissivo : undefined,
    });
    if (!resposta.ok) return null;
    return await resposta.text();
  } catch {
    return null;
  }
}

/**
 * Extrai itens de uma fonte do tipo "busca" (item 3 do plano de estrutura
 * grande): em vez de depender de uma única página/URL fixa, pesquisa o TEMA
 * cadastrado (fonte.url_base) na web de verdade via pesquisador.ts — a mesma
 * lógica de busca que a IA usa quando alguém pede uma notícia no chat — e
 * busca o conteúdo completo de cada artigo individual encontrado.
 */
async function coletarBusca(fonte: FonteMonitorada): Promise<ItemBruto[]> {
  const encontrados = await pesquisarNoticias(fonte.url_base, 5);
  if (encontrados.length === 0) return [];

  const itens = await Promise.all(
    encontrados.map(async ({ url, tituloCandidato }): Promise<ItemBruto | null> => {
      const htmlArtigo = await buscarConteudoDeUrl(url);
      if (!htmlArtigo) return null;
      return {
        fonteId: fonte.id,
        fonteNome: fonte.nome,
        url,
        tituloOriginal: tituloCandidato || fonte.nome,
        conteudoBruto: htmlArtigo,
        editoriaPadrao: fonte.editoria_padrao,
      };
    })
  );

  return itens.filter((item): item is ItemBruto => item !== null);
}

/** Extrai itens de uma fonte do tipo HTML simples (scraping leve) */
async function coletarHtml(fonte: FonteMonitorada): Promise<ItemBruto[]> {
  // node-fetch v3 NÃO suporta mais a opção "timeout" (removida desde a v2) —
  // ela é silenciosamente ignorada, então uma fonte travada ficaria pendurada
  // para sempre e, por estarmos dentro de um Promise.all (ver executarCicloDeColeta),
  // travaria o ciclo de coleta inteiro, quebrando o Isolamento de Fontes.
  // AbortSignal.timeout é a forma correta de aplicar timeout real aqui.
  const resposta = await fetch(fonte.url_base, {
    signal: AbortSignal.timeout(15_000),
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
    agent: fonte.url_base.startsWith("https:") ? agenteTlsPermissivo : undefined,
  });
  if (!resposta.ok) {
    throw new Error(`HTTP ${resposta.status} ao buscar ${fonte.url_base}`);
  }
  const html = await resposta.text();

  const links = extrairLinksDeArtigos(html, fonte.url_base);

  if (links.length === 0) {
    // Nenhum link de notícia individual identificado (ex: a própria fonte já
    // É uma página de 1 notícia só, tipo um comunicado de imprensa) — mantém
    // o comportamento antigo de tratar a página inteira como 1 item.
    return [
      {
        fonteId: fonte.id,
        fonteNome: fonte.nome,
        url: fonte.url_base,
        tituloOriginal: fonte.nome,
        conteudoBruto: html,
        editoriaPadrao: fonte.editoria_padrao,
      },
    ];
  }

  // Página de listagem/categoria: busca o conteúdo de CADA notícia individual
  // separadamente, igual já acontece pra fontes RSS — isolado por link, uma
  // falha numa notícia não derruba as outras (mesmo princípio do Isolamento
  // de Fontes, só que agora por item dentro da própria fonte).
  const itens = await Promise.all(
    links.map(async ({ url, tituloCandidato }): Promise<ItemBruto | null> => {
      const htmlArtigo = await buscarConteudoDeUrl(url);
      if (!htmlArtigo) return null; // isolado: uma notícia falhando não derruba as outras da mesma fonte
      return {
        fonteId: fonte.id,
        fonteNome: fonte.nome,
        url,
        tituloOriginal: tituloCandidato || fonte.nome,
        conteudoBruto: htmlArtigo,
        editoriaPadrao: fonte.editoria_padrao,
      };
    })
  );

  return itens.filter((item): item is ItemBruto => item !== null);
}

/**
 * Isolamento de Fontes (Regra de Ouro — item 5): erro em uma fonte não
 * derruba a coleta das demais. Contabiliza erros consecutivos por fonte.
 */
async function coletarDeUmaFonte(fonte: FonteMonitorada): Promise<ItemBruto[]> {
  try {
    const itens =
      fonte.tipo === "rss"
        ? await coletarRss(fonte)
        : fonte.tipo === "busca"
          ? await coletarBusca(fonte)
          : await coletarHtml(fonte);

    if (fonte.erros_consecutivos > 0) {
      await supabase.from("fontes_monitoradas").update({ erros_consecutivos: 0, ultimo_erro: null }).eq("id", fonte.id);
    }
    await supabase.from("fontes_monitoradas").update({ ultima_verificacao: new Date().toISOString() }).eq("id", fonte.id);

    return itens;
  } catch (err: any) {
    const novosErros = (fonte.erros_consecutivos ?? 0) + 1;
    await supabase
      .from("fontes_monitoradas")
      .update({
        erros_consecutivos: novosErros,
        ultimo_erro: String(err?.message ?? err),
        ultima_verificacao: new Date().toISOString(),
        // Desativa automaticamente fontes muito instáveis, para não insistir
        // em algo quebrado — mantém o restante do sistema saudável.
        ativa: novosErros < 10,
      })
      .eq("id", fonte.id);

    await log("error", "collector", `Falha ao coletar da fonte "${fonte.nome}" — isolada`, {
      fonteId: fonte.id,
      erro: String(err?.message ?? err),
      erros_consecutivos: novosErros,
    });
    return []; // isolado: as demais fontes continuam normalmente
  }
}

/**
 * Executa um ciclo completo de coleta: varre todas as fontes ativas,
 * aplica a Trava de Silêncio e retorna só os itens INÉDITOS, já com
 * o hash calculado (para marcar como processado depois do pipeline de IA).
 */
export async function executarCicloDeColeta(): Promise<Array<ItemBruto & { hash: string }>> {
  const fontes = await buscarFontesAtivas();
  if (fontes.length === 0) {
    await log("warning", "collector", "Nenhuma fonte ativa encontrada");
    return [];
  }

  const resultadosPorFonte = await Promise.all(fontes.map(coletarDeUmaFonte));
  const todosItens = resultadosPorFonte.flat();

  const inéditos: Array<ItemBruto & { hash: string }> = [];
  for (const item of todosItens) {
    const { inedito, hash } = await ehInedito(item.url);
    if (inedito) {
      inéditos.push({ ...item, hash });
    }
  }

  await log("info", "collector", `Ciclo de coleta concluído: ${todosItens.length} itens vistos, ${inéditos.length} inéditos`);
  return inéditos;
}
