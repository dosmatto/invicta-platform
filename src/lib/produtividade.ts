'use client';

// Módulo de Mapas de Colheita (Módulo 12) — motor do front (P1).
// Importa pontos de colheita (CSV ou SHP zip), limpa (zeros + outliers),
// interpola por IDW (reusa o backend) e calcula estatísticas. Unidade interna
// SEMPRE kg/ha (a exibição converte para sc/ha ou t/ha). Ver FS-12 (PRODUTIVIDADE.docx).

import { interpolar, rampaDaLegenda, decodeGrid, type RespInterp } from '@/lib/fertilidade';
import { getLegendasPorAtributo } from '@/lib/store';
import { parseShapefile } from '@/lib/geo';
import type { Legenda } from '@/lib/legendas';
import { postBackend } from '@/lib/interpUrl';

export interface PontoColheita { lng: number; lat: number; valor: number; }
export type Unidade = 'kg/ha' | 'sc/ha' | 't/ha';
export interface ParamsLimpeza {
  removerZeros: boolean;
  pLo: number;          // percentil inferior p/ cortar outliers baixos (ex.: 2)
  pHi: number;          // percentil superior (ex.: 98)
  min: number | null;   // faixa absoluta opcional (kg/ha); null = usa percentil
  max: number | null;
  pixelM: number;       // resolução do raster (m)
}

export const PARAMS_PADRAO: ParamsLimpeza = { removerZeros: true, pLo: 2, pHi: 98, min: null, max: null, pixelM: 10 };
export const SACA_KG = 60;

// ── CSV ─────────────────────────────────────────────────────────────────────
export interface CsvParsed { delim: string; colunas: string[]; linhas: string[][]; }

export function parseCsvTexto(texto: string): CsvParsed {
  const linhasTxt = texto.replace(/\r/g, '').split('\n').filter(l => l.trim() !== '');
  if (!linhasTxt.length) return { delim: ';', colunas: [], linhas: [] };
  const head = linhasTxt[0];
  const delim = [';', ',', '\t'].map(d => ({ d, n: head.split(d).length })).sort((a, b) => b.n - a.n)[0].d;
  const colunas = head.split(delim).map(s => s.trim());
  const linhas = linhasTxt.slice(1).map(l => l.split(delim));
  return { delim, colunas, linhas };
}

export function autoColunas(colunas: string[]): { lat: string; lng: string; valor: string } {
  const acha = (re: RegExp) => colunas.find(c => re.test(c)) ?? '';
  const lat = acha(/^lat|latitude/i);
  const lng = acha(/^lon|^lng|longitude/i);
  const valor = acha(/prod|rend|yield|colh|massa|kg/i) || colunas.find(c => c !== lat && c !== lng) || '';
  return { lat, lng, valor };
}

export function pontosDeCsv(p: CsvParsed, mapa: { lat: string; lng: string; valor: string }): PontoColheita[] {
  const iLat = p.colunas.indexOf(mapa.lat), iLng = p.colunas.indexOf(mapa.lng), iVal = p.colunas.indexOf(mapa.valor);
  if (iLat < 0 || iLng < 0 || iVal < 0) return [];
  const out: PontoColheita[] = [];
  for (const ln of p.linhas) {
    const lat = parseFloat((ln[iLat] ?? '').replace(',', '.'));
    const lng = parseFloat((ln[iLng] ?? '').replace(',', '.'));
    const valor = parseFloat((ln[iVal] ?? '').replace(',', '.'));
    if (isFinite(lat) && isFinite(lng) && isFinite(valor)) out.push({ lng, lat, valor });
  }
  return out;
}

// ── SHP (zip) → pontos ────────────────────────────────────────────────────────
export async function lerShapefilePontos(file: File): Promise<{ colunas: string[]; fc: GeoJSON.FeatureCollection }> {
  const r = await parseShapefile(file);
  const cols = new Set<string>();
  for (const f of r.geojson.features) {
    if (f.geometry?.type === 'Point') {
      Object.entries(f.properties ?? {}).forEach(([k, v]) => { if (typeof v === 'number' || (v != null && isFinite(Number(v)))) cols.add(k); });
    }
  }
  return { colunas: [...cols], fc: r.geojson };
}

export function pontosDeGeojson(fc: GeoJSON.FeatureCollection, colValor: string): PontoColheita[] {
  const out: PontoColheita[] = [];
  for (const f of fc.features) {
    if (f.geometry?.type !== 'Point') continue;
    const [lng, lat] = f.geometry.coordinates as [number, number];
    const valor = Number((f.properties ?? {})[colValor]);
    if (isFinite(lng) && isFinite(lat) && isFinite(valor)) out.push({ lng, lat, valor });
  }
  return out;
}

// ── Limpeza ───────────────────────────────────────────────────────────────────
function percentil(sortedAsc: number[], q: number): number {
  if (!sortedAsc.length) return 0;
  const i = Math.min(sortedAsc.length - 1, Math.max(0, Math.round((q / 100) * (sortedAsc.length - 1))));
  return sortedAsc[i];
}

