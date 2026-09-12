// CND — Compositional Nutrient Diagnosis (Parent & Dafir, 1992).
//
// POR QUE EXISTE AO LADO DO DRIS: teor foliar é DADO COMPOSICIONAL — as partes
// somam um total fechado (1000 g/kg de matéria seca). Num espaço fechado, subir
// um nutriente obriga os outros a descer, e razões simples (o DRIS) herdam essa
// dependência sem tratá-la. Aitchison resolve com a transformação log-razão
// centrada (clr), e é ela que o CND usa.
//
// A CONTA, na ordem em que está implementada:
//   1. Tudo para g/kg. Somar N em g/kg com Zn em mg/kg erra por 1000× e o
//      resultado continua parecendo plausível — por isso a conversão é a
//      PRIMEIRA coisa que acontece aqui, via `teoresEmGkg`.
//   2. Resíduo R = 1000 − Σ teores. É o que FECHA a composição: sem R, a soma
//      das partes não é o todo e o clr deixa de ser válido. R ≤ 0 significa
//      laudo impossível (teores somando mais que a matéria seca) e o método
//      devolve `null` em vez de um logaritmo de número negativo.
//   3. Média geométrica de TODOS os componentes, R incluído.
//   4. zX = ln(vX / mGeo) — o clr.
//   5. IZ = (zX − mX) / sX, com mX e sX da população de referência (norma).
//   6. CND-r² = Σ IZ² — o estado nutricional global, análogo ao IBN.
//   7. D² de Mahalanobis, SÓ quando a norma traz a matriz de covariância
//      inversa. Sem ela o campo é `null`: o CND clássico não tem como estimar
//      covariância a partir de uma única amostra, e devolver a distância
//      euclidiana no lugar seria vender gato por lebre (ledger 17).
//
// Fonte: Parent & Dafir (1992); síntese em `.workflow/scratch/dris-ciencia.md` §2.
//
// Módulo PURO — sem DOM, sem I/O. npm run teste:foliar

import { classeWadt, estadoDaClasse, ordenarPorLimitacao } from './interpretacao.ts';
import { teoresEmGkg } from './nutrientes.ts';
import {
  type IndiceCnd, type NormaDris, type NutrienteId, type ResultadoCnd, type TeoresFoliares,
} from './tipos.ts';

/** Matéria seca de referência, em g/kg — o "100%" que a composição fecha. */
export const MATERIA_SECA_GKG = 1000;

/** Rótulo do componente residual no vetor clr. */
export const COMPONENTE_RESIDUO = 'R';

export interface Clr {
  /** zX por componente, incluindo `R`. */
  valores: Record<string, number>;
  mediaGeometrica: number;
  residuoGkg: number;
}

/**
 * Transformação log-razão centrada da amostra. `null` quando a composição não
 * fecha (resíduo ≤ 0) ou quando não há nutriente analisado.
 */
export function calcularClr(teores: TeoresFoliares): Clr | null {
  const gkg = teoresEmGkg(teores);
  const ids = Object.keys(gkg) as NutrienteId[];
  if (!ids.length) return null;

  let soma = 0;
  for (const id of ids) soma += gkg[id] as number;
  const residuoGkg = MATERIA_SECA_GKG - soma;
  if (!(residuoGkg > 0)) return null;

  const componentes: Array<[string, number]> = ids.map(id => [id, gkg[id] as number]);
  componentes.push([COMPONENTE_RESIDUO, residuoGkg]);

  let somaLn = 0;
  for (const [, v] of componentes) somaLn += Math.log(v);
  const mediaGeometrica = Math.exp(somaLn / componentes.length);
  if (!Number.isFinite(mediaGeometrica) || mediaGeometrica <= 0) return null;

  const valores: Record<string, number> = {};
  for (const [k, v] of componentes) valores[k] = Math.log(v / mediaGeometrica);
  return { valores, mediaGeometrica, residuoGkg };
}

