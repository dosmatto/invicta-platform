import { PanelSection, PanelRow, PanelButton, MockIndicator } from './_shared';
import { Upload } from 'lucide-react';

const HISTORICO = [
  { talhao: 'Talhão 01', fonte: 'Sentinel-2', data: '10/01/2025', media: '0.71' },
  { talhao: 'Talhão 01', fonte: 'Sentinel-2', data: '25/11/2024', media: '0.64' },
  { talhao: 'Gleba A', fonte: 'Falker', data: '15/01/2025', media: '0.55' },
];

export function NdviPanel() {
  return (
    <div>
      <PanelSection title="Fonte de Dados">
        {['Sentinel-2 (Biomassa / Visual)', 'Sensor Falker (Recomendação N)'].map(f => (
          <div key={f} className="flex items-center gap-3 px-4 py-2.5 text-sm"
            style={{ color: 'var(--sidebar-text)', borderBottom: '1px solid #0f2240' }}>
            <input type="radio" name="fonte" className="accent-blue-500" defaultChecked={f.includes('Sentinel')} />
            <span className="text-xs">{f}</span>
          </div>
        ))}
      </PanelSection>

      <PanelSection title="Importar">
        <div className="px-4 py-2 space-y-2">
          <div className="h-8 rounded px-3 flex items-center text-xs"
            style={{ background: '#1a3a6b', color: 'var(--sidebar-text)' }}>Selecionar talhão...</div>
          <div className="h-8 rounded px-3 flex items-center text-xs"
            style={{ background: '#1a3a6b', color: 'var(--sidebar-text)' }}>Data da imagem...</div>
        </div>
        <PanelButton label="Importar GeoTIFF" icon={<Upload size={12} />} color="var(--invicta-blue-mid)" />
      </PanelSection>

      <PanelSection title="Histórico de NDVI">
        <div className="px-4 py-1 flex items-center gap-1"><MockIndicator /></div>
        {HISTORICO.map((h, i) => (
          <PanelRow key={i} label={h.talhao}
            sub={`${h.fonte} · ${h.data}`}
            value={`NDVI ${h.media}`}
          />
        ))}
      </PanelSection>
    </div>
  );
}
