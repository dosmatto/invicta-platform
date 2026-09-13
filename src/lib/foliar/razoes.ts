// RAZÕES DUAIS — o que o DRIS realmente enxerga.
//
// POR QUE RAZÃO E NÃO TEOR: Beaufils (1973) diagnostica pelo EQUILÍBRIO entre
// pares (A/B), não pelo teor isolado, justamente para escapar do efeito de
// diluição/concentração (Steenbjerg/Piper) — uma planta que cresceu muito
// dilui o nutriente e "aparece" deficiente numa faixa de suficiência, mesmo
// tendo absorvido mais. A razão entre dois nutrientes é imune a isso porque os
// dois diluem juntos.
//
// DUAS REGRAS DEFENSIVAS AQUI:
//  1. A razão é `number | null`, nunca NaN ou Infinity. Denominador ausente ou
//     zero devolve `null` e o par simplesmente SAI da conta (n ajustado no
//     `dris.ts`). NaN propagado silenciosamente contamina o índice, o IBN e a
//     ordem de limitação inteira — e o número continua "parecendo" plausível.
//  2. Os pares são gerados com i<j na ordem canônica de `NUTRIENTES`, para que
//     a chave do par seja estável entre execuções e entre versões da norma.
//     A ordem final de cada par (A/B × B/A) quem decide é o teste F na
//     `normas.ts`; aqui é só a enumeração.
//
// Módulo PURO — sem DOM, sem I/O. npm run teste:foliar

import { NUTRIENTES, type NutrienteId, type TeoresFoliares } from './tipos.ts';

export interface ParNutrientes {
  a: NutrienteId;
  b: NutrienteId;
}

/** Chave estável de um par ORIENTADO ("N/P" ≠ "P/N"). */
export const chaveDoPar = (a: NutrienteId, b: NutrienteId): string => `${a}/${b}`;

/** Chave do par NÃO orientado — usada para casar A/B com B/A. */
export const chaveNaoOrientada = (a: NutrienteId, b: NutrienteId): string =>
  a < b ? `${a}|${b}` : `${b}|${a}`;

/**
 * Todos os pares i<j. Com os 11 nutrientes são 55 pares — cada nutriente
 * participa de 10 funções f, que é o `n` do denominador do índice.
 */
export function paresDeNutrientes(nutrientes: readonly NutrienteId[] = NUTRIENTES): ParNutrientes[] {
  const ordem = NUTRIENTES.filter(n => nutrientes.includes(n));
  const pares: ParNutrientes[] = [];
  for (let i = 0; i < ordem.length; i++) {
    for (let j = i + 1; j < ordem.length; j++) pares.push({ a: ordem[i], b: ordem[j] });
  }
  return pares;
}

/**
 * Razão A/B da amostra. `null` quando qualquer um dos dois não foi analisado
 * ou quando o denominador é zero — ver regra 1 no cabeçalho.
 *
 * ATENÇÃO À UNIDADE: a razão é calculada sobre o teor NA UNIDADE CANÔNICA de
 * cada nutriente (macro g/kg, micro mg/kg), que é a mesma base em que a norma
 * foi gerada. Misturar N em g/kg com B em mg/kg é proposital e consistente —
 * o que não pode é a amostra vir numa base e a norma em outra.
 */
export function razao(teores: TeoresFoliares, a: NutrienteId, b: NutrienteId): number | null {
  const va = teores[a];
  const vb = teores[b];
  if (typeof va !== 'number' || !Number.isFinite(va)) return null;
  if (typeof vb !== 'number' || !Number.isFinite(vb) || vb === 0) return null;
  const r = va / vb;
  return Number.isFinite(r) ? r : null;
}

/** Todas as razões calculáveis da amostra, na ordem canônica dos pares. */
export function razoesDaAmostra(
  teores: TeoresFoliares,
  nutrientes: readonly NutrienteId[] = NUTRIENTES,
): Array<ParNutrientes & { valor: number }> {
  const out: Array<ParNutrientes & { valor: number }> = [];
  for (const p of paresDeNutrientes(nutrientes)) {
    const v = razao(teores, p.a, p.b);
    if (v != null) out.push({ a: p.a, b: p.b, valor: v });
  }
  return out;
}
