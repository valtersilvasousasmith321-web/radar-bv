import Link from "next/link";
import Image from "next/image";
import type { Noticia } from "@/lib/types";
import { NOME_EDITORIA, ORIGEM_IA_LABEL } from "@/lib/types";
import { tempoRelativo } from "@/lib/formato";

const CORES_EDITORIA: Record<string, string> = {
  boa_vista: "text-esmeralda",
  roraima: "text-esmeralda",
  policia: "text-red-700",
  politica: "text-navy",
  economia: "text-amber-700",
  esportes: "text-navy",
  brasil_mundo: "text-navy",
};

function FotoOuPlaceholder({ noticia, altura }: { noticia: Noticia; altura: string }) {
  if (noticia.imagem_url && !noticia.imagem_e_fallback) {
    return (
      <div className={`relative ${altura} bg-slate-300`}>
        <Image src={noticia.imagem_url} alt="" fill className="object-cover" />
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label={`Foto ilustrativa para: ${noticia.titulo}`}
      className={`${altura} bg-slate-300 flex items-center justify-center text-slate-500`}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    </div>
  );
}

/** Card compacto (lista em grid de editoria) */
export function CardNoticiaCompacto({ noticia }: { noticia: Noticia }) {
  return (
    <article className="bg-white border border-slate-200 rounded-[10px] overflow-hidden shadow-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5">
      <Link href={`/noticia/${noticia.slug}`}>
        <FotoOuPlaceholder noticia={noticia} altura="h-[120px]" />
      </Link>
      <div className="p-3.5">
        <h3 className="text-sm font-semibold text-navy leading-snug">
          <Link href={`/noticia/${noticia.slug}`} className="hover:text-urgente">
            {noticia.titulo}
          </Link>
        </h3>
        <span className="text-[11px] text-slate-400">{tempoRelativo(noticia.data_publicacao)}</span>
      </div>
    </article>
  );
}

/** Card de linha (destaques secundários) */
export function CardNoticiaLinha({ noticia }: { noticia: Noticia }) {
  return (
    <article className="flex gap-3.5">
      <Link href={`/noticia/${noticia.slug}`} className="flex-shrink-0">
        <FotoOuPlaceholder noticia={noticia} altura="h-[90px] w-[110px] rounded-lg" />
      </Link>
      <div className="min-w-0">
        <span className={`font-bold text-[11px] uppercase tracking-wide ${CORES_EDITORIA[noticia.editoria]}`}>
          {NOME_EDITORIA[noticia.editoria]}
        </span>
        <h3 className="text-[15px] font-semibold text-navy leading-snug mt-1">
          <Link href={`/noticia/${noticia.slug}`} className="hover:text-urgente">
            {noticia.titulo}
          </Link>
        </h3>
        <span className="text-xs text-slate-400">{tempoRelativo(noticia.data_publicacao)}</span>
      </div>
    </article>
  );
}

/** Card de destaque principal (hero) */
export function CardNoticiaDestaque({ noticia }: { noticia: Noticia }) {
  return (
    <article className="md:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5">
      <Link href={`/noticia/${noticia.slug}`} className="relative block">
        <FotoOuPlaceholder noticia={noticia} altura="h-[320px]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-navy/40 to-transparent" />
      </Link>
      <div className="p-6">
        <span className={`font-bold text-xs uppercase tracking-wide ${CORES_EDITORIA[noticia.editoria]}`}>
          {NOME_EDITORIA[noticia.editoria]}
        </span>
        <h2 className="font-display text-[26px] font-bold text-navy mt-2 leading-tight">
          <Link href={`/noticia/${noticia.slug}`} className="hover:text-urgente transition-colors">
            {noticia.titulo}
          </Link>
        </h2>
        {noticia.subtitulo && <p className="text-[15px] text-slate-500 mt-2.5 leading-relaxed">{noticia.subtitulo}</p>}
        <div className="flex items-center gap-2 mt-4 text-xs text-slate-400 flex-wrap">
          <span className="bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-full">
            Redigido por {ORIGEM_IA_LABEL[noticia.origem_ia]}
          </span>
          {noticia.fonte_credito && (
            <>
              <span>•</span>
              <a href={noticia.fonte_url_original} className="hover:text-navy hover:underline">
                Fonte: {noticia.fonte_credito}
              </a>
            </>
          )}
          <span>•</span>
          <span>{tempoRelativo(noticia.data_publicacao)}</span>
        </div>
      </div>
    </article>
  );
}
