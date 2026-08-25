// RENTABILIDADE do mapa de colheita: o que sobra depois de pagar o custo.
//
// A conta é elementar — receita = produtividade × preço; margem = receita −
// custo — e é justamente por isso que ela merece um módulo com teste: os erros
// aqui não parecem erros. NaN tratado como zero pinta o fora-do-talhão de
// prejuízo máximo; preço ausente lido como zero anuncia que a lavoura toda deu
// prejuízo; um quantil ingênuo pinta 20% de vermelho num talhão inteiramente
// lucrativo. Todos produzem um mapa plausível e falso.
//
// O CUSTO é UNIFORME no talhão (o usuário informa um R$/ha só). A variação do
// mapa vem inteira da produtividade — o relatório precisa dizer isso, senão
// sugere que se mediu custo por pixel.
//
// Módulo PURO. npm run teste:rentabilidade

import { classesDeBreaks, indiceFaixa, type ClassificacaoQuantis } from './quantis.ts';

/** Kg por saca quando o registro não diz outra coisa (soja, milho, trigo). */
export const SACA_KG_PADRAO = 60;

/**
 * Tamanhos de alqueire, em hectares.
 *
 * Não existe "o alqueire": o paulista tem 2,42 ha e o mineiro 4,84 ha — o
 * dobro. Errar qual está em uso dobra ou corta pela metade o custo de
 * arrendamento sem nenhum sinal na tela, por isso o valor viaja gravado no
 * mapa em vez de ser uma constante escondida no código.
 */
export const ALQUEIRES = [
  { id: 'paulista', nome: 'Paulista', ha: 2.42 },
  { id: 'mineiro', nome: 'Mineiro / goiano', ha: 4.84 },
  { id: 'norte', nome: 'Do Norte', ha: 2.7225 },
] as const;

/** Paraná, São Paulo e Sul em geral. */
export const ALQUEIRE_HA_PADRAO = 2.42;

/**
 * Unidade em que o PREÇO DE VENDA do grão é cotado.
 *
 * Distinta de `insumos.UnidadePreco` ('kg' | 't'), que é preço de INSUMO.
 * Misturar as duas é fácil e caro: uma é o que se recebe, a outra o que se paga.
 */
export type UnidadeVenda = 'sc' | 't' | 'kg';

export interface PrecoVenda {
  valor: number;
  unidade: UnidadeVenda;
  /** Kg por saca. Ausente = 60. Café e arroz não são 60. */
  sacaKg?: number;
}

/**
 * Preço em R$ por QUILO.
 *
 * null = DESCONHECIDO e nunca colapsa para 0 — preço zero diria que a colheita
 * não vale nada e faria a lavoura inteira aparecer no prejuízo.
 */
export function precoPorKg(p: PrecoVenda | null | undefined): number | null {
  if (!p || !Number.isFinite(p.valor) || p.valor <= 0) return null;
  if (p.unidade === 'kg') return p.valor;
  if (p.unidade === 't') return p.valor / 1000;
  const saca = Number.isFinite(p.sacaKg) && (p.sacaKg as number) > 0 ? (p.sacaKg as number) : SACA_KG_PADRAO;
  return p.valor / saca;
}

