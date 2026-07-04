// Import genérico de pontos do penetrômetro (compactação). Reaproveita o parse
// de arquivos geográficos (KML/GeoJSON/SHP) e o tabular do laboratório
// (CSV/TXT/XLS/XLSX). O usuário mapeia quais colunas são a resistência por
// profundidade; as profundidades são derivadas do arquivo (nomes das colunas).

import { parseGeoFile } from './geo';
import { lerArquivo } from './lab';

export interface PontoBruto { lng: number; lat: number; props: Record<string, string | number>; }
export interface ArquivoPontos {
  pontos: PontoBruto[];
  colunas: string[];          // todas as propriedades/colunas disponíveis
  colunasNumericas: string[]; // colunas majoritariamente numéricas (candidatas a resistência)
}

const norm = (s: string) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const LNG_KEYS = ['lng', 'lon', 'long', 'longitude', 'x', 'coordx', 'este', 'easting'];
const LAT_KEYS = ['lat', 'latitude', 'y', 'coordy', 'norte', 'northing'];

function numero(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export async function parseArquivoPontos(file: File): Promise<ArquivoPontos> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (['kml', 'geojson', 'json', 'zip'].includes(ext)) {
    const r = await parseGeoFile(file);
    const feats = r.geojson.features.filter(f => f.geometry?.type === 'Point');
    if (feats.length === 0) throw new Error('Nenhum ponto encontrado (o arquivo precisa ser de PONTOS, não polígonos).');
    const pontos: PontoBruto[] = feats.map(f => {
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
      return { lng, lat, props: (f.properties ?? {}) as Record<string, string | number> };
    });
    return montar(pontos);
  }

  if (['csv', 'txt', 'xls', 'xlsx'].includes(ext)) {
    const aoa = await lerArquivo(file);
    if (aoa.length < 2) throw new Error('Arquivo tabular sem dados (esperado cabeçalho + linhas).');
    const header = aoa[0].map(h => String(h ?? '').trim());
    const idxLng = header.findIndex(h => LNG_KEYS.includes(norm(h)));
    const idxLat = header.findIndex(h => LAT_KEYS.includes(norm(h)));
    if (idxLng < 0 || idxLat < 0) {
      throw new Error('Não encontrei colunas de longitude/latitude (ex.: lng/lon/x e lat/y). Ajuste o cabeçalho.');
    }
    const pontos: PontoBruto[] = [];
    for (let r = 1; r < aoa.length; r++) {
      const row = aoa[r];
      const lng = numero(row[idxLng]); const lat = numero(row[idxLat]);
      if (lng == null || lat == null) continue;
      const props: Record<string, string | number> = {};
      header.forEach((h, i) => {
        if (i === idxLng || i === idxLat || !h) return;
        const n = numero(row[i]);
        props[h] = n != null ? n : String(row[i] ?? '');
      });
      pontos.push({ lng, lat, props });
    }
    if (pontos.length === 0) throw new Error('Nenhuma linha com coordenadas válidas.');
    return montar(pontos);
  }

  throw new Error(`Formato não suportado: .${ext}. Use SHP (.zip), KML, GeoJSON, CSV ou XLSX.`);
}

function montar(pontos: PontoBruto[]): ArquivoPontos {
  const colunas = [...new Set(pontos.flatMap(p => Object.keys(p.props)))];
  const colunasNumericas = colunas.filter(c => {
    let num = 0, tot = 0;
    for (const p of pontos) {
      const v = p.props[c];
      if (v == null || v === '') continue;
      tot++;
      if (typeof v === 'number' || numero(v) != null) num++;
    }
    return tot > 0 && num / tot >= 0.7;
  });
  return { pontos, colunas, colunasNumericas };
}

// Constrói os pontos (lng/lat + valores por profundidade) a partir das colunas
// escolhidas como profundidades.
export function pontosCompactacao(pontos: PontoBruto[], colunas: string[]) {
  return pontos.map(p => {
    const valores: Record<string, number> = {};
    for (const c of colunas) {
      const v = p.props[c];
      const n = typeof v === 'number' ? v : numero(v);
      if (n != null) valores[c] = n;
    }
    return { lng: p.lng, lat: p.lat, valores };
  });
}

// #36 — Converte as LEITURAS DE CAMPO (app: penetrômetro por ponto da grade) nos
// pontos de uma ImportacaoCompactacao. Só leituras COLETADAS com algum valor
// finito entram; a coordenada é a REAL do registro (onde o operador estava) e,
// sem ela, a do ponto planejado da grade. Puro (testável em Node).
export interface LeituraCampoCompact {
  ordem: number;
  status: string;                    // só 'coletado' entra
  valores: Record<string, number>;
  lngReal?: number;
  latReal?: number;
}
export function leiturasParaPontos(
  leituras: LeituraCampoCompact[],
  pontosGrade: { ordem: number; lng: number; lat: number }[],
): { lng: number; lat: number; valores: Record<string, number> }[] {
  const alvo = new Map(pontosGrade.map(p => [p.ordem, p]));
  const out: { lng: number; lat: number; valores: Record<string, number> }[] = [];
  for (const l of leituras) {
    if (l.status !== 'coletado') continue;
    const valores: Record<string, number> = {};
    for (const [prof, v] of Object.entries(l.valores ?? {})) {
      if (typeof v === 'number' && isFinite(v)) valores[prof] = v;
    }
    if (Object.keys(valores).length === 0) continue;
    const plan = alvo.get(l.ordem);
    const lng = l.lngReal ?? plan?.lng;
    const lat = l.latReal ?? plan?.lat;
    if (lng == null || lat == null) continue;
    out.push({ lng, lat, valores });
  }
  return out;
}
