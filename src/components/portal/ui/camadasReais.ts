'use client';

// Camadas REAIS dos mini-mapas (modo "Mapas reais") — o que cada cartão passa
// em `camadaReal(id)`. Mesma leitura e mesma colorização das abas do talhão
// (lib/camadasTalhao): o raster do portal tem a cor do raster da aba.
//
// Só montam a DESCRIÇÃO do que carregar; o MiniMapa decide quando (visível,
// um por vez, com cache). Sem o item na listagem leve da nuvem (`metas`), a
// camada não existe → null → o talhão fica na cor leve.

import { getLegendas } from '@/lib/store';
import { cloudCarregarMapa, cloudListarMapasMeta } from '@/lib/cloud';
import { descomprimirGrid, type Grid, type RespInterp } from '@/lib/fertilidade';
import { colorirGrid, colorirGridComLegenda, temGrid } from '@/lib/raster';
import { hexToRgb } from '@/lib/legendas';
import { legendaDesignada, PREF_LEGENDA } from '@/lib/legendaDesignada';
import { legendaDaCultura } from '@/lib/produtividade';
import { legendaPadraoDe } from '@/lib/processarFertilidade';
import { faixaDoLaudo, limitarRespAFaixa } from '@/lib/faixaAmostras';
import { ehAuxiliar20mPerdido } from '@/lib/recomendacao/escolhaMapa';
import { featuresParaMapa } from '@/lib/meap/zonasParaMapa';
import type { MapaNuvemPainel } from '@/lib/portalPainel';
import type { CamadaReal, DesenhoReal } from './MiniMapa';
import { RAMPA_RELEVO } from './formato';

type DocResp = { resp?: { bounds?: [number, number, number, number]; grid?: Grid; png?: string } };
const profNum = (s: string) => { const m = /(\d+)/.exec(s ?? ''); return m ? Number(m[1]) : 0; };

async function gridPronto(g: Grid | undefined): Promise<Grid | null> {
  if (!g) return null;
  try { return g.comp === 'gz' ? await descomprimirGrid(g) : g; } catch { return null; }
}

/** Mapa de colheita (`${talhão}__prod__${mapa}`) na legenda de produtividade da cultura. */
export function camadaProdutividade(talhaoId: string, colheita: { id?: string; cultura: string } | null, metas: MapaNuvemPainel[] | undefined): CamadaReal | null {
  if (!colheita?.id) return null;
  const mapaId = `${talhaoId}__prod__${colheita.id}`;
  const meta = (metas ?? []).find(m => m.id === mapaId);
  if (!meta) return null;
  return {
    chave: `prod:${mapaId}:${meta.atualizadoEm ?? ''}`, mapaId, atualizadoEm: meta.atualizadoEm ?? null,
    colorir: async dados => {
      const resp = (dados as DocResp | null)?.resp;
      const grid = await gridPronto(resp?.grid);
      if (!grid || !resp?.bounds) return null;
      const leg = legendaDesignada('produtividade', PREF_LEGENDA.produtividade, legendaDaCultura(colheita.cultura) ?? null);
      if (!leg) return null;
      return { tipo: 'raster', url: colorirGridComLegenda(grid, leg).dataUrl, bounds: resp.bounds };
    },
  };
}

/** Mapa de fertilidade de UM atributo do laudo (camada mais rasa que tiver
 *  mapa), na legenda padrão do atributo, limitado à faixa das amostras. */
export function camadaFertilidade(
  talhaoId: string,
  laudo: { id: string; resultados?: Array<{ profundidade: string; valores: Record<string, number> }>; limiteAlteradoEm?: string } | null,
  atributo: string,
  metas: MapaNuvemPainel[] | undefined,
): CamadaReal | null {
  if (!laudo) return null;
  const prefixo = `${talhaoId}__${laudo.id}__`;
  const cands = (metas ?? []).filter(m => m.id.startsWith(prefixo)).map(m => {
    const s = m.id.split('__');
    return { m, nut: s[s.length - 2], prof: s[s.length - 1] };
  }).filter(x => x.nut === atributo)
    .sort((a, b) => profNum(a.prof) - profNum(b.prof) || (b.m.atualizadoEm ?? '').localeCompare(a.m.atualizadoEm ?? ''));
  const alvo = cands[0];
  if (!alvo) return null;
  return {
    chave: `fert:${alvo.m.id}:${alvo.m.atualizadoEm ?? ''}`, mapaId: alvo.m.id, atualizadoEm: alvo.m.atualizadoEm ?? null,
    colorir: async dados => {
      const doc = dados as { resp?: RespInterp; interpoladoEm?: string; labels?: { features?: unknown[] } } | null;
      if (!doc?.resp?.bounds) return null;
      if (ehAuxiliar20mPerdido(alvo.m.id, prefixo, doc as never)) return null;
      const grid = await gridPronto(doc.resp.grid);
      let resp: RespInterp = grid ? { ...doc.resp, grid } : doc.resp;
      resp = limitarRespAFaixa(resp, faixaDoLaudo(laudo.resultados ? { resultados: laudo.resultados, limiteAlteradoEm: laudo.limiteAlteradoEm } : null, atributo, alvo.prof, doc.interpoladoEm));
      const leg = legendaPadraoDe(getLegendas(), atributo);
      let url: string | undefined;
      if (leg && temGrid(resp)) { try { url = colorirGridComLegenda(resp.grid, leg).dataUrl; } catch { /* cai no PNG */ } }
      if (!url && resp.png) url = resp.png;
      return url ? { tipo: 'raster', url, bounds: resp.bounds } : null;
    },
  };
}

