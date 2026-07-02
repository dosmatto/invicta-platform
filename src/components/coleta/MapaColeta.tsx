'use client';

// Mapa do app de Coleta (mobile): satélite/ruas, limite do talhão, pontos por
// status, posição do operador (com círculo de precisão), linha de navegação até
// o alvo e raio permitido. Leve e independente do MapView do desktop.

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { circuloGeo } from '@/lib/coleta';

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

const STYLE: maplibregl.StyleSpecification = {
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
  },
  layers: [
    { id: 'layer-osm', type: 'raster', source: 'osm', layout: { visibility: 'none' } },
    { id: 'layer-sat', type: 'raster', source: 'esri_sat' },
  ],
};

export interface PosOperador { lng: number; lat: number; acc: number }

interface Props {
  talhaoGeo: GeoJSON.FeatureCollection | null;
  bbox: [number, number, number, number] | null;
  pontos: GeoJSON.FeatureCollection;   // Points c/ props { ordem, codigo, cor, sel }
  userPos: PosOperador | null;
  alvo: { lng: number; lat: number } | null;
  raioM: number;
  modo: 'sat' | 'ruas';
  seguirGps: boolean;
  onSelecionarPonto: (ordem: number) => void;
}

export function MapaColeta({ talhaoGeo, bbox, pontos, userPos, alvo, raioM, modo, seguirGps, onSelecionarPonto }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const prontoRef = useRef(false);
  const filaRef = useRef<((map: maplibregl.Map) => void)[]>([]);
  const ajustouRef = useRef(false);
  const onSelRef = useRef(onSelecionarPonto);
  onSelRef.current = onSelecionarPonto;

  // init (uma vez)
  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: divRef.current,
      style: STYLE,
      center: [-51.5, -23.5],
      zoom: 13,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on('load', () => {
      map.addSource('talhao', { type: 'geojson', data: EMPTY_FC });
      map.addSource('raio', { type: 'geojson', data: EMPTY_FC });
      map.addSource('rota', { type: 'geojson', data: EMPTY_FC });
      map.addSource('pontos', { type: 'geojson', data: EMPTY_FC });
      map.addSource('user-acc', { type: 'geojson', data: EMPTY_FC });
      map.addSource('user', { type: 'geojson', data: EMPTY_FC });

      map.addLayer({ id: 'talhao-line', type: 'line', source: 'talhao',
        paint: { 'line-color': '#60a5fa', 'line-width': 2 } });
      map.addLayer({ id: 'raio-fill', type: 'fill', source: 'raio',
        paint: { 'fill-color': '#4ade80', 'fill-opacity': 0.12 } });
      map.addLayer({ id: 'raio-line', type: 'line', source: 'raio',
        paint: { 'line-color': '#4ade80', 'line-width': 1.5, 'line-dasharray': [2, 1.5] } });
      map.addLayer({ id: 'rota-line', type: 'line', source: 'rota',
        paint: { 'line-color': '#facc15', 'line-width': 2.5, 'line-dasharray': [1.5, 1.2] } });
      map.addLayer({ id: 'pontos-circulo', type: 'circle', source: 'pontos',
        paint: {
          'circle-radius': ['case', ['get', 'sel'], 11, 8],
          'circle-color': ['get', 'cor'],
          'circle-stroke-width': ['case', ['get', 'sel'], 3, 1.5],
          'circle-stroke-color': ['case', ['get', 'sel'], '#fff', '#0a1929'],
        } });
      map.addLayer({ id: 'pontos-codigo', type: 'symbol', source: 'pontos',
        layout: {
          'text-field': ['get', 'codigo'], 'text-size': 10,
          'text-font': ['Open Sans Regular'], 'text-offset': [0, 1.6],
          'text-allow-overlap': false,
        },
        paint: { 'text-color': '#fff', 'text-halo-color': '#0a1929', 'text-halo-width': 1.2 } });
      map.addLayer({ id: 'user-acc-fill', type: 'fill', source: 'user-acc',
        paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.15 } });
      map.addLayer({ id: 'user-dot', type: 'circle', source: 'user',
        paint: {
          'circle-radius': 7, 'circle-color': '#3b82f6',
          'circle-stroke-width': 2.5, 'circle-stroke-color': '#fff',
        } });

      map.on('click', 'pontos-circulo', (e) => {
        const f = e.features?.[0];
        if (f?.properties && f.properties.ordem != null) onSelRef.current(Number(f.properties.ordem));
      });
      map.on('mouseenter', 'pontos-circulo', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'pontos-circulo', () => { map.getCanvas().style.cursor = ''; });

      prontoRef.current = true;
      filaRef.current.splice(0).forEach(fn => fn(map));
    });

    return () => { map.remove(); mapRef.current = null; prontoRef.current = false; filaRef.current = []; };
  }, []);

  // helper: roda quando o estilo está pronto (agora ou assim que carregar)
  function quandoPronto(fn: (map: maplibregl.Map) => void) {
    const map = mapRef.current;
    if (map && prontoRef.current) fn(map);
    else filaRef.current.push(fn);
  }

  // satélite × ruas
  useEffect(() => {
    quandoPronto(map => {
      map.setLayoutProperty('layer-sat', 'visibility', modo === 'sat' ? 'visible' : 'none');
      map.setLayoutProperty('layer-osm', 'visibility', modo === 'ruas' ? 'visible' : 'none');
    });
  }, [modo]);

  // limite do talhão + enquadramento inicial
  useEffect(() => {
    quandoPronto(map => {
      (map.getSource('talhao') as maplibregl.GeoJSONSource)?.setData(talhaoGeo ?? EMPTY_FC);
      if (bbox && !ajustouRef.current) {
        ajustouRef.current = true;
        map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 40, duration: 0 });
      }
    });
  }, [talhaoGeo, bbox]);

  // pontos
  useEffect(() => {
    quandoPronto(map => {
      (map.getSource('pontos') as maplibregl.GeoJSONSource)?.setData(pontos);
    });
  }, [pontos]);

  // alvo: raio permitido + linha de navegação
  useEffect(() => {
    quandoPronto(map => {
      const raio = alvo ? { type: 'FeatureCollection' as const, features: [circuloGeo(alvo.lng, alvo.lat, raioM)] } : EMPTY_FC;
      (map.getSource('raio') as maplibregl.GeoJSONSource)?.setData(raio);
      const rota: GeoJSON.FeatureCollection = alvo && userPos
        ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[userPos.lng, userPos.lat], [alvo.lng, alvo.lat]] } }] }
        : EMPTY_FC;
      (map.getSource('rota') as maplibregl.GeoJSONSource)?.setData(rota);
    });
  }, [alvo, raioM, userPos]);

  // posição do operador (+ seguir)
  useEffect(() => {
    quandoPronto(map => {
      const user: GeoJSON.FeatureCollection = userPos
        ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [userPos.lng, userPos.lat] } }] }
        : EMPTY_FC;
      (map.getSource('user') as maplibregl.GeoJSONSource)?.setData(user);
      const acc: GeoJSON.FeatureCollection = userPos && userPos.acc > 0
        ? { type: 'FeatureCollection', features: [circuloGeo(userPos.lng, userPos.lat, userPos.acc)] }
        : EMPTY_FC;
      (map.getSource('user-acc') as maplibregl.GeoJSONSource)?.setData(acc);
      if (userPos && seguirGps) map.easeTo({ center: [userPos.lng, userPos.lat], duration: 400 });
    });
  }, [userPos, seguirGps]);

  return <div ref={divRef} className="absolute inset-0" />;
}
