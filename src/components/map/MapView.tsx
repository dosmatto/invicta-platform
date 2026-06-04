'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useApp } from '@/context/AppContext';
import { TALHAO_KML_URLS } from '@/constants/mocks';
import { parseKML } from '@/lib/geo';

const STREET_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap',
    },
  },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
};

const SATELLITE_STYLE = {
  version: 8 as const,
  sources: {
    esri: {
      type: 'raster' as const,
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: '© Esri — Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP',
      maxzoom: 19,
    },
    esri_labels: {
      type: 'raster' as const,
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
    },
  },
  layers: [
    { id: 'sat', type: 'raster' as const, source: 'esri' },
    { id: 'sat-labels', type: 'raster' as const, source: 'esri_labels', paint: { 'raster-opacity': 0.8 } },
  ],
};

const TALHOES_MOCK = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      properties: { id: '1', nome: 'Talhão 01', area: 48.5 },
      geometry: { type: 'Polygon' as const, coordinates: [[[-54.72, -13.21], [-54.68, -13.21], [-54.68, -13.25], [-54.72, -13.25], [-54.72, -13.21]]] },
    },
    {
      type: 'Feature' as const,
      properties: { id: '2', nome: 'Talhão 02', area: 62.3 },
      geometry: { type: 'Polygon' as const, coordinates: [[[-54.63, -13.19], [-54.59, -13.19], [-54.59, -13.24], [-54.63, -13.24], [-54.63, -13.19]]] },
    },
    {
      type: 'Feature' as const,
      properties: { id: '3', nome: 'Gleba A', area: 120.8 },
      geometry: { type: 'Polygon' as const, coordinates: [[[-54.55, -13.22], [-54.49, -13.22], [-54.49, -13.29], [-54.55, -13.29], [-54.55, -13.22]]] },
    },
  ],
};

// Gera grade de pontos de amostragem mock dentro de um bbox
function gerarPontosMock(lng1: number, lat1: number, lng2: number, lat2: number, step: number) {
  const features: GeoJSON.Feature[] = [];
  let idx = 1;
  for (let lat = lat1; lat > lat2; lat -= step) {
    for (let lng = lng1; lng < lng2; lng += step) {
      features.push({
        type: 'Feature',
        properties: { id: `PT-${String(idx).padStart(2, '0')}`, numero: idx },
        geometry: { type: 'Point', coordinates: [lng + (Math.random() - 0.5) * step * 0.3, lat + (Math.random() - 0.5) * step * 0.3] },
      });
      idx++;
    }
  }
  return { type: 'FeatureCollection' as const, features };
}

