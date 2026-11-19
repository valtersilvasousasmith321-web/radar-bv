"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirLogin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function criarDestinoWhatsApp(formData: FormData): Promise<void> {
  await exigirLogin();

  const nome = String(formData.get("nome") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "grupo");
  const webhook_url = String(formData.get("webhook_url") ?? "").trim();
  const resumo_diario = formData.get("resumo_diario") === "on";

  if (!nome || !webhook_url) redirect("/admin/whatsapp?erro=campos_obrigatorios");

  const { error } = await supabaseAdmin().from("destinos_whatsapp").insert({ nome, tipo, webhook_url, resumo_diario });
  if (error) redirect(`/admin/whatsapp?erro=${encodeURIComponent(error.message)}`);

  revalidatePath("/admin/whatsapp");
  redirect("/admin/whatsapp?salvo=1");
}

export async function alternarAtivoDestino(id: string, novoValor: boolean): Promise<void> {
  await exigirLogin();
  const { error } = await supabaseAdmin().from("destinos_whatsapp").update({ ativo: novoValor }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/whatsapp");
}

export async function alternarResumoDiarioDestino(id: string, novoValor: boolean): Promise<void> {
  await exigirLogin();
  const { error } = await supabaseAdmin().from("destinos_whatsapp").update({ resumo_diario: novoValor }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/whatsapp");
}

export async function excluirDestinoWhatsApp(id: string): Promise<void> {
  await exigirLogin();
  const { error } = await supabaseAdmin().from("destinos_whatsapp").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/whatsapp");
}
