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
import { rotuloAno } from '../periodo';
import { extrairPoligono, decodeGrid } from '../fertilidade';
import { getTalhoes, getFazendas, getClientes, getPlantio } from '../store';
import { anoDaSafra } from '../periodo';
import { nomeExport } from '../nomeExport';
import { listar as bibListar, type ConteudoEquacao } from '../biblioteca';
import type { Cenario } from './cenarios';
import { listarCenarios, descomprimirCenario } from './cenarios';
import type { DoseCalculada } from './aplicar';
import { classesVisiveis, indiceClasse } from './faixas';
import { coberturaDoGrid } from './cobertura';

// Ordena talhões pelo nome de forma ALFANUMÉRICA (DNHDV 01 < 02 < 10) — ordem
// padrão de TODOS os relatórios que listam vários talhões.
export const ordenarTalhoesAlfa = <T extends { nome?: string }>(arr: T[]): T[] =>
  [...arr].sort((a, b) => (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR', { numeric: true }));

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
    // O comparador cruza cenários de UM talhão — o nome sai dele.
    const tal = getTalhoes().find(t => t.id === cenarios[0]?.talhaoId);
    const faz = tal ? getFazendas().find(f => f.id === tal.fazendaId) : undefined;
    abrirOuBaixar(blob, aba, nomeExport({
      fazenda: faz?.nome ?? '', siglaFazenda: faz?.sigla ?? null, talhao: tal?.nome ?? '',
      tipo: 'COMPARA', ano: anoDaSafra(cenarios[0]?.safra ?? ''), detalhe: 'cenarios',
    }) + '.pdf');
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

interface Ctx { fazenda: string; talhao: string; safra: string; cultura: string; produtor: string; areaHa: number; poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon | null; }
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
    ['FAZENDA', ctx.fazenda], ['TALHÃO', ctx.talhao], ['ANO', rotuloAno(ctx.safra)], ['CULTURA', ctx.cultura], ['PRODUTO', produto],
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
    if (!d || !estilo || !ctx.poligono) return null;
    try { const png = colorirDose(d.grid, estilo, d.doseMinima).dataUrl;
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
interface FaixaPlano { inf: number; sup: number; cor: string; area: number; pct: number; transparente: boolean; zero?: boolean }
function planoDeAplicacao(
  dose: DoseCalculada, areaHa: number,
  poligono?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null,
): FaixaPlano[] {
  const min = dose.doseMinima ?? 0;
  if (!dose.estilo.classes.some(c => Number.isFinite(c.limiteSuperior))) return [];
  // Classes coloridas = as ACIMA da dose mínima (as abaixo não ocorrem). MESMA
  // lista/índice que o MAPA usa (classesVisiveis/indiceClasse) — sem isto, mapa
  // e tabela discordavam nos pixels no piso da dose mínima.
  const coloridas = classesVisiveis(dose.estilo.classes, min);
  const lims = coloridas.map(c => c.limiteSuperior);
  const cont = new Array(coloridas.length).fill(0);
  let nZero = 0, n = 0;
  try {
    const { valores } = decodeGrid(dose.grid);
    // Cada pixel entra pela FRAÇÃO que está dentro do talhão. O raster de 20 m
    // cobre 100% do polígono e transborda na divisa; sem o peso, as células de
    // borda (meia célula de área, valor extrapolado) inflariam as faixas das
    // pontas. É o mesmo recorte do mapa, em número.
    const peso = poligono
      ? coberturaDoGrid(dose.grid.shape, dose.bounds, poligono)
      : null;
    for (let i = 0; i < valores.length; i++) {
      const v = valores[i]; if (!isFinite(v)) continue;
      const p = peso ? peso[i] : 1;
      if (p <= 0) continue;                              // só transbordo: não é talhão
      n += p;
      if (v <= 0) { nZero += p; continue; }              // ZERO = não aplica (faixa própria)
      cont[indiceClasse(v, lims)] += p;
    }
  } catch { /* sem grid */ }
  const areaPx = n > 0 ? areaHa / n : 0;
  const faixas: FaixaPlano[] = [
    // "0" — o que é DE FATO zero: quadrado transparente (não aplica).
    { inf: 0, sup: 0, cor: '', area: nZero * areaPx, pct: n > 0 ? nZero / n * 100 : 0, transparente: true, zero: true },
  ];
  // 1ª faixa colorida SEMPRE começa na dose mínima da equação (ex.: 500 – 1.000).
  coloridas.forEach((c, i) => faixas.push({
    inf: i === 0 ? min : coloridas[i - 1].limiteSuperior, sup: c.limiteSuperior, cor: c.cor,
    area: cont[i] * areaPx, pct: n > 0 ? cont[i] / n * 100 : 0, transparente: false,
  }));
  return faixas;
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
  if (ctx.poligono) {
    try { mapImg = await capturarMapaFertilidade({ rasterPng: colorirDose(dose.grid, dose.estilo, dose.doseMinima).dataUrl, bounds: dose.bounds, poligono: ctx.poligono, valores: VAZIO, satelite: true, corLimite: '#ffffff', larguraPx: 900, alturaPx: 805 }); } catch { /* segue */ }
  }

  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 16, 'F');
  if (logo) { const h = 9.5, w = h * (logo.naturalWidth / logo.naturalHeight); doc.addImage(logo, 'PNG', M, 3.2, w, h); }
  const campos: [string, string][] = [
    ['FAZENDA', ctx.fazenda], ['TALHÃO', ctx.talhao], ['ANO', rotuloAno(ctx.safra)], ['PRODUTO', dose.produto || dose.nomeEquacao],
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
  for (const f of planoDeAplicacao(dose, ctx.areaHa, ctx.poligono)) {
    if (f.transparente) { doc.setDrawColor(...GRAY); doc.setLineWidth(0.3); doc.rect(SX, y - 2.6, 4, 3); doc.setLineWidth(0.2); }
    else { const [r, g, b] = hexToRgb(f.cor); doc.setFillColor(r, g, b); doc.rect(SX, y - 2.6, 4, 3, 'F'); }
    doc.text(f.zero ? '0' : `${fmt(f.inf)} – ${fmt(f.sup)}`, SX + 6, y);
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

// ─── Helpers compartilhados (resumo + book + fazenda) ────────────────────────
const dataHoje = () => new Date().toLocaleDateString('pt-BR');

function ctxDoTalhao(tId: string, safra: string): Ctx | null {
  const tal = getTalhoes().find(t => t.id === tId) ?? null;
  if (!tal) return null;
  const faz = getFazendas().find(f => f.id === tal.fazendaId) ?? null;
  const cli = faz ? getClientes().find(c => c.id === faz.clienteId) ?? null : null;
  const poligono = tal.geojson ? (() => { try { return extrairPoligono(JSON.parse(tal.geojson!)); } catch { return null; } })() : null;
  return { fazenda: faz?.nome ?? '', talhao: tal.nome ?? '', safra, cultura: getPlantio(tId, safra), produtor: cli?.nome ?? '', areaHa: tal.areaHa ?? 0, poligono };
}

// nº do cadastro (janela de Equações, ConteudoEquacao.ordem) p/ ordenar/rotular
// as doses. Doses de aplicação-parcelada têm equacaoId "<id>__apN" → usa o id BASE.
function construirNumDe(): (equacaoId: string) => number | undefined {
  const ordem = new Map<string, number>();
  for (const it of bibListar<ConteudoEquacao>('equacoes')) {
    if (typeof it.conteudo?.ordem === 'number') ordem.set(it.id, it.conteudo.ordem);
  }
  return (equacaoId: string) => ordem.get(equacaoId) ?? ordem.get(equacaoId.split('__ap')[0]);
}

interface ItemDose { cen: Cenario; d: DoseCalculada; numero: number; }
// Achata as doses de TODOS os cenários, opcionalmente só as marcadas com ★
// (usar), e ordena GLOBALMENTE pelo nº do cadastro (01, 02, … 10, 23…).
function achatarDoses(cenarios: Cenario[], numDe: (id: string) => number | undefined, somenteUsar: boolean): ItemDose[] {
  const itens = cenarios.flatMap((cen, ci) =>
    cen.doses.filter(d => !somenteUsar || d.usar)
      .map((d, di) => ({ cen, d, numero: numDe(d.equacaoId) ?? 1e9 + ci * 1000 + di })));
  itens.sort((a, b) => a.numero - b.numero);
  return itens;
}

// ── Cabeçalho navy compacto + rodapé + mini-tabela (reuso nos resumos) ──
function cabecalhoNavy(doc: JsPDF, logo: HTMLImageElement | null, campos: [string, string][]): number {
  const W = 297, M = 6;
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 16, 'F');
  if (logo) { const h = 9.5, w = h * (logo.naturalWidth / logo.naturalHeight); doc.addImage(logo, 'PNG', M, 3.2, w, h); }
  let cx = 44;
  for (const [lb, val] of campos) {
    doc.setFontSize(6); doc.setTextColor(127, 163, 207); doc.setFont('helvetica', 'normal'); doc.text(san(lb), cx, 6.5);
    doc.setFontSize(8); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.text(san(val) || '—', cx, 11.5, { maxWidth: 42 });
    cx += Math.max(24, Math.min(50, san(val).length * 1.7 + 14));
  }
  return 22;
}
function rodapeNavy(doc: JsPDF, logo: HTMLImageElement | null, txt: string) {
  const W = 297, H = 210, M = 6;
  doc.setFillColor(...NAVY); doc.rect(0, H - 9, W, 9, 'F');
  if (logo) { const h = 4.5, w = h * (logo.naturalWidth / logo.naturalHeight); doc.addImage(logo, 'PNG', M, H - 7, w, h); }
  doc.setFontSize(7); doc.setTextColor(127, 163, 207); doc.setFont('helvetica', 'normal'); doc.text(txt, W - M, H - 3.5, { align: 'right' });
}
interface Col { titulo: string; w: number; align?: 'l' | 'r' | 'c'; }
const alinhamento = (a?: 'l' | 'r' | 'c'): 'left' | 'right' | 'center' => a === 'r' ? 'right' : a === 'c' ? 'center' : 'left';
const larguraCols = (cols: Col[]) => cols.reduce((s, c) => s + c.w, 0);
function cabTabela(doc: JsPDF, x0: number, y: number, cols: Col[]): number {
  doc.setFontSize(7); doc.setTextColor(...GRAY); doc.setFont('helvetica', 'bold');
  let cx = x0;
  for (const c of cols) {
    const tx = c.align === 'r' ? cx + c.w : c.align === 'c' ? cx + c.w / 2 : cx;
    doc.text(san(c.titulo), tx, y, { align: alinhamento(c.align), maxWidth: c.w });
    cx += c.w;
  }
  y += 1.5; doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(x0, y, x0 + larguraCols(cols), y);
  return y + 3.6;
}
function linhaTabela(doc: JsPDF, x0: number, y: number, cols: Col[], cels: string[], opts?: { bold?: boolean; fill?: boolean; cor?: RGB; fontSize?: number }): number {
  const w = larguraCols(cols);
  if (opts?.fill) { doc.setFillColor(238, 246, 233); doc.rect(x0, y - 3.1, w, 4.6, 'F'); }
  doc.setFontSize(opts?.fontSize ?? 8); doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal'); doc.setTextColor(...(opts?.cor ?? [40, 48, 58] as RGB));
  let cx = x0;
  cols.forEach((c, i) => {
    const tx = c.align === 'r' ? cx + c.w : c.align === 'c' ? cx + c.w / 2 : cx;
    doc.text(san(cels[i] ?? ''), tx, y, { align: alinhamento(c.align), maxWidth: c.w - 2 });
    cx += c.w;
  });
  y += 4.6; doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(x0, y - 3.1, x0 + w, y - 3.1);
  return y;
}

// Página-RESUMO de um talhão: cabeçalho + tabela (nº, fórmula, produto, dose
// média, quantidade total em t, investimento) + linha de total. Sem mapas.
function desenharResumoRecomendacao(doc: JsPDF, ctx: Ctx, itens: ItemDose[], logo: HTMLImageElement | null, titulo = 'Resumo de recomendações') {
  const M = 6, H = 210;
  const campos: [string, string][] = [
    ['FAZENDA', ctx.fazenda], ['TALHÃO', ctx.talhao], ['ANO', rotuloAno(ctx.safra)], ['CULTURA', ctx.cultura],
    ['PRODUTOR', ctx.produtor], ['ÁREA', `${fmt(ctx.areaHa, 1)} ha`], ['DATA', dataHoje()],
  ];
  let y = cabecalhoNavy(doc, logo, campos) + 3;
  doc.setFontSize(12); doc.setTextColor(...GREEN); doc.setFont('helvetica', 'bold'); doc.text(san(titulo), M, y); y += 6;
  const cols: Col[] = [
    { titulo: 'Nº', w: 12, align: 'c' }, { titulo: 'Recomendação (fórmula)', w: 95 }, { titulo: 'Produto', w: 58 },
    { titulo: 'Dose média', w: 34, align: 'r' }, { titulo: 'Qtd total (t)', w: 32, align: 'r' }, { titulo: 'Investimento (R$)', w: 44, align: 'r' },
  ];
  y = cabTabela(doc, M, y, cols);
  let totInvest = 0;
  for (const it of itens) {
    const d = it.d; totInvest += d.custo ?? 0;
    if (y > H - 20) { doc.addPage(); y = cabecalhoNavy(doc, logo, campos) + 3; y = cabTabela(doc, M, y, cols); }
    y = linhaTabela(doc, M, y, cols, [
      it.numero < 1e9 ? String(it.numero).padStart(2, '0') : '—',
      d.nomeEquacao, d.produto || '—', `${fmt(d.stats.media)} ${d.unidade || 'kg/ha'}`, fmt(d.toneladas, 1), fmt(d.custo ?? 0, 2),
    ]);
  }
  y += 1;
  linhaTabela(doc, M, y, cols, ['', 'TOTAL', '', '', '', 'R$ ' + fmt(totInvest, 2)], { bold: true, cor: GREEN, fill: true });
  rodapeNavy(doc, logo, 'Resumo de recomendações — taxa variável');
}

// Renderiza a seção de Recomendações num doc jsPDF JÁ EXISTENTE (A4 paisagem).
// `somenteUsar` = só as doses marcadas com ★. `resumo` = 1ª página com a tabela-
// resumo (fórmula + quantidade total) antes dos mapas. Reutilizado pelo book
// (montarBookOficial), pelo relatório COMBINADO e pelo relatório da FAZENDA.
export async function renderBookOficialNoDoc(
  doc: JsPDF, cenarios: Cenario[], opts?: { novaPaginaAntes?: boolean; somenteUsar?: boolean; resumo?: boolean },
): Promise<void> {
  if (cenarios.length === 0) return;
  const tId = cenarios[0].talhaoId, safra = cenarios[0].safra;
  const ctx = ctxDoTalhao(tId, safra);
  if (!ctx) throw new Error('Talhão não encontrado para gerar a recomendação.');
  const logo = await carregarImg('/images/logo-branca.png').catch(() => null);
  const numDe = construirNumDe();
  const itens = achatarDoses(cenarios, numDe, !!opts?.somenteUsar);
  if (itens.length === 0) throw new Error(opts?.somenteUsar
    ? 'Nenhuma recomendação marcada com ★ (estrela). Na aba Recomendações, clique na ★ das doses que serão utilizadas.'
    : 'As recomendações não geraram nenhuma dose.');

  let precisaPagina = opts?.novaPaginaAntes ?? false;
  if (opts?.resumo) {
    if (precisaPagina) doc.addPage();
    desenharResumoRecomendacao(doc, ctx, itens, logo);
    precisaPagina = true;
  }
  for (const it of itens) {
    const numero = it.numero < 1e9 ? it.numero : 0;   // sem nº definido → título "00"
    if (precisaPagina) doc.addPage();
    precisaPagina = true;
    await desenharPaginaOficial(doc, it.d, it.cen.nome, ctx, logo, numero);
  }
}

export async function montarBookOficial(cenarios: Cenario[]): Promise<Blob> {
  if (cenarios.length === 0) throw new Error('Nenhuma recomendação selecionada.');
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  await renderBookOficialNoDoc(doc, cenarios, { novaPaginaAntes: false });
  return doc.output('blob');
}

// ─── Relatório de recomendação da FAZENDA ─────────────────────────────────────
// 1 PDF: (1) PÁGINA-1 estilo planilha — à esquerda a lista por talhão (talhão ·
// área · Nº-fórmula · qtd total · investimento) e à direita o VOLUME TOTAL por
// produto (soma da fazenda) · (2) para cada talhão em ordem ALFANUMÉRICA, só os
// MAPAS das doses ★ (sem repetir o resumo). Reaproveita renderBookOficialNoDoc.
interface GrupoTalhao { talhao: { id: string; nome: string; areaHa: number }; cenarios: Cenario[]; itens: ItemDose[]; }

// Agrega por PRODUTO (chaveProduto = produto || fórmula) o total em toneladas e
// investimento, somando todos os talhões da fazenda.
function volumePorProduto(grupos: GrupoTalhao[]): [string, { ton: number; custo: number }][] {
  const mapa = new Map<string, { ton: number; custo: number }>();
  for (const g of grupos) for (const it of g.itens) {
    const k = chaveProduto(it.d);
    const cur = mapa.get(k) ?? { ton: 0, custo: 0 };
    cur.ton += it.d.toneladas ?? 0; cur.custo += it.d.custo ?? 0;
    mapa.set(k, cur);
  }
  return [...mapa.entries()].sort((a, b) => b[1].ton - a[1].ton);
}

function desenharCapaFazenda(doc: JsPDF, fazenda: string, produtor: string, safra: string, grupos: GrupoTalhao[], logo: HTMLImageElement | null) {
  const M = 6, H = 210;
  const areaTotal = grupos.reduce((s, g) => s + (g.talhao.areaHa || 0), 0);
  const campos: [string, string][] = [
    ['FAZENDA', fazenda], ['PRODUTOR', produtor], ['ANO', rotuloAno(safra)],
    ['TALHÕES', String(grupos.length)], ['ÁREA', `${fmt(areaTotal, 1)} ha`], ['DATA', dataHoje()],
  ];
  const cab = () => cabecalhoNavy(doc, logo, campos) + 3;
  const numTxt = (it: ItemDose) => it.numero < 1e9 ? String(it.numero).padStart(2, '0') + ' - ' : '';
  const xL = M, xR = 205;

  let y = cab();
  doc.setFontSize(12); doc.setTextColor(...GREEN); doc.setFont('helvetica', 'bold'); doc.text('Resumo de recomendações por talhão', xL, y);

  // Tabela DIREITA — volume total por produto (só na 1ª página).
  const colsR: Col[] = [{ titulo: 'Produto', w: 52 }, { titulo: 'Volume total (t)', w: 30, align: 'r' }];
  let yr = y + 6;
  doc.setFontSize(9); doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.text('Volume total por produto', xR, yr); yr += 4;
  yr = cabTabela(doc, xR, yr, colsR);
  for (const [k, v] of volumePorProduto(grupos)) yr = linhaTabela(doc, xR, yr, colsR, [k, fmt(v.ton, 1)]);

  // Tabela ESQUERDA — por talhão (paginável).
  const colsL: Col[] = [
    { titulo: 'Talhão', w: 32 }, { titulo: 'Área (ha)', w: 18, align: 'r' }, { titulo: 'Recomendação (Nº - fórmula)', w: 82 },
    { titulo: 'Qtd (t)', w: 18, align: 'r' }, { titulo: 'Invest. (R$)', w: 34, align: 'r' },
  ];
  y += 6;
  y = cabTabela(doc, xL, y, colsL);
  let totInvest = 0;
  for (const g of grupos) {
    let primeiro = true;
    for (const it of g.itens) {
      const d = it.d; totInvest += d.custo ?? 0;
      if (y > H - 16) { doc.addPage(); y = cab() + 4; y = cabTabela(doc, xL, y, colsL); }
      y = linhaTabela(doc, xL, y, colsL, [
        primeiro ? g.talhao.nome : '', primeiro ? fmt(g.talhao.areaHa, 1) : '',
        `${numTxt(it)}${d.nomeEquacao}`, fmt(d.toneladas, 1), fmt(d.custo ?? 0, 2),
      ]);
      primeiro = false;
    }
  }
  y += 1;
  if (y > H - 16) { doc.addPage(); y = cab() + 4; }
  linhaTabela(doc, xL, y, colsL, ['TOTAL FAZENDA', '', '', '', 'R$ ' + fmt(totInvest, 2)], { bold: true, cor: GREEN, fill: true });
  rodapeNavy(doc, logo, 'Recomendação — resumo da fazenda');
}

// Coleta, por talhão (ordem alfanumérica), as doses marcadas com ★ da safra —
// base tanto do PDF quanto do Excel da fazenda.
async function coletarGruposFazenda(fazendaId: string, safra: string) {
  const faz = getFazendas().find(f => f.id === fazendaId) ?? null;
  const cli = faz ? getClientes().find(c => c.id === faz.clienteId) ?? null : null;
  const talhoes = faz ? ordenarTalhoesAlfa(getTalhoes().filter(t => t.fazendaId === fazendaId)) : [];
  const numDe = construirNumDe();
  const grupos: GrupoTalhao[] = [];
  for (const t of talhoes) {
    const cens = await listarCenarios(t.id, safra).catch(() => [] as Cenario[]);
    if (!cens.length) continue;
    const desc = await Promise.all(cens.map(descomprimirCenario));
    const itens = achatarDoses(desc, numDe, true);
    if (itens.length) grupos.push({ talhao: { id: t.id, nome: t.nome, areaHa: t.areaHa ?? 0 }, cenarios: desc, itens });
  }
  return { faz, cli, grupos };
}

export async function montarRelatorioRecomendacaoFazenda(fazendaId: string, safra: string): Promise<Blob> {
  const { faz, cli, grupos } = await coletarGruposFazenda(fazendaId, safra);
  if (!faz) throw new Error('Fazenda não encontrada.');
  if (grupos.length === 0) throw new Error('Nenhuma recomendação marcada com ★ nesta fazenda/safra. Marque as doses (★) na aba Recomendações dos talhões.');

  const logo = await carregarImg('/images/logo-branca.png').catch(() => null);
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  desenharCapaFazenda(doc, faz.nome, cli?.nome ?? '', safra, grupos, logo);
  // Cada talhão: só os MAPAS das doses ★ (o resumo já está consolidado na pág. 1).
  for (const g of grupos) {
    doc.addPage();
    try { await renderBookOficialNoDoc(doc, g.cenarios, { novaPaginaAntes: false, somenteUsar: true, resumo: false }); }
    catch (e) { console.warn('[relatorio-fazenda] talhão', g.talhao.nome, 'falhou:', e); }
  }
  return doc.output('blob');
}

export async function gerarRelatorioRecomendacaoFazenda(fazendaId: string, safra: string): Promise<void> {
  const aba = typeof window !== 'undefined' ? window.open('', '_blank') : null;
  if (aba) try { aba.document.write('<!doctype html><meta charset="utf-8"><title>Relatório</title><body style="font-family:system-ui,sans-serif;padding:28px;color:#334155"><p>⏳ Gerando o relatório de recomendação da fazenda… aguarde (capturando os mapas de todos os talhões).</p></body>'); } catch {}
  try {
    const blob = await montarRelatorioRecomendacaoFazenda(fazendaId, safra);
    const faz = getFazendas().find(f => f.id === fazendaId);
    abrirOuBaixar(blob, aba, nomeExport({
      fazenda: faz?.nome ?? '', siglaFazenda: faz?.sigla ?? null, tipo: 'RECOM',
      ano: anoDaSafra(safra),
    }) + '.pdf');
  } catch (e) {
    const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
    console.error('[relatorio-fazenda] falha:', e);
    if (aba) { try { aba.document.body.innerHTML = `<h3 style="color:#b91c1c;font-family:system-ui">Falha ao gerar o relatório</h3><pre style="white-space:pre-wrap;font-size:12px;color:#334155">${msg.replace(/[<>&]/g, s => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[s]!))}</pre>`; } catch {} }
    throw e;
  }
}

// Versão EXCEL (editável) do relatório da FAZENDA — só na fazenda. Uma planilha:
// à esquerda a lista por talhão (talhão · área · Nº-fórmula · qtd t · invest.) e à
// direita o VOLUME TOTAL por produto (soma da fazenda). Números como número (não
// texto) p/ o usuário editar/somar.
export async function gerarRecomendacaoFazendaExcel(fazendaId: string, safra: string): Promise<void> {
  const { faz, grupos } = await coletarGruposFazenda(fazendaId, safra);
  if (!faz) throw new Error('Fazenda não encontrada.');
  if (grupos.length === 0) throw new Error('Nenhuma recomendação marcada com ★ nesta fazenda/safra. Marque as doses (★) na aba Recomendações dos talhões.');
  const r1 = (x: number) => Math.round((x ?? 0) * 10) / 10;
  const r2 = (x: number) => Math.round((x ?? 0) * 100) / 100;
  const rot = (it: ItemDose) => (it.numero < 1e9 ? String(it.numero).padStart(2, '0') + ' - ' : '') + it.d.nomeEquacao;

  const left: (string | number)[][] = [];
  let totInvest = 0;
  for (const g of grupos) {
    let primeiro = true;
    for (const it of g.itens) {
      totInvest += it.d.custo ?? 0;
      left.push([primeiro ? g.talhao.nome : '', primeiro ? r1(g.talhao.areaHa) : '', rot(it), r1(it.d.toneladas), r2(it.d.custo ?? 0)]);
      primeiro = false;
    }
    left.push(['', '', '', '', '']);   // separador entre talhões
  }
  left.push(['TOTAL FAZENDA', '', '', '', r2(totInvest)]);

  const right: (string | number)[][] = volumePorProduto(grupos).map(([k, v]) => [k, r1(v.ton), r2(v.custo)]);

  const XLSX = await import('xlsx');
  const aoa: (string | number)[][] = [
    ['TALHÃO', 'ÁREA (ha)', 'PRODUTO (Nº - fórmula)', 'TOTAL PRODUTO (t)', 'INVEST. (R$)', '', 'PRODUTO', 'VOLUME TOTAL (t)', 'INVEST. (R$)'],
  ];
  const n = Math.max(left.length, right.length);
  for (let i = 0; i < n; i++) aoa.push([...(left[i] ?? ['', '', '', '', '']), '', ...(right[i] ?? ['', '', ''])]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 42 }, { wch: 16 }, { wch: 14 }, { wch: 2 }, { wch: 18 }, { wch: 16 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Recomendação');
  XLSX.writeFile(wb, nomeExport({
    fazenda: faz.nome, siglaFazenda: faz.sigla ?? null, tipo: 'RECOM', ano: anoDaSafra(safra),
  }) + '.xlsx');
}
