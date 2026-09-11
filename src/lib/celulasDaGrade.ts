'use client';

// AS CÉLULAS DA AMOSTRAGEM COMPOSTA NO LUGAR DAS ZONAS DE MANEJO.
//
// Da Fertilidade para a frente, a plataforma inteira já sabe trabalhar com
// "áreas com um valor constante cada": é o modo zona do mapa, a dose por zona,
// o volume por mancha. A composta é exatamente isso — só que as áreas são as
// células da grade, e não o zoneamento do talhão.
//
// POR QUE UM MÓDULO PRÓPRIO, e não um ramo dentro de `zonasDoTalhao`: aquelas
// funções recebem um `talhaoId` e não sabem qual grade está ativa. As células
// pertencem a UMA GRADE — duas grades do mesmo talhão podem ter recortes
// diferentes, e o valor de cada amostra vale para o recorte que gerou a coleta,
// não para o mais recente.

import type { GradeAmostragem } from './store';
import type { ZonaTalhao } from './zonasDoTalhao';
import type { ZonaGeom } from './recomendacao/dosePorZona';

export function ehComposta(g?: GradeAmostragem | null): boolean {
  return g?.metodo === 'composta' && (g.celulas?.length ?? 0) > 0;
}

/** Formato da aba Fertilidade (`lib/zonasDoTalhao`). `classe` fica vazia de
 *  propósito: célula não tem classe de fertilidade — quem pinta o mapa é o
 *  valor do laudo, não uma classe prévia. */
export function celulasComoZonaTalhao(g?: GradeAmostragem | null): ZonaTalhao[] {
  if (!ehComposta(g)) return [];
  return g!.celulas!.map(c => ({ id: c.id, classe: '', geometry: c.geometry }));
}

/** Formato da Recomendação / Prescrição (`recomendacao/dosePorZona`). Na
 *  composta `rotulo === id`: o número da célula é o mesmo em todo lugar — no
 *  mapa, na etiqueta do saco e no laudo. */
export function celulasComoZonaGeom(g?: GradeAmostragem | null): ZonaGeom[] {
  if (!ehComposta(g)) return [];
  return g!.celulas!.map(c => ({ id: c.id, rotulo: c.id, geometry: c.geometry }));
}

/**
 * Vínculo célula ↔ número da amostra, EXATO.
 *
 * O vínculo por localização (`bindingPorPontos`) acertaria — todos os furos da
 * célula 2 têm `numero` 2 e nenhum furo de outra célula cai dentro dela —, mas
 * ele tem dois jeitos de errar que aqui não precisam existir: furo em cima da
 * divisa lido como da vizinha, e laudo sem o resultado de uma célula deslocando
 * todas as seguintes no fallback por ordem. Na composta o mapa é conhecido por
 * construção; usá-lo elimina a classe inteira de erro.
 */
export function bindingDasCelulas(g?: GradeAmostragem | null): Record<string, number> {
  const out: Record<string, number> = {};
  if (!ehComposta(g)) return out;
  for (const c of g!.celulas!) out[c.id] = c.numero;
  return out;
}
