'use client';

// Exportação da aba "Zonas de Manejo" (MEAP): SHP (2 camadas), KML e dados p/ PDF.
//
// Fonte ÚNICA de verdade: um ZoneamentoMeap salvo (fc = polígonos das zonas, com
// {id, zona, classe, cor, potencialRank, areaHa}). As LINHAS INTERNAS (divisas
// entre zonas) NÃO são armazenadas — são DERIVADAS aqui, topologicamente: um
// segmento de borda compartilhado por EXATAMENTE 2 zonas é uma divisa interna;
// segmentos costurados por par de zonas viram polilinhas. O limite externo vem
// do polígono oficial do talhão. Tudo em WGS84 (lng/lat), igual ao resto do app.
//
// Usa @mapbox/shp-write (já no projeto) + JSZip p/ empacotar as 2 camadas e os
// .cpg (UTF-8). O KML é gerado à mão (como exportGrade.ts).

import area from '@turf/area';
// extensão .ts explícita: exportZonas roda no teste em node (type-stripping)
import { rotuloZona } from './meap/rotuloZona.ts';

// Cor de fallback por classe (espelho do semáforo de ./zonas.ts — inlinado para
// o módulo de export ficar autossuficiente/testável). Só é usada quando a zona
// não traz `cor` nas properties (o normal é vir a cor salva do zoneamento).
function corDaClasse(raw: string): string {
  const c = (raw || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const med = /MEDI/.test(c), alt = /ALT/.test(c), bax = /BAIX/.test(c);
  if (med && alt) return '#84cc16';
  if (med && bax) return '#f97316';
  if (alt) return '#16a34a';
  if (bax) return '#dc2626';
  if (med) return '#eab308';
  return '#94a3b8';
}

const PRJ_WGS84 =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]]';

type Pos = GeoJSON.Position;

// ── Identificação + zonas (dataset comum a SHP/KML/PDF) ─────────────────────
export interface ZonaExport {
  idZona: string;              // id da mancha (ex.: "z3")
  nomeZona: string;            // nº/rótulo oficial da zona
  classe: string;              // "Alta", "Média-baixa", ...
  cor: string;                 // hex
  areaHa: number;              // área da zona (mesma que a plataforma mostra)
  pctArea: number;             // % da área total das zonas
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
}

export interface LinhaInternaExport {
  idLinha: string;
  tipo: 'divisa';
  zonaEsq: string;
  zonaDir: string;
  geometry: GeoJSON.LineString | GeoJSON.MultiLineString;
}

// Extensão .ts explícita: este módulo roda em node puro no teste (teste:zonas).
import { nomeExport, periodoParaNome } from './nomeExport.ts';

export interface DadosExportZonas {
  idMapa: string;
  nomeMapa: string;
  produtor: string;
  fazenda: string;
  talhao: string;
  municipio: string;
  estado: string;
  ano: string;                 // rótulo do Ano/safra (ou '')
  responsavel: string;         // RT quando aplicável
  dataMapa: string;            // criadoEm (ISO)
  dataEmissao: string;         // agora (ISO)
  externo: GeoJSON.Polygon | GeoJSON.MultiPolygon | null; // limite oficial do talhão
  zonas: ZonaExport[];
  linhas: LinhaInternaExport[];
  areaTotalHa: number;         // soma das áreas das zonas
  areaTalhaoHa: number | null; // área do polígono externo (validação)
}

// ── Geometria: anéis de qualquer Polygon/MultiPolygon ───────────────────────
function aneisDe(g: GeoJSON.Geometry | null | undefined): Pos[][] {
  if (!g) return [];
  if (g.type === 'Polygon') return g.coordinates;
  if (g.type === 'MultiPolygon') return g.coordinates.flat();
  return [];
}

const R7 = (v: number) => Math.round(v * 1e7) / 1e7;             // ~1 cm
const pk = (p: Pos) => `${R7(p[0])},${R7(p[1])}`;
function segKey(a: Pos, b: Pos): string {
  const A = pk(a), B = pk(b);
  return A < B ? `${A}|${B}` : `${B}|${A}`;
}

