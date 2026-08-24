'use client';

// Relatório de CONDUTIVIDADE ELÉTRICA (Layout Oficial, A4 paisagem, 1 página).
//
// O mapa sai por QUINTIL — 5 faixas de área igual, com os cortes calculados
// DESTE levantamento. É a leitura que interessa na CEa: ela não tem faixa
// agronômica universal como um nutriente tem ("40% de saturação é baixo"), o
// que importa é onde, DENTRO do talhão, o solo é mais e menos condutivo. Por
// isso a escala é auto-ajustável ao dado, e a legenda anuncia os cortes reais.
//
// Cabeçalho, marca e rodapé vêm de pdfCabecalho.ts — os MESMOS de Fertilidade,
// Zonas e Produtividade. A página espelha a `paginaQuantil` do relatório de
// produtividade de propósito: quem lê os dois vê a mesma gramática (mapa à
// esquerda, tira de cor com os cortes, tabela de faixas à direita).

import type { jsPDF as JsPDF } from 'jspdf';
import { capturarMapaFertilidade } from './capturaMapa.ts';
import { imagemParaPdf, reduzirLogo } from './pdfImagem.ts';
import { nomeExport } from './nomeExport.ts';
import { DATUM, desenharCabecalhoOficial, marcaInvicta, clipTexto } from './pdfCabecalho.ts';
import type { ClassificacaoQuantis } from './quantis.ts';

const NAVY: [number, number, number] = [13, 33, 64];
const GRAY: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [210, 219, 232];
const VERM: [number, number, number] = [185, 28, 28];
const W = 297, H = 210, M = 6;
const PXMM = 8;                                   // ≈200 dpi na captura

const fmt = (v: number, d = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const san = (s: string | null | undefined): string => (s ?? '').replace(/[^\x00-\xFF]/g, '');
const municipioUf = (d: { municipio: string; estado: string }): string => {
  const m = san(d.municipio), uf = san(d.estado);
  return m ? (uf ? `${m} - ${uf}` : m) : (uf || '—');
};
const dataBR = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};
const hexRgb = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
  return m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)] : [148, 163, 184];
};
const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export interface DadosRelatorioCondutividade {
  fazenda: string; produtor: string; talhao: string;
  siglaFazenda?: string | null;
  areaHa: number; municipio: string; estado: string;
  /** Levantamento e camada — é o que distingue dois mapas do mesmo talhão. */
  levantamento: string;
  camada: string;
  dataLevantamento?: string | null;
  ano?: number | null;
  /** Raster JÁ pintado por quintil (colorirGridPorQuantis) + a classificação. */
  rasterPng: string;
  bounds: [number, number, number, number];
  quantis: ClassificacaoQuantis;
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  unidade: string;                    // 'mS/m'
  satelite: boolean;
  corLimite: string;
  /** Aferição do levantamento — o que diz se dá para confiar no mapa. */
  nPontos: number;
  modelo: string;
  pixelM: number;
  rmse: number | null;
  minObs: number | null;
  maxObs: number | null;
  qualidade?: { rotulo: string; apto: boolean } | null;
  percRemovido?: number | null;
  logoClienteUrl?: string | null;
}

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

