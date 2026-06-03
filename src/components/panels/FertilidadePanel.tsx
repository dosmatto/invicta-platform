import { PanelSection, PanelRow, PanelButton, MockIndicator } from './_shared';
import { Play } from 'lucide-react';

const NUTRIENTES = ['pH', 'P', 'K', 'Ca', 'Mg', 'Al', 'V%', 'CTC', 'MO', 'S', 'B', 'Zn'];
const RESULTADOS = [
  { talhao: 'Talhão 01', campanha: 'Ago/2024', profundidades: '0-20 / 20-40', status: 'Concluído' },
  { talhao: 'Gleba A', campanha: 'Ago/2024', profundidades: '0-20 / 20-40', status: 'Concluído' },
  { talhao: 'Talhão 02', campanha: 'Out/2024', profundidades: '0-20', status: 'Aguardando' },
];

const CLASSES = [
  { label: 'MB', color: '#d73027' }, { label: 'B', color: '#f46d43' },
  { label: 'M', color: '#fee090' }, { label: 'A', color: '#74add1' }, { label: 'MA', color: '#2166ac' },
];

export function FertilidadePanel() {
  return (
    <div>
      <PanelSection title="Nutriente">
        <div className="flex flex-wrap gap-1.5 px-4 py-2">
          {NUTRIENTES.map((n, i) => (
            <button key={n} className="px-2.5 py-1 rounded text-xs font-bold transition-colors"
              style={{ background: i === 1 ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: '#fff' }}>
              {n}
            </button>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Profundidade">
        {['0–20 cm', '20–40 cm'].map(p => (
          <div key={p} className="flex items-center gap-3 px-4 py-2 text-sm"
            style={{ color: 'var(--sidebar-text)', borderBottom: '1px solid #0f2240' }}>
            <input type="radio" name="prof" className="accent-blue-500" defaultChecked={p === '0–20 cm'} />
            {p}
          </div>
        ))}
      </PanelSection>

      <PanelSection title="Metodologia">
        <div className="px-4 py-2">
          <div className="h-8 rounded px-3 flex items-center text-xs"
            style={{ background: '#1a3a6b', color: 'var(--sidebar-text)' }}>
            Embrapa Cerrado
          </div>
        </div>
        <PanelButton label="Processar Fertilidade" icon={<Play size={12} />} color="var(--invicta-green-dark)" />
        <div className="px-4 py-1 flex items-center gap-1 pb-2"><MockIndicator /></div>
      </PanelSection>

      <PanelSection title="Legenda — P (mg/dm³)">
        <div className="flex items-center gap-1 px-4 py-3">
          {CLASSES.map(c => (
            <div key={c.label} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full h-4 rounded-sm" style={{ background: c.color }} />
              <span className="text-[9px] font-bold" style={{ color: '#94a3b8' }}>{c.label}</span>
            </div>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Processamentos">
        <div className="px-4 py-1 flex items-center gap-1"><MockIndicator /></div>
        {RESULTADOS.map((r, i) => (
          <PanelRow key={i} label={r.talhao}
            sub={`${r.campanha} · ${r.profundidades}`}
            badge={<span className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: r.status === 'Concluído' ? '#166534' : '#78350f', color: '#fff' }}>
              {r.status}
            </span>}
          />
        ))}
      </PanelSection>
    </div>
  );
}
