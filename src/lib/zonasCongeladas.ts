// CONGELAR ZONAS DE MANEJO DENTRO DA GRADE — regras puras.
//
// O que é congelar: transformar o GeoJSON de um zoneamento na lista que a
// `GradeAmostragem` carrega em `zonasGeo` (ver lib/zonasDaGrade, que é quem
// conversa com o store). É essa lista que o app de campo desenha como divisa.
//
// Duas regras moram aqui porque erram calado se ninguém as testar:
//
//  1. O RÓTULO. O mapa chama a zona de "01" e os pontos dela dizem "1-3":
//     lib/gradeZonas passa o rótulo por `numeroDaZona` antes de montar o
//     prefixo. Congelar o rótulo cru poria "01" ao lado dos pontos "1-1" na
//     mesma tela do operador.
//
//  2. O CASAMENTO. Reparar uma grade antiga significa adivinhar qual zoneamento
//     a gerou. Divisa ERRADA no campo é pior que divisa nenhuma — o operador
//     jogaria o furo no saco de outra zona. Por isso o candidato só é aceito se
//     os pontos da grade caírem DENTRO dos polígonos da zona que eles dizem
//     ser, não só se os números baterem.
//
// Módulo PURO. npm run teste:zonascongeladas

import { rotuloZona } from './meap/rotuloZona.ts';
import { dentroGeom } from './recomendacao/zonasGrid.ts';

export type PoliZona = GeoJSON.Polygon | GeoJSON.MultiPolygon;

/** O que a grade carrega por zona (espelha `ZonaGrade` de lib/store). */
export interface ZonaCongelada {
  id: string;
  rotulo: string;
  classe: string;
  areaHa?: number;
  geometry: PoliZona;
}

/** Só o que estas regras precisam saber de um ponto da grade. */
export interface PontoComZona {
  zona?: string;
  rotulo?: string;
  lng: number;
  lat: number;
}

/** Casas decimais mantidas na geometria congelada. 6 ≈ 11 cm no equador — bem
 *  abaixo do erro do GPS do celular (±3 a 10 m) e invisível na tela do campo.
 *  Existe porque um polígono vindo do agrupamento de pixels pode carregar o
 *  float inteiro (14+ casas) e essa geometria agora viaja em `inv_grades`, que
 *  é chave pesada e desce para o aparelho — o teto de precisão evita que uma
 *  origem verbosa multiplique o tamanho da grade. Geometria que já vem enxuta
 *  não muda de tamanho. Vértice vizinho de duas zonas arredonda igual nas duas,
 *  então a divisa continua fechando. */
export const CASAS = 6;
const FATOR = 10 ** CASAS;
const round = (n: number) => Math.round(n * FATOR) / FATOR;

export function arredondarGeometria<T extends PoliZona>(g: T): T {
  const anel = (r: GeoJSON.Position[]) => r.map(([x, y]) => [round(x), round(y)] as GeoJSON.Position);
  if (g.type === 'Polygon') return { ...g, coordinates: g.coordinates.map(anel) };
  return { ...g, coordinates: g.coordinates.map(p => p.map(anel)) };
}

/** Rótulo do mapa → o número que os pontos usam como prefixo, quando não há
 *  ponto naquela zona para perguntar. Mesma ideia de `numeroDaZona`
 *  (lib/gradeZonas), sem o desempate por índice: sem dígito nenhum, o rótulo
 *  fica como está — inventar um número aqui poderia colidir com o de uma zona
 *  que TEM pontos. */
export function normalizarRotulo(rotuloDoMapa: string): string {
  const d = String(rotuloDoMapa ?? '').replace(/\D/g, '');
  if (!d) return String(rotuloDoMapa ?? '');
  const n = parseInt(d, 10);
  return Number.isSafeInteger(n) && n > 0 ? String(n) : String(rotuloDoMapa);
}

const propsDe = (f: GeoJSON.Feature) =>
  (f.properties ?? {}) as { id?: string; zona?: string; classe?: string; areaHa?: number };

