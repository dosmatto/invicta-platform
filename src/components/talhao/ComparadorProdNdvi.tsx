'use client';

// Comparador Produtividade × NDVI (etapa 5). Mostra o Mapa Oficial de
// Produtividade e um NDVI mantido lado a lado, com correlação espacial, e gera
// um relatório PDF lado a lado. Aparece quando há os dois mapas disponíveis.

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { getMapasProdutividade, getLegendasPorAtributo, getTalhoes, type MapaProdutividade } from '@/lib/store';
import { carregarNdviSalvos, type NdviCamada } from '@/lib/meap/gerar';
import { extrairPoligono, decodeGrid, descomprimirGrid, type Grid } from '@/lib/fertilidade';
import { cloudCarregarMapasPorPrefixo } from '@/lib/cloud';
import { colorirGrid, colorirGridComLegenda } from '@/lib/raster';
import { rampaVisualStops, type Legenda } from '@/lib/legendas';
import { legendaDaCultura, emUnidade, type Unidade } from '@/lib/produtividade';
import { gerarRelatorioComparacao, type LadoComparacao } from '@/lib/relatorioComparacao';
import { ComparacaoCompleta } from '@/components/talhao/ComparacaoCompleta';
import { Loader2, FileDown, GitCompare, Maximize2 } from 'lucide-react';