// Costura segmentos (não direcionados) contíguos em polilinhas. Cada segmento é
// [a,b]; junta os que compartilham extremidade. Devolve arrays de posições.
function costurar(segs: Array<[Pos, Pos]>): Pos[][] {
  const adj = new Map<string, Array<{ outro: string; pos: Pos; usado: boolean }>>();
  const posDe = new Map<string, Pos>();
  const add = (a: Pos, b: Pos) => {
    const ka = pk(a), kb = pk(b);
    posDe.set(ka, a); posDe.set(kb, b);
    if (!adj.has(ka)) adj.set(ka, []);
    adj.get(ka)!.push({ outro: kb, pos: b, usado: false });
  };
  for (const [a, b] of segs) { add(a, b); add(b, a); }

  const linhas: Pos[][] = [];
  // Começa por vértices de grau ímpar (pontas); senão por qualquer não usado (anel fechado).
  const grau = (k: string) => adj.get(k)?.length ?? 0;
  const inicios = [...adj.keys()].sort((x, y) => (grau(x) % 2 ? -1 : 1) - (grau(y) % 2 ? -1 : 1));

  const marcarUsado = (ka: string, kb: string) => {
    for (const e of adj.get(ka) ?? []) if (e.outro === kb && !e.usado) { e.usado = true; break; }
    for (const e of adj.get(kb) ?? []) if (e.outro === ka && !e.usado) { e.usado = true; break; }
  };

  for (const ini of inicios) {
    let e = (adj.get(ini) ?? []).find(x => !x.usado);
    while (e) {
      const linha: Pos[] = [posDe.get(ini)!];
      let atual = ini;
      let prox: { outro: string; pos: Pos; usado: boolean } | undefined = e;
      while (prox) {
        marcarUsado(atual, prox.outro);
        linha.push(prox.pos);
        const seguinte = atual;
        atual = prox.outro;
        void seguinte;
        prox = (adj.get(atual) ?? []).find(x => !x.usado);
      }
      if (linha.length >= 2) linhas.push(linha);
      e = (adj.get(ini) ?? []).find(x => !x.usado);
    }
  }
  return linhas;
}

// Deriva as divisas internas: segmento na borda de EXATAMENTE 2 zonas.
export function derivarLinhasInternas(
  zonas: Array<{ idZona: string; geometry: GeoJSON.Geometry }>,
): LinhaInternaExport[] {
  const seg = new Map<string, { a: Pos; b: Pos; zonas: Set<string> }>();
  for (const z of zonas) {
    const vistoNaZona = new Set<string>();  // evita contar 2x o mesmo segmento na MESMA zona
    for (const anel of aneisDe(z.geometry)) {
      for (let i = 0; i + 1 < anel.length; i++) {
        const a = anel[i], b = anel[i + 1];
        if (pk(a) === pk(b)) continue;
        const k = segKey(a, b);
        if (vistoNaZona.has(k)) continue;
        vistoNaZona.add(k);
        let s = seg.get(k);
        if (!s) { s = { a, b, zonas: new Set() }; seg.set(k, s); }
        s.zonas.add(z.idZona);
      }
    }
  }
  const porPar = new Map<string, { za: string; zb: string; segs: Array<[Pos, Pos]> }>();
  for (const s of seg.values()) {
    if (s.zonas.size !== 2) continue;             // interno = compartilhado por 2 zonas
    const [za, zb] = [...s.zonas].sort();
    const key = `${za}|${zb}`;
    let g = porPar.get(key);
    if (!g) { g = { za, zb, segs: [] }; porPar.set(key, g); }
    g.segs.push([s.a, s.b]);
  }
  const out: LinhaInternaExport[] = [];
  let n = 0;
  for (const g of porPar.values()) {
    const partes = costurar(g.segs);
    if (partes.length === 0) continue;
    n++;
    const geometry: GeoJSON.LineString | GeoJSON.MultiLineString =
      partes.length === 1
        ? { type: 'LineString', coordinates: partes[0] }
        : { type: 'MultiLineString', coordinates: partes };
    out.push({ idLinha: `L${String(n).padStart(3, '0')}`, tipo: 'divisa', zonaEsq: g.za, zonaDir: g.zb, geometry });
  }
  return out;
}

