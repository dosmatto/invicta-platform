'use client';

// Gráficos do Painel do Produtor — SVG puro, sem biblioteca. São poucos tipos
// (mapa dos talhões, barras por ano, rosca, linha de evolução, barras
// horizontais) e todos leem as cores do tema Invicta.

import type { AreaPorAno, SituacaoCiclo } from '@/lib/portalProdutor';

export const COR = {
  texto: 'var(--text-primary)',
  texto2: 'var(--text-secondary)',
  mudo: 'var(--text-muted)',
  borda: 'var(--border-color)',
  verde: 'var(--invicta-green)',
  verdeEscuro: 'var(--invicta-green-dark)',
  verdeClaro: 'var(--invicta-green-light)',
  azul: 'var(--invicta-blue-mid)',
  azulClaro: 'var(--invicta-blue-light)',
  azulEscuro: 'var(--invicta-blue)',
  ambar: 'var(--status-warning)',
  vermelho: 'var(--status-error)',
} as const;

export const COR_CICLO: Record<SituacaoCiclo, string> = {
  completo: COR.verde,
  andamento: COR.ambar,
  'sem-dado': COR.mudo,
};

const fmtInt = (v: number) => Math.round(v).toLocaleString('pt-BR');

// ── Mosaico dos talhões ─────────────────────────────────────────────────────

const rotuloCurto = (nome: string) => { const m = /(\S+)$/.exec(nome); return m ? m[1] : nome; };
const fmtHa1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });

/** Cada talhão numa célula igual: a forma real (projetada sozinha), na cor do
 *  andamento, com o número embaixo numa linha de base comum. */
