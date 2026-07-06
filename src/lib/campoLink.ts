// #3 — Link do prestador de servico: um link AUTOSSUFICIENTE (sem login, sem
// backend) que carrega SO uma geometria (poligono/linha/pontos) para o prestador
// navegar por GPS em campo. A geometria vai COMPACTADA no HASH da URL (#...), que
// o navegador NUNCA envia ao servidor — nada fica guardado em lugar nenhum, e o
// prestador ve apenas aquela area, mais nada.

import * as LZString from 'lz-string';

export interface CampoPayload {
  n: string;                     // nome/rotulo da area
  g: GeoJSON.FeatureCollection;  // geometria compartilhada
}

// Monta o link. `origin` = window.location.origin do app principal.
export function montarLinkCampo(origin: string, nome: string, fc: GeoJSON.FeatureCollection): string {
  const payload: CampoPayload = { n: nome, g: fc };
  const comp = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
  return `${origin}/campo#${comp}`;
}

// Le o hash (com ou sem o '#') e devolve o payload, ou null se invalido.
export function lerCampoHash(hash: string): CampoPayload | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  try {
    const json = LZString.decompressFromEncodedURIComponent(raw);
    if (!json) return null;
    const p = JSON.parse(json) as CampoPayload;
    if (!p || !p.g || !Array.isArray(p.g.features)) return null;
    return p;
  } catch { return null; }
}

// Normaliza um GeoJSON (FC/Feature/Geometry) para FeatureCollection.
export function paraFC(o: unknown): GeoJSON.FeatureCollection | null {
  const g = o as { type?: string; geometry?: GeoJSON.Geometry };
  if (!g || !g.type) return null;
  if (g.type === 'FeatureCollection') return o as GeoJSON.FeatureCollection;
  if (g.type === 'Feature') return { type: 'FeatureCollection', features: [o as GeoJSON.Feature] };
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: o as GeoJSON.Geometry }] };
}

// Bbox [minLng, minLat, maxLng, maxLat] de um FeatureCollection.
export function bboxDeFC(fc: GeoJSON.FeatureCollection | null): [number, number, number, number] | null {
  if (!fc) return null;
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  const scan = (co: unknown): void => {
    if (!Array.isArray(co)) return;
    if (typeof co[0] === 'number') {
      const x = co[0] as number, y = co[1] as number;
      if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y;
      return;
    }
    for (const e of co) scan(e);
  };
  for (const f of fc.features) if (f.geometry && 'coordinates' in f.geometry) scan((f.geometry as { coordinates: unknown }).coordinates);
  return Number.isFinite(a) ? [a, b, c, d] : null;
}
