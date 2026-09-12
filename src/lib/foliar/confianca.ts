// ÍNDICE DE CONFIANÇA DA DIAGNOSE FOLIAR.
//
// Mesmo raciocínio do `validacao/ica.ts`: o índice NÃO mede o estado
// nutricional, mede a BASE em que ele foi calculado. "K é o mais limitante"
// calculado contra uma norma de 12 amostras importada de outra região e sobre
// um trifólio SEM pecíolo quando a norma é COM pecíolo não vale o mesmo que a
// mesma frase saída de uma norma regional de 600 amostras no órgão certo — e
// sem o número ao lado, as duas aparecem idênticas na tela.
//
// POR QUE FICA FORA DO DIAGNÓSTICO: se a confiança entrasse no índice DRIS, um
// K limitante com base fraca viraria "K levemente limitante" e o alerta
// sumiria dentro do próprio número que ele deveria qualificar. Os dois andam
// LADO A LADO.
//
// Seis entradas, todas objetivas:
//   n da norma · origem · aderência de órgão · aderência de estádio ·
//   presença de produtividade · completude dos 11 nutrientes.
//
// TETO POR ÓRGÃO DIFERENTE — a decisão mais importante deste arquivo. Kurihara
// et al. (2013) mostraram que trifólio COM e SEM pecíolo têm teores
// significativamente diferentes de N, P, B, Fe, Mn e Zn (maiores sem pecíolo) e
// de K (menor sem pecíolo). Uma norma não atravessa essa fronteira. Com peso
// apenas, uma norma excelente aplicada ao órgão errado ainda pontuaria ~70 e
// pareceria confiável; o TETO diz explicitamente "limitado a 35 porque a norma
// é de outro órgão" (ledger 19).
//
// Módulo PURO — sem DOM, sem I/O. npm run teste:foliar

import { escoreBom } from '../validacao/estatistica.ts';
import { nutrientesPresentes } from './nutrientes.ts';
import {
  type FaixaConfianca, NUTRIENTES, type NormaDris, type Orgao,
  type ResultadoConfianca, ROTULO_ORGAO, type TeoresFoliares,
} from './tipos.ts';

export const LIMIARES_CONFIANCA = {
  /** n da população de referência: 10 é frágil, 200 é norma regional madura. */
  nNorma: { ruim: 10, bom: 200 },
};

/** Quanto vale cada origem de norma. Gerada regional > literatura > importada. */
export const ESCORE_ORIGEM: Record<NormaDris['origem'], number> = {
  gerada: 100,
  literatura: 70,
  importada: 55,
};

const PESOS = {
  nNorma: 0.30,
  origem: 0.15,
  orgao: 0.25,
  estadio: 0.10,
  produtividade: 0.10,
  completude: 0.10,
};

/** Teto quando o órgão da amostra não é o da norma. Ver cabeçalho. */
export const TETO_ORGAO_DIFERENTE = 35;
/** Teto quando não há norma nenhuma: só faixa/chance podem ter rodado. */
export const TETO_SEM_NORMA = 25;

const NOME_COMP: Record<string, string> = {
  nNorma: 'tamanho da população de referência',
  origem: 'origem da norma',
  orgao: 'aderência do órgão amostrado',
  estadio: 'aderência do estádio fenológico',
  produtividade: 'presença de produtividade',
  completude: 'completude do laudo',
};

export interface EntradaConfianca {
  norma: Pick<NormaDris, 'n' | 'origem' | 'orgao' | 'estadio'> | null;
  teores: TeoresFoliares;
  /** Órgão amostrado. `null` = não informado (penaliza menos que divergir). */
  orgaoAmostra?: Orgao | null;
  /** Estádio da amostra (texto livre, ex.: 'R2'). */
  estadioAmostra?: string | null;
  produtividadeKgha?: number | null;
}

export function rotuloConfianca(v: number): string {
  if (v >= 85) return 'Muito alta confiabilidade';
  if (v >= 70) return 'Alta confiabilidade';
  if (v >= 50) return 'Confiabilidade média';
  if (v >= 30) return 'Baixa confiabilidade';
  return 'Confiabilidade muito baixa';
}

export function faixaConfianca(v: number): FaixaConfianca {
  if (v >= 85) return 'otimo';
  if (v >= 70) return 'bom';
  if (v >= 50) return 'regular';
  return 'ruim';
}

/** Compara estádios ignorando caixa, acento e separador ('R1-R2' × 'r1 r2'). */
function mesmoEstadio(a?: string | null, b?: string | null): boolean | null {
  if (!a || !b) return null;                      // desconhecido sai da conta
  const k = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '');
  const ka = k(a), kb = k(b);
  if (!ka || !kb) return null;
  return ka === kb || ka.includes(kb) || kb.includes(ka);
}

