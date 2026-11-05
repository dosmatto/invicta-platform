'use client';

// Barras horizontais com o valor na ponta (ex.: "Produtividade por talhão —
// Top 5"). Coluna extra opcional (área), clique abre o talhão.

import { COR, fmtNum } from './formato';

export interface ItemBarra { id: string; rotulo: string; valor: number; sub?: string; cor?: string }

export function BarraTop({ itens, unidade, casas = 1, extra, onClicar, cor = 'var(--invicta-green)', minimo }: {
  itens: ItemBarra[];
  unidade?: string;
  casas?: number;
  /** Coluna do meio (ex.: área): título e valor por item. */
  extra?: { titulo: string; valor: (it: ItemBarra) => string };
  onClicar?: (id: string) => void;
  cor?: string;
  /** Início do eixo (padrão: 0). Use um piso para separar valores próximos. */
  minimo?: number;
}) {
  if (!itens.length) return null;
  const max = Math.max(...itens.map(i => i.valor));
  const lo = minimo ?? 0;
  const larg = (v: number) => Math.max(6, Math.min(100, ((v - lo) / ((max - lo) || 1)) * 100));
  return (
    <div className="text-xs">
      <div className="grid gap-2 pb-1.5 font-semibold" style={{ gridTemplateColumns: extra ? 'minmax(0,1fr) 64px minmax(0,1.6fr)' : 'minmax(0,1fr) minmax(0,2fr)', color: COR.texto2 }}>
        <span>Talhão</span>
        {extra && <span className="text-right">{extra.titulo}</span>}
        <span className="pl-1">{unidade ?? ''}</span>
      </div>
      <ul className="space-y-1.5">
        {itens.map((it, i) => (
          <li key={it.id}>
            <button type="button" onClick={() => onClicar?.(it.id)} disabled={!onClicar}
              className="w-full grid gap-2 items-center text-left group" style={{ gridTemplateColumns: extra ? 'minmax(0,1fr) 64px minmax(0,1.6fr)' : 'minmax(0,1fr) minmax(0,2fr)', cursor: onClicar ? 'pointer' : 'default' }}>
              <span className="font-bold truncate group-hover:underline" style={{ color: COR.texto }} title={it.sub ? `${it.rotulo} · ${it.sub}` : it.rotulo}>{it.rotulo}</span>
              {extra && <span className="text-right tabular-nums" style={{ color: COR.texto2 }}>{extra.valor(it)}</span>}
              <span className="flex items-center gap-2 min-w-0">
                <span className="h-4 rounded-md flex-shrink-0" style={{ width: `calc(${larg(it.valor)}% - 44px)`, minWidth: 6, background: it.cor ?? cor, opacity: 1 - i * 0.12 }} />
                <span className="tabular-nums font-bold" style={{ color: COR.texto }}>{fmtNum(it.valor, casas)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
