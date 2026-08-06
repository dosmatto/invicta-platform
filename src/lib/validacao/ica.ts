// ICA — Índice de Confiança da Análise.
//
// Não mede o zoneamento: mede a BASE em que ele foi feito. Um IQZM de 88
// calculado sobre uma safra e uma camada de 30 m vale menos que um 72 sobre
// quatro safras e dois mapas de 5 m — e sem o ICA ao lado ninguém percebe a
// diferença, porque os dois aparecem como "número alto".
//
// Cinco entradas, todas objetivas: quantas safras, quantas camadas, qual a
// resolução, quanto da área tem dado e quantas observações entraram.
//
// npm run teste:validacao

import { escoreBom, escoreRuim } from './estatistica.ts';
import { faixaMaiorMelhor, NOME_INDICADOR, type Indicador } from './tipos.ts';

export const LIMIARES_ICA = {
  safras: { ruim: 1, bom: 4 },          // 1 safra = base fraca; 4+ = série
  camadas: { ruim: 1, bom: 4 },
  resolucaoM: { bom: 5, ruim: 30 },     // metros por pixel — menor é melhor
  coberturaPct: { ruim: 60, bom: 95 },  // % da área das zonas com dado
  observacoes: { ruim: 100, bom: 2000 },
};

const PESOS = { safras: 0.30, camadas: 0.20, resolucao: 0.15, cobertura: 0.20, observacoes: 0.15 };

export interface EntradaICA {
  nSafras: number;
  nCamadas: number;
  /** metros por pixel da camada de validação (null = desconhecida). */
  resolucaoM: number | null;
  /** % da área das zonas com pixel válido. */
  coberturaPct: number;
  /** nº de observações usadas (pixels amostrados + pontos de laboratório). */
  nObservacoes: number;
}

export interface ResultadoICA {
  indicador: Indicador;
  componentes: Record<string, number>;
}

const fmt = (v: number, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

export function calcularICA(e: EntradaICA): ResultadoICA {
  const comp: Record<string, number> = {
    safras: escoreBom(e.nSafras, LIMIARES_ICA.safras.ruim, LIMIARES_ICA.safras.bom),
    camadas: escoreBom(e.nCamadas, LIMIARES_ICA.camadas.ruim, LIMIARES_ICA.camadas.bom),
    cobertura: escoreBom(e.coberturaPct, LIMIARES_ICA.coberturaPct.ruim, LIMIARES_ICA.coberturaPct.bom),
    observacoes: escoreBom(e.nObservacoes, LIMIARES_ICA.observacoes.ruim, LIMIARES_ICA.observacoes.bom),
  };
  const pesos: Record<string, number> = { safras: PESOS.safras, camadas: PESOS.camadas, cobertura: PESOS.cobertura, observacoes: PESOS.observacoes };
  // Resolução desconhecida não vira zero: sai da conta e os pesos se
  // redistribuem — punir o que não se sabe é fabricar informação.
  if (e.resolucaoM != null && e.resolucaoM > 0) {
    comp.resolucao = 100 - escoreRuim(e.resolucaoM, LIMIARES_ICA.resolucaoM.bom, LIMIARES_ICA.resolucaoM.ruim);
    pesos.resolucao = PESOS.resolucao;
  }

  const soma = Object.values(pesos).reduce((s, p) => s + p, 0);
  const ica = Object.entries(comp).reduce((s, [k, v]) => s + v * (pesos[k] ?? 0), 0) / (soma || 1);
  const faixa = faixaMaiorMelhor(ica);

  const gargalo = Object.entries(comp).sort((a, b) => a[1] - b[1])[0];
  const NOME_COMP: Record<string, string> = {
    safras: 'número de safras', camadas: 'número de camadas', cobertura: 'cobertura da área',
    observacoes: 'quantidade de observações', resolucao: 'resolução dos mapas',
  };

  return {
    indicador: {
      id: 'ica', nome: NOME_INDICADOR.ica, valor: Math.round(ica * 10) / 10, unidade: '',
      faixa,
      justificativa: `${e.nSafras} safra(s) · ${e.nCamadas} camada(s) · ${e.resolucaoM != null ? `${fmt(e.resolucaoM)} m/pixel · ` : ''}${fmt(e.coberturaPct)}% de cobertura · ${fmt(e.nObservacoes)} observações. Ponto mais fraco: ${NOME_COMP[gargalo[0]]} (${fmt(gargalo[1])}/100) — é o que mais rende se for melhorado.`,
      entradas: { safras: e.nSafras, camadas: e.nCamadas, resolucaoM: e.resolucaoM, coberturaPct: e.coberturaPct, observacoes: e.nObservacoes },
    },
    componentes: comp,
  };
}
