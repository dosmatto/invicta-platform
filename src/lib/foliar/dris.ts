// DRIS — Diagnosis and Recommendation Integrated System.
//
// Quatro funções f(A/B) concorrentes, selecionáveis, porque a literatura NÃO
// tem consenso sobre qual é a melhor e o resultado muda com a escolha
// (Bataglia & Santos 1990; Nick 1998). Esconder a escolha seria fingir um
// consenso que não existe — a função usada vai gravada no resultado.
//
//   alvarez-leite  Z(A/B) = (C/s)·[(A/B) − (a/b)],  C = 10
//                  Alvarez V. & Leite (1999). PADRÃO do módulo: é a usada em
//                  praticamente todo trabalho brasileiro de soja (Kurihara
//                  et al. 2013; Wadt; Serra et al. 2007).
//   jones          f(A/B) = [(A/B) − (a/b)]/s,  isto é, C = 1
//                  Jones (1981). MESMA forma linear, só que sem o fator de
//                  escala: é a variável normal reduzida pura. A escolha entre
//                  as duas muda a MAGNITUDE do índice e do IBN (10×), nunca a
//                  ordem de limitação nem o sinal — e por isso as duas ficam
//                  disponíveis em vez de uma ser "a certa".
//   beaufils       A/B < a/b:  f = [1 − (a/b)/(A/B)]·100·k/CV%
//                  A/B > a/b:  f = [(A/B)/(a/b) − 1]·100·k/CV%
//                  Beaufils (1973), k = 10. ASSIMÉTRICA de propósito: o desvio
//                  para baixo e para cima de uma razão não são simétricos.
//   elwali-gascho  Beaufils com ZONA MORTA de ±1 desvio-padrão: dentro de
//                  a/b ± s, f = 0. Elwali & Gascho (1984). Evita que ruído
//                  analítico de laboratório vire "desequilíbrio".
//
// ÍNDICE DO NUTRIENTE = [Σ f(A/B) − Σ f(B/A)] / n
//   Na prática: cada par da norma produz UM valor de f, que entra POSITIVO no
//   nutriente que está no numerador (`par.a`) e NEGATIVO no do denominador
//   (`par.b`). O `n` é o número de funções em que o nutriente participou.
//
// A ORDEM DO PAR É A DA NORMA, não recalculada aqui. O gerador
// (`normas.ts`) já escolheu A/B ou B/A pelo maior F = S²baixa/S²alta
// (Beaufils 1973) e gravou; Jones e Alvarez&Leite são sensíveis à ordem, então
// recalcular na diagnose faria a mesma norma dar dois resultados.
//
// NUTRIENTE AUSENTE SAI DA CONTA, nunca vira zero: `razao()` devolve `null`, o
// par é pulado e o `n` do nutriente cai junto. Tratar ausência como zero
// fabricaria uma deficiência absoluta que o laudo não mediu (ledger 17).
//
// IBN = Σ|índices| · IBNm = IBN / nº de nutrientes com índice.
//
// Módulo PURO — sem DOM, sem I/O. npm run teste:foliar

import { classeWadt, estadoDaClasse, ordenarPorLimitacao } from './interpretacao.ts';
import { razao } from './razoes.ts';
import {
  type FuncaoDris, type IndiceNutriente, type NormaDris, type NutrienteId,
  type ParNorma, type ResultadoDris, type TeoresFoliares,
} from './tipos.ts';

/** Fator de ajuste C da forma linear. Alvarez V. & Leite usam 10; Jones, 1. */
export const C_ALVAREZ_LEITE = 10;
export const C_JONES = 1;
/** Fator k da forma assimétrica de Beaufils. */
export const K_BEAUFILS = 10;

/**
 * Valor da função f para UMA razão, contra UM par da norma.
 *
 * Devolve `null` — não 0 — quando a norma não sustenta a conta (desvio ou CV
 * zero, média não positiva). Zero significaria "em equilíbrio", que é uma
 * afirmação; `null` significa "não dá para dizer", que é a verdade.
 */
