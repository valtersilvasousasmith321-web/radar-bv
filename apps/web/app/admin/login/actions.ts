"use server";

import { redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase-server";

/**
 * Sem useFormState/useActionState (recursos do React 19 — este app usa
 * React 18) o jeito simples e robusto de mostrar erro é redirecionar de
 * volta pro login com ?erro=... na URL; a própria página (Server
 * Component) lê isso de `searchParams` e mostra o banner.
 */
export async function entrar(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");
  const redirecionarPara = String(formData.get("redirecionarPara") ?? "/admin");

  function voltarComErro(codigo: string): never {
    const url = new URL("/admin/login", "https://placeholder.local");
    url.searchParams.set("erro", codigo);
    if (redirecionarPara) url.searchParams.set("redirecionar", redirecionarPara);
    redirect(`${url.pathname}${url.search}`);
  }

  if (!email || !senha) voltarComErro("campos_vazios");

  const supabase = await supabaseServidor();
  if (!supabase) voltarComErro("supabase_nao_configurado");

  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) {
    // status 0 = não conseguiu nem conversar com o Supabase (host errado, sem
    // internet, projeto pausado) — bem diferente de senha errada (status 400),
    // e confundir os dois leva a quem administra o site a trocar a senha à
    // toa quando o problema real é configuração/conectividade.
    voltarComErro(error.status === 0 ? "falha_conexao_supabase" : "credenciais_invalidas");
  }

  redirect(redirecionarPara || "/admin");
}
