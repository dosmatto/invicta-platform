'use client';

// Relatório de COMPACTAÇÃO (penetrometria) — Layout Oficial, A4 paisagem.
//
//   1. RESUMO: todas as camadas (0-10 … 50-60) em miniatura, cada uma o grid
//      colorido pela legenda oficial (sys_compactacao, 5 classes em MPa) com o
//      contorno do talhão; ao lado, barras empilhadas de % de ÁREA por classe em
//      cada profundidade + a média (MPa) de cada camada; legenda das 5 classes.
//   2. UMA PÁGINA POR CAMADA: mapa grande (grid + contorno + valor de cada
//      ponto), faixas e nomes das classes com % e ha, média/mín./máx. dos
//      pontos, método (Krigagem + modelo, ou IDW), nº de pontos e pixel.
//   3. TABELA pontos × camadas, célula colorida pela classe e linha de média.
//
// Cabeçalho, marca e rodapé são os MESMOS de Condutividade/Fertilidade
// (pdfCabecalho.ts). A imagem do mapa sai de capturaMapa.ts (canvas, sem
// MapLibre). Todo cálculo (classe, % de área, tabela) está em
// relatorioCompactacaoCalc.ts, puro e testado.

import type { jsPDF as JsPDF } from 'jspdf';
import { abrirPdfNaAba } from './abrirPdf.ts';
import { capturarMapaFertilidade } from './capturaMapa.ts';
import { imagemParaPdf, reduzirLogo } from './pdfImagem.ts';
import { nomeExport } from './nomeExport.ts';
import { DATUM, desenharCabecalhoOficial, marcaInvicta, clipTexto } from './pdfCabecalho.ts';
import { corCheiaDaClasse, type Legenda } from './legendas.ts';
import { decodeGrid, descomprimirGrid, extrairPoligono, type RespInterp } from './fertilidade';
import { colorirGridComLegenda } from './raster';
import { cloudCarregarMapasPorPrefixo } from './cloud';
import {
  getTalhoes, getFazendas, getClientes, getImportacoesCompactacao, getLegendasPorAtributo,
  type ImportacaoCompactacao, type PontoCompactacao,
} from './store';
import {
  areaPorClasse, estatisticaPontos, rotuloFaixaClasse, rotuloMetodo, metodoGeral, montarTabela,
  paginar, gradeMiniaturas, camadasFaltando, indiceClasseValor, type AreaPorClasse,
} from './relatorioCompactacaoCalc.ts';

type RGB = [number, number, number];
const NAVY: RGB = [13, 33, 64];
const GRAY: RGB = [100, 116, 139];
const LINE: RGB = [210, 219, 232];
const W = 297, H = 210, M = 6;
const PXMM = 8;                                   // ≈200 dpi na captura

const fmt = (v: number, d = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
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
const hexRgb = (hex: string): RGB => {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
  return m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)] : [148, 163, 184];
};
/** Texto branco sobre cor escura, navy sobre cor clara (luminância relativa). */
const textoSobre = (rgb: RGB): RGB => ((0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) < 150 ? [255, 255, 255] : NAVY);
const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

// ── entrada ──────────────────────────────────────────────────────────────────

/** Um mapa já interpolado (o `resp` do cache da aba). */
export interface CamadaInterpolada { prof: string; resp: RespInterp }

export interface DadosRelatorioCompactacao {
  fazenda: string; produtor: string; talhao: string;
  siglaFazenda?: string | null;
  areaHa: number; municipio: string; estado: string;
  levantamento: string;
  dataReferencia?: string | null;
  ano?: number | null;
  legenda: Legenda;
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  /** Na ordem das profundidades da importação. */
  camadas: CamadaInterpolada[];
  pontos: PontoCompactacao[];
  satelite: boolean;
  logoClienteUrl?: string | null;
}

export function validarCompactacao(d: DadosRelatorioCompactacao): string | null {
  if (!d.poligono) return 'Talhão sem contorno salvo — o mapa não pode ser recortado.';
  if (!d.legenda || d.legenda.classes.length === 0) return 'Legenda de Compactação não encontrada.';
  if (d.camadas.length === 0) return 'Interpole as camadas antes de gerar o PDF.';
  const semGrid = d.camadas.filter(c => !c.resp?.grid || c.resp.grid.comp).map(c => c.prof);
  if (semGrid.length) return `Camada(s) sem mapa utilizável: ${semGrid.join(', ')}. Interpole de novo.`;
  return null;
}

