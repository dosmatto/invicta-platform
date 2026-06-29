// Fusão MANUAL de zonas (MEAP) — dissolve as divisas entre as zonas escolhidas
// pelo usuário num único polígono. Diferente da "área mínima" (fusão automática
// por tamanho), aqui o usuário seleciona 2+ zonas e funde na hora.

import { union } from '@turf/union';
import { featureCollection } from '@turf/helpers';
import turfArea from '@turf/area';

type Poligonal = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;

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

// Une as geometrias das features (dissolve divisas adjacentes) e devolve a
// geometria resultante + a área em hectares recalculada.
export function unirFeatures(feats: GeoJSON.Feature[]): { geometry: GeoJSON.Geometry; areaHa: number } {
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

  const areaHa = Math.round((turfArea({ type: 'Feature', geometry, properties: {} }) / 10000) * 100) / 100;
  return { geometry, areaHa };
}