function nice(x: number): number {
  if (x <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / p;
  return (f >= 5 ? 5 : f >= 2.5 ? 2.5 : f >= 2 ? 2 : 1) * p;
}

function rosaDosVentos(doc: JsPDF, x: number, y: number): void {
  doc.setFillColor(...NAVY); doc.roundedRect(x - 4.5, y - 5.5, 9, 11, 1, 1, 'F');
  doc.setFillColor(255, 255, 255); doc.triangle(x, y - 4, x - 2.2, y + 0.5, x + 2.2, y + 0.5, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(6);
  doc.text('N', x, y + 4, { align: 'center' });
}

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

function rodape(doc: JsPDF, logos: Logos): void {
  doc.setFillColor(...NAVY); doc.rect(0, H - 10, W, 10, 'F');
  if (logos.branca) { const h = 5, w = h * (logos.branca.naturalWidth / logos.branca.naturalHeight); doc.addImage(logos.branca, 'PNG', M, H - 7.5, w, h); }
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  doc.text('INVICTA AP   |   Tecnologia que transforma dados em produtividade.', M + 26, H - 3.8);
  doc.setFont('helvetica', 'bold'); doc.text('www.invicta.agr.br', W - M, H - 3.8, { align: 'right' });
}

function quadro(doc: JsPDF, x: number, y: number, w: number, h: number, titulo: string): void {
  doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.roundedRect(x, y, w, h, 2, 2, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY);
  doc.text(titulo, x + 4, y + 6);
}

/** "<= 12,4" / "12,4 - 18,9" / ">= 24,1" — a mesma regra do relatório de produtividade. */
export function rotuloFaixaCea(q: ClassificacaoQuantis, i: number): string {
  const f = q.faixas[i];
  if (q.faixas.length === 1) return `${fmt(f.min, 1)} - ${fmt(f.max, 1)}`;
  if (i === 0) return `<= ${fmt(f.max, 1)}`;
  if (i === q.faixas.length - 1) return `>= ${fmt(f.min, 1)}`;
  return `${fmt(f.min, 1)} - ${fmt(f.max, 1)}`;
}

export function validarCondutividade(d: DadosRelatorioCondutividade): string | null {
  if (!d.rasterPng) return 'Interpole o mapa antes de gerar o PDF.';
  if (!d.quantis || d.quantis.faixas.length === 0) return 'Não foi possível calcular as faixas por quintil deste mapa.';
  if (!d.poligono) return 'Talhão sem contorno salvo — o mapa não pode ser recortado.';
  return null;
}

/** SA03_COND_2026_CEA020 — sem época: a CEa é estrutural, não muda de safra. */
export function nomeArquivoCondutividade(d: DadosRelatorioCondutividade): string {
  return nomeExport({
    fazenda: d.fazenda, siglaFazenda: d.siglaFazenda, talhao: d.talhao,
    tipo: 'COND', ano: d.ano ?? null, detalhe: d.camada,
  });
}

async function desenharPagina(doc: JsPDF, d: DadosRelatorioCondutividade, logos: Logos): Promise<void> {
  const q = d.quantis;
  const mapaW = 168, mapaH = 116, mapaX = M, mapaY = 31;

  const png = await capturarMapaFertilidade({
    rasterPng: d.rasterPng, bounds: d.bounds, poligono: d.poligono, valores: EMPTY_FC,
    satelite: d.satelite, corLimite: d.corLimite,
    larguraPx: Math.round(mapaW * PXMM), alturaPx: Math.round(mapaH * PXMM),
  });

  const pct = q.faixas.length ? 100 / q.faixas.length : 20;
  desenharCabecalhoOficial(doc, {
    logoCliente: logos.cli,
    fazenda: san(d.fazenda),
    esquerda: [
      `Produtor: ${san(d.produtor) || '—'}`,
      `Talhao: ${san(d.talhao) || '—'}   |   Camada: ${san(d.camada)}`,
    ],
    titulo: 'CEa',
    subtitulo: `Condutividade Eletrica (${san(d.unidade)})`,
    info: [
      `Area Total: ${fmt(d.areaHa, 2)} ha`,
      `Municipio: ${municipioUf(d)}`,
      `Levantamento: ${dataBR(d.dataLevantamento)}`,
      `Datum: ${DATUM}`,
    ],
  });

  const jpg = await imagemParaPdf(png, mapaW);
  doc.addImage(jpg.data, jpg.formato, mapaX, mapaY, mapaW, mapaH);
  doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.rect(mapaX, mapaY, mapaW, mapaH, 'S');
  rosaDosVentos(doc, mapaX + 7, mapaY + mapaH - 7);

  // ── Tira de cor DISCRETA com os cortes REAIS deste levantamento ──
  const tiraY = mapaY + mapaH + 5, tiraH = 5;
  const n = q.faixas.length;
  const larg = mapaW / (n || 1);
  q.faixas.forEach((f, i) => {
    doc.setFillColor(...hexRgb(f.cor));
    doc.rect(mapaX + i * larg, tiraY, larg, tiraH, 'F');
  });
  doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.rect(mapaX, tiraY, mapaW, tiraH, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...NAVY);
  doc.text(`Cortes calculados deste levantamento (${san(d.unidade)})`, mapaX + mapaW / 2, tiraY - 1.5, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...GRAY);
  doc.text(fmt(q.faixas[0].min, 1), mapaX, tiraY + tiraH + 3.5, { align: 'left' });
  q.breaks.forEach((b, i) => doc.text(fmt(b, 1), mapaX + (i + 1) * larg, tiraY + tiraH + 3.5, { align: 'center' }));
  doc.text(fmt(q.faixas[n - 1].max, 1), mapaX + mapaW, tiraY + tiraH + 3.5, { align: 'right' });

  escalaGrafica(doc, mapaX + mapaW / 2, tiraY + tiraH + 10, d.bounds, mapaW);

  // ── TABELA DAS FAIXAS ──
  const tabX = mapaX + mapaW + 6, tabW = W - M - tabX;
  let ty = mapaY;
  doc.setFillColor(...NAVY); doc.rect(tabX, ty, tabW, 7, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
  doc.text('FAIXA', tabX + 8, ty + 4.8);
  doc.text(`INTERVALO (${san(d.unidade)})`, tabX + 34, ty + 4.8);
  doc.text('ha', tabX + tabW - 20, ty + 4.8, { align: 'right' });
  doc.text('%', tabX + tabW - 3, ty + 4.8, { align: 'right' });
  ty += 7;

  const rowH = 7.6;
  let somaHa = 0;
  q.faixas.forEach((f, i) => {
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(tabX, ty + rowH, tabX + tabW, ty + rowH);
    doc.setFillColor(...hexRgb(f.cor)); doc.roundedRect(tabX + 2, ty + 1.8, 4, 4, 0.6, 0.6, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...NAVY);
    doc.text(clipTexto(doc, san(f.nome), 24), tabX + 8, ty + 5);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY);
    doc.text(rotuloFaixaCea(q, i), tabX + 34, ty + 5);
    doc.setTextColor(...NAVY);
    doc.text(fmt(f.areaHa, 2), tabX + tabW - 20, ty + 5, { align: 'right' });
    doc.text(fmt(f.pctArea, 1), tabX + tabW - 3, ty + 5, { align: 'right' });
    somaHa += f.areaHa;
    ty += rowH;
  });
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.5); doc.line(tabX, ty + 0.5, tabX + tabW, ty + 0.5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...NAVY);
  doc.text('TOTAL', tabX + 8, ty + 5.4);
  doc.text(fmt(somaHa, 2), tabX + tabW - 20, ty + 5.4, { align: 'right' });
  doc.text('100,0', tabX + tabW - 3, ty + 5.4, { align: 'right' });

  // ── LEVANTAMENTO: a aferição, que é o que diz se dá para confiar no mapa ──
  const ry = ty + 12, rh = 46;
  quadro(doc, tabX, ry, tabW, rh, 'LEVANTAMENTO');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
  const linhas = [
    `Versao: ${san(d.levantamento) || '—'}`,
    `Pontos medidos: ${d.nPontos}   |   Pixel: ${d.pixelM} m`,
    `Modelo: ${san(d.modelo) || '—'}`,
    `Medido: ${d.minObs != null ? fmt(d.minObs, 1) : '—'} a ${d.maxObs != null ? fmt(d.maxObs, 1) : '—'} ${san(d.unidade)}`,
    `Erro (RMSE): ${d.rmse != null ? fmt(d.rmse, 2) + ' ' + san(d.unidade) : '—'}`,
    ...(d.percRemovido != null ? [`Removido na limpeza: ${fmt(d.percRemovido, 1)}%`] : []),
  ];
  linhas.forEach((t, i) => doc.text(t, tabX + 4, ry + 12 + i * 4.6));
  if (d.qualidade) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...(d.qualidade.apto ? [22, 101, 52] as [number, number, number] : VERM));
    doc.text(`Qualidade: ${san(d.qualidade.rotulo)}${d.qualidade.apto ? ' — apto p/ Zonas de Manejo' : ''}`,
      tabX + 4, ry + 12 + linhas.length * 4.6, { maxWidth: tabW - 8 });
  }
  if (q.colapsadas > 0) {
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...VERM); doc.setFontSize(7);
    doc.text(`${q.colapsadas} faixa(s) unida(s): ha valores repetidos no mapa.`,
      tabX + 4, ry + rh - 3, { maxWidth: tabW - 8 });
  }

  marcaInvicta(doc, logos.inv, 'esquerda');
  rodape(doc, logos);
}

