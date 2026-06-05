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
  const QRCode = (await import('qrcode')).default;
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

    // QR code
    const qrData = await QRCode.toDataURL(a.id, { margin: 0, width: 220 });
    const qrSize = cellH - 8;
    doc.addImage(qrData, 'PNG', x + 2, y + 4, qrSize, qrSize);

    // Texto
    const tx = x + qrSize + 5;
    doc.setTextColor(20, 30, 50);
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text(talhaoNome, tx, y + 9);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Ponto: ${a.num}`, tx, y + 16);
    doc.text(`Prof.: ${a.prof} cm`, tx, y + 21);
    doc.setFontSize(7); doc.setTextColor(110, 120, 140);
    doc.text(`Safra ${grade.safra} · ${grade.epoca}a época`, tx, y + 27);

    // Borda da etiqueta
    doc.setDrawColor(210);
    doc.rect(x, y, cellW, cellH);
  }

  const nome = `${talhaoNome}_${grade.nome}_etiquetas`.replace(/[^\w.\-]+/g, '_');
  doc.save(`${nome}.pdf`);
}
