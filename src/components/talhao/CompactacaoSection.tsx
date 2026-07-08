'use client';

// Aba Compactação (penetrometria): importa pontos georreferenciados com a
// resistência (MPa) por profundidade (mapeamento de colunas), e interpola um
// raster por profundidade reaproveitando o motor da Fertilidade + a legenda
// oficial de Compactação. O raster usa o mesmo canal do mapa (fertilidadeOverlay)
// e é PERSISTIDO na nuvem (autoload + gzip), igual à Fertilidade.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import {
  getTalhoes, getLegendas, getImportacoesCompactacao, saveImportacaoCompactacao,
  deleteImportacaoCompactacao, getGradesCompactacao, saveGradeCompactacao, deleteGradeCompactacao,
  type ImportacaoCompactacao, type GradeCompactacao,
} from '@/lib/store';
import { gerarGrid, anguloMaiorDimensao } from '@/lib/grid';
import { getLeiturasCompact, pullLeiturasCompact } from '@/lib/coleta';
import { leiturasParaPontos } from '@/lib/compactacao';
import {
  interpolar, rampaDaLegenda, gradienteCss, coordsFromBounds, extrairPoligono,
  comprimirGrid, descomprimirGrid, type RespInterp,
} from '@/lib/fertilidade';
import { colorirGridComLegenda, temGrid } from '@/lib/raster';
import { cloudSalvarMapa, cloudCarregarMapasPorPrefixo, cloudExcluirMapasPorPrefixo } from '@/lib/cloud';
import { parseArquivoPontos, pontosCompactacao, type ArquivoPontos } from '@/lib/compactacao';
import type { Legenda } from '@/lib/legendas';
import { Upload, Loader2, Activity, Eraser, AlertTriangle, Save, Trash2, Play, Plus, Layers, Grid3x3, RefreshCw, MapPin, ChevronDown, ChevronUp } from 'lucide-react';

import { inputStyle } from '@/constants/ui';
import { fmtMax2 as fmt } from '@/lib/formato';

type Ponto = { lng: number; lat: number; valor: number };
type MapaPronto = { resp: RespInterp; labels: GeoJSON.FeatureCollection };

// Persistência na nuvem (coleção inv_mapas_fert, compartilhada): namespace
// próprio para não colidir com os mapas de fertilidade.
const prefixoNuvem = (talhaoId: string, importacaoId: string) => `compactacao__${talhaoId}__${importacaoId}__`;
const idNuvem = (talhaoId: string, importacaoId: string, prof: string) => `${prefixoNuvem(talhaoId, importacaoId)}${prof}`;

