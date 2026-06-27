'use client';

// Módulo "Zonas de Manejo" (MEAP) — aba dedicada da página do talhão.
// M1: zonas adotadas (importadas) + homogeneidade interna (CV) por zona.
// M2 Fatia 1: gerar zonas por SIMILARIDADE — clusteriza (k-means/FCM) os mapas
// JÁ interpolados das camadas escolhidas; índices FPI/NCE sugerem o nº de zonas.
// Preview no mapa (não persiste). Convergência "—" até a 2ª versão (M3).

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import type { Talhao } from '@/lib/store';
import { obterOuAdotarAmbiente } from '@/lib/meap/adocao';
import { carregarCamadas, gerarMulti, type CamadasCarregadas } from '@/lib/meap/gerar';
import { extrairPoligono, type RespZonarMulti } from '@/lib/fertilidade';
import { classeZona } from '@/lib/zonas';
import { simboloElemento } from '@/lib/lab';
import type { AmbienteProdutivo, Homogeneidade } from '@/lib/meap/tipos';
import { Layers, AlertTriangle, Wand2, Loader2, X, Check } from 'lucide-react';

const HOMOG: Record<Homogeneidade, { label: string; cor: string; bg: string }> = {
  alta: { label: 'Homogênea', cor: '#86efac', bg: '#0f2a1a' },
  media: { label: 'Média', cor: '#fbbf24', bg: '#2d1a00' },
  baixa: { label: 'Heterogênea', cor: '#f87171', bg: '#2a0f12' },
};

const ESTADO: Record<AmbienteProdutivo['estado'], string> = {
  'em-formacao': 'Em formação', 'em-consolidacao': 'Em consolidação', 'consolidada': 'Consolidada',
};

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;

function parseImportadas(zonasGeojson?: string): GeoJSON.FeatureCollection | null {
  if (!zonasGeojson) return null;
  try { const fc = JSON.parse(zonasGeojson) as GeoJSON.FeatureCollection; return fc.features?.length ? fc : null; } catch { return null; }
}

function featuresParaMapa(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fc.features
      .filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
      .map(f => {
        const p = (f.properties ?? {}) as { id?: string; classe?: string };
        const cz = classeZona(p.classe ?? '');
        return { type: 'Feature' as const, properties: { cor: cz.cor, rotulo: String(p.id ?? '?'), classeLabel: cz.label, selecionada: false }, geometry: f.geometry! };
      }),
  };
}

