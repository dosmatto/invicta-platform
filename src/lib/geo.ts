import { kml } from '@tmcw/togeojson';

export interface GeoUploadResult {
  geojson: GeoJSON.FeatureCollection;
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  featureCount: number;
  center: [number, number];
  areaHa?: number;
}

/**
 * Lê um arquivo KML e converte para GeoJSON.
 * Suporta UTF-8 e UTF-16.
 */
async function readFileAsText(file: File, encoding = 'UTF-8'): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file, encoding);
  });
}

/**
 * Parse KML → GeoJSON com suporte a UTF-16.
 */
export async function parseKML(file: File): Promise<GeoUploadResult> {
  let text = await readFileAsText(file, 'UTF-8');

  // Detecta UTF-16 (texto com espaços entre cada char)
  if (text.charCodeAt(0) === 0xFEFF || !text.trim().startsWith('<')) {
    text = await readFileAsText(file, 'UTF-16LE');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');
  const geojson = kml(doc) as GeoJSON.FeatureCollection;

  return computeResult(geojson);
}

/**
 * Parse GeoJSON direto.
 */
export async function parseGeoJSON(file: File): Promise<GeoUploadResult> {
  const text = await readFileAsText(file);
  const geojson = JSON.parse(text) as GeoJSON.FeatureCollection;
  return computeResult(geojson);
}

/**
 * Detecta o tipo de arquivo e faz parse.
 */
export async function parseGeoFile(file: File): Promise<GeoUploadResult> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'kml' || ext === 'kmz') return parseKML(file);
  if (ext === 'geojson' || ext === 'json') return parseGeoJSON(file);
  throw new Error(`Formato não suportado: .${ext}. Use KML ou GeoJSON.`);
}

/**
 * Calcula bbox, centro e área aproximada do FeatureCollection.
 */
function computeResult(geojson: GeoJSON.FeatureCollection): GeoUploadResult {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;

  const coords = collectCoords(geojson);
  coords.forEach(([lng, lat]) => {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  });

  const center: [number, number] = [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
  const bbox: [number, number, number, number] = [minLng, minLat, maxLng, maxLat];

  // Área aproximada em ha (projeção equiretangular simples)
  const dLng = Math.abs(maxLng - minLng);
  const dLat = Math.abs(maxLat - minLat);
  const avgLat = (minLat + maxLat) / 2;
  const widthM = dLng * 111320 * Math.cos((avgLat * Math.PI) / 180);
  const heightM = dLat * 110574;
  const areaHa = Math.round((widthM * heightM) / 10000);

  return {
    geojson,
    bbox,
    featureCount: geojson.features.length,
    center,
    areaHa,
  };
}

function collectCoords(geojson: GeoJSON.FeatureCollection): [number, number][] {
  const coords: [number, number][] = [];

  function extract(geom: GeoJSON.Geometry | null) {
    if (!geom) return;
    switch (geom.type) {
      case 'Point': coords.push(geom.coordinates as [number, number]); break;
      case 'MultiPoint':
      case 'LineString': geom.coordinates.forEach(c => coords.push(c as [number, number])); break;
      case 'MultiLineString':
      case 'Polygon': geom.coordinates.forEach(ring => ring.forEach(c => coords.push(c as [number, number]))); break;
      case 'MultiPolygon': geom.coordinates.forEach(poly => poly.forEach(ring => ring.forEach(c => coords.push(c as [number, number])))); break;
      case 'GeometryCollection': geom.geometries.forEach(extract); break;
    }
  }

  geojson.features.forEach(f => extract(f.geometry));
  return coords;
}
