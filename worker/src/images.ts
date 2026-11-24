import fetch from "node-fetch";
import { config } from "./config.js";
import { supabase } from "./db.js";
import { log } from "./logger.js";
import { escolherMelhorImagem, validarImagemBancoProprio, sugerirPalavrasChaveAlternativas, type CandidatoImagem } from "./ai/editorImagens.js";
import { perguntar, jaInformouHoje } from "./relatorios.js";
import type { Editoria, ResultadoImagem } from "./types.js";

/** Contexto estruturado da matéria, usado tanto pro casamento de tags quanto pro Verificador de Imagem (precisa de título/subtítulo legíveis, não um blob achatado). */
export interface ContextoImagemMateria {
  titulo: string;
  subtitulo: string;
  tags: string[];
}

interface UnsplashResultado {
  results: Array<{ urls: { regular: string }; user: { name: string }; alt_description: string | null; description: string | null }>;
}
interface PexelsResultado {
  photos: Array<{ src: { large: string }; photographer: string; alt: string | null }>;
}
interface PixabayResultado {
  hits: Array<{ largeImageURL: string; user: string; tags: string }>;
}
interface WikimediaResultado {
  query?: {
    pages?: Record<
      string,
      {
        title?: string;
        imageinfo?: Array<{
          url: string;
          thumburl?: string;
          extmetadata?: { Artist?: { value: string }; ImageDescription?: { value: string } };
        }>;
      }
    >;
  };
}
interface OpenverseResultado {
  results: Array<{ url: string; title: string | null; creator: string | null; license: string }>;
}

// Quantas candidatas trazer de cada banco por busca — o suficiente pro
// Editor de Imagens (item 8) ter opção de verdade pra escolher, sem pedir
// tanto a ponto de gastar banda/tempo à toa.
const QTD_CANDIDATAS = 6;

async function buscarCandidatosUnsplash(palavraChave: string): Promise<CandidatoImagem[]> {
  if (!config.imagens.unsplashAccessKey) return [];
  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(palavraChave)}&per_page=${QTD_CANDIDATAS}&orientation=landscape`;
    const resposta = await fetch(url, {
      headers: { Authorization: `Client-ID ${config.imagens.unsplashAccessKey}` },
      signal: AbortSignal.timeout(8_000), // timeout real — evita travar a publicação esperando a API de imagens
    });
    if (!resposta.ok) return [];
    const json = (await resposta.json()) as UnsplashResultado;
    return (json.results ?? []).map((foto) => ({
      url: foto.urls.regular,
      credito: `Foto: ${foto.user.name} / Unsplash`,
      descricao: foto.alt_description || foto.description || "",
    }));
  } catch {
    return [];
  }
}

async function buscarCandidatosPexels(palavraChave: string): Promise<CandidatoImagem[]> {
  if (!config.imagens.pexelsApiKey) return [];
  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(palavraChave)}&per_page=${QTD_CANDIDATAS}&orientation=landscape`;
    const resposta = await fetch(url, {
      headers: { Authorization: config.imagens.pexelsApiKey },
      signal: AbortSignal.timeout(8_000),
    });
    if (!resposta.ok) return [];
    const json = (await resposta.json()) as PexelsResultado;
    return (json.photos ?? []).map((foto) => ({
      url: foto.src.large,
      credito: `Foto: ${foto.photographer} / Pexels`,
      descricao: foto.alt || "",
    }));
  } catch {
    return [];
  }
}

async function buscarCandidatosPixabay(palavraChave: string): Promise<CandidatoImagem[]> {
  if (!config.imagens.pixabayApiKey) return [];
  try {
    const url = `https://pixabay.com/api/?key=${config.imagens.pixabayApiKey}&q=${encodeURIComponent(palavraChave)}&image_type=photo&orientation=horizontal&per_page=${QTD_CANDIDATAS}&safesearch=true`;
    const resposta = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!resposta.ok) return [];
    const json = (await resposta.json()) as PixabayResultado;
    return (json.hits ?? []).map((foto) => ({
      url: foto.largeImageURL,
      credito: `Foto: ${foto.user} / Pixabay`,
      descricao: foto.tags || "",
    }));
  } catch {
    return [];
  }
}

