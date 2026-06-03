import { PanelSection, PanelRow, PanelButton, MockIndicator } from './_shared';
import { Plus, Search } from 'lucide-react';
import { MOCK_PRODUTORES } from '@/constants/mocks';

export function ProdutoresPanel() {
  return (
    <div>
      <PanelSection>
        <div className="px-4 py-2">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
            style={{ background: '#1a3a6b', color: 'var(--sidebar-text)' }}>
            <Search size={12} /><span>Buscar produtor...</span>
          </div>
        </div>
        <PanelButton label="Novo Produtor" icon={<Plus size={12} />} color="var(--invicta-green-dark)" />
      </PanelSection>

      <PanelSection title="Clientes Cadastrados">
        <div className="px-4 py-1 flex items-center gap-1"><MockIndicator /></div>
        {MOCK_PRODUTORES.map(p => (
          <PanelRow
            key={p.id}
            label={p.nome}
            sub={`${p.cidade} · ${p.estado} · ${p.fazendas} fazenda(s)`}
            value="›"
          />
        ))}
      </PanelSection>
    </div>
  );
}
