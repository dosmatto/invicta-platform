// Cliente do backend de interpolação + helpers de gradiente da Base Agronômica.
//
// O front envia pontos (lng/lat/valor) + polígono do talhão + domínio/cores
// derivados da legenda do nutriente. O backend devolve um PNG (raster
// interpolado, recortado e colorido) + bounds para sobrepor no mapa.

import { stopsParaBackend, gradienteCssDaLegenda, type Legenda } from './legendas';
// (Mantemos LEGENDAS_PADRAO/CORES_CLASSES apenas como referência histórica;
// o motor de cores agora é dirigido por `Legenda` editável.)

const INTERP_URL = process.env.NEXT_PUBLIC_INTERP_URL ?? 'http://127.0.0.1:8800';

export type Stop = [number, [number, number, number]];

// Domínio + paradas de cor para o backend (mapa raster).
// A coloração é "discreta por classe" — cada pixel pega a cor da sua classe
// (faixas sólidas, sem degradê dentro da classe).
export function rampaDaLegenda(leg: Legenda): { dominio: [number, number]; stops: Stop[] } {
  return stopsParaBackend(leg);
}

// Barra visual da legenda (UI): respeita as larguras visuais por classe
// (22,5 / 22,5 / 22,5 / 22,5 / 10 para 5 classes).
export function gradienteCss(leg: Legenda): string {
  return gradienteCssDaLegenda(leg);
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
  // Grid bruto (Float32) — base64. Orientacao: norte no topo (linhas).
  // Use `decodeGrid(grid)` p/ obter Float32Array de tamanho rows*cols (NaN fora do polígono).
  grid?: { b64: string; shape: [number, number] };
}

// Decodifica o grid base64 -> Float32Array. Use grid_oriented[r*cols + c].
export function decodeGrid(g: { b64: string; shape: [number, number] }): { valores: Float32Array; rows: number; cols: number } {
  const bin = atob(g.b64);
  const buf = new ArrayBuffer(bin.length);
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return { valores: new Float32Array(buf), rows: g.shape[0], cols: g.shape[1] };
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
