import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Webhook de ENTRADA de dicas/denúncias de moradores via WhatsApp (item 3
 * do plano — Pesquisadores por área, frente B). Diferente de
 * worker/src/whatsapp.ts (que só DISPARA mensagens), esta rota RECEBE —
 * precisa ser cadastrada como webhook de mensagens recebidas no provedor
 * de WhatsApp escolhido (Evolution API, WPPConnect, Z-API ou similar),
 * apontando um número/grupo específico só para dicas de leitores.
 *
 * POST /api/dicas/whatsapp
 * Header obrigatório: Authorization: Bearer <DICAS_WEBHOOK_TOKEN>
 * (o mesmo valor configurado no provedor e na env DICAS_WEBHOOK_TOKEN do
 * Vercel — sem esse token, qualquer pessoa na internet poderia inserir
 * "dicas" falsas direto no banco).
 *
 * O formato exato do payload varia por provedor, então esta rota tenta
 * alguns formatos comuns em vez de travar numa estrutura só. Sempre
 * responde rápido (a dica só é PROCESSADA por IA depois, pelo worker,
 * a cada 15 minutos) — aqui só grava o relato bruto.
 */

function extrairCampo(corpo: any, caminhos: string[]): string | null {
  for (const caminho of caminhos) {
    const valor = caminho.split(".").reduce((acc: any, chave: string) => acc?.[chave], corpo);
    if (typeof valor === "string" && valor.trim()) return valor.trim();
  }
  return null;
}

export async function POST(request: NextRequest) {
  const tokenEsperado = process.env.DICAS_WEBHOOK_TOKEN;
  if (!tokenEsperado) {
    return NextResponse.json({ erro: "DICAS_WEBHOOK_TOKEN não configurado no servidor" }, { status: 500 });
  }

  const auth = request.headers.get("authorization") ?? "";
  const tokenRecebido = auth.replace(/^Bearer\s+/i, "").trim();
  if (tokenRecebido !== tokenEsperado) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  let corpo: any;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "corpo da requisição não é um JSON válido" }, { status: 400 });
  }

  // Tenta os formatos mais comuns de payload de "mensagem recebida" dos
  // provedores de WhatsApp (Evolution API, WPPConnect, Z-API e variantes).
  const mensagemTexto = extrairCampo(corpo, [
    "message",
    "body",
    "text",
    "data.message.conversation",
    "data.body",
    "texto",
  ]);
  const telefoneRemetente = extrairCampo(corpo, ["from", "sender", "phone", "data.key.remoteJid", "telefone"]);
  const nomeRemetente = extrairCampo(corpo, ["senderName", "pushName", "data.pushName", "nome"]);
  const midiaUrl = extrairCampo(corpo, ["mediaUrl", "imageUrl", "image", "data.mediaUrl", "midia_url"]);

  if (!mensagemTexto) {
    // Evento sem texto reconhecível (ex: confirmação de entrega, status
    // de conexão do provedor) — responde 200 pra não gerar retentativa do
    // provedor em cima de algo que nunca vai mudar, só não grava nada.
    return NextResponse.json({ ok: true, ignorado: true });
  }

  const { error } = await supabaseAdmin().from("dicas_bairro").insert({
    telefone_remetente: telefoneRemetente,
    nome_remetente: nomeRemetente,
    mensagem_texto: mensagemTexto,
    midia_url: midiaUrl,
    status: "pendente",
  });

  if (error) {
    return NextResponse.json({ erro: `falha ao salvar dica: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
