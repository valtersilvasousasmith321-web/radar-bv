import crypto from "node:crypto";
import https from "node:https";
import Parser from "rss-parser";
import fetch from "node-fetch";
import { supabase } from "./db.js";
import { log } from "./logger.js";
import { pesquisarNoticias, pesquisarResumoServico } from "./ai/pesquisador.js";
import { extrairTextoPrincipal } from "./extrairTexto.js";
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
    creditarPublicamente: fonte.creditar_publicamente,
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

/** Nomes de mês por extenso → número, pra ler data tipo "23 de novembro de 2026". */
const MESES_PT: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  março: 3,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

/**
 * Acha a primeira data em formato brasileiro dentro de um pedaço de texto
 * (dd/mm/aaaa, dd-mm-aaaa ou "dd de mês de aaaa"). Usado pra ler a data que
 * fica do lado de cada link numa página de listagem tipo o Portal da
 * Transparência — Valter apontou que lá cada licitação já vem com a data
 * publicada ao lado, então dá pra filtrar o que é velho sem precisar abrir
 * o PDF primeiro.
 */
function extrairDataProxima(texto: string): Date | null {
  const numerica = texto.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
  if (numerica) {
    const [, d, m, a] = numerica;
    const data = new Date(Number(a), Number(m) - 1, Number(d));
    if (!Number.isNaN(data.getTime())) return data;
  }

  const porExtenso = texto.match(/\b(\d{1,2})\s+de\s+([a-zçãéá]+)\s+de\s+(\d{4})\b/i);
  if (porExtenso) {
    const [, d, mesNome, a] = porExtenso;
    const mes = MESES_PT[mesNome.toLowerCase()];
    if (mes) {
      const data = new Date(Number(a), mes - 1, Number(d));
      if (!Number.isNaN(data.getTime())) return data;
    }
  }

  return null;
}

// Quantos dias de folga aceitar entre "hoje" e a data encontrada ao lado do
// link, antes de considerar o documento velho e pular — cobre fim de
// semana/feriado (site sem publicação nova) e pequena defasagem entre a
// data de abertura/publicação exibida e o dia em que o ciclo de coleta rodou.
const JANELA_DIAS_DOCUMENTO_RECENTE = 3;

// Tags que, na prática, costumam fechar "uma linha/item" de uma listagem
// (linha de tabela, item de lista, bloco de card). Usadas pra limitar a
// busca de data ao redor de um link à MESMA linha/item, nunca vazando pra
// linha vizinha — ver extrairLinksDePdf.
const REGEX_FIM_DE_BLOCO = /<\/(tr|li|div|p)>/gi;

// Teto de segurança: mesmo sem achar nenhuma tag de fechamento por perto
// (HTML malformado, tudo numa linha só), nunca deixa o contexto de busca de
// data passar disso, de cada lado do link.
const TETO_CONTEXTO_DATA = 600;

/**
 * Devolve [início, fim] do trecho de HTML onde faz sentido procurar a data
 * de UM link específico: do fim da linha/item ANTERIOR até o fim da
 * linha/item ATUAL (a mais próxima tag de fechamento tr/li/div/p depois do
 * link) — nunca inclui texto da próxima linha. Sem isso, um contexto de
 * tamanho fixo em caracteres vaza pra linha vizinha em listas com linhas
 * curtas e acaba "contaminando" item velho com a data do item novo do lado.
 */
function limitesDoBlocoDoLink(html: string, inicioLink: number, fimLink: number): [number, number] {
  REGEX_FIM_DE_BLOCO.lastIndex = 0;
  let fimBlocoAnterior = 0;
  let m: RegExpExecArray | null;
  while ((m = REGEX_FIM_DE_BLOCO.exec(html)) !== null) {
    if (m.index >= inicioLink) break;
    fimBlocoAnterior = m.index + m[0].length;
  }

  REGEX_FIM_DE_BLOCO.lastIndex = fimLink;
  const proximoFechamento = REGEX_FIM_DE_BLOCO.exec(html);
  const fimBlocoAtual = proximoFechamento ? proximoFechamento.index + proximoFechamento[0].length : html.length;

  return [Math.max(fimBlocoAnterior, inicioLink - TETO_CONTEXTO_DATA), Math.min(fimBlocoAtual, fimLink + TETO_CONTEXTO_DATA)];
}

