"use client";

import { useEffect, useState } from "react";
import { EDITORIAS, type Editoria } from "@/lib/types";

const CHAVE_DISPENSADO = "radarbv_push_dispensado";
const CHAVE_INSCRITO = "radarbv_push_inscrito";

function urlBase64ParaUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Seguro = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(base64Seguro);
  const saida = new Uint8Array(bruto.length);
  for (let i = 0; i < bruto.length; i++) saida[i] = bruto.charCodeAt(i);
  return saida;
}

/**
 * Item 16 — Algoritmo de Personalização + Notificações: banner discreto
 * oferecendo notificação push no navegador (sem cadastro/login — é a API
 * nativa de Push, por navegador). A "personalização" é explícita: o leitor
 * escolhe quais editorias quer acompanhar (ou deixa em branco = todas),
 * em vez do site tentar adivinhar o interesse dele sem ele nunca ter dito
 * nada.
 */
export default function InscricaoNotificacoes() {
  const [visivel, setVisivel] = useState(false);
  const [editoriasEscolhidas, setEditoriasEscolhidas] = useState<Editoria[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    const chavePublica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!chavePublica) return; // chave ainda não configurada no Vercel
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    if (Notification.permission === "denied") return;
    if (localStorage.getItem(CHAVE_DISPENSADO) === "1") return;
    if (localStorage.getItem(CHAVE_INSCRITO) === "1") return;

    // Pequeno atraso antes de mostrar o banner — não interrompe o leitor
    // assim que a página abre, deixa ele começar a ler primeiro.
    const temporizador = setTimeout(() => setVisivel(true), 4000);
    return () => clearTimeout(temporizador);
  }, []);

  function alternarEditoria(slug: Editoria) {
    setEditoriasEscolhidas((atual) => (atual.includes(slug) ? atual.filter((e) => e !== slug) : [...atual, slug]));
  }

  async function ativar() {
    const chavePublica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!chavePublica) return;

    setEnviando(true);
    setErro(false);
    try {
      const registro = await navigator.serviceWorker.ready;
      const subscription = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ParaUint8Array(chavePublica) as BufferSource,
      });

      const resposta = await fetch("/api/notificacoes/inscrever", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON(), editorias: editoriasEscolhidas }),
      });
      if (!resposta.ok) throw new Error("falha ao salvar inscrição");

      localStorage.setItem(CHAVE_INSCRITO, "1");
      setVisivel(false);
    } catch {
      setErro(true);
    } finally {
      setEnviando(false);
    }
  }

  function dispensar() {
    localStorage.setItem(CHAVE_DISPENSADO, "1");
    setVisivel(false);
  }

  if (!visivel) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm bg-white border border-slate-200 rounded-xl shadow-lg p-4 z-50">
      <p className="font-bold text-navy text-sm">Avisar quando sair notícia nova?</p>
      <p className="text-xs text-slate-500 mt-1">
        Escolha os assuntos (ou deixe em branco pra receber de tudo):
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5">
        {EDITORIAS.map((e) => (
          <label key={e.slug} className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={editoriasEscolhidas.includes(e.slug)}
              onChange={() => alternarEditoria(e.slug)}
              className="accent-esmeralda"
            />
            {e.label}
          </label>
        ))}
      </div>
      {erro && <p className="text-xs text-red-600 mt-2">Não consegui ativar agora — tenta de novo em instantes.</p>}
      <div className="flex gap-2 mt-3">
        <button
          onClick={ativar}
          disabled={enviando}
          className="flex-1 bg-esmeralda text-white text-sm font-semibold rounded-lg py-2 disabled:opacity-60"
        >
          {enviando ? "Ativando..." : "Ativar notificações"}
        </button>
        <button onClick={dispensar} className="text-sm text-slate-400 px-2">
          Agora não
        </button>
      </div>
    </div>
  );
}
