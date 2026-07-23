'use client';

// Gerador de relatórios de Fertilidade (Layout Oficial V1, A4 paisagem).
// Cada elemento = 1 página (mapas por profundidade lado a lado, legenda oficial,
// estatísticas do raster, escala, cabeçalho com logos, rodapé). Suporta 1
// elemento (gerarRelatorioFertilidade) ou VÁRIOS num PDF único (gerarRelatorioMultiplo,
// usado pelo Gerador de Relatórios). Abre em nova aba (blob).

import type { jsPDF as JsPDF } from 'jspdf';
import type { Legenda } from './legendas';
import { rampaVisualStops, valorParaPosicaoVisual, dominioDaLegenda } from './legendas';
import { capturarMapaFertilidade } from './capturaMapa';
import { imagemParaPdf, reduzirLogo } from './pdfImagem';
import { formatarValorVariavel } from './store';

export interface ProfundidadeRel {
  profundidade: string;
  rasterPng: string;
  bounds: [number, number, number, number];
  valores: GeoJSON.FeatureCollection;             // pontos da planilha { txt }
  stats: { min: number; media: number; max: number }; // do raster interpolado
}
export interface DadosRelatorioFert {
  fazenda: string; produtor: string; talhao: string; safra: string;
  cultura: string; areaHa: number; municipio: string; estado: string;
  atributo: string; simbolo: string; metodo: string | null; fonte: string; unidade: string;
  legenda: Legenda;
  dataInterpolacao: string;        // "MM/AAAA"
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  profundidades: ProfundidadeRel[];
  satelite: boolean;
  corLimite: string;
  logoClienteUrl?: string | null;
}

const NAVY: [number, number, number] = [13, 33, 64];
const GRAY: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [210, 219, 232];
const fmt = (v: number, d = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
// jsPDF (fontes padrão WinAnsi) não tem subscrito (₂) — vira lixo e bagunça o
// espaçamento das letras. Converte subscrito → dígito normal e remove o que
// estiver fora do Latin-1 (ex.: "CaCl₂" → "CaCl2").
const SUB = '₀₁₂₃₄₅₆₇₈₉';
const san = (s: string | null | undefined): string => (s ?? '')
  .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, c => '0123456789'[SUB.indexOf(c)])
  .replace(/[^\x00-\xFF]/g, '');

function carregarImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(`falha ao carregar ${src}`));
    img.src = src;
  });
}

interface Logos { inv: HTMLImageElement | null; branca: HTMLImageElement | null; cli: HTMLImageElement | null; }
async function carregarLogos(cliUrl?: string | null): Promise<Logos> {
  const inv = await carregarImg('/images/logo-colorida.png').catch(() => null);
  const cli = cliUrl ? await carregarImg(cliUrl).catch(() => null) : null;
  // Logos entram uma vez no PDF, mas a colorida (2111px) e a do cliente (upload
  // livre, pode ser enorme) são exageradas p/ ~50 mm impressos → reduz p/ ~480px.
  return {
    inv: inv ? await reduzirLogo(inv) : null,
    branca: await carregarImg('/images/logo-branca.png').catch(() => null),
    cli: cli ? await reduzirLogo(cli) : null,
  };
}

// Barra de legenda contínua (mesma rampa visual do app) → dataUrl.
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

export function validarPagina(d: DadosRelatorioFert): string | null {
  if (!d.profundidades.length) return `${d.atributo}: nenhum mapa interpolado.`;
  for (const p of d.profundidades) {
    if (!p.rasterPng || !p.bounds) return `${d.atributo} ${p.profundidade}: raster ausente.`;
    if (!p.stats) return `${d.atributo} ${p.profundidade}: sem estatísticas.`;
  }
  if (!d.legenda) return `${d.atributo}: legenda ausente.`;
  if (!d.dataInterpolacao) return `${d.atributo}: data da interpolação ausente.`;
  return null;
}