const ehPoligono = (f: GeoJSON.Feature) =>
  !!f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon');

/**
 * Converte o GeoJSON de um zoneamento nas zonas congeladas da grade.
 *
 * `rotuloDe` traduz o rótulo do MAPA no prefixo que os pontos daquela grade
 * usam; quem tem a grade em mãos passa o que os próprios pontos dizem. Sem ele
 * (ou para uma zona sem ponto nenhum), vale `normalizarRotulo`.
 */
export function congelarZonas(
  fc: GeoJSON.FeatureCollection | null | undefined,
  rotuloDe?: (rotuloDoMapa: string) => string | undefined,
): ZonaCongelada[] {
  if (!fc?.features?.length) return [];
  return fc.features
    .filter(ehPoligono)
    .map(f => {
      const p = propsDe(f);
      const rotMapa = rotuloZona(p);
      return {
        id: String(p.id ?? '?'),
        rotulo: rotuloDe?.(rotMapa) ?? normalizarRotulo(rotMapa),
        classe: String(p.classe ?? ''),
        areaHa: Number(p.areaHa ?? 0) || undefined,
        geometry: arredondarGeometria(f.geometry as PoliZona),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Rótulo do mapa → prefixo que os PONTOS desta grade usam ("01" → "1").
 *  Sai dos próprios pontos, que são a verdade daquela grade: `p.zona` é o
 *  rótulo do mapa (é por ele que a grade agrupa) e `p.rotulo` é
 *  "prefixo-sequencial". Rededuzir o prefixo pela regra de numeração daria o
 *  mesmo resultado no caso comum, mas erraria no desempate de rótulos que
 *  colidem (`numerosDasZonas`). */
export function prefixosDosPontos(pontos: PontoComZona[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of pontos ?? []) {
    if (!p?.zona || !p.rotulo) continue;
    const pref = String(p.rotulo).split('-')[0];
    if (pref && !m.has(String(p.zona))) m.set(String(p.zona), pref);
  }
  return m;
}

/** Fração mínima de pontos que precisa cair dentro da zona que eles dizem ser.
 *  Não é 100% porque o agrônomo pode ter arrastado um ponto para a borda (ou
 *  para fora dela) na edição manual, e porque o arredondamento mexe na divisa
 *  em centímetros. Abaixo disto, o zoneamento é outro. */
export const FRACAO_MINIMA_DENTRO = 0.9;

/**
 * Este zoneamento pode ter gerado esta grade?
 *
 * Exige, nesta ordem:
 *   • os pontos dizerem de que zona são (grade antiga demais, sem `zona`, não
 *     dá para verificar — e o que não dá para verificar não se congela);
 *   • toda zona citada pelos pontos ter POLÍGONO aqui;
 *   • e os pontos caírem dentro do polígono da zona que dizem ser. É esta
 *     última que separa "o zoneamento certo" de "outro zoneamento que por
 *     acaso também numera as zonas de 1 a N".
 */
export function zoneamentoCasa(
  fc: GeoJSON.FeatureCollection | null | undefined,
  pontos: PontoComZona[],
): boolean {
  const prefixos = prefixosDosPontos(pontos);
  if (prefixos.size === 0) return false;
  if (!fc?.features?.length) return false;

  const porRotulo = new Map<string, PoliZona[]>();
  for (const f of fc.features) {
    if (!ehPoligono(f)) continue;
    const r = rotuloZona(propsDe(f));
    (porRotulo.get(r) ?? porRotulo.set(r, []).get(r)!).push(f.geometry as PoliZona);
  }
  for (const z of prefixos.keys()) if (!porRotulo.has(z)) return false;

  let total = 0, dentro = 0;
  for (const p of pontos) {
    if (!p?.zona) continue;
    const geoms = porRotulo.get(String(p.zona));
    if (!geoms) return false;
    total++;
    if (geoms.some(g => dentroGeom(g, p.lng, p.lat))) dentro++;
  }
  return total > 0 && dentro / total >= FRACAO_MINIMA_DENTRO;
}
