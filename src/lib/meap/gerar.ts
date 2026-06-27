'use client';

// Geração de zonas de manejo por SIMILARIDADE (MEAP M2, Fatia 1) — front.
// NÃO interpola: consome os mapas JÁ interpolados (grids salvos na nuvem) das
// camadas escolhidas, empilha e manda o backend clusterizar (k-means/FCM) com
// índices FPI/NCE para escolher o nº de zonas. Preview apenas (persistir = M3).

import { getImportacoesLab, getGrades } from '@/lib/store';
import { carregarGridsTalhao } from '@/lib/recomendacao/aplicar';
import { zonearMulti, decodeGrid, descomprimirGrid, type RespZonarMulti, type Grid } from '@/lib/fertilidade';
import { cloudCarregarMapasPorPrefixo } from '@/lib/cloud';
import { simboloElemento, type ResultadoAmostra } from '@/lib/lab';

export interface CamadaGrid {
  chave: string;   // `nut__prof`
  nut: string;
  prof: string;
  simbolo: string;
  b64: string;
  shape: [number, number];
}

export interface CamadasCarregadas {
  importacaoId: string;
  bounds: [number, number, number, number];
  shape: [number, number];
  camadas: CamadaGrid[];
}

// ── NDVI mantido como camada do MEAP ────────────────────────────────────────
// Reamostragem bilinear NaN-aware (mesma extensão, malhas diferentes).
function encodeF32(a: Float32Array): string {
  const u8 = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = ''; const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode(...u8.subarray(i, i + CH));
  return btoa(s);
}
function reamostrarB64(b64: string, src: [number, number], dst: [number, number]): string {
  const { valores } = decodeGrid({ b64, shape: src });
  const [sr, sc] = src, [dr, dc] = dst;
  const out = new Float32Array(dr * dc);
  for (let j = 0; j < dr; j++) {
    const fy = dr === 1 ? 0 : (j * (sr - 1)) / (dr - 1);
    const y0 = Math.floor(fy), y1 = Math.min(y0 + 1, sr - 1), wy = fy - y0;
    for (let i = 0; i < dc; i++) {
      const fx = dc === 1 ? 0 : (i * (sc - 1)) / (dc - 1);
      const x0 = Math.floor(fx), x1 = Math.min(x0 + 1, sc - 1), wx = fx - x0;
      const w00 = (1 - wx) * (1 - wy), w01 = wx * (1 - wy), w10 = (1 - wx) * wy, w11 = wx * wy;
      const v00 = valores[y0 * sc + x0], v01 = valores[y0 * sc + x1], v10 = valores[y1 * sc + x0], v11 = valores[y1 * sc + x1];
      let num = 0, den = 0;
      if (isFinite(v00)) { num += v00 * w00; den += w00; }
      if (isFinite(v01)) { num += v01 * w01; den += w01; }
      if (isFinite(v10)) { num += v10 * w10; den += w10; }
      if (isFinite(v11)) { num += v11 * w11; den += w11; }
      out[j * dc + i] = den > 0 ? num / den : NaN;
    }
  }
  return encodeF32(out);
}
function capShape(s: [number, number], maxSide: number): [number, number] {
  const m = Math.max(s[0], s[1]);
  if (m <= maxSide) return s;
  const k = maxSide / m;
  return [Math.max(2, Math.round(s[0] * k)), Math.max(2, Math.round(s[1] * k))];
}

interface NdviCamada { chave: string; nut: string; prof: string; data: string; bounds: [number, number, number, number]; b64: string; shape: [number, number]; }

// Carrega os NDVI MANTIDOS (Sentinel + CBERS) do talhão a partir da nuvem.
async function carregarNdviSalvos(talhaoId: string): Promise<NdviCamada[]> {
  const fontes: Array<['s2' | 'cbers', string]> = [['s2', `${talhaoId}__ndvi__`], ['cbers', `${talhaoId}__ndvicbers__`]];
  const out: NdviCamada[] = [];
  for (const [fonte, pref] of fontes) {
    const docs = await cloudCarregarMapasPorPrefixo<{ resp: { bounds: [number, number, number, number]; grid?: Grid; cena?: { data?: string } } }>(pref);
    for (const d of docs) {
      const resp = d.dados?.resp;
      let grid = resp?.grid;
      const data = resp?.cena?.data;
      if (!resp || !data || !grid) continue;
      if (grid.comp === 'gz') { try { grid = await descomprimirGrid(grid); } catch { continue; } }
      out.push({ chave: `ndvi_${fonte}__${data}`, nut: `ndvi_${fonte}`, prof: data, data, bounds: resp.bounds, b64: grid.b64, shape: grid.shape });
    }
  }
  out.sort((a, b) => b.data.localeCompare(a.data)); // mais recentes primeiro
  return out;
}

