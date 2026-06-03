'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          'osm': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: [-54.5, -13.5],
      zoom: 5,
    });

    mapRef.current.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    mapRef.current.addControl(new maplibregl.ScaleControl(), 'bottom-left');

    // Mock talhão polygon — Mato Grosso region
    mapRef.current.on('load', () => {
      if (!mapRef.current) return;

      mapRef.current.addSource('talhao-mock', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: { nome: 'Talhão 01', area: 48.5 },
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [-54.72, -13.21],
                [-54.68, -13.21],
                [-54.68, -13.25],
                [-54.72, -13.25],
                [-54.72, -13.21],
              ]],
            },
          }, {
            type: 'Feature',
            properties: { nome: 'Talhão 02', area: 62.3 },
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [-54.63, -13.19],
                [-54.59, -13.19],
                [-54.59, -13.24],
                [-54.63, -13.24],
                [-54.63, -13.19],
              ]],
            },
          }, {
            type: 'Feature',
            properties: { nome: 'Gleba A', area: 120.8 },
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [-54.55, -13.22],
                [-54.49, -13.22],
                [-54.49, -13.29],
                [-54.55, -13.29],
                [-54.55, -13.22],
              ]],
            },
          }],
        },
      });

      mapRef.current.addLayer({
        id: 'talhao-fill',
        type: 'fill',
        source: 'talhao-mock',
        paint: {
          'fill-color': '#f59e0b',
          'fill-opacity': 0.45,
        },
      });

      mapRef.current.addLayer({
        id: 'talhao-outline',
        type: 'line',
        source: 'talhao-mock',
        paint: {
          'line-color': '#d97706',
          'line-width': 2,
        },
      });

      mapRef.current.addLayer({
        id: 'talhao-label',
        type: 'symbol',
        source: 'talhao-mock',
        layout: {
          'text-field': ['get', 'nome'],
          'text-size': 12,
          'text-font': ['Open Sans Bold'],
        },
        paint: {
          'text-color': '#1a3a6b',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        },
      });

      mapRef.current.fitBounds([[-54.75, -13.32], [-54.46, -13.16]], { padding: 60 });
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0" />;
}
