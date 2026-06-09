// Importa uma grade de amostragem feita FORA da plataforma (SHP/KML/GeoJSON de
// pontos). O essencial é **preservar o número de cada ponto** (campo id/ponto/
// número do arquivo), porque é ele que liga ao número da amostra do laboratório.
// O join da fertilidade usa `numero ?? ordem+1`.

import type { PontoAmostragem, GradeAmostragem } from './store';

const norm = (s: string) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Campos que costumam guardar o número da amostra, em ordem de preferência.
const CAMPOS_PREFERIDOS = ['numero', 'num', 'ponto', 'amostra', 'id', 'name', 'comentario', 'n'];

export function chavesDePropriedades(fc: GeoJSON.FeatureCollection): string[] {
  const set = new Set<string>();
  for (const f of fc.features) {
    if (f.geometry?.type === 'Point' || f.geometry?.type === 'MultiPoint') {
      Object.keys(f.properties ?? {}).forEach(k => set.add(k));
    }
  }
  return [...set];
}

export function detectarCampoId(fc: GeoJSON.FeatureCollection): string | null {
  const chaves = chavesDePropriedades(fc);
  if (chaves.length === 0) return null;
  // 1) nome preferido
  for (const pref of CAMPOS_PREFERIDOS) {
    const achou = chaves.find(k => norm(k) === pref);
    if (achou) return achou;
  }
  // 2) campo cujo valor é inteiro em todos os pontos
  const pontos = fc.features.filter(f => f.geometry?.type === 'Point');
  for (const k of chaves) {
    if (pontos.length && pontos.every(f => /^\d+$/.test(String(f.properties?.[k] ?? '').trim()))) return k;
  }
  return chaves[0] ?? null;
}

export interface PontosImportados {
  pontos: PontoAmostragem[];
  total: number;
  comNumero: number;
  min: number | null;
  max: number | null;
}

export function pontosDaFC(fc: GeoJSON.FeatureCollection, campoId: string | null): PontosImportados {
  const feats = fc.features.filter(f => f.geometry?.type === 'Point');
  const pontos: PontoAmostragem[] = feats.map((f, i) => {
    const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
    const raw = campoId ? f.properties?.[campoId] : undefined;
    const m = raw != null ? String(raw).match(/\d+/) : null;
    const n = m ? parseInt(m[0], 10) : NaN;
    return { ordem: i, numero: Number.isFinite(n) ? n : undefined, lng, lat, profs: 1 };
  });
  const nums = pontos.map(p => p.numero).filter((n): n is number => n != null);
  return {
    pontos,
    total: feats.length,
    comNumero: nums.length,
    min: nums.length ? Math.min(...nums) : null,
    max: nums.length ? Math.max(...nums) : null,
  };
}

export function montarGradeImportada(args: {
  talhaoId: string; safra: string; nome: string; pontos: PontoAmostragem[];
}): Omit<GradeAmostragem, 'id' | 'criadoEm'> {
  return {
    talhaoId: args.talhaoId, safra: args.safra, epoca: '1', nome: args.nome,
    padraoAmostragemId: '', padraoNome: 'Importada', customizado: true,
    densidade: 0, distanciaBorda: 0, rotacao: 0, aleatoriedade: 0, modoSel: 'regular',
    metodo: 'grid', profundidades: [], pontos: args.pontos, paraProcessar: false,
  };
}
