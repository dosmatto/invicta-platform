// Correlação espacial entre dois rasters co-registrados.
//
// Existia em TRÊS cópias (comparador.ts, ComparadorProdNdvi.tsx e, para a
// reamostragem, meap/gerar.ts). Aqui vira uma só, PURA — recebe os grids já
// decodificados, sem base64 e sem DOM, para o relatório de produtividade poder
// desenhar o scatter com os MESMOS pares que produziram o r da tela.
//
// Módulo PURO. npm run teste:correlacao

export interface GridNum { valores: Float32Array; rows: number; cols: number }

/**
 * Reamostragem bilinear NaN-aware para co-registrar B na malha de A.
 *
 * Pressupõe MESMA EXTENSÃO geográfica: a interpolação é feita em coordenadas
 * de célula, não de mapa. Confira os bounds com `sobreposicaoBbox` antes —
 * extensões diferentes casam pixels errados sem reclamar de nada.
 */
export function reamostrarBilinear(src: Float32Array, sr: number, sc: number, dr: number, dc: number): Float32Array {
  if (sr === dr && sc === dc) return src;
  const out = new Float32Array(dr * dc);
  for (let j = 0; j < dr; j++) {
    const fy = dr === 1 ? 0 : (j * (sr - 1)) / (dr - 1); const y0 = Math.floor(fy), y1 = Math.min(y0 + 1, sr - 1), wy = fy - y0;
    for (let i = 0; i < dc; i++) {
      const fx = dc === 1 ? 0 : (i * (sc - 1)) / (dc - 1); const x0 = Math.floor(fx), x1 = Math.min(x0 + 1, sc - 1), wx = fx - x0;
      const a = src[y0 * sc + x0], b = src[y0 * sc + x1], c = src[y1 * sc + x0], dd = src[y1 * sc + x1];
      let num = 0, den = 0;
      const w00 = (1 - wx) * (1 - wy), w01 = wx * (1 - wy), w10 = (1 - wx) * wy, w11 = wx * wy;
      if (isFinite(a)) { num += a * w00; den += w00; } if (isFinite(b)) { num += b * w01; den += w01; }
      if (isFinite(c)) { num += c * w10; den += w10; } if (isFinite(dd)) { num += dd * w11; den += w11; }
      out[j * dc + i] = den > 0 ? num / den : NaN;
    }
  }
  return out;
}

export interface CorrelacaoGrid {
  /** Pearson. null quando há menos de `minN` pixels em comum ou variância nula. */
  r: number | null;
  /** Pixels válidos nos DOIS mapas — a base real do r. */
  n: number;
  /** Subamostra determinística para o gráfico de dispersão. */
  amostra: Array<{ a: number; b: number }>;
  /** Reta de tendência y = coef·x + intercepto, dos mínimos quadrados. */
  reta: { coef: number; intercepto: number } | null;
}

/**
 * Correlação entre A e B (B reamostrado para a malha de A).
 *
 * Duas passadas de propósito: a 1ª só acumula as somas, a 2ª guarda a amostra.
 * Materializar todos os pares antes de subamostrar — como a versão anterior
 * fazia — custava ~250 mil objetos num grid 500×500. Aqui a memória é
 * O(maxAmostra) e o resultado é idêntico, porque a regra de seleção continua
 * sendo o passo fixo `i % passo === 0` (determinístico, sem Math.random: o
 * mesmo mapa gera o mesmo gráfico toda vez).
 *
 * A RETA sai de TODOS os pares, não da amostra — assim a linha desenhada é
 * coerente com o r reportado ao lado dela.
 */
export function correlacaoGrids(
  a: GridNum, b: GridNum,
  opts: { maxAmostra?: number; minN?: number } = {},
): CorrelacaoGrid {
  const maxAmostra = opts.maxAmostra ?? 500;
  const minN = opts.minN ?? 30;
  const br = reamostrarBilinear(b.valores, b.rows, b.cols, a.rows, a.cols);

  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < a.valores.length; i++) {
    const x = a.valores[i], y = br[i];
    if (!isFinite(x) || !isFinite(y)) continue;
    n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
  }
  if (n < minN) return { r: null, n, amostra: [], reta: null };

  const cov = sxy / n - (sx / n) * (sy / n);
  const vx = sxx / n - (sx / n) ** 2, vy = syy / n - (sy / n) ** 2;
  const d = Math.sqrt(vx * vy);
  const r = d > 0 ? cov / d : null;
  const reta = vx > 0 ? { coef: cov / vx, intercepto: sy / n - (cov / vx) * (sx / n) } : null;

  const passo = Math.max(1, Math.floor(n / maxAmostra));
  const amostra: Array<{ a: number; b: number }> = [];
  let j = 0;
  for (let i = 0; i < a.valores.length && amostra.length < maxAmostra; i++) {
    const x = a.valores[i], y = br[i];
    if (!isFinite(x) || !isFinite(y)) continue;
    if (j % passo === 0) amostra.push({ a: x, b: y });
    j++;
  }

  return { r, n, amostra, reta };
}

export type Bbox = [number, number, number, number];   // [w, s, e, n]

/**
 * Fração de sobreposição de dois bbox: área da interseção ÷ área do MENOR.
 *
 * `correlacaoGrids` interpola em coordenadas de célula e presume mesma
 * extensão. Produtividade (IDW do backend) e NDVI (recorte da cena) vêm de
 * pipelines diferentes e podem não coincidir — e aí a correlação casa pixels
 * errados EM SILÊNCIO. Quem chama deve medir aqui e avisar o leitor.
 */
export function sobreposicaoBbox(a: Bbox, b: Bbox): number {
  const w = Math.max(a[0], b[0]), s = Math.max(a[1], b[1]);
  const e = Math.min(a[2], b[2]), n = Math.min(a[3], b[3]);
  if (e <= w || n <= s) return 0;
  const inter = (e - w) * (n - s);
  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1]);
  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const menor = Math.min(areaA, areaB);
  return menor > 0 ? Math.min(1, inter / menor) : 0;
}
