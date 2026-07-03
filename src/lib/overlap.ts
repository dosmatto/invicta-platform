// Detecção de SOBREPOSIÇÃO de talhões na importação (individual e em massa).
// Um talhão novo não pode invadir a área de outro (do lote ou já cadastrado).
// Usa interseção real de polígonos (turf), não só bbox — e ignora "slivers" de
// borda compartilhada (talhões vizinhos que só encostam na divisa são OK).

import area from '@turf/area';
import intersect from '@turf/intersect';
import { featureCollection } from '@turf/helpers';

type FC = GeoJSON.FeatureCollection;
type Caixa = [number, number, number, number]; // [w, s, e, n]

// Junta todos os polígonos de um FC (várias glebas/features) num MultiPolygon.
function comoMulti(fc: FC | null | undefined): GeoJSON.Feature<GeoJSON.MultiPolygon> | null {
  if (!fc?.features) return null;
  const coords: GeoJSON.Position[][][] = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') coords.push(g.coordinates);
    else if (g.type === 'MultiPolygon') for (const p of g.coordinates) coords.push(p);
  }
  return coords.length ? { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: coords } } : null;
}

export function areaHaFC(fc: FC): number {
  const m = comoMulti(fc);
  return m ? area(m) / 10000 : 0;
}

export function bboxDeFeatures(features: GeoJSON.Feature[]): Caixa {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const anda = (g: GeoJSON.Geometry | null | undefined) => {
    if (!g) return;
    if (g.type === 'Polygon') g.coordinates.forEach(r => r.forEach(([a, b]) => { if (a < w) w = a; if (a > e) e = a; if (b < s) s = b; if (b > n) n = b; }));
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => p.forEach(r => r.forEach(([a, b]) => { if (a < w) w = a; if (a > e) e = a; if (b < s) s = b; if (b > n) n = b; })));
  };
  features.forEach(f => anda(f.geometry));
  return [w, s, e, n];
}

function caixasSeCruzam(a: Caixa, b: Caixa): boolean {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
}

// Área de sobreposição (ha) entre dois talhões; 0 se não houver (ou erro).
export function sobreposicaoHa(a: FC, b: FC): number {
  const ma = comoMulti(a), mb = comoMulti(b);
  if (!ma || !mb) return 0;
  try {
    const inter = intersect(featureCollection([ma, mb]));
    return inter ? area(inter) / 10000 : 0;
  } catch { return 0; }
}

// Limiar: abaixo disso é sliver de borda/ruído numérico, não conta como invasão.
export const MIN_SOBREP_HA = 0.005; // 50 m²

export interface AlvoOverlap { id: string; nome: string; fc: FC; bbox: Caixa; }
export interface Conflito { comId: string; nome: string; haSobrep: number; onde: 'lote' | 'existente'; }

// Conflitos de UM alvo contra os demais do lote + os já cadastrados.
export function conflitosDe(alvo: AlvoOverlap, outrosLote: AlvoOverlap[], existentes: AlvoOverlap[]): Conflito[] {
  const out: Conflito[] = [];
  const testar = (o: AlvoOverlap, onde: 'lote' | 'existente') => {
    if (o.id === alvo.id) return;
    if (!caixasSeCruzam(alvo.bbox, o.bbox)) return; // pré-filtro barato
    const ha = sobreposicaoHa(alvo.fc, o.fc);
    if (ha > MIN_SOBREP_HA) out.push({ comId: o.id, nome: o.nome, haSobrep: ha, onde });
  };
  for (const o of outrosLote) testar(o, 'lote');
  for (const e of existentes) testar(e, 'existente');
  return out;
}

// Talhão salvo → AlvoOverlap (parse do geojson). Devolve null se sem geometria.
export function talhaoParaAlvo(t: { id: string; nome: string; geojson?: string; bbox?: Caixa }): AlvoOverlap | null {
  if (!t.geojson) return null;
  try {
    const parsed = JSON.parse(t.geojson);
    const fc: FC = parsed?.type === 'FeatureCollection' ? parsed
      : parsed?.type === 'Feature' ? { type: 'FeatureCollection', features: [parsed] }
      : { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: parsed }] };
    const bbox = t.bbox ?? bboxDeFeatures(fc.features);
    return { id: t.id, nome: t.nome, fc, bbox };
  } catch { return null; }
}
