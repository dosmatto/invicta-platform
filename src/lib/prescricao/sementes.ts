// População variável de SEMENTES — PURO (testável em node).
//
// Duas contas vivem aqui:
//  1. Agronomia da semeadura: população desejada (plantas/ha) → sementes/ha,
//     sementes/metro, kg/ha, total e sacos — descontando a GERMINAÇÃO (a semente
//     que não vira planta também é semeada).
//  2. Estoque: "tenho X sementes (ou kg, sacos, milhões, ou uma média/ha)" →
//     redistribuir entre as zonas mantendo EXATAMENTE o total, com min/max e
//     margem de segurança. Reusa o water-fill do calculo.ts — a invariante de
//     nunca ultrapassar o estoque é a mesma do esterco.

// Extensão .ts explícita: os testes rodam em node puro (type-stripping), que
// não resolve import sem extensão — mesmo padrão de periodo/faixas/exportZonas.
import { redistribuirPorEstoque, pesoDoRank, type ResultadoDistribuicao } from './calculo.ts';
import type { ParamsSementes } from './tipos.ts';

const EPS = 1e-9;

// Fração de sementes que vira PLANTA (0..1). Campo ausente = 100%.
// Só a GERMINAÇÃO desconta: pureza e sobrevivência saíram da tela (05/08/2026) —
// prescrição salva antes disso passa a ignorá-las, em vez de aplicar um fator que
// ninguém mais consegue ver nem editar.
export function fatorCampo(p: Pick<ParamsSementes, 'germinacaoPct'>): number {
  const f = (x?: number) => (x == null ? 1 : Math.min(100, Math.max(0, x)) / 100);
  return f(p.germinacaoPct);
}

// População-alvo (plantas/ha) → taxa de semeadura (sementes/ha).
export function sementesPorHa(populacaoAlvo: number, p: ParamsSementes): number {
  const fator = fatorCampo(p);
  if (fator <= EPS) throw new Error('Germinação zerada — impossível calcular a taxa.');
  return populacaoAlvo / fator;
}

export interface MetricasSementes {
  sementesHa: number;
  sementesPorMetro: number | null;   // exige espaçamento
  kgHa: number | null;               // exige PMS
  populacaoFinal: number;            // plantas/ha esperadas
  totalSementes: number;
  totalKg: number | null;
  sacos: number | null;              // exige sementes por saco
}

export function metricasSementes(
  sementesHa: number, areaHa: number, p: ParamsSementes,
): MetricasSementes {
  const kgHa = p.pmsG && p.pmsG > 0 ? sementesHa * p.pmsG / 1e6 : null;   // PMS g/1000 sementes
  return {
    sementesHa,
    sementesPorMetro: p.espacamentoM && p.espacamentoM > 0 ? sementesHa * p.espacamentoM / 10_000 : null,
    kgHa,
    populacaoFinal: sementesHa * fatorCampo(p),
    totalSementes: sementesHa * areaHa,
    totalKg: kgHa != null ? kgHa * areaHa : null,
    sacos: p.sementesPorSaco && p.sementesPorSaco > 0 ? (sementesHa * areaHa) / p.sementesPorSaco : null,
  };
}

// Estoque informado de QUALQUER jeito → total de SEMENTES.
export interface EstoqueSementes {
  sementes?: number;
  milhoes?: number;
  sacos?: number;              // exige sementesPorSaco
  kg?: number;                 // exige PMS
  populacaoMediaHa?: number;   // "tenho para uma média de 285 mil plantas/ha"
}

export function estoqueTotalSementes(e: EstoqueSementes, p: ParamsSementes, areaTotalHa: number): number {
  if (e.sementes && e.sementes > 0) return e.sementes;
  if (e.milhoes && e.milhoes > 0) return e.milhoes * 1e6;
  if (e.sacos && e.sacos > 0) {
    if (!p.sementesPorSaco || p.sementesPorSaco <= 0) throw new Error('Informe quantas sementes tem cada saco.');
    return e.sacos * p.sementesPorSaco;
  }
  if (e.kg && e.kg > 0) {
    if (!p.pmsG || p.pmsG <= 0) throw new Error('Informe o PMS para converter kg em sementes.');
    return e.kg * 1e6 / p.pmsG;
  }
  if (e.populacaoMediaHa && e.populacaoMediaHa > 0) {
    // média é de PLANTAS/ha → sementes necessárias para essa média na área toda
    return sementesPorHa(e.populacaoMediaHa, p) * areaTotalHa;
  }
  throw new Error('Informe o estoque de sementes (sementes, kg, sacos, milhões ou população média).');
}

/**
 * Dose que vai para a MÁQUINA.
 *
 * O agrônomo decide em POPULAÇÃO ("quero 80.000 plantas/ha"), mas a plantadeira
 * é regulada em SEMENTES/ha — e parte da semente não vira planta. Sem compensar,
 * 80.000 no arquivo viram ~72.000 plantas no campo com 90% de germinação: a
 * lavoura nasce ralinha e ninguém entende por quê. Com `ehPopulacao`, a taxa
 * sobe pela germinação informada.
 *
 * Sem o marcador, a dose já É a taxa de semeadura e passa intacta.
 */
export function doseCompensada(dose: number, p?: ParamsSementes, ehPopulacao?: boolean): number {
  if (!ehPopulacao || !p || !Number.isFinite(dose)) return dose;
  return sementesPorHa(dose, p);
}

// Distribui o ESTOQUE entre as zonas — doses em SEMENTES/HA, com min/max dados
// em POPULAÇÃO (plantas/ha, como o agrônomo pensa) e convertidos aqui.
// margemPct segura uma fração do estoque (quebra, regulagem da plantadeira).
export interface ResultadoSementes extends ResultadoDistribuicao {
  populacaoPorZona: Record<string, number>;   // plantas/ha resultantes
  populacaoMedia: number;                     // ponderada por área
}

export function distribuirSementes(
  zonas: Array<{ id: string; areaHa: number; potencialRank?: number }>,
  estoqueSementes: number,
  p: ParamsSementes,
  relacao: 'direta' | 'inversa' = 'direta',
): ResultadoSementes {
  const fator = fatorCampo(p);
  if (fator <= EPS) throw new Error('Germinação zerada.');
  const margem = Math.min(50, Math.max(0, p.margemPct ?? 0)) / 100;
  const util = estoqueSementes * (1 - margem);
  const nRanks = Math.max(1, ...zonas.map(z => z.potencialRank ?? 1));
  const entrada = zonas.map(z => ({
    id: z.id, areaHa: z.areaHa,
    peso: pesoDoRank(z.potencialRank, nRanks, relacao),
  }));
  const r = redistribuirPorEstoque(entrada, util, {
    doseMin: p.populacaoMin != null ? p.populacaoMin / fator : 0,
    doseMax: p.populacaoMax != null ? p.populacaoMax / fator : undefined,
  });
  if (margem > 0) r.avisos.push(`Margem de segurança de ${(margem * 100).toFixed(0)}% reservada (${Math.round(estoqueSementes - util).toLocaleString('pt-BR')} sementes).`);
  const populacaoPorZona: Record<string, number> = {};
  let somaPop = 0, somaArea = 0;
  for (const z of zonas) {
    populacaoPorZona[z.id] = (r.doses[z.id] ?? 0) * fator;
    somaPop += populacaoPorZona[z.id] * z.areaHa;
    somaArea += z.areaHa;
  }
  return { ...r, populacaoPorZona, populacaoMedia: somaArea > EPS ? somaPop / somaArea : 0 };
}
