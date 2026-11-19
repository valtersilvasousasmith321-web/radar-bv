/**
 * Faixa "Mesa de Redação IA" — o diferencial de transparência do Radar BV:
 * mostra a esteira de produção (coleta -> triagem -> redação -> publicação)
 * em vez de esconder que o jornal é redigido por IA. Hoje estático; na
 * Fase 3 pode ler o status real a partir de `logs_sistema` (via um canal
 * realtime do Supabase) em vez de texto fixo.
 */
export default function MesaDeRedacao() {
  return (
    <div className="bg-navy border-b border-slate-800">
      <div className="max-w-6xl mx-auto px-6 py-2.5 flex flex-wrap items-center gap-6 text-[13px] text-slate-400">
        <span className="font-bold text-slate-50 uppercase text-[11px] tracking-wide whitespace-nowrap">
          Mesa de Redação IA
        </span>
        <Passo cor="bg-slate-500" texto="Coletando 5 fontes oficiais" />
        <Passo cor="bg-slate-500" texto="Triagem — Gemini" />
        <Passo cor="bg-emerald-400" texto="Redigindo — Claude" destaque pulsando />
        <Passo cor="bg-urgente" texto="Publicado há 6 min" destaque />
        <span className="ml-auto text-slate-600 whitespace-nowrap hidden lg:inline">
          Toda matéria mostra qual IA redigiu e a fonte original.
        </span>
      </div>
    </div>
  );
}

function Passo({
  cor,
  texto,
  destaque = false,
  pulsando = false,
}: {
  cor: string;
  texto: string;
  destaque?: boolean;
  pulsando?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-[7px] h-[7px] rounded-full inline-block ${cor} ${pulsando ? "animate-pulse" : ""}`} />
      <span className={destaque ? "text-slate-200" : ""}>{texto}</span>
    </div>
  );
}
