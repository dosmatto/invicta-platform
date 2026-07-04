'use client';

// MDE F4.c — Relatório PDF do MDE (spec §17). A4 paisagem, 2 páginas:
//  1) Cabeçalho + estatísticas + área por classe topográfica e por classe de
//     declividade + observações agronômicas automáticas.
//  2) Mapas: altitude, declividade, TPI, TWI e classes topográficas
//     (compostos sobre o satélite, reusando capturarMapaFertilidade).
// Reaproveita o padrão jsPDF dos relatórios de fertilidade/cenários.

import type { jsPDF as JsPDF } from 'jspdf';
import { capturarMapaFertilidade } from './capturaMapa';
import { colorirGrid } from './raster';
import { extrairPoligono, decodeGrid, type Grid } from './fertilidade';
import { getTalhoes, getFazendas, getClientes, getPlantio, type MdeTalhao } from './store';
import { abrirOuBaixar } from './recomendacao/relatorioCenarios';
import type { RespMdeAnalise } from './mde';

type RGB = [number, number, number];
const NAVY: RGB = [13, 33, 64];
const GREEN: RGB = [31, 90, 26];
const GRAY: RGB = [100, 116, 139];
const LINE: RGB = [210, 219, 232];
const fmt = (v: number, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const san = (s: string | null | undefined): string => (s ?? '').replace(/[^\x00-\xFF]/g, '');

// Rampas de cor dos mapas (stops [t, [r,g,b]]).
const STOP_HYPSO: [number, RGB][] = [[0, [0, 104, 55]], [0.5, [255, 235, 130]], [1, [140, 81, 45]]];
const STOP_DECL: [number, RGB][] = [[0, [26, 152, 80]], [0.5, [254, 224, 139]], [1, [165, 0, 38]]];
const STOP_TPI: [number, RGB][] = [[0, [29, 78, 216]], [0.5, [248, 250, 252]], [1, [109, 76, 65]]];
const STOP_TWI: [number, RGB][] = [[0, [253, 230, 138]], [0.5, [56, 189, 248]], [1, [30, 58, 138]]];

// Classes de declividade (graus) — mesmos limites da aba (Embrapa).
const DECL_CLASSES = [
  { nome: 'Plano (0–1,7°)', max: 1.7 },
  { nome: 'Suave ondulado (–4,6°)', max: 4.6 },
  { nome: 'Ondulado (–11°)', max: 11 },
  { nome: 'Forte ondulado (–24°)', max: 24 },
  { nome: 'Montanhoso (>24°)', max: Infinity },
];

function carregarImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => res(img); img.onerror = () => rej(new Error('img')); img.src = src; });
}

function cellHa(bounds: [number, number, number, number], shape: [number, number]): number {
  const [w, s, e, n] = bounds;
  const latC = (s + n) / 2;
  const wM = (e - w) * 111320 * Math.cos((latC * Math.PI) / 180);
  const hM = (n - s) * 111320;
  return ((wM / shape[1]) * (hM / shape[0])) / 10000;
}

// Área por classe de declividade (binning do grid da base).
function areasDeclividade(decl: Grid, bounds: [number, number, number, number]): { nome: string; ha: number; pct: number }[] {
  const { valores } = decodeGrid(decl);
  const ch = cellHa(bounds, decl.shape);
  const cont = new Array(DECL_CLASSES.length).fill(0);
  let tot = 0;
  for (let i = 0; i < valores.length; i++) {
    const v = valores[i];
    if (!isFinite(v)) continue;
    tot++;
    const k = DECL_CLASSES.findIndex(c => v <= c.max);
    cont[k < 0 ? DECL_CLASSES.length - 1 : k]++;
  }
  return DECL_CLASSES.map((c, i) => ({ nome: c.nome, ha: cont[i] * ch, pct: tot ? (100 * cont[i]) / tot : 0 }))
    .filter(r => r.ha > 0);
}

