'use client';

// Comparador universal de camadas (Camada A × Camada B). Lista as camadas
// OFICIAIS/co-registráveis do talhão (Produtividade, NDVI, Fertilidade…) como
// grids no mesmo formato, e oferece correlação espacial + distribuição por classe.

import { getMapasProdutividade, getImportacoesLab, getLegendasPorAtributo } from '@/lib/store';
import { carregarGridsTalhao } from '@/lib/recomendacao/aplicar';
import { carregarNdviSalvos } from '@/lib/meap/gerar';
import { cloudCarregarMapasPorPrefixo } from '@/lib/cloud';
import { decodeGrid, descomprimirGrid, type Grid } from '@/lib/fertilidade';
import { legendaDaCultura } from '@/lib/produtividade';
import type { Legenda } from '@/lib/legendas';

export interface CamadaComparavel {
  id: string;
  grupo: 'Produtividade' | 'NDVI' | 'Fertilidade';
  nome: string;
  sub?: string;
  bounds: [number, number, number, number];
  grid: Grid;
  legenda: Legenda;
  unidade: string;
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const ddmm = (s?: string | null) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('pt-BR') : '—');

export async function listarCamadas(talhaoId: string, safra: string): Promise<CamadaComparavel[]> {
  const out: CamadaComparavel[] = [];

  // Produtividade (todas as versões salvas; marca a oficial)
  const prods = getMapasProdutividade(talhaoId, safra);
  if (prods.length) {
    const docs = await cloudCarregarMapasPorPrefixo<{ resp: { bounds: [number, number, number, number]; grid?: Grid } }>(`${talhaoId}__prod__`);
    for (const p of prods) {
      const doc = docs.find(d => d.id.endsWith(p.id));
      let grid = doc?.dados?.resp?.grid;
      if (grid?.comp === 'gz') { try { grid = await descomprimirGrid(grid); } catch { grid = undefined; } }
      const leg = legendaDaCultura(p.cultura);
      if (grid && leg && doc) out.push({ id: `prod_${p.id}`, grupo: 'Produtividade', nome: `${cap(p.cultura)} v${p.versao}${p.oficial ? ' (oficial)' : ''}`, bounds: doc.dados.resp.bounds, grid, legenda: leg, unidade: p.unidade });
    }
  }

  // NDVI mantidos
  const nd = await carregarNdviSalvos(talhaoId);
  const ndviLeg = getLegendasPorAtributo('ndvi')[0];
  if (ndviLeg) for (const n of nd) out.push({ id: `ndvi_${n.data}_${n.nut}`, grupo: 'NDVI', nome: `NDVI ${ddmm(n.data)}`, sub: n.nut === 'ndvi_cbers' ? 'CBERS' : 'S2', bounds: n.bounds, grid: { b64: n.b64, shape: n.shape }, legenda: ndviLeg, unidade: 'índice' });

  // Fertilidade (importação de laboratório mais recente)
  const imp = getImportacoesLab(talhaoId)[0];
  if (imp) {
    const grids = await carregarGridsTalhao(talhaoId, imp.id);
    for (const [chave, resp] of Object.entries(grids)) {
      if (!resp.grid?.b64) continue;
      const [nut, prof] = chave.split('__');
      const leg = getLegendasPorAtributo(nut)[0];
      if (leg) out.push({ id: `fert_${chave}`, grupo: 'Fertilidade', nome: `${leg.simbolo} ${prof}`, bounds: resp.bounds, grid: resp.grid, legenda: leg, unidade: leg.unidade });
    }
  }

  return out;
}

export interface StatsCamada { n: number; media: number; min: number; max: number; cv: number; }

export function statsCamada(grid: Grid): StatsCamada | null {
  const { valores } = decodeGrid(grid);
  let n = 0, soma = 0, somaSq = 0, mn = Infinity, mx = -Infinity;
  for (let i = 0; i < valores.length; i++) { const v = valores[i]; if (!isFinite(v)) continue; n++; soma += v; somaSq += v * v; if (v < mn) mn = v; if (v > mx) mx = v; }
  if (!n) return null;
  const media = soma / n;
  const cv = media !== 0 ? (Math.sqrt(Math.max(0, somaSq / n - media * media)) / Math.abs(media)) * 100 : 0;
  return { n, media, min: mn, max: mx, cv };
}

