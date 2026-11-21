import type { InfograficoDados } from "@/lib/types";

/**
 * Infografista (item 18 do plano) — desenha o gráfico de barra/linha ou a
 * linha do tempo que o worker extraiu da matéria. Renderizado em SVG puro,
 * sem nenhuma biblioteca de gráfico (mantém o bundle leve) e sem
 * JavaScript no cliente (componente de servidor, igual o resto da página).
 */

const NAVY = "#0F172A";
const ESMERALDA = "#059669";
const CINZA = "#94A3B8";

function GraficoBarraOuLinha({ dados }: { dados: InfograficoDados }) {
  const categorias = dados.categorias ?? [];
  const valores = dados.valores ?? [];
  const largura = 680;
  const altura = 300;
  const margemEsq = 44;
  const margemDir = 16;
  const margemTopo = 24;
  const margemBase = 52;
  const areaLargura = largura - margemEsq - margemDir;
  const areaAltura = altura - margemTopo - margemBase;

  const maxValor = Math.max(...valores, 1);
  const passo = categorias.length > 1 ? areaLargura / categorias.length : areaLargura;

  const pontos = valores.map((v, i) => {
    const x = margemEsq + passo * i + passo / 2;
    const y = margemTopo + areaAltura - (v / maxValor) * areaAltura;
    return { x, y, v };
  });

  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} className="w-full h-auto" role="img" aria-label={dados.titulo}>
      {/* linha de base */}
      <line x1={margemEsq} y1={margemTopo + areaAltura} x2={largura - margemDir} y2={margemTopo + areaAltura} stroke="#E2E8F0" strokeWidth={1.5} />

      {dados.tipo === "barra" &&
        pontos.map((p, i) => {
          const larguraBarra = passo * 0.55;
          const alturaBarra = margemTopo + areaAltura - p.y;
          return (
            <g key={i}>
              <rect
                x={p.x - larguraBarra / 2}
                y={p.y}
                width={larguraBarra}
                height={alturaBarra}
                rx={4}
                fill={ESMERALDA}
              />
              <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize="13" fontWeight="700" fill={NAVY}>
                {p.v.toLocaleString("pt-BR")}
              </text>
            </g>
          );
        })}

      {dados.tipo === "linha" && (
        <>
          <polyline
            points={pontos.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={ESMERALDA}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {pontos.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={5} fill={ESMERALDA} stroke="#fff" strokeWidth={2} />
              <text x={p.x} y={p.y - 12} textAnchor="middle" fontSize="13" fontWeight="700" fill={NAVY}>
                {p.v.toLocaleString("pt-BR")}
              </text>
            </g>
          ))}
        </>
      )}

      {categorias.map((c, i) => (
        <text
          key={i}
          x={margemEsq + passo * i + passo / 2}
          y={altura - margemBase + 22}
          textAnchor="middle"
          fontSize="12"
          fill={CINZA}
        >
          {c.length > 12 ? `${c.slice(0, 11)}…` : c}
        </text>
      ))}
    </svg>
  );
}

function LinhaDoTempo({ dados }: { dados: InfograficoDados }) {
  const eventos = dados.eventos ?? [];
  return (
    <ol className="relative border-l-2 border-esmeralda/30 ml-2 pl-6 space-y-5">
      {eventos.map((ev, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[31px] top-1 w-3.5 h-3.5 rounded-full bg-esmeralda border-2 border-white shadow" />
          <p className="text-xs font-bold text-esmeralda uppercase tracking-wide">{ev.data}</p>
          <p className="text-[15px] text-slate-800 leading-snug mt-0.5">{ev.titulo}</p>
        </li>
      ))}
    </ol>
  );
}

export default function Infografico({ dados }: { dados: InfograficoDados }) {
  return (
    <div className="my-8 bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
      <h3 className="font-display text-lg font-bold text-navy mb-4">{dados.titulo}</h3>
      {dados.tipo === "linha_do_tempo" ? <LinhaDoTempo dados={dados} /> : <GraficoBarraOuLinha dados={dados} />}
      {dados.unidade && <p className="text-xs text-slate-400 mt-3">Unidade: {dados.unidade}</p>}
      <p className="text-xs text-slate-400 mt-1">Dados: {dados.fonteDados}</p>
    </div>
  );
}
