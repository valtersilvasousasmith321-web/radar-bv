import Link from "next/link";

export default function Rodape() {
  return (
    <footer className="bg-gradient-to-b from-navy to-slate-950 text-slate-400 mt-auto">
      <div className="max-w-6xl mx-auto px-6 py-12 flex flex-wrap gap-10">
        <div className="flex-[2_1_260px]">
          <h2 className="font-display text-2xl font-bold text-white">
            RADAR<span className="text-urgente">BV</span>
          </h2>
          <p className="text-[13px] mt-2.5 leading-relaxed max-w-xs">
            Informação em tempo real, de Boa Vista para o mundo. Redação orientada por inteligência artificial, com
            apuração sempre creditada à fonte original.
          </p>
        </div>
        <div className="flex-1 min-w-[160px]">
          <h3 className="text-xs font-bold text-white uppercase tracking-wide">Editorias</h3>
          <div className="flex flex-col gap-2.5 mt-4 text-[13px]">
            <Link href="/editoria/boa_vista" className="hover:underline">Boa Vista</Link>
            <Link href="/editoria/roraima" className="hover:underline">Roraima</Link>
            <Link href="/editoria/policia" className="hover:underline">Polícia</Link>
            <Link href="/editoria/politica" className="hover:underline">Política</Link>
          </div>
        </div>
        <div className="flex-1 min-w-[160px]">
          <h3 className="text-xs font-bold text-white uppercase tracking-wide">Ecossistema</h3>
          <div className="flex flex-col gap-2.5 mt-4 text-[13px]">
            <a href="https://metadocexpress.com.br" className="hover:underline">Metadoc Express</a>
            <a href="https://azimutegeo.com.br" className="hover:underline">AzimuteGeo</a>
            <a href="https://wa.me/5595984308025?text=Quero%20saber%20sobre%20servi%C3%A7os%20de%20agrimensura" className="hover:underline">Agrimensura e Topografia</a>
          </div>
        </div>
        <div className="flex-1 min-w-[200px]">
          <h3 className="text-xs font-bold text-white uppercase tracking-wide">Publicidade</h3>
          <div className="mt-4 border-[1.5px] border-dashed border-slate-700 rounded-lg p-3.5">
            <p className="text-[13px] text-slate-300">Anuncie sua empresa aqui no Radar BV.</p>
            <a href="https://wa.me/5595984308025" className="inline-block mt-2 text-[13px] font-bold text-emerald-300">
              Falar no WhatsApp →
            </a>
          </div>
        </div>
      </div>
      <div className="border-t border-slate-800 py-4 text-xs text-center">© 2026 Radar BV — radarbv.com.br</div>
    </footer>
  );
}
