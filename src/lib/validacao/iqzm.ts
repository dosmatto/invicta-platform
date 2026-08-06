// IQZM — Índice de Qualidade do Zoneamento.
//
// RESUMO EXECUTIVO, nunca substituto: é uma média ponderada de indicadores que
// já existem por conta própria e continuam na tela ao lado dele. Quem decide
// olha o número; quem discorda abre os componentes e vê qual puxou para baixo.
//
// Componente ausente NÃO vira zero. Zero diria "essa dimensão foi medida e é
// péssima" — mentira quando o que houve foi falta de dado. O peso do ausente é
// redistribuído entre os presentes e o índice sai marcado como PARCIAL, com a
// lista do que ficou de fora.
//
// npm run teste:validacao

import { faixaMaiorMelhor, NOME_INDICADOR, pendente, type Indicador } from './tipos.ts';

export const PESOS_IQZM = {
  homogeneidade: 0.30,   // 100 − IVR (variabilidade interna das zonas)
  separacao: 0.25,       // η² — as zonas são coisas diferentes entre si?
  continuidade: 0.15,    // manchas inteiriças, forma operável
  fragmentacao: 0.10,    // penaliza respingo (invertido: menor fragmentação = melhor)
  ipe: 0.15,             // persistência entre safras
  ica: 0.05,             // confiança da base de dados
} as const;

export type ComponenteIQZM = keyof typeof PESOS_IQZM;

export const NOME_COMPONENTE: Record<ComponenteIQZM, string> = {
  homogeneidade: 'homogeneidade interna',
  separacao: 'separação entre zonas',
  continuidade: 'continuidade espacial',
  fragmentacao: 'fragmentação',
  ipe: 'persistência entre safras',
  ica: 'confiança da base',
};

export interface EntradaIQZM {
  /** Cada componente em 0..100, MAIOR = melhor. null = não medido. */
  componentes: Partial<Record<ComponenteIQZM, number | null>>;
}

export interface ResultadoIQZM {
  indicador: Indicador;
  parcial: boolean;
  ausentes: ComponenteIQZM[];
  /** Contribuição de cada componente no número final (peso já renormalizado). */
  contribuicoes: Array<{ componente: ComponenteIQZM; valor: number; peso: number; contribuicao: number }>;
}

const fmt = (v: number, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

export function calcularIQZM(e: EntradaIQZM): ResultadoIQZM {
  const ids = Object.keys(PESOS_IQZM) as ComponenteIQZM[];
  const presentes = ids.filter(k => {
    const v = e.componentes[k];
    return typeof v === 'number' && Number.isFinite(v);
  });
  const ausentes = ids.filter(k => !presentes.includes(k));

  if (!presentes.length) {
    return {
      indicador: pendente('iqzm', 'Nenhum componente pôde ser medido — sem camada de validação não há qualidade a resumir.'),
      parcial: true, ausentes, contribuicoes: [],
    };
  }

  const somaPesos = presentes.reduce((s, k) => s + PESOS_IQZM[k], 0);
  const contribuicoes = presentes.map(k => {
    const valor = Math.min(100, Math.max(0, e.componentes[k] as number));
    const peso = PESOS_IQZM[k] / somaPesos;
    return { componente: k, valor, peso, contribuicao: valor * peso };
  });
  const iqzm = contribuicoes.reduce((s, c) => s + c.contribuicao, 0);
  const faixa = faixaMaiorMelhor(iqzm);

  const ordenados = [...contribuicoes].sort((a, b) => a.valor - b.valor);
  const pior = ordenados[0], melhor = ordenados[ordenados.length - 1];
  const leitura = faixa === 'otimo' ? 'Zoneamento sólido — pode ir para prescrição.'
    : faixa === 'bom' ? 'Zoneamento utilizável, com pontos a melhorar.'
    : faixa === 'regular' ? 'Zoneamento aproveitável, mas revise antes de prescrever.'
    : 'Zoneamento fraco — refazer tende a render mais que ajustar.';

  const nota = ausentes.length
    ? ` PARCIAL: ${ausentes.map(a => NOME_COMPONENTE[a]).join(' e ')} não pôde(ram) ser medido(s); o peso foi redistribuído entre os demais.`
    : '';

  return {
    indicador: {
      id: 'iqzm', nome: NOME_INDICADOR.iqzm, valor: Math.round(iqzm * 10) / 10, unidade: '',
      faixa,
      justificativa: `${leitura} Puxa para baixo: ${NOME_COMPONENTE[pior.componente]} (${fmt(pior.valor)}/100). Sustenta: ${NOME_COMPONENTE[melhor.componente]} (${fmt(melhor.valor)}/100).${nota} Resumo executivo — os indicadores individuais continuam válidos por si.`,
      entradas: Object.fromEntries(contribuicoes.map(c => [c.componente, Math.round(c.valor * 10) / 10])),
    },
    parcial: ausentes.length > 0,
    ausentes,
    contribuicoes,
  };
}
