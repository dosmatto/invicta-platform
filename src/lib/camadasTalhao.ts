// Fontes da aba CAMADAS do talhão (components/talhao/CamadasSection.tsx).
//
// Só lê o que as outras abas JÁ GUARDARAM — nada aqui interpola, processa ou
// grava. A listagem é leve (metadados e store local); o raster/geometria de
// cada camada só é baixado quando o usuário a liga (`carregar`). A conversão
// grade → PNG repete a das abas de origem, com a legenda designada de cada
// módulo (a mesma preferência que a aba grava), para a cor bater com a aba.
//
// Sem nuvem (bancada sem login) os grupos raster vêm vazios: os mapas de
// fertilidade/NDVI/produtividade só existem lá.

import type { CamadaMapa, EstiloCamadaVetor } from '@/context/AppContext';
import {
  getGrades, getImportacoesLab, getLegendas, getMapasProdutividade, getZoneamentosMeap, type Talhao,
} from '@/lib/store';
import { cloudCarregarMapa, cloudCarregarMapasPorPrefixo, cloudListarMapasMeta } from '@/lib/cloud';
import { coordsFromBounds, decodeGrid, descomprimirGrid, type Grid, type RespInterp } from '@/lib/fertilidade';
import { colorirGrid, colorirGridComLegenda, temGrid } from '@/lib/raster';
import { rampaVisualStops } from '@/lib/legendas';
import { faixaPercentis } from '@/lib/quantis';
import { legendaDesignada, PREF_LEGENDA } from '@/lib/legendaDesignada';
import { legendaDaCultura } from '@/lib/produtividade';
import { legendaPadraoDe } from '@/lib/processarFertilidade';
import { ehAuxiliar20mPerdido } from '@/lib/recomendacao/escolhaMapa';
import { faixaDoLaudo, limitarRespAFaixa } from '@/lib/faixaAmostras';
import { carregarGridNdvi, listarNdviSalvos } from '@/lib/meap/gerar';
import { camadasVisiveisPF, estadoLinhasPF, geometriaLinhasPF } from '@/lib/precisionfarm/cliente';
import { featuresParaMapa } from '@/lib/meap/zonasParaMapa';

/** O que `carregar` devolve: a camada sem a opacidade (quem dá é a pilha). */
export type DesenhoCamada =
  | { id: string; tipo: 'raster'; url: string; coordinates: Extract<CamadaMapa, { tipo: 'raster' }>['coordinates'] }
  | { id: string; tipo: 'vetor'; estilo: EstiloCamadaVetor; geojson: GeoJSON.FeatureCollection };

export interface ItemCamada {
  id: string;
  grupo: string;
  nome: string;
  detalhe?: string;
  cor: string;            // amostra de cor no painel
  opacidadePadrao?: number;
  carregar: () => Promise<DesenhoCamada | null>;
}

export interface GrupoCamadas { id: string; nome: string; vazio: string; itens: ItemCamada[] }

const dataBr = (iso?: string | null) => {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : iso;
};

// ── Fertilidade ─────────────────────────────────────────────────────────────
// Mesma leitura da FertilidadeSection: prefixo LARGO do laudo, chave = os dois
// últimos campos do id (`nut__prof`), duplicata → vence a interpolação mais
// recente, auxiliar de 20 m perdido é ignorado e o valor é limitado à faixa do laudo.
type MapaFert = { resp: RespInterp; interpoladoEm?: string };
const fertPorLaudo = new Map<string, Promise<Record<string, MapaFert>>>();

