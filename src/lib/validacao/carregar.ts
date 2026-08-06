'use client';

// Carregamento das camadas para o validador — a única parte NÃO pura do módulo.
//
// Reusa listarCamadas() do comparador, que já co-registra Produtividade, NDVI,
// Condutividade e Fertilidade no mesmo formato (grid + bounds + unidade). Duas
// diferenças de propósito:
//
//  • safra VAZIA na chamada: o comparador mostra a safra corrente, o validador
//    precisa de TODAS — é delas que sai a série do IPE.
//  • só PRODUTIVIDADE recebe `periodo`. NDVI tem várias datas dentro da mesma
//    safra; tratá-las como safras diferentes inflaria a persistência de graça,
//    dizendo "o padrão se repete" sobre duas fotos do mesmo ciclo.

import { listarCamadas } from '../comparador';
import type { CamadaValidacao } from './validar.ts';

export interface CamadasValidacao {
  camadas: CamadaValidacao[];
  /** Períodos distintos com produtividade — o que o IPE tem para comparar. */
  periodos: string[];
}

export async function carregarCamadasValidacao(talhaoId: string): Promise<CamadasValidacao> {
  const brutas = await listarCamadas(talhaoId, '');

  // Uma camada por safra na série temporal: a OFICIAL manda; sem oficial, a
  // versão mais recente (listarCamadas já vem ordenada por criação desc).
  const vistos = new Set<string>();
  const camadas: CamadaValidacao[] = [];
  for (const c of [...brutas].sort((a, b) => Number(b.nome.includes('(oficial)')) - Number(a.nome.includes('(oficial)')))) {
    const temporal = c.grupo === 'Produtividade' && !!c.periodo;
    let periodo: string | undefined;
    if (temporal) {
      if (vistos.has(c.periodo!)) periodo = undefined;   // 2ª versão da mesma safra: entra como camada, não como período
      else { periodo = c.periodo; vistos.add(c.periodo!); }
    }
    camadas.push({
      id: c.id,
      nome: c.sub ? `${c.nome} · ${c.sub}` : c.nome,
      unidade: c.unidade,
      grupo: c.grupo,
      grid: c.grid,
      bounds: c.bounds,
      periodo,
    });
  }

  return { camadas, periodos: [...vistos].sort() };
}
