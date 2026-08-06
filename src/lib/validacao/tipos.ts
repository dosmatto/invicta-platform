// VALIDAÇÃO DE ZONAS DE MANEJO — contrato do relatório.
//
// Três regras do projeto estão codificadas AQUI, não na tela, para não
// dependerem de quem desenha o dashboard:
//
//  1. Nunca só o CV. O CV é UM indicador entre os 16 da lista abaixo, e o
//     índice composto (IQZM) só existe depois que os individuais existem.
//  2. Todos aparecem SEMPRE. `INDICADORES_DASHBOARD` é a lista fechada e
//     ordenada; o relatório devolve todos, e o que não dá para calcular vem
//     com `pendencia` dizendo o que falta — nunca sumindo da tela.
//  3. Toda recomendação é justificada. Recomendação sem `base` (os indicadores
//     que a sustentam) não é construída.
//
// Módulo PURO — testável em node (npm run teste:validacao).

// 'neutro' = número descritivo (média, mínimo…): informa, não julga. Sem ele a
// tela teria de inventar uma cor de qualidade para "média = 3.412 kg/ha".
export type FaixaQualidade = 'otimo' | 'bom' | 'regular' | 'ruim' | 'neutro' | 'pendente';

export const ROTULO_FAIXA: Record<FaixaQualidade, string> = {
  otimo: 'Ótimo', bom: 'Bom', regular: 'Regular', ruim: 'Ruim', neutro: '—', pendente: 'Sem dado',
};

export const COR_FAIXA: Record<FaixaQualidade, string> = {
  otimo: '#22c55e', bom: '#84cc16', regular: '#eab308', ruim: '#ef4444', neutro: '#cbd5e1', pendente: '#64748b',
};

export interface Indicador {
  id: string;
  nome: string;
  /** null quando não há dado suficiente — nunca 0 "de mentira". */
  valor: number | null;
  unidade: string;
  faixa: FaixaQualidade;
  /** Por que este número é bom ou ruim, em português, com os limiares usados. */
  justificativa: string;
  /** O que falta para calcular. Presente ⇒ faixa 'pendente'. */
  pendencia?: string;
  /** Entradas do cálculo — rastreabilidade (regra: sem caixa-preta). */
  entradas?: Record<string, number | string | null>;
}

/** Lista FECHADA e ordenada do dashboard (spec §Dashboard). */
export const INDICADORES_DASHBOARD = [
  'iqzm', 'ica', 'ivr', 'ipe',
  'cv', 'media', 'mediana', 'minimo', 'maximo', 'amplitude', 'desvio',
  'fragmentacao', 'homogeneidade', 'continuidade', 'separacao', 'safras',
] as const;

export type IdIndicador = typeof INDICADORES_DASHBOARD[number];

export const NOME_INDICADOR: Record<IdIndicador, string> = {
  iqzm: 'IQZM — Qualidade do zoneamento',
  ica: 'ICA — Confiança da análise',
  ivr: 'IVR — Variabilidade relativa',
  ipe: 'IPE — Persistência espacial',
  cv: 'CV (coeficiente de variação)',
  media: 'Média',
  mediana: 'Mediana',
  minimo: 'Mínimo',
  maximo: 'Máximo',
  amplitude: 'Amplitude',
  desvio: 'Desvio padrão',
  fragmentacao: 'Fragmentação',
  homogeneidade: 'Homogeneidade interna',
  continuidade: 'Continuidade espacial',
  separacao: 'Separação entre zonas',
  safras: 'Número de safras',
};

export interface Recomendacao {
  texto: string;
  /** ids dos indicadores que sustentam a frase (regra 3). */
  base: IdIndicador[];
  severidade: 'critica' | 'atencao' | 'informativa';
}

export interface ResumoValores {
  n: number;
  media: number;
  mediana: number;
  min: number;
  max: number;
  amplitude: number;
  desvio: number;
  cv: number | null;          // % — null quando a média é ~0 (divisão sem sentido)
  p5: number; p25: number; p75: number; p95: number;
  iqr: number;
  outliers: number;           // nº de valores fora de [p25-1,5·IQR, p75+1,5·IQR]
  pctOutliers: number;        // %
}

export interface ValidacaoZona {
  idZona: string;
  nome: string;
  classe: string;
  cor: string;
  areaHa: number;
  percArea: number;           // 0..1
  rank?: number;
  nPoligonos: number;
  resumo: ResumoValores | null;
  ivr: Indicador;
}

export interface RelatorioValidacao {
  cenarioId: string;
  cenarioNome: string;
  /** Camada usada como referência dos indicadores estatísticos. */
  camadaValidacao: { id: string; nome: string; unidade: string } | null;
  /** SEMPRE os 16 da lista, na ordem, mesmo os pendentes. */
  indicadores: Indicador[];
  porZona: ValidacaoZona[];
  /** true quando algum componente do IQZM ficou pendente (ex.: 1 safra só). */
  parcial: boolean;
  recomendacoes: Recomendacao[];
}

// ── Helpers de faixa ────────────────────────────────────────────────────────

/** Faixa de um escore 0..100 em que MAIOR é melhor (IQZM, ICA, IPE…). */
export function faixaMaiorMelhor(v: number): FaixaQualidade {
  if (v >= 80) return 'otimo';
  if (v >= 65) return 'bom';
  if (v >= 45) return 'regular';
  return 'ruim';
}

/** Faixa de um escore 0..100 em que MENOR é melhor (IVR, fragmentação…). */
export function faixaMenorMelhor(v: number): FaixaQualidade {
  if (v <= 20) return 'otimo';
  if (v <= 35) return 'bom';
  if (v <= 55) return 'regular';
  return 'ruim';
}

/** Indicador pendente — o que a tela mostra quando falta dado (regra 2). */
export function pendente(id: IdIndicador, motivo: string, unidade = ''): Indicador {
  return {
    id, nome: NOME_INDICADOR[id], valor: null, unidade,
    faixa: 'pendente', justificativa: motivo, pendencia: motivo,
  };
}

/** Indicador puramente descritivo (média, mínimo…): número sem juízo de valor. */
export function descritivo(id: IdIndicador, valor: number | null, unidade: string, justificativa: string): Indicador {
  // Arredonda em 2 casas: o valor cru (3217.0979603562196) vaza para PDF, Excel
  // e para quem consumir o relatório — a precisão que o dado não tem.
  return valor == null
    ? pendente(id, justificativa, unidade)
    : { id, nome: NOME_INDICADOR[id], valor: Math.round(valor * 100) / 100, unidade, faixa: 'neutro', justificativa };
}
