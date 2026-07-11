'use client';

// Geração de etiquetas em PDF. Layout configurável por presets (folhas adesivas
// Pimaco) — número da amostra em destaque + profundidade. Sem QR.

import type { GradeAmostragem, PontoAmostragem } from './store';
import type { jsPDF as JsPDF } from 'jspdf';

// ── Layouts de folha (presets) ───────────────────────────────────────────────
export interface LayoutEtiqueta {
  id: string;
  nome: string;
  pageW: number; pageH: number;     // mm (A4 = 210×297, Carta = 215,9×279,4)
  cols: number; rows: number;
  labelW: number; labelH: number;   // mm
  marginLeft: number; marginTop: number; // origem da 1ª etiqueta (mm)
  pitchX: number; pitchY: number;   // distância origem→origem entre etiquetas (mm)
  bordaGuia?: boolean;              // desenha contorno (guia de corte/alinhamento)
  desc?: string;
}

// Medidas oficiais Pimaco (etiqueta = larg×alt, nº por folha). Margens centradas
// e etiquetas contíguas (pitch = tamanho) como ponto de partida — a calibração
// (ajuste fino dx/dy) acerta qualquer desvio da folha específica.
export const LAYOUTS_ETIQUETA: LayoutEtiqueta[] = [
  { id: 'A4361', nome: 'Pimaco A4361 — 46,5×63,5 (18/folha)', pageW: 210, pageH: 297, cols: 3, rows: 6, labelW: 63.5, labelH: 46.5, marginLeft: 9.75, marginTop: 9, pitchX: 63.5, pitchY: 46.5, desc: 'Etiqueta maior — número grande' },
  { id: 'A4260', nome: 'Pimaco A4260 — 38,1×63,5 (21/folha)', pageW: 210, pageH: 297, cols: 3, rows: 7, labelW: 63.5, labelH: 38.1, marginLeft: 9.75, marginTop: 15.15, pitchX: 63.5, pitchY: 38.1, desc: 'Tamanho médio' },
  { id: 'A4355', nome: 'Pimaco A4355 — 31,0×63,5 (27/folha)', pageW: 210, pageH: 297, cols: 3, rows: 9, labelW: 63.5, labelH: 31.0, marginLeft: 9.75, marginTop: 9, pitchX: 63.5, pitchY: 31.0, desc: 'Compacta' },
  { id: 'A4356', nome: 'Pimaco A4356 — 25,4×63,5 (33/folha)', pageW: 210, pageH: 297, cols: 3, rows: 11, labelW: 63.5, labelH: 25.4, marginLeft: 9.75, marginTop: 8.8, pitchX: 63.5, pitchY: 25.4, desc: 'Pequena — máx. por folha' },
  { id: '6181', nome: 'Pimaco 6181 (Carta) — 25,4×101,6 (20/folha)', pageW: 215.9, pageH: 279.4, cols: 2, rows: 10, labelW: 101.6, labelH: 25.4, marginLeft: 6.35, marginTop: 12.7, pitchX: 101.6, pitchY: 25.4, desc: 'Folha Carta' },
  { id: 'generico', nome: 'Genérico A4 (3×8, com contorno)', pageW: 210, pageH: 297, cols: 3, rows: 8, labelW: 64.67, labelH: 35.13, marginLeft: 8, marginTop: 8, pitchX: 64.67, pitchY: 35.13, bordaGuia: true, desc: 'Folha A4 comum + linhas de corte' },
];

export const LAYOUT_PADRAO = 'A4361';

// ── Itens (uma etiqueta cada) ─────────────────────────────────────────────────
export interface EtiquetaItem {
  titulo: string;   // ex: talhão
  numero: string;   // destaque (nº da amostra)
  sub?: string;     // ex: "00-20 cm"
  rodape?: string;  // ex: "Safra 25/26 · 1a época"
}

// Profundidades de um ponto: usa os rótulos salvos; senão deriva da config da grade.
function profundidadesDoPonto(p: PontoAmostragem, grade: GradeAmostragem): string[] {
  if (p.profundidades && p.profundidades.length) return p.profundidades;
  return grade.profundidades.slice(0, p.profs).map(pr => pr.rotulo);
}

