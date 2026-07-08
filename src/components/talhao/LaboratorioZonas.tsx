'use client';

// Laboratório de Zonas (Condutividade C4.2 / MEAP) — bancada tela cheia para
// COMPARAR cenários de zoneamento já salvos: tabela com métricas + melhor
// destacado (menor CV médio) + concordância espacial entre dois cenários
// (spec §240 "Comparação de Zonas" e §290 "Visão Futura"). Não gera nada.

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, FlaskConical, Star, Award, Loader2 } from 'lucide-react';
import type { ZoneamentoMeap } from '@/lib/store';
import { resumoCenario, idMelhorCenario, concordanciaEspacial, areaPorPotencial, type Concordancia } from '@/lib/meap/laboratorio';
import { fmtMax1 as fmt } from '@/lib/formato';
const CORES_HOMOG: Record<string, string> = { alta: '#86efac', media: '#fbbf24', baixa: '#f87171' };
const ROTULO_HOMOG: Record<string, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };

function interpretarConcordancia(p: number): { txt: string; cor: string } {
  if (p >= 0.8) return { txt: 'muito parecidos', cor: '#86efac' };
  if (p >= 0.6) return { txt: 'parecidos', cor: '#a3e635' };
  if (p >= 0.4) return { txt: 'moderadamente diferentes', cor: '#fbbf24' };
  return { txt: 'divergentes', cor: '#f87171' };
}

function BarraPotencial({ areas }: { areas: ReturnType<typeof areaPorPotencial> }) {
  return (
    <div className="flex h-4 w-full rounded overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.12)' }}>
      {areas.map(a => (
        <div key={a.rank} title={`${a.classe}: ${fmt(a.areaHa)} ha (${fmt(a.perc * 100, 0)}%)`} style={{ width: `${a.perc * 100}%`, background: a.cor }} />
      ))}
    </div>
  );
}

