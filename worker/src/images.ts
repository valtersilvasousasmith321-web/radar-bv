import fetch from "node-fetch";
import { config } from "./config.js";
import { supabase } from "./db.js";
import { log } from "./logger.js";
import { escolherMelhorImagem, type CandidatoImagem } from "./ai/editorImagens.js";
import type { Editoria, ResultadoImagem } from "./types.js";

interface UnsplashResultado {
  results: Array<{ urls: { regular: string }; user: { name: string }; alt_description: string | null; description: string | null }>;
}
interface PexelsResultado {
  photos: Array<{ src: { large: string }; photographer: string; alt: string | null }>;
}
interface PixabayResultado {
  hits: Array<{ largeImageURL: string; user: string; tags: string }>;
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

/** Busca a imagem padrão pré-cadastrada para a editoria (Banco de Imagens de Segurança) */
async function buscarImagemFallback(editoria: Editoria): Promise<ResultadoImagem> {
  const { data } = await supabase
    .from("imagens_fallback")
    .select("url")
    .eq("editoria", editoria)
    .eq("padrao", true)
    .limit(1)
    .maybeSingle();

  if (data?.url) {
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
async function buscarImagemBancoProprio(textoParaCasar: string, editoria: Editoria): Promise<ResultadoImagem | null> {
  // Busca em TODO o banco próprio, não só na editoria da matéria: uma
  // matéria sobre prisão/drogas pode sair classificada como "roraima" em
  // vez de "policia", mas o conteúdo de verdade é policial — e a foto da
  // viatura (cadastrada na categoria "policia") tem que valer pra ela
  // também. O que decide se a foto serve é o tema de verdade (tag batendo
  // no título/subtítulo/tags da matéria), não o rótulo de editoria.
  const { data, error } = await supabase.from("imagens_fallback").select("url, descricao, tags, editoria").eq("padrao", false);

  if (error || !data || data.length === 0) return null;

  const termoBusca = normalizar(textoParaCasar);
  const candidatos = data.filter((img) => {
    const tags: string[] = img.tags ?? [];
    return tags.some((tag) => termoBusca.includes(normalizar(tag)));
  });

  // Acharam foto(s) cujo tema bate de verdade com a matéria — nesse caso,
  // prioriza as que também são da mesma editoria (mais prováveis de ser o
  // contexto certo), mas aceita qualquer uma que bateu a tag.
  if (candidatos.length > 0) {
    const daMesmaEditoria = candidatos.filter((img) => img.editoria === editoria);
    const pool = daMesmaEditoria.length > 0 ? daMesmaEditoria : candidatos;
    const escolhida = pool[Math.floor(Math.random() * pool.length)];
    return { url: escolhida.url, credito: "Foto: Radar BV", eFallback: false };
  }

  // Nenhuma tag bateu: como última tentativa antes de ir pro banco de
  // imagens livres, usa qualquer foto da própria editoria da matéria
  // (continua sendo mais fiel que uma foto internacional aleatória).
  const daEditoria = data.filter((img) => img.editoria === editoria);
  if (daEditoria.length === 0) return null;

  const escolhida = daEditoria[Math.floor(Math.random() * daEditoria.length)];
  return { url: escolhida.url, credito: "Foto: Radar BV", eFallback: false };
}

/**
 * Banco de Imagens de Segurança (Regra de Ouro — item 5), com o Editor de
 * Imagens (item 8) embutido na busca de banco livre: primeiro tenta uma
 * foto PRÓPRIA cadastrada pro assunto (mais fiel à realidade local); se não
 * achar nenhuma, busca um PUNHADO de candidatas livres de direitos
 * (Unsplash -> Pixabay -> Pexels, parando no primeiro banco que trouxer
 * resultado) e deixa a IA escolher, entre elas, a que combina de verdade
 * com o conteúdo da matéria — não só a primeira que bateu com a
 * palavra-chave solta; se nenhuma das três encontrar ou tudo falhar, aplica
 * automaticamente a imagem padrão pré-cadastrada da categoria.
 */
export async function obterImagemParaMateria(
  palavraChave: string,
  editoria: Editoria,
  contextoMateria?: string,
): Promise<ResultadoImagem> {
  const textoParaCasar = [palavraChave, contextoMateria].filter(Boolean).join(" ");

  // Flagrado na auditoria de 21/11/2026: o Banco de Imagens Próprias (fotos
  // reais de Boa Vista/Roraima) casava pela TAG batendo em qualquer parte do
  // texto, sem checar editoria — então uma notícia de "brasil_mundo" que
  // mencionasse "prefeito" ou "prefeitura" (termo genérico, comum em notícia
  // de qualquer cidade do Brasil) podia sair ilustrada com a foto real da
  // Prefeitura de Boa Vista, dando a entender que o fato aconteceu aqui.
  // Editoria "brasil_mundo" é, por definição, sobre lugar que NÃO é
  // Roraima — nunca pode usar uma foto real local.
  if (editoria !== "brasil_mundo") {
    const viaBancoProprio = await buscarImagemBancoProprio(textoParaCasar, editoria);
    if (viaBancoProprio) return viaBancoProprio;
  }

  let candidatos = await buscarCandidatosUnsplash(palavraChave);
  if (candidatos.length === 0) candidatos = await buscarCandidatosPixabay(palavraChave);
  if (candidatos.length === 0) candidatos = await buscarCandidatosPexels(palavraChave);

  if (candidatos.length > 0) {
    const escolhida = await escolherMelhorImagem(candidatos, textoParaCasar);
    return { url: escolhida.url, credito: escolhida.credito, eFallback: false };
  }

  await log("info", "images", "Nenhuma imagem livre encontrada — usando fallback de categoria", { palavraChave, editoria });
  return buscarImagemFallback(editoria);
}