const PONTOS_AMOSTRAGEM: Record<string, GeoJSON.FeatureCollection> = {
  '1': gerarPontosMock(-54.72, -13.215, -54.68, -13.245, 0.008),
  '2': gerarPontosMock(-54.63, -13.195, -54.59, -13.235, 0.009),
  '3': gerarPontosMock(-54.55, -13.225, -54.49, -13.285, 0.012),
};

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const { mapMode, setMapMode, nav, activeModule, uploadedGeo, setUploadedGeo, uploadedBbox, setUploadedBbox } = useApp();

  // Inicializa o mapa
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: STREET_STYLE,
      center: [-54.6, -13.24],
      zoom: 11,
    });

    mapRef.current.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    mapRef.current.addControl(new maplibregl.ScaleControl(), 'bottom-left');

    mapRef.current.on('load', () => {
      if (!mapRef.current) return;

      mapRef.current.addSource('talhoes', { type: 'geojson', data: TALHOES_MOCK });

      mapRef.current.addLayer({ id: 'talhao-fill', type: 'fill', source: 'talhoes',
        paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.35 } });

      mapRef.current.addLayer({ id: 'talhao-outline', type: 'line', source: 'talhoes',
        paint: { 'line-color': '#d97706', 'line-width': 2 } });

      mapRef.current.addLayer({ id: 'talhao-selected', type: 'fill', source: 'talhoes',
        filter: ['==', ['get', 'id'], ''],
        paint: { 'fill-color': '#22c55e', 'fill-opacity': 0.5 } });

      mapRef.current.addLayer({ id: 'talhao-selected-outline', type: 'line', source: 'talhoes',
        filter: ['==', ['get', 'id'], ''],
        paint: { 'line-color': '#16a34a', 'line-width': 3 } });

      mapRef.current.addLayer({ id: 'talhao-label', type: 'symbol', source: 'talhoes',
        layout: { 'text-field': ['get', 'nome'], 'text-size': 12 },
        paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1 } });

      mapRef.current.fitBounds([[-54.75, -13.32], [-54.46, -13.16]], { padding: 80 });
    });

    return () => { mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  // Troca de estilo (street ↔ satellite)
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const style = mapMode === 'satellite' ? SATELLITE_STYLE : STREET_STYLE;

    const center = map.getCenter();
    const zoom = map.getZoom();

    map.setStyle(style as maplibregl.StyleSpecification);

    map.once('styledata', () => {
      if (!mapRef.current) return;
      map.setCenter(center);
      map.setZoom(zoom);

      map.addSource('talhoes', { type: 'geojson', data: TALHOES_MOCK });
      map.addLayer({ id: 'talhao-fill', type: 'fill', source: 'talhoes',
        paint: { 'fill-color': '#f59e0b', 'fill-opacity': mapMode === 'satellite' ? 0.25 : 0.35 } });
      map.addLayer({ id: 'talhao-outline', type: 'line', source: 'talhoes',
        paint: { 'line-color': mapMode === 'satellite' ? '#fde68a' : '#d97706', 'line-width': 2 } });
      map.addLayer({ id: 'talhao-selected', type: 'fill', source: 'talhoes',
        filter: ['==', ['get', 'id'], nav.talhaoId ?? ''],
        paint: { 'fill-color': '#22c55e', 'fill-opacity': 0.4 } });
      map.addLayer({ id: 'talhao-selected-outline', type: 'line', source: 'talhoes',
        filter: ['==', ['get', 'id'], nav.talhaoId ?? ''],
        paint: { 'line-color': '#16a34a', 'line-width': 3 } });
      map.addLayer({ id: 'talhao-label', type: 'symbol', source: 'talhoes',
        layout: { 'text-field': ['get', 'nome'], 'text-size': 12 },
        paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1.5 } });
    });
  }, [mapMode]);

  // Destaca talhão selecionado
  useEffect(() => {
    if (!mapRef.current || !mapRef.current.isStyleLoaded()) return;
    const id = nav.talhaoId ?? '';
    try {
      mapRef.current.setFilter('talhao-selected', ['==', ['get', 'id'], id]);
      mapRef.current.setFilter('talhao-selected-outline', ['==', ['get', 'id'], id]);
    } catch {}
  }, [nav.talhaoId]);

  // Auto-carrega KML de talhões com URL pré-definida
  useEffect(() => {
    if (!nav.talhaoId) return;
    const kmlUrl = TALHAO_KML_URLS[nav.talhaoId];
    if (!kmlUrl) return;

    // Limpa geo anterior antes de carregar o novo
    setUploadedGeo(null);
    setUploadedBbox(null);

    fetch(kmlUrl)
      .then(r => r.blob())
      .then(blob => {
        const file = new File([blob], 'talhao.kml', { type: 'application/vnd.google-earth.kml+xml' });
        return parseKML(file);
      })
      .then(result => {
        setMapMode('satellite');
        setUploadedGeo(result.geojson);
        setUploadedBbox(result.bbox);
      })
      .catch(e => console.error('Erro ao carregar KML:', e));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.talhaoId]);

  // Geometria carregada (KML/GeoJSON upload) — aguarda estilo pronto
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function addGeoLayers() {
      if (!map) return;
      try { map.removeLayer('upload-fill'); } catch {}
      try { map.removeLayer('upload-line'); } catch {}
      try { map.removeLayer('upload-points'); } catch {}
      try { map.removeSource('upload-geo'); } catch {}

      if (!uploadedGeo) return;

      map.addSource('upload-geo', { type: 'geojson', data: uploadedGeo });
      map.addLayer({ id: 'upload-fill', type: 'fill', source: 'upload-geo',
        filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
        paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.35 } });
      map.addLayer({ id: 'upload-line', type: 'line', source: 'upload-geo',
        filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString']]],
        paint: { 'line-color': '#fde68a', 'line-width': 2.5 } });
      map.addLayer({ id: 'upload-points', type: 'circle', source: 'upload-geo',
        filter: ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]],
        paint: { 'circle-radius': 5, 'circle-color': '#f59e0b', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } });

      if (uploadedBbox) {
        map.fitBounds(
          [[uploadedBbox[0], uploadedBbox[1]], [uploadedBbox[2], uploadedBbox[3]]],
          { padding: 60, duration: 900 }
        );
      }
    }

    if (map.isStyleLoaded()) {
      addGeoLayers();
    } else {
      map.once('styledata', addGeoLayers);
      return () => { map.off('styledata', addGeoLayers); };
    }
  }, [uploadedGeo, uploadedBbox]);

  // Camada de pontos de amostragem
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) return;

    const showPoints = activeModule === 'amostragem' && nav.talhaoId;
    const pontos = nav.talhaoId ? PONTOS_AMOSTRAGEM[nav.talhaoId] : null;

    try { map.removeLayer('pontos-label'); } catch {}
    try { map.removeLayer('pontos-circle'); } catch {}
    try { map.removeSource('pontos-amostragem'); } catch {}

    if (showPoints && pontos) {
      map.addSource('pontos-amostragem', { type: 'geojson', data: pontos });
      map.addLayer({
        id: 'pontos-circle', type: 'circle', source: 'pontos-amostragem',
        paint: {
          'circle-radius': 7,
          'circle-color': '#f59e0b',
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1.5,
        },
      });
      map.addLayer({
        id: 'pontos-label', type: 'symbol', source: 'pontos-amostragem',
        layout: { 'text-field': ['get', 'id'], 'text-size': 9, 'text-offset': [0, 1.4] },
        paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1 },
      });
    }
  }, [activeModule, nav.talhaoId]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Toggle Satélite / Rua */}
      <div className="absolute bottom-8 right-14 z-10 flex rounded-lg overflow-hidden shadow-lg"
        style={{ border: '2px solid rgba(255,255,255,0.2)' }}>
        {(['street', 'satellite'] as const).map(mode => (
          <button key={mode}
            onClick={() => setMapMode(mode)}
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
