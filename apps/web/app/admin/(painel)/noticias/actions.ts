"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirLogin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { CorrecaoNota } from "@/lib/types";

export async function atualizarNoticia(id: string, formData: FormData): Promise<void> {
  await exigirLogin();

  const titulo = String(formData.get("titulo") ?? "").trim();
  const subtitulo = String(formData.get("subtitulo") ?? "").trim();
  const conteudo = String(formData.get("conteudo") ?? "").trim();
  const destaque = formData.get("destaque") === "on";
  const urgente = formData.get("urgente") === "on";
  const novaCorrecao = String(formData.get("nova_correcao") ?? "").trim();

  if (!titulo || !conteudo) redirect(`/admin/noticias/${id}?erro=campos_obrigatorios`);

  const dados: Record<string, unknown> = { titulo, subtitulo: subtitulo || null, conteudo, destaque, urgente };

  // Item 21 (Ouvidoria): se o administrador preencheu o campo de nota de
  // correção, anexa ao histórico já existente — nunca substitui notas
  // anteriores. Precisa buscar o valor atual antes, já que é um array jsonb.
  if (novaCorrecao) {
    const { data: atual } = await supabaseAdmin().from("noticias").select("correcoes").eq("id", id).maybeSingle();
    const correcoesAtuais: CorrecaoNota[] = atual?.correcoes ?? [];
    dados.correcoes = [...correcoesAtuais, { data: new Date().toISOString(), texto: novaCorrecao }];
  }

  const { error } = await supabaseAdmin().from("noticias").update(dados).eq("id", id);

  if (error) redirect(`/admin/noticias/${id}?erro=${encodeURIComponent(error.message)}`);

  revalidatePath("/admin/noticias");
  revalidatePath(`/admin/noticias/${id}`);
  revalidatePath("/"); // a home pública também pode mostrar essa matéria
  redirect(`/admin/noticias/${id}?salvo=1`);
}

export async function alterarStatusNoticia(id: string, novoStatus: "publicado" | "rascunho" | "removido"): Promise<void> {
  await exigirLogin();
  const dados: Record<string, unknown> = { status: novoStatus };
  if (novoStatus === "publicado") dados.data_publicacao = new Date().toISOString();

  const { error } = await supabaseAdmin().from("noticias").update(dados).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/noticias");
  revalidatePath("/");
}

export async function excluirNoticia(id: string): Promise<void> {
  await exigirLogin();
  const { error } = await supabaseAdmin().from("noticias").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/noticias");
}