function mapasDoLaudo(talhaoId: string, imp: ReturnType<typeof getImportacoesLab>[number]): Promise<Record<string, MapaFert>> {
  const prefixo = `${talhaoId}__${imp.id}__`;
  let p = fertPorLaudo.get(prefixo);
  if (!p) {
    p = (async () => {
      const out: Record<string, MapaFert> = {};
      for (const c of await cloudCarregarMapasPorPrefixo<MapaFert>(prefixo)) {
        const partes = c.id.slice(prefixo.length).split('__');
        if (partes.length < 2) continue;
        const [nut, prof] = partes.slice(-2);
        const chave = `${nut}__${prof}`;
        const dados = c.dados;
        if (ehAuxiliar20mPerdido(c.id, prefixo, dados as never)) continue;
        if (out[chave] && (out[chave].interpoladoEm ?? '') >= (dados.interpoladoEm ?? '')) continue;
        if (dados.resp?.grid?.comp === 'gz') {
          try { dados.resp.grid = await descomprimirGrid(dados.resp.grid); } catch { /* cai no PNG */ }
        }
        dados.resp = limitarRespAFaixa(dados.resp, faixaDoLaudo(imp, nut, prof, dados.interpoladoEm));
        out[chave] = dados;
      }
      return out;
    })();
    // Falha não fica em cache: a próxima tentativa consulta de novo.
    p.catch(() => fertPorLaudo.delete(prefixo));
    fertPorLaudo.set(prefixo, p);
  }
  return p;
}

async function grupoFertilidade(talhao: Talhao, safra: string): Promise<GrupoCamadas> {
  const legendas = getLegendas();
  const laudos = [...getImportacoesLab(talhao.id, safra || undefined)]
    .sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? ''));
  const itens: ItemCamada[] = [];
  for (const imp of laudos) {
    const prefixo = `${talhao.id}__${imp.id}__`;
    const chaves = new Set<string>();
    for (const m of await cloudListarMapasMeta(prefixo).catch(() => [])) {
      const partes = m.id.slice(prefixo.length).split('__');
      if (partes.length >= 2) chaves.add(partes.slice(-2).join('__'));
    }
    const sufixoLaudo = laudos.length > 1 ? dataBr(imp.dataReferencia ?? imp.criadoEm) : undefined;
    for (const chave of [...chaves].sort()) {
      const [nut, prof] = chave.split('__');
      const leg = legendaPadraoDe(legendas, nut);
      if (!leg) continue;
      itens.push({
        id: `fert:${imp.id}:${chave}`,
        grupo: 'Fertilidade',
        nome: `${leg.simbolo ?? nut} · ${prof} cm`,
        detalhe: sufixoLaudo,
        cor: (() => { const c = leg.classes?.[Math.floor((leg.classes.length - 1) / 2)]; return c?.corInicio ?? c?.corBase ?? '#a3e635'; })(),
        carregar: async () => {
          const r = (await mapasDoLaudo(talhao.id, imp))[chave];
          if (!r?.resp?.bounds) return null;
          let url: string | undefined;
          if (temGrid(r.resp)) { try { url = colorirGridComLegenda(r.resp.grid, leg).dataUrl; } catch { /* PNG */ } }
          if (!url && r.resp.png) url = r.resp.png;
          return url ? { id: `fert:${imp.id}:${chave}`, tipo: 'raster', url, coordinates: coordsFromBounds(r.resp.bounds) } : null;
        },
      });
    }
  }
  return { id: 'fertilidade', nome: 'Fertilidade', vazio: 'Nenhum mapa de fertilidade gerado nesta safra.', itens };
}