/** SA03_COMPACT_2026_EP01_BV5 — mesma família de nomes da grade de compactação. */
export function nomeArquivoCompactacao(d: DadosRelatorioCompactacao): string {
  return nomeExport({
    fazenda: d.fazenda, siglaFazenda: d.siglaFazenda, talhao: d.talhao,
    tipo: 'COMPACT', ano: d.ano ?? null, detalhe: d.levantamento,
  });
}

// ── nuvem: mesmo namespace da aba (inv_mapas_fert, prefixo compactacao__) ──

export const prefixoNuvemCompactacao = (talhaoId: string, importacaoId: string) => `compactacao__${talhaoId}__${importacaoId}__`;

/** Mapas salvos na nuvem de uma importação, já descomprimidos, por profundidade. */
export async function carregarMapasCompactacao(talhaoId: string, importacaoId: string): Promise<Record<string, RespInterp>> {
  const prefixo = prefixoNuvemCompactacao(talhaoId, importacaoId);
  const lst = await cloudCarregarMapasPorPrefixo<{ resp: RespInterp }>(prefixo);
  const out: Record<string, RespInterp> = {};
  for (const c of lst) {
    const resp = c.dados?.resp;
    if (!resp) continue;
    if (resp.grid?.comp === 'gz') {
      try { resp.grid = await descomprimirGrid(resp.grid); } catch { continue; }
    }
    out[c.id.slice(prefixo.length)] = resp;
  }
  return out;
}

/**
 * Junta o que o PDF precisa a partir do cadastro (talhão/fazenda/produtor) e
 * dos mapas. Serve à aba Compactação (mapas do cache) e à reabertura pelo
 * histórico de relatórios (mapas da nuvem). Devolve erro legível quando falta
 * camada.
 */
export function montarDadosCompactacao(o: {
  talhaoId: string; importacao: ImportacaoCompactacao; mapas: Record<string, RespInterp>;
  legenda: Legenda; poligono?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null; satelite?: boolean;
}): DadosRelatorioCompactacao | { erro: string } {
  const falta = camadasFaltando(o.importacao.profundidades, Object.keys(o.mapas));
  if (falta.length) return { erro: `Faltam mapas das camadas ${falta.join(', ')} — use "Interpolar todas as camadas".` };
  const t = getTalhoes().find(x => x.id === o.talhaoId);
  let poligono = o.poligono ?? null;
  if (!poligono && t?.geojson) { try { poligono = extrairPoligono(JSON.parse(t.geojson)); } catch { /* sem contorno */ } }
  if (!poligono) return { erro: 'Talhão sem contorno salvo — o mapa não pode ser recortado.' };
  const f = t ? getFazendas().find(x => x.id === t.fazendaId) : undefined;
  const cli = f ? getClientes().find(x => x.id === f.clienteId) : undefined;
  return {
    fazenda: f?.nome ?? '', produtor: cli?.nome ?? '', talhao: t?.nome ?? '',
    siglaFazenda: f?.sigla ?? null,
    areaHa: t?.areaHa ?? 0, municipio: f?.municipio ?? '', estado: f?.estado ?? '',
    levantamento: o.importacao.nome, dataReferencia: o.importacao.dataReferencia ?? null,
    ano: o.importacao.ano ?? null,
    legenda: o.legenda, poligono,
    camadas: o.importacao.profundidades.map(prof => ({ prof, resp: o.mapas[prof] })),
    pontos: o.importacao.pontos,
    satelite: o.satelite ?? true,
    logoClienteUrl: (cli as { logoUrl?: string } | undefined)?.logoUrl ?? null,
  };
}

/**
 * Reabre um relatório do histórico (aba Relatórios): refaz o PDF a partir da
 * importação e dos mapas salvos na nuvem — o registro só guarda a configuração.
 */
export async function regenerarRelatorioCompactacao(talhaoId: string, importacaoId: string | undefined): Promise<void> {
  const imp = importacaoId ? getImportacoesCompactacao(talhaoId).find(i => i.id === importacaoId) : undefined;
  if (!imp) throw new Error('A importação de compactação deste relatório não existe mais.');
  const legenda = getLegendasPorAtributo('compactacao')[0];
  if (!legenda) throw new Error('Legenda de Compactação não encontrada na Biblioteca (Sistema).');
  const mapas = await carregarMapasCompactacao(talhaoId, imp.id);
  const dados = montarDadosCompactacao({ talhaoId, importacao: imp, mapas, legenda });
  if ('erro' in dados) throw new Error(dados.erro);
  await gerarRelatorioCompactacao(dados);
}

