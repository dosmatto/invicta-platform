'use client';

// Fase PDF-1 — Relatório PDF do Comparador de Cenários (C1), A4 paisagem.
// Uma página por PRODUTO: cabeçalho navy + 2–3 mapas (satélite + raster de dose)
// lado a lado (recomendado com ★ + moldura verde), legenda única de dose, e
// Resumo Técnico + Resumo Financeiro. Reaproveita capturarMapaFertilidade,
// colorirDose e o padrão jsPDF (abre em nova aba) dos relatórios de fertilidade.

import type { jsPDF as JsPDF } from 'jspdf';
import { capturarMapaFertilidade } from '../capturaMapa';
import { colorirDose } from '../raster';
import { hexToRgb } from '../legendas';
import { extrairPoligono } from '../fertilidade';
import { getTalhoes, getFazendas, getClientes, getPlantio } from '../store';
import type { Cenario } from './cenarios';
import type { DoseCalculada } from './aplicar';

type RGB = [number, number, number];
const NAVY: RGB = [13, 33, 64];
const GREEN: RGB = [31, 90, 26];
const GRAY: RGB = [100, 116, 139];
const LINE: RGB = [210, 219, 232];
const fmt = (v: number, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const SUB = '₀₁₂₃₄₅₆₇₈₉';
const san = (s: string | null | undefined): string => (s ?? '')
  .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, c => '0123456789'[SUB.indexOf(c)]).replace(/[^\x00-\xFF]/g, '');

function carregarImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => res(img); img.onerror = () => rej(new Error('img')); img.src = src; });
}
const chaveProduto = (d: DoseCalculada) => d.produto || d.nomeEquacao;

export async function gerarPdfComparador(cenarios: Cenario[]): Promise<void> {
  if (cenarios.length < 2) throw new Error('Selecione ao menos 2 cenários.');
  const tId = cenarios[0].talhaoId, safra = cenarios[0].safra;
  const tal = getTalhoes().find(t => t.id === tId) ?? null;
  const faz = tal ? getFazendas().find(f => f.id === tal.fazendaId) ?? null : null;
  const cli = faz ? getClientes().find(c => c.id === faz.clienteId) ?? null : null;
  const poligono = tal?.geojson ? (() => { try { return extrairPoligono(JSON.parse(tal.geojson!)); } catch { return null; } })() : null;
  if (!poligono) throw new Error('Talhão sem polígono salvo — não dá para desenhar os mapas.');
  const ctx = {
    fazenda: faz?.nome ?? '', talhao: tal?.nome ?? '', safra, cultura: getPlantio(tId, safra),
    produtor: cli?.nome ?? '', areaHa: tal?.areaHa ?? 0, poligono,
  };

  // cenário recomendado = menor investimento total
  let recIdx = 0; let min = Infinity;
  cenarios.forEach((c, i) => { if (c.financeiro.custoTotal < min) { min = c.financeiro.custoTotal; recIdx = i; } });

  // produtos (união, preservando ordem)
  const produtos: string[] = [];
  for (const c of cenarios) for (const d of c.doses) { const k = chaveProduto(d); if (!produtos.includes(k)) produtos.push(k); }
  if (produtos.length === 0) throw new Error('Os cenários não têm doses para comparar.');

  const logoBranca = await carregarImg('/images/logo-branca.png').catch(() => null);

  const aba = typeof window !== 'undefined' ? window.open('', '_blank') : null;
  try {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    let primeira = true;
    for (const prod of produtos) {
      if (!primeira) doc.addPage();
      primeira = false;
      await desenharPagina(doc, prod, cenarios, recIdx, ctx, logoBranca);
    }
    const blob = doc.output('blob');
    if (aba) { const url = URL.createObjectURL(blob); aba.location.href = url; setTimeout(() => URL.revokeObjectURL(url), 60000); }
  } catch (e) {
    if (aba) aba.close();
    throw e;
  }
}

interface Ctx { fazenda: string; talhao: string; safra: string; cultura: string; produtor: string; areaHa: number; poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon; }
const VAZIO: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

