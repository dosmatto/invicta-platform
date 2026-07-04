// MDE + Análise Topográfica Agronômica — F1 (Essencial).
//
// Cliente do endpoint /mde (busca Copernicus GLO-30 → SRTM, deriva altitude/
// declividade/hillshade com buffer, recorta no talhão) + persistência da base
// APROVADA na nuvem (mesma coleção de mapas, prefixo mde__<talhaoId>__<id>__).
// Os grids seguem o contrato do interp (Float32 b64) — o /grid-geotiff exporta
// e o colorirGridComLegenda colore sem código novo.

import { postBackend } from './interpUrl';
import { comprimirGrid, descomprimirGrid, type Grid } from './fertilidade';
import { cloudSalvarMapa, cloudCarregarMapasPorPrefixo, cloudExcluirMapasPorPrefixo } from './cloud';

export type FonteMde = 'auto' | 'cop30' | 'srtm';

export const FONTES_MDE: { id: FonteMde; rotulo: string }[] = [
  { id: 'auto', rotulo: 'Automática (melhor disponível)' },
  { id: 'cop30', rotulo: 'Copernicus DEM GLO-30 (30 m)' },
  { id: 'srtm', rotulo: 'NASADEM/SRTM (30 m)' },
];
// Fontes da spec ainda indisponíveis (mostradas desabilitadas com o motivo).
export const FONTES_MDE_INDISPONIVEIS: { rotulo: string; motivo: string }[] = [
  { rotulo: 'FABDEM (30 m, terreno corrigido)', motivo: 'licença só para uso não-comercial — aguardando alternativa' },
  { rotulo: 'ALOS AW3D30 (30 m)', motivo: 'exige chave de acesso (fase futura)' },
  { rotulo: 'MDE próprio (drone/RTK)', motivo: 'upload entra numa próxima fase' },
];

export interface StatsMde {
  alt_min: number; alt_med: number; alt_max: number; amplitude: number;
  decl_media: number | null; decl_max: number | null;
  pct_sem_dados: number; n_px: number;
}

export interface RespMde {
  fonte: string;
  rotulo: string;
  resolucao_m: number;
  bounds: [number, number, number, number];
  shape: [number, number];
  elevacao: Grid;
  declividade: Grid;
  hillshade_png: string;            // data URL (transparente fora do polígono)
  stats: StatsMde;
  histograma: { ini: number; fim: number; counts: number[] };
  avisos: string[];
}

export async function buscarMde(params: {
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  fonte?: FonteMde;
  bufferM?: number;
}): Promise<RespMde> {
  const r = await postBackend('/mde', {
    poligono: params.poligono,
    fonte: params.fonte ?? 'auto',
    buffer_m: params.bufferM ?? 300,
  });
  if (r.status === 404) throw new Error('O servidor de processamento ainda não tem o módulo MDE — ele deve estar sendo atualizado. Tente de novo em alguns minutos.');
  if (!r.ok) {
    let msg = `Backend respondeu ${r.status}`;
    try { const j = await r.json(); if (j?.detail) msg = String(j.detail); } catch {}
    throw new Error(msg);
  }
  return r.json();
}

// ── Persistência da base aprovada (nuvem) ────────────────────────────────────
export const prefixoMde = (talhaoId: string, mdeId: string) => `mde__${talhaoId}__${mdeId}__`;

export interface MdeSalvo {
  bounds: [number, number, number, number];
  elevacao?: Grid;        // gz na nuvem
  declividade?: Grid;     // gz na nuvem
  hillshade_png?: string;
}

export async function salvarMdeNaNuvem(talhaoId: string, mdeId: string, r: RespMde): Promise<void> {
  const pre = prefixoMde(talhaoId, mdeId);
  const [elevGz, declGz] = await Promise.all([comprimirGrid(r.elevacao), comprimirGrid(r.declividade)]);
  cloudSalvarMapa(`${pre}elev`, { bounds: r.bounds, elevacao: elevGz } satisfies MdeSalvo);
  cloudSalvarMapa(`${pre}decl`, { bounds: r.bounds, declividade: declGz } satisfies MdeSalvo);
  cloudSalvarMapa(`${pre}hs`, { bounds: r.bounds, hillshade_png: r.hillshade_png } satisfies MdeSalvo);
}

export interface MdeCarregado {
  bounds: [number, number, number, number];
  elevacao: Grid | null;
  declividade: Grid | null;
  hillshadePng: string | null;
}

export async function carregarMdeDaNuvem(talhaoId: string, mdeId: string): Promise<MdeCarregado | null> {
  const docs = await cloudCarregarMapasPorPrefixo<MdeSalvo>(prefixoMde(talhaoId, mdeId));
  if (docs.length === 0) return null;
  const out: MdeCarregado = { bounds: [0, 0, 0, 0], elevacao: null, declividade: null, hillshadePng: null };
  for (const d of docs) {
    if (d.dados.bounds) out.bounds = d.dados.bounds;
    if (d.dados.elevacao) out.elevacao = await descomprimirGrid(d.dados.elevacao);
    if (d.dados.declividade) out.declividade = await descomprimirGrid(d.dados.declividade);
    if (d.dados.hillshade_png) out.hillshadePng = d.dados.hillshade_png;
  }
  return out;
}

export function excluirMdeDaNuvem(talhaoId: string, mdeId: string): void {
  cloudExcluirMapasPorPrefixo(prefixoMde(talhaoId, mdeId));
}

// ── Apoio de visualização ────────────────────────────────────────────────────
// A legenda oficial de Altimetria trabalha em PERCENTUAL do range (0–100,
// classes 25/50/75/90). Normaliza a elevação real p/ 0–100 SÓ para colorir.
export function normalizarGrid0a100(g: Grid): Grid {
  const bin = atob(g.b64);
  const buf = new ArrayBuffer(bin.length);
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const v = new Float32Array(buf);
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < v.length; i++) { const x = v[i]; if (isFinite(x)) { if (x < mn) mn = x; if (x > mx) mx = x; } }
  const amp = mx - mn;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = isFinite(v[i]) ? (amp > 0 ? ((v[i] - mn) / amp) * 100 : 50) : NaN;
  const ob = new Uint8Array(out.buffer);
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < ob.length; i += CHUNK) s += String.fromCharCode(...ob.subarray(i, i + CHUNK));
  return { b64: btoa(s), shape: g.shape };
}
