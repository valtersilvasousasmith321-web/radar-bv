"use server";

import { revalidatePath } from "next/cache";
import { exigirLogin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

/** Descarte manual de uma dica (ex: spam, trote, ou já tratado fora do fluxo de IA). */
export async function descartarDicaManualmente(id: string): Promise<void> {
  await exigirLogin();
  const { error } = await supabaseAdmin()
    .from("dicas_bairro")
    .update({ status: "descartada", motivo_descarte: "Descartada manualmente pelo administrador", processado_em: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/dicas");
}
