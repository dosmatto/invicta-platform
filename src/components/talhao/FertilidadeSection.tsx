'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import {
  getSafras, getGrades, getImportacoesLab, getTalhoes,
  getLegendas, getLegendasPorAtributo, seedLegendasABCIfEmpty,
  type ImportacaoLab, type GradeAmostragem,
} from '@/lib/store';
import {
  interpolar, rampaDaLegenda, gradienteCss, coordsFromBounds, extrairPoligono,
  type RespInterp,
} from '@/lib/fertilidade';
import { colorirGridComLegenda, temGrid } from '@/lib/raster';
import type { Legenda } from '@/lib/legendas';
import { LEGENDAS_SEED_ABC } from '@/constants/legendasSeedABC';
import { Play, Layers, Loader2, Eraser, AlertTriangle, Activity, Settings, BookOpen } from 'lucide-react';
import { cloudSalvarMapa, cloudCarregarMapasPorPrefixo, cloudExcluirMapasPorPrefixo } from '@/lib/cloud';

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;
const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const OPACIDADE = 1; // fixo 100%

type Ponto = { lng: number; lat: number; valor: number };
type MapaPronto = { resp: RespInterp; labels: GeoJSON.FeatureCollection };

// Arquitetura: separamos raster (interpolação cara) de renderização (cor barata).
// A chave NÃO inclui a legenda — assim, trocar legenda/estilo apenas recolore o
// grid persistido (sem ir ao backend).
// Sufixo é `nut__prof`. Mapas anteriores (v0.21.0-0.22.x) usavam `legId__nut__prof`
// no mesmo prefixo — leitura tolera ambos (legacy = qualquer legenda salva com grid).
const ck = (nut: string, prof: string) => `${nut}__${prof}`;
const prefixoNuvem = (talhaoId: string, importacaoId: string, metodo: string, pixelM: number, modeloFixo: string) =>
  `${talhaoId}__${importacaoId}__${metodo}__${pixelM}__${modeloFixo || 'auto'}__`;
const idNuvem = (talhaoId: string, importacaoId: string, metodo: string, pixelM: number, modeloFixo: string, nut: string, prof: string) =>
  `${prefixoNuvem(talhaoId, importacaoId, metodo, pixelM, modeloFixo)}${nut}__${prof}`;

