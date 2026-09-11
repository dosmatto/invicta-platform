// AMOSTRAGEM COMPOSTA — as células quadráticas e os furos dentro delas.
//
// O talhão pequeno de pouca variabilidade — a sobra que o pivô não irriga, o
// talhão que o produtor só quer amostrar por obrigação — não merece uma grade
// de 30 pontos. Merece N amostras COMPOSTAS: o operador anda uma área, dá M
// furos dentro dela, mistura tudo num saco só e manda UMA amostra ao
// laboratório. O resultado vale para aquela área inteira.
//
// Este módulo recorta o talhão em N CÉLULAS QUADRÁTICAS de área equivalente
// (área ÷ N) e distribui os furos dentro de cada uma. Daí para a frente é a
// grade de zonas modelo A: `numerarPontosZonas` numera, `amostrasComProfundidade`
// imprime as etiquetas, o mapa de fertilidade pinta cada célula com o valor dela.
//
// DUAS GARANTIAS que o resto da plataforma depende:
//
//   1. EXATAMENTE N células, cobrindo 100% do talhão, sem sobreposição. É o que
//      faz a soma dos volumes fechar com o total: cada hectare pertence a uma
//      única amostra. O recorte da grade não entrega isso sozinho (a borda gera
//      tiras finas e a contagem varia em degraus), então há um passo de
//      FORÇAMENTO — funde a menor peça na vizinha, ou parte a maior ao meio —
//      que preserva cobertura e exclusividade por construção.
//
//   2. AS CÉLULAS NÃO USAM SORTEIO. São função pura de (geometria, N, rotação).
//      O operador anda no campo com um mapa impresso semanas antes; regerar tem
//      de dar o mesmo desenho. O `seed` existe só para os FUROS.
//
// Módulo PURO (só turf e lib/grid). npm run teste:gradecomposta

import turfIntersect from '@turf/intersect';
import turfUnion from '@turf/union';
import booleanIntersects from '@turf/boolean-intersects';
import { featureCollection } from '@turf/helpers';
import { areaM2Geo } from './areaGeo.ts';
import { fatores, gerarGrid, selecionarPorMalha, pontoInterno, type ModoDistribuicao } from './grid.ts';

type Poly = GeoJSON.Polygon | GeoJSON.MultiPolygon;

/** Uma amostra composta: a área que ela representa. */
export interface CelulaComposta {
  /** "01", "02"… — é o que vai para `numerarPontosZonas` como id da zona.
   *  SEMPRE zero-padded numérico: um uuid cairia no fallback por índice de
   *  `numeroDaZona` e funcionaria por acaso. */
  id: string;
  /** 1..N — o número que o laboratório recebe. */
  numero: number;
  areaHa: number;
  geometry: Poly;
}

export interface ParamsCelulas {
  /** Limite do talhão. */
  geojson: GeoJSON.FeatureCollection;
  /** Quantas amostras vão ao laboratório. */
  nCelulas: number;
  /** Ângulo da grade (0 = N-S). Use `anguloMaiorDimensao(fc)` para o automático. */
  rotacaoGraus: number;
  /** Menor célula que faz sentido coletar (default 0,25 ha = 50 × 50 m). */
  areaMinCelulaHa?: number;
  /** Abaixo disto a peça é sobra e é fundida na vizinha (default: ¼ da célula média). */
  limiarSliverHa?: number;
}

export interface ResultadoCelulas {
  celulas: CelulaComposta[];
  /** O N que a tela pediu — para ela avisar quando foi ajustado. */
  nPedido: number;
  /** Lado final da célula em metros (a tela mostra "≈ 141 × 141 m"). */
  ladoM: number;
  motivoAjuste?: 'area-insuficiente' | 'manchas-separadas' | 'recorte-falhou';
}

/** Cores das células no mapa. Paleta CÍCLICA e neutra de propósito: usar
 *  `classeZona()` pintaria a célula de verde/vermelho, que na plataforma
 *  inteira significa classe de FERTILIDADE — e aqui ainda não há laudo nenhum. */
export const CORES_CELULA = [
  '#60a5fa', '#f59e0b', '#a78bfa', '#34d399', '#f472b6', '#22d3ee', '#facc15', '#fb923c',
];

/** Menor célula que ainda dá para coletar (ha). */
export const AREA_MIN_CELULA_HA = 0.25;

