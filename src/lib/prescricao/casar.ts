// CASAMENTO polígono ↔ zona da prescrição — o passo mais perigoso da exportação.
//
// O arquivo de aplicação é gerado percorrendo os POLÍGONOS do mapa e buscando a
// dose da zona correspondente. Até aqui a busca era só por `properties.id`, e
// quem não casava era DESCARTADO em silêncio: o SHP saía com parte do talhão —
// no relato do usuário, com UMA zona só — e a máquina aplica dose apenas onde há
// polígono. O resto do talhão passa em branco sem ninguém perceber.
//
// Duas defesas:
//   1. casar por id, e se não achar, pelo RÓTULO da zona (o `zona` do polígono).
//      Prescrição antiga pode ter idZona = rótulo enquanto o polígono ganhou id
//      próprio no editor ("03_2"), e vice-versa.
//   2. devolver o que NÃO casou, para a validação BLOQUEAR a exportação. Arquivo
//      parcial é pior que arquivo nenhum.
//
// Módulo PURO. npm run teste:prescricao

import { rotuloZona } from '../meap/rotuloZona.ts';
import type { ZonaDose } from './tipos.ts';

export interface ParCasado<Z> {
  feature: GeoJSON.Feature;
  zona: Z;
}

export interface Casamento<Z> {
  pares: Array<ParCasado<Z>>;
  /** Polígonos do mapa sem zona correspondente — cada um é área SEM DOSE. */
  semZona: GeoJSON.Feature[];
  /** Zonas da prescrição que não acharam polígono (dose que não vai a lugar nenhum). */
  semPoligono: Z[];
}

/**
 * Casa cada polígono da FC com a sua zona. Só entram polígonos COM geometria —
 * feature sem geometria não vira nada no shapefile.
 */
export function casarZonas<Z extends Pick<ZonaDose, 'idZona' | 'nomeZona'>>(
  fc: GeoJSON.FeatureCollection | null | undefined,
  zonas: Z[],
): Casamento<Z> {
  const porId = new Map<string, Z>();
  const porRotulo = new Map<string, Z>();
  for (const z of zonas) {
    if (z.idZona) porId.set(String(z.idZona), z);
    // o primeiro rótulo ganha: duas zonas com o mesmo nome são um erro de dado,
    // e chutar qual delas vale não melhora nada.
    if (z.nomeZona && !porRotulo.has(String(z.nomeZona))) porRotulo.set(String(z.nomeZona), z);
  }

  const pares: Array<ParCasado<Z>> = [];
  const semZona: GeoJSON.Feature[] = [];
  const usadas = new Set<Z>();

  for (const f of fc?.features ?? []) {
    if (!f.geometry) continue;
    const props = (f.properties ?? {}) as { id?: string | number; zona?: string | number };
    const id = props.id == null ? '' : String(props.id);
    const rot = rotuloZona(props);
    const z = porId.get(id) ?? porRotulo.get(rot) ?? porRotulo.get(String(props.zona ?? ''));
    if (!z) { semZona.push(f); continue; }
    usadas.add(z);
    pares.push({ feature: f, zona: z });
  }

  return { pares, semZona, semPoligono: zonas.filter(z => !usadas.has(z)) };
}