/**
 * D² de Mahalanobis do vetor clr contra o centro da norma.
 * `null` sempre que faltar matriz, ordem ou algum componente — a distância
 * multivariada não admite componente faltando, e preencher com zero moveria o
 * ponto para o centro, subestimando o desequilíbrio justamente na amostra
 * incompleta.
 */
export function mahalanobis(clr: Record<string, number>, norma: NonNullable<NormaDris['cnd']>): number | null {
  const inv = norma.covInversa;
  const ordem = norma.ordem;
  if (!inv || !ordem || !ordem.length) return null;
  if (inv.length !== ordem.length) return null;

  const d: number[] = [];
  for (const k of ordem) {
    const z = clr[k];
    const m = norma.media[k];
    if (typeof z !== 'number' || !Number.isFinite(z)) return null;
    if (typeof m !== 'number' || !Number.isFinite(m)) return null;
    d.push(z - m);
  }

  let acc = 0;
  for (let i = 0; i < d.length; i++) {
    const linha = inv[i];
    if (!linha || linha.length !== d.length) return null;
    for (let j = 0; j < d.length; j++) acc += d[i] * linha[j] * d[j];
  }
  return Number.isFinite(acc) ? acc : null;
}

/**
 * Índices CND da amostra. Devolve `null` quando a norma não tem estatísticas
 * clr ou quando a composição da amostra não fecha.
 *
 * As classes de Wadt são aplicadas ao IZ usando a MÉDIA DOS |IZ| como régua —
 * o análogo direto do IBNm do DRIS. Está documentado aqui porque é uma
 * extensão nossa: Wadt definiu as classes sobre o índice DRIS, e usá-las no
 * CND só é legítimo porque IZ tem a mesma semântica de sinal (negativo =
 * deficiente) e a mesma propriedade de somar ~zero.
 */
export function calcularCnd(teores: TeoresFoliares, norma: Pick<NormaDris, 'cnd'>): ResultadoCnd | null {
  const cnd = norma?.cnd;
  if (!cnd || !cnd.media || !cnd.dp) return null;

  const clr = calcularClr(teores);
  if (!clr) return null;

  const avisos: string[] = [];
  const semNorma: string[] = [];
  const brutos: Array<{ nutriente: NutrienteId; indice: number; clr: number }> = [];

  for (const k of Object.keys(clr.valores)) {
    if (k === COMPONENTE_RESIDUO) continue;            // o resíduo fecha a conta, não se diagnostica
    const nutriente = k as NutrienteId;
    const m = cnd.media[k];
    const s = cnd.dp[k];
    if (typeof m !== 'number' || !Number.isFinite(m) || typeof s !== 'number' || !(s > 0)) {
      semNorma.push(k);
      continue;
    }
    brutos.push({ nutriente, indice: (clr.valores[k] - m) / s, clr: clr.valores[k] });
  }

  if (!brutos.length) return null;

  const r2 = brutos.reduce((s, b) => s + b.indice * b.indice, 0);
  const izm = brutos.reduce((s, b) => s + Math.abs(b.indice), 0) / brutos.length;

  const ordenados = ordenarPorLimitacao(brutos);
  const indices: IndiceCnd[] = ordenados.map((b, k) => {
    const classe = classeWadt(b.indice, izm);
    return {
      nutriente: b.nutriente,
      clr: b.clr,
      iz: b.indice,
      classe,
      estado: estadoDaClasse(classe),
      ordem: k + 1,
    };
  });

  if (semNorma.length) {
    avisos.push(`Sem estatística clr na norma para: ${semNorma.join(', ')} — estes nutrientes ficaram fora do CND.`);
  }
  const d2 = mahalanobis(clr.valores, cnd);
  if (d2 == null) {
    avisos.push('Distância de Mahalanobis não calculada: a norma não traz a matriz de covariância inversa dos valores clr.');
  }

  return {
    indices,
    r2,
    izm,
    residuoGkg: clr.residuoGkg,
    mahalanobis: d2,
    ordemLimitacao: indices.map(i => i.nutriente),
    avisos,
  };
}
