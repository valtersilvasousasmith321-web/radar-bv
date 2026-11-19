"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirLogin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function criarFonte(formData: FormData): Promise<void> {
  await exigirLogin();

  const nome = String(formData.get("nome") ?? "").trim();
  const url_base = String(formData.get("url_base") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "rss");
  const editoria_padrao = String(formData.get("editoria_padrao") ?? "") || null;

  if (!nome || !url_base) redirect("/admin/fontes?erro=campos_obrigatorios");

  const { error } = await supabaseAdmin().from("fontes_monitoradas").insert({ nome, url_base, tipo, editoria_padrao });
  if (error) redirect(`/admin/fontes?erro=${encodeURIComponent(error.message)}`);

  revalidatePath("/admin/fontes");
  redirect("/admin/fontes?salvo=1");
}

/** Reativa a fonte e zera o contador de erros (Isolamento de Fontes) —
 * usado quando o problema que a desativou já foi corrigido manualmente. */
export async function reativarFonte(id: string): Promise<void> {
  await exigirLogin();
  const { error } = await supabaseAdmin().from("fontes_monitoradas").update({ ativa: true, erros_consecutivos: 0, ultimo_erro: null }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/fontes");
}

export async function desativarFonte(id: string): Promise<void> {
  await exigirLogin();
  const { error } = await supabaseAdmin().from("fontes_monitoradas").update({ ativa: false }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/fontes");
}

export async function excluirFonte(id: string): Promise<void> {
  await exigirLogin();
  const { error } = await supabaseAdmin().from("fontes_monitoradas").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/fontes");
}
