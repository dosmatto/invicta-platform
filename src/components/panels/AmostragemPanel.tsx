import { PanelSection, PanelRow, PanelButton, MockIndicator } from './_shared';
import { Plus } from 'lucide-react';

const CAMPANHAS = [
  { talhao: 'Talhão 01', tipo: 'Grid Fixo', pontos: 12, status: 'Concluída', data: '15/08/24' },
  { talhao: 'Gleba A', tipo: 'Grid Variável', pontos: 18, status: 'Concluída', data: '20/08/24' },
  { talhao: 'Talhão 02', tipo: 'Grid Fixo', pontos: 15, status: 'Aguardando', data: '—' },
];

export function AmostragemPanel() {
  return (
    <div>
      <PanelSection>
        <PanelButton label="Nova Campanha" icon={<Plus size={12} />} color="var(--invicta-green-dark)" />
      </PanelSection>

      <PanelSection title="Campanhas de Amostragem">
        <div className="px-4 py-1 flex items-center gap-1"><MockIndicator /></div>
        {CAMPANHAS.map((c, i) => (
          <PanelRow key={i} label={c.talhao}
            sub={`${c.tipo} · ${c.pontos} pontos · ${c.data}`}
            badge={<span className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: c.status === 'Concluída' ? '#166534' : '#78350f', color: '#fff' }}>
              {c.status}
            </span>}
          />
        ))}
      </PanelSection>

      <PanelSection title="Método de Amostragem">
        {['Grid Fixo', 'Grid Variável por Atributos', 'Importar pontos externos', 'Manual no mapa'].map(m => (
          <div key={m} className="flex items-center gap-3 px-4 py-2.5 text-sm"
            style={{ color: 'var(--sidebar-text)', borderBottom: '1px solid #0f2240' }}>
            <input type="radio" name="metodo" className="accent-green-600" />
            {m}
          </div>
        ))}
      </PanelSection>
    </div>
  );
}