export function FertilidadeSection() {
  const { nav, uploadedGeo, setFertilidadeOverlay, setFertilidadeLabels } = useApp();

  const safraAtiva = useMemo(() => getSafras().find(s => s.ativa) ?? null, []);
  const safraNome = safraAtiva?.nome ?? '';

  const [importacoes, setImportacoes] = useState<ImportacaoLab[]>([]);
  const [importacaoId, setImportacaoId] = useState('');
  const [nutriente, setNutriente] = useState('');
  const [profundidade, setProfundidade] = useState('');
  const [metodo, setMetodo] = useState<'krige' | 'idw'>('krige');
  const [pixelM, setPixelM] = useState(20);
  const [modeloFixo, setModeloFixo] = useState('');
  const [cfgAberto, setCfgAberto] = useState(false);
  const [estado, setEstado] = useState<'idle' | 'processando' | 'pronto' | 'erro'>('idle');
  const [erro, setErro] = useState('');
  const [progresso, setProgresso] = useState<{ atual: number; total: number; nome: string } | null>(null);

  // legendas carregadas (seed garantido ao abrir)
  const [legendas, setLegendas] = useState<Legenda[]>([]);
  // qual legenda aplicar por atributo (pH, P, K...) — o usuário escolhe
  const [legendaIdPorAtributo, setLegendaIdPorAtributo] = useState<Record<string, string>>({});

  // cache de mapas: chave = legenda+nutriente+profundidade
  const [cache, setCache] = useState<Record<string, MapaPronto>>({});

  // Seed automático do repositório Fundação ABC + carrega legendas do store.
  // Reage a mudanças no editor de Legendas via evento custom.
  useEffect(() => {
    seedLegendasABCIfEmpty(LEGENDAS_SEED_ABC);
    setLegendas(getLegendas());
    const onLeg = () => setLegendas(getLegendas());
    if (typeof window !== 'undefined') window.addEventListener('inv:legendas', onLeg);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('inv:legendas', onLeg); };
  }, []);

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

  // só nutrientes que têm pelo menos uma legenda cadastrada
  const nutrientes = useMemo(() => {
    if (!importacao) return [] as string[];
    return importacao.elementos.filter(id => legendas.some(l => l.atributoId === id));
  }, [importacao, legendas]);

  const profundidades = useMemo(
    () => (importacao ? [...new Set(importacao.resultados.map(r => r.profundidade).filter(Boolean))] : []),
    [importacao],
  );
  const profsAll = profundidades.length ? profundidades : [profundidade];

  // helper: legenda escolhida para um atributo (default = primeira do atributo)
  function legendaDe(atributoId: string): Legenda | undefined {
    const lst = legendas.filter(l => l.atributoId === atributoId);
    if (lst.length === 0) return undefined;
    const escolhida = legendaIdPorAtributo[atributoId];
    return lst.find(l => l.id === escolhida) ?? lst[0];
  }

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

  // trocar contexto: hidrata da nuvem o que estiver salvo daquela combinação.
  // Aceita tanto a chave nova (`nut__prof`) quanto a antiga (`legId__nut__prof`).
  useEffect(() => {
    setCache({}); setEstado('idle'); setErro('');
    if (!nav.talhaoId || !importacaoId) return;
    const prefixo = prefixoNuvem(nav.talhaoId, importacaoId, metodo, pixelM, modeloFixo);
    (async () => {
      const carregados = await cloudCarregarMapasPorPrefixo<MapaPronto>(prefixo);
      if (carregados.length === 0) return;
      const novo: Record<string, MapaPronto> = {};
      for (const c of carregados) {
        const sufixo = c.id.slice(prefixo.length);
        const partes = sufixo.split('__');
        // novo: `${nut}__${prof}` (2 partes) · legacy: `${legId}__${nut}__${prof}` (3+ partes)
        const chave = partes.length >= 3 ? `${partes.slice(-2).join('__')}` : sufixo;
        // prefere o mais "novo" (sufixo curto). Se já houver, ignora legacy.
        if (novo[chave] && partes.length >= 3) continue;
        novo[chave] = c.dados;
      }
      setCache(novo);
    })();
  }, [importacaoId, metodo, pixelM, modeloFixo, nav.talhaoId]);

  // exibe no mapa o mapa do nutriente+profundidade selecionados (recolore local
  // a partir do grid quando legenda/estilo muda — sem reprocessar no backend).
  const legAtual = nutriente ? legendaDe(nutriente) : undefined;
  useEffect(() => {
    if (!legAtual) { setFertilidadeOverlay(null); setFertilidadeLabels(null); return; }
    const r = cache[ck(nutriente, profundidade)];
    if (!r) { setFertilidadeOverlay(null); setFertilidadeLabels(null); return; }
    try {
      let url: string;
      if (temGrid(r.resp)) {
        url = colorirGridComLegenda(r.resp.grid, legAtual).dataUrl;
      } else if (r.resp.png) {
        // legacy: doc antigo sem grid — usa o PNG já colorido (não responde a troca de legenda)
        url = r.resp.png;
      } else {
        setFertilidadeOverlay(null); setFertilidadeLabels(null); return;
      }
      setFertilidadeOverlay({ url, coordinates: coordsFromBounds(r.resp.bounds), opacity: OPACIDADE });
      setFertilidadeLabels(r.labels);
    } catch (e) {
      console.warn('[fertilidade] falha ao colorir local:', e);
      setFertilidadeOverlay(null); setFertilidadeLabels(null);
    }
  }, [cache, nutriente, profundidade, legAtual, legAtual?.estilo, legAtual?.classes, setFertilidadeOverlay, setFertilidadeLabels]);

  useEffect(() => () => { setFertilidadeOverlay(null); setFertilidadeLabels(null); }, [setFertilidadeOverlay, setFertilidadeLabels]);

  const pontosInterp = useMemo(() => pontosDe(nutriente, profundidade), [nutriente, profundidade, importacao, pontoPorNumero]); // eslint-disable-line react-hooks/exhaustive-deps

  async function processarUm(nut: string, prof: string) {
    const leg = legendaDe(nut);
    if (!leg) throw new Error(`${nut}: sem legenda`);
    const pts = pontosDe(nut, prof);
    if (pts.length < 3) throw new Error(`${leg.simbolo} ${prof}: menos de 3 pontos`);
    // o backend devolve grid + bounds + stats + png; só usamos grid/bounds/stats.
    // O domínio e os stops vão só pra colorir o PNG do backend (ignorado aqui).
    const { dominio, stops } = rampaDaLegenda(leg);
    const resp = await interpolar({ pontos: pts, poligono: poligono!, dominio, stops, metodo, pixelM, modeloFixo: modeloFixo || null });
    const labels = fcLabels(pts);
    // não guardamos o PNG colorido — a colorização vira local + reativa à legenda.
    const respLeve: RespInterp = { ...resp, png: '' };
    setCache(c => ({ ...c, [ck(nut, prof)]: { resp: respLeve, labels } }));
    if (nav.talhaoId && importacaoId) {
      let dados: { resp: RespInterp; labels: GeoJSON.FeatureCollection } = { resp: respLeve, labels };
      const aprox = JSON.stringify(dados).length;
      if (aprox > 900_000 && respLeve.grid) {
        dados = { resp: { ...respLeve, grid: undefined }, labels };
        console.warn(`[fertilidade] grid muito grande p/ Firestore (${Math.round(aprox/1024)} KB); salvando só metadados de ${nut} ${prof}.`);
      }
      cloudSalvarMapa(idNuvem(nav.talhaoId, importacaoId, metodo, pixelM, modeloFixo, nut, prof), dados);
    }
  }

  async function processar() {
    if (!poligono) { setErro('Limite do talhão não encontrado — abra o talhão no mapa.'); setEstado('erro'); return; }
    if (!nutriente) { setErro('Selecione uma variável.'); setEstado('erro'); return; }
    setEstado('processando'); setErro('');
    try { await processarUm(nutriente, profundidade); setEstado('pronto'); }
    catch (e) { setEstado('erro'); setErro(e instanceof Error ? e.message : 'Falha ao processar.'); }
  }

  async function processarTodos() {
    if (!poligono) { setErro('Limite do talhão não encontrado — abra o talhão no mapa.'); setEstado('erro'); return; }
    if (nutrientes.length === 0) return;
    setEstado('processando'); setErro('');
    const total = nutrientes.length * profsAll.length;
    const falhas: string[] = [];
    let backendOff = false;
    let i = 0;
    for (const prof of profsAll) {
      for (const nut of nutrientes) {
        i++;
        const sim = legendaDe(nut)?.simbolo ?? nut;
        setProgresso({ atual: i, total, nome: `${sim} ${prof}` });
        try { await processarUm(nut, prof); }
        catch (e) {
          const msg = e instanceof Error ? e.message : '';
          if (msg.includes('Interpolador desligado')) { backendOff = true; break; }
          falhas.push(`${sim} ${prof}`);
        }
      }
      if (backendOff) break;
    }
    setProgresso(null);
    if (backendOff) {
      setEstado('erro');
      setErro('Interpolador desligado nesta máquina. Veja Configurações → Interpolação.');
    } else {
      setEstado(falhas.length === total ? 'erro' : 'pronto');
      setErro(falhas.length ? `Não processou: ${falhas.join(', ')}.` : '');
    }
  }

  function limpar() {
    setCache({}); setEstado('idle'); setErro('');
    if (nav.talhaoId && importacaoId) {
      cloudExcluirMapasPorPrefixo(prefixoNuvem(nav.talhaoId, importacaoId, metodo, pixelM, modeloFixo));
    }
  }

  if (!safraAtiva) return <div className="px-6 py-4"><Aviso texto="Defina uma safra ativa (no topo do talhão) para gerar o mapa de fertilidade." /></div>;
  if (importacoes.length === 0) return <div className="px-6 py-4"><Aviso texto="Importe resultados de laboratório (seção acima) — o mapa de fertilidade é gerado a partir deles." /></div>;

  const processando = estado === 'processando';
  const stats = (nutriente && profundidade) ? cache[ck(nutriente, profundidade)]?.resp.stats : undefined;
  const totalMapas = nutrientes.length * profsAll.length;
  const feitosNaProf = nutrientes.filter(n => {
    const l = legendaDe(n);
    return l && cache[ck(n, profundidade)];
  }).length;

  // legendas disponíveis pro atributo atual (pra o dropdown)
  const legendasDoAtributo = nutriente ? getLegendasPorAtributo(nutriente) : [];

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
          {/* Configurações da interpolação (recolhível) */}
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

          {/* Profundidade */}
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

          {/* Variáveis */}
          {nutrientes.length === 0 ? (
            <p className="text-[10px]" style={{ color: '#fbbf24' }}>Nenhuma variável desta importação tem legenda cadastrada.</p>
          ) : (
            <div>
              <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>
                Variável no mapa {feitosNaProf > 0 && <span style={{ color: '#475569' }}>· {feitosNaProf}/{nutrientes.length} prontos</span>}
              </label>
              <div className="flex flex-wrap gap-1">
                {nutrientes.map(id => {
                  const sel = id === nutriente;
                  const l = legendaDe(id);
                  const feito = l && !!cache[ck(id, profundidade)];
                  return (
                    <button key={id} onClick={() => setNutriente(id)} className="px-2 py-1 rounded text-[10px] font-bold"
                      style={{ background: sel ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: sel ? '#fff' : (feito ? '#86efac' : '#64748b') }}>
                      {l?.simbolo ?? id}{feito ? ' ✓' : ''}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] mt-1" style={{ color: '#94a3b8' }}>
                <strong style={{ color: pontosInterp.length >= 3 ? '#86efac' : '#fbbf24' }}>{pontosInterp.length}</strong> pontos
                {legAtual ? ` · ${legAtual.atributo} (${legAtual.unidade})` : ''}
              </p>
            </div>
          )}

          {/* Seletor de Legenda para o atributo atual */}
          {nutriente && legendasDoAtributo.length > 0 && (
            <div>
              <label className="text-[10px] font-semibold block mb-1 flex items-center gap-1" style={{ color: '#64748b' }}>
                <BookOpen size={11} /> Legenda
              </label>
              <select
                value={legAtual?.id ?? ''}
                onChange={e => setLegendaIdPorAtributo(m => ({ ...m, [nutriente]: e.target.value }))}
                className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}
              >
                {legendasDoAtributo.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.nome}{l.metodo ? ` · ${l.metodo}` : ''}
                  </option>
                ))}
              </select>
              {legendasDoAtributo.length === 1 && (
                <p className="text-[9px] mt-0.5" style={{ color: '#475569' }}>Cadastre outras fontes em Configurações → Legendas (em breve).</p>
              )}
            </div>
          )}

          {/* Mapa exibido: detalhes + barra de legenda */}
          {stats && legAtual && (
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

              <div className="text-[9px] leading-relaxed" style={{ color: '#64748b' }}>
                pixel <strong style={{ color: '#94a3b8' }}>{stats.pixel_m} m</strong> · grade {stats.nx}×{stats.ny}
                {stats.variograma && <> · alcance <strong style={{ color: '#94a3b8' }}>{stats.variograma.alcance_m} m</strong> · patamar {fmt(stats.variograma.patamar)} · pepita {fmt(stats.variograma.pepita)}</>}
                {stats.rmse != null && <> · RMSE {stats.rmse}</>}
              </div>

              {/* Barra de legenda (largura visual por classe, conforme spec) */}
              <BarraLegenda leg={legAtual} />
              <p className="text-[9px]" style={{ color: '#64748b' }}>{legAtual.fonte} · {legAtual.atributo}{legAtual.metodo ? ` (${legAtual.metodo})` : ''} · {legAtual.unidade}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Barra horizontal com as classes (faixas de cor com largura visual fixa) +
// rótulos das bordas (limites) abaixo de cada divisão.
function BarraLegenda({ leg }: { leg: Legenda }) {
  return (
    <div>
      <div className="relative h-4 rounded overflow-hidden"
        style={{ border: '1px solid rgba(255,255,255,0.1)', background: gradienteCss(leg) }}
        title={leg.classes.map(c => `${c.nome}${c.valorMin != null ? ` · >${c.valorMin}` : ''}${c.valorMax != null ? ` · ≤${c.valorMax}` : ''}`).join('  |  ')} />
      <div className="relative h-3 text-[8px]" style={{ color: '#cbd5e1' }}>
        {(() => {
          let acumulado = 0;
          const bordas: Array<{ valor: number; pos: number }> = [];
          for (let i = 0; i < leg.classes.length - 1; i++) {
            acumulado += leg.classes[i].larguraVisual;
            const b = leg.classes[i].valorMax;
            if (b != null) bordas.push({ valor: b, pos: acumulado });
          }
          return bordas.map(b => (
            <span key={b.valor} className="absolute" style={{ left: `${b.pos}%`, transform: 'translateX(-50%)' }}>{fmt(b.valor)}</span>
          ));
        })()}
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
