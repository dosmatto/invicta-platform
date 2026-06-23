'use client';

// Fase EXP-2 — Shapefile de taxa variável a partir do mapa de DOSE.
// Vetoriza o grid em ZONAS por classe (retângulos por célula, mesclados na
// horizontal por linha; TAXA = média da dose daquela classe no talhão). Gera o
// ZIP (.shp/.shx/.dbf/.prj) via @mapbox/shp-write — o mesmo já usado em grades.
// Células fora do polígono (NaN) e abaixo do mínimo (transparentes) são puladas.

import { decodeGrid } from '../fertilidade';
import type { DoseCalculada } from './aplicar';

const PRJ_WGS84 =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]]';

// Pasta no pendrive por marca de monitor (tabela do usuário).
export interface Monitor { id: string; nome: string; pasta: string; }
export const MONITORES: Monitor[] = [
  { id: 'raiz', nome: 'AgLeader / Raven CR7 / Arvos / Hexagon / Jacto / Agres', pasta: 'Raiz do pen drive (sem pasta)' },
  { id: 'stara', nome: 'Stara / Topper', pasta: 'Dados / Mapas' },
  { id: 'trimble', nome: 'Trimble (GFX750 = AgData · CFX750 = AgGPS)', pasta: 'AgData ou AgGPS → Prescriptions' },
  { id: 'jd', nome: 'John Deere (GS3 / GS4)', pasta: 'Rx' },
  { id: 'raven-epro', nome: 'Raven Envizio Pro', pasta: 'ePro… → rxMaps' },
  { id: 'muller', nome: 'Muller (novo)', pasta: 'SHP (ou mesmo caminho do Trimble)' },
];
export const monitorPorId = (id: string) => MONITORES.find(m => m.id === id) ?? MONITORES[0];

type Pt = [number, number];
const outerRings = (p: GeoJSON.Polygon | GeoJSON.MultiPolygon): Pt[][] =>
  (p.type === 'Polygon' ? [p.coordinates[0]] : p.coordinates.map(g => g[0])).map(r => r.map(c => [c[0], c[1]] as Pt));

// Sutherland–Hodgman: recorta o SUBJECT (anel do talhão, pode ser côncavo) pela
// janela CONVEXA (a célula, em CCW) → parte do talhão dentro da célula.
function clipPorCelula(subject: Pt[], celulaCCW: Pt[]): Pt[] {
  const dentro = (p: Pt, a: Pt, b: Pt) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0;
  const cruz = (p1: Pt, p2: Pt, a: Pt, b: Pt): Pt => {
    const x1 = p1[0], y1 = p1[1], x2 = p2[0], y2 = p2[1], x3 = a[0], y3 = a[1], x4 = b[0], y4 = b[1];
    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4) || 1e-12;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
  };
  let out = subject;
  for (let i = 0; i < celulaCCW.length; i++) {
    const a = celulaCCW[i], b = celulaCCW[(i + 1) % celulaCCW.length];
    const inp = out; out = [];
    if (inp.length === 0) break;
    for (let j = 0; j < inp.length; j++) {
      const cur = inp[j], prev = inp[(j + inp.length - 1) % inp.length];
      const ci = dentro(cur, a, b), pi = dentro(prev, a, b);
      if (ci) { if (!pi) out.push(cruz(prev, cur, a, b)); out.push(cur); }
      else if (pi) out.push(cruz(prev, cur, a, b));
    }
  }
  return out;
}
const fechar = (r: Pt[]): Pt[] => (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) ? [...r, r[0]] : r);

// Uma célula (pixel ~20×20 m) por polígono — SEM mesclar. clip=true recorta as
// células de borda pelo polígono do talhão; clip=false mantém a célula inteira.
function dosePolygons(dose: DoseCalculada, poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon | null, clip: boolean): GeoJSON.FeatureCollection {
  const { valores, rows, cols } = decodeGrid(dose.grid);
  const [w, s, e, n] = dose.bounds;
  const classes = [...dose.estilo.classes].filter(c => Number.isFinite(c.limiteSuperior)).sort((a, b) => a.limiteSuperior - b.limiteSuperior);
  if (!classes.length) return { type: 'FeatureCollection', features: [] };
  const lims = classes.map(c => c.limiteSuperior);
  const classeDe = (v: number) => { const k = lims.findIndex(L => v <= L); return k < 0 ? classes.length - 1 : k; };
  const lonAt = (c: number) => w + (c / cols) * (e - w);
  const latAt = (r: number) => n - (r / rows) * (n - s);   // grid: norte no topo
  const aneis = clip && poligono ? outerRings(poligono) : [];
  const feats: GeoJSON.Feature[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = valores[r * cols + c];
      if (!isFinite(v)) continue;
      const k = classeDe(v);
      if (dose.estilo.zeroTransparente && classes[k].limiteSuperior <= dose.estilo.valorMinimo) continue;
      const lonL = lonAt(c), lonR = lonAt(c + 1), latT = latAt(r), latB = latAt(r + 1);
      const props = { TAXA: Math.round(v), CLASSE: `${k === 0 ? 0 : lims[k - 1]}-${lims[k]}`, PRODUTO: dose.produto || dose.nomeEquacao, UNID: dose.unidade || 'kg/ha' };
      if (aneis.length) {
        const celula: Pt[] = [[lonL, latB], [lonR, latB], [lonR, latT], [lonL, latT]]; // CCW (clip)
        for (const anel of aneis) {
          const cl = clipPorCelula(anel, celula);
          if (cl.length >= 3) feats.push({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [fechar(cl)] } });
        }
      } else {
        feats.push({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [[[lonL, latT], [lonR, latT], [lonR, latB], [lonL, latB], [lonL, latT]]] } });
      }
    }
  }
  return { type: 'FeatureCollection', features: feats };
}

export async function gerarShapefileZip(
  dose: DoseCalculada, talhaoNome: string,
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon | null, clip: boolean,
): Promise<Blob> {
  const fc = dosePolygons(dose, poligono, clip);
  if (fc.features.length === 0) throw new Error('Sem células de dose para exportar (tudo abaixo do mínimo / fora do talhão).');
  const shpwrite = await import('@mapbox/shp-write');
  const nome = `RX_${talhaoNome}_${dose.produto || dose.nomeEquacao}`.replace(/[^\w\-]+/g, '_').slice(0, 40);
  return await shpwrite.zip<'blob'>(fc, { outputType: 'blob', compression: 'DEFLATE', prj: PRJ_WGS84, types: { polygon: nome } });
}
