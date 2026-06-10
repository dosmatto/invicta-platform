'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { getSafras, getGrades, getImportacoesLab, getTalhoes, type ImportacaoLab, type GradeAmostragem } from '@/lib/store';
import {
  interpolar, rampaDaLegenda, gradienteCss, coordsFromBounds, extrairPoligono, legendaPorId,
  type RespInterp,
} from '@/lib/fertilidade';
import { Play, Layers, Loader2, Eraser, AlertTriangle, Activity, Settings } from 'lucide-react';

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;
const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

type Ponto = { lng: number; lat: number; valor: number };
type MapaPronto = { resp: RespInterp; labels: GeoJSON.FeatureCollection };
// chave do cache = nutriente + profundidade (cada combinação é um mapa)
const ck = (nut: string, prof: string) => `${nut}__${prof}`;

export function FertilidadeSection() {
  const { nav, uploadedGeo, setFertilidadeOverlay, setFertilidadeLabels } = useApp();

  const safraAtiva = useMemo(() => getSafras().find(s => s.ativa) ?? null, []);
  const safraNome = safraAtiva?.nome ?? '';

  const [importacoes, setImportacoes] = useState<ImportacaoLab[]>([]);
  const [importacaoId, setImportacaoId] = useState('');
  const [nutriente, setNutriente] = useState('');        // nutriente exibido
  const [profundidade, setProfundidade] = useState('');  // profundidade exibida
  const [opacity, setOpacity] = useState(0.75);
  const [metodo, setMetodo] = useState<'krige' | 'idw'>('krige');
  const [pixelM, setPixelM] = useState(20);          // tamanho do pixel (m)
  const [modeloFixo, setModeloFixo] = useState('');  // '' = variograma automático
  const [cfgAberto, setCfgAberto] = useState(false); // painel "Configurações da interpolação"
  const [estado, setEstado] = useState<'idle' | 'processando' | 'pronto' | 'erro'>('idle');
  const [erro, setErro] = useState('');
  const [progresso, setProgresso] = useState<{ atual: number; total: number; nome: string } | null>(null);
  // cache dos mapas já interpolados (nutriente+profundidade) para a importação/método atual
  const [cache, setCache] = useState<Record<string, MapaPronto>>({});

  useEffect(() => {
    if (nav.talhaoId && safraNome) setImportacoes(getImportacoesLab(nav.talhaoId, safraNome));
  }, [nav.talhaoId, safraNome]);

  const importacao = importacoes.find(i => i.id === importacaoId) ?? null;

  const grade = useMemo<GradeAmostragem | null>(() => {
    if (!importacao || !nav.talhaoId) return null;
    return getGrades(nav.talhaoId, safraNome).find(g => g.id === importacao.gradeId) ?? null;
  }, [importacao, nav.talhaoId, safraNome]);

  const pontoPorNumero = useMemo(() => {
    const m = new Map<number, { lng: number; lat: number }>();
    (grade?.pontos ?? []).forEach(p => m.set(p.numero ?? p.ordem + 1, { lng: p.lng, lat: p.lat }));
    return m;
  }, [grade]);

  const poligono = useMemo(() => {
    const p = extrairPoligono(uploadedGeo);
    if (p) return p;
    if (!nav.talhaoId) return null;
    const t = getTalhoes().find(x => x.id === nav.talhaoId);
    if (t?.geojson) { try { return extrairPoligono(JSON.parse(t.geojson)); } catch {} }
    return null;
  }, [uploadedGeo, nav.talhaoId]);

  const nutrientes = useMemo(() => (importacao?.elementos ?? []).filter(id => !!legendaPorId(id)), [importacao]);
  const profundidades = useMemo(
    () => (importacao ? [...new Set(importacao.resultados.map(r => r.profundidade).filter(Boolean))] : []),
    [importacao],
  );
  const profsAll = profundidades.length ? profundidades : [profundidade];

  // pontos (lng/lat/valor) de UM nutriente numa profundidade
  function pontosDe(nut: string, prof: string): Ponto[] {
    if (!importacao || !nut) return [];
    const out: Ponto[] = [];
    for (const r of importacao.resultados) {
      if (r.profundidade !== prof) continue;
      const v = r.valores[nut];
      if (v == null || !isFinite(v)) continue;
      const pt = pontoPorNumero.get(r.numero);
      if (pt) out.push({ lng: pt.lng, lat: pt.lat, valor: v });
    }
    return out;
  }
  function fcLabels(pts: Ponto[]): GeoJSON.FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: pts.map(p => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: { txt: fmt(p.valor) },
      })),
    };
  }

  // defaults ao trocar de importação
  useEffect(() => {
    setNutriente(nutrientes[0] ?? '');
    setProfundidade(profundidades[0] ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importacaoId]);

  // trocar importação ou método invalida TODO o cache (profundidade NÃO — ficam todas em cache)
  useEffect(() => { setCache({}); setEstado('idle'); setErro(''); }, [importacaoId, metodo, pixelM, modeloFixo]);

  // exibe no mapa o mapa do nutriente + profundidade selecionados (ou limpa)
  useEffect(() => {
    const r = cache[ck(nutriente, profundidade)];
    if (r) {
      setFertilidadeOverlay({ url: r.resp.png, coordinates: coordsFromBounds(r.resp.bounds), opacity });
      setFertilidadeLabels(r.labels);
    } else {
      setFertilidadeOverlay(null);
      setFertilidadeLabels(null);
    }
  }, [cache, nutriente, profundidade, opacity, setFertilidadeOverlay, setFertilidadeLabels]);

  useEffect(() => () => { setFertilidadeOverlay(null); setFertilidadeLabels(null); }, [setFertilidadeOverlay, setFertilidadeLabels]);

  const pontosInterp = useMemo(() => pontosDe(nutriente, profundidade), [nutriente, profundidade, importacao, pontoPorNumero]); // eslint-disable-line react-hooks/exhaustive-deps
  const leg = nutriente ? legendaPorId(nutriente) : undefined;
  const ramp = leg ? rampaDaLegenda(leg) : null;

  async function processarUm(nut: string, prof: string) {
    const l = legendaPorId(nut);
    if (!l) throw new Error(`${nut}: sem legenda`);
    const pts = pontosDe(nut, prof);
    if (pts.length < 3) throw new Error(`${l.simbolo} ${prof}: menos de 3 pontos`);
    const { dominio, stops } = rampaDaLegenda(l);
    const resp = await interpolar({ pontos: pts, poligono: poligono!, dominio, stops, metodo, pixelM, modeloFixo: modeloFixo || null });
    setCache(c => ({ ...c, [ck(nut, prof)]: { resp, labels: fcLabels(pts) } }));
  }

  async function processar() {
    if (!poligono) { setErro('Limite do talhão não encontrado — abra o talhão no mapa.'); setEstado('erro'); return; }
    if (!nutriente) { setErro('Selecione uma variável.'); setEstado('erro'); return; }
    setEstado('processando'); setErro('');
    try { await processarUm(nutriente, profundidade); setEstado('pronto'); }
    catch (e) { setEstado('erro'); setErro(e instanceof Error ? e.message : 'Falha ao processar.'); }
  }

  // processa TODOS os nutrientes em TODAS as profundidades, de uma vez
  async function processarTodos() {
    if (!poligono) { setErro('Limite do talhão não encontrado — abra o talhão no mapa.'); setEstado('erro'); return; }
    if (nutrientes.length === 0) return;
    setEstado('processando'); setErro('');
    const total = nutrientes.length * profsAll.length;
    const falhas: string[] = [];
    let i = 0;
    for (const prof of profsAll) {
      for (const nut of nutrientes) {
        i++;
        setProgresso({ atual: i, total, nome: `${legendaPorId(nut)?.simbolo ?? nut} ${prof}` });
        try { await processarUm(nut, prof); } catch { falhas.push(`${legendaPorId(nut)?.simbolo ?? nut} ${prof}`); }
      }
    }
    setProgresso(null);
    setEstado(falhas.length === total ? 'erro' : 'pronto');
    setErro(falhas.length ? `Não processou: ${falhas.join(', ')}.` : '');
  }

  function limpar() { setCache({}); setEstado('idle'); setErro(''); }

  if (!safraAtiva) return <div className="px-6 py-4"><Aviso texto="Defina uma safra ativa (no topo do talhão) para gerar o mapa de fertilidade." /></div>;
  if (importacoes.length === 0) return <div className="px-6 py-4"><Aviso texto="Importe resultados de laboratório (seção acima) — o mapa de fertilidade é gerado a partir deles." /></div>;

  const processando = estado === 'processando';
  const stats = cache[ck(nutriente, profundidade)]?.resp.stats;
  const totalMapas = nutrientes.length * profsAll.length;
  const feitosNaProf = nutrientes.filter(n => cache[ck(n, profundidade)]).length;

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Importação */}
      <div>
        <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Importação (laboratório / campanha)</label>
        <select value={importacaoId} onChange={e => setImportacaoId(e.target.value)} className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
          <option value="">Selecione a importação…</option>
          {importacoes.map(i => <option key={i.id} value={i.id}>{i.laboratorio}{i.campanha ? ` · ${i.campanha}` : ''} · {i.resultados.length} amostras</option>)}
        </select>
      </div>

      {importacao && (
        <>
          {/* Configurações da interpolação (recolhível; pixel padrão 20×20 m) */}
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #1a3a6b' }}>
            <button onClick={() => setCfgAberto(v => !v)} className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10px] font-semibold" style={{ background: '#061525', color: '#93c5fd' }}>
              <span className="flex items-center gap-1"><Settings size={12} /> Configurações da interpolação</span>
              <span style={{ color: '#64748b' }}>{metodo === 'idw' ? 'IDW' : `Krigagem · ${modeloFixo || 'auto'}`} · {pixelM} m {cfgAberto ? '▴' : '▾'}</span>
            </button>
            {cfgAberto && (
              <div className="px-2.5 py-2 space-y-2" style={{ background: '#061525' }}>
                <div>
                  <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Interpolador</label>
                  <div className="flex gap-1">
                    {(['krige', 'idw'] as const).map(mt => (
                      <button key={mt} onClick={() => setMetodo(mt)} className="flex-1 py-1 rounded text-[10px] font-bold"
                        style={{ background: metodo === mt ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: metodo === mt ? '#fff' : '#64748b' }}>
                        {mt === 'krige' ? 'Krigagem' : 'IDW'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Pixel</label>
                    <select value={pixelM} onChange={e => setPixelM(Number(e.target.value))} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>
                      {[5, 10, 20].map(p => <option key={p} value={p}>{p} × {p} m{p === 20 ? ' (padrão)' : ''}</option>)}
                    </select>
                  </div>
                  {metodo === 'krige' && (
                    <div className="flex-1">
                      <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Variograma</label>
                      <select value={modeloFixo} onChange={e => setModeloFixo(e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>
                        <option value="">Auto (melhor)</option>
                        <option value="spherical">Esférico</option>
                        <option value="exponential">Exponencial</option>
                        <option value="gaussian">Gaussiano</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Processar */}
          {!poligono && <Aviso texto="Limite do talhão não carregado no mapa." />}
          <button onClick={processarTodos} disabled={processando || !poligono || nutrientes.length === 0}
            className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5"
            style={{ background: (processando || !poligono || nutrientes.length === 0) ? '#1a3a6b' : 'var(--invicta-green-dark)', opacity: (!poligono || nutrientes.length === 0) ? 0.6 : 1 }}>
            {processando && progresso
              ? <><Loader2 size={13} className="animate-spin" /> {progresso.nome} ({progresso.atual}/{progresso.total})</>
              : <><Layers size={13} /> Processar tudo ({totalMapas} mapas)</>}
          </button>
          <button onClick={processar} disabled={processando || !poligono || !nutriente}
            className="w-full py-1 rounded text-[10px] font-semibold flex items-center justify-center gap-1"
            style={{ background: '#1a3a6b', color: '#93c5fd', opacity: (processando || !poligono || !nutriente) ? 0.6 : 1 }}>
            <Play size={10} /> Processar só o selecionado
          </button>

          {estado === 'erro' && <p className="text-[10px]" style={{ color: '#f87171' }}>{erro}</p>}
          {erro && estado !== 'erro' && <p className="text-[10px]" style={{ color: '#fbbf24' }}>{erro}</p>}

          {/* Profundidade — troca instantânea no mapa */}
          {profundidades.length > 0 && (
            <div>
              <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Profundidade</label>
              <div className="flex gap-1">
                {profundidades.map(p => (
                  <button key={p} onClick={() => setProfundidade(p)} className="flex-1 py-1 rounded text-[10px] font-bold"
                    style={{ background: profundidade === p ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: profundidade === p ? '#fff' : '#64748b' }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Variáveis — clique para exibir (✓ = pronto nesta profundidade) */}
          {nutrientes.length === 0 ? (
            <p className="text-[10px]" style={{ color: '#fbbf24' }}>Nenhuma variável desta importação tem legenda na Base Agronômica.</p>
          ) : (
            <div>
              <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>
                Variável no mapa {feitosNaProf > 0 && <span style={{ color: '#475569' }}>· {feitosNaProf}/{nutrientes.length} prontos</span>}
              </label>
              <div className="flex flex-wrap gap-1">
                {nutrientes.map(id => {
                  const sel = id === nutriente;
                  const feito = !!cache[ck(id, profundidade)];
                  return (
                    <button key={id} onClick={() => setNutriente(id)} className="px-2 py-1 rounded text-[10px] font-bold"
                      style={{ background: sel ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: sel ? '#fff' : (feito ? '#86efac' : '#64748b') }}>
                      {legendaPorId(id)?.simbolo ?? id}{feito ? ' ✓' : ''}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] mt-1" style={{ color: '#94a3b8' }}>
                <strong style={{ color: pontosInterp.length >= 3 ? '#86efac' : '#fbbf24' }}>{pontosInterp.length}</strong> pontos
                {leg ? ` · ${leg.nome} (${leg.unidade})` : ''}
              </p>
            </div>
          )}

          {/* Mapa exibido: variograma + legenda gradiente + opacidade */}
          {stats && ramp && leg && (
            <div className="space-y-2 p-2.5 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px]" style={{ color: stats.modelo === 'idw' ? '#93c5fd' : '#86efac' }}>
                  <Activity size={12} />
                  {stats.modelo === 'idw' ? `IDW · ${stats.n} pts` : `Krigagem · ${stats.modelo} · ${stats.n} pts`}
                </div>
                <button onClick={limpar} title="Limpar mapas" className="flex items-center gap-1 text-[10px]" style={{ color: '#93c5fd' }}>
                  <Eraser size={11} /> Limpar
                </button>
              </div>

              {/* detalhes do processo */}
              <div className="text-[9px] leading-relaxed" style={{ color: '#64748b' }}>
                pixel <strong style={{ color: '#94a3b8' }}>{stats.pixel_m} m</strong> · grade {stats.nx}×{stats.ny}
                {stats.variograma && <> · alcance <strong style={{ color: '#94a3b8' }}>{stats.variograma.alcance_m} m</strong> · patamar {fmt(stats.variograma.patamar)} · pepita {fmt(stats.variograma.pepita)}</>}
                {stats.rmse != null && <> · RMSE {stats.rmse}</>}
              </div>

              <div>
                <div className="relative h-3 rounded" style={{ background: gradienteCss(ramp.stops) }}>
                  {leg.classes.map(c => c.max).filter((m): m is number => m != null).slice(0, -1).map((b) => {
                    const t = (b - ramp.dominio[0]) / ((ramp.dominio[1] - ramp.dominio[0]) || 1);
                    return <span key={b} className="absolute top-0 h-3" style={{ left: `${t * 100}%`, width: 1, background: 'rgba(255,255,255,0.7)' }} />;
                  })}
                </div>
                <div className="flex justify-between text-[9px] mt-0.5" style={{ color: '#64748b' }}>
                  <span>{fmt(ramp.dominio[0])}</span>
                  <span>{leg.simbolo} ({leg.unidade})</span>
                  <span>{fmt(ramp.dominio[1])}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[9px]" style={{ color: '#64748b' }}>Opacidade</span>
                <input type="range" min={0.2} max={1} step={0.05} value={opacity} onChange={e => setOpacity(Number(e.target.value))} className="flex-1 accent-green-500" />
                <span className="text-[9px] w-8 text-right" style={{ color: '#94a3b8' }}>{Math.round(opacity * 100)}%</span>
              </div>
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
