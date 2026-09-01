'use client';

// A LEGENDA QUE O USUÁRIO DESIGNOU para um módulo — fonte única.
//
// Cada aba (Condutividade, Produtividade, NDVI) tem um seletor "Legenda do
// mapa" e lembra a escolha em localStorage. Quem desenha a MESMA camada em
// OUTRO lugar — o comparador, o fundo do editor de zonas — precisa chegar na
// mesma legenda, senão o mapa sai com cores que não são as daquela camada.
//
// Foi exatamente o que aconteceu: o fundo do editor pegava a primeira legenda
// da ordem canônica e pintava a condutividade em tons de laranja, enquanto a
// aba Condutividade mostrava a legenda por quartil (vermelho→azul) que o
// usuário tinha escolhido. Duas telas, duas paletas, a mesma camada — e o
// comparativo visual perde o sentido.
//
// A regra é a MESMA das abas (ver CondutividadeSection/ProdutividadeSection):
// preferência salva → `respeitarPadraoHomonima` → senão o fallback do módulo →
// senão a primeira da ordem canônica.

import { getLegendas } from './store';
import { ordenarLegendasDoAtributo, respeitarPadraoHomonima, type Legenda } from './legendas';

/** Chaves de preferência, as mesmas que as abas gravam. */
export const PREF_LEGENDA = {
  condutividade: 'inv_leg_pref_condutividade',
  produtividade: 'inv_leg_pref_produtividade',
  ndvi: 'inv_leg_pref_ndvi',
} as const;

export function legendasDoAtributo(atributoId: string, categoria?: string): Legenda[] {
  const cat = categoria ?? atributoId;
  return ordenarLegendasDoAtributo(
    getLegendas().filter(l => l.atributoId === atributoId || l.categoria === cat),
  );
}

/**
 * A legenda designada do módulo. `fallback` cobre o caso em que o módulo tem
 * uma regra própria sem escolha explícita (produtividade usa a da cultura).
 */
export function legendaDesignada(
  atributoId: string,
  prefKey: string,
  fallback?: Legenda | null,
  categoria?: string,
): Legenda | null {
  const lista = legendasDoAtributo(atributoId, categoria);
  if (lista.length === 0) return fallback ?? null;
  const pref = typeof window !== 'undefined' ? localStorage.getItem(prefKey) : null;
  const alvo = pref ? lista.find(l => l.id === pref) : undefined;
  // A escolha pode apontar para a "gêmea" não-padrão (mesmo nome): nesse caso
  // vale a padrão, como as abas já fazem.
  if (alvo) return respeitarPadraoHomonima(lista, alvo);
  return fallback ?? lista[0] ?? null;
}
