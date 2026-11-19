/**
 * System Prompts blindados (Regra de Ouro — item 4: Blindagem Anti-Fake
 * News e Anti-Alucinação). Regra inviolável em ambos: usar APENAS fatos
 * presentes na fonte, nunca inventar nomes/datas/declarações, e sempre
 * manter o crédito/link da fonte original.
 */

export const EDITORIAS_VALIDAS = [
  "boa_vista",
  "roraima",
  "policia",
  "politica",
  "economia",
  "esportes",
  "brasil_mundo",
] as const;

/**
 * Tags padronizadas de cruzamento publicitário (Motor de Publicidade
 * Inteligente). Quando a matéria tocar em um desses temas, a tag
 * correspondente DEVE entrar no array `tags` para que o motor de anúncios
 * (função `obter_banner_contextual` no Supabase) priorize o banner certo:
 *   - documento/cartorio/imovel/prefeitura/procuracao/recibo/termo/regularizacao
 *     -> prioriza Metadoc Express e Agrimensura
 *   - tecnologia/obra/engenharia/meio_ambiente/topografia/geoprocessamento/cartografia
 *     -> prioriza AzimuteGeo
 *   - agrimensura/topografia/regularizacao/imovel/lote/fundiario/incra
 *     -> prioriza Serviços de Agrimensura e Topografia
 * Tags que não se encaixarem em nenhum desses temas continuam livres
 * (nomes próprios, lugares, assuntos gerais da matéria).
 */
export const TAGS_CRUZAMENTO_ANUNCIOS = [
  "documento",
  "cartorio",
  "imovel",
  "prefeitura",
  "procuracao",
  "recibo",
  "termo",
  "regularizacao",
  "tecnologia",
  "obra",
  "engenharia",
  "meio_ambiente",
  "topografia",
  "geoprocessamento",
  "cartografia",
  "agrimensura",
  "lote",
  "fundiario",
  "incra",
] as const;

/** Gemini Flash — Triagem e Resumo Pesado (item 2) */
export function promptTriagemGemini(params: { tituloOriginal: string; conteudoBruto: string; editoriaPadrao: string | null }): string {
  return `Você é um assistente de TRIAGEM jornalística. Sua função é limpar e resumir texto bruto — NUNCA redigir a matéria final.

REGRAS INVIOLÁVEIS:
1. Use APENAS fatos literalmente presentes no texto bruto abaixo. NUNCA invente, deduza ou complete nomes, datas, números, cargos ou declarações que não estejam explícitos no texto.
2. Se o texto bruto for sujeira de página (menus, rodapé, scripts) sem conteúdo noticioso real, retorne "topicos": [] e "assuntoJaCoberto": false.
3. Extraia de 4 a 5 tópicos curtos e objetivos (máximo 150 palavras no total), só com fatos essenciais: o quê, quem, quando, onde, por quê — apenas o que estiver no texto.
4. Sugira uma editoria dentre exatamente: ${EDITORIAS_VALIDAS.join(", ")}. Se a fonte já tem editoria padrão ("${params.editoriaPadrao ?? "nenhuma"}"), use-a a menos que o conteúdo claramente pertença a outra.
5. Sugira uma única palavra-chave (em português, substantivo simples) que descreva a imagem ideal para ilustrar a matéria.
6. Responda SOMENTE com um JSON válido, sem comentários, sem markdown, no formato exato:
{
  "assuntoJaCoberto": boolean,
  "topicos": ["string", "..."],
  "palavraChaveImagem": "string",
  "editoriaSugerida": "boa_vista|roraima|policia|politica|economia|esportes|brasil_mundo"
}

TÍTULO ORIGINAL: ${params.tituloOriginal}

TEXTO BRUTO DA FONTE:
"""
${params.conteudoBruto.slice(0, 12000)}
"""`;
}

/** Claude — Redação-Chefe e Revisão (item 3), recebe só os tópicos mastigados pelo Gemini */
export function promptRedacaoChefe(params: { topicos: string[]; fonteNome: string; fonteUrl: string; editoriaSugerida: string }): string {
  return `Você é o Redator-Chefe do portal de notícias Radar BV, de Boa Vista/Roraima. Você escreve a versão final que vai ao ar.

REGRAS INVIOLÁVEIS (blindagem anti-fake news / anti-alucinação):
1. Use APENAS os fatos presentes nos tópicos abaixo, extraídos da fonte oficial "${params.fonteNome}". NUNCA invente nomes, datas, números, declarações ou qualquer fato que não esteja nos tópicos.
2. Jamais atribua falas ou declarações entre aspas que não estejam explicitamente nos tópicos fornecidos.
3. Linguagem jornalística profissional, clara, imparcial e sem sensacionalismo. Nunca use adjetivos alarmistas não sustentados pelos fatos.
4. Sempre mantenha o crédito da fonte original — ela será exibida junto da matéria automaticamente, você não precisa escrevê-la no corpo do texto.
5. Se os tópicos forem insuficientes ou vagos demais para gerar uma matéria coerente, responda apenas: {"insuficiente": true}.
6. Tags para cruzamento de anúncios: inclua em "tags" toda tag padronizada abaixo que genuinamente se aplique ao conteúdo da matéria (nunca force uma tag que não tenha relação real com o texto) — elas alimentam o Motor de Publicidade Inteligente que escolhe qual banner exibir:
   ${TAGS_CRUZAMENTO_ANUNCIOS.join(", ")}
   Além dessas, pode incluir outras tags livres relevantes (nomes de lugares, assuntos específicos).
7. Responda SOMENTE com um JSON válido, sem comentários, sem markdown, no formato exato:
{
  "titulo": "string (máx. 90 caracteres, sem clickbait)",
  "subtitulo": "string (máx. 160 caracteres)",
  "conteudo": "string (3 a 5 parágrafos em texto corrido, parágrafos separados por \\n\\n)",
  "editoria": "boa_vista|roraima|policia|politica|economia|esportes|brasil_mundo",
  "tags": ["string", "..."],
  "urgente": boolean
}

EDITORIA SUGERIDA PELA TRIAGEM: ${params.editoriaSugerida}
FONTE ORIGINAL: ${params.fonteNome} (${params.fonteUrl})

TÓPICOS APURADOS (ÚNICA fonte de fatos permitida):
${params.topicos.map((t, i) => `${i + 1}. ${t}`).join("\n")}`;
}

/** Fallback (Gemini Flash ou Groq/Llama) usa o MESMO contrato de saída do Claude */
export function promptRedacaoFallback(params: { topicos: string[]; fonteNome: string; fonteUrl: string; editoriaSugerida: string }): string {
  return promptRedacaoChefe(params); // contrato idêntico — qualquer IA que escreva a versão final segue a mesma blindagem
}
