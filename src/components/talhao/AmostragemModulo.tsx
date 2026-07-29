'use client';

import { useState } from 'react';
import { Grid3x3, Layers, ClipboardList } from 'lucide-react';
import { SimuladorAmostragem } from './SimuladorAmostragem';
import { SimuladorZonas } from './SimuladorZonas';
import { RegistrosCampoSection } from './RegistrosCampoSection';

// Grid e Zona PLANEJAM a amostragem; Campo mostra o que voltou dela — as
// anotações, condições e fotos que o operador registrou ponto a ponto.
type Metodo = 'grid' | 'zona' | 'campo';

export function AmostragemModulo({ safraNome }: { safraNome?: string } = {}) {
  const [metodo, setMetodo] = useState<Metodo>('grid');

  return (
    <div>
      {/* Seletor de método */}
      <div className="flex gap-1.5 p-3" style={{ borderBottom: '1px solid #1a3a6b' }}>
        {([['grid', 'Grid', Grid3x3], ['zona', 'Zona de Manejo', Layers], ['campo', 'Registros de campo', ClipboardList]] as const).map(([m, lbl, Ic]) => (
          <button key={m} onClick={() => setMetodo(m)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors"
            style={{
              background: metodo === m ? 'var(--invicta-blue-mid)' : '#1a3a6b',
              color: metodo === m ? '#fff' : '#93c5fd',
            }}>
            <Ic size={13} /> {lbl}
          </button>
        ))}
      </div>

      {metodo === 'grid' ? <SimuladorAmostragem safraNome={safraNome} />
        : metodo === 'zona' ? <SimuladorZonas safraNome={safraNome} />
        : <RegistrosCampoSection safraNome={safraNome} />}
    </div>
  );
}
