'use client';

// CABEÇALHO OFICIAL dos relatórios A4 paisagem, em UM lugar só:
//   logo INVICTA | fazenda/produtor | título central | INFORMAÇÕES DA ÁREA | logo do cliente
// Fertilidade e Zonas de Manejo chamam a MESMA função — a regra do usuário é
// "em todos os layouts exatamente igual", e isso só é garantia se houver um
// desenho único. Mudar aqui muda os dois relatórios de uma vez.

import type { jsPDF as JsPDF } from 'jspdf';

type RGB = [number, number, number];
const NAVY: RGB = [13, 33, 64];
const GRAY: RGB = [100, 116, 139];
const LINE: RGB = [210, 219, 232];

const W = 297, M = 6;          // A4 paisagem, margem dos relatórios
const BASE_Y = 26.5;           // régua navy que fecha o cabeçalho
const TITULO_CX = 166, TITULO_MAXW = 84;

// Corpo do título central — FIXO, NUNCA encolhe (a auto-redução antiga dava um
// tamanho diferente para cada página). Dimensionado pelo MAIOR título existente:
// "ZONAS DE MANEJO" mede 75,2 mm a 22pt, dentro dos 84 mm da caixa.
export const TITULO_PT = 22;

// Datum declarado nos relatórios (07/08/2026: era SIRGAS 2000). O fuso saiu do
// cabeçalho — não serve para quem lê o mapa.
export const DATUM = 'WGS 84';

// Largura em mm da logo do cliente no topo-direito (0 = produtor sem logo).
export function larguraLogoCliente(cli: HTMLImageElement | null): number {
  return cli ? Math.min(34, 16 * (cli.naturalWidth / cli.naturalHeight)) : 0;
}

// Borda direita do bloco de informações: a margem da página, ou a borda esquerda
// da logo do cliente quando existe — o mais à direita que dá sem sobrepor.
export function bordaInfoArea(wLogoCli: number): number {
  return W - M - (wLogoCli > 0 ? wLogoCli + 5 : 0);
}

// Corta com "…" o que não couber em `maxW`, em vez de deixar invadir o vizinho.
export function clipTexto(doc: JsPDF, txt: string, maxW: number): string {
  if (doc.getTextWidth(txt) <= maxW) return txt;
  let t = txt;
  while (t.length > 1 && doc.getTextWidth(t + '…') > maxW) t = t.slice(0, -1);
  return t + '…';
}

export interface CabecalhoOficial {
  logoInvicta: HTMLImageElement | null;
  logoCliente: HTMLImageElement | null;
  fazenda: string;      // linha grande à esquerda (sai em maiúsculas)
  esquerda: string[];   // até 2 linhas cinza sob a fazenda (produtor, ano…)
  titulo: string;       // linha grande central — sai LITERAL, sem maiúsculas
  subtitulo: string;    // linha cinza sob o título
  info: string[];       // linhas do bloco INFORMAÇÕES DA ÁREA
}

// Desenha o cabeçalho inteiro (y 0 … 26,5) na página atual.
export function desenharCabecalhoOficial(doc: JsPDF, o: CabecalhoOficial): void {
  const clip = (txt: string, maxW: number) => clipTexto(doc, txt, maxW);

  if (o.logoInvicta) {
    const h = 15, w = h * (o.logoInvicta.naturalWidth / o.logoInvicta.naturalHeight);
    doc.addImage(o.logoInvicta, 'PNG', M, 5, w, h);
  }
  doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(M + 52, 5, M + 52, 24);

  // ── Bloco esquerdo: fazenda + até 2 linhas de contexto ──
  doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(clip(o.fazenda.toUpperCase(), 60), M + 56, 9);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GRAY);
  o.esquerda.slice(0, 2).forEach((t, i) => doc.text(clip(t, 62), M + 56, 14 + i * 4.5));

  // ── Título central: sigla/assunto em corpo fixo + nome (unidade) embaixo ──
  doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(TITULO_PT);
  doc.text(clip(o.titulo, TITULO_MAXW), TITULO_CX, 13.5, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAY);
  doc.text(clip(o.subtitulo, TITULO_MAXW), TITULO_CX, 20, { align: 'center' });

  // ── Logo do cliente (só quando existe; sem placeholder) ──
  const wCli = larguraLogoCliente(o.logoCliente);
  if (o.logoCliente) doc.addImage(o.logoCliente, 'PNG', W - M - wCli, 5, wCli, 16);

  // ── INFORMAÇÕES DA ÁREA: JUSTIFICADO à direita — o bloco cresce da borda para
  // a esquerda, então linha curta e linha longa terminam alinhadas na margem. ──
  const xDir = bordaInfoArea(wCli);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY);
  doc.text('INFORMAÇÕES DA ÁREA', xDir, 8, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY);
  o.info.forEach((t, i) => doc.text(t, xDir, 13 + i * 4, { align: 'right' }));

  doc.setDrawColor(...NAVY); doc.setLineWidth(0.8); doc.line(0, BASE_Y, W, BASE_Y);
}
