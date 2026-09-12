// GERADOR DE NORMAS — o diferencial competitivo do módulo.
//
// POR QUE ISTO É CIDADÃO DE PRIMEIRA CLASSE E NÃO UM EXTRA: as normas DRIS
// numéricas de soja (média e DP de cada razão dual) NÃO estão publicadas em
// formato extraível — os artigos trazem as tabelas como imagem. Em vez de
// inventar números, o módulo entrega o gerador: a norma nasce do banco do
// próprio consultor, que é justamente a informação que a INVICTA tem e os
// concorrentes não (talhão + safra + produtividade real).
//
// O MÉTODO (Beaufils 1973; Wadt 1996):
//   1. Separar a população em ALTA e BAIXA produtividade por um corte.
//   2. Para cada par, calcular média/variância da razão nas DUAS ordens (A/B e
//      B/A) e nas DUAS populações.
//   3. F = S²(razão)baixa / S²(razão)alta. Fica a ordem de MAIOR F — é a mais
//      discriminante, a que mais separa quem produziu de quem não produziu.
//      Esta escolha é gravada na norma; a diagnose respeita, não recalcula.
//   4. Média, DP e CV da ordem escolhida vêm da população de ALTA — ela é a
//      referência, o alvo que se quer reproduzir.
//
// DUAS DECISÕES DOCUMENTADAS PORQUE SÃO NOSSAS, NÃO DA LITERATURA:
//   · FAIXAS DE SUFICIÊNCIA GERADAS = média ± 1 DP da população de alta
//     produtividade. É o critério que Kurihara et al. (2013) usam em espírito
//     (faixa definida pela subpopulação de referência) e produz faixas MUITO
//     mais estreitas que as clássicas. Não é calibração com doses crescentes —
//     e a `fonte` da norma diz isso, para ninguém confundir com experimento.
//   · DESVIO POPULACIONAL (÷n), reusando `resumoValores` de
//     `validacao/estatistica.ts` (ledger 12). Com n ≥ 30, a diferença para o
//     amostral (÷n−1) é < 2% e não muda ordem de limitação nenhuma; reescrever
//     estatística para ganhar isso criaria uma segunda verdade no app.
//
// NUNCA LANÇA. População impossível devolve `{ norma: null, motivo }` — quem
// chama é uma tela, e exceção em tela vira erro branco.
//
// Módulo PURO — sem DOM, sem I/O. npm run teste:foliar-normas

import { resumoValores } from '../validacao/estatistica.ts';
import { calcularClr, COMPONENTE_RESIDUO } from './cnd.ts';
import { corteDeProdutividade, gerarChance, type AmostraPopulacao } from './chanceMatematica.ts';
import { paresDeNutrientes, razao } from './razoes.ts';
import {
  type FaixaNutriente, NUTRIENTES, type NormaCnd, type NormaDris,
  type NutrienteId, type Orgao, type ParNorma, type TeoresFoliares,
} from './tipos.ts';

/** Uma linha do banco: o laudo foliar e a produtividade que aquele talhão deu. */
export interface AmostraNorma {
  teores: TeoresFoliares;
  produtividadeKgha: number;
}

export interface OpcoesNorma {
  cultura: string;
  orgao: Orgao;
  estadio: string;
  /** Corte absoluto de alta produtividade (kg/ha). Precede `percentil`. */
  corteKgha?: number;
  /** Quantil da produtividade usado como corte. Padrão 0,75. */
  percentil?: number;
  /** Abaixo disto a norma sai com aviso de baixa confiança. Padrão 30. */
  nMinimo?: number;
  /** Abaixo disto um PAR sai com aviso. Padrão 10. */
  nMinimoPar?: number;
  /** Texto de `fonte`. O gerador compõe um padrão quando não vier. */
  fonte?: string;
  id?: string;
  versao?: number;
  /** Gerar também a Chance Matemática a partir da mesma população. Padrão true. */
  comChance?: boolean;
}

export interface ResultadoGeracao {
  norma: NormaDris | null;
  /** Presente ⇔ `norma === null`. Texto pronto para a tela. */
  motivo: string | null;
  avisos: string[];
}

export const N_MINIMO_NORMA = 30;
export const N_MINIMO_PAR = 10;

/** Variância populacional de um vetor. `null` com menos de 2 valores. */
function variancia(valores: number[]): number | null {
  const r = resumoValores(valores);
  if (!r || r.n < 2) return null;
  return r.desvio * r.desvio;
}

interface EstatisticaRazao {
  media: number;
  dp: number;
  cv: number;
  n: number;
}

