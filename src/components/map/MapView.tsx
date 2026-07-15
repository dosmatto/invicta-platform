'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { useApp } from '@/context/AppContext';
import { TALHAO_KML_URLS } from '@/constants/mocks';
import { parseKML } from '@/lib/geo';
import { ESCRITORIO_INVICTA } from '@/lib/seed';
import { getTalhoesCentroides } from '@/lib/store';
import { mapaCoresMunicipio } from '@/lib/coresMunicipio';
import { lerCache, municipioReal, geocodarFaltantes, corrigirCadastroMunicipios, faltamGeocodar } from '@/lib/geocodeMunicipio';

// Visão geral do Início: estado padrão = Paraná (Tocantins junto deixa tudo
// minúsculo). 'todos' mostra o país inteiro.
type OverviewEstado = 'PR' | 'todos';
const ehPR = (uf: string) => uf === 'PR' || uf.startsWith('PARAN');

// ── Estilo único com OSM + Satélite — toggle de visibilidade, sem setStyle() ──
const COMBINED_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap',
    },
    esri_sat: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© Esri',
    },
    esri_labels: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
    },
  },
  layers: [
    { id: 'layer-osm', type: 'raster', source: 'osm' },
    { id: 'layer-sat', type: 'raster', source: 'esri_sat', layout: { visibility: 'none' } },
    { id: 'layer-sat-labels', type: 'raster', source: 'esri_labels', layout: { visibility: 'none' } },
  ],
};

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };


