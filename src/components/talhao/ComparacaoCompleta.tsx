'use client';

// Comparador universal de camadas — tela cheia (Camada A × Camada B).
// Seletor agrupado (Produtividade / NDVI / Fertilidade), dois mapas sobre
// satélite, legendas, estatísticas, correlação (scatter + r) e distribuição de
// área por classe. Exporta o PDF lado a lado. (Slice 1: lado a lado + export.)

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { getTalhoes } from '@/lib/store';
import { extrairPoligono, type Grid } from '@/lib/fertilidade';
import { colorirGridComLegenda } from '@/lib/raster';
import { capturarMapaFertilidade } from '@/lib/capturaMapa';
import {
  listarCamadas, statsCamada, correlacao, areaPorClasse,
  type CamadaComparavel, type ClasseArea,
} from '@/lib/comparador';
import { gerarRelatorioComparacao, type LadoComparacao } from '@/lib/relatorioComparacao';
import type { Legenda } from '@/lib/legendas';
import { X, Loader2, FileDown, GitCompare } from 'lucide-react';

const fmt = (v: number | null | undefined, d = 0) => (v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));

function areaHa(grid: Grid, bounds: [number, number, number, number], nFinitos: number): number {
  const [w, s, e, n] = bounds; const [rows, cols] = grid.shape;
  const lat0 = (s + n) / 2;
  const dx = ((e - w) / cols) * 111320 * Math.cos((lat0 * Math.PI) / 180);
  const dy = ((n - s) / rows) * 111320;
  return (nFinitos * Math.max(0, dx) * Math.max(0, dy)) / 1e4;
}

function rotulosLegenda(leg: Legenda): { pos: number; txt: string }[] {
  let acc = 0; const out: { pos: number; txt: string }[] = [];
  for (let i = 0; i < leg.classes.length - 1; i++) {
    acc += leg.classes[i].larguraVisual;
    const b = leg.classes[i].valorMax;
    if (b != null) out.push({ pos: acc / 100, txt: b.toLocaleString('pt-BR') });
  }
  return out;
}

function rangeLabel(c: { valorMin?: number | null; valorMax?: number | null }): string {
  if (c.valorMax == null) return `> ${fmt(c.valorMin)}`;
  if (c.valorMin == null) return `< ${fmt(c.valorMax)}`;
  return `${fmt(c.valorMin)} – ${fmt(c.valorMax)}`;
}

async function comporMapa(cam: CamadaComparavel, poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon | null): Promise<string> {
  let png = '';
  try { png = colorirGridComLegenda(cam.grid, cam.legenda).dataUrl; } catch { return ''; }
  if (!poligono) return png;
  try {
    return await capturarMapaFertilidade({
      rasterPng: png, bounds: cam.bounds, poligono, valores: { type: 'FeatureCollection', features: [] },
      satelite: true, corLimite: '#ffffff', larguraPx: 760, alturaPx: 620,
    });
  } catch { return png; }
}

