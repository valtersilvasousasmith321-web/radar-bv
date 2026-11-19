"use server";

import { redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase-server";

export async function sair(): Promise<void> {
  const supabase = await supabaseServidor();
  if (supabase) await supabase.auth.signOut();
  redirect("/admin/login");
}