export function funcaoF(r: number, par: ParNorma, funcao: FuncaoDris = 'alvarez-leite'): number | null {
  if (!Number.isFinite(r) || r <= 0) return null;
  const m = par.media;
  if (!Number.isFinite(m) || m <= 0) return null;
  const s = par.dp;

  if (funcao === 'alvarez-leite' || funcao === 'jones') {
    if (!Number.isFinite(s) || s <= 0) return null;
    const C = funcao === 'jones' ? C_JONES : C_ALVAREZ_LEITE;
    return (C / s) * (r - m);
  }

  // Beaufils e Elwali&Gascho compartilham a forma assimétrica; o segundo só
  // acrescenta a zona morta antes de aplicá-la.
  const cv = par.cv;
  if (!Number.isFinite(cv) || cv <= 0) return null;
  if (funcao === 'elwali-gascho') {
    if (!Number.isFinite(s) || s < 0) return null;
    if (r >= m - s && r <= m + s) return 0;   // dentro de ±1 DP: sem diagnóstico
  }
  const escala = (100 * K_BEAUFILS) / cv;
  if (r < m) return (1 - m / r) * escala;
  if (r > m) return (r / m - 1) * escala;
  return 0;
}

/**
 * Índices DRIS da amostra contra a norma.
 *
 * Devolve `null` quando a norma não tem pares utilizáveis OU quando nenhum par
 * pôde ser calculado com os teores disponíveis — quem chama transforma isso no
 * motivo que aparece na tela.
 */
export function calcularDris(
  teores: TeoresFoliares,
  norma: Pick<NormaDris, 'pares'>,
  funcao: FuncaoDris = 'alvarez-leite',
): ResultadoDris | null {
  const pares = norma?.pares ?? [];
  if (!pares.length) return null;

  const soma = new Map<NutrienteId, number>();
  const conta = new Map<NutrienteId, number>();
  const paresIgnorados: string[] = [];
  let paresSemTeor = 0;

  const acumular = (id: NutrienteId, v: number) => {
    soma.set(id, (soma.get(id) ?? 0) + v);
    conta.set(id, (conta.get(id) ?? 0) + 1);
  };

  for (const par of pares) {
    const r = razao(teores, par.a, par.b);
    if (r == null) { paresSemTeor++; continue; }       // nutriente ausente: n ajustado
    const f = funcaoF(r, par, funcao);
    if (f == null) { paresIgnorados.push(`${par.a}/${par.b}`); continue; }
    acumular(par.a, f);                                 // A está no numerador → +f
    acumular(par.b, -f);                                // B está no denominador → −f
  }

  if (!conta.size) return null;

  const brutos = [...conta.keys()].map(nutriente => ({
    nutriente,
    indice: (soma.get(nutriente) as number) / (conta.get(nutriente) as number),
    nPares: conta.get(nutriente) as number,
  }));

  const ibn = brutos.reduce((s, i) => s + Math.abs(i.indice), 0);
  const ibnm = ibn / brutos.length;

  const ordenados = ordenarPorLimitacao(brutos);
  const posicao = new Map<NutrienteId, number>(ordenados.map((i, k) => [i.nutriente, k + 1]));

  const indices: IndiceNutriente[] = ordenados.map(i => {
    const classe = classeWadt(i.indice, ibnm);
    return {
      nutriente: i.nutriente,
      indice: i.indice,
      nPares: i.nPares,
      classe,
      estado: estadoDaClasse(classe),
      ordem: posicao.get(i.nutriente) as number,
    };
  });

  const avisos: string[] = [];
  if (paresSemTeor) {
    avisos.push(`${paresSemTeor} par(es) da norma não entraram porque um dos nutrientes não foi analisado — o n de cada índice foi ajustado.`);
  }
  if (paresIgnorados.length) {
    avisos.push(`Par(es) descartados por estatística inválida na norma (DP ou CV zero): ${paresIgnorados.slice(0, 8).join(', ')}${paresIgnorados.length > 8 ? '…' : ''}.`);
  }

  return {
    funcao,
    indices,
    ibn,
    ibnm,
    ordemLimitacao: indices.map(i => i.nutriente),
    nNutrientes: indices.length,
    avisos,
  };
}
