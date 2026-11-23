import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import type {
  Banner,
  Dica,
  DestinoWhatsApp,
  FonteMonitorada,
  Noticia,
  Reclamacao,
  RelatorioRedacao,
  StatusNoticia,
  StatusReclamacao,
  TipoRelatorioRedacao,
} from "./admin-types";

export async function obterResumoDashboard() {
  const db = supabaseAdmin();

  const [
    { count: publicadas },
    { count: agendadas },
    { count: rascunhos },
    { count: reclamacoesPendentes },
    { count: perguntasPendentes },
    { data: fontesComErro },
    { data: logsRecentes },
  ] = await Promise.all([
    db.from("noticias").select("id", { count: "exact", head: true }).eq("status", "publicado"),
    db.from("noticias").select("id", { count: "exact", head: true }).eq("status", "agendado"),
    db.from("noticias").select("id", { count: "exact", head: true }).eq("status", "rascunho"),
    db.from("reclamacoes_ouvidoria").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    db.from("relatorios_redacao").select("id", { count: "exact", head: true }).eq("tipo", "pergunta").neq("status", "respondido"),
    db.from("fontes_monitoradas").select("id, nome, erros_consecutivos, ultimo_erro").gt("erros_consecutivos", 0).order("erros_consecutivos", { ascending: false }),
    db.from("logs_sistema").select("id, nivel, origem, mensagem, criado_em").order("criado_em", { ascending: false }).limit(15),
  ]);

  return {
    publicadas: publicadas ?? 0,
    agendadas: agendadas ?? 0,
    rascunhos: rascunhos ?? 0,
    reclamacoesPendentes: reclamacoesPendentes ?? 0,
    perguntasPendentes: perguntasPendentes ?? 0,
    fontesComErro: fontesComErro ?? [],
    logsRecentes: logsRecentes ?? [],
  };
}

export async function listarNoticias(filtroStatus?: StatusNoticia): Promise<Noticia[]> {
  const db = supabaseAdmin();
  let query = db.from("noticias").select("*").order("criado_em", { ascending: false }).limit(100);
  if (filtroStatus) query = query.eq("status", filtroStatus);
  const { data, error } = await query;
  if (error) throw new Error(`Falha ao listar notícias: ${error.message}`);
  return (data ?? []) as Noticia[];
}

export async function obterNoticiaPorId(id: string): Promise<Noticia | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("noticias").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Falha ao buscar notícia: ${error.message}`);
  return (data as Noticia) ?? null;
}

export async function listarFontes(): Promise<FonteMonitorada[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("fontes_monitoradas").select("*").order("criado_em", { ascending: false });
  if (error) throw new Error(`Falha ao listar fontes: ${error.message}`);
  return (data ?? []) as FonteMonitorada[];
}

export async function listarBanners(): Promise<Banner[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("banners_publicidade").select("*").order("criado_em", { ascending: false });
  if (error) throw new Error(`Falha ao listar banners: ${error.message}`);
  return (data ?? []) as Banner[];
}

export async function listarDestinosWhatsApp(): Promise<DestinoWhatsApp[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("destinos_whatsapp").select("*").order("criado_em", { ascending: false });
  if (error) throw new Error(`Falha ao listar destinos de WhatsApp: ${error.message}`);
  return (data ?? []) as DestinoWhatsApp[];
}

export async function listarDicas(): Promise<Dica[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("dicas_bairro").select("*").order("criado_em", { ascending: false }).limit(100);
  if (error) throw new Error(`Falha ao listar dicas de moradores: ${error.message}`);
  return (data ?? []) as Dica[];
}

export async function listarReclamacoes(filtroStatus?: StatusReclamacao): Promise<Reclamacao[]> {
  const db = supabaseAdmin();
  let query = db.from("reclamacoes_ouvidoria").select("*").order("criado_em", { ascending: false }).limit(100);
  if (filtroStatus) query = query.eq("status", filtroStatus);
  const { data, error } = await query;
  if (error) throw new Error(`Falha ao listar reclamações da ouvidoria: ${error.message}`);
  return (data ?? []) as Reclamacao[];
}

/**
 * Painel do Administrador / Central de Transparência (item 22). `filtroTipo`
 * deixa a aba "Perguntas" mostrar só o que precisa de decisão do Valter; sem
 * filtro, mostra tudo (informes + perguntas) em ordem cronológica reversa —
 * igual uma caixa de entrada.
 */
export async function listarRelatorios(filtroTipo?: TipoRelatorioRedacao): Promise<RelatorioRedacao[]> {
  const db = supabaseAdmin();
  let query = db.from("relatorios_redacao").select("*").order("criado_em", { ascending: false }).limit(150);
  if (filtroTipo) query = query.eq("tipo", filtroTipo);
  const { data, error } = await query;
  if (error) throw new Error(`Falha ao listar relatórios da redação de IA: ${error.message}`);
  return (data ?? []) as RelatorioRedacao[];
}