// Observações agronômicas automáticas (determinísticas, a partir das áreas).
function observacoes(analise: RespMdeAnalise, oficial: MdeTalhao, decls: { nome: string; pct: number }[]): string[] {
  const obs: string[] = [];
  const cls = [...analise.meta.classes].sort((a, b) => b.pct - a.pct);
  if (cls[0]) obs.push(`Relevo predominante: ${cls[0].nome.toLowerCase()} (${fmt(cls[0].pct)}% da área).`);
  const risco = cls.find(c => c.codigo === 7);
  if (risco) obs.push(`${fmt(risco.pct)}% da área em risco de erosão (alta declividade + fluxo concentrado) — priorizar conservação.`);
  const acumulo = cls.filter(c => c.codigo === 4 || c.codigo === 5).reduce((s, c) => s + c.pct, 0);
  if (acumulo > 5) obs.push(`${fmt(acumulo)}% em baixadas/depressões — tendência de acúmulo de água; atenção à drenagem e à compactação.`);
  const fluxo = cls.find(c => c.codigo === 6);
  if (fluxo) obs.push(`${fmt(fluxo.pct)}% em linhas de fluxo — caminhos preferenciais de enxurrada; evitar tráfego no sentido do declive.`);
  const amp = oficial.stats.amplitude;
  obs.push(amp < 5 ? 'Amplitude altimétrica baixa — relevo praticamente plano.' : `Amplitude de ${fmt(amp)} m no talhão.`);
  const declOnd = decls.filter(d => /ondulado|montanhoso/i.test(d.nome)).reduce((s, d) => s + d.pct, 0);
  if (declOnd > 20) obs.push(`${fmt(declOnd)}% da área com declividade ondulada ou maior — avaliar terraços e tráfego controlado.`);
  obs.push('Base derivada de MDE global (30 m): visão geral do relevo; não substitui levantamento topográfico de precisão.');
  return obs;
}

interface Ctx { produtor: string; fazenda: string; talhao: string; area: number; cultura: string; poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon; }
const VAZIO: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export async function gerarPdfMde(params: {
  talhaoId: string;
  oficial: MdeTalhao;
  analise: RespMdeAnalise;
  elevacao: Grid;
  declividade: Grid;
  baseBounds: [number, number, number, number];
  safraNome?: string;
}): Promise<void> {
  const { talhaoId, oficial, analise, elevacao, declividade, baseBounds } = params;
  const tal = getTalhoes().find(t => t.id === talhaoId) ?? null;
  const faz = tal ? getFazendas().find(f => f.id === tal.fazendaId) ?? null : null;
  const cli = faz ? getClientes().find(c => c.id === faz.clienteId) ?? null : null;
  const poligono = tal?.geojson ? (() => { try { return extrairPoligono(JSON.parse(tal.geojson!)); } catch { return null; } })() : null;
  if (!poligono) throw new Error('Talhão sem polígono salvo — não dá para desenhar os mapas.');
  const ctx: Ctx = { produtor: cli?.nome ?? '', fazenda: faz?.nome ?? '', talhao: tal?.nome ?? '', area: tal?.areaHa ?? 0, cultura: (params.safraNome ? getPlantio(talhaoId, params.safraNome) : '') || '', poligono };

  const aba = typeof window !== 'undefined' ? window.open('', '_blank') : null;
  try {
    const rTpi = analise.meta.ranges.tpi ?? [-1, 1];
    const rTwi = analise.meta.ranges.twi ?? [0, 20];
    // Colore os grids → composita sobre o satélite.
    const mapas = await Promise.all(([
      ['Altitude', colorirGrid(elevacao, [oficial.stats.alt_min, oficial.stats.alt_max], STOP_HYPSO).dataUrl, baseBounds],
      ['Declividade', colorirGrid(declividade, [0, Math.max(24, oficial.stats.decl_max ?? 24)], STOP_DECL).dataUrl, baseBounds],
      ['TPI (posição)', colorirGrid(analise.grids.tpi, rTpi, STOP_TPI).dataUrl, analise.bounds],
      ['TWI (umidade)', colorirGrid(analise.grids.twi, rTwi, STOP_TWI).dataUrl, analise.bounds],
      ['Classes de relevo', analise.pngs.classes, analise.bounds],
    ] as [string, string, [number, number, number, number]][]).map(async ([titulo, png, bounds]) => {
      try { return { titulo, img: await capturarMapaFertilidade({ rasterPng: png, bounds, poligono, valores: VAZIO, satelite: true, corLimite: '#ffffff', larguraPx: 620, alturaPx: 460 }) }; }
      catch { return { titulo, img: null }; }
    }));

    const decls = areasDeclividade(declividade, baseBounds);
    const obs = observacoes(analise, oficial, decls);
    const logo = await carregarImg('/images/logo-branca.png').catch(() => null);

    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    paginaResumo(doc, ctx, oficial, analise, decls, obs, logo);
    doc.addPage();
    paginaMapas(doc, ctx, oficial, mapas, logo);

    abrirOuBaixar(doc.output('blob'), aba, `mde-${san(ctx.talhao) || 'talhao'}.pdf`);
  } catch (e) {
    if (aba) aba.close();
    throw e;
  }
}

