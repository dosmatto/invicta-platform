'use client';

// Linhas multi-série em SVG puro (ex.: NDVI e NDRE por mês), com área suave
// sob a primeira série, grade horizontal e legenda. Ponto ausente (null) quebra
// a linha em vez de inventar o meio.

import { useId } from 'react';
import { COR, fmtNum } from './formato';

export interface SerieLinha { id: string; rotulo: string; cor: string; valores: Array<number | null> }

export function LinhaSerie({ categorias, series, casas = 2, min, max, altura = 210, area = true, unidade }: {
  categorias: string[];
  series: SerieLinha[];
  casas?: number;
  min?: number;
  max?: number;
  altura?: number;
  area?: boolean;
  unidade?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const W = 560, H = altura, esq = 40, dir = 14, topo = 14, base = 26;
  const vals = series.flatMap(s => s.valores).filter((v): v is number => v != null && Number.isFinite(v));
  if (!vals.length || !categorias.length) return null;
  let lo = min ?? Math.min(...vals), hi = max ?? Math.max(...vals);
  if (min == null || max == null) {
    const folga = (hi - lo) * 0.15 || Math.abs(hi) * 0.1 || 0.1;
    if (min == null) lo = Math.max(0, lo - folga);
    if (max == null) hi = hi + folga;
  }
  const n = categorias.length;
  const x = (i: number) => (n === 1 ? (esq + W - dir) / 2 : esq + (i / (n - 1)) * (W - esq - dir));
  const y = (v: number) => topo + (1 - (v - lo) / ((hi - lo) || 1)) * (H - topo - base);
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  const trechos = (vs: Array<number | null>) => {
    const out: Array<Array<[number, number]>> = [];
    let atual: Array<[number, number]> = [];
    vs.forEach((v, i) => {
      if (v == null || !Number.isFinite(v)) { if (atual.length) out.push(atual); atual = []; return; }
      atual.push([x(i), y(v)]);
    });
    if (atual.length) out.push(atual);
    return out;
  };
  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-1 justify-end">
        {series.map(s => (
          <span key={s.id} className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: COR.texto2 }}>
            <span className="w-4 h-[3px] rounded-full" style={{ background: s.cor }} />{s.rotulo}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={series.map(s => s.rotulo).join(' e ')} style={{ width: '100%', height: 'auto', maxHeight: altura + 40, display: 'block', overflow: 'visible' }}>
        <defs>
          {series.map(s => (
            <linearGradient key={s.id} id={`${uid}-g-${s.id}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.cor} stopOpacity={0.28} />
              <stop offset="100%" stopColor={s.cor} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={esq} x2={W - dir} y1={y(t)} y2={y(t)} stroke={COR.borda} strokeWidth={1} strokeDasharray={i === 0 ? undefined : '3 4'} />
            <text x={esq - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={COR.texto2}>{fmtNum(t, casas > 1 ? 1 : casas)}</text>
          </g>
        ))}
        {categorias.map((c, i) => (
          <text key={c + i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={11.5} fill={COR.texto2}>{c}</text>
        ))}
        {series.map((s, si) => trechos(s.valores).map((tr, ti) => (
          <g key={`${s.id}-${ti}`}>
            {area && si === 0 && tr.length > 1 && (
              <path d={`M${tr[0][0]} ${H - base} ${tr.map(p => `L${p[0]} ${p[1]}`).join(' ')} L${tr[tr.length - 1][0]} ${H - base} Z`} fill={`url(#${uid}-g-${s.id})`} />
            )}
            {tr.length > 1 && <polyline points={tr.map(p => p.join(',')).join(' ')} fill="none" stroke={s.cor} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />}
          </g>
        )))}
        {series.map(s => s.valores.map((v, i) => (v == null || !Number.isFinite(v) ? null : (
          <circle key={`${s.id}-p${i}`} cx={x(i)} cy={y(v)} r={4} fill={s.cor} stroke="var(--bg-surface)" strokeWidth={1.5}>
            <title>{`${s.rotulo} · ${categorias[i]}: ${fmtNum(v, casas)}${unidade ? ' ' + unidade : ''}`}</title>
          </circle>
        ))))}
      </svg>
    </div>
  );
}
