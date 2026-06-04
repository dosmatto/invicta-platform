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

const TALHOES_MOCK: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { id: '1', nome: 'Talhão 01' }, geometry: { type: 'Polygon', coordinates: [[[-54.72,-13.21],[-54.68,-13.21],[-54.68,-13.25],[-54.72,-13.25],[-54.72,-13.21]]] } },
    { type: 'Feature', properties: { id: '2', nome: 'Talhão 02' }, geometry: { type: 'Polygon', coordinates: [[[-54.63,-13.19],[-54.59,-13.19],[-54.59,-13.24],[-54.63,-13.24],[-54.63,-13.19]]] } },
    { type: 'Feature', properties: { id: '3', nome: 'Gleba A'  }, geometry: { type: 'Polygon', coordinates: [[[-54.55,-13.22],[-54.49,-13.22],[-54.49,-13.29],[-54.55,-13.29],[-54.55,-13.22]]] } },
  ],
};

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef      = useRef<maplibregl.Map | null>(null);
  const readyRef    = useRef(false); // true depois de 'load'
  const [mapReady, setMapReady] = useState(false);

  const { mapMode, setMapMode, nav,
          uploadedGeo, setUploadedGeo,
          uploadedBbox, setUploadedBbox,
          pontosSimulados } = useApp();

  const [kmlLoading, setKmlLoading] = useState(false);

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
      // Talhões mock
      map.addSource('talhoes',    { type: 'geojson', data: TALHOES_MOCK });
      map.addLayer({ id: 'talhao-fill',            type: 'fill',   source: 'talhoes', paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.35 } });
      map.addLayer({ id: 'talhao-outline',         type: 'line',   source: 'talhoes', paint: { 'line-color': '#d97706', 'line-width': 2 } });
      map.addLayer({ id: 'talhao-selected',        type: 'fill',   source: 'talhoes', filter: ['==',['get','id'],''], paint: { 'fill-color': '#22c55e', 'fill-opacity': 0.45 } });
      map.addLayer({ id: 'talhao-selected-outline',type: 'line',   source: 'talhoes', filter: ['==',['get','id'],''], paint: { 'line-color': '#16a34a', 'line-width': 3 } });
      map.addLayer({ id: 'talhao-label',           type: 'symbol', source: 'talhoes',
        layout: { 'text-field': ['get','nome'], 'text-size': 12, 'text-font': ['Open Sans Bold'] },
        paint:  { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1.5 } });

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
          'circle-color': ['match', ['get', 'profs'],
            1, '#f59e0b',   // 1 profundidade — laranja
            2, '#3b82f6',   // 2 profundidades — azul
            '#a855f7',      // 3+ profundidades — roxo
          ],
          'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5,
        } });
      map.addLayer({ id: 'pontos-label',  type: 'symbol', source: 'pontos-amos',
        layout: { 'text-field': ['get','label'], 'text-size': 9, 'text-offset': [0,1.3], 'text-font': ['Open Sans Bold'] },
        paint:  { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1.2 } });

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

  // ── 3. Destaca talhão selecionado ─────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const id = nav.talhaoId ?? '';
    try {
      map.setFilter('talhao-selected',        ['==',['get','id'], id]);
      map.setFilter('talhao-selected-outline',['==',['get','id'], id]);
    } catch {}
  }, [nav.talhaoId]);

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
