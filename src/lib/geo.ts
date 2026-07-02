import { kml } from '@tmcw/togeojson';
import turfArea from '@turf/area';
import { union as turfUnion } from '@turf/union';
import { featureCollection } from '@turf/helpers';
import { classeZona, classeReconhecida } from './zonas';

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

// ── Saneamento de LIMITES (polígonos de talhão) ──────────────────────────────
// Arquivos de campo vêm com defeitos comuns: "polígono" desenhado como LINHA
// aberta, vértices duplicados, ESPÍCULAS (vai-e-volta) e auto-interseções.
// Aqui limpamos automaticamente sem comprometer o resto do polígono:
//  • LineString quase fechada (pontas próximas) → fecha e vira Polygon;
//  • remove vértices duplicados/colineares e espículas;
//  • auto-interseção → união do polígono com ele mesmo (polygon-clipping);
//  • anéis degenerados (<4 posições) são descartados com aviso.

type Pos = GeoJSON.Position;

// distância aproximada em metros (equiretangular — suficiente p/ épsilons locais)
function dM(a: Pos, b: Pos): number {
  const rad = Math.PI / 180;
  const x = (b[0] - a[0]) * rad * 111320 * Math.cos(((a[1] + b[1]) / 2) * rad);
  const y = (b[1] - a[1]) * rad * 111320;
  return Math.sqrt(x * x + y * y);
}

// limpa um anel: fecha, tira duplicados, colineares e espículas (iterativo)
function limparAnel(anel: Pos[]): Pos[] | null {
  let pts = anel.slice();
  // remove o fechamento pra trabalhar aberto
  if (pts.length > 1 && dM(pts[0], pts[pts.length - 1]) < 0.05) pts = pts.slice(0, -1);

  for (let passo = 0; passo < 5; passo++) {
    const antes = pts.length;
    // duplicados consecutivos
    pts = pts.filter((p, i) => i === 0 || dM(pts[i - 1], p) > 0.05);
    // colineares e espículas
    const manter: Pos[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      const ab = dM(a, b), bc = dM(b, c), ac = dM(a, c);
      const colinear = ab + bc - ac < 0.5;                       // B em cima da reta A–C
      const espicula = ac < 0.02 * (ab + bc) && ab + bc > 2;     // sai e volta (vai-e-volta)
      if (!colinear && !espicula) manter.push(b);
    }
    pts = manter;
    if (pts.length === antes) break;
  }

  if (pts.length < 3) return null;
  return [...pts, pts[0]]; // fecha
}

// tenta consertar auto-interseção unindo o polígono com ele mesmo
function autoUniao(geom: GeoJSON.Polygon | GeoJSON.MultiPolygon): GeoJSON.Polygon | GeoJSON.MultiPolygon {
  try {
    const f: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> = { type: 'Feature', properties: {}, geometry: geom };
    const u = turfUnion(featureCollection([f, f]));
    return u?.geometry ?? geom;
  } catch { return geom; }
}

