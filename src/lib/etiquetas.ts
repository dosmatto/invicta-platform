'use client';

// Geração de etiquetas em PDF. Layout configurável por presets (folhas adesivas
// Pimaco) — número da amostra em destaque + profundidade. Sem QR.

import type { GradeAmostragem, PontoAmostragem } from './store';
// Extensão .ts explícita: o teste roda em node puro (type-stripping), que não
// resolve import sem extensão — mesmo padrão de nomeExport/lab.
import { rotuloAno } from './periodo.ts';
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
  { id: 'A4350', nome: 'Pimaco A4350 — 55,8×99,0 (10/folha)', pageW: 210, pageH: 297, cols: 2, rows: 5, labelW: 99, labelH: 55.8, marginLeft: 6, marginTop: 9, pitchX: 99, pitchY: 55.8, desc: 'Padrão da casa — a maior; número e profundidade legíveis de longe' },
  { id: 'A4361', nome: 'Pimaco A4361 — 46,5×63,5 (18/folha)', pageW: 210, pageH: 297, cols: 3, rows: 6, labelW: 63.5, labelH: 46.5, marginLeft: 9.75, marginTop: 9, pitchX: 63.5, pitchY: 46.5, desc: 'Etiqueta maior — número grande' },
  { id: 'A4260', nome: 'Pimaco A4260 — 38,1×63,5 (21/folha)', pageW: 210, pageH: 297, cols: 3, rows: 7, labelW: 63.5, labelH: 38.1, marginLeft: 9.75, marginTop: 15.15, pitchX: 63.5, pitchY: 38.1, desc: 'Tamanho médio' },
  { id: 'A4355', nome: 'Pimaco A4355 — 31,0×63,5 (27/folha)', pageW: 210, pageH: 297, cols: 3, rows: 9, labelW: 63.5, labelH: 31.0, marginLeft: 9.75, marginTop: 9, pitchX: 63.5, pitchY: 31.0, desc: 'Compacta' },
  { id: 'A4356', nome: 'Pimaco A4356 — 25,4×63,5 (33/folha)', pageW: 210, pageH: 297, cols: 3, rows: 11, labelW: 63.5, labelH: 25.4, marginLeft: 9.75, marginTop: 8.8, pitchX: 63.5, pitchY: 25.4, desc: 'Pequena — máx. por folha' },
  { id: '6181', nome: 'Pimaco 6181 (Carta) — 25,4×101,6 (20/folha)', pageW: 215.9, pageH: 279.4, cols: 2, rows: 10, labelW: 101.6, labelH: 25.4, marginLeft: 6.35, marginTop: 12.7, pitchX: 101.6, pitchY: 25.4, desc: 'Folha Carta' },
  { id: 'generico', nome: 'Genérico A4 (3×8, com contorno)', pageW: 210, pageH: 297, cols: 3, rows: 8, labelW: 64.67, labelH: 35.13, marginLeft: 8, marginTop: 8, pitchX: 64.67, pitchY: 35.13, bordaGuia: true, desc: 'Folha A4 comum + linhas de corte' },
];

// Padrão da casa. É o ÚNICO lugar que decide o padrão: o ETQ_PADRAO do store e
// o fallback dos simuladores passam por aqui (antes cada um repetia o id na mão,
// e o LAYOUT_PADRAO ficava declarado sem ninguém usar).
export const LAYOUT_PADRAO = 'A4350';

export function layoutPorId(id: string | undefined): LayoutEtiqueta {
  return LAYOUTS_ETIQUETA.find(l => l.id === id)
    ?? LAYOUTS_ETIQUETA.find(l => l.id === LAYOUT_PADRAO)!;
}

// ── Itens (uma etiqueta cada) ─────────────────────────────────────────────────
export interface EtiquetaItem {
  cabecalho?: string; // ex: "Produtor — Fazenda" (negrito, no topo)
  titulo: string;   // ex: talhão (sigla, negrito)
  numero: string;   // destaque (nº da amostra)
  sub?: string;     // ex: "00-20 cm"
  rodape?: string;  // ex: "Safra 25/26 · 1a época"
}

// Cabeçalho da etiqueta: "Produtor — Fazenda", sem o que faltar. Vai em negrito
// no topo — quem recebe o saco no laboratório identifica de quem é sem abrir o
// sistema.
export function cabecalhoEtiqueta(produtor?: string, fazenda?: string): string | undefined {
  const p = (produtor ?? '').trim(), f = (fazenda ?? '').trim();
  return [p, f].filter(Boolean).join(' — ') || undefined;
}

