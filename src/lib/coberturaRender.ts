'use client';

// Desenho da PRÉVIA de cobertura: os pontos da colheita sobre o limite do
// talhão, com a área sem dado destacada.
//
// Por que não serve a prévia antiga ("Ver pontos brutos"): ela é enquadrada
// pelos BOUNDS DOS PONTOS. Num talhão colhido pela metade, a imagem sai cheia
// — porque o enquadramento encolhe junto com os dados — e some justamente o que
// interessa ver, que é o vazio. Aqui o enquadramento é o do TALHÃO, então a
// falta aparece como falta.

import { type Cobertura } from './cobertura';

export interface PontoValor { lng: number; lat: number; valor: number }

export interface PreviaCobertura {
  dataUrl: string;
  bounds: [number, number, number, number];
}

const LARGURA_MAX = 1100;

/**
 * PNG transparente com: a área sem dado hachurada em vermelho e os pontos por
 * cima, coloridos pelos quintis dos próprios valores (a mesma leitura relativa
 * da prévia antiga).
 */
export function rasterizarCobertura(
  pontos: ArrayLike<PontoValor>,
  cob: Cobertura,
  cores: string[],
): PreviaCobertura | null {
  if (typeof document === 'undefined') return null;
  const [w, s, e, n] = cob.bounds;
  const spanX = (e - w) || 1e-6, spanY = (n - s) || 1e-6;
  const W = Math.min(LARGURA_MAX, Math.max(320, cob.cols * 4));
  const H = Math.max(2, Math.round((W * spanY) / spanX));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;

  // 1) Área DENTRO do talhão e SEM dado — o buraco que a interpolação taparia.
  const cw = W / cob.cols, ch = H / cob.rows;
  ctx.fillStyle = 'rgba(220, 38, 38, 0.42)';
  for (let r = 0; r < cob.rows; r++) {
    for (let c = 0; c < cob.cols; c++) {
      if (cob.mascara[r * cob.cols + c] !== 0) continue;
      // +1 px cobre o serrilhado entre células vizinhas
      ctx.fillRect(c * cw, r * ch, cw + 1, ch + 1);
    }
  }

  // 2) Pontos por cima, em quintis do próprio conjunto.
  const vals: number[] = [];
  for (let i = 0; i < pontos.length; i++) { const v = pontos[i].valor; if (Number.isFinite(v)) vals.push(v); }
  vals.sort((a, b) => a - b);
  const k = Math.max(1, cores.length);
  const breaks: number[] = [];
  for (let i = 1; i < k && vals.length; i++) breaks.push(vals[Math.min(vals.length - 1, Math.floor((i / k) * vals.length))]);
  const classeDe = (v: number) => { let c = 0; while (c < breaks.length && v > breaks[c]) c++; return c; };

  // Raio: fino o bastante para a passada aparecer como linha, não como borrão.
  const raio = Math.max(0.6, Math.min(2.2, W / 700));
  for (let i = 0; i < pontos.length; i++) {
    const p = pontos[i];
    if (!Number.isFinite(p.lng) || !Number.isFinite(p.lat)) continue;
    const x = ((p.lng - w) / spanX) * W;
    const y = (1 - (p.lat - s) / spanY) * H;
    ctx.fillStyle = cores[Math.min(classeDe(p.valor), k - 1)] ?? '#888888';
    ctx.beginPath(); ctx.arc(x, y, raio, 0, 6.2832); ctx.fill();
  }

  return { dataUrl: cv.toDataURL('image/png'), bounds: cob.bounds };
}