export function MapView({ mostrarVisaoGeral = false }: { mostrarVisaoGeral?: boolean } = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef      = useRef<maplibregl.Map | null>(null);
  const readyRef    = useRef(false); // true depois de 'load'
  const [mapReady, setMapReady] = useState(false);

  // mostrarVisaoGeral: só o mapa do painel/Início liga os centroides+legenda por
  // município. Nas páginas de talhão/coleta/campo (que têm o próprio MapView com
  // activePanel='dashboard' por padrão) fica desligado — senão a visão geral
  // vazava por cima do talhão aberto.
  const { mapMode, setMapMode, nav, setNav, activePanel, setActivePanel,
          uploadedGeo, setUploadedGeo,
          uploadedBbox, setUploadedBbox,
          pontosSimulados, talhoesFazenda, zonasManejo, zonasFundo, zonasOpacidade,
          fertilidadeOverlay, fertilidadeLabels,
          edicaoAtiva, edicaoModo, setPontoEvent, setZonaEvent } = useApp();

  const [kmlLoading, setKmlLoading] = useState(false);

  // Visão geral (Início): pontos-centroide dos talhões coloridos por município.
  const emVisaoGeral = mostrarVisaoGeral && activePanel === 'dashboard';
  const [ovEstado, setOvEstado] = useState<OverviewEstado>('PR');
  const [ovLegenda, setOvLegenda] = useState<{ municipio: string; cor: string; n: number }[]>([]);
  const [ovTotais, setOvTotais] = useState<{ pr: number; outros: number }>({ pr: 0, outros: 0 });
  const [geoTick, setGeoTick] = useState(0); // incrementa conforme o geocoding resolve pontos
  const [geoProg, setGeoProg] = useState<{ feitos: number; total: number } | null>(null);
  const geoRodouRef = useRef(false); // geocoding roda uma vez por sessão de visão geral
  const ovFitRef = useRef<string>(''); // último recorte enquadrado (evita refit por tick)
  const PENDENTE = '⏳ classificando…';

  // refs para os handlers de edição acessarem valores atuais sem re-registrar
  const pontosRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const edicaoModoRef = useRef(edicaoModo);
  const zonasSigRef = useRef<string>(''); // assinatura do conjunto de zonas (refit só quando muda)
  useEffect(() => { pontosRef.current = pontosSimulados; }, [pontosSimulados]);
  useEffect(() => { edicaoModoRef.current = edicaoModo; }, [edicaoModo]);

  // ── 1. Inicializa o mapa UMA VEZ ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: COMBINED_STYLE,
      center: ESCRITORIO_INVICTA.center,
      zoom: ESCRITORIO_INVICTA.zoom,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left');

    map.on('load', () => {
      // Talhões da fazenda — fonte persistente (clicáveis). Dados via setData.
      map.addSource('talhoes',    { type: 'geojson', data: EMPTY_FC });
      map.addLayer({ id: 'talhao-fill',            type: 'fill',   source: 'talhoes', paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.35 } });
      map.addLayer({ id: 'talhao-outline',         type: 'line',   source: 'talhoes', paint: { 'line-color': '#d97706', 'line-width': 2 } });
      map.addLayer({ id: 'talhao-label',           type: 'symbol', source: 'talhoes',
        layout: { 'text-field': ['get','nome'], 'text-size': 12, 'text-font': ['Open Sans Regular'] },
        paint:  { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1.5 } });

      // Zonas de manejo — fonte persistente, cor por classe (property 'cor')
      map.addSource('zonas', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({ id: 'zona-fill', type: 'fill', source: 'zonas',
        paint: { 'fill-color': ['get', 'cor'], 'fill-opacity': 0.5 } });
      map.addLayer({ id: 'zona-outline', type: 'line', source: 'zonas',
        paint: {
          'line-color': ['case', ['==', ['get', 'selecionada'], true], '#22d3ee', '#ffffff'],
          'line-width': ['case', ['==', ['get', 'selecionada'], true], 4, 1.5],
        } });
      map.addLayer({ id: 'zona-label', type: 'symbol', source: 'zonas',
        layout: { 'text-field': ['get', 'rotulo'], 'text-size': 11, 'text-font': ['Open Sans Regular'] },
        paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1.4 } });

      // Geometria carregada (KML/upload) — fonte persistente, dados atualizados via setData
      map.addSource('upload-geo', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({ id: 'upload-fill',   type: 'fill',   source: 'upload-geo',
        filter: ['in',['geometry-type'],['literal',['Polygon','MultiPolygon']]],
        paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.35 } });
      map.addLayer({ id: 'upload-line',   type: 'line',   source: 'upload-geo',
        paint: { 'line-color': '#fde68a', 'line-width': 2.5 } });
      map.addLayer({ id: 'upload-points', type: 'circle', source: 'upload-geo',
        filter: ['in',['geometry-type'],['literal',['Point','MultiPoint']]],
        paint: { 'circle-radius': 5, 'circle-color': '#f59e0b', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } });

      // Pontos de amostragem — fonte persistente. Cor por nº de profundidades.
      map.addSource('pontos-amos', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({ id: 'pontos-circle', type: 'circle', source: 'pontos-amos',
        paint: {
          // Nuvens densas (EC/colheita) marcam a feature com 'r' → raio que cresce
          // com o zoom (visível em qualquer escala); senão o raio fixo da amostragem.
          // NOTA MapLibre: `zoom` só vale no TOPO da expressão — por isso o
          // interpolate fica fora e o `case` dentro de cada parada (invertido).
          'circle-radius': ['interpolate', ['linear'], ['zoom'],
            10, ['case', ['has', 'r'], 3, 6],
            13, ['case', ['has', 'r'], 5, 6],
            17, ['case', ['has', 'r'], 9, 6]],
          'circle-color': ['case',
            ['has', 'cor'], ['get', 'cor'],   // cor explícita (ex: pontos de zona / EC)
            ['match', ['get', 'profs'],
              1, '#f59e0b',   // 1 profundidade — laranja
              2, '#3b82f6',   // 2 profundidades — azul
              '#a855f7',      // 3+ profundidades — roxo
            ],
          ],
          // halo BRANCO nos pontos densos (EC/colheita) p/ destacar sobre o satélite
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': ['case', ['has', 'r'], 1, 1.5],
          'circle-stroke-opacity': 0.9,
        } });
      map.addLayer({ id: 'pontos-label',  type: 'symbol', source: 'pontos-amos',
        layout: { 'text-field': ['get','label'], 'text-size': 9, 'text-offset': [0,1.3], 'text-font': ['Open Sans Regular'] },
        paint:  { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1.2 } });

      // Visão geral do Início — 1 ponto por talhão, cor por município (property 'cor')
      map.addSource('overview-pts', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({ id: 'overview-circle', type: 'circle', source: 'overview-pts',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 4, 8, 6, 12, 8],
          'circle-color': ['get', 'cor'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
          'circle-stroke-opacity': 0.9,
        } });

      // Rótulos de valor da fertilidade (valor da variável em cada ponto de amostragem)
      map.addSource('fert-labels', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({ id: 'fert-labels-text', type: 'symbol', source: 'fert-labels',
        layout: { 'text-field': ['get','txt'], 'text-size': 11, 'text-font': ['Open Sans Regular'], 'text-allow-overlap': true },
        paint:  { 'text-color': '#fff', 'text-halo-color': '#1e293b', 'text-halo-width': 2 } });

      map.resize(); // garante dimensões corretas após hidratação
      // Centro inicial = escritório (definido no construtor). Sem fitBounds aqui
      // para não pular para a região dos talhões mock.
      readyRef.current = true;
      setMapReady(true);
    });

    return () => { map.remove(); mapRef.current = null; readyRef.current = false; setMapReady(false); };
  }, []);

  // ── 2. Toggle satélite / rua — SEM setStyle, só visibilidade ─────────────
  // Depende de mapReady para aplicar o modo inicial (satélite) após o load.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const isSat = mapMode === 'satellite';
    try {
      map.setLayoutProperty('layer-osm',       'visibility', isSat ? 'none'    : 'visible');
      map.setLayoutProperty('layer-sat',       'visibility', isSat ? 'visible' : 'none');
      map.setLayoutProperty('layer-sat-labels','visibility', isSat ? 'visible' : 'none');
    } catch {}
  }, [mapMode, mapReady]);

  // ── 3. Talhões da fazenda (setData) + fitBounds + clique p/ abrir talhão ───
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource('talhoes') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(talhoesFazenda ?? EMPTY_FC);

    if (talhoesFazenda && talhoesFazenda.features.length) {
      let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
      const walk = (g: GeoJSON.Geometry) => {
        if (g.type === 'Polygon') g.coordinates.forEach(r => r.forEach(([a, b]) => { if (a < minLng) minLng = a; if (b < minLat) minLat = b; if (a > maxLng) maxLng = a; if (b > maxLat) maxLat = b; }));
        else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => p.forEach(r => r.forEach(([a, b]) => { if (a < minLng) minLng = a; if (b < minLat) minLat = b; if (a > maxLng) maxLng = a; if (b > maxLat) maxLat = b; })));
      };
      talhoesFazenda.features.forEach(f => f.geometry && walk(f.geometry));
      // resize garante dimensões corretas do container; jump (duration 0) evita
      // que o voo animado de longe seja interrompido e pare num zoom afastado.
      if (isFinite(minLng)) {
        map.resize();
        map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 60, duration: 0, maxZoom: 15 });
      }
    }
  }, [talhoesFazenda, mapReady]);

  // ── 3b. Visão geral do Início: centroides por município + fit + legenda ────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource('overview-pts') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    if (!emVisaoGeral) { src.setData(EMPTY_FC); setOvLegenda([]); ovFitRef.current = ''; return; }

    const todos = getTalhoesCentroides();
    // Município pela POSIÇÃO REAL (geocoding); cai em "classificando…" enquanto
    // o ponto ainda não foi resolvido. NUNCA usa o campo do cadastro para colorir.
    const cache = lerCache();
    const munDe = (t: (typeof todos)[number]) => municipioReal(t.lng, t.lat, cache) ?? PENDENTE;
    const cores = mapaCoresMunicipio(todos.map(munDe).filter(m => m !== PENDENTE));
    cores[PENDENTE] = '#94a3b8'; // cinza neutro p/ pendentes
    const prCount = todos.filter(t => ehPR(t.estado)).length;
    setOvTotais({ pr: prCount, outros: todos.length - prCount });

    const lista = ovEstado === 'PR' ? todos.filter(t => ehPR(t.estado)) : todos;
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: lista.map(t => {
        const m = munDe(t);
        return {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [t.lng, t.lat] },
          properties: { talhaoId: t.id, nome: t.nome, fazenda: t.fazenda,
            municipio: m, cor: cores[m] ?? '#64748b' },
        };
      }),
    };
    src.setData(fc);

    // legenda: municípios reais presentes na seleção, ordenados por contagem desc
    const cont = new Map<string, number>();
    lista.forEach(t => { const m = munDe(t); cont.set(m, (cont.get(m) ?? 0) + 1); });
    setOvLegenda(Array.from(cont.entries())
      .map(([municipio, n]) => ({ municipio, cor: cores[municipio] ?? '#64748b', n }))
      .sort((a, b) => b.n - a.n || a.municipio.localeCompare(b.municipio, 'pt-BR')));

    // Enquadra só quando o RECORTE muda (entrar na visão / trocar PR⇄Todos) —
    // não a cada tick de geocoding, senão o mapa "pularia" durante a classificação.
    const fitSig = `${emVisaoGeral}|${ovEstado}`;
    if (lista.length && ovFitRef.current !== fitSig) {
      ovFitRef.current = fitSig;
      let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
      lista.forEach(t => { if (t.lng < minLng) minLng = t.lng; if (t.lat < minLat) minLat = t.lat; if (t.lng > maxLng) maxLng = t.lng; if (t.lat > maxLat) maxLat = t.lat; });
      map.resize();
      if (minLng === maxLng && minLat === maxLat) map.jumpTo({ center: [minLng, minLat], zoom: 12 });
      else map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 70, duration: 0, maxZoom: 12 });
    }
  }, [emVisaoGeral, ovEstado, mapReady, geoTick]);

  // Geocodifica em 2º plano os talhões ainda sem município real (1x por sessão),
  // recolorindo conforme resolve; ao terminar, corrige o cadastro pela posição.
  useEffect(() => {
    if (!emVisaoGeral || !mapReady || geoRodouRef.current) return;
    const centroides = getTalhoesCentroides();
    if (faltamGeocodar(centroides) === 0) {
      // já tudo em cache — só garante o cadastro corrigido uma vez
      geoRodouRef.current = true;
      corrigirCadastroMunicipios(centroides);
      return;
    }
    geoRodouRef.current = true;
    let vivo = true;
    (async () => {
      await geocodarFaltantes(centroides, (feitos, total) => {
        if (!vivo) return;
        setGeoProg({ feitos, total });
        setGeoTick(v => v + 1); // recolore o mapa incrementalmente
      });
      if (!vivo) return;
      corrigirCadastroMunicipios(centroides); // grava município real no cadastro
      setGeoProg(null);
      setGeoTick(v => v + 1);
    })();
    return () => { vivo = false; };
  }, [emVisaoGeral, mapReady]);

  // Ao ENTRAR na visão geral, mapa de ruas por padrão (visualiza melhor as
  // divisas municipais). Não força depois — o usuário pode alternar para satélite.
  useEffect(() => {
    if (emVisaoGeral && mapReady) setMapMode('street');
  }, [emVisaoGeral, mapReady, setMapMode]);

  // Clique num centroide da visão geral → abre o talhão
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const abrir = (e: maplibregl.MapLayerMouseEvent) => {
      const p = e.features?.[0]?.properties;
      if (!p?.talhaoId) return;
      setNav({ talhaoId: String(p.talhaoId), talhao: String(p.nome ?? '') });
      setActivePanel(`talhao-${p.talhaoId}`);
    };
    const enter = () => { map.getCanvas().style.cursor = 'pointer'; };
    const leave = () => { map.getCanvas().style.cursor = ''; };
    map.on('click', 'overview-circle', abrir);
    map.on('mouseenter', 'overview-circle', enter);
    map.on('mouseleave', 'overview-circle', leave);
    return () => {
      map.off('click', 'overview-circle', abrir);
      map.off('mouseenter', 'overview-circle', enter);
      map.off('mouseleave', 'overview-circle', leave);
    };
  }, [mapReady, setNav, setActivePanel]);

  // Clique num talhão da fazenda → abre o talhão (como link)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const abrir = (e: maplibregl.MapLayerMouseEvent) => {
      const p = e.features?.[0]?.properties;
      if (!p?.talhaoId) return;
      setNav({ talhaoId: String(p.talhaoId), talhao: String(p.nome ?? ''), area: Number(p.area ?? 0) });
      setMapMode('satellite');
      setActivePanel(`talhao-${p.talhaoId}`);
    };
    const enter = () => { map.getCanvas().style.cursor = 'pointer'; };
    const leave = () => { map.getCanvas().style.cursor = ''; };
    map.on('click', 'talhao-fill', abrir);
    map.on('mouseenter', 'talhao-fill', enter);
    map.on('mouseleave', 'talhao-fill', leave);
    return () => {
      map.off('click', 'talhao-fill', abrir);
      map.off('mouseenter', 'talhao-fill', enter);
      map.off('mouseleave', 'talhao-fill', leave);
    };
  }, [mapReady, setNav, setActivePanel, setMapMode]);

  // Clique numa zona de manejo → notifica o painel (ajuste de densidade por zona)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const onZona = (e: maplibregl.MapLayerMouseEvent) => {
      const r = e.features?.[0]?.properties?.rotulo;
      if (r != null) setZonaEvent({ rotulo: String(r) });
    };
    const enter = () => { map.getCanvas().style.cursor = 'pointer'; };
    const leave = () => { map.getCanvas().style.cursor = ''; };
    map.on('click', 'zona-fill', onZona);
    map.on('mouseenter', 'zona-fill', enter);
    map.on('mouseleave', 'zona-fill', leave);
    return () => {
      map.off('click', 'zona-fill', onZona);
      map.off('mouseenter', 'zona-fill', enter);
      map.off('mouseleave', 'zona-fill', leave);
    };
  }, [mapReady, setZonaEvent]);

  // ── 4. Auto-carrega KML de talhões com URL pré-definida ───────────────────
  useEffect(() => {
    if (!nav.talhaoId) return;
    const kmlUrl = TALHAO_KML_URLS[nav.talhaoId];
    if (!kmlUrl) return;

    setKmlLoading(true);
    setUploadedGeo(null);
    setUploadedBbox(null);

    fetch(kmlUrl)
      .then(r => r.blob())
      .then(blob => parseKML(new File([blob], 'talhao.kml')))
      .then(result => {
        setMapMode('satellite');
        setUploadedGeo(result.geojson);
        setUploadedBbox(result.bbox);
        setKmlLoading(false);
      })
      .catch(e => { console.error('KML:', e); setKmlLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.talhaoId]);

  // ── 5. Atualiza geometria carregada (setData — sem remover camadas) ────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const src = map.getSource('upload-geo') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    src.setData(uploadedGeo ?? EMPTY_FC);

    if (uploadedGeo && uploadedBbox) {
      // duration 0 = vai direto pro talhão (sem animar saindo do escritório),
      // mais rápido ao abrir a página completa do talhão.
      map.fitBounds(
        [[uploadedBbox[0], uploadedBbox[1]], [uploadedBbox[2], uploadedBbox[3]]],
        { padding: 60, duration: 0, maxZoom: 16 }
      );
    }
  }, [uploadedGeo, uploadedBbox, mapReady]);

  // ── 6. Pontos do simulador de amostragem (setData) ───────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const src = map.getSource('pontos-amos') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    src.setData(pontosSimulados ?? EMPTY_FC);
  }, [pontosSimulados, mapReady]);

  // ── 6b. Zonas de manejo (setData) + fitBounds ────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource('zonas') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(zonasManejo ?? EMPTY_FC);

    // Oculta o limite (upload-geo) enquanto as zonas coloridas estão visíveis
    const temZonas = !!(zonasManejo && zonasManejo.features.length);
    ['upload-fill', 'upload-line'].forEach(id => { try { map.setLayoutProperty(id, 'visibility', temZonas ? 'none' : 'visible'); } catch {} });

    // Refit só quando o conjunto de zonas muda (selecionar/realçar uma zona
    // re-publica os dados, mas não deve re-enquadrar o mapa).
    const sig = (zonasManejo?.features ?? []).map(f => String(f.properties?.rotulo ?? '')).join('|');
    const mudouConjunto = sig !== zonasSigRef.current;
    zonasSigRef.current = sig;

    if (mudouConjunto && zonasManejo && zonasManejo.features.length) {
      let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
      const walk = (g: GeoJSON.Geometry) => {
        if (g.type === 'Polygon') g.coordinates.forEach(r => r.forEach(([a, b]) => { if (a < minLng) minLng = a; if (b < minLat) minLat = b; if (a > maxLng) maxLng = a; if (b > maxLat) maxLat = b; }));
        else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => p.forEach(r => r.forEach(([a, b]) => { if (a < minLng) minLng = a; if (b < minLat) minLat = b; if (a > maxLng) maxLng = a; if (b > maxLat) maxLat = b; })));
      };
      zonasManejo.features.forEach(f => f.geometry && walk(f.geometry));
      if (isFinite(minLng)) { map.resize(); map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 50, duration: 0, maxZoom: 16 }); }
    }
  }, [zonasManejo, mapReady]);

  // ── 6c. Overlay raster de fertilidade (image source dinâmico) ─────────────
  // Recria a fonte+camada do zero a cada mudança do overlay. O `updateImage` do
  // MapLibre às vezes MANTÉM a imagem anterior ao trocar só o url (mesmos
  // coordinates), o que fazia o raster ficar "preso" no nutriente anterior
  // enquanto os números (rótulos) trocavam — daí "os números não batem com o raster".
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const SRC = 'fert-raster', LYR = 'fert-raster-layer';
    if (map.getLayer(LYR)) { try { map.removeLayer(LYR); } catch {} }
    if (map.getSource(SRC)) { try { map.removeSource(SRC); } catch {} }
    if (!fertilidadeOverlay) return;
    const { url, coordinates, opacity } = fertilidadeOverlay;
    // Borda do talhão fica por cima (cobre o serrilhado do recorte); pontos/rótulos acima.
    const beforeId = map.getLayer('upload-line') ? 'upload-line'
      : map.getLayer('pontos-circle') ? 'pontos-circle' : undefined;
    try {
      map.addSource(SRC, { type: 'image', url, coordinates });
      map.addLayer({ id: LYR, type: 'raster', source: SRC,
        paint: { 'raster-opacity': opacity, 'raster-fade-duration': 0 } }, beforeId);
    } catch (e) { console.warn('[mapa-fert] falha ao desenhar raster:', e); }
  }, [fertilidadeOverlay, mapReady]);

  // ── 6c.2. MEAP: camada de FUNDO (raster) SOB as zonas + opacidade das zonas ──
  // Permite comparar a zona com uma camada (NDVI, fertilidade, EC…) por baixo,
  // com as zonas semitransparentes por cima.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const SRC = 'meap-fundo', LYR = 'meap-fundo-layer';
    if (map.getLayer(LYR)) { try { map.removeLayer(LYR); } catch {} }
    if (map.getSource(SRC)) { try { map.removeSource(SRC); } catch {} }
    if (!zonasFundo) return;
    const { url, coordinates, opacity } = zonasFundo;
    const beforeId = map.getLayer('zona-fill') ? 'zona-fill' : undefined; // SOB as zonas
    try {
      map.addSource(SRC, { type: 'image', url, coordinates });
      map.addLayer({ id: LYR, type: 'raster', source: SRC, paint: { 'raster-opacity': opacity, 'raster-fade-duration': 0 } }, beforeId);
    } catch (e) { console.warn('[meap-fundo] falha ao desenhar raster:', e); }
  }, [zonasFundo, mapReady]);

  // Opacidade do preenchimento das zonas (slider de transparência do MEAP).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    try { if (map.getLayer('zona-fill')) map.setPaintProperty('zona-fill', 'fill-opacity', zonasOpacidade); } catch {}
  }, [zonasOpacidade, zonasManejo, mapReady]);

  // ── 6d. Rótulos de valor da fertilidade (setData) ─────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource('fert-labels') as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(fertilidadeLabels ?? EMPTY_FC);
  }, [fertilidadeLabels, mapReady]);

  // ── 7. Edição manual de pontos (arrastar / adicionar / remover) ───────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !edicaoAtiva) return;

    const canvas = map.getCanvas();
    let dragOrdem: number | null = null;

    const setHoverCursor = () => { if (!dragOrdem) canvas.style.cursor = edicaoModoRef.current === 'adicionar' ? 'crosshair' : 'pointer'; };
    const clearCursor = () => { if (!dragOrdem) canvas.style.cursor = edicaoModoRef.current === 'adicionar' ? 'crosshair' : ''; };

    const onMove = (e: maplibregl.MapMouseEvent) => {
      if (dragOrdem == null || !pontosRef.current) return;
      const fc: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: pontosRef.current.features.map(f =>
          f.properties?.ordem === dragOrdem
            ? { ...f, geometry: { type: 'Point', coordinates: [e.lngLat.lng, e.lngLat.lat] } as GeoJSON.Point }
            : f),
      };
      (map.getSource('pontos-amos') as maplibregl.GeoJSONSource).setData(fc);
    };
    const onUp = (e: maplibregl.MapMouseEvent) => {
      if (dragOrdem == null) return;
      const ordem = dragOrdem;
      dragOrdem = null;
      canvas.style.cursor = '';
      map.dragPan.enable();
      map.off('mousemove', onMove);
      setPontoEvent({ tipo: 'mover', ordem, lng: e.lngLat.lng, lat: e.lngLat.lat });
    };
    const onDownPonto = (e: maplibregl.MapLayerMouseEvent) => {
      const modo = edicaoModoRef.current;
      const ordem = e.features?.[0]?.properties?.ordem;
      if (ordem == null) return;
      if (modo === 'mover') {
        e.preventDefault();
        dragOrdem = ordem;
        canvas.style.cursor = 'grabbing';
        map.dragPan.disable();
        map.on('mousemove', onMove);
        map.once('mouseup', onUp);
      }
    };
    const onClickPonto = (e: maplibregl.MapLayerMouseEvent) => {
      if (edicaoModoRef.current !== 'remover') return;
      const ordem = e.features?.[0]?.properties?.ordem;
      if (ordem != null) { e.preventDefault(); setPontoEvent({ tipo: 'remover', ordem }); }
    };
    const onClickMapa = (e: maplibregl.MapMouseEvent) => {
      if (edicaoModoRef.current !== 'adicionar') return;
      // ignora se clicou sobre um ponto existente
      const hits = map.queryRenderedFeatures(e.point, { layers: ['pontos-circle'] });
      if (hits.length === 0) setPontoEvent({ tipo: 'add', lng: e.lngLat.lng, lat: e.lngLat.lat });
    };

    canvas.style.cursor = edicaoModo === 'adicionar' ? 'crosshair' : '';
    map.on('mouseenter', 'pontos-circle', setHoverCursor);
    map.on('mouseleave', 'pontos-circle', clearCursor);
    map.on('mousedown', 'pontos-circle', onDownPonto);
    map.on('click', 'pontos-circle', onClickPonto);
    map.on('click', onClickMapa);

    return () => {
      canvas.style.cursor = '';
      map.dragPan.enable();
      map.off('mouseenter', 'pontos-circle', setHoverCursor);
      map.off('mouseleave', 'pontos-circle', clearCursor);
      map.off('mousedown', 'pontos-circle', onDownPonto);
      map.off('click', 'pontos-circle', onClickPonto);
      map.off('click', onClickMapa);
      map.off('mousemove', onMove);
    };
  }, [edicaoAtiva, edicaoModo, mapReady, setPontoEvent]);

  return (
    <div className="absolute inset-0">
      {/* width/height explícitos: o CSS do MapLibre força position:relative no
          container, o que anula `inset-0` e colapsa a altura para 0. style inline
          vence por especificidade e garante que o canvas preencha o wrapper. */}
      <div ref={containerRef} className="absolute inset-0" style={{ width: '100%', height: '100%' }} />

      {/* Loading indicator KML */}
      {kmlLoading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold text-white shadow-lg"
          style={{ background: 'rgba(26,58,107,0.95)' }}>
          <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" strokeDasharray="40 20" />
          </svg>
          Carregando geometria...
        </div>
      )}

      {/* Visão geral: seletor de estado + legenda por município */}
      {emVisaoGeral && (
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 items-end">
          <div className="flex rounded-lg overflow-hidden shadow-lg" style={{ border: '2px solid rgba(255,255,255,0.2)' }}>
            {([['PR', `Paraná (${ovTotais.pr})`], ['todos', `Todos (${ovTotais.pr + ovTotais.outros})`]] as const).map(([val, rot]) => (
              <button key={val} onClick={() => setOvEstado(val)}
                className="px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{
                  background: ovEstado === val ? 'rgba(26,58,107,0.95)' : 'rgba(15,34,64,0.85)',
                  color: ovEstado === val ? '#fff' : '#94a3b8',
                }}>
                {rot}
              </button>
            ))}
          </div>
          {geoProg && (
            <div className="rounded-lg shadow-lg px-3 py-1.5 flex items-center gap-2 text-xs font-semibold"
              style={{ background: 'rgba(26,58,107,0.95)', color: '#fff' }}>
              <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" strokeDasharray="40 20" />
              </svg>
              Classificando por localização… {geoProg.feitos}/{geoProg.total}
            </div>
          )}
          {ovLegenda.length > 0 && (
            <div className="rounded-lg shadow-lg px-3 py-2 max-h-[60vh] overflow-y-auto"
              style={{ background: 'rgba(15,34,64,0.92)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <div className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#94a3b8' }}>Município</div>
              {ovLegenda.map(l => (
                <div key={l.municipio} className="flex items-center gap-2 py-0.5 text-xs" style={{ color: '#e2e8f0' }}>
                  <span className="inline-block rounded-full flex-shrink-0" style={{ width: 11, height: 11, background: l.cor, border: '1.5px solid #fff' }} />
                  <span className="flex-1 whitespace-nowrap">{l.municipio}</span>
                  <span className="tabular-nums" style={{ color: '#94a3b8' }}>{l.n}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Toggle Satélite / Rua */}
      <div className="absolute bottom-8 right-14 z-10 flex rounded-lg overflow-hidden shadow-lg"
        style={{ border: '2px solid rgba(255,255,255,0.2)' }}>
        {(['street','satellite'] as const).map(mode => (
          <button key={mode} onClick={() => setMapMode(mode)}
            className="px-3 py-1.5 text-xs font-semibold transition-colors"
            style={{
              background: mapMode === mode ? 'rgba(26,58,107,0.95)' : 'rgba(15,34,64,0.85)',
              color: mapMode === mode ? '#fff' : '#94a3b8',
            }}>
            {mode === 'street' ? '🗺 Rua' : '🛰 Satélite'}
          </button>
        ))}
      </div>
    </div>
  );
}
