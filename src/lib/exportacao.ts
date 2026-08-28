// EXPORTAÇÃO DE NUTRIENTES pela colheita: quanto de cada nutriente saiu do
// talhão dentro do grão, e quanto de fertilizante reporia isso.
//
// BASE DAS UNIDADES (desde 27/08/2026): os coeficientes de exportação e
// extração são em ELEMENTO (P, K); a garantia do fertilizante continua em
// ÓXIDO (P₂O₅, K₂O), como vem no saco. Quem chama `equivalentesDe` é
// responsável por converter a demanda para óxido antes — ver
// lib/nutrienteBase.ts e ProdutividadeSection.
//
// Mesma forma matemática de `nutrientesPorZona` (prescricao/calculo.ts):
// quantidade × teor. Aqui a quantidade é a produtividade do pixel e o teor é o
// coeficiente de exportação da cultura, em kg de óxido por TONELADA colhida.
//
// Duas divisões perigosas moram neste arquivo, e as duas devolvem "não sei" em
// vez de um número: garantia zero (dividir por ela daria Infinity chegando à
// tela como dose absurda — a mesma armadilha já tratada em
// `complementarNutriente`) e preço ausente (que jamais pode virar 0, porque 0
// diz "de graça").
//
// Módulo PURO. npm run teste:exportacao

import type { Nutriente } from './insumos.ts';

/**
 * kg do nutriente, em ELEMENTO (P, K), exportados por TONELADA de produto
 * colhido na umidade comercial. O coeficiente depende da umidade de referência
 * — por isso ela viaja junto no cadastro.
 */
export type CoeficientesExportacao = Partial<Record<Nutriente, number>>;

/** Coeficiente da tabela. null = NÃO DECLARADO, distinto de 0 declarado. */
export function coefDe(c: CoeficientesExportacao | null | undefined, nut: Nutriente): number | null {
  const v = c?.[nut];
  return Number.isFinite(v) && (v as number) >= 0 ? (v as number) : null;
}

/** kg/ha do nutriente saídos com a colheita naquele pixel. NaN preservado. */
export function exportadoDoPixel(prodKgha: number, coefKgPorT: number): number {
  if (!Number.isFinite(prodKgha)) return NaN;
  return (prodKgha / 1000) * coefKgPorT;
}

/** Grid derivado em kg/ha do nutriente, mesma malha. Array novo. */
export function gridExportacao(valoresKgha: ArrayLike<number>, coefKgPorT: number): Float32Array {
  const out = new Float32Array(valoresKgha.length);
  for (let i = 0; i < valoresKgha.length; i++) out[i] = exportadoDoPixel(valoresKgha[i], coefKgPorT);
  return out;
}

export interface ResumoExportacao {
  coefKgPorT: number;
  nPixels: number;
  areaHa: number;
  produtividadeMediaKgha: number;
  mediaKgHa: number;
  minKgHa: number;
  maxKgHa: number;
  /** Σ kg/ha × ha — o total que saiu do talhão. */
  totalKg: number;
}

export function resumoExportacao(
  valoresKgha: ArrayLike<number>,
  p: { coefKgPorT: number; pixelM: number },
): ResumoExportacao | null {
  const { coefKgPorT, pixelM } = p;
  if (!Number.isFinite(coefKgPorT) || coefKgPorT < 0) return null;
  // MESMA conta de área de statsDoGrid/classesQuantis — a tabela precisa fechar
  // com a faixa de estatísticas da página 1.
  const pixelHa = (pixelM * pixelM) / 10000;
  let n = 0, soma = 0, mn = Infinity, mx = -Infinity;
  for (let i = 0; i < valoresKgha.length; i++) {
    const v = valoresKgha[i];
    if (!Number.isFinite(v)) continue;
    n++; soma += v;
    const e = (v / 1000) * coefKgPorT;
    if (e < mn) mn = e;
    if (e > mx) mx = e;
  }
  if (n === 0) return null;
  const areaHa = n * pixelHa;
  const prodMedia = soma / n;
  const mediaKgHa = (prodMedia / 1000) * coefKgPorT;
  return {
    coefKgPorT, nPixels: n, areaHa,
    produtividadeMediaKgha: prodMedia,
    mediaKgHa, minKgHa: mn, maxKgHa: mx,
    totalKg: mediaKgHa * areaHa,
  };
}

// ── Equivalentes em fertilizante ────────────────────────────────────────────

export interface ProdutoEquivalente {
  insumoId?: string;
  nome: string;
  /** % do nutriente na massa do produto (garantiaDe). KCl = 60. */
  garantiaPct: number;
  /** R$/t. null = DESCONHECIDO — nunca 0, que diria "de graça". */
  precoT?: number | null;
}

export interface EquivalenteFertilizante extends ProdutoEquivalente {
  doseMediaKgHa: number;
  totalT: number;
  custoHa: number | null;
  custoTotal: number | null;
}

/**
 * Quanto de cada produto reporia a exportação média.
 *
 * `nutrienteMedioKgHa` tem de chegar na MESMA base da garantia do produto —
 * óxido. A exportação é calculada em elemento, então o chamador converte antes
 * (paraOxido). Dividir elemento por garantia em óxido erra a dose para MENOS.
 *
 * Garantia ausente, zero ou negativa é PULADA, não dividida: o resultado seria
 * Infinity chegando à tela como uma dose absurda e crível.
 *
 * IMPORTANTE: isto é REPOSIÇÃO da exportação, não recomendação de adubação —
 * não considera teor do solo, resposta da cultura nem eficiência do produto.
 * O relatório é obrigado a dizer isso junto da tabela.
 */
export function equivalentesDe(
  nutrienteMedioKgHa: number, areaHa: number, produtos: ProdutoEquivalente[],
): EquivalenteFertilizante[] {
  if (!Number.isFinite(nutrienteMedioKgHa) || nutrienteMedioKgHa < 0) return [];
  return produtos
    .filter(p => Number.isFinite(p.garantiaPct) && p.garantiaPct > 0)
    .map(p => {
      const doseMediaKgHa = nutrienteMedioKgHa / (p.garantiaPct / 100);
      const totalT = (doseMediaKgHa * areaHa) / 1000;
      const preco = Number.isFinite(p.precoT) && (p.precoT as number) > 0 ? (p.precoT as number) : null;
      const custoHa = preco != null ? (doseMediaKgHa / 1000) * preco : null;
      return {
        ...p,
        doseMediaKgHa, totalT,
        custoHa,
        custoTotal: custoHa != null ? custoHa * areaHa : null,
      };
    })
    .sort((a, b) => b.garantiaPct - a.garantiaPct);   // mais concentrado primeiro
}
