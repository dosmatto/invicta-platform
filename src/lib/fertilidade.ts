// Cliente do backend de interpolação + helpers de gradiente da Base Agronômica.
//
// O front envia pontos (lng/lat/valor) + polígono do talhão + domínio/cores
// derivados da legenda do nutriente. O backend devolve um PNG (raster
// interpolado, recortado e colorido) + bounds para sobrepor no mapa.

import { stopsParaBackend, gradienteCssDaLegenda, type Legenda } from './legendas';
import { postBackend, BACKEND_LOCAL } from './interpUrl';

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

// Variograma 100% manual (C2.b) — quando presente, o backend usa esses parâmetros
// direto (sem auto-ajuste nem anti-degeneração).
export interface VariogramaManual {
  modelo?: string;        // spherical | exponential | gaussian
  patamar?: number;       // sill
  alcance: number;        // range (m) — obrigatório p/ ativar o modo manual
  pepita?: number;        // nugget
  vizinhos?: number;      // n_closest_points (0/undefined = todos)
  aniso_ratio?: number;   // anisotropia: razão do eixo maior/menor (1 = isotrópico)
  aniso_angle?: number;   // anisotropia: ângulo (graus)
}

export async function interpolar(params: {
  pontos: PontoInterp[];
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  dominio: [number, number];
  stops: Stop[];
  pixelM?: number;
  metodo?: 'krige' | 'idw';
  modeloFixo?: string | null;
  variogramaManual?: VariogramaManual | null;
}): Promise<RespInterp> {
  const r = await postBackend('/interpolar', {
    pontos: params.pontos,
    poligono: params.poligono,
    dominio: params.dominio,
    stops: params.stops,
    pixel_m: params.pixelM ?? 20,
    metodo: params.metodo ?? 'krige',
    modelo_fixo: params.modeloFixo ?? null,
    variograma_manual: params.variogramaManual ?? null,
  });
  if (!r.ok) {
    let msg = `Backend respondeu ${r.status}`;
    try { const j = await r.json(); if (j?.detail) msg = String(j.detail); } catch {}
    throw new Error(msg);
  }
  return r.json();
}

// Zona por SIMILARIDADE: clusteriza mapas JÁ interpolados (não interpola).
// Revisão 13.00A — duas etapas que não se misturam:
//   ANALISAR (FPI/NCE 2..12 + sugestão) → o usuário decide o nº de zonas →
//   GERAR (clusteriza o nº escolhido + área mínima + vetoriza). Qualidade (CV…) é avaliada DEPOIS.

async function postZonear(rota: string, body: unknown): Promise<Response> {
  const r = await postBackend(rota, body);
  if (r.status === 404) {
    // A rota não existe → o backend é mais antigo que o app (nuvem: deploy do
    // servidor ainda propagando; local: janela aberta com código velho).
    throw new Error(BACKEND_LOCAL
      ? 'Backend local DESATUALIZADO: feche a janela do backend e reabra pelo atalho "INVICTA Backend" (ele atualiza as rotas de zonas). Se persistir, atualize o código do backend nesta máquina.'
      : 'O servidor de processamento ainda não tem esta função — ele deve estar sendo atualizado. Tente de novo em alguns minutos.');
  }
  if (!r.ok) {
    let msg = `Backend respondeu ${r.status}`;
    try { const j = await r.json(); if (j?.detail) msg = String(j.detail); } catch {}
    throw new Error(msg);
  }
  return r;
}

// ── ETAPA 1: Analisar (não gera) ──
export interface RespAnalisarZonas {
  indices: { c: number; fpi: number; nce: number }[];   // 2..c_max
  sugestao_c: number | null;
  confianca: number;                                     // 0..100 (%)
  justificativa: string;
  stats: { algoritmo: string; n_pixels: number; n_camadas: number; c_min: number; c_max: number };
}

export async function analisarZonas(params: {
  camadas: { nome: string; b64: string }[];
  bounds: [number, number, number, number];
  shape: [number, number];
  poligono?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  algoritmo?: 'fcm' | 'kmeans';
  cMin?: number;
  cMax?: number;
  pesos?: number[] | null;
}): Promise<RespAnalisarZonas> {
  const r = await postZonear('/zonear-analisar', {
    camadas: params.camadas,
    bounds: params.bounds,
    shape: params.shape,
    poligono: params.poligono ?? null,
    algoritmo: params.algoritmo ?? 'fcm',
    c_min: params.cMin ?? 2,
    c_max: params.cMax ?? 12,
    pesos: params.pesos ?? null,
  });
  return r.json();
}

// ── ETAPA 2: Gerar (nº já escolhido) ──
export interface RespGerarZonas {
  type: 'FeatureCollection';
  features: GeoJSON.Feature[];
  stats: { algoritmo: string; n_classes: number; n_zonas: number; n_pixels: number; n_camadas: number; area_min_ha: number; ordem_por: string };
}

export async function gerarZonas(params: {
  camadas: { nome: string; b64: string }[];
  bounds: [number, number, number, number];
  shape: [number, number];
  nClasses: number;
  poligono?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  algoritmo?: 'fcm' | 'kmeans';
  areaMinHa?: number;
  pesos?: number[] | null;
}): Promise<RespGerarZonas> {
  const r = await postZonear('/zonear-gerar', {
    camadas: params.camadas,
    bounds: params.bounds,
    shape: params.shape,
    n_classes: params.nClasses,
    poligono: params.poligono ?? null,
    algoritmo: params.algoritmo ?? 'fcm',
    area_min_ha: params.areaMinHa ?? 0,
    pesos: params.pesos ?? null,
  });
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