export function CompactacaoSection({ safraNome }: { safraNome?: string } = {}) {
  const { nav, uploadedGeo, setFertilidadeOverlay, setFertilidadeLabels } = useApp();
  const safra = safraNome ?? '';

  const legenda = useMemo<Legenda | null>(() => getLegendas().find(l => l.atributoId === 'compactacao') ?? null, []);

  const poligono = useMemo(() => {
    const p = extrairPoligono(uploadedGeo);
    if (p) return p;
    if (!nav.talhaoId) return null;
    const t = getTalhoes().find(x => x.id === nav.talhaoId);
    if (t?.geojson) { try { return extrairPoligono(JSON.parse(t.geojson)); } catch {} }
    return null;
  }, [uploadedGeo, nav.talhaoId]);

  const [importacoes, setImportacoes] = useState<ImportacaoCompactacao[]>([]);
  const [importacaoId, setImportacaoId] = useState('');
  const [profundidade, setProfundidade] = useState('');
  const [modoUpload, setModoUpload] = useState(false);

  // upload + mapeamento
  const inputRef = useRef<HTMLInputElement>(null);
  const [arq, setArq] = useState<ArquivoPontos | null>(null);
  const [colsSel, setColsSel] = useState<string[]>([]);
  const [nome, setNome] = useState('');
  const [parseErro, setParseErro] = useState('');

  // interpolação
  const [estado, setEstado] = useState<'idle' | 'processando' | 'pronto' | 'erro'>('idle');
  const [erro, setErro] = useState('');
  const [cache, setCache] = useState<Record<string, MapaPronto>>({});

  function recarregar() {
    if (nav.talhaoId && safra) {
      const lst = getImportacoesCompactacao(nav.talhaoId, safra);
      setImportacoes(lst);
      setImportacaoId(prev => prev || lst[0]?.id || '');
      if (lst.length === 0) setModoUpload(true);
    } else { setImportacoes([]); setImportacaoId(''); }
  }
  useEffect(recarregar, [nav.talhaoId, safra]); // eslint-disable-line react-hooks/exhaustive-deps

  const importacao = importacoes.find(i => i.id === importacaoId) ?? null;

  useEffect(() => { setProfundidade(importacao?.profundidades[0] ?? ''); }, [importacaoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autoload: hidrata da nuvem os rasters já interpolados desta importação.
  useEffect(() => {
    setCache({}); setEstado('idle'); setErro('');
    if (!nav.talhaoId || !importacaoId) return;
    const prefixo = prefixoNuvem(nav.talhaoId, importacaoId);
    (async () => {
      const carregados = await cloudCarregarMapasPorPrefixo<MapaPronto>(prefixo);
      if (carregados.length === 0) return;
      const novo: Record<string, MapaPronto> = {};
      for (const c of carregados) {
        const prof = c.id.slice(prefixo.length);
        const dados = c.dados;
        if (dados.resp?.grid?.comp === 'gz') {
          try { dados.resp.grid = await descomprimirGrid(dados.resp.grid); }
          catch (e) { console.warn('[compactacao] falha ao descomprimir grid:', e); }
        }
        novo[prof] = dados;
      }
      setCache(novo);
    })();
  }, [importacaoId, nav.talhaoId]);

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
      setColsSel(r.colunasNumericas);
      setNome(file.name.replace(/\.[^.]+$/, ''));
    } catch (err) {
      setParseErro(err instanceof Error ? err.message : 'Falha ao ler o arquivo.');
    }
  }

  function toggleCol(c: string) {
    setColsSel(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  }

  function salvarImportacao() {
    if (!arq || !nav.talhaoId || !safra || colsSel.length === 0) return;
    const nova = saveImportacaoCompactacao({
      talhaoId: nav.talhaoId, safra, nome: nome.trim() || 'Penetrometria',
      profundidades: colsSel,
      pontos: pontosCompactacao(arq.pontos, colsSel),
    });
    setArq(null); setColsSel([]); setNome(''); setModoUpload(false);
    setImportacoes(getImportacoesCompactacao(nav.talhaoId, safra));
    setImportacaoId(nova.id);
  }

  function pontosDe(prof: string): Ponto[] {
    if (!importacao) return [];
    const out: Ponto[] = [];
    for (const p of importacao.pontos) {
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
    if (!legenda) { setErro('Legenda de compactação não encontrada.'); setEstado('erro'); return; }
    if (!poligono) { setErro('Limite do talhão não encontrado — abra o talhão no mapa.'); setEstado('erro'); return; }
    const pts = pontosDe(prof);
    if (pts.length < 3) { setErro(`${prof}: menos de 3 pontos válidos.`); setEstado('erro'); return; }
    setEstado('processando'); setErro('');
    try {
      const { dominio, stops } = rampaDaLegenda(legenda);
      const resp = await interpolar({ pontos: pts, poligono, dominio, stops, metodo: 'krige', pixelM: 20, modeloFixo: null });
      const labels = fcLabels(pts);
      setCache(c => ({ ...c, [prof]: { resp, labels } }));
      setEstado('pronto');
      // Persiste na nuvem (grid comprimido; sem PNG — colorimos local).
      if (nav.talhaoId && importacaoId) {
        const gridGz = resp.grid ? await comprimirGrid(resp.grid) : undefined;
        const dados: MapaPronto = { resp: { ...resp, png: '', grid: gridGz }, labels };
        cloudSalvarMapa(idNuvem(nav.talhaoId, importacaoId, prof), dados);
      }
    } catch (e) {
      setEstado('erro'); setErro(e instanceof Error ? e.message : 'Falha ao interpolar.');
    }
  }

  function limparProf(prof: string) {
    setCache(c => { const n = { ...c }; delete n[prof]; return n; });
    if (nav.talhaoId && importacaoId) cloudExcluirMapasPorPrefixo(idNuvem(nav.talhaoId, importacaoId, prof));
  }

  function excluirImportacao() {
    if (!importacaoId) return;
    if (!confirm('Excluir esta importação de compactação (e seus mapas)?')) return;
    if (nav.talhaoId) cloudExcluirMapasPorPrefixo(prefixoNuvem(nav.talhaoId, importacaoId));
    deleteImportacaoCompactacao(importacaoId);
    setImportacaoId('');
    recarregar();
  }

  if (!safra) return <div className="px-6 py-4"><Aviso texto="Defina uma safra (no topo do talhão) para a compactação." /></div>;
  if (!legenda) return <div className="px-6 py-4"><Aviso texto="Legenda de Compactação não encontrada na Biblioteca (Sistema)." /></div>;

  const mostrarUpload = modoUpload || importacoes.length === 0;
  const processando = estado === 'processando';
  const mapasSalvos = Object.keys(cache).length;

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Seletor de importação + nova */}
      {importacoes.length > 0 && (
        <div>
          <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Importação de penetrometria</label>
          <div className="flex gap-1">
            <select value={importacaoId} onChange={e => setImportacaoId(e.target.value)} className="flex-1 rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
              {importacoes.map(i => <option key={i.id} value={i.id}>{i.nome} · {i.pontos.length} pts · {i.profundidades.length} prof.</option>)}
            </select>
            <button onClick={() => setModoUpload(v => !v)} title="Nova importação"
              className="px-2 py-1.5 rounded text-[10px] font-bold flex items-center gap-1" style={{ background: 'var(--invicta-green-dark)', color: '#fff' }}>
              <Plus size={11} />
            </button>
            {importacao && (
              <button onClick={excluirImportacao} title="Excluir importação"
                className="px-2 py-1.5 rounded text-[10px]" style={{ background: '#1a3a6b', color: '#f87171' }}>
                <Trash2 size={12} />
              </button>
            )}
          </div>
          {mapasSalvos > 0 && (
            <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: '#86efac' }}>
              <Layers size={10} /> {mapasSalvos} {mapasSalvos === 1 ? 'mapa salvo' : 'mapas salvos'} na nuvem — carregam sem reprocessar.
            </p>
          )}
        </div>
      )}

      {/* #36 — Grade de compactação: plataforma cria, app de campo coleta, aqui vira levantamento */}
      {nav.talhaoId && (
        <GradeCampo talhaoId={nav.talhaoId} safra={safra} poligono={poligono}
          onVerPontos={setFertilidadeLabels}
          onLevantamentoCriado={id => { recarregar(); setImportacaoId(id); setModoUpload(false); }} />
      )}

      {/* Upload + mapeamento de colunas */}
      {mostrarUpload && (
        <div className="rounded-lg p-3 space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
          <p className="text-[11px] font-semibold" style={{ color: '#93c5fd' }}>Importar pontos do penetrômetro</p>
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
              <div>
                <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>
                  Colunas de resistência (cada uma vira uma profundidade)
                </label>
                <div className="flex flex-wrap gap-1">
                  {arq.colunas.map(c => {
                    const sel = colsSel.includes(c);
                    const num = arq.colunasNumericas.includes(c);
                    return (
                      <button key={c} onClick={() => toggleCol(c)} title={num ? 'coluna numérica' : 'coluna de texto (provavelmente não é resistência)'}
                        className="px-2 py-1 rounded text-[10px] font-bold"
                        style={{ background: sel ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: sel ? '#fff' : (num ? '#93c5fd' : '#475569') }}>
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Nome da importação</label>
                <input value={nome} onChange={e => setNome(e.target.value)} className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
              </div>
              <button onClick={salvarImportacao} disabled={colsSel.length === 0}
                className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
                style={{ background: 'var(--invicta-green-dark)' }}>
                <Save size={12} /> Salvar importação ({colsSel.length} profundidades)
              </button>
            </>
          )}
        </div>
      )}

      {/* Profundidades + processar */}
      {importacao && importacao.profundidades.length > 0 && (
        <>
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Profundidade</label>
            <div className="flex flex-wrap gap-1">
              {importacao.profundidades.map(p => {
                const sel = p === profundidade;
                const feito = !!cache[p];
                return (
                  <button key={p} onClick={() => setProfundidade(p)} className="px-2 py-1 rounded text-[10px] font-bold"
                    style={{ background: sel ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: sel ? '#fff' : (feito ? '#86efac' : '#93c5fd') }}>
                    {p}{feito ? ' ✓' : ''}
                  </button>
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

          {/* Legenda + stats */}
          {cache[profundidade] && (
            <div className="space-y-2 p-2.5 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px]" style={{ color: '#86efac' }}>
                  <Activity size={12} /> {cache[profundidade].resp.stats.modelo} · {cache[profundidade].resp.stats.n} pts
                </div>
                <button onClick={() => limparProf(profundidade)}
                  className="flex items-center gap-1 text-[10px]" style={{ color: '#93c5fd' }}>
                  <Eraser size={11} /> Limpar
                </button>
              </div>
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

// ── #36 — Grade de compactação (coleta em campo) ─────────────────────────────
// Cria a grade de pontos NA PLATAFORMA (gerarGrid, o mesmo motor da Amostragem);
// o app de campo (/coleta → Compactação) navega até cada ponto e registra as
// leituras do penetrômetro por profundidade; aqui as leituras viram uma
// ImportacaoCompactacao e seguem o processamento normal (Interpolar).
const PROFS_PADRAO = '0-10, 10-20, 20-30, 30-40';

function GradeCampo({ talhaoId, safra, poligono, onVerPontos, onLevantamentoCriado }: {
  talhaoId: string;
  safra: string;
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  onVerPontos: (fc: GeoJSON.FeatureCollection | null) => void;
  onLevantamentoCriado: (importacaoId: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [grades, setGrades] = useState<GradeCompactacao[]>([]);
  const [criando, setCriando] = useState(false);
  const [densidade, setDensidade] = useState('1');       // ha por ponto
  const [borda, setBorda] = useState('10');              // m
  const [profsTxt, setProfsTxt] = useState(PROFS_PADRAO);
  const [unidade, setUnidade] = useState('MPa');
  const [msg, setMsg] = useState('');
  const [buscando, setBuscando] = useState<string | null>(null);
  const [leituras, setLeituras] = useState<Record<string, { coletadas: number; total: number }>>({});

  const recarregarGrades = () => setGrades(getGradesCompactacao(talhaoId, safra));
  useEffect(() => { recarregarGrades(); setLeituras({}); }, [talhaoId, safra]); // eslint-disable-line react-hooks/exhaustive-deps

  function criarGrade() {
    if (!poligono) { setMsg('Limite do talhão não encontrado.'); return; }
    const profundidades = profsTxt.split(',').map(s => s.trim()).filter(Boolean);
    if (profundidades.length === 0) { setMsg('Informe ao menos uma profundidade.'); return; }
    const dens = parseFloat(densidade.replace(',', '.'));
    if (!isFinite(dens) || dens <= 0) { setMsg('Densidade inválida (ha por ponto).'); return; }
    const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: poligono }] };
    const pts = gerarGrid({
      geojson: fc, densidadeHaPonto: dens, distanciaBordaM: parseFloat(borda.replace(',', '.')) || 0,
      rotacaoGraus: anguloMaiorDimensao(fc), aleatoriedade: 0, seed: 1, modo: 'inteligente',
    });
    if (pts.length === 0) { setMsg('Nenhum ponto coube no talhão com esses parâmetros.'); return; }
    saveGradeCompactacao({
      talhaoId, safra, nome: `Grade compactação ${grades.length + 1}`,
      profundidades, unidade, densidade: dens, distanciaBorda: parseFloat(borda.replace(',', '.')) || 0,
      pontos: pts.map(p => ({ ordem: p.ordem, lng: p.lng, lat: p.lat })),
    });
    setCriando(false); setMsg(`✓ Grade criada com ${pts.length} pontos — sincronize o app de campo para coletar.`);
    recarregarGrades();
  }

  function excluirGrade(g: GradeCompactacao) {
    if (!confirm(`Excluir a grade "${g.nome}" (${g.pontos.length} pontos)? As leituras já coletadas no campo não são apagadas.`)) return;
    deleteGradeCompactacao(g.id);
    recarregarGrades();
  }

  function verPontos(g: GradeCompactacao) {
    onVerPontos({
      type: 'FeatureCollection',
      features: g.pontos.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { txt: `C-${p.ordem + 1}` } })),
    });
    setMsg(`Pontos da ${g.nome} no mapa (interpolar uma profundidade substitui a visualização).`);
  }

  async function buscarLeituras(g: GradeCompactacao) {
    setBuscando(g.id); setMsg('');
    try { await pullLeiturasCompact(g.id); } catch { /* offline: usa o local */ }
    const ls = getLeiturasCompact(g.id);
    const coletadas = ls.filter(l => l.status === 'coletado').length;
    setLeituras(prev => ({ ...prev, [g.id]: { coletadas, total: g.pontos.length } }));
    if (coletadas === 0) setMsg('Nenhuma leitura coletada ainda para esta grade (o app de campo precisa sincronizar).');
    setBuscando(null);
  }

  function virarLevantamento(g: GradeCompactacao) {
    const ls = getLeiturasCompact(g.id);
    const pontos = leiturasParaPontos(ls, g.pontos);
    if (pontos.length === 0) { setMsg('Nenhuma leitura coletada com valores — nada para importar.'); return; }
    const nova = saveImportacaoCompactacao({
      talhaoId, safra, nome: `Campo · ${g.nome}`,
      profundidades: g.profundidades,
      pontos,
    });
    setMsg(`✓ Levantamento criado com ${pontos.length} pontos — interpole as profundidades abaixo.`);
    onLevantamentoCriado(nova.id);
  }

  return (
    <div className="rounded-lg p-2.5" style={{ background: '#0a1a2f', border: '1px solid #1a3a6b' }}>
      <button onClick={() => setAberto(a => !a)} className="w-full flex items-center justify-between text-[10px] font-semibold" style={{ color: '#93c5fd' }}>
        <span className="flex items-center gap-1.5"><Grid3x3 size={12} /> Grade de compactação (coleta em campo){grades.length > 0 ? ` · ${grades.length}` : ''}</span>
        {aberto ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {aberto && (
        <div className="mt-2 space-y-2">
          <p className="text-[9px] leading-relaxed" style={{ color: '#64748b' }}>
            Crie a grade de pontos aqui; no <strong>app de campo</strong> (módulo Compactação) o operador navega por GPS até cada ponto e registra as leituras do penetrômetro por profundidade. De volta, busque as leituras e vire um levantamento para interpolar.
          </p>

          {grades.map(g => {
            const info = leituras[g.id];
            return (
              <div key={g.id} className="rounded px-2 py-1.5 space-y-1" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold flex-1 truncate" style={{ color: '#e2e8f0' }}>{g.nome}</span>
                  <button onClick={() => verPontos(g)} title="Ver os pontos no mapa" className="p-1 rounded" style={{ color: '#93c5fd' }}><MapPin size={12} /></button>
                  <button onClick={() => excluirGrade(g)} title="Excluir grade" className="p-1 rounded" style={{ color: '#f87171' }}><Trash2 size={12} /></button>
                </div>
                <p className="text-[9px]" style={{ color: '#64748b' }}>
                  {g.pontos.length} pontos · {g.densidade} ha/ponto · prof.: {g.profundidades.join(' · ')} ({g.unidade})
                  {info && <span style={{ color: info.coletadas > 0 ? '#86efac' : '#fbbf24' }}> · {info.coletadas}/{info.total} coletados</span>}
                </p>
                <div className="flex gap-1">
                  <button onClick={() => void buscarLeituras(g)} disabled={buscando === g.id}
                    className="flex-1 py-1 rounded text-[10px] font-semibold flex items-center justify-center gap-1 disabled:opacity-50" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                    {buscando === g.id ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Buscar leituras do campo
                  </button>
                  {info && info.coletadas > 0 && (
                    <button onClick={() => virarLevantamento(g)}
                      className="flex-1 py-1 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1" style={{ background: 'var(--invicta-green-dark)' }}>
                      <Save size={11} /> Virar levantamento
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {criando ? (
            <div className="rounded px-2 py-2 space-y-1.5" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
              <div className="grid grid-cols-2 gap-1.5">
                <label className="text-[9px]" style={{ color: '#64748b' }}>Densidade (ha por ponto)
                  <input value={densidade} onChange={e => setDensidade(e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none mt-0.5" style={inputStyle} />
                </label>
                <label className="text-[9px]" style={{ color: '#64748b' }}>Distância da borda (m)
                  <input value={borda} onChange={e => setBorda(e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none mt-0.5" style={inputStyle} />
                </label>
              </div>
              <label className="text-[9px] block" style={{ color: '#64748b' }}>Profundidades (cm, separadas por vírgula)
                <input value={profsTxt} onChange={e => setProfsTxt(e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none mt-0.5" style={inputStyle} />
              </label>
              <label className="text-[9px] block" style={{ color: '#64748b' }}>Unidade da leitura
                <select value={unidade} onChange={e => setUnidade(e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none mt-0.5" style={inputStyle}>
                  <option value="MPa">MPa</option>
                  <option value="kgf/cm²">kgf/cm²</option>
                </select>
              </label>
              <div className="flex gap-1">
                <button onClick={criarGrade} className="flex-1 py-1.5 rounded text-[10px] font-bold text-white" style={{ background: 'var(--invicta-green-dark)' }}>Gerar grade</button>
                <button onClick={() => setCriando(false)} className="px-3 py-1.5 rounded text-[10px]" style={{ background: '#1a3a6b', color: '#cbd5e1' }}>Cancelar</button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setCriando(true); setMsg(''); }} disabled={!poligono}
              className="w-full py-1.5 rounded text-[10px] font-semibold flex items-center justify-center gap-1 disabled:opacity-40" style={{ background: '#1a3a6b', color: '#93c5fd', border: '1px dashed #2e5fa3' }}>
              <Plus size={11} /> Nova grade de compactação
            </button>
          )}

          {msg && <p className="text-[9px]" style={{ color: msg.startsWith('✓') ? '#86efac' : '#fbbf24' }}>{msg}</p>}
        </div>
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
