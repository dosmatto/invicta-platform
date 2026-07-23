'use client';

// Fase PDF-1 — Relatório PDF do Comparador de Cenários (C1), A4 paisagem.
// Uma página por PRODUTO: cabeçalho navy + 2–3 mapas (satélite + raster de dose)
// lado a lado (recomendado com ★ + moldura verde), legenda única de dose, e
// Resumo Técnico + Resumo Financeiro. Reaproveita capturarMapaFertilidade,
// colorirDose e o padrão jsPDF (abre em nova aba) dos relatórios de fertilidade.

import type { jsPDF as JsPDF } from 'jspdf';
import { capturarMapaFertilidade } from '../capturaMapa';
import { imagemParaPdf } from '../pdfImagem';
import { colorirDose } from '../raster';
import { hexToRgb } from '../legendas';
import { extrairPoligono, decodeGrid } from '../fertilidade';
import { getTalhoes, getFazendas, getClientes, getPlantio } from '../store';
import { listar as bibListar, type ConteudoEquacao } from '../biblioteca';
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
  // Abre a aba ANTES de qualquer await (senão o navegador bloqueia o popup).
  const aba = typeof window !== 'undefined' ? window.open('', '_blank') : null;
  try {
    const blob = await montarPdfComparador(cenarios);
    abrirOuBaixar(blob, aba, `comparador-${cenarios[0]?.safra || 'cenarios'}.pdf`);
  } catch (e) {
    if (aba) aba.close();
    throw e;
  }
}

// Monta o doc do comparador e devolve o Blob (sem abrir aba) — reutilizável no lote.
export async function montarPdfComparador(cenarios: Cenario[]): Promise<Blob> {
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

  let recIdx = 0; let min = Infinity;
  cenarios.forEach((c, i) => { if (c.financeiro.custoTotal < min) { min = c.financeiro.custoTotal; recIdx = i; } });

  const produtos: string[] = [];
  for (const c of cenarios) for (const d of c.doses) { const k = chaveProduto(d); if (!produtos.includes(k)) produtos.push(k); }
  if (produtos.length === 0) throw new Error('Os cenários não têm doses para comparar.');

  const logoBranca = await carregarImg('/images/logo-branca.png').catch(() => null);
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  let primeira = true;
  for (const prod of produtos) {
    if (!primeira) doc.addPage();
    primeira = false;
    await desenharPagina(doc, prod, cenarios, recIdx, ctx, logoBranca);
  }
  return doc.output('blob');
}

