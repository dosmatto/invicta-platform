// Colorização local de raster a partir do grid numérico (Float32) + legenda.
// Separa a interpolação (cara) da renderização (visual): trocar legenda/estilo
// regenera o PNG instantaneamente no browser, sem ir ao backend.

import { decodeGrid, type RespInterp } from './fertilidade';
import { rampaVisualStops, valorParaPosicaoVisual, hexToRgb, type Legenda } from './legendas';
import type { EstiloRecomendacao } from './biblioteca';
import { classesVisiveis, indiceClasse } from './recomendacao/faixas';

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

  // Posição (0..1) de cada valor na rampa. Fixa = pelos limites das classes;
  // RELATIVA = pela distribuição do próprio mapa (mín–máx ou quantil/quartil).
  const posDe = posicionadorRelativo(valores, leg);

  const { canvas, ctx } = novoCanvas(cols, rows);
  const img = ctx.createImageData(cols, rows);
  const buf = img.data;
  for (let i = 0; i < valores.length; i++) {
    const v = valores[i];
    const p4 = i * 4;
    if (!isFinite(v)) { buf[p4 + 3] = 0; continue; }
    const pVis = posDe(v);
    const [r, g, b] = interpolarCor(pVis, sp, sr, sg, sb);
    buf[p4] = r; buf[p4 + 1] = g; buf[p4 + 2] = b; buf[p4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return finalizarCanvas(canvas, cols, rows);
}

// Devolve a função valor→posição (0..1) conforme a escala da legenda.
// 'minmax'  → estica linearmente entre o mín e o máx dos dados;
// 'quantil' → posição = percentil do valor (cada cor cobre fração igual da área);
// (default) → posição fixa pelos limites das classes (valorParaPosicaoVisual).
function posicionadorRelativo(valores: Float32Array | number[], leg: Legenda): (v: number) => number {
  const modo = leg.escalaRelativa;
  if (!modo) return (v: number) => valorParaPosicaoVisual(v, leg);

  // A inversão (invertida) já está embutida nas CORES das classes (a rampa reflete),
  // então a posição não é invertida de novo aqui.
  if (modo === 'minmax') {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < valores.length; i++) { const v = valores[i]; if (isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; } }
    const span = (mx - mn) || 1;
    return (v: number) => Math.max(0, Math.min(1, (v - mn) / span));
  }

  // quantil: ordena os finitos e usa o rank (busca binária) como percentil.
  const ord: number[] = [];
  for (let i = 0; i < valores.length; i++) { const v = valores[i]; if (isFinite(v)) ord.push(v); }
  ord.sort((a, b) => a - b);
  const n = ord.length;
  return (v: number) => {
    if (n <= 1) return 0;
    let lo = 0, hi = n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (ord[m] < v) lo = m + 1; else hi = m; }
    return lo / (n - 1);
  };
}