// Reamostragem bilinear NaN-aware (mesma extensão) p/ co-registrar B na malha de A.
function reamostrar(src: Float32Array, sr: number, sc: number, dr: number, dc: number): Float32Array {
  if (sr === dr && sc === dc) return src;
  const out = new Float32Array(dr * dc);
  for (let j = 0; j < dr; j++) {
    const fy = dr === 1 ? 0 : (j * (sr - 1)) / (dr - 1); const y0 = Math.floor(fy), y1 = Math.min(y0 + 1, sr - 1), wy = fy - y0;
    for (let i = 0; i < dc; i++) {
      const fx = dc === 1 ? 0 : (i * (sc - 1)) / (dc - 1); const x0 = Math.floor(fx), x1 = Math.min(x0 + 1, sc - 1), wx = fx - x0;
      const a = src[y0 * sc + x0], b = src[y0 * sc + x1], c = src[y1 * sc + x0], dd = src[y1 * sc + x1];
      let num = 0, den = 0;
      const w00 = (1 - wx) * (1 - wy), w01 = wx * (1 - wy), w10 = (1 - wx) * wy, w11 = wx * wy;
      if (isFinite(a)) { num += a * w00; den += w00; } if (isFinite(b)) { num += b * w01; den += w01; }
      if (isFinite(c)) { num += c * w10; den += w10; } if (isFinite(dd)) { num += dd * w11; den += w11; }
      out[j * dc + i] = den > 0 ? num / den : NaN;
    }
  }
  return out;
}

export interface Correlacao { r: number | null; amostra: { a: number; b: number }[]; }

// Correlação espacial entre A e B (B reamostrado p/ a malha de A). Amostra p/ scatter.
export function correlacao(a: Grid, b: Grid, maxAmostra = 500): Correlacao {
  const pa = decodeGrid(a); const pb = decodeGrid(b);
  const br = reamostrar(pb.valores, pb.rows, pb.cols, pa.rows, pa.cols);
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  const pares: { a: number; b: number }[] = [];
  for (let i = 0; i < pa.valores.length; i++) {
    const x = pa.valores[i], y = br[i];
    if (!isFinite(x) || !isFinite(y)) continue;
    n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
    pares.push({ a: x, b: y });
  }
  if (n < 30) return { r: null, amostra: [] };
  const cov = sxy / n - (sx / n) * (sy / n);
  const vx = sxx / n - (sx / n) ** 2, vy = syy / n - (sy / n) ** 2;
  const d = Math.sqrt(vx * vy);
  const r = d > 0 ? cov / d : null;
  // subamostra p/ o gráfico
  const passo = Math.max(1, Math.floor(pares.length / maxAmostra));
  const amostra = pares.filter((_, i) => i % passo === 0).slice(0, maxAmostra);
  return { r, amostra };
}

export interface ClasseArea { rotulo: string; cor: string; pct: number; }

function classeDe(v: number, leg: Legenda): number {
  const cls = leg.classes;
  for (let i = 0; i < cls.length; i++) { const mx = cls[i].valorMax; if (mx == null || v <= mx) return i; }
  return cls.length - 1;
}

// ── Matriz de fatores: o que explica a camada-alvo (ex.: Produtividade) ───────
export interface Fator { id: string; grupo: string; nome: string; r: number; }

// Correlaciona o ALVO com todas as outras camadas e ranqueia por |r|.
export function matrizFatores(alvo: CamadaComparavel, camadas: CamadaComparavel[]): Fator[] {
  const out: Fator[] = [];
  for (const c of camadas) {
    if (c.id === alvo.id) continue;
    const { r } = correlacao(alvo.grid, c.grid);
    if (r == null || !isFinite(r)) continue;
    out.push({ id: c.id, grupo: c.grupo, nome: c.nome, r });
  }
  out.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  return out;
}

// Texto de insight a partir dos fatores ranqueados.
export function insightFatores(alvoNome: string, fatores: Fator[]): string {
  const f = (x: number) => x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pos = fatores.filter(x => x.r >= 0.3).slice(0, 2);
  const neg = fatores.filter(x => x.r <= -0.3).slice(0, 2);
  if (!pos.length && !neg.length) return `Nenhum fator se correlaciona fortemente com ${alvoNome.toLowerCase()} neste talhão (todas as relações fracas).`;
  const partes: string[] = [];
  if (pos.length) partes.push(`acompanha ${pos.map(p => `${p.nome} (r=${f(p.r)})`).join(' e ')}`);
  if (neg.length) partes.push(`cai onde sobe ${neg.map(p => `${p.nome} (r=${f(p.r)})`).join(' e ')}`);
  return `Neste talhão, ${alvoNome.toLowerCase()} ${partes.join('; e ')}.`;
}

// % de área por classe da legenda (rótulo + cor de cada classe).
export function areaPorClasse(grid: Grid, leg: Legenda): ClasseArea[] {
  const { valores } = decodeGrid(grid);
  const cont = new Array(leg.classes.length).fill(0);
  let n = 0;
  for (let i = 0; i < valores.length; i++) { const v = valores[i]; if (!isFinite(v)) continue; cont[classeDe(v, leg)]++; n++; }
  if (!n) return [];
  return leg.classes.map((c, i) => ({ rotulo: c.nome, cor: c.corInicio ?? c.corFim ?? '#888888', pct: (cont[i] / n) * 100 }));
}
