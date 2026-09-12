// CHANCE MATEMÁTICA (ChM) — Wadt / Beverly, a partir de Jarrel & Beverly (1981).
//
// A pergunta que este método faz é diferente da dos outros três: não "o teor
// está na faixa?" nem "as razões estão equilibradas?", e sim **em que faixa de
// teor a alta produtividade acontece com mais frequência no NOSSO banco**. É o
// único método que não precisa de norma nenhuma — ele CONSTRÓI a referência a
// partir da população (teor × produtividade) que o consultor já tem.
//
// A CONTA:
//   1. Separar alta/baixa produtividade por um corte (kg/ha ou percentil).
//   2. Dividir os teores em classes por QUANTIS (não em intervalos iguais):
//      teor foliar é assimétrico, e classes de largura fixa deixariam a maior
//      parte da população numa classe só, matando o poder discriminante.
//   3. Por classe: probAlta = nAlta/n (probabilidade condicional) e
//      chance = probAlta × (nAlta / nAltaTotal).
//      O SEGUNDO FATOR É O QUE FAZ O MÉTODO FUNCIONAR: sem ele, uma classe com
//      1 amostra que por acaso é de alta produtividade daria 100% de chance e
//      venceria qualquer classe densa com 80%. Multiplicar pela fração da
//      população de alta que caiu ali penaliza exatamente esse caso.
//   4. Classe ótima = maior `chance`. Teor ótimo = média dos teores das
//      amostras de ALTA produtividade dentro da classe ótima — o centro de
//      massa do que de fato produziu, não o meio geométrico da classe.
//
// Para DIAGNOSTICAR uma amostra, o teor é comparado com a classe ótima:
// abaixo → deficiente, dentro → adequado, acima → excessivo.
//
// LIMITAÇÃO DECLARADA: é um método de FREQUÊNCIA, não de causalidade. Serra et
// al. (2007, RBCS) mostraram convergência com DRIS e CND para os macros, mas
// divergência em Cu, Fe, Mn e Zn — os micros exigem população grande antes de
// a ChM merecer confiança.
//
// Reusa `quantil` de `src/lib/validacao/estatistica.ts` (ledger 12).
//
// Módulo PURO — sem DOM, sem I/O. npm run teste:foliar

import { quantil } from '../validacao/estatistica.ts';
import {
  type ChanceNutriente, type ClasseChance, type DiagnosticoChance,
  NUTRIENTES, type NormaChance, type NutrienteId, type ResultadoChance, type TeoresFoliares,
} from './tipos.ts';

/** Uma linha da população de referência: teores + a produtividade que ela deu. */
export interface AmostraPopulacao {
  teores: TeoresFoliares;
  produtividadeKgha: number;
}

export interface OpcoesChance {
  /** Corte absoluto de alta produtividade. Tem precedência sobre `percentil`. */
  corteKgha?: number;
  /** Quantil da produtividade usado como corte quando não há valor absoluto. 0..1 */
  percentil?: number;
  /** nº de classes de teor. 5 é o usual na literatura de ChM. */
  nClasses?: number;
  /** Abaixo disto o nutriente nem entra — frequência com 12 amostras é ruído. */
  nMinimo?: number;
}

export const PERCENTIL_CORTE_PADRAO = 0.75;
export const N_CLASSES_PADRAO = 5;
export const N_MINIMO_CHANCE = 20;

/** Corte de alta produtividade efetivamente usado. `null` se não der para decidir. */
export function corteDeProdutividade(produtividades: number[], opcoes: OpcoesChance = {}): number | null {
  if (typeof opcoes.corteKgha === 'number' && Number.isFinite(opcoes.corteKgha)) return opcoes.corteKgha;
  const validas = produtividades.filter(p => Number.isFinite(p)).sort((a, b) => a - b);
  if (!validas.length) return null;
  return quantil(validas, opcoes.percentil ?? PERCENTIL_CORTE_PADRAO);
}

/**
 * Chance Matemática de UM nutriente. `null` quando a população é pequena
 * demais, quando todos os teores são iguais (não há classe a formar) ou quando
 * nenhuma amostra de alta produtividade tem o teor medido.
 */
