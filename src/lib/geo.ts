import { kml } from '@tmcw/togeojson';
import turfArea from '@turf/area';
import { areaM2Geo } from './areaGeo';
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
  const areaM2 = areaM2Geo(geojson);
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
      total += areaM2Geo(outerOnly) / 10000;
    }

    if (geom.type === 'Polygon') {
      addOuterRings(geom.coordinates);
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach(p => addOuterRings(p));
    }
  });
  return Math.round(total * 100) / 100;
}

// ── Saneamento de LIMITES (polígonos de talhão) — CONSERVADOR ────────────────
// Princípio: mudança MÍNIMA. Um polígono já fechado e válido passa INTACTO.
// Só intervimos no que está de fato quebrado, e nunca produzimos um resultado
// pior do que não fazer nada (na dúvida, mantém o anel original):
//  • LineString (limite desenhado como linha) → fecha ligando fim→início;
//  • remove só vértices DUPLICADOS exatos (mesma coordenada repetida);
//  • remove só ESPÍCULAS reais (agulha: o traçado vai e volta ~sobre si mesmo)
//    — critério por ÂNGULO, então CANTOS normais (até bem fechados) ficam;
//  • NÃO faz simplificação de colineares nem união (isso destruía polígonos).

type Pos = GeoJSON.Position;

const TOL_DUP_M = 0.10;      // vértices a < 10 cm = mesma coordenada (duplicado)
const COS_ESPICULA = 0.985;  // arestas quase paralelas (ângulo < ~10°) = agulha
const PERNA_ESPICULA_M = 12; // só remove agulha se a perna curta for pequena

// distância aproximada em metros (equiretangular — suficiente p/ épsilons locais)
function dM(a: Pos, b: Pos): number {
  const rad = Math.PI / 180;
  const x = (b[0] - a[0]) * rad * 111320 * Math.cos(((a[1] + b[1]) / 2) * rad);
  const y = (b[1] - a[1]) * rad * 111320;
  return Math.sqrt(x * x + y * y);
}

// anel ABERTO (sem repetir o 1º ponto no fim) e sem duplicados consecutivos
function semDuplicados(anel: Pos[]): Pos[] {
  const abertos = anel.slice();
  if (abertos.length > 1 && dM(abertos[0], abertos[abertos.length - 1]) < TOL_DUP_M) abertos.pop();
  const out: Pos[] = [];
  for (const p of abertos) {
    if (out.length === 0 || dM(out[out.length - 1], p) > TOL_DUP_M) out.push(p);
  }
  // fechamento circular: se o último coincide com o primeiro, remove
  while (out.length > 1 && dM(out[0], out[out.length - 1]) < TOL_DUP_M) out.pop();
  return out;
}

// remove APENAS espículas (agulhas): vértice B cujas arestas B→A e B→C apontam
// quase na MESMA direção (o traçado sai e volta). Iterativo e reindexado.
function tirarEspiculas(anelAberto: Pos[]): { anel: Pos[]; removidos: number } {
  const pts = anelAberto.slice();
  let removidos = 0, mudou = true, guarda = 0;
  while (mudou && pts.length > 3 && guarda++ < anelAberto.length + 5) {
    mudou = false;
    for (let i = 0; i < pts.length; i++) {
      const n = pts.length;
      const A = pts[(i - 1 + n) % n], B = pts[i], C = pts[(i + 1) % n];
      const ux = A[0] - B[0], uy = A[1] - B[1];
      const vx = C[0] - B[0], vy = C[1] - B[1];
      const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
      if (lu === 0 || lv === 0) continue;
      const cos = (ux * vx + uy * vy) / (lu * lv);   // ~+1 quando B→A ≈ B→C (agulha)
      const pernaCurta = Math.min(dM(A, B), dM(B, C));
      if (cos > COS_ESPICULA && pernaCurta < PERNA_ESPICULA_M) {
        pts.splice(i, 1); removidos++; mudou = true; break; // reindexa
      }
    }
  }
  return { anel: pts, removidos };
}

// Limpa um anel com o MÍNIMO. Nunca degenera: se a limpeza deixar < 3 pontos,
// cai pro anel sem-duplicados (que já tem ≥ 3). Retorna anel FECHADO ou null
// só quando realmente não há 3 pontos distintos.
function limparAnel(anel: Pos[]): { fechado: Pos[] | null; espiculas: number } {
  const base = semDuplicados(anel);
  if (base.length < 3) return { fechado: null, espiculas: 0 };
  const { anel: semAgulha, removidos } = tirarEspiculas(base);
  const usar = semAgulha.length >= 3 ? semAgulha : base;
  return { fechado: [...usar, usar[0]], espiculas: removidos };
}

export function sanearLimites(entrada: GeoJSON.FeatureCollection): { fc: GeoJSON.FeatureCollection; avisos: string[] } {
  const avisos: string[] = [];
  let linhasFechadas = 0, espiculas = 0, descartadas = 0;

  const saida: GeoJSON.Feature[] = [];
  const anexarPoligono = (coordenadas: Pos[][][], props: GeoJSON.GeoJsonProperties) => {
    const polys: Pos[][][] = [];
    for (const anelSet of coordenadas) {
      const limpos: Pos[][] = [];
      for (const anel of anelSet) {
        const r = limparAnel(anel);
        espiculas += r.espiculas;
        if (r.fechado) limpos.push(r.fechado);
        // furo degenerado é só ignorado — o anel externo segue
      }
      if (limpos.length) polys.push(limpos);
    }
    if (!polys.length) { descartadas++; return; }
    const geom: GeoJSON.Polygon | GeoJSON.MultiPolygon = polys.length === 1
      ? { type: 'Polygon', coordinates: polys[0] }
      : { type: 'MultiPolygon', coordinates: polys };
    saida.push({ type: 'Feature', properties: props ?? {}, geometry: geom });
  };

  // Limite desenhado como LINHA: fecha ligando fim→início (o "finalizar" liga os
  // pontos). Aproveita o traçado como está — só remove duplicados/agulhas.
  const tratarLinha = (coords: Pos[], props: GeoJSON.GeoJsonProperties) => {
    if (semDuplicados(coords).length < 3) { descartadas++; return; }
    linhasFechadas++;
    anexarPoligono([[coords]], props);
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

  if (linhasFechadas) avisos.push(`${linhasFechadas} limite(s) em linha fechado(s) para formar polígono.`);
  if (espiculas) avisos.push(`${espiculas} espícula(s) (vértice de vai-e-volta) removida(s).`);
  if (descartadas) avisos.push(`${descartadas} feição(ões) sem polígono ignorada(s).`);

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
