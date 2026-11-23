import type { Metadata } from "next";
import Cabecalho from "@/components/Cabecalho";
import Rodape from "@/components/Rodape";
import FormularioOuvidoria from "@/components/FormularioOuvidoria";

export const metadata: Metadata = { title: "Ouvidoria — Radar BV" };

export default function Ouvidoria() {
  return (
    <>
      <Cabecalho />
      <main className="max-w-2xl mx-auto w-full px-6 py-12">
        <h1 className="font-display text-3xl font-bold text-navy border-l-4 border-esmeralda pl-3 mb-6">
          Ouvidoria
        </h1>
        <p className="text-slate-700 leading-relaxed mb-6">
          Encontrou um erro em alguma matéria, quer apontar um problema no portal ou tem uma reclamação geral?
          Fala com a gente aqui embaixo. Sempre que algo publicado for corrigido a partir de um relato, a
          correção fica registrada de forma visível na própria notícia.
        </p>
        <FormularioOuvidoria iniciarAberto />
      </main>
      <Rodape />
    </>
  );
}
