import { PanelSection, PanelRow, PanelButton, PanelKpi, MockIndicator } from './_shared';
import { Plus } from 'lucide-react';

const FAZENDAS = [
  { id: '1', nome: 'Fazenda São João', produtor: 'João Silva', area: 285.3, talhoes: 3 },
  { id: '2', nome: 'Fazenda Boa Vista', produtor: 'João Silva', area: 120.0, talhoes: 2 },
  { id: '3', nome: 'Fazenda Santa Rita', produtor: 'Pedro Alves', area: 430.8, talhoes: 4 },
  { id: '4', nome: 'Fazenda Esperança', produtor: 'Maria Oliveira', area: 98.5, talhoes: 1 },
];

export function FazendasPanel() {
  return (
    <div>
      <PanelSection>
        <div className="flex border-b" style={{ borderColor: '#1a3a6b' }}>
          <PanelKpi label="Fazendas" value={FAZENDAS.length} color="#93c5fd" />
          <div className="w-px" style={{ background: '#1a3a6b' }} />
          <PanelKpi label="Área Total" value="934,6 ha" color="#86efac" />
        </div>
        <PanelButton label="Nova Fazenda" icon={<Plus size={12} />} color="var(--invicta-green-dark)" />
      </PanelSection>

      <PanelSection title="Propriedades">
        <div className="px-4 py-1 flex items-center gap-1"><MockIndicator /></div>
        {FAZENDAS.map(f => (
          <PanelRow
            key={f.id}
            label={f.nome}
            sub={`${f.produtor} · ${f.talhoes} talhões · ${f.area.toLocaleString('pt-BR')} ha`}
            value="›"
          />
        ))}
      </PanelSection>
    </div>
  );
}
