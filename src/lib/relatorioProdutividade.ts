'use client';

// Relatório de Produtividade (Layout Oficial, A4 paisagem) — até 4 páginas:
//   1. Mapa ABSOLUTO (faixas fixas da cultura) — "esta lavoura é boa?"
//   2. Mapa por QUANTIL (faixas de área igual, cortes vindos dos dados) —
//      "onde, DENTRO dela, está o melhor e o pior?"
//   3. NDVI da cena escolhida (omitida quando não há índice mantido)
//   4. Resumo analítico: estatística + limpeza, dispersão NDVI × produtividade,
//      boxplot por zona de manejo e mini-mapa da média por zona.
//
// Cabeçalho, marca e rodapé vêm de pdfCabecalho.ts — os MESMOS de Fertilidade e
// Zonas ("em todos os layouts exatamente igual"). Os helpers locais (barra de
// legenda, escala, logos, saneamento) são duplicados de relatorioFertilidade.ts
// pelo mesmo motivo que relatorioZonas.ts os duplica: mexer lá mexeria num
// layout já aprovado em campo.

import type { jsPDF as JsPDF } from 'jspdf';
import type { Legenda } from './legendas';
import { rampaVisualStops, valorParaPosicaoVisual, dominioDaLegenda, ajustarL } from './legendas';
import { capturarMapaFertilidade, capturarMapaZonas } from './capturaMapa';
import { imagemParaPdf, reduzirLogo } from './pdfImagem';
import { rotuloAno, type Epoca } from './periodo';
import { nomeExport, periodoParaNome } from './nomeExport';
import { DATUM, MARCA_Y, desenharCabecalhoOficial, marcaInvicta, clipTexto } from './pdfCabecalho';
import { emUnidade, rotuloUnidade, type Unidade, type StatsProd, type RelatorioColheita } from './produtividade';
import { indiceFaixa, type ClassificacaoQuantis } from './quantis';
import type { CorrelacaoGrid } from './correlacaoGrid';
import type { ResumoValores } from './validacao/tipos';
import type { Separacao } from './validacao/estatistica';
import { nivelCobertura } from './cobertura';

// ── Entrada ──────────────────────────────────────────────────────────────────

export interface NdviRel {
  data: string;                                   // ISO 'AAAA-MM-DD'
  fonte: string;                                  // 'Sentinel-2' | 'CBERS-4A'
  indice: string;                                 // 'NDVI', 'NDRE'…
  rasterPng: string;
  bounds: [number, number, number, number];
  legenda: Legenda;
  media: number;
  /** Faixas por QUINTIL do próprio índice — a página 3 é classificada assim.
   *  null só quando a cena não tem pixels suficientes; aí cai na barra contínua. */
  quantis: ClassificacaoQuantis | null;
}

export interface ZonaRel {
  id: string;
  classe: string;
  cor: string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  /** Produtividade (kg/ha) dentro da zona. null = nenhum pixel caiu nela. */
  stats: ResumoValores | null;
  areaHa: number;
}

export interface DadosRelatorioProd {
  // Identificação
  fazenda: string; produtor: string; talhao: string; safra: string;
  cultura: string; areaHa: number; municipio: string; estado: string;
  siglaFazenda?: string | null;
  ano?: number | null;
  epoca?: Epoca | null;
  dataReferencia: string;            // ISO da colheita
  logoClienteUrl?: string | null;
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  satelite: boolean;
  corLimite: string;

  // Mapa
  unidade: Unidade;
  bounds: [number, number, number, number];
  pixelM: number;
  legenda: Legenda;
  rasterAbsolutoPng: string;
  rasterQuantilPng: string;
  quantis: ClassificacaoQuantis;
  stats: StatsProd;
  resumo: ResumoValores | null;
  limpeza: RelatorioColheita | null;
  /** Parâmetros arquivados com a versão salva (fallback quando `limpeza` é null). */
  cleaningSalvo?: Record<string, number | boolean> | null;
  nPontosSalvo?: number | null;
  versao?: number | null;
  nMaquinas?: number | null;
  mediaRealKgha?: number | null;

  // Análise
  ndvi: NdviRel | null;
  correlacao: CorrelacaoGrid | null;
  /** Sobreposição dos bbox produtividade × NDVI (0..1). < 0,98 = aviso. */
  sobreposicaoNdvi?: number | null;
  zonas: ZonaRel[];
  separacaoZonas: Separacao | null;

  /** Qualidade do dado de colheita. Ausente = mapa antigo, sem a conferência. */
  cobertura?: {
    pctCobertura: number;
    areaSemDadoHa: number;
    maiorVazioHa: number;
    raioM: number;
    recortado: boolean;
  } | null;
}

// ── Paleta e formatação (idênticas às de Fertilidade/Zonas) ──────────────────

const NAVY: [number, number, number] = [13, 33, 64];
const GRAY: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [210, 219, 232];
const VERM: [number, number, number] = [185, 28, 28];
const W = 297, H = 210, M = 6;
const PXMM = 8;                                   // ≈200 dpi na captura

const fmt = (v: number, d = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
// jsPDF (WinAnsi) não tem subscrito nem caractere fora do Latin-1.
const SUB = '₀₁₂₃₄₅₆₇₈₉';
const san = (s: string | null | undefined): string => (s ?? '')
  .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, c => '0123456789'[SUB.indexOf(c)])
  .replace(/[^\x00-\xFF]/g, '');
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const dataBR = (iso: string) => { const d = new Date(iso + 'T00:00:00'); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR'); };

const municipioUf = (d: { municipio: string; estado: string }): string => {
  const m = san(d.municipio), uf = san(d.estado);
  return m ? (uf ? `${m} - ${uf}` : m) : (uf || '—');
};

// Casas decimais por unidade — kg/ha é inteiro; sacas e toneladas pedem fração.
const casasDe = (u: Unidade) => (u === 'kg/ha' ? 0 : u === 'sc/ha' ? 1 : 2);
const emU = (kgha: number, u: Unidade) => fmt(emUnidade(kgha, u), casasDe(u));

function carregarImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(`falha ao carregar ${src}`));
    img.src = src;
  });
}

interface Logos { inv: HTMLImageElement | null; branca: HTMLImageElement | null; cli: HTMLImageElement | null }
async function carregarLogos(cliUrl?: string | null): Promise<Logos> {
  const inv = await carregarImg('/images/logo-colorida.png').catch(() => null);
  const cli = cliUrl ? await carregarImg(cliUrl).catch(() => null) : null;
  return {
    inv: inv ? await reduzirLogo(inv) : null,
    branca: await carregarImg('/images/logo-branca.png').catch(() => null),
    cli: cli ? await reduzirLogo(cli) : null,
  };
}

function barraLegenda(leg: Legenda, wPx: number, hPx: number): string {
  const cv = document.createElement('canvas'); cv.width = wPx; cv.height = hPx;
  const ctx = cv.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, wPx, 0);
  for (const [pos, [r, g, b]] of rampaVisualStops(leg)) {
    grad.addColorStop(Math.max(0, Math.min(1, pos)), `rgb(${r},${g},${b})`);
  }
  ctx.fillStyle = grad; ctx.fillRect(0, 0, wPx, hPx);
  return cv.toDataURL('image/png');
}

function nice(x: number): number {
  if (x <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / p;
  const nf = f >= 5 ? 5 : f >= 2.5 ? 2.5 : f >= 2 ? 2 : 1;
  return nf * p;
}

const hexRgb = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
  return m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)] : [148, 163, 184];
};

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

// ── Peças repetidas de página ────────────────────────────────────────────────

