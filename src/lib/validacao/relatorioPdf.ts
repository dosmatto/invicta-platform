'use client';

// RELATÓRIO PDF DA VALIDAÇÃO — A4 paisagem, 2 páginas, no padrão visual dos
// demais relatórios da plataforma (NAVY/GRAY/LINE, logos, rodapé).
//
// Página 1 — O QUE FOI DECIDIDO: mapa das zonas com a classificação, os dois
//   índices que se leem juntos (IQZM × ICA) e a tabela zona a zona com
//   MÍNIMO, MÉDIA e MÁXIMO da camada — mais a produção estimada quando a
//   camada é de produtividade.
// Página 2 — POR QUE: os 16 indicadores com a justificativa de cada um, a
//   classificação sugerida (atual → sugerida), as recomendações com a base
//   declarada e a metodologia com os limiares. O relatório sai do escritório
//   e vai para o produtor: ele tem de se sustentar sozinho, sem a tela ao lado.
//
// Todo texto passa por paraPdf() — a fonte do PDF descarta η, ², ×, ÷, ≥ sem
// avisar (ver textoPdf.ts).

import type { jsPDF as JsPDF } from 'jspdf';
import { capturarMapaZonas } from '../capturaMapa';
import { imagemParaPdf, reduzirLogo } from '../pdfImagem';
import { bboxDeZonas } from './amostragem.ts';
import { rotuloIQZM } from './iqzm.ts';
import { rotuloICA } from './ica.ts';
import { COR_FAIXA, ROTULO_FAIXA, type Indicador } from './tipos.ts';
import { linhaZonaPdf, producaoTotalT, paraPdf, ehProdutividade, numRel, METODOLOGIA } from './textoPdf.ts';
import type { RelatorioCompleto } from './validar.ts';
import type { Sugestao } from './sugestao.ts';

const NAVY: [number, number, number] = [13, 33, 64];
const GRAY: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [210, 219, 232];
const fmt = (v: number, d = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const hexRgb = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
  return m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)] : [100, 116, 139];
};

function carregarImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => res(img); img.onerror = () => rej(new Error(`falha ao carregar ${src}`)); img.src = src;
  });
}

export interface IdentValidacao {
  produtor: string; fazenda: string; talhao: string;
  ano?: string; municipio?: string; estado?: string;
  responsavel?: string;
  logoClienteUrl?: string | null;
}

export interface DadosRelatorioValidacao {
  rel: RelatorioCompleto;
  sugestao: Sugestao | null;
  /** Geometria do zoneamento avaliado (para o mapa). */
  fc: GeoJSON.FeatureCollection;
  ident: IdentValidacao;
  satelite?: boolean;
}

