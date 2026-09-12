// FAIXA DE SUFICIÊNCIA — o método clássico, com as limitações à vista.
//
// Compara o teor ISOLADO com uma faixa mín–máx de calibração. É o método mais
// simples e o único que tem número publicado confiável para soja no Brasil
// (Kurihara et al. 2013, Rev. Ceres 60(3), n=608), por isso é o que o módulo
// entrega no dia 1 enquanto não houver norma DRIS carregada.
//
// LIMITAÇÃO QUE A TELA PRECISA MOSTRAR: por ignorar a interação entre
// nutrientes, a faixa é enganada pelo efeito de diluição/concentração — planta
// vigorosa dilui o teor e "aparece" deficiente. Além disso as faixas clássicas
// (Sfredo 1986 / Embrapa) são largas demais: o limite superior chega a 5–12× o
// inferior em Ca, Fe e Mn, o que faz quase toda amostra cair em "adequado". O
// próprio artigo de Kurihara existe para corrigir isso.
//
// `desvioPct` é medido contra o limite MAIS PRÓXIMO, não contra o centro da
// faixa: o agrônomo quer saber "quanto falta para entrar na faixa", não a
// distância até um ponto médio que ninguém calibrou.
//
// Módulo PURO — sem DOM, sem I/O. npm run teste:foliar

import { unidadeDe } from './nutrientes.ts';
import {
  type ClassificacaoFaixa, type EstadoNutricional, type FaixaNutriente,
  NUTRIENTES, type NormaDris, type NutrienteId, type ResultadoFaixa, type TeoresFoliares,
} from './tipos.ts';

/** Classifica UM teor contra UMA faixa. Exportada para a tela usar solta. */
export function classificarTeor(teor: number, faixa: FaixaNutriente): { estado: EstadoNutricional; desvioPct: number } {
  if (teor < faixa.min) {
    // Desvio negativo = falta. Divide pelo limite (não pela amplitude) para o
    // número ser lido como "18% abaixo do mínimo".
    const base = faixa.min !== 0 ? Math.abs(faixa.min) : 1;
    return { estado: 'deficiente', desvioPct: ((teor - faixa.min) / base) * 100 };
  }
  if (teor > faixa.max) {
    const base = faixa.max !== 0 ? Math.abs(faixa.max) : 1;
    return { estado: 'excessivo', desvioPct: ((teor - faixa.max) / base) * 100 };
  }
  return { estado: 'adequado', desvioPct: 0 };
}

/**
 * Classifica a amostra inteira. Devolve `null` quando a norma não traz faixas
 * — sem faixa publicada não há classificação, e um "adequado" default seria a
 * pior mentira possível (ledger 17).
 */
export function classificarPorFaixa(
  teores: TeoresFoliares,
  norma: Pick<NormaDris, 'faixas' | 'fonte'>,
): ResultadoFaixa | null {
  const faixas = norma?.faixas;
  if (!faixas) return null;

  const itens: ClassificacaoFaixa[] = [];
  const semTeor: NutrienteId[] = [];
  const semFaixa: NutrienteId[] = [];

  for (const id of NUTRIENTES) {
    const faixa = faixas[id];
    const teor = teores[id];
    const temTeor = typeof teor === 'number' && Number.isFinite(teor);
    if (!faixa || !Number.isFinite(faixa.min) || !Number.isFinite(faixa.max)) {
      if (temTeor) semFaixa.push(id);
      continue;
    }
    if (!temTeor) { semTeor.push(id); continue; }
    const { estado, desvioPct } = classificarTeor(teor as number, faixa);
    itens.push({
      nutriente: id, teor: teor as number, min: faixa.min, max: faixa.max,
      unidade: unidadeDe(id), estado, desvioPct,
    });
  }

  if (!itens.length) return null;

  const avisos: string[] = [];
  if (semFaixa.length) avisos.push(`Sem faixa publicada nesta norma para: ${semFaixa.join(', ')}.`);
  if (semTeor.length) avisos.push(`Nutriente(s) com faixa mas sem teor no laudo: ${semTeor.join(', ')}.`);
  avisos.push('A faixa de suficiência avalia o teor isolado: não enxerga interação entre nutrientes nem efeito de diluição por crescimento.');

  return { itens, fonte: norma.fonte ?? '', avisos };
}