const fmtBR = (v: number, d = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Como o usuário digitou: "R$ 130,00/sc (60 kg)". */
export function rotuloPreco(p: PrecoVenda): string {
  if (p.unidade === 'kg') return `R$ ${fmtBR(p.valor)}/kg`;
  if (p.unidade === 't') return `R$ ${fmtBR(p.valor)}/t`;
  const saca = Number.isFinite(p.sacaKg) && (p.sacaKg as number) > 0 ? (p.sacaKg as number) : SACA_KG_PADRAO;
  return `R$ ${fmtBR(p.valor)}/sc (${fmtBR(saca, 0)} kg)`;
}

/**
 * Margem de UM pixel, em R$/ha.
 *
 * NaN entra → NaN sai. O pixel fora do talhão (ou recortado pela conferência de
 * cobertura) não tem produtividade; tratá-lo como 0 daria −custoHa e pintaria
 * tudo em volta da lavoura de prejuízo máximo.
 */
export function margemDoPixel(kgha: number, precoKg: number, custoHa: number): number {
  if (!Number.isFinite(kgha)) return NaN;
  return kgha * precoKg - custoHa;
}

/** Grid derivado em R$/ha, mesma malha, NaN preservado. Array novo. */
export function gridRentabilidade(valoresKgha: ArrayLike<number>, precoKg: number, custoHa: number): Float32Array {
  const out = new Float32Array(valoresKgha.length);
  for (let i = 0; i < valoresKgha.length; i++) out[i] = margemDoPixel(valoresKgha[i], precoKg, custoHa);
  return out;
}

/** Produtividade (kg/ha) que paga exatamente o custo. null se não há preço. */
export function pontoEquilibrioKgha(precoKg: number, custoHa: number): number | null {
  if (!Number.isFinite(precoKg) || precoKg <= 0) return null;
  if (!Number.isFinite(custoHa)) return null;
  return custoHa / precoKg;
}

/**
 * Arrendamento em SACAS POR ALQUEIRE convertido para R$/ha.
 *
 *   sacas/alq × kg por saca × R$/kg ÷ ha por alqueire
 *
 * O preço da saca entra porque o contrato é em produto: 40 sc/alq valem mais
 * quando a saca sobe. null quando falta preço ou o alqueire é inválido —
 * jamais 0, que diria "arrendamento de graça".
 */
export function arrendamentoPorHa(
  sacasPorAlqueire: number, precoKg: number, sacaKg: number, alqueireHa: number,
): number | null {
  if (!Number.isFinite(sacasPorAlqueire) || sacasPorAlqueire <= 0) return null;
  if (!Number.isFinite(precoKg) || precoKg <= 0) return null;
  if (!Number.isFinite(sacaKg) || sacaKg <= 0) return null;
  if (!Number.isFinite(alqueireHa) || alqueireHa <= 0) return null;
  return (sacasPorAlqueire * sacaKg * precoKg) / alqueireHa;
}

export interface ResumoRentabilidade {
  precoKg: number;
  custoHa: number;
  pontoEquilibrioKgha: number | null;
  nPixels: number;
  areaHa: number;
  produtividadeMediaKgha: number;
  receitaMediaHa: number;
  margemMediaHa: number;
  margemMinHa: number;
  margemMaxHa: number;
  receitaTotal: number;
  custoTotal: number;
  margemTotal: number;
  /** margemTotal ÷ custoTotal × 100. null quando não houve custo. */
  retornoSobreCustoPct: number | null;
  areaPrejuizoHa: number;
  areaLucroHa: number;
  pctPrejuizo: number;
}

export function resumoRentabilidade(
  valoresKgha: ArrayLike<number>,
  p: { precoKg: number; custoHa: number; pixelM: number },
): ResumoRentabilidade | null {
  const { precoKg, custoHa, pixelM } = p;
  if (!Number.isFinite(precoKg) || precoKg <= 0) return null;

  // MESMA conta de área de statsDoGrid e classesQuantis — senão a tabela do PDF
  // não fecha com a faixa de estatísticas da página 1.
  const pixelHa = (pixelM * pixelM) / 10000;
  let n = 0, somaKgha = 0, mn = Infinity, mx = -Infinity, nPrejuizo = 0;
  for (let i = 0; i < valoresKgha.length; i++) {
    const v = valoresKgha[i];
    if (!Number.isFinite(v)) continue;
    n++; somaKgha += v;
    const m = v * precoKg - custoHa;
    if (m < mn) mn = m;
    if (m > mx) mx = m;
    if (m < 0) nPrejuizo++;
  }
  if (n === 0) return null;

  const areaHa = n * pixelHa;
  const prodMedia = somaKgha / n;
  const receitaMediaHa = prodMedia * precoKg;
  const margemMediaHa = receitaMediaHa - custoHa;
  const custoTotal = custoHa * areaHa;

  return {
    precoKg, custoHa,
    pontoEquilibrioKgha: pontoEquilibrioKgha(precoKg, custoHa),
    nPixels: n, areaHa,
    produtividadeMediaKgha: prodMedia,
    receitaMediaHa, margemMediaHa,
    margemMinHa: mn, margemMaxHa: mx,
    receitaTotal: receitaMediaHa * areaHa,
    custoTotal,
    margemTotal: margemMediaHa * areaHa,
    retornoSobreCustoPct: custoTotal > 0 ? ((margemMediaHa * areaHa) / custoTotal) * 100 : null,
    areaPrejuizoHa: nPrejuizo * pixelHa,
    areaLucroHa: (n - nPrejuizo) * pixelHa,
    pctPrejuizo: (nPrejuizo / n) * 100,
  };
}

// ── Faixas ancoradas no ZERO ────────────────────────────────────────────────

export const PALETA_PREJUIZO = ['#7F0000', '#C62828', '#EF6C00'];
export const PALETA_LUCRO = ['#C5E1A5', '#7CB342', '#33691E'];
const NOMES_PREJUIZO = ['Prejuízo alto', 'Prejuízo', 'Prejuízo baixo'];
const NOMES_LUCRO = ['Lucro baixo', 'Lucro', 'Lucro alto'];

/** Quantil tipo 7 sobre um vetor JÁ ordenado (mesmo de validacao/estatistica). */
function quantilOrdenado(ord: number[], q: number): number {
  const n = ord.length;
  if (!n) return NaN;
  if (n === 1) return ord[0];
  const pos = (n - 1) * Math.min(1, Math.max(0, q));
  const base = Math.floor(pos), resto = pos - base;
  return ord[base] + (ord[Math.min(base + 1, n - 1)] - ord[base]) * resto;
}

/** Cortes internos por quantil dentro de um lado, sem repetir valor. */
function cortesDe(ord: number[], nFaixas: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < nFaixas; i++) {
    const c = quantilOrdenado(ord, i / nFaixas);
    if (out.length === 0 ? c > ord[0] : c > out[out.length - 1]) out.push(c);
  }
  while (out.length && out[out.length - 1] >= ord[ord.length - 1]) out.pop();
  return out;
}