// ── imagens e logos ──────────────────────────────────────────────────────────

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
    branca: await carregarImg('/images/logo-branca.png').then(reduzirLogo).catch(() => null),
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
    doc.setFillColor(...(k % 2 === 0 ? NAVY : [255, 255, 255] as RGB));
    doc.setDrawColor(...NAVY); doc.setLineWidth(0.2);
    doc.rect(sx, ey, barLen / 4, 2, k % 2 === 0 ? 'FD' : 'D');
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...GRAY);
  for (let k = 0; k <= 4; k++) {
    const sx = ex + (barLen / 4) * k;
    doc.text(k === 4 ? `${Math.round(niceMax)} m` : String(Math.round((niceMax / 4) * k)), sx, ey + 5, { align: 'center' });
  }
}

function rodape(doc: JsPDF, logos: Logos, pagina: number, total: number): void {
  doc.setFillColor(...NAVY); doc.rect(0, H - 10, W, 10, 'F');
  if (logos.branca) { const h = 5, w = h * (logos.branca.naturalWidth / logos.branca.naturalHeight); doc.addImage(logos.branca, 'PNG', M, H - 7.5, w, h); }
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  doc.text('INVICTA AP   |   Tecnologia que transforma dados em produtividade.', M + 26, H - 3.8);
  doc.setFont('helvetica', 'bold'); doc.text('www.invicta.agr.br', W - M, H - 3.8, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  doc.text(`${pagina}/${total}`, W - M - 34, H - 3.8, { align: 'right' });
}

function quadro(doc: JsPDF, x: number, y: number, w: number, h: number, titulo: string): void {
  doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.roundedRect(x, y, w, h, 2, 2, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY);
  doc.text(titulo, x + 4, y + 6);
}

// ── pré-cálculo por camada ───────────────────────────────────────────────────

interface Camada {
  prof: string;
  resp: RespInterp;
  area: AreaPorClasse;
  pontos: ReturnType<typeof estatisticaPontos>;
  rasterPng: string;
}

function prepararCamadas(d: DadosRelatorioCompactacao): Camada[] {
  const cls = d.legenda.classes;
  return d.camadas.map(c => {
    const g = decodeGrid(c.resp.grid!);
    return {
      prof: c.prof,
      resp: c.resp,
      area: areaPorClasse(g.valores, g.rows, g.cols, cls, { pixelM: c.resp.stats.pixel_m, bounds: c.resp.bounds, poligono: d.poligono }),
      pontos: estatisticaPontos(d.pontos, c.prof),
      rasterPng: colorirGridComLegenda(c.resp.grid!, d.legenda).dataUrl,
    };
  });
}

function labelsDaCamada(d: DadosRelatorioCompactacao, prof: string): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: d.pontos
      .filter(p => p.valores[prof] != null && Number.isFinite(p.valores[prof]))
      .map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { txt: fmt(p.valores[prof], 2) } })),
  };
}

function cabecalho(doc: JsPDF, d: DadosRelatorioCompactacao, logos: Logos, subtitulo: string, linha2: string): void {
  desenharCabecalhoOficial(doc, {
    logoCliente: logos.cli,
    fazenda: san(d.fazenda), siglaFazenda: d.siglaFazenda, talhao: d.talhao,
    esquerda: [`Produtor: ${san(d.produtor) || '—'}`, linha2],
    titulo: 'COMPACTAÇÃO',
    subtitulo,
    info: [
      `Área Total: ${fmt(d.areaHa, 2)} ha`,
      `Município: ${municipioUf(d)}`,
      `Referência: ${dataBR(d.dataReferencia)}`,
      `Método: ${metodoGeral(d.camadas.map(c => c.resp.stats.modelo))}   |   Datum: ${DATUM}`,
    ],
  });
}

