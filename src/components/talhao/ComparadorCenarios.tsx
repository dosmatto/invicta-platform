'use client';

// Comparador de Cenários (Fase R4 / C1). Overlay em tela cheia: 2–3 cenários
// salvos lado a lado. Como cada cenário pode ter vários produtos, escolhe-se UM
// produto e as colunas mostram o mapa de dose DAQUELE produto, todas coloridas
// com a MESMA legenda (estilo de referência) → escala/unidade/classes únicas.
// Comparação financeira por cenário (destaque do mais barato).

import { useMemo, useState } from 'react';
import { colorirDose } from '@/lib/raster';
import type { Cenario } from '@/lib/recomendacao/cenarios';
import { X, Star } from 'lucide-react';

const fmt = (v: number, dec = 0) => v.toLocaleString('pt-BR', { maximumFractionDigits: dec, minimumFractionDigits: dec });

export function ComparadorCenarios({ cenarios, onClose }: { cenarios: Cenario[]; onClose: () => void }) {
  const produtos = useMemo(() => {
    const set: string[] = [];
    for (const c of cenarios) for (const d of c.doses) { const k = d.produto || d.nomeEquacao; if (!set.includes(k)) set.push(k); }
    return set;
  }, [cenarios]);
  const [produto, setProduto] = useState(produtos[0] ?? '');

  // dose de referência (1º cenário que tem o produto) → estilo/legenda única.
  const ref = useMemo(() => {
    for (const c of cenarios) { const d = c.doses.find(x => (x.produto || x.nomeEquacao) === produto); if (d) return d; }
    return null;
  }, [cenarios, produto]);

  const colunas = useMemo(() => cenarios.map(c => {
    const dose = c.doses.find(x => (x.produto || x.nomeEquacao) === produto) ?? null;
    let url = '';
    if (dose && ref) { try { url = colorirDose(dose.grid, ref.estilo).dataUrl; } catch { /* ignora */ } }
    return { cen: c, dose, url };
  }), [cenarios, produto, ref]);

  const maisBaratoId = useMemo(() => {
    let id = ''; let min = Infinity;
    for (const c of cenarios) if (c.financeiro.custoTotal < min) { min = c.financeiro.custoTotal; id = c.id; }
    return id;
  }, [cenarios]);

  const classes = ref ? [...ref.estilo.classes].sort((a, b) => a.limiteSuperior - b.limiteSuperior) : [];

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(3,12,24,0.97)' }}>
      <div className="flex items-center gap-3 px-4 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        <span className="text-sm font-bold" style={{ color: '#e2e8f0' }}>Comparador de Cenários</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px]" style={{ color: '#94a3b8' }}>Produto:</span>
          <select value={produto} onChange={e => setProduto(e.target.value)} className="rounded px-2 py-1 text-[11px] outline-none"
            style={{ background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' }}>
            {produtos.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <button onClick={onClose} className="ml-auto p-1.5 rounded hover:bg-white/10" style={{ color: '#cbd5e1' }}><X size={16} /></button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="flex gap-3 h-full" style={{ minHeight: 0 }}>
          {colunas.map(({ cen, dose, url }) => {
            const barato = cen.id === maisBaratoId;
            return (
              <div key={cen.id} className="flex-1 flex flex-col rounded-lg overflow-hidden" style={{ background: '#061525', border: barato ? '2px solid var(--invicta-green)' : '1px solid #1a3a6b' }}>
                <div className="px-3 py-2 flex items-center gap-1.5" style={{ borderBottom: '1px solid #1a3a6b' }}>
                  <div className="text-[12px] font-bold truncate flex-1" style={{ color: '#e2e8f0' }}>{cen.nome}</div>
                  {barato && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5" style={{ background: 'var(--invicta-green-dark)', color: '#fff' }}><Star size={9} /> mais barato</span>}
                </div>

                {/* mapa do produto */}
                <div className="flex items-center justify-center p-2" style={{ background: '#0b1f38', minHeight: 220, flex: 1 }}>
                  {url
                    ? <img src={url} alt={produto} style={{ maxWidth: '100%', maxHeight: '46vh', objectFit: 'contain', imageRendering: 'auto' }} />
                    : <span className="text-[10px]" style={{ color: '#64748b' }}>Sem “{produto}” neste cenário</span>}
                </div>

                {/* números */}
                <div className="px-3 py-2 space-y-1 text-[11px]" style={{ color: '#cbd5e1', borderTop: '1px solid #1a3a6b' }}>
                  {dose && (
                    <div className="flex justify-between"><span style={{ color: '#94a3b8' }}>Dose média</span><span>{fmt(dose.stats.media)} {dose.unidade}</span></div>
                  )}
                  {dose && (
                    <div className="flex justify-between"><span style={{ color: '#94a3b8' }}>{produto}</span><span>{fmt(dose.toneladas, 1)} t{dose.custo != null ? ` · R$ ${fmt(dose.custo, 2)}` : ''}</span></div>
                  )}
                  <div className="flex justify-between pt-1" style={{ borderTop: '1px dashed #1a3a6b' }}>
                    <span style={{ color: '#94a3b8' }}>Custo total</span>
                    <span className="font-bold" style={{ color: barato ? '#4ade80' : '#e2e8f0' }}>R$ {fmt(cen.financeiro.custoTotal, 2)}</span>
                  </div>
                  <div className="flex justify-between"><span style={{ color: '#94a3b8' }}>Custo / ha</span><span>R$ {fmt(cen.financeiro.custoHa, 2)}</span></div>
                  <div className="flex justify-between"><span style={{ color: '#94a3b8' }}>Produtos</span><span>{cen.doses.length}</span></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* legenda única */}
      {classes.length > 0 && (
        <div className="px-4 py-2 flex items-center gap-3 flex-wrap flex-shrink-0" style={{ borderTop: '1px solid #1a3a6b' }}>
          <span className="text-[10px] font-semibold" style={{ color: '#94a3b8' }}>Legenda · {produto} {ref?.unidade ? `(${ref.unidade})` : ''}</span>
          {classes.map((c, i) => {
            const inf = i === 0 ? (ref?.estilo.valorMinimo ?? 0) : classes[i - 1].limiteSuperior;
            return (
              <span key={i} className="flex items-center gap-1 text-[9px]" style={{ color: '#cbd5e1' }}>
                <span className="w-4 h-3 rounded" style={{ background: c.cor, border: '1px solid #2e5fa3' }} />
                {fmt(inf)}–{fmt(c.limiteSuperior)}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