function rodape(doc: JsPDF, logos: Logos): void {
  doc.setFillColor(...NAVY); doc.rect(0, H - 10, W, 10, 'F');
  if (logos.branca) { const h = 5, w = h * (logos.branca.naturalWidth / logos.branca.naturalHeight); doc.addImage(logos.branca, 'PNG', M, H - 7.5, w, h); }
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  doc.text('INVICTA AP   |   Tecnologia que transforma dados em produtividade.', M + 26, H - 3.8);
  doc.setFont('helvetica', 'bold'); doc.text('www.invicta.agr.br', W - M, H - 3.8, { align: 'right' });
}

function rosaDosVentos(doc: JsPDF, x: number, y: number): void {
  doc.setFillColor(...NAVY); doc.roundedRect(x - 4.5, y - 5.5, 9, 11, 1, 1, 'F');
  doc.setFillColor(255, 255, 255); doc.triangle(x, y - 4, x - 2.2, y + 0.5, x + 2.2, y + 0.5, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(6);
  doc.text('N', x, y + 4, { align: 'center' });
}

// Escala gráfica centrada em `cx`, dimensionada pela largura real do terreno.
function escalaGrafica(doc: JsPDF, cx: number, y: number, bounds: [number, number, number, number], frameW: number, disponivel = 60): void {
  const [w0, s0, e0, n0] = bounds;
  const latC = (s0 + n0) / 2;
  const groundW = Math.max(1, (e0 - w0) * 111320 * Math.cos((latC * Math.PI) / 180));
  const niceMax = nice(groundW * (Math.min(50, disponivel) / frameW));
  const barLen = Math.min(disponivel, (niceMax / groundW) * frameW);
  const ex = cx - barLen / 2, ey = y + 2.5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY);
  doc.text('Escala', cx, y, { align: 'center' });
  for (let k = 0; k < 4; k++) {
    const sx = ex + (barLen / 4) * k;
    doc.setFillColor(...(k % 2 === 0 ? NAVY : [255, 255, 255] as [number, number, number]));
    doc.setDrawColor(...NAVY); doc.setLineWidth(0.2);
    doc.rect(sx, ey, barLen / 4, 2, k % 2 === 0 ? 'FD' : 'D');
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...GRAY);
  for (let k = 0; k <= 4; k++) {
    const sx = ex + (barLen / 4) * k;
    doc.text(k === 4 ? `${Math.round(niceMax)} m` : String(Math.round((niceMax / 4) * k)), sx, ey + 5, { align: 'center' });
  }
}

function cabecalho(doc: JsPDF, d: DadosRelatorioProd, logos: Logos, titulo: string, subtitulo: string, infoExtra?: string[]): void {
  desenharCabecalhoOficial(doc, {
    logoCliente: logos.cli,
    fazenda: san(d.fazenda),
    esquerda: [
      `Produtor: ${san(d.produtor) || '—'}`,
      `Talhao: ${san(d.talhao) || '—'}   |   Ano: ${rotuloAno(d.safra)}`,
    ],
    titulo,
    subtitulo,
    info: infoExtra ?? [
      `Area Total: ${fmt(d.areaHa, 2)} ha`,
      `Municipio: ${municipioUf(d)}`,
      `Colheita: ${dataBR(d.dataReferencia)}`,
      `Datum: ${DATUM}`,
    ],
  });
}

// Quadro com título — a moldura padrão dos blocos analíticos da página 4.
function quadro(doc: JsPDF, x: number, y: number, w: number, h: number, titulo: string): void {
  doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.roundedRect(x, y, w, h, 2, 2, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY);
  doc.text(titulo, x + 4, y + 6);
}

// ── Página 1: mapa absoluto ──────────────────────────────────────────────────

async function paginaAbsoluta(doc: JsPDF, d: DadosRelatorioProd, logos: Logos): Promise<void> {
  const cob = d.cobertura;
  const temAviso = !!cob && cob.pctCobertura < 99.5;
  const avisoH = temAviso ? 12 : 0;
  // O mapa cede a altura do aviso. Sem isso a faixa empurrava a legenda para
  // cima da marca INVICTA e a escala para debaixo do rodapé.
  const mapsY = 31, mapsH = 104 - avisoH, frameW = 200;
  const startX = (W - frameW) / 2;

  const png = await capturarMapaFertilidade({
    rasterPng: d.rasterAbsolutoPng, bounds: d.bounds, poligono: d.poligono, valores: EMPTY_FC,
    satelite: d.satelite, corLimite: d.corLimite,
    larguraPx: Math.round(frameW * PXMM), alturaPx: Math.round(mapsH * PXMM),
  });

  cabecalho(doc, d, logos, 'PRODUTIVIDADE', `${cap(san(d.cultura))} (${rotuloUnidade(d.unidade)})`);

  const jpg = await imagemParaPdf(png, frameW);
  doc.addImage(jpg.data, jpg.formato, startX, mapsY, frameW, mapsH);
  doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.rect(startX, mapsY, frameW, mapsH, 'S');
  doc.setFillColor(...NAVY); doc.roundedRect(startX + 3, mapsY + 3, 34, 7.5, 1.5, 1.5, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text('Escala absoluta', startX + 20, mapsY + 8, { align: 'center' });
  rosaDosVentos(doc, startX + 7, mapsY + mapsH - 7);

  // ── ESTATÍSTICAS: 5 células ──
  const stY = mapsY + mapsH + 4, stH = 14;
  doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.roundedRect(startX, stY, frameW, stH, 2, 2, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY);
  doc.text('ESTATISTICAS DO MAPA', startX + frameW / 2, stY + 4.5, { align: 'center' });
  const u = rotuloUnidade(d.unidade);
  const cels: Array<[string, string]> = [
    ['MINIMO', `${emU(d.stats.minKgha, d.unidade)} ${u}`],
    ['MEDIO', `${emU(d.stats.mediaKgha, d.unidade)} ${u}`],
    ['MAXIMO', `${emU(d.stats.maxKgha, d.unidade)} ${u}`],
    ['AREA', `${fmt(d.stats.areaHa, 2)} ha`],
    ['PRODUCAO TOTAL', `${fmt(d.stats.producaoTotalKg / 1000, 1)} t`],
  ];
  cels.forEach(([lab, val], j) => {
    const tx = startX + (frameW * (j + 0.5)) / cels.length;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.setTextColor(...GRAY); doc.text(lab, tx, stY + 8.5, { align: 'center' });
    doc.setFontSize(10); doc.setTextColor(...NAVY); doc.text(val, tx, stY + 12.6, { align: 'center' });
  });

  // ── AVISO DE COBERTURA ──
  // Fica na página 1, junto das estatísticas, porque é aqui que quem recebe o
  // PDF lê a média e a produção — e é justamente delas que a falta de dado
  // tira o sentido. Um mapa de 60% de cobertura descreve a parte colhida, não
  // o talhão, e a média sai calculada só sobre ela.
  let stFim = stY + stH;
  if (cob && temAviso) {
    const nivel = nivelCobertura(cob.pctCobertura);
    const cor: [number, number, number] = nivel === 'ruim' ? VERM : [180, 83, 9];
    const avY = stFim + 2.5, avH = avisoH - 3;
    doc.setDrawColor(...cor); doc.setLineWidth(0.5);
    doc.setFillColor(nivel === 'ruim' ? 254 : 255, nivel === 'ruim' ? 242 : 251, nivel === 'ruim' ? 242 : 235);
    doc.roundedRect(startX, avY, frameW, avH, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...cor);
    doc.text(nivel === 'ruim' ? 'MAPA INCOMPLETO' : 'ATENCAO — COBERTURA PARCIAL', startX + 4, avY + 5.6);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    const txt = `${fmt(cob.pctCobertura, 1)}% do talhao tem dado de colheita · ${fmt(cob.areaSemDadoHa, 2)} ha sem dado`
      + (cob.maiorVazioHa > 0.5 ? ` (maior vazio ${fmt(cob.maiorVazioHa, 2)} ha)` : '')
      + (cob.recortado ? ' · recortada do mapa e das contas' : ' · EXTRAPOLADA pelo interpolador');
    doc.text(txt, startX + 52, avY + 5.6, { maxWidth: frameW - 56 });
    stFim = avY + avH;
  }

  // ── LEGENDA (barra contínua da legenda da cultura) ──
  const lgY = stFim + 4, lgH = 20;
  doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.roundedRect(M, lgY, W - 2 * M, lgH, 2, 2, 'S');
  doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
  doc.text('INTERPRETACAO', M + 4, lgY + 7.5); doc.text('PRODUTIVIDADE', M + 4, lgY + 12);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY);
  doc.text(`(${u})`, M + 4, lgY + 16.5);

  const barX = M + 40, barW = 150, barY = lgY + 8, barH = 6;
  doc.addImage(barraLegenda(d.legenda, 600, 24), 'PNG', barX, barY, barW, barH);
  doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.rect(barX, barY, barW, barH, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...NAVY);
  let acc = 0; const totalL = d.legenda.classes.reduce((a, c) => a + c.larguraVisual, 0) || 1;
  for (const c of d.legenda.classes) {
    const cx = barX + ((acc + c.larguraVisual / 2) / totalL) * barW; acc += c.larguraVisual;
    doc.text(san(c.nome), cx, barY - 1.5, { align: 'center' });
  }
  // Ticks: os limites da legenda, convertidos para a unidade em exibição.
  const [dmin, dmax] = dominioDaLegenda(d.legenda);
  const ticks = [dmin, ...d.legenda.classes.slice(0, -1).map(c => c.valorMax).filter((v): v is number => v != null), dmax];
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...GRAY);
  for (const t of ticks) {
    const tx = barX + valorParaPosicaoVisual(t, d.legenda) * barW;
    doc.text(emU(t, d.unidade), tx, barY + barH + 4, { align: 'center' });
  }

  const cols: Array<[string, string]> = [['UNIDADE', u], ['CULTURA', cap(san(d.cultura))], ['PIXEL', `${d.pixelM} m`]];
  const cx0 = barX + barW + 8, cw = (W - M - cx0) / cols.length;
  cols.forEach(([lab, val], i) => {
    const cx = cx0 + cw * i + cw / 2;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...NAVY); doc.text(lab, cx, lgY + 8, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY); doc.text(val, cx, lgY + 14, { align: 'center', maxWidth: cw - 2 });
  });

  escalaGrafica(doc, W / 2, lgY + lgH + 7, d.bounds, frameW);
  marcaInvicta(doc, logos.inv, 'direita');
  rodape(doc, logos);
}

