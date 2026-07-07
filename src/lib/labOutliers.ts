'use client';

// Detecção de possíveis OUTLIERS na importação de laboratório — trava de
// qualidade da entrada de dados. Duas camadas independentes por variável:
//   1) FAIXA PLAUSÍVEL (fixa, agronômica): pega o impossível — erro de unidade
//      ou de digitação (pH 85, V% 320, valor negativo). Sinalizado como 'faixa'.
//   2) ESTATÍSTICA (IQR / Tukey 1,5): pega o suspeito RELATIVO ao próprio lote —
//      um valor que destoa das demais amostras. Sinalizado como 'estatistico'.
// Tudo em UNIDADE CANÔNICA (a mesma em que os valores já chegam ao preview).

import type { ResultadoAmostra } from './lab';
import { simboloElemento } from './lab';

// Faixas fisicamente plausíveis por atributo (unidade canônica de unidades.ts).
// Não são faixas agronômicas de interpretação — são limites amplos, só para
// flagrar o que é impossível/erro grosseiro. Fora daqui = destaque vermelho.
export const FAIXAS_PLAUSIVEIS: Record<string, { min: number; max: number }> = {
  ph:      { min: 2,  max: 11 },
  p:       { min: 0,  max: 1000 },   // mg/dm³
  k:       { min: 0,  max: 60 },     // mmolc/dm³
  ca:      { min: 0,  max: 400 },    // mmolc/dm³
  mg:      { min: 0,  max: 150 },    // mmolc/dm³
  al:      { min: 0,  max: 100 },    // mmolc/dm³
  ctc:     { min: 0,  max: 600 },    // mmolc/dm³
  v:       { min: 0,  max: 100 },    // %
  m:       { min: 0,  max: 100 },    // %
  mo:      { min: 0,  max: 150 },    // g/dm³
  s:       { min: 0,  max: 500 },    // mg/dm³
  b:       { min: 0,  max: 50 },     // mg/dm³
  zn:      { min: 0,  max: 200 },    // mg/dm³
  cu:      { min: 0,  max: 100 },    // mg/dm³
  mn:      { min: 0,  max: 500 },    // mg/dm³
  textura: { min: 0,  max: 100 },    // %
};

export type TipoOutlier = 'faixa' | 'profundidade' | 'estatistico';
export interface FlagOutlier { tipo: TipoOutlier; motivo: string; }

// Severidade para desempate quando a mesma célula cai em mais de uma regra:
// faixa (impossível) > profundidade (inconsistência agronômica) > estatístico.
const SEVERIDADE: Record<TipoOutlier, number> = { faixa: 3, profundidade: 2, estatistico: 1 };

// Variáveis que, na prática, DIMINUEM com a profundidade. Se o horizonte mais
// fundo tiver valor MAIOR que o mais raso, é suspeito (troca/erro de amostra).
export const VARS_DECRESCEM_COM_PROFUNDIDADE = ['p', 'mo', 'v'];

// Chave única de uma amostra dentro do lote (campanha + ponto + profundidade).
export function chaveAmostra(r: { campanha: string; numero: number; profundidade: string }): string {
  return `${r.campanha}|${r.numero}|${r.profundidade}`;
}

const arred = (n: number) => Math.round(n * 100) / 100;

