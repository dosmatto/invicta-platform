// Classificação por QUANTIL (quintis, quartis…) de um raster interpolado.
//
// A escala absoluta (kg/ha por cultura) responde "esta lavoura é boa?"; a
// escala por quantil responde "onde, DENTRO desta lavoura, está o melhor e o
// pior?" — cada faixa cobre a mesma fração da ÁREA, então o contraste aparece
// mesmo num talhão uniforme, onde a escala absoluta pinta tudo de uma cor só.
//
// Diferença para `posicionadorRelativo('quantil')` (lib/raster.ts): lá o
// percentil vira posição CONTÍNUA na rampa e o mapa sai em gradiente, com as
// fronteiras de cor caindo nas larguras visuais da legenda (22,5/22,5/22,5/
// 22,5/10) e não em 20/40/60/80. Aqui as faixas são DISCRETAS e de área igual,
// que é o que a legenda com valores de corte reais promete ao leitor.
//
// Módulo PURO — sem DOM, sem React, sem base64 (recebe os valores já
// decodificados). npm run teste:quantis

import { quantil } from './validacao/estatistica.ts';

export interface BreaksQuantis {
  /** k-1 cortes internos, ESTRITAMENTE crescentes (empates já removidos). */
  breaks: number[];
  min: number;
  max: number;
  /** Nº de valores finitos considerados. */
  n: number;
  /** Faixas perdidas por empate. k efetivo = breaks.length + 1. */
  colapsadas: number;
}

/**
 * Cortes de quantil de um conjunto de valores.
 *
 * Empates NÃO são empurrados com epsilon: um mapa com muito valor repetido
 * (talhão uniforme, raster calibrado por média) faria dois cortes caírem no
 * mesmo número, e afastá-los à força inventaria uma faixa vazia com intervalo
 * impossível na legenda ("4.500 – 4.500"). Em vez disso o corte duplicado é
 * descartado e a perda é declarada em `colapsadas`, para a UI e o PDF
 * mostrarem o número de faixas que REALMENTE existe.
 */
export function breaksQuantis(valores: ArrayLike<number>, k = 5): BreaksQuantis | null {
  if (k < 2) return null;
  const ord: number[] = [];
  for (let i = 0; i < valores.length; i++) {
    const v = valores[i];
    if (Number.isFinite(v)) ord.push(v);
  }
  const n = ord.length;
  if (n < k) return null;
  ord.sort((a, b) => a - b);

  const breaks: number[] = [];
  for (let i = 1; i < k; i++) {
    const c = quantil(ord, i / k);
    if (breaks.length === 0 ? c > ord[0] : c > breaks[breaks.length - 1]) breaks.push(c);
  }
  // Um corte igual ao máximo deixaria a última faixa vazia — mesma armadilha.
  while (breaks.length && breaks[breaks.length - 1] >= ord[n - 1]) breaks.pop();

  return { breaks, min: ord[0], max: ord[n - 1], n, colapsadas: (k - 1) - breaks.length };
}

/**
 * Índice (0-based) da faixa de um valor.
 *
 * Convenção `(min, max]` — a MESMA de `classeDoValor` (lib/legendas.ts) e de
 * `rasterizarPontos5` (lib/condutividade.ts): o valor exato do corte pertence
 * à faixa DE BAIXO. Divergir disso aqui faria o mapa e a legenda discordarem
 * justamente nos pixels da fronteira.
 */
export function indiceFaixa(v: number, breaks: number[]): number {
  let c = 0;
  while (c < breaks.length && v > breaks[c]) c++;
  return c;
}

export interface FaixaQuantil {
  ordem: number;          // 1..k
  min: number;            // limite inferior REAL (a 1ª faixa usa o mínimo do mapa)
  max: number;            // limite superior REAL (a última usa o máximo do mapa)
  nome: string;
  cor: string;            // hex, CHAPADA (sem gradiente interno)
  nPixels: number;
  areaHa: number;
  pctArea: number;
  /** Σ valor × área do pixel. Só faz sentido com o grid em kg/ha. */
  somaKg: number;
}

export interface ClassificacaoQuantis {
  faixas: FaixaQuantil[];
  breaks: number[];
  nPixels: number;
  areaHa: number;
  colapsadas: number;
}

/**
 * Classificação completa: cortes + área, % e produção de cada faixa.
 *
 * `areaHa` usa a MESMA conta de `statsDoGrid` (lib/produtividade.ts) —
 * nº de pixels finitos × (pixelM²/10.000) — para que a soma das faixas feche
 * com a área total já mostrada na tela. Tabela que não fecha destrói a
 * confiança no relatório inteiro.
 */
export function classesQuantis(
  valores: ArrayLike<number>,
  opts: { k?: number; pixelM: number; cores: string[]; nomes: string[] },
): ClassificacaoQuantis | null {
  const k = opts.k ?? 5;
  const b = breaksQuantis(valores, k);
  if (!b) return null;

  const nFaixas = b.breaks.length + 1;
  const pixelHa = (opts.pixelM * opts.pixelM) / 10000;

  const nPix = new Array<number>(nFaixas).fill(0);
  const soma = new Array<number>(nFaixas).fill(0);
  const mn = new Array<number>(nFaixas).fill(Infinity);
  const mx = new Array<number>(nFaixas).fill(-Infinity);

  for (let i = 0; i < valores.length; i++) {
    const v = valores[i];
    if (!Number.isFinite(v)) continue;
    const c = indiceFaixa(v, b.breaks);
    nPix[c]++; soma[c] += v;
    if (v < mn[c]) mn[c] = v;
    if (v > mx[c]) mx[c] = v;
  }

  const areaHa = b.n * pixelHa;
  const faixas: FaixaQuantil[] = [];
  for (let i = 0; i < nFaixas; i++) {
    // Limites: os CORTES (não o mín/máx observado da faixa) — são eles que a
    // legenda anuncia. Pontas ancoradas no mín/máx do mapa.
    const lo = i === 0 ? b.min : b.breaks[i - 1];
    const hi = i === nFaixas - 1 ? b.max : b.breaks[i];
    faixas.push({
      ordem: i + 1,
      min: lo, max: hi,
      // Com faixas colapsadas há menos faixas que cores/nomes: as cores das
      // PONTAS é que devem sobreviver (são os extremos que interessam), então
      // a paleta é reamostrada em vez de truncada no fim.
      nome: opts.nomes[posicaoNaPaleta(i, nFaixas, opts.nomes.length)] ?? `Faixa ${i + 1}`,
      cor: opts.cores[posicaoNaPaleta(i, nFaixas, opts.cores.length)] ?? '#888888',
      nPixels: nPix[i],
      areaHa: nPix[i] * pixelHa,
      pctArea: b.n > 0 ? (nPix[i] / b.n) * 100 : 0,
      somaKg: soma[i] * pixelHa,
    });
  }

  return { faixas, breaks: b.breaks, nPixels: b.n, areaHa, colapsadas: b.colapsadas };
}

// Reamostra uma paleta de `tam` entradas para `nFaixas` posições, preservando
// a primeira e a última. Só faz diferença quando houve colapso por empate.
function posicaoNaPaleta(i: number, nFaixas: number, tam: number): number {
  if (tam <= 1) return 0;
  if (nFaixas <= 1) return tam - 1;
  return Math.round((i / (nFaixas - 1)) * (tam - 1));
}