// Desenha UMA página (1 elemento) no doc atual. Captura os mapas off-screen.
async function desenharPaginaMapa(doc: JsPDF, d: DadosRelatorioFert, logos: Logos): Promise<void> {
  const W = 297, H = 210, M = 6;
  const nProf = d.profundidades.length;
  const gap = 5;
  const mapsY = 31, mapsH = 104;
  const frameW = nProf === 2 ? (W - 2 * M - gap) / 2 : Math.min(200, W - 2 * M);
  const startX = nProf === 2 ? M : (W - frameW) / 2;
  const PXMM = 8;

  // Capturas dos mapas (off-screen)
  const imgs: string[] = [];
  for (const p of d.profundidades) {
    imgs.push(await capturarMapaFertilidade({
      rasterPng: p.rasterPng, bounds: p.bounds, poligono: d.poligono, valores: p.valores,
      satelite: d.satelite, corLimite: d.corLimite,
      larguraPx: Math.round(frameW * PXMM), alturaPx: Math.round(mapsH * PXMM),
    }));
  }

  // ── CABEÇALHO ──
  if (logos.inv) { const h = 15, w = h * (logos.inv.naturalWidth / logos.inv.naturalHeight); doc.addImage(logos.inv, 'PNG', M, 5, w, h); }
  doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(M + 52, 5, M + 52, 24);

  // Trunca com "…" p/ o bloco esquerdo (fazenda/produtor) NÃO invadir o título central.
  const clip = (txt: string, maxW: number) => {
    if (doc.getTextWidth(txt) <= maxW) return txt;
    let t = txt;
    while (t.length > 1 && doc.getTextWidth(t + '…') > maxW) t = t.slice(0, -1);
    return t + '…';
  };
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(clip(d.fazenda.toUpperCase(), 60), M + 56, 9);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GRAY);
  doc.text(clip(`Produtor: ${d.produtor || '—'}`, 62), M + 56, 14);
  doc.text(clip(`Safra: ${d.safra || '—'}   |   Data: ${d.dataInterpolacao}`, 62), M + 56, 18.5);

  // Título central (elemento) — deslocado à direita e mais estreito p/ não colidir
  // com o bloco esquerdo; auto-redução até 7pt.
  const tituloCx = 165, tituloMaxW = 82;
  const titulo = `${san(d.atributo).toUpperCase()} (${san(d.simbolo)})`;
  doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold');
  let tf = 22; doc.setFontSize(tf);
  while (doc.getTextWidth(titulo) > tituloMaxW && tf > 7) { tf -= 1; doc.setFontSize(tf); }
  doc.text(titulo, tituloCx, 13.5, { align: 'center', maxWidth: tituloMaxW });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAY);
  doc.text(`${d.metodo ? san(d.metodo) + '  |  ' : ''}${san(d.fonte)}`, tituloCx, 20, { align: 'center', maxWidth: tituloMaxW });

  // Informações da área (direita)
  const [w0, s0, e0, n0] = d.profundidades[0].bounds;
  const lonC = (w0 + e0) / 2, latC = (s0 + n0) / 2;
  const fuso = Math.floor((lonC + 180) / 6) + 1;
  const ix = 214;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY);
  doc.text('INFORMAÇÕES DA ÁREA', ix, 8);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY);
  doc.text(`Área Total: ${fmt(d.areaHa, 2)} ha`, ix, 13);
  doc.text(`Município: ${d.municipio || '—'}${d.estado ? ' - ' + d.estado : ''}`, ix, 17);
  doc.text(`Datum: SIRGAS 2000`, ix, 21);
  doc.text(`Fuso: ${fuso}S`, ix, 24.5);

  // Logo do cliente — só desenha se existir (sem placeholder quando não há).
  if (logos.cli) {
    const h = 16, w = Math.min(34, h * (logos.cli.naturalWidth / logos.cli.naturalHeight));
    doc.addImage(logos.cli, 'PNG', W - M - w, 5, w, h);
  }

  doc.setDrawColor(...NAVY); doc.setLineWidth(0.8); doc.line(0, 26.5, W, 26.5);

  // ── MAPAS ──
  const mapsJpg = await Promise.all(imgs.map(im => imagemParaPdf(im, frameW)));
  d.profundidades.forEach((p, i) => {
    const x = startX + i * (frameW + gap);
    doc.addImage(mapsJpg[i].data, mapsJpg[i].formato, x, mapsY, frameW, mapsH);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.rect(x, mapsY, frameW, mapsH, 'S');
    doc.setFillColor(...NAVY); doc.roundedRect(x + 3, mapsY + 3, 24, 7.5, 1.5, 1.5, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text(p.profundidade + ' cm', x + 15, mapsY + 8, { align: 'center' });
    const nx = x + 7, ny = mapsY + mapsH - 7;
    doc.setFillColor(...NAVY); doc.roundedRect(nx - 4.5, ny - 5.5, 9, 11, 1, 1, 'F');
    doc.setFillColor(255, 255, 255); doc.triangle(nx, ny - 4, nx - 2.2, ny + 0.5, nx + 2.2, ny + 0.5, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(6); doc.text('N', nx, ny + 4, { align: 'center' });
  });

  // ── ESTATÍSTICAS (centralizadas abaixo de cada mapa) ──
  const stBandY = mapsY + mapsH + 4;
  const stBandH = 14;
  d.profundidades.forEach((p, i) => {
    const x = startX + i * (frameW + gap);
    const cx = x + frameW / 2;
    doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.roundedRect(x, stBandY, frameW, stBandH, 2, 2, 'S');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY);
    doc.text(`ESTATÍSTICAS  ${p.profundidade} cm`, cx, stBandY + 4.5, { align: 'center' });
    const tri: [string, number][] = [['MÍNIMO', p.stats.min], ['MÉDIO', p.stats.media], ['MÁXIMO', p.stats.max]];
    tri.forEach(([lab, val], j) => {
      const tx = x + frameW * (j + 0.5) / 3;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.setTextColor(...GRAY); doc.text(lab, tx, stBandY + 8.5, { align: 'center' });
      doc.setFontSize(11); doc.setTextColor(...NAVY); doc.text(`${formatarValorVariavel(d.legenda.atributoId, val, fmt)} ${san(d.unidade)}`, tx, stBandY + 12.6, { align: 'center' });
    });
  });

  // ── LEGENDA (barra contínua, largura total) ──
  const lgY = stBandY + stBandH + 4;
  const lgH = 20;
  doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.roundedRect(M, lgY, W - 2 * M, lgH, 2, 2, 'S');
  doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
  doc.text('INTERPRETAÇÃO', M + 4, lgY + 7.5); doc.text('FERTILIDADE', M + 4, lgY + 12);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY);
  doc.text(`(${san(d.unidade)})`, M + 4, lgY + 16.5);

  const barX = M + 40, barW = 150, barY = lgY + 8, barH = 6;
  doc.addImage(barraLegenda(d.legenda, 600, 24), 'PNG', barX, barY, barW, barH);
  doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.rect(barX, barY, barW, barH, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...NAVY);
  let acc = 0; const totalL = d.legenda.classes.reduce((a, c) => a + c.larguraVisual, 0) || 1;
  for (const c of d.legenda.classes) { const cx = barX + ((acc + c.larguraVisual / 2) / totalL) * barW; acc += c.larguraVisual; doc.text(c.nome, cx, barY - 1.5, { align: 'center' }); }
  const [dmin, dmax] = dominioDaLegenda(d.legenda);
  const ticks = [dmin, ...d.legenda.classes.slice(0, -1).map(c => c.valorMax).filter((v): v is number => v != null), dmax];
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...GRAY);
  for (const t of ticks) { const tx = barX + valorParaPosicaoVisual(t, d.legenda) * barW; doc.text(fmt(t, t % 1 === 0 ? 0 : 1), tx, barY + barH + 4, { align: 'center' }); }

  const cols: [string, string][] = [['UNIDADE', san(d.unidade)], ['MÉTODO', san(d.metodo) || '—'], ['FONTE', san(d.fonte)]];
  const cx0 = barX + barW + 8, cw = (W - M - cx0) / 3;
  cols.forEach(([lab, val], i) => {
    const cx = cx0 + cw * i + cw / 2;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...NAVY); doc.text(lab, cx, lgY + 8, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAY); doc.text(String(val), cx, lgY + 14, { align: 'center', maxWidth: cw - 2 });
  });

  // ── ESCALA (centralizada) ──
  const escY = lgY + lgH + 7;
  const escAvail = 60;
  const groundW = Math.max(1, (e0 - w0) * 111320 * Math.cos(latC * Math.PI / 180));
  const niceMax = nice(groundW * (Math.min(50, escAvail) / frameW));
  const barLen = Math.min(escAvail, (niceMax / groundW) * frameW);
  const ex = W / 2 - barLen / 2, ey = escY + 2.5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY);
  doc.text('Escala', W / 2, escY, { align: 'center' });
  for (let k = 0; k < 4; k++) {
    const sx = ex + (barLen / 4) * k;
    doc.setFillColor(...(k % 2 === 0 ? NAVY : [255, 255, 255] as [number, number, number]));
    doc.setDrawColor(...NAVY); doc.setLineWidth(0.2);
    doc.rect(sx, ey, barLen / 4, 2, k % 2 === 0 ? 'FD' : 'D');
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...GRAY);
  for (let k = 0; k <= 4; k++) { const sx = ex + (barLen / 4) * k; doc.text(k === 4 ? `${Math.round(niceMax)} m` : String(Math.round(niceMax / 4 * k)), sx, ey + 5, { align: 'center' }); }

  // ── RODAPÉ ──
  doc.setFillColor(...NAVY); doc.rect(0, H - 10, W, 10, 'F');
  if (logos.branca) { const h = 5, w = h * (logos.branca.naturalWidth / logos.branca.naturalHeight); doc.addImage(logos.branca, 'PNG', M, H - 7.5, w, h); }
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  doc.text('INVICTA AP   |   Tecnologia que transforma dados em produtividade.', M + 26, H - 3.8);
  doc.setFont('helvetica', 'bold'); doc.text('www.invictaap.com.br', W - M, H - 3.8, { align: 'right' });
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

