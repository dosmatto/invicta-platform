// Cliente do MSR (Motor de Sensoriamento Remoto) — NDVI por satélite.
//
// O front envia o polígono do talhão + período + nuvem máx; o backend busca a
// cena Sentinel-2 mais recente com pouca nuvem, calcula o NDVI e devolve o
// MESMO envelope de grid da Fertilidade (bounds + grid Float32 + stats), para
// reusar `decodeGrid`/`colorirGridComLegenda`/overlay do mapa.

import type { Grid } from './fertilidade';

const INTERP_URL = process.env.NEXT_PUBLIC_INTERP_URL ?? 'http://127.0.0.1:8800';

export interface CenaNdvi {
  id: string;
  data: string | null;        // 'YYYY-MM-DD' da passagem
  nuvem: number | null;       // % de nuvem da cena
  plataforma: string | null;  // ex.: 'sentinel-2a'
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
}): Promise<RespNdvi> {
  let r: Response;
  try {
    r = await fetch(`${INTERP_URL}/ndvi-sentinel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        poligono: params.poligono,
        data_ini: params.dataIni,
        data_fim: params.dataFim,
        nuvem_max: params.nuvemMax ?? 40,
        pixel_m: params.pixelM ?? 10,
      }),
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