/**
 * Mesma ideia de extrairLinksDeArtigos, mas pra páginas de listagem que
 * linkam DOCUMENTOS (PDF) em vez de matérias — caso do Portal da
 * Transparência da Prefeitura (licitações, atas, editais), que só expõe
 * PDF pra baixar, nunca uma página de notícia de verdade. A heurística de
 * "slug com hífen" não serve aqui (os links são tipo
 * /arquivos/download/documentos/19208, sem hífen nenhum), então o critério
 * vira: termina em .pdf OU o caminho tem "/download/".
 *
 * Também tenta achar a data que normalmente fica do lado do link na
 * listagem (pedido do Valter: nunca pegar documento velho) — olha só o
 * texto da MESMA linha/item do link (ver limitesDoBlocoDoLink) e descarta
 * direto o que for mais velho que `JANELA_DIAS_DOCUMENTO_RECENTE`. Quando
 * não acha nenhuma data por perto (layout que eu não previ), mantém o
 * item — a Trava de Silêncio já impede reprocessar o mesmo documento de
 * novo, então errar pro lado de manter é mais seguro que perder cobertura.
 */
function extrairLinksDePdf(html: string, urlBase: string): Array<{ url: string; tituloCandidato: string }> {
  const hostBase = new URL(urlBase).hostname;
  const vistos = new Map<string, { tituloCandidato: string; dataEncontrada: Date | null }>();
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
    if (absoluta.hostname !== hostBase) continue; // só documentos do próprio site da fonte

    const pareceDocumento = /\.pdf(?:$|\?)/i.test(absoluta.pathname) || /\/download\//i.test(absoluta.pathname);
    if (!pareceDocumento) continue;

    const textoAncora = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    const [inicioContexto, fimContexto] = limitesDoBlocoDoLink(html, match.index, match.index + match[0].length);
    const textoContexto = html
      .slice(inicioContexto, fimContexto)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");
    const dataEncontrada = extrairDataProxima(textoContexto);

    const urlLimpa = absoluta.toString();
    const existente = vistos.get(urlLimpa);
    if (!existente || textoAncora.length > existente.tituloCandidato.length) {
      vistos.set(urlLimpa, { tituloCandidato: textoAncora, dataEncontrada: dataEncontrada ?? existente?.dataEncontrada ?? null });
    }
  }

  const hoje = new Date();
  const limiteAntigo = new Date(hoje);
  limiteAntigo.setDate(limiteAntigo.getDate() - JANELA_DIAS_DOCUMENTO_RECENTE);

  return Array.from(vistos.entries())
    .filter(([, info]) => !info.dataEncontrada || info.dataEncontrada >= limiteAntigo)
    .map(([url, info]) => ({ url, tituloCandidato: info.tituloCandidato }))
    .slice(0, 10);
}

/**
 * Baixa UM PDF e extrai o texto (pdf-parse). Isolado por documento — um PDF
 * corrompido, escaneado sem OCR (sem texto nenhum) ou grande demais não
 * derruba os outros da mesma fonte, só retorna null e esse item é pulado.
 *
 * Diário Oficial e atas de licitação às vezes têm centenas de páginas —
 * cortamos o texto em 15.000 caracteres pra não estourar o limite de
 * contexto da IA na hora de redigir (a matéria vai sair de qualquer forma,
 * só que baseada no começo do documento, que normalmente é onde está o
 * resumo/objeto do que está sendo decidido).
 */
