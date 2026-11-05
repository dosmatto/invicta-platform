'use client';

// Barras verticais por ano/safra com o valor em cima (ex.: "Evolução da
// fertilidade — P"). A última barra (ou a marcada) fica mais forte.

import { COR, fmtNum } from './formato';

export interface ItemBarraAno { rotulo: string; valor: number; destaque?: boolean; titulo?: string }

export function BarrasAno({ itens, unidade, casas = 1, cor = 'var(--invicta-green)', altura = 170, onClicar }: {
  itens: ItemBarraAno[];
  unidade?: string;
  casas?: number;
  cor?: string;
  altura?: number;
  onClicar?: (i: number) => void;
}) {
  if (!itens.length) return null;
  const W = 360, H = altura, topo = 20, base = 22, esq = unidade ? 34 : 8, dir = 4;
  const max = Math.max(...itens.map(i => i.valor)) || 1;
  const pot = Math.pow(10, Math.floor(Math.log10(max)));
  const passo = [1, 2, 2.5, 5, 10].map(m => m * pot).find(p => max / p <= 4) ?? pot * 10;
  const topoEixo = Math.ceil(max / passo) * passo;
  const ticks = Array.from({ length: Math.round(topoEixo / passo) + 1 }, (_, i) => i * passo);
  const util = H - topo - base;
  const y = (v: number) => topo + (1 - v / topoEixo) * util;
  const slot = (W - esq - dir) / itens.length;
  const larg = Math.min(46, slot * 0.62);
  const algumDestaque = itens.some(i => i.destaque);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={unidade ?? 'barras por ano'} style={{ width: '100%', height: 'auto', maxHeight: altura + 40, display: 'block', overflow: 'visible' }}>
      {ticks.map(t => (
        <g key={t}>
          <line x1={esq} x2={W - dir} y1={y(t)} y2={y(t)} stroke={COR.borda} strokeDasharray={t === 0 ? undefined : '3 4'} />
          {unidade && <text x={esq - 5} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={10.5} fill={COR.texto2}>{fmtNum(t, 0)}</text>}
        </g>
      ))}
      {itens.map((it, i) => {
        const h = Math.max(it.valor > 0 ? 3 : 0, (it.valor / topoEixo) * util);
        const x = esq + slot * i + (slot - larg) / 2;
        const forte = algumDestaque ? it.destaque : i === itens.length - 1;
        return (
          <g key={it.rotulo + i} onClick={() => onClicar?.(i)} style={{ cursor: onClicar ? 'pointer' : 'default' }}>
            <title>{it.titulo ?? `${it.rotulo}: ${fmtNum(it.valor, casas)}${unidade ? ' ' + unidade : ''}`}</title>
            <rect x={x} y={H - base - h} width={larg} height={h} rx={5} fill={cor} fillOpacity={forte ? 1 : 0.42 + (0.4 * i) / Math.max(1, itens.length - 1)} />
            <text x={x + larg / 2} y={H - base - h - 6} textAnchor="middle" fontSize={11.5} fontWeight={700} fill={COR.texto}>{fmtNum(it.valor, casas)}</text>
            <text x={x + larg / 2} y={H - 6} textAnchor="middle" fontSize={11} fontWeight={forte ? 700 : 500} fill={forte ? COR.texto : COR.texto2}>{it.rotulo}</text>
          </g>
        );
      })}
    </svg>
  );
}
