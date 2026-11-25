/**
 * Correção RETROATIVA de classificação geográfica (25/11/2026, pedido direto
 * de Valter: flagrou no site no ar a matéria "Júri de Brooklyn condena
 * Huawei... nos EUA" publicada como "Política" — ilustrada com uma foto REAL
 * de um prédio de Boa Vista (Casa da Mulher Brasileira) — e mais casos
 * parecidos (Colômbia, Coreia do Norte) ainda saindo errado mesmo DEPOIS da
 * 5ª Trava de Geografia (pipeline.ts, commit 588e10d) já estar no ar.
 *
 * Raiz do problema: as Travas de Geografia só rodam no MOMENTO da triagem de
 * uma matéria nova (dentro de processarItem/processarItemMultiFonte). A
 * Fila de Gotejamento guarda notícias já triadas como "agendado" por até
 * várias horas antes de publicar (ver queue.ts, calcularProximoSlot) — o job
 * que publica (publicarNoticiasAgendadas) só troca o status pra "publicado",
 * nunca re-roda a triagem. Então qualquer matéria que passou pela triagem
 * ANTES da trava nova entrar no ar fica com a editoria errada — e a foto
 * errada já gravada — PRA SEMPRE, mesmo com o código já corrigido.
 *
 * Este script varre as notícias já salvas (agendadas ou publicadas) e aplica
 * a MESMA lógica de detecção das Travas de Geografia atuais (pipeline.ts):
 * se o conteúdo menciona outro estado brasileiro ou um país estrangeiro, e
 * NÃO menciona Roraima, a editoria está errada — corrige pra "brasil_mundo"
 * e busca uma foto nova condizente (nunca do banco próprio, que é só fotos
 * reais de Boa Vista/Roraima — essa regra já existe em images.ts e passa a
 * valer de novo assim que a editoria estiver certa).
 *
 * Rodar manualmente (uma vez agora, e de novo sempre que desconfiar de mais
 * casos assim, por exemplo depois de uma trava nova entrar no ar):
 *
 *   npm run corrigir-geografia
 */
import { supabase } from "../db.js";
import { log } from "../logger.js";
import { obterImagemParaMateria } from "../images.js";
import type { Editoria } from "../types.js";

const EDITORIAS_LOCAIS: Editoria[] = [
  "boa_vista",
  "roraima",
  "policia",
  "politica",
  "economia",
  "esportes",
  "servico_cidadao",
  "saude",
  "educacao",
  "cultura",
];

// Mantido idêntico ao array de mesmo nome em pipeline.ts — se um dia um
// estado ou país novo for adicionado lá por causa de outro caso real, repita
// a mudança aqui também.
const OUTROS_ESTADOS = [
  "Amapá",
  "Amazonas",
  "Pará",
  "Acre",
  "Rondônia",
  "Tocantins",
  "Maranhão",
  "Piauí",
  "Ceará",
  "Rio Grande do Norte",
  "Paraíba",
  "Pernambuco",
  "Alagoas",
  "Sergipe",
  "Bahia",
  "Minas Gerais",
  "Espírito Santo",
  "Rio de Janeiro",
  "São Paulo",
  "Paraná",
  "Santa Catarina",
  "Rio Grande do Sul",
  "Mato Grosso do Sul",
  "Mato Grosso",
  "Goiás",
  "Distrito Federal",
];

const PAISES_ESTRANGEIROS = [
  "Estados Unidos",
  "EUA",
  "Israel",
  "Irã",
  "Iraque",
  "Palestina",
  "Gaza",
  "Líbano",
  "Síria",
  "Ucrânia",
  "Rússia",
  "China",
  "Argentina",
  "Chile",
  "Uruguai",
  "Paraguai",
  "Bolívia",
  "Peru",
  "Colômbia",
  "Venezuela",
  "Equador",
  "México",
  "Portugal",
  "Espanha",
  "França",
  "Alemanha",
  "Itália",
  "Reino Unido",
  "Inglaterra",
  "Japão",
  "Coreia do Sul",
  "Coreia do Norte",
  "Índia",
  "Austrália",
  "Canadá",
  "Emirados Árabes Unidos",
  "Arábia Saudita",
  "Catar",
  "Egito",
  "África do Sul",
  "Nigéria",
  "Turquia",
  "Afeganistão",
  "Paquistão",
];

