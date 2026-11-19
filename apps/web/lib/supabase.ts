import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Cliente Supabase do site — usa a anon key (leitura pública, protegida
 * pelas políticas RLS do schema.sql: só notícias com status='publicado'
 * e banners com ativo=true). Nunca a service_role key aqui.
 *
 * Fica `null` quando as envs não estão configuradas (ex: ambiente de
 * demonstração/preview) — nesse caso `lib/data.ts` usa os dados de
 * demonstração em vez de quebrar o build ou a página.
 */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey, { auth: { persistSession: false } }) : null;

export const supabaseConfigurado = Boolean(supabase);
