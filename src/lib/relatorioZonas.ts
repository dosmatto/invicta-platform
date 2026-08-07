'use client';

// Relatório PDF de Zonas de Manejo (A4 paisagem) — mesmo padrão visual dos demais
// relatórios da plataforma (paleta NAVY/GRAY/LINE, cabeçalho com logos, norte,
// escala gráfica, rodapé). Fonte ÚNICA de dados: DadosExportZonas (o MESMO
// dataset do SHP/KML) → áreas/zonas/linhas idênticas entre os formatos.

import type { jsPDF as JsPDF } from 'jspdf';
import { capturarMapaZonas } from './capturaMapa';
import { imagemParaPdf, reduzirLogo } from './pdfImagem';
import type { DadosExportZonas } from './exportZonas';
import { DATUM, desenharCabecalhoOficial, clipTexto, marcaInvicta } from './pdfCabecalho';

const NAVY: [number, number, number] = [13, 33, 64];
const GRAY: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [210, 219, 232];
const fmt = (v: number, d = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const san = (s: string | null | undefined): string => (s ?? '').replace(/[^\x00-\xFF]/g, '');
const dataBR = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR'); };

function carregarImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => res(img); img.onerror = () => rej(new Error(`falha ao carregar ${src}`)); img.src = src;
  });
}
async function carregarLogos(cliUrl?: string | null) {
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
  const f = x / p; const nf = f >= 5 ? 5 : f >= 2.5 ? 2.5 : f >= 2 ? 2 : 1;
  return nf * p;
}
const boundsDe = (d: DadosExportZonas): [number, number, number, number] => {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const varrer = (coords: GeoJSON.Position[]) => { for (const [x, y] of coords) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; } };
  const geoms: GeoJSON.Geometry[] = [...(d.externo ? [d.externo] : []), ...d.zonas.map(z => z.geometry)];
  for (const g of geoms) {
    if (g.type === 'Polygon') g.coordinates.forEach(varrer);
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => p.forEach(varrer));
  }
  if (!isFinite(w)) return [-0.001, -0.001, 0.001, 0.001];
  return [w, s, e, n];
};

export interface OpcoesRelatorioZonas { satelite?: boolean; logoClienteUrl?: string | null; }

