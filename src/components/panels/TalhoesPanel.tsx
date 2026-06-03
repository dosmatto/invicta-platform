import { PanelSection, PanelRow, PanelButton, MockIndicator, StatusBadge } from './_shared';
import { Plus } from 'lucide-react';
import { MOCK_TALHOES } from '@/constants/mocks';

export function TalhoesPanel() {
  return (
    <div>
      <PanelSection>
        <PanelButton label="Novo Talhão" icon={<Plus size={12} />} color="var(--invicta-green-dark)" />
      </PanelSection>

      <PanelSection title="Talhões Cadastrados">
        <div className="px-4 py-1 flex items-center gap-1"><MockIndicator /></div>
        {MOCK_TALHOES.map(t => (
          <PanelRow
            key={t.id}
            label={t.nome}
            sub={`${t.fazenda} · ${t.area} ha`}
            badge={<StatusBadge status={t.status as 'ativo' | 'incompleto'} />}
          />
        ))}
      </PanelSection>

      <PanelSection>
        <div className="mx-4 my-3 p-3 rounded text-xs" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
          💡 Talhão precisa de limite geográfico para ficar Ativo. Faça upload de Shapefile, GeoJSON ou KML.
        </div>
      </PanelSection>
    </div>
  );
}