async function desenharPagina(doc: JsPDF, produto: string, cenarios: Cenario[], recIdx: number, ctx: Ctx, logo: HTMLImageElement | null) {
  const W = 297, H = 210, M = 6;
  // dose de cada cenário p/ este produto
  const doses = cenarios.map(c => c.doses.find(d => chaveProduto(d) === produto) ?? null);
  const ref = doses.find(d => d) ?? null;
  const estilo = ref?.estilo;
  const unidade = ref?.unidade ?? '';

  // Cabeçalho navy
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 22, 'F');
  if (logo) { const h = 11, w = h * (logo.naturalWidth / logo.naturalHeight); doc.addImage(logo, 'PNG', M, 5.5, w, h); }
  const campos: [string, string][] = [
    ['FAZENDA', ctx.fazenda], ['TALHÃO', ctx.talhao], ['SAFRA', ctx.safra], ['CULTURA', ctx.cultura], ['PRODUTO', produto],
  ];
  let cx = 46;
  for (const [lb, val] of campos) {
    doc.setFontSize(6.5); doc.setTextColor(127, 163, 207); doc.setFont('helvetica', 'normal'); doc.text(san(lb), cx, 9);
    doc.setFontSize(9); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.text(san(val) || '—', cx, 14);
    cx += Math.max(28, san(val).length * 1.9 + 16);
  }
  doc.setFillColor(20, 50, 87); doc.roundedRect(W - M - 62, 4, 62, 14, 2, 2, 'F');
  doc.setFontSize(9); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.text('COMPARADOR DE CENÁRIOS', W - M - 31, 9.5, { align: 'center' });
  doc.setFontSize(7.5); doc.setTextColor(127, 163, 207); doc.setFont('helvetica', 'normal'); doc.text(`Área total: ${fmt(ctx.areaHa, 1)} ha`, W - M - 31, 14.5, { align: 'center' });

  // Título
  doc.setFontSize(13); doc.setTextColor(...GREEN); doc.setFont('helvetica', 'bold');
  doc.text(`Recomendação de ${san(produto).toLowerCase()}`, M, 29);

  // Mapas
  const n = cenarios.length, gap = 5, mapsY = 33, mapsH = 80;
  const frameW = (W - 2 * M - (n - 1) * gap) / n;
  const capturas = await Promise.all(doses.map(async d => {
    if (!d || !estilo) return null;
    try { const png = colorirDose(d.grid, estilo).dataUrl;
      return await capturarMapaFertilidade({ rasterPng: png, bounds: d.bounds, poligono: ctx.poligono, valores: VAZIO, satelite: true, corLimite: '#ffffff', larguraPx: 760, alturaPx: 520 });
    } catch { return null; }
  }));
  for (let i = 0; i < n; i++) {
    const x = M + i * (frameW + gap), rec = i === recIdx;
    doc.setFillColor(...(rec ? GREEN : NAVY)); doc.rect(x, mapsY, frameW, 8, 'F');
    doc.setFontSize(8.5); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
    doc.text((rec ? '* ' : '') + san(cenarios[i].nome), x + frameW / 2, mapsY + 5.4, { align: 'center', maxWidth: frameW - 4 });
    const img = capturas[i];
    if (img) doc.addImage(img, 'PNG', x, mapsY + 8, frameW, mapsH - 8);
    else { doc.setFillColor(240, 242, 245); doc.rect(x, mapsY + 8, frameW, mapsH - 8, 'F'); doc.setTextColor(...GRAY); doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.text('sem este produto', x + frameW / 2, mapsY + mapsH / 2, { align: 'center' }); }
    if (rec) { doc.setDrawColor(...GREEN); doc.setLineWidth(0.8); doc.rect(x, mapsY, frameW, mapsH); doc.setLineWidth(0.2); }
  }

  // Legenda única
  let y = mapsY + mapsH + 6;
  if (estilo) {
    doc.setFontSize(9); doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold');
    doc.text(`Dose recomendada de ${san(produto).toLowerCase()} (${san(unidade) || 'kg/ha'})`, W / 2, y, { align: 'center' });
    y += 2.5;
    const classes = [...estilo.classes].sort((a, b) => a.limiteSuperior - b.limiteSuperior);
    const lw = 150, lx = (W - lw) / 2, segW = lw / classes.length;
    classes.forEach((c, i) => { const [r, g, b] = hexToRgb(c.cor); doc.setFillColor(r, g, b); doc.rect(lx + i * segW, y, segW, 4, 'F'); });
    doc.setDrawColor(...LINE); doc.rect(lx, y, lw, 4);
    doc.setFontSize(7); doc.setTextColor(...GRAY); doc.setFont('helvetica', 'normal');
    doc.text(fmt(estilo.valorMinimo), lx, y + 8);
    classes.forEach((c, i) => doc.text(fmt(c.limiteSuperior), lx + (i + 1) * segW, y + 8, { align: 'center' }));
    y += 12;
  }

  // Tabelas
  const colNomes = cenarios.map((c, i) => (i === recIdx ? '* ' : '') + abrevia(c.nome));
  const tw = (W - 2 * M - 8) / 2;
  const tecnicas: [string, (d: DoseCalculada | null) => string][] = [
    ['Dose mínima', d => d ? fmt(d.stats.min) : '—'],
    ['Dose média', d => d ? fmt(d.stats.media) : '—'],
    ['Dose máxima', d => d ? fmt(d.stats.max) : '—'],
    ['Quantidade total (t)', d => d ? fmt(d.toneladas, 1) : '—'],
  ];
  desenharTabela(doc, M, y, tw, 'Resumo técnico', colNomes, tecnicas.map(([k, f]) => [k, ...doses.map(f)]), recIdx, []);

  const recDose = doses[recIdx];
  const finance: [string, (d: DoseCalculada | null) => string, boolean][] = [
    ['Produto (R$/t)', d => d?.custoTonelada != null ? fmt(d.custoTonelada, 2) : '—', false],
    ['Frete (R$/ha)', d => d ? fmt(d.freteHa ?? 0, 2) : '—', false],
    ['Aplicação (R$/ha)', d => d ? fmt(d.aplicacaoHa ?? 0, 2) : '—', false],
    ['Custo por hectare', d => d ? 'R$ ' + fmt(d.custoHa ?? 0, 2) : '—', true],
    ['Investimento total', d => d ? 'R$ ' + fmt(d.custo ?? 0, 2) : '—', true],
    ['Dif. vs. recomendado', d => !d || !recDose ? '—' : (d === recDose ? '—' : ((d.custo ?? 0) - (recDose.custo ?? 0) >= 0 ? '+ ' : '- ') + 'R$ ' + fmt(Math.abs((d.custo ?? 0) - (recDose.custo ?? 0)), 2)), false],
  ];
  desenharTabela(doc, M + tw + 8, y, tw, 'Resumo financeiro', colNomes, finance.map(([k, f]) => [k, ...doses.map(f)]), recIdx, finance.map(f => f[2]));

  // Rodapé
  doc.setFillColor(...NAVY); doc.rect(0, H - 9, W, 9, 'F');
  if (logo) { const h = 4.5, w = h * (logo.naturalWidth / logo.naturalHeight); doc.addImage(logo, 'PNG', M, H - 7, w, h); }
  doc.setFontSize(7); doc.setTextColor(127, 163, 207); doc.setFont('helvetica', 'normal');
  doc.text('Comparador de cenários — recomendação de taxa variável', W - M, H - 3.5, { align: 'right' });
}