// Carrega as camadas já interpoladas do talhão (fertilidade) + os NDVI mantidos,
// como camadas selecionáveis co-registradas na MESMA malha de referência.
export async function carregarCamadas(talhaoId: string): Promise<CamadasCarregadas | null> {
  const imp = getImportacoesLab(talhaoId)[0] ?? null;

  let bounds: [number, number, number, number] | null = null;
  let shape: [number, number] | null = null;
  const camadas: CamadaGrid[] = [];

  // 1) Fertilidade — quando existe, define a malha de referência.
  if (imp) {
    const grids = await carregarGridsTalhao(talhaoId, imp.id);
    for (const [chave, resp] of Object.entries(grids)) {
      if (!resp.grid?.b64) continue;
      if (!bounds) { bounds = resp.bounds; shape = resp.grid.shape; }
      if (resp.grid.shape[0] !== shape![0] || resp.grid.shape[1] !== shape![1]) continue;
      const [nut, prof] = chave.split('__');
      camadas.push({ chave, nut, prof, simbolo: simboloElemento(nut), b64: resp.grid.b64, shape: resp.grid.shape });
    }
  }

  // 2) NDVI mantidos — entram reamostrados para a malha de referência (a da
  //    fertilidade; ou a do NDVI mais fino com teto de 160 px/lado se não houver
  //    fertilidade, para a clusterização ficar rápida).
  const ndvi = await carregarNdviSalvos(talhaoId);
  if (!bounds && ndvi.length) {
    const ref = ndvi.reduce((a, b) => (b.shape[0] * b.shape[1] > a.shape[0] * a.shape[1] ? b : a));
    bounds = ref.bounds;
    shape = capShape(ref.shape, 160);
  }
  if (bounds && shape) {
    for (const n of ndvi) {
      const b64 = (n.shape[0] === shape[0] && n.shape[1] === shape[1]) ? n.b64 : reamostrarB64(n.b64, n.shape, shape);
      camadas.push({ chave: n.chave, nut: n.nut, prof: n.prof, simbolo: 'NDVI', b64, shape });
    }
  }

  if (!bounds || !shape || camadas.length === 0) return null;
  camadas.sort((a, b) => a.simbolo.localeCompare(b.simbolo) || a.prof.localeCompare(b.prof));
  return { importacaoId: imp?.id ?? 'ndvi', bounds, shape, camadas };
}

// Pontos do lab (numero→coord da grade) + resultados crus — entrada do cálculo
// de CV (lib/meap/cv.ts) para medir a homogeneidade das zonas geradas.
export function dadosLabCV(talhaoId: string): { pontos: { numero: number; lng: number; lat: number }[]; resultados: ResultadoAmostra[] } {
  const imp = getImportacoesLab(talhaoId)[0] ?? null;
  const grade = imp ? getGrades(talhaoId).find(g => g.id === imp.gradeId) ?? null : null;
  const pontos = (grade?.pontos ?? []).map(p => ({ numero: p.numero ?? p.ordem + 1, lng: p.lng, lat: p.lat }));
  return { pontos, resultados: imp?.resultados ?? [] };
}

export async function gerarMulti(opts: {
  carregadas: CamadasCarregadas;
  chaves: string[];
  poligono?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  algoritmo?: 'fcm' | 'kmeans';
  nClasses?: number;
  areaMinHa?: number;
}): Promise<RespZonarMulti> {
  const sel = opts.carregadas.camadas.filter(c => opts.chaves.includes(c.chave));
  if (sel.length === 0) throw new Error('Selecione ao menos uma camada.');
  return zonearMulti({
    camadas: sel.map(c => ({ nome: `${c.simbolo} ${c.prof}`, b64: c.b64 })),
    bounds: opts.carregadas.bounds,
    shape: opts.carregadas.shape,
    poligono: opts.poligono ?? null,
    algoritmo: opts.algoritmo ?? 'fcm',
    nClasses: opts.nClasses ?? 0,
    areaMinHa: opts.areaMinHa ?? 0,
  });
}
