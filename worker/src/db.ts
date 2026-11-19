import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

/**
 * Cliente Supabase usando a service_role key — roda só no worker (backend),
 * nunca no frontend. Ignora RLS por padrão, por isso toda a escrita de
 * noticias/logs/fontes passa exclusivamente por aqui.
 */
export const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
  auth: { persistSession: false },
});
