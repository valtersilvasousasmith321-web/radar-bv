import webpush from "web-push";
import { supabase } from "./db.js";
import { log } from "./logger.js";
import { config } from "./config.js";
import type { Editoria } from "./types.js";

/**
 * Algoritmo de Personalização + Notificações (item 16 do plano) — metade
 * "Notificações": envia notificação push de verdade (API nativa do
 * navegador, sem app, sem cadastro/login) pros leitores que ativaram, só
 * das editorias que cada um escolheu acompanhar (a "personalização" aqui é
 * explícita — o leitor escolhe — em vez de tentar adivinhar o interesse
 * dele sem ele nunca ter dito nada).
 *
 * Opcional por completo: sem as chaves VAPID configuradas, não envia nada
 * e não quebra a publicação da notícia (Regra de Ouro — o jornal nunca
 * pode parar por causa de uma notificação).
 */

let vapidConfigurado = false;
function garantirVapidConfigurado(): boolean {
  if (vapidConfigurado) return true;
  const { vapidPublicKey, vapidPrivateKey, vapidContatoEmail } = config.pushNotificacoes;
  if (!vapidPublicKey || !vapidPrivateKey) return false;
  webpush.setVapidDetails(`mailto:${vapidContatoEmail}`, vapidPublicKey, vapidPrivateKey);
  vapidConfigurado = true;
  return true;
}

interface NoticiaParaNotificar {
  id: string;
  titulo: string;
  subtitulo: string | null;
  slug: string;
  editoria: Editoria;
}

export async function notificarNovaNoticia(noticia: NoticiaParaNotificar): Promise<void> {
  if (!garantirVapidConfigurado()) return; // sem chaves configuradas ainda — pulado em silêncio

  const { data: inscricoes, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, chave_p256dh, chave_auth, editorias_interesse")
    .eq("ativo", true);

  if (error) {
    await log("warning", "pushNotificacoes", "Falha ao buscar inscrições de push", { erro: error.message });
    return;
  }
  if (!inscricoes || inscricoes.length === 0) return;

  const alvo = inscricoes.filter(
    (i) => !i.editorias_interesse || i.editorias_interesse.length === 0 || i.editorias_interesse.includes(noticia.editoria),
  );
  if (alvo.length === 0) return;

  const payload = JSON.stringify({
    titulo: noticia.titulo,
    corpo: noticia.subtitulo ?? "Nova notícia no Radar BV",
    url: `${config.site.baseUrl}/noticia/${noticia.slug}`,
  });

  let enviadas = 0;
  let expiradas = 0;

  for (const inscricao of alvo) {
    try {
      await webpush.sendNotification(
        {
          endpoint: inscricao.endpoint,
          keys: { p256dh: inscricao.chave_p256dh, auth: inscricao.chave_auth },
        },
        payload,
      );
      enviadas++;
    } catch (err: any) {
      const status = err?.statusCode;
      if (status === 404 || status === 410) {
        // Inscrição expirada/revogada pelo navegador — desativa sozinho,
        // sem precisar de ninguém limpando isso manualmente (Robô serve a
        // IA: código faz a faxina, sem gastar nada de IA).
        await supabase.from("push_subscriptions").update({ ativo: false }).eq("id", inscricao.id);
        expiradas++;
      } else {
        await log("warning", "pushNotificacoes", "Falha ao enviar notificação push", {
          erro: String(err?.message ?? err),
          status,
        });
      }
    }
  }

  await log("info", "pushNotificacoes", `Notificação push enviada: ${enviadas} entregue(s), ${expiradas} inscrição(ões) expirada(s) removida(s)`, {
    titulo: noticia.titulo,
    editoria: noticia.editoria,
  });
}
