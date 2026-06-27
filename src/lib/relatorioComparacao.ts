'use client';

// Relatório PDF — Comparação de duas camadas lado a lado (ex.: Produtividade ×
// NDVI). Reusa `capturarMapaFertilidade` (satélite + raster + contorno) p/ cada
// mapa e os põe lado a lado num A4 paisagem, com legenda e dados de cada um.

import type { Legenda } from './legendas';
import { rampaVisualStops } from './legendas';
import { capturarMapaFertilidade } from './capturaMapa';

type RGB = [number, number, number];
type Stop = [number, RGB];

export interface LadoComparacao {
  titulo: string;        // "Produtividade — Soja"
  subtitulo: string;     // "Média 4.200 kg/ha · 27,5 ha"
  rasterPng: string;     // grid já colorido (dataURL)
  bounds: [number, number, number, number];
  legenda: Legenda;
  rotulos: { pos: number; txt: string }[];   // marcas da barra (pos 0..1)
}

export interface DadosComparacao {
  cliente: string; fazenda: string; talhao: string; safra: string; areaHa: number;
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  esquerda: LadoComparacao;
  direita: LadoComparacao;
  correlacao: number | null;
  satelite: boolean;
}

function corEm(stops: Stop[], t: number): RGB {
  if (t <= stops[0][0]) return stops[0][1];
  if (t >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];
  let i = 0; while (i < stops.length - 1 && stops[i + 1][0] < t) i++;
  const [t0, c0] = stops[i], [t1, c1] = stops[i + 1];
  const k = (t - t0) / (t1 - t0 || 1);
  return [Math.round(c0[0] + (c1[0] - c0[0]) * k), Math.round(c0[1] + (c1[1] - c0[1]) * k), Math.round(c0[2] + (c1[2] - c0[2]) * k)];
}

// jsPDF tipado de forma frouxa (evita dependência de tipos no build).
type Doc = {
  setFont: (f: string, s?: string) => void; setFontSize: (n: number) => void;
  setTextColor: (...a: number[]) => void; setDrawColor: (...a: number[]) => void; setFillColor: (...a: number[]) => void;
  text: (t: string, x: number, y: number, o?: { align?: string }) => void;
  rect: (x: number, y: number, w: number, h: number, style?: string) => void;
  addImage: (d: string, f: string, x: number, y: number, w: number, h: number) => void;
  save: (n: string) => void;
};

function desenharBarra(doc: Doc, leg: Legenda, x: number, y: number, w: number, h: number, rotulos: { pos: number; txt: string }[]) {
  const stops = rampaVisualStops(leg) as Stop[];
  const N = 60;
  for (let k = 0; k < N; k++) {
    const [r, g, b] = corEm(stops, k / (N - 1));
    doc.setFillColor(r, g, b); doc.rect(x + (k / N) * w, y, w / N + 0.3, h, 'F');
  }
  doc.setDrawColor(120); doc.rect(x, y, w, h);
  doc.setFontSize(6.5); doc.setTextColor(90);
  for (const rt of rotulos) doc.text(rt.txt, x + rt.pos * w, y + h + 3, { align: 'center' });
  doc.setTextColor(0);
}

export async function gerarRelatorioComparacao(d: DadosComparacao): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }) as unknown as Doc;
  const W = 297, M = 12, gap = 10;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text('Comparação: Produtividade × NDVI', M, 15);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(70);
  doc.text(`${d.cliente}  ·  ${d.fazenda}  ·  Talhão ${d.talhao}  ·  Safra ${d.safra}  ·  ${d.areaHa.toLocaleString('pt-BR')} ha`, M, 21);
  doc.setTextColor(0);

  const colW = (W - 2 * M - gap) / 2;
  const mapTop = 30, mapH = 125;

  for (const [i, lado] of [d.esquerda, d.direita].entries()) {
    const x0 = M + i * (colW + gap);
    const png = await capturarMapaFertilidade({
      rasterPng: lado.rasterPng, bounds: lado.bounds, poligono: d.poligono,
      valores: { type: 'FeatureCollection', features: [] }, satelite: d.satelite,
      corLimite: '#ffffff', larguraPx: Math.round(colW * 9), alturaPx: Math.round(mapH * 9),
    });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text(lado.titulo, x0, mapTop - 2);
    doc.addImage(png, 'PNG', x0, mapTop, colW, mapH);
    doc.setDrawColor(180); doc.rect(x0, mapTop, colW, mapH);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    doc.text(lado.subtitulo, x0, mapTop + mapH + 6);
    desenharBarra(doc, lado.legenda, x0, mapTop + mapH + 9, colW, 4, lado.rotulos);
  }

  if (d.correlacao != null) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(60);
    doc.text(`Correlação espacial (Pearson) Produtividade × NDVI:  r = ${d.correlacao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, M, mapTop + mapH + 22);
    doc.setTextColor(0);
  }

  doc.save(`Comparacao_Prod_NDVI_${d.talhao}_${d.safra}.pdf`.replace(/[^\w.-]/g, '_'));
}