export function MosaicoTalhoes({ itens, situacao, onAbrir }: {
  itens: Array<{ id: string; nome: string; areaHa: number; d: string; viewBox: string }>;
  situacao: Record<string, SituacaoCiclo>;
  onAbrir?: (id: string) => void;
}) {
  return (
    <ul className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-x-5 gap-y-4">
      {itens.map(it => {
        const sit = situacao[it.id] ?? 'sem-dado';
        const cor = COR_CICLO[sit];
        return (
          <li key={it.id} className="min-w-0">
            <button type="button" onClick={() => onAbrir?.(it.id)} disabled={!onAbrir} className="w-full text-left group" title={it.nome} style={{ cursor: onAbrir ? 'pointer' : 'default' }}>
              <svg viewBox={it.viewBox} role="img" aria-label={it.nome} style={{ width: '100%', height: 'auto', display: 'block' }}>
                <path d={it.d} fill={cor} fillOpacity={sit === 'sem-dado' ? 0.35 : 0.18} stroke={cor} strokeWidth={2} strokeLinejoin="round" fillRule="evenodd" className="transition-[fill-opacity] group-hover:[fill-opacity:0.45]" />
              </svg>
              <p className="mt-2 text-sm font-semibold leading-tight truncate group-hover:underline" style={{ color: COR.texto }}>
                {rotuloCurto(it.nome)}<span className="font-normal text-xs" style={{ color: COR.texto2 }}> · {fmtHa1(it.areaHa)} ha</span>
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ── Barras por ano (área amostrada) ─────────────────────────────────────────

export function BarrasAno({ serie, anoSel, onAno }: { serie: AreaPorAno[]; anoSel: number | null; onAno?: (ano: number) => void }) {
  const W = 400, H = 260, topo = 26, base = 30, esq = 50, dir = 8;
  const n = serie.length;
  if (!n || serie.every(s => s.areaHa === 0)) {
    return <div className="flex items-center justify-center text-sm" style={{ color: COR.texto2, minHeight: 180 }}>Nenhuma amostragem registrada ainda.</div>;
  }
  // Escala "redonda": o topo do eixo é o próximo múltiplo bonito acima do máximo.
  const maxDado = Math.max(1, ...serie.map(s => s.areaHa));
  const pot = Math.pow(10, Math.floor(Math.log10(maxDado)));
  const passo = [1, 2, 2.5, 5, 10].map(m => m * pot).find(p => maxDado / p <= 4) ?? pot * 10;
  const max = Math.ceil(maxDado / passo) * passo;
  const ticks = Array.from({ length: Math.round(max / passo) + 1 }, (_, i) => i * passo);
  const alturaUtil = H - topo - base;
  const y = (v: number) => topo + (1 - v / max) * alturaUtil;
  const larguraSlot = (W - esq - dir) / n;
  const larguraBarra = Math.min(44, larguraSlot * 0.45);
  // Retângulo com raio só nos cantos de cima: a base assenta na linha do zero.
  const barra = (x: number, yTopo: number, w: number, h: number, r: number) => {
    const rr = Math.min(r, h / 2, w / 2);
    return `M${x} ${yTopo + h} V${yTopo + rr} Q${x} ${yTopo} ${x + rr} ${yTopo} H${x + w - rr} Q${x + w} ${yTopo} ${x + w} ${yTopo + rr} V${yTopo + h} Z`;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Área amostrada por ano" style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
      {ticks.map(t => (
        <g key={t}>
          <line x1={esq} x2={W - dir} y1={y(t)} y2={y(t)} stroke={COR.borda} strokeWidth={1} />
          <text x={esq - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={15} fill={COR.texto2}>{fmtInt(t)}</text>
        </g>
      ))}
      {serie.map((s, i) => {
        const h = Math.max(s.areaHa > 0 ? 3 : 0, (s.areaHa / max) * alturaUtil);
        const x = esq + larguraSlot * i + (larguraSlot - larguraBarra) / 2;
        const sel = s.ano === anoSel;
        return (
          <g key={s.ano} onClick={() => onAno?.(s.ano)} style={{ cursor: onAno ? 'pointer' : 'default' }}>
            <title>{`${s.ano}: ${fmtInt(s.areaHa)} ha em ${s.nTalhoes} talhão(ões), ${s.pontos} pontos`}</title>
            <path d={barra(x, H - base - h, larguraBarra, h, larguraBarra / 2)} fill={sel ? COR.verdeEscuro : COR.verde} />
            {sel && <rect x={x} y={H - 4} width={larguraBarra} height={2} rx={1} fill={COR.verdeEscuro} />}
            <text x={x + larguraBarra / 2} y={H - base - h - 9} textAnchor="middle" fontSize={15} fontWeight={600} fill={COR.texto}>
              {s.areaHa > 0 ? fmtInt(s.areaHa) : ''}
            </text>
            <text x={x + larguraBarra / 2} y={H - 9} textAnchor="middle" fontSize={15} fontWeight={sel ? 700 : 500} fill={sel ? COR.texto : COR.texto2}>
              {s.ano}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Rosca ───────────────────────────────────────────────────────────────────

export function Rosca({ partes, centro, sub, tamanho = 132 }: {
  partes: Array<{ rotulo: string; valor: number; cor: string; opacidade?: number; arredondar?: boolean }>;
  centro: string;
  sub: string;
  tamanho?: number;
}) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  const r = 44, cx = 60, cy = 60, circ = 2 * Math.PI * r, espessura = 13;
  let acumulado = 0;
  return (
    <svg viewBox="0 0 120 120" width={tamanho} height={tamanho} role="img" aria-label={sub} style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={COR.borda} strokeWidth={espessura} />
      {total > 0 && partes.filter(p => p.valor > 0).map(p => {
        const frac = p.valor / total;
        const dash = `${frac * circ} ${circ}`;
        const rot = (acumulado / total) * 360 - 90;
        acumulado += p.valor;
        return (
          <circle key={p.rotulo} cx={cx} cy={cy} r={r} fill="none" stroke={p.cor} strokeOpacity={p.opacidade ?? 1} strokeWidth={espessura}
            strokeLinecap={p.arredondar && frac < 1 ? 'round' : 'butt'} strokeDasharray={dash} transform={`rotate(${rot} ${cx} ${cy})`}>
            <title>{`${p.rotulo}: ${p.valor}`}</title>
          </circle>
        );
      })}
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize={26} fontWeight={700} fill={COR.texto}>{centro}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize={11} fill={COR.texto2}>{sub}</text>
    </svg>
  );
}

// ── Linha de evolução (um nutriente) ────────────────────────────────────────

export function LinhaEvolucao({ pontos, cor, unidade, casas = 1 }: {
  pontos: Array<{ ano: number; valor: number | null }>;
  cor: string;
  unidade?: string;
  casas?: number;
}) {
  // Cada cartão de nutriente tem ~130 px; o SVG escala junto, então a fonte é
  // em unidades do quadro (13 aqui ≈ 11 px na tela) e as margens laterais
  // guardam lugar para "2026" centrado no último ponto.
  const W = 150, H = 184, esq = 22, dir = 22, topo = 28, base = 24;
  const validos = pontos.filter(p => p.valor != null) as Array<{ ano: number; valor: number }>;
  if (!validos.length) {
    return <div className="flex items-center justify-center text-xs" style={{ color: COR.texto2, height: H }}>sem análise</div>;
  }
  const min = Math.min(...validos.map(p => p.valor)), max = Math.max(...validos.map(p => p.valor));
  const folga = (max - min) || Math.abs(max) * 0.2 || 1;
  const lo = min - folga * 0.25, hi = max + folga * 0.25;
  const n = pontos.length;
  const x = (i: number) => n === 1 ? W / 2 : esq + (i / (n - 1)) * (W - esq - dir);
  const y = (v: number) => topo + (1 - (v - lo) / (hi - lo)) * (H - topo - base);
  const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  const caminho = pontos.map((p, i) => (p.valor == null ? null : `${x(i)},${y(p.valor)}`)).filter(Boolean).join(' ');
  const ultimo = validos[validos.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
      <line x1={esq - 6} x2={W - dir + 6} y1={H - base + 4} y2={H - base + 4} stroke={COR.borda} />
      {validos.length > 1 && <polyline points={caminho} fill="none" stroke={cor} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />}
      {pontos.map((p, i) => p.valor == null ? null : (
        <g key={p.ano}>
          <title>{`${p.ano}: ${fmt(p.valor)}${unidade ? ' ' + unidade : ''}`}</title>
          <circle cx={x(i)} cy={y(p.valor)} r={p === ultimo ? 4.5 : 3.2} fill={p === ultimo ? cor : 'var(--bg-surface)'} stroke={cor} strokeWidth={2} />
          {(i === 0 || p === ultimo) && (
            <text x={x(i)} y={p === ultimo ? y(p.valor) - 11 : y(p.valor) + 20} textAnchor="middle" fontSize={13} fontWeight={p === ultimo ? 700 : 500} fill={p === ultimo ? COR.texto : COR.texto2}>{fmt(p.valor)}</text>
          )}
          <text x={x(i)} y={H - 4} textAnchor="middle" fontSize={13} fontWeight={p === ultimo ? 600 : 400} fill={COR.texto2}>{p.ano}</text>
        </g>
      ))}
    </svg>
  );
}

// ── Pontos num eixo comum (ranking com diferenças pequenas) ─────────────────

/** Escala "redonda" que abre espaço entre valores próximos: de um múltiplo de
 *  5 abaixo do menor a um múltiplo de 5 acima do maior. */
export function eixoDe(valores: number[], passo = 5): { lo: number; hi: number } {
  const min = Math.min(...valores), max = Math.max(...valores);
  let lo = Math.floor(min / passo) * passo, hi = Math.ceil(max / passo) * passo;
  if (hi - lo < passo * 2) { lo -= passo; hi += passo; }
  if (min - lo < passo * 0.3) lo -= passo;
  return { lo: Math.max(0, lo), hi };
}

export function PontosEixo({ itens, cor = COR.verde, onAbrir }: {
  itens: Array<{ id: string; rotulo: string; sub?: string; valor: number }>;
  cor?: string;
  onAbrir?: (id: string) => void;
}) {
  if (!itens.length) return null;
  const { lo, hi } = eixoDe(itens.map(i => i.valor));
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
  const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (
    <div>
      <div className="grid grid-cols-[88px_minmax(0,1fr)_56px] gap-3 items-center pb-2 text-xs" style={{ color: COR.texto2 }}>
        <span />
        <span className="relative h-4 tabular-nums">
          <span className="absolute left-0 -translate-x-1/2">{fmtInt(lo)}</span>
          <span className="absolute right-0 translate-x-1/2">{fmtInt(hi)}</span>
        </span>
        <span />
      </div>
      <ul className="space-y-1">
        {itens.map(it => (
          <li key={it.id}>
            <button type="button" onClick={() => onAbrir?.(it.id)} disabled={!onAbrir}
              className="w-full grid grid-cols-[88px_minmax(0,1fr)_56px] gap-3 items-center py-1.5 text-left group"
              style={{ cursor: onAbrir ? 'pointer' : 'default' }}>
              <span className="text-sm font-semibold truncate group-hover:underline" style={{ color: COR.texto }}>
                {it.rotulo}{it.sub && <span className="font-normal text-xs" style={{ color: COR.texto2 }}> · {it.sub}</span>}
              </span>
              <span className="relative h-5">
                <span className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 rounded-full" style={{ background: COR.borda }} />
                <span className="absolute left-0 top-0 bottom-0 w-px" style={{ background: COR.borda }} />
                <span className="absolute right-0 top-0 bottom-0 w-px" style={{ background: COR.borda }} />
                <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full" style={{ left: `${pct(it.valor)}%`, background: cor, boxShadow: '0 0 0 2px var(--bg-surface)' }} />
              </span>
              <span className="text-sm font-bold tabular-nums text-right" style={{ color: COR.texto }}>{fmt(it.valor)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Barras horizontais ──────────────────────────────────────────────────────

export function BarrasHorizontais({ itens, unidade, cor = COR.azul, onAbrir }: {
  itens: Array<{ id: string; rotulo: string; sub?: string; valor: number }>;
  unidade: string;
  cor?: string;
  onAbrir?: (id: string) => void;
}) {
  const max = Math.max(1, ...itens.map(i => i.valor));
  return (
    <div className="space-y-4">
      {itens.map(it => (
        <button key={it.id} type="button" onClick={() => onAbrir?.(it.id)} disabled={!onAbrir}
          className="w-full text-left group" style={{ cursor: onAbrir ? 'pointer' : 'default' }}>
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <span className="text-sm font-semibold truncate" style={{ color: COR.texto }}>
              {it.rotulo}{it.sub && <span className="font-normal text-xs" style={{ color: COR.texto2 }}> · {it.sub}</span>}
            </span>
            <span className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: COR.texto }}>
              {it.valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} <span className="font-normal text-xs" style={{ color: COR.texto2 }}>{unidade}</span>
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: COR.borda }}>
            <div className="h-full rounded-full" style={{ width: `${(it.valor / max) * 100}%`, background: cor, transition: 'width .3s' }} />
          </div>
        </button>
      ))}
    </div>
  );
}