export function LaboratorioZonas({ zoneamentos, onClose }: { zoneamentos: ZoneamentoMeap[]; onClose: () => void }) {
  const resumos = useMemo(() => zoneamentos.map(resumoCenario), [zoneamentos]);
  const melhorId = useMemo(() => idMelhorCenario(zoneamentos), [zoneamentos]);

  const [aId, setAId] = useState(zoneamentos[0]?.id ?? '');
  const [bId, setBId] = useState(zoneamentos[1]?.id ?? zoneamentos[0]?.id ?? '');
  const cenA = zoneamentos.find(z => z.id === aId) ?? null;
  const cenB = zoneamentos.find(z => z.id === bId) ?? null;
  const [conc, setConc] = useState<Concordancia | null>(null);
  const [calc, setCalc] = useState(false);

  function comparar() {
    if (!cenA || !cenB) return;
    setConc(null); setCalc(true);
    // deixa o spinner pintar antes do cálculo síncrono (amostragem por grade).
    setTimeout(() => {
      try { setConc(concordanciaEspacial(cenA.fc, cenB.fc)); }
      finally { setCalc(false); }
    }, 30);
  }

  const th = 'text-left font-semibold px-2 py-1.5 text-[10px]';
  const td = 'px-2 py-1.5 text-[11px]';

  const body = (
    <div className="fixed inset-0 z-[9998] flex flex-col" style={{ background: '#05101f', color: '#e2e8f0' }}>
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        <div className="flex items-center gap-2">
          <FlaskConical size={18} style={{ color: '#93c5fd' }} />
          <span className="font-bold">Laboratório de Zonas</span>
          <span className="text-[11px]" style={{ color: '#64748b' }}>· {zoneamentos.length} {zoneamentos.length === 1 ? 'cenário' : 'cenários'}</span>
        </div>
        <button onClick={onClose} title="Fechar" className="p-1.5 rounded" style={{ background: '#1a3a6b', color: '#cbd5e1' }}><X size={16} /></button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-5">
        {/* Tabela de cenários */}
        <section>
          <h3 className="text-[13px] font-bold mb-1" style={{ color: '#cbd5e1' }}>Cenários salvos</h3>
          <p className="text-[10px] mb-2" style={{ color: '#64748b' }}>
            Cada linha é um zoneamento gerado. O <span style={{ color: '#fbbf24' }}>★ melhor</span> é o de menor CV médio — zonas mais homogêneas por dentro, o que costuma representar melhor a realidade do talhão.
          </p>
          <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid #1a3a6b' }}>
            <table className="w-full border-collapse" style={{ minWidth: 760 }}>
              <thead>
                <tr style={{ background: '#0a1a2f', color: '#93c5fd' }}>
                  <th className={th}>Cenário</th>
                  <th className={th}>Variáveis</th>
                  <th className={th}>Pesos</th>
                  <th className={th}>Método</th>
                  <th className={th}>Zonas</th>
                  <th className={th}>Polígonos</th>
                  <th className={th}>Área média/zona</th>
                  <th className={th}>CV médio</th>
                  <th className={th}>Homogeneidade</th>
                </tr>
              </thead>
              <tbody>
                {resumos.map(r => {
                  const melhor = r.id === melhorId;
                  return (
                    <tr key={r.id} style={{ background: melhor ? '#0f2a1a' : 'transparent', borderTop: '1px solid #12294a' }}>
                      <td className={td}>
                        <div className="flex items-center gap-1.5">
                          {r.padrao && <Star size={12} style={{ color: '#fbbf24' }} fill="#fbbf24" />}
                          {melhor && <Award size={12} style={{ color: '#fbbf24' }} />}
                          <span className="font-semibold">{r.nome}</span>
                        </div>
                      </td>
                      <td className={td} style={{ color: '#cbd5e1', maxWidth: 200 }}>{r.camadasTxt || '—'}</td>
                      <td className={td} style={{ color: '#94a3b8' }}>{r.pesosTxt || '—'}</td>
                      <td className={td} style={{ color: '#94a3b8' }}>{r.algoritmo?.toUpperCase()}</td>
                      <td className={td}>{r.nZonas}</td>
                      <td className={td}>{r.nPoligonos}</td>
                      <td className={td}>{fmt(r.areaMediaZonaHa)} ha</td>
                      <td className={td}>{r.cvMedio != null ? `${fmt(r.cvMedio)}%` : '—'}</td>
                      <td className={td}>
                        {r.homogeneidade
                          ? <span style={{ color: CORES_HOMOG[r.homogeneidade] }}>{ROTULO_HOMOG[r.homogeneidade]}</span>
                          : <span style={{ color: '#64748b' }}>sem lab</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Concordância A×B */}
        {zoneamentos.length >= 2 && (
          <section>
            <h3 className="text-[13px] font-bold mb-1" style={{ color: '#cbd5e1' }}>Comparar dois cenários</h3>
            <p className="text-[10px] mb-2" style={{ color: '#64748b' }}>
              Concordância espacial = % da área onde os dois cenários colocam o potencial no mesmo terço (alto/médio/baixo). Serve p/ comparar, por ex., Zona só-EC × Multivariável (spec §240).
            </p>
            <div className="flex flex-wrap items-end gap-3 mb-3">
              <label className="text-[11px]">
                <span className="block mb-0.5" style={{ color: '#64748b' }}>Cenário A</span>
                <select value={aId} onChange={e => { setAId(e.target.value); setConc(null); }} className="rounded px-2 py-1 text-[11px] outline-none" style={{ background: '#1a3a6b', border: '1px solid #2e5fa3', color: '#e2e8f0' }}>
                  {zoneamentos.map(z => <option key={z.id} value={z.id}>{z.nome}</option>)}
                </select>
              </label>
              <label className="text-[11px]">
                <span className="block mb-0.5" style={{ color: '#64748b' }}>Cenário B</span>
                <select value={bId} onChange={e => { setBId(e.target.value); setConc(null); }} className="rounded px-2 py-1 text-[11px] outline-none" style={{ background: '#1a3a6b', border: '1px solid #2e5fa3', color: '#e2e8f0' }}>
                  {zoneamentos.map(z => <option key={z.id} value={z.id}>{z.nome}</option>)}
                </select>
              </label>
              <button onClick={comparar} disabled={calc || aId === bId} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-semibold disabled:opacity-50" style={{ background: '#1e40af', color: '#fff' }}>
                {calc ? <><Loader2 size={13} className="animate-spin" /> Calculando…</> : 'Comparar'}
              </button>
              {aId === bId && <span className="text-[10px]" style={{ color: '#fbbf24' }}>escolha dois cenários diferentes</span>}
            </div>

            {conc && (() => {
              const it = interpretarConcordancia(conc.concordancia);
              return (
                <div className="rounded-lg p-3" style={{ background: '#0a1a2f', border: '1px solid #1a3a6b' }}>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold" style={{ color: it.cor }}>{fmt(conc.concordancia * 100, 0)}%</span>
                    <span className="text-[12px]" style={{ color: it.cor }}>de concordância — {it.txt}</span>
                    <span className="text-[10px] ml-auto" style={{ color: '#64748b' }}>{conc.n.toLocaleString('pt-BR')} pontos amostrados</span>
                  </div>
                  <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: '70px 1fr' }}>
                    <span className="text-[10px] self-center" style={{ color: '#94a3b8' }}>{cenA?.nome}</span>
                    <BarraPotencial areas={areaPorPotencial(cenA!.fc)} />
                    <span className="text-[10px] self-center" style={{ color: '#94a3b8' }}>{cenB?.nome}</span>
                    <BarraPotencial areas={areaPorPotencial(cenB!.fc)} />
                  </div>
                  <p className="text-[9px] mt-2" style={{ color: '#64748b' }}>Barras = área por classe de potencial (alto→baixo) de cada cenário.</p>
                </div>
              );
            })()}
          </section>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(body, document.body) : null;
}