export async function gerarRelatorioZonas(d: DadosExportZonas, opts: OpcoesRelatorioZonas = {}): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }) as JsPDF;
  const W = 297, H = 210, M = 6;
  const logos = await carregarLogos(opts.logoClienteUrl);
  const bounds = boundsDe(d);
  const [w0, s0, e0, n0] = bounds;
  const latC = (s0 + n0) / 2;

  // ── Captura do mapa (vetorial: zonas + linhas + limite) ──
  const mapaW = 168, mapaH = 116, mapaX = M, mapaY = 31;
  const PXMM = 8;
  const mapaPng = await capturarMapaZonas({
    bounds, externo: d.externo,
    zonas: d.zonas.map(z => ({ geometry: z.geometry, cor: z.cor, rotulo: z.nomeZona })),
    linhas: d.linhas.map(l => ({ geometry: l.geometry })),
    satelite: opts.satelite !== false,
    larguraPx: Math.round(mapaW * PXMM), alturaPx: Math.round(mapaH * PXMM),
  });

  const clip = (txt: string, maxW: number) => clipTexto(doc, txt, maxW);

  // ── CABEÇALHO (desenho compartilhado com o relatório de Fertilidade) ──
  desenharCabecalhoOficial(doc, {
    logoCliente: logos.cli,
    fazenda: san(d.fazenda),
    esquerda: [
      `Produtor: ${san(d.produtor) || '—'}`,
      `Talhão: ${san(d.talhao) || '—'}${d.ano ? '   |   Ano: ' + san(d.ano) : ''}`,
    ],
    titulo: 'ZONAS DE MANEJO',
    subtitulo: san(d.nomeMapa) || '—',
    info: [
      `Área total: ${fmt(d.areaTotalHa, 2)} ha`,
      `Nº de zonas: ${d.zonas.length}`,
      `Datum: ${DATUM}`,
      `Emissão: ${dataBR(d.dataEmissao)}`,
    ],
  });

  // ── MAPA ──
  const mapaJpg = await imagemParaPdf(mapaPng, mapaW);
  doc.addImage(mapaJpg.data, mapaJpg.formato, mapaX, mapaY, mapaW, mapaH);
  doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.rect(mapaX, mapaY, mapaW, mapaH, 'S');
  // Norte
  const nx = mapaX + 7, ny = mapaY + mapaH - 7;
  doc.setFillColor(...NAVY); doc.roundedRect(nx - 4.5, ny - 5.5, 9, 11, 1, 1, 'F');
  doc.setFillColor(255, 255, 255); doc.triangle(nx, ny - 4, nx - 2.2, ny + 0.5, nx + 2.2, ny + 0.5, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.text('N', nx, ny + 4, { align: 'center' });
  // Escala gráfica
  const groundW = Math.max(1, (e0 - w0) * 111320 * Math.cos(latC * Math.PI / 180));
  const niceMax = nice(groundW * (50 / mapaW));
  const barLen = Math.min(60, (niceMax / groundW) * mapaW);
  const ex = mapaX + mapaW - barLen - 6, ey = mapaY + mapaH - 6;
  for (let k = 0; k < 4; k++) { const sx = ex + (barLen / 4) * k; doc.setFillColor(...(k % 2 === 0 ? NAVY : [255, 255, 255] as [number, number, number])); doc.setDrawColor(...NAVY); doc.setLineWidth(0.2); doc.rect(sx, ey, barLen / 4, 2, k % 2 === 0 ? 'FD' : 'D'); }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(255, 255, 255);
  doc.text(`${Math.round(niceMax)} m`, ex + barLen, ey - 1.5, { align: 'right' });

  // ── IDENTIFICAÇÃO (faixa abaixo do mapa) ──
  const idY = mapaY + mapaH + 4;
  doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.roundedRect(mapaX, idY, mapaW, 20, 2, 2, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...NAVY);
  const idPares: Array<[string, string]> = [
    ['Produtor', san(d.produtor) || '—'], ['Fazenda', san(d.fazenda) || '—'],
    ['Talhão', san(d.talhao) || '—'], ['Mapa', san(d.nomeMapa) || '—'],
    ['Data do mapa', dataBR(d.dataMapa)], ['Ano/Safra', san(d.ano) || '—'],
    ['Município', `${san(d.municipio) || '—'}${d.estado ? ' - ' + san(d.estado) : ''}`], ['Responsável', san(d.responsavel) || '—'],
  ];
  const colW = mapaW / 4;
  idPares.forEach(([lab, val], i) => {
    const cx = mapaX + 3 + (i % 4) * colW, cy = idY + 6 + Math.floor(i / 4) * 9;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...GRAY); doc.text(lab.toUpperCase(), cx, cy);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...NAVY); doc.text(clip(val, colW - 4), cx, cy + 3.6);
  });

  // ── TABELA DE ZONAS (direita) ──
  const tabX = mapaX + mapaW + 6, tabW = W - M - tabX;
  let ty = mapaY;
  doc.setFillColor(...NAVY); doc.rect(tabX, ty, tabW, 7, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  doc.text('ZONA', tabX + 8, ty + 4.8); doc.text('CLASSE', tabX + 26, ty + 4.8);
  doc.text('ÁREA (ha)', tabX + tabW - 30, ty + 4.8, { align: 'right' }); doc.text('%', tabX + tabW - 4, ty + 4.8, { align: 'right' });
  ty += 7;
  const rowH = 7.2;
  const ordenadas = [...d.zonas].sort((a, b) => a.nomeZona.localeCompare(b.nomeZona, 'pt-BR', { numeric: true }));
  for (const z of ordenadas) {
    if (ty + rowH > mapaY + mapaH + 8) break; // segurança de página (1 pág.)
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(tabX, ty + rowH, tabX + tabW, ty + rowH);
    // swatch de cor
    const m = /^#?([0-9a-fA-F]{6})$/.exec(z.cor || '');
    if (m) doc.setFillColor(parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)); else doc.setFillColor(148, 163, 184);
    doc.roundedRect(tabX + 2, ty + 1.6, 4, 4, 0.6, 0.6, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY); doc.text(san(z.nomeZona), tabX + 8, ty + 4.8);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY); doc.text(clip(san(z.classe) || '—', 26), tabX + 26, ty + 4.8);
    doc.setTextColor(...NAVY); doc.text(fmt(z.areaHa, 2), tabX + tabW - 30, ty + 4.8, { align: 'right' });
    doc.text(fmt(z.pctArea, 1), tabX + tabW - 4, ty + 4.8, { align: 'right' });
    ty += rowH;
  }
  // total
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.5); doc.line(tabX, ty + 0.5, tabX + tabW, ty + 0.5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY);
  doc.text('TOTAL', tabX + 8, ty + 5); doc.text(fmt(d.areaTotalHa, 2), tabX + tabW - 30, ty + 5, { align: 'right' }); doc.text('100,0', tabX + tabW - 4, ty + 5, { align: 'right' });

  // ── RESUMO (direita, abaixo da tabela) ──
  const difTalhao = d.areaTalhaoHa != null ? d.areaTotalHa - d.areaTalhaoHa : null;
  const ry = ty + 12;
  doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.roundedRect(tabX, ry, tabW, 34, 2, 2, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY); doc.text('RESUMO', tabX + 4, ry + 6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY);
  const resumo: string[] = [
    `Quantidade de zonas: ${d.zonas.length}`,
    `Soma das áreas das zonas: ${fmt(d.areaTotalHa, 2)} ha`,
    `Área do talhão (limite): ${d.areaTalhaoHa != null ? fmt(d.areaTalhaoHa, 2) + ' ha' : '—'}`,
    `Diferença zonas × talhão: ${difTalhao != null ? fmt(difTalhao, 2) + ' ha' : '—'}`,
    `Divisas internas: ${d.linhas.length}`,
  ];
  resumo.forEach((t, i) => doc.text(t, tabX + 4, ry + 12 + i * 4.6));

  // ── MARCA NO PÉ DA ÁREA BRANCA ──
  // Sai do cabeçalho junto com a de Fertilidade. Aqui vai à ESQUERDA (e não à
  // direita como lá): o canto inferior direito é do quadro RESUMO, cuja altura
  // depende do nº de zonas e pode descer até ~193 mm. À esquerda, abaixo da faixa
  // de identificação (que fecha em 171 mm), o espaço é livre em qualquer mapa.
  marcaInvicta(doc, logos.inv, 'esquerda');

  // ── RODAPÉ ──
  doc.setFillColor(...NAVY); doc.rect(0, H - 10, W, 10, 'F');
  if (logos.branca) { const h = 5, w = h * (logos.branca.naturalWidth / logos.branca.naturalHeight); doc.addImage(logos.branca, 'PNG', M, H - 7.5, w, h); }
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  doc.text('INVICTA AP   |   Tecnologia que transforma dados em produtividade.', M + 26, H - 3.8);
  doc.setFont('helvetica', 'bold'); doc.text('www.invicta.agr.br', W - M, H - 3.8, { align: 'right' });

  const nome = `zona_manejo_${(d.talhao || 'mapa')}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_');
  doc.save(`${nome}.pdf`);
}
