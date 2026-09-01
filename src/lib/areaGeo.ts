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

// ── ÁREA DE CADA PARTE SEPARADA (talhão multipolígono) ──────────────────────
//
// Um talhão pode ser um multipolígono: duas ou mais áreas separadas que são o
// mesmo talhão (ver lib/partesTalhao.ts). O cadastro guarda só a SOMA, e quem
// olha a lista não tem como saber quanto vale cada pedaço.
//
// Duas decisões que evitam número que não fecha na tela:
// 1) UM ÚNICO fator geodésico para todas as partes — o da latitude do talhão
//    inteiro. Se cada parte usasse o seu, a soma delas não bateria com a área
//    total já gravada no cadastro (que foi medida do polígono inteiro).
// 2) O arredondamento é COMPENSADO (maior resto): arredondar cada parte a 2
//    casas de forma independente faz 100,125 + 13,215 virar 100,13 + 13,22 =
//    113,35 ao lado de um total de 113,34. A conta certa, discordando do total
//    por um centavo de hectare, passa por erro.

/** Arredonda a 2 casas de modo que a soma das partes seja a soma arredondada. */
function arredondarFechando(vals: number[]): number[] {
  const alvo = Math.round(vals.reduce((s, v) => s + v, 0) * 100);   // total em centésimos
  const base = vals.map(v => Math.floor(v * 100));
  let resto = alvo - base.reduce((s, v) => s + v, 0);
  const ordem = vals.map((v, i) => ({ i, frac: v * 100 - base[i] })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; resto > 0 && k < ordem.length; k++, resto--) base[ordem[k].i]++;
  for (let k = ordem.length - 1; resto < 0 && k >= 0; k--, resto++) base[ordem[k].i]--;
  return base.map(v => v / 100);
}

export interface ParteArea {
  indice: number;    // ordem da parte NA GEOMETRIA (0-based) — o rótulo da tela é outro
  areaHa: number;    // geodésica, furos descontados
  pct: number;       // fatia do talhão, em % (0–100)
}

/**
 * As partes separadas do polígono, com a área de cada uma, ORDENADAS DA MAIOR
 * PARA A MENOR. A ordem da geometria vem do shapefile e é arbitrária — mostrar
 * "Área 1" para o pedaço menor só porque ele veio primeiro no arquivo confunde.
 * `indice` preserva a posição original para quem precisar casar com a geometria.
 * Polygon (área única) devolve uma parte só.
 */
export function partesComArea(p: GeoJSON.Polygon | GeoJSON.MultiPolygon): ParteArea[] {
  const partes = p.type === 'Polygon' ? [p.coordinates] : p.coordinates;
  const f = fatorGeodesico(latCentro(p));
  const ha = arredondarFechando(
    partes.map(coordinates => (turfArea({ type: 'Polygon', coordinates }) * f) / 10000),
  );
  const total = ha.reduce((s, v) => s + v, 0);
  return ha
    .map((areaHa, indice) => ({ indice, areaHa, pct: total > 0 ? (areaHa / total) * 100 : 0 }))
    .sort((a, b) => b.areaHa - a.areaHa);
}

/**
 * FATIA a área do polígono entre as partes — a regra do app desde 01/09/2026:
 * a área que vale é a do POLÍGONO do talhão, e o que é fatiado por zonas de
 * manejo tem de SOMAR essa área de volta.
 *
 * Por que não usar direto a área geodésica de cada zona: as zonas são desenhadas
 * sobre uma malha (raster do zoneamento, suavização, área mínima), então a soma
 * delas fica alguns hectares abaixo do limite — o caso relatado tinha 139,28 ha
 * de zonas num talhão de 142,38 ha. Os três números diferentes na tela (trilha,
 * limite e prescrição) vinham daí, e quem confere na calculadora não tem como
 * saber qual está certo.
 *
 * A PROPORÇÃO entre as zonas é preservada (é ela que o zoneamento decidiu); o
 * que muda é a régua. Sem total válido, devolve as partes como vieram — melhor
 * o número da geometria do que um número inventado.
 */
export function fatiarArea(partesHa: readonly number[], totalHa: number): number[] {
  const soma = partesHa.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
  if (!(totalHa > 0) || !(soma > 0)) return arredondarFechando(partesHa.map(v => (Number.isFinite(v) ? v : 0)));
  const k = totalHa / soma;
  return arredondarFechando(partesHa.map(v => (Number.isFinite(v) ? v : 0) * k));
}
