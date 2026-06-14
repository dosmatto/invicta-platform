'use client';

// Aba Compactação (penetrometria): importa pontos georreferenciados com a
// resistência (MPa) por profundidade (mapeamento de colunas), e interpola um
// raster por profundidade reaproveitando o motor da Fertilidade + a legenda
// oficial de Compactação. O raster usa o mesmo canal do mapa (fertilidadeOverlay).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import {
  getTalhoes, getLegendas, getImportacoesCompactacao, saveImportacaoCompactacao,
  deleteImportacaoCompactacao, type ImportacaoCompactacao,
} from '@/lib/store';
import { interpolar, rampaDaLegenda, gradienteCss, coordsFromBounds, extrairPoligono } from '@/lib/fertilidade';
import { colorirGridComLegenda, temGrid } from '@/lib/raster';
import { parseArquivoPontos, pontosCompactacao, type ArquivoPontos } from '@/lib/compactacao';
import type { Legenda } from '@/lib/legendas';
import { Upload, Loader2, Activity, Eraser, AlertTriangle, Save, Trash2, Play, Plus } from 'lucide-react';

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;
const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

type Ponto = { lng: number; lat: number; valor: number };
type MapaPronto = {
  url: string;
  coords: [[number, number], [number, number], [number, number], [number, number]];
  labels: GeoJSON.FeatureCollection;
  stats: { n: number; modelo: string };
};

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

  useEffect(() => { setProfundidade(importacao?.profundidades[0] ?? ''); setCache({}); }, [importacaoId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { setFertilidadeOverlay(null); setFertilidadeLabels(null); }, [setFertilidadeOverlay, setFertilidadeLabels]);

  // exibe o raster da profundidade selecionada (do cache da sessão)
  useEffect(() => {
    const c = cache[profundidade];
    if (c) { setFertilidadeOverlay({ url: c.url, coordinates: c.coords, opacity: 1 }); setFertilidadeLabels(c.labels); }
    else { setFertilidadeOverlay(null); setFertilidadeLabels(null); }
  }, [profundidade, cache, setFertilidadeOverlay, setFertilidadeLabels]);

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
    const lst = getImportacoesCompactacao(nav.talhaoId, safra);
    setImportacoes(lst);
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
      let url = '';
      if (temGrid(resp)) { try { url = colorirGridComLegenda(resp.grid!, legenda).dataUrl; } catch { /* cai no png */ } }
      if (!url) url = resp.png;
      setCache(c => ({ ...c, [prof]: { url, coords: coordsFromBounds(resp.bounds), labels: fcLabels(pts), stats: { n: resp.stats.n, modelo: resp.stats.modelo } } }));
      setEstado('pronto');
    } catch (e) {
      setEstado('erro'); setErro(e instanceof Error ? e.message : 'Falha ao interpolar.');
    }
  }

  function excluirImportacao() {
    if (!importacaoId) return;
    if (!confirm('Excluir esta importação de compactação?')) return;
    deleteImportacaoCompactacao(importacaoId);
    setImportacaoId('');
    recarregar();
  }

  if (!safra) return <div className="px-6 py-4"><Aviso texto="Defina uma safra (no topo do talhão) para a compactação." /></div>;
  if (!legenda) return <div className="px-6 py-4"><Aviso texto="Legenda de Compactação não encontrada na Biblioteca (Sistema)." /></div>;

  const mostrarUpload = modoUpload || importacoes.length === 0;
  const processando = estado === 'processando';

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
        </div>
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
                  <Activity size={12} /> {cache[profundidade].stats.modelo} · {cache[profundidade].stats.n} pts
                </div>
                <button onClick={() => setCache(c => { const n = { ...c }; delete n[profundidade]; return n; })}
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

function Aviso({ texto }: { texto: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
      <AlertTriangle size={14} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
      <p className="text-[10px]" style={{ color: '#fbbf24' }}>{texto}</p>
    </div>
  );
}
