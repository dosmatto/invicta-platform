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
// O QUE NÃO SE SABE SAI DA CONTA (peso 0 e componente removido), nunca vira
// nota zero: punir o desconhecido é fabricar informação. Vale para órgão,
// estádio, n da norma E produtividade. Completude é a exceção proposital — ali
// o desconhecido É a medida: um laudo com 3 dos 11 nutrientes é objetivamente
// uma base mais fraca, não uma informação faltando sobre a base.
//
// TETO POR ÓRGÃO DIFERENTE — a decisão mais importante deste arquivo. Kurihara
// et al. (2013) mostraram que trifólio COM e SEM pecíolo têm teores
// significativamente diferentes de N, P, B, Fe, Mn e Zn (maiores sem pecíolo) e
// de K (menor sem pecíolo). Uma norma não atravessa essa fronteira. Com peso
// apenas, uma norma excelente aplicada ao órgão errado ainda pontuaria ~70 e
// pareceria confiável; o TETO diz explicitamente "limitado a 35 porque a norma
// é de outro órgão" (ledger 19).
//
// TETO POR COBERTURA DE MÉTODOS — mesmo espírito do teto por safras do
// `validacao/ica.ts`. As seis entradas acima medem a PROCEDÊNCIA DA NORMA, não
// quantos dos quatro métodos chegaram a um resultado. Com a norma Kurihara
// (literatura, n=608, órgão e estádio batendo, laudo completo), uma diagnose em
// que DRIS, CND e chance matemática saem `null` — a norma só traz faixas de
// suficiência — saía com 96 e o rótulo "Muito alta confiabilidade" ao lado de
// três "não rodou". Um método opinando não é o mesmo que quatro concordando, e
// nenhuma qualidade de norma substitui a cobertura: por isso é TETO, não peso.
//
// DE ONDE VEM O NÚMERO DE MÉTODOS: de `diagnose.ts`, que é o único lugar onde
// se sabe quem chegou a um resultado (ele já monta `votos` exatamente com os
// métodos não-nulos). Recalcular isso aqui exigiria que este arquivo recebesse
// a norma inteira e reimplementasse as quatro guardas de cada método — duas
// fontes de verdade para o mesmo fato. A entrada é OPCIONAL: quando não vem,
// não se sabe quantos rodaram e o teto NÃO se aplica (o desconhecido sai da
// conta, como todo o resto deste arquivo), o que preserva o uso direto de
// `calcularConfianca` fora da diagnose.
//
// Módulo PURO — sem DOM, sem I/O. npm run teste:foliar

