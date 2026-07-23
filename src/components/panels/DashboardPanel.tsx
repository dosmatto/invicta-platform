'use client';

// Dashboard — visão geral com DADOS REAIS do cadastro (antes era mock zerado,
// o que fazia o Início mostrar "0 Produtores" com a base cheia).

import { useMemo, useState } from 'react';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { PanelSection, PanelKpi } from './_shared';
import { getClientes, getFazendas, getTalhoes, getSafras } from '@/lib/store';
import { gerarConferenciaExcel } from '@/lib/relatorioConferencia';

export function DashboardPanel() {
  const [gerando, setGerando] = useState(false);
  const [msgExcel, setMsgExcel] = useState('');

  // Excel de conferência do cadastro (talhões/áreas/somas + aba de problemas).
  async function baixarConferencia() {
    if (gerando) return;
    setGerando(true); setMsgExcel('');
    try {
      const r = await gerarConferenciaExcel();
      setMsgExcel(`✓ ${r.arquivo} baixado (${r.talhoes} talhões).`);
    } catch (e) {
      setMsgExcel(`Falha ao gerar: ${e instanceof Error ? e.message : 'erro inesperado'}`);
    } finally { setGerando(false); }
  }

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

      {/* Conferência do cadastro (Excel) — talhões, áreas e somas por
          fazenda/produtor/geral + aba de possíveis problemas (duplicidades). */}
      <PanelSection>
        <div className="px-4 py-3">
          <button onClick={() => void baixarConferencia()} disabled={gerando}
            className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: 'var(--invicta-green-dark)' }}>
            {gerando
              ? <><Loader2 size={13} className="animate-spin" /> Gerando planilha…</>
              : <><FileSpreadsheet size={13} /> Conferência do cadastro (Excel)</>}
          </button>
          <p className="text-[9px] mt-1" style={{ color: '#475569' }}>
            Talhões e áreas da safra atual, somas por fazenda/produtor/geral e aba de possíveis duplicidades.
          </p>
          {msgExcel && <p className="text-[10px] mt-1" style={{ color: msgExcel.startsWith('✓') ? '#86efac' : '#f87171' }}>{msgExcel}</p>}
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