/** Monta o PDF, abre em nova aba (com o erro na própria aba se falhar) e devolve o Blob. */
export async function gerarRelatorioCondutividade(d: DadosRelatorioCondutividade): Promise<Blob> {
  const erro = validarCondutividade(d);
  if (erro) throw new Error(erro);
  const aba = typeof window !== 'undefined' ? window.open('', '_blank') : null;
  if (aba) try { aba.document.write('<!doctype html><meta charset="utf-8"><title>Relatório</title><body style="font-family:system-ui,sans-serif;padding:28px;color:#334155"><p>⏳ Gerando o PDF da condutividade… aguarde (capturando o mapa).</p></body>'); } catch {}
  try {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    const logos = await carregarLogos(d.logoClienteUrl);
    await desenharPagina(doc, d, logos);
    const blob = doc.output('blob');
    if (aba) { const url = URL.createObjectURL(blob); aba.location.href = url; setTimeout(() => URL.revokeObjectURL(url), 60000); }
    else doc.save(`${nomeArquivoCondutividade(d)}.pdf`);
    return blob;
  } catch (e) {
    const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
    console.error('[relatorio CEa] falha:', e);
    if (aba) { try { aba.document.body.innerHTML = `<h3 style="color:#b91c1c;font-family:system-ui">Falha ao gerar o relatório</h3><pre style="white-space:pre-wrap;font-size:12px;color:#334155">${msg.replace(/[<>&]/g, s => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[s]!))}</pre>`; } catch {} }
    throw e;
  }
}
