import { supabase } from "./db.js";
import type { NivelLog } from "./types.js";

/**
 * Logger central. Grava em `logs_sistema` para dar visibilidade do pipeline
 * (coleta, IA, fallback, erros) e também imprime no console para quem
 * acompanha o worker em tempo real (ex: painel do PM2/Docker).
 *
 * Nunca lança exceção: um erro de log não pode derrubar o pipeline
 * (Sistema de Contingência — "o jornal nunca pode parar").
 */
export async function log(
  nivel: NivelLog,
  origem: string,
  mensagem: string,
  detalhes?: Record<string, unknown>,
  refs?: { fonteId?: string; noticiaId?: string }
): Promise<void> {
  const prefixo = `[${new Date().toISOString()}] [${nivel.toUpperCase()}] [${origem}]`;
  if (nivel === "error" || nivel === "critico") {
    console.error(prefixo, mensagem, detalhes ?? "");
  } else {
    console.log(prefixo, mensagem, detalhes ?? "");
  }

  try {
    await supabase.from("logs_sistema").insert({
      nivel,
      origem,
      mensagem,
      detalhes: detalhes ?? null,
      fonte_id: refs?.fonteId ?? null,
      noticia_id: refs?.noticiaId ?? null,
    });
  } catch (err) {
    // Loga só no console — nunca propaga erro de logging para o pipeline.
    console.error(`${prefixo} falha ao gravar log no Supabase:`, err);
  }
}