/** Distância da borda default da composta. É a divisa da CÉLULA, não a do
 *  talhão: os 15 m das zonas comeriam 51% de uma célula de 1 ha. */
export const DIST_BORDA_COMPOSTA = 5;

/** Subamostras (furos) por amostra composta. */
export const SUBAMOSTRAS_PADRAO = 10;

// ── Geometria auxiliar ───────────────────────────────────────────────────────

function comoMulti(fc: GeoJSON.FeatureCollection): GeoJSON.MultiPolygon | null {
  const coords: GeoJSON.Position[][][] = [];
  for (const f of fc.features ?? []) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') coords.push(g.coordinates);
    else if (g.type === 'MultiPolygon') for (const p of g.coordinates) coords.push(p);
  }
  return coords.length ? { type: 'MultiPolygon', coordinates: coords } : null;
}

const feat = (g: Poly): GeoJSON.Feature<Poly> => ({ type: 'Feature', properties: {}, geometry: g });

/** Um MultiPolygon vira N polígonos soltos. */
function separar(g: Poly): GeoJSON.Polygon[] {
  if (g.type === 'Polygon') return [g];
  return g.coordinates.map(c => ({ type: 'Polygon', coordinates: c } as GeoJSON.Polygon));
}

/** Interseção de dois polígonos. Limite auto-interceptante (KML de cliente) faz
 *  o turf lançar — nunca deixar a exceção subir, mas CONTAR, porque uma falha
 *  silenciosa vira buraco no mapa. */
function recortar(a: Poly, b: Poly, falhas: { n: number }): Poly | null {
  try {
    const r = turfIntersect(featureCollection([feat(a), feat(b)]));
    return (r?.geometry as Poly) ?? null;
  } catch {
    falhas.n++;
    return null;
  }
}

function fundirGeom(a: Poly, b: Poly, falhas: { n: number }): Poly | null {
  try {
    const r = turfUnion(featureCollection([feat(a), feat(b)]));
    return (r?.geometry as Poly) ?? null;
  } catch {
    falhas.n++;
    return null;
  }
}

function andarCoords(g: Poly, fn: (lng: number, lat: number) => void): void {
  const rings = g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
  for (const r of rings) for (const c of r) fn(c[0], c[1]);
}

// ── Frame local (metros, rotacionado) ────────────────────────────────────────
// Mesma convenção de `gerarGrid`: origem no centro do bbox, toGrid rotaciona.

interface Frame {
  lng0: number; lat0: number; mLng: number; mLat: number; cos: number; sin: number;
}

function criarFrame(g: Poly, rotacaoGraus: number): Frame {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  andarCoords(g, (lng, lat) => {
    if (lng < minLng) minLng = lng; if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng; if (lat > maxLat) maxLat = lat;
  });
  const lat0 = (minLat + maxLat) / 2, lng0 = (minLng + maxLng) / 2;
  const { mLat, mLng } = fatores(lat0);
  const ang = (rotacaoGraus * Math.PI) / 180;
  return { lng0, lat0, mLng, mLat, cos: Math.cos(ang), sin: Math.sin(ang) };
}

function paraUV(f: Frame, lng: number, lat: number): [number, number] {
  const x = (lng - f.lng0) * f.mLng, y = (lat - f.lat0) * f.mLat;
  return [x * f.cos + y * f.sin, -x * f.sin + y * f.cos];
}

function paraLngLat(f: Frame, u: number, v: number): [number, number] {
  const x = u * f.cos - v * f.sin, y = u * f.sin + v * f.cos;
  return [x / f.mLng + f.lng0, y / f.mLat + f.lat0];
}

interface CaixaUV { uMin: number; uMax: number; vMin: number; vMax: number }

function caixaUV(f: Frame, g: Poly): CaixaUV {
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  andarCoords(g, (lng, lat) => {
    const [u, v] = paraUV(f, lng, lat);
    if (u < uMin) uMin = u; if (u > uMax) uMax = u;
    if (v < vMin) vMin = v; if (v > vMax) vMax = v;
  });
  return { uMin, uMax, vMin, vMax };
}

/** Retângulo do espaço da grade como polígono em lng/lat. */
function retangulo(f: Frame, uMin: number, vMin: number, uMax: number, vMax: number): GeoJSON.Polygon {
  const p = [
    paraLngLat(f, uMin, vMin), paraLngLat(f, uMax, vMin),
    paraLngLat(f, uMax, vMax), paraLngLat(f, uMin, vMax),
  ];
  return { type: 'Polygon', coordinates: [[...p, p[0]]] };
}

