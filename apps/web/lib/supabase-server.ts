import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente Supabase (anon key) ciente de cookies, pra uso em Server
 * Components/Server Actions/rotas do painel admin — é o que permite ler
 * a sessão de login (Supabase Auth) do usuário autenticado. NUNCA usa a
 * service_role key; pra operações privilegiadas (CRUD do admin), ver
 * lib/supabase-admin.ts.
 *
 * Retorna null se as variáveis de ambiente não estiverem configuradas —
 * nesse caso o /admin fica indisponível (ver middleware.ts), mas o resto
 * do site (que usa lib/data.ts com fallback pra dados-demo) continua de pé.
 */
export async function supabaseServidor() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesParaSetar) {
        try {
          for (const { name, value, options } of cookiesParaSetar) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // chamado de dentro de um Server Component (sem permissão de escrever
          // cookie) — ignorado de propósito: o middleware já cuida de renovar
          // a sessão nesse caso.
        }
      },
    },
  });
}