export function chanceDoNutriente(
  populacao: AmostraPopulacao[],
  nutriente: NutrienteId,
  corteKgha: number,
  opcoes: OpcoesChance = {},
): ChanceNutriente | null {
  const nClasses = Math.max(2, Math.floor(opcoes.nClasses ?? N_CLASSES_PADRAO));
  const nMinimo = opcoes.nMinimo ?? N_MINIMO_CHANCE;

  const pontos = populacao
    .map(a => ({ teor: a.teores[nutriente], prod: a.produtividadeKgha }))
    .filter((p): p is { teor: number; prod: number } =>
      typeof p.teor === 'number' && Number.isFinite(p.teor) && Number.isFinite(p.prod));
  if (pontos.length < nMinimo) return null;

  const ordenados = pontos.map(p => p.teor).sort((a, b) => a - b);
  if (ordenados[0] === ordenados[ordenados.length - 1]) return null;   // teor constante

  // Limites por quantil. Os extremos vão para −∞/+∞ na prática: a primeira e a
  // última classe precisam capturar qualquer amostra futura fora do observado.
  const limites: number[] = [];
  for (let k = 0; k <= nClasses; k++) limites.push(quantil(ordenados, k / nClasses));

  const indiceDaClasse = (teor: number): number => {
    for (let k = 1; k < nClasses; k++) if (teor <= limites[k]) return k - 1;
    return nClasses - 1;
  };

  const nAltaTotal = pontos.filter(p => p.prod >= corteKgha).length;
  if (!nAltaTotal) return null;

  const baldes = Array.from({ length: nClasses }, (_, i) => ({
    i, n: 0, nAlta: 0, somaTeorAlta: 0,
  }));
  for (const p of pontos) {
    const b = baldes[indiceDaClasse(p.teor)];
    b.n++;
    if (p.prod >= corteKgha) { b.nAlta++; b.somaTeorAlta += p.teor; }
  }

  const classes: ClasseChance[] = baldes.map(b => {
    const probAlta = b.n ? b.nAlta / b.n : 0;
    return {
      i: b.i, min: limites[b.i], max: limites[b.i + 1],
      n: b.n, nAlta: b.nAlta, probAlta,
      chance: probAlta * (b.nAlta / nAltaTotal),
    };
  });

  let otima = 0;
  for (let k = 1; k < classes.length; k++) if (classes[k].chance > classes[otima].chance) otima = k;
  if (!(classes[otima].chance > 0)) return null;

  const balde = baldes[otima];
  const teorOtimo = balde.nAlta ? balde.somaTeorAlta / balde.nAlta : (classes[otima].min + classes[otima].max) / 2;

  return {
    nutriente,
    classes,
    classeOtima: otima,
    teorOtimo,
    faixaOtima: { min: classes[otima].min, max: classes[otima].max },
    n: pontos.length,
  };
}

/** Chance Matemática de todos os nutrientes que a população sustenta. */
export function gerarChance(populacao: AmostraPopulacao[], opcoes: OpcoesChance = {}): NormaChance | null {
  const corte = corteDeProdutividade(populacao.map(a => a.produtividadeKgha), opcoes);
  if (corte == null) return null;

  const porNutriente: NormaChance['porNutriente'] = {};
  let algum = false;
  for (const id of NUTRIENTES) {
    const c = chanceDoNutriente(populacao, id, corte, opcoes);
    if (c) { porNutriente[id] = c; algum = true; }
  }
  return algum ? { corteKgha: corte, porNutriente } : null;
}

/**
 * Diagnostica UMA amostra contra uma Chance Matemática já calculada.
 * `null` quando a norma não traz ChM ou quando nenhum nutriente casou.
 */
export function diagnosticarChance(teores: TeoresFoliares, chance: NormaChance | null | undefined): ResultadoChance | null {
  if (!chance || !chance.porNutriente) return null;

  const itens: DiagnosticoChance[] = [];
  const semDado: NutrienteId[] = [];

  for (const id of NUTRIENTES) {
    const c = chance.porNutriente[id];
    if (!c) continue;
    const teor = teores[id];
    if (typeof teor !== 'number' || !Number.isFinite(teor)) { semDado.push(id); continue; }

    const situacao: DiagnosticoChance['situacao'] =
      teor < c.faixaOtima.min ? 'abaixo' : teor > c.faixaOtima.max ? 'acima' : 'dentro';
    const estado = situacao === 'abaixo' ? 'deficiente' : situacao === 'acima' ? 'excessivo' : 'adequado';

    const classe = c.classes.find(k => teor >= k.min && teor <= k.max)
      ?? (teor < c.classes[0].min ? c.classes[0] : c.classes[c.classes.length - 1]);

    itens.push({
      nutriente: id, teor, situacao, estado,
      teorOtimo: c.teorOtimo, faixaOtima: c.faixaOtima,
      chanceNaClasse: classe ? classe.chance : null,
    });
  }

  if (!itens.length) return null;

  const avisos: string[] = [];
  if (semDado.length) avisos.push(`Com chance matemática na norma mas sem teor no laudo: ${semDado.join(', ')}.`);
  avisos.push('A chance matemática mede FREQUÊNCIA de alta produtividade, não causalidade; em micronutrientes ela costuma divergir do DRIS/CND enquanto a população for pequena (Serra et al., 2007).');

  return { itens, corteKgha: chance.corteKgha, avisos };
}