// ── Peças ────────────────────────────────────────────────────────────────────

interface Peca {
  geom: Poly;
  m2: number;
  cx: CaixaUV;
  /** Mancha (componente conexo) a que a peça pertence: fusão NUNCA atravessa
   *  manchas — um saco composto de duas áreas cortadas por estrada é errado. */
  mancha: number;
  /** Já se sabe que não tem vizinha para onde ir / não dá para partir. */
  travadaFusao?: boolean;
  travadaDivisao?: boolean;
}

function peca(f: Frame, geom: Poly, mancha: number): Peca {
  return { geom, m2: areaM2Geo(geom), cx: caixaUV(f, geom), mancha };
}

/** Comprimento aproximado da divisa entre duas peças, no espaço da grade.
 *  Peças lado a lado se tocam numa linha da grade: uma das sobreposições de
 *  caixa é ~0 e a OUTRA é o comprimento da divisa. Barato e suficiente para
 *  escolher em qual vizinha a sobra vai — o que importa é não fundir com quem
 *  mal encosta. */
function divisa(a: Peca, b: Peca): number {
  const TOL = 0.5; // m
  const ovU = Math.min(a.cx.uMax, b.cx.uMax) - Math.max(a.cx.uMin, b.cx.uMin);
  const ovV = Math.min(a.cx.vMax, b.cx.vMax) - Math.max(a.cx.vMin, b.cx.vMin);
  if (ovU < -TOL || ovV < -TOL) return 0;            // separadas
  const menor = Math.min(ovU, ovV), maior = Math.max(ovU, ovV);
  return Math.max(0, menor > TOL ? menor : maior);
}

/** Encostam DE VERDADE. A caixa sozinha mente: duas peças da mesma coluna da
 *  grade separadas pela cintura do talhão (ou por um buraco) têm caixas que se
 *  sobrepõem e geometrias que nunca se tocam — fundi-las criaria um saco
 *  composto de duas áreas que o operador não consegue andar. */
function tocam(a: Peca, b: Peca): boolean {
  if (divisa(a, b) <= 0) return false;
  try { return booleanIntersects(feat(a.geom), feat(b.geom)); } catch { return false; }
}

/** A vizinha para onde a peça `i` deve ir: a da MESMA mancha com a maior divisa
 *  compartilhada. -1 quando a peça está isolada (a sobra do pivô). */
function melhorVizinha(pecas: Peca[], i: number): number {
  let melhor = -1, maior = 0;
  for (let j = 0; j < pecas.length; j++) {
    if (j === i || pecas[j].mancha !== pecas[i].mancha) continue;
    const d = divisa(pecas[i], pecas[j]);
    if (d > maior && tocam(pecas[i], pecas[j])) { maior = d; melhor = j; }
  }
  return melhor;
}

/** Rotula as manchas: peças que se tocam são a mesma (union-find). */
function marcarManchas(pecas: Peca[]): number {
  const pai = pecas.map((_, i) => i);
  const find = (a: number): number => { while (pai[a] !== a) { pai[a] = pai[pai[a]]; a = pai[a]; } return a; };
  for (let i = 0; i < pecas.length; i++) {
    for (let j = i + 1; j < pecas.length; j++) {
      if (find(i) === find(j)) continue;
      if (tocam(pecas[i], pecas[j])) pai[find(i)] = find(j);
    }
  }
  const mapa = new Map<number, number>();
  for (let i = 0; i < pecas.length; i++) {
    const r = find(i);
    let m = mapa.get(r);
    if (m === undefined) { m = mapa.size; mapa.set(r, m); }
    pecas[i].mancha = m;
  }
  return mapa.size;
}

// ── Recorte da grade ─────────────────────────────────────────────────────────

const MAX_CELULAS_RETICULADO = 4000;

/** Recorta o talhão por um reticulado de lado L. Devolve null quando o
 *  reticulado explodiria (L pequeno demais para o tamanho do talhão). */