// ── NDVI / índices ──────────────────────────────────────────────────────────
async function grupoNdvi(talhao: Talhao): Promise<GrupoCamadas> {
  const metas = (await listarNdviSalvos(talhao.id).catch(() => []))
    .sort((a, b) => b.data.localeCompare(a.data) || a.indice.localeCompare(b.indice));
  const leg = legendaDesignada('ndvi', PREF_LEGENDA.ndvi);
  const itens: ItemCamada[] = metas.map(m => ({
    id: `ndvi:${m.itemId}`,
    grupo: 'NDVI',
    nome: `${m.indice} · ${dataBr(m.data)}`,
    detalhe: m.media != null ? `méd. ${m.media.toFixed(2)}` : undefined,
    cor: '#22c55e',
    carregar: async () => {
      if (!leg) return null;
      const grid = await carregarGridNdvi(m);
      if (!grid?.b64) return null;
      // Domínio igual ao da aba sem contraste: NDVI fixo 0–1, os demais p2–p98.
      const dominio: [number, number] = m.indice === 'NDVI' ? [0, 1] : faixaPercentis(decodeGrid(grid).valores, 2, 98);
      const url = colorirGrid(grid, dominio, rampaVisualStops({ ...leg, estilo: 'continuo' })).dataUrl;
      return { id: `ndvi:${m.itemId}`, tipo: 'raster', url, coordinates: coordsFromBounds(m.bounds) };
    },
  }));
  return { id: 'ndvi', nome: 'NDVI e índices', vazio: 'Nenhuma cena de índice salva para este talhão.', itens };
}

// ── Produtividade (mapas de colheita) ───────────────────────────────────────
function grupoProdutividade(talhao: Talhao): GrupoCamadas {
  const recs = [...getMapasProdutividade(talhao.id)]
    .sort((a, b) => (b.dataReferencia ?? b.safra ?? '').localeCompare(a.dataReferencia ?? a.safra ?? ''));
  const itens: ItemCamada[] = recs.map(rec => ({
    id: `prod:${rec.id}`,
    grupo: 'Produtividade',
    nome: `${rec.cultura || 'Colheita'} · ${rec.safra}`,
    detalhe: rec.oficial ? 'oficial' : undefined,
    cor: '#f59e0b',
    carregar: async () => {
      const doc = await cloudCarregarMapa<{ resp?: { bounds?: [number, number, number, number]; grid?: Grid } }>(`${talhao.id}__prod__${rec.id}`);
      const resp = doc?.dados?.resp;
      let grid = resp?.grid;
      if (!grid || !resp?.bounds) return null;
      if (grid.comp === 'gz') grid = await descomprimirGrid(grid);
      const leg = legendaDesignada('produtividade', PREF_LEGENDA.produtividade, legendaDaCultura(rec.cultura) ?? null);
      if (!leg) return null;
      return { id: `prod:${rec.id}`, tipo: 'raster', url: colorirGridComLegenda(grid, leg).dataUrl, coordinates: coordsFromBounds(resp.bounds) };
    },
  }));
  return { id: 'produtividade', nome: 'Produtividade (colheita)', vazio: 'Nenhum mapa de colheita processado.', itens };
}

// ── Linhas PrecisionFarm ────────────────────────────────────────────────────
async function grupoLinhas(talhao: Talhao): Promise<GrupoCamadas> {
  const r = await estadoLinhasPF(talhao.id).catch(() => null);
  const camadas = r?.ok ? camadasVisiveisPF(r.camadas) : [];
  const itens: ItemCamada[] = camadas.map(c => ({
    id: `pf:${c.resourceId}`,
    grupo: 'Linhas',
    nome: c.nome || c.integrationName || 'Linhas',
    detalhe: `rev. ${c.revisaoGeometria}`,
    cor: '#22d3ee',
    carregar: async () => {
      const g = await geometriaLinhasPF(talhao.id, c.resourceId, c.revisaoGeometria!);
      if (!g.ok) throw new Error(g.erro);
      return { id: `pf:${c.resourceId}`, tipo: 'vetor', estilo: 'linhas-pf', geojson: g.geometria };
    },
  }));
  return { id: 'linhas', nome: 'Linhas (PrecisionFarm)', vazio: r && !r.ok ? 'Não foi possível consultar as linhas agora.' : 'Nenhuma linha recebida da PrecisionFarm.', itens };
}

// ── Zonas, pontos e contorno (store local) ──────────────────────────────────
const vetor = (id: string, estilo: EstiloCamadaVetor, geojson: GeoJSON.FeatureCollection): DesenhoCamada =>
  ({ id, tipo: 'vetor', estilo, geojson });

