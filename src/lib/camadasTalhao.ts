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
import { corCheiaDaClasse, rampaVisualStops, type Legenda } from '@/lib/legendas';
import { faixaPercentis } from '@/lib/quantis';
import { legendaDesignada, PREF_LEGENDA } from '@/lib/legendaDesignada';
import { legendaDaCultura } from '@/lib/produtividade';
import { legendaPadraoDe } from '@/lib/processarFertilidade';
import { ehAuxiliar20mPerdido } from '@/lib/recomendacao/escolhaMapa';
import { faixaDoLaudo, limitarRespAFaixa } from '@/lib/faixaAmostras';
import { carregarGridNdvi, listarNdviSalvos } from '@/lib/meap/gerar';
import { camadasVisiveisPF, estadoLinhasPF, geometriaLinhasPF } from '@/lib/precisionfarm/cliente';
import { featuresParaMapa } from '@/lib/meap/zonasParaMapa';

/** Legenda de UMA camada, já resolvida no `carregar` — é o que o relatório PDF
 *  (lib/relatorioCamadas) desenha ao lado do mapa. Dois formatos:
 *   - 'classes': faixas/categorias com uma cor chapada cada (fertilidade,
 *     produtividade, zonas, linhas, pontos, contorno). `forma` só muda o
 *     desenho da amostra (área cheia, traço, bolinha); ausente = área.
 *   - 'rampa': gradiente contínuo (NDVI e índices). `stops` são posições 0..1
 *     da MESMA rampa que coloriu o PNG; `min`/`max` = o domínio de valor que
 *     ocupou essas pontas (0–1 no NDVI, p2–p98 nos demais índices).
 *  A cor sai da mesma legenda que pintou o raster: o que o PDF mostra na
 *  legenda é exatamente o que está no mapa. */
export type LegendaCamada =
  | { tipo: 'classes'; itens: { cor: string; rotulo: string; forma?: 'area' | 'linha' | 'ponto' }[]; unidade?: string }
  | { tipo: 'rampa'; stops: Array<[number, [number, number, number]]>; min: number; max: number; unidade?: string };

/** O que `carregar` devolve: a camada sem a opacidade (quem dá é a pilha). */
export type DesenhoCamada =
  | { id: string; tipo: 'raster'; url: string; coordinates: Extract<CamadaMapa, { tipo: 'raster' }>['coordinates']; legenda?: LegendaCamada }
  | { id: string; tipo: 'vetor'; estilo: EstiloCamadaVetor; geojson: GeoJSON.FeatureCollection; legenda?: LegendaCamada };

