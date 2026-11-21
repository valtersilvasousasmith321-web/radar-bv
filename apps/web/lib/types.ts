export type Editoria =
  | "boa_vista"
  | "roraima"
  | "policia"
  | "politica"
  | "economia"
  | "esportes"
  | "brasil_mundo";

export type OrigemIA = "claude" | "gemini" | "groq" | "manual";

export interface Noticia {
  id: string;
  titulo: string;
  subtitulo: string | null;
  slug: string;
  conteudo: string;
  editoria: Editoria;
  tags: string[];
  imagem_url: string | null;
  imagem_credito: string | null;
  imagem_e_fallback: boolean;
  fonte_url_original: string;
  fonte_credito: string | null;
  origem_ia: OrigemIA;
  destaque: boolean;
  urgente: boolean;
  visualizacoes: number;
  data_publicacao: string | null;
  criado_em: string;
}

export interface Banner {
  id: string;
  nome_anunciante: string;
  tipo_anunciante: "patrocinador_externo" | "interno_ecossistema" | "captacao_anunciante" | "adsense";
  posicao: "topo" | "meio_materia" | "lateral" | "rodape";
  imagem_url: string | null;
  link_destino: string | null;
  link_whatsapp: string | null;
  tags_contextuais?: string[];
  editorias_contextuais?: string[];
  prioridade?: number;
}

export const EDITORIAS: { slug: Editoria; label: string }[] = [
  { slug: "boa_vista", label: "Boa Vista" },
  { slug: "roraima", label: "Roraima" },
  { slug: "policia", label: "Polícia" },
  { slug: "politica", label: "Política" },
  { slug: "economia", label: "Economia" },
  { slug: "esportes", label: "Esportes" },
  { slug: "brasil_mundo", label: "Brasil & Mundo" },
];

export const NOME_EDITORIA: Record<Editoria, string> = {
  boa_vista: "Boa Vista",
  roraima: "Roraima",
  policia: "Polícia",
  politica: "Política",
  economia: "Economia",
  esportes: "Esportes",
  brasil_mundo: "Brasil & Mundo",
};

export const ORIGEM_IA_LABEL: Record<OrigemIA, string> = {
  claude: "Claude",
  gemini: "Gemini",
  groq: "Groq (Llama)",
  manual: "equipe do Radar BV",
};
