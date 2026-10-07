// Fusão MANUAL de zonas (MEAP) + limpeza de geometria. Dissolve as divisas entre
// as zonas escolhidas E remove "resquícios" (buracos e ilhas/slivers menores que a
// área mínima) que sobram da vetorização do raster ou da própria fusão.

import { union } from '@turf/union';
import { featureCollection } from '@turf/helpers';
import turfArea from '@turf/area';

type Poligonal = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;

const areaM2 = (ring: GeoJSON.Position[]) => turfArea({ type: 'Polygon', coordinates: [ring] });
const areaHaDe = (geom: GeoJSON.Geometry) =>
  Math.round((turfArea({ type: 'Feature', geometry: geom, properties: {} }) / 10000) * 100) / 100;

// Combina coordenadas sem dissolver (fallback quando o union falha ou as zonas
// são disjuntas) — vira um MultiPolygon.
function combinar(polys: Poligonal[]): GeoJSON.MultiPolygon {
  const coords: GeoJSON.Position[][][] = [];
  for (const p of polys) {
    if (p.geometry.type === 'Polygon') coords.push(p.geometry.coordinates);
    else coords.push(...p.geometry.coordinates);
  }
  return { type: 'MultiPolygon', coordinates: coords };
}

// Parte menor que isto é anel degenerado (resíduo numérico do union), não área
// de verdade. É o ÚNICO critério para descartar uma parte.
export const PARTE_DEGENERADA_M2 = 1;

// Ponto-no-anel (ray casting). Borda conta como "tanto faz" — quem chama usa
// um ponto garantidamente no MEIO do furo, nunca na borda.
function dentroDoAnel(pt: GeoJSON.Position, ring: GeoJSON.Position[]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// Um ponto ESTRITAMENTE dentro do anel: corta o anel por uma horizontal na
// altura média e pega o meio do primeiro trecho interno. O centroide não serve
// — furo em faixa ou em "C" (estrada, grota) tem o centroide fora dele.
function pontoInterno(ring: GeoJSON.Position[]): GeoJSON.Position | null {
  let y0 = Infinity, y1 = -Infinity;
  for (const [, y] of ring) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
  for (const f of [0.5, 0.37, 0.63, 0.21, 0.79]) {          // desvia de vértice na linha
    const y = y0 + (y1 - y0) * f;
    const xs: number[] = [];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y)) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    if (xs.length >= 2 && xs[1] - xs[0] > 0) return [(xs[0] + xs[1]) / 2, y];
  }
  return null;
}

function dentroDoTalhao(pt: GeoJSON.Position, talhao: GeoJSON.Polygon | GeoJSON.MultiPolygon): boolean {
  const polys = talhao.type === 'Polygon' ? [talhao.coordinates] : talhao.coordinates;
  return polys.some(rings => rings.length > 0 && dentroDoAnel(pt, rings[0]) && !rings.slice(1).some(h => dentroDoAnel(pt, h)));
}

// Furo de zona que cai FORA do talhão é DESCONTO (mata, açude, sede, estrada
// cadastrados como furo do talhão), não resquício: nunca se preenche, seja qual
// for o tamanho. Sem isso, o desconto inteiro numa zona só (anel interno dela)
// e menor que a área mínima virava área da zona — e só sobreviviam os que
// caíam na divisa entre duas zonas.
function ehDesconto(furo: GeoJSON.Position[], talhao?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null): boolean {
  if (!talhao) return false;
  const p = pontoInterno(furo);
  return !!p && !dentroDoTalhao(p, talhao);
}

// Preenche buracos (anéis internos) menores que minM2 — os "resquícios" da
// vetorização/fusão. Buracos ≥ minM2 são preservados (zonas reais encravadas),
// e os que são DESCONTO do talhão (`talhao` informado) ficam sempre.
// PARTES (polígonos) NUNCA são descartadas por área mínima: as zonas são uma
// partição do talhão, e jogar fora uma parte abre um vazio no talhão — um
// talhão com duas glebas perdia a gleba pequena inteira (pendência 57). Parte
// pequena se resolve fundindo com a vizinha, nunca apagando. Só sai anel
// degenerado (< PARTE_DEGENERADA_M2). Se tudo sair, devolve a original.
export function limparGeometria(
  geom: GeoJSON.Geometry, minM2: number,
  talhao?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null,
): GeoJSON.Geometry {
  if (minM2 <= 0 || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) return geom;
  const polys: GeoJSON.Position[][][] = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const out: GeoJSON.Position[][][] = [];
  for (const rings of polys) {
    if (!rings.length) continue;
    if (areaM2(rings[0]) < PARTE_DEGENERADA_M2) continue;            // só anel degenerado
    const buracos = rings.slice(1).filter(h => areaM2(h) >= minM2 || ehDesconto(h, talhao));
    out.push([rings[0], ...buracos]);
  }
  if (out.length === 0) return geom;
  return out.length === 1 ? { type: 'Polygon', coordinates: out[0] } : { type: 'MultiPolygon', coordinates: out };
}

// Limpa + recalcula a área (ha). Usada por zona ao gerar.
export function limparZona(
  geom: GeoJSON.Geometry, minM2: number,
  talhao?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null,
): { geometry: GeoJSON.Geometry; areaHa: number } {
  const g = limparGeometria(geom, minM2, talhao);
  return { geometry: g, areaHa: areaHaDe(g) };
}

// Une as geometrias das features (dissolve divisas adjacentes), LIMPA resquícios
// e devolve a geometria + a área em hectares recalculada.
export function unirFeatures(
  feats: GeoJSON.Feature[], minM2 = 0,
  talhao?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null,
): { geometry: GeoJSON.Geometry; areaHa: number } {
  const polys = feats.filter(
    f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'),
  ) as Poligonal[];

  let geometry: GeoJSON.Geometry;
  try {
    const u = polys.length >= 2 ? union(featureCollection(polys)) : polys[0];
    geometry = u?.geometry ?? combinar(polys);
  } catch {
    geometry = combinar(polys);
  }

  geometry = limparGeometria(geometry, minM2, talhao);
  return { geometry, areaHa: areaHaDe(geometry) };
}
