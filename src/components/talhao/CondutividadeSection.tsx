'use client';

// Aba Condutividade Elétrica (CEa) — VARIÁVEL FIXA do talhão (não por safra).
// Importa pontos georreferenciados (mesmo parser da Compactação), interpola um
// raster por profundidade (krigagem automática do motor da Fertilidade) e avalia
// a QUALIDADE do levantamento. Cada levantamento é uma VERSÃO; uma é a OFICIAL,
// e dentro dela o usuário escolhe a profundidade oficial. Persistido na nuvem
// (autoload + gzip), igual à Fertilidade/Compactação.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import {
  getTalhoes, getLegendas, getCondutividade, saveCondutividade, deleteCondutividade,
  setCondutividadeOficial, setProfundidadeOficialCondutividade, type LevantamentoCondutividade,
} from '@/lib/store';
import {
  interpolar, rampaDaLegenda, gradienteCss, coordsFromBounds, extrairPoligono,
  comprimirGrid, descomprimirGrid, type RespInterp,
} from '@/lib/fertilidade';
import { colorirGridComLegenda, temGrid } from '@/lib/raster';
import { cloudSalvarMapa, cloudCarregarMapasPorPrefixo, cloudExcluirMapasPorPrefixo } from '@/lib/cloud';
import { parseArquivoPontos, pontosCondutividade, avaliarQualidade, CORES_QUALIDADE, sugerirProfundidadesCEa, ehColunaAltitude, prepararPontosKrigagem, limparPontosEC, rasterizarPontos, type ArquivoPontos, type RelatorioLimpeza } from '@/lib/condutividade';
import type { Legenda } from '@/lib/legendas';
import { Upload, Loader2, Zap, Eraser, AlertTriangle, Save, Trash2, Play, Plus, Layers, Star, Gauge, Mountain, SlidersHorizontal, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;
const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

// Parâmetros padrão da limpeza (MapFilter). Vêm preenchidos e são editáveis.
const PARAMS_LIMPEZA_PADRAO = { p_clip: 1, mf_global_v: 0.5, mf_local_r: 25, mf_local_v: 0.15, mf_aniso_tol: 25, mf_min_neighbors: 4 } as const;
type ParamsLimpeza = { [K in keyof typeof PARAMS_LIMPEZA_PADRAO]: number };

// Legenda para uma variável EXTRA (ex.: Altitude → Altimetria). Resolve pela
// natureza da coluna; null se não houver legenda compatível.
function legendaParaExtra(coluna: string): Legenda | null {
  const todas = getLegendas();
  if (ehColunaAltitude(coluna)) return todas.find(l => l.atributoId === 'altimetria' || l.categoria === 'altimetria-elevacao') ?? null;
  const norm = coluna.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return todas.find(l => l.atributoId === norm) ?? null;
}

type Ponto = { lng: number; lat: number; valor: number };
type MapaPronto = { resp: RespInterp; labels: GeoJSON.FeatureCollection };

// Persistência na nuvem (coleção inv_mapas_fert, compartilhada): namespace próprio.
const prefixoNuvem = (talhaoId: string, levId: string) => `condutividade__${talhaoId}__${levId}__`;
const idNuvem = (talhaoId: string, levId: string, prof: string) => `${prefixoNuvem(talhaoId, levId)}${prof}`;

export function CondutividadeSection() {
  const { nav, uploadedGeo, setFertilidadeOverlay, setFertilidadeLabels, setPontosSimulados } = useApp();

  // Legendas disponíveis p/ condutividade (por atributoId OU categoria) — o usuário
  // escolhe qual aplicar (ex.: a fixa ou a de quartil). A escolha fica lembrada.
  const legendasDisp = useMemo<Legenda[]>(() => getLegendas().filter(l => l.atributoId === 'condutividade' || l.categoria === 'condutividade'), []);
  const [legId, setLegId] = useState<string>(() => (typeof window !== 'undefined' ? localStorage.getItem('inv_leg_pref_condutividade') : null) ?? '');
  const legendaCea = useMemo<Legenda | null>(() => legendasDisp.find(l => l.id === legId) ?? legendasDisp[0] ?? null, [legendasDisp, legId]);
  function escolherLegenda(id: string) { setLegId(id); try { localStorage.setItem('inv_leg_pref_condutividade', id); } catch {} }

  const poligono = useMemo(() => {
    const p = extrairPoligono(uploadedGeo);
    if (p) return p;
    if (!nav.talhaoId) return null;
    const t = getTalhoes().find(x => x.id === nav.talhaoId);
    if (t?.geojson) { try { return extrairPoligono(JSON.parse(t.geojson)); } catch {} }
    return null;
  }, [uploadedGeo, nav.talhaoId]);

  const [levs, setLevs] = useState<LevantamentoCondutividade[]>([]);
  const [levId, setLevId] = useState('');
  const [profundidade, setProfundidade] = useState('');
  const [modoUpload, setModoUpload] = useState(false);

  // upload + mapeamento
  const inputRef = useRef<HTMLInputElement>(null);
  const [arq, setArq] = useState<ArquivoPontos | null>(null);
  const [depthsSel, setDepthsSel] = useState<string[]>([]);   // colunas de CEa (≥1)
  const [extrasSel, setExtrasSel] = useState<string[]>([]);   // outras variáveis (altitude…)
  const [fixaSet, setFixaSet] = useState<Set<string>>(new Set());  // extras marcadas como Variável Fixa
  const [nome, setNome] = useState('');
  const [data, setData] = useState('');
  const [parseErro, setParseErro] = useState('');

  // limpeza (MapFilter) + interpolação
  const [estado, setEstado] = useState<'idle' | 'processando' | 'pronto' | 'erro'>('idle');
  const [erro, setErro] = useState('');
  const [binMsg, setBinMsg] = useState<Record<string, string>>({});  // resumo do binning por profundidade
  const [vista, setVista] = useState<'bruto' | 'limpo' | 'mapa'>('mapa');  // o que o mapa mostra
  const [limpos, setLimpos] = useState<Record<string, { pontos: Ponto[]; rel: RelatorioLimpeza }>>({});
  const [limpando, setLimpando] = useState(false);
  const [vistaInfo, setVistaInfo] = useState<{ n: number; min: number; max: number } | null>(null);  // pontos plotados
  const [params, setParams] = useState<ParamsLimpeza>({ ...PARAMS_LIMPEZA_PADRAO });
  const [paramsAberto, setParamsAberto] = useState(false);
  const setParam = (k: keyof ParamsLimpeza, v: number) => setParams(p => ({ ...p, [k]: v }));
  const [cache, setCache] = useState<Record<string, MapaPronto>>({});

  function recarregar() {
    if (nav.talhaoId) {
      const lst = getCondutividade(nav.talhaoId);
      setLevs(lst);
      setLevId(prev => prev || lst[0]?.id || '');
      if (lst.length === 0) setModoUpload(true);
    } else { setLevs([]); setLevId(''); }
  }
  useEffect(recarregar, [nav.talhaoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const lev = levs.find(l => l.id === levId) ?? null;

  // Camadas da aba: profundidade(s) de CEa + variáveis fixas EXTRAS que têm legenda
  // (ex.: Altitude → Altimetria). Cada camada usa a SUA legenda.
  const camadas = useMemo(() => {
    const out: Array<{ nome: string; legenda: Legenda; tipo: 'cea' | 'extra' }> = [];
    if (legendaCea) for (const p of (lev?.profundidades ?? [])) out.push({ nome: p, legenda: legendaCea, tipo: 'cea' });
    for (const ex of (lev?.extras ?? [])) {
      if (!ex.fixa) continue;
      const lg = legendaParaExtra(ex.coluna);
      if (lg) out.push({ nome: ex.coluna, legenda: lg, tipo: 'extra' });
    }
    return out;
  }, [lev, legendaCea]);
  const camadaSel = camadas.find(c => c.nome === profundidade) ?? camadas[0] ?? null;
  const legenda = camadaSel?.legenda ?? legendaCea;   // legenda da camada selecionada

  useEffect(() => { setProfundidade(lev?.profundidades[0] ?? ''); }, [levId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autoload: hidrata da nuvem os rasters já interpolados deste levantamento.
  useEffect(() => {
    setCache({}); setEstado('idle'); setErro(''); setLimpos({}); setBinMsg({}); setVista('mapa');
    if (!nav.talhaoId || !levId) return;
    const prefixo = prefixoNuvem(nav.talhaoId, levId);
    (async () => {
      const carregados = await cloudCarregarMapasPorPrefixo<MapaPronto>(prefixo);
      if (carregados.length === 0) return;
      const novo: Record<string, MapaPronto> = {};
      for (const c of carregados) {
        const prof = c.id.slice(prefixo.length);
        const dados = c.dados;
        if (dados.resp?.grid?.comp === 'gz') {
          try { dados.resp.grid = await descomprimirGrid(dados.resp.grid); }
          catch (e) { console.warn('[condutividade] falha ao descomprimir grid:', e); }
        }
        novo[prof] = dados;
      }
      setCache(novo);
    })();
  }, [levId, nav.talhaoId]);

  useEffect(() => () => { setFertilidadeOverlay(null); setFertilidadeLabels(null); setPontosSimulados(null); }, [setFertilidadeOverlay, setFertilidadeLabels, setPontosSimulados]);

  // Renderiza no mapa conforme a VISTA: pontos brutos / pontos limpos / mapa krigado.
  useEffect(() => {
    setFertilidadeLabels(null);
    setPontosSimulados(null);
    // Pontos (brutos ou limpos) RASTERIZADOS numa imagem colorida pela legenda
    // (mesmo canal do raster de fertilidade — renderiza de forma confiável).
    if ((vista === 'bruto' || vista === 'limpo') && legenda) {
      const pts = vista === 'bruto' ? pontosDe(profundidade) : (limpos[profundidade]?.pontos ?? []);
      const { dominio, stops } = rampaDaLegenda(legenda);
      const img = rasterizarPontos(pts, dominio, stops);
      if (!img) { setFertilidadeOverlay(null); setVistaInfo(null); return; }
      setFertilidadeOverlay({ url: img.dataUrl, coordinates: coordsFromBounds(img.bounds), opacity: 1 });
      setVistaInfo({ n: pts.length, min: img.min, max: img.max });
      return;
    }
    // Mapa krigado (raster)
    setVistaInfo(null);
    const c = cache[profundidade];
    if (!c || !legenda) { setFertilidadeOverlay(null); return; }
    let url = '';
    if (temGrid(c.resp)) { try { url = colorirGridComLegenda(c.resp.grid!, legenda).dataUrl; } catch { /* cai no png */ } }
    if (!url && c.resp.png) url = c.resp.png;
    if (!url) { setFertilidadeOverlay(null); return; }
    setFertilidadeOverlay({ url, coordinates: coordsFromBounds(c.resp.bounds), opacity: 1 });
  }, [vista, profundidade, cache, limpos, legenda, setFertilidadeOverlay, setFertilidadeLabels, setPontosSimulados]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setParseErro(''); setArq(null);
    try {
      const r = await parseArquivoPontos(file);
      setArq(r);
      setDepthsSel(sugerirProfundidadesCEa(r.colunasNumericas));  // só as colunas de CEa
      setExtrasSel([]);
      setFixaSet(new Set());
      setNome(file.name.replace(/\.[^.]+$/, ''));
    } catch (err) {
      setParseErro(err instanceof Error ? err.message : 'Falha ao ler o arquivo.');
    }
  }

  // Profundidade e Extra são papéis EXCLUSIVOS de cada coluna.
  function toggleDepth(c: string) {
    setDepthsSel(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
    setExtrasSel(prev => prev.filter(x => x !== c));
  }
  function toggleExtra(c: string) {
    setExtrasSel(prev => {
      const on = prev.includes(c);
      if (on) setFixaSet(s => { const n = new Set(s); n.delete(c); return n; });
      return on ? prev.filter(x => x !== c) : [...prev, c];
    });
    setDepthsSel(prev => prev.filter(x => x !== c));
  }
  function toggleFixa(c: string) {
    setFixaSet(prev => { const n = new Set(prev); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  }

  function salvarLevantamento() {
    if (!arq || !nav.talhaoId || depthsSel.length === 0) return;
    const nova = saveCondutividade({
      talhaoId: nav.talhaoId, nome: nome.trim() || 'Levantamento de CEa',
      data: data || undefined,
      profundidades: depthsSel,
      profundidadeOficial: depthsSel[0],
      extras: extrasSel.map(c => ({ coluna: c, fixa: fixaSet.has(c) })),
      oficial: false,  // saveCondutividade marca a 1ª do talhão como oficial sozinho
      pontos: pontosCondutividade(arq.pontos, [...depthsSel, ...extrasSel]),
    });
    setArq(null); setDepthsSel([]); setExtrasSel([]); setFixaSet(new Set()); setNome(''); setData(''); setModoUpload(false);
    setLevs(getCondutividade(nav.talhaoId));
    setLevId(nova.id);
  }

  function pontosDe(prof: string): Ponto[] {
    if (!lev) return [];
    const out: Ponto[] = [];
    for (const p of lev.pontos) {
      const v = p.valores[prof];
      if (v == null || !isFinite(v)) continue;
      out.push({ lng: p.lng, lat: p.lat, valor: v });
    }
    return out;
  }
  // Etapa de LIMPEZA (MapFilter) — antes de interpolar. Mostra os pontos limpos.
  async function limpar(prof: string) {
    const pts = pontosDe(prof);
    if (pts.length < 3) { setErro(`${prof}: poucos pontos.`); setEstado('erro'); return; }
    setLimpando(true); setErro('');
    try {
      const r = await limparPontosEC(pts, params);
      setLimpos(l => ({ ...l, [prof]: { pontos: r.pontos as Ponto[], rel: r.relatorio } }));
      setVista('limpo');
    } catch (e) {
      setEstado('erro'); setErro(e instanceof Error ? e.message : 'Falha na limpeza.');
    } finally { setLimpando(false); }
  }

  async function processar(prof: string) {
    if (!legenda) { setErro('Legenda de condutividade não encontrada.'); setEstado('erro'); return; }
    if (!poligono) { setErro('Limite do talhão não encontrado — abra o talhão no mapa.'); setEstado('erro'); return; }
    // Usa os pontos LIMPOS se a limpeza já rodou; senão os brutos.
    const pts = limpos[prof]?.pontos ?? pontosDe(prof);
    if (pts.length < 3) { setErro(`${prof}: menos de 3 pontos válidos.`); setEstado('erro'); return; }
    setEstado('processando'); setErro('');
    try {
      const { dominio, stops } = rampaDaLegenda(legenda);
      // EC é dado DENSO → krigagem pura travaria (matriz N×N). Agregamos os pontos
      // numa grade fina (média por célula) p/ reduzir N e limpar ruído, e krigamos
      // as médias (variograma automático + validação cruzada → RMSE p/ a qualidade).
      const { pontos: ptsK, binM, original } = prepararPontosKrigagem(pts);
      setBinMsg(b => ({ ...b, [prof]: binM > 0 ? `krigagem · ${ptsK.length} células de ${original} pts (grade ${binM.toFixed(0)} m)` : `krigagem · ${ptsK.length} pts` }));
      const resp = await interpolar({ pontos: ptsK, poligono, dominio, stops, metodo: 'krige', pixelM: 20, modeloFixo: null });
      const labels: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };  // EC denso → sem rótulo por ponto
      setCache(c => ({ ...c, [prof]: { resp, labels } }));
      setEstado('pronto'); setVista('mapa');
      if (nav.talhaoId && levId) {
        const gridGz = resp.grid ? await comprimirGrid(resp.grid) : undefined;
        const dados: MapaPronto = { resp: { ...resp, png: '', grid: gridGz }, labels };
        cloudSalvarMapa(idNuvem(nav.talhaoId, levId, prof), dados);
      }
    } catch (e) {
      setEstado('erro'); setErro(e instanceof Error ? e.message : 'Falha ao interpolar.');
    }
  }

  function limparProf(prof: string) {
    setCache(c => { const n = { ...c }; delete n[prof]; return n; });
    if (nav.talhaoId && levId) cloudExcluirMapasPorPrefixo(idNuvem(nav.talhaoId, levId, prof));
  }

  function tornarOficial() {
    if (!lev || !nav.talhaoId) return;
    setCondutividadeOficial(lev.id);
    setLevs(getCondutividade(nav.talhaoId));
  }

  function definirProfOficial(prof: string) {
    if (!lev || !nav.talhaoId) return;
    setProfundidadeOficialCondutividade(lev.id, prof);
    setLevs(getCondutividade(nav.talhaoId));
  }

  function excluirLevantamento() {
    if (!levId) return;
    if (!confirm('Excluir esta versão de condutividade (e seus mapas)?')) return;
    if (nav.talhaoId) cloudExcluirMapasPorPrefixo(prefixoNuvem(nav.talhaoId, levId));
    deleteCondutividade(levId);
    setLevId('');
    recarregar();
  }

  if (!nav.talhaoId) return <div className="px-6 py-4"><Aviso texto="Abra um talhão para registrar a condutividade elétrica." /></div>;
  if (!legendaCea) return <div className="px-6 py-4"><Aviso texto="Legenda de Condutividade não encontrada na Biblioteca (Sistema)." /></div>;

  const mostrarUpload = modoUpload || levs.length === 0;
  const processando = estado === 'processando';
  const mapasSalvos = Object.keys(cache).length;
  const qual = cache[profundidade]
    ? avaliarQualidade({ n: cache[profundidade].resp.stats.n, rmse: cache[profundidade].resp.stats.rmse, min: cache[profundidade].resp.stats.min, max: cache[profundidade].resp.stats.max })
    : null;

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Cabeçalho — variável fixa */}
      <div className="flex items-start gap-2 p-2 rounded-lg" style={{ background: '#0b1f3a', border: '1px solid #1e3a8a' }}>
        <Zap size={14} className="flex-shrink-0 mt-0.5" style={{ color: '#fbbf24' }} />
        <p className="text-[10px] leading-relaxed" style={{ color: '#93c5fd' }}>
          <strong style={{ color: '#cbd5e1' }}>Variável Fixa do Talhão.</strong> A condutividade é estrutural: fica vinculada ao talhão e pode ter várias versões — uma é a <strong style={{ color: '#fbbf24' }}>oficial</strong> (base para as Zonas de Manejo).
        </p>
      </div>

      {/* Seletor de versão (levantamento) + nova */}
      {levs.length > 0 && (
        <div>
          <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Versão (levantamento)</label>
          <div className="flex gap-1">
            <select value={levId} onChange={e => setLevId(e.target.value)} className="flex-1 rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
              {levs.map(l => <option key={l.id} value={l.id}>{l.oficial ? '★ ' : ''}{l.nome}{l.data ? ` · ${l.data}` : ''} · {l.pontos.length} pts</option>)}
            </select>
            <button onClick={() => setModoUpload(v => !v)} title="Nova versão"
              className="px-2 py-1.5 rounded text-[10px] font-bold flex items-center gap-1" style={{ background: 'var(--invicta-green-dark)', color: '#fff' }}>
              <Plus size={11} />
            </button>
            {lev && (
              <button onClick={excluirLevantamento} title="Excluir versão"
                className="px-2 py-1.5 rounded text-[10px]" style={{ background: '#1a3a6b', color: '#f87171' }}>
                <Trash2 size={12} />
              </button>
            )}
          </div>
          {lev && (
            <div className="flex items-center gap-2 mt-1">
              {lev.oficial
                ? <span className="text-[10px] flex items-center gap-1 font-bold" style={{ color: '#fbbf24' }}><Star size={10} fill="#fbbf24" /> Versão oficial</span>
                : <button onClick={tornarOficial} className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: '#1a3a6b', color: '#93c5fd' }}>Tornar oficial</button>}
              {mapasSalvos > 0 && (
                <span className="text-[10px] flex items-center gap-1 ml-auto" style={{ color: '#86efac' }}>
                  <Layers size={10} /> {mapasSalvos} {mapasSalvos === 1 ? 'mapa salvo' : 'mapas salvos'}
                </span>
              )}
            </div>
          )}
          {lev?.extras && lev.extras.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <span className="text-[9px]" style={{ color: '#64748b' }}>Outras variáveis:</span>
              {lev.extras.map(ex => (
                <span key={ex.coluna} className="text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1"
                  style={{ background: '#0b1f3a', color: ex.fixa ? '#fbbf24' : '#93c5fd', border: '1px solid #1a3a6b' }}>
                  {ex.fixa && <Star size={8} fill="#fbbf24" style={{ color: '#fbbf24' }} />}{ex.coluna}
                </span>
              ))}
              <span className="text-[9px]" style={{ color: '#475569' }}>· armazenadas (uso como camada fixa em breve)</span>
            </div>
          )}
        </div>
      )}

      {/* Upload + mapeamento de colunas */}
      {mostrarUpload && (
        <div className="rounded-lg p-3 space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
          <p className="text-[11px] font-semibold" style={{ color: '#93c5fd' }}>Importar pontos de condutividade</p>
          <button onClick={() => inputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold"
            style={{ background: '#1a3a6b', color: '#93c5fd', border: '1px dashed #2e5fa3' }}>
            <Upload size={13} /> Escolher arquivo (SHP .zip · KML · GeoJSON · CSV · XLSX)
          </button>
          <input ref={inputRef} type="file" accept=".zip,.kml,.geojson,.json,.csv,.txt,.xls,.xlsx" className="hidden" onChange={onFile} />
          {parseErro && <p className="text-[10px]" style={{ color: '#f87171' }}>{parseErro}</p>}

          {arq && (
            <>
              <p className="text-[10px]" style={{ color: '#86efac' }}>{arq.pontos.length} pontos lidos.</p>

              {/* Grupo 1 — Profundidade(s) de CEa (≥1 obrigatório) */}
              <div>
                <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>
                  Profundidade(s) de Condutividade — escolha <strong style={{ color: '#93c5fd' }}>1 ou mais</strong> (obrigatório)
                </label>
                <div className="flex flex-wrap gap-1">
                  {arq.colunasNumericas.map(c => {
                    const sel = depthsSel.includes(c);
                    return (
                      <button key={c} onClick={() => toggleDepth(c)}
                        className="px-2 py-1 rounded text-[10px] font-bold"
                        style={{ background: sel ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: sel ? '#fff' : '#93c5fd' }}>
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Grupo 2 — Outras variáveis (opcional) + marcar como Variável Fixa */}
              <div>
                <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>
                  Outras variáveis a importar (opcional) — ex.: altitude · ★ = guardar como Variável Fixa
                </label>
                {arq.colunasNumericas.filter(c => !depthsSel.includes(c)).length === 0 ? (
                  <p className="text-[9px]" style={{ color: '#475569' }}>Nenhuma coluna numérica sobrando.</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {arq.colunasNumericas.filter(c => !depthsSel.includes(c)).map(c => {
                      const sel = extrasSel.includes(c);
                      const fixa = fixaSet.has(c);
                      const alt = ehColunaAltitude(c);
                      return (
                        <div key={c} className="flex items-center rounded overflow-hidden" style={{ border: `1px solid ${sel ? '#60a5fa' : '#1a3a6b'}` }}>
                          <button onClick={() => toggleExtra(c)} title={alt ? 'altitude (candidata a Altimetria)' : 'importar esta variável junto'}
                            className="px-2 py-1 text-[10px] font-bold flex items-center gap-1"
                            style={{ background: sel ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: sel ? '#fff' : '#93c5fd' }}>
                            {alt && <Mountain size={9} />} {c}
                          </button>
                          {sel && (
                            <button onClick={() => toggleFixa(c)} title={fixa ? 'marcada como Variável Fixa' : 'marcar como Variável Fixa do talhão'}
                              className="px-1.5 py-1" style={{ background: '#0b1f3a' }}>
                              <Star size={11} fill={fixa ? '#fbbf24' : 'none'} style={{ color: fixa ? '#fbbf24' : '#475569' }} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Nome da versão</label>
                  <input value={nome} onChange={e => setNome(e.target.value)} className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
                </div>
                <div>
                  <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Data (opcional)</label>
                  <input type="date" value={data} onChange={e => setData(e.target.value)} className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
                </div>
              </div>
              <button onClick={salvarLevantamento} disabled={depthsSel.length === 0}
                className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
                style={{ background: 'var(--invicta-green-dark)' }}>
                <Save size={12} /> Salvar versão ({depthsSel.length} prof.{extrasSel.length > 0 ? ` + ${extrasSel.length} variáve${extrasSel.length !== 1 ? 'is' : 'l'}` : ''})
              </button>
              {depthsSel.length === 0 && <p className="text-[9px]" style={{ color: '#fbbf24' }}>Escolha ao menos uma profundidade de condutividade.</p>}
            </>
          )}
        </div>
      )}

      {/* Camadas (CEa + variáveis fixas extras) + processar */}
      {lev && camadas.length > 0 && (
        <>
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Camada (★ = profundidade oficial de CEa · extras viram camada fixa própria)</label>
            <div className="flex flex-wrap gap-1">
              {camadas.map(c => {
                const sel = c.nome === profundidade;
                const feito = !!cache[c.nome];
                const oficial = c.tipo === 'cea' && lev.profundidadeOficial === c.nome;
                return (
                  <div key={c.nome} className="flex items-center rounded overflow-hidden" style={{ border: `1px solid ${sel ? '#60a5fa' : '#1a3a6b'}` }}>
                    <button onClick={() => setProfundidade(c.nome)} className="px-2 py-1 text-[10px] font-bold flex items-center gap-1"
                      style={{ background: sel ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: sel ? '#fff' : (feito ? '#86efac' : '#93c5fd') }}>
                      {c.tipo === 'extra' && <Mountain size={9} />}{c.nome}{c.tipo === 'extra' ? ` · ${c.legenda.atributo}` : ''}{feito ? ' ✓' : ''}
                    </button>
                    {c.tipo === 'cea' && (
                      <button onClick={() => definirProfOficial(c.nome)} title={oficial ? 'camada oficial' : 'definir como oficial'}
                        className="px-1.5 py-1" style={{ background: '#0b1f3a' }}>
                        <Star size={11} fill={oficial ? '#fbbf24' : 'none'} style={{ color: oficial ? '#fbbf24' : '#475569' }} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Fluxo: Pontos brutos → Limpar (MapFilter) → Interpolar */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <span className="text-[9px]" style={{ color: '#64748b' }}>Ver no mapa:</span>
              {([['bruto', 'Pontos brutos'], ['limpo', 'Pontos limpos'], ['mapa', 'Mapa krigado']] as const).map(([v, t]) => {
                const dis = v === 'limpo' ? !limpos[profundidade] : v === 'mapa' ? !cache[profundidade] : false;
                const sel = vista === v;
                return (
                  <button key={v} disabled={dis} onClick={() => setVista(v)}
                    className="px-2 py-0.5 rounded text-[10px] font-semibold disabled:opacity-30"
                    style={{ background: sel ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: sel ? '#fff' : '#93c5fd' }}>{t}</button>
                );
              })}
            </div>
            {(vista === 'bruto' || vista === 'limpo') && vistaInfo && (
              <p className="text-[9px] flex items-center gap-1.5" style={{ color: '#86efac' }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#86efac' }} />
                {vistaInfo.n.toLocaleString('pt-BR')} pontos ({vista === 'bruto' ? 'brutos' : 'limpos'}) · {legenda?.simbolo ?? 'CEa'} {fmt(vistaInfo.min)}–{fmt(vistaInfo.max)} {legenda?.unidade ?? ''}
              </p>
            )}
            {/* Parâmetros da limpeza (recolhível; vêm com padrão, editáveis) */}
            <div>
              <button onClick={() => setParamsAberto(v => !v)} className="flex items-center gap-1 text-[9px] font-semibold" style={{ color: '#93c5fd' }}>
                <SlidersHorizontal size={10} /> Parâmetros da limpeza {paramsAberto ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              </button>
              {paramsAberto && (
                <div className="mt-1 p-2 rounded space-y-1.5" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                  <ParamRow label="Filtro bruto — corte por cauda (%)" hint="remove zeros e valores absurdos" value={params.p_clip} step={0.5} min={0} onChange={v => setParam('p_clip', v)} />
                  <ParamRow label="Global — faixa ± da mediana (%)" hint="mantém perto da mediana geral" value={Math.round(params.mf_global_v * 100)} step={5} min={0} onChange={v => setParam('mf_global_v', v / 100)} />
                  <ParamRow label="Local — raio de busca (m)" hint="vizinhança considerada na passada" value={params.mf_local_r} step={5} min={1} onChange={v => setParam('mf_local_r', v)} />
                  <ParamRow label="Local — faixa ± dos vizinhos (%)" hint="remove quem destoa dos vizinhos" value={Math.round(params.mf_local_v * 100)} step={5} min={0} onChange={v => setParam('mf_local_v', v / 100)} />
                  <ParamRow label="Local — tolerância do eixo (°)" hint="ângulo ao longo da passada" value={params.mf_aniso_tol} step={5} min={0} onChange={v => setParam('mf_aniso_tol', v)} />
                  <ParamRow label="Local — mínimo de vizinhos" value={params.mf_min_neighbors} step={1} min={1} onChange={v => setParam('mf_min_neighbors', Math.round(v))} />
                  <button onClick={() => setParams({ ...PARAMS_LIMPEZA_PADRAO })} className="flex items-center gap-1 text-[9px] font-semibold" style={{ color: '#fbbf24' }}>
                    <RotateCcw size={10} /> Restaurar padrões
                  </button>
                  <p className="text-[8px] leading-relaxed" style={{ color: '#475569' }}>Mude um parâmetro e clique em <strong>Limpar</strong> de novo para ver quantos/quais pontos saem (compare em &quot;Pontos limpos&quot;).</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => limpar(profundidade)} disabled={limpando || !profundidade}
                className="py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5"
                style={{ background: limpando ? '#1a3a6b' : 'var(--invicta-blue-mid)' }}>
                {limpando ? <><Loader2 size={13} className="animate-spin" /> Limpando…</> : <><Eraser size={13} /> Limpar (MapFilter)</>}
              </button>
              <button onClick={() => processar(profundidade)} disabled={processando || !poligono || !profundidade}
                className="py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5"
                style={{ background: (processando || !poligono) ? '#1a3a6b' : 'var(--invicta-green-dark)' }}>
                {processando ? <><Loader2 size={13} className="animate-spin" /> Interpolando…</> : <><Play size={13} /> Interpolar{limpos[profundidade] ? ' (limpos)' : ''}</>}
              </button>
            </div>
            {limpos[profundidade] && (() => {
              const r = limpos[profundidade].rel;
              const filtroRem = r.n_bruto - r.n_apos_filtro_bruto;
              const aposGlobal = r.n_apos_filtro_bruto - r.mapfilter_global_removidos;
              const removido = r.n_bruto - r.n_limpo;
              const pKept = r.n_bruto > 0 ? (r.n_limpo / r.n_bruto) * 100 : 0;
              const nf = (n: number) => n.toLocaleString('pt-BR');
              const Etapa = ({ rotulo, det, rem, resta, cor }: { rotulo: string; det: string; rem: number; resta: number; cor: string }) => (
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cor }} />
                  <span style={{ color: '#cbd5e1' }}>{rotulo}</span>
                  <span className="text-[9px]" style={{ color: '#475569' }}>{det}</span>
                  <span className="ml-auto font-semibold" style={{ color: '#f87171' }}>−{nf(rem)}</span>
                  <span className="tabular-nums" style={{ color: '#64748b', minWidth: 46, textAlign: 'right' }}>{nf(resta)}</span>
                </div>
              );
              return (
                <div className="p-2.5 rounded-lg space-y-1.5" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                  <div className="flex items-center gap-1.5">
                    <Eraser size={12} style={{ color: '#93c5fd' }} />
                    <span className="text-[11px] font-bold" style={{ color: '#cbd5e1' }}>Resumo da limpeza</span>
                    <span className="text-[9px] ml-auto" style={{ color: '#64748b' }}>MapFilter</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span style={{ color: '#94a3b8' }}>Pontos brutos</span>
                    <span className="font-bold tabular-nums" style={{ color: '#e2e8f0' }}>{nf(r.n_bruto)}</span>
                  </div>
                  <div className="space-y-1 pl-0.5">
                    <Etapa rotulo="Filtro bruto" det="zeros / absurdos" rem={filtroRem} resta={r.n_apos_filtro_bruto} cor="#f59e0b" />
                    <Etapa rotulo="MapFilter global" det="mediana ± faixa" rem={r.mapfilter_global_removidos} resta={aposGlobal} cor="#3b82f6" />
                    <Etapa rotulo="MapFilter local" det="vizinhança da passada" rem={r.mapfilter_local_removidos} resta={r.n_limpo} cor="#a855f7" />
                  </div>
                  <div className="flex items-center justify-between pt-1 text-[11px]" style={{ borderTop: '1px solid #1a3a6b' }}>
                    <span className="font-bold" style={{ color: '#86efac' }}>Pontos limpos</span>
                    <span className="font-bold tabular-nums" style={{ color: '#86efac' }}>{nf(r.n_limpo)}</span>
                  </div>
                  {/* barra mantido (verde) × removido (vermelho) */}
                  <div className="h-2.5 rounded overflow-hidden flex" style={{ border: '1px solid #1a3a6b' }}>
                    <div style={{ width: `${pKept}%`, background: '#16a34a' }} />
                    <div style={{ width: `${100 - pKept}%`, background: '#dc2626' }} />
                  </div>
                  <div className="flex justify-between text-[9px]">
                    <span style={{ color: '#86efac' }}>mantido {Math.round(pKept)}%</span>
                    <span style={{ color: '#f87171' }}>removido {nf(removido)} ({r.perc_removido}%)</span>
                  </div>
                </div>
              );
            })()}
            <p className="text-[9px]" style={{ color: '#475569' }}>Veja os pontos brutos, rode a limpeza (filtra outliers/ruído pelo MapFilter) e interpole sobre os pontos limpos.</p>
          </div>

          {estado === 'erro' && <p className="text-[10px]" style={{ color: '#f87171' }}>{erro}</p>}

          {/* Índice de qualidade + legenda + stats */}
          {cache[profundidade] && qual && legenda && (
            <div className="space-y-2 p-2.5 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px]" style={{ color: '#86efac' }}>
                  <Zap size={12} /> {cache[profundidade].resp.stats.modelo}{binMsg[profundidade] ? ` · ${binMsg[profundidade]}` : ` · ${cache[profundidade].resp.stats.n} pts`}
                </div>
                <button onClick={() => limparProf(profundidade)} title="Apagar o mapa interpolado" className="flex items-center gap-1 text-[10px]" style={{ color: '#93c5fd' }}>
                  <Trash2 size={11} /> Apagar
                </button>
              </div>

              {/* Índice de Qualidade */}
              <div className="p-2 rounded" style={{ background: CORES_QUALIDADE[qual.classe].bg, border: `1px solid ${CORES_QUALIDADE[qual.classe].cor}33` }}>
                <div className="flex items-center gap-2">
                  <Gauge size={13} style={{ color: CORES_QUALIDADE[qual.classe].cor }} />
                  <span className="text-[11px] font-bold" style={{ color: CORES_QUALIDADE[qual.classe].cor }}>Qualidade: {qual.classe}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-bold ml-auto" style={{ background: qual.apto ? '#0f2a1a' : '#2a0f12', color: qual.apto ? '#86efac' : '#f87171' }}>
                    {qual.apto ? 'apto p/ Zonas de Manejo' : 'não recomendado p/ Zonas'}
                  </span>
                </div>
                <p className="text-[9px] mt-1 leading-relaxed" style={{ color: '#94a3b8' }}>
                  {qual.motivo} {qual.rmse != null && <>RMSE {fmt(qual.rmse)} {legenda.unidade}.</>} Limpeza dos dados entra na próxima fase.
                </p>
              </div>

              {/* Seletor de legenda (trocar fixa ↔ quartil ↔ outras de condutividade) — só p/ camada de CEa; extras usam a legenda do seu atributo */}
              {camadaSel?.tipo === 'cea' && legendasDisp.length > 1 && (
                <div>
                  <label className="text-[9px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Legenda do mapa</label>
                  <select value={legenda?.id ?? ''} onChange={e => escolherLegenda(e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>
                    {legendasDisp.map(l => <option key={l.id} value={l.id}>{l.nome}{l.escalaRelativa ? ` · ${l.escalaRelativa === 'quantil' ? 'quartil' : 'mín–máx'}` : ' · fixa'}</option>)}
                  </select>
                </div>
              )}

              {/* Legenda */}
              <div>
                <div className="relative h-4 rounded overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)', background: gradienteCss(legenda) }} />
                <div className="flex justify-between text-[8px] mt-0.5" style={{ color: '#94a3b8' }}>
                  {legenda.escalaRelativa
                    ? <><span>menor</span><span style={{ color: '#64748b' }}>{legenda.escalaRelativa === 'quantil' ? 'por quartil (área igual)' : 'mín–máx'}</span><span>maior</span></>
                    : legenda.classes.map((c, i) => c.valorMax != null && i < legenda.classes.length - 1 ? <span key={i}>{fmt(c.valorMax)}</span> : null)}
                </div>
              </div>
              <p className="text-[9px]" style={{ color: '#64748b' }}>{legenda.atributo} · {legenda.unidade} ({legenda.metodo})</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ParamRow({ label, hint, value, step, min, onChange }: { label: string; hint?: string; value: number; step: number; min: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-[9px]" style={{ color: '#cbd5e1' }}>{label}</div>
        {hint && <div className="text-[8px]" style={{ color: '#475569' }}>{hint}</div>}
      </div>
      <input type="number" value={value} step={step} min={min}
        onChange={e => onChange(Math.max(min, Number(e.target.value.replace(',', '.')) || 0))}
        className="w-16 rounded px-1.5 py-1 text-[10px] outline-none flex-shrink-0" style={inputStyle} />
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
