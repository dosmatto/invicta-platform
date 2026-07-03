// Cliente do MSR (Motor de Sensoriamento Remoto) — NDVI por satélite.
//
// O front envia o polígono do talhão + período + nuvem máx; o backend busca a
// cena Sentinel-2 mais recente com pouca nuvem, calcula o NDVI e devolve o
// MESMO envelope de grid da Fertilidade (bounds + grid Float32 + stats), para
// reusar `decodeGrid`/`colorirGridComLegenda`/overlay do mapa.

import type { Grid } from './fertilidade';
import { INTERP_URL } from './interpUrl';

export interface CenaNdvi {
  id: string;
  data: string | null;        // 'YYYY-MM-DD' da passagem
  nuvem: number | null;       // % de nuvem da cena
  plataforma: string | null;  // ex.: 'sentinel-2a'
}

// Cena candidata (resultado da busca, sem ler COG ainda).
export type CenaDisponivel = CenaNdvi;

// Fonte de imagem: Sentinel-2 (10 m, global) ou CBERS-4A (2 m, Brasil).
export type FonteNdvi = 'sentinel' | 'cbers';

// Lista as cenas disponíveis no período (rápido — só metadados do STAC).
export async function listarCenasNdvi(params: {
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  dataIni: string;
  dataFim: string;
  nuvemMax?: number;
  fonte?: FonteNdvi;
}): Promise<CenaDisponivel[]> {
  const j = await postMsr<{ cenas: CenaDisponivel[] }>('/ndvi-cenas', {
    poligono: params.poligono,
    data_ini: params.dataIni,
    data_fim: params.dataFim,
    nuvem_max: params.nuvemMax ?? 60,
    fonte: params.fonte ?? 'sentinel',
  });
  return j.cenas ?? [];
}

// Imagem de satélite em cor verdadeira da cena, alinhada ao NDVI.
export async function buscarImagemSatelite(params: {
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  cenaId: string;
  pixelM?: number;
  fonte?: FonteNdvi;
}): Promise<{ bounds: [number, number, number, number]; png: string; cena: CenaNdvi }> {
  return postMsr('/ndvi-imagem', {
    poligono: params.poligono,
    cena_id: params.cenaId,
    pixel_m: params.pixelM ?? (params.fonte === 'cbers' ? 2 : 10),
    fonte: params.fonte ?? 'sentinel',
  });
}

export interface RespNdvi {
  bounds: [number, number, number, number];
  grid: Grid;                 // { b64, shape } — Float32, norte no topo
  stats: {
    n: number; min: number | null; max: number | null; media: number | null;
    nx: number; ny: number; pixel_m: number; indice: string;
  };
  cena: CenaNdvi;
}

export async function buscarNdviSentinel(params: {
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  dataIni: string;            // 'YYYY-MM-DD'
  dataFim: string;            // 'YYYY-MM-DD'
  nuvemMax?: number;
  pixelM?: number;
  cenaId?: string;            // cena específica (da lista); ausente = mais recente
  fonte?: FonteNdvi;          // 'sentinel' (10 m) | 'cbers' (2 m)
}): Promise<RespNdvi> {
  return postMsr('/ndvi-sentinel', {
    poligono: params.poligono,
    data_ini: params.dataIni,
    data_fim: params.dataFim,
    nuvem_max: params.nuvemMax ?? 40,
    pixel_m: params.pixelM ?? (params.fonte === 'cbers' ? 2 : 10),
    cena_id: params.cenaId ?? null,
    fonte: params.fonte ?? 'sentinel',
  });
}

// ── Índices vegetativos sob demanda (IV2) ────────────────────────────────────

export interface InfoIndice { id: string; nome: string; resumo: string; bandas: string[] }

