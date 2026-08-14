'use client';

// Fase Z1 — Fertilidade por Zona. Em vez de interpolar pontos (krigagem), cada
// zona de manejo carrega UM valor de análise (amostra composta) e o mapa do
// nutriente fica CONSTANTE por zona. Rasteriza os polígonos das zonas no MESMO
// formato `RespInterp` da interpolação (Float32, norte no topo, NaN fora) — assim
// todo o pipeline a jusante (recomendação, cenários, PDF, SHP) reusa sem mudar
// nada. 100% no front-end, sem backend.

import type { RespInterp } from '../fertilidade';

type Pt = [number, number];
const METRO_GRAU = 111320;

// Ponto dentro de um anel (ray casting).
function pip(x: number, y: number, ring: Pt[]): boolean {
  let dentro = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi)) dentro = !dentro;
  }
  return dentro;
}

// Ponto dentro de uma geometria (Polygon/MultiPolygon) respeitando buracos:
// even-odd entre os anéis de cada polígono (externo conta, buraco descarta).
// Exportada: o vínculo zona↔amostra usa isto p/ achar o ponto DENTRO da zona.
export function dentroGeom(geom: GeoJSON.Geometry, x: number, y: number): boolean {
  const polys: GeoJSON.Position[][][] =
    geom.type === 'Polygon' ? [geom.coordinates]
      : geom.type === 'MultiPolygon' ? geom.coordinates
        : [];
  for (const rings of polys) {
    let n = 0;
    for (const ring of rings) if (pip(x, y, ring as Pt[])) n++;
    if (n % 2 === 1) return true;
  }
  return false;
}

function bboxDe(geoms: GeoJSON.Geometry[]): [number, number, number, number] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const g of geoms) {
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const rings of polys) for (const ring of rings) for (const c of ring) {
      const lon = c[0], lat = c[1];
      if (lon < w) w = lon; if (lon > e) e = lon; if (lat < s) s = lat; if (lat > n) n = lat;
    }
  }
  return [w, s, e, n];
}

function float32ParaB64(arr: Float32Array): string {
  const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < u8.length; i += CHUNK) s += String.fromCharCode(...u8.subarray(i, i + CHUNK));
  return btoa(s);
}

export interface ZonaValor { id: string; geometry: GeoJSON.Geometry; valor: number; }

// Ponto do RÓTULO da zona: centroide por ÁREA da MAIOR parte, garantido dentro.
//
// A versão anterior era a média dos vértices do 1º anel — dois defeitos que
// aglomeravam os rótulos no mapa: (1) o lado da divisa com mais vértices puxa a
// média para si, então zonas vizinhas acabavam com os valores encostados na
// mesma divisa; (2) numa zona multiparte o rótulo podia cair na parte pequena.
// Agora: maior parte + centroide de área (fórmula do polígono); se a forma é
// côncava e o centroide cai FORA, o ponto desliza para o meio do vão mais largo
// naquela latitude (ponto representativo) — nunca rotula em cima do vizinho.
export function centroideGeom(geom: GeoJSON.Geometry): [number, number] | null {
  const polys = geom.type === 'Polygon' ? [geom.coordinates]
    : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  if (polys.length === 0) return null;
  const areaAnel = (r: GeoJSON.Position[]): number => {
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
    return Math.abs(a) / 2;
  };
  let rings: GeoJSON.Position[][] | null = null, maior = -1;
  for (const rs of polys) {
    const a = rs[0]?.length ? areaAnel(rs[0]) : 0;
    if (a > maior) { maior = a; rings = rs; }
  }
  const ring = rings?.[0];
  if (!ring || ring.length === 0) return null;
  // centroide por ÁREA (não por vértice): imune à densidade de pontos da borda
  let cx = 0, cy = 0, a2 = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const w = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a2 += w; cx += (ring[j][0] + ring[i][0]) * w; cy += (ring[j][1] + ring[i][1]) * w;
  }
  if (Math.abs(a2) < 1e-18) {
    let sx = 0, sy = 0;
    for (const c of ring) { sx += c[0]; sy += c[1]; }
    return [sx / ring.length, sy / ring.length];   // anel degenerado: média
  }
  let px = cx / (3 * a2);
  const py = cy / (3 * a2);
  // côncavo (ou furo): centroide fora → meio do vão mais largo nesta latitude
  if (!dentroGeom({ type: 'Polygon', coordinates: rings! }, px, py)) {
    const xs: number[] = [];
    for (const r of rings!) {
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [x1, y1] = r[j], [x2, y2] = r[i];
        if ((y1 > py) !== (y2 > py)) xs.push(x1 + ((py - y1) * (x2 - x1)) / ((y2 - y1) || 1e-12));
      }
    }
    xs.sort((a, b) => a - b);
    let larg = -1;
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const w = xs[i + 1] - xs[i];
      if (w > larg) { larg = w; px = (xs[i] + xs[i + 1]) / 2; }
    }
  }
  return [px, py];
}

// Rasteriza zonas (cada uma com 1 valor) num grid Float32 (norte no topo, igual
// ao backend de interpolação). Cada pixel recebe o valor da zona que contém seu
// centro; NaN se nenhuma zona o contém. pixelM define a resolução (default 20 m,
// p/ casar com a grade 20×20 do Shapefile de taxa variável).
export function rasterizarZonas(zonas: ZonaValor[], pixelM = 20): RespInterp {
  const [w, s, e, n] = bboxDe(zonas.map(z => z.geometry));
  const latC = (s + n) / 2;
  const dLat = pixelM / METRO_GRAU;
  const dLon = pixelM / (METRO_GRAU * Math.cos(latC * Math.PI / 180) || 1);
  const cols = Math.max(1, Math.ceil((e - w) / dLon));
  const rows = Math.max(1, Math.ceil((n - s) / dLat));
  const arr = new Float32Array(rows * cols);
  let mn = Infinity, mx = -Infinity, soma = 0, cnt = 0;
  for (let r = 0; r < rows; r++) {
    const lat = n - (r + 0.5) * dLat;
    for (let c = 0; c < cols; c++) {
      const lon = w + (c + 0.5) * dLon;
      let v = NaN;
      for (const z of zonas) { if (dentroGeom(z.geometry, lon, lat)) { v = z.valor; break; } }
      arr[r * cols + c] = v;
      if (isFinite(v)) { cnt++; soma += v; if (v < mn) mn = v; if (v > mx) mx = v; }
    }
  }
  // bounds = extensão EXATA da grade (cols/rows arredondam p/ cima sobre a bbox).
  const bounds: [number, number, number, number] = [w, n - rows * dLat, w + cols * dLon, n];
  return {
    bounds,
    png: '',
    stats: {
      n: cnt, modelo: 'zona', min: cnt ? mn : null, max: cnt ? mx : null,
      nx: cols, ny: rows, pixel_m: pixelM, rmse: null, variograma: null,
    },
    grid: { b64: float32ParaB64(arr), shape: [rows, cols] },
  };
}
