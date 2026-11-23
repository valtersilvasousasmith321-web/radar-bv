import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const PADRAO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ouvidoria/correção pública (item 21 do plano) — recebe o relato do leitor
 * (erro apontado numa matéria, ou reclamação geral do portal). Sem IA
 * envolvida: só grava "pendente" pro Valter ler e decidir, igual carta do
 * leitor de jornal de verdade.
 *
 * POST /api/ouvidoria/reclamar
 * { mensagem: string, noticiaId?: string, nome?: string, email?: string, empresa?: string (honeypot) }
 */
export async function POST(request: NextRequest) {
  let corpo: any;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  // Honeypot anti-spam: campo invisível pro leitor humano, só bot preenche.
  // Responde 200 normalmente (não entrega ao bot que foi detectado), só
  // não grava nada.
  if (typeof corpo?.empresa === "string" && corpo.empresa.trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  const mensagem = String(corpo?.mensagem ?? "").trim();
  if (!mensagem || mensagem.length < 5) {
    return NextResponse.json({ erro: "mensagem obrigatória (mínimo 5 caracteres)" }, { status: 400 });
  }
  if (mensagem.length > 4000) {
    return NextResponse.json({ erro: "mensagem muito longa (máximo 4000 caracteres)" }, { status: 400 });
  }

  const noticiaIdBruto = corpo?.noticiaId;
  const noticiaId = typeof noticiaIdBruto === "string" && PADRAO_UUID.test(noticiaIdBruto) ? noticiaIdBruto : null;

  const nome = typeof corpo?.nome === "string" ? corpo.nome.trim().slice(0, 120) || null : null;
  const email = typeof corpo?.email === "string" ? corpo.email.trim().slice(0, 200) || null : null;

  const { error } = await supabaseAdmin().from("reclamacoes_ouvidoria").insert({
    noticia_id: noticiaId,
    nome,
    email,
    mensagem,
    status: "pendente",
  });

  if (error) {
    return NextResponse.json({ erro: `falha ao enviar: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
