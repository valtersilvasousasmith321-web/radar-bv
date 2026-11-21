import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Item 16 — desativa a inscrição de push quando o leitor desliga a
 * notificação (ou o navegador revoga a permissão).
 *
 * POST /api/notificacoes/cancelar { endpoint: string }
 */
export async function POST(request: NextRequest) {
  let corpo: any;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const endpoint = corpo?.endpoint;
  if (typeof endpoint !== "string" || !endpoint) {
    return NextResponse.json({ erro: "endpoint inválido" }, { status: 400 });
  }

  const { error } = await supabaseAdmin().from("push_subscriptions").update({ ativo: false }).eq("endpoint", endpoint);
  if (error) {
    return NextResponse.json({ erro: `falha ao cancelar inscrição: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
