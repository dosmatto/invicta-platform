'use client';

// "O que explica a produtividade?" — tela cheia. Correlaciona a camada-alvo
// (Produtividade, por padrão) com TODAS as demais camadas do talhão e ranqueia
// os fatores por |r|, com insight automático e scatter do fator selecionado.
// É a peça-diferencial (análise cruzada das Camadas Oficiais → MIA).

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useApp } from '@/context/AppContext';
import {
  listarCamadas, matrizFatores, insightFatores, correlacao,
  type CamadaComparavel, type Fator,
} from '@/lib/comparador';
import { X, Loader2, Brain } from 'lucide-react';

const fmt = (v: number, d = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const forca = (r: number) => (Math.abs(r) >= 0.5 ? 'forte' : Math.abs(r) >= 0.3 ? 'moderada' : 'fraca');
const corR = (r: number) => (r >= 0 ? '#86efac' : '#f87171');

export function MatrizFatores({ safraNome, onClose }: { safraNome: string; onClose: () => void }) {
  const { nav } = useApp();
  const [camadas, setCamadas] = useState<CamadaComparavel[]>([]);
  const [alvoId, setAlvoId] = useState('');
  const [selId, setSelId] = useState('');
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    (async () => {
      const cs = nav.talhaoId ? await listarCamadas(nav.talhaoId, safraNome) : [];
      if (!vivo) return;
      setCamadas(cs);
      setAlvoId(cs.find(c => c.grupo === 'Produtividade')?.id ?? cs[0]?.id ?? '');
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [nav.talhaoId, safraNome]);

  const alvo = useMemo(() => camadas.find(c => c.id === alvoId) ?? null, [camadas, alvoId]);
  const fatores = useMemo(() => (alvo ? matrizFatores(alvo, camadas) : []), [alvo, camadas]);
  const insight = useMemo(() => (alvo ? insightFatores(alvo.grupo, fatores) : ''), [alvo, fatores]);
  const sel = useMemo(() => fatores.find(f => f.id === selId) ?? fatores[0] ?? null, [fatores, selId]);
  const scatter = useMemo(() => {
    const cam = sel ? camadas.find(c => c.id === sel.id) : null;
    return alvo && cam ? correlacao(alvo.grid, cam.grid) : null;
  }, [alvo, sel, camadas]);
  const camSel = sel ? camadas.find(c => c.id === sel.id) ?? null : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#04101f' }}>
      <div className="flex items-center justify-between px-4 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        <p className="text-sm font-bold flex items-center gap-2" style={{ color: '#e2e8f0' }}>
          <Brain size={16} style={{ color: '#a78bfa' }} /> O que explica {alvo ? alvo.grupo.toLowerCase() : 'a camada'}?
          <span className="text-[11px] font-normal" style={{ color: '#64748b' }}>{nav.talhao} · {safraNome}</span>
        </p>
        <div className="flex items-center gap-2">
          <select value={alvoId} onChange={e => setAlvoId(e.target.value)} className="rounded px-2 py-1 text-[11px] outline-none" style={{ background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' }}>
            {camadas.map(c => <option key={c.id} value={c.id}>Alvo: {c.grupo} — {c.nome}</option>)}
          </select>
          <button onClick={onClose} className="p-1.5 rounded" style={{ color: '#93c5fd' }}><X size={18} /></button>
        </div>
      </div>

      {carregando ? (
        <div className="flex-1 flex items-center justify-center"><p className="text-xs flex items-center gap-2" style={{ color: '#64748b' }}><Loader2 size={14} className="animate-spin" /> Calculando correlações…</p></div>
      ) : !alvo || camadas.length < 2 ? (
        <div className="flex-1 flex items-center justify-center px-8 text-center"><p className="text-xs" style={{ color: '#fbbf24' }}>Precisa de um Mapa de Produtividade salvo + outras camadas (NDVI, Fertilidade) para analisar os fatores.</p></div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Insight */}
          <div className="rounded-lg p-3 flex items-start gap-2" style={{ background: '#160f2e', border: '1px solid #4c1d95' }}>
            <Brain size={15} style={{ color: '#a78bfa' }} className="flex-shrink-0 mt-0.5" />
            <p className="text-[12px]" style={{ color: '#e9d5ff' }}>{insight}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Ranking de fatores */}
            <div className="rounded-lg p-3" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
              <p className="text-[11px] font-semibold mb-2" style={{ color: '#93c5fd' }}>Fatores ranqueados (correlação com {alvo.grupo.toLowerCase()})</p>
              {fatores.length === 0 ? (
                <p className="text-[10px]" style={{ color: '#64748b' }}>Sem outras camadas co-registráveis para correlacionar.</p>
              ) : (
                <div className="space-y-1.5">
                  {fatores.map(f => (
                    <button key={f.id} onClick={() => setSelId(f.id)} className="w-full text-left"
                      style={{ opacity: sel?.id === f.id ? 1 : 0.92 }}>
                      <div className="flex items-center justify-between text-[10px] mb-0.5">
                        <span style={{ color: sel?.id === f.id ? '#fff' : '#cbd5e1', fontWeight: sel?.id === f.id ? 700 : 500 }}>
                          {f.nome} <span style={{ color: '#475569' }}>· {f.grupo}</span>
                        </span>
                        <span style={{ color: corR(f.r), fontWeight: 700 }}>{f.r >= 0 ? '+' : ''}{fmt(f.r)} <span style={{ color: '#64748b', fontWeight: 400 }}>{forca(f.r)}</span></span>
                      </div>
                      <BarraR r={f.r} ativo={sel?.id === f.id} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Scatter do fator selecionado */}
            <div className="rounded-lg p-3" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
              {sel && camSel ? (
                <>
                  <p className="text-[11px] font-semibold mb-1" style={{ color: '#93c5fd' }}>{alvo.grupo} × {camSel.nome}</p>
                  <p className="text-[9px] mb-2" style={{ color: '#64748b' }}>cada ponto = um pixel co-registrado · r = <strong style={{ color: corR(sel.r) }}>{f0(sel.r)}</strong> ({forca(sel.r)})</p>
                  {scatter && scatter.amostra.length > 1
                    ? <ScatterGrande amostra={scatter.amostra} eixoX={camSel.nome} eixoY={alvo.grupo} />
                    : <p className="text-[10px]" style={{ color: '#64748b' }}>Sem pixels suficientes.</p>}
                </>
              ) : <p className="text-[10px]" style={{ color: '#64748b' }}>Clique num fator para ver o gráfico.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const f0 = (r: number) => (r >= 0 ? '+' : '') + r.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function BarraR({ r, ativo }: { r: number; ativo: boolean }) {
  const pct = Math.min(50, Math.abs(r) * 50);
  return (
    <div className="relative h-2 rounded" style={{ background: '#0b1f3a', border: ativo ? '1px solid #60a5fa' : '1px solid #1a3a6b' }}>
      <div className="absolute top-0 bottom-0" style={{ left: '50%', width: 1, background: '#334155' }} />
      <div className="absolute top-0 bottom-0 rounded" style={{ background: corR(r), [r >= 0 ? 'left' : 'right']: '50%', width: `${pct}%` } as CSSProperties} />
    </div>
  );
}

function ScatterGrande({ amostra, eixoX, eixoY }: { amostra: { a: number; b: number }[]; eixoX: string; eixoY: string }) {
  const W = 320, H = 220, m = 26;
  const ax = amostra.map(d => d.b), ay = amostra.map(d => d.a); // x = fator (b), y = alvo (a)
  const xmin = Math.min(...ax), xmax = Math.max(...ax), ymin = Math.min(...ay), ymax = Math.max(...ay);
  const px = (x: number) => m + ((x - xmin) / ((xmax - xmin) || 1)) * (W - m - 6);
  const py = (y: number) => H - m - ((y - ymin) / ((ymax - ymin) || 1)) * (H - m - 6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ background: '#0a1929', borderRadius: 4 }}>
      <line x1={m} y1={6} x2={m} y2={H - m} stroke="#334155" strokeWidth="1" />
      <line x1={m} y1={H - m} x2={W - 6} y2={H - m} stroke="#334155" strokeWidth="1" />
      {amostra.map((d, i) => <circle key={i} cx={px(d.b)} cy={py(d.a)} r={1.6} fill="#86efac" opacity={0.6} />)}
      <text x={(W + m) / 2} y={H - 4} fontSize="8" fill="#64748b" textAnchor="middle">{eixoX}</text>
      <text x={8} y={H / 2} fontSize="8" fill="#64748b" textAnchor="middle" transform={`rotate(-90 8 ${H / 2})`}>{eixoY}</text>
    </svg>
  );
}
