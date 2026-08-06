// ICA — Índice de Confiança da Análise.
//
// Não mede o zoneamento: mede a BASE em que ele foi feito. IQZM 91 sobre uma
// safra e um mapa de 30 m não vale o mesmo que IQZM 91 sobre cinco safras,
// NDVI, produtividade e condutividade — e sem o ICA ao lado os dois aparecem
// como "número alto".
//
// POR QUE FICA FORA DO IQZM: se a confiança entrasse na média, um IQZM 91 com
// base fraca cairia para ~87 e continuaria parecendo excelente — o alerta some
// dentro do próprio número que ele deveria qualificar. Os dois andam LADO A
// LADO: um diz se o mapa é bom, o outro diz se dá para acreditar nele.
//
// Sete entradas, todas objetivas e medidas dos próprios dados:
//   safras · camadas · resolução · cobertura · observações ·
//   qualidade dos dados (ruído/outliers) · consistência entre os mapas.
//
// npm run teste:validacao

import { escoreBom, escoreRuim } from './estatistica.ts';
import { NOME_INDICADOR, type FaixaQualidade, type Indicador } from './tipos.ts';

export const LIMIARES_ICA = {
  safras: { ruim: 1, bom: 4 },          // 1 safra = base fraca; 4+ = série
  camadas: { ruim: 1, bom: 4 },
  resolucaoM: { bom: 5, ruim: 30 },     // metros por pixel — menor é melhor
  coberturaPct: { ruim: 60, bom: 95 },  // % da área das zonas com dado
  observacoes: { ruim: 100, bom: 2000 },
  outliersPct: { bom: 0, ruim: 10 },    // ruído da camada de validação
  consistenciaPct: { ruim: 60, bom: 95 }, // cobertura média das camadas entre si
};

const PESOS = {
  safras: 0.25, camadas: 0.15, resolucao: 0.10, cobertura: 0.15,
  observacoes: 0.10, qualidade: 0.15, consistencia: 0.10,
};

/**
 * TETO por número de safras — e não só peso.
 *
 * Com peso, um mapa único e perfeito (cobertura 100%, sem ruído, alta
 * resolução) empurrava o ICA para ~55 mesmo com UMA safra: os outros cinco
 * componentes somam metade da nota e todos batiam no máximo. Só que uma safra
 * é UMA observação de um sorteio — o ano climático —, e nenhuma qualidade de
 * mapa substitui repetição. O teto diz isso de forma explícita e explicável:
 * "limitado a 48 porque há apenas uma safra".
 */
export const TETO_POR_SAFRAS: Record<number, number> = { 0: 35, 1: 48, 2: 68, 3: 84 };
export const tetoDeSafras = (n: number): number => (n >= 4 ? 100 : TETO_POR_SAFRAS[Math.max(0, n)] ?? 100);

export interface EntradaICA {
  nSafras: number;
  nCamadas: number;
  /** metros por pixel da camada de validação (null = desconhecida). */
  resolucaoM: number | null;
  /** % da área das zonas com pixel válido na camada de validação. */
  coberturaPct: number;
  /** nº de observações usadas (pixels amostrados + pontos de laboratório). */
  nObservacoes: number;
  /** % de outliers da camada de validação — proxy de ruído/sujeira do mapa. */
  outliersPct?: number | null;
  /** cobertura MÉDIA das demais camadas (mapa que só cobre meio talhão derruba). */
  consistenciaPct?: number | null;
  /** camada com a pior cobertura — entra na justificativa. */
  piorCamada?: { nome: string; coberturaPct: number } | null;
}

export interface ResultadoICA {
  indicador: Indicador;
  componentes: Record<string, number>;
  /** Rótulo agronômico da confiança ("Muito alta", "Baixa"…). */
  rotulo: string;
  /** O componente mais fraco — o que explica o número e o que melhorar. */
  gargalo: { id: string; nome: string; escore: number };
}

const NOME_COMP: Record<string, string> = {
  safras: 'número de safras',
  camadas: 'número de camadas',
  cobertura: 'cobertura da área',
  observacoes: 'quantidade de observações',
  resolucao: 'resolução dos mapas',
  qualidade: 'qualidade dos dados',
  consistencia: 'consistência entre os mapas',
};

/** Como o agrônomo lê o número (a spec pede o rótulo junto do valor). */
export function rotuloICA(v: number | null): string {
  if (v == null) return 'sem base para avaliar';
  if (v >= 85) return 'Muito alta confiabilidade';
  if (v >= 70) return 'Alta confiabilidade';
  if (v >= 50) return 'Confiabilidade média';
  if (v >= 30) return 'Baixa confiabilidade';
  return 'Confiabilidade muito baixa';
}

export function faixaICA(v: number): FaixaQualidade {
  if (v >= 85) return 'otimo';
  if (v >= 70) return 'bom';
  if (v >= 50) return 'regular';
  return 'ruim';
}