// Gráfico FPI/NCE: dois índices por nº de zonas (mínimo = nº ótimo).
function IndicesChart({ indices, sugestao }: { indices: { c: number; fpi: number; nce: number }[]; sugestao: number | null }) {
  if (indices.length < 2) return null;
  const W = 240, H = 120, x0 = 28, x1 = 232, y0 = 12, y1 = 92;
  const cs = indices.map(d => d.c);
  const vals = indices.flatMap(d => [d.fpi, d.nce]);
  const vmin = Math.min(...vals), vmax = Math.max(...vals);
  const rng = vmax - vmin || 1;
  const px = (i: number) => x0 + (x1 - x0) * (indices.length === 1 ? 0.5 : i / (indices.length - 1));
  const py = (v: number) => y1 - (y1 - y0) * ((v - vmin) / rng);
  const linha = (key: 'fpi' | 'nce') => indices.map((d, i) => `${px(i)},${py(d[key])}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {sugestao != null && cs.includes(sugestao) && (
        <line x1={px(cs.indexOf(sugestao))} x2={px(cs.indexOf(sugestao))} y1={y0} y2={y1} stroke="#5b21b6" strokeWidth="6" opacity="0.35" />
      )}
      <polyline points={linha('fpi')} fill="none" stroke="#22d3ee" strokeWidth="1.5" />
      <polyline points={linha('nce')} fill="none" stroke="#fbbf24" strokeWidth="1.5" />
      {indices.map((d, i) => (
        <g key={d.c}>
          <circle cx={px(i)} cy={py(d.fpi)} r="2" fill="#22d3ee" />
          <circle cx={px(i)} cy={py(d.nce)} r="2" fill="#fbbf24" />
          <text x={px(i)} y={H - 12} fontSize="9" fill="#64748b" textAnchor="middle">{d.c}</text>
        </g>
      ))}
      <text x={x0} y={H - 1} fontSize="8" fill="#22d3ee">FPI</text>
      <text x={x0 + 26} y={H - 1} fontSize="8" fill="#fbbf24">NCE</text>
      <text x={x1} y={H - 1} fontSize="8" fill="#64748b" textAnchor="end">nº de zonas →</text>
    </svg>
  );
}

export function MeapSection({ talhao }: { talhao: Talhao; safraNome?: string }) {
  const { setZonasManejo } = useApp();
  const [amb, setAmb] = useState<AmbienteProdutivo | null>(null);

  // Camadas (mapas já interpolados)
  const [carregadas, setCarregadas] = useState<CamadasCarregadas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [chaves, setChaves] = useState<string[]>([]);

  // Geração
  const [algoritmo, setAlgoritmo] = useState<'fcm' | 'kmeans'>('fcm');
  const [nClasses, setNClasses] = useState(0); // 0 = auto (sugestão)
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [res, setRes] = useState<RespZonarMulti | null>(null);

  const poligono = useMemo(() => {
    if (!talhao.geojson) return null;
    try { return extrairPoligono(JSON.parse(talhao.geojson) as GeoJSON.FeatureCollection); } catch { return null; }
  }, [talhao.geojson]);

  useEffect(() => { setAmb(obterOuAdotarAmbiente(talhao.id)); }, [talhao.id, talhao.zonasGeojson]);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    carregarCamadas(talhao.id)
      .then(c => { if (!vivo) return; setCarregadas(c); setChaves([]); }) // começa desmarcado: o usuário escolhe as camadas
      .catch(() => { if (vivo) setCarregadas(null); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [talhao.id]);

  // Mapa: preview gerado tem prioridade sobre as zonas importadas.
  const geradasFC = res ? { type: 'FeatureCollection' as const, features: res.features } : null;
  useEffect(() => {
    const fc = geradasFC ?? parseImportadas(talhao.zonasGeojson);
    if (!fc) { setZonasManejo(null); return; }
    setZonasManejo(featuresParaMapa(fc));
    return () => setZonasManejo(null);
  }, [res, talhao.zonasGeojson, setZonasManejo]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(ch: string) {
    setChaves(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]);
  }

  async function gerar() {
    if (!carregadas || chaves.length === 0) return;
    setErro(null); setGerando(true);
    try {
      const r = await gerarMulti({ carregadas, chaves, poligono, algoritmo, nClasses });
      if (!r.features.length) throw new Error('Nenhuma zona gerada (sobreposição de dados insuficiente).');
      setRes(r);
      if (nClasses === 0 && r.sugestao_c) setNClasses(r.sugestao_c);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao gerar zonas.');
    } finally { setGerando(false); }
  }

  const versao = useMemo(() => amb?.versoes.find(v => v.numero === amb.versaoVigente) ?? amb?.versoes[0] ?? null, [amb]);
  const varSimbolo = versao?.variavelValidacao ? simboloElemento(versao.variavelValidacao) : null;
  const temCV = !!versao?.zonas.some(z => z.metricas.cvValidacao != null);

  return (
    <div className="p-3 space-y-3">
      {/* ── Zonas adotadas (M1) ── */}
      {versao && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers size={15} style={{ color: '#86efac' }} />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#cbd5e1' }}>Zonas de Manejo (MEAP)</span>
            </div>
            <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: '#0b1f3a', color: '#93c5fd', border: '1px solid #1e3a8a' }}>{ESTADO[amb!.estado]}</span>
          </div>
          <p className="text-[10px] leading-relaxed" style={{ color: '#64748b' }}>
            <strong style={{ color: '#cbd5e1' }}>{versao.zonas.length}</strong> zonas adotadas · CV {temCV ? <>por <strong style={{ color: '#93c5fd' }}>{varSimbolo}</strong></> : 'indisponível'}.
          </p>
          <div className="space-y-1">
            {versao.zonas.map(z => {
              const h = z.metricas.homogeneidade ? HOMOG[z.metricas.homogeneidade] : null;
              return (
                <div key={z.id} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                  <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ background: z.cor, border: '1px solid #fff' }} />
                  <span className="text-xs font-bold" style={{ color: '#e2e8f0', minWidth: '54px' }}>{z.rotulo}</span>
                  <span className="text-[11px]" style={{ color: '#93c5fd' }}>{z.classeLabel}</span>
                  <span className="text-[10px] ml-auto" style={{ color: '#64748b' }}>{z.areaHa.toLocaleString('pt-BR')} ha · {Math.round(z.percTalhao * 100)}%</span>
                  {h && z.metricas.cvValidacao != null
                    ? <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0" style={{ background: h.bg, color: h.cor }}>CV {z.metricas.cvValidacao.toLocaleString('pt-BR')}%</span>
                    : <span className="text-[9px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: '#0b1f3a', color: '#475569' }}>CV —</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Gerar zonas por similaridade (M2) ── */}
      <div className="rounded-lg p-2.5 space-y-2" style={{ background: '#0b1f3a', border: '1px dashed #2e5fa3' }}>
        <div className="flex items-center gap-2">
          <Wand2 size={13} style={{ color: '#c4b5fd' }} />
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#c4b5fd' }}>Gerar zonas por similaridade (beta)</span>
        </div>

        {carregando ? (
          <p className="text-[10px] flex items-center gap-1.5" style={{ color: '#64748b' }}><Loader2 size={11} className="animate-spin" /> Carregando mapas interpolados…</p>
        ) : !carregadas ? (
          <p className="text-[10px] leading-relaxed" style={{ color: '#64748b' }}>
            Nenhum mapa interpolado salvo. Processe os atributos na aba <strong style={{ color: '#93c5fd' }}>Fertilidade</strong> (logado) — a zona é feita agrupando os mapas por similaridade, não reinterpolando.
          </p>
        ) : (
          <>
            <div>
              <span className="text-[9px] font-semibold block mb-1" style={{ color: '#64748b' }}>Camadas a usar ({chaves.length}/{carregadas.camadas.length})</span>
              <div className="flex flex-wrap gap-1">
                {carregadas.camadas.map(c => {
                  const on = chaves.includes(c.chave);
                  return (
                    <button key={c.chave} onClick={() => toggle(c.chave)}
                      className="flex items-center gap-1 px-1.5 py-1 rounded text-[10px] font-semibold"
                      style={{ background: on ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: on ? '#fff' : '#93c5fd', border: `1px solid ${on ? '#60a5fa' : '#1a3a6b'}` }}>
                      {on && <Check size={9} />} {c.simbolo} <span style={{ opacity: 0.7 }}>{c.prof}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[9px] font-semibold block mb-1" style={{ color: '#64748b' }}>Algoritmo</span>
                <div className="grid grid-cols-2 gap-1">
                  {([['fcm', 'Fuzzy'], ['kmeans', 'K-means']] as const).map(([m, t]) => (
                    <button key={m} onClick={() => setAlgoritmo(m)} className="py-1.5 rounded text-[10px] font-semibold"
                      style={{ background: algoritmo === m ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: algoritmo === m ? '#fff' : '#93c5fd', border: `1px solid ${algoritmo === m ? '#60a5fa' : '#1a3a6b'}` }}>{t}</button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="text-[9px] font-semibold block mb-1" style={{ color: '#64748b' }}>Nº de zonas</span>
                <select value={nClasses} onChange={e => setNClasses(Number(e.target.value))} className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                  <option value={0}>Auto (sugestão)</option>
                  {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} zonas</option>)}
                </select>
              </label>
            </div>

            <button onClick={gerar} disabled={gerando || chaves.length === 0}
              className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-2"
              style={{ background: gerando ? '#1a3a6b' : '#5b21b6', opacity: gerando || chaves.length === 0 ? 0.7 : 1 }}>
              {gerando ? <><Loader2 size={13} className="animate-spin" /> Clusterizando…</> : <><Wand2 size={13} /> Gerar zonas</>}
            </button>

            {erro && (
              <div className="flex items-start gap-1.5 p-2 rounded" style={{ background: '#2a0f12', border: '1px solid #7f1d1d' }}>
                <AlertTriangle size={12} style={{ color: '#f87171' }} className="flex-shrink-0 mt-0.5" />
                <p className="text-[10px] leading-relaxed" style={{ color: '#fca5a5' }}>{erro}</p>
              </div>
            )}

            {res && (
              <div className="p-2 rounded space-y-1.5" style={{ background: '#1a1033', border: '1px solid #5b21b6' }}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold" style={{ color: '#c4b5fd' }}>Preview no mapa</span>
                  <button onClick={() => setRes(null)} title="Limpar preview" className="ml-auto flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                    <X size={9} /> Limpar
                  </button>
                </div>
                <p className="text-[10px]" style={{ color: '#94a3b8' }}>
                  <strong style={{ color: '#e2e8f0' }}>{res.features.length}</strong> zonas · {res.stats.algoritmo === 'fcm' ? 'fuzzy c-means' : 'k-means'} · {res.stats.n_camadas} camadas · {res.stats.n_pixels.toLocaleString('pt-BR')} px
                </p>
                {res.indices.length >= 2 && (
                  <>
                    <p className="text-[9px]" style={{ color: '#a78bfa' }}>
                      Índices FPI/NCE — nº ótimo (mínimo) sugerido: <strong style={{ color: '#e9d5ff' }}>{res.sugestao_c ?? '—'}</strong> zonas
                    </p>
                    <IndicesChart indices={res.indices} sugestao={res.sugestao_c} />
                  </>
                )}
                <p className="text-[9px] leading-relaxed" style={{ color: '#6d5b9e' }}>
                  Preview — não salvo. A seguir: área mínima de zona, ordenação manual/sugerida (produtividade, NDVI, MO, CTC) e persistir como versão do MEAP.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
