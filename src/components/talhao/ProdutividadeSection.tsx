'use client';

// Aba Produtividade — Módulo 12 (Mapas de Colheita), P1 + P2 (porte oficial).
// Etapas: 1) Importar máquinas → 2) Unificação (correção por colhedora) →
// 3) Limpeza (filtro bruto + MapFilter global/local) → 4) Interpolação IDW +
// MÉDIA REAL. A limpeza+unificação+IDW rodam no backend (pipeline oficial QGIS
// portado). Salva como versão; 1 = oficial. + Comparador Produtividade × NDVI.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useApp } from '@/context/AppContext';
import {
  getSafras, getPlantio, getTalhoes, getMapasProdutividade, saveMapaProdutividade,
  setMapaProdutividadeOficial, deleteMapaProdutividade, type MapaProdutividade,
} from '@/lib/store';
import {
  extrairPoligono, coordsFromBounds, gradienteCss, comprimirGrid, descomprimirGrid, rampaDaLegenda,
  type RespInterp, type Grid,
} from '@/lib/fertilidade';
import { colorirGridComLegenda } from '@/lib/raster';
import { rasterizarPontos5, type Classe5 } from '@/lib/condutividade';
import {
  parseCsvTexto, autoColunas, pontosDeCsv, lerShapefilePontos, pontosDeGeojson,
  processarColheita, statsDoGrid, legendaDaCultura, emUnidade, rotuloUnidade, sugerirFiltroBruto,
  SACA_KG, PARAMS_COLHEITA_PADRAO,
  type PontoColheita, type Unidade, type StatsProd, type CsvParsed, type ParamsColheita, type RelatorioColheita,
} from '@/lib/produtividade';
import { cloudSalvarMapa, cloudCarregarMapasPorPrefixo, cloudPodeGravar } from '@/lib/cloud';
import { ComparadorProdNdvi } from '@/components/talhao/ComparadorProdNdvi';
import { SeletorLegenda, legendasDoModulo, usePrefLegenda } from './SeletorLegenda';
import type { Legenda } from '@/lib/legendas';
import { Upload, Loader2, AlertTriangle, Save, Star, Trash2, Eye, Wand2, FileSpreadsheet, Plus, Layers, ChevronDown, ChevronUp } from 'lucide-react';

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;
const fmt = (v: number, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const CULTURAS = ['soja', 'milho', 'trigo', 'feijao', 'outro'];
const EPOCAS: Array<{ v: string; l: string }> = [{ v: '', l: '—' }, { v: 'verao', l: 'Verão' }, { v: 'safrinha', l: 'Safrinha' }, { v: 'inverno', l: 'Inverno' }];
const prefixoProd = (talhaoId: string) => `${talhaoId}__prod__`;
const idProd = (talhaoId: string, recId: string) => `${prefixoProd(talhaoId)}${recId}`;
const paraKgha = (v: number, u: Unidade) => (u === 'sc/ha' ? v * SACA_KG : u === 't/ha' ? v * 1000 : v);

type MaqRaw = { id: string; nome: string; arquivo: string; csv?: CsvParsed; fc?: GeoJSON.FeatureCollection };

export function ProdutividadeSection({ safraNome: safraProp }: { safraNome?: string } = {}) {
  const { nav, uploadedGeo, setFertilidadeOverlay, setFertilidadeLabels } = useApp();
  const safraAtiva = useMemo(() => getSafras().find(s => s.ativa) ?? null, []);
  const safra = safraProp ?? safraAtiva?.nome ?? '';

  const poligono = useMemo(() => {
    const p = extrairPoligono(uploadedGeo);
    if (p) return p;
    if (!nav.talhaoId) return null;
    const t = getTalhoes().find(x => x.id === nav.talhaoId);
    if (t?.geojson) { try { return extrairPoligono(JSON.parse(t.geojson)); } catch {} }
    return null;
  }, [uploadedGeo, nav.talhaoId]);

  const culturaPlantio = useMemo(() => (nav.talhaoId ? getPlantio(nav.talhaoId, safra) : ''), [nav.talhaoId, safra]);
  const [cultura, setCultura] = useState('soja');
  const [epoca, setEpoca] = useState('');
  const [unidade, setUnidade] = useState<Unidade>('kg/ha');
  useEffect(() => { if (culturaPlantio && CULTURAS.includes(culturaPlantio.toLowerCase())) setCultura(culturaPlantio.toLowerCase()); }, [culturaPlantio]);

  // 1) Máquinas + mapeamento de colunas (do 1º arquivo)
  const [maqs, setMaqs] = useState<MaqRaw[]>([]);
  const [colunas, setColunas] = useState<string[]>([]);
  const [colLat, setColLat] = useState(''); const [colLng, setColLng] = useState(''); const [colVal, setColVal] = useState('');
  const [temCsv, setTemCsv] = useState(false);
  // 3) Limpeza (params do pipeline oficial)
  const [pixelM, setPixelM] = useState(10);
  const [clean, setClean] = useState<ParamsColheita>(PARAMS_COLHEITA_PADRAO);
  const [brutoTocado, setBrutoTocado] = useState(false);
  const [avancado, setAvancado] = useState(false);
  // 4) Média real
  const [mediaReal, setMediaReal] = useState('');

  const [estado, setEstado] = useState<'idle' | 'processando' | 'pronto' | 'erro'>('idle');
  const [erro, setErro] = useState('');
  const [res, setRes] = useState<RespInterp | null>(null);
  const [stats, setStats] = useState<StatsProd | null>(null);
  const [legenda, setLegenda] = useState<Legenda | null>(null);
  // Seletor de legenda (por padrão a da cultura; o usuário pode trocar). A escolha lembra.
  const legendasProd = useMemo(() => legendasDoModulo('produtividade'), []);
  const [legProdId, escolherLegProd] = usePrefLegenda('inv_leg_pref_produtividade');
  const legendaInicial = (c: string) => legendasProd.find(l => l.id === legProdId) ?? legendaDaCultura(c);
  const [relatorio, setRelatorio] = useState<RelatorioColheita | null>(null);
  const [fresco, setFresco] = useState(false);
  const [verBrutos, setVerBrutos] = useState(false);   // preview dos pontos crus em 5 classes
  const [classesBrutos, setClassesBrutos] = useState<Classe5[] | null>(null);

  const [versoes, setVersoes] = useState<MapaProdutividade[]>([]);
  const [rasters, setRasters] = useState<Record<string, { bounds: [number, number, number, number]; grid: Grid }>>({});
  const recarregar = () => setVersoes(nav.talhaoId ? getMapasProdutividade(nav.talhaoId, safra) : []);

  useEffect(() => {
    recarregar();
    setRes(null); setStats(null); setFresco(false); setMaqs([]); setColunas([]); setRelatorio(null); setBrutoTocado(false);
    if (!nav.talhaoId) return;
    (async () => {
      const docs = await cloudCarregarMapasPorPrefixo<{ resp: { bounds: [number, number, number, number]; grid?: Grid } }>(prefixoProd(nav.talhaoId!));
      const map: Record<string, { bounds: [number, number, number, number]; grid: Grid }> = {};
      for (const d of docs) {
        const recId = d.id.slice(prefixoProd(nav.talhaoId!).length);
        let grid = d.dados?.resp?.grid;
        if (!grid) continue;
        if (grid.comp === 'gz') { try { grid = await descomprimirGrid(grid); } catch { continue; } }
        map[recId] = { bounds: d.dados.resp.bounds, grid };
      }
      setRasters(map);
    })();
  }, [nav.talhaoId, safra]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { setFertilidadeOverlay(null); setFertilidadeLabels(null); }, [setFertilidadeOverlay, setFertilidadeLabels]);

  async function adicionarMaquina(file: File) {
    setErro(''); setRes(null); setFresco(false);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      const id = Math.random().toString(36).slice(2);
      const nome = `Máquina ${maqs.length + 1}`;
      if (ext === 'zip') {
        const { colunas: cols, fc } = await lerShapefilePontos(file);
        setMaqs(m => [...m, { id, nome, arquivo: file.name, fc }]);
        if (colunas.length === 0) { setColunas(cols); setTemCsv(false); setColVal(cols.find(c => /prod|rend|yield|colh|massa|kg/i.test(c)) ?? cols[0] ?? ''); }
      } else {
        const texto = await file.text();
        const p = parseCsvTexto(texto);
        setMaqs(m => [...m, { id, nome, arquivo: file.name, csv: p }]);
        if (colunas.length === 0) {
          setColunas(p.colunas); setTemCsv(true);
          const a = autoColunas(p.colunas); setColLat(a.lat); setColLng(a.lng); setColVal(a.valor);
        }
      }
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao ler o arquivo.'); }
  }
  function removerMaquina(id: string) {
    setMaqs(m => { const r = m.filter(x => x.id !== id); if (r.length === 0) { setColunas([]); } return r; });
  }

  const pontosPorMaq = useMemo(() => maqs.map(m => ({
    id: m.id, nome: m.nome, arquivo: m.arquivo,
    pontos: m.csv ? pontosDeCsv(m.csv, { lat: colLat, lng: colLng, valor: colVal }) : m.fc ? pontosDeGeojson(m.fc, colVal) : [] as PontoColheita[],
  })), [maqs, colLat, colLng, colVal]);
  const nPontosTotal = useMemo(() => pontosPorMaq.reduce((s, m) => s + m.pontos.length, 0), [pontosPorMaq]);
  const pontosBrutos = useMemo(() => pontosPorMaq.flatMap(m => m.pontos), [pontosPorMaq]);

  // Overlay no mapa: preview dos pontos BRUTOS em 5 classes (quintis) OU o grid processado.
  useEffect(() => {
    if (verBrutos && legenda && pontosBrutos.length) {
      const { dominio, stops } = rampaDaLegenda(legenda);
      const img = rasterizarPontos5(pontosBrutos, dominio, stops);
      if (img) { setFertilidadeOverlay({ url: img.dataUrl, coordinates: coordsFromBounds(img.bounds), opacity: 1 }); setFertilidadeLabels(null); setClassesBrutos(img.classes); return; }
    }
    setClassesBrutos(null);
    if (!res?.grid?.b64 || !legenda) { setFertilidadeOverlay(null); setFertilidadeLabels(null); return; }
    let url: string | undefined;
    try { url = colorirGridComLegenda(res.grid, legenda).dataUrl; } catch (e) { console.warn('[prod] colorir falhou:', e); }
    if (!url && res.png) url = res.png;
    if (!url) { setFertilidadeOverlay(null); return; }
    setFertilidadeOverlay({ url, coordinates: coordsFromBounds(res.bounds), opacity: 1 });
    setFertilidadeLabels(null);
  }, [verBrutos, pontosBrutos, res, legenda, setFertilidadeOverlay, setFertilidadeLabels]);

  // Auto-sugere o filtro bruto pelos dados (até o usuário editar manualmente).
  useEffect(() => {
    if (brutoTocado || nPontosTotal === 0) return;
    const todos: number[] = [];
    for (const m of pontosPorMaq) for (const p of m.pontos) todos.push(p.valor);
    const s = sugerirFiltroBruto(todos);
    setClean(c => ({ ...c, hard_min: s.min, hard_max: s.max }));
  }, [pontosPorMaq, nPontosTotal, brutoTocado]);

  const setCampoBruto = (patch: Partial<ParamsColheita>) => { setBrutoTocado(true); setClean(c => ({ ...c, ...patch })); };

  async function processar() {
    if (!poligono) { setErro('Limite do talhão não encontrado — abra o talhão no mapa.'); setEstado('erro'); return; }
    const machines = pontosPorMaq.filter(m => m.pontos.length).map(m => ({ nome: m.nome, pontos: m.pontos }));
    if (machines.reduce((s, m) => s + m.pontos.length, 0) < 10) { setErro('Poucos pontos importados.'); setEstado('erro'); return; }
    const leg = legendaInicial(cultura);
    if (!leg) { setErro('Legenda de produtividade não encontrada.'); setEstado('erro'); return; }
    setEstado('processando'); setErro('');
    try {
      const mr = parseFloat(mediaReal);
      const r = await processarColheita({ machines, cleaning: clean, poligono, pixelM, mediaRealKgha: isFinite(mr) && mr > 0 ? paraKgha(mr, unidade) : 0, legenda: leg });
      const st = statsDoGrid(r, r.relatorio.n_usados);
      if (!st) throw new Error('Não foi possível calcular o raster.');
      setRes(r); setStats(st); setLegenda(leg); setRelatorio(r.relatorio); setFresco(true); setEstado('pronto');
    } catch (e) { setEstado('erro'); setErro(e instanceof Error ? e.message : 'Falha ao processar.'); }
  }

  async function salvar() {
    if (!res || !stats || !nav.talhaoId) return;
    if (!cloudPodeGravar()) { setErro('Faça login para salvar o mapa.'); return; }
    const primeiro = versoes.filter(v => v.cultura === cultura && v.epoca === epoca).length === 0;
    const mr = parseFloat(mediaReal);
    const rec = saveMapaProdutividade({
      talhaoId: nav.talhaoId, safra, epoca, cultura, oficial: primeiro, unidade,
      nMaquinas: maqs.length, normalizado: clean.corrigir_colhedora,
      mediaRealKgha: isFinite(mr) && mr > 0 ? paraKgha(mr, unidade) : null,
      cleaning: clean as unknown as Record<string, number | boolean>,
      params: { removerZeros: true, pLo: 0, pHi: 100, min: clean.hard_min, max: clean.hard_max, pixelM },
      bounds: res.bounds,
      stats: { nPontos: nPontosTotal, nUsados: stats.nUsados, areaHa: stats.areaHa, producaoTotalKg: stats.producaoTotalKg, mediaKgha: stats.mediaKgha, minKgha: stats.minKgha, maxKgha: stats.maxKgha, cv: stats.cv },
      arquivo: maqs.map(m => m.arquivo).join(', '),
    });
    const gz = res.grid ? await comprimirGrid(res.grid) : undefined;
    cloudSalvarMapa(idProd(nav.talhaoId, rec.id), { resp: { bounds: res.bounds, grid: gz, stats: res.stats }, criadoEm: rec.criadoEm });
    setRasters(prev => ({ ...prev, [rec.id]: { bounds: res.bounds, grid: res.grid! } }));
    setFresco(false);
    recarregar();
  }

  function verVersao(v: MapaProdutividade) {
    const r = rasters[v.id];
    if (!r) { setErro('Raster desta versão não está na nuvem (reprocesse).'); return; }
    const leg = legendaInicial(v.cultura);
    setLegenda(leg ?? null); setRelatorio(null);
    setRes({ bounds: r.bounds, grid: r.grid, png: '', stats: { n: 0, modelo: 'idw', min: v.stats.minKgha, max: v.stats.maxKgha, nx: 0, ny: 0, pixel_m: v.params.pixelM, rmse: null, variograma: null } });
    setStats({ nUsados: v.stats.nUsados, areaHa: v.stats.areaHa, producaoTotalKg: v.stats.producaoTotalKg, mediaKgha: v.stats.mediaKgha, minKgha: v.stats.minKgha, maxKgha: v.stats.maxKgha, cv: v.stats.cv, histograma: [] });
    setUnidade(v.unidade); setFresco(false);
  }
  function tornarOficial(id: string) { setMapaProdutividadeOficial(id); recarregar(); }
  function excluir(v: MapaProdutividade) {
    if (!confirm(`Excluir o ${v.cultura} v${v.versao}?`)) return;
    deleteMapaProdutividade(v.id);
    if (nav.talhaoId) cloudSalvarMapa(idProd(nav.talhaoId, v.id), {});
    recarregar();
  }

  if (!safra) return <div className="px-4 py-3"><Aviso texto="Defina uma safra para o mapa de produtividade." /></div>;
  const proc = estado === 'processando';
  const u = (kgha: number) => fmt(emUnidade(kgha, unidade), unidade === 't/ha' ? 2 : unidade === 'sc/ha' ? 1 : 0);
  const varias = maqs.length > 1;

  return (
    <div className="px-4 py-3 space-y-3">
      {!cloudPodeGravar() && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
          <AlertTriangle size={13} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
          <p className="text-[10px]" style={{ color: '#fbbf24' }}><strong>Você não está logado</strong> — os mapas de produtividade não serão salvos.</p>
        </div>
      )}
      {!poligono && <Aviso texto="Limite do talhão não carregado no mapa." />}

      {/* Contexto */}
      <div className="grid grid-cols-3 gap-2">
        <Campo label="Cultura"><select value={cultura} onChange={e => setCultura(e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>{CULTURAS.map(c => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}</select></Campo>
        <Campo label="Época"><select value={epoca} onChange={e => setEpoca(e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>{EPOCAS.map(e2 => <option key={e2.v} value={e2.v}>{e2.l}</option>)}</select></Campo>
        <Campo label="Unidade"><select value={unidade} onChange={e => setUnidade(e.target.value as Unidade)} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>{(['kg/ha', 'sc/ha', 't/ha'] as Unidade[]).map(uu => <option key={uu} value={uu}>{uu}</option>)}</select></Campo>
      </div>

      {/* 1) Máquinas */}
      <Etapa n={1} titulo="Importar máquinas">
        <label className="flex items-center justify-center gap-1 py-1.5 rounded text-[10px] font-bold cursor-pointer" style={{ background: 'var(--invicta-blue-mid)', color: '#fff' }}>
          <Plus size={12} /> Adicionar máquina (CSV ou Shapefile .zip)
          <input type="file" accept=".csv,.zip" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) adicionarMaquina(f); e.currentTarget.value = ''; }} />
        </label>
        {pontosPorMaq.map(m => (
          <div key={m.id} className="flex items-center gap-2 text-[10px]" style={{ color: '#cbd5e1' }}>
            <FileSpreadsheet size={11} style={{ color: '#86efac' }} />
            <span className="font-semibold">{m.nome}</span>
            <span className="flex-1 truncate" style={{ color: '#64748b' }}>{m.arquivo} · {fmt(m.pontos.length)} pts</span>
            <button onClick={() => removerMaquina(m.id)} style={{ color: '#f87171' }}><Trash2 size={12} /></button>
          </div>
        ))}
        {colunas.length > 0 && (
          <div className="grid grid-cols-3 gap-1 pt-1">
            {temCsv && (<>
              <ColSel label="Latitude" v={colLat} set={setColLat} cols={colunas} />
              <ColSel label="Longitude" v={colLng} set={setColLng} cols={colunas} />
            </>)}
            <ColSel label="Produtividade" v={colVal} set={setColVal} cols={colunas} />
          </div>
        )}
      </Etapa>

      {/* 2) Unificação */}
      {maqs.length > 0 && (
        <Etapa n={2} titulo="Unificação (correção por colhedora)">
          <label className="flex items-center gap-1.5 text-[10px]" style={{ color: varias ? '#cbd5e1' : '#64748b' }}>
            <input type="checkbox" checked={clean.corrigir_colhedora} disabled={!varias} onChange={e => setClean(c => ({ ...c, corrigir_colhedora: e.target.checked }))} />
            Corrigir diferença entre colhedoras (escala cada máquina p/ a mediana geral)
          </label>
          {varias
            ? <label className="flex items-center gap-1.5 text-[10px]" style={{ color: '#cbd5e1' }}>
                <input type="checkbox" checked={clean.corrigir_colhedora_local} onChange={e => setClean(c => ({ ...c, corrigir_colhedora_local: e.target.checked }))} />
                + correção local entre colhedoras (por raio)
              </label>
            : <p className="text-[9px]" style={{ color: '#475569' }}>Só 1 máquina — sem o que unificar (adicione outra para ativar).</p>}
        </Etapa>
      )}

      {/* 3) Limpeza */}
      {nPontosTotal > 0 && (
        <Etapa n={3} titulo="Limpeza dos dados (oficial)">
          <div className="flex gap-2 items-end">
            <Num label="Excluir ≤ (kg/ha)" v={clean.hard_min} set={n => setCampoBruto({ hard_min: n })} />
            <Num label="Excluir > (kg/ha)" v={clean.hard_max} set={n => setCampoBruto({ hard_max: n })} />
            <Num label="Pixel (m)" v={pixelM} set={setPixelM} />
          </div>
          <button onClick={() => setAvancado(v => !v)} className="text-[10px] font-semibold flex items-center gap-1" style={{ color: '#93c5fd' }}>
            {avancado ? <ChevronUp size={11} /> : <ChevronDown size={11} />} MapFilter / parâmetros avançados
          </button>
          {avancado && (
            <div className="space-y-2 p-2 rounded" style={{ background: '#0b1f3a', border: '1px solid #1a3a6b' }}>
              <p className="text-[9px] font-semibold" style={{ color: '#93c5fd' }}>MapFilter (remoção de ruído/sobreposição)</p>
              <div className="flex gap-2">
                <Num label="Global ± %" v={Math.round(clean.mf_global_v * 100)} set={n => setClean(c => ({ ...c, mf_global_v: n / 100 }))} />
                <Num label="Raio local (m)" v={clean.mf_local_r} set={n => setClean(c => ({ ...c, mf_local_r: n }))} />
                <Num label="Local ± %" v={Math.round(clean.mf_local_v * 100)} set={n => setClean(c => ({ ...c, mf_local_v: n / 100 }))} />
              </div>
              <div className="flex gap-2">
                <Num label="Tol. ângulo (°)" v={clean.mf_aniso_tol} set={n => setClean(c => ({ ...c, mf_aniso_tol: n }))} />
                <Num label="Mín. vizinhos" v={clean.mf_min_neighbors} set={n => setClean(c => ({ ...c, mf_min_neighbors: n }))} />
                <Num label="Multiplicador" v={clean.multiplicador} set={n => setClean(c => ({ ...c, multiplicador: n }))} />
              </div>
              {varias && (
                <div className="flex gap-2">
                  <Num label="Colhedora ± %" v={Math.round(clean.limite_colhedora * 100)} set={n => setClean(c => ({ ...c, limite_colhedora: n / 100 }))} />
                  <Num label="Intensidade %" v={Math.round(clean.peso_colhedora * 100)} set={n => setClean(c => ({ ...c, peso_colhedora: n / 100 }))} />
                </div>
              )}
            </div>
          )}
          <p className="text-[10px]" style={{ color: '#94a3b8' }}>{fmt(nPontosTotal)} pontos importados de {maqs.length} {maqs.length === 1 ? 'máquina' : 'máquinas'}.</p>
          {legenda && (
            <div className="mt-1">
              <button onClick={() => setVerBrutos(v => !v)}
                className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded" style={{ background: verBrutos ? '#2e5fa3' : '#1a3a6b', color: verBrutos ? '#fff' : '#93c5fd' }}>
                <Eye size={11} /> {verBrutos ? 'Ocultar pontos brutos' : 'Ver pontos brutos (5 classes)'}
              </button>
              {verBrutos && classesBrutos && (
                <div className="flex gap-1 flex-wrap mt-1">
                  {classesBrutos.map((c, i) => (
                    <span key={i} className="flex items-center gap-1 text-[8px] px-1 py-0.5 rounded" style={{ background: '#061525', border: '1px solid #1a3a6b', color: '#cbd5e1' }}>
                      <span className="inline-block w-2 h-2 rounded-sm flex-shrink-0" style={{ background: c.cor }} />
                      {fmt(c.min)}–{fmt(c.max)} <span style={{ color: '#64748b' }}>({c.n})</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </Etapa>
      )}

      {/* 4) Interpolação */}
      {nPontosTotal > 0 && (
        <Etapa n={4} titulo="Interpolação (IDW)">
          <Campo label={`Média real (${rotuloUnidade(unidade)}) — opcional, calibra o mapa`}>
            <input type="number" value={mediaReal} onChange={e => setMediaReal(e.target.value)} placeholder="ex.: da balança/notas" className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
          </Campo>
          <button onClick={processar} disabled={proc || !poligono}
            className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5"
            style={{ background: proc ? '#1a3a6b' : 'var(--invicta-green-dark)', opacity: !poligono ? 0.6 : 1 }}>
            {proc ? <><Loader2 size={13} className="animate-spin" /> Limpando + interpolando…</> : <><Wand2 size={13} /> Processar mapa</>}
          </button>
          <p className="text-[9px]" style={{ color: '#475569' }}>Limpeza oficial (MapFilter + correção por colhedora) roda no backend — pode levar ~30–60 s em arquivos grandes.</p>
        </Etapa>
      )}

      {estado === 'erro' && <p className="text-[10px]" style={{ color: '#f87171' }}>{erro}</p>}

      {/* Resultado */}
      {res && stats && legenda && (
        <div className="space-y-2 p-2.5 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Metrica rotulo={`média (${rotuloUnidade(unidade)})`} valor={u(stats.mediaKgha)} destaque />
            <Metrica rotulo="área (ha)" valor={fmt(stats.areaHa, 1)} />
            <Metrica rotulo="produção (t)" valor={fmt(stats.producaoTotalKg / 1000, 1)} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Metrica rotulo={`mín (${rotuloUnidade(unidade)})`} valor={u(stats.minKgha)} />
            <Metrica rotulo={`máx (${rotuloUnidade(unidade)})`} valor={u(stats.maxKgha)} />
            <Metrica rotulo="CV" valor={`${fmt(stats.cv, 1)}%`} />
          </div>
          {relatorio && (
            <div className="text-[9px] leading-relaxed p-2 rounded" style={{ background: '#0b1f3a', color: '#94a3b8' }}>
              <strong style={{ color: '#86efac' }}>Limpeza:</strong> {fmt(relatorio.n_bruto)} brutos → filtro {fmt(relatorio.n_apos_filtro_bruto)} → MapFilter global −{fmt(relatorio.mapfilter_global_removidos)} → local −{fmt(relatorio.mapfilter_local_removidos)} → <strong style={{ color: '#86efac' }}>{fmt(relatorio.n_usados)} usados</strong>
              {relatorio.correcao_colhedora_global && <> · colhedoras corrigidas: {relatorio.correcao_colhedora_global.maquinas_corrigidas}</>}
              {relatorio.fator_media_real != null && <> · calibrado ×{fmt(relatorio.fator_media_real, 3)}</>}
            </div>
          )}
          {stats.histograma.length > 0 && <Histograma h={stats.histograma} unidade={unidade} />}
          <SeletorLegenda legendas={legendasProd} valorId={legenda.id}
            onEscolher={id => { const l = legendasProd.find(x => x.id === id); if (l) { setLegenda(l); escolherLegProd(id); } }} />
          <div className="h-3.5 rounded" style={{ border: '1px solid rgba(255,255,255,0.1)', background: gradienteCss(legenda) }} />
          <p className="text-[9px]" style={{ color: '#64748b' }}>{legenda.nome} · pixel {res.stats?.pixel_m ?? pixelM} m</p>
          {fresco && (
            cloudPodeGravar()
              ? <button onClick={salvar} className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5" style={{ background: 'var(--invicta-blue-mid)' }}><Save size={13} /> Salvar como Mapa Oficial</button>
              : <p className="text-[10px]" style={{ color: '#fbbf24' }}>Faça login para salvar.</p>
          )}
        </div>
      )}

      {/* Versões salvas */}
      {versoes.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold mb-1" style={{ color: '#64748b' }}>Mapas salvos ({versoes.length})</p>
          <div className="space-y-1">
            {versoes.map(v => (
              <div key={v.id} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: '#0b1f3a', border: '1px solid #1a3a6b' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold truncate" style={{ color: '#e2e8f0' }}>
                    {v.cultura[0].toUpperCase() + v.cultura.slice(1)} v{v.versao}
                    {v.oficial && <span className="ml-1 px-1 rounded text-[8px] font-bold" style={{ background: '#78350f', color: '#fbbf24' }}>OFICIAL</span>}
                  </p>
                  <p className="text-[9px]" style={{ color: '#64748b' }}>
                    {fmt(emUnidade(v.stats.mediaKgha, v.unidade), v.unidade === 'kg/ha' ? 0 : 1)} {v.unidade} méd · {fmt(v.stats.areaHa, 1)} ha · {fmt(v.stats.producaoTotalKg / 1000, 1)} t · CV {fmt(v.stats.cv, 1)}%
                  </p>
                </div>
                <button onClick={() => verVersao(v)} title="Ver no mapa" style={{ color: '#93c5fd' }}><Eye size={14} /></button>
                {!v.oficial && <button onClick={() => tornarOficial(v.id)} title="Tornar oficial" style={{ color: '#fbbf24' }}><Star size={14} /></button>}
                <button onClick={() => excluir(v)} title="Excluir" style={{ color: '#f87171' }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5) Comparar Produtividade × NDVI (+ relatório lado a lado) */}
      <ComparadorProdNdvi safraNome={safra} />
    </div>
  );
}

function Etapa({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-lg p-2.5 space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
      <p className="text-[11px] font-semibold flex items-center gap-1.5" style={{ color: '#93c5fd' }}>
        <span className="flex items-center justify-center rounded-full text-[9px] font-bold" style={{ width: 16, height: 16, background: 'var(--invicta-blue-mid)', color: '#fff' }}>{n}</span>
        {titulo}
      </p>
      {children}
    </div>
  );
}
function Campo({ label, children }: { label: string; children: ReactNode }) {
  return <div><label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>{label}</label>{children}</div>;
}
function ColSel({ label, v, set, cols }: { label: string; v: string; set: (s: string) => void; cols: string[] }) {
  return (
    <div>
      <label className="text-[9px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>{label}</label>
      <select value={v} onChange={e => set(e.target.value)} className="w-full rounded px-1.5 py-1 text-[10px] outline-none" style={inputStyle}>
        <option value="">—</option>
        {cols.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  );
}
function Num({ label, v, set }: { label: string; v: number; set: (n: number) => void }) {
  return (
    <div className="flex-1">
      <label className="text-[9px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>{label}</label>
      <input type="number" value={v} onChange={e => set(Number(e.target.value))} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
    </div>
  );
}
function Metrica({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="rounded-lg py-1.5" style={{ background: '#0b1f3a', border: '1px solid #1a3a6b' }}>
      <div className="text-sm font-bold" style={{ color: destaque ? '#86efac' : '#e2e8f0' }}>{valor}</div>
      <div className="text-[9px]" style={{ color: '#64748b' }}>{rotulo}</div>
    </div>
  );
}
function Histograma({ h, unidade }: { h: { x0: number; x1: number; n: number }[]; unidade: Unidade }) {
  const max = Math.max(...h.map(b => b.n), 1);
  const d = unidade === 'kg/ha' ? 0 : 1;
  return (
    <div>
      <div className="flex items-end gap-0.5 h-12">
        {h.map((b, i) => (
          <div key={i} className="flex-1 rounded-t" title={`${fmt(emUnidade(b.x0, unidade), d)}–${fmt(emUnidade(b.x1, unidade), d)} ${unidade}: ${b.n}`}
            style={{ height: `${(b.n / max) * 100}%`, background: 'var(--invicta-blue-mid)', minHeight: 1 }} />
        ))}
      </div>
      <div className="flex justify-between text-[8px] mt-0.5" style={{ color: '#64748b' }}>
        <span>{fmt(emUnidade(h[0].x0, unidade), d)}</span>
        <span>{fmt(emUnidade(h[h.length - 1].x1, unidade), d)} {unidade}</span>
      </div>
    </div>
  );
}
function Aviso({ texto }: { texto: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
      <AlertTriangle size={14} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
      <p className="text-[10px]" style={{ color: '#fbbf24' }}>{texto}</p>
    </div>
  );
}