export function abrirOuBaixar(blob: Blob, aba: Window | null, nome: string) {
  const url = URL.createObjectURL(blob);
  if (aba) { aba.location.href = url; }
  else { const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
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
  const HEAD_H = 8, SUB_H = 4.2;   // título (cenário) + subtítulo (equação) de cada quadro
  const capturas = await Promise.all(doses.map(async d => {
    if (!d || !estilo) return null;
    try { const png = colorirDose(d.grid, estilo).dataUrl;
      return await capturarMapaFertilidade({ rasterPng: png, bounds: d.bounds, poligono: ctx.poligono, valores: VAZIO, satelite: true, corLimite: '#ffffff', larguraPx: 760, alturaPx: 520 });
    } catch { return null; }
  }));
  for (let i = 0; i < n; i++) {
    const x = M + i * (frameW + gap), rec = i === recIdx;
    doc.setFillColor(...(rec ? GREEN : NAVY)); doc.rect(x, mapsY, frameW, HEAD_H, 'F');
    doc.setFontSize(8.5); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
    doc.text((rec ? '* ' : '') + san(cenarios[i].nome), x + frameW / 2, mapsY + 5.4, { align: 'center', maxWidth: frameW - 4 });
    // subtítulo — nome da EQUAÇÃO que gerou esta dose (deixa claro qual método/fórmula)
    const nomeEq = doses[i]?.nomeEquacao;
    if (nomeEq) {
      doc.setFontSize(7); doc.setTextColor(...GRAY); doc.setFont('helvetica', 'normal');
      doc.text(san(nomeEq), x + frameW / 2, mapsY + HEAD_H + 3, { align: 'center', maxWidth: frameW - 4 });
    }
    const imgY = mapsY + HEAD_H + SUB_H, imgH = mapsH - HEAD_H - SUB_H;
    const img = capturas[i];
    if (img) { const j = await imagemParaPdf(img, frameW); doc.addImage(j.data, j.formato, x, imgY, frameW, imgH); }
    else { doc.setFillColor(240, 242, 245); doc.rect(x, imgY, frameW, imgH, 'F'); doc.setTextColor(...GRAY); doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.text('sem este produto', x + frameW / 2, imgY + imgH / 2, { align: 'center' }); }
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
    classes.forEach((c, i) => {
      if (estilo.zeroTransparente && c.limiteSuperior <= estilo.valorMinimo) { doc.setDrawColor(...GRAY); doc.rect(lx + i * segW, y, segW, 4); }
      else { const [r, g, b] = hexToRgb(c.cor); doc.setFillColor(r, g, b); doc.rect(lx + i * segW, y, segW, 4, 'F'); }
    });
    doc.setDrawColor(...LINE); doc.rect(lx, y, lw, 4);
    doc.setFontSize(7); doc.setTextColor(...GRAY); doc.setFont('helvetica', 'normal');
    doc.text(fmt(0), lx, y + 8);
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

// ─── C2 — Recomendação Oficial (book em lote) ─────────────────────────────
interface FaixaPlano { inf: number; sup: number; cor: string; area: number; pct: number; transparente: boolean; }
function planoDeAplicacao(dose: DoseCalculada, areaHa: number): FaixaPlano[] {
  const classes = [...dose.estilo.classes].filter(c => Number.isFinite(c.limiteSuperior)).sort((a, b) => a.limiteSuperior - b.limiteSuperior);
  if (!classes.length) return [];
  const lims = classes.map(c => c.limiteSuperior);
  const cont = new Array(classes.length).fill(0);
  let n = 0;
  try {
    const { valores } = decodeGrid(dose.grid);
    for (let i = 0; i < valores.length; i++) { const v = valores[i]; if (!isFinite(v)) continue; n++; let k = lims.findIndex(L => v <= L); if (k < 0) k = classes.length - 1; cont[k]++; }
  } catch { /* sem grid */ }
  const areaPx = n > 0 ? areaHa / n : 0;
  // 1ª faixa sempre começa em 0 (ex.: "0 – 500"); faixa ≤ valor mínimo (com zero
  // transparente) é a banda transparente (não aplica) — evita "500 – 500".
  return classes.map((c, i) => ({
    inf: i === 0 ? 0 : classes[i - 1].limiteSuperior, sup: c.limiteSuperior, cor: c.cor,
    area: cont[i] * areaPx, pct: n > 0 ? cont[i] / n * 100 : 0,
    transparente: dose.estilo.zeroTransparente && c.limiteSuperior <= dose.estilo.valorMinimo,
  }));
}

function secaoH(doc: JsPDF, x: number, y: number, t: string): number {
  doc.setFontSize(8); doc.setTextColor(...GREEN); doc.setFont('helvetica', 'bold'); doc.text(t.toUpperCase(), x, y); return y + 4.6;
}
function kv(doc: JsPDF, x: number, w: number, y: number, k: string, v: string, cor?: RGB, fill?: boolean): number {
  if (fill) { doc.setFillColor(238, 246, 233); doc.rect(x, y - 2.9, w, 4.5, 'F'); }
  doc.setFontSize(8); doc.setFont('helvetica', fill ? 'bold' : 'normal'); doc.setTextColor(...(fill ? GREEN : [90, 101, 115] as RGB)); doc.text(k, x, y);
  doc.setTextColor(...(cor ?? (fill ? GREEN : [40, 48, 58] as RGB))); doc.setFont('helvetica', cor || fill ? 'bold' : 'normal'); doc.text(v, x + w, y, { align: 'right' });
  doc.setDrawColor(...LINE); doc.line(x, y + 1.7, x + w, y + 1.7);
  return y + 5;
}

async function desenharPaginaOficial(doc: JsPDF, dose: DoseCalculada, cenNome: string, ctx: Ctx, logo: HTMLImageElement | null, numero: number) {
  const W = 297, H = 210, M = 6;
  let mapImg: string | null = null;
  try { mapImg = await capturarMapaFertilidade({ rasterPng: colorirDose(dose.grid, dose.estilo).dataUrl, bounds: dose.bounds, poligono: ctx.poligono, valores: VAZIO, satelite: true, corLimite: '#ffffff', larguraPx: 900, alturaPx: 805 }); } catch { /* segue */ }

  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 16, 'F');
  if (logo) { const h = 9.5, w = h * (logo.naturalWidth / logo.naturalHeight); doc.addImage(logo, 'PNG', M, 3.2, w, h); }
  const campos: [string, string][] = [
    ['FAZENDA', ctx.fazenda], ['TALHÃO', ctx.talhao], ['SAFRA', ctx.safra], ['PRODUTO', dose.produto || dose.nomeEquacao],
    ['CENÁRIO', cenNome], ['ÁREA', `${fmt(ctx.areaHa, 1)} ha`], ['DATA', new Date().toLocaleDateString('pt-BR')],
  ];
  let cx = 44;
  for (const [lb, val] of campos) {
    doc.setFontSize(6); doc.setTextColor(127, 163, 207); doc.setFont('helvetica', 'normal'); doc.text(san(lb), cx, 6.5);
    doc.setFontSize(8); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.text(san(val) || '—', cx, 11.5, { maxWidth: 42 });
    cx += Math.max(26, Math.min(50, san(val).length * 1.7 + 14));
  }

  const SX = M, SW = 82; let y = 22;
  // Título = "NN - produto" (ex.: "01 - Calcário", "10 - <fórmula>"). O número
  // é o nº DEFINIDO NA JANELA DE EQUAÇÕES (ConteudoEquacao.ordem), não um contador.
  const rotuloMapa = dose.produto || dose.nomeEquacao || 'Recomendação';
  const titulo = `${String(numero).padStart(2, '0')} - ${rotuloMapa}`;
  doc.setFontSize(11); doc.setTextColor(...GREEN); doc.setFont('helvetica', 'bold'); doc.text(san(titulo), SX, y, { maxWidth: SW }); y += 4.2;
  // subtítulo — nome da EQUAÇÃO/fórmula, quando acrescenta info além do rótulo
  if (dose.nomeEquacao && dose.nomeEquacao !== rotuloMapa) {
    doc.setFontSize(7.5); doc.setTextColor(...GRAY); doc.setFont('helvetica', 'normal');
    doc.text(san(dose.nomeEquacao), SX, y, { maxWidth: SW });
    y += 3.4;
  }
  y += 2;
  y = secaoH(doc, SX, y, 'Produtor / fazenda / cultura');
  doc.setFontSize(9); doc.setTextColor(40, 48, 58); doc.setFont('helvetica', 'bold'); doc.text(san(ctx.produtor) || '—', SX, y); y += 4;
  doc.setFontSize(8); doc.setTextColor(...GRAY); doc.setFont('helvetica', 'normal'); doc.text(`${san(ctx.fazenda)} · ${san(ctx.cultura) || '—'}`, SX, y); y += 6;

  y = secaoH(doc, SX, y, 'Resumo técnico');
  y = kv(doc, SX, SW, y, 'Área total', `${fmt(ctx.areaHa, 1)} ha`);
  y = kv(doc, SX, SW, y, 'Dose média', `${fmt(dose.stats.media)} kg/ha`, GREEN);
  y = kv(doc, SX, SW, y, 'Dose mínima', `${fmt(dose.stats.min)} kg/ha`);
  y = kv(doc, SX, SW, y, 'Dose máxima', `${fmt(dose.stats.max)} kg/ha`, [192, 57, 43]);
  y = kv(doc, SX, SW, y, 'Quantidade total', `${fmt(dose.toneladas, 1)} t`);
  y += 2;

  y = secaoH(doc, SX, y, 'Plano de aplicação');
  doc.setFontSize(6.5); doc.setTextColor(...GRAY); doc.setFont('helvetica', 'normal');
  doc.text('Faixa (kg/ha)', SX, y); doc.text('ha', SX + SW - 16, y, { align: 'right' }); doc.text('%', SX + SW, y, { align: 'right' });
  y += 1; doc.setDrawColor(...LINE); doc.line(SX, y, SX + SW, y); y += 3.4;
  doc.setFontSize(7.5); doc.setTextColor(40, 48, 58); doc.setFont('helvetica', 'normal');
  for (const f of planoDeAplicacao(dose, ctx.areaHa)) {
    if (f.transparente) { doc.setDrawColor(...GRAY); doc.setLineWidth(0.3); doc.rect(SX, y - 2.6, 4, 3); doc.setLineWidth(0.2); }
    else { const [r, g, b] = hexToRgb(f.cor); doc.setFillColor(r, g, b); doc.rect(SX, y - 2.6, 4, 3, 'F'); }
    doc.text(`${fmt(f.inf)} – ${fmt(f.sup)}`, SX + 6, y);
    doc.text(fmt(f.area, 1), SX + SW - 16, y, { align: 'right' });
    doc.text(fmt(f.pct, 1) + '%', SX + SW, y, { align: 'right' });
    y += 4; doc.setDrawColor(...LINE); doc.line(SX, y - 2.8, SX + SW, y - 2.8);
  }
  y += 2;

  y = secaoH(doc, SX, y, 'Resumo financeiro');
  y = kv(doc, SX, SW, y, 'Custo estimado por ha', `R$ ${fmt(dose.custoProdutoHa ?? 0, 2)}/ha`, GREEN, true);
  y = kv(doc, SX, SW, y, 'Custo estimado total', `R$ ${fmt((dose.custoProdutoHa ?? 0) * ctx.areaHa, 2)}`);

  const mx = M + 86, my = 20, mw = W - mx - M, mh = H - my - 11;
  doc.setFillColor(36, 48, 24); doc.rect(mx, my, mw, mh, 'F');
  if (mapImg) { const j = await imagemParaPdf(mapImg, mw); doc.addImage(j.data, j.formato, mx, my, mw, mh); }

  doc.setFillColor(...NAVY); doc.rect(0, H - 9, W, 9, 'F');
  if (logo) { const h = 4.5, w = h * (logo.naturalWidth / logo.naturalHeight); doc.addImage(logo, 'PNG', M, H - 7, w, h); }
  doc.setFontSize(7); doc.setTextColor(127, 163, 207); doc.setFont('helvetica', 'normal'); doc.text('Recomendação oficial — taxa variável', W - M, H - 3.5, { align: 'right' });
}

// Book: 1 página oficial por dose (produto) de cada cenário/recomendação. 1 PDF.
// Renderiza a seção de Recomendações (1 página por dose) num doc jsPDF JÁ
// EXISTENTE (A4 paisagem). Reutilizado pelo book só-de-recomendações
// (montarBookOficial) e pelo relatório COMBINADO (relatorioCombinado.ts).
// `novaPaginaAntes` = o doc já tem conteúdo antes desta seção.
export async function renderBookOficialNoDoc(
  doc: JsPDF, cenarios: Cenario[], opts?: { novaPaginaAntes?: boolean },
): Promise<void> {
  if (cenarios.length === 0) return;
  const tId = cenarios[0].talhaoId, safra = cenarios[0].safra;
  const tal = getTalhoes().find(t => t.id === tId) ?? null;
  const faz = tal ? getFazendas().find(f => f.id === tal.fazendaId) ?? null : null;
  const cli = faz ? getClientes().find(c => c.id === faz.clienteId) ?? null : null;
  const poligono = tal?.geojson ? (() => { try { return extrairPoligono(JSON.parse(tal.geojson!)); } catch { return null; } })() : null;
  if (!poligono) throw new Error('Talhão sem polígono salvo — não dá para desenhar os mapas.');
  const ctx: Ctx = { fazenda: faz?.nome ?? '', talhao: tal?.nome ?? '', safra, cultura: getPlantio(tId, safra), produtor: cli?.nome ?? '', areaHa: tal?.areaHa ?? 0, poligono };
  const logo = await carregarImg('/images/logo-branca.png').catch(() => null);
  // Número de cada mapa = o "nº" DEFINIDO NA JANELA DE EQUAÇÕES (ConteudoEquacao.ordem),
  // p.ex. Calcário 1–6, Gesso 10–14 — NÃO renumera do 1 a cada bloco. Fallback = sequência
  // só para equações sem número definido (para nunca ficar sem rótulo).
  const ordemPorEquacao = new Map<string, number>();
  for (const it of bibListar<ConteudoEquacao>('equacoes')) {
    if (typeof it.conteudo?.ordem === 'number') ordemPorEquacao.set(it.id, it.conteudo.ordem);
  }
  let precisaPagina = opts?.novaPaginaAntes ?? false;
  let algum = false;
  for (const cen of cenarios) {
    // Páginas na ORDEM CRESCENTE do nº da equação (01, 02, … 10, 23…), não na
    // ordem em que as doses foram geradas. Equação sem nº vai para o fim, na
    // ordem original (chave 1e9+i preserva a posição relativa).
    const doses = cen.doses
      .map((d, i) => ({ d, k: ordemPorEquacao.get(d.equacaoId) ?? 1e9 + i }))
      .sort((a, b) => a.k - b.k)
      .map(x => x.d);
    let seq = 0;
    for (const dose of doses) {
      seq++;
      const numero = ordemPorEquacao.get(dose.equacaoId) ?? seq;   // nº das Equações; fallback = sequência
      if (precisaPagina) doc.addPage();
      precisaPagina = true;
      algum = true;
      await desenharPaginaOficial(doc, dose, cen.nome, ctx, logo, numero);
    }
  }
  if (!algum) throw new Error('As recomendações não geraram nenhuma dose.');
}

export async function montarBookOficial(cenarios: Cenario[]): Promise<Blob> {
  if (cenarios.length === 0) throw new Error('Nenhuma recomendação selecionada.');
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  await renderBookOficialNoDoc(doc, cenarios, { novaPaginaAntes: false });
  return doc.output('blob');
}
