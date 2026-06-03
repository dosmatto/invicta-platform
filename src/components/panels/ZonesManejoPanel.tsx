import { PanelSection, PanelRow, PanelButton, MockIndicator } from './_shared';
import { Play } from 'lucide-react';
const ZONAS = [
  { talhao: 'Talhão 01', versao: 'v2', zonas: 4, status: 'Ativa' },
  { talhao: 'Gleba A', versao: 'v1', zonas: 3, status: 'Ativa' },
  { talhao: 'Talhão 02', versao: '—', zonas: 0, status: 'Pendente' },
];
const CORES = ['#2166ac', '#74add1', '#fee090', '#f46d43', '#d73027'];
export function ZonesManejoPanel() {
  return (
    <div>
      <PanelSection title="Camadas para Geração">
        {['CE (Condutividade Elétrica)', 'NDVI Histórico', 'Fertilidade', 'Produtividade'].map(c => (
          <div key={c} className="flex items-center gap-3 px-4 py-2.5 text-xs"
            style={{ color: 'var(--sidebar-text)', borderBottom: '1px solid #0f2240' }}>
            <input type="checkbox" className="accent-green-600" defaultChecked={c === 'CE (Condutividade Elétrica)'} />
            {c}
          </div>
        ))}
      </PanelSection>
      <PanelSection title="Número de Zonas">
        <div className="flex gap-2 px-4 py-2">
          {[2, 3, 4, 5].map(n => (
            <button key={n} className="flex-1 py-1.5 rounded text-xs font-bold"
              style={{ background: n === 4 ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: '#fff' }}>{n}</button>
          ))}
        </div>
        <PanelButton label="Gerar Zonas de Manejo" icon={<Play size={12} />} color="var(--invicta-green-dark)" />
        <div className="px-4 py-1 flex items-center gap-1 pb-2"><MockIndicator /></div>
      </PanelSection>
      <PanelSection title="Legenda">
        <div className="flex items-center gap-1 px-4 py-3">
          {CORES.map((c, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full h-4 rounded-sm" style={{ background: c }} />
              <span className="text-[9px]" style={{ color: '#94a3b8' }}>Z{i + 1}</span>
            </div>
          ))}
        </div>
      </PanelSection>
      <PanelSection title="Zonas Geradas">
        <div className="px-4 py-1 flex items-center gap-1"><MockIndicator /></div>
        {ZONAS.map((z, i) => <PanelRow key={i} label={z.talhao} sub={`${z.versao} · ${z.zonas} zonas`} value={z.status} />)}
      </PanelSection>
    </div>
  );
}
