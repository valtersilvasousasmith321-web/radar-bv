"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirLogin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

function listaDeTags(valor: FormDataEntryValue | null): string[] {
  return String(valor ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export async function criarBanner(formData: FormData): Promise<void> {
  await exigirLogin();

  const nome_anunciante = String(formData.get("nome_anunciante") ?? "").trim();
  const tipo_anunciante = String(formData.get("tipo_anunciante") ?? "captacao_anunciante");
  const posicao = String(formData.get("posicao") ?? "lateral");
  const imagem_url = String(formData.get("imagem_url") ?? "").trim() || null;
  const link_destino = String(formData.get("link_destino") ?? "").trim() || null;
  const link_whatsapp = String(formData.get("link_whatsapp") ?? "").trim() || null;
  const tags_contextuais = listaDeTags(formData.get("tags_contextuais"));
  const prioridade = Number(formData.get("prioridade") ?? 5);

  if (!nome_anunciante) redirect("/admin/banners?erro=campos_obrigatorios");

  const { error } = await supabaseAdmin().from("banners_publicidade").insert({
    nome_anunciante,
    tipo_anunciante,
    posicao,
    imagem_url,
    link_destino,
    link_whatsapp,
    tags_contextuais,
    prioridade,
  });
  if (error) redirect(`/admin/banners?erro=${encodeURIComponent(error.message)}`);

  revalidatePath("/admin/banners");
  redirect("/admin/banners?salvo=1");
}

export async function alternarAtivoBanner(id: string, novoValor: boolean): Promise<void> {
  await exigirLogin();
  const { error } = await supabaseAdmin().from("banners_publicidade").update({ ativo: novoValor }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/banners");
  revalidatePath("/"); // slots da home podem exibir este banner
}

export async function excluirBanner(id: string): Promise<void> {
  await exigirLogin();
  const { error } = await supabaseAdmin().from("banners_publicidade").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/banners");
}
