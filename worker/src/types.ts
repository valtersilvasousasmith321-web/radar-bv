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
export type OrigemIA = "claude" | "gemini" | "groq" | "manual";
export type TipoFonte = "rss" | "html" | "api" | "busca";
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
}

export interface ResultadoImagem {
  url: string;
  credito: string;
  eFallback: boolean;
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