function estatisticaDeRazao(valores: number[]): EstatisticaRazao | null {
  const r = resumoValores(valores);
  if (!r || r.n < 2) return null;
  // CV calculado aqui e não lido de `resumoValores.cv`: lá ele vira `null`
  // quando a média está perto de zero (proteção para NDVI centrado). Razão
  // entre teores é sempre positiva e longe de zero, e Beaufils PRECISA do CV.
  const cv = r.media !== 0 ? (r.desvio / Math.abs(r.media)) * 100 : 0;
  return { media: r.media, dp: r.desvio, cv, n: r.n };
}

const razoesDe = (amostras: AmostraNorma[], a: NutrienteId, b: NutrienteId): number[] => {
  const out: number[] = [];
  for (const am of amostras) {
    const v = razao(am.teores, a, b);
    if (v != null && v > 0) out.push(v);
  }
  return out;
};

/**
 * Estatísticas clr da população de referência, para o CND.
 *
 * `covInversa` fica FORA de propósito: inverter a matriz de covariância de 12
 * componentes exige um banco grande e uma matriz não singular, e uma inversão
 * mal condicionada produz um D² numericamente lixo que parece um número.
 * Sem ela, `cnd.ts` devolve `mahalanobis: null` e diz o porquê.
 */
function estatisticasClr(alta: AmostraNorma[]): NormaCnd | null {
  const porComponente = new Map<string, number[]>();
  let usadas = 0;
  for (const am of alta) {
    const clr = calcularClr(am.teores);
    if (!clr) continue;
    usadas++;
    for (const [k, v] of Object.entries(clr.valores)) {
      const arr = porComponente.get(k) ?? [];
      arr.push(v);
      porComponente.set(k, arr);
    }
  }
  if (usadas < 2) return null;

  const media: Record<string, number> = {};
  const dp: Record<string, number> = {};
  for (const [k, valores] of porComponente) {
    const r = resumoValores(valores);
    if (!r || r.n < 2 || !(r.desvio > 0)) continue;   // componente constante não diagnostica
    media[k] = r.media;
    dp[k] = r.desvio;
  }
  const temNutriente = Object.keys(media).some(k => k !== COMPONENTE_RESIDUO);
  if (!temNutriente) return null;
  return { media, dp, covInversa: null, n: usadas };
}

/** Faixas = média ± 1 DP da população de alta produtividade (ver cabeçalho). */
function faixasDaAlta(alta: AmostraNorma[]): Partial<Record<NutrienteId, FaixaNutriente>> {
  const faixas: Partial<Record<NutrienteId, FaixaNutriente>> = {};
  for (const id of NUTRIENTES) {
    const valores: number[] = [];
    for (const am of alta) {
      const v = am.teores[id];
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) valores.push(v);
    }
    const r = resumoValores(valores);
    if (!r || r.n < 2) continue;
    faixas[id] = { min: Math.max(0, r.media - r.desvio), max: r.media + r.desvio };
  }
  return faixas;
}

/**
 * Gera a norma. Devolve `{ norma: null, motivo }` — nunca lança — quando a
 * população não sustenta uma norma.
 */
