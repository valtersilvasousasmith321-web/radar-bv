import Link from "next/link";
import { EDITORIAS } from "@/lib/types";
import { LINK_GRUPO_WHATSAPP } from "@/lib/contatos";

export default function Cabecalho() {
  return (
    <>
      <div className="bg-navy text-slate-300 text-[13px]">
        <div className="max-w-6xl mx-auto px-6 py-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <span>Boa Vista, RR</span>
            <span className="text-slate-600">•</span>
            <span>Informação em tempo real, de Boa Vista para o mundo</span>
          </div>
          <div className="flex items-center gap-5">
            <a
              href={LINK_GRUPO_WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-300 font-semibold hover:underline flex items-center gap-1.5"
            >
              Canal no WhatsApp
            </a>
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-5 flex flex-wrap items-center justify-between gap-5">
          <Link href="/" aria-label="Radar BV — página inicial" className="flex items-baseline">
            <span className="font-display text-3xl font-bold text-navy tracking-tight">RADAR</span>
            <span className="font-display text-3xl font-bold text-urgente">BV</span>
          </Link>
          <nav aria-label="Editorias" className="flex flex-wrap gap-7 text-[15px] font-semibold text-navy">
            {EDITORIAS.map((e) => (
              <Link
                key={e.slug}
                href={`/editoria/${e.slug}`}
                className={
                  "relative py-1 transition-colors " +
                  (e.slug === "roraima" ? "text-esmeralda hover:text-urgente" : "hover:text-urgente")
                }
              >
                {e.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
    </>
  );
}
