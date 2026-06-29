'use client';

// Módulo "Zonas de Manejo" (MEAP) — aba dedicada da página do talhão.
// M1: zonas adotadas (importadas) + homogeneidade interna (CV) por zona.
// M2: gerar zonas por SIMILARIDADE — clusteriza (k-means/FCM) os mapas JÁ
// interpolados; FPI/NCE sugerem o nº de potenciais; área mínima funde manchas;
// cada mancha CONTÍGUA é uma zona de IDENTIDADE ÚNICA (potencial = atributo);
// ordenação Alta→Baixa manual + sugerida. Preview no mapa (não persiste).

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { getZoneamentosMeap, saveZoneamentoMeap, deleteZoneamentoMeap, setZoneamentoPadraoMeap, getLegendasPorAtributo, type Talhao, type ZoneamentoMeap } from '@/lib/store';
import { obterOuAdotarAmbiente } from '@/lib/meap/adocao';
import { carregarCamadas, analisarMulti, gerarMulti, dadosLabCV, type CamadasCarregadas } from '@/lib/meap/gerar';
import { calcularCVZonas } from '@/lib/meap/cv';
import { unirFeatures, limparZona } from '@/lib/meap/fundir';
import { extrairPoligono, coordsFromBounds, decodeGrid, type RespGerarZonas, type RespAnalisarZonas } from '@/lib/fertilidade';
import { colorirGrid, colorirGridComLegenda } from '@/lib/raster';
import { rampaVisualStops } from '@/lib/legendas';
import { classeZona, classeReconhecida, corZonaPorPosicao } from '@/lib/zonas';
import { simboloElemento } from '@/lib/lab';
import type { AmbienteProdutivo, Homogeneidade, MetricasZonaMeap } from '@/lib/meap/tipos';
import { Layers, AlertTriangle, Wand2, Loader2, X, Check, ChevronUp, ChevronDown, Save, Star, Trash2, Eye, BarChart3, Sparkles, Combine, CheckSquare, Square } from 'lucide-react';

const HOMOG: Record<Homogeneidade, { label: string; cor: string; bg: string }> = {
  alta: { label: 'Homogênea', cor: '#86efac', bg: '#0f2a1a' },
  media: { label: 'Média', cor: '#fbbf24', bg: '#2d1a00' },
  baixa: { label: 'Heterogênea', cor: '#f87171', bg: '#2a0f12' },
};

const ESTADO: Record<AmbienteProdutivo['estado'], string> = {
  'em-formacao': 'Em formação', 'em-consolidacao': 'Em consolidação', 'consolidada': 'Consolidada',
};

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;

// Rótulos ordinais de POTENCIAL por nº de classes (espelha o backend).
const ZLAB: Record<number, string[]> = {
  2: ['Alta', 'Baixa'],
  3: ['Alta', 'Média', 'Baixa'],
  4: ['Alta', 'Média-alta', 'Média-baixa', 'Baixa'],
  5: ['Alta', 'Média-alta', 'Média', 'Média-baixa', 'Baixa'],
};
// Escala qualitativa p/ 6–12 classes (em vez de "Nível N", que não diz nada).
const ESCALA_POT = ['Muito alto', 'Alto', 'Médio-alto', 'Médio', 'Médio-baixo', 'Baixo', 'Muito baixo'];
function rotulosPotencial(nn: number): string[] {
  if (ZLAB[nn]) return ZLAB[nn];
  if (nn <= 1) return ['Único'];
  return Array.from({ length: nn }, (_, i) => ESCALA_POT[Math.round((i / (nn - 1)) * (ESCALA_POT.length - 1))]);
}

function parseImportadas(zonasGeojson?: string): GeoJSON.FeatureCollection | null {
  if (!zonasGeojson) return null;
  try { const fc = JSON.parse(zonasGeojson) as GeoJSON.FeatureCollection; return fc.features?.length ? fc : null; } catch { return null; }
}

function featuresParaMapa(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  const feats = fc.features.filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'));
  // nº de zonas oficiais distintas (p/ a rampa de cor por posição quando há >5 classes)
  const total = new Set(feats.map(f => String((f.properties as { zona?: string | number; classe?: string })?.zona ?? (f.properties as { classe?: string })?.classe ?? ''))).size;
  return {
    type: 'FeatureCollection',
    features: feats.map(f => {
      const p = (f.properties ?? {}) as { id?: string; zona?: string | number; classe?: string; cor?: string };
      const cz = classeZona(p.classe ?? '');
      // 1) cor salva na feature; 2) rampa por nº da zona quando a classe não é
      // reconhecida (Nível N); 3) cor do semáforo pela classe.
      let cor = p.cor;
      if (!cor) cor = (p.zona != null && !classeReconhecida(p.classe ?? '')) ? corZonaPorPosicao(Number(p.zona) - 1, total) : cz.cor;
      // rótulo = nº da ZONA oficial (polígonos da mesma zona mostram o mesmo nº)
      const rotulo = String(p.zona ?? p.id ?? '?');
      return { type: 'Feature' as const, properties: { cor, rotulo, classeLabel: cz.label, selecionada: false }, geometry: f.geometry! };
    }),
  };
}

