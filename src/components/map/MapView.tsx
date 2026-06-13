'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { useApp } from '@/context/AppContext';
import { TALHAO_KML_URLS } from '@/constants/mocks';
import { parseKML } from '@/lib/geo';
import { ESCRITORIO_INVICTA } from '@/lib/seed';

// ── Estilo único com OSM + Satélite — toggle de visibilidade, sem setStyle() ──
const COMBINED_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
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


export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef      = useRef<maplibregl.Map | null>(null);
  const readyRef    = useRef(false); // true depois de 'load'
  const [mapReady, setMapReady] = useState(false);

  const { mapMode, setMapMode, nav, setNav, setActivePanel,
          uploadedGeo, setUploadedGeo,
          uploadedBbox, setUploadedBbox,
          pontosSimulados, talhoesFazenda, zonasManejo,
          fertilidadeOverlay, fertilidadeLabels,
          edicaoAtiva, edicaoModo, setPontoEvent, setZonaEvent } = useApp();

  const [kmlLoading, setKmlLoading] = useState(false);

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
        layout: { 'text-field': ['get','nome'], 'text-size': 12, 'text-font': ['Open Sans Bold'] },
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
        layout: { 'text-field': ['get', 'rotulo'], 'text-size': 11, 'text-font': ['Open Sans Bold'] },
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
          'circle-radius': 6,
          'circle-color': ['case',
            ['has', 'cor'], ['get', 'cor'],   // cor explícita (ex: pontos de zona)
            ['match', ['get', 'profs'],
              1, '#f59e0b',   // 1 profundidade — laranja
              2, '#3b82f6',   // 2 profundidades — azul
              '#a855f7',      // 3+ profundidades — roxo
            ],
          ],
          'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5,
        } });
      map.addLayer({ id: 'pontos-label',  type: 'symbol', source: 'pontos-amos',
        layout: { 'text-field': ['get','label'], 'text-size': 9, 'text-offset': [0,1.3], 'text-font': ['Open Sans Bold'] },
        paint:  { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1.2 } });

      // Rótulos de valor da fertilidade (valor da variável em cada ponto de amostragem)
      map.addSource('fert-labels', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({ id: 'fert-labels-text', type: 'symbol', source: 'fert-labels',
        layout: { 'text-field': ['get','txt'], 'text-size': 11, 'text-font': ['Open Sans Bold'], 'text-allow-overlap': true },
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
      map.fitBounds(
        [[uploadedBbox[0], uploadedBbox[1]], [uploadedBbox[2], uploadedBbox[3]]],
        { padding: 60, duration: 900 }
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
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const SRC = 'fert-raster', LYR = 'fert-raster-layer';
    const existing = map.getSource(SRC) as maplibregl.ImageSource | undefined;
    if (fertilidadeOverlay) {
      const { url, coordinates, opacity } = fertilidadeOverlay;
      if (!existing) {
        map.addSource(SRC, { type: 'image', url, coordinates });
        // Insere o raster logo ABAIXO da linha de borda do talhão (entre o
        // preenchimento e o contorno), para que a borda fique por cima e
        // cubra o serrilhado do recorte. Pontos/rótulos continuam acima.
        const beforeId = map.getLayer('upload-line') ? 'upload-line'
          : map.getLayer('pontos-circle') ? 'pontos-circle' : undefined;
        map.addLayer({ id: LYR, type: 'raster', source: SRC,
          paint: { 'raster-opacity': opacity, 'raster-fade-duration': 0 } }, beforeId);
      } else {
        existing.updateImage({ url, coordinates });
        try { map.setPaintProperty(LYR, 'raster-opacity', opacity); } catch {}
      }
    } else if (existing) {
      if (map.getLayer(LYR)) map.removeLayer(LYR);
      map.removeSource(SRC);
    }
  }, [fertilidadeOverlay, mapReady]);

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
