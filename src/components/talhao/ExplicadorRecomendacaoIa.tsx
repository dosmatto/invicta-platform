'use client';

// IA F3 — Explicador de Recomendação (§18). Recebe os dados da recomendação
// (doses por produto + custo + cultura) e pede à IA uma explicação técnica +
// para o produtor + justificativa das maiores/menores doses + inconsistências.
// A IA NÃO altera as doses — só explica.

import { useState } from 'react';
import { explicarRecomendacao, type ExplicacaoReco } from '@/lib/ia';
import { Sparkles, Loader2, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

const COR_CONF: Record<string, string> = { alto: '#86efac', medio: '#fbbf24', baixo: '#f87171' };

export function ExplicadorRecomendacaoIa({ dados }: { dados: Record<string, unknown> }) {
  const [exp, setExp] = useState<ExplicacaoReco | null>(null);
  const [custo, setCusto] = useState<number | undefined>(undefined);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(true);

  async function explicar() {
    if (carregando) return;
    setCarregando(true); setErro('');
    try {
      const { resposta, custoEstimado } = await explicarRecomendacao(dados);
      setExp(resposta); setCusto(custoEstimado); setAberto(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao explicar.');
    } finally { setCarregando(false); }
  }

  return (
    <div className="rounded-lg p-2.5 space-y-1.5" style={{ background: '#0a1929', border: '1px solid #2a2350' }}>
      <div className="flex items-center gap-1.5">
        <Sparkles size={12} style={{ color: '#c084fc' }} />
        <span className="text-[10px] font-bold uppercase tracking-wider flex-1" style={{ color: '#cbd5e1' }}>Explicar com IA</span>
        {exp && <button onClick={() => setAberto(a => !a)} style={{ color: '#64748b' }}>{aberto ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</button>}
      </div>

      {!exp ? (
        <button onClick={() => void explicar()} disabled={carregando}
          className="w-full py-1.5 rounded text-[11px] font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-60" style={{ background: '#7c3aed' }}>
          {carregando ? <><Loader2 size={12} className="animate-spin" /> Explicando…</> : <><Sparkles size={12} /> Explicar esta recomendação</>}
        </button>
      ) : aberto && (
        <div className="space-y-1.5 text-[10px] leading-relaxed" style={{ color: '#cbd5e1' }}>
          <div><span className="font-bold text-[9px] uppercase" style={{ color: '#93c5fd' }}>Técnico</span><p>{exp.explicacao_tecnica}</p></div>
          <div><span className="font-bold text-[9px] uppercase" style={{ color: '#93c5fd' }}>Para o produtor</span><p>{exp.explicacao_produtor}</p></div>
          <div><span className="font-bold text-[9px] uppercase" style={{ color: '#86efac' }}>Maiores doses</span><p>{exp.justificativa_maiores_doses}</p></div>
          <div><span className="font-bold text-[9px] uppercase" style={{ color: '#fbbf24' }}>Menores doses</span><p>{exp.justificativa_menores_doses}</p></div>
          {exp.inconsistencias.length > 0 && (
            <div><span className="font-bold text-[9px] uppercase" style={{ color: '#f87171' }}>Inconsistências</span>{exp.inconsistencias.map((x, i) => <p key={i}>• {x}</p>)}</div>
          )}
          <div className="flex items-center gap-2 pt-0.5">
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: '#0f2240', color: COR_CONF[exp.nivel_de_confianca] }}>Confiança: {exp.nivel_de_confianca}</span>
            {custo != null && <span className="text-[8px]" style={{ color: '#475569' }}>US$ {custo.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 4 })}</span>}
            <button onClick={() => void explicar()} disabled={carregando} className="ml-auto text-[9px]" style={{ color: '#93c5fd' }}>{carregando ? 'explicando…' : 'refazer'}</button>
          </div>
          <p className="text-[8px]" style={{ color: '#475569' }}>A IA explica a recomendação; ela não altera as doses.</p>
        </div>
      )}
      {erro && <p className="text-[10px] flex items-start gap-1" style={{ color: '#f87171' }}><AlertTriangle size={11} className="flex-shrink-0 mt-[1px]" /> {erro}</p>}
    </div>
  );
}
