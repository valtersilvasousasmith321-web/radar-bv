"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirLogin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { enviarFotoParaStorage } from "@/lib/storage-fotos";
import { gerarSlug } from "@/lib/slug";
import type { CorrecaoNota, Editoria } from "@/lib/types";

export async function atualizarNoticia(id: string, formData: FormData): Promise<void> {
  await exigirLogin();

  const titulo = String(formData.get("titulo") ?? "").trim();
  const subtitulo = String(formData.get("subtitulo") ?? "").trim();
  const conteudo = String(formData.get("conteudo") ?? "").trim();
  const destaque = formData.get("destaque") === "on";
  const urgente = formData.get("urgente") === "on";
  const novaCorrecao = String(formData.get("nova_correcao") ?? "").trim();
  const novaFotoArquivo = formData.get("nova_foto");
  const fotoBancoId = String(formData.get("foto_banco_id") ?? "").trim();
  const novoCredito = String(formData.get("imagem_credito") ?? "").trim();

  if (!titulo || !conteudo) redirect(`/admin/noticias/${id}?erro=campos_obrigatorios`);

  const dados: Record<string, unknown> = { titulo, subtitulo: subtitulo || null, conteudo, destaque, urgente };

  // Troca de foto: dá pra trocar de duas formas, e elas são mutuamente
  // exclusivas (se o Valter enviar um arquivo novo, ignora a escolha do
  // banco de fotos, que normalmente nem vai estar preenchida ao mesmo tempo).
  // 1) Enviando um arquivo novo direto do computador/celular dele.
  if (novaFotoArquivo instanceof File && novaFotoArquivo.size > 0) {
    try {
      const { url } = await enviarFotoParaStorage(novaFotoArquivo, `noticia-${id}`);
      dados.imagem_url = url;
      dados.imagem_e_fallback = false;
      dados.imagem_credito = novoCredito || null;
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : "Falha ao enviar a nova foto.";
      redirect(`/admin/noticias/${id}?erro=${encodeURIComponent(mensagem)}`);
    }
  } else if (fotoBancoId) {
    // 2) Escolhendo uma foto já existente no banco de fotos.
    const { data: foto } = await supabaseAdmin().from("banco_fotos").select("url").eq("id", fotoBancoId).maybeSingle();
    if (foto?.url) {
      dados.imagem_url = foto.url;
      dados.imagem_e_fallback = false;
      dados.imagem_credito = novoCredito || null;
    }
  } else if (novoCredito) {
    // Só o crédito mudou, sem trocar a foto.
    dados.imagem_credito = novoCredito || null;
  }

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

/** Publicação manual (pedido do Valter): ele mesmo escreve o texto e manda
 * uma foto, sem passar pela esteira de IA — útil pra algo que ele já viu
 * pessoalmente e quer publicar rápido, do jeito que ele descrever. */
export async function criarNoticiaManual(formData: FormData): Promise<void> {
  await exigirLogin();

  const titulo = String(formData.get("titulo") ?? "").trim();
  const subtitulo = String(formData.get("subtitulo") ?? "").trim();
  const conteudo = String(formData.get("conteudo") ?? "").trim();
  const editoria = String(formData.get("editoria") ?? "").trim() as Editoria;
  const destaque = formData.get("destaque") === "on";
  const urgente = formData.get("urgente") === "on";
  const creditoFoto = String(formData.get("imagem_credito") ?? "").trim();
  const fotoBancoId = String(formData.get("foto_banco_id") ?? "").trim();
  const arquivoFoto = formData.get("foto");

  if (!titulo || !conteudo || !editoria) redirect("/admin/noticias/nova?erro=campos_obrigatorios");

  let imagemUrl: string | null = null;
  if (arquivoFoto instanceof File && arquivoFoto.size > 0) {
    try {
      const { url } = await enviarFotoParaStorage(arquivoFoto, "noticia-manual");
      imagemUrl = url;
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : "Falha ao enviar a foto.";
      redirect(`/admin/noticias/nova?erro=${encodeURIComponent(mensagem)}`);
    }
  } else if (fotoBancoId) {
    const { data: foto } = await supabaseAdmin().from("banco_fotos").select("url").eq("id", fotoBancoId).maybeSingle();
    imagemUrl = foto?.url ?? null;
  }

  const slug = gerarSlug(titulo);

  const { data: inserida, error } = await supabaseAdmin()
    .from("noticias")
    .insert({
      titulo,
      subtitulo: subtitulo || null,
      slug,
      conteudo,
      editoria,
      imagem_url: imagemUrl,
      imagem_credito: creditoFoto || null,
      imagem_e_fallback: false,
      fonte_url_original: "",
      fonte_credito: null,
      origem_ia: "manual",
      status: "publicado",
      destaque,
      urgente,
      data_publicacao: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !inserida) redirect(`/admin/noticias/nova?erro=${encodeURIComponent(error?.message ?? "falha ao criar")}`);

  revalidatePath("/admin/noticias");
  revalidatePath("/");
  redirect(`/admin/noticias/${inserida.id}?salvo=1`);
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
