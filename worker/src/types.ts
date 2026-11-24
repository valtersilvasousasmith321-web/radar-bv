export type Editoria =
  | "boa_vista"
  | "roraima"
  | "policia"
  | "politica"
  | "economia"
  | "esportes"
  | "brasil_mundo"
  | "servico_cidadao"
  | "saude"
  | "educacao"
  | "cultura";

export type StatusNoticia = "rascunho" | "agendado" | "publicado" | "erro" | "removido";
export type OrigemIA = "claude" | "gemini" | "groq" | "openrouter" | "mistral" | "cohere" | "manual";
export type TipoFonte = "rss" | "html" | "api" | "busca" | "pdf";
export type NivelLog = "info" | "warning" | "error" | "critico";

export interface FonteMonitorada {
  id: string;
  nome: string;
  // Para tipo "rss"/"html"/"api": a URL fixa de onde coletar.
  // Para tipo "busca": NÃO é uma URL — é o TEMA/assunto a pesquisar na web
  // (ex: "notícias de Boa Vista e Roraima hoje"), usado pelo pesquisador.ts.
  url_base: string;
  tipo: TipoFonte;
  editoria_padrao: Editoria | null;
  ativa: boolean;
  confiabilidade: number;
  erros_consecutivos: number;
  /**
   * Teto de notícias publicadas/agendadas por dia vindas desta fonte
   * (null = sem limite). Existe pra evitar que uma fonte de tema muito
   * amplo e sempre-renovado (ex.: "Busca: Brasil e Mundo") domine
   * desproporcionalmente o feed do portal, que é primariamente local.
   */
  limite_diario: number | null;
  /**
   * Crédito de Fonte Primária (22/11/2026): false = veículo concorrente
   * (ex.: G1, Folha) — só entra no crédito público da matéria se a IA não
   * achar uma fonte primária mais específica dentro do próprio texto
   * (ver MateriaRedigida.fontePrimaria). Fontes oficiais/agências/"busca"
   * continuam true e são creditadas normalmente, como sempre foram.
   */
  creditar_publicamente: boolean;
}

/** Item bruto extraído de um feed RSS/HTML, antes de qualquer IA */
export interface ItemBruto {
  fonteId: string;
  fonteNome: string;
  url: string;
  tituloOriginal: string;
  conteudoBruto: string; // HTML ou texto bruto da matéria/post
  editoriaPadrao: Editoria | null;
  publicadoEm?: string;
  /** Herdado de FonteMonitorada.creditar_publicamente — ver comentário lá. */
  creditarPublicamente: boolean;
  /**
   * Herdado de FonteMonitorada.tipo. Usado na Trava de Geografia (pipeline.ts)
   * para exigir menção explícita a Roraima/Boa Vista só em itens vindos de
   * fonte tipo "busca" (pesquisa aberta via IA, sem URL fixa — a única que
   * comprovadamente pode trazer resultado de fora mesmo com editoria local).
   */
  fonteTipo: TipoFonte;
}

/** Saída da Triagem do Gemini — fatos essenciais mastigados, sem redação final */
export interface ResumoGemini {
  assuntoJaCoberto: boolean; // dedup semântico nas últimas 24h
  conteudoDesatualizado: boolean; // evento/prazo com data específica já encerrada, tratado como futuro/atual no texto-fonte
  topicos: string[]; // 4 a 5 tópicos curtos, fatos objetivos
  palavraChaveImagem: string; // para busca no banco de imagens
  editoriaSugerida: Editoria;
}

/** Saída final da Redação-Chefe (Claude ou fallback) — JSON estrito */
export interface MateriaRedigida {
  titulo: string;
  subtitulo: string;
  conteudo: string; // corpo da matéria em texto/HTML simples
  editoria: Editoria;
  tags: string[];
  urgente: boolean;
  /**
   * Crédito de Fonte Primária (22/11/2026): quando os tópicos apurados
   * citam explicitamente de onde a informação partiu originalmente (um
   * órgão oficial, ministério, polícia, empresa, nota oficial, etc.), a
   * IA preenche aqui com esse nome. null/undefined quando os tópicos não
   * trazem nenhuma atribuição explícita (apuração própria do veículo-fonte,
   * sem fonte externa citada) — nesse caso o crédito público cai pro nome
   * da fonte de coleta normalmente, OU fica em branco se essa fonte for um
   * veículo concorrente (ver FonteMonitorada.creditar_publicamente).
   */
  fontePrimaria?: string | null;
}

export interface ResultadoImagem {
  url: string;
  credito: string;
  eFallback: boolean;
  /**
   * Descrição do QUE a foto mostra de verdade (alt-text do banco de imagem,
   * ou a descrição cadastrada no banco próprio). Corrigido em 24/11/2026:
   * antes essa informação era descartada ao sair de images.ts, e o Revisor
   * Camada 2 (a checagem final antes de publicar) recebia só o crédito
   * ("Foto: Fulano / Unsplash") — nome do fotógrafo não diz o que está
   * retratado, então o revisor não tinha como saber se a foto combinava com
   * a matéria. Ausente (undefined) só pra imagem institucional de fallback,
   * que o Revisor já trata à parte (nunca precisa bater com o assunto).
   */
  descricao?: string;
}

export type TipoDestinoWhatsApp = "grupo" | "canal";

/** Destino de disparo cadastrado no painel admin (Fase 3) */
export interface DestinoWhatsApp {
  id: string;
  nome: string;
  tipo: TipoDestinoWhatsApp;
  webhook_url: string;
  ativo: boolean;
  resumo_diario: boolean;
}

/** Notícia mínima usada para montar o resumo diário */
export interface NoticiaParaResumo {
  id: string;
  titulo: string;
  slug: string;
  editoria: Editoria;
  urgente: boolean;
}

export type StatusDica = "pendente" | "processada" | "descartada";

/** Dica/denúncia de morador recebida via webhook de WhatsApp (item 3 — Pesquisadores por área) */
export interface DicaBairro {
  id: string;
  telefone_remetente: string | null;
  nome_remetente: string | null;
  mensagem_texto: string;
  midia_url: string | null;
  status: StatusDica;
  motivo_descarte: string | null;
  noticia_id: string | null;
  criado_em: string;
  processado_em: string | null;
}

/** Saída da IA ao tentar redigir uma matéria a partir de uma dica de morador */
export type ResultadoDicaIA =
  | { suficiente: true; materia: MateriaRedigida }
  | { suficiente: false; motivo: string };