function recortarGrade(f: Frame, talhao: Poly, L: number, falhas: { n: number }): Peca[] | null {
  const cx = caixaUV(f, talhao);
  const largU = cx.uMax - cx.uMin, largV = cx.vMax - cx.vMin;
  if (!(L > 0) || (largU / L + 1) * (largV / L + 1) > MAX_CELULAS_RETICULADO) return null;

  // Ancora no CENTRO, não no canto: reticulado simétrico deixa menos tira fina
  // nas duas bordas (com o canto, toda a sobra se acumula num lado só).
  const cU = (cx.uMin + cx.uMax) / 2, cV = (cx.vMin + cx.vMax) / 2;
  const oU = cU - Math.ceil((cU - cx.uMin) / L) * L;
  const oV = cV - Math.ceil((cV - cx.vMin) / L) * L;

  const out: Peca[] = [];
  for (let v = oV; v < cx.vMax; v += L) {
    for (let u = oU; u < cx.uMax; u += L) {
      const quad = retangulo(f, u, v, u + L, v + L);
      const g = recortar(talhao, quad, falhas);
      if (!g) continue;
      // Uma célula que pega DUAS manchas devolve um MultiPolygon: cada pedaço
      // vira uma peça própria. Sem isto, um reticulado grosso engoliria o
      // talhão inteiro numa "célula" só e a amostra seria um saco com terra de
      // áreas que o operador nem consegue percorrer seguido.
      for (const parte of separar(g)) {
        const p = peca(f, parte, 0);
        if (p.m2 > 1) out.push(p);   // < 1 m² é ruído numérico do clipper
      }
    }
  }
  return out;
}

// ── Divisão de uma peça em duas de área parecida ─────────────────────────────

function dividir(f: Frame, p: Peca, falhas: { n: number }): [Poly, Poly] | null {
  const horizontal = (p.cx.uMax - p.cx.uMin) >= (p.cx.vMax - p.cx.vMin);
  const E = 10; // folga do semiplano, para o retângulo cobrir a peça inteira
  const { uMin, uMax, vMin, vMax } = p.cx;
  // Os semiplanos vão SEMPRE dos limites da peça até o corte — usar os extremos
  // da bisseção (que andam) recortaria fora um pedaço do próprio lado A.
  const ladoA = (c: number) => horizontal
    ? retangulo(f, uMin - E, vMin - E, c, vMax + E)
    : retangulo(f, uMin - E, vMin - E, uMax + E, c);
  const ladoB = (c: number) => horizontal
    ? retangulo(f, c, vMin - E, uMax + E, vMax + E)
    : retangulo(f, uMin - E, c, uMax + E, vMax + E);

  let lo = horizontal ? uMin : vMin;
  let hi = horizontal ? uMax : vMax;
  let corte = (lo + hi) / 2, a: Poly | null = null;
  for (let it = 0; it < 9; it++) {
    corte = (lo + hi) / 2;
    a = recortar(p.geom, ladoA(corte), falhas);
    const m2a = a ? areaM2Geo(a) : 0;
    if (Math.abs(m2a - p.m2 / 2) <= p.m2 * 0.02) break;
    if (m2a < p.m2 / 2) lo = corte; else hi = corte;
  }
  if (!a) return null;
  const b = recortar(p.geom, ladoB(corte), falhas);
  if (!b) return null;
  const m2a = areaM2Geo(a), m2b = areaM2Geo(b);
  if (m2a < 1 || m2b < 1) return null;
  return [a, b];
}

// ── Principal ────────────────────────────────────────────────────────────────

/** Quantas amostras a área do talhão comporta. */
export function nMaximoCelulas(geojson: GeoJSON.FeatureCollection, areaMinHa = AREA_MIN_CELULA_HA): number {
  const m = comoMulti(geojson);
  if (!m) return 0;
  return Math.max(1, Math.floor(areaM2Geo(m) / 10000 / areaMinHa));
}

const arred2 = (x: number) => Math.round(x * 100) / 100;

function montar(pecas: Peca[], f: Frame, L: number): CelulaComposta[] {
  // Serpentina, a mesma de `gerarGrid`: linhas no espaço da grade alternam
  // direção, para o operador andar o talhão sem voltar em vazio.
  let vMin = Infinity;
  for (const p of pecas) if (p.cx.vMin < vMin) vMin = p.cx.vMin;
  const arr = pecas.map(p => ({
    p,
    row: Math.round(((p.cx.vMin + p.cx.vMax) / 2 - vMin) / L),
    u: (p.cx.uMin + p.cx.uMax) / 2,
  }));
  arr.sort((a, b) => a.row - b.row || (a.row % 2 === 0 ? a.u - b.u : b.u - a.u));
  return arr.map((c, i) => ({
    id: String(i + 1).padStart(2, '0'),
    numero: i + 1,
    areaHa: arred2(c.p.m2 / 10000),
    geometry: c.p.geom,
  }));
}

