'use client';

// Repositório de Medições (painel web): converte uma medição de campo em
// geometria/arquivos e a materializa como talhão. Usado pelo MedicoesPanel.
//   • baixar SHP (.zip .shp/.shx/.dbf/.prj) — mesmo @mapbox/shp-write das grades;
//   • baixar KML e GeoJSON;
//   • criar NOVO talhão a partir do polígono;
//   • SUBSTITUIR o limite de um talhão existente.

import turfArea from '@turf/area';
import { MedicaoCampo, distanciaM } from './coleta';
import { saveTalhao, updateTalhao, Talhao } from './store';

const PRJ_WGS84 =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]]';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const slug = (s: string) => semAcento(s || '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'medicao';

export function ehPoligono(m: MedicaoCampo) { return m.tipo === 'poligono' && m.coords.length >= 3; }

// bbox [minLng, minLat, maxLng, maxLat]
export function bboxMedicao(m: MedicaoCampo): [number, number, number, number] {
  let [a, b, c, d] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lng, lat] of m.coords) {
    a = Math.min(a, lng); b = Math.min(b, lat); c = Math.max(c, lng); d = Math.max(d, lat);
  }
  return [a, b, c, d];
}

export function perimetroM(coords: [number, number][], fechar: boolean): number {
  let s = 0;
  for (let i = 1; i < coords.length; i++) s += distanciaM(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
  if (fechar && coords.length >= 3) s += distanciaM(coords[coords.length - 1][0], coords[coords.length - 1][1], coords[0][0], coords[0][1]);
  return s;
}

// anéis do polígono (externo + furos), já fechados
function aneisFechados(m: MedicaoCampo): GeoJSON.Position[][] {
  return [
    [...m.coords, m.coords[0]],
    ...(m.furos ?? []).filter(f => f.length >= 3).map(f => [...f, f[0]]),
  ];
}

export function areaHaMedicao(m: MedicaoCampo): number | null {
  if (!ehPoligono(m)) return null;
  const fc: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: aneisFechados(m) } }],
  };
  return Math.round((turfArea(fc) / 10000) * 100) / 100;
}

// FeatureCollection da medição (polígono fechado ou linha), com propriedades.
export function medicaoParaFC(m: MedicaoCampo): GeoJSON.FeatureCollection {
  const props: GeoJSON.GeoJsonProperties = {
    nome: m.nome, categoria: m.categoria ?? '', obs: m.obs ?? '',
    talhao: m.talhaoNome ?? '', ciclo: m.safra ?? '', operador: m.operador ?? '',
  };
  if (ehPoligono(m)) {
    props.area_ha = areaHaMedicao(m);
    props.perim_m = Math.round(perimetroM(m.coords, true));
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: aneisFechados(m) } }] };
  }
  if (m.tipo === 'ponto') {
    props.pontos = m.coords.length;
    return { type: 'FeatureCollection', features: m.coords.map(c => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: c } })) };
  }
  props.dist_m = Math.round(perimetroM(m.coords, false));
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: m.coords } }] };
}

// ── Downloads ─────────────────────────────────────────────────────────────
function baixarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function baixarShp(m: MedicaoCampo): Promise<void> {
  const fc = medicaoParaFC(m);
  const base = slug(m.nome);
  const shpwrite = await import('@mapbox/shp-write');
  const types = ehPoligono(m) ? { polygon: base } : { polyline: base, line: base };
  const blob = await shpwrite.zip<'blob'>(fc, { outputType: 'blob', compression: 'DEFLATE', prj: PRJ_WGS84, types });
  baixarBlob(blob, `${base}.zip`);
}

export function baixarGeoJSON(m: MedicaoCampo): void {
  const blob = new Blob([JSON.stringify(medicaoParaFC(m), null, 2)], { type: 'application/geo+json' });
  baixarBlob(blob, `${slug(m.nome)}.geojson`);
}

export function baixarKML(m: MedicaoCampo): void {
  const coordsStr = (cs: [number, number][]) => cs.map(([lng, lat]) => `${lng},${lat},0`).join(' ');
  const furosKml = (m.furos ?? []).filter(f => f.length >= 3)
    .map(f => `<innerBoundaryIs><LinearRing><coordinates>${coordsStr([...f, f[0]])}</coordinates></LinearRing></innerBoundaryIs>`).join('');
  const geo = ehPoligono(m)
    ? `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordsStr([...m.coords, m.coords[0]])}</coordinates></LinearRing></outerBoundaryIs>${furosKml}</Polygon>`
    : `<LineString><coordinates>${coordsStr(m.coords)}</coordinates></LineString>`;
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
<Placemark><name>${(m.nome || 'medição').replace(/[<&]/g, '')}</name>${geo}</Placemark>
</Document></kml>`;
  baixarBlob(new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }), `${slug(m.nome)}.kml`);
}

// ── Materializar como talhão ────────────────────────────────────────────────
export function criarTalhaoDaMedicao(m: MedicaoCampo, fazendaId: string, nome: string): Talhao {
  const fc = medicaoParaFC(m);
  const areaHa = areaHaMedicao(m) ?? 0;
  return saveTalhao({
    fazendaId, nome: nome.trim(), areaHa, areaHaSemHoles: areaHa,
    status: 'ativo', geojson: JSON.stringify(fc), bbox: bboxMedicao(m),
  });
}

export function substituirLimiteTalhao(m: MedicaoCampo, talhaoId: string): void {
  const fc = medicaoParaFC(m);
  const areaHa = areaHaMedicao(m) ?? 0;
  updateTalhao(talhaoId, {
    geojson: JSON.stringify(fc), bbox: bboxMedicao(m),
    areaHa, areaHaSemHoles: areaHa, status: 'ativo',
  });
}
