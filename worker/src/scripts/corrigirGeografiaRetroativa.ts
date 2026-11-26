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
 * a MESMA exigência POSITIVA da Trava de Geografia mais forte do pipeline
 * (pipeline.ts, travarBuscaSemMencaoDeRoraima, alcance ampliado em
 * 26/11/2026 pra valer pra qualquer tipo de fonte): uma matéria em editoria
 * local (política, polícia, economia etc.) só é válida se o próprio texto
 * mencionar Roraima, Boa Vista ou um dos outros 14 municípios do estado —
 * sem essa menção, não importa se é Trump, Nvidia, Congo ou qualquer lugar
 * nunca listado numa lista negativa, a editoria está errada. Corrige pra
 * "brasil_mundo" e busca uma foto nova condizente (nunca do banco próprio,
 * que é só fotos reais de Boa Vista/Roraima — essa regra já existe em
 * images.ts e passa a valer de novo assim que a editoria estiver certa).
 *
 * Rodar manualmente (uma vez agora, e de novo sempre que desconfiar de mais
 * casos assim, por exemplo depois de uma trava nova entrar no ar):
 *
 *   npm run corrigir-geografia
 *
 * Nota sobre o .env (25/11/2026): no computador do Valter, o arquivo .env de
 * verdade (com as chaves do Supabase etc.) fica na RAIZ do projeto
 * (radar-bv-windows\.env), um nível ACIMA da pasta worker/ — não dentro
 * dela. O import "dotenv/config" normal (usado em config.ts) só olha a
 * pasta de onde o comando foi rodado, então rodar este script de dentro de
 * worker/ não achava o .env sozinho. Por isso aqui carregamos o .env
 * explicitamente, tentando alguns locais possíveis, ANTES de importar
 * qualquer módulo que dependa dele (db.ts/config.ts) — daí os imports de
 * supabase/log/obterImagemParaMateria abaixo serem dinâmicos (import()), não
 * estáticos: em módulo ES, todo import estático roda antes de qualquer outro
 * código do arquivo, então um dotenv.config() escrito depois de um import
 * estático chegaria tarde demais.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import type { Editoria } from "../types.js";

// __dirname (não import.meta.url) porque o projeto compila pra CommonJS.
const diretorioDoScript = __dirname;
const candidatosEnv = [
  path.resolve(diretorioDoScript, "../../.env"), // worker/.env
  path.resolve(diretorioDoScript, "../../../.env"), // raiz do projeto (ao lado da pasta worker) — onde o Valter guarda o .env de verdade
  path.resolve(process.cwd(), ".env"), // fallback: pasta de onde o comando foi rodado
];
for (const candidato of candidatosEnv) {
  if (existsSync(candidato)) {
    dotenv.config({ path: candidato });
  }
}

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

// Mantido idêntico ao array de mesmo nome em pipeline.ts — usado pra
// exigência POSITIVA (a que realmente decide a correção): sem menção a
// nenhum destes (nem "Roraima"), a editoria local está errada.
const MUNICIPIOS_RORAIMA = [
  "Alto Alegre",
  "Amajari",
  "Boa Vista",
  "Bonfim",
  "Cantá",
  "Caracaraí",
  "Caroebe",
  "Iracema",
  "Mucajaí",
  "Normandia",
  "Pacaraima",
  "Rorainópolis",
  "São João da Baliza",
  "São Luiz",
  "Uiramutã",
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
  // Imports dinâmicos (não no topo do arquivo) de propósito — ver nota sobre
  // o .env acima: esses módulos leem a configuração (Supabase etc.) assim
  // que são carregados, então só podem ser importados DEPOIS do dotenv.config()
  // já ter rodado.
  const { supabase } = await import("../db.js");
  const { log } = await import("../logger.js");
  const { obterImagemParaMateria } = await import("../images.js");

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

    const mencionaRoraima = /\broraima\b/.test(textoCompleto);
    const mencionaMunicipio = encontrarMencao(textoCompleto, MUNICIPIOS_RORAIMA);
    if (mencionaRoraima || mencionaMunicipio) continue; // menciona o estado/um município — editoria local é válida

    const editoriaErrada = noticia.editoria;

    // Só pra dar um motivo mais específico no log quando dá — a decisão em
    // si já foi tomada acima (não menciona Roraima/município nenhum).
    const estadoEncontrado = encontrarMencao(textoCompleto, OUTROS_ESTADOS);
    const paisEncontrado = !estadoEncontrado ? encontrarMencao(textoCompleto, PAISES_ESTRANGEIROS) : undefined;
    const motivo = estadoEncontrado
      ? `menciona o estado "${estadoEncontrado}"`
      : paisEncontrado
        ? `menciona o país "${paisEncontrado}"`
        : `não menciona Roraima nem nenhum município do estado`;

    console.log(`→ [${noticia.status}] "${noticia.titulo}"`);
    console.log(`  estava em "${editoriaErrada}", mas ${motivo} — corrigindo pra "brasil_mundo"...`);

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