// Gráfico FPI/NCE: dois índices por nº de potenciais (mínimo = nº ótimo).
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
      <text x={x1} y={H - 1} fontSize="8" fill="#64748b" textAnchor="end">nº de potenciais →</text>
    </svg>
  );
}

// Cabeçalho numerado de etapa (rev. 13.00A: Configurar → Analisar → Decidir → Gerar → Avaliar).
function EtapaHdr({ n, t }: { n: number; t: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center justify-center text-[10px] font-bold rounded-full flex-shrink-0" style={{ width: 18, height: 18, background: '#5b21b6', color: '#fff' }}>{n}</span>
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#c4b5fd' }}>{t}</span>
    </div>
  );
}

// Rampa genérica (viridis-like) p/ a prévia de uma camada sem legenda própria.
const RAMPA_PREVIEW: Array<[number, [number, number, number]]> = [
  [0, [68, 1, 84]], [0.25, [59, 82, 139]], [0.5, [33, 145, 140]], [0.75, [94, 201, 98]], [1, [253, 231, 37]],
];

// Coloriza o grid de uma camada para a prévia no mapa: NDVI -> legenda NDVI
// (contínua); fertilidade -> legenda do atributo; senão rampa genérica (min–máx).
function corDaCamadaPreview(c: { nut: string; b64: string; shape: [number, number] }): string | null {
  const grid = { b64: c.b64, shape: c.shape };
  try {
    if (c.nut.startsWith('ndvi')) {
      const leg = getLegendasPorAtributo('ndvi')[0];
      if (leg) return colorirGrid(grid, [0, 1], rampaVisualStops({ ...leg, estilo: 'continuo' })).dataUrl;
    } else {
      const leg = getLegendasPorAtributo(c.nut)[0];
      if (leg) return colorirGridComLegenda(grid, leg).dataUrl;
    }
    const { valores } = decodeGrid(grid);
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < valores.length; i++) { const v = valores[i]; if (isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; } }
    if (mn < mx) return colorirGrid(grid, [mn, mx], RAMPA_PREVIEW).dataUrl;
  } catch (e) { console.warn('[meap] prévia da camada falhou:', e); }
  return null;
}