/** Legenda das 5 classes em coluna: cor, nome, faixa. */
function legendaClasses(doc: JsPDF, d: DadosRelatorioCompactacao, x: number, y: number, w: number): number {
  const u = san(d.legenda.unidade) || 'MPa';
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...NAVY);
  doc.text(`CLASSES — resistência à penetração (${u})`, x, y);
  let yy = y + 3;
  d.legenda.classes.forEach(c => {
    doc.setFillColor(...hexRgb(corCheiaDaClasse(c))); doc.roundedRect(x, yy, 4, 4, 0.6, 0.6, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...NAVY);
    doc.text(clipTexto(doc, san(c.nome), w * 0.5), x + 6, yy + 3.1);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY);
    doc.text(rotuloFaixaClasse(c), x + w, yy + 3.1, { align: 'right' });
    yy += 5.2;
  });
  return yy;
}

// ── página 1: RESUMO ─────────────────────────────────────────────────────────

async function paginaResumo(doc: JsPDF, d: DadosRelatorioCompactacao, cs: Camada[], logos: Logos): Promise<void> {
  cabecalho(doc, d, logos, `Resistência à penetração (${san(d.legenda.unidade) || 'MPa'}) — resumo`,
    `Levantamento: ${san(d.levantamento) || '—'}   |   ${cs.length} camadas`);

  // Miniaturas (sem satélite: fundo branco, as cores falam sozinhas)
  const areaX = M, areaY = 30, areaW = 182, areaH = 150;
  const { cols, rows } = gradeMiniaturas(cs.length);
  const cw = areaW / cols, ch = areaH / rows;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    const cx = areaX + (i % cols) * cw, cy = areaY + Math.floor(i / cols) * ch;
    const iw = cw - 3, ih = ch - 8;
    const png = await capturarMapaFertilidade({
      rasterPng: c.rasterPng, bounds: c.resp.bounds, poligono: d.poligono, valores: EMPTY_FC,
      satelite: false, corLimite: '#0d2140',
      larguraPx: Math.round(iw * PXMM * 0.75), alturaPx: Math.round(ih * PXMM * 0.75),
    });
    const img = await imagemParaPdf(png, iw);
    doc.addImage(img.data, img.formato, cx, cy + 5, iw, ih);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.rect(cx, cy + 5, iw, ih, 'S');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY);
    doc.text(`${san(c.prof)} cm`, cx, cy + 3.6);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY);
    doc.text(c.pontos ? `média ${fmt(c.pontos.media)} ${san(d.legenda.unidade)}` : 'sem leitura', cx + iw, cy + 3.6, { align: 'right' });
  }

  // Barras empilhadas de % de área por classe, uma por profundidade
  const bx = areaX + areaW + 5, bw = W - M - bx;
  quadro(doc, bx, areaY, bw, 16 + cs.length * 8.5, '% DA ÁREA POR CLASSE E MÉDIA (MPa)');
  const labW = 13, medW = 13, barW = bw - 8 - labW - medW;
  let y = areaY + 11;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...GRAY);
  doc.text('camada', bx + 4, y); doc.text('média', bx + bw - 4, y, { align: 'right' });
  y += 2;
  for (const c of cs) {
    let x = bx + 4 + labW;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...NAVY);
    doc.text(san(c.prof), bx + 4, y + 4.3);
    c.area.pct.forEach((p, k) => {
      if (p <= 0) return;
      const sw = (barW * p) / 100;
      const rgb = hexRgb(corCheiaDaClasse(d.legenda.classes[k]));
      doc.setFillColor(...rgb); doc.rect(x, y, sw, 6, 'F');
      if (sw >= 7) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(5.8); doc.setTextColor(...textoSobre(rgb));
        doc.text(`${Math.round(p)}%`, x + sw / 2, y + 4, { align: 'center' });
      }
      x += sw;
    });
    if (c.area.nPix === 0) { doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...GRAY); doc.text('sem área', x + 2, y + 4); }
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.rect(bx + 4 + labW, y, barW, 6, 'S');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...NAVY);
    doc.text(c.pontos ? fmt(c.pontos.media) : '—', bx + bw - 4, y + 4.3, { align: 'right' });
    y += 8.5;
  }

  const yLeg = areaY + 16 + cs.length * 8.5 + 7;
  const yFim = legendaClasses(doc, d, bx + 2, yLeg, bw - 4);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...GRAY);
  doc.text('% da área = pixels do mapa interpolado dentro do talhão. Média = média dos pontos medidos na camada (valor de cada camada de 10 cm = maior leitura da faixa).',
    bx + 2, yFim + 3, { maxWidth: bw - 4 });
}

