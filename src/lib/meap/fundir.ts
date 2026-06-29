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

// Remove buracos (anéis internos) e partes (polígonos) menores que minM2 — os
// "resquícios" que poluem o talhão. Buracos/partes ≥ minM2 são preservados (zonas
// reais encravadas). Se TUDO ficar abaixo do limite, devolve a geometria original
// (segurança: não zera a zona).
export function limparGeometria(geom: GeoJSON.Geometry, minM2: number): GeoJSON.Geometry {
  if (minM2 <= 0 || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) return geom;
  const polys: GeoJSON.Position[][][] = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const out: GeoJSON.Position[][][] = [];
  for (const rings of polys) {
    if (!rings.length) continue;
    if (areaM2(rings[0]) < minM2) continue;                          // descarta parte-sliver
    const buracos = rings.slice(1).filter(h => areaM2(h) >= minM2);  // preenche buracos pequenos
    out.push([rings[0], ...buracos]);
  }
  if (out.length === 0) return geom;
  return out.length === 1 ? { type: 'Polygon', coordinates: out[0] } : { type: 'MultiPolygon', coordinates: out };
}

// Limpa + recalcula a área (ha). Usada por zona ao gerar.
export function limparZona(geom: GeoJSON.Geometry, minM2: number): { geometry: GeoJSON.Geometry; areaHa: number } {
  const g = limparGeometria(geom, minM2);
  return { geometry: g, areaHa: areaHaDe(g) };
}

// Une as geometrias das features (dissolve divisas adjacentes), LIMPA resquícios
// e devolve a geometria + a área em hectares recalculada.
export function unirFeatures(feats: GeoJSON.Feature[], minM2 = 0): { geometry: GeoJSON.Geometry; areaHa: number } {
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

  geometry = limparGeometria(geometry, minM2);
  return { geometry, areaHa: areaHaDe(geometry) };
}
