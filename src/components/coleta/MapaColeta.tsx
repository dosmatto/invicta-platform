'use client';

// Mapa do app de Coleta (mobile): satélite/ruas, limite do talhão, pontos por
// status, posição do operador (com círculo de precisão), linha de navegação até
// o alvo e raio permitido. Leve e independente do MapView do desktop.

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
// CSS embutido no bundle (não depende do CDN — essencial pro offline e pros
// gestos de toque no celular: sem ele o touch-action do canvas não é aplicado).
import 'maplibre-gl/dist/maplibre-gl.css';
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
  pedidoGps: number;        // contador: ir agora até a posição do GPS
  pedidoEnquadrar: number;  // contador: enquadrar a área (bbox) no mapa
  onSelecionarPonto: (ordem: number) => void;
  onGestoUsuario: () => void; // usuário arrastou/deu zoom → o pai desliga o "seguir"
  // Medição: desenho (polígono/linha + vértices) e clique livre no mapa
  desenho?: GeoJSON.FeatureCollection | null;
  onClickMapa?: (lng: number, lat: number) => void;
  // Mancha (#37): PNG de NDVI já colorido, sobreposto ao satélite (offline)
  ndviOverlay?: { url: string; bounds: [number, number, number, number] } | null;
  // #2: camada de REFERÊNCIA (talhão/medição/arquivo) visível durante a medição
  referencia?: GeoJSON.FeatureCollection | null;
}