function cabecalho(doc: JsPDF, ctx: Ctx, oficial: MdeTalhao, titulo: string, logo: HTMLImageElement | null) {
  const W = 297, M = 6;
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 22, 'F');
  if (logo) { const h = 11, w = h * (logo.naturalWidth / logo.naturalHeight); doc.addImage(logo, 'PNG', M, 5.5, w, h); }
  const campos: [string, string][] = [['PRODUTOR', ctx.produtor], ['FAZENDA', ctx.fazenda], ['TALHÃO', ctx.talhao], ['FONTE', oficial.rotuloFonte]];
  let cx = 46;
  for (const [lb, val] of campos) {
    doc.setFontSize(6.5); doc.setTextColor(127, 163, 207); doc.setFont('helvetica', 'normal'); doc.text(san(lb), cx, 9);
    doc.setFontSize(9); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.text(san(val) || '—', cx, 14);
    cx += Math.max(30, san(val).length * 1.9 + 16);
  }
  doc.setFillColor(20, 50, 87); doc.roundedRect(W - M - 64, 4, 64, 14, 2, 2, 'F');
  doc.setFontSize(9); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.text(san(titulo), W - M - 32, 9.5, { align: 'center' });
  doc.setFontSize(7.5); doc.setTextColor(127, 163, 207); doc.setFont('helvetica', 'normal'); doc.text(`${fmt(ctx.area, 1)} ha · ${oficial.resolucaoM} m`, W - M - 32, 14.5, { align: 'center' });
}

