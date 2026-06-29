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
import { parseArquivoPontos, pontosCondutividade, avaliarQualidade, CORES_QUALIDADE, sugerirProfundidadesCEa, ehColunaAltitude, prepararPontosKrigagem, type ArquivoPontos } from '@/lib/condutividade';
import type { Legenda } from '@/lib/legendas';
import { Upload, Loader2, Zap, Eraser, AlertTriangle, Save, Trash2, Play, Plus, Layers, Star, Gauge, Mountain } from 'lucide-react';

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;
const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

type Ponto = { lng: number; lat: number; valor: number };
type MapaPronto = { resp: RespInterp; labels: GeoJSON.FeatureCollection };

// Persistência na nuvem (coleção inv_mapas_fert, compartilhada): namespace próprio.
const prefixoNuvem = (talhaoId: string, levId: string) => `condutividade__${talhaoId}__${levId}__`;
const idNuvem = (talhaoId: string, levId: string, prof: string) => `${prefixoNuvem(talhaoId, levId)}${prof}`;

export function CondutividadeSection() {
  const { nav, uploadedGeo, setFertilidadeOverlay, setFertilidadeLabels } = useApp();

  const legenda = useMemo<Legenda | null>(() => getLegendas().find(l => l.atributoId === 'condutividade') ?? null, []);

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

  // interpolação
  const [estado, setEstado] = useState<'idle' | 'processando' | 'pronto' | 'erro'>('idle');
  const [erro, setErro] = useState('');
  const [binMsg, setBinMsg] = useState<Record<string, string>>({});  // resumo do binning por profundidade
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

  useEffect(() => { setProfundidade(lev?.profundidades[0] ?? ''); }, [levId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autoload: hidrata da nuvem os rasters já interpolados deste levantamento.
  useEffect(() => {
    setCache({}); setEstado('idle'); setErro('');
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

  useEffect(() => () => { setFertilidadeOverlay(null); setFertilidadeLabels(null); }, [setFertilidadeOverlay, setFertilidadeLabels]);

  // exibe o raster da profundidade selecionada (colore local a partir do grid)
  useEffect(() => {
    const c = cache[profundidade];
    if (!c || !legenda) { setFertilidadeOverlay(null); setFertilidadeLabels(null); return; }
    let url = '';
    if (temGrid(c.resp)) { try { url = colorirGridComLegenda(c.resp.grid!, legenda).dataUrl; } catch { /* cai no png */ } }
    if (!url && c.resp.png) url = c.resp.png;
    if (!url) { setFertilidadeOverlay(null); setFertilidadeLabels(null); return; }
    setFertilidadeOverlay({ url, coordinates: coordsFromBounds(c.resp.bounds), opacity: 1 });
    setFertilidadeLabels(c.labels);
  }, [profundidade, cache, legenda, setFertilidadeOverlay, setFertilidadeLabels]);

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
  function fcLabels(pts: Ponto[]): GeoJSON.FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: pts.map(p => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { txt: fmt(p.valor) },
      })),
    };
  }

  async function processar(prof: string) {
    if (!legenda) { setErro('Legenda de condutividade não encontrada.'); setEstado('erro'); return; }
    if (!poligono) { setErro('Limite do talhão não encontrado — abra o talhão no mapa.'); setEstado('erro'); return; }
    const pts = pontosDe(prof);
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
      const labels = fcLabels(pts);
      setCache(c => ({ ...c, [prof]: { resp, labels } }));
      setEstado('pronto');
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
  if (!legenda) return <div className="px-6 py-4"><Aviso texto="Legenda de Condutividade não encontrada na Biblioteca (Sistema)." /></div>;

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

      {/* Profundidades + processar */}
      {lev && lev.profundidades.length > 0 && (
        <>
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Profundidade (★ = camada oficial · clique no ★ para definir)</label>
            <div className="flex flex-wrap gap-1">
              {lev.profundidades.map(p => {
                const sel = p === profundidade;
                const feito = !!cache[p];
                const oficial = lev.profundidadeOficial === p;
                return (
                  <div key={p} className="flex items-center rounded overflow-hidden" style={{ border: `1px solid ${sel ? '#60a5fa' : '#1a3a6b'}` }}>
                    <button onClick={() => setProfundidade(p)} className="px-2 py-1 text-[10px] font-bold"
                      style={{ background: sel ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: sel ? '#fff' : (feito ? '#86efac' : '#93c5fd') }}>
                      {p}{feito ? ' ✓' : ''}
                    </button>
                    <button onClick={() => definirProfOficial(p)} title={oficial ? 'camada oficial' : 'definir como oficial'}
                      className="px-1.5 py-1" style={{ background: '#0b1f3a' }}>
                      <Star size={11} fill={oficial ? '#fbbf24' : 'none'} style={{ color: oficial ? '#fbbf24' : '#475569' }} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <button onClick={() => processar(profundidade)} disabled={processando || !poligono || !profundidade}
            className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5"
            style={{ background: (processando || !poligono) ? '#1a3a6b' : 'var(--invicta-green-dark)' }}>
            {processando ? <><Loader2 size={13} className="animate-spin" /> Interpolando…</> : <><Play size={13} /> Interpolar {profundidade}</>}
          </button>

          {estado === 'erro' && <p className="text-[10px]" style={{ color: '#f87171' }}>{erro}</p>}

          {/* Índice de qualidade + legenda + stats */}
          {cache[profundidade] && qual && (
            <div className="space-y-2 p-2.5 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px]" style={{ color: '#86efac' }}>
                  <Zap size={12} /> {cache[profundidade].resp.stats.modelo}{binMsg[profundidade] ? ` · ${binMsg[profundidade]}` : ` · ${cache[profundidade].resp.stats.n} pts`}
                </div>
                <button onClick={() => limparProf(profundidade)} className="flex items-center gap-1 text-[10px]" style={{ color: '#93c5fd' }}>
                  <Eraser size={11} /> Limpar
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

              {/* Legenda */}
              <div>
                <div className="relative h-4 rounded overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)', background: gradienteCss(legenda) }} />
                <div className="flex justify-between text-[8px] mt-0.5" style={{ color: '#94a3b8' }}>
                  {legenda.classes.map((c, i) => c.valorMax != null && i < legenda.classes.length - 1 ? <span key={i}>{fmt(c.valorMax)}</span> : null)}
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

function Aviso({ texto }: { texto: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
      <AlertTriangle size={14} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
      <p className="text-[10px]" style={{ color: '#fbbf24' }}>{texto}</p>
    </div>
  );
}