// ── Página 2: mapa por quantil ───────────────────────────────────────────────

// Rótulo do intervalo de uma faixa: as pontas são abertas ("≤"/"≥") porque é
// assim que o leitor entende "o pior quinto" e "o melhor quinto".
function rotuloFaixa(q: ClassificacaoQuantis, i: number, u: Unidade): string {
  const f = q.faixas[i];
  if (q.faixas.length === 1) return `${emU(f.min, u)} - ${emU(f.max, u)}`;
  if (i === 0) return `<= ${emU(f.max, u)}`;
  if (i === q.faixas.length - 1) return `>= ${emU(f.min, u)}`;
  return `${emU(f.min, u)} - ${emU(f.max, u)}`;
}

async function paginaQuantil(doc: JsPDF, d: DadosRelatorioProd, logos: Logos): Promise<void> {
  const q = d.quantis;
  const mapaW = 168, mapaH = 116, mapaX = M, mapaY = 31;

  const png = await capturarMapaFertilidade({
    rasterPng: d.rasterQuantilPng, bounds: d.bounds, poligono: d.poligono, valores: EMPTY_FC,
    satelite: d.satelite, corLimite: d.corLimite,
    larguraPx: Math.round(mapaW * PXMM), alturaPx: Math.round(mapaH * PXMM),
  });

  const pct = q.faixas.length ? 100 / q.faixas.length : 20;
  cabecalho(doc, d, logos, 'PRODUTIVIDADE',
    `Saturacao por quantil - ${q.faixas.length} faixas (${fmt(pct, 0)}% da area cada)`);

  const jpg = await imagemParaPdf(png, mapaW);
  doc.addImage(jpg.data, jpg.formato, mapaX, mapaY, mapaW, mapaH);
  doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.rect(mapaX, mapaY, mapaW, mapaH, 'S');
  rosaDosVentos(doc, mapaX + 7, mapaY + mapaH - 7);

  // ── Tira de cor DISCRETA + cortes reais (a barra de gradiente mentiria aqui:
  // ela mostra os limites FIXOS da legenda, não os cortes destes dados) ──
  const tiraY = mapaY + mapaH + 5, tiraH = 5;
  const n = q.faixas.length;
  const larg = mapaW / (n || 1);
  q.faixas.forEach((f, i) => {
    doc.setFillColor(...hexRgb(f.cor));
    doc.rect(mapaX + i * larg, tiraY, larg, tiraH, 'F');
  });
  doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.rect(mapaX, tiraY, mapaW, tiraH, 'S');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...GRAY);
  // Cortes nas fronteiras internas; extremos com o mín/máx do mapa.
  doc.text(emU(q.faixas[0].min, d.unidade), mapaX, tiraY + tiraH + 3.5, { align: 'left' });
  q.breaks.forEach((b, i) => doc.text(emU(b, d.unidade), mapaX + (i + 1) * larg, tiraY + tiraH + 3.5, { align: 'center' }));
  doc.text(emU(q.faixas[n - 1].max, d.unidade), mapaX + mapaW, tiraY + tiraH + 3.5, { align: 'right' });
  doc.setFontSize(6.5); doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold');
  doc.text(`Cortes calculados deste mapa (${rotuloUnidade(d.unidade)})`, mapaX + mapaW / 2, tiraY - 1.5, { align: 'center' });

  escalaGrafica(doc, mapaX + mapaW / 2, tiraY + tiraH + 10, d.bounds, mapaW);

  // ── TABELA DAS FAIXAS ──
  const tabX = mapaX + mapaW + 6, tabW = W - M - tabX;
  let ty = mapaY;
  doc.setFillColor(...NAVY); doc.rect(tabX, ty, tabW, 7, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
  doc.text('FAIXA', tabX + 8, ty + 4.8);
  doc.text('INTERVALO', tabX + 34, ty + 4.8);
  doc.text('ha', tabX + tabW - 34, ty + 4.8, { align: 'right' });
  doc.text('%', tabX + tabW - 20, ty + 4.8, { align: 'right' });
  doc.text('t', tabX + tabW - 3, ty + 4.8, { align: 'right' });
  ty += 7;

  const rowH = 7.6;
  let somaHa = 0, somaT = 0;
  q.faixas.forEach((f, i) => {
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(tabX, ty + rowH, tabX + tabW, ty + rowH);
    doc.setFillColor(...hexRgb(f.cor)); doc.roundedRect(tabX + 2, ty + 1.8, 4, 4, 0.6, 0.6, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...NAVY);
    doc.text(clipTexto(doc, san(f.nome), 24), tabX + 8, ty + 5);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY);
    doc.text(rotuloFaixa(q, i, d.unidade), tabX + 34, ty + 5);
    doc.setTextColor(...NAVY);
    doc.text(fmt(f.areaHa, 2), tabX + tabW - 34, ty + 5, { align: 'right' });
    doc.text(fmt(f.pctArea, 1), tabX + tabW - 20, ty + 5, { align: 'right' });
    // Produção só faz sentido com o grid em kg/ha (é o que ele sempre é).
    const t = f.somaKg / 1000;
    doc.text(fmt(t, 1), tabX + tabW - 3, ty + 5, { align: 'right' });
    somaHa += f.areaHa; somaT += t;
    ty += rowH;
  });
  // TOTAL = soma das linhas. Fechar a tabela vale mais que repetir o total
  // arredondado do statsDoGrid (a diferença é de gramas por hectare).
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.5); doc.line(tabX, ty + 0.5, tabX + tabW, ty + 0.5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...NAVY);
  doc.text('TOTAL', tabX + 8, ty + 5.4);
  doc.text(fmt(somaHa, 2), tabX + tabW - 34, ty + 5.4, { align: 'right' });
  doc.text('100,0', tabX + tabW - 20, ty + 5.4, { align: 'right' });
  doc.text(fmt(somaT, 1), tabX + tabW - 3, ty + 5.4, { align: 'right' });

  // ── RESUMO ──
  const ry = ty + 12, rh = 34;
  quadro(doc, tabX, ry, tabW, rh, 'RESUMO');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
  const u = rotuloUnidade(d.unidade);
  const linhas = [
    `Faixas efetivas: ${q.faixas.length}`,
    `Menor corte: ${q.breaks.length ? emU(q.breaks[0], d.unidade) + ' ' + u : '—'}`,
    `Maior corte: ${q.breaks.length ? emU(q.breaks[q.breaks.length - 1], d.unidade) + ' ' + u : '—'}`,
    `Amplitude 1a x ultima faixa: ${emU(q.faixas[n - 1].max - q.faixas[0].min, d.unidade)} ${u}`,
  ];
  linhas.forEach((t, i) => doc.text(t, tabX + 4, ry + 12 + i * 4.6));
  if (q.colapsadas > 0) {
    doc.setTextColor(...VERM);
    doc.text(`${q.colapsadas} faixa(s) unida(s): ha valores repetidos no mapa.`, tabX + 4, ry + 12 + linhas.length * 4.6, { maxWidth: tabW - 8 });
  }

  marcaInvicta(doc, logos.inv, 'esquerda');
  rodape(doc, logos);
}

