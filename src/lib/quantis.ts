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
  /** Σ valor × área do pixel. Com o grid em kg/ha são KG; com o grid em R$/ha
   *  são REAIS totais da faixa; com kg/ha de K2O, kg do nutriente. A unidade é
   *  a do grid — o nome ficou de quando só havia produtividade. */
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
  const b = breaksQuantis(valores, opts.k ?? 5);
  if (!b) return null;
  return classesDeBreaks(valores, b.breaks, { ...opts, min: b.min, max: b.max, colapsadas: b.colapsadas });
}

/**
 * Agrega os valores em faixas por CORTES JÁ DADOS.
 *
 * Separado de `classesQuantis` porque nem toda classificação vem de quantil: a
 * rentabilidade precisa de faixas ancoradas no ZERO (quantil puro pintaria 20%
 * de vermelho num talhão inteiramente lucrativo). A agregação — área, %, soma —
 * é a mesma nos dois casos e não deve existir em duas cópias.
 *
 * `min`/`max` ancoram as PONTAS abertas; sem eles, saem do próprio conjunto.
 */
export function classesDeBreaks(
  valores: ArrayLike<number>,
  breaks: number[],
  opts: { pixelM: number; cores: string[]; nomes: string[]; min?: number; max?: number; colapsadas?: number },
): ClassificacaoQuantis | null {
  const nFaixas = breaks.length + 1;
  const pixelHa = (opts.pixelM * opts.pixelM) / 10000;

  const nPix = new Array<number>(nFaixas).fill(0);
  const soma = new Array<number>(nFaixas).fill(0);
  let n = 0, vmin = Infinity, vmax = -Infinity;

  for (let i = 0; i < valores.length; i++) {
    const v = valores[i];
    if (!Number.isFinite(v)) continue;
    n++;
    if (v < vmin) vmin = v;
    if (v > vmax) vmax = v;
    const c = indiceFaixa(v, breaks);
    nPix[c]++; soma[c] += v;
  }
  if (n === 0) return null;

  const lo0 = opts.min ?? vmin;
  const hiN = opts.max ?? vmax;
  const faixas: FaixaQuantil[] = [];
  for (let i = 0; i < nFaixas; i++) {
    // Limites: os CORTES (não o mín/máx observado da faixa) — são eles que a
    // legenda anuncia. Pontas ancoradas no mín/máx do mapa.
    const lo = i === 0 ? lo0 : breaks[i - 1];
    const hi = i === nFaixas - 1 ? hiN : breaks[i];
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
      pctArea: n > 0 ? (nPix[i] / n) * 100 : 0,
      somaKg: soma[i] * pixelHa,
    });
  }

  return { faixas, breaks, nPixels: n, areaHa: n * pixelHa, colapsadas: opts.colapsadas ?? 0 };
}
// Reamostra uma paleta de `tam` entradas para `nFaixas` posições, preservando
// a primeira e a última. Só faz diferença quando houve colapso por empate.
function posicaoNaPaleta(i: number, nFaixas: number, tam: number): number {
  if (tam <= 1) return 0;
  if (nFaixas <= 1) return tam - 1;
  return Math.round((i / (nFaixas - 1)) * (tam - 1));
}

/**
 * Faixa de EXIBIÇÃO por percentis — o "contraste realçado" dos mapas de índice.
 *
 * Estica a rampa entre o p2 e o p98 em vez do mín–máx: duas bordas de nuvem ou
 * uma sombra bastam para o mín–máx cobrir toda a escala, e aí o talhão inteiro
 * sai de uma cor só. Cortar as pontas devolve a variação que existe de fato.
 *
 * Usa o rank MAIS PRÓXIMO (não interpola como `quantil`): isto é a escala de
 * uma barra de cores, não uma estatística publicada, e o número das pontas tem
 * de ser um valor que EXISTE no mapa. Mapa quase constante cai para o mín–máx
 * e, se nem isso separar, abre 1e-4 — rampa de largura zero pinta tudo igual.
 */
export function faixaPercentis(valores: ArrayLike<number>, pLo = 2, pHi = 98): [number, number] {
  const arr: number[] = [];
  for (let i = 0; i < valores.length; i++) { const v = valores[i]; if (isFinite(v)) arr.push(v); }
  if (!arr.length) return [0, 1];
  arr.sort((a, b) => a - b);
  const q = (p: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.round((p / 100) * (arr.length - 1))))];
  let lo = q(pLo), hi = q(pHi);
  if (hi - lo < 1e-4) { lo = arr[0]; hi = arr[arr.length - 1]; }
  if (hi - lo < 1e-4) hi = lo + 1e-4;
  return [lo, hi];
}