// Limites de Tukey (Q1 - 1,5·IQR, Q3 + 1,5·IQR) para um conjunto de valores.
// Precisa de amostra mínima (< 5 pontos não dá base estatística) e IQR > 0.
function limitesIQR(valores: number[]): { baixo: number; alto: number } | null {
  const v = valores.filter(x => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length < 5) return null;
  const quantil = (p: number) => {
    const i = (v.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return v[lo] + (v[hi] - v[lo]) * (i - lo);
  };
  const q1 = quantil(0.25), q3 = quantil(0.75), iqr = q3 - q1;
  if (iqr <= 0) return null;
  return { baixo: q1 - 1.5 * iqr, alto: q3 + 1.5 * iqr };
}

// Mapa: chaveAmostra → { elementoId → FlagOutlier }. Só entram células sinalizadas.
export type MapaOutliers = Map<string, Record<string, FlagOutlier>>;

// Início (cm) da faixa de profundidade — "20-40" → 20; usado só para ordenar camadas.
function inicioProfundidade(s: string): number {
  const m = (s || '').match(/\d+/);
  return m ? parseInt(m[0], 10) : NaN;
}

export function detectarOutliers(resultados: ResultadoAmostra[], elementos: string[]): MapaOutliers {
  const out: MapaOutliers = new Map();
  // Marca respeitando severidade: só sobrescreve se a nova flag for mais severa.
  const marcar = (r: ResultadoAmostra, elId: string, flag: FlagOutlier) => {
    const k = chaveAmostra(r);
    const linha = out.get(k) ?? out.set(k, {}).get(k)!;
    const atual = linha[elId];
    if (!atual || SEVERIDADE[flag.tipo] > SEVERIDADE[atual.tipo]) linha[elId] = flag;
  };

  // 1) Por variável: faixa plausível (fixa) e desvio estatístico (IQR/Tukey).
  for (const elId of elementos) {
    const valores = resultados.map(r => r.valores[elId]).filter((x): x is number => Number.isFinite(x));
    const lim = limitesIQR(valores);
    const faixa = FAIXAS_PLAUSIVEIS[elId];
    for (const r of resultados) {
      const v = r.valores[elId];
      if (v == null || !Number.isFinite(v)) continue;
      if (faixa && (v < faixa.min || v > faixa.max)) {
        marcar(r, elId, { tipo: 'faixa', motivo: `Fora da faixa plausível (${faixa.min}–${faixa.max})` });
      } else if (lim && (v < lim.baixo || v > lim.alto)) {
        marcar(r, elId, { tipo: 'estatistico', motivo: `Destoa das demais amostras (esperado ~${arred(lim.baixo)}–${arred(lim.alto)})` });
      }
    }
  }

  // 2) Inversão de profundidade: P, MO e V% devem cair da superfície para o fundo.
  // Agrupa as camadas do mesmo ponto (campanha|talhão|nº) e compara camadas vizinhas.
  const grupos = new Map<string, ResultadoAmostra[]>();
  for (const r of resultados) {
    const g = `${r.campanha}|${r.talhao}|${r.numero}`;
    (grupos.get(g) ?? grupos.set(g, []).get(g)!).push(r);
  }
  for (const camadas of grupos.values()) {
    const ordenadas = camadas
      .filter(r => Number.isFinite(inicioProfundidade(r.profundidade)))
      .sort((a, b) => inicioProfundidade(a.profundidade) - inicioProfundidade(b.profundidade));
    if (ordenadas.length < 2) continue;
    for (let i = 1; i < ordenadas.length; i++) {
      const raso = ordenadas[i - 1], fundo = ordenadas[i];
      for (const elId of VARS_DECRESCEM_COM_PROFUNDIDADE) {
        if (!elementos.includes(elId)) continue;
        const vr = raso.valores[elId], vf = fundo.valores[elId];
        if (vr == null || vf == null || !Number.isFinite(vr) || !Number.isFinite(vf)) continue;
        if (vf > vr) {
          marcar(fundo, elId, {
            tipo: 'profundidade',
            motivo: `${simboloElemento(elId)} maior no fundo (${fundo.profundidade}: ${vf}) que na superfície (${raso.profundidade}: ${vr}) — esperado diminuir com a profundidade`,
          });
        }
      }
    }
  }

  return out;
}

// Total de células sinalizadas no mapa.
export function contarOutliers(mapa: MapaOutliers): number {
  let n = 0;
  for (const linha of mapa.values()) n += Object.keys(linha).length;
  return n;
}
