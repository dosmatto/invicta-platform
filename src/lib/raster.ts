// Colorização local de raster a partir do grid numérico (Float32) + legenda.
// Separa a interpolação (cara) da renderização (visual): trocar legenda/estilo
// regenera o PNG instantaneamente no browser, sem ir ao backend.

import { decodeGrid, type RespInterp } from './fertilidade';
import { rampaVisualStops, valorParaPosicaoVisual, hexToRgb, type Legenda } from './legendas';
import type { EstiloRecomendacao } from './biblioteca';

export interface PngColorido {
  dataUrl: string;
  largura: number;
  altura: number;
}

// Gera um PNG (dataURL) colorindo o grid pela MESMA rampa visual da barra:
// cada valor → posição visual da sua classe → cor. Resolve o colapso das
// classes das pontas e garante que o mapa bata com a legenda exibida.
export function colorirGridComLegenda(
  grid: { b64: string; shape: [number, number] },
  leg: Legenda,
): PngColorido {
  const { valores, rows, cols } = decodeGrid(grid);
  const stops = rampaVisualStops(leg);
  const sp = stops.map(s => s[0]);
  const sr = stops.map(s => s[1][0]);
  const sg = stops.map(s => s[1][1]);
  const sb = stops.map(s => s[1][2]);

  const { canvas, ctx } = novoCanvas(cols, rows);
  const img = ctx.createImageData(cols, rows);
  const buf = img.data;
  for (let i = 0; i < valores.length; i++) {
    const v = valores[i];
    const p4 = i * 4;
    if (!isFinite(v)) { buf[p4 + 3] = 0; continue; }
    const pVis = valorParaPosicaoVisual(v, leg);
    const [r, g, b] = interpolarCor(pVis, sp, sr, sg, sb);
    buf[p4] = r; buf[p4 + 1] = g; buf[p4 + 2] = b; buf[p4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return finalizarCanvas(canvas, cols, rows);
}

export function colorirGrid(
  grid: { b64: string; shape: [number, number] },
  dominio: [number, number],
  stops: Array<[number, [number, number, number]]>,
): PngColorido {
  const { valores, rows, cols } = decodeGrid(grid);
  const [vmin, vmax] = dominio;
  const span = (vmax - vmin) || 1;

  // arrays paralelos para interp linear de cada canal
  const sp = stops.map(s => s[0]);
  const sr = stops.map(s => s[1][0]);
  const sg = stops.map(s => s[1][1]);
  const sb = stops.map(s => s[1][2]);

  const { canvas, ctx } = novoCanvas(cols, rows);
  const img = ctx.createImageData(cols, rows);
  const buf = img.data;

  for (let i = 0; i < valores.length; i++) {
    const v = valores[i];
    const p4 = i * 4;
    if (!isFinite(v)) { buf[p4 + 3] = 0; continue; }
    const t = Math.max(0, Math.min(1, (v - vmin) / span));
    const [r, g, b] = interpolarCor(t, sp, sr, sg, sb);
    buf[p4]     = r;
    buf[p4 + 1] = g;
    buf[p4 + 2] = b;
    buf[p4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return finalizarCanvas(canvas, cols, rows);
}

// Colorização de DOSE (Fase R3) por classes DISCRETAS do estilo da equação:
// cada pixel recebe a cor da 1ª classe cujo limite superior ≥ valor (a última
// classe pega o que passar do maior limite). Fora do polígono (NaN) e, se
// `zeroTransparente`, dose ≤ valorMínimo ficam transparentes.
export function colorirDose(
  grid: { b64: string; shape: [number, number] },
  estilo: EstiloRecomendacao,
): PngColorido {
  const { valores, rows, cols } = decodeGrid(grid);
  const classes = [...estilo.classes].filter(c => Number.isFinite(c.limiteSuperior)).sort((a, b) => a.limiteSuperior - b.limiteSuperior);
  const cores = classes.map(c => hexToRgb(c.cor));
  const lims = classes.map(c => c.limiteSuperior);
  const ult = cores.length - 1;

  const { canvas, ctx } = novoCanvas(cols, rows);
  const img = ctx.createImageData(cols, rows);
  const buf = img.data;
  for (let i = 0; i < valores.length; i++) {
    const v = valores[i];
    const p4 = i * 4;
    if (!isFinite(v) || cores.length === 0) { buf[p4 + 3] = 0; continue; }
    if (estilo.zeroTransparente && v <= estilo.valorMinimo) { buf[p4 + 3] = 0; continue; }
    let k = lims.findIndex(L => v <= L);
    if (k < 0) k = ult;
    const [r, g, b] = cores[k];
    buf[p4] = r; buf[p4 + 1] = g; buf[p4 + 2] = b; buf[p4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return finalizarCanvas(canvas, cols, rows);
}

// ── Helpers de canvas (compartilhados pelas duas colorizações) ────────────
type Canvas2D = OffscreenCanvas | HTMLCanvasElement;

function novoCanvas(cols: number, rows: number): { canvas: Canvas2D; ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D } {
  const canvas: Canvas2D = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(cols, rows)
    : document.createElement('canvas');
  if (!(canvas instanceof OffscreenCanvas)) { canvas.width = cols; canvas.height = rows; }
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!ctx) throw new Error('Canvas 2D indisponível');
  return { canvas, ctx };
}

function finalizarCanvas(canvas: Canvas2D, cols: number, rows: number): PngColorido {
  if (canvas instanceof OffscreenCanvas) {
    // OffscreenCanvas → não dá toDataURL direto; volta para HTMLCanvas
    const tmp = document.createElement('canvas');
    tmp.width = cols; tmp.height = rows;
    const tctx = tmp.getContext('2d')!;
    tctx.drawImage(canvas as unknown as CanvasImageSource, 0, 0);
    return { dataUrl: tmp.toDataURL('image/png'), largura: cols, altura: rows };
  }
  return { dataUrl: canvas.toDataURL('image/png'), largura: cols, altura: rows };
}

// interp linear por canal (mesma semântica do np.interp).
function interpolarCor(
  t: number,
  sp: number[], sr: number[], sg: number[], sb: number[],
): [number, number, number] {
  const n = sp.length;
  if (t <= sp[0])   return [sr[0],   sg[0],   sb[0]];
  if (t >= sp[n - 1]) return [sr[n - 1], sg[n - 1], sb[n - 1]];
  // busca binária seria overkill; lista costuma ter ~10 stops
  let i = 0;
  while (i < n - 1 && sp[i + 1] < t) i++;
  const t0 = sp[i], t1 = sp[i + 1];
  const k = (t - t0) / (t1 - t0 || 1);
  return [
    Math.round(sr[i] + (sr[i + 1] - sr[i]) * k),
    Math.round(sg[i] + (sg[i + 1] - sg[i]) * k),
    Math.round(sb[i] + (sb[i + 1] - sb[i]) * k),
  ];
}

// Helper: confere se a resposta da interpolação tem grid utilizável.
export function temGrid(resp: RespInterp | null | undefined): resp is RespInterp & { grid: { b64: string; shape: [number, number] } } {
  return !!resp && !!resp.grid && !!resp.grid.b64 && !!resp.grid.shape;
}
