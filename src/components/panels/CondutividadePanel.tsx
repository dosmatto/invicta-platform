import { PanelSection, PanelRow, PanelButton, MockIndicator } from './_shared';
import { Upload } from 'lucide-react';
const DATA = [
  { talhao: 'Gleba A', data: '10/03/2024', equipamento: 'Veris 3100', status: 'Processado' },
  { talhao: 'Talhão 01', data: '12/03/2024', equipamento: 'Veris 3100', status: 'Processado' },
];
export function CondutividadePanel() {
  return (
    <div>
      <PanelSection title="Importar CSV do Equipamento">
        <div className="px-4 py-2 space-y-2">
          <div className="h-8 rounded px-3 flex items-center text-xs" style={{ background: '#1a3a6b', color: 'var(--sidebar-text)' }}>Selecionar talhão...</div>
          <div className="h-8 rounded px-3 flex items-center text-xs" style={{ background: '#1a3a6b', color: 'var(--sidebar-text)' }}>Data de coleta...</div>
          <div className="h-8 rounded px-3 flex items-center text-xs" style={{ background: '#1a3a6b', color: 'var(--sidebar-text)' }}>Equipamento utilizado...</div>
        </div>
        <PanelButton label="Importar CSV" icon={<Upload size={12} />} color="var(--invicta-blue-mid)" />
      </PanelSection>
      <PanelSection title="Camadas de CE">
        <div className="px-4 py-1 flex items-center gap-1"><MockIndicator /></div>
        {DATA.map((d, i) => <PanelRow key={i} label={d.talhao} sub={`${d.data} · ${d.equipamento}`} value={d.status} />)}
      </PanelSection>
      <PanelSection>
        <div className="mx-4 my-3 p-3 rounded text-xs" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
          A CE é uma camada estrutural permanente do talhão. Somente upload via arquivo CSV do equipamento de campo.
        </div>
      </PanelSection>
    </div>
  );
}
