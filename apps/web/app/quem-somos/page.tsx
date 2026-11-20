import type { Metadata } from "next";
import Cabecalho from "@/components/Cabecalho";
import Rodape from "@/components/Rodape";
import { EXPEDIENTE } from "@/lib/contatos";

export const metadata: Metadata = { title: "Quem somos — Radar BV" };

export default function QuemSomos() {
  return (
    <>
      <Cabecalho />
      <main className="max-w-3xl mx-auto w-full px-6 py-12">
        <h1 className="font-display text-3xl font-bold text-navy border-l-4 border-esmeralda pl-3 mb-8">
          Quem somos
        </h1>

        <section className="prose-sm text-slate-700 leading-relaxed flex flex-col gap-4 mb-10">
          <p>
            O <strong>Radar BV</strong> é um portal de notícias de Boa Vista e Roraima com redação
            orientada por inteligência artificial: o sistema apura fatos em fontes oficiais e de
            imprensa já estabelecidas — prefeitura, governo do estado, órgãos de segurança e
            educação, e veículos de imprensa — e redige a matéria a partir deles, sempre creditando
            a fonte original ao final de cada notícia.
          </p>
          <p>
            Cada notícia publicada mostra, de forma transparente, qual modelo de IA a redigiu e um
            link direto para a fonte original, pra que o leitor possa sempre conferir a apuração por
            si mesmo.
          </p>
        </section>

        <section className="bg-slate-50 border border-slate-200 rounded-xl p-6">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-4">Expediente</h2>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-[14px] text-slate-700">
            <div>
              <dt className="text-slate-400 text-xs uppercase tracking-wide">Razão social</dt>
              <dd>{EXPEDIENTE.razaoSocial}</dd>
            </div>
            <div>
              <dt className="text-slate-400 text-xs uppercase tracking-wide">CNPJ</dt>
              <dd>{EXPEDIENTE.cnpj}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-400 text-xs uppercase tracking-wide">Endereço</dt>
              <dd>{EXPEDIENTE.endereco}</dd>
            </div>
            <div>
              <dt className="text-slate-400 text-xs uppercase tracking-wide">E-mail</dt>
              <dd>
                <a href={`mailto:${EXPEDIENTE.email}`} className="text-esmeralda hover:underline">
                  {EXPEDIENTE.email}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-slate-400 text-xs uppercase tracking-wide">Telefone</dt>
              <dd>{EXPEDIENTE.telefone}</dd>
            </div>
          </dl>
        </section>
      </main>
      <Rodape />
    </>
  );
}