function paginaResumo(doc: JsPDF, ctx: Ctx, oficial: MdeTalhao, analise: RespMdeAnalise, decls: { nome: string; ha: number; pct: number }[], obs: string[], logo: HTMLImageElement | null) {
  const W = 297, M = 6;
  cabecalho(doc, ctx, oficial, 'RELATÓRIO TOPOGRÁFICO', logo);
  doc.setFontSize(13); doc.setTextColor(...GREEN); doc.setFont('helvetica', 'bold');
  doc.text('MDE + Análise Topográfica', M, 30);

  // Estatísticas
  const st = oficial.stats;
  const cards: [string, string][] = [
    ['Altitude mínima', `${fmt(st.alt_min, 1)} m`], ['Altitude média', `${fmt(st.alt_med, 1)} m`], ['Altitude máxima', `${fmt(st.alt_max, 1)} m`],
    ['Amplitude', `${fmt(st.amplitude, 1)} m`], ['Declividade média', st.decl_media != null ? `${fmt(st.decl_media, 1)}°` : '—'],
  ];
  let x = M; const cw = (W - 2 * M - 4 * 4) / 5;
  for (const [lb, val] of cards) {
    doc.setFillColor(245, 247, 250); doc.setDrawColor(...LINE); doc.roundedRect(x, 34, cw, 16, 1.5, 1.5, 'FD');
    doc.setFontSize(7); doc.setTextColor(...GRAY); doc.setFont('helvetica', 'normal'); doc.text(san(lb), x + cw / 2, 40, { align: 'center' });
    doc.setFontSize(12); doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.text(val, x + cw / 2, 47, { align: 'center' });
    x += cw + 4;
  }

  // Duas tabelas: classe topográfica | classe de declividade
  const tw = (W - 2 * M - 8) / 2;
  tabela(doc, M, 56, tw, 'Área por classe de relevo', analise.meta.classes.map(c => [c.nome, `${fmt(c.ha, 1)} ha`, `${fmt(c.pct)}%`]), c => c);
  tabela(doc, M + tw + 8, 56, tw, 'Área por classe de declividade', decls.map(d => [d.nome, `${fmt(d.ha, 1)} ha`, `${fmt(d.pct)}%`]));

  // Observações automáticas
  let y = Math.max(56 + 12 + analise.meta.classes.length * 6.5, 56 + 12 + decls.length * 6.5) + 8;
  if (y > 150) y = 150;
  doc.setFontSize(10); doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.text('Observações agronômicas', M, y); y += 5.5;
  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(50, 60, 75);
  for (const o of obs) { const linhas = doc.splitTextToSize(`•  ${san(o)}`, W - 2 * M); doc.text(linhas, M, y); y += linhas.length * 4.4 + 1; }
}

function tabela(doc: JsPDF, x: number, y: number, w: number, titulo: string, linhas: string[][], _cor?: (s: string) => string) {
  doc.setFontSize(9.5); doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.text(san(titulo), x, y);
  let ry = y + 5;
  doc.setDrawColor(...LINE);
  for (const l of linhas) {
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(50, 60, 75);
    doc.text(san(l[0]), x + 1, ry);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
    doc.text(l[1], x + w - 26, ry, { align: 'right' });
    doc.text(l[2], x + w - 1, ry, { align: 'right' });
    doc.line(x, ry + 1.6, x + w, ry + 1.6);
    ry += 6.5;
  }
}

function paginaMapas(doc: JsPDF, ctx: Ctx, oficial: MdeTalhao, mapas: { titulo: string; img: string | null }[], logo: HTMLImageElement | null) {
  const W = 297, M = 6;
  cabecalho(doc, ctx, oficial, 'MAPAS DO RELEVO', logo);
  doc.setFontSize(12); doc.setTextColor(...GREEN); doc.setFont('helvetica', 'bold'); doc.text('Mapas topográficos', M, 30);
  const n = mapas.length, gap = 4, y = 34, mh = 92;
  const fw = (W - 2 * M - (n - 1) * gap) / n;
  for (let i = 0; i < n; i++) {
    const x = M + i * (fw + gap);
    doc.setFillColor(...NAVY); doc.rect(x, y, fw, 7, 'F');
    doc.setFontSize(7.5); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
    doc.text(san(mapas[i].titulo), x + fw / 2, y + 4.8, { align: 'center', maxWidth: fw - 3 });
    const img = mapas[i].img;
    if (img) doc.addImage(img, 'PNG', x, y + 7, fw, mh - 7);
    else { doc.setFillColor(240, 242, 245); doc.rect(x, y + 7, fw, mh - 7, 'F'); doc.setTextColor(...GRAY); doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.text('mapa indisponível', x + fw / 2, y + mh / 2, { align: 'center' }); }
  }
  doc.setFontSize(7.5); doc.setTextColor(...GRAY); doc.setFont('helvetica', 'normal');
  doc.text('Altitude (verde→marrom) · Declividade (verde→vermelho) · TPI (baixada→topo) · TWI (seco→úmido) · Classes de relevo. Base MDE 30 m — tendências topográficas.', M, y + mh + 6, { maxWidth: W - 2 * M });
}
