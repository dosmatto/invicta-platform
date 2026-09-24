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

// Blob → dataURL (FileReader): caminho de reserva quando o canvas não serve.
function blobParaDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(new Error('falha ao ler a imagem'));
    fr.readAsDataURL(blob);
  });
}

/**
 * Prepara um <img> (logo) para o `doc.addImage` do jsPDF: reduz para no máx.
 * `maxLarguraPx`, preservando o alfa (PNG) e o aspecto, e — o essencial —
 * devolve SEMPRE um elemento cujo `src` é um dataURL.
 *
 * POR QUÊ (24/09/2026, book de recomendações do produtor): quando o <img> tem um
 * `src` de URL comum (`/images/logo-branca.png`), o jsPDF ignora os pixels já
 * carregados e REFAZ O DOWNLOAD do arquivo com um XMLHttpRequest SÍNCRONO
 * (`loadFile(src, true)`). Onde esse pedido síncrono falha, a função dele
 * devolve `undefined` e o passo seguinte faz `.data` em cima disso — é o
 * "undefined is not an object (evaluating 't.data')" que derrubou o book no
 * portal. Com o `src` em dataURL o jsPDF decodifica o base64 direto, sem rede.
 * Por isso aqui NÃO existe mais o atalho "já é pequeno → devolve o original":
 * o original é justamente o que faz o jsPDF ir à rede.
 *
 * Ordem de tentativas: dataURL já pronto → canvas (reduz/re-encoda PNG) → fetch
 * do próprio arquivo lido como dataURL (quando o canvas fica "tainted" por
 * CORS) → em último caso o elemento original, como antes.
 */
export async function reduzirLogo(el: HTMLImageElement, maxLarguraPx = 480): Promise<HTMLImageElement> {
  const src = el.src ?? '';
  if (/^data:/i.test(src)) return el;   // já está no formato que o jsPDF lê sem rede
  try {
    const w = el.naturalWidth, h = el.naturalHeight;
    if (w && h) {
      const outW = Math.min(w, maxLarguraPx), outH = Math.max(1, Math.round(h * (outW / w)));
      const cv = document.createElement('canvas'); cv.width = outW; cv.height = outH;
      const ctx = cv.getContext('2d')!;
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(el, 0, 0, outW, outH);
      const url = cv.toDataURL('image/png'); // preserva transparência (logo branca etc.)
      return await carregar(url);
    }
  } catch { /* canvas "tainted" (CORS) ou sem dimensões → tenta pelo arquivo */ }
  try {
    if (src) {
      const r = await fetch(src);
      if (r.ok) return await carregar(await blobParaDataUrl(await r.blob()));
    }
  } catch { /* sem rede/CORS: cai no original */ }
  return el;
}
