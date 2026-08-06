// Métricas ESPACIAIS do zoneamento — fragmentação e continuidade.
//
// Duas zonas com exatamente a mesma estatística podem ser mapas completamente
// diferentes no campo: uma em três manchas inteiriças, outra em quarenta
// respingos de meio hectare. A segunda tem CV igual e é inoperável — a
// máquina não consegue trocar de dose a cada 20 metros, e o operador ignora.
// Nenhum índice estatístico vê isso; estas métricas veem.
//
// Geometria autocontida de propósito (área por excesso esférico, perímetro por
// haversine), no mesmo espírito de rasterStats.ts: o módulo roda em node, sem
// turf, e pode ser testado isolado. npm run teste:validacao

const R_TERRA = 6_371_008.8;   // raio médio (m), IUGG
const rad = (g: number) => (g * Math.PI) / 180;

type Anel = GeoJSON.Position[];

function aneisDe(g: GeoJSON.Geometry | null | undefined): Anel[][] {
  if (!g) return [];
  if (g.type === 'Polygon') return [g.coordinates];
  if (g.type === 'MultiPolygon') return g.coordinates;
  return [];
}

/** Área geodésica de um anel (m²), positiva. Fórmula do excesso esférico. */
function areaAnelM2(anel: Anel): number {
  const n = anel.length;
  if (n < 3) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = anel[i];
    const [x2, y2] = anel[(i + 1) % n];
    total += rad(x2 - x1) * (2 + Math.sin(rad(y1)) + Math.sin(rad(y2)));
  }
  return Math.abs((total * R_TERRA * R_TERRA) / 2);
}

/** Perímetro do anel externo (m) por haversine. */
function perimetroAnelM(anel: Anel): number {
  let p = 0;
  for (let i = 1; i < anel.length; i++) {
    const [x1, y1] = anel[i - 1];
    const [x2, y2] = anel[i];
    const dLat = rad(y2 - y1), dLon = rad(x2 - x1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(y1)) * Math.cos(rad(y2)) * Math.sin(dLon / 2) ** 2;
    p += 2 * R_TERRA * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  return p;
}

export interface MetricasPoligono {
  areaHa: number;
  perimetroM: number;
  /** perímetro ÷ perímetro de um círculo de mesma área. 1 = círculo, >2 = renda. */
  indiceForma: number;
}

export function metricasPoligono(g: GeoJSON.Geometry | null | undefined, areaHaProp?: number): MetricasPoligono {
  const polys = aneisDe(g);
  let areaM2 = 0, perim = 0;
  for (const rings of polys) {
    if (!rings.length) continue;
    areaM2 += areaAnelM2(rings[0]);
    for (let k = 1; k < rings.length; k++) areaM2 -= areaAnelM2(rings[k]);   // furos
    perim += perimetroAnelM(rings[0]);
  }
  // A área salva no zoneamento manda quando existe: é a que a plataforma toda
  // mostra, e divergir dela por casas decimais confundiria a leitura.
  const areaHa = areaHaProp != null && areaHaProp > 0 ? areaHaProp : areaM2 / 10_000;
  const aM2 = areaHa * 10_000;
  const indiceForma = aM2 > 0 && perim > 0 ? perim / (2 * Math.sqrt(Math.PI * aM2)) : 1;
  return { areaHa, perimetroM: perim, indiceForma };
}

export interface MetricasZonaEspacial {
  idZona: string;
  nPoligonos: number;
  areaHa: number;
  /** Maior mancha ÷ área da zona (LPI). 1 = zona inteiriça. */
  lpi: number;
  indiceForma: number;          // média ponderada por área
  areaFragmentosHa: number;     // área em polígonos abaixo do piso operacional
}

export interface MetricasEspaciais {
  nZonas: number;
  nPoligonos: number;
  poligonosPorZona: number;
  areaTotalHa: number;
  pctAreaFragmentos: number;    // % da área em polígonos < pisoHa
  lpiMedio: number;             // ponderado por área
  indiceFormaMedio: number;     // ponderado por área
  pisoHa: number;
  porZona: MetricasZonaEspacial[];
}

/**
 * Fragmentação e continuidade de um zoneamento.
 *
 * `pisoHa` é o tamanho abaixo do qual a mancha não é operável. Default 0,5 ha
 * (uma faixa de ~50 m em pivô/plantadeira grande); quando o zoneamento foi
 * gerado com área mínima, passe a dele — o piso é uma decisão agronômica, não
 * uma constante do software.
 */
export function metricasEspaciais(
  features: Array<{ idZona: string; geometry: GeoJSON.Geometry | null | undefined; areaHa?: number }>,
  pisoHa = 0.5,
): MetricasEspaciais {
  const piso = pisoHa > 0 ? pisoHa : 0.5;
  const porZonaMap = new Map<string, { areas: number[]; formas: number[]; }>();

  for (const f of features) {
    const m = metricasPoligono(f.geometry, f.areaHa);
    if (m.areaHa <= 0) continue;
    const cur = porZonaMap.get(f.idZona) ?? { areas: [], formas: [] };
    cur.areas.push(m.areaHa);
    cur.formas.push(m.indiceForma);
    porZonaMap.set(f.idZona, cur);
  }

  const porZona: MetricasZonaEspacial[] = [];
  for (const [idZona, d] of porZonaMap) {
    const areaHa = d.areas.reduce((s, a) => s + a, 0);
    const maior = Math.max(...d.areas);
    const formaPond = d.areas.reduce((s, a, i) => s + a * d.formas[i], 0) / (areaHa || 1);
    porZona.push({
      idZona,
      nPoligonos: d.areas.length,
      areaHa,
      lpi: areaHa > 0 ? maior / areaHa : 0,
      indiceForma: formaPond,
      areaFragmentosHa: d.areas.filter(a => a < piso).reduce((s, a) => s + a, 0),
    });
  }

  const areaTotalHa = porZona.reduce((s, z) => s + z.areaHa, 0);
  const nPoligonos = porZona.reduce((s, z) => s + z.nPoligonos, 0);
  const areaFrag = porZona.reduce((s, z) => s + z.areaFragmentosHa, 0);
  const pond = (sel: (z: MetricasZonaEspacial) => number) =>
    areaTotalHa > 0 ? porZona.reduce((s, z) => s + z.areaHa * sel(z), 0) / areaTotalHa : 0;

  return {
    nZonas: porZona.length,
    nPoligonos,
    poligonosPorZona: porZona.length ? nPoligonos / porZona.length : 0,
    areaTotalHa,
    pctAreaFragmentos: areaTotalHa > 0 ? (areaFrag / areaTotalHa) * 100 : 0,
    lpiMedio: pond(z => z.lpi),
    indiceFormaMedio: pond(z => z.indiceForma),
    pisoHa: piso,
    porZona: porZona.sort((a, b) => a.idZona.localeCompare(b.idZona)),
  };
}