// Profundidades de um ponto: usa os rótulos salvos; senão deriva da config da grade.
function profundidadesDoPonto(p: PontoAmostragem, grade: GradeAmostragem): string[] {
  if (p.profundidades && p.profundidades.length) return p.profundidades;
  return grade.profundidades.slice(0, p.profs).map(pr => pr.rotulo);
}

// Itens a partir de uma grade do Grid (ponto × profundidade).
export function itensDeGrade(talhaoNome: string, grade: GradeAmostragem, cabecalho?: string): EtiquetaItem[] {
  const out: EtiquetaItem[] = [];
  // Código da remessa junto do rodapé: é o que liga o saco de terra ao talhão
  // quando o laudo volta pela API. Vai aqui, e não numa faixa nova, para não
  // mexer no desenho da etiqueta (que é calibrado e tem teste).
  const rodape = [`Ano ${rotuloAno(grade.safra)} · ${grade.epoca}ª época`, grade.codigoRemessa]
    .filter(Boolean).join(' · ');
  for (const pt of grade.pontos) {
    const numero = String(pt.ordem + 1).padStart(3, '0');
    for (const prof of profundidadesDoPonto(pt, grade)) out.push({ cabecalho, titulo: talhaoNome, numero, sub: `${prof} cm`, rodape });
  }
  return out;
}

const MM_PT = 2.83465; // mm → pt
const H_REF = 46.5;    // altura da A4361 — referência da tipografia (ver `k` abaixo)

// Encolhe a fonte até o texto caber na largura útil. A etiqueta é de UMA linha:
// deixar o jsPDF quebrar sozinho (maxWidth) joga a 2ª linha PARA BAIXO, dentro da
// faixa seguinte — nome de talhão comprido colidia com o número.
function caber(doc: JsPDF, texto: string, larguraMax: number, fs: number, min = 4) {
  doc.setFontSize(fs);
  while (fs > min && doc.getTextWidth(texto) > larguraMax) { fs -= 0.5; doc.setFontSize(fs); }
}

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

    const mostraCabecalho = h >= 24 && !!it.cabecalho;
    const mostraTitulo = h >= 24 && !!it.titulo;
    const mostraRodape = h >= 30 && !!it.rodape;

    // Etiqueta maior = TUDO maior, na mesma proporção. O número já acompanhava a
    // altura, mas título/profundidade/rodapé estavam presos em 9/13/8 pt fixos —
    // numa A4350 (55,8 mm) isso virava um número de 66 pt ao lado de textos de 9.
    // `k` só CRESCE (Math.max(1, …)): as folhas menores que a A4361 continuam
    // saindo exatamente como sempre saíram.
    const k = Math.max(1, h / H_REF);
    const util = w - 2 * pad;

    // Cabeçalho (Produtor — Fazenda), em NEGRITO no topo. Quando existe, o
    // talhão desce um degrau para os dois caberem no cabeçalho da etiqueta.
    if (mostraCabecalho) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(40, 50, 70);
      caber(doc, it.cabecalho!, util, Math.min(8 * k, Math.max(5.5, h * 0.12 * MM_PT)));
      doc.text(it.cabecalho!, cx, y + h * 0.10, { align: 'center' });
    }

    // Título (sigla do talhão) — em NEGRITO, como pedido.
    if (mostraTitulo) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(40, 50, 70);
      caber(doc, it.titulo, util, Math.min(9 * k, Math.max(6, h * 0.15 * MM_PT)));
      doc.text(it.titulo, cx, y + (mostraCabecalho ? h * 0.20 : h * 0.17), { align: 'center' });
    }

    // Número (destaque) — encolhe para caber na largura
    doc.setFont('helvetica', 'bold');
    caber(doc, it.numero, w - 2.5 * pad, h * 0.42 * MM_PT, 6);
    doc.setTextColor(15, 25, 45);
    doc.text(it.numero, cx, y + (mostraTitulo ? (mostraCabecalho ? h * 0.60 : h * 0.57) : h * 0.5), { align: 'center' });

    // Profundidade
    if (it.sub) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 60, 110);
      caber(doc, it.sub, util, Math.min(13 * k, Math.max(7, h * 0.17 * MM_PT)));
      doc.text(it.sub, cx, y + (mostraRodape ? h * 0.78 : h * 0.84), { align: 'center' });
    }

    // Rodapé (safra/época)
    if (mostraRodape) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(140, 150, 165);
      caber(doc, it.rodape!, util, Math.min(8 * k, Math.max(5, h * 0.12 * MM_PT)));
      doc.text(it.rodape!, cx, y + h * 0.93, { align: 'center' });
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
