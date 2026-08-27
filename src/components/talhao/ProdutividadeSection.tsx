'use client';

// Aba Produtividade — Módulo 12 (Mapas de Colheita), P1 + P2 (porte oficial).
// Etapas: 1) Importar máquinas → 2) Unificação (correção por colhedora) →
// 3) Limpeza (filtro bruto + MapFilter global/local) → 4) Interpolação IDW +
// MÉDIA REAL. A limpeza+unificação+IDW rodam no backend (pipeline oficial QGIS
// portado). Salva como versão; 1 = oficial. + Comparador Produtividade × NDVI.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { hojeSaoPauloISO, periodoDeData, rotuloEpoca } from '@/lib/periodo';
import { useApp } from '@/context/AppContext';
import {
  getSafras, getPlantio, getTalhoes, getFazendas, getClientes, getLegendasPorAtributo,
  getMapasProdutividade, saveMapaProdutividade,
  setMapaProdutividadeOficial, deleteMapaProdutividade, updateMapaProdutividade, type MapaProdutividade,
} from '@/lib/store';
import {
  extrairPoligono, coordsFromBounds, gradienteCss, comprimirGrid, descomprimirGrid, rampaDaLegenda, decodeGrid,
  type RespInterp, type Grid,
} from '@/lib/fertilidade';
import { colorirGrid, colorirGridComLegenda, colorirGridPorQuantis } from '@/lib/raster';
import type { ClassificacaoQuantis } from '@/lib/quantis';
import { rasterizarPontos5, type Classe5 } from '@/lib/condutividade';
import {
  coberturaEmGrid, coberturaEmPoligono, recortarPorCobertura, nivelCobertura,
  RAIO_COBERTURA_PADRAO, type Cobertura,
} from '@/lib/cobertura';
import { rasterizarCobertura } from '@/lib/coberturaRender';
import { pontoEmGeometria } from '@/lib/meap/cv';
import {
  parseCsvTexto, autoColunas, pontosDeCsv, lerShapefilePontos, pontosDeGeojson,
  processarColheita, statsDoGrid, legendaDaCultura, emUnidade, rotuloUnidade, sugerirFiltroBruto, quantisDaProdutividade,
  SACA_KG, PARAMS_COLHEITA_PADRAO, f32ParaB64,
  type PontoColheita, type Unidade, type StatsProd, type CsvParsed, type ParamsColheita, type RelatorioColheita,
} from '@/lib/produtividade';
import { cloudSalvarMapa, cloudCarregarMapasPorPrefixo, cloudPodeGravar } from '@/lib/cloud';
import { carregarNdviSalvos, type NdviCamada } from '@/lib/meap/gerar';
import { carregarContextoRelatorio } from '@/lib/relatorioDados';
import { zonasDoTalhao } from '@/lib/zonasDoTalhao';
import { amostrarPorZona } from '@/lib/validacao/amostragem';
import { resumoValores, separacaoEntreZonas } from '@/lib/validacao/estatistica';
import { correlacaoGrids, sobreposicaoBbox } from '@/lib/correlacaoGrid';
import { classesQuantis } from '@/lib/quantis';
import { gerarRelatorioProdutividade, type ZonaRel, type NdviRel } from '@/lib/relatorioProdutividade';
import { classeZona, classeReconhecida } from '@/lib/zonas';
import { areaHaGeo } from '@/lib/areaGeo';
import { ComparadorProdNdvi } from '@/components/talhao/ComparadorProdNdvi';
import { SeletorLegenda, legendasDoModulo, usePrefLegenda } from './SeletorLegenda';
import { respeitarPadraoHomonima, rampaVisualStops, corCheiaDaClasse } from '@/lib/legendas';
import type { Legenda } from '@/lib/legendas';
import { Upload, Loader2, AlertTriangle, Save, Star, Trash2, Eye, Wand2, FileSpreadsheet, Plus, Layers, ChevronDown, ChevronUp, FileDown, Pencil } from 'lucide-react';