export function gerarNorma(amostras: AmostraNorma[], opcoes: OpcoesNorma): ResultadoGeracao {
  const avisos: string[] = [];
  const nMinimo = opcoes.nMinimo ?? N_MINIMO_NORMA;
  const nMinimoPar = opcoes.nMinimoPar ?? N_MINIMO_PAR;

  const validas = (amostras ?? []).filter(a =>
    a && a.teores && Number.isFinite(a.produtividadeKgha));
  if (validas.length < 4) {
    return { norma: null, motivo: 'População insuficiente: são necessárias ao menos 4 amostras com produtividade conhecida.', avisos };
  }

  const corte = corteDeProdutividade(validas.map(a => a.produtividadeKgha), opcoes);
  if (corte == null) {
    return { norma: null, motivo: 'Não foi possível definir o corte de alta produtividade.', avisos };
  }

  const alta = validas.filter(a => a.produtividadeKgha >= corte);
  const baixa = validas.filter(a => a.produtividadeKgha < corte);
  if (alta.length < 2) {
    return { norma: null, motivo: `Apenas ${alta.length} amostra(s) acima do corte de ${Math.round(corte)} kg/ha — a população de referência precisa de pelo menos 2.`, avisos };
  }
  if (!baixa.length) {
    avisos.push('Nenhuma amostra abaixo do corte: o teste F não pôde escolher a ordem dos pares, que ficaram na ordem canônica (A/B).');
  }

  const pares: ParNorma[] = [];
  const paresFracos: string[] = [];
  const paresDescartados: string[] = [];

  for (const p of paresDeNutrientes(NUTRIENTES)) {
    const altaD = razoesDe(alta, p.a, p.b);
    const altaI = razoesDe(alta, p.b, p.a);
    const estD = estatisticaDeRazao(altaD);
    const estI = estatisticaDeRazao(altaI);
    if (!estD && !estI) { paresDescartados.push(`${p.a}/${p.b}`); continue; }

    const varAltaD = estD ? estD.dp * estD.dp : null;
    const varAltaI = estI ? estI.dp * estI.dp : null;
    const varBaixaD = baixa.length ? variancia(razoesDe(baixa, p.a, p.b)) : null;
    const varBaixaI = baixa.length ? variancia(razoesDe(baixa, p.b, p.a)) : null;

    const fD = varAltaD != null && varAltaD > 0 && varBaixaD != null ? varBaixaD / varAltaD : null;
    const fI = varAltaI != null && varAltaI > 0 && varBaixaI != null ? varBaixaI / varAltaI : null;

    // Maior F vence. Empate ou ausência de F mantém a ordem canônica A/B —
    // decisão estável, para a mesma população nunca gerar duas normas
    // diferentes por causa de arredondamento.
    const usarInversa = estI != null && (estD == null || (fI != null && (fD == null || fI > fD)));
    const est = usarInversa ? (estI as EstatisticaRazao) : (estD as EstatisticaRazao | null);
    if (!est) { paresDescartados.push(`${p.a}/${p.b}`); continue; }
    if (!(est.dp > 0)) { paresDescartados.push(`${p.a}/${p.b}`); continue; }

    const a = usarInversa ? p.b : p.a;
    const b = usarInversa ? p.a : p.b;
    const nBaixa = baixa.length ? razoesDe(baixa, a, b).length : 0;

    pares.push({
      a, b,
      media: est.media, dp: est.dp, cv: est.cv,
      f: usarInversa ? fI : fD,
      nAlta: est.n,
      nBaixa,
    });
    if (est.n < nMinimoPar) paresFracos.push(`${a}/${b} (n=${est.n})`);
  }

  if (!pares.length) {
    return { norma: null, motivo: 'Nenhum par de nutrientes teve variação suficiente na população de alta produtividade para virar norma.', avisos };
  }

  if (alta.length < nMinimo) {
    avisos.push(`CONFIANÇA BAIXA: a população de referência tem ${alta.length} amostra(s), abaixo do mínimo recomendado de ${nMinimo}. Normas DRIS estáveis na literatura usam centenas (n=608 em Kurihara et al. 2013).`);
  }
  if (paresFracos.length) {
    avisos.push(`Par(es) com menos de ${nMinimoPar} amostras de alta produtividade: ${paresFracos.slice(0, 10).join(', ')}${paresFracos.length > 10 ? '…' : ''}.`);
  }
  if (paresDescartados.length) {
    avisos.push(`Par(es) descartados por falta de dado ou variação nula: ${paresDescartados.slice(0, 10).join(', ')}${paresDescartados.length > 10 ? '…' : ''}.`);
  }

  const cnd = estatisticasClr(alta);
  if (!cnd) avisos.push('Sem estatísticas clr: nenhuma amostra de alta produtividade fechou a composição (resíduo ≤ 0) ou não houve variação. O CND não estará disponível nesta norma.');
  else avisos.push('A norma não traz matriz de covariância inversa: a distância de Mahalanobis (D²) ficará indisponível na diagnose.');

  const faixas = faixasDaAlta(alta);
  const chance = opcoes.comChance === false
    ? null
    : gerarChance(validas as AmostraPopulacao[], { corteKgha: corte });

  const criterioCorte = typeof opcoes.corteKgha === 'number'
    ? `produtividade ≥ ${Math.round(corte)} kg/ha (corte informado)`
    : `produtividade ≥ ${Math.round(corte)} kg/ha (percentil ${Math.round((opcoes.percentil ?? 0.75) * 100)} da população)`;

  const norma: NormaDris = {
    id: opcoes.id,
    versao: opcoes.versao,
    cultura: opcoes.cultura,
    orgao: opcoes.orgao,
    estadio: opcoes.estadio,
    fonte: opcoes.fonte
      ?? `Norma gerada do banco INVICTA — ${validas.length} amostras, ${alta.length} de alta produtividade. Faixas = média ± 1 DP da população de referência (não é calibração com doses).`,
    origem: 'gerada',
    n: alta.length,
    criterioCorte,
    pares,
    cnd,
    faixas: Object.keys(faixas).length ? faixas : null,
    chance,
    avisos,
  };

  return { norma, motivo: null, avisos };
}
