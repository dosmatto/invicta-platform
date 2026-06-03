import { PanelSection, PanelRow, PanelButton, MockIndicator } from './_shared';
import { Upload } from 'lucide-react';
const DATA = [
  { talhao: 'Talhão 01', cultura: 'Soja 24/25', media: '62,4 sc/ha', status: 'Limpo' },
  { talhao: 'Gleba A', cultura: 'Soja 24/25', media: '58,1 sc/ha', status: 'Limpo' },
  { talhao: 'Talhão 02', cultura: 'Milho 23/24', media: '—', status: 'Aguardando' },
];
export function ProdutividadePanel() {
  return (
    <div>
      <PanelSection title="Importar Mapa de Colheita">
        <div className="px-4 py-2 space-y-2">
          <div className="h-8 rounded px-3 flex items-center text-xs" style={{ background: '#1a3a6b', color: 'var(--sidebar-text)' }}>Selecionar talhão e safra...</div>
        </div>
        <PanelButton label="Importar e Limpar Outliers" icon={<Upload size={12} />} color="var(--invicta-blue-mid)" />
        <div className="px-4 py-1 flex items-center gap-1 pb-2"><MockIndicator /></div>
      </PanelSection>
      <PanelSection title="Mapas de Colheita">
        <div className="px-4 py-1 flex items-center gap-1"><MockIndicator /></div>
        {DATA.map((d, i) => <PanelRow key={i} label={d.talhao} sub={d.cultura} value={d.media} />)}
      </PanelSection>
    </div>
  );
}
