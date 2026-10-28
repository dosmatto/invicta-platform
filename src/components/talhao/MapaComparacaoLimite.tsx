'use client';

// Mapa pequeno da comparação de LIMITES (seção Integração PrecisionFarm):
// satélite, o contorno da Invicta e o da PrecisionFarm sobrepostos (cores
// distintas) e as diferenças pintadas — o que só a PF tem e o que só a Invicta
// tem. Mapa próprio (mesmo padrão leve do EditorGeometria), sem mexer no mapa
// principal do talhão. Só visualização.

import { useCallback, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

type Geom = GeoJSON.Polygon | GeoJSON.MultiPolygon;

export const CORES_COMPARACAO = {
  invicta: '#4ade80',     // contorno atual da Invicta
  pf: '#22d3ee',          // contorno publicado pela PF
  soPf: '#f59e0b',        // área que só a PF tem
  soInvicta: '#f43f5e',   // área que só a Invicta tem
} as const;

const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    esri_sat: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256, maxzoom: 19, attribution: '© Esri',
    },
  },
  layers: [{ id: 'layer-sat', type: 'raster', source: 'esri_sat' }],
};

const fc = (g: Geom | null, tipo: string): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: g ? [{ type: 'Feature', properties: { tipo }, geometry: g }] : [],
});

function caixa(gs: (Geom | null)[]): [[number, number], [number, number]] | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const g of gs) {
    if (!g) continue;
    const polis = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const p of polis) for (const [x, y] of p[0]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  return Number.isFinite(x0) ? [[x0, y0], [x1, y1]] : null;
}

export default function MapaComparacaoLimite({ pf, invicta, soPf, soInvicta }: {
  pf: Geom; invicta: Geom | null; soPf: Geom | null; soInvicta: Geom | null;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const dados = useRef({ pf, invicta, soPf, soInvicta });

  // Lê só refs: pode ser chamada do 'load' do mapa e dos efeitos.
  const pintar = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const d = dados.current;
    (map.getSource('soPf') as maplibregl.GeoJSONSource | undefined)?.setData(fc(d.soPf, 'soPf'));
    (map.getSource('soInv') as maplibregl.GeoJSONSource | undefined)?.setData(fc(d.soInvicta, 'soInvicta'));
    (map.getSource('inv') as maplibregl.GeoJSONSource | undefined)?.setData(fc(d.invicta, 'invicta'));
    (map.getSource('pf') as maplibregl.GeoJSONSource | undefined)?.setData(fc(d.pf, 'pf'));
  }, []);

  // Dados novos → ref → mapa (declarado ANTES da init: o 1º enquadramento já
  // usa a geometria atual).
  useEffect(() => { dados.current = { pf, invicta, soPf, soInvicta }; pintar(); }, [pf, invicta, soPf, soInvicta, pintar]);

  // Init única.
  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const cx = caixa([dados.current.pf, dados.current.invicta]);
    const map = new maplibregl.Map({
      container: divRef.current, style: STYLE, attributionControl: false,
      ...(cx ? { bounds: cx, fitBoundsOptions: { padding: 24, maxZoom: 17 } } : { center: [-51.5, -23.5], zoom: 13 }),
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    map.on('load', () => {
      for (const s of ['soPf', 'soInv', 'inv', 'pf']) map.addSource(s, { type: 'geojson', data: fc(null, s) });
      // Diferenças por baixo, contornos por cima (o da PF tracejado, para ver os dois quando coincidem).
      map.addLayer({ id: 'soPf-fill', type: 'fill', source: 'soPf', paint: { 'fill-color': CORES_COMPARACAO.soPf, 'fill-opacity': 0.75 } });
      map.addLayer({ id: 'soInv-fill', type: 'fill', source: 'soInv', paint: { 'fill-color': CORES_COMPARACAO.soInvicta, 'fill-opacity': 0.75 } });
      map.addLayer({ id: 'inv-line', type: 'line', source: 'inv', paint: { 'line-color': CORES_COMPARACAO.invicta, 'line-width': 2.5 } });
      map.addLayer({ id: 'pf-line', type: 'line', source: 'pf', paint: { 'line-color': CORES_COMPARACAO.pf, 'line-width': 2, 'line-dasharray': [2, 1.5] } });
      pintar();
    });
    return () => { map.remove(); mapRef.current = null; };
  }, [pintar]);

  return <div ref={divRef} className="w-full rounded overflow-hidden" style={{ height: 240, background: '#061525', border: '1px solid #1a3a6b' }} />;
}
