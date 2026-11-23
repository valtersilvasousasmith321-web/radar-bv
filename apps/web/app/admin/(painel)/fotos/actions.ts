"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirLogin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { enviarFotoParaStorage, excluirFotoDoStorage } from "@/lib/storage-fotos";
import type { Editoria } from "@/lib/types";

export async function enviarFoto(formData: FormData): Promise<void> {
  await exigirLogin();

  const arquivo = formData.get("arquivo");
  const descricao = String(formData.get("descricao") ?? "").trim();
  const editoriaForm = String(formData.get("editoria") ?? "").trim();
  const editoria = (editoriaForm || null) as Editoria | null;

  if (!(arquivo instanceof File) || arquivo.size === 0) {
    redirect("/admin/fotos?erro=sem_arquivo");
  }

  // Importante: `redirect()` do Next.js funciona lançando uma exceção
  // especial por baixo dos panos — por isso o upload (que pode falhar de
  // verdade) fica isolado num try/catch próprio, sem nenhum `redirect()` lá
  // dentro, senão o catch abaixo acabaria "engolindo" o redirect como se
  // fosse um erro comum.
  let urlFoto: string;
  let caminhoFoto: string;
  try {
    const resultado = await enviarFotoParaStorage(arquivo as File, "banco");
    urlFoto = resultado.url;
    caminhoFoto = resultado.caminho;
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Falha ao enviar a foto.";
    redirect(`/admin/fotos?erro=${encodeURIComponent(mensagem)}`);
  }

  const { error } = await supabaseAdmin()
    .from("banco_fotos")
    .insert({
      url: urlFoto,
      caminho_storage: caminhoFoto,
      descricao: descricao || null,
      editoria,
      enviada_por: "Valter",
    });

  if (error) {
    // o arquivo já subiu no Storage; se o insert falhar, remove pra não
    // ficar lixo órfão no bucket
    await excluirFotoDoStorage(caminhoFoto);
    redirect(`/admin/fotos?erro=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/fotos");
  redirect("/admin/fotos?salvo=1");
}

export async function excluirFoto(id: string): Promise<void> {
  await exigirLogin();

  const db = supabaseAdmin();
  const { data: foto } = await db.from("banco_fotos").select("caminho_storage").eq("id", id).maybeSingle();

  const { error } = await db.from("banco_fotos").delete().eq("id", id);
  if (error) redirect(`/admin/fotos?erro=${encodeURIComponent(error.message)}`);

  if (foto?.caminho_storage) await excluirFotoDoStorage(foto.caminho_storage);

  revalidatePath("/admin/fotos");
  redirect("/admin/fotos?salvo=1");
}
