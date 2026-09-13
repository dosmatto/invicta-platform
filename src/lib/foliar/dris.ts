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
// TEOR ZERO É OUTRA COISA E TEM AVISO PRÓPRIO. Zero foi MEDIDO; ausente não foi.
// A razão dual não admite nem zero no denominador nem razão nula, então os
// pares daquele nutriente também saem — mas dizer "não foi analisado" seria
// descrever a causa errada e mandar o consultor procurar um dado que está lá.
//
// PAR INVÁLIDO NA NORMA (DP ≤ 0, CV ≤ 0, média não finita) É DESCARTADO ANTES
// DE OLHAR A AMOSTRA, com aviso: é defeito da NORMA, não do laudo, e tem de
// aparecer mesmo quando o nutriente do par nem foi analisado. E não basta
// exigir DP > 0: par com dispersão quase nula (dp/média abaixo de
// `CV_MINIMO_PAR`) também sai, porque toda função f divide por ela e um DP
// "quase zero" não falha — explode (ledger 10).
//
// O DIVISOR É COMUM A TODOS OS NUTRIENTES — e isto vale explicação. O índice é
// a média das f em que o nutriente participa. Quando o desenho é BALANCEADO
// (todo par presente entre os nutrientes analisados), todos participam do mesmo
// número de funções, e como cada f entra +f num nutriente e −f no outro, a soma
// dos índices é exatamente zero: é o que dá sentido à leitura relativa do DRIS
// ("excesso" é o espelho de uma deficiência). Um par inválido quebra o balanço
// — os dois nutrientes dele passam a ter n menor — e a soma deixa de ser zero
// (medimos 0,952 com um único par inválido), o que corrompe a comparação entre
// índices. Por isso dividimos todos pelo n MÉDIO: ele restaura Σíndices = 0 e,
// no caso balanceado, é idêntico ao n de cada nutriente — a fórmula clássica
// continua valendo onde ela vale.
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
 * Piso do coeficiente de variação de um par da norma — dp/média, ADIMENSIONAL
 * (0,005 = 0,5%), não o `cv` em % gravado em `ParNorma`.
 *
 * POR QUE UM PISO, E NÃO SÓ "dp > 0" (ledger 10): todas as quatro funções f
 * dividem pela dispersão do par — pelo DP (Alvarez&Leite, Jones) ou pelo CV
 * (Beaufils, Elwali&Gascho). Quando a população de referência é pequena, um par
 * pode sair com dispersão praticamente nula sem ser exatamente zero, e aí a
 * divisão não falha: ela EXPLODE. Medido numa população de alta com n=3, o par
 * Fe/K saiu com DP 0,000 e F = 2,04e31, e a diagnose devolveu IBN = 1,8e16 —
 * um número absurdo com cara de resultado.
 *
 * O piso é deliberadamente baixo: 0,5% de CV é uma razão dual praticamente
 * constante na população de referência, abaixo do próprio ruído analítico do
 * laboratório. Nenhum par biologicamente informativo cai aqui — quem cai é o
 * par degenerado, que não diagnostica nada e só serve para estourar a escala.
 */
export const CV_MINIMO_PAR = 0.005;

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
 * O par da norma sustenta a função f escolhida?
 *
 * Depende da FUNÇÃO: Alvarez&Leite e Jones dividem pelo DP; Beaufils e
 * Elwali&Gascho, pelo CV. Daí a checagem ser parametrizada em vez de uma regra
 * única que descartaria pares bons.
 *
 * O PISO DE DISPERSÃO (`CV_MINIMO_PAR`) VALE PARA AS QUATRO, e é aplicado aqui
 * por DEFESA EM PROFUNDIDADE: `normas.ts` já descarta o par degenerado na
 * geração, mas norma importada de fora (arquivo, banco de outro cliente, versão
 * antiga do gerador) chega direto na diagnose sem passar por lá. Ver o
 * comentário de `CV_MINIMO_PAR` para o porquê do número.
 */