export interface ItemCamada {
  id: string;
  grupo: string;
  /** Aba de onde o dado vem (id do trilho). Quem não pode ver a aba não vê a
   *  camada. Ausente = sempre liberada (o contorno do talhão). */
  origem?: string;
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

// ── Legendas ────────────────────────────────────────────────────────────────
// Casas decimais da faixa: as do limite mais "quebrado" da legenda (máx. 2).
// Legenda de P com limites 6/12/24 sai "6 – 12"; a de pH 5,0/5,5 sai "5,0 – 5,5"
// — nunca "6,00 – 12,00", que só polui a coluna estreita do PDF.
function casasDaLegenda(leg: Legenda): number {
  let casas = 0;
  for (const c of leg.classes) {
    for (const v of [c.valorMin, c.valorMax]) {
      if (v == null || !isFinite(v)) continue;
      const frac = String(v).split('.')[1]?.length ?? 0;
      casas = Math.max(casas, Math.min(2, frac));
    }
  }
  return casas;
}
const fmtFaixa = (v: number, casas: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** Classes da legenda (as mesmas que coloriram o raster) → legenda do PDF.
 *  Texto só em Latin-1 ("<=", " - "): a fonte padrão do jsPDF não tem "≤" nem
 *  o travessão, e eles sairiam como lixo no PDF.
 *  Escala RELATIVA (mín–máx / quantil do próprio mapa) não tem limite fixo de
 *  valor: sai só o nome da classe, para a legenda não mentir uma faixa que o
 *  mapa não usou. */
function legendaDeClasses(leg: Legenda): LegendaCamada {
  const casas = casasDaLegenda(leg);
  const relativa = !!leg.escalaRelativa;
  const itens = [...leg.classes].sort((a, b) => a.ordem - b.ordem).map(c => {
    let faixa = '';
    if (!relativa) {
      if (c.valorMin == null && c.valorMax != null) faixa = `<= ${fmtFaixa(c.valorMax, casas)}`;
      else if (c.valorMax == null && c.valorMin != null) faixa = `> ${fmtFaixa(c.valorMin, casas)}`;
      else if (c.valorMin != null && c.valorMax != null) faixa = `${fmtFaixa(c.valorMin, casas)} - ${fmtFaixa(c.valorMax, casas)}`;
    }
    return { cor: corCheiaDaClasse(c), rotulo: faixa ? `${c.nome} (${faixa})` : c.nome };
  });
  const unidade = [leg.unidade, relativa ? 'escala relativa ao talhão' : ''].filter(Boolean).join(' · ') || undefined;
  return { tipo: 'classes', itens, unidade };
}

/** Zonas: uma linha por zona distinta (cor + rótulo da feição, que é o que o
 *  mapa escreve dentro da mancha), em ordem numérica. */
function legendaDeZonas(fc: GeoJSON.FeatureCollection): LegendaCamada {
  const vistos = new Map<string, { cor: string; rotulo: string }>();
  for (const f of fc.features) {
    const p = (f.properties ?? {}) as { cor?: string; rotulo?: string | number; classeLabel?: string };
    const r = p.rotulo != null ? String(p.rotulo) : '';
    const chave = `${r}|${p.cor ?? ''}`;
    if (vistos.has(chave)) continue;
    const nome = r ? (/^\d+$/.test(r) ? `Zona ${r}` : r) : 'Zona';
    vistos.set(chave, { cor: p.cor ?? '#64748b', rotulo: p.classeLabel ? `${nome} · ${p.classeLabel}` : nome });
  }
  const itens = [...vistos.values()].sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR', { numeric: true }));
  return { tipo: 'classes', itens };
}

/** Linhas PF: só os tipos que existem nesta revisão (há entrega só de guias). */
function legendaDeLinhas(fc: GeoJSON.FeatureCollection): LegendaCamada {
  const kinds = new Set(fc.features.map(f => (f.properties as { kind?: string } | null)?.kind === 'headland' ? 'h' : 'g'));
  const itens: { cor: string; rotulo: string; forma: 'linha' }[] = [];
  if (kinds.has('h')) itens.push({ cor: '#fb923c', rotulo: 'Bordadura (cabeceira)', forma: 'linha' });
  if (kinds.has('g')) itens.push({ cor: '#22d3ee', rotulo: 'Linhas-guia', forma: 'linha' });
  return { tipo: 'classes', itens };
}

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

// TODAS as safras (pedido do usuário): comparar o P de 24/25 com o de 26/27 é
// justamente o uso da pilha. O ano do cabeçalho não filtra; cada item diz a
// safra do laudo. Laudo mais recente primeiro.
async function grupoFertilidade(talhao: Talhao): Promise<GrupoCamadas> {
  const legendas = getLegendas();
  const laudos = [...getImportacoesLab(talhao.id)]
    .sort((a, b) => (b.dataReferencia ?? b.criadoEm ?? '').localeCompare(a.dataReferencia ?? a.criadoEm ?? ''));
  // Uma consulta leve (só metadados) por laudo, em paralelo.
  const metas = await Promise.all(laudos.map(imp => cloudListarMapasMeta(`${talhao.id}__${imp.id}__`).catch(() => [])));
  const itens: ItemCamada[] = [];
  for (const [n, imp] of laudos.entries()) {
    const prefixo = `${talhao.id}__${imp.id}__`;
    const chaves = new Set<string>();
    for (const m of metas[n]) {
      const partes = m.id.slice(prefixo.length).split('__');
      if (partes.length >= 2) chaves.add(partes.slice(-2).join('__'));
    }
    // Safra sempre; a data só quando a safra tem mais de um laudo.
    const mesmaSafra = laudos.filter(l => l.safra === imp.safra).length > 1;
    const sufixoLaudo = [imp.safra, mesmaSafra ? dataBr(imp.dataReferencia ?? imp.criadoEm) : ''].filter(Boolean).join(' · ') || undefined;
    for (const chave of [...chaves].sort()) {
      const [nut, prof] = chave.split('__');
      const leg = legendaPadraoDe(legendas, nut);
      if (!leg) continue;
      itens.push({
        id: `fert:${imp.id}:${chave}`,
        grupo: 'Fertilidade', origem: 'fertilidade',
        nome: `${leg.simbolo ?? nut} · ${prof} cm`,
        detalhe: sufixoLaudo,
        cor: (() => { const c = leg.classes?.[Math.floor((leg.classes.length - 1) / 2)]; return c?.corInicio ?? c?.corBase ?? '#a3e635'; })(),
        carregar: async () => {
          const r = (await mapasDoLaudo(talhao.id, imp))[chave];
          if (!r?.resp?.bounds) return null;
          let url: string | undefined;
          if (temGrid(r.resp)) { try { url = colorirGridComLegenda(r.resp.grid, leg).dataUrl; } catch { /* PNG */ } }
          if (!url && r.resp.png) url = r.resp.png;
          // Legenda = a mesma `leg` que pintou o grid. No PNG legado (sem grid)
          // a cor veio do backend com essa mesma legenda padrão do atributo.
          return url ? { id: `fert:${imp.id}:${chave}`, tipo: 'raster', url, coordinates: coordsFromBounds(r.resp.bounds), legenda: legendaDeClasses(leg) } : null;
        },
      });
    }
  }
  return { id: 'fertilidade', nome: 'Fertilidade', vazio: 'Nenhum mapa de fertilidade gerado neste talhão.', itens };
}

// ── NDVI / índices ──────────────────────────────────────────────────────────
async function grupoNdvi(talhao: Talhao): Promise<GrupoCamadas> {
  // `true` = TODAS as cenas salvas, como a própria aba NDVI lista. Sem ele vale o
  // filtro de "fontes de análise" das Zonas, que pode descartar todas (talhão
  // com cenas salvas aparecia aqui como "nenhuma cena").
  const metas = (await listarNdviSalvos(talhao.id, true).catch(() => []))
    .sort((a, b) => b.data.localeCompare(a.data) || a.indice.localeCompare(b.indice));
  const leg = legendaDesignada('ndvi', PREF_LEGENDA.ndvi);
  const itens: ItemCamada[] = metas.map(m => ({
    id: `ndvi:${m.itemId}`,
    grupo: 'NDVI', origem: 'ndvi',
    nome: `${m.indice} · ${dataBr(m.data)}`,
    detalhe: m.media != null ? `méd. ${m.media.toFixed(2)}` : undefined,
    cor: '#22c55e',
    carregar: async () => {
      if (!leg) return null;
      const grid = await carregarGridNdvi(m);
      if (!grid?.b64) return null;
      // Domínio igual ao da aba sem contraste: NDVI fixo 0–1, os demais p2–p98.
      const dominio: [number, number] = m.indice === 'NDVI' ? [0, 1] : faixaPercentis(decodeGrid(grid).valores, 2, 98);
      const stops = rampaVisualStops({ ...leg, estilo: 'continuo' });
      const url = colorirGrid(grid, dominio, stops).dataUrl;
      // Legenda em rampa: os MESMOS stops e o MESMO domínio que coloriram o PNG.
      return { id: `ndvi:${m.itemId}`, tipo: 'raster', url, coordinates: coordsFromBounds(m.bounds),
        legenda: { tipo: 'rampa', stops, min: dominio[0], max: dominio[1], unidade: m.indice } };
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
    grupo: 'Produtividade', origem: 'produtividade',
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
      return { id: `prod:${rec.id}`, tipo: 'raster', url: colorirGridComLegenda(grid, leg).dataUrl, coordinates: coordsFromBounds(resp.bounds), legenda: legendaDeClasses(leg) };
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
    grupo: 'Linhas', origem: 'linhas',
    nome: c.nome || c.integrationName || 'Linhas',
    detalhe: `rev. ${c.revisaoGeometria}`,
    cor: '#22d3ee',
    carregar: async () => {
      const g = await geometriaLinhasPF(talhao.id, c.resourceId, c.revisaoGeometria!);
      if (!g.ok) throw new Error(g.erro);
      return { id: `pf:${c.resourceId}`, tipo: 'vetor', estilo: 'linhas-pf', geojson: g.geometria, legenda: legendaDeLinhas(g.geometria) };
    },
  }));
  return { id: 'linhas', nome: 'Linhas (PrecisionFarm)', vazio: r && !r.ok ? 'Não foi possível consultar as linhas agora.' : 'Nenhuma linha recebida da PrecisionFarm.', itens };
}

// ── Zonas, pontos e contorno (store local) ──────────────────────────────────
const vetor = (id: string, estilo: EstiloCamadaVetor, geojson: GeoJSON.FeatureCollection, legenda?: LegendaCamada): DesenhoCamada =>
  ({ id, tipo: 'vetor', estilo, geojson, legenda });
const comZonas = (id: string, fc: GeoJSON.FeatureCollection): DesenhoCamada => {
  const fz = fcZonas(fc);
  return vetor(id, 'zonas', fz, legendaDeZonas(fz));
};

// Mesma cor e rótulo da aba Zonas (lib/meap/zonasParaMapa).
const fcZonas = featuresParaMapa;

function grupoZonas(talhao: Talhao): GrupoCamadas {
  const zs = getZoneamentosMeap(talhao.id).filter(z => z.fc?.features?.length);
  const itens: ItemCamada[] = zs.map(z => ({
    id: `zonas:${z.id}`,
    grupo: 'Zonas', origem: 'zonas',
    nome: z.nome || 'Zoneamento',
    detalhe: z.padrao ? 'padrão' : undefined,
    cor: '#84cc16',
    opacidadePadrao: 0.6,
    carregar: async () => comZonas(`zonas:${z.id}`, z.fc),
  }));
  // Talhão sem zoneamento salvo, mas com as zonas gravadas no cadastro.
  if (!itens.length && talhao.zonasGeojson) {
    try {
      const fc = JSON.parse(talhao.zonasGeojson) as GeoJSON.FeatureCollection;
      if (fc?.features?.length) {
        itens.push({ id: 'zonas:cadastro', grupo: 'Zonas', origem: 'zonas', nome: 'Zonas do cadastro', cor: '#84cc16', opacidadePadrao: 0.6,
          carregar: async () => comZonas('zonas:cadastro', fc) });
      }
    } catch { /* zonas inválidas: fica sem */ }
  }
  return { id: 'zonas', nome: 'Zonas de manejo', vazio: 'Nenhum zoneamento salvo.', itens };
}

function grupoPontosEContorno(talhao: Talhao): GrupoCamadas {
  const itens: ItemCamada[] = [];
  if (talhao.geojson) {
    itens.push({
      id: 'contorno', grupo: 'Talhão', nome: 'Contorno do talhão', cor: '#fde68a',
      carregar: async () => vetor('contorno', 'contorno', JSON.parse(talhao.geojson!) as GeoJSON.FeatureCollection,
        { tipo: 'classes', itens: [{ cor: '#fde68a', rotulo: 'Limite do talhão', forma: 'linha' }] }),
    });
  }
  // Grades de todas as safras, como a fertilidade; a safra vai no detalhe.
  const grades = [...getGrades(talhao.id)].sort((a, b) => (b.safra ?? '').localeCompare(a.safra ?? ''));
  for (const g of grades) {
    if (!g.pontos?.length) continue;
    itens.push({
      id: `pontos:${g.id}`, grupo: 'Amostragem', origem: 'amostragem', nome: g.nome || 'Grade', detalhe: `${g.safra} · ${g.pontos.length} pts`, cor: '#facc15',
      carregar: async () => vetor(`pontos:${g.id}`, 'pontos', {
        type: 'FeatureCollection',
        features: g.pontos.map(p => ({
          type: 'Feature', properties: { ordem: p.ordem, label: String(p.ordem + 1) },
          geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        })),
      }, { tipo: 'classes', itens: [{ cor: '#facc15', rotulo: `Pontos de amostragem (${g.pontos.length})`, forma: 'ponto' }] }),
    });
  }
  return { id: 'base', nome: 'Contorno e pontos de amostragem', vazio: 'Sem contorno nem grade.', itens };
}

/** Todos os grupos da aba, na ordem da tela. Grupo cuja consulta falhou vem
 *  vazio. `liberada(aba)` diz se quem está vendo pode ver a aba de origem:
 *  grupo bloqueado nem é consultado (some da tela), e item bloqueado sai. */
export async function listarFontesCamadas(
  talhao: Talhao, liberada: (aba: string) => boolean = () => true,
): Promise<GrupoCamadas[]> {
  // Cada abertura da aba relê a nuvem: um mapa reinterpolado na Fertilidade
  // tem de aparecer aqui, e os grids antigos não ficam presos na memória.
  fertPorLaudo.clear();
  const seguro = (aba: string, f: () => Promise<GrupoCamadas> | GrupoCamadas, id: string, nome: string, vazio: string): Promise<GrupoCamadas | null> =>
    !aba || liberada(aba)
      ? Promise.resolve().then(f).catch(() => ({ id, nome, vazio, itens: [] }))
      : Promise.resolve(null);
  const grupos = await Promise.all([
    seguro('fertilidade', () => grupoFertilidade(talhao), 'fertilidade', 'Fertilidade', 'Não foi possível consultar os mapas de fertilidade.'),
    seguro('ndvi', () => grupoNdvi(talhao), 'ndvi', 'NDVI e índices', 'Não foi possível consultar as cenas.'),
    seguro('produtividade', () => grupoProdutividade(talhao), 'produtividade', 'Produtividade (colheita)', 'Não foi possível ler os mapas de colheita.'),
    seguro('linhas', () => grupoLinhas(talhao), 'linhas', 'Linhas (PrecisionFarm)', 'Não foi possível consultar as linhas.'),
    seguro('zonas', () => grupoZonas(talhao), 'zonas', 'Zonas de manejo', 'Não foi possível ler os zoneamentos.'),
    // Contorno sempre; os pontos dentro dele seguem a Amostragem (filtro por item).
    seguro('', () => grupoPontosEContorno(talhao), 'base', 'Contorno e pontos de amostragem', 'Sem contorno.'),
  ]);
  return grupos
    .filter((g): g is GrupoCamadas => g !== null)
    .map(g => ({ ...g, itens: g.itens.filter(i => !i.origem || liberada(i.origem)) }));
}
