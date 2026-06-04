'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useApp } from '@/context/AppContext';

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

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const { mapMode, setMapMode, nav } = useApp();

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