const fmt = (v: number, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const prefixoProd = (talhaoId: string) => `${talhaoId}__prod__`;

// Reamostragem bilinear NaN-aware (mesma extensão) — p/ co-registrar NDVI na malha da produtividade.
function reamostrar(src: Float32Array, sr: number, sc: number, dr: number, dc: number): Float32Array {
  if (sr === dr && sc === dc) return src;
  const out = new Float32Array(dr * dc);
  for (let j = 0; j < dr; j++) {
    const fy = dr === 1 ? 0 : (j * (sr - 1)) / (dr - 1); const y0 = Math.floor(fy), y1 = Math.min(y0 + 1, sr - 1), wy = fy - y0;
    for (let i = 0; i < dc; i++) {
      const fx = dc === 1 ? 0 : (i * (sc - 1)) / (dc - 1); const x0 = Math.floor(fx), x1 = Math.min(x0 + 1, sc - 1), wx = fx - x0;
      const w00 = (1 - wx) * (1 - wy), w01 = wx * (1 - wy), w10 = (1 - wx) * wy, w11 = wx * wy;
      const a = src[y0 * sc + x0], b = src[y0 * sc + x1], c = src[y1 * sc + x0], dd = src[y1 * sc + x1];
      let num = 0, den = 0;
      if (isFinite(a)) { num += a * w00; den += w00; } if (isFinite(b)) { num += b * w01; den += w01; }
      if (isFinite(c)) { num += c * w10; den += w10; } if (isFinite(dd)) { num += dd * w11; den += w11; }
      out[j * dc + i] = den > 0 ? num / den : NaN;
    }
  }
  return out;
}

function pearson(prod: Grid, ndvi: Grid): number | null {
  const p = decodeGrid(prod); const q = decodeGrid(ndvi);
  const qr = reamostrar(q.valores, q.rows, q.cols, p.rows, p.cols);
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < p.valores.length; i++) {
    const a = p.valores[i], b = qr[i];
    if (!isFinite(a) || !isFinite(b)) continue;
    n++; sx += a; sy += b; sxx += a * a; syy += b * b; sxy += a * b;
  }
  if (n < 30) return null;
  const cov = sxy / n - (sx / n) * (sy / n);
  const vx = sxx / n - (sx / n) ** 2, vy = syy / n - (sy / n) ** 2;
  const d = Math.sqrt(vx * vy);
  return d > 0 ? cov / d : null;
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

type ProdView = { rec: MapaProdutividade; grid: Grid; bounds: [number, number, number, number]; legenda: Legenda };

export function ComparadorProdNdvi({ safraNome }: { safraNome: string }) {
  const { nav } = useApp();
  const [prod, setProd] = useState<ProdView | null>(null);
  const [ndvis, setNdvis] = useState<NdviCamada[]>([]);
  const [ndviSel, setNdviSel] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');
  const [completo, setCompleto] = useState(false);

  const ndviLeg = useMemo(() => getLegendasPorAtributo('ndvi')[0], []);

  useEffect(() => {
    let vivo = true;
    setCarregando(true); setProd(null); setNdvis([]); setNdviSel(''); setErro('');
    if (!nav.talhaoId) { setCarregando(false); return; }
    (async () => {
      try {
        // Mapa Oficial de produtividade (ou o mais recente) + raster
        const recs = getMapasProdutividade(nav.talhaoId!, safraNome);
        const rec = recs.find(r => r.oficial) ?? recs[0] ?? null;
        let pv: ProdView | null = null;
        if (rec) {
          const docs = await cloudCarregarMapasPorPrefixo<{ resp: { bounds: [number, number, number, number]; grid?: Grid } }>(prefixoProd(nav.talhaoId!));
          const doc = docs.find(d => d.id.endsWith(rec.id));
          let grid = doc?.dados?.resp?.grid;
          if (grid?.comp === 'gz') { try { grid = await descomprimirGrid(grid); } catch { grid = undefined; } }
          const leg = legendaDaCultura(rec.cultura);
          if (grid && leg && doc) pv = { rec, grid, bounds: doc.dados.resp.bounds, legenda: leg };
        }
        const nd = await carregarNdviSalvos(nav.talhaoId!);
        if (!vivo) return;
        setProd(pv); setNdvis(nd); setNdviSel(nd[0]?.data ?? '');
      } catch (e) { if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao carregar.'); }
      finally { if (vivo) setCarregando(false); }
    })();
    return () => { vivo = false; };
  }, [nav.talhaoId, safraNome]);

  const ndvi = useMemo(() => ndvis.find(n => n.data === ndviSel) ?? null, [ndvis, ndviSel]);

  // Imagens coloridas (thumbnails) + médias + correlação
  const view = useMemo(() => {
    if (!prod || !ndvi || !ndviLeg) return null;
    const ndviGrid: Grid = { b64: ndvi.b64, shape: ndvi.shape };
    let prodUrl = '', ndviUrl = '';
    try { prodUrl = colorirGridComLegenda(prod.grid, prod.legenda).dataUrl; } catch {}
    try { ndviUrl = colorirGrid(ndviGrid, [0, 1], rampaVisualStops({ ...ndviLeg, estilo: 'continuo' })).dataUrl; } catch {}
    // média NDVI
    const { valores } = decodeGrid(ndviGrid);
    let n = 0, soma = 0; for (let i = 0; i < valores.length; i++) { const v = valores[i]; if (isFinite(v)) { n++; soma += v; } }
    const ndviMedia = n ? soma / n : 0;
    const r = pearson(prod.grid, ndviGrid);
    return { prodUrl, ndviUrl, ndviGrid, ndviMedia, r };
  }, [prod, ndvi, ndviLeg]);

  if (carregando) return <p className="text-[10px] flex items-center gap-1.5 px-1" style={{ color: '#64748b' }}><Loader2 size={11} className="animate-spin" /> Carregando comparação…</p>;
  if (!prod || ndvis.length === 0) {
    return (
      <div className="rounded-lg p-2.5 text-[10px]" style={{ background: '#061525', border: '1px solid #1a3a6b', color: '#64748b' }}>
        <p className="font-semibold flex items-center gap-1 mb-1" style={{ color: '#93c5fd' }}><GitCompare size={12} /> Comparar com NDVI</p>
        Para comparar, é preciso ter um <strong style={{ color: prod ? '#86efac' : '#fbbf24' }}>Mapa de Produtividade salvo</strong> e ao menos um <strong style={{ color: ndvis.length ? '#86efac' : '#fbbf24' }}>NDVI mantido</strong> (aba NDVI → "Manter esta cena").
        <button onClick={() => setCompleto(true)} className="mt-2 w-full py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
          <Maximize2 size={11} /> Comparação completa (qualquer camada)
        </button>
        {completo && <ComparacaoCompleta safraNome={safraNome} onClose={() => setCompleto(false)} />}
      </div>
    );
  }

  const u: Unidade = prod.rec.unidade;
  const prodMedia = fmt(emUnidade(prod.rec.stats.mediaKgha, u), u === 'kg/ha' ? 0 : 1);

  async function gerarPdf() {
    if (!prod || !ndvi || !view || !ndviLeg) return;
    const t = getTalhoes().find(x => x.id === nav.talhaoId);
    const poly = t?.geojson ? extrairPoligono(JSON.parse(t.geojson)) : null;
    if (!poly) { setErro('Limite do talhão não encontrado.'); return; }
    setGerando(true); setErro('');
    try {
      const esquerda: LadoComparacao = {
        titulo: `Produtividade — ${prod.rec.cultura[0].toUpperCase() + prod.rec.cultura.slice(1)}`,
        subtitulo: `Média ${prodMedia} ${u} · ${fmt(prod.rec.stats.areaHa, 1)} ha · v${prod.rec.versao}`,
        rasterPng: view.prodUrl, bounds: prod.bounds, legenda: prod.legenda, rotulos: rotulosLegenda(prod.legenda),
      };
      const fonte = ndvi.nut === 'ndvi_cbers' ? 'CBERS-4A' : 'Sentinel-2';
      const direita: LadoComparacao = {
        titulo: `NDVI — ${fonte}`,
        subtitulo: `${new Date(ndvi.data + 'T00:00:00').toLocaleDateString('pt-BR')} · NDVI médio ${fmt(view.ndviMedia, 2)}`,
        rasterPng: view.ndviUrl, bounds: ndvi.bounds, legenda: { ...ndviLeg, estilo: 'continuo' }, rotulos: rotulosLegenda(ndviLeg),
      };
      await gerarRelatorioComparacao({
        cliente: nav.produtor, fazenda: nav.fazenda, talhao: nav.talhao, safra: safraNome, areaHa: nav.area,
        poligono: poly, esquerda, direita, correlacao: view.r, satelite: true,
      });
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao gerar o PDF.'); }
    finally { setGerando(false); }
  }

  return (
    <div className="rounded-lg p-2.5 space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold flex items-center gap-1" style={{ color: '#93c5fd' }}><GitCompare size={12} /> Comparar com NDVI</p>
        {ndvis.length > 1 && (
          <select value={ndviSel} onChange={e => setNdviSel(e.target.value)} className="rounded px-1.5 py-0.5 text-[10px] outline-none" style={{ background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' }}>
            {ndvis.map(n => <option key={n.chave} value={n.data}>{new Date(n.data + 'T00:00:00').toLocaleDateString('pt-BR')} · {n.nut === 'ndvi_cbers' ? 'CBERS' : 'S2'}</option>)}
          </select>
        )}
      </div>

      {view && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Lado titulo="Produtividade" sub={`${prodMedia} ${u}`} url={view.prodUrl} />
            <Lado titulo={`NDVI · ${ndvi?.nut === 'ndvi_cbers' ? 'CBERS' : 'S2'}`} sub={`médio ${fmt(view.ndviMedia, 2)}`} url={view.ndviUrl} />
          </div>
          {view.r != null && (
            <p className="text-[10px] text-center" style={{ color: '#cbd5e1' }}>
              Correlação espacial (Pearson): <strong style={{ color: Math.abs(view.r) >= 0.5 ? '#86efac' : Math.abs(view.r) >= 0.3 ? '#fbbf24' : '#f87171' }}>r = {fmt(view.r, 2)}</strong>
              <span style={{ color: '#64748b' }}> {Math.abs(view.r) >= 0.5 ? '(forte)' : Math.abs(view.r) >= 0.3 ? '(moderada)' : '(fraca)'}</span>
            </p>
          )}
        </>
      )}

      {erro && <p className="text-[10px]" style={{ color: '#f87171' }}>{erro}</p>}

      <button onClick={gerarPdf} disabled={gerando || !view}
        className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
        style={{ background: 'var(--invicta-blue-mid)' }}>
        {gerando ? <><Loader2 size={13} className="animate-spin" /> Gerando PDF…</> : <><FileDown size={13} /> Relatório lado a lado (PDF)</>}
      </button>
      <button onClick={() => setCompleto(true)} className="w-full py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
        <Maximize2 size={11} /> Comparação completa (tela cheia · qualquer camada)
      </button>
      {completo && <ComparacaoCompleta safraNome={safraNome} onClose={() => setCompleto(false)} />}
    </div>
  );
}

function Lado({ titulo, sub, url }: { titulo: string; sub: string; url: string }) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #1a3a6b' }}>
      <div className="px-1.5 py-1" style={{ background: '#0b1f3a' }}>
        <p className="text-[10px] font-bold" style={{ color: '#e2e8f0' }}>{titulo}</p>
        <p className="text-[9px]" style={{ color: '#86efac' }}>{sub}</p>
      </div>
      <div style={{ background: '#0a1929', aspectRatio: '1 / 1' }} className="flex items-center justify-center">
        {url ? <img src={url} alt={titulo} style={{ width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated' }} /> : <span className="text-[9px]" style={{ color: '#64748b' }}>—</span>}
      </div>
    </div>
  );
}
