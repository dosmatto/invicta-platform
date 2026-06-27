'use client';

// Geração de zonas de manejo por SIMILARIDADE (MEAP M2, Fatia 1) — front.
// NÃO interpola: consome os mapas JÁ interpolados (grids salvos na nuvem) das
// camadas escolhidas, empilha e manda o backend clusterizar (k-means/FCM) com
// índices FPI/NCE para escolher o nº de zonas. Preview apenas (persistir = M3).

import { getImportacoesLab, getGrades } from '@/lib/store';
import { carregarGridsTalhao } from '@/lib/recomendacao/aplicar';
import { zonearMulti, type RespZonarMulti } from '@/lib/fertilidade';
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

// Carrega os mapas já interpolados do talhão (importação mais recente) como
// camadas selecionáveis. Só co-registradas (mesma malha da 1ª) entram.
export async function carregarCamadas(talhaoId: string): Promise<CamadasCarregadas | null> {
  const imp = getImportacoesLab(talhaoId)[0] ?? null;
  if (!imp) return null;
  const grids = await carregarGridsTalhao(talhaoId, imp.id);

  let bounds: [number, number, number, number] | null = null;
  let shape: [number, number] | null = null;
  const camadas: CamadaGrid[] = [];
  for (const [chave, resp] of Object.entries(grids)) {
    if (!resp.grid?.b64) continue;
    if (!bounds) { bounds = resp.bounds; shape = resp.grid.shape; }
    // co-registro: só camadas com a mesma malha da primeira
    if (resp.grid.shape[0] !== shape![0] || resp.grid.shape[1] !== shape![1]) continue;
    const [nut, prof] = chave.split('__');
    camadas.push({ chave, nut, prof, simbolo: simboloElemento(nut), b64: resp.grid.b64, shape: resp.grid.shape });
  }
  if (!bounds || !shape || camadas.length === 0) return null;
  camadas.sort((a, b) => a.simbolo.localeCompare(b.simbolo) || a.prof.localeCompare(b.prof));
  return { importacaoId: imp.id, bounds, shape, camadas };
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
