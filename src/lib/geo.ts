import { kml } from '@tmcw/togeojson';
import turfArea from '@turf/area';

export interface GeoUploadResult {
  geojson: GeoJSON.FeatureCollection;
  bbox: [number, number, number, number];
  featureCount: number;
  center: [number, number];
  areaHa: number;         // área total com holes descontados
  areaHaBruta: number;    // área somente dos outer rings (sem descontar holes)
  temHoles: boolean;
}

// ── Leitura de arquivo ────────────────────────────────────────────────────

async function readAsText(file: File, encoding = 'UTF-8'): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsText(file, encoding);
  });
}

async function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = reject;
    r.readAsArrayBuffer(file);
  });
}

// ── KML ───────────────────────────────────────────────────────────────────

export async function parseKML(file: File): Promise<GeoUploadResult> {
  let text = await readAsText(file, 'UTF-8');
  if (!text.trim().startsWith('<')) {
    text = await readAsText(file, 'UTF-16LE');
  }
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  const geojson = kml(doc) as GeoJSON.FeatureCollection;
  return computeResult(geojson);
}

// ── GeoJSON ───────────────────────────────────────────────────────────────

export async function parseGeoJSON(file: File): Promise<GeoUploadResult> {
  const text = await readAsText(file);
  const geojson = JSON.parse(text) as GeoJSON.FeatureCollection;
  return computeResult(geojson);
}

// ── Shapefile (.zip) ──────────────────────────────────────────────────────

export async function parseShapefile(file: File): Promise<GeoUploadResult> {
  // shpjs é carregado dinamicamente para não quebrar SSR
  const shpjs = await import('shpjs');
  const buffer = await readAsArrayBuffer(file);
  // shpjs pode retornar FeatureCollection ou array delas
  const result = await shpjs.default(buffer);
  let geojson: GeoJSON.FeatureCollection;
  if (Array.isArray(result)) {
    // múltiplos layers no zip — une todos
    geojson = {
      type: 'FeatureCollection',
      features: result.flatMap(fc => fc.features),
    };
  } else {
    geojson = result as GeoJSON.FeatureCollection;
  }
  return computeResult(geojson);
}

// ── Dispatcher ───────────────────────────────────────────────────────────

export async function parseGeoFile(file: File): Promise<GeoUploadResult> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'kml')                    return parseKML(file);
  if (ext === 'geojson' || ext === 'json') return parseGeoJSON(file);
  if (ext === 'zip')                    return parseShapefile(file);
  throw new Error(`Formato não suportado: .${ext}. Use KML, GeoJSON ou Shapefile (.zip).`);
}

// ── Cálculo de área e bbox ────────────────────────────────────────────────

function computeResult(geojson: GeoJSON.FeatureCollection): GeoUploadResult {
  // bbox
  const coords = collectCoords(geojson);
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  coords.forEach(([lng, lat]) => {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  });

  const bbox: [number, number, number, number] = [minLng, minLat, maxLng, maxLat];
  const center: [number, number] = [(minLng + maxLng) / 2, (minLat + maxLat) / 2];

  // Área com turf (inclui desconto de holes automaticamente)
  const areaM2 = turfArea(geojson);
  const areaHa = Math.round((areaM2 / 10000) * 100) / 100;

  // Área bruta (só outer rings, sem holes)
  const areaHaBruta = computeOuterArea(geojson);
  const temHoles = areaHaBruta > areaHa + 0.01;

  return {
    geojson,
    bbox,
    featureCount: geojson.features.length,
    center,
    areaHa,
    areaHaBruta,
    temHoles,
  };
}

function computeOuterArea(geojson: GeoJSON.FeatureCollection): number {
  let total = 0;
  geojson.features.forEach(f => {
    if (!f.geometry) return;
    const geom = f.geometry;

    function addOuterRings(polygonCoords: GeoJSON.Position[][]) {
      // Só o primeiro anel (outer ring), ignora holes
      const outerOnly: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: {
          type: 'Polygon',
          coordinates: [polygonCoords[0]],
        }}],
      };
      total += turfArea(outerOnly) / 10000;
    }

    if (geom.type === 'Polygon') {
      addOuterRings(geom.coordinates);
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach(p => addOuterRings(p));
    }
  });
  return Math.round(total * 100) / 100;
}

function collectCoords(geojson: GeoJSON.FeatureCollection): [number, number][] {
  const coords: [number, number][] = [];
  function extract(geom: GeoJSON.Geometry | null) {
    if (!geom) return;
    switch (geom.type) {
      case 'Point':           coords.push(geom.coordinates as [number, number]); break;
      case 'MultiPoint':
      case 'LineString':      geom.coordinates.forEach(c => coords.push(c as [number, number])); break;
      case 'MultiLineString':
      case 'Polygon':         geom.coordinates.forEach(r => r.forEach(c => coords.push(c as [number, number]))); break;
      case 'MultiPolygon':    geom.coordinates.forEach(p => p.forEach(r => r.forEach(c => coords.push(c as [number, number])))); break;
      case 'GeometryCollection': geom.geometries.forEach(extract); break;
    }
  }
  geojson.features.forEach(f => extract(f.geometry));
  return coords;
}