// ── Montagem do dataset a partir do zoneamento + identificação ──────────────
export interface IdentEntrada {
  idMapa: string;
  nomeMapa: string;
  produtor: string;
  fazenda: string;
  talhao: string;
  municipio?: string;
  estado?: string;
  ano?: string;
  responsavel?: string;
  dataMapa: string;                         // criadoEm do zoneamento
  externo: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
}

const areaHaGeom = (g: GeoJSON.Geometry): number =>
  area({ type: 'Feature', properties: {}, geometry: g } as GeoJSON.Feature) / 10_000;

export function montarDadosZonas(fc: GeoJSON.FeatureCollection, ident: IdentEntrada): DadosExportZonas {
  const polis = fc.features.filter(
    f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'),
  );
  const zonasBrutas: ZonaExport[] = polis.map((f, i) => {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const g = f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
    const idZona = String(p.id ?? p.idZona ?? i + 1);
    const classe = String(p.classe ?? p.classeLabel ?? '');
    const areaHa = Number.isFinite(Number(p.areaHa)) ? Number(p.areaHa) : areaHaGeom(g);
    const cor = typeof p.cor === 'string' && p.cor ? p.cor : corDaClasse(classe);
    // Mesma regra do mapa (lib/meap/rotuloZona): senão o SHP/KML sai com um
    // número e a tela com outro depois de uma renumeração manual.
    const nomeZona = p.zona != null || p.id != null
      ? rotuloZona({ id: p.id as string | number | null, zona: p.zona as string | number | null })
      : String(p.rotulo ?? idZona);
    return { idZona, nomeZona, classe, cor, areaHa, pctArea: 0, geometry: g };
  });
  const areaTotalHa = zonasBrutas.reduce((s, z) => s + (z.areaHa || 0), 0);
  const zonas = zonasBrutas.map(z => ({ ...z, pctArea: areaTotalHa > 0 ? (z.areaHa / areaTotalHa) * 100 : 0 }));
  const linhas = derivarLinhasInternas(zonas.map(z => ({ idZona: z.idZona, geometry: z.geometry })));
  const areaTalhaoHa = ident.externo ? areaHaGeom(ident.externo) : null;

  return {
    idMapa: ident.idMapa,
    nomeMapa: ident.nomeMapa,
    produtor: ident.produtor,
    fazenda: ident.fazenda,
    talhao: ident.talhao,
    municipio: ident.municipio ?? '',
    estado: ident.estado ?? '',
    ano: ident.ano ?? '',
    responsavel: ident.responsavel ?? '',
    dataMapa: ident.dataMapa,
    dataEmissao: new Date().toISOString(),
    externo: ident.externo,
    zonas,
    linhas,
    areaTotalHa,
    areaTalhaoHa,
  };
}

// Valida um zoneamento ANTES de exportar: mapa pronto = tem geometria de zonas
// válida. Mapas em processamento/erro/sem geometria não passam.
export function validarParaExport(fc: GeoJSON.FeatureCollection | null | undefined): string | null {
  if (!fc || !Array.isArray(fc.features)) return 'Mapa sem dados para exportar.';
  const polis = fc.features.filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'));
  if (polis.length === 0) return 'Mapa sem geometria de zonas — nada a exportar.';
  for (const f of polis) {
    const rings = aneisDe(f.geometry);
    if (rings.length === 0 || rings.some(r => r.length < 4)) return 'Geometria de zona inválida (anel com menos de 4 vértices).';
  }
  return null;
}