// Página de CAPA do book: logo + título + satélite do talhão em destaque +
// painel com produtor/fazenda/talhão/safra/cultura/área/município + sumário dos mapas.
async function desenharCapa(doc: JsPDF, paginas: DadosRelatorioFert[], logos: Logos): Promise<void> {
  const W = 297, H = 210, M = 6;
  const d = paginas[0];
  const heroW = 168, heroH = 116, heroX = M, heroY = 56;
  // Satélite do talhão (sem raster/valores) — reusa o capturador, com raster vazio.
  const hero = await capturarMapaFertilidade({
    rasterPng: '', bounds: d.profundidades[0].bounds, poligono: d.poligono,
    valores: EMPTY_FC, satelite: d.satelite, corLimite: d.corLimite,
    larguraPx: Math.round(heroW * 8), alturaPx: Math.round(heroH * 8),
  });

  // ── Topo: logos + título ──
  if (logos.inv) { const h = 16, w = h * (logos.inv.naturalWidth / logos.inv.naturalHeight); doc.addImage(logos.inv, 'PNG', M, 8, w, h); }
  if (logos.cli) { const h = 16, w = Math.min(34, h * (logos.cli.naturalWidth / logos.cli.naturalHeight)); doc.addImage(logos.cli, 'PNG', W - M - w, 8, w, h); }
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.8); doc.line(M, 28, W - M, 28);
  doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(19);
  doc.text('RELATÓRIO DE FERTILIDADE DO SOLO', W / 2, 41, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(...GRAY);
  doc.text(`Produtor: ${san(d.produtor) || '—'}`, W / 2, 49, { align: 'center' });

  // ── Satélite do talhão (destaque) ──
  const heroJpg = await imagemParaPdf(hero, heroW);
  doc.addImage(heroJpg.data, heroJpg.formato, heroX, heroY, heroW, heroH);
  doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.rect(heroX, heroY, heroW, heroH, 'S');
  doc.setFillColor(...NAVY); doc.roundedRect(heroX + 3, heroY + 3, Math.min(70, 8 + san(d.talhao).length * 2.4), 8, 1.5, 1.5, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text(san(d.talhao), heroX + 6, heroY + 8.6);

  // ── Painel de informações (direita) ──
  const ix = heroX + heroW + 8, iw = W - M - ix;
  doc.setFillColor(247, 249, 252); doc.setDrawColor(...LINE); doc.setLineWidth(0.4);
  doc.roundedRect(ix, heroY, iw, heroH, 2, 2, 'FD');
  let yy = heroY + 11;
  const linha = (lab: string, val: string) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
    doc.text(lab.toUpperCase(), ix + 5, yy);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...NAVY);
    doc.text(val || '—', ix + 5, yy + 5, { maxWidth: iw - 10 });
    yy += 13;
  };
  linha('Fazenda', san(d.fazenda));
  linha('Talhão', san(d.talhao));
  linha('Safra', d.safra);
  linha('Cultura', san(d.cultura));
  linha('Área total', `${fmt(d.areaHa, 2)} ha`);
  linha('Município', `${san(d.municipio)}${d.estado ? ' - ' + d.estado : ''}`);
  linha('Datum', 'SIRGAS 2000');
  linha('Data', d.dataInterpolacao);

  // ── Sumário dos mapas ──
  const sy = heroY + heroH + 9;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...NAVY);
  doc.text(`MAPAS NESTE RELATÓRIO (${paginas.length}):`, M, sy);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAY);
  doc.text(paginas.map(p => `${san(p.atributo)} (${san(p.simbolo)})`).join('   ·   '), M, sy + 6, { maxWidth: W - 2 * M });

  // ── Rodapé ──
  doc.setFillColor(...NAVY); doc.rect(0, H - 10, W, 10, 'F');
  if (logos.branca) { const h = 5, w = h * (logos.branca.naturalWidth / logos.branca.naturalHeight); doc.addImage(logos.branca, 'PNG', M, H - 7.5, w, h); }
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  doc.text('INVICTA AP   |   Tecnologia que transforma dados em produtividade.', M + 26, H - 3.8);
  doc.setFont('helvetica', 'bold'); doc.text('www.invictaap.com.br', W - M, H - 3.8, { align: 'right' });
}

