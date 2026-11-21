import type { Editoria, OrigemIA } from "./types";

export type StatusNoticia = "rascunho" | "agendado" | "publicado" | "erro" | "removido";

/** Shape completo da tabela `noticias`, para uso do painel admin (o `lib/types.ts`
 * tem a versão pública, mais enxuta, usada pelo site). */
export interface Noticia {
  id: string;
  titulo: string;
  subtitulo: string | null;
  slug: string;
  conteudo: string;
  resumo_whatsapp: string | null;
  editoria: Editoria;
  tags: string[];
  imagem_url: string | null;
  imagem_credito: string | null;
  imagem_e_fallback: boolean;
  fonte_id: string | null;
  fonte_url_original: string;
  fonte_credito: string | null;
  origem_ia: OrigemIA;
  status: StatusNoticia;
  destaque: boolean;
  urgente: boolean;
  visualizacoes: number;
  data_publicacao: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface FonteMonitorada {
  id: string;
  nome: string;
  url_base: string;
  tipo: "rss" | "html" | "api" | "busca";
  editoria_padrao: Editoria | null;
  ativa: boolean;
  confiabilidade: number;
  ultima_verificacao: string | null;
  ultimo_erro: string | null;
  erros_consecutivos: number;
  criado_em: string;
}

export type TipoAnunciante = "patrocinador_externo" | "interno_ecossistema" | "captacao_anunciante" | "adsense";
export type PosicaoBanner = "topo" | "meio_materia" | "lateral" | "rodape";

export interface Banner {
  id: string;
  nome_anunciante: string;
  tipo_anunciante: TipoAnunciante;
  posicao: PosicaoBanner;
  imagem_url: string | null;
  link_destino: string | null;
  link_whatsapp: string | null;
  is_adsense: boolean;
  ad_slot_id: string | null;
  tags_contextuais: string[];
  editorias_contextuais: Editoria[];
  prioridade: number;
  data_inicio: string;
  data_fim: string | null;
  ativo: boolean;
  cliques: number;
  visualizacoes: number;
  criado_em: string;
}

export interface DestinoWhatsApp {
  id: string;
  nome: string;
  tipo: "grupo" | "canal";
  webhook_url: string;
  ativo: boolean;
  resumo_diario: boolean;
  criado_em: string;
}

export type StatusDica = "pendente" | "processada" | "descartada";

export interface Dica {
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
