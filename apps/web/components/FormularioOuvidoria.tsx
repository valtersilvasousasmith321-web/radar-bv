"use client";

import { useState } from "react";

/**
 * Ouvidoria/correção pública (item 21 do plano) — canal pro leitor apontar
 * um erro numa matéria específica (quando `noticiaId` é passado) ou mandar
 * uma reclamação geral sobre o portal (sem `noticiaId`, usado na página
 * /ouvidoria). Fica recolhido até o leitor clicar, pra não poluir a leitura.
 */
export default function FormularioOuvidoria({ noticiaId, iniciarAberto = false }: { noticiaId?: string; iniciarAberto?: boolean }) {
  const [aberto, setAberto] = useState(iniciarAberto);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(formData: FormData) {
    setEnviando(true);
    setErro(null);

    const mensagem = String(formData.get("mensagem") ?? "").trim();
    const nome = String(formData.get("nome") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const empresa = String(formData.get("empresa") ?? ""); // honeypot

    try {
      const resposta = await fetch("/api/ouvidoria/reclamar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem, nome: nome || undefined, email: email || undefined, noticiaId, empresa }),
      });
      const json = await resposta.json();
      if (!resposta.ok || json?.erro) {
        setErro(json?.erro ?? "Não foi possível enviar. Tenta de novo em instantes.");
        return;
      }
      setEnviado(true);
    } catch {
      setErro("Falha de conexão — tenta de novo em instantes.");
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-4 py-3">
        Recebemos sua mensagem — obrigado por ajudar a melhorar o Radar BV.
      </div>
    );
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="text-[13px] text-slate-500 hover:text-navy underline underline-offset-2"
      >
        {noticiaId ? "Encontrou um erro nesta matéria? Avise a Ouvidoria" : "Falar com a Ouvidoria"}
      </button>
    );
  }

  return (
    <form action={enviar} className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col gap-3 max-w-md">
      <p className="text-[13px] font-semibold text-navy">
        {noticiaId ? "Apontar erro nesta matéria" : "Fale com a Ouvidoria"}
      </p>
      {/* honeypot — invisível pra gente, só bot preenche */}
      <input type="text" name="empresa" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <textarea
        name="mensagem"
        required
        minLength={5}
        maxLength={4000}
        rows={3}
        placeholder="Descreva o que está errado ou o que quer relatar..."
        className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-esmeralda"
      />
      <div className="flex gap-2">
        <input
          type="text"
          name="nome"
          placeholder="Seu nome (opcional)"
          className="flex-1 min-w-0 border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-esmeralda"
        />
        <input
          type="email"
          name="email"
          placeholder="E-mail (opcional)"
          className="flex-1 min-w-0 border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-esmeralda"
        />
      </div>
      {erro && <p className="text-xs text-red-600">{erro}</p>}
      <div className="flex gap-3 items-center">
        <button
          type="submit"
          disabled={enviando}
          className="bg-navy text-white text-xs font-semibold px-4 py-2 rounded-md hover:bg-slate-800 disabled:opacity-50"
        >
          {enviando ? "Enviando..." : "Enviar"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="text-xs text-slate-400 hover:underline">
          Cancelar
        </button>
      </div>
    </form>
  );
}
