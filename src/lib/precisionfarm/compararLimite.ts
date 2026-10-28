// Integração PrecisionFarm — COMPARAÇÃO entre o limite publicado pela PF e o
// limite atual do talhão na Invicta. Função PURA (turf + matemática; sem rede,
// sem store): roda no navegador, onde está o limite local que vale, e no teste
// em Node (imports com `.ts`).
//
// Duas métricas, lado a lado, porque as duas equipes conferem de jeitos
// diferentes:
//   • a da PLATAFORMA: área geodésica do elipsoide WGS84 (areaGeo.ts — a mesma
//     do `areaHa` do talhão e do QGIS);
//   • UTM PLANA no fuso do talhão (22S no Paraná): projeção de Mercator
//     Transversa (série de Snyder/USGS, erro de milímetros dentro do fuso) e
//     área de Gauss — é a conta "de mesa" que a PF usa para conferir.
// A diferença simétrica (só PF + só Invicta) sai do recorte dos polígonos
// (turf/polyclip) nas coordenadas originais; as duas métricas medem as MESMAS
// sobras.

import { difference } from '@turf/difference';
import { feature, featureCollection } from '@turf/helpers';
import { areaM2Geo } from '../areaGeo.ts';
import { contarLimite, type ContagemLimite, type GeometriaLimite } from './limiteGeometria.ts';

type Pos = GeoJSON.Position;

// ── UTM (WGS84) ──────────────────────────────────────────────────────────────

const A_WGS = 6378137;
const F_WGS = 1 / 298.257223563;
const E2 = F_WGS * (2 - F_WGS);
const EP2 = E2 / (1 - E2);
const K0 = 0.9996;

export interface FusoUtm { zona: number; sul: boolean }

/** Fuso UTM de uma posição (sem as exceções da Noruega/Svalbard — não se aplicam). */
export function fusoUtm(lon: number, lat: number): FusoUtm {
  return { zona: Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1)), sul: lat < 0 };
}

export const rotuloFuso = (f: FusoUtm) => `${f.zona}${f.sul ? 'S' : 'N'}`;

/** [lon, lat] (graus, WGS84) → [E, N] em metros no fuso dado. */
export function paraUtm(lon: number, lat: number, f: FusoUtm): [number, number] {
  const phi = (lat * Math.PI) / 180;
  const lam0 = ((f.zona * 6 - 183) * Math.PI) / 180;
  const sin = Math.sin(phi), cos = Math.cos(phi), tan = Math.tan(phi);
  const N = A_WGS / Math.sqrt(1 - E2 * sin * sin);
  const T = tan * tan;
  const C = EP2 * cos * cos;
  const A = cos * ((lon * Math.PI) / 180 - lam0);
  const e4 = E2 * E2, e6 = e4 * E2;
  const M = A_WGS * (
    (1 - E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi
    - ((3 * E2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi)
    + ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi)
    - ((35 * e6) / 3072) * Math.sin(6 * phi));
  const x = K0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * EP2) * A ** 5) / 120) + 500000;
  const y = K0 * (M + N * tan * (A * A / 2 + ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24
    + ((61 - 58 * T + T * T + 600 * C - 330 * EP2) * A ** 6) / 720)) + (f.sul ? 10_000_000 : 0);
  return [x, y];
}

/** Área plana (m²) de um anel em UTM — Gauss, com origem no 1º vértice para
 *  não perder casas com coordenadas na casa dos milhões. */
function areaAnelUtm(anel: Pos[], f: FusoUtm): number {
  if (anel.length < 4) return 0;
  const p = anel.map(q => paraUtm(q[0], q[1], f));
  const [x0, y0] = p[0];
  let s = 0;
  for (let i = 0; i < p.length - 1; i++) {
    s += (p[i][0] - x0) * (p[i + 1][1] - y0) - (p[i + 1][0] - x0) * (p[i][1] - y0);
  }
  return Math.abs(s) / 2;
}

const poligonos = (g: GeometriaLimite): Pos[][][] => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);

/** Área UTM plana (m²): externos menos furos. */
export function areaUtmM2(g: GeometriaLimite, f: FusoUtm): number {
  let m2 = 0;
  for (const p of poligonos(g)) {
    m2 += areaAnelUtm(p[0], f);
    for (const furo of p.slice(1)) m2 -= areaAnelUtm(furo, f);
  }
  return m2;
}

// ── Limite da Invicta (texto do talhão) ──────────────────────────────────────

/** `Talhao.geojson` → UMA geometria (todas as partes, na ordem). Leitura
 *  tolerante: é o limite que já está valendo aqui, não um dado a recusar. */
export function geometriaDoTalhao(geojson: string | null | undefined): GeometriaLimite | null {
  if (!geojson) return null;
  let g: unknown;
  try { g = JSON.parse(geojson); } catch { return null; }
  const polis: Pos[][][] = [];
  const visitar = (x: unknown): void => {
    const o = x as { type?: string; coordinates?: unknown; geometry?: unknown; features?: unknown[]; geometries?: unknown[] } | null;
    if (!o || typeof o !== 'object') return;
    if (o.type === 'FeatureCollection') (o.features ?? []).forEach(visitar);
    else if (o.type === 'Feature') visitar(o.geometry);
    else if (o.type === 'GeometryCollection') (o.geometries ?? []).forEach(visitar);
    else if (o.type === 'Polygon' && Array.isArray(o.coordinates)) polis.push(o.coordinates as Pos[][]);
    else if (o.type === 'MultiPolygon' && Array.isArray(o.coordinates)) polis.push(...(o.coordinates as Pos[][][]));
  };
  visitar(g);
  if (!polis.length) return null;
  return polis.length === 1 ? { type: 'Polygon', coordinates: polis[0] } : { type: 'MultiPolygon', coordinates: polis };
}

