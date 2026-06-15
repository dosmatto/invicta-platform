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

// Captura o mapa. Com satélite usa um MapLibre oculto; se isso falhar (timeout,
// CORS, WebGL), cai para uma composição determinística em canvas (raster +
// limite + valores em fundo branco) — assim o relatório NUNCA falha pelo mapa.
export async function capturarMapaFertilidade(c: CapturaMapa): Promise<string> {
  if (!c.satelite) return comporDeterministico(c);
  try {
    return await render(c);
  } catch (e) {
    console.warn('[captura] satélite indisponível; compondo sem satélite (fundo branco):', e);
    return comporDeterministico(c);
  }
}

function carregarImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('falha ao carregar raster'));
    img.src = src;
  });
}

// Composição sem MapLibre: projeta o bbox no canvas (preservando proporção),
// desenha o raster, o limite do talhão e os valores. Determinística e à prova
// de timeout/CORS.
async function comporDeterministico(c: CapturaMapa): Promise<string> {
  const W = c.larguraPx, H = c.alturaPx;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

  const [w, s, e, n] = c.bounds;
  const latC = (s + n) / 2;
  const aspect = ((e - w) * Math.cos(latC * Math.PI / 180)) / (n - s || 1);
  const pad = 0.06;
  const availW = W * (1 - 2 * pad), availH = H * (1 - 2 * pad);
  let drawW: number, drawH: number;
  if (availW / availH > aspect) { drawH = availH; drawW = availH * aspect; }
  else { drawW = availW; drawH = availW / aspect; }
  const ox = (W - drawW) / 2, oy = (H - drawH) / 2;
  const px = (lng: number) => ox + ((lng - w) / (e - w || 1)) * drawW;
  const py = (lat: number) => oy + ((n - lat) / (n - s || 1)) * drawH;

  // raster (cobre exatamente o bbox)
  try { const img = await carregarImg(c.rasterPng); ctx.drawImage(img, ox, oy, drawW, drawH); } catch { /* segue sem raster */ }

  // limite do talhão (contorno)
  const aneis: GeoJSON.Position[][] = c.poligono.type === 'Polygon'
    ? c.poligono.coordinates
    : c.poligono.coordinates.flat();
  ctx.lineWidth = Math.max(1.5, W / 500); ctx.strokeStyle = c.corLimite; ctx.lineJoin = 'round';
  for (const anel of aneis) {
    ctx.beginPath();
    anel.forEach((pt, i) => { const x = px(pt[0]), y = py(pt[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath(); ctx.stroke();
  }

  // valores (só o número, halo branco)
  ctx.font = `bold ${Math.round(W / 90)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, W / 350); ctx.strokeStyle = '#1f2937'; ctx.fillStyle = '#ffffff';
  for (const f of c.valores.features) {
    if (f.geometry?.type !== 'Point') continue;
    const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
    const txt = String((f.properties as { txt?: string } | null)?.txt ?? '');
    if (!txt) continue;
    const x = px(lng), y = py(lat);
    ctx.strokeText(txt, x, y); ctx.fillText(txt, x, y);
  }
  return cv.toDataURL('image/png');
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
    // espera o estilo carregar (erros de tile NÃO abortam); se não carregar a
    // tempo, lança e o chamador cai para a composição determinística.
    await new Promise<void>(res => {
      if (map.isStyleLoaded()) return res();
      const t = setTimeout(res, 18000);
      map.once('load', () => { clearTimeout(t); res(); });
    });
    if (!map.isStyleLoaded()) throw new Error('estilo do mapa não carregou (timeout)');

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
