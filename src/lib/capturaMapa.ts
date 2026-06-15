'use client';

// Renderiza um mapa de fertilidade num MapLibre OCULTO (preserveDrawingBuffer)
// e captura como imagem para o relatório PDF. Camadas (spec Layout Oficial V1):
//   1. Satélite (toggle; oculto → fundo branco)
//   2. Raster interpolado (já colorido, PNG)
//   3. Valores da amostra (só o número, halo branco, sem marcador)
//   4. Limite do talhão (contorno acima do raster)

import type { StyleSpecification } from 'maplibre-gl';
import { coordsFromBounds } from './fertilidade';

const GLYPHS = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';
const SAT_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

export interface CapturaMapa {
  rasterPng: string;                                   // raster colorido (dataUrl)
  bounds: [number, number, number, number];            // [w,s,e,n]
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon;    // limite do talhão
  valores: GeoJSON.FeatureCollection;                  // pontos com { txt }
  satelite: boolean;
  corLimite: string;
  larguraPx: number;
  alturaPx: number;
}

function estilo(satelite: boolean) {
  if (satelite) {
    return {
      version: 8 as const,
      glyphs: GLYPHS,
      sources: { sat: { type: 'raster' as const, tiles: [SAT_TILES], tileSize: 256, attribution: '' } },
      layers: [{ id: 'sat', type: 'raster' as const, source: 'sat' }],
    };
  }
  return {
    version: 8 as const,
    glyphs: GLYPHS,
    sources: {},
    layers: [{ id: 'bg', type: 'background' as const, paint: { 'background-color': '#ffffff' } }],
  };
}

// Captura o mapa. Se o satélite tornar o canvas "tainted" (CORS), tenta de novo
// sem satélite (fundo branco) — o relatório nunca falha por causa do basemap.
export async function capturarMapaFertilidade(c: CapturaMapa): Promise<string> {
  try {
    return await render(c);
  } catch (e) {
    if (c.satelite) {
      console.warn('[captura] satélite indisponível para exportar; usando fundo branco:', e);
      return render({ ...c, satelite: false });
    }
    throw e;
  }
}

async function render(c: CapturaMapa): Promise<string> {
  const maplibregl = (await import('maplibre-gl')).default;

  const container = document.createElement('div');
  Object.assign(container.style, { position: 'absolute', left: '-10000px', top: '0', width: `${c.larguraPx}px`, height: `${c.alturaPx}px` });
  document.body.appendChild(container);

  const map = new maplibregl.Map({
    container,
    style: estilo(c.satelite) as unknown as StyleSpecification,
    bounds: c.bounds,
    fitBoundsOptions: { padding: 18, animate: false },
    interactive: false,
    attributionControl: false,
    canvasContextAttributes: { preserveDrawingBuffer: true },
  });

  try {
    await new Promise<void>((res, rej) => {
      const t = setTimeout(() => rej(new Error('mapa não carregou (timeout)')), 15000);
      map.on('load', () => { clearTimeout(t); res(); });
      map.on('error', e => { clearTimeout(t); rej((e as { error?: Error }).error ?? new Error('erro no mapa')); });
    });

    // Camada 2 — raster interpolado
    map.addSource('raster', { type: 'image', url: c.rasterPng, coordinates: coordsFromBounds(c.bounds) });
    map.addLayer({ id: 'raster', type: 'raster', source: 'raster', paint: { 'raster-opacity': 1, 'raster-resampling': 'nearest' } });

    // Camada 4 — limite do talhão (acima do raster)
    map.addSource('limite', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: c.poligono } });
    map.addLayer({ id: 'limite', type: 'line', source: 'limite',
      paint: { 'line-color': c.corLimite, 'line-width': 2.5 } });

    // Camada 3 — valores (só texto, halo branco, sem marcador)
    map.addSource('valores', { type: 'geojson', data: c.valores });
    map.addLayer({ id: 'valores', type: 'symbol', source: 'valores',
      layout: { 'text-field': ['get', 'txt'], 'text-size': 12, 'text-font': ['Open Sans Bold'], 'text-allow-overlap': true },
      paint: { 'text-color': '#ffffff', 'text-halo-color': '#1f2937', 'text-halo-width': 1.6 } });

    map.fitBounds(c.bounds, { padding: 22, animate: false });

    // espera o mapa ficar ocioso (tiles + raster carregados); captura mesmo se
    // demorar (timeout) para nunca travar a geração do relatório.
    await new Promise<void>(res => {
      const t = setTimeout(() => res(), 9000);
      map.once('idle', () => { clearTimeout(t); res(); });
    });
    map.triggerRepaint();
    await new Promise<void>(res => requestAnimationFrame(() => res()));
    return map.getCanvas().toDataURL('image/png');
  } finally {
    map.remove();
    document.body.removeChild(container);
  }
}
