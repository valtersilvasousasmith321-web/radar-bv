import "server-only";
import { supabaseServidor } from "./supabase-server";

/** Retorna o usuário logado (Supabase Auth) ou null. Uso: Server Actions e
 * páginas do /admin que precisam confirmar a sessão antes de qualquer
 * operação privilegiada — nunca confiar só no middleware. */
export async function usuarioLogado() {
  const supabase = await supabaseServidor();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

/** Lança erro se não houver sessão — usar no topo de toda Server Action do admin. */
export async function exigirLogin() {
  const usuario = await usuarioLogado();
  if (!usuario) throw new Error("Não autenticado — faça login no painel admin.");
  return usuario;
}
