'use client';

// Exportação da grade de amostragem: KML (nativo) ou Shapefile (.zip via shp-write).
// Inclui os pontos numerados + o polígono do talhão.

import type { PontoAmostragem } from './store';

export interface ExportInput {
  talhaoNome: string;                    // ex: "FRNFI 21"
  poligono: GeoJSON.FeatureCollection;   // geometria do talhão
  pontos: PontoAmostragem[];
}

const PRJ_WGS84 =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]]';

// id legível do ponto (ex "FRNFI 21 - 001")
function idPonto(talhaoNome: string, numero: number) {
  return `${talhaoNome} - ${String(numero).padStart(3, '0')}`;
}

// ── GeoJSON combinado (polígono + pontos) — usado no Shapefile ────────────────
function geojsonGrade(input: ExportInput): GeoJSON.FeatureCollection {
  const polys: GeoJSON.Feature[] = input.poligono.features
    .filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
    .map(f => ({ type: 'Feature', properties: { nome: input.talhaoNome, tipo: 'talhao' }, geometry: f.geometry }));
  const pts: GeoJSON.Feature[] = input.pontos.map(p => ({
    type: 'Feature',
    properties: { numero: p.ordem + 1, id: idPonto(input.talhaoNome, p.ordem + 1), profs: p.profs },
    geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
  }));
  return { type: 'FeatureCollection', features: [...polys, ...pts] };
}

// ── KML ───────────────────────────────────────────────────────────────────────
function coordsKML(ring: GeoJSON.Position[]): string {
  return ring.map(c => `${c[0]},${c[1]},0`).join(' ');
}

function poligonoKML(geom: GeoJSON.Geometry): string {
  const umPoligono = (rings: GeoJSON.Position[][]) => {
    const outer = `<outerBoundaryIs><LinearRing><coordinates>${coordsKML(rings[0])}</coordinates></LinearRing></outerBoundaryIs>`;
    const holes = rings.slice(1).map(r => `<innerBoundaryIs><LinearRing><coordinates>${coordsKML(r)}</coordinates></LinearRing></innerBoundaryIs>`).join('');
    return `<Polygon>${outer}${holes}</Polygon>`;
  };
  if (geom.type === 'Polygon') return umPoligono(geom.coordinates);
  if (geom.type === 'MultiPolygon') return `<MultiGeometry>${geom.coordinates.map(umPoligono).join('')}</MultiGeometry>`;
  return '';
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function gerarKML(input: ExportInput): string {
  const polys = input.poligono.features
    .filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
    .map(f => `<Placemark><name>${esc(input.talhaoNome)}</name><styleUrl>#talhao</styleUrl>${poligonoKML(f.geometry!)}</Placemark>`)
    .join('\n');

  const pontos = input.pontos.map(p =>
    `<Placemark><name>${p.ordem + 1}</name><styleUrl>#ponto</styleUrl>` +
    `<ExtendedData><Data name="id"><value>${esc(idPonto(input.talhaoNome, p.ordem + 1))}</value></Data>` +
    `<Data name="profundidades"><value>${p.profs}</value></Data></ExtendedData>` +
    `<Point><coordinates>${p.lng},${p.lat},0</coordinates></Point></Placemark>`
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<name>${esc(input.talhaoNome)} — Amostragem</name>
<Style id="talhao"><LineStyle><color>ff0ba5f5</color><width>2</width></LineStyle><PolyStyle><fill>0</fill></PolyStyle></Style>
<Style id="ponto"><IconStyle><scale>0.9</scale><Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon></IconStyle></Style>
${polys}
<Folder><name>Pontos de amostragem</name>
${pontos}
</Folder>
</Document>
</kml>`;
}

// ── Download helpers ──────────────────────────────────────────────────────────
function baixarBlob(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const nomeBase = (input: ExportInput, grade: string) =>
  `${input.talhaoNome}_${grade}`.replace(/[^\w\-]+/g, '_');

export function exportarKML(input: ExportInput, grade: string) {
  const kml = gerarKML(input);
  baixarBlob(new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }), `${nomeBase(input, grade)}.kml`);
}

export async function exportarSHP(input: ExportInput, grade: string) {
  const shpwrite = await import('@mapbox/shp-write');
  const geojson = geojsonGrade(input);
  const blob = await shpwrite.zip<'blob'>(geojson, {
    outputType: 'blob',
    compression: 'DEFLATE',
    prj: PRJ_WGS84,
    types: { point: 'pontos_amostragem', polygon: 'talhao' },
  });
  baixarBlob(blob, `${nomeBase(input, grade)}_shp.zip`);
}
