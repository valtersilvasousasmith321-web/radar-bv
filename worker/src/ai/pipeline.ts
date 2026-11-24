import { log } from "../logger.js";
import { triarComOllama } from "./ollama.js";
import { triarComGemini, redigirComGeminiFallback, redigirMultiFonteComGeminiFallback } from "./gemini.js";
import { redigirComClaude, redigirMultiFonteComClaude, triarComClaude } from "./claude.js";
import { redigirComGroqFallback, redigirMultiFonteComGroqFallback, triarComGroqFallback } from "./groq.js";
import { redigirComOpenRouterFallback, redigirMultiFonteComOpenRouterFallback, triarComOpenRouterFallback } from "./openrouter.js";
import { redigirComMistralFallback, redigirMultiFonteComMistralFallback, triarComMistralFallback } from "./mistral.js";
import { redigirComCohereFallback, redigirMultiFonteComCohereFallback, triarComCohereFallback } from "./cohere.js";
import { estaDisponivel, pareceErroDeCota, marcarIndisponivel } from "./quotaTracker.js";
import { informar, jaInformouHoje } from "../relatorios.js";
import type { Editoria, ItemBruto, MateriaRedigida, ResumoGemini } from "../types.js";

type OrigemIA = "claude" | "gemini" | "groq" | "openrouter" | "mistral" | "cohere";

export interface FonteCruzada {
  fonteId: string;
  url: string;
  nome: string;
  hash: string;
}

export interface ResultadoPipeline {
  materia: MateriaRedigida;
  origemIA: OrigemIA;
  palavraChaveImagem: string;
  fonteUrl: string;
  fonteNome: string;
  topicosApurados: string[];
  /**
   * Crédito de Fonte Primária (22/11/2026): o nome que efetivamente vai pro
   * campo público "fonte_credito" da matéria. Nunca é simplesmente o nome
   * do veículo de coleta quando esse veículo é um concorrente comercial
   * (ver FonteMonitorada.creditar_publicamente) — nesses casos, só aparece
   * aqui a fonte primária que a própria IA identificou no texto (um órgão
   * oficial, por exemplo), ou null quando nenhuma foi identificável (nesse
   * caso a matéria simplesmente não exibe nenhuma linha de crédito).
   */
  fonteCreditoPublico: string | null;
  /**
   * Curadoria Multi-Fonte (22/11/2026): presente só quando a matéria veio de
   * processarItemMultiFonte. Lista TODAS as fontes usadas (mesmo quando só
   * 1 sobreviveu à triagem) — queue.ts usa isso pra fechar a Trava de
   * Silêncio de cada URL do grupo e gravar o registro completo no banco.
   */
  fontesCruzadas?: FonteCruzada[];
}

