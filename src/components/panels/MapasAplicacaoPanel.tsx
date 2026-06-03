import { PanelSection, PanelRow, PanelButton, MockIndicator } from './_shared';
import { Play, Download } from 'lucide-react';
const MAPAS = [
  { talhao: 'Talhão 01', tipo: 'KCl', zonas: 4, status: 'Gerado' },
  { talhao: 'Gleba A', tipo: 'Calcário', zonas: 3, status: 'Gerado' },
  { talhao: 'Talhão 02', tipo: '—', zonas: 0, status: 'Pendente' },
];
const FABRICANTES = ['John Deere', 'Trimble', 'Case / CNH', 'Raven', 'Stara', 'Genérico (SHP)'];
export function MapasAplicacaoPanel() {
  return (
    <div>
      <PanelSection title="Configurar Mapa">
        <div className="px-4 py-2 space-y-2">
          {['Talhão / Zonas', 'Produto', 'Dose mínima', 'Dose máxima'].map(f => (
            <div key={f} className="h-8 rounded px-3 flex items-center text-xs"
              style={{ background: '#1a3a6b', color: 'var(--sidebar-text)' }}>{f}...</div>
          ))}
        </div>
        <PanelButton label="Gerar Mapa de Aplicação" icon={<Play size={12} />} color="var(--invicta-green-dark)" />
        <div className="px-4 py-1 flex items-center gap-1 pb-2"><MockIndicator /></div>
      </PanelSection>
      <PanelSection title="Exportar para Equipamento">
        <div className="flex flex-wrap gap-1.5 px-4 py-2">
          {FABRICANTES.map(f => (
            <button key={f} className="px-2 py-1 rounded text-[10px] font-medium flex items-center gap-1"
              style={{ background: '#1a3a6b', color: '#93c5fd' }}>
              <Download size={10} />{f}
            </button>
          ))}
        </div>
      </PanelSection>
      <PanelSection title="Mapas Gerados">
        <div className="px-4 py-1 flex items-center gap-1"><MockIndicator /></div>
        {MAPAS.map((m, i) => <PanelRow key={i} label={m.talhao} sub={`${m.tipo} · ${m.zonas} zonas`} value={m.status} />)}
      </PanelSection>
    </div>
  );
}