function amostrar<T>(paleta: readonly T[], n: number): T[] {
  if (n <= 0) return [];
  if (n === 1) return [paleta[paleta.length - 1]];
  return Array.from({ length: n }, (_, i) => paleta[Math.round((i / (n - 1)) * (paleta.length - 1))]);
}

/**
 * Faixas de rentabilidade ANCORADAS NO ZERO.
 *
 * Quantil puro sempre pinta 1/k da área de vermelho — inclusive num talhão
 * inteiramente lucrativo. Para dinheiro, o corte que importa é o zero, e ele
 * tem de ser FRONTEIRA de faixa, nunca cair no meio de uma: "esta mancha deu
 * prejuízo" é a única leitura que o mapa precisa garantir.
 *
 * As k faixas se repartem entre os lados na proporção da ÁREA de cada um, os
 * cortes internos saem por quantil DENTRO de cada lado, e os dois se emendam
 * com o 0 no meio. Tudo no lucro → k faixas verdes, nenhum vermelho.
 */
export function classesRentabilidade(
  valoresRs: ArrayLike<number>,
  opts: { k?: number; pixelM: number },
): (ClassificacaoQuantis & { iZero: number | null }) | null {
  const k = Math.max(2, opts.k ?? 5);
  const neg: number[] = [], pos: number[] = [];
  for (let i = 0; i < valoresRs.length; i++) {
    const v = valoresRs[i];
    if (!Number.isFinite(v)) continue;
    if (v < 0) neg.push(v); else pos.push(v);
  }
  const n = neg.length + pos.length;
  if (n === 0) return null;
  neg.sort((a, b) => a - b); pos.sort((a, b) => a - b);

  // Reparte as faixas pela área de cada lado; quem existe leva ao menos uma.
  let kNeg = neg.length ? Math.max(1, Math.min(k - (pos.length ? 1 : 0), Math.round((k * neg.length) / n))) : 0;
  let kPos = k - kNeg;
  if (pos.length && kPos < 1) { kPos = 1; kNeg = k - 1; }
  if (!pos.length) { kNeg = k; kPos = 0; }

  const breaks: number[] = [];
  let iZero: number | null = null;
  if (kNeg > 0) breaks.push(...cortesDe(neg, kNeg));
  if (kNeg > 0 && kPos > 0) { iZero = breaks.length; breaks.push(0); }
  if (kPos > 0) breaks.push(...cortesDe(pos, kPos).filter(c => c > 0));

  const cls = classesDeBreaks(valoresRs, breaks, {
    pixelM: opts.pixelM,
    cores: [...amostrar(PALETA_PREJUIZO, kNeg), ...amostrar(PALETA_LUCRO, kPos)],
    nomes: [...amostrar(NOMES_PREJUIZO, kNeg), ...amostrar(NOMES_LUCRO, kPos)],
    colapsadas: (k - 1) - breaks.length,
  });
  if (!cls) return null;
  return { ...cls, iZero };
}

/** Índice da faixa de um valor — reexportado para quem desenha os ticks. */
export { indiceFaixa };