export function limpar(pontos: PontoColheita[], p: ParamsLimpeza): { usados: PontoColheita[]; removidos: number; limites: [number, number] } {
  const base = p.removerZeros ? pontos.filter(pt => pt.valor > 0) : pontos;
  const vals = base.map(pt => pt.valor).sort((a, b) => a - b);
  const lo = p.min != null ? p.min : percentil(vals, p.pLo);
  const hi = p.max != null ? p.max : percentil(vals, p.pHi);
  const usados = base.filter(pt => pt.valor >= lo && pt.valor <= hi);
  return { usados, removidos: pontos.length - usados.length, limites: [lo, hi] };
}

// ── Interpolação IDW (reusa o backend de fertilidade) ─────────────────────────
export async function interpolarColheita(pontos: PontoColheita[], poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon, legenda: Legenda, pixelM: number): Promise<RespInterp> {
  if (pontos.length < 3) throw new Error('Poucos pontos válidos após a limpeza (mínimo 3).');
  const { dominio, stops } = rampaDaLegenda(legenda);
  return interpolar({ pontos, poligono, dominio, stops, metodo: 'idw', pixelM });
}

// ── Estatísticas a partir do raster (kg/ha) ──────────────────────────────────
export interface StatsProd {
  nUsados: number; areaHa: number; producaoTotalKg: number;
  mediaKgha: number; minKgha: number; maxKgha: number; cv: number;
  histograma: { x0: number; x1: number; n: number }[];
}

export function statsDoGrid(resp: RespInterp, nUsados: number): StatsProd | null {
  if (!resp.grid) return null;
  const { valores } = decodeGrid(resp.grid);
  let n = 0, soma = 0, somaSq = 0, mn = Infinity, mx = -Infinity;
  for (let i = 0; i < valores.length; i++) {
    const v = valores[i]; if (!isFinite(v)) continue;
    n++; soma += v; somaSq += v * v; if (v < mn) mn = v; if (v > mx) mx = v;
  }
  if (!n) return null;
  const pixelM = resp.stats?.pixel_m ?? 10;
  const pixelHa = (pixelM * pixelM) / 10000;
  const media = soma / n;
  const variancia = Math.max(0, somaSq / n - media * media);
  const cv = media > 0 ? (Math.sqrt(variancia) / media) * 100 : 0;
  // Histograma (10 classes entre mín e máx).
  const NB = 10; const larg = (mx - mn) / NB || 1;
  const hist = Array.from({ length: NB }, (_, b) => ({ x0: mn + b * larg, x1: mn + (b + 1) * larg, n: 0 }));
  for (let i = 0; i < valores.length; i++) {
    const v = valores[i]; if (!isFinite(v)) continue;
    let b = Math.floor((v - mn) / larg); if (b < 0) b = 0; if (b >= NB) b = NB - 1;
    hist[b].n++;
  }
  return {
    nUsados,
    areaHa: Math.round(n * pixelHa * 100) / 100,
    producaoTotalKg: Math.round(soma * pixelHa),
    mediaKgha: Math.round(media),
    minKgha: Math.round(mn),
    maxKgha: Math.round(mx),
    cv: Math.round(cv * 10) / 10,
    histograma: hist,
  };
}

// ── Legenda por cultura + unidade ─────────────────────────────────────────────
export function legendaDaCultura(cultura: string): Legenda | undefined {
  const legs = getLegendasPorAtributo('produtividade').filter(l => l.unidade === 'kg/ha');
  const c = (cultura || '').toLowerCase();
  const achou = legs.find(l => {
    const m = (l.metodo || '').toLowerCase();
    return m && (m.includes(c) || (c && c.includes(m.split('/')[0])));
  });
  return achou ?? legs[0] ?? getLegendasPorAtributo('produtividade')[0];
}

export function emUnidade(kgha: number, u: Unidade): number {
  if (u === 'sc/ha') return kgha / SACA_KG;
  if (u === 't/ha') return kgha / 1000;
  return kgha;
}

export function rotuloUnidade(u: Unidade): string {
  return u === 'sc/ha' ? 'sc/ha' : u === 't/ha' ? 't/ha' : 'kg/ha';
}

// ── Pipeline de limpeza OFICIAL (porte do script QGIS → backend) ──────────────
export interface ParamsColheita {
  multiplicador: number;
  hard_min: number; hard_max: number;
  corrigir_colhedora: boolean; limite_colhedora: number; peso_colhedora: number; min_points_colhedora: number;
  corrigir_colhedora_local: boolean;
  mf_global_v: number; mf_local_r: number; mf_local_v: number; mf_aniso_tol: number; mf_min_neighbors: number;
}
export const PARAMS_COLHEITA_PADRAO: ParamsColheita = {
  multiplicador: 1, hard_min: 0, hard_max: 15000,
  corrigir_colhedora: true, limite_colhedora: 0.08, peso_colhedora: 0.8, min_points_colhedora: 100,
  corrigir_colhedora_local: false,
  mf_global_v: 0.35, mf_local_r: 30, mf_local_v: 0.10, mf_aniso_tol: 20, mf_min_neighbors: 4,
};

