// Laboratório de Zonas (Condutividade C4.2 / spec §290 "Visão Futura" + §240
// "Comparação de Zonas"). Funções PURAS que comparam CENÁRIOS de zoneamento já
// salvos (ZoneamentoMeap) — não gera nada, só mede:
//   - resumoCenario: métricas por cenário para a tabela-bancada;
//   - idMelhorCenario: o de menor CV médio (zonas mais homogêneas);
//   - areaPorPotencial: área por classe de potencial (barras A×B);
//   - concordanciaEspacial: % de área onde A e B classificam o potencial no
//     mesmo TERÇO (alto/médio/baixo) — robusto a nº de zonas diferente.
//
// Ponto-em-polígono e a faixa de homogeneidade são reaproveitados de ./cv.

import { pontoEmGeometria, faixaHomogeneidade } from './cv';
import type { Homogeneidade } from './tipos';
import type { ZoneamentoMeap } from '../store';

type FC = GeoJSON.FeatureCollection;

// ── Geometria auxiliar ───────────────────────────────────────────────────────
function bboxDe(fc: FC): [number, number, number, number] | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const varrer = (pos: GeoJSON.Position[]) => {
    for (const [x, y] of pos) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  };
  const anel = (rings: GeoJSON.Position[][]) => rings.forEach(varrer);
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') anel(g.coordinates);
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(anel);
  }
  return isFinite(x0) ? [x0, y0, x1, y1] : null;
}

// rank do potencial (1 = maior potencial) no ponto; null se fora de todas as zonas.
function rankNoPonto(lng: number, lat: number, fc: FC): number | null {
  for (const f of fc.features) {
    if (f.geometry && pontoEmGeometria(lng, lat, f.geometry)) {
      const r = (f.properties as Record<string, unknown> | null)?.potencialRank;
      return typeof r === 'number' ? r : null;
    }
  }
  return null;
}

function nZonasDe(fc: FC): number {
  let mx = 1;
  for (const f of fc.features) {
    const r = (f.properties as Record<string, unknown> | null)?.potencialRank;
    if (typeof r === 'number' && r > mx) mx = r;
  }
  return mx;
}

// Terço do potencial (0 = maior potencial). Normaliza pelo nº de zonas, então
// cenários com nº de zonas diferente ficam comparáveis (alto/médio/baixo).
function terco(rank: number, n: number): 'alto' | 'medio' | 'baixo' {
  if (n <= 1) return 'medio';
  const p = (rank - 1) / (n - 1);
  return p < 1 / 3 ? 'alto' : p < 2 / 3 ? 'medio' : 'baixo';
}

// ── Concordância espacial A×B ────────────────────────────────────────────────
export interface Concordancia { concordancia: number; n: number; }

export function concordanciaEspacial(a: FC, b: FC, nAlvo = 2500): Concordancia {
  const ba = bboxDe(a), bb = bboxDe(b);
  if (!ba || !bb) return { concordancia: 0, n: 0 };
  const x0 = Math.max(ba[0], bb[0]), y0 = Math.max(ba[1], bb[1]);
  const x1 = Math.min(ba[2], bb[2]), y1 = Math.min(ba[3], bb[3]);
  if (x1 <= x0 || y1 <= y0) return { concordancia: 0, n: 0 };
  const lado = Math.max(10, Math.round(Math.sqrt(nAlvo)));
  const nA = nZonasDe(a), nB = nZonasDe(b);
  let iguais = 0, total = 0;
  for (let ix = 0; ix < lado; ix++) {
    const lng = x0 + (x1 - x0) * (ix + 0.5) / lado;
    for (let iy = 0; iy < lado; iy++) {
      const lat = y0 + (y1 - y0) * (iy + 0.5) / lado;
      const ra = rankNoPonto(lng, lat, a);
      if (ra == null) continue;
      const rb = rankNoPonto(lng, lat, b);
      if (rb == null) continue;
      total++;
      if (terco(ra, nA) === terco(rb, nB)) iguais++;
    }
  }
  return { concordancia: total ? iguais / total : 0, n: total };
}

// ── Área por classe de potencial (barras A×B) ────────────────────────────────
export interface AreaPotencial { rank: number; classe: string; cor: string; areaHa: number; perc: number; }

export function areaPorPotencial(fc: FC): AreaPotencial[] {
  const acc = new Map<number, { classe: string; cor: string; areaHa: number }>();
  for (const f of fc.features) {
    const p = (f.properties as Record<string, unknown> | null) ?? {};
    const rank = typeof p.potencialRank === 'number' ? p.potencialRank : 0;
    const areaHa = typeof p.areaHa === 'number' ? p.areaHa : 0;
    const cur = acc.get(rank) ?? { classe: String(p.classe ?? `Zona ${rank}`), cor: String(p.cor ?? '#64748b'), areaHa: 0 };
    cur.areaHa += areaHa;
    acc.set(rank, cur);
  }
  const total = [...acc.values()].reduce((s, z) => s + z.areaHa, 0) || 1;
  return [...acc.entries()]
    .map(([rank, z]) => ({ rank, classe: z.classe, cor: z.cor, areaHa: z.areaHa, perc: z.areaHa / total }))
    .sort((x, y) => x.rank - y.rank);
}

// ── Resumo por cenário (linha da tabela-bancada) ─────────────────────────────
export interface ResumoCenario {
  id: string; nome: string; padrao: boolean;
  algoritmo: string; nZonas: number; nPoligonos: number; areaMinHa: number;
  cvMedio: number | null; homogeneidade: Homogeneidade | null;
  areaTotalHa: number; areaMediaZonaHa: number;
  camadasTxt: string; pesosTxt: string;
}

export function resumoCenario(z: ZoneamentoMeap): ResumoCenario {
  const areaTotalHa = z.fc.features.reduce((s, f) => {
    const a = (f.properties as Record<string, unknown> | null)?.areaHa;
    return s + (typeof a === 'number' ? a : 0);
  }, 0);
  const nZonas = z.meta.nZonas || z.meta.nPotenciais || nZonasDe(z.fc);
  const pesos = z.meta.pesos ?? {};
  const naoUnitarios = Object.entries(pesos).filter(([, v]) => v !== 1);
  return {
    id: z.id, nome: z.nome, padrao: z.padrao,
    algoritmo: z.meta.algoritmo, nZonas,
    nPoligonos: z.meta.nPoligonos ?? z.fc.features.length,
    areaMinHa: z.meta.areaMinHa,
    cvMedio: z.meta.cvMedio ?? null,
    homogeneidade: z.meta.cvMedio != null ? faixaHomogeneidade(z.meta.cvMedio) : null,
    areaTotalHa,
    areaMediaZonaHa: nZonas > 0 ? areaTotalHa / nZonas : 0,
    camadasTxt: (z.meta.camadas ?? []).join(', '),
    pesosTxt: naoUnitarios.length ? naoUnitarios.map(([k, v]) => `${k} ${v}×`).join(', ') : '',
  };
}

// Melhor cenário = menor CV médio (zonas mais homogêneas). null se nenhum tem CV.
export function idMelhorCenario(zs: ZoneamentoMeap[]): string | null {
  let melhor: string | null = null, menor = Infinity;
  for (const z of zs) {
    if (z.meta.cvMedio != null && z.meta.cvMedio < menor) { menor = z.meta.cvMedio; melhor = z.id; }
  }
  return melhor;
}
