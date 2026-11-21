import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { EDITORIAS, type Editoria } from "@/lib/types";

/**
 * Item 16 — Algoritmo de Personalização + Notificações: recebe a inscrição
 * de push do navegador do leitor (gerada pela API nativa PushManager, sem
 * cadastro/login nenhum) junto com as editorias que ele escolheu acompanhar.
 *
 * POST /api/notificacoes/inscrever
 * { subscription: PushSubscriptionJSON, editorias: string[] }
 */
export async function POST(request: NextRequest) {
  let corpo: any;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const subscription = corpo?.subscription;
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;

  if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") {
    return NextResponse.json({ erro: "subscription inválida" }, { status: 400 });
  }

  const editoriasValidas = new Set(EDITORIAS.map((e) => e.slug));
  const editoriasRecebidas: unknown = corpo?.editorias;
  const editorias: Editoria[] = Array.isArray(editoriasRecebidas)
    ? editoriasRecebidas.filter((e): e is Editoria => typeof e === "string" && editoriasValidas.has(e as Editoria))
    : [];

  const { error } = await supabaseAdmin()
    .from("push_subscriptions")
    .upsert(
      {
        endpoint,
        chave_p256dh: p256dh,
        chave_auth: auth,
        editorias_interesse: editorias,
        ativo: true,
      },
      { onConflict: "endpoint" },
    );

  if (error) {
    return NextResponse.json({ erro: `falha ao salvar inscrição: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
