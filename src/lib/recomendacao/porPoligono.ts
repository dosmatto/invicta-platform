// QUANTO DE INSUMO CAI EM CADA ÁREA SEPARADA do talhão.
//
// Um talhão multipolígono são duas ou mais manchas separadas por estrada, mata
// ou benfeitoria. A recomendação é uma só, mas a CARRETA é despachada para uma
// mancha de cada vez — e o relatório dizia apenas o total do talhão, deixando o
// rateio para a conta de cabeça de quem está no pátio.
//
// A distribuição sai do RASTER, não da área: duas manchas de 10 ha podem pedir
// tonelagens bem diferentes se uma delas for mais ácida. Para cada parte, a
// massa é a integral da dose (kg/ha) ponderada pela fração de cada célula que
// cai dentro dela — `coberturaDoGrid`, a mesma conta que já sustenta a dose
// média e o custo do PDF.
//
// O TOTAL, porém, continua sendo o que o relatório já mostra: as partes são
// rateadas sobre ele. Discretizar o raster dá um número ligeiramente diferente
// da área de cadastro, e um relatório em que a soma das partes não fecha com o
// total é um relatório que o usuário confere na calculadora e não confia mais.
//
// Módulo PURO — `npm run teste:porpoligono`.

import { coberturaDoGrid } from './cobertura.ts';
import { partesComArea } from '../areaGeo.ts';

export interface DoseParaParte {
  produto: string;                                  // chave de agregação (produto || fórmula)
  valores: Float32Array;                            // grid da dose, NaN fora do talhão
  shape: [number, number];
  bounds: [number, number, number, number];
  toneladas: number;                                // total do talhão, já reportado
  custo: number;
}

export interface ParteComVolume {
  indice: number;                 // posição na geometria (casa com separarPartes)
  rotulo: string;                 // "Área 1", "Área 2"… (maior primeiro)
  areaHa: number;
  pct: number;                    // fatia da área do talhão
  porProduto: Record<string, number>;   // toneladas
  custo: number;
}

const chaveGrid = (d: DoseParaParte) => `${d.shape.join('x')}|${d.bounds.join(',')}`;

/** A parte `indice` do polígono como um Polygon isolado. */
export function parteComoPoligono(
  p: GeoJSON.Polygon | GeoJSON.MultiPolygon, indice: number,
): GeoJSON.Polygon {
  const partes = p.type === 'Polygon' ? [p.coordinates] : p.coordinates;
  return { type: 'Polygon', coordinates: partes[indice] ?? [] };
}

/** Quantas manchas separadas o talhão tem. 1 = não há o que ratear. */
export function nPartes(p: GeoJSON.Polygon | GeoJSON.MultiPolygon | null): number {
  if (!p) return 0;
  return p.type === 'Polygon' ? 1 : p.coordinates.length;
}

/**
 * Rateia cada dose pelas partes do talhão.
 *
 * Devolve as partes ORDENADAS DA MAIOR PARA A MENOR (ordem de `partesComArea`,
 * a mesma que a lista da fazenda usa), com o rótulo já pronto.
 */
export function volumesPorParte(
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  doses: DoseParaParte[],
): ParteComVolume[] {
  const areas = partesComArea(poligono);
  if (areas.length === 0) return [];

  // Cobertura de cada parte por GRID distinto — equações diferentes podem ter
  // malhas diferentes, e recalcular por dose custaria caro à toa.
  const cache = new Map<string, Float32Array[]>();
  const pesosDe = (d: DoseParaParte): Float32Array[] => {
    const k = chaveGrid(d);
    let ps = cache.get(k);
    if (!ps) {
      ps = areas.map(a => coberturaDoGrid(d.shape, d.bounds, parteComoPoligono(poligono, a.indice)));
      cache.set(k, ps);
    }
    return ps;
  };

  const out: ParteComVolume[] = areas.map((a, i) => ({
    indice: a.indice, rotulo: `Área ${i + 1}`, areaHa: a.areaHa, pct: a.pct,
    porProduto: {}, custo: 0,
  }));

  for (const d of doses) {
    const pesos = pesosDe(d);
    const massa = pesos.map(peso => {
      let s = 0;
      const n = Math.min(peso.length, d.valores.length);
      for (let i = 0; i < n; i++) {
        const v = d.valores[i];
        if (Number.isFinite(v) && peso[i] > 0) s += v * peso[i];
      }
      return s;
    });
    const total = massa.reduce((s, v) => s + v, 0);
    // Sem massa (grid vazio ou dose zerada): rateia pela ÁREA, que é a melhor
    // aproximação disponível — e nunca deixa a linha do produto em branco.
    const fracao = total > 0 ? massa.map(m => m / total) : areas.map(a => a.pct / 100);
    out.forEach((parte, i) => {
      const f = fracao[i] ?? 0;
      parte.porProduto[d.produto] = (parte.porProduto[d.produto] ?? 0) + d.toneladas * f;
      parte.custo += d.custo * f;
    });
  }
  return out;
}

/** Total por produto somando as partes — para a linha de fechamento da tabela. */
export function totaisPorProduto(partes: ParteComVolume[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of partes) for (const [k, v] of Object.entries(p.porProduto)) out[k] = (out[k] ?? 0) + v;
  return out;
}