function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function encontrarMencao(textoNormalizado: string, lista: string[]): string | undefined {
  return lista.find((termo) => {
    const normalizado = normalizarTexto(termo);
    const regex = new RegExp(`\\b${normalizado.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return regex.test(textoNormalizado);
  });
}

function dormir(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface NoticiaRevisar {
  id: string;
  titulo: string;
  subtitulo: string | null;
  conteudo: string | null;
  tags: string[] | null;
  editoria: Editoria;
  status: string;
}

async function main(): Promise<void> {
  console.log("Correção retroativa de classificação geográfica — buscando notícias agendadas/publicadas...\n");

  const { data: noticias, error } = await supabase
    .from("noticias")
    .select("id, titulo, subtitulo, conteudo, tags, editoria, status")
    .in("status", ["agendado", "publicado"])
    .returns<NoticiaRevisar[]>();

  if (error) {
    console.error("Erro ao buscar notícias:", error.message);
    process.exitCode = 1;
    return;
  }

  if (!noticias || noticias.length === 0) {
    console.log("Nenhuma notícia encontrada.");
    return;
  }

  console.log(`${noticias.length} notícia(s) agendada(s)/publicada(s) encontrada(s). Verificando cada uma...\n`);

  let corrigidas = 0;
  let verificadas = 0;

  for (const noticia of noticias) {
    if (!EDITORIAS_LOCAIS.includes(noticia.editoria)) continue;
    verificadas++;

    const textoCompleto = normalizarTexto(
      `${noticia.titulo ?? ""} ${noticia.subtitulo ?? ""} ${noticia.conteudo ?? ""} ${(noticia.tags ?? []).join(" ")}`,
    );

    if (/\broraima\b/.test(textoCompleto)) continue;

    const estadoEncontrado = encontrarMencao(textoCompleto, OUTROS_ESTADOS);
    const paisEncontrado = !estadoEncontrado ? encontrarMencao(textoCompleto, PAISES_ESTRANGEIROS) : undefined;

    if (!estadoEncontrado && !paisEncontrado) continue;

    const editoriaErrada = noticia.editoria;
    const motivo = estadoEncontrado ? `menciona o estado "${estadoEncontrado}"` : `menciona o país "${paisEncontrado}"`;

    console.log(`→ [${noticia.status}] "${noticia.titulo}"`);
    console.log(`  estava em "${editoriaErrada}", mas ${motivo} (sem menção a Roraima) — corrigindo pra "brasil_mundo"...`);

    const palavraChave = noticia.tags?.[0] || "noticia internacional";
    let imagem;
    try {
      imagem = await obterImagemParaMateria(palavraChave, "brasil_mundo", {
        titulo: noticia.titulo,
        subtitulo: noticia.subtitulo ?? "",
        tags: noticia.tags ?? [],
      });
    } catch (err: any) {
      console.error(`  ✗ Falha ao buscar foto nova, pulando essa notícia: ${err?.message ?? err}`);
      continue;
    }

    const { error: erroUpdate } = await supabase
      .from("noticias")
      .update({
        editoria: "brasil_mundo",
        imagem_url: imagem.url,
        imagem_credito: imagem.credito,
        imagem_e_fallback: imagem.eFallback,
      })
      .eq("id", noticia.id);

    if (erroUpdate) {
      console.error(`  ✗ Falha ao gravar correção: ${erroUpdate.message}`);
      continue;
    }

    await log("warning", "corrigirGeografiaRetroativa", "Correção retroativa de classificação geográfica incorreta", {
      noticiaId: noticia.id,
      titulo: noticia.titulo,
      editoriaErrada,
      motivo,
    });

    console.log(`  ✓ Corrigida. Nova foto: ${imagem.eFallback ? "institucional genérica (nenhuma foto própria/livre combinou)" : imagem.credito}\n`);
    corrigidas++;

    // Pausa curta entre cada correção pra não estourar o limite de taxa dos
    // bancos de imagem gratuitos (Unsplash/Pixabay/Pexels) nem da IA.
    await dormir(500);
  }

  console.log(`\nConcluído: ${verificadas} notícia(s) em editoria local verificada(s), ${corrigidas} corrigida(s) pra "brasil_mundo".`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erro inesperado:", err);
    process.exit(1);
  });