// Renderiza a seção de Fertilidade (capa opcional + 1 página por elemento) num
// doc jsPDF JÁ EXISTENTE (A4 paisagem). Reutilizado tanto pelo PDF só-de-
// fertilidade (gerarDoc) quanto pelo relatório COMBINADO (relatorioCombinado.ts).
// `novaPaginaAntes` = o doc já tem conteúdo (abre nova página antes da 1ª desta
// seção); `comCapa` inclui a capa-sumário.
export async function renderFertilidadeNoDoc(
  doc: JsPDF, paginas: DadosRelatorioFert[], opts?: { novaPaginaAntes?: boolean; comCapa?: boolean },
): Promise<void> {
  if (paginas.length === 0) return;
  for (const p of paginas) { const erro = validarPagina(p); if (erro) throw new Error(erro); }
  const comCapa = opts?.comCapa ?? true;
  const logos = await carregarLogos(paginas[0]?.logoClienteUrl);
  let precisaPagina = opts?.novaPaginaAntes ?? false;
  if (comCapa) {
    if (precisaPagina) doc.addPage('a4', 'landscape');
    await desenharCapa(doc, paginas, logos);
    precisaPagina = true;
  }
  for (const p of paginas) {
    if (precisaPagina) doc.addPage('a4', 'landscape');
    await desenharPaginaMapa(doc, p, logos);
    precisaPagina = true;
  }
}

