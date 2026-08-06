// Amostragem dos rasters dentro das zonas — a ponte entre "mapa" e "números".
//
// Convenção do grid (a mesma do backend interp.py e de meap/rasterStats.ts):
// b64 de Float32 row-major, LINHA 0 = NORTE, células no linspace sobre os
// bounds [w, s, e, n]. Errar isso espelha o mapa no eixo Y — e o erro não
// aparece nas estatísticas, só num mapa de cabeça para baixo lá na frente.
//
// Por que não reusar estatisticasRasterZona(): aquela função agrega na hora
// (n, média, mín, máx, desvio) e joga os valores fora. Mediana, percentis,
// IQR e outliers precisam dos valores; a separação entre zonas também.
//
// Módulo PURO. npm run teste:validacao

import { pontoEmGeometria } from '../meap/cv.ts';

export type Grid = { b64: string; shape: [number, number] };
export type Bounds = [number, number, number, number];

export interface ZonaGeom {
  idZona: string;
  geometry: GeoJSON.Geometry | null | undefined;
}

export function decodificarF32(b64: string): Float32Array {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Float32Array(buf);
}

/** Coordenada do centro da célula (r, c). Linha 0 = norte. */
export function coordDaCelula(r: number, c: number, shape: [number, number], b: Bounds): { lng: number; lat: number } {
  const [rows, cols] = shape;
  const [w, s, e, n] = b;
  return {
    lat: rows === 1 ? (n + s) / 2 : n - (r / (rows - 1)) * (n - s),
    lng: cols === 1 ? (w + e) / 2 : w + (c / (cols - 1)) * (e - w),
  };
}

/** Valor do grid no ponto, pelo vizinho mais próximo. NaN fora da extensão. */
export function valorNoPonto(grid: Grid, b: Bounds, lng: number, lat: number, vals?: Float32Array): number {
  const [rows, cols] = grid.shape;
  const [w, s, e, n] = b;
  if (lng < Math.min(w, e) || lng > Math.max(w, e) || lat < Math.min(s, n) || lat > Math.max(s, n)) return NaN;
  const v = vals ?? decodificarF32(grid.b64);
  const r = rows === 1 ? 0 : Math.round(((n - lat) / (n - s)) * (rows - 1));
  const c = cols === 1 ? 0 : Math.round(((lng - w) / (e - w)) * (cols - 1));
  if (r < 0 || r >= rows || c < 0 || c >= cols) return NaN;
  const x = v[r * cols + c];
  return Number.isFinite(x) ? x : NaN;
}

/** bbox de um conjunto de geometrias. null quando não há vértice. */
export function bboxDeZonas(zonas: ZonaGeom[]): Bounds | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const varrer = (pos: GeoJSON.Position[]) => {
    for (const [x, y] of pos) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  };
  for (const z of zonas) {
    const g = z.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') (g.coordinates as GeoJSON.Position[][]).forEach(varrer);
    else if (g.type === 'MultiPolygon') (g.coordinates as GeoJSON.Position[][][]).forEach(p => p.forEach(varrer));
  }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : null;
}

/**
 * Valores do raster caindo dentro de cada zona.
 *
 * Varre as células do grid uma vez e pergunta a que zona pertence o centro.
 * Zona sem nenhum pixel devolve array vazio — e isso é informação (a camada
 * não cobre aquele pedaço), não erro.
 */
export function amostrarPorZona(zonas: ZonaGeom[], grid: Grid, b: Bounds): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const z of zonas) out.set(z.idZona, []);
  const [rows, cols] = grid.shape;
  let vals: Float32Array;
  try { vals = decodificarF32(grid.b64); } catch { return out; }
  if (vals.length < rows * cols) return out;

  const bb = bboxDeZonas(zonas);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = vals[r * cols + c];
      if (!Number.isFinite(v)) continue;
      const { lng, lat } = coordDaCelula(r, c, grid.shape, b);
      if (bb && (lng < bb[0] || lng > bb[2] || lat < bb[1] || lat > bb[3])) continue;
      for (const z of zonas) {
        if (z.geometry && pontoEmGeometria(lng, lat, z.geometry)) { out.get(z.idZona)!.push(v); break; }
      }
    }
  }
  return out;
}

export interface PontoMalha { lng: number; lat: number; idZona: string; }

/**
 * Malha regular de pontos DENTRO das zonas, com a zona de cada ponto.
 *
 * É a base comum de comparação entre safras: cada camada temporal tem sua
 * própria resolução e extensão, e comparar pixel a pixel exigiria
 * reamostragem. Amostrar as duas na MESMA malha resolve o co-registro sem
 * inventar valores entre células.
 */
export function malhaNasZonas(zonas: ZonaGeom[], nAlvo = 2500): PontoMalha[] {
  const bb = bboxDeZonas(zonas);
  if (!bb) return [];
  const [x0, y0, x1, y1] = bb;
  const lado = Math.max(10, Math.round(Math.sqrt(nAlvo)));
  const pts: PontoMalha[] = [];
  for (let ix = 0; ix < lado; ix++) {
    const lng = x0 + ((x1 - x0) * (ix + 0.5)) / lado;
    for (let iy = 0; iy < lado; iy++) {
      const lat = y0 + ((y1 - y0) * (iy + 0.5)) / lado;
      for (const z of zonas) {
        if (z.geometry && pontoEmGeometria(lng, lat, z.geometry)) { pts.push({ lng, lat, idZona: z.idZona }); break; }
      }
    }
  }
  return pts;
}
