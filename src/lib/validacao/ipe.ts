// IPE — Índice de Persistência Espacial.
//
// A pergunta é: o padrão que virou zona se REPETE de safra em safra, ou o mapa
// de um ano é fotografia de um evento (uma chuva, uma falha de plantio, uma
// praga)? Zona que não persiste não deveria virar decisão de investimento — é
// o indicador que separa "ambiente" de "acidente".
//
// Como mede, em duas leituras que se completam:
//   1. CONCORDÂNCIA ESPACIAL — cada safra é classificada em terços (alto/
//      médio/baixo) pelos SEUS próprios quantis, e conta-se a fração da área
//      que cai no mesmo terço em cada par de safras. Classificar por quantis
//      da própria safra é o que torna anos bons e anos ruins comparáveis: o
//      que interessa é o padrão relativo dentro do talhão, não o nível.
//   2. REPETIBILIDADE DO ORDENAMENTO — Spearman entre a ordem das zonas
//      (pela média) de uma safra e de outra. Responde "a zona 1 continua
//      sendo a melhor?" mesmo quando a mancha muda de forma nas bordas.
//
// Sem 2 safras não há o que medir: o indicador volta PENDENTE dizendo o que
// falta. Nada de proxy silencioso — decisão do projeto.
//
// npm run teste:validacao

import { quantil, spearman } from './estatistica.ts';
import { malhaNasZonas, valorNoPonto, decodificarF32, type Bounds, type Grid, type ZonaGeom } from './amostragem.ts';
import { faixaMaiorMelhor, NOME_INDICADOR, pendente, type Indicador } from './tipos.ts';

export interface CamadaTemporal {
  id: string;
  nome: string;
  /** Rótulo do período: safra ("23/24"), ano ou data. Períodos iguais contam 1. */
  periodo: string;
  grid: Grid;
  bounds: Bounds;
}

export interface DetalheIPE {
  periodos: string[];
  paresComparados: number;
  concordanciaMedia: number;      // 0..1
  concordanciaPares: Array<{ a: string; b: string; valor: number }>;
  pctAreaSempreNoMesmoTerco: number;
  spearmanMedio: number | null;   // ordenamento das zonas entre safras
  nPontos: number;
}

export interface ResultadoIPE {
  indicador: Indicador;
  detalhe: DetalheIPE | null;
}