// Registra a exportação (trilha leve em localStorage + console). Não há um
// subsistema de auditoria de exports; este é o registro mínimo e honesto.
export function registrarAuditoriaExport(ev: { formato: string; produtor: string; fazenda: string; talhao: string; mapa: string; usuario: string }): void {
  const linha = { ...ev, em: new Date().toISOString() };
  try {
    if (typeof localStorage !== 'undefined') {
      const K = 'inv_export_audit';
      const lista = JSON.parse(localStorage.getItem(K) || '[]') as unknown[];
      lista.push(linha);
      localStorage.setItem(K, JSON.stringify(lista.slice(-500)));
    }
  } catch { /* storage cheio/indisponível — segue */ }
  try { console.info('[export-zonas]', JSON.stringify(linha)); } catch { /* ignore */ }
}

// ── GeoJSON (base do SHP e reuso/testes) ────────────────────────────────────
export function geojsonPoligonos(d: DadosExportZonas): GeoJSON.FeatureCollection {
  const dataMapa = d.dataMapa ? d.dataMapa.slice(0, 10) : '';
  return {
    type: 'FeatureCollection',
    features: d.zonas.map(z => ({
      type: 'Feature',
      properties: {
        id_zona: z.idZona, nome_zona: z.nomeZona, id_mapa: d.idMapa,
        produtor: d.produtor, fazenda: d.fazenda, talhao: d.talhao,
        area_ha: Number(z.areaHa.toFixed(4)), classe: z.classe, data_mapa: dataMapa,
      },
      geometry: z.geometry,
    })),
  };
}

export function geojsonLinhas(d: DadosExportZonas): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: d.linhas.map(l => ({
      type: 'Feature',
      properties: { id_linha: l.idLinha, id_mapa: d.idMapa, tipo: l.tipo, zona_esq: l.zonaEsq, zona_dir: l.zonaDir },
      geometry: l.geometry,
    })),
  };
}

// ── KML ─────────────────────────────────────────────────────────────────────
function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
const coordsKML = (ring: Pos[]) => ring.map(c => `${c[0]},${c[1]},0`).join(' ');

function poligonoKML(geom: GeoJSON.Geometry): string {
  const um = (rings: Pos[][]) => {
    const outer = `<outerBoundaryIs><LinearRing><coordinates>${coordsKML(rings[0])}</coordinates></LinearRing></outerBoundaryIs>`;
    const holes = rings.slice(1).map(r => `<innerBoundaryIs><LinearRing><coordinates>${coordsKML(r)}</coordinates></LinearRing></innerBoundaryIs>`).join('');
    return `<Polygon>${outer}${holes}</Polygon>`;
  };
  if (geom.type === 'Polygon') return um(geom.coordinates);
  if (geom.type === 'MultiPolygon') return `<MultiGeometry>${geom.coordinates.map(um).join('')}</MultiGeometry>`;
  return '';
}
function linhaKML(geom: GeoJSON.Geometry): string {
  const um = (line: Pos[]) => `<LineString><tessellate>1</tessellate><coordinates>${coordsKML(line)}</coordinates></LineString>`;
  if (geom.type === 'LineString') return um(geom.coordinates);
  if (geom.type === 'MultiLineString') return `<MultiGeometry>${geom.coordinates.map(um).join('')}</MultiGeometry>`;
  return '';
}
// #rrggbb -> aabbggrr (KML: alpha + BGR)
function corKML(hex: string, alphaHex = 'ff'): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
  if (!m) return `${alphaHex}94a3b8`.replace(/(..)(..)(..)$/, '$3$2$1');
  const rr = m[1].slice(0, 2), gg = m[1].slice(2, 4), bb = m[1].slice(4, 6);
  return `${alphaHex}${bb}${gg}${rr}`.toLowerCase();
}