async function baixarEExtrairPdf(url: string): Promise<string | null> {
  try {
    const resposta = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": USER_AGENT, Accept: "application/pdf" },
      agent: url.startsWith("https:") ? agenteTlsPermissivo : undefined,
    });
    if (!resposta.ok) return null;

    const buffer = Buffer.from(await resposta.arrayBuffer());
    const pdfParse = (await import("pdf-parse")).default;
    const resultado = await pdfParse(buffer);
    const texto = (resultado.text ?? "").trim();

    // PDF escaneado como imagem (sem camada de texto) extrai string vazia
    // ou só lixo — melhor descartar que mandar "nada" pra IA redigir.
    if (texto.length < 100) return null;

    return texto.slice(0, 15_000);
  } catch {
    return null;
  }
}

/**
 * Extrai itens de uma fonte do tipo PDF: a fonte é uma página de LISTAGEM
 * (ex: .../licitacoes) que linka vários documentos PDF — não um PDF direto.
 * Mesmo Isolamento de Fontes dos outros tipos: PDF que falhar ao baixar ou
 * extrair é só descartado, não derruba os demais documentos da mesma fonte.
 */
async function coletarPdf(fonte: FonteMonitorada): Promise<ItemBruto[]> {
  const resposta = await fetch(fonte.url_base, {
    signal: AbortSignal.timeout(15_000),
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
    agent: fonte.url_base.startsWith("https:") ? agenteTlsPermissivo : undefined,
  });
  if (!resposta.ok) {
    throw new Error(`HTTP ${resposta.status} ao buscar ${fonte.url_base}`);
  }
  const html = await resposta.text();
  const links = extrairLinksDePdf(html, fonte.url_base);

  if (links.length === 0) {
    // Página de listagem sem nenhum link de PDF reconhecido — provavelmente
    // o site mudou de estrutura. Diferente do coletarHtml, aqui NÃO faz
    // sentido tratar a própria página de listagem como "1 item" (ela não
    // tem conteúdo de notícia, só uma lista de links) — melhor não publicar
    // nada nesse ciclo do que publicar lixo de menu/rodapé.
    return [];
  }

  const itens = await Promise.all(
    links.map(async ({ url, tituloCandidato }): Promise<ItemBruto | null> => {
      const texto = await baixarEExtrairPdf(url);
      if (!texto) return null; // isolado: um PDF falhando não derruba os outros
      return {
        fonteId: fonte.id,
        fonteNome: fonte.nome,
        url,
        tituloOriginal: tituloCandidato || fonte.nome,
        conteudoBruto: texto,
        editoriaPadrao: fonte.editoria_padrao,
        creditarPublicamente: fonte.creditar_publicamente,
      };
    })
  );

  return itens.filter((item): item is ItemBruto => item !== null);
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
/**
 * Serviço ao Cidadão (vagas, editais, matrícula) nunca é "matéria com URL
 * própria" — é listagem de portal que muda de dia a dia. Flagrado pelo
 * Valter em 24/11/2026: a editoria vivia vazia porque coletarBusca normal
 * exige achar uma notícia com URL individual (ver pesquisarNoticias), e
 * esse tipo de conteúdo nunca tem isso, por natureza — então a busca
 * sempre voltava vazia, sem nunca dar erro (por isso a fonte parecia
 * "saudável" mesmo nunca produzindo nada).
 *
 * Em vez disso, gera UM item sintético por dia por fonte, com um resumo
 * do que está em aberto AGORA (pesquisarResumoServico) — a URL é
 * fabricada com a data de hoje embutida, só pra servir de identificador
 * único (fecha a Trava de Silêncio normalmente, pra não reprocessar o
 * mesmo dia 2x, e abre de novo sozinha no dia seguinte).
 */
async function coletarResumoServico(fonte: FonteMonitorada): Promise<ItemBruto[]> {
  const resumo = await pesquisarResumoServico(fonte.url_base);
  if (!resumo || resumo.semNovidade || !resumo.texto.trim()) return [];

  // A URL exibida publicamente como "ver fonte" tem que ser real e
  // clicável (resumo.urlFonte) — mas se ela for sempre a mesma página fixa
  // (ex: "sine.rr.gov.br/vagas" todo santo dia), a Trava de Silêncio (que
  // nunca reprocessa a mesma URL duas vezes, pra sempre) travaria a
  // atualização diária depois da primeira vez. Por isso soma um parâmetro
  // com a data de hoje à URL real: continua abrindo a página verdadeira
  // pro leitor (sites ignoram parâmetro desconhecido), mas vira um
  // identificador novo a cada dia pra Trava de Silêncio.
  const hoje = new Date().toISOString().slice(0, 10);
  const separador = resumo.urlFonte.includes("?") ? "&" : "?";
  const urlComData = `${resumo.urlFonte}${separador}radarbv_d=${hoje}`;

  return [
    {
      fonteId: fonte.id,
      fonteNome: fonte.nome,
      url: urlComData,
      tituloOriginal: fonte.nome,
      conteudoBruto: resumo.texto,
      editoriaPadrao: fonte.editoria_padrao,
      creditarPublicamente: fonte.creditar_publicamente,
    },
  ];
}

async function coletarBusca(fonte: FonteMonitorada): Promise<ItemBruto[]> {
  if (fonte.editoria_padrao === "servico_cidadao") {
    return coletarResumoServico(fonte);
  }

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
        conteudoBruto: extrairTextoPrincipal(htmlArtigo, url),
        editoriaPadrao: fonte.editoria_padrao,
        creditarPublicamente: fonte.creditar_publicamente,
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
        conteudoBruto: extrairTextoPrincipal(html, fonte.url_base),
        editoriaPadrao: fonte.editoria_padrao,
        creditarPublicamente: fonte.creditar_publicamente,
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
        conteudoBruto: extrairTextoPrincipal(htmlArtigo, url),
        editoriaPadrao: fonte.editoria_padrao,
        creditarPublicamente: fonte.creditar_publicamente,
      };
    })
  );

  return itens.filter((item): item is ItemBruto => item !== null);
}