export function MeapSection({ talhao }: { talhao: Talhao; safraNome?: string }) {
  const { setZonasManejo, setFertilidadeOverlay, setFertilidadeLabels } = useApp();
  const [amb, setAmb] = useState<AmbienteProdutivo | null>(null);

  // Camadas (mapas já interpolados)
  const [carregadas, setCarregadas] = useState<CamadasCarregadas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [chaves, setChaves] = useState<string[]>([]);

  // Configuração (rev. 13.00A: Configurar → Analisar → Decidir → Gerar → Avaliar)
  const [algoritmo, setAlgoritmo] = useState<'fcm' | 'kmeans'>('fcm');
  const [pesos, setPesos] = useState<Record<string, number>>({});  // peso por camada (chave→peso)
  const [areaMin, setAreaMin] = useState(0);     // ha; 0 = sem fusão

  // Etapa 2 — Analisar (FPI/NCE 2..12 + sugestão, ANTES de gerar)
  const [analise, setAnalise] = useState<RespAnalisarZonas | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [nClasses, setNClasses] = useState(0);   // nº de zonas escolhido (0 = ainda não)

  // Etapa 4/5 — Gerar / Avaliar
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [res, setRes] = useState<RespGerarZonas | null>(null);
  const [ordemRanks, setOrdemRanks] = useState<number[]>([]);  // potenciais (ranks) na ordem Alta→Baixa
  const [featsEdit, setFeatsEdit] = useState<GeoJSON.Feature[]>([]);  // zonas EDITÁVEIS (fusão manual) — espelham res.features
  const [selZonas, setSelZonas] = useState<Set<string>>(new Set());  // zonas marcadas p/ fundir

  // Zoneamentos salvos (vários por talhão; um é o "padrão" usado pela Amostragem)
  const [zoneamentos, setZoneamentos] = useState<ZoneamentoMeap[]>([]);
  const [vendoId, setVendoId] = useState<string | null>(null);  // zoneamento salvo em visualização no mapa
  const [previewCh, setPreviewCh] = useState<string | null>(null);  // camada em pré-visualização no mapa

  const poligono = useMemo(() => {
    if (!talhao.geojson) return null;
    try { return extrairPoligono(JSON.parse(talhao.geojson) as GeoJSON.FeatureCollection); } catch { return null; }
  }, [talhao.geojson]);

  useEffect(() => { setAmb(obterOuAdotarAmbiente(talhao.id)); }, [talhao.id, talhao.zonasGeojson]);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    carregarCamadas(talhao.id)
      .then(c => { if (!vivo) return; setCarregadas(c); setChaves([]); setPesos({}); setAnalise(null); setRes(null); setNClasses(0); })
      .catch(() => { if (vivo) setCarregadas(null); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [talhao.id]);

  useEffect(() => { setZoneamentos(getZoneamentosMeap(talhao.id)); }, [talhao.id]);
  const recarregarZon = () => setZoneamentos(getZoneamentosMeap(talhao.id));
  const vendoFc = useMemo(() => (vendoId ? (zoneamentos.find(z => z.id === vendoId)?.fc ?? null) : null), [vendoId, zoneamentos]);

  // Ao gerar, inicializa a ordem dos potenciais com a sugestão do backend.
  useEffect(() => { setOrdemRanks(res ? Array.from({ length: res.stats.n_classes }, (_, i) => i) : []); }, [res]);

  // Espelha as features geradas numa cópia EDITÁVEL (a fusão manual mexe nela,
  // não no res original), LIMPA resquícios (buracos/slivers < área mínima) e zera
  // a seleção a cada nova geração.
  useEffect(() => {
    if (!res) { setFeatsEdit([]); setSelZonas(new Set()); return; }
    const minM2 = Math.max((res.stats.area_min_ha || 0) * 10000, 1000);  // piso ~0,1 ha p/ ruído de vetorização
    const limpas: GeoJSON.Feature[] = [];
    for (const f of res.features) {
      if (!f.geometry) continue;
      const { geometry, areaHa } = limparZona(f.geometry as GeoJSON.Geometry, minM2);
      if (areaHa * 10000 < minM2) continue;  // zona inteira virou sliver → descarta
      limpas.push({ ...f, geometry, properties: { ...(f.properties ?? {}), areaHa } });
    }
    setFeatsEdit(limpas);
    setSelZonas(new Set());
  }, [res]);

  // Potencial (rótulo + cor) por rank, conforme a ordem atual (posição = potencial).
  const potDeRank = useMemo(() => {
    const labels = rotulosPotencial(ordemRanks.length);
    const total = ordemRanks.length;
    const m = new Map<number, { label: string; cor: string }>();
    ordemRanks.forEach((rank, pos) => {
      const label = labels[pos] ?? `Classe ${pos + 1}`;
      // ≤5 classes com nome de semáforo → cor oficial; 6–12 → rampa por posição.
      const cor = (total <= 5 && classeReconhecida(label)) ? classeZona(label).cor : corZonaPorPosicao(pos, total);
      m.set(rank, { label, cor });
    });
    return m;
  }, [ordemRanks]);

  // Zonas (identidade única) com potencial/cor aplicados — derivadas das features
  // EDITÁVEIS (refletem fusões manuais).
  const zonas = useMemo(() => {
    return featsEdit.map(f => {
      const p = (f.properties ?? {}) as { id?: string; potencialRank?: number; areaHa?: number };
      const rank = Number(p.potencialRank ?? 0);
      const pot = potDeRank.get(rank);
      return { id: String(p.id ?? '?'), rank, potencial: pot?.label ?? '—', cor: pot?.cor ?? '#94a3b8', areaHa: Number(p.areaHa ?? 0), geometry: f.geometry };
    });
  }, [featsEdit, potDeRank]);

  // CV (homogeneidade) por zona gerada, calculado dos dados de laboratório.
  const cv = useMemo(() => {
    if (!featsEdit.length) return null;
    const { pontos, resultados } = dadosLabCV(talhao.id);
    if (!resultados.length) return null;
    return calcularCVZonas({ zonas: featsEdit.map(f => ({ id: String((f.properties as { id?: string })?.id ?? ''), geometry: f.geometry })), pontos, resultados });
  }, [featsEdit, talhao.id]);
  const cvPorZona: Record<string, MetricasZonaMeap> = cv?.porZona ?? {};
  const varCVsimbolo = cv?.variavelValidacao ? simboloElemento(cv.variavelValidacao) : null;

  // ZONAS OFICIAIS = as classes (na ordem Alta→Baixa). O nº escolhido pelo usuário
  // = nº de zonas oficiais. Cada zona pode ter VÁRIOS polígonos (manchas separadas);
  // isso NÃO aumenta o nº de zonas. Numeradas Zona 01..0N pela ordem do potencial.
  const potenciais = useMemo(() => {
    const labels = rotulosPotencial(ordemRanks.length);
    return ordemRanks.map((rank, pos) => {
      const polis = zonas.filter(z => z.rank === rank);
      const areas = polis.map(p => p.areaHa);
      const label = labels[pos] ?? `Classe ${pos + 1}`;
      return {
        rank, pos, num: String(pos + 1).padStart(2, '0'),
        label, cor: potDeRank.get(rank)?.cor ?? classeZona(label).cor,
        nPolig: polis.length,
        areaHa: areas.reduce((s, a) => s + a, 0),
        menor: areas.length ? Math.min(...areas) : 0,
        maior: areas.length ? Math.max(...areas) : 0,
      };
    });
  }, [ordemRanks, zonas, potDeRank]);
  // rank → número da zona oficial (p/ rotular cada polígono).
  const numDeRank = useMemo(() => {
    const m = new Map<number, string>();
    potenciais.forEach(p => m.set(p.rank, p.num));
    return m;
  }, [potenciais]);

  // Mapa: prioridade = zoneamento salvo em visualização > preview gerado >
  // (prévia de camada: oculta as zonas p/ enxergar o raster) > zonas adotadas.
  useEffect(() => {
    let fc: GeoJSON.FeatureCollection | null = null;
    if (vendoFc) {
      fc = featuresParaMapa(vendoFc);
    } else if (res && zonas.length) {
      fc = { type: 'FeatureCollection', features: zonas.map(z => ({ type: 'Feature' as const, properties: { cor: z.cor, rotulo: numDeRank.get(z.rank) ?? z.id, classeLabel: z.potencial, selecionada: false }, geometry: z.geometry! })) };
    } else if (previewCh) {
      fc = null;  // previewando uma camada → não cobrir com as zonas adotadas
    } else {
      const imp = parseImportadas(talhao.zonasGeojson);
      fc = imp ? featuresParaMapa(imp) : null;
    }
    if (!fc) { setZonasManejo(null); return; }
    setZonasManejo(fc);
    return () => setZonasManejo(null);
  }, [vendoFc, res, zonas, previewCh, numDeRank, talhao.zonasGeojson, setZonasManejo]);

  // Prévia: clicar numa camada mostra o raster dela sobre o talhão (fase de
  // seleção). Some quando há zonas geradas/visualizadas (aí o mapa mostra as zonas).
  useEffect(() => {
    if (!previewCh || !carregadas || res || vendoFc) { setFertilidadeOverlay(null); setFertilidadeLabels(null); return; }
    const c = carregadas.camadas.find(x => x.chave === previewCh);
    const url = c ? corDaCamadaPreview(c) : null;
    if (!url) { setFertilidadeOverlay(null); return; }
    setFertilidadeOverlay({ url, coordinates: coordsFromBounds(carregadas.bounds), opacity: 0.82 });
    setFertilidadeLabels(null);
  }, [previewCh, carregadas, res, vendoFc, setFertilidadeOverlay, setFertilidadeLabels]);
  useEffect(() => () => { setFertilidadeOverlay(null); setFertilidadeLabels(null); }, [setFertilidadeOverlay, setFertilidadeLabels]);

  // Mudar camadas/pesos/método invalida a análise (a curva FPI/NCE muda) e o preview.
  function invalidarAnalise() { setAnalise(null); setRes(null); setNClasses(0); }
  function toggle(ch: string) {
    setChaves(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]);
    invalidarAnalise();
  }
  function setPeso(ch: string, v: number) {
    setPesos(prev => ({ ...prev, [ch]: Math.max(0, v) }));
    invalidarAnalise();
  }
  function mudarAlgoritmo(m: 'fcm' | 'kmeans') { setAlgoritmo(m); invalidarAnalise(); }

  // Etapa 2 — Analisar: FPI/NCE 2..12 + sugestão (não gera).
  async function analisar() {
    if (!carregadas || chaves.length === 0) return;
    setErro(null); setAnalisando(true); setRes(null); setPreviewCh(null);
    try {
      const a = await analisarMulti({ carregadas, chaves, poligono, algoritmo, pesos, cMax: 12 });
      setAnalise(a);
      setNClasses(a.sugestao_c ?? 0);   // pré-seleciona a sugestão (o usuário pode trocar)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao analisar.');
    } finally { setAnalisando(false); }
  }

  function moverRank(pos: number, dir: -1 | 1) {
    setOrdemRanks(prev => {
      const a = [...prev]; const j = pos + dir;
      if (j < 0 || j >= a.length) return prev;
      [a[pos], a[j]] = [a[j], a[pos]];
      return a;
    });
  }

  const idDaFeat = (f: GeoJSON.Feature) => String((f.properties as { id?: string })?.id ?? '');
  function toggleSelZona(id: string) {
    setSelZonas(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  // Fusão MANUAL: une as zonas marcadas num único polígono (dissolve as divisas).
  // A zona resultante herda o potencial do MAIOR constituinte e o id da maior;
  // as demais são removidas.
  function fundirSelecionadas() {
    if (selZonas.size < 2) return;
    const sel = featsEdit.filter(f => selZonas.has(idDaFeat(f)));
    const resto = featsEdit.filter(f => !selZonas.has(idDaFeat(f)));
    if (sel.length < 2) return;
    const areaDe = (f: GeoJSON.Feature) => Number((f.properties as { areaHa?: number })?.areaHa ?? 0);
    const maior = sel.reduce((a, b) => (areaDe(b) > areaDe(a) ? b : a));
    const mp = (maior.properties ?? {}) as { id?: string; potencialRank?: number; classe?: string };
    const minM2 = Math.max((res?.stats.area_min_ha || 0) * 10000, 1000);
    const { geometry, areaHa } = unirFeatures(sel, minM2);
    const novo: GeoJSON.Feature = {
      type: 'Feature', geometry,
      properties: { id: String(mp.id ?? '?'), potencialRank: Number(mp.potencialRank ?? 0), classe: mp.classe, areaHa },
    };
    const todas = [...resto, novo].sort((a, b) => idDaFeat(a).localeCompare(idDaFeat(b)));
    setFeatsEdit(todas);
    setSelZonas(new Set());
  }

  // Etapa 4 — Gerar: clusteriza o nº ESCOLHIDO + área mínima (avaliação vem depois).
  async function gerar() {
    if (!carregadas || chaves.length === 0 || nClasses < 2) return;
    setErro(null); setGerando(true); setPreviewCh(null);
    try {
      const r = await gerarMulti({ carregadas, chaves, poligono, algoritmo, nClasses, areaMinHa: areaMin, pesos });
      if (!r.features.length) throw new Error('Nenhuma zona gerada (sobreposição de dados insuficiente).');
      setRes(r);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao gerar zonas.');
    } finally { setGerando(false); }
  }

  function salvar() {
    if (!res || !zonas.length) return;
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: zonas.map(z => {
        const m = cvPorZona[z.id];
        // Cada feature é um POLÍGONO; a zona oficial é a classe (zona/classe/rank).
        return { type: 'Feature', properties: { id: z.id, zona: numDeRank.get(z.rank) ?? z.id, classe: z.potencial, cor: z.cor, potencialRank: z.rank, areaHa: z.areaHa, cvValidacao: m?.cvValidacao ?? null, homogeneidade: m?.homogeneidade ?? null }, geometry: z.geometry! };
      }),
    };
    const cams = carregadas ? carregadas.camadas.filter(c => chaves.includes(c.chave)).map(c => `${c.simbolo} ${c.prof}`) : [];
    const comCv = zonas.filter(z => cvPorZona[z.id]?.cvValidacao != null);
    const areaCv = comCv.reduce((s, z) => s + z.areaHa, 0);
    const cvMedio = areaCv > 0 ? Math.round((comCv.reduce((s, z) => s + (cvPorZona[z.id]!.cvValidacao as number) * z.areaHa, 0) / areaCv) * 10) / 10 : null;
    const primeiro = zoneamentos.length === 0;
    const novo = saveZoneamentoMeap({
      talhaoId: talhao.id, nome: `Zoneamento ${zoneamentos.length + 1}`, padrao: primeiro, fc,
      meta: { camadas: cams, algoritmo: res.stats.algoritmo, nPotenciais: potenciais.length, areaMinHa: res.stats.area_min_ha, nZonas: potenciais.length, nPoligonos: zonas.length, cvMedio },
    });
    if (primeiro) setZoneamentoPadraoMeap(talhao.id, novo.id);  // grava em talhao.zonasGeojson → Amostragem
    recarregarZon();
    setAmb(obterOuAdotarAmbiente(talhao.id));
  }

  function tornarPadrao(id: string) {
    setZoneamentoPadraoMeap(talhao.id, id);
    recarregarZon();
    setAmb(obterOuAdotarAmbiente(talhao.id));
  }

  function excluir(id: string) {
    deleteZoneamentoMeap(id);
    if (vendoId === id) setVendoId(null);
    recarregarZon();
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
            {/* ───── ETAPA 1 — Configurar (camadas + pesos + método) ───── */}
            <EtapaHdr n={1} t="Configurar" />
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-semibold" style={{ color: '#64748b' }}>Camadas a usar ({chaves.length}/{carregadas.camadas.length}) — clique p/ pré-visualizar</span>
                {previewCh && <button onClick={() => setPreviewCh(null)} className="text-[9px] font-semibold flex items-center gap-0.5" style={{ color: '#fbbf24' }}>ocultar prévia <X size={9} /></button>}
              </div>
              <div className="flex flex-wrap gap-1">
                {carregadas.camadas.map(c => {
                  const on = chaves.includes(c.chave);
                  const prev = previewCh === c.chave;
                  return (
                    <button key={c.chave} onClick={() => { toggle(c.chave); setPreviewCh(c.chave); }}
                      className="flex items-center gap-1 px-1.5 py-1 rounded text-[10px] font-semibold"
                      title="Clique: seleciona e mostra a prévia no mapa"
                      style={{ background: on ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: on ? '#fff' : '#93c5fd', border: `1px solid ${prev ? '#fbbf24' : on ? '#60a5fa' : '#1a3a6b'}` }}>
                      {on && <Check size={9} />} {c.simbolo} <span style={{ opacity: 0.7 }}>{c.prof}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pesos por camada (quanto cada uma pesa na separação das zonas) */}
            {chaves.length > 0 && (
              <div>
                <span className="text-[9px] font-semibold block mb-1" style={{ color: '#64748b' }}>Peso de cada camada (0 = ignora · 1 = padrão · ↑ = manda mais)</span>
                <div className="space-y-1">
                  {carregadas.camadas.filter(c => chaves.includes(c.chave)).map(c => {
                    const p = pesos[c.chave] ?? 1;
                    return (
                      <div key={c.chave} className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: '#93c5fd', minWidth: '92px' }}>{c.simbolo} <span style={{ opacity: 0.65 }}>{c.prof}</span></span>
                        <input type="range" min={0} max={3} step={0.5} value={p} onChange={e => setPeso(c.chave, Number(e.target.value))} className="flex-1 accent-violet-500" />
                        <span className="text-[10px] font-bold tabular-nums flex-shrink-0" style={{ color: p === 1 ? '#64748b' : '#c4b5fd', minWidth: '26px', textAlign: 'right' }}>{p}×</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <span className="text-[9px] font-semibold block mb-1" style={{ color: '#64748b' }}>Algoritmo</span>
              <div className="grid grid-cols-2 gap-1">
                {([['fcm', 'Fuzzy'], ['kmeans', 'K-means']] as const).map(([m, t]) => (
                  <button key={m} onClick={() => mudarAlgoritmo(m)} className="py-1.5 rounded text-[10px] font-semibold"
                    style={{ background: algoritmo === m ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: algoritmo === m ? '#fff' : '#93c5fd', border: `1px solid ${algoritmo === m ? '#60a5fa' : '#1a3a6b'}` }}>{t}</button>
                ))}
              </div>
            </div>

            <button onClick={analisar} disabled={analisando || chaves.length === 0}
              className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-2"
              style={{ background: analisando ? '#1a3a6b' : '#1d4ed8', opacity: analisando || chaves.length === 0 ? 0.7 : 1 }}>
              {analisando ? <><Loader2 size={13} className="animate-spin" /> Analisando…</> : <><BarChart3 size={13} /> Analisar (FPI × NCE)</>}
            </button>

            {/* ───── ETAPA 2 — Analisar (quantas zonas?) ───── */}
            {analise && (
              <div className="p-2 rounded space-y-2" style={{ background: '#0a1f33', border: '1px solid #1d4ed8' }}>
                <EtapaHdr n={2} t="Analisar — quantas zonas?" />
                {analise.sugestao_c != null && (() => {
                  const conf = analise.confianca;
                  const cc = conf >= 66 ? { bg: '#0f2a1a', cor: '#86efac' } : conf >= 33 ? { bg: '#2d1a00', cor: '#fbbf24' } : { bg: '#2a0f12', cor: '#f87171' };
                  return (
                    <div className="flex items-start gap-2 p-2 rounded" style={{ background: '#0b1f3a', border: '1px solid #1e3a8a' }}>
                      <Sparkles size={13} className="flex-shrink-0 mt-0.5" style={{ color: '#93c5fd' }} />
                      <div className="min-w-0">
                        <p className="text-[11px]" style={{ color: '#e2e8f0' }}>
                          Sugestão: <strong style={{ color: '#93c5fd' }}>{analise.sugestao_c} zonas</strong>
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold ml-1.5" style={{ background: cc.bg, color: cc.cor }}>confiança {conf}%</span>
                        </p>
                        <p className="text-[9px] leading-relaxed mt-0.5" style={{ color: '#94a3b8' }}>{analise.justificativa}</p>
                      </div>
                    </div>
                  );
                })()}

                <IndicesChart indices={analise.indices} sugestao={analise.sugestao_c} />
                <p className="text-[9px] leading-relaxed" style={{ color: '#6d8bbe' }}>
                  <strong style={{ color: '#22d3ee' }}>FPI</strong> e <strong style={{ color: '#fbbf24' }}>NCE</strong> menores = zonas mais organizadas. O ponto onde a curva «empena» (estilo cotovelo) costuma ser o melhor nº.
                </p>

                <div>
                  <span className="text-[9px] font-semibold block mb-1" style={{ color: '#64748b' }}>Número de zonas (a sugestão não é obrigatória)</span>
                  <div className="flex flex-wrap gap-1">
                    {Array.from({ length: 11 }, (_, i) => i + 2).map(n => {
                      const sel = nClasses === n;
                      const sug = analise.sugestao_c === n;
                      return (
                        <button key={n} onClick={() => { setNClasses(n); setRes(null); }}
                          className="relative px-2.5 py-1 rounded text-[11px] font-bold"
                          style={{ background: sel ? '#5b21b6' : '#1a3a6b', color: sel ? '#fff' : '#93c5fd', border: `1px solid ${sel ? '#a78bfa' : sug ? '#fbbf24' : '#1a3a6b'}` }}>
                          {n}{sug && <Star size={7} className="absolute -top-1 -right-1" fill="#fbbf24" style={{ color: '#fbbf24' }} />}
                        </button>
                      );
                    })}
                  </div>
                  {analise.sugestao_c != null && <span className="text-[9px] mt-0.5 inline-flex items-center gap-1" style={{ color: '#475569' }}><Star size={7} fill="#fbbf24" style={{ color: '#fbbf24' }} /> = sugerido</span>}
                </div>
              </div>
            )}

            {/* ───── ETAPA 3 — Decidir e gerar (regras + resumo + confirmar) ───── */}
            {analise && nClasses >= 2 && (
              <div className="p-2 rounded space-y-2" style={{ background: '#0b1f3a', border: '1px solid #2e5fa3' }}>
                <EtapaHdr n={3} t="Decidir e gerar" />
                <label className="block">
                  <span className="text-[9px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Área mínima de zona (ha) — funde manchas pequenas na vizinha mais parecida</span>
                  <input type="number" step="0.5" min="0" value={areaMin}
                    onChange={e => { setAreaMin(Math.max(0, Number(e.target.value.replace(',', '.')) || 0)); setRes(null); }}
                    className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
                  <span className="text-[9px]" style={{ color: '#475569' }}>0 = sem fusão (mapa fiel aos dados).</span>
                </label>

                {/* Resumo do processamento (confirmação antes de gerar) */}
                <div className="p-2 rounded text-[10px] leading-relaxed" style={{ background: '#061525', border: '1px solid #1a3a6b', color: '#94a3b8' }}>
                  <p style={{ color: '#cbd5e1' }} className="font-semibold mb-0.5">Resumo</p>
                  <p>Camadas: {carregadas.camadas.filter(c => chaves.includes(c.chave)).map(c => `${c.simbolo}${(pesos[c.chave] ?? 1) !== 1 ? ` (${pesos[c.chave] ?? 1}×)` : ''}`).join(', ')}</p>
                  <p>Método: {algoritmo === 'fcm' ? 'fuzzy c-means' : 'k-means'} · Zonas: <strong style={{ color: '#e2e8f0' }}>{nClasses}</strong> · Área mín.: {areaMin > 0 ? `${areaMin} ha` : '—'}</p>
                </div>

                <button onClick={gerar} disabled={gerando}
                  className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-2"
                  style={{ background: gerando ? '#1a3a6b' : '#5b21b6', opacity: gerando ? 0.7 : 1 }}>
                  {gerando ? <><Loader2 size={13} className="animate-spin" /> Gerando…</> : <><Wand2 size={13} /> Confirmar e gerar zonas</>}
                </button>
              </div>
            )}

            {erro && (
              <div className="flex items-start gap-1.5 p-2 rounded" style={{ background: '#2a0f12', border: '1px solid #7f1d1d' }}>
                <AlertTriangle size={12} style={{ color: '#f87171' }} className="flex-shrink-0 mt-0.5" />
                <p className="text-[10px] leading-relaxed" style={{ color: '#fca5a5' }}>{erro}</p>
              </div>
            )}

            {res && (
              <div className="p-2 rounded space-y-2" style={{ background: '#1a1033', border: '1px solid #5b21b6' }}>
                <div className="flex items-center gap-2">
                  <EtapaHdr n={4} t="Avaliar" />
                  <button onClick={salvar} className="ml-auto flex items-center gap-1 text-[9px] px-2 py-0.5 rounded font-bold text-white" style={{ background: '#065f46' }}>
                    <Save size={9} /> Salvar zoneamento
                  </button>
                  <button onClick={() => setRes(null)} title="Limpar preview" className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                    <X size={9} /> Limpar
                  </button>
                </div>
                <p className="text-[10px]" style={{ color: '#94a3b8' }}>
                  <strong style={{ color: '#e2e8f0' }}>{potenciais.length}</strong> zonas oficiais · <strong style={{ color: '#e2e8f0' }}>{zonas.length}</strong> polígonos · {res.stats.algoritmo === 'fcm' ? 'fuzzy c-means' : 'k-means'} · {res.stats.n_camadas} camadas
                  {res.stats.area_min_ha > 0 && <> · área mín. {res.stats.area_min_ha} ha</>}
                </p>
                <p className="text-[9px] leading-relaxed p-1.5 rounded" style={{ background: '#0b1f3a', color: '#8aa6cf', border: '1px solid #1a3a6b' }}>
                  Cada <strong style={{ color: '#cbd5e1' }}>Zona</strong> é uma classe de potencial, do <strong style={{ color: '#86efac' }}>maior</strong> (Zona 01) ao <strong style={{ color: '#f87171' }}>menor</strong> (Zona {potenciais.length ? potenciais[potenciais.length - 1].num : '—'}). A mesma zona pode estar em vários <strong style={{ color: '#cbd5e1' }}>polígonos</strong> (manchas separadas) — por isso {potenciais.length} zonas e {zonas.length} polígonos. Áreas não seguem a ordem (uma zona alta pode ser pequena).
                </p>

                {/* ZONAS OFICIAIS (= classes) — reordenáveis Alta→Baixa */}
                <div>
                  <p className="text-[9px] mb-1" style={{ color: '#a78bfa' }}>
                    Zonas oficiais ({potenciais.length}) — ordem do potencial por <strong style={{ color: '#e9d5ff' }}>{res.stats.ordem_por}</strong> · ↑/↓ p/ ajustar
                  </p>
                  <div className="space-y-1">
                    {potenciais.map((pt, i) => (
                      <div key={pt.rank} className="flex items-center gap-2 px-2 py-1 rounded" style={{ background: '#0b1f3a', border: '1px solid #2e2050' }}>
                        <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ background: pt.cor, border: '1px solid #fff' }} />
                        <div className="min-w-0 flex-1">
                          <span className="text-[11px] font-bold" style={{ color: '#e2e8f0' }}>Zona {pt.num}</span>
                          <span className="text-[10px] ml-1.5" style={{ color: '#93c5fd' }}>{pt.label}</span>
                          <div className="text-[9px]" style={{ color: '#64748b' }}>
                            {pt.nPolig} polígono{pt.nPolig !== 1 ? 's' : ''} · {pt.areaHa.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ha
                            {pt.nPolig > 1 && <> · menor {pt.menor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} / maior {pt.maior.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ha</>}
                          </div>
                        </div>
                        <div className="flex flex-col flex-shrink-0">
                          <button onClick={() => moverRank(i, -1)} disabled={i === 0} title="Subir" className="leading-none disabled:opacity-30" style={{ color: '#93c5fd' }}><ChevronUp size={12} /></button>
                          <button onClick={() => moverRank(i, 1)} disabled={i === potenciais.length - 1} title="Descer" className="leading-none disabled:opacity-30" style={{ color: '#93c5fd' }}><ChevronDown size={12} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* POLÍGONOS (manchas) — partes das zonas; marque 2+ p/ fundir */}
                <div>
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <p className="text-[9px]" style={{ color: '#a78bfa' }}>
                      Polígonos ({zonas.length}) — partes das zonas · marque 2+ p/ fundir{varCVsimbolo && <> · CV por <strong style={{ color: '#e9d5ff' }}>{varCVsimbolo}</strong></>}
                    </p>
                    {selZonas.size >= 2 && (
                      <button onClick={fundirSelecionadas} className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded font-bold text-white flex-shrink-0" style={{ background: '#5b21b6' }}>
                        <Combine size={10} /> Fundir {selZonas.size}
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    {zonas.map(z => {
                      const on = selZonas.has(z.id);
                      return (
                        <button key={z.id} onClick={() => toggleSelZona(z.id)} title="Marcar para fundir"
                          className="w-full flex items-center gap-2 px-2 py-1 rounded text-left"
                          style={{ background: on ? '#1a1033' : '#061525', border: `1px solid ${on ? '#a78bfa' : '#1a3a6b'}` }}>
                          {on ? <CheckSquare size={12} className="flex-shrink-0" style={{ color: '#a78bfa' }} /> : <Square size={12} className="flex-shrink-0" style={{ color: '#475569' }} />}
                          <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ background: z.cor, border: '1px solid #fff' }} />
                          <span className="text-[10px] font-bold px-1 rounded flex-shrink-0" style={{ background: '#0b1f3a', color: '#93c5fd' }}>Zona {numDeRank.get(z.rank) ?? '—'}</span>
                          <span className="text-[10px]" style={{ color: '#cbd5e1' }}>{z.potencial}</span>
                          <span className="text-[10px] ml-auto" style={{ color: '#64748b' }}>{z.areaHa.toLocaleString('pt-BR')} ha</span>
                          {(() => {
                            const m = cvPorZona[z.id];
                            const h = m?.homogeneidade ? HOMOG[m.homogeneidade] : null;
                            return h && m?.cvValidacao != null
                              ? <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0" style={{ background: h.bg, color: h.cor }}>CV {m.cvValidacao.toLocaleString('pt-BR')}%</span>
                              : null;
                          })()}
                        </button>
                      );
                    })}
                  </div>
                  {selZonas.size >= 2 && (
                    <p className="text-[9px] mt-1 leading-relaxed" style={{ color: '#6d5b9e' }}>
                      A fusão dissolve as divisas num polígono só; ele herda a zona da MAIOR parte. Não muda o nº de zonas oficiais (só junta polígonos).
                    </p>
                  )}
                </div>

                <p className="text-[9px] leading-relaxed" style={{ color: '#6d5b9e' }}>
                  Clique em <strong style={{ color: '#86efac' }}>Salvar zoneamento</strong> para guardá-lo. Você pode salvar vários e marcar um como <strong style={{ color: '#fbbf24' }}>Padrão</strong> — esse vai para a <strong style={{ color: '#93c5fd' }}>Amostragem</strong> gerar o grid.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Zoneamentos salvos (1 padrão → Amostragem) ── */}
      {zoneamentos.length > 0 && (
        <div className="rounded-lg p-2.5 space-y-1.5" style={{ background: '#0a1929', border: '1px solid #1a3a6b' }}>
          <div className="flex items-center gap-2">
            <Star size={12} style={{ color: '#fbbf24' }} />
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#cbd5e1' }}>Zoneamentos salvos ({zoneamentos.length})</span>
          </div>
          {zoneamentos.map(z => (
            <div key={z.id} onClick={() => setVendoId(vendoId === z.id ? null : z.id)} title="Clique para ver no mapa"
              className="px-2 py-1.5 rounded cursor-pointer transition-colors"
              style={{ background: vendoId === z.id ? '#0f2240' : '#061525', border: `1px solid ${vendoId === z.id ? '#22d3ee' : (z.padrao ? '#a16207' : '#1a3a6b')}` }}>
              <div className="flex items-center gap-2">
                {vendoId === z.id && <Eye size={11} className="flex-shrink-0" style={{ color: '#22d3ee' }} />}
                <span className="text-xs font-bold flex-1 truncate" style={{ color: '#e2e8f0' }}>{z.nome}</span>
                {z.padrao
                  ? <span className="text-[9px] px-1.5 py-0.5 rounded font-bold flex items-center gap-1 flex-shrink-0" style={{ background: '#3a2e0a', color: '#fbbf24' }}><Star size={8} /> Padrão</span>
                  : <button onClick={e => { e.stopPropagation(); tornarPadrao(z.id); }} className="text-[9px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0" style={{ background: '#1a3a6b', color: '#93c5fd' }}>Tornar padrão</button>}
                <button onClick={e => { e.stopPropagation(); excluir(z.id); }} title="Excluir" className="p-1 rounded flex-shrink-0" style={{ color: '#f87171' }}><Trash2 size={12} /></button>
              </div>
              <p className="text-[9px] mt-0.5" style={{ color: '#64748b' }}>
                {z.meta.nZonas} zonas oficiais{z.meta.nPoligonos ? ` · ${z.meta.nPoligonos} polígonos` : ''} · {z.meta.algoritmo === 'fcm' ? 'fuzzy' : 'k-means'}
                {z.meta.cvMedio != null && <> · CV médio {z.meta.cvMedio.toLocaleString('pt-BR')}%</>}
                {z.meta.camadas.length > 0 && <> · {z.meta.camadas.join(', ')}</>}
                {z.padrao && <span style={{ color: '#fbbf24' }}> · usado na Amostragem</span>}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
