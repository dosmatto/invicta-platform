'use client';

import { LAYOUTS_ETIQUETA } from '@/lib/etiquetas';

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;

interface Props {
  layoutId: string;
  setLayoutId: (id: string) => void;
  dx: number; dy: number;
  setDx: (v: number) => void;
  setDy: (v: number) => void;
}

// Seletor de modelo de folha (Pimaco) + ajuste fino de margem (calibração).
export function EtiquetaLayoutPicker({ layoutId, setLayoutId, dx, dy, setDx, setDy }: Props) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-semibold block" style={{ color: '#64748b' }}>Folha de etiquetas</label>
      <select value={layoutId} onChange={e => setLayoutId(e.target.value)}
        className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
        {LAYOUTS_ETIQUETA.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
      </select>
      <div className="flex items-center gap-2">
        <span className="text-[9px]" style={{ color: '#475569' }}>Ajuste (mm):</span>
        <label className="text-[9px] flex items-center gap-1" style={{ color: '#64748b' }}>
          H
          <input type="number" step="0.5" value={dx} onChange={e => setDx(Number(e.target.value.replace(',', '.')) || 0)}
            className="w-14 rounded px-1.5 py-0.5 text-xs outline-none" style={inputStyle} />
        </label>
        <label className="text-[9px] flex items-center gap-1" style={{ color: '#64748b' }}>
          V
          <input type="number" step="0.5" value={dy} onChange={e => setDy(Number(e.target.value.replace(',', '.')) || 0)}
            className="w-14 rounded px-1.5 py-0.5 text-xs outline-none" style={inputStyle} />
        </label>
      </div>
      <p className="text-[9px]" style={{ color: '#475569' }}>Imprima 1 folha de teste; se sair deslocado, ajuste H/V em mm.</p>
    </div>
  );
}