export function calcularConfianca(e: EntradaConfianca): ResultadoConfianca {
  const comp: Record<string, number> = {};
  const pesos: Record<string, number> = {};
  const norma = e.norma ?? null;

  // O que não se sabe SAI DA CONTA em vez de virar nota zero — punir o
  // desconhecido é fabricar informação (mesma regra do ICA).
  if (norma) {
    if (typeof norma.n === 'number' && Number.isFinite(norma.n)) {
      comp.nNorma = escoreBom(norma.n, LIMIARES_CONFIANCA.nNorma.ruim, LIMIARES_CONFIANCA.nNorma.bom);
      pesos.nNorma = PESOS.nNorma;
    }
    comp.origem = ESCORE_ORIGEM[norma.origem] ?? 50;
    // Norma importada SEM n declarado é o pior caso: não dá para saber se são
    // 8 ou 800 amostras por trás dela.
    if (norma.origem === 'importada' && norma.n == null) comp.origem = 35;
    pesos.origem = PESOS.origem;

    if (e.orgaoAmostra) {
      comp.orgao = e.orgaoAmostra === norma.orgao ? 100 : 0;
      pesos.orgao = PESOS.orgao;
    }
    const est = mesmoEstadio(e.estadioAmostra, norma.estadio);
    if (est != null) {
      comp.estadio = est ? 100 : 40;
      pesos.estadio = PESOS.estadio;
    }
  }

  comp.produtividade = typeof e.produtividadeKgha === 'number' && Number.isFinite(e.produtividadeKgha) ? 100 : 0;
  pesos.produtividade = PESOS.produtividade;

  const presentes = nutrientesPresentes(e.teores).length;
  comp.completude = (presentes / NUTRIENTES.length) * 100;
  pesos.completude = PESOS.completude;

  const somaPesos = Object.values(pesos).reduce((s, p) => s + p, 0);
  const media = somaPesos > 0
    ? Object.entries(comp).reduce((s, [k, v]) => s + v * (pesos[k] ?? 0), 0) / somaPesos
    : 0;

  const orgaoDivergente = !!norma && !!e.orgaoAmostra && e.orgaoAmostra !== norma.orgao;
  const teto = !norma ? TETO_SEM_NORMA : orgaoDivergente ? TETO_ORGAO_DIFERENTE : 100;
  const valor = Math.min(media, teto);
  const limitado = media > teto + 0.05;

  const pior = Object.entries(comp).sort((a, b) => a[1] - b[1])[0] ?? ['completude', comp.completude];
  const gargalo = { id: pior[0], nome: NOME_COMP[pior[0]] ?? pior[0], escore: Math.round(pior[1] as number) };

  const motivo = !norma
    ? 'nenhuma norma carregada para esta cultura/órgão'
    : orgaoDivergente
      ? `a norma é de ${ROTULO_ORGAO[norma.orgao]} e a amostra é de ${ROTULO_ORGAO[e.orgaoAmostra as Orgao]}`
      : `${gargalo.nome} (${gargalo.escore}/100)`;

  const partes = [
    norma ? `norma ${norma.origem}${norma.n != null ? ` com n=${norma.n}` : ' sem n declarado'}` : 'sem norma',
    norma ? `órgão da norma: ${ROTULO_ORGAO[norma.orgao]}` : null,
    e.orgaoAmostra ? `órgão da amostra: ${ROTULO_ORGAO[e.orgaoAmostra]}` : 'órgão da amostra não informado',
    norma?.estadio ? `estádio da norma: ${norma.estadio}` : null,
    e.estadioAmostra ? `estádio da amostra: ${e.estadioAmostra}` : null,
    comp.produtividade ? 'com produtividade' : 'sem produtividade',
    `${presentes}/${NUTRIENTES.length} nutrientes analisados`,
  ].filter(Boolean).join(' · ');

  const explicacaoTeto = limitado
    ? (!norma
      ? ` Os demais fatores dariam ${Math.round(media)}, mas sem norma o índice é limitado a ${TETO_SEM_NORMA}: só faixa de suficiência e chance matemática podem ter rodado.`
      : ` Os demais fatores dariam ${Math.round(media)}, mas o índice é limitado a ${TETO_ORGAO_DIFERENTE} porque com e sem pecíolo (ou folha diferente) NÃO são intercambiáveis — os teores de N, P, B, Fe, Mn e Zn mudam significativamente entre eles (Kurihara et al., 2013).`)
    : '';

  const rotulo = rotuloConfianca(valor);
  return {
    valor: Math.round(valor * 10) / 10,
    rotulo,
    faixa: faixaConfianca(valor),
    gargalo,
    justificativa: `${rotulo} — ${motivo}. ${partes}.${explicacaoTeto} Qualifica a diagnose sem entrar nela: os índices não mudam por causa da base, mas a leitura deles muda.`,
    componentes: comp,
    entradas: {
      teto,
      mediaSemTeto: Math.round(media * 10) / 10,
      nNorma: norma?.n ?? null,
      origem: norma?.origem ?? null,
      orgaoNorma: norma?.orgao ?? null,
      orgaoAmostra: e.orgaoAmostra ?? null,
      estadioNorma: norma?.estadio ?? null,
      estadioAmostra: e.estadioAmostra ?? null,
      produtividadeKgha: e.produtividadeKgha ?? null,
      nutrientesAnalisados: presentes,
    },
  };
}
