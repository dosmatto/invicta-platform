// Colorização local de raster a partir do grid numérico (Float32) + legenda.
// Separa a interpolação (cara) da renderização (visual): trocar legenda/estilo
// regenera o PNG instantaneamente no browser, sem ir ao backend.

import { decodeGrid, type RespInterp } from './fertilidade';
import { stopsParaBackend, type Legenda } from './legendas';

export interface PngColorido {
  dataUrl: string;
  largura: number;
  altura: number;
}

// Gera um PNG (dataURL) colorindo o grid com a rampa derivada da legenda.
// Grid está orientado com norte no topo (linhas) — mesma orientação do bounds.
export function colorirGridComLegenda(
  grid: { b64: string; shape: [number, number] },
  leg: Legenda,
): PngColorido {
  const { dominio, stops } = stopsParaBackend(leg);
  return colorirGrid(grid, dominio, stops);
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

  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(cols, rows)
    : document.createElement('canvas');
  if (!(canvas instanceof OffscreenCanvas)) { canvas.width = cols; canvas.height = rows; }
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!ctx) throw new Error('Canvas 2D indisponível');

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
