// Cliente do backend de interpolação + helpers de gradiente da Base Agronômica.
//
// O front envia pontos (lng/lat/valor) + polígono do talhão + domínio/cores
// derivados da legenda do nutriente. O backend devolve um PNG (raster
// interpolado, recortado e colorido) + bounds para sobrepor no mapa.

import { LEGENDAS_PADRAO, CORES_CLASSES, type LegendaNutriente } from '@/constants/agronomica';

const INTERP_URL = process.env.NEXT_PUBLIC_INTERP_URL ?? 'http://127.0.0.1:8800';

export type Stop = [number, [number, number, number]];

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function legendaPorId(id: string): LegendaNutriente | undefined {
  return LEGENDAS_PADRAO.find(l => l.id === id);
}

// Domínio [min,max] + paradas de cor a partir das classes da legenda.
// As cores das 5 classes (MB/B/M/A/MA) ficam ancoradas no centro de cada faixa
// entre os limites finitos; gradiente contínuo entre elas (Al e m% invertidos).
export function rampaDaLegenda(leg: LegendaNutriente): { dominio: [number, number]; stops: Stop[] } {
  const cores = leg.invertido ? CORES_CLASSES.invertido : CORES_CLASSES.normal;
  const lims = leg.classes.map(c => c.max).filter((m): m is number => m != null); // [b1,b2,b3,b4]
  const vmin = lims[0];
  const vmax = lims[lims.length - 1];
  const span = (vmax - vmin) || 1;
  const t = (v: number) => Math.min(1, Math.max(0, (v - vmin) / span));
  const stops: Stop[] = [
    [0, hexToRgb(cores['Muito Baixo'])],
    [t((lims[0] + lims[1]) / 2), hexToRgb(cores['Baixo'])],
    [t((lims[1] + lims[2]) / 2), hexToRgb(cores['Médio'])],
    [t((lims[2] + lims[3]) / 2), hexToRgb(cores['Alto'])],
    [1, hexToRgb(cores['Muito Alto'])],
  ];
  return { dominio: [vmin, vmax], stops };
}

export function gradienteCss(stops: Stop[]): string {
  const partes = stops.map(([t, [r, g, b]]) => `rgb(${r},${g},${b}) ${Math.round(t * 100)}%`);
  return `linear-gradient(to right, ${partes.join(', ')})`;
}

export interface PontoInterp { lng: number; lat: number; valor: number; }

export interface RespInterp {
  bounds: [number, number, number, number];
  png: string;
  stats: {
    n: number; modelo: string; min: number | null; max: number | null; nx: number; ny: number;
    pixel_m: number; rmse: number | null;
    variograma: { alcance_m: number; patamar: number; pepita: number } | null;
  };
}

export async function interpolar(params: {
  pontos: PontoInterp[];
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  dominio: [number, number];
  stops: Stop[];
  pixelM?: number;
  metodo?: 'krige' | 'idw';
  modeloFixo?: string | null;
}): Promise<RespInterp> {
  let r: Response;
  try {
    r = await fetch(`${INTERP_URL}/interpolar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pontos: params.pontos,
        poligono: params.poligono,
        dominio: params.dominio,
        stops: params.stops,
        pixel_m: params.pixelM ?? 20,
        metodo: params.metodo ?? 'krige',
        modelo_fixo: params.modeloFixo ?? null,
      }),
    });
  } catch {
    throw new Error('Interpolador desligado nesta máquina. Dê dois cliques em backend\\start.bat (Windows) ou backend/start.command (Mac), espere a janela abrir, e tente de novo.');
  }
  if (!r.ok) {
    let msg = `Backend respondeu ${r.status}`;
    try { const j = await r.json(); if (j?.detail) msg = String(j.detail); } catch {}
    throw new Error(msg);
  }
  return r.json();
}

// bounds [w,s,e,n] -> coordinates do image source (TL, TR, BR, BL)
export function coordsFromBounds(
  b: [number, number, number, number],
): [[number, number], [number, number], [number, number], [number, number]] {
  const [w, s, e, n] = b;
  return [[w, n], [e, n], [e, s], [w, s]];
}

// Extrai um Polygon/MultiPolygon de qualquer GeoJSON (FC / Feature / Geometry).
type GeoInput = GeoJSON.FeatureCollection | GeoJSON.Feature | GeoJSON.Geometry | null;
export function extrairPoligono(input: GeoInput): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  if (!input) return null;
  const polys: GeoJSON.Position[][][] = [];
  const add = (g: GeoJSON.Geometry | null | undefined) => {
    if (!g) return;
    if (g.type === 'Polygon') polys.push(g.coordinates);
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => polys.push(p));
    else if (g.type === 'GeometryCollection') g.geometries.forEach(add);
  };
  if (input.type === 'FeatureCollection') input.features.forEach(f => add(f.geometry));
  else if (input.type === 'Feature') add(input.geometry);
  else add(input as GeoJSON.Geometry);
  if (polys.length === 0) return null;
  if (polys.length === 1) return { type: 'Polygon', coordinates: polys[0] };
  return { type: 'MultiPolygon', coordinates: polys };
}