export function gerarCelulasCompostas(params: ParamsCelulas): ResultadoCelulas {
  const nPedido = Math.max(1, Math.round(params.nCelulas || 1));
  const talhao = comoMulti(params.geojson);
  if (!talhao) return { celulas: [], nPedido, ladoM: 0 };

  const m2Total = areaM2Geo(talhao);
  const areaMin = params.areaMinCelulaHa ?? AREA_MIN_CELULA_HA;
  const teto = Math.max(1, Math.floor(m2Total / 10000 / areaMin));
  let motivo: ResultadoCelulas['motivoAjuste'];
  let n = nPedido;
  if (n > teto) { n = teto; motivo = 'area-insuficiente'; }

  // N=1 é o caso que motivou a ferramenta: UMA amostra para o talhão inteiro.
  // Talhão de duas manchas entra inteiro no mesmo saco — foi o que o usuário
  // pediu ao digitar 1, e é agronomicamente o que ele faria no campo.
  if (n === 1) {
    return {
      celulas: [{ id: '01', numero: 1, areaHa: arred2(m2Total / 10000), geometry: talhao }],
      nPedido, ladoM: Math.round(Math.sqrt(m2Total)), motivoAjuste: motivo,
    };
  }

  const f = criarFrame(talhao, params.rotacaoGraus);
  const falhas = { n: 0 };

  // Aproxima a contagem ajustando o lado. A contagem é função em DEGRAUS do
  // lado, então isto só chega perto — quem fecha em N é o forçamento abaixo.
  let L = Math.sqrt(m2Total / n);
  let melhor: Peca[] | null = null, melhorL = L;
  for (let it = 0; it < 7; it++) {
    const pecas = recortarGrade(f, talhao, L, falhas);
    if (!pecas || pecas.length === 0) break;
    if (!melhor || Math.abs(pecas.length - n) < Math.abs(melhor.length - n)) { melhor = pecas; melhorL = L; }
    if (pecas.length === n) break;
    L *= Math.sqrt(pecas.length / n);
  }
  if (!melhor || melhor.length === 0) {
    return {
      celulas: [{ id: '01', numero: 1, areaHa: arred2(m2Total / 10000), geometry: talhao }],
      nPedido, ladoM: Math.round(Math.sqrt(m2Total)), motivoAjuste: 'recorte-falhou',
    };
  }

  const pecas = melhor;
  L = melhorL;
  const manchas = marcarManchas(pecas);
  if (n < manchas) { n = manchas; motivo = 'manchas-separadas'; }

  const limiarSliver = (params.limiarSliverHa ?? 0) > 0
    ? params.limiarSliverHa! * 10000
    : (m2Total / n) * 0.25;

  const fundir = (i: number, j: number): boolean => {
    const g = fundirGeom(pecas[i].geom, pecas[j].geom, falhas);
    if (!g) { pecas[i].travadaFusao = true; return false; }
    pecas[j] = peca(f, g, pecas[j].mancha);
    pecas.splice(i, 1);
    return true;
  };

  // Fase A — sobras. Tira fina de borda não é amostra: vai para a vizinha.
  for (let guarda = 0; guarda < 500; guarda++) {
    let i = -1, menor = Infinity;
    for (let k = 0; k < pecas.length; k++) {
      if (pecas[k].travadaFusao) continue;
      if (pecas[k].m2 < limiarSliver && pecas[k].m2 < menor) { menor = pecas[k].m2; i = k; }
    }
    if (i < 0) break;
    const j = melhorVizinha(pecas, i);
    if (j < 0) { pecas[i].travadaFusao = true; continue; }   // isolada: vira célula
    fundir(i, j);
  }

  // Fase B — fecha em N. Funde a menor / parte a maior, sempre preservando
  // cobertura total e exclusividade.
  for (let guarda = 0; guarda < 500 && pecas.length !== n; guarda++) {
    if (pecas.length > n) {
      let i = -1, menor = Infinity;
      for (let k = 0; k < pecas.length; k++) {
        if (pecas[k].travadaFusao) continue;
        if (pecas[k].m2 < menor) { menor = pecas[k].m2; i = k; }
      }
      if (i < 0) break;
      const j = melhorVizinha(pecas, i);
      if (j < 0) { pecas[i].travadaFusao = true; continue; }
      fundir(i, j);
    } else {
      let i = -1, maior = -Infinity;
      for (let k = 0; k < pecas.length; k++) {
        if (pecas[k].travadaDivisao) continue;
        if (pecas[k].m2 > maior) { maior = pecas[k].m2; i = k; }
      }
      if (i < 0) break;
      const par = dividir(f, pecas[i], falhas);
      if (!par) { pecas[i].travadaDivisao = true; continue; }
      const mancha = pecas[i].mancha;
      pecas.splice(i, 1, peca(f, par[0], mancha), peca(f, par[1], mancha));
    }
  }

  if (pecas.length > n && pecas.some(p => p.travadaFusao)) motivo = 'manchas-separadas';

  // Invariante final: a soma das células TEM de fechar com o talhão, senão os
  // volumes da prescrição saem errados — e calados, que é o pior.
  const somaM2 = pecas.reduce((s, p) => s + p.m2, 0);
  if (falhas.n > 0 || Math.abs(somaM2 - m2Total) > m2Total * 0.02) motivo = 'recorte-falhou';

  return { celulas: montar(pecas, f, L), nPedido, ladoM: Math.round(L), motivoAjuste: motivo };
}