// ── Comparação ───────────────────────────────────────────────────────────────

export interface LadoComparacao extends ContagemLimite {
  /** Métrica da plataforma (geodésica), sem arredondar. */
  areaHa: number;
  /** UTM plana no fuso da comparação. */
  areaUtmHa: number;
}

export interface ComparacaoLimites {
  fuso: string;                    // ex.: "22S"
  pf: LadoComparacao;
  invicta: LadoComparacao | null;  // talhão sem limite → só o lado PF
  /** Só na PF / só na Invicta / soma (m²), métrica da plataforma. */
  soPfM2: number;
  soInvictaM2: number;
  difSimM2: number;
  /** As mesmas sobras em UTM plana (m²). */
  soPfUtmM2: number;
  soInvictaUtmM2: number;
  difSimUtmM2: number;
  /** Diferença simétrica em % da área do limite ATUAL (Invicta); null sem limite. */
  difSimPct: number | null;
  /** Mesmas coordenadas (ou sobra desprezível, < 0,01 m²). */
  identicos: boolean;
  /** Para o mapa: o que só a PF tem e o que só a Invicta tem. */
  soPf: GeometriaLimite | null;
  soInvicta: GeometriaLimite | null;
}

/** Abaixo disto (m²) a sobra é ruído numérico do recorte. */
export const SOBRA_DESPREZIVEL_M2 = 0.01;

function menos(a: GeometriaLimite, b: GeometriaLimite): GeometriaLimite | null {
  try {
    const r = difference(featureCollection([feature(a), feature(b)]));
    return (r?.geometry as GeometriaLimite | undefined) ?? null;
  } catch (e) {
    throw new Error(`Não foi possível recortar os limites para comparar (${e instanceof Error ? e.message : 'falha no recorte'}).`);
  }
}

function lado(g: GeometriaLimite, f: FusoUtm): LadoComparacao {
  return { ...contarLimite(g), areaHa: areaM2Geo(g) / 10_000, areaUtmHa: areaUtmM2(g, f) / 10_000 };
}

/** Centro da caixa das duas geometrias — define o fuso UTM. */
function centro(gs: GeometriaLimite[]): [number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const g of gs) for (const p of poligonos(g)) for (const [x, y] of p[0]) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

const mesmasCoordenadas = (a: GeometriaLimite, b: GeometriaLimite) =>
  JSON.stringify(poligonos(a).map(p => p.map(r => r.map(q => [q[0], q[1]])))) === JSON.stringify(poligonos(b).map(p => p.map(r => r.map(q => [q[0], q[1]]))));

export function compararLimites(pf: GeometriaLimite, invicta: GeometriaLimite | null): ComparacaoLimites {
  const [lon, lat] = centro(invicta ? [pf, invicta] : [pf]);
  const f = fusoUtm(lon, lat);
  const ladoPf = lado(pf, f);
  if (!invicta) {
    return {
      fuso: rotuloFuso(f), pf: ladoPf, invicta: null,
      soPfM2: ladoPf.areaHa * 10_000, soInvictaM2: 0, difSimM2: ladoPf.areaHa * 10_000,
      soPfUtmM2: ladoPf.areaUtmHa * 10_000, soInvictaUtmM2: 0, difSimUtmM2: ladoPf.areaUtmHa * 10_000,
      difSimPct: null, identicos: false, soPf: pf, soInvicta: null,
    };
  }
  const ladoInv = lado(invicta, f);
  const iguais = mesmasCoordenadas(pf, invicta);
  const soPf = iguais ? null : menos(pf, invicta);
  const soInvicta = iguais ? null : menos(invicta, pf);
  const soPfM2 = soPf ? areaM2Geo(soPf) : 0;
  const soInvictaM2 = soInvicta ? areaM2Geo(soInvicta) : 0;
  const soPfUtmM2 = soPf ? areaUtmM2(soPf, f) : 0;
  const soInvictaUtmM2 = soInvicta ? areaUtmM2(soInvicta, f) : 0;
  const difSimM2 = soPfM2 + soInvictaM2;
  const areaInvM2 = ladoInv.areaHa * 10_000;
  return {
    fuso: rotuloFuso(f), pf: ladoPf, invicta: ladoInv,
    soPfM2, soInvictaM2, difSimM2,
    soPfUtmM2, soInvictaUtmM2, difSimUtmM2: soPfUtmM2 + soInvictaUtmM2,
    difSimPct: areaInvM2 > 0 ? (difSimM2 / areaInvM2) * 100 : null,
    identicos: iguais || difSimM2 < SOBRA_DESPREZIVEL_M2,
    soPf, soInvicta,
  };
}

/** Caixa [oeste, sul, leste, norte] de uma geometria (para gravar no talhão). */
export function caixaDoLimite(g: GeometriaLimite): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of poligonos(g)) for (const a of p) for (const [x, y] of a) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}
