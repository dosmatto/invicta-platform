// Estatísticas do RASTER dentro de uma zona (spec §8: valor médio / mínimo /
// máximo / desvio padrão). Amostra as células do grid interpolado cujo CENTRO
// cai dentro da geometria da zona e agrega os valores finitos.
//
// Convenção do grid (casa com o backend, interp.py): b64 Float32 row-major com
// LINHA 0 = NORTE; os pontos ficam no linspace sobre os bounds [w,s,e,n].
// Autocontido de propósito (decode inline, sem dependências) para ser testável
// isoladamente em Node.

export interface StatsRaster {
  n: number;        // nº de pixels válidos amostrados na zona
  media: number;
  min: number;
  max: number;
  desvio: number;   // desvio padrão populacional
}

type Grid = { b64: string; shape: [number, number] };

function decodeF32(b64: string): Float32Array {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Float32Array(buf);
}

// Ray casting: ponto dentro de um anel (polígono simples)?
function pontoEmAnel(x: number, y: number, anel: number[][]): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const xi = anel[i][0], yi = anel[i][1], xj = anel[j][0], yj = anel[j][1];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) dentro = !dentro;
  }
  return dentro;
}

// Dentro do anel externo E fora de todos os furos.
function pontoEmRings(x: number, y: number, rings: number[][][]): boolean {
  if (!rings.length || !pontoEmAnel(x, y, rings[0])) return false;
  for (let k = 1; k < rings.length; k++) if (pontoEmAnel(x, y, rings[k])) return false;
  return true;
}

function polygonsDe(geom: GeoJSON.Geometry | null | undefined): number[][][][] {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates as number[][][]];
  if (geom.type === 'MultiPolygon') return geom.coordinates as number[][][][];
  return [];
}

// Estatísticas do raster de UMA camada dentro de UMA zona. null se não há pixel
// válido dentro da zona (fora do talhão / camada sem dado ali).
export function estatisticasRasterZona(
  geom: GeoJSON.Geometry | null | undefined,
  grid: Grid,
  bounds: [number, number, number, number],
): StatsRaster | null {
  const polys = polygonsDe(geom);
  if (!polys.length) return null;
  const [rows, cols] = grid.shape;
  const [w, s, e, n] = bounds;
  let vals: Float32Array;
  try { vals = decodeF32(grid.b64); } catch { return null; }
  if (vals.length < rows * cols) return null;

  // bbox da geometria — pula as células distantes (rápido em talhões grandes)
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const rings of polys) for (const p of rings[0]) {
    if (p[0] < bx0) bx0 = p[0]; if (p[0] > bx1) bx1 = p[0];
    if (p[1] < by0) by0 = p[1]; if (p[1] > by1) by1 = p[1];
  }

  let cnt = 0, soma = 0, soma2 = 0, mn = Infinity, mx = -Infinity;
  for (let r = 0; r < rows; r++) {
    const lat = rows === 1 ? (n + s) / 2 : n - (r / (rows - 1)) * (n - s); // linha 0 = norte
    if (lat < by0 || lat > by1) continue;
    for (let c = 0; c < cols; c++) {
      const lng = cols === 1 ? (w + e) / 2 : w + (c / (cols - 1)) * (e - w);
      if (lng < bx0 || lng > bx1) continue;
      const v = vals[r * cols + c];
      if (!isFinite(v)) continue;
      let dentro = false;
      for (const rings of polys) { if (pontoEmRings(lng, lat, rings)) { dentro = true; break; } }
      if (!dentro) continue;
      cnt++; soma += v; soma2 += v * v;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
  }
  if (cnt === 0) return null;
  const media = soma / cnt;
  const varr = Math.max(0, soma2 / cnt - media * media);
  return { n: cnt, media, min: mn, max: mx, desvio: Math.sqrt(varr) };
}