/**
 * Isolamento de Fontes (Regra de Ouro — item 5): erro em uma fonte não
 * derruba a coleta das demais. Contabiliza erros consecutivos por fonte.
 */
/**
 * Equilíbrio de Proporção (flagrado na auditoria de 21/11/2026 — Valter
 * notou "muita matéria do Brasil e do mundo" dominando o feed): fontes de
 * tema muito amplo e sempre-renovado (ex.: busca nacional/internacional)
 * trazem item inédito quase toda hora, enquanto fontes locais (Boa Vista,
 * bairros) têm bem menos novidade por ciclo — sem controle, isso lotava o
 * portal de notícia de fora e sufocava a cobertura local, que é o foco
 * principal do Radar BV. Quando a fonte tem `limite_diario` configurado,
 * conta quantas notícias já vieram dela nas últimas 24h e, se já bateu o
 * teto, pula a coleta inteira desse ciclo pra essa fonte (nem gasta
 * chamada de busca/IA à toa).
 */
async function dentroDoLimiteDiario(fonte: FonteMonitorada): Promise<boolean> {
  if (!fonte.limite_diario) return true;

  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("noticias")
    .select("id", { count: "exact", head: true })
    .eq("fonte_id", fonte.id)
    .gte("criado_em", desde);

  if (error) {
    // Falha na contagem não pode travar a coleta — deixa passar nesse ciclo.
    await log("warning", "collector", "Falha ao checar limite diário da fonte — coletando normalmente", {
      fonteId: fonte.id,
      erro: error.message,
    });
    return true;
  }

  return (count ?? 0) < fonte.limite_diario;
}

async function coletarDeUmaFonte(fonte: FonteMonitorada): Promise<ItemBruto[]> {
  if (!(await dentroDoLimiteDiario(fonte))) {
    await log("info", "collector", `Fonte "${fonte.nome}" já atingiu o limite diário — coleta pulada neste ciclo`, {
      fonteId: fonte.id,
      limite: fonte.limite_diario,
    });
    return [];
  }

  try {
    const itens =
      fonte.tipo === "rss"
        ? await coletarRss(fonte)
        : fonte.tipo === "busca"
          ? await coletarBusca(fonte)
          : fonte.tipo === "pdf"
            ? await coletarPdf(fonte)
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
