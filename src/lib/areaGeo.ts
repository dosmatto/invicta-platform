// Area GEODESICA (elipsoide WGS84) — casa com o QGIS.
//
// O @turf/area calcula a area numa ESFERA de raio medio (6.371.008,8 m), o que
// SUPERESTIMA a area real do elipsoide em ~0,2% no Sul do Brasil (~23S). O QGIS
// mede a area geodesica do elipsoide (a "de verdade"). Aqui aplicamos, sobre o
// resultado do turf, o fator M*N/R^2 na latitude do poligono (M,N = raios de
// curvatura meridional e da vertical primaria do WGS84; R = raio do turf). Para
// poligonos do tamanho de um talhao o fator e praticamente constante no interior,
// entao o resultado casa com o QGIS ate ~5 casas.

import turfArea from '@turf/area';

type GeoInput = GeoJSON.Feature | GeoJSON.FeatureCollection | GeoJSON.Geometry;

const A = 6378137;                    // semieixo maior WGS84 (m)
const E2 = 0.0066943799901413165;     // 1a excentricidade ao quadrado (WGS84)
const RMEAN = 6371008.8;              // raio da esfera usada pelo @turf/area

// Area geodesica / area esferica-do-turf, na latitude (graus).
export function fatorGeodesico(latDeg: number): number {
  const s = Math.sin((latDeg * Math.PI) / 180);
  const d = 1 - E2 * s * s;
  return (A * A * (1 - E2)) / (d * d * RMEAN * RMEAN);
}

// Latitude do centro (bbox) das coordenadas. O fator varia devagar, entao o
// centro do poligono basta.
function latCentro(geojson: GeoInput): number {
  let min = Infinity, max = -Infinity;
  const scan = (c: unknown): void => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === 'number') {
      const y = c[1] as number;
      if (y < min) min = y;
      if (y > max) max = y;
      return;
    }
    for (const x of c) scan(x);
  };
  const walk = (g: GeoInput | GeoJSON.Geometry | null | undefined): void => {
    if (!g) return;
    if (g.type === 'FeatureCollection') g.features.forEach(f => walk(f.geometry));
    else if (g.type === 'Feature') walk(g.geometry);
    else if (g.type === 'GeometryCollection') g.geometries.forEach(gg => walk(gg));
    else scan((g as { coordinates?: unknown }).coordinates);
  };
  walk(geojson);
  return Number.isFinite(min) ? (min + max) / 2 : 0;
}

// Area geodesica em m^2 de qualquer GeoJSON (turf ja desconta furos).
export function areaM2Geo(geojson: GeoInput): number {
  return turfArea(geojson) * fatorGeodesico(latCentro(geojson));
}

// Area geodesica em hectares, arredondada a 2 casas.
export function areaHaGeo(geojson: GeoInput): number {
  return Math.round((areaM2Geo(geojson) / 10000) * 100) / 100;
}

// Area geodesica so dos aneis EXTERNOS (ignora furos), em hectares. Espelha o
// computeOuterArea do geo.ts, mas geodesico — usado para a area bruta.
export function areaHaGeoBruta(geojson: GeoInput): number {
  const f = fatorGeodesico(latCentro(geojson));
  let m2 = 0;
  const addPoly = (coords: GeoJSON.Position[][]) => {
    if (coords[0]) m2 += turfArea({ type: 'Polygon', coordinates: [coords[0]] });
  };
  const walk = (g: GeoInput | GeoJSON.Geometry | null | undefined): void => {
    if (!g) return;
    if (g.type === 'FeatureCollection') g.features.forEach(ft => walk(ft.geometry));
    else if (g.type === 'Feature') walk(g.geometry);
    else if (g.type === 'GeometryCollection') g.geometries.forEach(gg => walk(gg));
    else if (g.type === 'Polygon') addPoly(g.coordinates);
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => addPoly(p));
  };
  walk(geojson);
  return Math.round((m2 * f / 10000) * 100) / 100;
}