// ── Página 3: NDVI ───────────────────────────────────────────────────────────

async function paginaNdvi(doc: JsPDF, d: DadosRelatorioProd, logos: Logos): Promise<void> {
  const nd = d.ndvi!;
  const q = nd.quantis;
  const rot = san(nd.indice) || 'NDVI';

  // Sem quantis (cena degenerada) cai no layout antigo, de mapa centralizado
  // com barra contínua — melhor uma página simples que uma página quebrada.
  if (!q || !q.faixas.length) { await paginaNdviContinua(doc, d, logos); return; }

  const mapaW = 168, mapaH = 116, mapaX = M, mapaY = 31;
  const png = await capturarMapaFertilidade({
    rasterPng: nd.rasterPng, bounds: nd.bounds, poligono: d.poligono, valores: EMPTY_FC,
    satelite: d.satelite, corLimite: d.corLimite,
    larguraPx: Math.round(mapaW * PXMM), alturaPx: Math.round(mapaH * PXMM),
  });

  cabecalho(doc, d, logos, rot,
    `${san(nd.fonte)} - ${dataBR(nd.data)} · quintil (${q.faixas.length} faixas)`, [
    `Area Total: ${fmt(d.areaHa, 2)} ha`,
    `Municipio: ${municipioUf(d)}`,
    `${rot} medio: ${fmt(nd.media, 2)}`,
    `Datum: ${DATUM}`,
  ]);

  const jpg = await imagemParaPdf(png, mapaW);
  doc.addImage(jpg.data, jpg.formato, mapaX, mapaY, mapaW, mapaH);
  doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.rect(mapaX, mapaY, mapaW, mapaH, 'S');
  rosaDosVentos(doc, mapaX + 7, mapaY + mapaH - 7);

  // Tira de cor DISCRETA + cortes reais — igual à página do mapa por quantil.
  const tiraY = mapaY + mapaH + 5, tiraH = 5;
  const n = q.faixas.length;
  const larg = mapaW / n;
  q.faixas.forEach((f, i) => { doc.setFillColor(...hexRgb(f.cor)); doc.rect(mapaX + i * larg, tiraY, larg, tiraH, 'F'); });
  doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.rect(mapaX, tiraY, mapaW, tiraH, 'S');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...GRAY);
  doc.text(fmt(q.faixas[0].min, 2), mapaX, tiraY + tiraH + 3.5, { align: 'left' });
  q.breaks.forEach((b, i) => doc.text(fmt(b, 2), mapaX + (i + 1) * larg, tiraY + tiraH + 3.5, { align: 'center' }));
  doc.text(fmt(q.faixas[n - 1].max, 2), mapaX + mapaW, tiraY + tiraH + 3.5, { align: 'right' });
  doc.setFontSize(6.5); doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold');
  doc.text(`Cortes calculados desta cena (indice)`, mapaX + mapaW / 2, tiraY - 1.5, { align: 'center' });

  escalaGrafica(doc, mapaX + mapaW / 2, tiraY + tiraH + 10, nd.bounds, mapaW);

  // TABELA das faixas — sem coluna de producao: indice de vegetacao nao tem
  // tonelagem, e inventar uma seria mentir sobre o que a cena mede.
  const tabX = mapaX + mapaW + 6, tabW = W - M - tabX;
  let ty = mapaY;
  doc.setFillColor(...NAVY); doc.rect(tabX, ty, tabW, 7, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
  doc.text('FAIXA', tabX + 8, ty + 4.8);
  doc.text('INTERVALO', tabX + 36, ty + 4.8);
  doc.text('ha', tabX + tabW - 22, ty + 4.8, { align: 'right' });
  doc.text('%', tabX + tabW - 3, ty + 4.8, { align: 'right' });
  ty += 7;

  const rowH = 7.6;
  let somaHa = 0;
  q.faixas.forEach((f, i) => {
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(tabX, ty + rowH, tabX + tabW, ty + rowH);
    doc.setFillColor(...hexRgb(f.cor)); doc.roundedRect(tabX + 2, ty + 1.8, 4, 4, 0.6, 0.6, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...NAVY);
    doc.text(clipTexto(doc, san(f.nome), 26), tabX + 8, ty + 5);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY);
    const txt = n === 1 ? `${fmt(f.min, 2)} - ${fmt(f.max, 2)}`
      : i === 0 ? `<= ${fmt(f.max, 2)}`
      : i === n - 1 ? `>= ${fmt(f.min, 2)}`
      : `${fmt(f.min, 2)} - ${fmt(f.max, 2)}`;
    doc.text(txt, tabX + 36, ty + 5);
    doc.setTextColor(...NAVY);
    doc.text(fmt(f.areaHa, 2), tabX + tabW - 22, ty + 5, { align: 'right' });
    doc.text(fmt(f.pctArea, 1), tabX + tabW - 3, ty + 5, { align: 'right' });
    somaHa += f.areaHa;
    ty += rowH;
  });
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.5); doc.line(tabX, ty + 0.5, tabX + tabW, ty + 0.5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...NAVY);
  doc.text('TOTAL', tabX + 8, ty + 5.4);
  doc.text(fmt(somaHa, 2), tabX + tabW - 22, ty + 5.4, { align: 'right' });
  doc.text('100,0', tabX + tabW - 3, ty + 5.4, { align: 'right' });

  const ry = ty + 12, rh = 34;
  quadro(doc, tabX, ry, tabW, rh, 'RESUMO');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
  const linhas = [
    `Indice: ${rot} · ${san(nd.fonte)}`,
    `Cena: ${dataBR(nd.data)} · medio ${fmt(nd.media, 2)}`,
    `Faixas efetivas: ${n}`,
    `Menor corte: ${q.breaks.length ? fmt(q.breaks[0], 2) : '—'}`,
  ];
  linhas.forEach((t, i) => doc.text(t, tabX + 4, ry + 12 + i * 4.6));
  if (q.colapsadas > 0) {
    doc.setTextColor(...VERM);
    doc.text(`${q.colapsadas} faixa(s) unida(s): ha valores repetidos na cena.`, tabX + 4, ry + 12 + linhas.length * 4.6, { maxWidth: tabW - 8 });
  }

  marcaInvicta(doc, logos.inv, 'esquerda');
  rodape(doc, logos);
}

