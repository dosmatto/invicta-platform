'use client';

import { LEGENDAS_PADRAO } from '@/constants/agronomica';
import { LegendaBar } from '@/components/agronomica/LegendaBar';
import { ExternalLink } from 'lucide-react';

export function BaseAgronomicaPanel() {
  return (
    <div>
      {/* Link para página completa */}
      <div className="p-4" style={{ borderBottom: '1px solid #0f2240' }}>
        <a href="/painel/base-agronomica"
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--invicta-blue-mid)' }}>
          <ExternalLink size={14} /> Abrir Editor Completo
        </a>
        <p className="text-[10px] text-center mt-2" style={{ color: '#475569' }}>
          Configurar legendas, classes, profundidades e metodologias
        </p>
      </div>

      {/* Preview das legendas principais */}
      <div className="px-4 py-2" style={{ borderBottom: '1px solid #0f2240' }}>
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: '#475569' }}>
          Preview das Legendas
        </p>
        <div className="space-y-5">
          {LEGENDAS_PADRAO.slice(0, 5).map(l => (
            <div key={l.id}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-7 h-7 rounded flex items-center justify-center text-xs font-black"
                  style={{ background: '#1a3a6b', color: '#93c5fd' }}>{l.simbolo}</span>
                <span className="text-xs font-semibold" style={{ color: '#cbd5e1' }}>{l.nome}</span>
                {l.invertido && (
                  <span className="text-[9px] px-1 rounded" style={{ background: '#7c3aed22', color: '#a78bfa' }}>
                    INV
                  </span>
                )}
              </div>
              <LegendaBar legenda={l} size="sm" />
            </div>
          ))}
        </div>
        <p className="text-[10px] mt-4 text-center" style={{ color: '#475569' }}>
          +{LEGENDAS_PADRAO.length - 5} nutrientes configurados
        </p>
      </div>
    </div>
  );
}