export function gerarKMLZonas(d: DadosExportZonas): string {
  const estilos = d.zonas.map(z =>
    `<Style id="zona_${esc(z.idZona)}"><LineStyle><color>ff333333</color><width>1.6</width></LineStyle>` +
    `<PolyStyle><color>${corKML(z.cor, '99')}</color><fill>1</fill><outline>1</outline></PolyStyle></Style>`,
  ).join('\n');

  const zonasKml = d.zonas.map(z =>
    `<Placemark><name>${esc(`Zona ${z.nomeZona}${z.classe ? ' — ' + z.classe : ''}`)}</name>` +
    `<styleUrl>#zona_${esc(z.idZona)}</styleUrl>` +
    `<ExtendedData>` +
    `<Data name="id_zona"><value>${esc(z.idZona)}</value></Data>` +
    `<Data name="classe"><value>${esc(z.classe)}</value></Data>` +
    `<Data name="area_ha"><value>${z.areaHa.toFixed(2)}</value></Data>` +
    `<Data name="pct_area"><value>${z.pctArea.toFixed(1)}</value></Data>` +
    `</ExtendedData>${poligonoKML(z.geometry)}</Placemark>`,
  ).join('\n');

  const linhasKml = d.linhas.map(l =>
    `<Placemark><name>${esc(`Divisa ${l.zonaEsq}/${l.zonaDir}`)}</name><styleUrl>#divisa</styleUrl>` +
    `<ExtendedData><Data name="id_linha"><value>${esc(l.idLinha)}</value></Data>` +
    `<Data name="zona_esq"><value>${esc(l.zonaEsq)}</value></Data>` +
    `<Data name="zona_dir"><value>${esc(l.zonaDir)}</value></Data></ExtendedData>` +
    `${linhaKML(l.geometry)}</Placemark>`,
  ).join('\n');

  const externoKml = d.externo
    ? `<Folder><name>Limite do talhão</name><Placemark><name>${esc(d.talhao)}</name><styleUrl>#externo</styleUrl>${poligonoKML(d.externo)}</Placemark></Folder>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<name>${esc(`${d.talhao} — Zonas de Manejo${d.nomeMapa ? ' (' + d.nomeMapa + ')' : ''}`)}</name>
<description>${esc(`Produtor: ${d.produtor} · Fazenda: ${d.fazenda} · Talhão: ${d.talhao}${d.ano ? ' · Ano: ' + d.ano : ''}`)}</description>
<Style id="externo"><LineStyle><color>ffffffff</color><width>2.2</width></LineStyle><PolyStyle><fill>0</fill><outline>1</outline></PolyStyle></Style>
<Style id="divisa"><LineStyle><color>ff1a1a1a</color><width>2</width></LineStyle></Style>
${estilos}
${externoKml}
<Folder><name>Zonas</name>
${zonasKml}
</Folder>
<Folder><name>Linhas internas</name>
${linhasKml}
</Folder>
</Document>
</kml>`;
}

// ── SHP (ZIP com 2 camadas + .cpg UTF-8) ────────────────────────────────────
// Exportada: as Prescrições reusam este empacotador (mesmo DBF latin1 + .cpg).
/**
 * MULTIPARTE → UMA FEIÇÃO POR PARTE.
 *
 * O @mapbox/shp-write agrupa as feições por TIPO de geometria e escreve um
 * arquivo por grupo. Com `types` mapeando Polygon e MultiPolygon para o MESMO
 * nome de camada, o segundo grupo sobrescreve o primeiro dentro do zip — e o
 * shapefile sai com uma fração das zonas, sem erro nenhum.
 *
 * MEDIDO (node, a mesma lib do app): 5 polígonos simples → 5 registros no DBF;
 * 5 multipolígonos → 5; MISTURA de 3 simples + 2 multi → 2 registros. Foi assim
 * que uma prescrição de 5 zonas virou um arquivo com uma zona só.
 *
 * Explodir resolve na raiz e ainda melhora a compatibilidade: monitor de
 * máquina costuma engasgar com geometria multiparte. As propriedades (a dose)
 * são copiadas para cada parte — o polígono continua com a dose certa.
 */