// ── páginas por CAMADA ───────────────────────────────────────────────────────

async function paginaCamada(doc: JsPDF, d: DadosRelatorioCompactacao, c: Camada, logos: Logos): Promise<void> {
  const u = san(d.legenda.unidade) || 'MPa';
  cabecalho(doc, d, logos, `Resistência à penetração — ${san(c.prof)} cm (${u})`,
    `Levantamento: ${san(d.levantamento) || '—'}   |   Camada: ${san(c.prof)} cm`);

  const mapaW = 178, mapaH = 128, mapaX = M, mapaY = 30;
  const png = await capturarMapaFertilidade({
    rasterPng: c.rasterPng, bounds: c.resp.bounds, poligono: d.poligono, valores: labelsDaCamada(d, c.prof),
    satelite: d.satelite, corLimite: '#ffffff',
    larguraPx: Math.round(mapaW * PXMM), alturaPx: Math.round(mapaH * PXMM),
  });
  const img = await imagemParaPdf(png, mapaW);
  doc.addImage(img.data, img.formato, mapaX, mapaY, mapaW, mapaH);
  doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.rect(mapaX, mapaY, mapaW, mapaH, 'S');
  rosaDosVentos(doc, mapaX + 7, mapaY + mapaH - 7);

  // Tira DISCRETA das 5 classes com as bordas da legenda oficial
  const cls = d.legenda.classes;
  const tiraY = mapaY + mapaH + 5, tiraH = 4.5, larg = mapaW / (cls.length || 1);
  cls.forEach((k, i) => { doc.setFillColor(...hexRgb(corCheiaDaClasse(k))); doc.rect(mapaX + i * larg, tiraY, larg, tiraH, 'F'); });
  doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.rect(mapaX, tiraY, mapaW, tiraH, 'S');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...GRAY);
  cls.forEach((k, i) => doc.text(`${san(k.nome)} (${rotuloFaixaClasse(k)})`, mapaX + (i + 0.5) * larg, tiraY + tiraH + 3.2, { align: 'center' }));
  escalaGrafica(doc, mapaX + mapaW / 2 + 45, tiraY + tiraH + 7.5, c.resp.bounds, mapaW, 50);

  // Tabela das classes: faixa, % da área, ha
  const tabX = mapaX + mapaW + 6, tabW = W - M - tabX;
  let ty = mapaY;
  doc.setFillColor(...NAVY); doc.rect(tabX, ty, tabW, 7, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
  doc.text('CLASSE', tabX + 8, ty + 4.8);
  doc.text(`FAIXA (${u})`, tabX + 44, ty + 4.8);
  doc.text('% ÁREA', tabX + tabW - 16, ty + 4.8, { align: 'right' });
  doc.text('ha', tabX + tabW - 3, ty + 4.8, { align: 'right' });
  ty += 7;
  const rowH = 7.4;
  cls.forEach((k, i) => {
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(tabX, ty + rowH, tabX + tabW, ty + rowH);
    doc.setFillColor(...hexRgb(corCheiaDaClasse(k))); doc.roundedRect(tabX + 2, ty + 1.7, 4, 4, 0.6, 0.6, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...NAVY);
    doc.text(clipTexto(doc, san(k.nome), 34), tabX + 8, ty + 4.9);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY);
    doc.text(rotuloFaixaClasse(k), tabX + 44, ty + 4.9);
    doc.setTextColor(...NAVY);
    doc.text(fmt(c.area.pct[i], 1), tabX + tabW - 16, ty + 4.9, { align: 'right' });
    doc.text(fmt(c.area.ha[i], 2), tabX + tabW - 3, ty + 4.9, { align: 'right' });
    ty += rowH;
  });
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.5); doc.line(tabX, ty + 0.5, tabX + tabW, ty + 0.5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...NAVY);
  doc.text('TOTAL', tabX + 8, ty + 5.4);
  doc.text(c.area.nPix > 0 ? '100,0' : '—', tabX + tabW - 16, ty + 5.4, { align: 'right' });
  doc.text(fmt(c.area.ha.reduce((s, x) => s + x, 0), 2), tabX + tabW - 3, ty + 5.4, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...GRAY);
  doc.text(`Área somada dos pixels de ${c.resp.stats.pixel_m} m dentro do talhão; a área cadastrada é ${fmt(d.areaHa, 2)} ha.`,
    tabX, ty + 10, { maxWidth: tabW });

  // Quadro da camada: pontos + interpolação
  const ry = ty + 16, rh = 56;
  quadro(doc, tabX, ry, tabW, rh, `CAMADA ${san(c.prof)} cm`);
  const p = c.pontos;
  const cor = (v: number | null | undefined) => {
    if (v == null) return;
    const i = indiceClasseValor(v, cls);
    return i >= 0 ? san(cls[i].nome) : '';
  };
  const linhas: string[] = [
    `Média dos pontos: ${p ? `${fmt(p.media)} ${u}  (${cor(p.media)})` : '—'}`,
    `Mínimo: ${p ? `${fmt(p.min)} ${u}` : '—'}   |   Máximo: ${p ? `${fmt(p.max)} ${u}` : '—'}`,
    `Média do mapa: ${c.area.mediaMapa != null ? `${fmt(c.area.mediaMapa)} ${u}` : '—'}`,
    `Pontos com leitura: ${p?.n ?? 0}   |   Pontos no mapa: ${c.resp.stats.n}`,
    `Método: ${san(rotuloMetodo(c.resp.stats.modelo))}`,
    `Pixel: ${c.resp.stats.pixel_m} m`,
    ...(c.resp.stats.rmse != null ? [`Erro (RMSE): ${fmt(c.resp.stats.rmse)} ${u}`] : []),
  ];
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
  linhas.forEach((t, i) => doc.text(clipTexto(doc, t, tabW - 8), tabX + 4, ry + 12 + i * 5.6));
}