import { inputStyle } from '@/constants/ui';
import { fmtMoeda, lerMoeda, arredMoeda } from '@/lib/formato';
import { precoPorKg, pontoEquilibrioKgha, rotuloPreco, gridRentabilidade, classesRentabilidade, classesRentabilidadeDaLegenda, resumoRentabilidade, arrendamentoPorHa, ALQUEIRES, ALQUEIRE_HA_PADRAO, type UnidadeVenda } from '@/lib/rentabilidade';
import { coefDe, gridExportacao, resumoExportacao, equivalentesDe } from '@/lib/exportacao';
import { coeficientesDaCultura, fertilizantesCom } from '@/lib/exportacaoBib';
import { SIMBOLO_NUTRIENTE, type Nutriente } from '@/lib/insumos';
import { fmtMinMax0 as fmt, fmtHa } from '@/lib/formato';
const CULTURAS = ['soja', 'milho', 'trigo', 'feijao', 'outro'];
const EPOCAS: Array<{ v: string; l: string }> = [{ v: '', l: '—' }, { v: 'verao', l: 'Verão' }, { v: 'safrinha', l: 'Safrinha' }, { v: 'inverno', l: 'Inverno' }];
const prefixoProd = (talhaoId: string) => `${talhaoId}__prod__`;
const idProd = (talhaoId: string, recId: string) => `${prefixoProd(talhaoId)}${recId}`;
const paraKgha = (v: number, u: Unidade) => (u === 'sc/ha' ? v * SACA_KG : u === 't/ha' ? v * 1000 : v);
// Lado do pixel (m) de um grid, pelos bounds e pelo shape. Cada fonte de imagem
// tem a sua resolução (Sentinel-2 10 m, CBERS-4A 2 m no PAN), então a área das
// faixas do índice precisa sair da malha DELE, não da malha da produtividade.
const pixelMDoGrid = (b: [number, number, number, number], shape: [number, number]): number => {
  const [w, s2, e, n] = b;
  const cols = shape[1];
  if (!cols) return 10;
  const larguraM = Math.abs(e - w) * 111320 * Math.cos((((s2 + n) / 2) * Math.PI) / 180);
  return larguraM / cols;
};

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
  // Data de referência (colheita) → Ano/Época do período (default hoje-SP).
  const [dataRef, setDataRef] = useState<string>(() => hojeSaoPauloISO());
  const periodoProd = periodoDeData(dataRef);
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
  const legendaInicial = (c: string) => {
    const alvo = legendasProd.find(l => l.id === legProdId);
    // Preferência apontando para a gêmea não-padrão (mesmo nome) → vale a padrão.
    return alvo ? respeitarPadraoHomonima(legendasProd, alvo) : legendaDaCultura(c);
  };
  const [relatorio, setRelatorio] = useState<RelatorioColheita | null>(null);
  const [fresco, setFresco] = useState(false);
  const [verBrutos, setVerBrutos] = useState(false);   // preview dos pontos crus em 5 classes
  // Conferência de cobertura ANTES de processar: o IDW preenche o polígono
  // inteiro, então um talhão colhido pela metade vira um mapa inteiro e
  // plausível. Aqui a falta aparece como falta, antes dos 30–60 s do backend.
  const [raioCob, setRaioCob] = useState(RAIO_COBERTURA_PADRAO);
  const [recortarSemDados, setRecortarSemDados] = useState(true);
  const [verCobertura, setVerCobertura] = useState(false);
  const [cobPrevia, setCobPrevia] = useState<Cobertura | null>(null);
  const [cobFinal, setCobFinal] = useState<Cobertura | null>(null);
  const [classesBrutos, setClassesBrutos] = useState<Classe5[] | null>(null);
  // Escala do mapa: 'absoluta' = faixas fixas da cultura (a lavoura é boa?);
  // 'quantil' = 5 faixas de área igual, cortes vindos dos próprios dados
  // (onde, DENTRO dela, está o melhor e o pior?).
  const [modoMapa, setModoMapa] = useState<'absoluta' | 'quantil'>('absoluta');
  // Relatório PDF: qual cena de índice entra na pág. 3 e no gráfico de dispersão.
  const [ndvisProd, setNdvisProd] = useState<NdviCamada[]>([]);
  const [ndviSelProd, setNdviSelProd] = useState('');
  const [gerandoPdf, setGerandoPdf] = useState('');   // '' | 'atual' | id da versão
  // Seções OPCIONAIS do relatório. Cada uma só liga quando tem de onde sair:
  // rentabilidade precisa de preço+custo no mapa; exportação precisa de
  // coeficiente cadastrado para a cultura.
  const [secRent, setSecRent] = useState(true);
  // Versão salva que está no mapa (null = mapa recém-processado, ainda sem
  // economia gravada). É dela que saem preço e custo para o relatório.
  //
  // Guarda o ID, não o objeto: guardar o objeto o congelava no estado de
  // quando o olho foi clicado, e aí editar preço/custo no lápis não chegava
  // até aqui — a seção de rentabilidade seguia desabilitada depois de
  // preenchida. Derivando da lista, qualquer recarregar() propaga.
  const [versaoVistaId, setVersaoVistaId] = useState<string | null>(null);
  const [secK2O, setSecK2O] = useState(false);
  const [secP2O5, setSecP2O5] = useState(false);
  const [secK2OExt, setSecK2OExt] = useState(false);
  const [secP2O5Ext, setSecP2O5Ext] = useState(false);
  const [editando, setEditando] = useState<MapaProdutividade | null>(null);
  const [erroPdf, setErroPdf] = useState('');
  // O que as seções opcionais têm de onde sair. Recalcula quando a cultura
  // muda ou quando o cadastro da Biblioteca é editado noutra aba.
  const [tickBib, setTickBib] = useState(0);
  useEffect(() => {
    const h = () => setTickBib(t => t + 1);
    window.addEventListener('inv:biblioteca', h);
    return () => window.removeEventListener('inv:biblioteca', h);
  }, []);
  const coefCultura = useMemo(() => coeficientesDaCultura(cultura), [cultura, tickBib]);
  const coefK2O = coefCultura ? coefDe(coefCultura.conteudo?.coeficientes, 'k2o') : null;
  const coefP2O5 = coefCultura ? coefDe(coefCultura.conteudo?.coeficientes, 'p2o5') : null;
  // EXTRAÇÃO é outro conjunto de números da MESMA cultura na Biblioteca: o que a
  // planta inteira absorveu, não o que saiu no grão. Cultura sem ele cadastrado
  // simplesmente não oferece a seção.
  const coefK2OExt = coefCultura ? coefDe(coefCultura.conteudo?.coeficientesExtracao, 'k2o') : null;
  const coefP2O5Ext = coefCultura ? coefDe(coefCultura.conteudo?.coeficientesExtracao, 'p2o5') : null;

  const quantis: ClassificacaoQuantis | null = useMemo(
    () => (res?.grid && legenda ? quantisDaProdutividade(res, legenda, 5) : null),
    [res, legenda],
  );

  const [versoes, setVersoes] = useState<MapaProdutividade[]>([]);
  const [rasters, setRasters] = useState<Record<string, { bounds: [number, number, number, number]; grid: Grid }>>({});
  const recarregar = () => setVersoes(nav.talhaoId ? getMapasProdutividade(nav.talhaoId, safra) : []);
  const versaoVista = useMemo(
    () => (versaoVistaId ? versoes.find(v => v.id === versaoVistaId) ?? null : null),
    [versaoVistaId, versoes],
  );
  const economiaAtual = versaoVista?.economia ?? null;

  useEffect(() => {
    recarregar();
    setRes(null); setStats(null); setFresco(false); setMaqs([]); setColunas([]); setRelatorio(null); setBrutoTocado(false);
    setNdvisProd([]); setNdviSelProd(''); setErroPdf('');
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
      // Índices mantidos do talhão — alimentam a página de NDVI e a dispersão.
      const nd = await carregarNdviSalvos(nav.talhaoId!).catch(() => [] as NdviCamada[]);
      setNdvisProd(nd);
      setNdviSelProd(nd[0]?.chave ?? '');
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
    if (verCobertura && cobPrevia && legenda && pontosBrutos.length) {
      const img = rasterizarCobertura(pontosBrutos, cobPrevia, legenda.classes.map(corCheiaDaClasse));
      if (img) { setFertilidadeOverlay({ url: img.dataUrl, coordinates: coordsFromBounds(img.bounds), opacity: 1 }); setFertilidadeLabels(null); setClassesBrutos(null); return; }
    }
    if (verBrutos && legenda && pontosBrutos.length) {
      const { dominio, stops } = rampaDaLegenda(legenda);
      const img = rasterizarPontos5(pontosBrutos, dominio, stops);
      if (img) { setFertilidadeOverlay({ url: img.dataUrl, coordinates: coordsFromBounds(img.bounds), opacity: 1 }); setFertilidadeLabels(null); setClassesBrutos(img.classes); return; }
    }
    setClassesBrutos(null);
    if (!res?.grid?.b64 || !legenda) { setFertilidadeOverlay(null); setFertilidadeLabels(null); return; }
    let url: string | undefined;
    try {
      url = modoMapa === 'quantil' && quantis
        ? colorirGridPorQuantis(res.grid, quantis.breaks, quantis.faixas.map(f => f.cor)).dataUrl
        : colorirGridComLegenda(res.grid, legenda).dataUrl;
    } catch (e) { console.warn('[prod] colorir falhou:', e); }
    if (!url && res.png) url = res.png;
    if (!url) { setFertilidadeOverlay(null); return; }
    setFertilidadeOverlay({ url, coordinates: coordsFromBounds(res.bounds), opacity: 1 });
    setFertilidadeLabels(null);
  }, [verBrutos, verCobertura, cobPrevia, pontosBrutos, res, legenda, modoMapa, quantis, setFertilidadeOverlay, setFertilidadeLabels]);

  // Cobertura estimada sobre o POLÍGONO — não depende do backend.
  useEffect(() => {
    if (!verCobertura || !poligono || !pontosBrutos.length) { setCobPrevia(null); return; }
    try {
      setCobPrevia(coberturaEmPoligono(poligono, pontosBrutos, pixelM, raioCob, pontoEmGeometria));
    } catch (e) { console.warn('[prod] cobertura falhou:', e); setCobPrevia(null); }
  }, [verCobertura, poligono, pontosBrutos, pixelM, raioCob]);

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

      // COBERTURA sobre o grid que voltou — mesma malha, então a máscara casa
      // célula a célula. Recortar AQUI, antes de statsDoGrid, faz área,
      // produção, quantis e cores saírem todos do mesmo raster: o grid é a
      // fonte da verdade e ninguém mais precisa saber do recorte.
      let cob: Cobertura | null = null;
      if (r.grid?.b64) {
        try {
          const dec = decodeGrid(r.grid);
          cob = coberturaEmGrid(dec.valores, dec.rows, dec.cols, r.bounds, pontosBrutos, r.stats?.pixel_m ?? pixelM, raioCob);
          if (recortarSemDados && cob.areaSemDadoHa > 0) {
            r.grid = { ...r.grid, b64: f32ParaB64(recortarPorCobertura(dec.valores, cob)) };
          }
        } catch (e) { console.warn('[prod] cobertura falhou:', e); cob = null; }
      }

      const st = statsDoGrid(r, r.relatorio.n_usados);
      if (!st) throw new Error('Não foi possível calcular o raster.');
      setRes(r); setStats(st); setLegenda(leg); setRelatorio(r.relatorio); setCobFinal(cob); setVersaoVistaId(null); setFresco(true); setEstado('pronto');
    } catch (e) { setEstado('erro'); setErro(e instanceof Error ? e.message : 'Falha ao processar.'); }
  }

  async function salvar() {
    if (!res || !stats || !nav.talhaoId) return;
    if (!cloudPodeGravar()) { setErro('Faça login para salvar o mapa.'); return; }
    const primeiro = versoes.filter(v => v.cultura === cultura && v.epoca === epoca).length === 0;
    const mr = parseFloat(mediaReal);
    const rec = saveMapaProdutividade({
      talhaoId: nav.talhaoId, safra, epoca, dataReferencia: dataRef, cultura, oficial: primeiro, unidade,
      nMaquinas: maqs.length, normalizado: clean.corrigir_colhedora,
      mediaRealKgha: isFinite(mr) && mr > 0 ? paraKgha(mr, unidade) : null,
      cleaning: clean as unknown as Record<string, number | boolean>,
      params: { removerZeros: true, pLo: 0, pHi: 100, min: clean.hard_min, max: clean.hard_max, pixelM },
      bounds: res.bounds,
      stats: { nPontos: nPontosTotal, nUsados: stats.nUsados, areaHa: stats.areaHa, producaoTotalKg: stats.producaoTotalKg, mediaKgha: stats.mediaKgha, minKgha: stats.minKgha, maxKgha: stats.maxKgha, cv: stats.cv },
      arquivo: maqs.map(m => m.arquivo).join(', '),
      cobertura: cobFinal ? {
        pctCobertura: cobFinal.pctCobertura, areaSemDadoHa: cobFinal.areaSemDadoHa,
        maiorVazioHa: cobFinal.maiorVazioHa, raioM: cobFinal.raioM, recortado: recortarSemDados,
      } : undefined,
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
    setUnidade(v.unidade); setFresco(false); setVersaoVistaId(v.id);
    setCobFinal(null);   // a máscara não é arquivada; os números vêm de v.cobertura
  }
  // ── Relatório PDF ───────────────────────────────────────────────────────────
  // Serve os dois botões: sem argumento usa o mapa em tela; com `v`, uma versão
  // salva (o raster vem da nuvem, em `rasters`).
  async function exportarPdf(v?: MapaProdutividade) {
    if (!nav.talhaoId || !poligono) { setErroPdf('Limite do talhão não encontrado — abra o talhão no mapa.'); return; }
    const fonte = v
      ? (() => { const r = rasters[v.id]; return r ? { grid: r.grid, bounds: r.bounds, pixelM: v.params.pixelM, cultura: v.cultura, unidade: v.unidade, dataRef: v.dataReferencia ?? v.criadoEm.slice(0, 10), dataPlantio: v.dataPlantio ?? null, stats: { nUsados: v.stats.nUsados, areaHa: v.stats.areaHa, producaoTotalKg: v.stats.producaoTotalKg, mediaKgha: v.stats.mediaKgha, minKgha: v.stats.minKgha, maxKgha: v.stats.maxKgha, cv: v.stats.cv, histograma: [] } as StatsProd, limpeza: null as RelatorioColheita | null, cleaningSalvo: v.cleaning, nPontos: v.stats.nPontos, versao: v.versao, nMaquinas: v.nMaquinas, mediaRealKgha: v.mediaRealKgha, cobertura: v.cobertura ?? null, economia: v.economia ?? null } : null; })()
      : (res?.grid && stats ? { grid: res.grid, bounds: res.bounds, pixelM: res.stats?.pixel_m ?? pixelM, cultura, unidade, dataRef, dataPlantio: null, stats, limpeza: relatorio, cleaningSalvo: clean as unknown as Record<string, number | boolean>, nPontos: nPontosTotal, versao: null, nMaquinas: maqs.length, mediaRealKgha: null, economia: versaoVista?.economia ?? null, cobertura: cobFinal ? { pctCobertura: cobFinal.pctCobertura, areaSemDadoHa: cobFinal.areaSemDadoHa, maiorVazioHa: cobFinal.maiorVazioHa, raioM: cobFinal.raioM, recortado: recortarSemDados } : null } : null);
    if (!fonte) { setErroPdf(v ? 'Raster desta versão não está na nuvem (reprocesse).' : 'Processe um mapa antes de gerar o relatório.'); return; }

    setGerandoPdf(v ? v.id : 'atual'); setErroPdf('');
    try {
      const leg = legendaInicial(fonte.cultura);
      if (!leg) throw new Error('Legenda de produtividade não encontrada.');

      const ctx = await carregarContextoRelatorio(nav.talhaoId, safra, poligono);
      const talhaoRec = getTalhoes().find(t => t.id === nav.talhaoId);
      const faz = talhaoRec ? getFazendas().find(f => f.id === talhaoRec.fazendaId) : undefined;
      const cli = faz ? getClientes().find(c => c.id === faz.clienteId) : undefined;
      const logoClienteUrl = (cli as { logoUrl?: string } | undefined)?.logoUrl ?? null;

      const dec = decodeGrid(fonte.grid);
      const resumo = resumoValores(dec.valores);
      const cores = leg.classes.length === 5 ? leg.classes.map(corCheiaDaClasse) : [];
      const q = classesQuantis(dec.valores, {
        k: 5, pixelM: fonte.pixelM,
        cores: cores.length ? cores : ['#B3261E', '#E8710A', '#F2C200', '#7CB342', '#1B5E20'],
        nomes: leg.classes.length === 5 ? leg.classes.map(c => c.nome) : ['Muito Baixa', 'Baixa', 'Média', 'Alta', 'Muito Alta'],
      });
      if (!q) throw new Error('Não foi possível calcular as faixas por quantil deste mapa.');

      const rasterAbsolutoPng = colorirGridComLegenda(fonte.grid, leg).dataUrl;
      const rasterQuantilPng = colorirGridPorQuantis(fonte.grid, q.breaks, q.faixas.map(f => f.cor)).dataUrl;

      // ── NDVI escolhido (opcional) ──
      const nd = ndvisProd.find(n => n.chave === ndviSelProd) ?? null;
      const ndviLeg = getLegendasPorAtributo('ndvi')[0];
      let ndvi: NdviRel | null = null;
      let correlacao = null as ReturnType<typeof correlacaoGrids> | null;
      let sobrepos: number | null = null;
      if (nd && ndviLeg) {
        const gNdvi = { b64: nd.b64, shape: nd.shape };
        const decN = decodeGrid(gNdvi);
        let soma = 0, n = 0;
        for (let i = 0; i < decN.valores.length; i++) { const x = decN.valores[i]; if (isFinite(x)) { n++; soma += x; } }
        // O índice do relatório é SEMPRE classificado por quintil (decisão do
        // usuário): 5 faixas de área igual, cortes vindos da própria cena. Some
        // a discussão "escala esticada × escala verdadeira" — quintil é
        // auto-escalante — e a página fala a mesma língua da página do mapa por
        // quantil. As cores saem da legenda do ÍNDICE, não da de produtividade:
        // mesma estrutura, paletas distintas, para o leitor não confundir as
        // duas grandezas.
        const coresNd = ndviLeg.classes.length === 5 ? ndviLeg.classes.map(corCheiaDaClasse) : [];
        const qNdvi = classesQuantis(decN.valores, {
          k: 5,
          pixelM: pixelMDoGrid(nd.bounds, nd.shape),
          cores: coresNd.length ? coresNd : ['#7A1F00', '#E65100', '#D4E157', '#4CAF50', '#1B5E20'],
          nomes: ndviLeg.classes.length === 5 ? ndviLeg.classes.map(c => c.nome) : ['Muito Baixo', 'Baixo', 'Médio', 'Alto', 'Muito Alto'],
        });
        let pngNd = '';
        try {
          pngNd = qNdvi
            ? colorirGridPorQuantis(gNdvi, qNdvi.breaks, qNdvi.faixas.map(f => f.cor)).dataUrl
            : colorirGrid(gNdvi, [0, 1], rampaVisualStops({ ...ndviLeg, estilo: 'continuo' })).dataUrl;
        } catch { pngNd = colorirGrid(gNdvi, [0, 1], rampaVisualStops({ ...ndviLeg, estilo: 'continuo' })).dataUrl; }
        ndvi = {
          data: nd.data,
          fonte: nd.nut.startsWith('ndvi_cbers') ? 'CBERS-4A' : 'Sentinel-2',
          indice: nd.indice || 'NDVI',
          rasterPng: pngNd,
          bounds: nd.bounds,
          legenda: ndviLeg,
          media: n ? soma / n : 0,
          quantis: qNdvi,
        };
        correlacao = correlacaoGrids(dec, decN, { maxAmostra: 1500, minN: 30 });
        sobrepos = sobreposicaoBbox(fonte.bounds, nd.bounds);
      }

      // ── Zonas de manejo (mesma cascata do módulo Zonas) ──
      const zs = zonasDoTalhao(nav.talhaoId);
      const porZona = zs.length ? amostrarPorZona(zs.map(z => ({ idZona: z.id, geometry: z.geometry })), fonte.grid, fonte.bounds) : new Map<string, number[]>();
      const zonas: ZonaRel[] = zs.map(z => ({
        id: z.id, classe: z.classe,
        // O rótulo e a cor da classe ORIGINAL viajam junto: é por ela que o
        // relatório pinta as zonas, para a folha comparar o zoneamento com a
        // colheita em vez de a zona concordar consigo mesma.
        classeLabel: classeZona(z.classe).label,
        classeConhecida: classeReconhecida(z.classe),
        cor: classeZona(z.classe).cor,
        geometry: z.geometry,
        stats: resumoValores(porZona.get(z.id) ?? []),
        areaHa: areaHaGeo(z.geometry),
      }));
      const grupos = zonas.filter(z => z.stats).map(z => ({ id: z.id, valores: porZona.get(z.id) ?? [] }));
      const separacaoZonas = grupos.length >= 2 ? separacaoEntreZonas(grupos) : null;

      // ── Seções opcionais ────────────────────────────────────────────────
      // Os VALORES viajam para o relatório, não os ids: o cadastro muda
      // depois e o PDF já entregue tem de continuar reproduzível.
      const rentabilidades: NonNullable<Parameters<typeof gerarRelatorioProdutividade>[0]['rentabilidades']> = [];
      const eco = fonte.economia;
      const precoKgRel = eco ? precoPorKg({ valor: eco.precoVenda, unidade: eco.precoUnidade, sacaKg: eco.sacaKg }) : null;
      if (secRent && eco && precoKgRel != null && eco.custoHa > 0) {
        const precoLabel = rotuloPreco({ valor: eco.precoVenda, unidade: eco.precoUnidade, sacaKg: eco.sacaKg });
        const arrHa = eco.arrendamentoScAlq
          ? arrendamentoPorHa(eco.arrendamentoScAlq, precoKgRel, eco.sacaKg ?? 60, eco.alqueireHa ?? ALQUEIRE_HA_PADRAO)
          : null;
        // Com arrendamento saem DUAS páginas. O arrendamento é custo uniforme,
        // então a mancha não muda — mas o zero se desloca, e é a área que
        // deixa de pagar as contas que interessa comparar.
        const cenarios: Array<{ rotulo: string; custoHa: number; arr: number | null }> = arrHa != null
          ? [{ rotulo: 'Sem arrendamento', custoHa: eco.custoHa, arr: null },
             { rotulo: `Com arrendamento (${fmt(eco.arrendamentoScAlq!, 0)} sc/alq)`, custoHa: eco.custoHa + arrHa, arr: arrHa }]
          : [{ rotulo: 'Terra propria', custoHa: eco.custoHa, arr: null }];
        // A legenda MANDA. Faixas e cores saem de Biblioteca -> Legendas
        // (categoria Rentabilidade), para o vermelho/azul querer dizer a mesma
        // coisa em todo relatorio; sem legenda cadastrada (ou com ela quebrada)
        // cai no quantil ancorado no zero, que e como era antes.
        const legRent = getLegendasPorAtributo('rentabilidade')[0];
        const classesRent = legRent?.classes.map(c => ({
          nome: c.nome, valorMin: c.valorMin, valorMax: c.valorMax, cor: corCheiaDaClasse(c),
        }));
        for (const cen of cenarios) {
          const vRent = gridRentabilidade(dec.valores, precoKgRel, cen.custoHa);
          const clsRent = (classesRent && classesRentabilidadeDaLegenda(vRent, classesRent, { pixelM: fonte.pixelM }))
            || classesRentabilidade(vRent, { k: 5, pixelM: fonte.pixelM });
          const resRent = resumoRentabilidade(dec.valores, { precoKg: precoKgRel, custoHa: cen.custoHa, pixelM: fonte.pixelM });
          if (!clsRent || !resRent) continue;
          rentabilidades.push({
            rotulo: cen.rotulo, precoLabel, arrendamentoHa: cen.arr,
            rasterPng: colorirGridPorQuantis({ b64: f32ParaB64(vRent), shape: fonte.grid.shape }, clsRent.breaks, clsRent.faixas.map(f => f.cor)).dataUrl,
            classes: clsRent, resumo: resRent,
          });
        }
      }

      const exportacoes: NonNullable<Parameters<typeof gerarRelatorioProdutividade>[0]['exportacoes']> = [];
      const itemCoef = coeficientesDaCultura(fonte.cultura);
      const pedidos: Array<{ nut: Nutriente; base: 'exportacao' | 'extracao' }> = [
        ...(secK2O ? [{ nut: 'k2o' as Nutriente, base: 'exportacao' as const }] : []),
        ...(secP2O5 ? [{ nut: 'p2o5' as Nutriente, base: 'exportacao' as const }] : []),
        ...(secK2OExt ? [{ nut: 'k2o' as Nutriente, base: 'extracao' as const }] : []),
        ...(secP2O5Ext ? [{ nut: 'p2o5' as Nutriente, base: 'extracao' as const }] : []),
      ];
      for (const { nut, base } of pedidos) {
        // O coeficiente vem SEMPRE do cadastro da cultura — nunca de constante
        // no código: é o número que multiplica a colheita inteira.
        const tabela = base === 'extracao' ? itemCoef?.conteudo?.coeficientesExtracao : itemCoef?.conteudo?.coeficientes;
        const coef = itemCoef ? coefDe(tabela, nut) : null;
        if (coef == null || coef <= 0) continue;
        const vExp = gridExportacao(dec.valores, coef);
        const clsExp = classesQuantis(vExp, {
          k: 5, pixelM: fonte.pixelM,
          // Paleta PRÓPRIA (azul→roxo): a mancha é idêntica à da página do
          // mapa por quantil e só a cor avisa que a grandeza mudou.
          cores: ['#E3F2FD', '#90CAF9', '#42A5F5', '#5E35B1', '#311B92'],
          nomes: ['Muito baixa', 'Baixa', 'Média', 'Alta', 'Muito alta'],
        });
        const resExp = resumoExportacao(dec.valores, { coefKgPorT: coef, pixelM: fonte.pixelM });
        if (!clsExp || !resExp) continue;
        exportacoes.push({
          base,
          simbolo: SIMBOLO_NUTRIENTE[nut],
          cultura: fonte.cultura,
          fonteCoef: itemCoef?.conteudo?.fonte || itemCoef?.nome || 'coeficiente cadastrado',
          rasterPng: colorirGridPorQuantis({ b64: f32ParaB64(vExp), shape: fonte.grid.shape }, clsExp.breaks, clsExp.faixas.map(f => f.cor)).dataUrl,
          classes: clsExp, resumo: resExp,
          equivalentes: equivalentesDe(resExp.mediaKgHa, resExp.areaHa, fertilizantesCom(nut)),
        });
      }

      await gerarRelatorioProdutividade({
        fazenda: ctx.fazenda || nav.fazenda, produtor: ctx.produtor || nav.produtor,
        talhao: ctx.talhao || nav.talhao, safra,
        cultura: fonte.cultura, areaHa: ctx.areaHa || fonte.stats.areaHa,
        municipio: ctx.municipio, estado: ctx.estado, siglaFazenda: ctx.siglaFazenda,
        // Ano/época vêm da COLHEITA (dataReferencia), não do laudo de laboratório
        // que alimenta ctx.ano/ctx.epoca — senão o mapa de colheita seria
        // arquivado com o período da análise de solo.
        ano: null, epoca: null,
        dataReferencia: fonte.dataRef,
        dataPlantio: fonte.dataPlantio,
        logoClienteUrl, poligono, satelite: true, corLimite: '#ffffff',
        unidade: fonte.unidade, bounds: fonte.bounds, pixelM: fonte.pixelM, legenda: leg,
        rasterAbsolutoPng, rasterQuantilPng, quantis: q,
        stats: fonte.stats, resumo, limpeza: fonte.limpeza,
        cleaningSalvo: fonte.cleaningSalvo, nPontosSalvo: fonte.nPontos,
        versao: fonte.versao, nMaquinas: fonte.nMaquinas, mediaRealKgha: fonte.mediaRealKgha,
        ndvi, correlacao, sobreposicaoNdvi: sobrepos, zonas, separacaoZonas,
        cobertura: fonte.cobertura ?? null,
        rentabilidades, exportacoes,
      });
    } catch (e) {
      setErroPdf(e instanceof Error ? e.message : 'Falha ao gerar o relatório.');
    } finally { setGerandoPdf(''); }
  }

  function tornarOficial(id: string) { setMapaProdutividadeOficial(id); recarregar(); }
  function excluir(v: MapaProdutividade) {
    if (!confirm(`Excluir o ${v.cultura} v${v.versao}?`)) return;
    deleteMapaProdutividade(v.id);
    if (nav.talhaoId) cloudSalvarMapa(idProd(nav.talhaoId, v.id), {});
    recarregar();
  }

  if (!safra) return <div className="px-4 py-3"><Aviso texto="Defina um Ano para o mapa de produtividade." /></div>;
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
        <Campo label="Época de cultivo"><select value={epoca} onChange={e => setEpoca(e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>{EPOCAS.map(e2 => <option key={e2.v} value={e2.v}>{e2.l}</option>)}</select></Campo>
        <Campo label="Unidade"><select value={unidade} onChange={e => setUnidade(e.target.value as Unidade)} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>{(['kg/ha', 'sc/ha', 't/ha'] as Unidade[]).map(uu => <option key={uu} value={uu}>{uu}</option>)}</select></Campo>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Campo label="Data de referência (colheita)"><input type="date" value={dataRef} onChange={e => setDataRef(e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} /></Campo>
        <div className="col-span-2 flex items-end pb-1 text-[10px]" style={{ color: periodoProd ? '#86efac' : '#fbbf24' }}>{periodoProd ? `Ano ${periodoProd.ano} · ${rotuloEpoca(periodoProd.epoca)}` : 'data inválida'}</div>
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
          {/* Conferência de cobertura — antes de gastar 30–60 s no backend */}
          <div className="space-y-1.5 p-2 rounded" style={{ background: '#0b1f3a', border: '1px solid #1a3a6b' }}>
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-semibold" style={{ color: '#93c5fd' }}>Cobertura da colheita</p>
              <button onClick={() => setVerCobertura(v => !v)}
                className="flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded"
                style={{ background: verCobertura ? '#2e5fa3' : '#1a3a6b', color: verCobertura ? '#fff' : '#93c5fd' }}>
                <Eye size={10} /> {verCobertura ? 'Ocultar' : 'Conferir no mapa'}
              </button>
            </div>
            <div className="flex gap-2 items-end">
              <Num label="Raio de cobertura (m)" v={raioCob} set={setRaioCob} />
              <div className="flex-1 text-[9px]" style={{ color: '#64748b' }}>
                Célula a mais de {raioCob} m de um ponto conta como sem dado.
              </div>
            </div>
            {verCobertura && (cobPrevia
              ? <CoberturaResumo cob={cobPrevia} nPontos={nPontosTotal} />
              : <p className="text-[9px]" style={{ color: '#64748b' }}>Calculando…</p>)}
            <label className="flex items-start gap-1.5 text-[10px]" style={{ color: '#cbd5e1' }}>
              <input type="checkbox" checked={!recortarSemDados} onChange={e => setRecortarSemDados(!e.target.checked)} className="mt-0.5" />
              <span>
                Extrapolar áreas sem dado
                <span className="block text-[9px]" style={{ color: '#64748b' }}>
                  Desmarcado (padrão), o que a máquina não colheu vira buraco no mapa e sai da área e da produção.
                </span>
              </span>
            </label>
          </div>

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
            <Metrica rotulo="área (ha)" valor={fmtHa(stats.areaHa)} />
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
          {cobFinal && cobFinal.pctCobertura < 100 && (
            <CoberturaResumo cob={cobFinal} nPontos={stats.nUsados} recortado={recortarSemDados} />
          )}
          {stats.histograma.length > 0 && <Histograma h={stats.histograma} unidade={unidade} />}
          <SeletorLegenda legendas={legendasProd} valorId={legenda.id}
            onEscolher={id => { const l = legendasProd.find(x => x.id === id); if (l) { setLegenda(l); escolherLegProd(id); } }} />
          <div className="flex gap-1">
            {([['absoluta', 'Absoluta'], ['quantil', `Quantil (${quantis ? quantis.faixas.length : 5} faixas)`]] as const).map(([v, l]) => (
              <button key={v} onClick={() => setModoMapa(v)} disabled={v === 'quantil' && !quantis}
                className="flex-1 py-1 rounded text-[10px] font-bold disabled:opacity-40"
                style={{ background: modoMapa === v ? '#2e5fa3' : '#1a3a6b', color: modoMapa === v ? '#fff' : '#93c5fd' }}>
                {l}
              </button>
            ))}
          </div>
          {modoMapa === 'quantil' && quantis
            ? <FaixasQuantil q={quantis} unidade={unidade} />
            : <div className="h-3.5 rounded" style={{ border: '1px solid rgba(255,255,255,0.1)', background: gradienteCss(legenda) }} />}
          <p className="text-[9px]" style={{ color: '#64748b' }}>
            {modoMapa === 'quantil'
              ? `Cortes calculados deste mapa · cada faixa ≈ ${quantis ? (100 / quantis.faixas.length).toFixed(0) : '20'}% da área`
              : legenda.nome} · pixel {res.stats?.pixel_m ?? pixelM} m
          </p>
          {fresco && (
            cloudPodeGravar()
              ? <button onClick={salvar} className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5" style={{ background: 'var(--invicta-blue-mid)' }}><Save size={13} /> Salvar como Mapa Oficial</button>
              : <p className="text-[10px]" style={{ color: '#fbbf24' }}>Faça login para salvar.</p>
          )}

          {/* Relatório PDF: mapa absoluto + quantil (+ NDVI) + resumo analítico */}
          {ndvisProd.length > 0 && (
            <Campo label="Índice do relatório (página de NDVI e dispersão)">
              <select value={ndviSelProd} onChange={e => setNdviSelProd(e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>
                <option value="">— sem NDVI —</option>
                {ndvisProd.map(n => (
                  <option key={n.chave} value={n.chave}>
                    {n.indice || 'NDVI'} · {new Date(n.data + 'T00:00:00').toLocaleDateString('pt-BR')} · {n.nut.startsWith('ndvi_cbers') ? 'CBERS' : 'S2'}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          {/* Seções opcionais do relatório */}
          <div className="space-y-1 p-2 rounded" style={{ background: '#0b1f3a', border: '1px solid #1a3a6b' }}>
            <p className="text-[9px] font-semibold" style={{ color: '#93c5fd' }}>Seções opcionais do relatório</p>
            <SecaoOpcional
              marcado={secRent} onMudar={setSecRent}
              rotulo="Mapa de rentabilidade"
              disponivel={!!economiaAtual}
              motivo="Informe preço e custo no lápis do mapa salvo"
              detalhe={economiaAtual ? `${fmtMoeda(economiaAtual.precoVenda)}/${economiaAtual.precoUnidade} · custo ${fmtMoeda(economiaAtual.custoHa)}/ha` : undefined}
            />
            <SecaoOpcional
              marcado={secK2O} onMudar={setSecK2O}
              rotulo="Exportação de K₂O"
              disponivel={coefK2O != null && coefK2O > 0}
              motivo={`Sem coeficiente de K₂O para ${cultura} — Biblioteca → Exportação de Nutrientes`}
              detalhe={coefK2O ? `${fmt(coefK2O, 1)} kg/t${coefCultura?.conteudo?.fonte ? ' · ' + coefCultura.conteudo.fonte : ''}` : undefined}
            />
            <SecaoOpcional
              marcado={secP2O5} onMudar={setSecP2O5}
              rotulo="Exportação de P₂O₅"
              disponivel={coefP2O5 != null && coefP2O5 > 0}
              motivo={`Sem coeficiente de P₂O₅ para ${cultura} — Biblioteca → Exportação de Nutrientes`}
              detalhe={coefP2O5 ? `${fmt(coefP2O5, 1)} kg/t${coefCultura?.conteudo?.fonte ? ' · ' + coefCultura.conteudo.fonte : ''}` : undefined}
            />
            <SecaoOpcional
              marcado={secK2OExt} onMudar={setSecK2OExt}
              rotulo="Extração de K₂O (planta inteira)"
              disponivel={coefK2OExt != null && coefK2OExt > 0}
              motivo={`Sem coeficiente de EXTRAÇÃO de K₂O para ${cultura} — Biblioteca → Exportação de Nutrientes`}
              detalhe={coefK2OExt ? `${fmt(coefK2OExt, 1)} kg/t${coefCultura?.conteudo?.fonte ? ' · ' + coefCultura.conteudo.fonte : ''}` : undefined}
            />
            <SecaoOpcional
              marcado={secP2O5Ext} onMudar={setSecP2O5Ext}
              rotulo="Extração de P₂O₅ (planta inteira)"
              disponivel={coefP2O5Ext != null && coefP2O5Ext > 0}
              motivo={`Sem coeficiente de EXTRAÇÃO de P₂O₅ para ${cultura} — Biblioteca → Exportação de Nutrientes`}
              detalhe={coefP2O5Ext ? `${fmt(coefP2O5Ext, 1)} kg/t${coefCultura?.conteudo?.fonte ? ' · ' + coefCultura.conteudo.fonte : ''}` : undefined}
            />
          </div>

          <button onClick={() => exportarPdf()} disabled={gerandoPdf !== ''}
            className="w-full py-2 rounded text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
            style={{ background: '#1a3a6b', color: '#93c5fd' }}>
            {gerandoPdf === 'atual'
              ? <><Loader2 size={13} className="animate-spin" /> Gerando PDF…</>
              : <><FileDown size={13} /> Relatório de produtividade (PDF)</>}
          </button>
          {erroPdf && <p className="text-[10px]" style={{ color: '#f87171' }}>{erroPdf}</p>}
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
                    {fmt(emUnidade(v.stats.mediaKgha, v.unidade), v.unidade === 'kg/ha' ? 0 : 1)} {v.unidade} méd · {fmtHa(v.stats.areaHa)} ha · {fmt(v.stats.producaoTotalKg / 1000, 1)} t · CV {fmt(v.stats.cv, 1)}%
                  </p>
                </div>
                <button onClick={() => verVersao(v)} title="Ver no mapa" style={{ color: '#93c5fd' }}><Eye size={14} /></button>
                <button onClick={() => setEditando(v)} title="Editar identificação" style={{ color: '#cbd5e1' }}><Pencil size={13} /></button>
                <button onClick={() => exportarPdf(v)} disabled={gerandoPdf !== ''} title="Relatório PDF" className="disabled:opacity-40" style={{ color: '#86efac' }}>
                  {gerandoPdf === v.id ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
                </button>
                {!v.oficial && <button onClick={() => tornarOficial(v.id)} title="Tornar oficial" style={{ color: '#fbbf24' }}><Star size={14} /></button>}
                <button onClick={() => excluir(v)} title="Excluir" style={{ color: '#f87171' }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {editando && (
        <EditarMapa
          mapa={editando}
          onFechar={() => setEditando(null)}
          onSalvo={() => { setEditando(null); recarregar(); }}
        />
      )}

      {/* 5) Comparar Produtividade × NDVI (+ relatório lado a lado) */}
      <ComparadorProdNdvi safraNome={safra} />
    </div>
  );
}

// Edição da IDENTIFICAÇÃO de um mapa salvo. Só o que descreve a colheita —
// cultura, época, datas e unidade. Limpeza, pixel e média real ficam de fora:
// mudá-los aqui deixaria as estatísticas gravadas descrevendo um mapa que não
// existe mais. Para esses, o caminho é reprocessar.
function EditarMapa({ mapa, onFechar, onSalvo }: { mapa: MapaProdutividade; onFechar: () => void; onSalvo: () => void }) {
  const [cultura, setCultura] = useState(mapa.cultura || 'soja');
  const [epoca, setEpoca] = useState(mapa.epoca || '');
  const [dataRef, setDataRef] = useState(mapa.dataReferencia ?? mapa.criadoEm.slice(0, 10));
  const [dataPlantio, setDataPlantio] = useState(mapa.dataPlantio ?? '');
  const [precoTxt, setPrecoTxt] = useState(mapa.economia ? fmtMoeda(mapa.economia.precoVenda) : '');
  const [precoUni, setPrecoUni] = useState<'sc' | 't'>(mapa.economia?.precoUnidade ?? 'sc');
  const [custoTxt, setCustoTxt] = useState(mapa.economia ? fmtMoeda(mapa.economia.custoHa) : '');
  const [arrTxt, setArrTxt] = useState(mapa.economia?.arrendamentoScAlq ? String(mapa.economia.arrendamentoScAlq) : '');
  const [alqHa, setAlqHa] = useState(mapa.economia?.alqueireHa ?? ALQUEIRE_HA_PADRAO);
  const [unidade, setUnidade] = useState<Unidade>(mapa.unidade);

  const per = periodoDeData(dataRef);
  const ciclo = dataPlantio && dataRef
    ? Math.round((new Date(dataRef + 'T00:00:00').getTime() - new Date(dataPlantio + 'T00:00:00').getTime()) / 86400000)
    : null;
  const cicloInvalido = ciclo != null && (!isFinite(ciclo) || ciclo <= 0);

  const precoVenda = arredMoeda(lerMoeda(precoTxt)) ?? 0;
  const custoHa = arredMoeda(lerMoeda(custoTxt)) ?? 0;
  const precoKg = precoPorKg({ valor: precoVenda, unidade: precoUni as UnidadeVenda });
  const arrScAlq = Number(arrTxt.replace(",", ".")) || 0;
  const arrHa = precoKg != null && arrScAlq > 0 ? arrendamentoPorHa(arrScAlq, precoKg, 60, alqHa) : null;
  const custoTotalHa = custoHa + (arrHa ?? 0);
  const equilibrio = precoKg != null && custoHa > 0 ? pontoEquilibrioKgha(precoKg, custoHa) : null;
  const equilibrioArr = precoKg != null && custoTotalHa > 0 && arrHa != null ? pontoEquilibrioKgha(precoKg, custoTotalHa) : null;

  function salvar() {
    updateMapaProdutividade(mapa.id, {
      cultura, epoca, unidade,
      dataReferencia: dataRef,
      dataPlantio: dataPlantio || undefined,
      // Zeros NÃO são gravados: custoHa 0 anunciaria um ponto de equilíbrio de
      // 0 kg/ha, e preço 0 diria que a colheita não vale nada — as duas coisas
      // falsas. Sem os dois preenchidos, a economia simplesmente não existe.
      economia: precoVenda > 0 && custoHa > 0
        ? {
            precoVenda, precoUnidade: precoUni, custoHa,
            arrendamentoScAlq: arrScAlq > 0 ? arrScAlq : undefined,
            alqueireHa: arrScAlq > 0 ? alqHa : undefined,
            atualizadoEm: new Date().toISOString(),
          }
        : undefined,
    });
    onSalvo();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(2,8,20,0.7)' }} onClick={onFechar}>
      <div className="w-full max-w-sm rounded-lg p-3 space-y-2.5" style={{ background: '#061525', border: '1px solid #1a3a6b' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold" style={{ color: '#93c5fd' }}>Editar mapa de colheita</p>
          <span className="text-[9px]" style={{ color: '#64748b' }}>v{mapa.versao}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Campo label="Cultura">
            <select value={cultura} onChange={e => setCultura(e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>
              {CULTURAS.map(c => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
            </select>
          </Campo>
          <Campo label="Época de cultivo">
            <select value={epoca} onChange={e => setEpoca(e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>
              {EPOCAS.map(e2 => <option key={e2.v} value={e2.v}>{e2.l}</option>)}
            </select>
          </Campo>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Campo label="Data da colheita">
            <input type="date" value={dataRef} onChange={e => setDataRef(e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
          </Campo>
          <Campo label="Unidade">
            <select value={unidade} onChange={e => setUnidade(e.target.value as Unidade)} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>
              {(['kg/ha', 'sc/ha', 't/ha'] as Unidade[]).map(uu => <option key={uu} value={uu}>{uu}</option>)}
            </select>
          </Campo>
        </div>

        <Campo label="Data do plantio (opcional)">
          <input type="date" value={dataPlantio} onChange={e => setDataPlantio(e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
        </Campo>
        <p className="text-[9px]" style={{ color: '#64748b' }}>
          Sem data de plantio, o relatório simplesmente não fala de plantio nem de ciclo. O destino é buscá-la na plataforma de dados fitotécnicos.
        </p>

        <div className="pt-1" style={{ borderTop: '1px solid #1a3a6b' }}>
          <p className="text-[10px] font-semibold mb-1" style={{ color: '#93c5fd' }}>Economia (opcional)</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Campo label="Preço de venda (R$)">
                <input value={precoTxt} onChange={e => setPrecoTxt(e.target.value)} inputMode="decimal" placeholder="ex.: 130,00"
                  className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
              </Campo>
            </div>
            <Campo label="por">
              <select value={precoUni} onChange={e => setPrecoUni(e.target.value as 'sc' | 't')}
                className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>
                <option value="sc">saca</option>
                <option value="t">tonelada</option>
              </select>
            </Campo>
          </div>
          <Campo label="Custo de produção por hectare (R$/ha)">
            <input value={custoTxt} onChange={e => setCustoTxt(e.target.value)} inputMode="decimal" placeholder="ex.: 5.400,00"
              className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
          </Campo>
          <div className="grid grid-cols-2 gap-2">
            <Campo label="Arrendamento (sacas/alqueire)">
              <input value={arrTxt} onChange={e => setArrTxt(e.target.value)} inputMode="decimal" placeholder="ex.: 40"
                className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
            </Campo>
            <Campo label="Alqueire">
              <select value={alqHa} onChange={e => setAlqHa(Number(e.target.value))}
                className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>
                {ALQUEIRES.map(a => <option key={a.id} value={a.ha}>{a.nome} — {a.ha} ha</option>)}
              </select>
            </Campo>
          </div>
          {arrHa != null && (
            <p className="text-[9px]" style={{ color: '#86efac' }}>
              Arrendamento: R$ {fmtMoeda(arrHa)}/ha · custo total R$ {fmtMoeda(custoTotalHa)}/ha
              {equilibrioArr != null && ` · equilíbrio com arrendamento ${fmt(equilibrioArr, 0)} kg/ha`}
            </p>
          )}
          <p className="text-[9px] mt-1" style={{ color: equilibrio != null ? '#86efac' : '#64748b' }}>
            {equilibrio != null
              ? `Ponto de equilíbrio: ${fmt(equilibrio, 0)} kg/ha (${fmt(emUnidade(equilibrio, mapa.unidade), mapa.unidade === 'kg/ha' ? 0 : 1)} ${mapa.unidade})`
              : 'Informe preço e custo para habilitar o mapa de rentabilidade no relatório.'}
          </p>
        </div>

        <div className="text-[9px] space-y-0.5">
          <p style={{ color: per ? '#86efac' : '#fbbf24' }}>
            {per ? `Arquivado em Ano ${per.ano} · ${rotuloEpoca(per.epoca)}` : 'Data da colheita inválida'}
          </p>
          {ciclo != null && (
            <p style={{ color: cicloInvalido ? '#f87171' : '#94a3b8' }}>
              {cicloInvalido ? 'A colheita não pode ser anterior ao plantio.' : `Ciclo: ${ciclo} dias`}
            </p>
          )}
          <p style={{ color: '#64748b' }}>
            Trocar a cultura troca a legenda — o mapa e o relatório mudam de cores. Limpeza, pixel e média real não se editam aqui: exigem reprocessar.
          </p>
        </div>

        <div className="flex gap-2 pt-0.5">
          <button onClick={onFechar} className="flex-1 py-1.5 rounded text-[11px] font-bold" style={{ background: '#1a3a6b', color: '#93c5fd' }}>Cancelar</button>
          <button onClick={salvar} disabled={!per || cicloInvalido}
            className="flex-1 py-1.5 rounded text-[11px] font-bold text-white disabled:opacity-40"
            style={{ background: 'var(--invicta-blue-mid)' }}>Salvar</button>
        </div>
      </div>
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
// Faixas por quantil: cor CHAPADA + intervalo REAL de corte + área. A barra de
// gradiente não serve aqui — ela mostra os limites FIXOS da legenda, e o que
// interessa nesta escala são os cortes calculados a partir deste mapa.
function FaixasQuantil({ q, unidade }: { q: ClassificacaoQuantis; unidade: Unidade }) {
  const d = unidade === 'kg/ha' ? 0 : unidade === 'sc/ha' ? 1 : 2;
  const val = (v: number) => fmt(emUnidade(v, unidade), d);
  const n = q.faixas.length;
  return (
    <div className="space-y-0.5">
      {q.faixas.map((f, i) => (
        <div key={f.ordem} className="flex items-center gap-1.5 text-[9px]" style={{ color: '#cbd5e1' }}>
          <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ background: f.cor }} />
          <span className="flex-1 tabular-nums">
            {i === 0 ? `≤ ${val(f.max)}` : i === n - 1 ? `≥ ${val(f.min)}` : `${val(f.min)} – ${val(f.max)}`}
          </span>
          <span style={{ color: '#94a3b8' }}>{fmtHa(f.areaHa)} ha</span>
          <span className="w-9 text-right" style={{ color: '#64748b' }}>{fmt(f.pctArea, 1)}%</span>
        </div>
      ))}
      {q.colapsadas > 0 && (
        <p className="text-[8px] pt-0.5" style={{ color: '#fbbf24' }}>
          {q.colapsadas} faixa{q.colapsadas > 1 ? 's' : ''} unida{q.colapsadas > 1 ? 's' : ''}: há valores repetidos neste mapa.
        </p>
      )}
    </div>
  );
}

// Cobertura em números + veredito. O tom segue nivelCobertura(): abaixo de 85%
// o mapa não descreve o talhão, ele descreve a parte que a máquina percorreu.
// Uma seção opcional do relatório. Quando não dá para ligar, o checkbox DIZ
// por quê — desabilitar sem explicar é o que faz o usuário achar que quebrou.
function SecaoOpcional({ marcado, onMudar, rotulo, disponivel, motivo, detalhe }: {
  marcado: boolean; onMudar: (v: boolean) => void; rotulo: string;
  disponivel: boolean; motivo: string; detalhe?: string;
}) {
  return (
    <label className="flex items-start gap-1.5 text-[10px]" style={{ color: disponivel ? '#cbd5e1' : '#475569' }}>
      <input type="checkbox" checked={marcado && disponivel} disabled={!disponivel}
        onChange={e => onMudar(e.target.checked)} className="mt-0.5" />
      <span className="flex-1">
        {rotulo}
        <span className="block text-[9px]" style={{ color: disponivel ? '#64748b' : '#fbbf24' }}>
          {disponivel ? (detalhe ?? '') : motivo}
        </span>
      </span>
    </label>
  );
}

function CoberturaResumo({ cob, nPontos, recortado }: { cob: Cobertura; nPontos?: number; recortado?: boolean }) {
  const nivel = nivelCobertura(cob.pctCobertura);
  const cor = nivel === 'ok' ? '#86efac' : nivel === 'atencao' ? '#fbbf24' : '#f87171';
  const dens = nPontos && cob.areaHa > 0 ? nPontos / cob.areaHa : null;
  return (
    <div className="space-y-1 text-[9px]" style={{ color: '#94a3b8' }}>
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-bold" style={{ color: cor }}>{fmt(cob.pctCobertura, 1)}%</span>
        <span>do talhão com dado de colheita</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        <span>sem dado: <strong style={{ color: cob.areaSemDadoHa > 0 ? '#fbbf24' : '#94a3b8' }}>{fmtHa(cob.areaSemDadoHa)} ha</strong></span>
        {cob.maiorVazioHa > 0 && <span>maior vazio: {fmtHa(cob.maiorVazioHa)} ha</span>}
        {dens != null && <span>densidade: {fmt(dens, 0)} pts/ha</span>}
        <span>pixel {fmt(cob.pixelM, 0)} m</span>
      </div>
      {nivel !== 'ok' && (
        <p style={{ color: cor }}>
          {nivel === 'ruim'
            ? 'Cobertura baixa — o mapa descreve a parte colhida, não o talhão.'
            : 'Há falhas de cobertura relevantes; confira antes de usar para recomendação.'}
          {recortado === true && ' A área sem dado foi recortada do mapa e das contas.'}
          {recortado === false && ' A área sem dado está sendo EXTRAPOLADA pelo IDW.'}
        </p>
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