// ── Subamostras (os furos dentro da célula) ──────────────────────────────────

export interface ParamsSubamostras {
  celula: CelulaComposta;
  /** M furos por amostra composta. */
  subamostras: number;
  /** Distância da divisa DA CÉLULA (m). */
  distanciaBordaM: number;
  rotacaoGraus: number;
  aleatoriedade: number;
  seed: number;
  modo?: ModoDistribuicao;
}

/**
 * Exatamente M furos bem distribuídos dentro da célula — ou o que couber.
 *
 * `gerarGrid` arredonda o alvo pela área (pedir 10 devolve 9 ou 11), então o
 * caminho é o mesmo das profundidades parciais na grade comum: gerar uma nuvem
 * ~3× maior e encaixar M nela com `selecionarPorMalha`, que devolve o número
 * exato e espacialmente equilibrado.
 *
 * Célula minúscula com borda grossa não comporta M: a escada de borda afrouxa
 * (d, d/2, d/4, 0) e, no limite, devolve o que houver — nunca zero, porque uma
 * área sem furo nenhum é uma amostra que o campo não sabe coletar.
 */
export function pontosDaCelula(p: ParamsSubamostras): { lng: number; lat: number }[] {
  const M = Math.max(1, Math.round(p.subamostras));
  const fc: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: p.celula.geometry }],
  };
  const areaHa = p.celula.areaHa > 0 ? p.celula.areaHa : areaM2Geo(p.celula.geometry) / 10000;
  const dens = areaHa / (M * 3);
  if (!(dens > 0)) return [];
  const modo = p.modo ?? 'inteligente';

  let melhor: { lng: number; lat: number }[] = [];
  for (const d of [p.distanciaBordaM, p.distanciaBordaM / 2, p.distanciaBordaM / 4, 0]) {
    const cands = gerarGrid({
      geojson: fc, densidadeHaPonto: dens, distanciaBordaM: d,
      rotacaoGraus: p.rotacaoGraus, aleatoriedade: p.aleatoriedade, seed: p.seed, modo,
    });
    if (cands.length > melhor.length) melhor = cands.map(c => ({ lng: c.lng, lat: c.lat }));
    if (cands.length >= M) {
      const sel = selecionarPorMalha(
        cands, M,
        { geojson: fc, densidadeHaPonto: dens, distanciaBordaM: d, rotacaoGraus: p.rotacaoGraus, modo },
        p.seed, p.aleatoriedade,
      );
      // `cands` já vem em serpentina e o filtro preserva a ordem.
      const out = cands.filter((_, i) => sel.has(i)).map(c => ({ lng: c.lng, lat: c.lat }));
      if (out.length === M) return out;
      if (out.length > M) return out.slice(0, M);
      return cands.slice(0, M).map(c => ({ lng: c.lng, lat: c.lat }));
    }
  }
  if (melhor.length) return melhor.slice(0, M);
  const pi = pontoInterno(fc, 0);
  return pi ? [pi] : [];
}
