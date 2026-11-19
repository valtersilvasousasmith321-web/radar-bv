import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase com a service_role key — ignora RLS, por isso só pode
 * ser usado dentro de Server Actions/rotas do /admin, NUNCA importado por
 * um Client Component ou qualquer arquivo que vá pro bundle do navegador.
 * O import "server-only" no topo faz o build FALHAR (não só avisar) se
 * este módulo acabar sendo importado por engano em código client-side —
 * é a mesma proteção que o Next recomenda pra chaves privilegiadas.
 *
 * Cada função que usa isto também confere a sessão de login (ver
 * lib/auth.ts) antes de qualquer operação — defesa em profundidade: o
 * middleware já bloqueia quem não está logado, mas a Server Action não
 * confia só nisso.
 */
let cliente: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (cliente) return cliente;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "[admin] SUPABASE_SERVICE_ROLE_KEY/NEXT_PUBLIC_SUPABASE_URL não configurados — o painel admin precisa dessas chaves em apps/web/.env.local"
    );
  }

  cliente = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  return cliente;
}
