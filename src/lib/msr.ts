// Cliente do MSR (Motor de Sensoriamento Remoto) — NDVI por satélite.
//
// O front envia o polígono do talhão + período + nuvem máx; o backend busca a
// cena Sentinel-2 mais recente com pouca nuvem, calcula o NDVI e devolve o
// MESMO envelope de grid da Fertilidade (bounds + grid Float32 + stats), para
// reusar `decodeGrid`/`colorirGridComLegenda`/overlay do mapa.

import type { Grid } from './fertilidade';
import { postBackend } from './interpUrl';

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
// `limite`: o padrão do servidor é 30, que truncava 3 anos em silêncio (o
// gráfico de seleção pede algumas centenas). Teto duro do servidor: 800.
export async function listarCenasNdvi(params: {
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  dataIni: string;
  dataFim: string;
  nuvemMax?: number;
  fonte?: FonteNdvi;
  limite?: number;
}): Promise<CenaDisponivel[]> {
  const j = await postMsr<{ cenas: CenaDisponivel[] }>('/ndvi-cenas', {
    poligono: params.poligono,
    data_ini: params.dataIni,
    data_fim: params.dataFim,
    nuvem_max: params.nuvemMax ?? 60,
    fonte: params.fonte ?? 'sentinel',
    limite: params.limite ?? 30,
  });
  return j.cenas ?? [];
}

// ── Avaliação barata das cenas (pendência 40) ────────────────────────────────
// O `nuvem` do catálogo é da CENA INTEIRA (~110 km) e engana: numa medição real
// deste talhão, a cena de 17,6% de nuvem deixou 69% do talhão limpo, enquanto a
// de 9,2% deixou só 58%. Quem escolhe pela nuvem da cena escolhe errado. Esta
// rota lê a máscara de nuvem numa grade grossa e responde o que importa: quanto
// DESTE talhão está limpo, e qual o vigor médio.

export interface AvaliacaoCena {
  id: string;
  data: string | null;
  fonte: FonteNdvi;
  nuvem: number | null;        // da cena (catálogo)
  pctLimpo: number | null;     // % do TALHÃO sem nuvem/sombra
  ndviMedio: number | null;    // média do índice no que sobrou
  semMascara?: boolean;        // CBERS: sem banda de qualidade — nuvem não é detectada
  erro?: string;
}

// Teto do servidor por chamada — chame em lotes deste tamanho, com progresso.
export const MAX_AVALIAR = 12;

export async function avaliarCenas(params: {
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  cenas: Array<{ id: string; fonte: FonteNdvi }>;
  indice?: string;
  corteLimpo?: number;         // abaixo disso o servidor nem lê as bandas (7x mais rápido)
  pixelM?: number;             // 0/ausente = o servidor escolhe pelo tamanho do talhão
}): Promise<{ pixelM: number; cenas: AvaliacaoCena[] }> {
  const r = await postBackend('/ndvi-avaliar', {
    poligono: params.poligono,
    cenas: params.cenas.map(c => ({ id: c.id, fonte: c.fonte })),
    indice: params.indice ?? 'NDVI',
    corte_limpo: params.corteLimpo ?? 0,
    pixel_m: params.pixelM ?? 0,
  });
  if (r.status === 404) {
    // O front (Vercel) publica em ~1 min; o backend (Render) leva vários. Nessa
    // janela a rota ainda não existe — o mesmo tratamento de baixarImagemGeotiff.
    throw new Error('O servidor de processamento ainda não tem a avaliação de cenas — ele deve estar sendo atualizado. Tente de novo em alguns minutos.');
  }
  if (!r.ok) {
    let msg = `Backend respondeu ${r.status}`;
    try { const j = await r.json(); if (j?.detail) msg = String(j.detail); } catch {}
    throw new Error(msg);
  }
  const j = await r.json() as {
    pixel_m?: number;
    cenas?: Array<{
      id: string; data?: string | null; fonte?: string; nuvem?: number | null;
      pct_limpo?: number | null; ndvi_medio?: number | null; sem_mascara?: boolean; erro?: string;
    }>;
  };
  return {
    pixelM: j.pixel_m ?? 0,
    cenas: (j.cenas ?? []).map(c => ({
      id: c.id,
      data: c.data ?? null,
      fonte: (c.fonte === 'cbers' ? 'cbers' : 'sentinel') as FonteNdvi,
      nuvem: c.nuvem ?? null,
      pctLimpo: c.pct_limpo ?? null,
      ndviMedio: c.ndvi_medio ?? null,
      semMascara: c.sem_mascara,
      erro: c.erro,
    })),
  };
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

// POST no backend do MSR com tratamento padrão (backend fora do ar / erro 4xx-5xx).
async function postMsr<T>(rota: string, body: unknown): Promise<T> {
  const r = await postBackend(rota, body);
  if (!r.ok) {
    let msg = `Backend respondeu ${r.status}`;
    try { const j = await r.json(); if (j?.detail) msg = String(j.detail); } catch {}
    throw new Error(msg);
  }
  return r.json();
}

// ── Download em GeoTIFF (QGIS e afins) ───────────────────────────────────────
// Dois recortes, porque servem a coisas diferentes:
//   • TALHÃO — só o que está dentro da divisa. É o dado da análise.
//   • JANELA — o retângulo que está na tela, sem máscara. Serve para enxergar o
//     entorno (vizinho, mata, carreador) quando a pergunta não para na cerca.
// Em ambos vale a resolução da fonte (2 m no CBERS, 10 m no Sentinel); em janela
// muito ampla o servidor engrossa o pixel sozinho para a malha caber.

// Imagem de cor verdadeira como GeoTIFF de 3 bandas. Devolve o Blob p/ baixar.
export async function baixarImagemGeotiff(params: {
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  cenaId: string;
  pixelM?: number;
  fonte?: FonteNdvi;
  recortar: boolean;
  filename: string;
}): Promise<Blob> {
  const r = await postBackend('/ndvi-imagem-geotiff', {
    poligono: params.poligono,
    cena_id: params.cenaId,
    pixel_m: params.pixelM ?? (params.fonte === 'cbers' ? 2 : 10),
    fonte: params.fonte ?? 'sentinel',
    recortar: params.recortar,
    filename: params.filename,
  });
  if (r.status === 404) {
    throw new Error('O servidor de processamento ainda não tem o download em GeoTIFF — ele deve estar sendo atualizado. Tente de novo em alguns minutos.');
  }
  if (!r.ok) {
    let msg = `Backend respondeu ${r.status}`;
    try { const j = await r.json(); if (j?.detail) msg = String(j.detail); } catch {}
    throw new Error(msg);
  }
  return r.blob();
}