export function parUtilizavel(par: ParNorma, funcao: FuncaoDris = 'alvarez-leite'): boolean {
  if (!par || !par.a || !par.b || par.a === par.b) return false;
  if (!Number.isFinite(par.media) || par.media <= 0) return false;
  // Piso ANTES da regra por função: `Number.isFinite` primeiro, senão um DP
  // infinito passaria pela comparação (Infinity/média não é < piso).
  if (!Number.isFinite(par.dp) || par.dp / par.media < CV_MINIMO_PAR) return false;
  if (funcao === 'alvarez-leite' || funcao === 'jones') return par.dp > 0;
  return Number.isFinite(par.cv) && par.cv > 0;
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

  // Defeito da NORMA se resolve antes de olhar a amostra — ver cabeçalho.
  const paresInvalidos: string[] = [];
  const paresValidos: ParNorma[] = [];
  for (const par of pares) {
    if (parUtilizavel(par, funcao)) paresValidos.push(par);
    else paresInvalidos.push(`${par?.a ?? '?'}/${par?.b ?? '?'}`);
  }
  if (!paresValidos.length) return null;

  const soma = new Map<NutrienteId, number>();
  const conta = new Map<NutrienteId, number>();
  const paresIgnorados: string[] = [];
  const nutrientesZero = new Set<NutrienteId>();
  let paresSemTeor = 0;
  let paresComZero = 0;

  const acumular = (id: NutrienteId, v: number) => {
    soma.set(id, (soma.get(id) ?? 0) + v);
    conta.set(id, (conta.get(id) ?? 0) + 1);
  };

  const ehZero = (id: NutrienteId) => teores[id] === 0;

  for (const par of paresValidos) {
    // Zero ANTES de ausência: `razao()` colapsa os dois em `null` (ou em 0 no
    // numerador), e sem separar aqui o aviso culparia o laudo de não ter
    // analisado um nutriente que foi analisado e deu zero.
    if (ehZero(par.a) || ehZero(par.b)) {
      if (ehZero(par.a)) nutrientesZero.add(par.a);
      if (ehZero(par.b)) nutrientesZero.add(par.b);
      paresComZero++;
      continue;
    }
    const r = razao(teores, par.a, par.b);
    if (r == null) { paresSemTeor++; continue; }       // nutriente ausente: n ajustado
    const f = funcaoF(r, par, funcao);
    if (f == null) { paresIgnorados.push(`${par.a}/${par.b}`); continue; }
    acumular(par.a, f);                                 // A está no numerador → +f
    acumular(par.b, -f);                                // B está no denominador → −f
  }

  if (!conta.size) return null;

  // Divisor COMUM: mantém Σíndices = 0 mesmo com o desenho desbalanceado, e é
  // igual ao n de cada nutriente quando o desenho é balanceado (cabeçalho).
  const contas = [...conta.values()];
  const nMedio = contas.reduce((s, n) => s + n, 0) / contas.length;
  const desbalanceado = contas.some(n => n !== contas[0]);

  const brutos = [...conta.keys()].map(nutriente => ({
    nutriente,
    indice: (soma.get(nutriente) as number) / nMedio,
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
  if (paresInvalidos.length) {
    avisos.push(
      `${paresInvalidos.length} par(es) da NORMA foram descartados por estatística inválida para a função ${funcao} (média não positiva, CV ≤ 0, ou dispersão praticamente nula — CV abaixo de ${(CV_MINIMO_PAR * 100).toFixed(1)}%, que faria a função f explodir): ${paresInvalidos.slice(0, 8).join(', ')}${paresInvalidos.length > 8 ? '…' : ''}. `
      + 'É um defeito da norma, não do laudo — os índices foram divididos pelo n médio para continuarem somando zero.',
    );
  }
  if (paresSemTeor) {
    avisos.push(`${paresSemTeor} par(es) da norma não entraram porque um dos nutrientes NÃO FOI ANALISADO — o n de cada índice foi ajustado.`);
  }
  if (nutrientesZero.size) {
    avisos.push(
      `Teor ZERO em: ${[...nutrientesZero].join(', ')} — ${paresComZero} par(es) fora. Zero não é "não analisado": é um resultado analítico, mas a razão dual não admite zero (divisão por zero no denominador, razão nula no numerador), então esses nutrientes ficaram sem índice. `
      + 'Confira o laudo: teor exatamente zero quase sempre é célula vazia lida como 0 — se for isso, o campo deve ficar VAZIO, não zerado.',
    );
  }
  if (paresIgnorados.length) {
    avisos.push(`Par(es) descartados no cálculo por razão fora do domínio da função f: ${paresIgnorados.slice(0, 8).join(', ')}${paresIgnorados.length > 8 ? '…' : ''}.`);
  }
  if (desbalanceado) {
    avisos.push(
      `Desenho de pares desbalanceado: os nutrientes participam de números diferentes de funções f (de ${Math.min(...contas)} a ${Math.max(...contas)}). Os índices foram divididos pelo n médio (${nMedio.toFixed(2)}) para que continuem somando zero — sem isso, um "excesso" deixaria de ser o espelho de uma deficiência e a comparação entre índices ficaria inválida.`,
    );
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
