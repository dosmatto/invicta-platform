// REGRAS PURAS da separação de uma área do talhão — pendência 19.
//
// Sem dependências de propósito (espelha lib/partesTalhao.ts): é aqui que moram
// as decisões que não podem estar erradas, e elas rodam em `npm run teste:desmembrar`
// sem navegador. As gravações (store, coletas, laudo) ficam em desmembrarTalhao.ts.
//
// A GARANTIA CENTRAL: número de amostra não se renumera. Ele está impresso na
// etiqueta do saco, foi na carta ao laboratório junto com a remessa e é a chave
// do casamento laudo↔ponto. Renumerar faria o resultado da amostra 18 cair no
// ponto errado — um mapa plausível e FALSO.

import { pontoEmParte } from './partesTalhao.ts';

/** O mínimo de um ponto de grade para estas regras (PontoAmostragem serve). */
export interface PontoNumerado {
  ordem: number;
  numero?: number;
  lng: number;
  lat: number;
}

/** Nº da amostra de um ponto — a MESMA conta do laudo (eloGrade.ts). */
export function numeroDoPonto(p: PontoNumerado): number {
  return p.numero ?? p.ordem + 1;
}

/**
 * Divide os pontos de uma grade entre os que caem na área que SAI e os que
 * FICAM. Devolve os objetos ORIGINAIS — número e ordem seguem intactos.
 */
export function separarPontos<T extends PontoNumerado>(
  pontos: T[], aneisQueSaem: GeoJSON.Position[][],
): { saem: T[]; ficam: T[] } {
  const saem: T[] = [], ficam: T[] = [];
  for (const p of pontos ?? []) (pontoEmParte(p.lng, p.lat, aneisQueSaem) ? saem : ficam).push(p);
  return { saem, ficam };
}

/**
 * Números de amostra que os pontos que chegam têm em comum com a grade do
 * destino. Qualquer repetição impede a fusão: duas amostras "18" na mesma grade
 * fazem o laudo casar valor no ponto errado, e não há desempate automático
 * seguro — o número já está impresso na etiqueta dos dois sacos.
 */
export function colisaoDeNumeros(chegam: PontoNumerado[], jaExistem: PontoNumerado[]): number[] {
  const tem = new Set(jaExistem.map(numeroDoPonto));
  return [...new Set(chegam.map(numeroDoPonto).filter(n => tem.has(n)))].sort((a, b) => a - b);
}

/** Lista de números compacta: "4, 5, 18-22, 38" — como se lê a etiqueta. */
export function numerosEmFaixas(nums: number[]): string {
  const ord = [...new Set(nums)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < ord.length;) {
    let j = i;
    while (j + 1 < ord.length && ord[j + 1] === ord[j] + 1) j++;
    out.push(j > i + 1 ? `${ord[i]}-${ord[j]}` : ord.slice(i, j + 1).join(', '));
    i = j + 1;
  }
  return out.join(', ');
}

/** FeatureCollection de um conjunto de partes — uma feature por parte, como o
 *  editor de traçado grava (aplicarEdicao em TalhaoDetailPanel). */
export function fcDePartes(partes: GeoJSON.Position[][][], nome: string): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: partes.map(coordinates => ({
      type: 'Feature' as const,
      properties: { nome },
      geometry: { type: 'Polygon' as const, coordinates },
    })),
  };
}

/**
 * A geometria depois da cirurgia: o que fica no talhão e o que sai. Os vértices
 * não são recalculados — o que fica é o polígono original, idêntico.
 */
export function geometriaSemParte(
  partes: GeoJSON.Position[][][], indice: number, nome: string,
): { fica: GeoJSON.FeatureCollection; sai: GeoJSON.FeatureCollection } | null {
  if (indice < 0 || indice >= partes.length || partes.length < 2) return null;
  return {
    fica: fcDePartes(partes.filter((_, i) => i !== indice), nome),
    sai: fcDePartes([partes[indice]], nome),
  };
}

export function bboxDeFC(fc: GeoJSON.FeatureCollection): [number, number, number, number] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const f of fc.features) {
    const g = f.geometry as GeoJSON.Polygon;
    for (const anel of g.coordinates) for (const [x, y] of anel) {
      if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y;
    }
  }
  return [w, s, e, n];
}
