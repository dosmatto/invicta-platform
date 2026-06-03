import { PanelSection, PanelRow, PanelButton } from './_shared';
import { Download, QrCode } from 'lucide-react';
const ETIQUETAS = [
  { id: 'AM-01-A-0-10', talhao: 'Talhão 01', ponto: 1, prof: '0–10 cm' },
  { id: 'AM-01-A-10-20', talhao: 'Talhão 01', ponto: 1, prof: '10–20 cm' },
  { id: 'AM-01-B-0-10', talhao: 'Talhão 01', ponto: 2, prof: '0–10 cm' },
  { id: 'AM-02-A-0-10', talhao: 'Gleba A', ponto: 1, prof: '0–10 cm' },
];
export function QrCodePanel() {
  return (
    <div>
      <PanelSection title="Campanha">
        <div className="px-4 py-2">
          <div className="h-8 rounded px-3 flex items-center text-xs" style={{ background: '#1a3a6b', color: 'var(--sidebar-text)' }}>Selecionar campanha...</div>
        </div>
        <PanelButton label="Exportar PDF de Etiquetas" icon={<Download size={12} />} color="var(--invicta-blue-mid)" />
      </PanelSection>
      <PanelSection title="Etiquetas — Ago/2024">
        {ETIQUETAS.map(e => (
          <div key={e.id} className="flex items-center gap-3 px-4 py-2.5"
            style={{ borderBottom: '1px solid #0f2240' }}>
            <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
              style={{ background: '#1a3a6b' }}>
              <QrCode size={16} style={{ color: '#93c5fd' }} />
            </div>
            <div>
              <p className="text-xs font-mono font-bold" style={{ color: '#e2e8f0' }}>{e.id}</p>
              <p className="text-[10px]" style={{ color: 'var(--sidebar-section)' }}>{e.talhao} · P{e.ponto} · {e.prof}</p>
            </div>
          </div>
        ))}
      </PanelSection>
    </div>
  );
}
