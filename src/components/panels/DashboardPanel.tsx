import { PanelSection, PanelRow, PanelKpi, MockIndicator } from './_shared';
import { MOCK_KPIS, MOCK_PROCESSAMENTOS } from '@/constants/mocks';

export function DashboardPanel() {
  return (
    <div>
      {/* KPIs */}
      <PanelSection title="Visão Geral">
        <div className="flex border-b" style={{ borderColor: '#1a3a6b' }}>
          <PanelKpi label="Produtores" value={MOCK_KPIS.produtores} color="#93c5fd" />
          <div className="w-px" style={{ background: '#1a3a6b' }} />
          <PanelKpi label="Fazendas" value={MOCK_KPIS.fazendas} color="#93c5fd" />
          <div className="w-px" style={{ background: '#1a3a6b' }} />
          <PanelKpi label="Talhões" value={MOCK_KPIS.talhoesAtivos} color="#86efac" />
        </div>
        <div className="flex border-b" style={{ borderColor: '#1a3a6b' }}>
          <PanelKpi label="Área Total (ha)" value={MOCK_KPIS.areaTotal.toLocaleString('pt-BR')} color="#fde68a" />
          <div className="w-px" style={{ background: '#1a3a6b' }} />
          <PanelKpi label="Safra Atual" value={MOCK_KPIS.safraAtual} color="#fff" />
          <div className="w-px" style={{ background: '#1a3a6b' }} />
          <PanelKpi label="Incompletos" value={MOCK_KPIS.talhoesIncompletos} color="#fca5a5" />
        </div>
      </PanelSection>

      {/* Processamentos recentes */}
      <PanelSection title="Processamentos Recentes">
        <div className="px-4 py-1 flex items-center gap-1">
          <MockIndicator />
        </div>
        {MOCK_PROCESSAMENTOS.map(p => (
          <PanelRow
            key={p.id}
            label={p.tipo}
            sub={`${p.talhao} · ${p.data}`}
            badge={
              <span className="text-[10px] px-1.5 py-0.5 rounded"
                style={{
                  background: p.status === 'concluido' ? '#166534' : p.status === 'processando' ? '#4c1d95' : '#78350f',
                  color: '#fff',
                }}>
                {p.status}
              </span>
            }
          />
        ))}
      </PanelSection>

      {/* Alerta */}
      {MOCK_KPIS.talhoesIncompletos > 0 && (
        <PanelSection>
          <div className="mx-4 my-3 p-3 rounded-lg text-xs" style={{ background: '#78350f', color: '#fde68a' }}>
            ⚠ {MOCK_KPIS.talhoesIncompletos} talhão(ões) sem limite geográfico.
          </div>
        </PanelSection>
      )}
    </div>
  );
}