export async function gerarRelatorioValidacao(d: DadosRelatorioValidacao): Promise<string> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }) as JsPDF;
  const W = 297, H = 210, M = 6;
  const { rel, sugestao, ident } = d;

  const inv = await carregarImg('/images/logo-colorida.png').catch(() => null);
  const branca = await carregarImg('/images/logo-branca.png').catch(() => null);
  const cliRaw = ident.logoClienteUrl ? await carregarImg(ident.logoClienteUrl).catch(() => null) : null;
  const cli = cliRaw ? await reduzirLogo(cliRaw) : null;

  const un = rel.camadaValidacao?.unidade ?? '';
  const prod = ehProdutividade(un);
  const linhas = rel.porZona.map(z => linhaZonaPdf(z, un));
  const totalT = producaoTotalT(linhas);
  const areaTotal = rel.porZona.reduce((s, z) => s + z.areaHa, 0);
  const ind = (id: string): Indicador | undefined => rel.indicadores.find(i => i.id === id);
  const iqzm = ind('iqzm'), ica = ind('ica');

  // ── Mapa das zonas coloridas pela CLASSE (a classificação é o assunto) ──
  const zonasMapa = d.fc.features.flatMap(f => {
    const p = (f.properties ?? {}) as { id?: string; zona?: string | number; cor?: string; classe?: string };
    const g = f.geometry;
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return [];
    const idZ = String(p.id ?? p.zona ?? '');
    const z = rel.porZona.find(x => x.idZona === idZ);
    return [{ geometry: g as GeoJSON.Polygon | GeoJSON.MultiPolygon, cor: z?.cor ?? String(p.cor ?? '#94a3b8'), rotulo: z?.nome ?? idZ }];
  });
  const bounds = bboxDeZonas(zonasMapa.map((z, i) => ({ idZona: String(i), geometry: z.geometry }))) ?? [-0.001, -0.001, 0.001, 0.001];

  const mapaW = 138, mapaH = 118, mapaX = M, mapaY = 31;
  let mapaPng = '';
  try {
    mapaPng = await capturarMapaZonas({
      bounds, externo: null, zonas: zonasMapa, linhas: [],
      satelite: d.satelite !== false, preencherAlpha: 0.72,
      larguraPx: Math.round(mapaW * 8), alturaPx: Math.round(mapaH * 8),
    });
  } catch { /* sem internet: sai sem mapa */ }

  const clip = (txt: string, maxW: number) => {
    let t = paraPdf(txt);
    if (doc.getTextWidth(t) <= maxW) return t;
    while (t.length > 1 && doc.getTextWidth(`${t}…`) > maxW) t = t.slice(0, -1);
    return `${t}…`;
  };

  // ── CABEÇALHO (repetido nas duas páginas) ──
  const cabecalho = (subtitulo: string) => {
    if (inv) { const h = 13, w = h * (inv.naturalWidth / inv.naturalHeight); doc.addImage(inv, 'PNG', M, 5, w, h); }
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(M + 48, 5, M + 48, 22);
    doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text(clip((ident.fazenda || '—').toUpperCase(), 58), M + 52, 9);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY);
    doc.text(clip(`Produtor: ${ident.produtor || '—'}`, 60), M + 52, 13.5);
    doc.text(clip(`Talhão: ${ident.talhao || '—'}${ident.ano ? `   |   Ano: ${ident.ano}` : ''}`, 60), M + 52, 17.5);

    // Uma linha só: em 17 pt o título quebrava e a segunda linha caía em cima
    // do subtítulo.
    doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(13.5);
    doc.text('VALIDAÇÃO DE ZONAS DE MANEJO', 160, 12, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GRAY);
    doc.text(clip(subtitulo, 104), 160, 18.5, { align: 'center' });

    const ix = 218;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...NAVY);
    doc.text('BASE DA ANÁLISE', ix, 8);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
    doc.text(clip(`Camada: ${rel.camadaValidacao?.nome ?? '—'}${un ? ` · ${un}` : ''}`, 72), ix, 12);
    doc.text(`Área: ${fmt(areaTotal, 2)} ha  |  Zonas: ${rel.porZona.length}`, ix, 15.5);
    doc.text(`Safras: ${ind('safras')?.valor ?? 0}  |  Emissão: ${new Date().toLocaleDateString('pt-BR')}`, ix, 19);
    if (ident.responsavel) doc.text(clip(`Responsável: ${ident.responsavel}`, 72), ix, 22.5);
    if (cli) { const h = 13, w = Math.min(30, h * (cli.naturalWidth / cli.naturalHeight)); doc.addImage(cli, 'PNG', W - M - w, 5, w, h); }
    doc.setDrawColor(...NAVY); doc.setLineWidth(0.8); doc.line(0, 25.5, W, 25.5);
  };

  const rodape = (pagina: number) => {
    doc.setFillColor(...NAVY); doc.rect(0, H - 9, W, 9, 'F');
    if (branca) { const h = 4.5, w = h * (branca.naturalWidth / branca.naturalHeight); doc.addImage(branca, 'PNG', M, H - 7, w, h); }
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    doc.text('INVICTA AP   |   Tecnologia que transforma dados em produtividade.', M + 24, H - 3.4);
    doc.setFont('helvetica', 'bold'); doc.text(`www.invicta.agr.br   ·   ${pagina}/2`, W - M, H - 3.4, { align: 'right' });
  };

  // ══════════════ PÁGINA 1 — classificação e resumo por zona ══════════════
  cabecalho(paraPdf(rel.cenarioNome));

  if (mapaPng) {
    const img = await imagemParaPdf(mapaPng, mapaW);
    doc.addImage(img.data, img.formato, mapaX, mapaY, mapaW, mapaH);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.rect(mapaX, mapaY, mapaW, mapaH, 'S');
  } else {
    doc.setDrawColor(...LINE); doc.rect(mapaX, mapaY, mapaW, mapaH, 'S');
    doc.setFontSize(9); doc.setTextColor(...GRAY);
    doc.text('(mapa indisponível — gere novamente com internet)', mapaX + mapaW / 2, mapaY + mapaH / 2, { align: 'center' });
  }

  // Legenda das classes (composição da área)
  let ly = mapaY + mapaH + 5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...NAVY);
  doc.text('CLASSES E COMPOSIÇÃO DA ÁREA', mapaX, ly); ly += 3;
  const barY = ly, barH = 5;
  let bx = mapaX;
  for (const z of rel.porZona) {
    const larg = mapaW * z.percArea;
    doc.setFillColor(...hexRgb(z.cor));
    doc.rect(bx, barY, Math.max(0.4, larg), barH, 'F');
    bx += larg;
  }
  doc.setDrawColor(...LINE); doc.rect(mapaX, barY, mapaW, barH, 'S');
  ly = barY + barH + 4;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(...GRAY);
  let lx = mapaX;
  for (const z of rel.porZona) {
    const txt = `${z.nome} ${z.classe || ''} ${fmt(z.percArea * 100, 0)}%`;
    const larg = doc.getTextWidth(paraPdf(txt)) + 8;
    if (lx + larg > mapaX + mapaW) { lx = mapaX; ly += 4; }
    doc.setFillColor(...hexRgb(z.cor)); doc.rect(lx, ly - 2.2, 2.6, 2.6, 'F');
    doc.setTextColor(...GRAY); doc.text(paraPdf(txt), lx + 4, ly);
    lx += larg;
  }

  // ── Os dois índices, lado a lado ──
  const colX = mapaX + mapaW + 6, colW = W - M - colX;
  const cardW = (colW - 4) / 2;
  const cartao = (x: number, ind0: Indicador | undefined, rotulo: string, legenda: string) => {
    if (!ind0) return;
    const cor = hexRgb(COR_FAIXA[ind0.faixa]);
    doc.setDrawColor(...cor); doc.setLineWidth(0.5); doc.roundedRect(x, 31, cardW, 20, 2, 2, 'S');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...NAVY);
    doc.text(paraPdf(ind0.nome.split(' — ')[0]), x + 3, 36);
    doc.setFontSize(19); doc.setTextColor(...cor);
    doc.text(ind0.valor == null ? '—' : numRel(ind0.valor), x + 3, 45);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    doc.text(clip(rotulo, cardW - 24), x + 22, 45);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.2); doc.setTextColor(...GRAY);
    doc.text(clip(legenda, cardW - 6), x + 3, 49);
  };
  cartao(colX, iqzm, rotuloIQZM(iqzm?.valor ?? null), 'qualidade do MAPA');
  cartao(colX + cardW + 4, ica, rotuloICA(ica?.valor ?? null), 'confiança da BASE de dados');

  // Alerta de nota alta com base fraca (o motivo de o ICA existir)
  let ty = 54;
  if (iqzm?.valor != null && iqzm.valor >= 70 && (ica?.valor ?? 100) < 55) {
    doc.setFillColor(255, 247, 224); doc.setDrawColor(180, 83, 9); doc.setLineWidth(0.4);
    doc.roundedRect(colX, ty, colW, 9, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8); doc.setTextColor(146, 64, 14);
    const aviso = doc.splitTextToSize(paraPdf('Nota alta sobre base limitada: o IQZM descreve o que ESTES dados mostram, não o que o talhão é. Trate como hipótese e confirme na próxima safra.'), colW - 6) as string[];
    aviso.slice(0, 2).forEach((l, i) => doc.text(l, colX + 3, ty + 3.6 + i * 3.2));
    ty += 12;
  }

  // ── Tabela por zona: MÍN · MÉDIA · MÁX (o resumo pedido) ──
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY);
  doc.text(paraPdf(`RESUMO POR ZONA${rel.camadaValidacao ? ` — ${rel.camadaValidacao.nome}` : ''}`), colX, ty); ty += 4;

  // A última coluna recebe a sobra — mas as demais têm de caber ANTES, senão
  // ela é desenhada fora da folha e some sem aviso (foi o que aconteceu com
  // "Produção" na primeira versão).
  const cols = [
    { t: 'Zona', w: 12 }, { t: 'Classe', w: 24 }, { t: 'Área', w: 15 }, { t: '%', w: 8 },
    { t: 'Mín', w: 16 }, { t: 'Média', w: 16 }, { t: 'Máx', w: 16 }, { t: 'CV', w: 13 },
    { t: prod ? 'Produção' : 'IVR', w: 0 },
  ];
  const usada = cols.reduce((s, c) => s + c.w, 0);
  cols[cols.length - 1].w = Math.max(14, colW - usada);
  const xs: number[] = [];
  cols.reduce((x, c) => { xs.push(x); return x + c.w; }, colX);

  doc.setFontSize(6.4); doc.setTextColor(...GRAY);
  cols.forEach((c, i) => {
    const alinhaDir = i >= 2;
    doc.text(paraPdf(c.t), alinhaDir ? xs[i] + c.w - 1 : xs[i], ty, { align: alinhaDir ? 'right' : 'left' });
  });
  doc.setFontSize(5.6);
  doc.text(paraPdf(un ? `(${un})` : ''), xs[4] + cols[4].w - 1, ty + 2.6, { align: 'right' });
  ty += 4; doc.setDrawColor(...LINE); doc.line(colX, ty, colX + colW, ty); ty += 3.6;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(40, 50, 70);
  linhas.forEach((l, i) => {
    const z = rel.porZona[i];
    doc.setFillColor(...hexRgb(z.cor)); doc.rect(xs[0], ty - 2.4, 2.4, 2.4, 'F');
    doc.text(clip(l.zona, cols[0].w - 5), xs[0] + 3.4, ty);
    doc.text(clip(l.classe, cols[1].w - 2), xs[1], ty);
    const valores = [
      `${fmt(l.areaHa, 2)}`, `${fmt(l.percArea * 100, 0)}%`,
      l.min, l.media, l.max, l.cv,
      prod ? l.producao : l.ivr,
    ];
    valores.forEach((v, k) => doc.text(paraPdf(v), xs[k + 2] + cols[k + 2].w - 1, ty, { align: 'right' }));
    ty += 4.4;
  });

  // Totais
  doc.setDrawColor(...LINE); doc.line(colX, ty - 2.6, colX + colW, ty - 2.6);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...NAVY);
  doc.text('TOTAL', xs[0], ty + 0.6);
  doc.text(`${fmt(areaTotal, 2)}`, xs[2] + cols[2].w - 1, ty + 0.6, { align: 'right' });
  doc.text('100%', xs[3] + cols[3].w - 1, ty + 0.6, { align: 'right' });
  if (prod && totalT != null) {
    const ult = cols.length - 1;
    doc.text(paraPdf(`${Math.round(totalT).toLocaleString('pt-BR')} t`), xs[ult] + cols[ult].w - 1, ty + 0.6, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.2); doc.setTextColor(...GRAY);
    doc.text(paraPdf(`Produção estimada = média da zona x área. Média geral: ${numRel(ind('media')?.valor ?? null)} ${un}.`), colX, ty + 5);
  }

  // ── Classificação sugerida (na coluna da direita, logo abaixo do resumo) ──
  // É o assunto do relatório: fica na primeira página, ao lado do mapa, e não
  // escondida entre os indicadores.
  if (sugestao && sugestao.zonas.length) {
    let sy = ty + (prod && totalT != null ? 10 : 6);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY);
    doc.text(paraPdf(`CLASSIFICAÇÃO SUGERIDA PELA VALIDAÇÃO${sugestao.nMudancas ? ` — ${sugestao.nMudancas} zona(s) mudariam` : ' — nada a mudar'}`), colX, sy);
    sy += 4;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...GRAY);
    const jus = doc.splitTextToSize(paraPdf(sugestao.justificativa), colW) as string[];
    jus.slice(0, 4).forEach((l, k) => doc.text(l, colX, sy + k * 2.6));
    sy += Math.min(4, jus.length) * 2.6 + 2.5;

    const sxs = [colX, colX + 16, colX + 46, colX + 78, colX + 84];
    doc.setFontSize(6.4); doc.setTextColor(...GRAY);
    ['Zona', 'Média medida', 'Classe atual', '', 'Sugerida'].forEach((t2, k) => doc.text(paraPdf(t2), sxs[k], sy));
    sy += 3; doc.setDrawColor(...LINE); doc.line(colX, sy, colX + colW, sy); sy += 3.4;
    doc.setFontSize(7); doc.setTextColor(40, 50, 70);
    for (const z of sugestao.zonas) {
      if (sy > H - 14) break;
      doc.text(paraPdf(z.nome), sxs[0], sy);
      doc.text(paraPdf(z.media == null ? '—' : `${numRel(z.media)} ${un}`), sxs[1], sy);
      doc.text(clip(z.classeAtual || '—', 30), sxs[2], sy);
      doc.setTextColor(...GRAY); doc.text(z.mudou ? '->' : '=', sxs[3], sy); doc.setTextColor(40, 50, 70);
      doc.setFillColor(...hexRgb(z.cor)); doc.rect(sxs[4], sy - 2.2, 2.4, 2.4, 'F');
      doc.text(clip(z.classeSugerida, 36), sxs[4] + 3.4, sy);
      sy += 4.2;
    }
    doc.setFont('helvetica', 'italic'); doc.setFontSize(5.8); doc.setTextColor(...GRAY);
    doc.text(paraPdf('Sugestão — depende do aceite do responsável técnico; aceitar grava uma versão nova do zoneamento.'), colX, sy + 1);
    doc.setFont('helvetica', 'normal');
  }

  rodape(1);

  // ══════════════ PÁGINA 2 — indicadores, sugestão, recomendações ══════════
  doc.addPage();
  cabecalho(paraPdf('Indicadores, recomendações e metodologia'));

  let y = 31;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY);
  doc.text('INDICADORES DA VALIDAÇÃO', M, y); y += 4;

  // Grade de indicadores: 4 colunas
  const gcols = 4, gw = (W - 2 * M - (gcols - 1) * 3) / gcols;
  let gx = M, linhaAlt = 0;
  doc.setFontSize(6.2);
  for (const i of rel.indicadores) {
    const just = doc.splitTextToSize(paraPdf(i.justificativa), gw - 4) as string[];
    const alt = 10 + Math.min(5, just.length) * 2.6;
    if (gx + gw > W - M + 0.1) { gx = M; y += linhaAlt + 3; linhaAlt = 0; }
    if (y + alt > H - 14) break;
    const cor = hexRgb(COR_FAIXA[i.faixa]);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.roundedRect(gx, y, gw, alt, 1.5, 1.5, 'S');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.4); doc.setTextColor(...NAVY);
    doc.text(clip(i.nome, gw - 20), gx + 2, y + 4);
    doc.setFontSize(9); doc.setTextColor(...cor);
    doc.text(i.valor == null ? '—' : `${numRel(i.valor)}${i.unidade === '%' ? '%' : ''}`, gx + 2, y + 9);
    if (i.faixa !== 'neutro' && i.faixa !== 'pendente') {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(5.8);
      doc.text(paraPdf(ROTULO_FAIXA[i.faixa]), gx + gw - 2, y + 4, { align: 'right' });
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5.6); doc.setTextColor(...GRAY);
    just.slice(0, 5).forEach((l, k) => doc.text(l, gx + 2, y + 12 + k * 2.6));
    linhaAlt = Math.max(linhaAlt, alt);
    gx += gw + 3;
  }
  y += linhaAlt + 5;

  // ── Recomendações ──
  if (rel.recomendacoes.length && y < H - 30) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY);
    doc.text('RECOMENDAÇÕES', M, y); y += 4;
    doc.setFontSize(6.4);
    for (const r of rel.recomendacoes) {
      if (y > H - 18) break;
      const cor: [number, number, number] = r.severidade === 'critica' ? [185, 28, 28] : r.severidade === 'atencao' ? [180, 83, 9] : [30, 64, 175];
      const partes = doc.splitTextToSize(paraPdf(r.texto), W - 2 * M - 6) as string[];
      doc.setFillColor(...cor); doc.rect(M, y - 2.4, 1.2, Math.max(3, partes.length * 2.8), 'F');
      doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 50, 70);
      partes.forEach((l, k) => doc.text(l, M + 3, y + k * 2.8));
      y += partes.length * 2.8 + 1;
      doc.setFont('helvetica', 'italic'); doc.setFontSize(5.6); doc.setTextColor(...GRAY);
      doc.text(paraPdf(`base: ${r.base.join(', ')}`), M + 3, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.4);
      y += 3.4;
    }
    y += 2;
  }

  // ── Metodologia ──
  if (y < H - 20) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.6); doc.setTextColor(...NAVY);
    doc.text('COMO OS ÍNDICES SÃO CALCULADOS', M, y); y += 3;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5.4); doc.setTextColor(...GRAY);
    for (const m of METODOLOGIA) {
      if (y > H - 12) break;
      const partes = doc.splitTextToSize(paraPdf(m), W - 2 * M) as string[];
      partes.forEach((l, k) => doc.text(l, M, y + k * 2.3));
      y += partes.length * 2.3 + 0.6;
    }
  }

  rodape(2);

  const nome = `validacao_${(ident.talhao || 'talhao')}_${rel.cenarioNome}`
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').slice(0, 70);
  doc.save(`${nome}.pdf`);
  return `${nome}.pdf`;
}