const fmt = (v: number, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

export function calcularICA(e: EntradaICA): ResultadoICA {
  const comp: Record<string, number> = {
    safras: escoreBom(e.nSafras, LIMIARES_ICA.safras.ruim, LIMIARES_ICA.safras.bom),
    camadas: escoreBom(e.nCamadas, LIMIARES_ICA.camadas.ruim, LIMIARES_ICA.camadas.bom),
    cobertura: escoreBom(e.coberturaPct, LIMIARES_ICA.coberturaPct.ruim, LIMIARES_ICA.coberturaPct.bom),
    observacoes: escoreBom(e.nObservacoes, LIMIARES_ICA.observacoes.ruim, LIMIARES_ICA.observacoes.bom),
  };
  const pesos: Record<string, number> = {
    safras: PESOS.safras, camadas: PESOS.camadas, cobertura: PESOS.cobertura, observacoes: PESOS.observacoes,
  };
  // O que não se sabe SAI DA CONTA em vez de virar nota zero — punir o
  // desconhecido é fabricar informação.
  if (e.resolucaoM != null && e.resolucaoM > 0) {
    comp.resolucao = 100 - escoreRuim(e.resolucaoM, LIMIARES_ICA.resolucaoM.bom, LIMIARES_ICA.resolucaoM.ruim);
    pesos.resolucao = PESOS.resolucao;
  }
  if (e.outliersPct != null) {
    comp.qualidade = 100 - escoreRuim(e.outliersPct, LIMIARES_ICA.outliersPct.bom, LIMIARES_ICA.outliersPct.ruim);
    pesos.qualidade = PESOS.qualidade;
  }
  if (e.consistenciaPct != null) {
    comp.consistencia = escoreBom(e.consistenciaPct, LIMIARES_ICA.consistenciaPct.ruim, LIMIARES_ICA.consistenciaPct.bom);
    pesos.consistencia = PESOS.consistencia;
  }

  const soma = Object.values(pesos).reduce((s, p) => s + p, 0);
  const media = Object.entries(comp).reduce((s, [k, v]) => s + v * (pesos[k] ?? 0), 0) / (soma || 1);
  const teto = tetoDeSafras(e.nSafras);
  const ica = Math.min(media, teto);
  const limitado = media > teto + 0.05;
  const rotulo = rotuloICA(ica);

  const pior = Object.entries(comp).sort((a, b) => a[1] - b[1])[0];
  const gargalo = { id: pior[0], nome: NOME_COMP[pior[0]] ?? pior[0], escore: Math.round(pior[1]) };

  // O motivo entra no RÓTULO, como pede a spec ("Baixa confiabilidade —
  // apenas uma safra disponível"): o número sozinho não muda decisão nenhuma.
  const motivo = limitado
    ? (e.nSafras === 0 ? 'nenhuma safra com dado' : e.nSafras === 1 ? 'apenas uma safra disponível' : `apenas ${e.nSafras} safras disponíveis`)
    : gargalo.id === 'safras' && e.nSafras <= 1
      ? 'apenas uma safra disponível'
      : `${gargalo.nome} (${gargalo.escore}/100)`;

  const partes = [
    `${e.nSafras} safra(s)`,
    `${e.nCamadas} camada(s)`,
    e.resolucaoM != null ? `${fmt(e.resolucaoM)} m/pixel` : null,
    `${fmt(e.coberturaPct)}% de cobertura`,
    `${fmt(e.nObservacoes)} observações`,
    e.outliersPct != null ? `${fmt(e.outliersPct, 1)}% de outliers` : null,
    e.consistenciaPct != null ? `camadas cobrindo ${fmt(e.consistenciaPct)}% do talhão em média${e.piorCamada ? ` (pior: ${e.piorCamada.nome}, ${fmt(e.piorCamada.coberturaPct)}%)` : ''}` : null,
  ].filter(Boolean).join(' · ');

  return {
    indicador: {
      id: 'ica', nome: NOME_INDICADOR.ica, valor: Math.round(ica * 10) / 10, unidade: '',
      faixa: faixaICA(ica),
      justificativa: `${rotulo} — ${motivo}. ${partes}.${limitado ? ` Os demais fatores dariam ${fmt(media)}, mas o índice é limitado a ${fmt(teto)} enquanto houver ${e.nSafras === 1 ? 'uma safra só' : `${e.nSafras} safras`}: nenhuma qualidade de mapa substitui a repetição entre anos.` : ''} Qualifica o IQZM sem entrar nele: a nota do mapa não melhora nem piora por causa da base, mas a leitura dela muda.`,
      entradas: {
        teto, mediaSemTeto: Math.round(media * 10) / 10,
        safras: e.nSafras, camadas: e.nCamadas, resolucaoM: e.resolucaoM, coberturaPct: e.coberturaPct,
        observacoes: e.nObservacoes, outliersPct: e.outliersPct ?? null, consistenciaPct: e.consistenciaPct ?? null,
      },
    },
    componentes: comp,
    rotulo,
    gargalo,
  };
}