export interface RelatorioColheita {
  n_bruto: number; n_apos_filtro_bruto: number;
  mapfilter_global_removidos: number; mapfilter_local_removidos: number;
  n_usados: number; media_calculada: number; fator_media_real?: number;
  correcao_colhedora_global?: { med_geral: number; maquinas_corrigidas: number };
  correcao_colhedora_local_corrigidos?: number;
}

// Sugere limites do filtro bruto pelos percentis (porte de suggest_raw_filter_limits).
export function sugerirFiltroBruto(valores: number[]): { min: number; max: number } {
  const v = valores.filter(x => x > 0).sort((a, b) => a - b);
  if (v.length < 20) return { min: 0, max: 15000 };
  const pct = (q: number) => v[Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))))];
  const med = pct(0.5), p005 = pct(0.005), p995 = pct(0.995), p999 = pct(0.999);
  const min = med <= 0 ? 0 : Math.max(0, Math.min(Math.max(p005 * 0.8, med * 0.1), med * 0.6));
  let max = med <= 0 ? (p999 || v[v.length - 1]) : Math.min(Math.max(p995 * 1.25, med * 3), Math.max(p999 * 1.1, med * 4));
  max = Math.min(Math.max(max, med * 1.5), 25000);
  return { min: Math.round(min), max: Math.round(max) };
}

export async function processarColheita(params: {
  machines: { nome: string; pontos: PontoColheita[] }[];
  cleaning: ParamsColheita;
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  pixelM: number;
  mediaRealKgha: number;
  legenda: Legenda;
}): Promise<RespInterp & { relatorio: RelatorioColheita }> {
  const { dominio, stops } = rampaDaLegenda(params.legenda);
  const r = await postBackend('/colheita-processar', {
    machines: params.machines, params: params.cleaning, poligono: params.poligono,
    pixel_m: params.pixelM, media_real: params.mediaRealKgha, dominio, stops,
  });
  if (!r.ok) {
    let msg = `Backend respondeu ${r.status}`;
    try { const j = await r.json(); if (j?.detail) msg = String(j.detail); } catch {}
    throw new Error(msg);
  }
  return r.json();
}

// ── Unificação de máquinas ────────────────────────────────────────────────────
// Junta os pontos de todas as máquinas. Se `normalizar`, escala cada máquina
// para uma MÉDIA COMUM (média das médias por máquina) — corrige diferenças de
// calibração entre monitores. (Substituível pelo script oficial da Invicta.)
export interface Maquina { id: string; nome: string; arquivo: string; pontos: PontoColheita[]; }

export function unificar(maquinas: Maquina[], normalizar: boolean): { pontos: PontoColheita[]; medias: { nome: string; media: number; fator: number; n: number }[] } {
  const infos = maquinas.map(m => {
    const nz = m.pontos.filter(p => p.valor > 0);
    const media = nz.length ? nz.reduce((s, p) => s + p.valor, 0) / nz.length : 0;
    return { m, media };
  });
  const validas = infos.filter(i => i.media > 0);
  const alvo = validas.length ? validas.reduce((s, i) => s + i.media, 0) / validas.length : 0;
  const pontos: PontoColheita[] = [];
  const medias = infos.map(i => {
    const fator = normalizar && i.media > 0 && alvo > 0 ? alvo / i.media : 1;
    for (const p of i.m.pontos) pontos.push({ lng: p.lng, lat: p.lat, valor: p.valor * fator });
    return { nome: i.m.nome, media: Math.round(i.media), fator: Math.round(fator * 1000) / 1000, n: i.m.pontos.length };
  });
  return { pontos, medias };
}

// ── Calibração pela média real (ajuste do mapa) ───────────────────────────────
function f32ParaB64(a: Float32Array): string {
  const u8 = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = ''; const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode(...u8.subarray(i, i + CH));
  return btoa(s);
}

// Escala o raster para que a MÉDIA dele bata com a média real informada
// (mantém o padrão espacial). mediaRealKgha em kg/ha.
export function calibrarGrid(resp: RespInterp, mediaRealKgha: number): RespInterp {
  if (!resp.grid || !(mediaRealKgha > 0)) return resp;
  const { valores } = decodeGrid(resp.grid);
  let n = 0, soma = 0;
  for (let i = 0; i < valores.length; i++) { const v = valores[i]; if (isFinite(v)) { n++; soma += v; } }
  if (!n) return resp;
  const media = soma / n;
  if (media <= 0) return resp;
  const k = mediaRealKgha / media;
  const out = new Float32Array(valores.length);
  for (let i = 0; i < valores.length; i++) { const v = valores[i]; out[i] = isFinite(v) ? v * k : NaN; }
  return { ...resp, grid: { b64: f32ParaB64(out), shape: resp.grid.shape } };
}
