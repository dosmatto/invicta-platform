'use client';

// Dashboard — visão geral com DADOS REAIS do cadastro (antes era mock zerado,
// o que fazia o Início mostrar "0 Produtores" com a base cheia).

import { useMemo } from 'react';
import { PanelSection, PanelKpi } from './_shared';
import { getClientes, getFazendas, getTalhoes, getSafras } from '@/lib/store';

export function DashboardPanel() {
  const kpis = useMemo(() => {
    const talhoes = getTalhoes();
    const incompletos = talhoes.filter(t => t.status === 'incompleto').length;
    return {
      produtores: getClientes().length,
      fazendas: getFazendas().length,
      talhoesAtivos: talhoes.length - incompletos,
      incompletos,
      areaTotal: talhoes.reduce((s, t) => s + (t.areaHa || 0), 0),
      safraAtual: getSafras().find(s => s.ativa)?.nome ?? '—',
    };
  }, []);

  return (
    <div>
      {/* KPIs */}
      <PanelSection title="Visão Geral">
        <div className="flex border-b" style={{ borderColor: '#1a3a6b' }}>
          <PanelKpi label="Produtores" value={kpis.produtores} color="#93c5fd" />
          <div className="w-px" style={{ background: '#1a3a6b' }} />
          <PanelKpi label="Fazendas" value={kpis.fazendas} color="#93c5fd" />
          <div className="w-px" style={{ background: '#1a3a6b' }} />
          <PanelKpi label="Talhões" value={kpis.talhoesAtivos} color="#86efac" />
        </div>
        <div className="flex border-b" style={{ borderColor: '#1a3a6b' }}>
          <PanelKpi label="Área Total (ha)" value={kpis.areaTotal.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} color="#fde68a" />
          <div className="w-px" style={{ background: '#1a3a6b' }} />
          <PanelKpi label="Safra Atual" value={kpis.safraAtual} color="#fff" />
          <div className="w-px" style={{ background: '#1a3a6b' }} />
          <PanelKpi label="Incompletos" value={kpis.incompletos} color="#fca5a5" />
        </div>
      </PanelSection>

      {/* Alerta */}
      {kpis.incompletos > 0 && (
        <PanelSection>
          <div className="mx-4 my-3 p-3 rounded-lg text-xs" style={{ background: '#78350f', color: '#fde68a' }}>
            ⚠ {kpis.incompletos} talhão(ões) sem limite geográfico.
          </div>
        </PanelSection>
      )}
    </div>
  );
}
