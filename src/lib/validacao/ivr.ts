// IVR — Índice de Variabilidade Relativa.
//
// Responde "quanto varia lá dentro?" sem depender de um número só. O CV entra
// com o maior peso porque é a régua que o agrônomo já lê, mas sozinho ele
// mente em dois casos comuns: colhedora com dois pontos absurdos (o desvio
// dispara e a zona boa é reprovada) e camada centrada em zero (o CV explode).
// Por isso entram junto três medidas que não se movem com um ponto ruim:
// amplitude robusta (p95−p5), dispersão robusta (IQR) e a fração de outliers.
//
// Escala 0..100, MENOR é melhor — o nome é "variabilidade", então o número
// grande tem de ser o ruim; inverter isso na hora de compor o IQZM é
// responsabilidade de quem compõe, não deste módulo.
//
// npm run teste:validacao

import { escoreRuim } from './estatistica.ts';
import { faixaMenorMelhor, NOME_INDICADOR, pendente, type Indicador, type ResumoValores } from './tipos.ts';

/** Limiares agronômicos (em %). Vêm do CV que a plataforma já usa: ≤10 alta
 *  homogeneidade, >20 baixa — arredondados para bom/ruim de cada componente. */
export const LIMIARES_IVR = {
  cv: { bom: 8, ruim: 35 },
  amplitude: { bom: 20, ruim: 120 },   // (p95−p5) ÷ |mediana| × 100
  iqr: { bom: 10, ruim: 60 },          // IQR ÷ |mediana| × 100
  outliers: { bom: 0, ruim: 10 },      // % de valores fora da cerca de Tukey
};

const PESOS = { cv: 0.4, amplitude: 0.3, iqr: 0.2, outliers: 0.1 };

export interface DetalheIVR {
  cv: number | null;
  amplitudeRelativa: number | null;
  iqrRelativo: number | null;
  pctOutliers: number;
  componentes: Record<string, number>;   // escore 0..100 de cada um
}

export interface ResultadoIVR {
  indicador: Indicador;
  detalhe: DetalheIVR | null;
}

const fmt = (v: number, d = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * IVR de UM conjunto de valores (uma zona, normalmente).
 *
 * `escala` é a magnitude usada para relativizar amplitude e IQR: por padrão a
 * mediana (robusta). Quando a mediana é ~0 — NDVI de diferença, saldo de
 * nutriente —, cai para a amplitude total do talhão, porque dividir por zero
 * não é opção e o CV também já terá saído nulo.
 */
export function calcularIVR(r: ResumoValores | null, unidade = '', escalaTalhao?: number): ResultadoIVR {
  if (!r || r.n < 3) {
    return {
      indicador: pendente('ivr', r
        ? `Só ${r.n} pixel(s) da camada caem nesta zona — mínimo de 3 para medir variabilidade.`
        : 'A camada de validação não cobre esta zona.'),
      detalhe: null,
    };
  }

  const base = Math.abs(r.mediana) > 1e-9 ? Math.abs(r.mediana) : (escalaTalhao ?? r.amplitude);
  const usouMediana = Math.abs(r.mediana) > 1e-9;
  const ampRel = base > 0 ? ((r.p95 - r.p5) / base) * 100 : null;
  const iqrRel = base > 0 ? (r.iqr / base) * 100 : null;

  const comp: Record<string, number> = {};
  const pesos: Record<string, number> = {};
  if (r.cv != null) { comp.cv = escoreRuim(r.cv, LIMIARES_IVR.cv.bom, LIMIARES_IVR.cv.ruim); pesos.cv = PESOS.cv; }
  if (ampRel != null) { comp.amplitude = escoreRuim(ampRel, LIMIARES_IVR.amplitude.bom, LIMIARES_IVR.amplitude.ruim); pesos.amplitude = PESOS.amplitude; }
  if (iqrRel != null) { comp.iqr = escoreRuim(iqrRel, LIMIARES_IVR.iqr.bom, LIMIARES_IVR.iqr.ruim); pesos.iqr = PESOS.iqr; }
  comp.outliers = escoreRuim(r.pctOutliers, LIMIARES_IVR.outliers.bom, LIMIARES_IVR.outliers.ruim);
  pesos.outliers = PESOS.outliers;

  const somaPesos = Object.values(pesos).reduce((s, p) => s + p, 0);
  const ivr = Object.entries(comp).reduce((s, [k, v]) => s + v * (pesos[k] ?? 0), 0) / (somaPesos || 1);

  const partes = [
    r.cv != null ? `CV ${fmt(r.cv)}%` : 'CV não aplicável (média ~0)',
    ampRel != null ? `amplitude p95−p5 ${fmt(ampRel)}% da ${usouMediana ? 'mediana' : 'faixa do talhão'}` : null,
    iqrRel != null ? `IQR ${fmt(iqrRel)}%` : null,
    `${fmt(r.pctOutliers)}% de outliers`,
  ].filter(Boolean).join(' · ');

  const faixa = faixaMenorMelhor(ivr);
  const leitura = faixa === 'otimo' ? 'muito homogênea'
    : faixa === 'bom' ? 'homogênea o bastante para manejo uniforme'
    : faixa === 'regular' ? 'ainda variável por dentro'
    : 'heterogênea — a zona mistura realidades diferentes';

  return {
    indicador: {
      id: 'ivr', nome: NOME_INDICADOR.ivr, valor: Math.round(ivr * 10) / 10, unidade: '',
      faixa,
      justificativa: `${partes}. Composto: ${leitura}. Referência: CV ${LIMIARES_IVR.cv.bom}% (bom) a ${LIMIARES_IVR.cv.ruim}% (ruim)${unidade ? ` · valores em ${unidade}` : ''}.`,
      entradas: { n: r.n, cv: r.cv, mediana: r.mediana, p5: r.p5, p95: r.p95, iqr: r.iqr, pctOutliers: r.pctOutliers },
    },
    detalhe: { cv: r.cv, amplitudeRelativa: ampRel, iqrRelativo: iqrRel, pctOutliers: r.pctOutliers, componentes: comp },
  };
}

/** IVR do zoneamento inteiro: média dos IVR das zonas PONDERADA POR ÁREA — uma
 *  zona de 0,3 ha não pode pesar igual a uma de 40 ha na nota do mapa. */
export function ivrDoZoneamento(zonas: Array<{ areaHa: number; ivr: number | null }>): { valor: number | null; areaAvaliadaHa: number; areaTotalHa: number } {
  const areaTotalHa = zonas.reduce((s, z) => s + z.areaHa, 0);
  const comIvr = zonas.filter(z => z.ivr != null && z.areaHa > 0);
  const areaAvaliadaHa = comIvr.reduce((s, z) => s + z.areaHa, 0);
  if (!areaAvaliadaHa) return { valor: null, areaAvaliadaHa: 0, areaTotalHa };
  const v = comIvr.reduce((s, z) => s + z.areaHa * (z.ivr as number), 0) / areaAvaliadaHa;
  return { valor: Math.round(v * 10) / 10, areaAvaliadaHa, areaTotalHa };
}
