import Link from "next/link";
import { EDITORIAS } from "@/lib/types";
import { LINK_GRUPO_WHATSAPP } from "@/lib/contatos";

export default function Cabecalho() {
  return (
    <>
      <div className="bg-navy text-slate-300 text-[12px] md:text-[13px]">
        <div className="max-w-6xl mx-auto px-6 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:gap-4 min-w-0">
            <span className="shrink-0 font-medium text-slate-100">Boa Vista, RR</span>
            <span className="hidden md:inline text-slate-600">•</span>
            <span className="hidden md:inline truncate">Informação em tempo real, de Boa Vista para o mundo</span>
          </div>
          <a
            href={LINK_GRUPO_WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-emerald-300 font-semibold hover:underline flex items-center gap-1.5"
          >
            <span className="md:hidden">WhatsApp</span>
            <span className="hidden md:inline">Canal no WhatsApp</span>
          </a>
        </div>
      </div>

      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 md:py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-5">
          <Link href="/" aria-label="Radar BV — página inicial" className="flex items-baseline">
            <span className="font-display text-3xl font-bold text-navy tracking-tight">RADAR</span>
            <span className="font-display text-3xl font-bold text-urgente">BV</span>
          </Link>
          <nav
            aria-label="Editorias"
            className="flex items-center gap-5 md:flex-wrap md:gap-7 overflow-x-auto md:overflow-visible whitespace-nowrap -mx-6 px-6 md:mx-0 md:px-0 text-[13px] md:text-[15px] font-semibold text-navy [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            <Link href="/" className="relative py-1 shrink-0 transition-colors hover:text-urgente">
              Início
            </Link>
            {EDITORIAS.map((e) => (
              <Link
                key={e.slug}
                href={`/editoria/${e.slug}`}
                className={
                  "relative py-1 shrink-0 transition-colors " +
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