// Mesma cor e rótulo da aba Zonas (lib/meap/zonasParaMapa).
const fcZonas = featuresParaMapa;

function grupoZonas(talhao: Talhao): GrupoCamadas {
  const zs = getZoneamentosMeap(talhao.id).filter(z => z.fc?.features?.length);
  const itens: ItemCamada[] = zs.map(z => ({
    id: `zonas:${z.id}`,
    grupo: 'Zonas',
    nome: z.nome || 'Zoneamento',
    detalhe: z.padrao ? 'padrão' : undefined,
    cor: '#84cc16',
    opacidadePadrao: 0.6,
    carregar: async () => vetor(`zonas:${z.id}`, 'zonas', fcZonas(z.fc)),
  }));
  // Talhão sem zoneamento salvo, mas com as zonas gravadas no cadastro.
  if (!itens.length && talhao.zonasGeojson) {
    try {
      const fc = JSON.parse(talhao.zonasGeojson) as GeoJSON.FeatureCollection;
      if (fc?.features?.length) {
        itens.push({ id: 'zonas:cadastro', grupo: 'Zonas', nome: 'Zonas do cadastro', cor: '#84cc16', opacidadePadrao: 0.6,
          carregar: async () => vetor('zonas:cadastro', 'zonas', fcZonas(fc)) });
      }
    } catch { /* zonas inválidas: fica sem */ }
  }
  return { id: 'zonas', nome: 'Zonas de manejo', vazio: 'Nenhum zoneamento salvo.', itens };
}

function grupoPontosEContorno(talhao: Talhao, safra: string): GrupoCamadas {
  const itens: ItemCamada[] = [];
  if (talhao.geojson) {
    itens.push({
      id: 'contorno', grupo: 'Talhão', nome: 'Contorno do talhão', cor: '#fde68a',
      carregar: async () => vetor('contorno', 'contorno', JSON.parse(talhao.geojson!) as GeoJSON.FeatureCollection),
    });
  }
  for (const g of getGrades(talhao.id, safra || undefined)) {
    if (!g.pontos?.length) continue;
    itens.push({
      id: `pontos:${g.id}`, grupo: 'Amostragem', nome: g.nome || 'Grade', detalhe: `${g.pontos.length} pts`, cor: '#facc15',
      carregar: async () => vetor(`pontos:${g.id}`, 'pontos', {
        type: 'FeatureCollection',
        features: g.pontos.map(p => ({
          type: 'Feature', properties: { ordem: p.ordem, label: String(p.ordem + 1) },
          geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        })),
      }),
    });
  }
  return { id: 'base', nome: 'Contorno e pontos de amostragem', vazio: 'Sem contorno nem grade nesta safra.', itens };
}

/** Todos os grupos da aba, na ordem da tela. Grupo cuja consulta falhou vem vazio. */
export async function listarFontesCamadas(talhao: Talhao, safra: string): Promise<GrupoCamadas[]> {
  // Cada abertura da aba relê a nuvem: um mapa reinterpolado na Fertilidade
  // tem de aparecer aqui, e os grids antigos não ficam presos na memória.
  fertPorLaudo.clear();
  const seguro = <T extends GrupoCamadas>(p: Promise<T>, id: string, nome: string, vazio: string) =>
    p.catch(() => ({ id, nome, vazio, itens: [] } as GrupoCamadas));
  return Promise.all([
    seguro(grupoFertilidade(talhao, safra), 'fertilidade', 'Fertilidade', 'Não foi possível consultar os mapas de fertilidade.'),
    seguro(grupoNdvi(talhao), 'ndvi', 'NDVI e índices', 'Não foi possível consultar as cenas.'),
    Promise.resolve(grupoProdutividade(talhao)),
    seguro(grupoLinhas(talhao), 'linhas', 'Linhas (PrecisionFarm)', 'Não foi possível consultar as linhas.'),
    Promise.resolve(grupoZonas(talhao)),
    Promise.resolve(grupoPontosEContorno(talhao, safra)),
  ]);
}
