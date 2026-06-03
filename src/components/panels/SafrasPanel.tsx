import { PanelSection, PanelRow, MockIndicator } from './_shared';

const SAFRAS = [
  { nome: '24/25', status: 'Ativa', talhoes: 14 },
  { nome: '23/24', status: 'Encerrada', talhoes: 12 },
  { nome: '22/23', status: 'Encerrada', talhoes: 10 },
];

const CULTIVOS = [
  { talhao: 'Talhão 01', cultura: 'Soja', tipo: 'VERÃO', status: 'Colhido' },
  { talhao: 'Talhão 02', cultura: 'Milho', tipo: 'SAFRINHA', status: 'Em campo' },
  { talhao: 'Gleba A', cultura: 'Soja', tipo: 'VERÃO', status: 'Colhido' },
  { talhao: 'Talhão Norte', cultura: 'Algodão', tipo: 'VERÃO', status: 'Em campo' },
];

export function SafrasPanel() {
  return (
    <div>
      <PanelSection title="Anos Agrícolas">
        <div className="px-4 py-1 flex items-center gap-1"><MockIndicator /></div>
        {SAFRAS.map(s => (
          <PanelRow key={s.nome} label={s.nome} sub={`${s.talhoes} talhões · ${s.status}`}
            badge={<span className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: s.status === 'Ativa' ? '#166534' : '#1e3a5f', color: '#fff' }}>
              {s.status}
            </span>}
          />
        ))}
      </PanelSection>

      <PanelSection title="Cultivos — 24/25">
        <div className="px-4 py-1 flex items-center gap-1"><MockIndicator /></div>
        {CULTIVOS.map((c, i) => (
          <PanelRow key={i} label={c.talhao} sub={`${c.cultura} · ${c.tipo}`}
            badge={<span className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: c.status === 'Colhido' ? '#166534' : '#1e3a5f', color: '#fff' }}>
              {c.status}
            </span>}
          />
        ))}
      </PanelSection>
    </div>
  );
}
