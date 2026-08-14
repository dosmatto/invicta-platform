// FERTILIDADE POR ZONA — cada zona recebe UM valor (o composto da amostra
// daquela zona), sem NENHUMA interpolação, pintado com a escala da legenda.
//
// Isto vive no MÓDULO ZONAS: lá o dado se comporta por zona. A interpolação
// (krigagem) é do módulo Fertilidade e não entra aqui. O mesmo preenchimento já
// existia no Fertilidade (caminho `ehZona`), mas amarrado à nuvem, ao mapa de
// 20 m e a uma grade `metodo:'zonas'`. Aqui a lógica é EXTRAÍDA pura e enxuta:
// só o necessário para desenhar o overlay — sem persistir nada (não polui o
// prefixo de fertilidade da nuvem).
//
// Reusa `rasterizarZonas` (mesma malha/formato do interpolador) e
// `colorirGridComLegenda` — zero duplicação da conta de raster/cor.

import { rasterizarZonas, centroideGeom, type ZonaValor } from '../recomendacao/zonasGrid';
import { colorirGridComLegenda } from '../raster';
import { coordsFromBounds } from '../fertilidade';
import { casasDecimaisVariavel, type ImportacaoLab } from '../store';
import type { Legenda } from '../legendas';

export interface ZonaGeom { id: string; classe: string; geometry: GeoJSON.Geometry }

/** Zonas do talhão a partir do zoneamento PADRÃO (snapshot em talhao.zonasGeojson).
 *  Mesma leitura da Fertilidade e da Recomendação — os `id` casam no app todo. */
export function lerZonasDoTalhao(zonasGeojson?: string): ZonaGeom[] {
  if (!zonasGeojson) return [];
  try {
    const fc = JSON.parse(zonasGeojson) as GeoJSON.FeatureCollection;
    return (fc.features ?? [])
      .filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
      .map(f => {
        const p = (f.properties ?? {}) as { id?: string; classe?: string };
        return { id: String(p.id ?? '?'), classe: String(p.classe ?? ''), geometry: f.geometry! };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch { return []; }
}

/** Vínculo automático zona → nº da amostra, pela ORDEM (1ª zona ↔ menor número).
 *  É só a sugestão inicial; a tabela deixa o usuário corrigir. */
export function bindingAuto(zonas: ZonaGeom[], numeros: number[]): Record<string, number> {
  const nums = [...new Set(numeros)].sort((a, b) => a - b);
  const init: Record<string, number> = {};
  zonas.forEach((z, i) => { init[z.id] = nums[i] ?? nums[nums.length - 1] ?? 0; });
  return init;
}

/** Valor de UMA zona: o resultado do laudo no número de amostra vinculado. */
export function valorZona(
  imp: ImportacaoLab, mapaZonaNumero: Record<string, number>, zonaId: string, nut: string, prof: string,
): number {
  const num = mapaZonaNumero[zonaId];
  const r = imp.resultados.find(x => x.numero === num && x.profundidade === prof);
  const v = r?.valores[nut];
  return v != null && isFinite(v) ? v : NaN;
}

/** Zonas COM valor finito (as sem valor não entram — ficam transparentes). */
export function zonasComValor(
  zonas: ZonaGeom[], imp: ImportacaoLab, mapaZonaNumero: Record<string, number>, nut: string, prof: string,
): ZonaValor[] {
  return zonas
    .map(z => ({ id: z.id, geometry: z.geometry, valor: valorZona(imp, mapaZonaNumero, z.id, nut, prof) }))
    .filter(z => isFinite(z.valor));
}

const casas = (nut: string) => casasDecimaisVariavel(nut) ?? ((nut === 'ph' || nut === 'k') ? 1 : 0);
const fmtVal = (v: number, nut: string) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: casas(nut), maximumFractionDigits: casas(nut) });

/** Rótulo (valor) no centroide de cada zona com valor. */
export function fcLabelsZona(zv: ZonaValor[], nut: string): GeoJSON.FeatureCollection {
  const feats: GeoJSON.Feature[] = [];
  for (const z of zv) {
    const c = centroideGeom(z.geometry);
    if (c) feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: { txt: fmtVal(z.valor, nut) } });
  }
  return { type: 'FeatureCollection', features: feats };
}

export interface OverlayPorZona {
  url: string;
  coordinates: [[number, number], [number, number], [number, number], [number, number]];
  labels: GeoJSON.FeatureCollection;
}

/** Compõe o overlay do mapa: rasteriza as zonas (constante por zona), pinta pela
 *  legenda e devolve url + bounds + rótulos. `null` quando NENHUMA zona tem valor
 *  (para a tela avisar em vez de mostrar um mapa vazio). */
export function construirOverlayPorZona(args: {
  zonas: ZonaGeom[]; imp: ImportacaoLab; mapaZonaNumero: Record<string, number>;
  nut: string; prof: string; legenda: Legenda; pixelM?: number;
}): OverlayPorZona | null {
  const zv = zonasComValor(args.zonas, args.imp, args.mapaZonaNumero, args.nut, args.prof);
  if (zv.length === 0) return null;
  const resp = rasterizarZonas(zv, args.pixelM ?? 20);
  if (!resp.grid?.b64) return null;
  const url = colorirGridComLegenda(resp.grid, args.legenda).dataUrl;
  return { url, coordinates: coordsFromBounds(resp.bounds), labels: fcLabelsZona(zv, args.nut) };
}