// Reserva: cena sem quantis calculáveis — mapa centralizado + barra contínua.
async function paginaNdviContinua(doc: JsPDF, d: DadosRelatorioProd, logos: Logos): Promise<void> {
  const nd = d.ndvi!;
  const mapsY = 31, mapsH = 104, frameW = 200;
  const startX = (W - frameW) / 2;
  const png = await capturarMapaFertilidade({
    rasterPng: nd.rasterPng, bounds: nd.bounds, poligono: d.poligono, valores: EMPTY_FC,
    satelite: d.satelite, corLimite: d.corLimite,
    larguraPx: Math.round(frameW * PXMM), alturaPx: Math.round(mapsH * PXMM),
  });
  cabecalho(doc, d, logos, san(nd.indice) || 'NDVI', `${san(nd.fonte)} - ${dataBR(nd.data)}`, [
    `Area Total: ${fmt(d.areaHa, 2)} ha`,
    `Municipio: ${municipioUf(d)}`,
    `${san(nd.indice) || 'NDVI'} medio: ${fmt(nd.media, 2)}`,
    `Datum: ${DATUM}`,
  ]);
  const jpg = await imagemParaPdf(png, frameW);
  doc.addImage(jpg.data, jpg.formato, startX, mapsY, frameW, mapsH);
  doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.rect(startX, mapsY, frameW, mapsH, 'S');
  rosaDosVentos(doc, startX + 7, mapsY + mapsH - 7);
  const leg: Legenda = { ...nd.legenda, estilo: 'continuo' };
  const lgY = mapsY + mapsH + 8, lgH = 20;
  doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.roundedRect(M, lgY, W - 2 * M, lgH, 2, 2, 'S');
  doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
  doc.text('INTERPRETACAO', M + 4, lgY + 7.5); doc.text('VIGOR', M + 4, lgY + 12);
  const barX = M + 40, barW = 150, barY = lgY + 8, barH = 6;
  doc.addImage(barraLegenda(leg, 600, 24), 'PNG', barX, barY, barW, barH);
  doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.rect(barX, barY, barW, barH, 'S');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...GRAY);
  for (const t of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    doc.text(fmt(t, 1), barX + valorParaPosicaoVisual(t, leg) * barW, barY + barH + 4, { align: 'center' });
  }
  escalaGrafica(doc, W / 2, lgY + lgH + 7, nd.bounds, frameW);
  marcaInvicta(doc, logos.inv, 'direita');
  rodape(doc, logos);
}

// ── Página 4: resumo analítico ───────────────────────────────────────────────

// Bloco A — estatística do raster + relatório da limpeza.
function blocoEstatistica(doc: JsPDF, d: DadosRelatorioProd, x: number, y: number, w: number, h: number): void {
  quadro(doc, x, y, w, h, 'RESUMO ESTATISTICO');
  const r = d.resumo;
  const u = rotuloUnidade(d.unidade);
  let yy = y + 12;

  if (!r) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
    doc.text('Sem estatistica disponivel para este mapa.', x + 4, yy);
  } else {
    const pares: Array<[string, string]> = [
      ['Pixels validos', fmt(r.n, 0)],
      ['Media', `${emU(r.media, d.unidade)} ${u}`],
      ['Mediana', `${emU(r.mediana, d.unidade)} ${u}`],
      ['Minimo', `${emU(r.min, d.unidade)} ${u}`],
      ['Maximo', `${emU(r.max, d.unidade)} ${u}`],
      ['Amplitude', `${emU(r.amplitude, d.unidade)} ${u}`],
      ['Desvio padrao', `${emU(r.desvio, d.unidade)} ${u}`],
      ['CV', r.cv != null ? `${fmt(r.cv, 1)}%` : '—'],
      ['P5', `${emU(r.p5, d.unidade)} ${u}`],
      ['P25', `${emU(r.p25, d.unidade)} ${u}`],
      ['P75', `${emU(r.p75, d.unidade)} ${u}`],
      ['P95', `${emU(r.p95, d.unidade)} ${u}`],
      ['IQR (P75-P25)', `${emU(r.iqr, d.unidade)} ${u}`],
      ['Outliers (Tukey)', `${fmt(r.outliers, 0)} (${fmt(r.pctOutliers, 1)}%)`],
    ];
    const colW = (w - 8) / 2;
    const linhas = Math.ceil(pares.length / 2);
    pares.forEach(([lab, val], i) => {
      const cx = x + 4 + Math.floor(i / linhas) * colW;
      const cy = yy + (i % linhas) * 4.5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY);
      doc.text(lab, cx, cy);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
      doc.text(val, cx + colW - 6, cy, { align: 'right' });
    });
    yy += linhas * 4.5 + 3;
  }

  // ── QUALIDADE DO DADO ──
  // Vem ANTES da limpeza de propósito: a limpeza conta quantos pontos foram
  // descartados, mas não sabe dizer se sobrou dado onde o talhão está. Um mapa
  // pode ter 15 mil pontos usados e mesmo assim ignorar um quarto da área.
  const cob = d.cobertura;
  if (cob) {
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(x + 4, yy, x + w - 4, yy);
    yy += 5;
    const nivel = nivelCobertura(cob.pctCobertura);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...(nivel === 'ok' ? NAVY : VERM));
    doc.text('QUALIDADE DO DADO', x + 4, yy);
    yy += 4.5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY);
    const linhas = [
      `Cobertura: ${fmt(cob.pctCobertura, 1)}% do talhao com dado de colheita`,
      `Area sem dado: ${fmt(cob.areaSemDadoHa, 2)} ha` + (cob.maiorVazioHa > 0.5 ? ` · maior vazio ${fmt(cob.maiorVazioHa, 2)} ha` : ''),
      `Raio considerado: ${fmt(cob.raioM, 0)} m de um ponto colhido`,
      cob.recortado
        ? 'Area sem dado RECORTADA: nao entra no mapa, na area nem na producao.'
        : 'Area sem dado EXTRAPOLADA pelo interpolador — os valores ali sao estimativa, nao medicao.',
    ];
    linhas.forEach((t, i) => doc.text(t, x + 4, yy + i * 4.2, { maxWidth: w - 8 }));
    yy += linhas.length * 4.2 + 1;
    if (nivel !== 'ok') {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...VERM);
      doc.text(nivel === 'ruim'
        ? 'Mapa incompleto: descreve a parte colhida, nao o talhao.'
        : 'Falhas de cobertura relevantes — conferir antes de usar para recomendacao.',
        x + 4, yy, { maxWidth: w - 8 });
      yy += 4.5;
    }
  }

  // ── LIMPEZA ──
  doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(x + 4, yy, x + w - 4, yy);
  yy += 5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...NAVY);
  doc.text('LIMPEZA DOS DADOS', x + 4, yy);
  yy += 4.5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY);
  const l = d.limpeza;
  if (l) {
    const txt = [
      `${fmt(l.n_bruto, 0)} pontos brutos -> filtro ${fmt(l.n_apos_filtro_bruto, 0)}`,
      `MapFilter global -${fmt(l.mapfilter_global_removidos, 0)} | local -${fmt(l.mapfilter_local_removidos, 0)}`,
      `${fmt(l.n_usados, 0)} pontos usados na interpolacao`,
      l.correcao_colhedora_global ? `Colhedoras corrigidas: ${l.correcao_colhedora_global.maquinas_corrigidas}` : null,
      l.fator_media_real != null ? `Calibrado pela media real x${fmt(l.fator_media_real, 3)}` : null,
      d.nMaquinas ? `Maquinas importadas: ${d.nMaquinas}` : null,
    ].filter((s): s is string => !!s);
    txt.forEach((t, i) => doc.text(t, x + 4, yy + i * 4.2, { maxWidth: w - 8 }));
  } else {
    // Versão reaberta da nuvem: os contadores por etapa não foram arquivados,
    // então imprimimos o que EXISTE em vez de inventar números.
    const c = d.cleaningSalvo ?? {};
    const num = (k: string) => (typeof c[k] === 'number' ? fmt(c[k] as number, 0) : null);
    const txt = [
      d.nPontosSalvo != null ? `${fmt(d.nPontosSalvo, 0)} pontos importados -> ${fmt(d.stats.nUsados, 0)} usados` : `${fmt(d.stats.nUsados, 0)} pontos usados`,
      num('hard_min') && num('hard_max') ? `Filtro bruto: ${num('hard_min')} a ${num('hard_max')} kg/ha` : null,
      typeof c.mf_global_v === 'number' ? `MapFilter global +-${fmt((c.mf_global_v as number) * 100, 0)}% | local +-${typeof c.mf_local_v === 'number' ? fmt((c.mf_local_v as number) * 100, 0) : '?'}% em ${num('mf_local_r') ?? '?'} m` : null,
      c.corrigir_colhedora ? 'Correcao entre colhedoras: ativa' : null,
      d.mediaRealKgha ? `Media real informada: ${emU(d.mediaRealKgha, d.unidade)} ${u}` : null,
      'Contadores por etapa nao foram arquivados nesta versao.',
    ].filter((s): s is string => !!s);
    txt.forEach((t, i) => doc.text(t, x + 4, yy + i * 4.2, { maxWidth: w - 8 }));
  }
}