/**
 * Pesquisador de Imagem (22/11/2026) — mais dois bancos de busca, pra dar
 * mais chance real de achar foto compatível antes de cair no genérico.
 * Nenhum dos dois exige chave de API (busca pública, sem autenticação):
 *
 * Wikimedia Commons: o acervo de mídia livre da Wikipédia — milhões de
 * fotos de prédios, cidades, eventos, pessoas públicas, países inteiros,
 * TODAS sob licença livre (Creative Commons ou domínio público) por regra
 * do próprio Commons, então nenhuma checagem extra de licença é necessária
 * aqui (mesmo princípio de confiança já usado pro Unsplash/Pixabay/Pexels).
 */
async function buscarCandidatosWikimedia(palavraChave: string): Promise<CandidatoImagem[]> {
  try {
    const url =
      `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6` +
      `&gsrsearch=${encodeURIComponent(palavraChave)}&gsrlimit=${QTD_CANDIDATAS}` +
      `&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1280&format=json&origin=*`;
    const resposta = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!resposta.ok) return [];
    const json = (await resposta.json()) as WikimediaResultado;
    const paginas = Object.values(json.query?.pages ?? {});

    const candidatos: CandidatoImagem[] = [];
    for (const pagina of paginas) {
      const info = pagina.imageinfo?.[0];
      const urlFoto = info?.thumburl || info?.url;
      // Filtra fora ícone/mapa/documento (svg, pdf, tif) — só foto de verdade.
      if (!urlFoto || !/\.(jpe?g|png)(\?|$)/i.test(urlFoto)) continue;
      const artista = (info?.extmetadata?.Artist?.value ?? "").replace(/<[^>]+>/g, "").trim();
      const descricaoCrua = (info?.extmetadata?.ImageDescription?.value ?? "").replace(/<[^>]+>/g, "").trim();
      const titulo = (pagina.title ?? "").replace(/^File:/i, "").replace(/\.(jpe?g|png)$/i, "").replace(/[_-]+/g, " ");
      candidatos.push({
        url: urlFoto,
        credito: `Foto: ${artista || "autor desconhecido"} / Wikimedia Commons`,
        descricao: descricaoCrua || titulo,
      });
    }
    return candidatos;
  } catch {
    return [];
  }
}

/**
 * Openverse: buscador da Creative Commons que agrega milhões de fotos de
 * dezenas de fontes (Flickr, museus, arquivos públicos etc.), todas já
 * catalogadas por licença. `license_type=commercial` filtra SÓ as que
 * permitem uso comercial — necessário aqui porque o Radar BV é monetizado
 * com banner, então uma licença "não-comercial" não serve pro portal.
 */
