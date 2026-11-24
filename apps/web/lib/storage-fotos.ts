import "server-only";
import { supabaseAdmin } from "./supabase-admin";

/**
 * Bucket do Supabase Storage onde ficam as fotos do painel admin: tanto as
 * enviadas pro banco de fotos reutilizável quanto as usadas pra trocar a
 * imagem de uma notícia já publicada ou pra criar uma notícia manual.
 * Criado como público (leitura) na migração `migracao-banco-fotos.sql`,
 * pra as imagens aparecerem no site sem precisar de outro endpoint.
 */
const BUCKET = "fotos";

const EXTENSOES_PERMITIDAS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

function extensaoSegura(nomeOriginal: string, tipoMime: string): string {
  const doNome = (nomeOriginal.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (EXTENSOES_PERMITIDAS.has(doNome)) return doNome;

  // fallback pelo content-type, caso o nome do arquivo não tenha extensão clara
  const doMime = tipoMime.split("/")[1]?.toLowerCase();
  if (doMime && EXTENSOES_PERMITIDAS.has(doMime)) return doMime === "jpeg" ? "jpg" : doMime;

  return "jpg";
}

/**
 * Envia um arquivo de imagem (vindo de um <input type="file"> de um
 * formulário do painel admin) pro Storage, e devolve a URL pública e o
 * caminho interno (pra poder excluir depois). `prefixo` é só pra organizar
 * e facilitar identificar a origem do arquivo (ex: "banco", "noticia-<id>").
 */
export async function enviarFotoParaStorage(
  arquivo: File,
  prefixo: string
): Promise<{ url: string; caminho: string }> {
  if (!arquivo || arquivo.size === 0) {
    throw new Error("Nenhum arquivo de imagem recebido.");
  }
  if (!arquivo.type.startsWith("image/")) {
    throw new Error("O arquivo enviado não é uma imagem.");
  }
  // teto de segurança: 8MB é bem mais que suficiente pra foto de notícia
  if (arquivo.size > 8 * 1024 * 1024) {
    throw new Error("Imagem maior que 8MB — reduza o tamanho antes de enviar.");
  }

  const extensao = extensaoSegura(arquivo.name, arquivo.type);
  const sufixo = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const caminho = `${prefixo}/${sufixo}.${extensao}`;
  const bytes = Buffer.from(await arquivo.arrayBuffer());

  const db = supabaseAdmin();
  const { error } = await db.storage.from(BUCKET).upload(caminho, bytes, {
    contentType: arquivo.type,
    upsert: false,
  });
  if (error) throw new Error(`Falha ao enviar imagem pro Storage: ${error.message}`);

  const { data } = db.storage.from(BUCKET).getPublicUrl(caminho);
  return { url: data.publicUrl, caminho };
}

// Identifica como navegador comum — vários sites públicos (prefeituras,
// SESC, órgãos de imprensa) bloqueiam requisição sem User-Agent.
const USER_AGENT_DOWNLOAD =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const TAMANHO_MAXIMO_DOWNLOAD = 8 * 1024 * 1024; // 8MB, mesmo teto do upload manual

/**
 * Baixa uma imagem publicada publicamente em outro site (ex: foto de
 * divulgação do SESC, de uma prefeitura, de um órgão público) a partir da
 * URL direta da imagem, e salva no Storage — pro Valter poder usar fotos
 * públicas de divulgação em notícias sem precisar baixar manualmente no
 * computador e depois subir de novo. Sempre credite a fonte real da foto
 * (ex: "Foto: Divulgação/SESC-RR") ao usá-la numa notícia.
 */
export async function baixarImagemDeUrlParaStorage(
  urlImagem: string,
  prefixo: string
): Promise<{ url: string; caminho: string }> {
  const limpa = urlImagem.trim();
  if (!limpa) throw new Error("Nenhuma URL de imagem informada.");

  let alvo: URL;
  try {
    alvo = new URL(limpa);
  } catch {
    throw new Error("URL inválida — confira se copiou o endereço completo da imagem.");
  }
  if (alvo.protocol !== "http:" && alvo.protocol !== "https:") {
    throw new Error("Só é possível baixar de endereços http:// ou https://.");
  }

  const resposta = await fetch(alvo.toString(), {
    signal: AbortSignal.timeout(20_000),
    headers: { "User-Agent": USER_AGENT_DOWNLOAD, Accept: "image/*" },
  });
  if (!resposta.ok) {
    throw new Error(`Não consegui baixar essa imagem (o site respondeu erro ${resposta.status}).`);
  }

  const tipoConteudo = resposta.headers.get("content-type") ?? "";
  if (!tipoConteudo.startsWith("image/")) {
    throw new Error("Esse endereço não aponta direto pra uma imagem — copie o link da imagem em si (clique com o botão direito nela → \"Copiar endereço da imagem\").");
  }

  const tamanhoDeclarado = Number(resposta.headers.get("content-length") ?? "0");
  if (tamanhoDeclarado > TAMANHO_MAXIMO_DOWNLOAD) {
    throw new Error("Imagem maior que 8MB — essa não dá pra importar por aqui.");
  }

  const bytes = Buffer.from(await resposta.arrayBuffer());
  if (bytes.byteLength > TAMANHO_MAXIMO_DOWNLOAD) {
    throw new Error("Imagem maior que 8MB — essa não dá pra importar por aqui.");
  }

  const extensao = extensaoSegura(alvo.pathname, tipoConteudo);
  const sufixo = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const caminho = `${prefixo}/${sufixo}.${extensao}`;

  const db = supabaseAdmin();
  const { error } = await db.storage.from(BUCKET).upload(caminho, bytes, {
    contentType: tipoConteudo,
    upsert: false,
  });
  if (error) throw new Error(`Falha ao salvar imagem baixada no Storage: ${error.message}`);

  const { data } = db.storage.from(BUCKET).getPublicUrl(caminho);
  return { url: data.publicUrl, caminho };
}

/** Remove um arquivo do Storage pelo caminho interno salvo no banco. Nunca
 * lança erro se o arquivo já não existir — exclusão é best-effort, não deve
 * travar a exclusão do registro no banco de dados. */
export async function excluirFotoDoStorage(caminho: string): Promise<void> {
  if (!caminho) return;
  const db = supabaseAdmin();
  await db.storage.from(BUCKET).remove([caminho]);
}
