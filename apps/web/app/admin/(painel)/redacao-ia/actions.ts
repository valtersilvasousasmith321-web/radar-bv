"use server";

import { revalidatePath } from "next/cache";
import { exigirLogin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Registra a opinião/decisão do Valter pra um relato da redação de IA —
 * "ele responde direto no painel, sem precisar abrir SQL" (item 22). Marca
 * como respondido mesmo quando o campo vier vazio (ex.: ele só quer marcar
 * como lido/resolvido sem deixar uma resposta escrita).
 */
export async function responderRelatorio(id: string, formData: FormData): Promise<void> {
  await exigirLogin();

  const respostaAdmin = String(formData.get("resposta_admin") ?? "").trim();

  const { error } = await supabaseAdmin()
    .from("relatorios_redacao")
    .update({
      status: "respondido",
      resposta_admin: respostaAdmin || null,
      respondido_em: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/redacao-ia");
}

/** Marca um informe como lido — não precisa de resposta, só tira da lista de "novos". */
export async function marcarRelatorioComoLido(id: string): Promise<void> {
  await exigirLogin();

  const { error } = await supabaseAdmin().from("relatorios_redacao").update({ status: "lido" }).eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/redacao-ia");
}
