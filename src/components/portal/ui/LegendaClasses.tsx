'use client';

// Legenda em classes: amostra de cor, rótulo, % e hectares — a coluna à
// direita dos mapas da Visão geral ("≥ 80,0 · 22% (535 ha)").

import { COR, fmtHaCurto, fmtNum } from './formato';

export interface ItemLegenda { cor: string; rotulo: string; pct?: number | null; ha?: number | null; sub?: string; apagado?: boolean }

export function LegendaClasses({ itens, titulo, rodape, compacta }: { itens: ItemLegenda[]; titulo?: string; rodape?: string; compacta?: boolean }) {
  return (
    <div className="min-w-0">
      {titulo && <p className="text-[11px] font-bold mb-1.5 uppercase tracking-wide" style={{ color: COR.texto2 }}>{titulo}</p>}
      <ul className={compacta ? 'space-y-1' : 'space-y-1.5'}>
        {itens.map((it, i) => (
          <li key={`${it.rotulo}-${i}`} className="flex items-center gap-2 text-xs min-w-0" style={{ opacity: it.apagado ? 0.45 : 1 }}>
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: it.cor, boxShadow: '0 0 0 1px color-mix(in srgb, var(--text-primary) 12%, transparent)' }} />
            <span className="flex-1 min-w-0 truncate font-medium" style={{ color: COR.texto }} title={it.sub ? `${it.rotulo} · ${it.sub}` : it.rotulo}>{it.rotulo}</span>
            {it.pct != null && <span className="tabular-nums font-bold" style={{ color: COR.texto }}>{fmtNum(it.pct, 0)}%</span>}
            {it.ha != null && <span className="tabular-nums w-[62px] text-right" style={{ color: COR.texto2 }}>{fmtHaCurto(it.ha)} ha</span>}
          </li>
        ))}
      </ul>
      {rodape && <p className="text-[10px] mt-2 leading-snug" style={{ color: COR.mudo }}>{rodape}</p>}
    </div>
  );
}