const abrevia = (s: string) => s.length > 16 ? s.slice(0, 15) + '…' : s;

function desenharTabela(doc: JsPDF, x: number, y: number, w: number, titulo: string, colNomes: string[], linhas: string[][], recIdx: number, destaqueLinha: boolean[]) {
  doc.setFontSize(10); doc.setTextColor(...GREEN); doc.setFont('helvetica', 'bold'); doc.text(titulo, x, y);
  let yy = y + 5;
  const c0 = w * 0.36, cw = (w - c0) / colNomes.length;
  const colX = (i: number) => i === 0 ? x : x + c0 + (i - 1) * cw + cw - 1;
  doc.setFontSize(7.5); doc.setTextColor(...GRAY); doc.setFont('helvetica', 'bold');
  doc.text('Indicador', x, yy);
  colNomes.forEach((c, i) => doc.text(c, colX(i + 1), yy, { align: 'right' }));
  yy += 1.5; doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(x, yy, x + w, yy); yy += 3.6;
  linhas.forEach((row, ri) => {
    const dest = destaqueLinha[ri];
    if (dest) { doc.setFillColor(238, 246, 233); doc.rect(x, yy - 3.1, w, 4.6, 'F'); }
    doc.setFontSize(8.3);
    doc.setFont('helvetica', dest ? 'bold' : 'normal'); doc.setTextColor(40, 48, 58);
    doc.text(row[0], x, yy);
    for (let i = 1; i < row.length; i++) {
      const ehRec = i - 1 === recIdx;
      doc.setFont('helvetica', dest || ehRec ? 'bold' : 'normal');
      doc.setTextColor(...(ehRec ? GREEN : [40, 48, 58] as RGB));
      doc.text(row[i], colX(i), yy, { align: 'right' });
    }
    yy += 4.6; doc.setDrawColor(...LINE); doc.line(x, yy - 3.1, x + w, yy - 3.1);
  });
}