/** "X", "X e Y" ou "X, Y e Z" — junta nomes de fonte pro crédito público multi-fonte. */
function juntarNomes(nomes: string[]): string | null {
  if (nomes.length === 0) return null;
  if (nomes.length === 1) return nomes[0];
  if (nomes.length === 2) return `${nomes[0]} e ${nomes[1]}`;
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

function normalizarNome(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/**
 * Flagrado por Valter em 23/11/2026: uma matéria saiu publicamente creditada
 * como "Com informações de: G1 — Brasil" mesmo já existindo a regra de
 * Crédito de Fonte Primária abaixo — porque o texto apurado citava "segundo
 * o G1" dentro do próprio conteúdo, e a IA extraiu "G1" como se fosse a
 * "fontePrimaria" (um órgão/entidade que originou o fato), quando na
 * verdade G1 é só quem REPORTOU, exatamente o tipo de veículo concorrente
 * que essa regra existe pra nunca aparecer no crédito público. O prompt
 * (prompts.ts) agora proíbe isso explicitamente, mas— seguindo a mesma
 * filosofia de defesa em camadas já usada em images.ts pra editoria
 * "brasil_mundo" — este filtro em código barra esses nomes mesmo se a IA
 * ignorar a instrução, sem depender só dela obedecer.
 */
const VEICULOS_IMPRENSA_BLOQUEADOS = [
  "g1",
  "globo",
  "o globo",
  "folha de s.paulo",
  "folha de sao paulo",
  "folha de boa vista",
  "estadao",
  "uol",
  "r7",
  "metropoles",
  "cnn brasil",
  "band",
  "record",
  "sbt",
  "veja",
  "exame",
  "terra",
  "ig",
];

/**
 * Flagrado por Valter de novo em 23/11/2026, horas depois da "correção"
 * acima: outra matéria saiu creditada "G1 — Brasil" — só que dessa vez não
 * foi a IA que extraiu "G1" do texto (o filtro acima já barra isso). O
 * problema era outro: a fonte de COLETA é literalmente cadastrada como "G1
 * — Brasil" (fontes_monitoradas, RSS direto do g1.globo.com), e o caminho 2
 * de calcularCreditoPublico() (fallback pros nomes das fontes de coleta)
 * usava só o campo `creditar_publicamente` do banco pra decidir — que,
 * nesse caso, não estava marcado `false` (migração antiga que deveria ter
 * marcado isso nunca rodou no banco). Ou seja: o código dependia 100% de
 * alguém ter rodado a migração certa no SQL Editor pra essa trava funcionar
 * — exatamente o tipo de dependência frágil que a Trava de Geografia em
 * código (images.ts/pipeline.ts) já tinha abandonado antes. Esta função
 * agora checa o NOME da fonte contra a mesma lista de veículos bloqueados,
 * em código — funciona mesmo que o `creditar_publicamente` do banco esteja
 * errado ou a migração nunca tenha sido rodada.
 */
function contemVeiculoBloqueado(texto: string): boolean {
  const normalizado = normalizarNome(texto);
  return VEICULOS_IMPRENSA_BLOQUEADOS.some((v) => {
    const escapado = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(^|[^a-z0-9])${escapado}([^a-z0-9]|$)`, "i");
    return regex.test(normalizado);
  });
}

function fontePrimariaValida(fontePrimaria: string | null | undefined): string | null {
  const limpa = fontePrimaria?.trim();
  if (!limpa) return null;
  return contemVeiculoBloqueado(limpa) ? null : limpa;
}

/**
 * Crédito de Fonte Primária (22/11/2026 — a pedido do Valter: "não pode
 * parecer que a gente copiou o G1/Folha, tem que buscar a fonte principal
 * do jeito que eles fazem"). Prioridade:
 *   1. A fonte primária que a própria IA identificou dentro do texto
 *      apurado (ex.: "Ministério da Saúde") — sempre a mais específica e
 *      honesta, usada independente de qual veículo foi coletado — DESDE QUE
 *      não seja, ela mesma, o nome de um veículo de imprensa (ver
 *      fontePrimariaValida acima; isso nunca deveria acontecer dado o
 *      prompt, mas é barrado em código do mesmo jeito, por segurança).
 *   2. Na ausência dela, os nomes das fontes de coleta que PODEM aparecer
 *      publicamente (creditarPublicamente === true) — comportamento igual
 *      ao de sempre para fontes oficiais, agências e "busca".
 *   3. Se nada sobrar (nenhuma fonte primária achada E a(s) fonte(s) de
 *      coleta são veículo(s) concorrente(s) marcados como não-creditáveis),
 *      null — a matéria sai sem nenhuma linha de crédito, em vez de citar
 *      um concorrente.
 */
function calcularCreditoPublico(fontePrimaria: string | null | undefined, fontes: Array<{ nome: string; creditarPublicamente: boolean }>): string | null {
  const primariaValida = fontePrimariaValida(fontePrimaria);
  if (primariaValida) return primariaValida;
  // `f.creditarPublicamente` vem do banco (fontes_monitoradas.creditar_publicamente)
  // e pode estar errado se a migração que deveria tê-lo marcado `false` nunca
  // rodou — por isso o nome da própria fonte passa pelo MESMO filtro de
  // veículo bloqueado usado acima, em código, nunca confiando só na flag do
  // banco (ver comentário de contemVeiculoBloqueado).
  return juntarNomes(fontes.filter((f) => f.creditarPublicamente && !contemVeiculoBloqueado(f.nome)).map((f) => f.nome));
}

/**
 * Triagem com Fallback em cascata — IA local -> Gemini -> Groq -> OpenRouter
 * -> Mistral -> Cohere -> Claude. Compartilhada entre o caminho de fonte
 * única e o multi-fonte.
 *
 * Ordem invertida em 23/11/2026, a pedido do Valter ("eu não quero pagar
 * não"): Claude é o ÚNICO provedor pago da bancada — todos os outros têm
 * cota gratuita própria. Antes ele vinha logo depois do Gemini, então toda
 * vez que o Gemini tropeçava (coisa comum no free tier) o sistema já ia
 * gastando Claude antes de tentar as opções 100% grátis que ainda sobravam.
 * Agora ele só é acionado se TODOS os gratuitos falharem no mesmo item —
 * continua na bancada como último recurso (pra nunca travar a produção por
 * completo), mas não é mais gasto por padrão.
 */
async function triarComCascata(item: ItemBruto): Promise<ResumoGemini | null> {
  let resumo = await triarComOllama(item);

  if (resumo) {
    await log("info", "pipeline", "Triagem resolvida pela IA local (Ollama) — sem gastar cota de nuvem", { url: item.url });
  } else if (estaDisponivel("gemini")) {
    resumo = await triarComGemini(item);
  } else {
    await log("info", "pipeline", "Gemini pulado (sem fôlego recente) — indo direto pro Groq", { url: item.url });
  }

  if (!resumo && estaDisponivel("groq")) {
    await log("warning", "pipeline", "Gemini falhou/atingiu cota na triagem — acionando fallback Groq", { url: item.url });
    resumo = await triarComGroqFallback(item);
  } else if (!resumo) {
    await log("info", "pipeline", "Groq pulado (sem fôlego recente) — indo direto pro OpenRouter", { url: item.url });
  }

  if (!resumo && estaDisponivel("openrouter")) {
    await log("warning", "pipeline", "Groq falhou no fallback de triagem — acionando OpenRouter", { url: item.url });
    resumo = await triarComOpenRouterFallback(item);
  } else if (!resumo) {
    await log("info", "pipeline", "OpenRouter pulado (sem fôlego recente) — indo direto pro Mistral", { url: item.url });
  }

  // Mistral e Cohere (22/11/2026, a pedido do Valter — "ampliar a bancada
  // de IA"): dois elos a mais na cascata, cada um com sua própria cota
  // gratuita independente — quanto mais longa a cascata, menor a chance de
  // um apagão total travar a produção de notícia.
  if (!resumo && estaDisponivel("mistral")) {
    resumo = await triarComMistralFallback(item);
  } else if (!resumo) {
    await log("info", "pipeline", "Mistral pulado (sem fôlego recente) — indo direto pra Cohere", { url: item.url });
  }

  if (!resumo && estaDisponivel("cohere")) {
    resumo = await triarComCohereFallback(item);
  } else if (!resumo) {
    await log("info", "pipeline", "Cohere pulado (sem fôlego recente) — indo pro Claude (único provedor pago, último recurso)", { url: item.url });
  }

  // Claude por último: é o único provedor pago da bancada (ver nota acima).
  if (!resumo && estaDisponivel("claude")) {
    await log("warning", "pipeline", "Todos os provedores gratuitos falharam na triagem — acionando Claude (pago) como último recurso", { url: item.url });
    resumo = await triarComClaude(item);
  }

  if (!resumo) return null; // sujeira de página, ou triagem falhou em todos os provedores

  if (resumo.assuntoJaCoberto) {
    await log("info", "pipeline", "Assunto já coberto nas últimas 24h — descartado", { url: item.url });
    return null;
  }
  if (resumo.conteudoDesatualizado) {
    await log("info", "pipeline", "Conteúdo descreve evento/prazo já encerrado como futuro/atual — descartado por estar desatualizado", {
      url: item.url,
    });
    return null;
  }

  await travarEditoriaForaDeRoraima(item, resumo);
  await travarPorMencaoDeOutroEstado(item, resumo);
  await travarBuscaSemMencaoDeRoraima(item, resumo);

  return resumo;
}

/**
 * Trava de Geografia (flagrado por Valter em 23/11/2026 — matéria de Macapá
 * saiu publicada como editoria "boa_vista", e isso puxou por tabela uma foto
 * real de Boa Vista pra ilustrar um fato de outro estado, dando a entender
 * que aconteceu aqui — risco real de desinformação). O prompt de triagem
 * (prompts.ts) já instrui a IA a nunca classificar fato de fora como
 * "boa_vista"/"roraima", mas uma instrução de prompt pode falhar — por isso
 * esta trava roda em CÓDIGO, depois da IA responder, igual à trava de
 * editoria "brasil_mundo" que já existe em images.ts: nunca depende só da
 * IA obedecer.
 *
 * Regra objetiva, sem depender de adivinhar geografia por palavra-chave
 * (o que arriscaria falso positivo, tipo uma "Avenida Rio Branco" local):
 * se a PRÓPRIA FONTE já está cadastrada como "brasil_mundo" (ou seja, é um
 * veículo nacional/internacional, tipo G1/Agência Brasil — ver
 * fontes_monitoradas.editoria_padrao), a matéria NUNCA pode sair como
 * nenhuma editoria "local" — se a triagem tentar, o sistema corrige sozinho
 * na hora e avisa o Valter na Central de Transparência, criando um registro
 * de auditoria de toda vez que isso for barrado.
 *
 * Alcance ampliado em 23/11/2026: flagrado por Valter um caso real — uma
 * matéria de "Detran-AP" (trânsito em Macapá/Amapá, G1 — Brasil) saiu
 * classificada como "politica" em vez de "brasil_mundo". A trava original
 * só olhava pra "boa_vista"/"roraima", mas TODAS as editorias temáticas
 * deste portal (política, polícia, economia, esportes, saúde, educação,
 * cultura, serviço ao cidadão) são, por desenho, sobre Roraima/Boa Vista —
 * ver as fontes "Busca: Política", "Busca: Economia" etc., todas com o
 * tema de busca explicitamente "em Roraima e Boa Vista". "brasil_mundo" é a
 * ÚNICA editoria genuinamente nacional/internacional — por isso agora a
 * trava usa "qualquer editoria que não seja brasil_mundo", em vez de uma
 * lista manual de só duas, que deixava passar qualquer editoria temática.
 */
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

async function travarEditoriaForaDeRoraima(item: ItemBruto, resumo: ResumoGemini): Promise<void> {
  if (item.editoriaPadrao !== "brasil_mundo") return;
  if (!EDITORIAS_LOCAIS.includes(resumo.editoriaSugerida)) return;

  const editoriaErrada = resumo.editoriaSugerida;
  resumo.editoriaSugerida = "brasil_mundo";

  await log("warning", "pipeline", "Trava de Geografia corrigiu classificação indevida pra editoria local", {
    fonte: item.fonteNome,
    url: item.url,
    editoriaSugeridaPelaIA: editoriaErrada,
  });

  // Um aviso por fonte por dia é suficiente pra mostrar o padrão a Valter
  // sem virar spam na Central de Transparência, caso isso se repita bastante
  // numa mesma fonte no mesmo dia.
  const marcador = `trava-geografia-${item.fonteId}-${new Date().toISOString().slice(0, 10)}`;
  if (!(await jaInformouHoje("Editor-chefe", marcador))) {
    await informar(
      "Editor-chefe",
      `Travei uma classificação errada antes de publicar: a triagem sugeriu "${editoriaErrada}" pra uma matéria vinda de "${item.fonteNome}" — uma fonte que já está cadastrada como nacional/internacional ("brasil_mundo"), não de Roraima. Troquei a editoria pra "brasil_mundo" automaticamente, pra matéria de fora nunca sair classificada como se fosse local (isso também evita usar foto real de Boa Vista pra ilustrar um fato de outro lugar).`,
      { fonte: item.fonteNome, url: item.url, editoriaSugeridaPelaIA: editoriaErrada, marcador }
    );
  }
}

/**
 * Nomes completos de outros estados brasileiros (nunca nomes de cidade
 * isolados — ver comentário abaixo do porquê). Usado só pra detectar
 * menção a OUTRO estado; "Roraima" nunca entra aqui.
 */
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

function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Segunda Trava de Geografia (flagrado por Valter em 24/11/2026 — matéria
 * de resgate de jacaré em Macapá/AP saiu publicada como "Polícia", com
 * crédito "G1 — Brasil", mesmo depois da trava acima já existir). A trava
 * original só corrige quando a PRÓPRIA FONTE está cadastrada como
 * "brasil_mundo" — mas essa matéria veio de uma fonte tipo "Busca" já
 * cadastrada com editoria local (ex: "Busca: Polícia"), cujo tema de
 * pesquisa é "notícias de polícia em Roraima" mas que, na prática, a IA de
 * busca às vezes traz resultado de fora (mesmo instruída a não trazer).
 * Ou seja: confiar só na editoria_padrao da fonte não basta quando a
 * fonte é "busca" (pesquisa aberta, sem URL fixa) — por isso esta segunda
 * trava olha o CONTEÚDO em si (título + texto bruto + tópicos apurados),
 * não a fonte, e barra sempre que o fato menciona outro estado brasileiro
 * por extenso. Evita adivinhar por nome de cidade (ex: "Rio Branco" é
 * cidade do Acre E também avenida principal de Boa Vista — colidiria),
 * usando só nome de ESTADO completo, que não tem esse risco de colisão.
 */
async function travarPorMencaoDeOutroEstado(item: ItemBruto, resumo: ResumoGemini): Promise<void> {
  if (!EDITORIAS_LOCAIS.includes(resumo.editoriaSugerida)) return;

  const textoCompleto = normalizarTexto(`${item.tituloOriginal} ${item.conteudoBruto} ${resumo.topicos.join(" ")}`);
  if (/\broraima\b/.test(textoCompleto)) {
    // Se o próprio texto já cita "Roraima" explicitamente, não aplica esta
    // trava por nome de estado isolado — evita falso positivo de matéria
    // que compara/menciona outro estado de passagem mas é mesmo local.
    return;
  }

  const estadoEncontrado = OUTROS_ESTADOS.find((estado) => {
    const normalizado = normalizarTexto(estado);
    const regex = new RegExp(`\\b${normalizado.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return regex.test(textoCompleto);
  });
  if (!estadoEncontrado) return;

  const editoriaErrada = resumo.editoriaSugerida;
  resumo.editoriaSugerida = "brasil_mundo";

  await log("warning", "pipeline", "Trava de Geografia (por conteúdo) corrigiu classificação indevida pra editoria local", {
    fonte: item.fonteNome,
    url: item.url,
    editoriaSugeridaPelaIA: editoriaErrada,
    estadoEncontrado,
  });

  const marcador = `trava-geografia-conteudo-${item.fonteId}-${new Date().toISOString().slice(0, 10)}`;
  if (!(await jaInformouHoje("Editor-chefe", marcador))) {
    await informar(
      "Editor-chefe",
      `Travei uma classificação errada antes de publicar: a triagem sugeriu "${editoriaErrada}" pra uma matéria de "${item.fonteNome}" que menciona "${estadoEncontrado}" — outro estado, não Roraima. Mesmo a fonte estando cadastrada com editoria local (ela é do tipo "Busca", que pesquisa o tema na web e às vezes traz resultado de fora), o texto da própria matéria não é daqui. Troquei a editoria pra "brasil_mundo" automaticamente.`,
      { fonte: item.fonteNome, url: item.url, editoriaSugeridaPelaIA: editoriaErrada, estadoEncontrado, marcador }
    );
  }
}

/** Os 15 municípios de Roraima — usado só pra RECONHECER conteúdo local. */
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

/**
 * Terceira Trava de Geografia (flagrado por Valter em 24/11/2026, mesmo dia
 * da segunda trava acima — 3 matérias escaparam dela: "Patos de Minas" não
 * citava "Minas Gerais" por extenso, só o nome do município, e duas eram
 * notícia puramente internacional (Pentágono/EUA, El Niño no Pacífico/EUA),
 * sem citar NENHUM estado brasileiro pra travar em cima. A trava de cima
 * (travarPorMencaoDeOutroEstado) é uma lista negativa — só pega quando
 * acerta o nome exato de outro estado — e por isso tem brecha estrutural:
 * qualquer fato que não cite nenhum estado brasileiro (internacional, ou
 * cidade sem o nome do estado junto) passa reto por ela.
 *
 * Esta trava inverte a lógica pra uma exigência POSITIVA, sem essa brecha:
 * uma fonte do tipo "busca" só pode entregar editoria local (política,
 * polícia, economia etc.) se o próprio texto mencionar Roraima, Boa Vista
 * ou um dos outros 14 municípios do estado. Não há lista de "o que
 * bloquear" pra manter atualizada — não importa se é Minas, EUA ou
 * qualquer lugar nunca listado, se não fala de Roraima, vira "brasil_mundo".
 *
 * Restrita a fonteTipo === "busca" de propósito: fontes RSS/HTML são URL
 * fixa de veículo local já escolhido a dedo (Folha de Boa Vista, PCRR,
 * Prefeitura etc.) — uma nota curta de agenda pode não repetir "Roraima"
 * ou "Boa Vista" no texto e isso é normal, não indica erro de fonte.
 * "Busca" é o único tipo sem URL fixa (pesquisa aberta via IA) e o único
 * com casos reais comprovados de trazer resultado de fora.
 */
async function travarBuscaSemMencaoDeRoraima(item: ItemBruto, resumo: ResumoGemini): Promise<void> {
  if (item.fonteTipo !== "busca") return;
  if (!EDITORIAS_LOCAIS.includes(resumo.editoriaSugerida)) return;

  const textoCompleto = normalizarTexto(`${item.tituloOriginal} ${item.conteudoBruto} ${resumo.topicos.join(" ")}`);

  const mencionaRoraima = /\broraima\b/.test(textoCompleto);
  const mencionaMunicipio = MUNICIPIOS_RORAIMA.some((municipio) => {
    const normalizado = normalizarTexto(municipio);
    const regex = new RegExp(`\\b${normalizado.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return regex.test(textoCompleto);
  });
  if (mencionaRoraima || mencionaMunicipio) return;

  const editoriaErrada = resumo.editoriaSugerida;
  resumo.editoriaSugerida = "brasil_mundo";

  await log("warning", "pipeline", "Trava de Geografia (exigência positiva) corrigiu classificação indevida pra editoria local", {
    fonte: item.fonteNome,
    url: item.url,
    editoriaSugeridaPelaIA: editoriaErrada,
  });

  const marcador = `trava-geografia-positiva-${item.fonteId}-${new Date().toISOString().slice(0, 10)}`;
  if (!(await jaInformouHoje("Editor-chefe", marcador))) {
    await informar(
      "Editor-chefe",
      `Travei uma classificação errada antes de publicar: a triagem sugeriu "${editoriaErrada}" pra uma matéria de "${item.fonteNome}" (fonte do tipo "Busca") que não menciona Roraima, Boa Vista nem nenhum outro município do estado em nenhum momento do texto. Como essa editoria é só pra conteúdo local, troquei pra "brasil_mundo" automaticamente — mesmo sem citar outro estado específico, o fato simplesmente não é daqui.`,
      { fonte: item.fonteNome, url: item.url, editoriaSugeridaPelaIA: editoriaErrada, marcador }
    );
  }
}

/**
 * Quarta Trava de Geografia — a mais importante de todas, descoberta ao
 * investigar por que as 3 anteriores (todas na TRIAGEM) não bastaram: a
 * triagem corrige `resumo.editoriaSugerida` certinho, mas esse valor
 * corrigido era passado pro Redator só como TEXTO DENTRO DO PROMPT
 * ("editoriaSugerida: X") — uma sugestão, não uma ordem. O Redator (a IA que
 * escreve a matéria final) devolve seu PRÓPRIO campo `editoria` no JSON de
 * saída, e nada no código obrigava esse campo a bater com o que a triagem já
 * tinha decidido. Ou seja: mesmo com a editoria corrigida 3x na triagem, o
 * Redator podia simplesmente ignorar a sugestão e escolher de novo por conta
 * própria — e foi exatamente isso que aconteceu com "Pentágono/drones",
 * "El Niño/EUA" e "Patos de Minas" (24/11/2026): a triagem até pode ter
 * sugerido certo ou errado, mas o Redator tinha a palavra final de fato, sem
 * nenhuma trava decidindo por cima dele.
 *
 * Esta função fecha esse buraco pra sempre: depois que o Redator termina de
 * escrever, SOBRESCREVE `materia.editoria` com o valor que a triagem (já
 * passada pelas 3 travas de geografia acima) decidiu — sem perguntar, sem
 * exceção. O Redator continua livre pra escrever título, texto, tags; a
 * editoria nunca mais é opinião dele.
 */
async function travarEditoriaDaRedacao(materia: MateriaRedigida, editoriaTravada: Editoria, item: ItemBruto): Promise<void> {
  if (materia.editoria === editoriaTravada) return;

  const editoriaDoRedator = materia.editoria;
  materia.editoria = editoriaTravada;

  await log("warning", "pipeline", "Trava de Geografia (redação) corrigiu editoria que o Redator tinha trocado por conta própria", {
    fonte: item.fonteNome,
    url: item.url,
    editoriaDecididaNaTriagem: editoriaTravada,
    editoriaEscolhidaPeloRedator: editoriaDoRedator,
  });
}

/**
 * Redação-Chefe com Fallback em cascata — Gemini -> Groq -> OpenRouter ->
 * Mistral -> Cohere -> Claude — fonte única.
 *
 * Ordem invertida em 23/11/2026 (mesmo motivo da triagem acima): Claude é
 * pago, todo o resto é grátis — ele só escreve a matéria quando os 5
 * provedores gratuitos falharem todos pra esse item.
 */
async function redigirComCascata(paramsRedacao: {
  topicos: string[];
  fonteNome: string;
  fonteUrl: string;
  editoriaSugerida: Editoria;
}): Promise<{ materia: MateriaRedigida; origemIA: OrigemIA } | null> {
  let materia: MateriaRedigida | null = null;
  let origemIA: OrigemIA = "gemini";

  if (estaDisponivel("gemini")) {
    materia = await redigirComGeminiFallback(paramsRedacao);
  } else {
    await log("info", "pipeline", "Gemini pulado na redação (sem fôlego recente) — indo direto pro Groq", { fonte: paramsRedacao.fonteNome });
  }

  if (!materia && estaDisponivel("groq")) {
    origemIA = "groq";
    materia = await redigirComGroqFallback(paramsRedacao);
  }

  if (!materia && estaDisponivel("openrouter")) {
    origemIA = "openrouter";
    materia = await redigirComOpenRouterFallback(paramsRedacao);
  }

  if (!materia && estaDisponivel("mistral")) {
    origemIA = "mistral";
    materia = await redigirComMistralFallback(paramsRedacao);
  }

  if (!materia && estaDisponivel("cohere")) {
    origemIA = "cohere";
    materia = await redigirComCohereFallback(paramsRedacao);
  }

  // Claude por último: único provedor pago da bancada (ver nota acima).
  if (!materia && estaDisponivel("claude")) {
    try {
      origemIA = "claude";
      materia = await redigirComClaude(paramsRedacao);
    } catch (err: any) {
      if (pareceErroDeCota(err)) await marcarIndisponivel("claude", String(err?.message ?? err));
      await log("warning", "pipeline", "Todos os provedores gratuitos falharam na redação — Claude (pago, último recurso) também falhou/atingiu cota", {
        fonte: paramsRedacao.fonteNome,
        erro: String(err?.message ?? err),
      });
    }
  }

  if (!materia) return null;
  return { materia, origemIA };
}

/**
 * Redação-Chefe com Fallback em cascata — Curadoria Multi-Fonte (mesma
 * ordem invertida de 23/11/2026 da redação de fonte única acima, prompt
 * diferente): Gemini -> Groq -> OpenRouter -> Mistral -> Cohere -> Claude.
 */
async function redigirMultiFonteComCascata(paramsRedacao: {
  fontes: Array<{ nome: string; topicos: string[] }>;
  editoriaSugerida: Editoria;
}): Promise<{ materia: MateriaRedigida; origemIA: OrigemIA } | null> {
  let materia: MateriaRedigida | null = null;
  let origemIA: OrigemIA = "gemini";
  const rotulo = paramsRedacao.fontes.map((f) => f.nome).join(" + ");

  if (estaDisponivel("gemini")) {
    materia = await redigirMultiFonteComGeminiFallback(paramsRedacao);
  }

  if (!materia && estaDisponivel("groq")) {
    origemIA = "groq";
    materia = await redigirMultiFonteComGroqFallback(paramsRedacao);
  }

  if (!materia && estaDisponivel("openrouter")) {
    origemIA = "openrouter";
    materia = await redigirMultiFonteComOpenRouterFallback(paramsRedacao);
  }

  if (!materia && estaDisponivel("mistral")) {
    origemIA = "mistral";
    materia = await redigirMultiFonteComMistralFallback(paramsRedacao);
  }

  if (!materia && estaDisponivel("cohere")) {
    origemIA = "cohere";
    materia = await redigirMultiFonteComCohereFallback(paramsRedacao);
  }

  // Claude por último: único provedor pago da bancada.
  if (!materia && estaDisponivel("claude")) {
    try {
      origemIA = "claude";
      materia = await redigirMultiFonteComClaude(paramsRedacao);
    } catch (err: any) {
      if (pareceErroDeCota(err)) await marcarIndisponivel("claude", String(err?.message ?? err));
      await log("warning", "pipeline", "Todos os provedores gratuitos falharam na redação multi-fonte — Claude (pago, último recurso) também falhou/atingiu cota", {
        fontes: rotulo,
        erro: String(err?.message ?? err),
      });
    }
  }

  if (!materia) return null;
  return { materia, origemIA };
}

/**
 * Orquestra a esteira completa de FONTE ÚNICA: IA local (Ollama) -> Gemini
 * -> Claude -> Groq na triagem, depois Claude (redação-chefe) -> Fallback
 * automático (Gemini Flash, depois Groq/Llama, depois OpenRouter) em caso
 * de erro ou limite de cota.
 */
export async function processarItem(item: ItemBruto): Promise<ResultadoPipeline | null> {
  const resumo = await triarComCascata(item);
  if (!resumo) return null;

  const paramsRedacao = {
    topicos: resumo.topicos,
    fonteNome: item.fonteNome,
    fonteUrl: item.url,
    editoriaSugerida: resumo.editoriaSugerida,
  };

  const resultado = await redigirComCascata(paramsRedacao);
  if (!resultado) {
    await log("critico", "pipeline", "Todas as IAs da bancada falharam para este item — descartado", { url: item.url });
    return null;
  }

  await travarEditoriaDaRedacao(resultado.materia, resumo.editoriaSugerida, item);

  await log("info", "pipeline", `Matéria redigida com sucesso via ${resultado.origemIA}`, { url: item.url, titulo: resultado.materia.titulo });

  return {
    materia: resultado.materia,
    origemIA: resultado.origemIA,
    palavraChaveImagem: resumo.palavraChaveImagem,
    fonteUrl: item.url,
    fonteNome: item.fonteNome,
    topicosApurados: resumo.topicos,
    fonteCreditoPublico: calcularCreditoPublico(resultado.materia.fontePrimaria, [
      { nome: item.fonteNome, creditarPublicamente: item.creditarPublicamente },
    ]),
  };
}

/**
 * Curadoria Multi-Fonte (proposta de Valter, 22/11/2026, parte 2): recebe um
 * grupo de 2+ itens que o Agrupador (agrupador.ts) identificou como o MESMO
 * fato contado por fontes diferentes no mesmo ciclo. Roda a MESMA triagem
 * de sempre em cada item do grupo (pra extrair os tópicos de cada fonte
 * isoladamente), e então:
 *   - se só 1 fonte sobreviver à triagem (as outras descartadas por sujeira/
 *     já coberto/desatualizado), cai pro caminho normal de fonte única —
 *     sem perder a apuração já feita.
 *   - se 2+ sobreviverem, cruza os tópicos de todas numa única matéria via
 *     promptRedacaoMultiFonte (extrai fatos -> cruza fontes -> acrescenta
 *     parágrafo de contexto exclusivo Radar BV).
 * Sempre devolve `fontesCruzadas` preenchido (mesmo com 1 item só), pra
 * queue.ts saber exatamente qual URL/hash fechar na Trava de Silêncio.
 */
export async function processarItemMultiFonte(
  itens: Array<ItemBruto & { hash: string }>
): Promise<ResultadoPipeline | null> {
  const apuracoes: Array<{ item: ItemBruto & { hash: string }; resumo: ResumoGemini }> = [];

  for (const item of itens) {
    const resumo = await triarComCascata(item);
    if (resumo) apuracoes.push({ item, resumo });
  }

  if (apuracoes.length === 0) return null;

  if (apuracoes.length === 1) {
    const { item, resumo } = apuracoes[0];
    const resultado = await redigirComCascata({
      topicos: resumo.topicos,
      fonteNome: item.fonteNome,
      fonteUrl: item.url,
      editoriaSugerida: resumo.editoriaSugerida,
    });
    if (!resultado) {
      await log("critico", "pipeline", "Todas as IAs da bancada falharam (grupo multi-fonte reduzido a 1 item) — descartado", { url: item.url });
      return null;
    }
    await travarEditoriaDaRedacao(resultado.materia, resumo.editoriaSugerida, item);
    return {
      materia: resultado.materia,
      origemIA: resultado.origemIA,
      palavraChaveImagem: resumo.palavraChaveImagem,
      fonteUrl: item.url,
      fonteNome: item.fonteNome,
      topicosApurados: resumo.topicos,
      fonteCreditoPublico: calcularCreditoPublico(resultado.materia.fontePrimaria, [
        { nome: item.fonteNome, creditarPublicamente: item.creditarPublicamente },
      ]),
      fontesCruzadas: [{ fonteId: item.fonteId, url: item.url, nome: item.fonteNome, hash: item.hash }],
    };
  }

  const paramsRedacao = {
    fontes: apuracoes.map((a) => ({ nome: a.item.fonteNome, topicos: a.resumo.topicos })),
    editoriaSugerida: apuracoes[0].resumo.editoriaSugerida,
  };

  const resultado = await redigirMultiFonteComCascata(paramsRedacao);
  if (!resultado) {
    await log("critico", "pipeline", "Todas as IAs da bancada falharam na redação multi-fonte — descartado", {
      fontes: apuracoes.map((a) => a.item.fonteNome),
    });
    return null;
  }

  const principal = apuracoes[0];
  const nomes = apuracoes.map((a) => a.item.fonteNome);
  const fonteCreditoFormatado = juntarNomes(nomes) ?? nomes[0];

  await travarEditoriaDaRedacao(resultado.materia, principal.resumo.editoriaSugerida, principal.item);

  await log("info", "pipeline", `Matéria multi-fonte redigida com sucesso via ${resultado.origemIA}`, { fontes: nomes, titulo: resultado.materia.titulo });

  return {
    materia: resultado.materia,
    origemIA: resultado.origemIA,
    palavraChaveImagem: principal.resumo.palavraChaveImagem,
    fonteUrl: principal.item.url,
    fonteNome: fonteCreditoFormatado,
    topicosApurados: apuracoes.flatMap((a) => a.resumo.topicos),
    fonteCreditoPublico: calcularCreditoPublico(
      resultado.materia.fontePrimaria,
      apuracoes.map((a) => ({ nome: a.item.fonteNome, creditarPublicamente: a.item.creditarPublicamente }))
    ),
    fontesCruzadas: apuracoes.map((a) => ({ fonteId: a.item.fonteId, url: a.item.url, nome: a.item.fonteNome, hash: a.item.hash })),
  };
}
