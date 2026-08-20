// A ZONA COMO UNIDADE DA PRESCRIÇÃO — agrupamento e formato.
//
// A taxa de cada zona NÃO se lê de mapa: ela é calculada direto da equação com
// o laudo da zona (ver `doseZonaDireta.ts` e `calcularDosePorZona`). Este módulo
// cuida só de QUEM é uma zona: as manchas de um mesmo número são uma zona só.
//
// Houve aqui, por uma versão, um detector que deduzia "é por zona" de o mapa da
// dose estar CHAPADO. Foi removido: uma dose interpolada também sai uniforme
// quando a equação satura tudo no teto (`doseMaxima`) ou no piso
// (`abaixoMinimo: 'minimo'`), e nesse caso o arquivo da máquina passaria a ter a
// área do zoneamento em vez da do talhão, entregando taxa fixa como se fosse
// prescrição por zona. Deduzir era o erro; hoje o usuário ESCOLHE o modo e a
// conta é feita direto do laudo.
//
// Módulo PURO e AUTOCONTIDO — sem import nenhum. npm run teste:dosezona

export interface ZonaGeom {
  /** identidade do POLÍGONO ("01", "01_2") */
  id: string;
  /** o número que o mapa mostra — zona de várias manchas repete o mesmo */
  rotulo: string;
  geometry: GeoJSON.Geometry;
}

/** Uma zona com a sua taxa, pronta para virar feição do Shapefile. */
export interface DoseDaZona {
  id: string;
  rotulo: string;
  geometry: GeoJSON.Geometry;
  dose: number;
}

/** Anéis de um Polygon/MultiPolygon, no formato de partes de MultiPolygon. */
function partesDe(g: GeoJSON.Geometry): GeoJSON.Position[][][] {
  if (g.type === 'Polygon') return [g.coordinates];
  if (g.type === 'MultiPolygon') return g.coordinates;
  return [];
}

/**
 * Junta as manchas de uma mesma zona numa entrada só (geometria = MultiPolygon).
 *
 * A zona é a unidade da amostragem composta: "01" e "01_2" são pedaços do mesmo
 * saco que foi ao laboratório, e por isso têm de receber o MESMO valor de laudo
 * e a MESMA taxa. Tratadas separadamente, cada mancha disputaria um número de
 * amostra no vínculo zona↔amostra e a zona sairia com duas taxas diferentes —
 * sem nada na tela denunciando.
 */
export function agruparPorRotulo(zonas: ZonaGeom[]): ZonaGeom[] {
  const ordem: string[] = [];
  const porRotulo = new Map<string, ZonaGeom[]>();
  for (const z of zonas) {
    let g = porRotulo.get(z.rotulo);
    if (!g) { g = []; porRotulo.set(z.rotulo, g); ordem.push(z.rotulo); }
    g.push(z);
  }
  return ordem.map(rot => {
    const g = porRotulo.get(rot)!;
    return {
      id: g[0].id,
      rotulo: rot,
      geometry: g.length === 1
        ? g[0].geometry
        : { type: 'MultiPolygon', coordinates: g.flatMap(m => partesDe(m.geometry)) },
    };
  });
}