export function MapaColeta({ talhaoGeo, bbox, pontos, userPos, alvo, raioM, modo, seguirGps, pedidoGps, pedidoEnquadrar, onSelecionarPonto, onGestoUsuario, desenho, onClickMapa, ndviOverlay, referencia }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const prontoRef = useRef(false);
  const filaRef = useRef<((map: maplibregl.Map) => void)[]>([]);
  const ajustouRef = useRef(false);
  const onSelRef = useRef(onSelecionarPonto);
  onSelRef.current = onSelecionarPonto;
  const onGestoRef = useRef(onGestoUsuario);
  onGestoRef.current = onGestoUsuario;
  const onClickMapaRef = useRef(onClickMapa);
  onClickMapaRef.current = onClickMapa;
  const userPosRef = useRef(userPos);
  userPosRef.current = userPos;
  const bboxRef = useRef(bbox);
  bboxRef.current = bbox;

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
      map.addSource('referencia', { type: 'geojson', data: EMPTY_FC });
      map.addSource('raio', { type: 'geojson', data: EMPTY_FC });
      map.addSource('rota', { type: 'geojson', data: EMPTY_FC });
      map.addSource('pontos', { type: 'geojson', data: EMPTY_FC });
      map.addSource('desenho', { type: 'geojson', data: EMPTY_FC });
      map.addSource('user-acc', { type: 'geojson', data: EMPTY_FC });
      map.addSource('user', { type: 'geojson', data: EMPTY_FC });

      map.addLayer({ id: 'talhao-line', type: 'line', source: 'talhao',
        paint: { 'line-color': '#60a5fa', 'line-width': 2 } });
      // #2: referência (laranja tracejado) — abaixo do desenho/pontos da medição
      map.addLayer({ id: 'ref-fill', type: 'fill', source: 'referencia',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.08 } });
      map.addLayer({ id: 'ref-line', type: 'line', source: 'referencia',
        filter: ['any', ['==', ['geometry-type'], 'LineString'], ['==', ['geometry-type'], 'Polygon']],
        paint: { 'line-color': '#f59e0b', 'line-width': 2, 'line-dasharray': [2, 1.5] } });
      map.addLayer({ id: 'ref-pontos', type: 'circle', source: 'referencia',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': 5, 'circle-color': '#f59e0b', 'circle-stroke-width': 1.5, 'circle-stroke-color': '#0a1929' } });
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
      // desenho da medição (polígono/linha + vértices)
      map.addLayer({ id: 'desenho-fill', type: 'fill', source: 'desenho',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#4ade80', 'fill-opacity': 0.22 } });
      map.addLayer({ id: 'desenho-line', type: 'line', source: 'desenho',
        filter: ['any', ['==', ['geometry-type'], 'LineString'], ['==', ['geometry-type'], 'Polygon']],
        paint: { 'line-color': '#4ade80', 'line-width': 2.5 } });
      map.addLayer({ id: 'desenho-vertices', type: 'circle', source: 'desenho',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 5.5, 'circle-color': '#fff',
          'circle-stroke-width': 2, 'circle-stroke-color': '#16a34a',
        } });
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
      // clique livre no mapa (medição: adicionar vértice onde tocar)
      map.on('click', (e) => {
        onClickMapaRef.current?.(e.lngLat.lng, e.lngLat.lat);
      });
      // gesto do USUÁRIO (arrastar/pinça/scroll) — movimentos programáticos
      // (easeTo do seguir) não têm originalEvent e não disparam isto
      map.on('movestart', (e) => {
        if ((e as { originalEvent?: Event }).originalEvent) onGestoRef.current();
      });
      map.on('mouseenter', 'pontos-circulo', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'pontos-circulo', () => { map.getCanvas().style.cursor = ''; });

      prontoRef.current = true;
      filaRef.current.splice(0).forEach(fn => fn(map));
    });

    map.on('error', (e) => {
      console.warn('[mapa-coleta]', (e as { error?: Error }).error?.message ?? e);
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

  // #2: camada de referência
  useEffect(() => {
    quandoPronto(map => {
      (map.getSource('referencia') as maplibregl.GeoJSONSource)?.setData(referencia ?? EMPTY_FC);
    });
  }, [referencia]);

  // pontos
  useEffect(() => {
    quandoPronto(map => {
      (map.getSource('pontos') as maplibregl.GeoJSONSource)?.setData(pontos);
    });
  }, [pontos]);

  // desenho da medição
  useEffect(() => {
    quandoPronto(map => {
      (map.getSource('desenho') as maplibregl.GeoJSONSource)?.setData(desenho ?? EMPTY_FC);
    });
  }, [desenho]);

  // overlay do NDVI (#37) — recria a fonte/camada image a cada mudança
  useEffect(() => {
    quandoPronto(map => {
      const SRC = 'ndvi-img', LYR = 'ndvi-img-layer';
      if (map.getLayer(LYR)) { try { map.removeLayer(LYR); } catch {} }
      if (map.getSource(SRC)) { try { map.removeSource(SRC); } catch {} }
      if (!ndviOverlay) return;
      const [w, s, e, n] = ndviOverlay.bounds;
      try {
        map.addSource(SRC, { type: 'image', url: ndviOverlay.url, coordinates: [[w, n], [e, n], [e, s], [w, s]] });
        // abaixo do contorno do talhão (talhao-line) p/ a borda e os pontos ficarem por cima
        map.addLayer({ id: LYR, type: 'raster', source: SRC, paint: { 'raster-opacity': 0.85, 'raster-fade-duration': 0 } }, 'talhao-line');
      } catch (err) { console.warn('[mapa-coleta] ndvi overlay:', err); }
    });
  }, [ndviOverlay]);

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

  // "ir para o GPS" (um toque no botão): voa até a posição atual
  useEffect(() => {
    if (!pedidoGps) return;
    quandoPronto(map => {
      const p = userPosRef.current;
      if (p) map.easeTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 16), duration: 700 });
    });
  }, [pedidoGps]);

  // "ver a área": enquadra o talhão/grade, de onde quer que o operador esteja
  useEffect(() => {
    if (!pedidoEnquadrar) return;
    quandoPronto(map => {
      const bb = bboxRef.current;
      if (bb) map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 40, duration: 700 });
    });
  }, [pedidoEnquadrar]);

  // Estilo INLINE de propósito: o CSS do MapLibre aplica `.maplibregl-map
  // { position: relative }` no container e, conforme a ordem dos stylesheets,
  // vencia a classe `absolute` — o mapa colapsava pra ALTURA 0 (tela "preta").
  // Inline ganha de qualquer classe. touchAction none garante pinça/arrastar.
  return <div ref={divRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />;
}
