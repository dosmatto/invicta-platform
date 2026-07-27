// Fonte ÚNICA da classificação por faixa da DOSE — usada pelo MAPA (colorirDose)
// e pela TABELA "Plano de aplicação" (relatorioCenarios).
//
// Por que existe (bug corrigido em 2026-07-27): as duas usavam listas de classes
// DIFERENTES. A tabela descartava as classes abaixo da dose mínima da equação
// (`limiteSuperior > min`) e reindexava; o mapa usava TODAS as classes. Com piso
// operacional (`abaixoMinimo: 'minimo'`), todo pixel abaixo da mínima vira
// EXATAMENTE a mínima — e, no mapa, `1000 <= 1000` caía na classe "50–1.000"
// (roxa), enquanto a tabela contava o mesmo pixel em "1.000–2.000" (azul).
// Resultado: o mapa exibia cores que não existiam na legenda.

export interface ClasseFaixa { cor: string; limiteSuperior: number }

// Classes que PODEM ocorrer, dada a dose mínima da equação (as abaixo dela não
// ocorrem: o motor já pisou/zerou esses valores). doseMinima 0 = todas.
export function classesVisiveis<T extends ClasseFaixa>(classes: T[], doseMinima = 0): T[] {
  const ordenadas = [...classes]
    .filter(c => Number.isFinite(c.limiteSuperior))
    .sort((a, b) => a.limiteSuperior - b.limiteSuperior);
  const min = Math.max(0, doseMinima);
  if (min <= 0) return ordenadas;
  const visiveis = ordenadas.filter(c => c.limiteSuperior > min);
  // Segurança: se a mínima for maior que TODOS os limites, mantém a última
  // classe (senão o mapa ficaria sem cor alguma).
  return visiveis.length > 0 ? visiveis : ordenadas.slice(-1);
}

// Índice da faixa de um valor: 1ª classe cujo limite superior ≥ valor; acima do
// maior limite, a última classe.
export function indiceClasse(v: number, lims: number[]): number {
  const k = lims.findIndex(L => v <= L);
  return k < 0 ? lims.length - 1 : k;
}