// ── páginas da TABELA pontos × camadas ───────────────────────────────────────

const LINHAS_POR_PAGINA = 22;

function paginasTabela(d: DadosRelatorioCompactacao): number {
  return paginar(d.pontos, LINHAS_POR_PAGINA).length;
}

function paginaTabela(doc: JsPDF, d: DadosRelatorioCompactacao, logos: Logos,
  tabela: ReturnType<typeof montarTabela>, fatia: ReturnType<typeof montarTabela>['linhas'], ultima: boolean, parte: string): void {
  const u = san(d.legenda.unidade) || 'MPa';
  cabecalho(doc, d, logos, `Resistência à penetração por ponto (${u})${parte}`,
    `Levantamento: ${san(d.levantamento) || '—'}   |   ${d.pontos.length} pontos`);
  const cls = d.legenda.classes;
  const x0 = M, y0 = 31, wPto = 14, wMed = 22;
  const wCam = (W - 2 * M - wPto - wMed) / Math.max(1, tabela.profundidades.length);
  const rowH = 6;

  doc.setFillColor(...NAVY); doc.rect(x0, y0, W - 2 * M, 7, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
  doc.text('PONTO', x0 + wPto / 2, y0 + 4.8, { align: 'center' });
  doc.text('MEDIÇÃO', x0 + wPto + wMed / 2, y0 + 4.8, { align: 'center' });
  tabela.profundidades.forEach((p, j) => doc.text(`${san(p)} cm`, x0 + wPto + wMed + (j + 0.5) * wCam, y0 + 4.8, { align: 'center' }));

  let y = y0 + 7;
  const celula = (x: number, cel: { valor: number | null; classe: number }, negrito: boolean) => {
    if (cel.valor == null) {
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY);
      doc.text('—', x + wCam / 2, y + 4.1, { align: 'center' });
      return;
    }
    const rgb = cel.classe >= 0 ? hexRgb(corCheiaDaClasse(cls[cel.classe])) : [240, 240, 240] as RGB;
    doc.setFillColor(...rgb); doc.rect(x + 0.4, y + 0.4, wCam - 0.8, rowH - 0.8, 'F');
    doc.setFont('helvetica', negrito ? 'bold' : 'normal'); doc.setTextColor(...textoSobre(rgb));
    doc.text(fmt(cel.valor), x + wCam / 2, y + 4.1, { align: 'center' });
  };
  doc.setFontSize(7);
  for (const l of fatia) {
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
    doc.text(String(l.ponto), x0 + wPto / 2, y + 4.1, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY);
    doc.text(clipTexto(doc, san(l.medicao), wMed - 2), x0 + wPto + wMed / 2, y + 4.1, { align: 'center' });
    l.celulas.forEach((cel, j) => celula(x0 + wPto + wMed + j * wCam, cel, false));
    doc.setDrawColor(...LINE); doc.setLineWidth(0.15); doc.line(x0, y + rowH, W - M, y + rowH);
    y += rowH;
  }
  if (ultima) {
    doc.setDrawColor(...NAVY); doc.setLineWidth(0.5); doc.line(x0, y + 0.3, W - M, y + 0.3);
    y += 0.8;
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY); doc.setFontSize(7.5);
    doc.text('MÉDIA', x0 + (wPto + wMed) / 2, y + 4.1, { align: 'center' });
    tabela.media.forEach((cel, j) => celula(x0 + wPto + wMed + j * wCam, cel, true));
    y += rowH;
  }

  // Chave de cores à direita, na altura da marca INVICTA
  const ky = 187;
  let kx = W - M;
  doc.setFontSize(6.5);
  for (let i = cls.length - 1; i >= 0; i--) {
    const txt = `${san(cls[i].nome)} (${rotuloFaixaClasse(cls[i])})`;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY);
    const tw = doc.getTextWidth(txt);
    doc.text(txt, kx, ky + 3, { align: 'right' });
    kx -= tw + 5;
    doc.setFillColor(...hexRgb(corCheiaDaClasse(cls[i]))); doc.roundedRect(kx, ky, 3.6, 3.6, 0.5, 0.5, 'F');
    kx -= 5;
  }
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
  doc.text(`Classes (${u}):`, kx, ky + 3, { align: 'right' });
}

