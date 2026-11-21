import fetch from "node-fetch";
import { config } from "./config.js";
import { supabase } from "./db.js";
import { log } from "./logger.js";
import type { Editoria, ResultadoImagem } from "./types.js";

interface UnsplashResultado {
  results: Array<{ urls: { regular: string }; user: { name: string } }>;
}
interface PexelsResultado {
  photos: Array<{ src: { large: string }; photographer: string }>;
}
interface PixabayResultado {
  hits: Array<{ largeImageURL: string; user: string }>;
}

async function buscarUnsplash(palavraChave: string): Promise<ResultadoImagem | null> {
  if (!config.imagens.unsplashAccessKey) return null;
  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(palavraChave)}&per_page=1&orientation=landscape`;
    const resposta = await fetch(url, {
      headers: { Authorization: `Client-ID ${config.imagens.unsplashAccessKey}` },
      signal: AbortSignal.timeout(8_000), // timeout real — evita travar a publicação esperando a API de imagens
    });
    if (!resposta.ok) return null;
    const json = (await resposta.json()) as UnsplashResultado;
    const foto = json.results?.[0];
    if (!foto) return null;
    return { url: foto.urls.regular, credito: `Foto: ${foto.user.name} / Unsplash`, eFallback: false };
  } catch {
    return null;
  }
}

async function buscarPexels(palavraChave: string): Promise<ResultadoImagem | null> {
  if (!config.imagens.pexelsApiKey) return null;
  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(palavraChave)}&per_page=1&orientation=landscape`;
    const resposta = await fetch(url, {
      headers: { Authorization: config.imagens.pexelsApiKey },
      signal: AbortSignal.timeout(8_000),
    });
    if (!resposta.ok) return null;
    const json = (await resposta.json()) as PexelsResultado;
    const foto = json.photos?.[0];
    if (!foto) return null;
    return { url: foto.src.large, credito: `Foto: ${foto.photographer} / Pexels`, eFallback: false };
  } catch {
    return null;
  }
}

async function buscarPixabay(palavraChave: string): Promise<ResultadoImagem | null> {
  if (!config.imagens.pixabayApiKey) return null;
  try {
    const url = `https://pixabay.com/api/?key=${config.imagens.pixabayApiKey}&q=${encodeURIComponent(palavraChave)}&image_type=photo&orientation=horizontal&per_page=3&safesearch=true`;
    const resposta = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!resposta.ok) return null;
    const json = (await resposta.json()) as PixabayResultado;
    const foto = json.hits?.[0];
    if (!foto) return null;
    return { url: foto.largeImageURL, credito: `Foto: ${foto.user} / Pixabay`, eFallback: false };
  } catch {
    return null;
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
  const { data, error } = await supabase
    .from("imagens_fallback")
    .select("url, descricao, tags")
    .eq("editoria", editoria)
    .eq("padrao", false);

  if (error || !data || data.length === 0) return null;

  const termoBusca = normalizar(textoParaCasar);
  const candidatos = data.filter((img) => {
    const tags: string[] = img.tags ?? [];
    return tags.some((tag) => termoBusca.includes(normalizar(tag)));
  });

  // Na editoria "policia" as fotos cadastradas (delegacia, viatura) servem
  // pra qualquer ocorrência policial, mesmo sem bater palavra por palavra
  // na tag — então, sem match direto, usa qualquer uma da editoria.
  const pool = candidatos.length > 0 ? candidatos : editoria === "policia" ? data : [];
  if (pool.length === 0) return null;

  // Entre as que servem, sorteia uma, pra não repetir sempre a mesma foto
  const escolhida = pool[Math.floor(Math.random() * pool.length)];
  return { url: escolhida.url, credito: "Foto: Radar BV", eFallback: false };
}

/**
 * Banco de Imagens de Segurança (Regra de Ouro — item 5):
 * primeiro tenta uma foto PRÓPRIA cadastrada pro assunto (mais fiel à
 * realidade local); se não achar nenhuma, busca foto livre de direitos
 * (Unsplash -> Pixabay -> Pexels) pela palavra-chave; se nenhuma das três
 * encontrar ou falhar, aplica automaticamente a imagem padrão pré-cadastrada
 * da categoria.
 */
export async function obterImagemParaMateria(
  palavraChave: string,
  editoria: Editoria,
  contextoMateria?: string,
): Promise<ResultadoImagem> {
  const textoParaCasar = [palavraChave, contextoMateria].filter(Boolean).join(" ");
  const viaBancoProprio = await buscarImagemBancoProprio(textoParaCasar, editoria);
  if (viaBancoProprio) return viaBancoProprio;

  const viaUnsplash = await buscarUnsplash(palavraChave);
  if (viaUnsplash) return viaUnsplash;

  const viaPixabay = await buscarPixabay(palavraChave);
  if (viaPixabay) return viaPixabay;

  const viaPexels = await buscarPexels(palavraChave);
  if (viaPexels) return viaPexels;

  await log("info", "images", "Nenhuma imagem livre encontrada — usando fallback de categoria", { palavraChave, editoria });
  return buscarImagemFallback(editoria);
}