// Bloco B — dispersão NDVI × produtividade.
function blocoDispersao(doc: JsPDF, d: DadosRelatorioProd, x: number, y: number, w: number, h: number): void {
  quadro(doc, x, y, w, h, 'DISPERSAO NDVI x PRODUTIVIDADE');
  const nota = (msg: string) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
    doc.text(msg, x + 4, y + h / 2, { maxWidth: w - 8 });
  };
  if (!d.ndvi) return nota('Sem indice vegetativo mantido para este talhao — a pagina de NDVI e este grafico ficam de fora. Mantenha uma cena na aba NDVI ("Manter esta cena") para incluir a analise.');
  const c = d.correlacao;
  if (!c || c.r == null || c.amostra.length === 0) return nota(`Amostra insuficiente para correlacao (minimo 30 pixels em comum; havia ${c ? fmt(c.n, 0) : '0'}).`);

  // Caixa do gráfico
  const gx = x + 16, gy = y + 13, gw = w - 22, gh = h - 30;
  doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.rect(gx, gy, gw, gh, 'S');

  // Domínios com 4% de folga, medidos NA AMOSTRA (é o que está desenhado).
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const p of c.amostra) {
    if (p.b < xmin) xmin = p.b; if (p.b > xmax) xmax = p.b;   // b = NDVI  (eixo X)
    if (p.a < ymin) ymin = p.a; if (p.a > ymax) ymax = p.a;   // a = produtividade (eixo Y)
  }
  const folgaX = (xmax - xmin) * 0.04 || 0.01, folgaY = (ymax - ymin) * 0.04 || 1;
  xmin -= folgaX; xmax += folgaX; ymin -= folgaY; ymax += folgaY;
  const px = (v: number) => gx + ((v - xmin) / (xmax - xmin || 1)) * gw;
  const py = (v: number) => gy + gh - ((v - ymin) / (ymax - ymin || 1)) * gh;

  // Pontos
  doc.setFillColor(...NAVY);
  for (const p of c.amostra) doc.circle(px(p.b), py(p.a), 0.35, 'F');

  // Reta de tendência (dos pares TODOS) recortada na caixa: prod = coef·ndvi + b.
  // Cuidado: correlacaoGrids recebe (produtividade, ndvi), então a reta que ela
  // devolve é ndvi = coef·prod + intercepto — o inverso do que desenhamos aqui.
  // Reajustamos pelo r e pelos desvios da amostra, que é o que está no gráfico.
  const reta = retaDaAmostra(c.amostra);
  if (reta) {
    const y0 = reta.coef * xmin + reta.intercepto;
    const y1 = reta.coef * xmax + reta.intercepto;
    const rec = recortarNaCaixa(xmin, y0, xmax, y1, xmin, xmax, ymin, ymax);
    if (rec) {
      doc.setDrawColor(...VERM); doc.setLineWidth(0.6);
      doc.line(px(rec.x0), py(rec.y0), px(rec.x1), py(rec.y1));
    }
  }

  // Eixos
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(...GRAY);
  for (let k = 0; k <= 4; k++) {
    const vx = xmin + ((xmax - xmin) * k) / 4;
    doc.text(fmt(vx, 2), px(vx), gy + gh + 3.2, { align: 'center' });
    const vy = ymin + ((ymax - ymin) * k) / 4;
    doc.text(emU(vy, d.unidade), gx - 1.5, py(vy) + 1, { align: 'right' });
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.setTextColor(...NAVY);
  // Rótulo do Y sobre a caixa — jsPDF rotacionado é frágil entre versões.
  doc.text(`Produtividade (${rotuloUnidade(d.unidade)})`, gx, gy - 2);
  doc.text(`${san(d.ndvi.indice) || 'NDVI'}`, gx + gw, gy + gh + 6.6, { align: 'right' });

  // Veredito
  const forca = Math.abs(c.r) >= 0.5 ? 'forte' : Math.abs(c.r) >= 0.3 ? 'moderada' : 'fraca';
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...NAVY);
  doc.text(`r de Pearson = ${fmt(c.r, 2)} (${forca})`, x + 4, y + h - 7);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...GRAY);
  doc.text(`n = ${fmt(c.n, 0)} pixels  |  amostra desenhada: ${fmt(c.amostra.length, 0)}`, x + 4, y + h - 3.5);
  if (d.sobreposicaoNdvi != null && d.sobreposicaoNdvi < 0.98) {
    doc.setTextColor(...VERM);
    doc.text(`Extensoes diferentes (${fmt(d.sobreposicaoNdvi * 100, 0)}% de sobreposicao) - correlacao aproximada.`, x + 4 + 62, y + h - 3.5, { maxWidth: w - 70 });
  }
}

// Mínimos quadrados de b (NDVI, eixo X) → a (produtividade, eixo Y) na amostra
// desenhada — assim a reta passa pelos pontos que estão de fato no papel.
function retaDaAmostra(amostra: Array<{ a: number; b: number }>): { coef: number; intercepto: number } | null {
  const n = amostra.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of amostra) { sx += p.b; sy += p.a; sxx += p.b * p.b; sxy += p.b * p.a; }
  const vx = sxx / n - (sx / n) ** 2;
  if (!(vx > 0)) return null;
  const cov = sxy / n - (sx / n) * (sy / n);
  const coef = cov / vx;
  return { coef, intercepto: sy / n - coef * (sx / n) };
}

// Recorte de segmento na caixa do gráfico (Liang-Barsky simplificado no Y).
function recortarNaCaixa(
  x0: number, y0: number, x1: number, y1: number,
  xmin: number, xmax: number, ymin: number, ymax: number,
): { x0: number; y0: number; x1: number; y1: number } | null {
  const emY = (yy: number) => yy >= ymin && yy <= ymax;
  if (emY(y0) && emY(y1)) return { x0, y0, x1, y1 };
  const m = (y1 - y0) / ((x1 - x0) || 1);
  if (m === 0) return null;
  const xEm = (yy: number) => x0 + (yy - y0) / m;
  const cands: Array<{ x: number; y: number }> = [];
  for (const yy of [ymin, ymax]) { const xx = xEm(yy); if (xx >= xmin && xx <= xmax) cands.push({ x: xx, y: yy }); }
  if (emY(y0)) cands.push({ x: x0, y: y0 });
  if (emY(y1)) cands.push({ x: x1, y: y1 });
  if (cands.length < 2) return null;
  cands.sort((p, q) => p.x - q.x);
  const a = cands[0], b = cands[cands.length - 1];
  return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
}

