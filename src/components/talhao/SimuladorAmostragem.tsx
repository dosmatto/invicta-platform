'use client';

import { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { getPadroesAmostragem, getPadroesElementos, getSafras, PadraoAmostragem, PadraoElementos, ProfundidadeConfig } from '@/lib/store';
import { gerarGrid, anguloMaiorDimensao } from '@/lib/grid';
import { AlertTriangle, RotateCcw, Shuffle, Layers, MapPin } from 'lucide-react';

// PRNG simples para shuffle determinístico
function shuffleSeed<T>(arr: T[], seed: number): T[] {
  let a = seed >>> 0;
  const rng = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const r = [...arr];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

// Seleciona os índices que recebem uma profundidade parcial
function selecionar(n: number, percentual: number, modo: 'regular' | 'aleatorio', seed: number): Set<number> {
  if (percentual >= 100) return new Set(Array.from({ length: n }, (_, i) => i));
  const count = Math.max(1, Math.round((n * percentual) / 100));
  if (modo === 'regular') {
    const sel = new Set<number>();
    for (let k = 0; k < count; k++) sel.add(Math.floor(((k + 0.5) * n) / count));
    return sel;
  }
  return new Set(shuffleSeed(Array.from({ length: n }, (_, i) => i), seed).slice(0, count));
}

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;

export function SimuladorAmostragem() {
  const { nav, uploadedGeo, setPontosSimulados } = useApp();

  const padroes = useMemo(() => getPadroesAmostragem(), []);
  const padroesElem = useMemo<PadraoElementos[]>(() => getPadroesElementos(), []);
  const safraAtiva = useMemo(() => getSafras().find(s => s.ativa) ?? null, []);

  const [padraoId, setPadraoId] = useState('');
  const [epoca, setEpoca] = useState<'1' | '2'>('1');
  const [densidade, setDensidade] = useState(2);
  const [profs, setProfs] = useState<ProfundidadeConfig[]>([]);
  const [rotacaoAuto, setRotacaoAuto] = useState(true);
  const [rotacaoGraus, setRotacaoGraus] = useState(0);
  const [aleatoriedade, setAleatoriedade] = useState(0);
  const [distanciaBorda, setDistanciaBorda] = useState(50);
  const [modoSel, setModoSel] = useState<'regular' | 'aleatorio'>('regular');
  const [seedPos, setSeedPos] = useState(1);
  const [seedSel, setSeedSel] = useState(1);

  const padrao = padroes.find(p => p.id === padraoId) ?? null;

  // Ao escolher padrão, pré-popula densidade + profundidades
  useEffect(() => {
    if (!padrao) return;
    setDensidade(padrao.densidadeHaPonto);
    setProfs(padrao.profundidades.map(p => ({ ...p })));
  }, [padrao]);

  // Ângulo automático (recalcula quando geometria muda ou liga o auto)
  const anguloAuto = useMemo(() => uploadedGeo ? Math.round(anguloMaiorDimensao(uploadedGeo)) : 0, [uploadedGeo]);
  const rotacaoEfetiva = rotacaoAuto ? anguloAuto : rotacaoGraus;

  // Geração da grade + atribuição de profundidades (ao vivo)
  const resultado = useMemo(() => {
    if (!uploadedGeo) return null;
    const pts = gerarGrid({ geojson: uploadedGeo, densidadeHaPonto: densidade, distanciaBordaM: distanciaBorda, rotacaoGraus: rotacaoEfetiva, aleatoriedade, seed: seedPos });
    const n = pts.length;
    // conjuntos de seleção por profundidade
    const selecoes = profs.map(p => selecionar(n, p.percentual, modoSel, seedSel + p.rotulo.length));
    const features: GeoJSON.Feature[] = pts.map((pt, i) => {
      const profsDoPonto = profs.filter((_, pi) => selecoes[pi].has(i)).length;
      return { type: 'Feature', properties: { label: String(i + 1), profs: profsDoPonto }, geometry: { type: 'Point', coordinates: [pt.lng, pt.lat] } };
    });
    return { n, fc: { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection };
  }, [uploadedGeo, densidade, distanciaBorda, rotacaoEfetiva, aleatoriedade, seedPos, profs, modoSel, seedSel]);

  // Envia pontos ao mapa
  useEffect(() => {
    setPontosSimulados(resultado?.fc ?? null);
    return () => setPontosSimulados(null);
  }, [resultado, setPontosSimulados]);

  // Detecta customização
  const customizado = padrao ? (
    densidade !== padrao.densidadeHaPonto ||
    profs.some((p, i) => p.percentual !== padrao.profundidades[i]?.percentual)
  ) : false;

  function setProfPct(i: number, v: number) {
    setProfs(prev => prev.map((p, idx) => idx === i ? { ...p, percentual: v } : p));
  }
  const nomeElem = (id: string) => padroesElem.find(p => p.id === id)?.nome ?? '—';

  // ── Validações ──
  if (!uploadedGeo) {
    return (
      <div className="p-4">
        <Aviso titulo="Talhão sem limite geográfico" texto="Carregue a geometria do talhão (seção Limite Geográfico) para gerar pontos." />
      </div>
    );
  }
  if (!safraAtiva) {
    return (
      <div className="p-4">
        <Aviso titulo="Nenhuma safra ativa" texto="Defina uma safra ativa no topo do talhão antes de simular a amostragem." />
      </div>
    );
  }
  if (padroes.length === 0) {
    return (
      <div className="p-4">
        <Aviso titulo="Nenhum padrão de amostragem" texto="Cadastre um Padrão de Amostragem em Cadastros antes de simular." />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {/* Safra + Época */}
      <div className="flex items-center gap-2 text-[10px]" style={{ color: '#64748b' }}>
        <span>Safra <strong style={{ color: '#86efac' }}>{safraAtiva.nome}</strong></span>
        <span>·</span>
        <div className="flex gap-1">
          {(['1', '2'] as const).map(e => (
            <button key={e} onClick={() => setEpoca(e)}
              className="px-2 py-0.5 rounded font-semibold"
              style={{ background: epoca === e ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: epoca === e ? '#fff' : '#64748b' }}>
              {e}ª época
            </button>
          ))}
        </div>
      </div>
      <p className="text-[9px]" style={{ color: '#475569' }}>
        {epoca === '1' ? '1ª época: coletas até junho' : '2ª época: julho a dezembro'}
      </p>

      {/* Padrão de amostragem */}
      <div>
        <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Padrão de Amostragem</label>
        <select value={padraoId} onChange={e => setPadraoId(e.target.value)}
          className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
          <option value="">Selecione…</option>
          {padroes.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </div>

      {padrao && (
        <>
          {/* Densidade */}
          <div>
            <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>
              Densidade (ha / ponto) {densidade !== padrao.densidadeHaPonto && <span style={{ color: '#fbbf24' }}>• alterado</span>}
            </label>
            <input type="number" step="0.5" min="0.1" value={densidade}
              onChange={e => setDensidade(Number(e.target.value))}
              className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
          </div>

          {/* Distância da borda */}
          <div>
            <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Distância da borda (m)</label>
            <input type="number" step="5" min="0" value={distanciaBorda}
              onChange={e => setDistanciaBorda(Number(e.target.value))}
              className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
          </div>

          {/* Rotação */}
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-[10px] font-semibold" style={{ color: '#64748b' }}>Rotação: {rotacaoEfetiva}°</label>
              <button onClick={() => setRotacaoAuto(a => !a)}
                className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
                style={{ background: rotacaoAuto ? '#166534' : '#1a3a6b', color: rotacaoAuto ? '#86efac' : '#93c5fd' }}>
                {rotacaoAuto ? 'Auto (maior dimensão)' : 'Manual'}
              </button>
            </div>
            {!rotacaoAuto && (
              <input type="range" min="0" max="180" value={rotacaoGraus}
                onChange={e => setRotacaoGraus(Number(e.target.value))} className="w-full accent-blue-500" />
            )}
          </div>

          {/* Aleatoriedade */}
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-[10px] font-semibold" style={{ color: '#64748b' }}>
                Aleatoriedade: {aleatoriedade}% {aleatoriedade === 0 ? '(grid exato)' : ''}
              </label>
              {aleatoriedade > 0 && (
                <button onClick={() => setSeedPos(s => s + 1)} title="Refazer posições"
                  className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                  <RotateCcw size={9} /> Refazer
                </button>
              )}
            </div>
            <input type="range" min="0" max="100" value={aleatoriedade}
              onChange={e => setAleatoriedade(Number(e.target.value))} className="w-full accent-blue-500" />
          </div>

          {/* Profundidades */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-semibold flex items-center gap-1" style={{ color: '#64748b' }}>
                <Layers size={11} /> Profundidades
              </label>
              <div className="flex gap-1">
                {(['regular', 'aleatorio'] as const).map(m => (
                  <button key={m} onClick={() => setModoSel(m)}
                    className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
                    style={{ background: modoSel === m ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: modoSel === m ? '#fff' : '#64748b' }}>
                    {m === 'regular' ? 'Regular' : 'Aleatório'}
                  </button>
                ))}
                {modoSel === 'aleatorio' && (
                  <button onClick={() => setSeedSel(s => s + 1)} title="Refazer sorteio"
                    className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                    <Shuffle size={9} />
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-1">
              {profs.map((p, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                  <span className="text-xs font-bold" style={{ color: '#93c5fd', minWidth: '48px' }}>{p.rotulo}</span>
                  <input type="number" min="1" max="100" value={p.percentual}
                    onChange={e => setProfPct(i, Number(e.target.value))}
                    className="w-14 rounded px-1.5 py-0.5 text-xs outline-none" style={inputStyle} />
                  <span className="text-[10px]" style={{ color: '#64748b' }}>%</span>
                  <span className="text-[10px] truncate flex-1 text-right" style={{ color: '#64748b' }}>{nomeElem(p.padraoElementosId)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Resumo */}
          <div className="p-2.5 rounded-lg" style={{ background: '#0f2a1a', border: '1px solid #166534' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin size={14} style={{ color: '#86efac' }} />
                <span className="text-sm font-bold" style={{ color: '#86efac' }}>{resultado?.n ?? 0} pontos</span>
              </div>
              {customizado && (
                <span className="text-[9px] px-2 py-0.5 rounded-full font-bold" style={{ background: '#78350f', color: '#fde68a' }}>
                  CUSTOMIZADO
                </span>
              )}
            </div>
            {/* Legenda de cores */}
            <div className="flex items-center gap-3 mt-2 text-[9px]" style={{ color: '#94a3b8' }}>
              <span className="flex items-center gap-1"><Dot c="#f59e0b" /> 1 prof.</span>
              <span className="flex items-center gap-1"><Dot c="#3b82f6" /> 2 prof.</span>
              <span className="flex items-center gap-1"><Dot c="#a855f7" /> 3+ prof.</span>
            </div>
          </div>

          <p className="text-[9px] text-center" style={{ color: '#475569' }}>
            Ajuste os parâmetros e veja os pontos no mapa em tempo real. Finalizar/gerar QR — próxima etapa.
          </p>
        </>
      )}
    </div>
  );
}

function Dot({ c }: { c: string }) {
  return <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: c, border: '1px solid #fff' }} />;
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
      <AlertTriangle size={16} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-xs font-semibold" style={{ color: '#fbbf24' }}>{titulo}</p>
        <p className="text-[10px] mt-1" style={{ color: '#78350f' }}>{texto}</p>
      </div>
    </div>
  );
}
