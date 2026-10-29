// Trava de COORDENADAS PROJETADAS (UTM) no import de arquivos geográficos.
// Função PURA (sem store, sem turf): roda no navegador e no teste em Node.
//
// O mapa e todas as contas da plataforma trabalham em GRAUS (lon/lat). Um
// GeoJSON — ou um shapefile sem o .prj — exportado em UTM chega com E/N em
// METROS (E ≈ 588.000, N ≈ 7.200.000) e, sem esta trava, era gravado como se
// fosse grau: área de bilhões de hectares e talhão "fora do mundo" (caso do
// talhão 115 da NHAZINHA, 28/10/2026).
//
// Regra:
//   1. Tudo dentro de ±180 / ±90 → é grau, passa intacto.
//   2. Fora disso, só aceitamos se tiver cara de UTM (E 100–900 km, N 0–10.000 km).
//   3. O FUSO vem, nesta ordem: do `crs` declarado no GeoJSON (EPSG SIRGAS 2000
//      ou WGS84 UTM); senão, da REFERÊNCIA — onde o arquivo deveria cair (o
//      talhão/fazenda que está recebendo o import). Sem nenhum dos dois, recusa.
//   4. Reprojetado pela referência, o resultado tem de cair perto dela; se não
//      cair, recusa com o motivo — nada é "consertado" no chute.
// SAD69 (EPSG 291xx) é recusado: o datum difere uns 60 m do SIRGAS 2000.

type Pos = GeoJSON.Position;

export interface FusoProjetado { zona: number; sul: boolean }

/** Resultado da checagem: `fc` já em graus; `aviso` quando houve reprojeção. */
export interface LeituraEmGraus { fc: GeoJSON.FeatureCollection; aviso: string | null }

// SIRGAS 2000 ≈ WGS84 (diferença centimétrica) — a mesma conta serve aos dois.
const A = 6378137;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const EP2 = E2 / (1 - E2);
const K0 = 0.9996;

/** [E, N] em metros no fuso dado → [lon, lat] em graus (série de Snyder/USGS). */
export function deUtm(e: number, n: number, f: FusoProjetado): [number, number] {
  const x = e - 500000;
  const y = f.sul ? n - 10_000_000 : n;
  const e4 = E2 * E2, e6 = e4 * E2;
  const M = y / K0;
  const mu = M / (A * (1 - E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const phi1 = mu
    + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu)
    + ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu)
    + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu)
    + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const sin = Math.sin(phi1), cos = Math.cos(phi1), tan = Math.tan(phi1);
  const C1 = EP2 * cos * cos;
  const T1 = tan * tan;
  const N1 = A / Math.sqrt(1 - E2 * sin * sin);
  const R1 = (A * (1 - E2)) / (1 - E2 * sin * sin) ** 1.5;
  const D = x / (N1 * K0);
  const lat = phi1 - ((N1 * tan) / R1) * (D * D / 2
    - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D ** 4) / 24
    + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D ** 6) / 720);
  const lam0 = ((f.zona * 6 - 183) * Math.PI) / 180;
  const lon = lam0 + (D - ((1 + 2 * T1 + C1) * D ** 3) / 6
    + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D ** 5) / 120) / cos;
  return [(lon * 180) / Math.PI, (lat * 180) / Math.PI];
}

export const rotuloFusoProjetado = (f: FusoProjetado) => `${f.zona}${f.sul ? 'S' : 'N'}`;

/** Fuso de um código EPSG UTM. `null` = não é UTM conhecido; 'sad69' = recusar. */
export function fusoDoEpsg(epsg: number): FusoProjetado | 'sad69' | null {
  if (epsg >= 31978 && epsg <= 31985) return { zona: epsg - 31960, sul: true };   // SIRGAS 2000 / UTM 18S–25S
  if (epsg >= 31972 && epsg <= 31977) return { zona: epsg - 31955, sul: false };  // SIRGAS 2000 / UTM 17N–22N
  if (epsg >= 32701 && epsg <= 32760) return { zona: epsg - 32700, sul: true };   // WGS 84 / UTM S
  if (epsg >= 32601 && epsg <= 32660) return { zona: epsg - 32600, sul: false };  // WGS 84 / UTM N
  if ((epsg >= 29168 && epsg <= 29172) || (epsg >= 29187 && epsg <= 29195)) return 'sad69'; // SAD69 / UTM
  return null;
}

/** EPSG declarado no `crs` (formato antigo do GeoJSON: "EPSG:31982", "urn:ogc:def:crs:EPSG::31982"). */
export function epsgDeclarado(fc: unknown): number | null {
  const nome = (fc as { crs?: { properties?: { name?: unknown } } } | null)?.crs?.properties?.name;
  if (typeof nome !== 'string') return null;
  if (/CRS84|4326|4674/i.test(nome) && !/\d{5}/.test(nome)) return 4326;
  const m = nome.match(/EPSG:{1,2}(\d{4,5})/i);
  return m ? Number(m[1]) : null;
}

function visitarCoords(g: GeoJSON.Geometry | null | undefined, fn: (p: Pos) => void) {
  if (!g) return;
  switch (g.type) {
    case 'Point': fn(g.coordinates); break;
    case 'MultiPoint': case 'LineString': g.coordinates.forEach(fn); break;
    case 'MultiLineString': case 'Polygon': g.coordinates.forEach(l => l.forEach(fn)); break;
    case 'MultiPolygon': g.coordinates.forEach(p => p.forEach(l => l.forEach(fn))); break;
    case 'GeometryCollection': g.geometries.forEach(x => visitarCoords(x, fn)); break;
  }
}