async function buscarCandidatosOpenverse(palavraChave: string): Promise<CandidatoImagem[]> {
  try {
    const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(palavraChave)}&license_type=commercial&page_size=${QTD_CANDIDATAS}`;
    const resposta = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!resposta.ok) return [];
    const json = (await resposta.json()) as OpenverseResultado;
    return (json.results ?? []).map((foto) => ({
      url: foto.url,
      credito: `Foto: ${foto.creator || "autor desconhecido"} / Openverse (${foto.license.toUpperCase()})`,
      descricao: foto.title || "",
    }));
  } catch {
    return [];
  }
}

/**
 * Rodízio do Banco de Fotos Próprias (flagrado por Valter em 23/11/2026:
 * "nossas fotos continuam a ser repetidas") — grava quando cada foto foi
 * usada por último, pra próxima escolha sempre priorizar a MENOS usada
 * recentemente em vez de sortear sem memória nenhuma. Nunca bloqueia nem
 * derruba o pipeline se a gravação falhar (mesma regra fail-open de sempre
 * — uma foto repetida é bem menos grave que uma notícia que não sai).
 */
async function marcarImagemComoUsada(id: string): Promise<void> {
  try {
    const { error } = await supabase.from("imagens_fallback").update({ ultima_vez_usada: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
  } catch (err) {
    console.error("[images] falha ao gravar rodízio de uso da foto (não afeta a publicação):", err);
  }
}

/** Busca a imagem padrão pré-cadastrada para a editoria (Banco de Imagens de Segurança) */
async function buscarImagemFallback(editoria: Editoria): Promise<ResultadoImagem> {
  // Ordenado por rodízio: se um dia existir mais de 1 foto institucional
  // marcada "padrao" pra mesma editoria, elas se revezam em vez de a
  // primeira cadastrada sair sempre na frente.
  const { data } = await supabase
    .from("imagens_fallback")
    .select("id, url")
    .eq("editoria", editoria)
    .eq("padrao", true)
    .order("ultima_vez_usada", { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();

  if (data?.url) {
    await marcarImagemComoUsada(data.id);
    return { url: data.url, credito: "Imagem institucional Radar BV", eFallback: true };
  }

  // Fallback do fallback: uma imagem genérica fixa, para o pipeline nunca travar
  return {
    url: `${config.site.baseUrl}/img/fallback/generico.jpg`,
    credito: "Imagem institucional Radar BV",
    eFallback: true,
  };
}

/** Normaliza texto pra comparação de tags: minúsculo e sem acento */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Banco de Imagens Próprias: procura, entre as fotos reais cadastradas pelo
 * Valter (obras, prédios públicos, viaturas, rio/seca etc.), alguma cuja tag
 * bata com o CONTEÚDO de verdade da matéria — título, subtítulo e tags da
 * IA, que é onde aparecem os termos concretos ("Casa da Mulher", "5º
 * Distrito", "estiagem") — e não só a palavra-chave em inglês usada pra
 * buscar no Unsplash. Quando existe uma foto nossa pro assunto, ela é
 * sempre preferível a uma foto de banco de imagens internacional — que
 * nunca vai mostrar a rua, o prédio ou a viatura de verdade de Boa Vista.
 */
async function buscarImagemBancoProprio(
  textoParaCasar: string,
  editoria: Editoria,
  materia: ContextoImagemMateria,
): Promise<ResultadoImagem | null> {
  // Busca em TODO o banco próprio, não só na editoria da matéria: uma
  // matéria sobre prisão/drogas pode sair classificada como "roraima" em
  // vez de "policia", mas o conteúdo de verdade é policial — e a foto da
  // viatura (cadastrada na categoria "policia") tem que valer pra ela
  // também. O que decide se a foto serve é o tema de verdade (tag batendo
  // no título/subtítulo/tags da matéria), não o rótulo de editoria.
  const { data, error } = await supabase
    .from("imagens_fallback")
    .select("id, url, descricao, tags, editoria, ultima_vez_usada")
    .eq("padrao", false);

  if (error || !data || data.length === 0) return null;

  const termoBusca = normalizar(textoParaCasar);
  const candidatosPorTag = data.filter((img) => {
    const tags: string[] = img.tags ?? [];
    return tags.some((tag) => termoBusca.includes(normalizar(tag)));
  });

  // Acharam foto(s) cujo tema bate de verdade com a matéria — nesse caso,
  // prioriza as que também são da mesma editoria (mais prováveis de ser o
  // contexto certo), mas aceita qualquer uma que bateu a tag.
  let pool: typeof data;
  if (candidatosPorTag.length > 0) {
    const daMesmaEditoria = candidatosPorTag.filter((img) => img.editoria === editoria);
    pool = daMesmaEditoria.length > 0 ? daMesmaEditoria : candidatosPorTag;
  } else {
    // Nenhuma tag bateu: como última tentativa antes de ir pro banco de
    // imagens livres, usa qualquer foto da própria editoria da matéria
    // (continua sendo mais fiel que uma foto internacional aleatória).
    pool = data.filter((img) => img.editoria === editoria);
  }
  if (pool.length === 0) return null;

  // Verificador de Imagem (item novo, 22/11/2026): uma foto do banco próprio
  // é real e reconhecível (prédio, viatura, hospital com nome) — usar a
  // errada não é "imagem meia-boca", é afirmar visualmente que o fato
  // aconteceu ali. Por isso, antes de aceitar a escolha, testa cada
  // candidata do pool (até achar uma aprovada ou esgotar o pool) contra o
  // conteúdo real da matéria — só então vale; se NENHUMA passar, volta null
  // e o fluxo normal cai pro banco de imagens livres (Unsplash/Pixabay/
  // Pexels), que é sempre mais seguro que forçar uma foto real que não
  // combina de verdade.
  //
  // Rodízio (23/11/2026, flagrado por Valter: "nossas fotos continuam a ser
  // repetidas"): com poucas fotos cadastradas por tema, sortear sem memória
  // faz a mesma foto voltar cedo demais — por isso a ordem de tentativa
  // prioriza sempre a foto NÃO usada recentemente, em vez de aleatória pura
  // (só embaralha entre as que nunca foram usadas ainda, ou entre empates).
  const ordenadoPorRodizio = [...pool].sort((a, b) => {
    const aNuncaUsada = !a.ultima_vez_usada;
    const bNuncaUsada = !b.ultima_vez_usada;
    if (aNuncaUsada && bNuncaUsada) return Math.random() - 0.5;
    if (aNuncaUsada) return -1;
    if (bNuncaUsada) return 1;
    return new Date(a.ultima_vez_usada).getTime() - new Date(b.ultima_vez_usada).getTime();
  });
  for (const candidata of ordenadoPorRodizio) {
    const verificacao = await validarImagemBancoProprio(candidata.descricao ?? "", { ...materia, editoria });
    if (verificacao.aprovado) {
      await marcarImagemComoUsada(candidata.id);
      return { url: candidata.url, credito: "Foto: Radar BV", eFallback: false };
    }
  }

  return null;
}

/**
 * Banco de Imagens de Segurança (Regra de Ouro — item 5), com o Editor de
 * Imagens (item 8) embutido na busca de banco livre: primeiro tenta uma
 * foto PRÓPRIA cadastrada pro assunto (mais fiel à realidade local), já
 * passando pelo Verificador de Imagem (item novo, 22/11/2026 — ver
 * validarImagemBancoProprio em editorImagens.ts) antes de aceitar, porque é
 * uma foto real e reconhecível; se não achar nenhuma aprovada, busca um
 * PUNHADO de candidatas livres de direitos (Unsplash -> Pixabay -> Pexels ->
 * Wikimedia Commons -> Openverse,
 * parando no primeiro banco que trouxer resultado) e deixa a IA escolher,
 * entre elas, a que combina de verdade com o conteúdo da matéria — não só a
 * primeira que bateu com a palavra-chave solta; se nenhuma das três
 * encontrar ou tudo falhar, aplica automaticamente a imagem padrão
 * pré-cadastrada da categoria.
 */
export async function obterImagemParaMateria(
  palavraChave: string,
  editoria: Editoria,
  materia: ContextoImagemMateria,
): Promise<ResultadoImagem> {
  const textoParaCasar = [palavraChave, materia.titulo, materia.subtitulo, ...materia.tags].filter(Boolean).join(" ");

  // Flagrado na auditoria de 21/11/2026: o Banco de Imagens Próprias (fotos
  // reais de Boa Vista/Roraima) casava pela TAG batendo em qualquer parte do
  // texto, sem checar editoria — então uma notícia de "brasil_mundo" que
  // mencionasse "prefeito" ou "prefeitura" (termo genérico, comum em notícia
  // de qualquer cidade do Brasil) podia sair ilustrada com a foto real da
  // Prefeitura de Boa Vista, dando a entender que o fato aconteceu aqui.
  // Editoria "brasil_mundo" é, por definição, sobre lugar que NÃO é
  // Roraima — nunca pode usar uma foto real local. Essa exclusão continua
  // valendo mesmo com o Verificador de Imagem abaixo (defesa em camadas:
  // uma regra fixa que nunca depende de IA estar disponível).
  if (editoria !== "brasil_mundo") {
    const viaBancoProprio = await buscarImagemBancoProprio(textoParaCasar, editoria, materia);
    if (viaBancoProprio) return viaBancoProprio;
  }

  const viaBancoLivre = await buscarMelhorCandidatoLivre(palavraChave, textoParaCasar);
  if (viaBancoLivre) return viaBancoLivre;

  // Pesquisador de Imagem (item novo, 22/11/2026 — pedido de Valter: "se não
  // achasse a imagem, achasse algo compatível"): a primeira palavra-chave não
  // trouxe nada de bom (zero candidatas, ou a IA disse que nenhuma combinava
  // de verdade) — antes de desistir pro fallback institucional genérico,
  // pede à IA 2-3 ângulos de busca diferentes a partir do conteúdo real da
  // matéria e tenta cada um neles nos mesmos bancos livres, parando no
  // primeiro que trouxer uma escolha confiável.
  const alternativas = await sugerirPalavrasChaveAlternativas(
    { titulo: materia.titulo, subtitulo: materia.subtitulo, tags: materia.tags },
    palavraChave,
  );
  for (const alternativa of alternativas) {
    const textoParaCasarAlternativo = [alternativa, materia.titulo, materia.subtitulo, ...materia.tags].filter(Boolean).join(" ");
    const viaAlternativa = await buscarMelhorCandidatoLivre(alternativa, textoParaCasarAlternativo);
    if (viaAlternativa) {
      await log("info", "images", "Pesquisador de Imagem achou uma foto compatível numa busca alternativa", {
        palavraChaveOriginal: palavraChave,
        palavraChaveUsada: alternativa,
      });
      return viaAlternativa;
    }
  }

  await log("info", "images", "Nenhuma imagem livre encontrada (nem com buscas alternativas) — usando fallback de categoria", {
    palavraChave,
    editoria,
  });

  // Central de Transparência (item 22): isso é justamente o tipo de decisão
  // que vale a pena o Editor de Imagens levar pro Valter — "estou usando a
  // foto genérica com frequência nesse assunto, quer que eu reforce o banco
  // próprio aqui?" — em vez de só sumir num log técnico. Um aviso por
  // editoria por dia é suficiente pra mostrar o padrão sem virar spam.
  const marcador = `fallback-generico-${editoria}-${new Date().toISOString().slice(0, 10)}`;
  if (!(await jaInformouHoje("Editor de Imagens", marcador))) {
    await perguntar(
      "Editor de Imagens",
      `Não encontrei nenhuma foto compatível pra uma matéria de "${editoria}" (nem no banco próprio, nem nos bancos livres, nem com buscas alternativas) — publiquei com a imagem institucional genérica. Se isso estiver acontecendo direto nesse assunto, vale a pena eu priorizar fotos reais de Boa Vista/Roraima pra essa categoria no banco próprio.`,
      { editoria, palavraChave, marcador }
    );
  }

  return buscarImagemFallback(editoria);
}

/**
 * Busca candidatas de banco livre (Unsplash -> Pixabay -> Pexels -> Wikimedia
 * Commons -> Openverse) com UMA
 * palavra-chave e deixa o Editor de Imagens escolher a melhor. Só devolve
 * resultado quando há candidatas E a escolha foi CONFIÁVEL (a IA realmente
 * achou uma que combina) — devolve null nos outros casos, pra quem chamou
 * decidir se tenta outro ângulo de busca em vez de aceitar um palpite fraco.
 */
async function buscarMelhorCandidatoLivre(palavraChave: string, textoParaCasar: string): Promise<ResultadoImagem | null> {
  let candidatos = await buscarCandidatosUnsplash(palavraChave);
  if (candidatos.length === 0) candidatos = await buscarCandidatosPixabay(palavraChave);
  if (candidatos.length === 0) candidatos = await buscarCandidatosPexels(palavraChave);
  if (candidatos.length === 0) candidatos = await buscarCandidatosWikimedia(palavraChave);
  if (candidatos.length === 0) candidatos = await buscarCandidatosOpenverse(palavraChave);

  if (candidatos.length === 0) return null;

  const { escolhida, confiavel } = await escolherMelhorImagem(candidatos, textoParaCasar);
  if (!confiavel) return null;

  return { url: escolhida.url, credito: escolhida.credito, eFallback: false };
}
