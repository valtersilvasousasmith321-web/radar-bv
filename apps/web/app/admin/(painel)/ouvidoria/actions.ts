"use server";

import { revalidatePath } from "next/cache";
import { exigirLogin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { StatusReclamacao } from "@/lib/admin-types";

/** Marca uma reclamação da Ouvidoria como respondida ou arquivada, opcionalmente salvando a resposta do administrador. */
export async function atualizarStatusReclamacao(id: string, novoStatus: StatusReclamacao, formData: FormData): Promise<void> {
  await exigirLogin();

  // O form de "Arquivar" não tem campo de resposta — só atualiza
  // resposta_admin quando o campo veio no envio (form de "Marcar como
  // respondida"), pra não apagar uma resposta já salva ao só arquivar.
  const atualizacao: Record<string, unknown> = {
    status: novoStatus,
    respondido_em: novoStatus === "pendente" ? null : new Date().toISOString(),
  };
  if (formData.has("resposta_admin")) {
    const respostaAdmin = String(formData.get("resposta_admin") ?? "").trim();
    atualizacao.resposta_admin = respostaAdmin || null;
  }

  const { error } = await supabaseAdmin().from("reclamacoes_ouvidoria").update(atualizacao).eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/ouvidoria");
}