const fmt = (v: number, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Terço a que o valor pertence, pelos quantis da PRÓPRIA camada. */
function tercos(valores: number[]): { corte1: number; corte2: number } {
  const ord = valores.filter(Number.isFinite).sort((a, b) => a - b);
  return { corte1: quantil(ord, 1 / 3), corte2: quantil(ord, 2 / 3) };
}

export function calcularIPE(zonas: ZonaGeom[], camadas: CamadaTemporal[], nAlvo = 2500): ResultadoIPE {
  // Períodos distintos — duas versões do mapa da MESMA safra não são duas
  // observações no tempo; contá-las inflaria o índice de graça.
  const porPeriodo = new Map<string, CamadaTemporal>();
  for (const c of camadas) if (!porPeriodo.has(c.periodo)) porPeriodo.set(c.periodo, c);
  const series = [...porPeriodo.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));

  if (series.length < 2) {
    const tem = series.length === 1 ? `Há apenas 1 safra com dado (${series[0].periodo}).` : 'Não há camada com safra identificada.';
    return {
      indicador: pendente('ipe', `${tem} A persistência compara o padrão de uma safra com o de outra — com uma só, não há o que comparar. Fica em aberto até a próxima safra entrar.`),
      detalhe: null,
    };
  }

  const pontos = malhaNasZonas(zonas, nAlvo);
  if (pontos.length < 30) {
    return { indicador: pendente('ipe', `Só ${pontos.length} ponto(s) de amostragem caíram dentro das zonas — insuficiente para comparar safras.`), detalhe: null };
  }

  // Classe (0/1/2) de cada ponto em cada safra + média por zona em cada safra.
  const classes: number[][] = [];
  const mediasPorZona: Array<Map<string, number[]>> = [];
  for (const s of series) {
    let vals: Float32Array;
    try { vals = decodificarF32(s.grid.b64); } catch { vals = new Float32Array(0); }
    const brutos = pontos.map(p => valorNoPonto(s.grid, s.bounds, p.lng, p.lat, vals));
    const { corte1, corte2 } = tercos(brutos);
    classes.push(brutos.map(v => (!Number.isFinite(v) ? -1 : v <= corte1 ? 0 : v <= corte2 ? 1 : 2)));
    const m = new Map<string, number[]>();
    pontos.forEach((p, i) => {
      if (!Number.isFinite(brutos[i])) return;
      let arr = m.get(p.idZona);
      if (!arr) { arr = []; m.set(p.idZona, arr); }
      arr.push(brutos[i]);
    });
    mediasPorZona.push(m);
  }

  // 1) concordância par a par
  const pares: Array<{ a: string; b: string; valor: number }> = [];
  for (let i = 0; i < series.length; i++) {
    for (let j = i + 1; j < series.length; j++) {
      let iguais = 0, total = 0;
      for (let k = 0; k < pontos.length; k++) {
        const ca = classes[i][k], cb = classes[j][k];
        if (ca < 0 || cb < 0) continue;
        total++;
        if (ca === cb) iguais++;
      }
      if (total > 0) pares.push({ a: series[i].periodo, b: series[j].periodo, valor: iguais / total });
    }
  }
  if (!pares.length) {
    return { indicador: pendente('ipe', 'As safras disponíveis não se sobrepõem espacialmente — nenhum ponto tem dado nas duas.'), detalhe: null };
  }
  const concordanciaMedia = pares.reduce((s, p) => s + p.valor, 0) / pares.length;

  // 2) área que ficou SEMPRE no mesmo terço (leitura mais dura que a média)
  let sempre = 0, validos = 0;
  for (let k = 0; k < pontos.length; k++) {
    const cs = classes.map(c => c[k]).filter(c => c >= 0);
    if (cs.length < series.length) continue;
    validos++;
    if (cs.every(c => c === cs[0])) sempre++;
  }
  const pctSempre = validos ? (sempre / validos) * 100 : 0;

  // 3) o ordenamento das zonas se mantém?
  const idsZona = [...new Set(pontos.map(p => p.idZona))].sort();
  const mediaSerie = mediasPorZona.map(m => idsZona.map(id => {
    const v = m.get(id);
    return v && v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN;
  }));
  const rhos: number[] = [];
  for (let i = 0; i < mediaSerie.length; i++) {
    for (let j = i + 1; j < mediaSerie.length; j++) {
      const a: number[] = [], b: number[] = [];
      for (let k = 0; k < idsZona.length; k++) {
        if (Number.isFinite(mediaSerie[i][k]) && Number.isFinite(mediaSerie[j][k])) { a.push(mediaSerie[i][k]); b.push(mediaSerie[j][k]); }
      }
      const r = spearman(a, b);
      if (r != null) rhos.push(r);
    }
  }
  const spearmanMedio = rhos.length ? rhos.reduce((s, r) => s + r, 0) / rhos.length : null;

  const ipe = concordanciaMedia * 100;
  const faixa = faixaMaiorMelhor(ipe);
  const leitura = faixa === 'otimo' ? 'o padrão se repete safra após safra — é ambiente, não acaso'
    : faixa === 'bom' ? 'o padrão se mantém na maior parte da área'
    : faixa === 'regular' ? 'o padrão muda bastante entre safras — parte do mapa é efeito de ano'
    : 'o padrão praticamente não se repete: perto de 33%, que é o que o acaso daria com três classes';

  return {
    indicador: {
      id: 'ipe', nome: NOME_INDICADOR.ipe, valor: Math.round(ipe * 10) / 10, unidade: '%',
      faixa,
      justificativa: `${fmt(ipe)}% de concordância média entre ${series.length} safras (${series.map(s => s.periodo).join(', ')}), ${pares.length} par(es) comparado(s) · ${fmt(pctSempre)}% da área ficou sempre no mesmo terço${spearmanMedio != null ? ` · ordem das zonas se repete (Spearman ${spearmanMedio.toFixed(2)})` : ''}. ${leitura[0].toUpperCase()}${leitura.slice(1)}.`,
      entradas: { safras: series.length, pontos: pontos.length, concordanciaMedia, pctSempre, spearman: spearmanMedio },
    },
    detalhe: {
      periodos: series.map(s => s.periodo),
      paresComparados: pares.length,
      concordanciaMedia,
      concordanciaPares: pares,
      pctAreaSempreNoMesmoTerco: pctSempre,
      spearmanMedio,
      nPontos: pontos.length,
    },
  };
}
