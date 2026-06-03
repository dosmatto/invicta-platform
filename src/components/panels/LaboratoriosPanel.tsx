import { PanelSection, PanelRow, PanelButton, MockIndicator } from './_shared';
import { Upload } from 'lucide-react';
const ENVIOS = [
  { campanha: 'Talhão 01 — Ago/24', lab: 'Laborsolo', amostras: 24, status: 'Recebido' },
  { campanha: 'Gleba A — Ago/24', lab: 'Laborsolo', amostras: 36, status: 'Recebido' },
  { campanha: 'Talhão 02 — Out/24', lab: 'Soloanalise', amostras: 30, status: 'Enviado' },
];
export function LaboratoriosPanel() {
  return (
    <div>
      <PanelSection title="Importar Resultados">
        <div className="px-4 py-2 space-y-2">
          <div className="h-8 rounded px-3 flex items-center text-xs" style={{ background: '#1a3a6b', color: 'var(--sidebar-text)' }}>Selecionar laboratório...</div>
          <div className="h-8 rounded px-3 flex items-center text-xs" style={{ background: '#1a3a6b', color: 'var(--sidebar-text)' }}>Selecionar campanha...</div>
        </div>
        <PanelButton label="Importar XLSX / CSV" icon={<Upload size={12} />} color="var(--invicta-blue-mid)" />
      </PanelSection>
      <PanelSection title="Histórico de Envios">
        <div className="px-4 py-1 flex items-center gap-1"><MockIndicator /></div>
        {ENVIOS.map((e, i) => (
          <PanelRow key={i} label={e.campanha} sub={`${e.lab} · ${e.amostras} amostras`}
            badge={<span className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: e.status === 'Recebido' ? '#166534' : '#1a3a6b', color: '#fff' }}>
              {e.status}
            </span>}
          />
        ))}
      </PanelSection>
    </div>
  );
}