import { escoreBom } from '../validacao/estatistica.ts';
import { nutrientesPresentes } from './nutrientes.ts';
import {
  type FaixaConfianca, type MetodoDiagnose, NUTRIENTES, type NormaDris, type Orgao,
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

/**
 * TETO por quantos dos quatro métodos chegaram a um resultado. Ver cabeçalho.
 * Com 0 métodos o teto é o mesmo de "sem norma": não há diagnose para qualificar.
 */
export const TETO_POR_METODOS: Record<number, number> = { 0: TETO_SEM_NORMA, 1: 45, 2: 65, 3: 85 };

/** Teto da cobertura de métodos. 4 de 4 ⇒ sem teto. */
export const tetoDeMetodos = (n: number): number => (n >= 4 ? 100 : TETO_POR_METODOS[Math.max(0, n)] ?? 100);

/** Nome de cada método como ele entra no MEIO de uma frase da justificativa. */
const NOME_METODO: Record<MetodoDiagnose, string> = {
  dris: 'DRIS',
  cnd: 'CND',
  faixa: 'faixa de suficiência',
  chance: 'chance matemática',
};

/** Artigo para a frase "só A faixa de suficiência" / "só O DRIS". */
const ARTIGO_METODO: Record<MetodoDiagnose, string> = {
  dris: 'o', cnd: 'o', faixa: 'a', chance: 'a',
};

const ORDEM_METODOS: MetodoDiagnose[] = ['dris', 'cnd', 'faixa', 'chance'];

/** 'DRIS, CND e chance matemática' — lista em português, com "e" no último. */
function listar(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? '';
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

/**
 * A frase do teto por cobertura — explicável, nomeando quem rodou e quem não.
 * "limitado a 45 porque só a faixa de suficiência chegou a um resultado — DRIS,
 * CND e chance matemática não rodaram: a norma carregada não traz o que eles exigem."
 */
function fraseMetodos(rodaram: MetodoDiagnose[], teto: number, semNorma: boolean): string {
  const causa = semNorma
    ? 'sem norma para esta cultura/órgão'
    : 'a norma carregada não traz o que eles exigem';
  if (!rodaram.length) {
    return `o índice é limitado a ${teto} porque NENHUM dos ${ORDEM_METODOS.length} métodos chegou a um resultado: ${causa}.`;
  }
  const faltaram = ORDEM_METODOS.filter(m => !rodaram.includes(m));
  const quemRodou = rodaram.length === 1
    ? `só ${ARTIGO_METODO[rodaram[0]]} ${NOME_METODO[rodaram[0]]} chegou a um resultado`
    : `${listar(rodaram.map(m => NOME_METODO[m]))} chegaram a um resultado`;
  const quemFaltou = faltaram.length
    ? ` — ${listar(faltaram.map(m => NOME_METODO[m]))} não ${faltaram.length === 1 ? 'rodou' : 'rodaram'}: ${causa}`
    : '';
  return `o índice é limitado a ${teto} porque ${quemRodou}${quemFaltou}.`;
}

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
  /**
   * Quais dos quatro métodos chegaram a um RESULTADO nesta diagnose (não os que
   * foram tentados). Omitir = não se sabe ⇒ o teto por cobertura não se aplica.
   * Quem preenche é `diagnose.ts`. Ver cabeçalho.
   */
  metodosComResultado?: MetodoDiagnose[] | null;
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

  // PRODUTIVIDADE AUSENTE SAI DA CONTA — coerente com a regra acima, que o
  // código contrariava: produtividade não informada virava nota ZERO com peso
  // cheio, derrubando o índice em até 10 pontos e assumindo o gargalo da tela
  // ("presença de produtividade: 0/100"). Não saber a produtividade da amostra
  // não piora a norma nem o laudo; apenas não acrescenta evidência.
  const temProdutividade = typeof e.produtividadeKgha === 'number' && Number.isFinite(e.produtividadeKgha);
  if (temProdutividade) {
    comp.produtividade = 100;
    pesos.produtividade = PESOS.produtividade;
  }

  const presentes = nutrientesPresentes(e.teores).length;
  comp.completude = (presentes / NUTRIENTES.length) * 100;
  pesos.completude = PESOS.completude;

  const somaPesos = Object.values(pesos).reduce((s, p) => s + p, 0);
  const media = somaPesos > 0
    ? Object.entries(comp).reduce((s, [k, v]) => s + v * (pesos[k] ?? 0), 0) / somaPesos
    : 0;

  const orgaoDivergente = !!norma && !!e.orgaoAmostra && e.orgaoAmostra !== norma.orgao;

  // TRÊS TETOS CONCORRENTES — vale o MENOR, e é ele que a justificativa explica.
  // `rodaram = null` significa "não informado": o teto por cobertura sai da conta.
  const metodos = e.metodosComResultado ?? null;
  const rodaram = metodos ? ORDEM_METODOS.filter(m => metodos.includes(m)) : null;
  const tetoSemNorma = !norma ? TETO_SEM_NORMA : 100;
  const tetoOrgao = orgaoDivergente ? TETO_ORGAO_DIFERENTE : 100;
  const tetoMetodos = rodaram ? tetoDeMetodos(rodaram.length) : 100;
  const teto = Math.min(tetoSemNorma, tetoOrgao, tetoMetodos);
  const valor = Math.min(media, teto);
  const limitado = media > teto + 0.05;
  // Qual teto está segurando o número (desempate na ordem mais informativa).
  const tetoDeMetodosManda = limitado && tetoSemNorma > teto && tetoOrgao > teto && !!rodaram;

  const pior = Object.entries(comp).sort((a, b) => a[1] - b[1])[0] ?? ['completude', comp.completude];
  const gargalo = { id: pior[0], nome: NOME_COMP[pior[0]] ?? pior[0], escore: Math.round(pior[1] as number) };

  const motivo = !norma
    ? 'nenhuma norma carregada para esta cultura/órgão'
    : orgaoDivergente
      ? `a norma é de ${ROTULO_ORGAO[norma.orgao]} e a amostra é de ${ROTULO_ORGAO[e.orgaoAmostra as Orgao]}`
      : tetoDeMetodosManda && rodaram
        ? `só ${rodaram.length} de ${ORDEM_METODOS.length} métodos ${rodaram.length === 1 ? 'chegou' : 'chegaram'} a um resultado`
        : `${gargalo.nome} (${gargalo.escore}/100)`;

  const partes = [
    norma ? `norma ${norma.origem}${norma.n != null ? ` com n=${norma.n}` : ' sem n declarado'}` : 'sem norma',
    norma ? `órgão da norma: ${ROTULO_ORGAO[norma.orgao]}` : null,
    e.orgaoAmostra ? `órgão da amostra: ${ROTULO_ORGAO[e.orgaoAmostra]}` : 'órgão da amostra não informado',
    norma?.estadio ? `estádio da norma: ${norma.estadio}` : null,
    e.estadioAmostra ? `estádio da amostra: ${e.estadioAmostra}` : null,
    temProdutividade ? 'com produtividade' : 'sem produtividade informada (fora da conta)',
    `${presentes}/${NUTRIENTES.length} nutrientes analisados`,
    rodaram ? `${rodaram.length}/${ORDEM_METODOS.length} métodos com resultado` : null,
  ].filter(Boolean).join(' · ');

  const explicacaoTeto = !limitado
    ? ''
    : ` Os demais fatores dariam ${Math.round(media)}, mas ${
      tetoSemNorma === teto
        ? `sem norma o índice é limitado a ${TETO_SEM_NORMA}: só faixa de suficiência e chance matemática podem ter rodado.`
        : tetoOrgao === teto
          ? `o índice é limitado a ${TETO_ORGAO_DIFERENTE} porque com e sem pecíolo (ou folha diferente) NÃO são intercambiáveis — os teores de N, P, B, Fe, Mn e Zn mudam significativamente entre eles (Kurihara et al., 2013).`
          : fraseMetodos(rodaram ?? [], teto, !norma)
    }`;

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
      // `null` = não informado (teto por cobertura fora da conta), 0 = informado
      // e nenhum método rodou. A tela precisa distinguir os dois.
      metodosComResultado: rodaram ? rodaram.length : null,
      metodosQueRodaram: rodaram ? (rodaram.map(m => NOME_METODO[m]).join(', ') || 'nenhum') : null,
    },
  };
}