// Colorização por FAIXAS DE QUANTIL: cada pixel recebe a cor CHAPADA da sua
// faixa (sem gradiente interno). Os cortes vêm de lib/quantis.ts, calculados a
// partir dos próprios dados do mapa.
//
// Por que não reusar colorirGridComLegenda com escalaRelativa:'quantil': lá o
// percentil vira posição CONTÍNUA na rampa, então (a) sai gradiente dentro de
// cada faixa e (b) as fronteiras de cor caem nas larguras visuais da legenda
// (22,5/22,5/22,5/22,5/10), não em 20/40/60/80 — os 20% mais produtivos ficam
// espremidos nos últimos 10% da rampa e o mapa nunca casa com uma legenda de
// faixas iguais. O molde certo é o colorirDose(), logo abaixo: classes
// discretas por limite superior.
export function colorirGridPorQuantis(
  grid: { b64: string; shape: [number, number] },
  breaks: number[],
  cores: string[],
): PngColorido {
  const { valores, rows, cols } = decodeGrid(grid);
  const rgb = cores.map(hexToRgb);
  const ultima = rgb.length - 1;

  const { canvas, ctx } = novoCanvas(cols, rows);
  const img = ctx.createImageData(cols, rows);
  const buf = img.data;
  for (let i = 0; i < valores.length; i++) {
    const v = valores[i];
    const p4 = i * 4;
    if (!isFinite(v)) { buf[p4 + 3] = 0; continue; }
    // (min, max] — mesma convenção de indiceFaixa/classeDoValor: o valor exato
    // do corte pertence à faixa de baixo.
    let c = 0;
    while (c < breaks.length && v > breaks[c]) c++;
    const [r, g, b] = rgb[Math.min(c, ultima)] ?? [136, 136, 136];
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
  doseMinima = 0,
): PngColorido {
  const { valores, rows, cols } = decodeGrid(grid);
  // MESMA lista de classes da tabela "Plano de aplicação" (classesVisiveis):
  // as faixas abaixo da dose mínima não ocorrem. Sem isto, um pixel no piso
  // (v === doseMinima) caía na faixa anterior e o mapa mostrava uma cor que não
  // estava na legenda (ex.: roxo "50–1.000" com mínima 1.000).
  const classes = classesVisiveis(estilo.classes, doseMinima);
  const cores = classes.map(c => hexToRgb(c.cor));
  const lims = classes.map(c => c.limiteSuperior);
  const limiar = Math.max(0, doseMinima);   // abaixo da dose mínima da equação = não aplica

  const { canvas, ctx } = novoCanvas(cols, rows);
  const img = ctx.createImageData(cols, rows);
  const buf = img.data;
  for (let i = 0; i < valores.length; i++) {
    const v = valores[i];
    const p4 = i * 4;
    if (!isFinite(v) || cores.length === 0) { buf[p4 + 3] = 0; continue; }
    // ZERO / abaixo da dose mínima = TRANSPARENTE (a faixa colorida começa na mínima).
    if (v <= 0 || v < limiar || (estilo.zeroTransparente && v <= estilo.valorMinimo)) { buf[p4 + 3] = 0; continue; }
    const [r, g, b] = cores[indiceClasse(v, lims)];
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
  // `comp` = ainda comprimido (a descompressão da hidratação falhou). Não é grid
  // utilizável: decodificar renderia lixo silencioso. Quem chama cai no PNG.
  return !!resp && !!resp.grid && !!resp.grid.b64 && !!resp.grid.shape && !resp.grid.comp;
}

// Recorta um PNG já colorido pelo contorno do talhão, devolvendo outro dataURL.
//
// A malha do raster de 20 m da Recomendação COBRE 100% do polígono — e por isso
// transborda um pouco na divisa (a célula da borda entra inteira, com o valor que
// a krigagem calculou para aquele nó). No PDF o corte já era feito na hora de
// desenhar (capturaMapa faz ctx.clip no contorno), mas o mapa da TELA só desenha a
// imagem sobre os bounds e conta com o NaN transparente — sem este recorte, o
// excesso apareceria cruzando a divisa. Aqui o corte é aplicado no pixel, uma vez,
// antes de a imagem virar overlay.
//
// `bounds` é [oeste, sul, leste, norte] — o mesmo retângulo sobre o qual a imagem
// é esticada no mapa, então a conversão lon/lat → pixel é linear.
export async function recortarNoPoligono(
  png: PngColorido,
  bounds: [number, number, number, number],
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): Promise<PngColorido> {
  if (typeof document === 'undefined') return png;
  const [w, s, e, n] = bounds;
  if (!(e > w) || !(n > s)) return png;
  const cv = document.createElement('canvas');
  cv.width = png.largura; cv.height = png.altura;
  const ctx = cv.getContext('2d');
  if (!ctx) return png;

  // Decodificar é assíncrono mesmo vindo de dataURL. Falhando, devolve o PNG
  // inteiro — o pior caso é o mapa transbordar a divisa, que era como já era.
  let img: HTMLImageElement;
  try {
    img = await new Promise<HTMLImageElement>((ok, falha) => {
      const el = new Image();
      el.onload = () => ok(el);
      el.onerror = () => falha(new Error('png não decodificou'));
      el.src = png.dataUrl;
    });
  } catch { return png; }

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  const px = (lon: number) => ((lon - w) / (e - w)) * cv.width;
  const py = (lat: number) => ((n - lat) / (n - s)) * cv.height;
  const aneis: GeoJSON.Position[][] = poligono.type === 'Polygon'
    ? poligono.coordinates : poligono.coordinates.flat();
  ctx.beginPath();
  for (const anel of aneis) {
    anel.forEach((pt, i) => { const x = px(pt[0]), y = py(pt[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath();
  }
  // destination-in: mantém só o que está sob o path (o resto vira transparente).
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fill('evenodd');   // evenodd honra os buracos do talhão
  ctx.globalCompositeOperation = 'source-over';
  return { dataUrl: cv.toDataURL('image/png'), largura: png.largura, altura: png.altura };
}