export const INDICES: InfoIndice[] = [
  { id: 'NDVI',   nome: 'NDVI',   resumo: 'Vigor vegetativo geral',            bandas: ['red', 'nir'] },
  { id: 'SAVI',   nome: 'SAVI',   resumo: 'Vigor com correção de solo exposto', bandas: ['red', 'nir'] },
  { id: 'MSAVI2', nome: 'MSAVI',  resumo: 'Correção de solo automática',        bandas: ['red', 'nir'] },
  { id: 'EVI2',   nome: 'EVI2',   resumo: 'Vigor sem saturar em biomassa alta', bandas: ['red', 'nir'] },
  { id: 'EVI',    nome: 'EVI',    resumo: 'Vigor realçado (usa azul)',          bandas: ['blue', 'red', 'nir'] },
  { id: 'GNDVI',  nome: 'GNDVI',  resumo: 'Vigor/clorofila com banda verde',    bandas: ['green', 'nir'] },
  { id: 'NDWI',   nome: 'NDWI',   resumo: 'Água / encharcamento',               bandas: ['green', 'nir'] },
  { id: 'NDRE',   nome: 'NDRE',   resumo: 'Clorofila/N em lavoura fechada',     bandas: ['rededge', 'nir'] },
  { id: 'NDMI',   nome: 'NDMI',   resumo: 'Umidade da vegetação',               bandas: ['nir', 'swir'] },
  { id: 'VARI',   nome: 'VARI',   resumo: 'Verdor usando só RGB',               bandas: ['blue', 'green', 'red'] },
  { id: 'ExG',    nome: 'ExG',    resumo: 'Excesso de verde (RGB)',             bandas: ['blue', 'green', 'red'] },
  { id: 'GLI',    nome: 'GLI',    resumo: 'Verdor folhar (RGB)',                bandas: ['blue', 'green', 'red'] },
];

const BANDAS_FONTE: Record<FonteNdvi, Set<string>> = {
  sentinel: new Set(['blue', 'green', 'red', 'nir', 'rededge', 'swir']),
  cbers: new Set(['blue', 'green', 'red', 'nir']),
};
const NOME_BANDA: Record<string, string> = { blue: 'Azul', green: 'Verde', red: 'Vermelho', nir: 'NIR', rededge: 'Red Edge', swir: 'SWIR' };

// Disponibilidade dinâmica por bandas do sensor (spec seção 11).
export function indicesDisponiveis(fonte: FonteNdvi): { ok: InfoIndice[]; bloqueados: { ind: InfoIndice; motivo: string }[] } {
  const tem = BANDAS_FONTE[fonte];
  const ok: InfoIndice[] = [];
  const bloqueados: { ind: InfoIndice; motivo: string }[] = [];
  for (const ind of INDICES) {
    const falta = ind.bandas.filter(b => !tem.has(b));
    if (falta.length === 0) ok.push(ind);
    else bloqueados.push({ ind, motivo: `esta imagem não possui a banda ${falta.map(b => NOME_BANDA[b] ?? b).join(' e ')}` });
  }
  return { ok, bloqueados };
}

export interface ResIndice {
  grid: Grid;
  stats: RespNdvi['stats'] & { pct_validos?: number };
  formula: string;
  bandas: string[];
}

export interface RespIndices {
  bounds: [number, number, number, number];
  cena: CenaNdvi;
  mascara: boolean;                       // máscara de nuvem/sombra aplicada (SCL)
  resultados: Record<string, ResIndice>;  // por índice selecionado
}

// Calcula SÓ os índices selecionados da cena (bandas sob demanda no backend).
export async function buscarIndices(params: {
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  cenaId: string;
  fonte: FonteNdvi;
  indices: string[];
  pixelM?: number;
}): Promise<RespIndices> {
  return postMsr('/indices', {
    poligono: params.poligono,
    cena_id: params.cenaId,
    fonte: params.fonte,
    indices: params.indices,
    pixel_m: params.pixelM ?? (params.fonte === 'cbers' ? 2 : 10),
  });
}

// POST no backend do MSR com tratamento padrão (backend desligado / erro 4xx-5xx).
async function postMsr<T>(rota: string, body: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${INTERP_URL}${rota}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Backend desligado nesta máquina. Dê dois cliques em backend\\start.bat (Windows) ou backend/start.command (Mac), espere a janela abrir, e tente de novo.');
  }
  if (!r.ok) {
    let msg = `Backend respondeu ${r.status}`;
    try { const j = await r.json(); if (j?.detail) msg = String(j.detail); } catch {}
    throw new Error(msg);
  }
  return r.json();
}
