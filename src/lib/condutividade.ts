// Condutividade Elétrica — helpers próprios do módulo. O import de pontos e o
// mapeamento de colunas REUSAM a Compactação (parseArquivoPontos); aqui ficam só
// as partes específicas da EC: o índice de qualidade do levantamento.

export {
  parseArquivoPontos,
  pontosCompactacao as pontosCondutividade,
  type ArquivoPontos,
  type PontoBruto,
} from './compactacao';

export type ClasseQualidade = 'Excelente' | 'Boa' | 'Regular' | 'Baixa';

export interface QualidadeEC {
  n: number;                 // nº de pontos válidos
  rmse: number | null;       // erro da validação cruzada (na unidade)
  rmseRel: number | null;    // rmse / amplitude (0..1) — menor é melhor
  classe: ClasseQualidade;
  apto: boolean;             // apto p/ gerar Zonas de Manejo (MEAP)
  motivo: string;
}

// Classifica a qualidade do levantamento a partir do erro da validação cruzada
// (krigagem) normalizado pela amplitude dos valores. Sem limpeza ainda (C1), o
// "percentual removido" entra na C2; aqui a qualidade é honesta sobre o que há.
export function avaliarQualidade(opts: { n: number; rmse: number | null; min: number | null; max: number | null }): QualidadeEC {
  const { n, rmse, min, max } = opts;
  const ampl = (min != null && max != null && max > min) ? max - min : null;
  const rmseRel = (rmse != null && ampl) ? rmse / ampl : null;

  let classe: ClasseQualidade;
  if (n < 10) classe = 'Baixa';
  else if (rmseRel == null) classe = 'Regular';
  else if (rmseRel < 0.08) classe = 'Excelente';
  else if (rmseRel < 0.15) classe = 'Boa';
  else if (rmseRel < 0.25) classe = 'Regular';
  else classe = 'Baixa';

  const apto = classe !== 'Baixa' && n >= 10;
  const motivo = n < 10
    ? 'Poucos pontos válidos (mín. ~10) para um mapa confiável.'
    : rmseRel == null
      ? 'Sem erro de validação cruzada disponível (avaliação parcial).'
      : `Erro relativo da validação cruzada de ${(rmseRel * 100).toFixed(0)}% da amplitude.`;
  return { n, rmse, rmseRel, classe, apto, motivo };
}

export const CORES_QUALIDADE: Record<ClasseQualidade, { cor: string; bg: string }> = {
  Excelente: { cor: '#86efac', bg: '#0f2a1a' },
  Boa: { cor: '#93c5fd', bg: '#0b1f3a' },
  Regular: { cor: '#fbbf24', bg: '#2d1a00' },
  Baixa: { cor: '#f87171', bg: '#2a0f12' },
};