export function sanearLimites(entrada: GeoJSON.FeatureCollection): { fc: GeoJSON.FeatureCollection; avisos: string[] } {
  const avisos: string[] = [];
  let linhasFechadas = 0, descartadas = 0, aneisDescartados = 0;

  const saida: GeoJSON.Feature[] = [];
  const anexarPoligono = (coordenadas: Pos[][][], props: GeoJSON.GeoJsonProperties) => {
    const polys: Pos[][][] = [];
    for (const anelSet of coordenadas) {
      const limpos: Pos[][] = [];
      for (const anel of anelSet) {
        const l = limparAnel(anel);
        if (l) limpos.push(l);
        else aneisDescartados++;
      }
      if (limpos.length) polys.push(limpos);
    }
    if (!polys.length) { descartadas++; return; }
    const geom: GeoJSON.Polygon | GeoJSON.MultiPolygon = polys.length === 1
      ? { type: 'Polygon', coordinates: polys[0] }
      : { type: 'MultiPolygon', coordinates: polys };
    saida.push({ type: 'Feature', properties: props ?? {}, geometry: autoUniao(geom) });
  };

  const tratarLinha = (coords: Pos[], props: GeoJSON.GeoJsonProperties) => {
    if (coords.length < 4) { descartadas++; return; }
    let compr = 0;
    for (let i = 1; i < coords.length; i++) compr += dM(coords[i - 1], coords[i]);
    const abertura = dM(coords[0], coords[coords.length - 1]);
    // pontas próximas em relação ao tamanho → era pra ser um polígono
    if (abertura <= Math.max(20, compr * 0.02)) {
      linhasFechadas++;
      anexarPoligono([[coords]], props);
    } else descartadas++;
  };

  const visitar = (geom: GeoJSON.Geometry | null | undefined, props: GeoJSON.GeoJsonProperties) => {
    if (!geom) return;
    if (geom.type === 'Polygon') anexarPoligono([geom.coordinates], props);
    else if (geom.type === 'MultiPolygon') anexarPoligono(geom.coordinates, props);
    else if (geom.type === 'LineString') tratarLinha(geom.coordinates, props);
    else if (geom.type === 'MultiLineString') geom.coordinates.forEach(l => tratarLinha(l, props));
    else if (geom.type === 'GeometryCollection') geom.geometries.forEach(g => visitar(g, props));
    // pontos etc.: não são limite — ignora silenciosamente
  };

  entrada.features.forEach(f => visitar(f.geometry, f.properties));

  if (linhasFechadas) avisos.push(`${linhasFechadas} linha(s) aberta(s) foram fechadas e viraram polígono automaticamente.`);
  if (aneisDescartados) avisos.push(`${aneisDescartados} anel(éis) degenerado(s) removido(s).`);
  if (descartadas) avisos.push(`${descartadas} feição(ões) descartada(s) (não formam polígono).`);

  return { fc: { type: 'FeatureCollection', features: saida }, avisos };
}

// Import do LIMITE de um talhão (individual): parse + saneamento + medidas.
export async function parseLimiteTalhao(file: File): Promise<GeoUploadResult & { avisos: string[] }> {
  const bruto = await parseGeoFile(file);
  const { fc, avisos } = sanearLimites(bruto.geojson);
  if (fc.features.length === 0) {
    throw new Error('Nenhum polígono aproveitável no arquivo — as feições não fecham um limite.');
  }
  return { ...computeResult(fc), avisos };
}

// ── Cadastro de talhões em massa ────────────────────────────────────────────
// Vários arquivos de uma vez (ou 1 arquivo com vários talhões) → candidatos.
// Regras: se as feições têm campo de nome, agrupa por nome (glebas com o mesmo
// nome viram UM talhão, com furos descontados); sem nomes, o arquivo inteiro é
// UM talhão com o nome do arquivo.
export interface CandidatoTalhao {
  nome: string;
  geojson: GeoJSON.FeatureCollection;
  bbox: [number, number, number, number];
  areaHa: number;
  areaHaBruta: number;
  arquivo: string;
}

function campoNomeTalhao(feats: GeoJSON.Feature[]): string | null {
  const chaves = new Set<string>();
  feats.forEach(f => Object.keys(f.properties ?? {}).forEach(k => chaves.add(k)));
  const temValor = (k: string) =>
    feats.some(f => String((f.properties as Record<string, unknown> | null)?.[k] ?? '').trim());
  for (const re of [/^(nome|name)$/i, /talh/i, /^(label|title|titulo)$/i]) {
    const k = [...chaves].find(c => re.test(c) && temValor(c));
    if (k) return k;
  }
  return null;
}