export function ComparacaoCompleta({ safraNome, onClose }: { safraNome: string; onClose: () => void }) {
  const { nav } = useApp();
  const [camadas, setCamadas] = useState<CamadaComparavel[]>([]);
  const [idA, setIdA] = useState(''); const [idB, setIdB] = useState('');
  const [imgA, setImgA] = useState(''); const [imgB, setImgB] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [compondo, setCompondo] = useState(false);
  const [gerando, setGerando] = useState(false);

  const poligono = useMemo(() => {
    const t = getTalhoes().find(x => x.id === nav.talhaoId);
    return t?.geojson ? extrairPoligono(JSON.parse(t.geojson)) : null;
  }, [nav.talhaoId]);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    (async () => {
      const cs = nav.talhaoId ? await listarCamadas(nav.talhaoId, safraNome) : [];
      if (!vivo) return;
      setCamadas(cs);
      setIdA(cs.find(c => c.grupo === 'Produtividade')?.id ?? cs[0]?.id ?? '');
      setIdB(cs.find(c => c.grupo === 'NDVI')?.id ?? cs[1]?.id ?? cs[0]?.id ?? '');
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [nav.talhaoId, safraNome]);

  const camA = useMemo(() => camadas.find(c => c.id === idA) ?? null, [camadas, idA]);
  const camB = useMemo(() => camadas.find(c => c.id === idB) ?? null, [camadas, idB]);

  useEffect(() => {
    let vivo = true;
    if (!camA && !camB) return;
    setCompondo(true);
    (async () => {
      const [a, b] = await Promise.all([camA ? comporMapa(camA, poligono) : '', camB ? comporMapa(camB, poligono) : '']);
      if (!vivo) return;
      setImgA(a); setImgB(b); setCompondo(false);
    })();
    return () => { vivo = false; };
  }, [camA, camB, poligono]);

  const stA = useMemo(() => (camA ? statsCamada(camA.grid) : null), [camA]);
  const stB = useMemo(() => (camB ? statsCamada(camB.grid) : null), [camB]);
  const areaA = useMemo(() => (camA && stA ? areaHa(camA.grid, camA.bounds, stA.n) : 0), [camA, stA]);
  const areaB = useMemo(() => (camB && stB ? areaHa(camB.grid, camB.bounds, stB.n) : 0), [camB, stB]);
  const corr = useMemo(() => (camA && camB ? correlacao(camA.grid, camB.grid) : null), [camA, camB]);
  // Sensores diferentes (S2 × CBERS): comparação é apoio visual, não equivalência.
  const crossSensor = !!(camA?.grupo === 'NDVI' && camB?.grupo === 'NDVI'
    && camA.sub && camB.sub && camA.sub !== camB.sub);
  const distA = useMemo(() => (camA ? areaPorClasse(camA.grid, camA.legenda) : []), [camA]);
  const distB = useMemo(() => (camB ? areaPorClasse(camB.grid, camB.legenda) : []), [camB]);

  async function exportar() {
    if (!camA || !camB || !stA || !stB || !poligono) return;
    setGerando(true);
    try {
      const lado = (cam: CamadaComparavel, st: NonNullable<typeof stA>, area: number): LadoComparacao => ({
        titulo: `${cam.grupo} — ${cam.nome}`,
        subtitulo: `Média ${fmt(st.media, cam.grupo === 'NDVI' ? 2 : 0)} ${cam.unidade} · ${fmt(area, 1)} ha · CV ${fmt(st.cv, 1)}%`,
        rasterPng: colorirGridComLegenda(cam.grid, cam.legenda).dataUrl,
        bounds: cam.bounds, legenda: cam.legenda, rotulos: rotulosLegenda(cam.legenda),
      });
      await gerarRelatorioComparacao({
        cliente: nav.produtor, fazenda: nav.fazenda, talhao: nav.talhao, safra: safraNome, areaHa: nav.area,
        poligono, esquerda: lado(camA, stA, areaA), direita: lado(camB, stB, areaB), correlacao: corr?.r ?? null, satelite: true,
      });
    } finally { setGerando(false); }
  }

  const grupos: CamadaComparavel['grupo'][] = ['Produtividade', 'NDVI', 'Fertilidade'];
  const opcoes = (atual: string, set: (s: string) => void) => (
    <select value={atual} onChange={e => set(e.target.value)} className="w-full rounded px-2 py-1.5 text-xs outline-none" style={{ background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' }}>
      {grupos.map(g => {
        const cs = camadas.filter(c => c.grupo === g);
        return cs.length ? <optgroup key={g} label={g}>{cs.map(c => <option key={c.id} value={c.id}>{c.nome}{c.sub ? ` · ${c.sub}` : ''}</option>)}</optgroup> : null;
      })}
    </select>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#04101f' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        <p className="text-sm font-bold flex items-center gap-2" style={{ color: '#e2e8f0' }}>
          <GitCompare size={16} style={{ color: '#93c5fd' }} /> Comparação de Camadas
          <span className="text-[11px] font-normal" style={{ color: '#64748b' }}>{nav.talhao} · {safraNome} · {fmt(nav.area, 2)} ha</span>
        </p>
        <div className="flex items-center gap-2">
          <button onClick={exportar} disabled={gerando || !camA || !camB} className="px-3 py-1.5 rounded text-xs font-bold text-white flex items-center gap-1.5 disabled:opacity-50" style={{ background: 'var(--invicta-blue-mid)' }}>
            {gerando ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />} Exportar PDF
          </button>
          <button onClick={onClose} className="p-1.5 rounded" style={{ color: '#93c5fd' }}><X size={18} /></button>
        </div>
      </div>

      {carregando ? (
        <div className="flex-1 flex items-center justify-center"><p className="text-xs flex items-center gap-2" style={{ color: '#64748b' }}><Loader2 size={14} className="animate-spin" /> Carregando camadas…</p></div>
      ) : camadas.length < 2 ? (
        <div className="flex-1 flex items-center justify-center px-8 text-center"><p className="text-xs" style={{ color: '#fbbf24' }}>Precisa de pelo menos 2 camadas salvas (Produtividade, NDVI mantido ou mapas de Fertilidade) para comparar.</p></div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {crossSensor && (
            <div className="p-2.5 rounded-lg text-[10px]" style={{ background: '#2d1a00', border: '1px solid #92400e', color: '#fbbf24' }}>
              ⚠ <strong>Atenção: esta comparação utiliza sensores diferentes</strong> ({camA?.sub} × {camB?.sub}).
              Diferenças de resolução, data, bandas e calibração podem alterar os valores. Use como apoio visual e agronômico, não como equivalência absoluta.
            </div>
          )}
          {/* Dois mapas */}
          <div className="grid grid-cols-2 gap-4">
            {[{ cam: camA, img: imgA, st: stA, area: areaA, set: setIdA, id: idA }, { cam: camB, img: imgB, st: stB, area: areaB, set: setIdB, id: idB }].map((lado, i) => (
              <div key={i} className="rounded-lg overflow-hidden" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                <div className="p-2.5">{opcoes(lado.id, lado.set)}</div>
                <div className="relative" style={{ background: '#0a1929', aspectRatio: '76 / 62' }}>
                  {compondo && !lado.img
                    ? <div className="absolute inset-0 flex items-center justify-center"><Loader2 size={18} className="animate-spin" style={{ color: '#64748b' }} /></div>
                    : lado.img && <img src={lado.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
                </div>
                <div className="flex gap-3 p-2.5">
                  {/* Legenda */}
                  {lado.cam && (
                    <div className="flex-1">
                      <p className="text-[10px] font-semibold mb-1" style={{ color: '#93c5fd' }}>{lado.cam.legenda.nome}</p>
                      <div className="space-y-0.5">
                        {[...lado.cam.legenda.classes].reverse().map((c, k) => (
                          <div key={k} className="flex items-center gap-1.5 text-[9px]" style={{ color: '#cbd5e1' }}>
                            <span style={{ width: 12, height: 9, background: c.corInicio, display: 'inline-block', borderRadius: 1 }} />
                            {rangeLabel(c)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Estatísticas */}
                  {lado.st && (
                    <div className="flex-1 text-[10px]" style={{ color: '#94a3b8' }}>
                      <p className="font-semibold mb-1" style={{ color: '#93c5fd' }}>Estatísticas</p>
                      <Lin k="Média" v={`${fmt(lado.st.media, lado.cam?.grupo === 'NDVI' ? 2 : 0)} ${lado.cam?.unidade ?? ''}`} forte />
                      <Lin k="Mínimo" v={`${fmt(lado.st.min, lado.cam?.grupo === 'NDVI' ? 2 : 0)}`} />
                      <Lin k="Máximo" v={`${fmt(lado.st.max, lado.cam?.grupo === 'NDVI' ? 2 : 0)}`} />
                      <Lin k="CV" v={`${fmt(lado.st.cv, 1)} %`} />
                      <Lin k="Área" v={`${fmt(lado.area, 2)} ha`} />
                      {lado.cam?.grupo === 'Produtividade' && <Lin k="Produção" v={`${fmt(lado.st.media * lado.area, 0)} kg`} />}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Correlação + distribuição */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg p-3" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
              <p className="text-[11px] font-semibold mb-2" style={{ color: '#93c5fd' }}>Correlação {camA?.grupo} × {camB?.grupo}</p>
              {corr && corr.r != null
                ? <div className="flex items-center gap-3">
                    <Scatter amostra={corr.amostra} />
                    <div className="text-center">
                      <p className="text-2xl font-bold" style={{ color: Math.abs(corr.r) >= 0.5 ? '#86efac' : Math.abs(corr.r) >= 0.3 ? '#fbbf24' : '#f87171' }}>{fmt(corr.r, 2)}</p>
                      <p className="text-[9px]" style={{ color: '#64748b' }}>coef. (r) · {Math.abs(corr.r) >= 0.5 ? 'forte' : Math.abs(corr.r) >= 0.3 ? 'moderada' : 'fraca'}</p>
                    </div>
                  </div>
                : <p className="text-[10px]" style={{ color: '#64748b' }}>Sobreposição insuficiente entre as camadas para correlacionar.</p>}
            </div>
            <div className="rounded-lg p-3" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
              <p className="text-[11px] font-semibold mb-2" style={{ color: '#93c5fd' }}>Distribuição de área por classe</p>
              <div className="grid grid-cols-2 gap-3">
                <DistCol titulo={camA?.grupo ?? 'A'} dist={distA} />
                <DistCol titulo={camB?.grupo ?? 'B'} dist={distB} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Lin({ k, v, forte }: { k: string; v: string; forte?: boolean }) {
  return <div className="flex justify-between"><span style={{ color: '#64748b' }}>{k}</span><span style={{ color: forte ? '#e2e8f0' : '#cbd5e1', fontWeight: forte ? 700 : 400 }}>{v}</span></div>;
}

function Scatter({ amostra }: { amostra: { a: number; b: number }[] }) {
  if (amostra.length < 2) return null;
  const W = 150, H = 110, p = 6;
  const ax = amostra.map(d => d.b), ay = amostra.map(d => d.a); // x = B, y = A
  const xmin = Math.min(...ax), xmax = Math.max(...ax), ymin = Math.min(...ay), ymax = Math.max(...ay);
  const px = (x: number) => p + ((x - xmin) / ((xmax - xmin) || 1)) * (W - 2 * p);
  const py = (y: number) => H - p - ((y - ymin) / ((ymax - ymin) || 1)) * (H - 2 * p);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={150} height={110} style={{ background: '#0a1929', borderRadius: 4 }}>
      {amostra.map((d, i) => <circle key={i} cx={px(d.b)} cy={py(d.a)} r={1.3} fill="#86efac" opacity={0.7} />)}
    </svg>
  );
}

function DistCol({ titulo, dist }: { titulo: string; dist: ClasseArea[] }) {
  return (
    <div>
      <p className="text-[9px] font-semibold mb-1" style={{ color: '#64748b' }}>{titulo}</p>
      <div className="space-y-0.5">
        {[...dist].reverse().map((c, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[9px]" style={{ color: '#cbd5e1' }}>
            <span style={{ width: 10, height: 8, background: c.cor, display: 'inline-block', borderRadius: 1 }} />
            <span className="flex-1 truncate">{c.rotulo}</span>
            <span style={{ color: '#94a3b8' }}>{fmt(c.pct, 1)} %</span>
          </div>
        ))}
      </div>
    </div>
  );
}
