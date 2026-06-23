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

function dosePolygons(dose: DoseCalculada): GeoJSON.FeatureCollection {
  const { valores, rows, cols } = decodeGrid(dose.grid);
  const [w, s, e, n] = dose.bounds;
  const classes = [...dose.estilo.classes].filter(c => Number.isFinite(c.limiteSuperior)).sort((a, b) => a.limiteSuperior - b.limiteSuperior);
  if (!classes.length) return { type: 'FeatureCollection', features: [] };
  const lims = classes.map(c => c.limiteSuperior);
  const classeDe = (v: number) => { const k = lims.findIndex(L => v <= L); return k < 0 ? classes.length - 1 : k; };
  const ehTransp = (k: number) => dose.estilo.zeroTransparente && classes[k].limiteSuperior <= dose.estilo.valorMinimo;

  // média da dose por classe → taxa representativa da zona
  const soma = new Array(classes.length).fill(0), cont = new Array(classes.length).fill(0);
  for (let i = 0; i < valores.length; i++) { const v = valores[i]; if (!isFinite(v)) continue; const k = classeDe(v); soma[k] += v; cont[k]++; }
  const taxa = classes.map((_, k) => (cont[k] ? Math.round(soma[k] / cont[k]) : 0));

  const lonAt = (c: number) => w + (c / cols) * (e - w);
  const latAt = (r: number) => n - (r / rows) * (n - s);   // grid: norte no topo
  const feats: GeoJSON.Feature[] = [];
  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      const v = valores[r * cols + c];
      if (!isFinite(v)) { c++; continue; }
      const k = classeDe(v);
      let c2 = c + 1;
      while (c2 < cols) { const v2 = valores[r * cols + c2]; if (!isFinite(v2) || classeDe(v2) !== k) break; c2++; }
      if (!ehTransp(k)) {
        const lonL = lonAt(c), lonR = lonAt(c2), latT = latAt(r), latB = latAt(r + 1);
        feats.push({
          type: 'Feature',
          properties: { TAXA: taxa[k], CLASSE: `${k === 0 ? 0 : lims[k - 1]}-${lims[k]}`, PRODUTO: dose.produto || dose.nomeEquacao, UNID: dose.unidade || 'kg/ha' },
          geometry: { type: 'Polygon', coordinates: [[[lonL, latT], [lonR, latT], [lonR, latB], [lonL, latB], [lonL, latT]]] },
        });
      }
      c = c2;
    }
  }
  return { type: 'FeatureCollection', features: feats };
}

export async function gerarShapefileZip(dose: DoseCalculada, talhaoNome: string): Promise<Blob> {
  const fc = dosePolygons(dose);
  if (fc.features.length === 0) throw new Error('Sem zonas de dose para exportar (tudo abaixo do mínimo / fora do talhão).');
  const shpwrite = await import('@mapbox/shp-write');
  const nome = `RX_${talhaoNome}_${dose.produto || dose.nomeEquacao}`.replace(/[^\w\-]+/g, '_').slice(0, 40);
  return await shpwrite.zip<'blob'>(fc, { outputType: 'blob', compression: 'DEFLATE', prj: PRJ_WGS84, types: { polygon: nome } });
}