export function explodirMultiparte(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const f of fc.features ?? []) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'MultiPolygon') {
      for (const coords of g.coordinates) {
        features.push({ ...f, geometry: { type: 'Polygon', coordinates: coords } });
      }
    } else if (g.type === 'MultiLineString') {
      for (const coords of g.coordinates) {
        features.push({ ...f, geometry: { type: 'LineString', coordinates: coords } });
      }
    } else {
      features.push(f);
    }
  }
  return { type: 'FeatureCollection', features };
}

export async function shpFiles(fc: GeoJSON.FeatureCollection, tipo: 'polygon' | 'polyline'): Promise<Record<string, Uint8Array>> {
  const shpwrite = await import('@mapbox/shp-write');
  const types = tipo === 'polygon' ? { polygon: 'camada' } : { polyline: 'camada', line: 'camada' };
  // arraybuffer (não 'blob'): consumível pelo JSZip em qualquer ambiente.
  const ab = await shpwrite.zip<'arraybuffer'>(explodirMultiparte(fc), { outputType: 'arraybuffer', compression: 'DEFLATE', prj: PRJ_WGS84, types });
  const { default: JSZip } = await import('jszip');
  const zin = await JSZip.loadAsync(ab);
  const out: Record<string, Uint8Array> = {};
  for (const path of Object.keys(zin.files)) {
    const f = zin.files[path];
    if (f.dir) continue;
    const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
    out[ext] = await f.async('uint8array');
  }
  return out;
}

// Nome no padrão da casa: SA03_ZONAS_2026_EP02. A época sai da DATA DO MAPA —
// zonas não têm dataReferencia como o laudo, mas a data em que o mapa foi feito
// é o período a que ele se refere. O SHP, o KML e o PDF usam esta função (antes
// eram duas expressões independentes que já haviam divergido num `replace`).
export const nomeArquivoBase = (d: DadosExportZonas): string => {
  const per = periodoParaNome({ data: d.dataMapa, safra: d.ano });
  return nomeExport({
    fazenda: d.fazenda, talhao: d.talhao, tipo: 'ZONAS', ano: per.ano, epoca: per.epoca,
  });
};

export async function exportarSHPZonas(d: DadosExportZonas): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  // @mapbox/shp-write grava o DBF em ISO-8859-1 (latin1) — o .cpg DEVE declarar
  // esse encoding (cobre todos os acentos do português). Declarar UTF-8 aqui
  // corromperia os acentos nos SIG (o enunciado pedia UTF-8, mas isso só valeria
  // se o DBF fosse escrito em UTF-8, o que a lib não faz).
  const CPG = new TextEncoder().encode('ISO-8859-1');

  const poly = await shpFiles(geojsonPoligonos(d), 'polygon');
  for (const ext of ['.shp', '.shx', '.dbf', '.prj']) if (poly[ext]) zip.file(`zona_manejo_poligonos${ext}`, poly[ext]);
  zip.file('zona_manejo_poligonos.cpg', CPG);

  if (d.linhas.length > 0) {
    const lin = await shpFiles(geojsonLinhas(d), 'polyline');
    for (const ext of ['.shp', '.shx', '.dbf', '.prj']) if (lin[ext]) zip.file(`zona_manejo_linhas_internas${ext}`, lin[ext]);
    zip.file('zona_manejo_linhas_internas.cpg', CPG);
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

// ── Download helper ─────────────────────────────────────────────────────────
export function baixarBlob(blob: Blob, nomeArquivo: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportarKMLArquivo(d: DadosExportZonas): void {
  baixarBlob(new Blob([gerarKMLZonas(d)], { type: 'application/vnd.google-earth.kml+xml' }), `${nomeArquivoBase(d)}.kml`);
}
export async function exportarSHPArquivo(d: DadosExportZonas): Promise<void> {
  baixarBlob(await exportarSHPZonas(d), `${nomeArquivoBase(d)}.zip`);
}