// Núcleo: monta o PDF (1+ páginas), abre em nova aba (com mensagem de erro na
// aba se falhar) e RETORNA o Blob (para o caller arquivar no Storage).
async function gerarDoc(paginas: DadosRelatorioFert[], nomeArquivo: string, comCapa = false): Promise<Blob> {
  const aba = typeof window !== 'undefined' ? window.open('', '_blank') : null;
  if (aba) try { aba.document.write('<!doctype html><meta charset="utf-8"><title>Relatório</title><body style="font-family:system-ui,sans-serif;padding:28px;color:#334155"><p>⏳ Gerando o relatório PDF… aguarde alguns segundos (capturando os mapas).</p></body>'); } catch {}
  try {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    await renderFertilidadeNoDoc(doc, paginas, { novaPaginaAntes: false, comCapa });
    const nome = nomeArquivo.replace(/[^\w.\-]+/g, '_') + '.pdf';
    const blob = doc.output('blob');
    if (aba) { const url = URL.createObjectURL(blob); aba.location.href = url; setTimeout(() => URL.revokeObjectURL(url), 60000); }
    else doc.save(nome);
    return blob;
  } catch (e) {
    const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
    console.error('[relatorio] falha:', e);
    if (aba) { try { aba.document.body.innerHTML = `<h3 style="color:#b91c1c;font-family:system-ui">Falha ao gerar o relatório</h3><pre style="white-space:pre-wrap;font-size:12px;color:#334155">${msg.replace(/[<>&]/g, s => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[s]!))}</pre>`; } catch {} }
    throw e;
  }
}

// 1 elemento (usado na seção Fertilidade).
export async function gerarRelatorioFertilidade(d: DadosRelatorioFert): Promise<void> {
  const erro = validarPagina(d);
  if (erro) throw new Error(erro);
  await gerarDoc([d], `Fertilidade_${d.talhao}_${d.atributo}`);
}

// Vários elementos num PDF único (book) com CAPA (usado pelo Gerador de Relatórios). Retorna o Blob.
export async function gerarRelatorioMultiplo(paginas: DadosRelatorioFert[], nomeArquivo: string): Promise<Blob> {
  if (paginas.length === 0) throw new Error('Selecione ao menos um mapa para o relatório.');
  for (const p of paginas) { const erro = validarPagina(p); if (erro) throw new Error(erro); }
  return await gerarDoc(paginas, nomeArquivo, true);
}
