import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import type { Banner, DestinoWhatsApp, FonteMonitorada, Noticia, StatusNoticia } from "./admin-types";

export async function obterResumoDashboard() {
  const db = supabaseAdmin();

  const [{ count: publicadas }, { count: agendadas }, { count: rascunhos }, { data: fontesComErro }, { data: logsRecentes }] =
    await Promise.all([
      db.from("noticias").select("id", { count: "exact", head: true }).eq("status", "publicado"),
      db.from("noticias").select("id", { count: "exact", head: true }).eq("status", "agendado"),
      db.from("noticias").select("id", { count: "exact", head: true }).eq("status", "rascunho"),
      db.from("fontes_monitoradas").select("id, nome, erros_consecutivos, ultimo_erro").gt("erros_consecutivos", 0).order("erros_consecutivos", { ascending: false }),
      db.from("logs_sistema").select("id, nivel, origem, mensagem, criado_em").order("criado_em", { ascending: false }).limit(15),
    ]);

  return {
    publicadas: publicadas ?? 0,
    agendadas: agendadas ?? 0,
    rascunhos: rascunhos ?? 0,
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
