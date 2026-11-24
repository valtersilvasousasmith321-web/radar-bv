import type { CorrecaoNota, Editoria, FonteCruzada, OrigemIA } from "./types";

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
  correcoes: CorrecaoNota[];
  fonte_id: string | null;
  fonte_url_original: string;
  fonte_credito: string | null;
  fontes_cruzadas: FonteCruzada[] | null;
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
  tipo: "rss" | "html" | "api" | "busca" | "pdf";
  editoria_padrao: Editoria | null;
  ativa: boolean;
  confiabilidade: number;
  ultima_verificacao: string | null;
  ultimo_erro: string | null;
  erros_consecutivos: number;
  criado_em: string;
}

/** Foto no banco de fotos reutilizável do painel admin (upload manual do
 * Valter), separado do `imagens_fallback` (que é só pro pipeline de IA usar
 * quando não acha imagem via Unsplash/Pexels/Pixabay). Serve pra trocar a
 * foto de uma notícia já publicada e pra publicar notícias manuais. */
export interface FotoBanco {
  id: string;
  url: string;
  caminho_storage: string;
  descricao: string | null;
  editoria: Editoria | null;
  credito: string | null;
  enviada_por: string | null;
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

export type StatusReclamacao = "pendente" | "respondida" | "arquivada";

/** Reclamação/apontamento de erro enviado pelo leitor (item 21 — Ouvidoria) */
export interface Reclamacao {
  id: string;
  noticia_id: string | null;
  nome: string | null;
  email: string | null;
  mensagem: string;
  status: StatusReclamacao;
  resposta_admin: string | null;
  criado_em: string;
  respondido_em: string | null;
}

export type TipoRelatorioRedacao = "informe" | "pergunta";
export type StatusRelatorioRedacao = "novo" | "lido" | "respondido";

/**
 * Relato de uma área da redação de IA pro Valter, em linguagem simples
 * (item 22 — Painel do Administrador / Central de Transparência). Quando
 * `tipo` é "pergunta", a área está pedindo opinião/decisão dele, que
 * responde direto aqui — sem abrir SQL.
 */
export interface RelatorioRedacao {
  id: string;
  papel: string;
  tipo: TipoRelatorioRedacao;
  mensagem: string;
  detalhes: Record<string, unknown> | null;
  status: StatusRelatorioRedacao;
  resposta_admin: string | null;
  criado_em: string;
  respondido_em: string | null;
}
