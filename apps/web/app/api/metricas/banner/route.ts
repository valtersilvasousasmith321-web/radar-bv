import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const PADRAO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Registra 1 visualização ou 1 clique real de banner (item 15 — Analista
 * de Desempenho/Estratégia). Chamada "fire and forget" pelo BannerAnuncio
 * — nunca bloqueia a navegação do leitor.
 *
 * POST /api/metricas/banner { id: string, tipo: "visualizacao" | "clique" }
 */
export async function POST(request: NextRequest) {
  let corpo: any;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const id = String(corpo?.id ?? "");
  const tipo = corpo?.tipo === "clique" ? "cliques" : "visualizacoes";

  if (!PADRAO_UUID.test(id)) {
    return NextResponse.json({ erro: "id inválido" }, { status: 400 });
  }

  const { error } = await supabaseAdmin().rpc("incrementar_metrica_banner", { p_id: id, p_campo: tipo });
  if (error) {
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  return NextResponse.json({ ok: true });
}
