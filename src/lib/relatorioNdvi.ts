// Relatório RÁPIDO de mapas de satélite (aba NDVI do talhão) — 1 mapa por
// página, para envio ao produtor. Reaproveita a infraestrutura dos relatórios:
// captura com fundo de satélite + contorno (capturaMapa), logos reduzidos e
// imagens comprimidas no tamanho de impressão (pdfImagem).
import { jsPDF as JsPDF } from 'jspdf';
import { capturarMapaFertilidade } from './capturaMapa';
import { imagemParaPdf, reduzirLogo } from './pdfImagem';
import { rampaVisualStops, type Legenda } from './legendas';

export interface MapaRelNdvi {
  titulo: string;                                      // "NDVI · Sentinel-2 · 12/07/2026"
  png: string;                                         // raster colorido OU imagem RGB (dataUrl)
  bounds: [number, number, number, number];
  legenda?: Legenda | null;                            // barra de cores (índices); ausente = RGB
  dominio?: [number, number];                          // rótulos min/max da barra
  satelite?: boolean;                                  // fundo de satélite sob o raster
}

export interface DadosRelatorioNdvi {
  produtor: string; fazenda: string; talhao: string; safra: string; areaHa: number;
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  logoClienteUrl?: string | null;
  mapas: MapaRelNdvi[];
}

const NAVY: [number, number, number] = [13, 33, 64];
const GRAY: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [210, 219, 232];
const fmtHa = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmt2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function carregarImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

// Barra de cores da legenda (gradiente contínuo) como PNG.
function barraLegenda(leg: Legenda, wPx = 600, hPx = 26): string {
  const canvas = document.createElement('canvas');
  canvas.width = wPx; canvas.height = hPx;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, wPx, 0);
  for (const [p, [r, g, b]] of rampaVisualStops({ ...leg, estilo: 'continuo' })) {
    grad.addColorStop(Math.max(0, Math.min(1, p)), `rgb(${r},${g},${b})`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, wPx, hPx);
  return canvas.toDataURL('image/png');
}

export async function gerarRelatorioNdvi(d: DadosRelatorioNdvi): Promise<void> {
  const doc = new JsPDF({ unit: 'mm', format: 'a4', compress: true });
  const W = 210, M = 14, cw = W - 2 * M;

  const logoInv = await carregarImg('/images/logo-colorida.png').then(reduzirLogo).catch(() => null);
  const logoCli = d.logoClienteUrl
    ? await carregarImg(d.logoClienteUrl).then(reduzirLogo).catch(() => null) : null;

  for (let i = 0; i < d.mapas.length; i++) {
    const m = d.mapas[i];
    if (i > 0) doc.addPage();

    // Cabeçalho: logos + identificação
    let y = 12;
    if (logoInv) {
      const h = 11, w = (logoInv.width / logoInv.height) * h;
      const img = await imagemParaPdf(logoInv, w, { forcarPng: true });
      doc.addImage(img.data, img.formato, M, y, w, h);
    }
    if (logoCli) {
      const h = 11, w = Math.min(40, (logoCli.width / logoCli.height) * h);
      const img = await imagemParaPdf(logoCli, w, { forcarPng: true });
      doc.addImage(img.data, img.formato, W - M - w, y, w, h);
    }
    y += 16;
    doc.setTextColor(...NAVY).setFont('helvetica', 'bold').setFontSize(13);
    doc.text('MAPAS DE SATÉLITE', M, y);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...GRAY);
    doc.text(`${d.produtor}  ·  ${d.fazenda}  ·  Talhão ${d.talhao}  ·  Safra ${d.safra}  ·  ${fmtHa(d.areaHa)} ha`, M, y + 5);
    doc.setDrawColor(...LINE).setLineWidth(0.4).line(M, y + 8, W - M, y + 8);
    y += 14;

    // Título do mapa
    doc.setTextColor(...NAVY).setFont('helvetica', 'bold').setFontSize(11);
    doc.text(m.titulo, M, y);
    y += 4;

    // Mapa (captura com contorno; satélite sob o raster quando índice).
    // 8 px/mm ≈ 200 dpi — mesmo padrão do relatório de fertilidade.
    const maxH = 205;
    const composto = await capturarMapaFertilidade({
      rasterPng: m.png, bounds: m.bounds, poligono: d.poligono,
      valores: { type: 'FeatureCollection', features: [] },
      satelite: m.satelite ?? false, corLimite: '#ffffff',
      larguraPx: Math.round(cw * 8), alturaPx: Math.round(maxH * 8),
    });
    const propria = await carregarImg(composto);
    let mw = cw, mh = (propria.height / propria.width) * mw;
    if (mh > maxH) { mh = maxH; mw = (propria.width / propria.height) * mh; }
    const mx = M + (cw - mw) / 2;
    const img = await imagemParaPdf(composto, mw);
    doc.addImage(img.data, img.formato, mx, y, mw, mh);
    doc.setDrawColor(...LINE).setLineWidth(0.3).rect(mx, y, mw, mh);
    y += mh + 6;

    // Barra de legenda (índices) com rótulos do domínio
    if (m.legenda) {
      const bw = Math.min(120, cw), bh = 5, bx = M + (cw - bw) / 2;
      const barra = await imagemParaPdf(barraLegenda(m.legenda), bw, { forcarPng: true });
      doc.addImage(barra.data, barra.formato, bx, y, bw, bh);
      doc.setDrawColor(...LINE).setLineWidth(0.3).rect(bx, y, bw, bh);
      const [lo, hi] = m.dominio ?? [0, 1];
      doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GRAY);
      doc.text(fmt2(lo), bx, y + bh + 3.5);
      doc.text(fmt2(hi), bx + bw, y + bh + 3.5, { align: 'right' });
      doc.setFontSize(8).setTextColor(...NAVY);
      doc.text(m.legenda.nome, W / 2, y + bh + 3.5, { align: 'center' });
    }

    // Rodapé
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GRAY);
    doc.text(`INVICTA · gerado em ${new Date().toLocaleString('pt-BR')}`, M, 290);
    doc.text(`${i + 1}/${d.mapas.length}`, W - M, 290, { align: 'right' });
  }

  const nome = `Satelite_${d.talhao.replace(/\s+/g, '')}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(nome);
}