/** Condutividade (`condutividade__${talhão}__${levantamento}__${prof}`), legenda designada de CE. */
export function camadaCondutividade(talhaoId: string, lev: { id?: string; profundidadeOficial?: string; profundidades?: string[] } | null): CamadaReal | null {
  if (!lev?.id) return null;
  const prof = lev.profundidadeOficial ?? lev.profundidades?.[0];
  if (!prof) return null;
  const mapaId = `condutividade__${talhaoId}__${lev.id}__${prof}`;
  return {
    chave: `ce:${mapaId}`,
    carregar: async () => {
      // Listagem leve primeiro: sem o item, não há mapa (e não baixa nada).
      const meta = (await cloudListarMapasMeta(`condutividade__${talhaoId}__${lev.id}__`)).find(m => m.id === mapaId);
      if (!meta) return null;
      const doc = await cloudCarregarMapa<DocResp>(mapaId, meta.atualizadoEm);
      const resp = doc?.dados?.resp;
      const grid = await gridPronto(resp?.grid);
      if (!grid || !resp?.bounds) return null;
      const leg = legendaDesignada('condutividade', PREF_LEGENDA.condutividade);
      if (!leg) return null;
      return { tipo: 'raster', url: colorirGridComLegenda(grid, leg).dataUrl, bounds: resp.bounds };
    },
  };
}

/** Relevo: grade de elevação (`mde__${talhão}__${mde}__elev`) na rampa baixada → topo
 *  entre o mínimo e o máximo do próprio talhão; sem ela, o sombreamento (`__hs`). */
export function camadaRelevo(talhaoId: string, mde: { id?: string; stats?: { alt_min: number; alt_max: number } } | null): CamadaReal | null {
  if (!mde?.id || !mde.stats) return null;
  const base = `mde__${talhaoId}__${mde.id}__`;
  const stops = RAMPA_RELEVO.map((c, i) => [i / (RAMPA_RELEVO.length - 1), hexToRgb(c)] as [number, [number, number, number]]);
  return {
    chave: `mde:${base}`,
    carregar: async (): Promise<DesenhoReal | null> => {
      const elev = await cloudCarregarMapa<{ bounds?: [number, number, number, number]; elevacao?: Grid }>(`${base}elev`);
      const grid = await gridPronto(elev?.dados?.elevacao);
      if (grid && elev?.dados?.bounds) {
        return { tipo: 'raster', url: colorirGrid(grid, [mde.stats!.alt_min, mde.stats!.alt_max], stops).dataUrl, bounds: elev.dados.bounds };
      }
      const hs = await cloudCarregarMapa<{ bounds?: [number, number, number, number]; hillshade_png?: string }>(`${base}hs`);
      return hs?.dados?.hillshade_png && hs.dados.bounds ? { tipo: 'raster', url: hs.dados.hillshade_png, bounds: hs.dados.bounds } : null;
    },
  };
}

/** Zonas do cadastro (vetor LOCAL — funciona sem nuvem), na cor da aba Zonas. */
export function camadaZonas(talhaoId: string, zonasGeojson: string | null | undefined): CamadaReal | null {
  if (!zonasGeojson) return null;
  return {
    chave: `zonas:${talhaoId}:${zonasGeojson.length}`,
    nuvem: false,
    colorir: () => {
      try {
        const fc = featuresParaMapa(JSON.parse(zonasGeojson) as GeoJSON.FeatureCollection);
        return { tipo: 'vetor', geojson: fc, cor: p => (typeof p.cor === 'string' ? p.cor : '#94a3b8') };
      } catch { return null; }
    },
  };
}
