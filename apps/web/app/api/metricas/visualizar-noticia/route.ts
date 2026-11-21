import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const PADRAO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Registra 1 visualização real de notícia (item 15 — Analista de
 * Desempenho/Estratégia). Chamada "fire and forget" pelo componente
 * RegistrarVisualizacao na página da notícia — nunca bloqueia a leitura:
 * mesmo se falhar, a página já carregou normalmente.
 *
 * POST /api/metricas/visualizar-noticia { id: string }
 */
export async function POST(request: NextRequest) {
  let corpo: any;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const id = String(corpo?.id ?? "");
  if (!PADRAO_UUID.test(id)) {
    return NextResponse.json({ erro: "id inválido" }, { status: 400 });
  }

  const { error } = await supabaseAdmin().rpc("incrementar_visualizacao_noticia", { p_id: id });
  if (error) {
    // Nunca derruba a experiência do leitor por causa de métrica — só loga
    // implicitamente via status de erro, sem expor detalhe nenhum.
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  return NextResponse.json({ ok: true });
}
