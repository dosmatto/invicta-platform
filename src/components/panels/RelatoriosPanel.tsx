import { PanelSection, PanelRow, PanelButton, MockIndicator } from './_shared';
import { Plus, Download } from 'lucide-react';

const RELATORIOS = [
  { tipo: 'Fertilidade', talhao: 'Talhão 01', data: '15/09/24', liberado: true },
  { tipo: 'Fertilidade', talhao: 'Gleba A', data: '18/09/24', liberado: false },
  { tipo: 'NDVI', talhao: 'Talhão 01', data: '20/01/25', liberado: true },
  { tipo: 'Recomendação', talhao: 'Talhão 02', data: '—', liberado: false },
];

export function RelatoriosPanel() {
  return (
    <div>
      <PanelSection>
        <PanelButton label="Gerar Novo Relatório" icon={<Plus size={12} />} color="var(--invicta-green-dark)" />
      </PanelSection>

      <PanelSection title="Relatórios Gerados">
        <div className="px-4 py-1 flex items-center gap-1"><MockIndicator /></div>
        {RELATORIOS.map((r, i) => (
          <PanelRow key={i}
            label={`${r.tipo} — ${r.talhao}`}
            sub={r.data}
            badge={
              <div className="flex items-center gap-1.5">
                {r.liberado
                  ? <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#166534', color: '#fff' }}>Liberado</span>
                  : <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#1a3a6b', color: '#94a3b8' }}>Não liberado</span>
                }
                <Download size={12} style={{ color: '#93c5fd' }} />
              </div>
            }
          />
        ))}
      </PanelSection>
    </div>
  );
}
