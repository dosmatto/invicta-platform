'use client';

// Dashboard — visão geral com DADOS REAIS do cadastro (antes era mock zerado,
// o que fazia o Início mostrar "0 Produtores" com a base cheia).

import { useMemo, useState } from 'react';
import { FileSpreadsheet, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { PanelSection, PanelKpi } from './_shared';
import { getClientes, getFazendas, getTalhoes, getSafras, analisarTalhoesDuplicados, aplicarDedupTalhoesExatos, analisarFazendasOrfas, aplicarRemocaoFazendasOrfas } from '@/lib/store';
import { cloudExcluirMapasPorPrefixo, cloudExcluirPorPrefixo } from '@/lib/cloud';
import { pode } from '@/lib/empresa';
import { rotuloAno } from '@/lib/periodo';
import { gerarConferenciaExcel } from '@/lib/relatorioConferencia';
import { fmtHa } from '@/lib/formato';

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

  // Limpeza do cadastro (owner/admin): contagens + ações com confirmação.
  const [confDup, setConfDup] = useState(false);
  const [confOrf, setConfOrf] = useState(false);
  const [limpando, setLimpando] = useState(false);
  const [msgLimp, setMsgLimp] = useState('');
  const limpeza = useMemo(() => {
    const { exatos, revisar } = analisarTalhoesDuplicados();
    const orfas = analisarFazendasOrfas();
    return {
      dupRemover: exatos.reduce((s, g) => s + g.remover.length, 0),
      dupRevisar: revisar.length,
      orfas: orfas.length,
      orfasTalhoes: orfas.reduce((s, o) => s + o.talhoes, 0),
    };
  }, []);

  async function limparDuplicados() {
    if (!confDup) { setConfDup(true); setTimeout(() => setConfDup(false), 4000); return; }
    setConfDup(false); setLimpando(true); setMsgLimp('');
    try {
      const ids = aplicarDedupTalhoesExatos();
      for (const tid of ids) { await cloudExcluirMapasPorPrefixo(`${tid}__`).catch(() => {}); await cloudExcluirMapasPorPrefixo(`dose20__${tid}__`).catch(() => {}); await cloudExcluirPorPrefixo('inv_cenarios', `cen_${tid}_`).catch(() => {}); }
      setMsgLimp(`✓ ${ids.length} talhões duplicados removidos. Recarregando…`);
      setTimeout(() => window.location.reload(), 900);
    } catch (e) { setMsgLimp('Falha: ' + (e instanceof Error ? e.message : 'erro')); setLimpando(false); }
  }

  async function limparOrfas() {
    if (!confOrf) { setConfOrf(true); setTimeout(() => setConfOrf(false), 4000); return; }
    setConfOrf(false); setLimpando(true); setMsgLimp('');
    try {
      const { fazendas, talhaoIds } = aplicarRemocaoFazendasOrfas();
      for (const tid of talhaoIds) { await cloudExcluirMapasPorPrefixo(`${tid}__`).catch(() => {}); await cloudExcluirMapasPorPrefixo(`dose20__${tid}__`).catch(() => {}); await cloudExcluirPorPrefixo('inv_cenarios', `cen_${tid}_`).catch(() => {}); }
      setMsgLimp(`✓ ${fazendas} fazenda(s) órfã(s) + ${talhaoIds.length} talhão(ões) removidos. Recarregando…`);
      setTimeout(() => window.location.reload(), 900);
    } catch (e) { setMsgLimp('Falha: ' + (e instanceof Error ? e.message : 'erro')); setLimpando(false); }
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
          <PanelKpi label="Área Total (ha)" value={fmtHa(kpis.areaTotal)} color="#fde68a" />
          <div className="w-px" style={{ background: '#1a3a6b' }} />
          <PanelKpi label="Ano Atual" value={rotuloAno(kpis.safraAtual)} color="#fff" />
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
            Talhões e áreas do ano atual, somas por fazenda/produtor/geral e aba de possíveis duplicidades.
          </p>
          {msgExcel && <p className="text-[10px] mt-1" style={{ color: msgExcel.startsWith('✓') ? '#86efac' : '#f87171' }}>{msgExcel}</p>}
        </div>
      </PanelSection>

      {/* Limpeza do cadastro — remover duplicados/órfãos (owner/admin). */}
      {pode('excluirProdutor') && (limpeza.dupRemover > 0 || limpeza.orfas > 0 || limpeza.dupRevisar > 0) && (
        <PanelSection>
          <div className="px-4 py-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#94a3b8' }}>Limpeza do cadastro</p>

            {limpeza.dupRemover > 0 && (
              <button onClick={() => void limparDuplicados()} disabled={limpando}
                className="w-full py-2 rounded text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: confDup ? '#3a1010' : '#2a1e4d', color: confDup ? '#fca5a5' : '#c4b5fd', border: `1px solid ${confDup ? '#7f1d1d' : '#3a2f66'}` }}>
                {limpando ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                {confDup ? `Confirmar: remover ${limpeza.dupRemover} talhões duplicados?` : `Remover ${limpeza.dupRemover} talhões duplicados (cópia exata)`}
              </button>
            )}
            {limpeza.dupRevisar > 0 && (
              <p className="text-[9px] flex items-start gap-1" style={{ color: '#fbbf24' }}>
                <AlertTriangle size={10} className="flex-shrink-0 mt-[1px]" /> {limpeza.dupRevisar} grupo(s) de mesmo nome com ÁREA DIFERENTE não são removidos (pode ser talhão distinto) — veja a aba "Problemas" do Excel.
              </p>
            )}

            {limpeza.orfas > 0 && (
              <button onClick={() => void limparOrfas()} disabled={limpando}
                className="w-full py-2 rounded text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: confOrf ? '#3a1010' : '#1a3a6b', color: confOrf ? '#fca5a5' : '#93c5fd', border: `1px solid ${confOrf ? '#7f1d1d' : '#2e5fa3'}` }}>
                {limpando ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                {confOrf ? `Confirmar: remover ${limpeza.orfas} fazendas órfãs (+${limpeza.orfasTalhoes} talhões)?` : `Remover ${limpeza.orfas} fazendas órfãs (sem produtor)`}
              </button>
            )}

            {msgLimp && <p className="text-[10px]" style={{ color: msgLimp.startsWith('✓') ? '#86efac' : '#f87171' }}>{msgLimp}</p>}
            <p className="text-[9px]" style={{ color: '#475569' }}>Só remove cópias idênticas e órfãos; mantém a cópia com dados. Ação em 2 cliques.</p>
          </div>
        </PanelSection>
      )}

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
