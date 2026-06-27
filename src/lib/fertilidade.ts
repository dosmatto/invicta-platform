// Cliente do backend de interpolação + helpers de gradiente da Base Agronômica.
//
// O front envia pontos (lng/lat/valor) + polígono do talhão + domínio/cores
// derivados da legenda do nutriente. O backend devolve um PNG (raster
// interpolado, recortado e colorido) + bounds para sobrepor no mapa.

import { stopsParaBackend, gradienteCssDaLegenda, type Legenda } from './legendas';

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
  // `comp: 'gz'` indica que `b64` está comprimido (só na nuvem); em memória é sempre cru.
  grid?: { b64: string; shape: [number, number]; comp?: 'gz' };
}

export type Grid = NonNullable<RespInterp['grid']>;

// Decodifica o grid base64 (cru) -> Float32Array. Use grid_oriented[r*cols + c].
export function decodeGrid(g: Grid): { valores: Float32Array; rows: number; cols: number } {
  const bin = atob(g.b64);
  const buf = new ArrayBuffer(bin.length);
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return { valores: new Float32Array(buf), rows: g.shape[0], cols: g.shape[1] };
}

// ── Compressão do grid para a nuvem (gzip, lossless) ────────────────────────
// O grid Float32 é volumoso (até ~1,3 MB em base64 no teto de 500×500 do
// backend) e estouraria o limite de 1 MB/doc do Firestore. Como é uma
// superfície suave + muito NaN fora do polígono, comprime altíssimo (~5–20×),
// cabendo folgado. Comprimimos só na fronteira da nuvem; o cache em memória
// mantém o b64 cru para o render (decodeGrid) seguir síncrono.
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
function bytesToB64(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf);
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < u8.length; i += CHUNK) s += String.fromCharCode(...u8.subarray(i, i + CHUNK));
  return btoa(s);
}
async function porStream(u8: Uint8Array, ts: TransformStream): Promise<string> {
  const stream = new Blob([u8 as BlobPart]).stream().pipeThrough(ts);
  return bytesToB64(await new Response(stream).arrayBuffer());
}

export async function comprimirGrid(grid: Grid): Promise<Grid> {
  if (grid.comp === 'gz' || typeof CompressionStream === 'undefined') return grid;
  const gz = await porStream(b64ToBytes(grid.b64), new CompressionStream('gzip'));
  return { shape: grid.shape, b64: gz, comp: 'gz' };
}

export async function descomprimirGrid(grid: Grid): Promise<Grid> {
  if (grid.comp !== 'gz' || typeof DecompressionStream === 'undefined') return grid;
  const cru = await porStream(b64ToBytes(grid.b64), new DecompressionStream('gzip'));
  return { shape: grid.shape, b64: cru };
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

// Zona por SIMILARIDADE: clusteriza mapas JÁ interpolados (não interpola).
export interface RespZonarMulti {
  type: 'FeatureCollection';
  features: GeoJSON.Feature[];
  indices: { c: number; fpi: number; nce: number }[];
  sugestao_c: number | null;
  stats: { algoritmo: string; n_classes: number; n_pixels: number; n_camadas: number; area_min_ha: number; ordem_por: string };
}

export async function zonearMulti(params: {
  camadas: { nome: string; b64: string }[];
  bounds: [number, number, number, number];
  shape: [number, number];
  poligono?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  nClasses?: number;
  algoritmo?: 'fcm' | 'kmeans';
  cMin?: number;
  cMax?: number;
  areaMinHa?: number;
}): Promise<RespZonarMulti> {
  let r: Response;
  try {
    r = await fetch(`${INTERP_URL}/zonear-multi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        camadas: params.camadas,
        bounds: params.bounds,
        shape: params.shape,
        poligono: params.poligono ?? null,
        n_classes: params.nClasses ?? 0,
        algoritmo: params.algoritmo ?? 'fcm',
        c_min: params.cMin ?? 2,
        c_max: params.cMax ?? 6,
        area_min_ha: params.areaMinHa ?? 0,
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
