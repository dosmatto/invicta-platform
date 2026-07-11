'use client';

// Helper compartilhado para reduzir o peso das imagens nos PDFs (jsPDF).
// Mapas raster/satélite (compostos, fundo já opaco) → JPEG 0.88 no tamanho REAL
// impresso (px = mm/25,4 × dpi); nunca faz upscale (só reduz). Logos/legendas
// com transparência ou linhas finas → PNG (forcarPng), passando aqui só p/ o
// downscale. Canvas offscreen com imageSmoothingQuality 'high'.

export interface ImagemPdf {
  data: string;                 // dataURL pronto p/ doc.addImage
  formato: 'JPEG' | 'PNG';      // 2º argumento do addImage
}

function carregar(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('falha ao carregar imagem'));
    img.src = src;
  });
}

// Fonte → elemento desenhável + dimensões naturais (px).
async function medir(fonte: HTMLCanvasElement | HTMLImageElement | string): Promise<{ el: CanvasImageSource; w: number; h: number }> {
  if (typeof fonte === 'string') { const img = await carregar(fonte); return { el: img, w: img.naturalWidth, h: img.naturalHeight }; }
  if (fonte instanceof HTMLCanvasElement) return { el: fonte, w: fonte.width, h: fonte.height };
  return { el: fonte, w: fonte.naturalWidth, h: fonte.naturalHeight };
}

/**
 * Redimensiona a imagem para o tamanho realmente necessário no PDF e a exporta
 * comprimida. Por padrão gera JPEG 0.88 compondo sobre `fundo` (remove o alfa —
 * seguro em PDFs de fundo branco); com `forcarPng`, mantém PNG (para legendas /
 * linhas finas onde o JPEG borra). NUNCA faz upscale: se a fonte já é menor que
 * o alvo, mantém a resolução da fonte.
 */
export async function imagemParaPdf(
  fonte: HTMLCanvasElement | HTMLImageElement | string,
  mmLargura: number,
  opts: { dpi?: number; fundo?: string; forcarPng?: boolean } = {},
): Promise<ImagemPdf> {
  const { dpi = 200, fundo = '#ffffff', forcarPng = false } = opts;
  const { el, w, h } = await medir(fonte);
  if (!w || !h) throw new Error('imagem sem dimensões');

  const alvoLarg = Math.max(1, Math.min(w, Math.round((mmLargura / 25.4) * dpi))); // só reduz
  const outW = alvoLarg;
  const outH = Math.max(1, Math.round(h * (alvoLarg / w)));

  const cv = document.createElement('canvas'); cv.width = outW; cv.height = outH;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  if (!forcarPng) { ctx.fillStyle = fundo; ctx.fillRect(0, 0, outW, outH); } // compõe alfa sobre fundo p/ JPEG
  ctx.drawImage(el, 0, 0, outW, outH);

  if (forcarPng) return { data: cv.toDataURL('image/png'), formato: 'PNG' };
  return { data: cv.toDataURL('image/jpeg', 0.88), formato: 'JPEG' };
}

/**
 * Reduz um <img> (logo) para no máx. `maxLarguraPx`, preservando o alfa (PNG) e
 * o aspecto. Devolve um novo HTMLImageElement (mesmas APIs naturalWidth/Height,
 * para o cálculo de aspecto continuar valendo). Em qualquer falha (ex.: canvas
 * "tainted" por CORS), devolve o elemento original — nunca quebra o relatório.
 */
export async function reduzirLogo(el: HTMLImageElement, maxLarguraPx = 480): Promise<HTMLImageElement> {
  try {
    const w = el.naturalWidth, h = el.naturalHeight;
    if (!w || !h || w <= maxLarguraPx) return el; // já pequeno → mantém
    const outW = maxLarguraPx, outH = Math.max(1, Math.round(h * (maxLarguraPx / w)));
    const cv = document.createElement('canvas'); cv.width = outW; cv.height = outH;
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(el, 0, 0, outW, outH);
    const url = cv.toDataURL('image/png'); // preserva transparência (logo branca etc.)
    const out = await carregar(url);
    return out;
  } catch { return el; }
}