// Itens a partir de uma grade do Grid (ponto × profundidade).
export function itensDeGrade(talhaoNome: string, grade: GradeAmostragem): EtiquetaItem[] {
  const out: EtiquetaItem[] = [];
  const rodape = `Safra ${grade.safra} · ${grade.epoca}a época`;
  for (const pt of grade.pontos) {
    const numero = String(pt.ordem + 1).padStart(3, '0');
    for (const prof of profundidadesDoPonto(pt, grade)) out.push({ titulo: talhaoNome, numero, sub: `${prof} cm`, rodape });
  }
  return out;
}

const MM_PT = 2.83465; // mm → pt

// ── Renderização (pura — desenha num doc já criado; testável fora do browser) ──
export function desenharEtiquetas(doc: JsPDF, itens: EtiquetaItem[], layout: LayoutEtiqueta, ajuste: { dx: number; dy: number } = { dx: 0, dy: 0 }) {
  const perPage = layout.cols * layout.rows;
  const pad = 1.5;

  for (let i = 0; i < itens.length; i++) {
    const it = itens[i];
    const idx = i % perPage;
    if (i > 0 && idx === 0) doc.addPage([layout.pageW, layout.pageH]);
    const col = idx % layout.cols, row = Math.floor(idx / layout.cols);
    const x = layout.marginLeft + ajuste.dx + col * layout.pitchX;
    const y = layout.marginTop + ajuste.dy + row * layout.pitchY;
    const w = layout.labelW, h = layout.labelH, cx = x + w / 2;

    if (layout.bordaGuia) { doc.setDrawColor(220); doc.setLineWidth(0.1); doc.rect(x, y, w, h); }

    const mostraTitulo = h >= 24 && !!it.titulo;
    const mostraRodape = h >= 30 && !!it.rodape;

    // Título (talhão)
    if (mostraTitulo) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(Math.min(9, Math.max(6, h * 0.15 * MM_PT)));
      doc.setTextColor(110, 120, 140);
      doc.text(it.titulo, cx, y + h * 0.17, { align: 'center', maxWidth: w - 2 * pad });
    }

    // Número (destaque) — encolhe para caber na largura
    let fs = h * 0.42 * MM_PT;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(fs);
    while (doc.getTextWidth(it.numero) > w - 2.5 * pad && fs > 6) { fs -= 1; doc.setFontSize(fs); }
    doc.setTextColor(15, 25, 45);
    doc.text(it.numero, cx, y + (mostraTitulo ? h * 0.57 : h * 0.5), { align: 'center' });

    // Profundidade
    if (it.sub) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(Math.min(13, Math.max(7, h * 0.17 * MM_PT)));
      doc.setTextColor(30, 60, 110);
      doc.text(it.sub, cx, y + (mostraRodape ? h * 0.78 : h * 0.84), { align: 'center', maxWidth: w - 2 * pad });
    }

    // Rodapé (safra/época)
    if (mostraRodape) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(Math.min(8, Math.max(5, h * 0.12 * MM_PT)));
      doc.setTextColor(140, 150, 165);
      doc.text(it.rodape!, cx, y + h * 0.93, { align: 'center', maxWidth: w - 2 * pad });
    }
  }
}

// Gera o PDF e abre em nova aba (pronto p/ imprimir). Cai para download se o
// navegador bloquear o pop-up.
export async function gerarEtiquetasPDF(itens: EtiquetaItem[], layout: LayoutEtiqueta, nomeArquivo: string, ajuste: { dx: number; dy: number } = { dx: 0, dy: 0 }) {
  if (itens.length === 0) return;
  // abre a aba JÁ no gesto do clique (antes do await) para não cair no bloqueio de pop-up
  const aba = typeof window !== 'undefined' ? window.open('', '_blank') : null;
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: [layout.pageW, layout.pageH], compress: true });
  desenharEtiquetas(doc, itens, layout, ajuste);
  const arquivo = `${nomeArquivo.replace(/[^\w.\-]+/g, '_')}.pdf`;
  if (aba) {
    const url = URL.createObjectURL(doc.output('blob'));
    aba.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } else {
    doc.save(arquivo); // pop-up bloqueado → baixa o arquivo
  }
}