export async function prepararTalhoesEmMassa(files: File[]): Promise<{ candidatos: CandidatoTalhao[]; erros: string[] }> {
  const candidatos: CandidatoTalhao[] = [];
  const erros: string[] = [];

  for (const file of files) {
    try {
      const r = await parseGeoFile(file);
      // saneia limites defeituosos (linha aberta → polígono, espículas, auto-interseção)
      const saneado = sanearLimites(r.geojson);
      saneado.avisos.forEach(a => erros.push(`${file.name}: ${a}`));
      const polis = saneado.fc.features.filter(f =>
        f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'));
      if (polis.length === 0) { erros.push(`${file.name}: nenhum polígono aproveitável.`); continue; }

      const base = file.name.replace(/\.[^.]+$/, '');
      const campoNome = campoNomeTalhao(polis);

      // agrupa por nome; feições sem nome caem no grupo do arquivo
      const grupos = new Map<string, GeoJSON.Feature[]>();
      if (!campoNome) {
        grupos.set(base, polis);
      } else {
        for (const f of polis) {
          const nome = String((f.properties as Record<string, unknown> | null)?.[campoNome] ?? '').trim() || base;
          const arr = grupos.get(nome) ?? [];
          arr.push(f);
          grupos.set(nome, arr);
        }
      }

      for (const [nome, feats] of grupos) {
        const m = computeResult({ type: 'FeatureCollection', features: feats });
        candidatos.push({ nome, geojson: m.geojson, bbox: m.bbox, areaHa: m.areaHa, areaHaBruta: m.areaHaBruta, arquivo: file.name });
      }
    } catch (e: unknown) {
      erros.push(`${file.name}: ${e instanceof Error ? e.message : 'erro ao processar.'}`);
    }
  }
  return { candidatos, erros };
}

// ── Zonas de manejo ─────────────────────────────────────────────────────────
// Normaliza um arquivo de zonas (SHP/KML/GeoJSON) para o formato que o app usa:
// cada feição vira { id, classe, areaHa }. Auto-detecta o campo de classe (o que
// tem mais valores reconhecidos pelo semáforo) e o campo de id.
export interface ZonasPreparadas {
  fc: GeoJSON.FeatureCollection;
  count: number;
  classes: string[];   // labels distintas detectadas
  campoClasse: string; // '' se não detectado
}

function areaHaFeature(geom: GeoJSON.Geometry): number {
  const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: geom }] };
  return Math.round((turfArea(fc) / 10000) * 100) / 100;
}

export function normalizarZonas(entrada: GeoJSON.FeatureCollection): ZonasPreparadas {
  const polis = entrada.features.filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'));

  const chaves = new Set<string>();
  polis.forEach(f => Object.keys(f.properties ?? {}).forEach(k => chaves.add(k)));

  // campo de classe = o que tem mais valores reconhecidos (+ bônus p/ nome plausível)
  let campoClasse = '', melhor = 0;
  for (const k of chaves) {
    let rec = 0;
    for (const f of polis) {
      const v = (f.properties as Record<string, unknown> | null)?.[k];
      if (v != null && classeReconhecida(String(v))) rec++;
    }
    const bonus = /class|zona|manejo|categoria|ugd|nivel|fertil/i.test(k) ? 0.5 : 0;
    if (rec + bonus > melhor) { melhor = rec + bonus; campoClasse = k; }
  }
  const campoId = [...chaves].find(k => /^(id|zona|numero|num|fid|cod|nome|name)$/i.test(k));

  const features: GeoJSON.Feature[] = polis.map((f, i) => {
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const classe = campoClasse ? String(props[campoClasse] ?? '') : '';
    const id = campoId && props[campoId] != null ? String(props[campoId]) : String(i + 1).padStart(2, '0');
    return { type: 'Feature', properties: { id, classe, areaHa: areaHaFeature(f.geometry!) }, geometry: f.geometry! };
  });

  const classes = [...new Set(features.map(f => classeZona(String((f.properties as { classe: string }).classe)).label))];
  return { fc: { type: 'FeatureCollection', features }, count: features.length, classes, campoClasse };
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