/** Distância aproximada em km entre dois [lon, lat] (equiretangular). */
function distKm(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const x = (b[0] - a[0]) * 111.32 * Math.cos(((a[1] + b[1]) / 2) * rad);
  const y = (b[1] - a[1]) * 111.32;
  return Math.hypot(x, y);
}

const MSG_EXPORTAR = 'Exporte o arquivo em coordenadas geográficas (WGS84 EPSG:4326 ou SIRGAS 2000 EPSG:4674), ou mande o shapefile com o .prj junto.';
/** Raio em que o arquivo reprojetado pela referência tem de cair. */
const RAIO_REFERENCIA_KM = 150;

/**
 * Garante que a coleção está em GRAUS. `referencia` = [lon, lat] de onde o
 * arquivo deveria cair (talhão ou fazenda que recebe o import), usada para
 * escolher o fuso quando o arquivo não declara o seu. Lança Error com o motivo
 * quando não dá para reprojetar com segurança.
 */
export function garantirGraus(fc: GeoJSON.FeatureCollection, referencia?: [number, number] | null): LeituraEmGraus {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, n = 0;
  fc.features.forEach(f => visitarCoords(f.geometry, p => {
    const [x, y] = p;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    n++;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }));
  if (n === 0 || (minX >= -180 && maxX <= 180 && minY >= -90 && maxY <= 90)) return { fc, aviso: null };

  const caraDeUtm = minX >= 100_000 && maxX <= 900_000 && minY >= 0 && maxY <= 10_000_000;
  if (!caraDeUtm) {
    throw new Error(`As coordenadas do arquivo não são graus nem UTM (vão de ${Math.round(minX)} a ${Math.round(maxX)} em X). ${MSG_EXPORTAR}`);
  }

  let fuso: FusoProjetado | null = null;
  let origem = '';
  const epsg = epsgDeclarado(fc);
  if (epsg != null && epsg !== 4326) {
    const r = fusoDoEpsg(epsg);
    if (r === 'sad69') {
      throw new Error(`O arquivo está em SAD69 / UTM (EPSG:${epsg}) — o datum antigo desloca o limite uns 60 m. Reprojete para SIRGAS 2000 antes de importar. ${MSG_EXPORTAR}`);
    }
    if (r) { fuso = r; origem = `EPSG:${epsg} declarado no arquivo`; }
  }
  const refOk = !!referencia && Number.isFinite(referencia[0]) && Number.isFinite(referencia[1])
    && Math.abs(referencia[0]) <= 180 && Math.abs(referencia[1]) <= 90;
  if (!fuso && refOk) {
    const [lon, lat] = referencia!;
    fuso = { zona: Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1)), sul: lat < 0 };
    origem = 'fuso do local do talhão/fazenda (o arquivo não declara o seu)';
  }
  if (!fuso) {
    throw new Error(`O arquivo está em coordenadas UTM (metros), sem indicação do fuso, e não há talhão/fazenda com limite para servir de referência. ${MSG_EXPORTAR}`);
  }

  const f = fuso;
  const conv = (p: Pos): Pos => { const [lon, lat] = deUtm(p[0], p[1], f); return p.length > 2 ? [lon, lat, ...p.slice(2)] : [lon, lat]; };
  const mapGeom = (g: GeoJSON.Geometry | null): GeoJSON.Geometry | null => {
    if (!g) return g;
    switch (g.type) {
      case 'Point': return { ...g, coordinates: conv(g.coordinates) };
      case 'MultiPoint': case 'LineString': return { ...g, coordinates: g.coordinates.map(conv) } as GeoJSON.Geometry;
      case 'MultiLineString': case 'Polygon': return { ...g, coordinates: g.coordinates.map(l => l.map(conv)) } as GeoJSON.Geometry;
      case 'MultiPolygon': return { ...g, coordinates: g.coordinates.map(p => p.map(l => l.map(conv))) };
      case 'GeometryCollection': return { ...g, geometries: g.geometries.map(x => mapGeom(x)!) };
    }
  };
  const saida: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: fc.features.map(ft => ({ ...ft, geometry: mapGeom(ft.geometry) as GeoJSON.Geometry })),
  };

  const centro = deUtm((minX + maxX) / 2, (minY + maxY) / 2, f);
  if (refOk) {
    const d = distKm(centro, referencia!);
    if (d > RAIO_REFERENCIA_KM) {
      throw new Error(`O arquivo está em UTM; reprojetado no fuso ${rotuloFusoProjetado(f)} (${origem}) ele cai a ${Math.round(d)} km do talhão/fazenda — fuso ou arquivo errado. ${MSG_EXPORTAR}`);
    }
  }

  return { fc: saida, aviso: `Arquivo estava em UTM ${rotuloFusoProjetado(f)} (metros) — reprojetado para graus pelo ${origem}.` };
}

/** Referência [lon, lat] a partir dos bbox de talhões (o primeiro que estiver em graus). */
export function referenciaDeBboxes(bboxes: ([number, number, number, number] | undefined | null)[]): [number, number] | null {
  for (const b of bboxes) {
    if (!b || b.some(v => !Number.isFinite(v))) continue;
    if (Math.abs(b[0]) > 180 || Math.abs(b[2]) > 180 || Math.abs(b[1]) > 90 || Math.abs(b[3]) > 90) continue;
    return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  }
  return null;
}
