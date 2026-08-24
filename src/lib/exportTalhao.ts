'use client';

// LIMITE DO TALHÃO em KML e Shapefile — o contorno cadastrado, sem grade, sem
// zonas, sem mapa. É o arquivo que o produtor pede para levar ao piloto, ao
// agrimensor ou ao próprio monitor: "me manda o talhão".
//
// A geometria é a MESMA que o resto do app usa (talhao.geojson → extrairPoligono),
// e o empacotamento do SHP é o de exportZonas (shpFiles), para o .prj, o .cpg e o
// tratamento de multiparte não terem duas versões que divergem com o tempo.

import { shpFiles, baixarBlob } from './exportZonas.ts';
import { extrairPoligono } from './fertilidade.ts';
import { nomeExport } from './nomeExport.ts';

export interface TalhaoParaExport {
  nome: string;
  geojson?: string | null;
  areaHa?: number;
}

export interface ContextoTalhaoExport {
  fazenda: string;
  siglaFazenda?: string | null;
  produtor?: string;
  municipio?: string;
  estado?: string;
}

export function poligonoDoTalhao(t: TalhaoParaExport): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  if (!t.geojson) return null;
  try { return extrairPoligono(JSON.parse(t.geojson)); } catch { return null; }
}

/** Uma feature, com os atributos que valem no DBF (o QGIS mostra na tabela). */
export function fcDoTalhao(t: TalhaoParaExport, ctx: ContextoTalhaoExport): GeoJSON.FeatureCollection | null {
  const geometry = poligonoDoTalhao(t);
  if (!geometry) return null;
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      // Nomes curtos: o DBF do shapefile trunca campo em 10 caracteres.
      properties: {
        talhao: t.nome,
        area_ha: t.areaHa != null ? Number(t.areaHa.toFixed(2)) : null,
        fazenda: ctx.fazenda ?? '',
        produtor: ctx.produtor ?? '',
        municipio: ctx.municipio ?? '',
        uf: ctx.estado ?? '',
      },
      geometry,
    }],
  };
}

/** SA03_LIMITE — o padrão da casa; limite não tem ano nem época (é cadastro). */
export function nomeArquivoTalhao(t: TalhaoParaExport, ctx: ContextoTalhaoExport): string {
  return nomeExport({
    fazenda: ctx.fazenda ?? '', siglaFazenda: ctx.siglaFazenda, talhao: t.nome, tipo: 'LIMITE',
  });
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const anelKML = (ring: GeoJSON.Position[]) => ring.map(c => `${c[0]},${c[1]},0`).join(' ');

function poligonoKML(g: GeoJSON.Polygon | GeoJSON.MultiPolygon): string {
  const um = (rings: GeoJSON.Position[][]) =>
    `<Polygon><outerBoundaryIs><LinearRing><coordinates>${anelKML(rings[0])}</coordinates></LinearRing></outerBoundaryIs>`
    + rings.slice(1).map(r => `<innerBoundaryIs><LinearRing><coordinates>${anelKML(r)}</coordinates></LinearRing></innerBoundaryIs>`).join('')
    + '</Polygon>';
  return g.type === 'Polygon' ? um(g.coordinates) : `<MultiGeometry>${g.coordinates.map(um).join('')}</MultiGeometry>`;
}

export function gerarKMLTalhao(t: TalhaoParaExport, ctx: ContextoTalhaoExport): string | null {
  const geom = poligonoDoTalhao(t);
  if (!geom) return null;
  const desc = [
    ctx.produtor ? `Produtor: ${ctx.produtor}` : '',
    ctx.fazenda ? `Fazenda: ${ctx.fazenda}` : '',
    t.areaHa ? `Área: ${t.areaHa.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha` : '',
    ctx.municipio ? `Município: ${ctx.municipio}${ctx.estado ? ' - ' + ctx.estado : ''}` : '',
  ].filter(Boolean).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<name>${esc(t.nome)}</name>
<Style id="talhao"><LineStyle><color>ff0ba5f5</color><width>2</width></LineStyle><PolyStyle><fill>0</fill></PolyStyle></Style>
<Placemark><name>${esc(t.nome)}</name><description>${esc(desc)}</description><styleUrl>#talhao</styleUrl>${poligonoKML(geom)}</Placemark>
</Document>
</kml>`;
}

/** Erro de negócio (talhão sem geometria) — o chamador mostra a mensagem. */
export class TalhaoSemGeometria extends Error {
  constructor(nome: string) { super(`O talhão "${nome}" não tem contorno salvo — importe o KML/SHP dele antes de exportar.`); }
}

export function baixarKMLTalhao(t: TalhaoParaExport, ctx: ContextoTalhaoExport): void {
  const kml = gerarKMLTalhao(t, ctx);
  if (!kml) throw new TalhaoSemGeometria(t.nome);
  baixarBlob(
    new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }),
    `${nomeArquivoTalhao(t, ctx)}.kml`,
  );
}

export async function baixarSHPTalhao(t: TalhaoParaExport, ctx: ContextoTalhaoExport): Promise<void> {
  const fc = fcDoTalhao(t, ctx);
  if (!fc) throw new TalhaoSemGeometria(t.nome);
  const base = nomeArquivoTalhao(t, ctx);
  const arquivos = await shpFiles(fc, 'polygon');
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const ext of ['.shp', '.shx', '.dbf', '.prj']) if (arquivos[ext]) zip.file(`${base}${ext}`, arquivos[ext]);
  // .cpg declara a codificação do DBF — sem ele o QGIS lê acento como lixo.
  zip.file(`${base}.cpg`, new TextEncoder().encode('ISO-8859-1'));
  baixarBlob(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }), `${base}.zip`);
}
