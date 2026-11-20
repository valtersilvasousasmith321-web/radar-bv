import { NextRequest, NextResponse } from "next/server";
import { getNoticiasPaginadas } from "@/lib/data";
import { EDITORIAS, type Editoria } from "@/lib/types";

function ehEditoriaValida(valor: string | null): valor is Editoria {
  return !!valor && EDITORIAS.some((e) => e.slug === valor);
}

/**
 * Alimenta a rolagem infinita das páginas de editoria (ver lib/data.ts).
 * GET /api/noticias?editoria=policia&offset=18&quantidade=12
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const editoriaParam = params.get("editoria");
  const offset = Number(params.get("offset") ?? "0");
  const quantidade = Math.min(Number(params.get("quantidade") ?? "12"), 30); // teto de segurança

  if (!Number.isFinite(offset) || offset < 0 || !Number.isFinite(quantidade) || quantidade <= 0) {
    return NextResponse.json({ erro: "parâmetros inválidos" }, { status: 400 });
  }
  if (editoriaParam && !ehEditoriaValida(editoriaParam)) {
    return NextResponse.json({ erro: "editoria inválida" }, { status: 400 });
  }
  const editoria: Editoria | undefined = ehEditoriaValida(editoriaParam) ? editoriaParam : undefined;

  const resultado = await getNoticiasPaginadas({
    editoria,
    offset,
    quantidade,
  });

  return NextResponse.json(resultado);
}