// Bloco C — boxplot da produtividade por zona.
// Cor de uma zona nesta página: a faixa de quantil em que a MÉDIA dela cai.
// Boxplot e mini-mapa usam a MESMA função de propósito — duas linguagens de cor
// na mesma folha (classe da zona de um lado, quantil do outro) fazem a Zona 1
// aparecer verde num gráfico e laranja no outro.
function corDaZonaPorMedia(q: ClassificacaoQuantis, media: number, fallback: string): string {
  if (!q.faixas.length) return fallback;
  return q.faixas[Math.min(indiceFaixa(media, q.breaks), q.faixas.length - 1)].cor;
}

function blocoBoxplot(doc: JsPDF, d: DadosRelatorioProd, x: number, y: number, w: number, h: number): void {
  quadro(doc, x, y, w, h, 'PRODUTIVIDADE POR ZONA DE MANEJO');
  const zs = d.zonas.filter(z => z.stats);
  if (!zs.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
    doc.text('Talhao sem zona de manejo cadastrada — boxplot e mapa por zona nao se aplicam.', x + 4, y + h / 2, { maxWidth: w - 8 });
    return;
  }

  // Escala X compartilhada: p5 mínimo a p95 máximo, com folga.
  let lo = Infinity, hi = -Infinity;
  for (const z of zs) { const s = z.stats!; if (s.p5 < lo) lo = s.p5; if (s.p95 > hi) hi = s.p95; }
  const folga = (hi - lo) * 0.06 || 1;
  lo -= folga; hi += folga;

  // LARGURAS. O veredito de separação saiu do rodapé e virou um PAINEL à
  // direita. Duas razões: (a) no rodapé ele colidia com os ticks e a legenda do
  // gráfico — com 5 zonas a legenda caía em y+49,6 e o veredito em y+50; (b) o
  // gráfico ocupava a largura toda (~155 mm) e as caixas ficavam esticadas
  // demais para comparar. Com o painel, o gráfico cai para ~91 mm e a folga
  // vertical passa a ser garantida por construção, não por ajuste fino.
  const calha = 42;                                  // swatch + nome + média
  const painel = 58;                                 // veredito de separação
  const gx = x + calha, gw = Math.max(40, w - calha - painel - 10);
  const px = (v: number) => gx + ((v - lo) / (hi - lo || 1)) * gw;

  const topo = y + 11;
  // Reserva do pé: linha dos ticks (+2) e legenda do gráfico (+5,4), com 2 mm
  // de respiro até a borda do quadro.
  const rowH = Math.min(8, Math.max(4, (h - 22) / zs.length));

  zs.forEach((z, i) => {
    const s = z.stats!;
    const cy = topo + i * rowH + rowH / 2;
    const cor = corDaZonaPorMedia(d.quantis, s.media, z.cor);
    // Calha
    doc.setFillColor(...hexRgb(cor));
    doc.roundedRect(x + 4, cy - 1.4, 2.6, 2.6, 0.4, 0.4, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...NAVY);
    doc.text(clipTexto(doc, san(z.id ? `Zona ${z.id}` : z.classe), calha - 22), x + 8, cy + 1);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(...GRAY);
    doc.text(emU(s.media, d.unidade), x + calha - 5, cy + 1, { align: 'right' });

    // Amostra pequena: só a média, sem caixa (um boxplot de 12 pixels engana).
    if (s.n < 30) {
      doc.setDrawColor(...GRAY); doc.setLineWidth(0.5);
      doc.line(px(s.media), cy - 1.5, px(s.media), cy + 1.5);
      doc.setFontSize(5); doc.setTextColor(...GRAY);
      doc.text('amostra pequena', px(s.media) + 2, cy + 1);
      return;
    }

    const alt = Math.min(3.6, rowH * 0.42);
    // Bigodes p5–p95 (não Tukey: p5/p95 já vêm do resumo e batem com o bloco A)
    doc.setDrawColor(...hexRgb(cor)); doc.setLineWidth(0.3);
    doc.line(px(s.p5), cy, px(s.p95), cy);
    doc.line(px(s.p5), cy - alt / 2, px(s.p5), cy + alt / 2);
    doc.line(px(s.p95), cy - alt / 2, px(s.p95), cy + alt / 2);
    // Caixa p25–p75 (jsPDF não tem alfa sem GState — clarear o hex é o equivalente)
    doc.setFillColor(...hexRgb(ajustarL(cor, 0.25)));
    doc.setDrawColor(...hexRgb(cor)); doc.setLineWidth(0.3);
    doc.rect(px(s.p25), cy - alt, Math.max(0.4, px(s.p75) - px(s.p25)), alt * 2, 'FD');
    // Mediana
    doc.setDrawColor(...NAVY); doc.setLineWidth(0.7);
    doc.line(px(s.mediana), cy - alt, px(s.mediana), cy + alt);
    // Média
    doc.setFillColor(255, 255, 255); doc.setDrawColor(...NAVY); doc.setLineWidth(0.25);
    doc.circle(px(s.media), cy, 0.7, 'FD');
  });

  // Ticks (uma vez, no pé)
  const ty = topo + zs.length * rowH + 3;
  doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(gx, ty - 1.5, gx + gw, ty - 1.5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(...GRAY);
  for (let k = 0; k <= 4; k++) {
    const v = lo + ((hi - lo) * k) / 4;
    doc.text(emU(v, d.unidade), px(v), ty + 2, { align: 'center' });
  }
  doc.setFontSize(5);
  doc.text(`Caixa P25-P75 | traco = mediana | circulo = media | bigodes P5-P95 (${rotuloUnidade(d.unidade)})`, gx, ty + 5.4);

  // ── PAINEL: separação entre zonas (a pergunta que o boxplot ilustra) ──
  const sep = d.separacaoZonas;
  const pxPainel = x + w - painel - 4;
  doc.setDrawColor(...LINE); doc.setLineWidth(0.3);
  doc.roundedRect(pxPainel, y + 9, painel, h - 13, 1.5, 1.5, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...NAVY);
  doc.text('SEPARACAO ENTRE ZONAS', pxPainel + 3, y + 14);
  if (!sep) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...GRAY);
    doc.text('Precisa de ao menos 2 zonas com pixels para comparar.', pxPainel + 3, y + 20, { maxWidth: painel - 6 });
  } else {
    const conf = sep.vizinhosConfundidos.length;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...NAVY);
    doc.text(fmt(sep.eta2, 2), pxPainel + 3, y + 23);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(...GRAY);
    doc.text('eta quadrado', pxPainel + 3, y + 27);
    doc.setFontSize(6); doc.setTextColor(...GRAY);
    doc.text(`${fmt(sep.eta2 * 100, 0)}% da variacao e explicada pela divisao em zonas.`,
      pxPainel + 3, y + 32, { maxWidth: painel - 6 });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.setTextColor(...(conf ? VERM : NAVY));
    doc.text(conf ? `${conf} par(es) vizinho(s) se confundem` : 'Todos os vizinhos se distinguem',
      pxPainel + 3, y + 38, { maxWidth: painel - 6 });
    if (conf) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(...GRAY);
      const pares = sep.vizinhosConfundidos.slice(0, 3).map(v => `${v.a}-${v.b}`).join(', ');
      doc.text(`Candidatas a fusao: ${pares}${sep.vizinhosConfundidos.length > 3 ? '...' : ''}`,
        pxPainel + 3, y + 43, { maxWidth: painel - 6 });
    }
  }
}