// ── montagem ─────────────────────────────────────────────────────────────────

/** Nº de páginas: resumo + 1 por camada + tabela. */
export function totalPaginasCompactacao(d: DadosRelatorioCompactacao): number {
  return 1 + d.camadas.length + paginasTabela(d);
}

/** Monta o PDF, abre em nova aba (com o erro na própria aba se falhar) e devolve o Blob + nº de páginas. */
export async function gerarRelatorioCompactacao(d: DadosRelatorioCompactacao): Promise<{ blob: Blob; paginas: number }> {
  const erro = validarCompactacao(d);
  if (erro) throw new Error(erro);
  const aba = typeof window !== 'undefined' ? window.open('', '_blank') : null;
  if (aba) try { aba.document.write('<!doctype html><meta charset="utf-8"><title>Relatório</title><body style="font-family:system-ui,sans-serif;padding:28px;color:#334155"><p>⏳ Gerando o PDF da compactação… aguarde (capturando os mapas).</p></body>'); } catch {}
  try {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    const logos = await carregarLogos(d.logoClienteUrl);
    const cs = prepararCamadas(d);
    const total = totalPaginasCompactacao(d);
    let pag = 1;

    await paginaResumo(doc, d, cs, logos);
    marcaInvicta(doc, logos.inv, 'esquerda'); rodape(doc, logos, pag, total);

    for (const c of cs) {
      doc.addPage(); pag++;
      await paginaCamada(doc, d, c, logos);
      marcaInvicta(doc, logos.inv, 'esquerda'); rodape(doc, logos, pag, total);
    }

    const tabela = montarTabela(d.pontos, d.camadas.map(c => c.prof), d.legenda.classes);
    const fatias = paginar(tabela.linhas, LINHAS_POR_PAGINA);
    fatias.forEach((fatia, i) => {
      doc.addPage(); pag++;
      const parte = fatias.length > 1 ? ` — ${i + 1}/${fatias.length}` : '';
      paginaTabela(doc, d, logos, tabela, fatia, i === fatias.length - 1, parte);
      marcaInvicta(doc, logos.inv, 'esquerda'); rodape(doc, logos, pag, total);
    });

    const blob = doc.output('blob');
    abrirPdfNaAba(aba, blob, `${nomeArquivoCompactacao(d)}.pdf`);
    return { blob, paginas: pag };
  } catch (e) {
    const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
    console.error('[relatorio compactacao] falha:', e);
    if (aba) { try { aba.document.body.innerHTML = `<h3 style="color:#b91c1c;font-family:system-ui">Falha ao gerar o relatório</h3><pre style="white-space:pre-wrap;font-size:12px;color:#334155">${msg.replace(/[<>&]/g, s => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[s]!))}</pre>`; } catch {} }
    throw e;
  }
}
