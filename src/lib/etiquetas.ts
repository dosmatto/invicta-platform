'use client';

// Geração de etiquetas em PDF (uma por amostra = ponto × profundidade),
// cada etiqueta com QR Code + texto legível. QR codifica "Talhão - Ponto - Profundidade".

import type { GradeAmostragem, PontoAmostragem } from './store';

// Profundidades de um ponto: usa os rótulos salvos; senão deriva da config da grade.
function profundidadesDoPonto(p: PontoAmostragem, grade: GradeAmostragem): string[] {
  if (p.profundidades && p.profundidades.length) return p.profundidades;
  return grade.profundidades.slice(0, p.profs).map(pr => pr.rotulo);
}

interface Amostra { num: string; prof: string; id: string }

function montarAmostras(talhaoNome: string, grade: GradeAmostragem): Amostra[] {
  const out: Amostra[] = [];
  for (const pt of grade.pontos) {
    const num = String(pt.ordem + 1).padStart(3, '0');
    for (const prof of profundidadesDoPonto(pt, grade)) {
      out.push({ num, prof, id: `${talhaoNome} - ${num} - ${prof}` });
    }
  }
  return out;
}

export function contarAmostras(talhaoNome: string, grade: GradeAmostragem): number {
  return montarAmostras(talhaoNome, grade).length;
}

export async function gerarEtiquetasPDF(talhaoNome: string, grade: GradeAmostragem) {
  const { jsPDF } = await import('jspdf');

  const amostras = montarAmostras(talhaoNome, grade);
  if (amostras.length === 0) return;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210, pageH = 297, margin = 8;
  const cols = 3, rows = 8;
  const cellW = (pageW - 2 * margin) / cols; // ~64.6mm
  const cellH = (pageH - 2 * margin) / rows; // ~35mm
  const perPage = cols * rows;

  for (let i = 0; i < amostras.length; i++) {
    const a = amostras[i];
    const idx = i % perPage;
    if (i > 0 && idx === 0) doc.addPage();
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = margin + col * cellW;
    const y = margin + row * cellH;
    const cx = x + cellW / 2;

    // Talhão (topo, pequeno)
    doc.setTextColor(110, 120, 140);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(talhaoNome, cx, y + 6, { align: 'center' });

    // NÚMERO da amostra (grande, destaque)
    doc.setTextColor(15, 25, 45);
    doc.setFontSize(30); doc.setFont('helvetica', 'bold');
    doc.text(a.num, cx, y + 19, { align: 'center' });

    // Profundidade (destaque secundário)
    doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 60, 110);
    doc.text(`${a.prof} cm`, cx, y + 27, { align: 'center' });

    // Safra / época (rodapé, pequeno)
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.setTextColor(140, 150, 165);
    doc.text(`Safra ${grade.safra} · ${grade.epoca}a época`, cx, y + 32, { align: 'center' });

    // Borda da etiqueta
    doc.setDrawColor(210);
    doc.rect(x, y, cellW, cellH);
  }

  const nome = `${talhaoNome}_${grade.nome}_etiquetas`.replace(/[^\w.\-]+/g, '_');
  doc.save(`${nome}.pdf`);
}