// Bloco D — mini-mapa da média por zona + tabela.
async function blocoMapaZonas(doc: JsPDF, d: DadosRelatorioProd, x: number, y: number, w: number, h: number): Promise<void> {
  quadro(doc, x, y, w, h, 'MEDIA POR ZONA');
  const zs = d.zonas.filter(z => z.stats);
  if (!zs.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
    doc.text('Sem zonas para mapear.', x + 4, y + h / 2);
    return;
  }

  // Cor = a faixa de quantil em que a MÉDIA da zona cai. Amarra este mapa à
  // legenda da página 2: zona na faixa "Alta" está, literalmente, na faixa Alta
  // do talhão — melhor que inventar uma rampa min–máx só para esta figura.
  const corDaZona = (media: number, fallback: string): string => corDaZonaPorMedia(d.quantis, media, fallback);

  const mapaW = w - 8, mapaH = h - 16 - Math.min(zs.length, 6) * 4.4 - 6;
  const png = await capturarMapaZonas({
    bounds: d.bounds, externo: d.poligono,
    zonas: zs.map(z => ({ geometry: z.geometry, cor: corDaZona(z.stats!.media, z.cor), rotulo: z.id })),
    linhas: [],
    satelite: false,
    preencherAlpha: 0.9,
    larguraPx: Math.round(mapaW * PXMM), alturaPx: Math.round(Math.max(20, mapaH) * PXMM),
  });
  const jpg = await imagemParaPdf(png, mapaW);
  doc.addImage(jpg.data, jpg.formato, x + 4, y + 9, mapaW, Math.max(20, mapaH));
  doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.rect(x + 4, y + 9, mapaW, Math.max(20, mapaH), 'S');

  // Tabela compacta
  let ty = y + 9 + Math.max(20, mapaH) + 4;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(5.5); doc.setTextColor(...GRAY);
  doc.text('ZONA', x + 9, ty);
  doc.text(`MEDIA (${rotuloUnidade(d.unidade)})`, x + w - 34, ty, { align: 'right' });
  doc.text('ha', x + w - 17, ty, { align: 'right' });
  doc.text('CV', x + w - 4, ty, { align: 'right' });
  ty += 3.6;
  for (const z of zs.slice(0, 6)) {
    const s = z.stats!;
    doc.setFillColor(...hexRgb(corDaZona(s.media, z.cor))); doc.roundedRect(x + 4, ty - 2.4, 3, 3, 0.5, 0.5, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...NAVY);
    doc.text(clipTexto(doc, san(z.id), 16), x + 9, ty);
    doc.text(emU(s.media, d.unidade), x + w - 34, ty, { align: 'right' });
    doc.setTextColor(...GRAY);
    doc.text(fmt(z.areaHa, 1), x + w - 17, ty, { align: 'right' });
    doc.text(s.cv != null ? `${fmt(s.cv, 0)}%` : '—', x + w - 4, ty, { align: 'right' });
    ty += 4.4;
  }
  if (zs.length > 6) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(5.5); doc.setTextColor(...GRAY);
    doc.text(`+ ${zs.length - 6} zona(s) no grafico ao lado`, x + 9, ty);
  }
}

async function paginaResumo(doc: JsPDF, d: DadosRelatorioProd, logos: Logos): Promise<void> {
  cabecalho(doc, d, logos, 'PRODUTIVIDADE', 'Resumo analitico');

  const topY = 31;
  const temZonas = d.zonas.some(z => z.stats);
  const gap = 4;

  // Sem zonas, a dispersão herda a largura do bloco D — a página não fica com
  // um vão branco só porque o talhão não tem zoneamento.
  const wA = 96;
  const wD = temZonas ? 78 : 0;
  const wB = W - 2 * M - wA - (temZonas ? wD + gap : 0) - gap;

  // A marca INVICTA assina a faixa 184-196 (pdfCabecalho.MARCA_Y). Os blocos
  // TEM de fechar antes dela: a primeira versao estendia o boxplot ate 189 e a
  // logo cobria o comeco do veredito de separacao.
  const fimUtil = MARCA_Y - 4;               // 180
  const hBaixo = 53;
  const hCima = temZonas ? fimUtil - topY - gap - hBaixo : fimUtil - topY;
  blocoEstatistica(doc, d, M, topY, wA, hCima);
  blocoDispersao(doc, d, M + wA + gap, topY, wB, hCima);
  if (temZonas) {
    await blocoMapaZonas(doc, d, M + wA + gap + wB + gap, topY, wD, fimUtil - topY);
    blocoBoxplot(doc, d, M, topY + hCima + gap, wA + gap + wB, hBaixo);
  }

  marcaInvicta(doc, logos.inv, temZonas ? 'esquerda' : 'direita');
  rodape(doc, logos);
}

// ── Orquestração ─────────────────────────────────────────────────────────────

export function validarProd(d: DadosRelatorioProd): string | null {
  if (!d.poligono) return 'Limite do talhao nao encontrado.';
  if (!d.rasterAbsolutoPng) return 'Mapa absoluto nao pode ser colorido.';
  if (!d.quantis || !d.quantis.faixas.length) return 'Nao foi possivel calcular as faixas por quantil deste mapa.';
  if (!d.rasterQuantilPng) return 'Mapa por quantil nao pode ser colorido.';
  return null;
}

/** Renderiza as páginas num doc jsPDF JÁ EXISTENTE (A4 paisagem). */
export async function renderProdutividadeNoDoc(
  doc: JsPDF, d: DadosRelatorioProd, opts?: { novaPaginaAntes?: boolean },
): Promise<void> {
  const erro = validarProd(d);
  if (erro) throw new Error(erro);
  const logos = await carregarLogos(d.logoClienteUrl);
  let precisa = opts?.novaPaginaAntes ?? false;
  const pag = async (fn: () => Promise<void>) => {
    if (precisa) doc.addPage('a4', 'landscape');
    await fn();
    precisa = true;
  };
  await pag(() => paginaAbsoluta(doc, d, logos));
  await pag(() => paginaQuantil(doc, d, logos));
  if (d.ndvi) await pag(() => paginaNdvi(doc, d, logos));
  await pag(() => paginaResumo(doc, d, logos));
}

export function nomeArquivoProd(d: DadosRelatorioProd): string {
  // O período vem da COLHEITA, não do laudo de laboratório: um mapa de colheita
  // batizado com o período da análise de solo vira arquivo impossível de achar.
  const per = periodoParaNome({ dataReferencia: d.dataReferencia, safra: d.safra, ano: d.ano, epoca: d.epoca });
  return nomeExport({
    fazenda: d.fazenda, siglaFazenda: d.siglaFazenda, talhao: d.talhao,
    tipo: 'PROD', ano: per.ano, epoca: per.epoca, detalhe: d.cultura,
  });
}

/** Monta o PDF, abre em nova aba e devolve o Blob. */
export async function gerarRelatorioProdutividade(d: DadosRelatorioProd): Promise<Blob> {
  const erro = validarProd(d);
  if (erro) throw new Error(erro);
  const aba = typeof window !== 'undefined' ? window.open('', '_blank') : null;
  if (aba) try { aba.document.write('<!doctype html><meta charset="utf-8"><title>Relatório</title><body style="font-family:system-ui,sans-serif;padding:28px;color:#334155"><p>⏳ Gerando o relatório de produtividade… aguarde alguns segundos (capturando os mapas).</p></body>'); } catch {}
  try {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    await renderProdutividadeNoDoc(doc, d, { novaPaginaAntes: false });
    const blob = doc.output('blob');
    if (aba) { const url = URL.createObjectURL(blob); aba.location.href = url; setTimeout(() => URL.revokeObjectURL(url), 60000); }
    else doc.save(`${nomeArquivoProd(d).replace(/[^\w.\-]+/g, '_')}.pdf`);
    return blob;
  } catch (e) {
    const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
    console.error('[relatorio-prod] falha:', e);
    if (aba) { try { aba.document.body.innerHTML = `<h3 style="color:#b91c1c;font-family:system-ui">Falha ao gerar o relatório</h3><pre style="white-space:pre-wrap;font-size:12px;color:#334155">${msg.replace(/[<>&]/g, s => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[s]!))}</pre>`; } catch {} }
    throw e;
  }
}
