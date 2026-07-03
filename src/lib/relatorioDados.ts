'use client';

// Carrega os mapas de fertilidade SALVOS NA NUVEM de um talhão+safra e monta as
// páginas (DadosRelatorioFert) para o Gerador de Relatórios. Fonte da verdade =
// nuvem (os mapas processados ficam persistidos lá).

import {
  getTalhoes, getFazendas, getClientes, getImportacoesLab, getGrades, getLegendas, getPlantio,
} from './store';
import type { Legenda } from './legendas';
import { cloudCarregarMapasPorPrefixo } from './cloud';
import { descomprimirGrid, decodeGrid, extrairPoligono, type RespInterp } from './fertilidade';
import { colorirGridComLegenda, colorirGrid, temGrid } from './raster';
import { rampaVisualStops } from './legendas';
import { carregarNdviSalvos } from './meap/gerar';
import type { DadosRelatorioFert, ProfundidadeRel } from './relatorioFertilidade';

type MapaCarregado = { resp: RespInterp; labels: GeoJSON.FeatureCollection; interpoladoEm?: string };

export interface ElementoDisponivel { nut: string; atributo: string; simbolo: string; profundidades: string[]; }

export interface ContextoRelatorio {
  fazenda: string; produtor: string; talhao: string; safra: string; cultura: string;
  areaHa: number; municipio: string; estado: string;
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  dataInterpolacao: string;
  elementos: ElementoDisponivel[];
  mapas: Record<string, MapaCarregado>;     // chave `${nut}__${prof}`
  legendaPorNut: Record<string, Legenda>;
  valoresDe: (nut: string, prof: string) => GeoJSON.FeatureCollection;
}

// Ordem padrão de capítulos de fertilidade (spec).
const ORDEM = ['mo', 'ph', 'm', 'v', 'ctc', 'p', 'k', 'ca', 'mg', 'b', 'mn', 'cu', 'fe', 'zn', 'al'];

function statsRaster(resp: RespInterp): { min: number; media: number; max: number } | null {
  if (resp.grid) {
    try {
      const { valores } = decodeGrid(resp.grid);
      let n = 0, soma = 0, mn = Infinity, mx = -Infinity;
      for (let i = 0; i < valores.length; i++) { const v = valores[i]; if (!isFinite(v)) continue; n++; soma += v; if (v < mn) mn = v; if (v > mx) mx = v; }
      if (n) return { min: mn, media: soma / n, max: mx };
    } catch { /* fallback */ }
  }
  const st = resp.stats;
  if (st && st.min != null && st.max != null) return { min: st.min, media: (st.min + st.max) / 2, max: st.max };
  return null;
}

export async function carregarContextoRelatorio(
  talhaoId: string, safra: string,
  poligonoFallback?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null,
): Promise<ContextoRelatorio> {
  const talhao = getTalhoes().find(t => t.id === talhaoId) ?? null;
  const fazenda = talhao ? getFazendas().find(f => f.id === talhao.fazendaId) ?? null : null;
  const cliente = fazenda ? getClientes().find(c => c.id === fazenda.clienteId) ?? null : null;
  // Polígono: tenta o salvo no talhão; se falhar, usa o fallback (geometria que o
  // mapa já está usando — uploadedGeo). Sem polígono, montarPaginas pula tudo.
  let poligono = talhao?.geojson ? (() => { try { return extrairPoligono(JSON.parse(talhao.geojson!)); } catch { return null; } })() : null;
  if (!poligono) poligono = poligonoFallback ?? null;

  const importacoes = getImportacoesLab(talhaoId, safra).sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? ''));
  const importacao = importacoes[0] ?? null;
  const grade = importacao ? getGrades(talhaoId, safra).find(g => g.id === importacao.gradeId) ?? null : null;
  const pontoPorNumero = new Map<number, { lng: number; lat: number }>();
  (grade?.pontos ?? []).forEach(p => pontoPorNumero.set(p.numero ?? p.ordem + 1, { lng: p.lng, lat: p.lat }));

  const legendas = getLegendas();
  const legendaPorNut: Record<string, Legenda> = {};
  const mapas: Record<string, MapaCarregado> = {};
  let dataMaisRecente = '';

  if (importacao) {
    const prefixo = `${talhaoId}__${importacao.id}__`;
    const carregados = await cloudCarregarMapasPorPrefixo<MapaCarregado>(prefixo);
    for (const c of carregados) {
      const partes = c.id.slice(prefixo.length).split('__');
      if (partes.length < 2) continue;
      const nut = partes[partes.length - 2];
      const prof = partes[partes.length - 1];
      const dados = c.dados;
      const chave = `${nut}__${prof}`;
      // Pode haver MAIS DE UM doc para o mesmo nut/prof (configs/método diferentes,
      // ex.: um antigo VAZIO + um novo com grid). Desempata: mapa COM dados ganha
      // de VAZIO; entre iguais, o mais recente (interpoladoEm). Sem isso, o gerador
      // pegava o último por ordem de id — às vezes o VAZIO ("mapas sem dados").
      const temDados = (m?: MapaCarregado) => !!(m?.resp?.grid?.b64 || m?.resp?.png);
      const atual = mapas[chave];
      if (atual) {
        const trocar = (temDados(dados) && !temDados(atual)) ||
          (temDados(dados) === temDados(atual) && (dados.interpoladoEm ?? '') > (atual.interpoladoEm ?? ''));
        if (!trocar) continue;
      }
      if (dados.resp?.grid?.comp === 'gz') {
        try { dados.resp.grid = await descomprimirGrid(dados.resp.grid); } catch { /* segue */ }
      }
      mapas[chave] = dados;
      if ((dados.interpoladoEm ?? '') > dataMaisRecente) dataMaisRecente = dados.interpoladoEm ?? '';
    }
  }

  // valores da amostra por nut/prof (planilha → ponto da grade)
  function valoresDe(nut: string, prof: string): GeoJSON.FeatureCollection {
    const feats: GeoJSON.Feature[] = [];
    for (const r of importacao?.resultados ?? []) {
      if (r.profundidade !== prof) continue;
      const v = r.valores[nut];
      if (v == null || !isFinite(v)) continue;
      const pt = pontoPorNumero.get(r.numero);
      const casas = (nut === 'ph' || nut === 'k') ? 1 : 0; // pH e K com 1 casa; demais inteiros
      if (pt) feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [pt.lng, pt.lat] }, properties: { txt: v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) } });
    }
    return { type: 'FeatureCollection', features: feats };
  }

  // elementos disponíveis = nuts com ≥1 mapa + legenda
  const nutsComMapa = [...new Set(Object.keys(mapas).map(k => k.split('__')[0]))];
  const elementos: ElementoDisponivel[] = [];
  for (const nut of nutsComMapa) {
    const leg = legendas.find(l => l.atributoId === nut);
    if (!leg) continue;
    legendaPorNut[nut] = leg;
    const profs = [...new Set(Object.keys(mapas).filter(k => k.startsWith(`${nut}__`)).map(k => k.slice(nut.length + 2)))].sort();
    elementos.push({ nut, atributo: leg.atributo, simbolo: leg.simbolo, profundidades: profs });
  }
  elementos.sort((a, b) => {
    const ia = ORDEM.indexOf(a.nut), ib = ORDEM.indexOf(b.nut);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  // Índices vegetativos MANTIDOS (IV3): entram como capítulos extras no fim —
  // cada data vira um painel (no lugar da "profundidade"). Legenda = NDVI oficial.
  const legNdvi = legendas.find(l => l.atributoId === 'ndvi');
  if (legNdvi) {
    try {
      const ddmmaa = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
      const nd = await carregarNdviSalvos(talhaoId);
      const porNut = new Map<string, { simbolo: string; datas: string[] }>();
      for (const n of nd) {
        const fonteLabel = n.nut.startsWith('ndvi_cbers') ? 'CBERS-4A' : 'Sentinel-2';
        const rot = ddmmaa(n.data);
        mapas[`${n.nut}__${rot}`] = {
          resp: { bounds: n.bounds, grid: { b64: n.b64, shape: n.shape } } as RespInterp,
          labels: { type: 'FeatureCollection', features: [] },
        };
        const e = porNut.get(n.nut) ?? { simbolo: `${n.indice} ${fonteLabel}`, datas: [] };
        if (!e.datas.includes(rot)) e.datas.push(rot);
        porNut.set(n.nut, e);
      }
      for (const [nut, e] of porNut) {
        legendaPorNut[nut] = legNdvi;
        elementos.push({ nut, atributo: `Índice vegetativo — ${e.simbolo}`, simbolo: e.simbolo, profundidades: e.datas });
      }
    } catch { /* índices são opcionais no relatório */ }
  }

  const dataInterpolacao = new Date(dataMaisRecente || importacao?.criadoEm || Date.now())
    .toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });

  return {
    fazenda: fazenda?.nome ?? '', produtor: cliente?.nome ?? '', talhao: talhao?.nome ?? '', safra,
    cultura: getPlantio(talhaoId, safra), areaHa: talhao?.areaHa ?? 0,
    municipio: fazenda?.municipio ?? '', estado: fazenda?.estado ?? '',
    poligono, dataInterpolacao, elementos, mapas, legendaPorNut, valoresDe,
  };
}

export interface ConfigRelatorio { satelite: boolean; valores: boolean; logoClienteUrl?: string | null; }

export function montarPaginas(ctx: ContextoRelatorio, nutsSelecionados: string[], config: ConfigRelatorio): DadosRelatorioFert[] {
  const vazio: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  const paginas: DadosRelatorioFert[] = [];

  for (const nut of nutsSelecionados) {
    const leg = ctx.legendaPorNut[nut];
    const el = ctx.elementos.find(e => e.nut === nut);
    if (!leg || !el || !ctx.poligono) continue;

    const profundidades: ProfundidadeRel[] = [];
    for (const prof of el.profundidades) {
      const m = ctx.mapas[`${nut}__${prof}`];
      if (!m) continue;
      const st = statsRaster(m.resp);
      if (!st) continue;
      // Índices satelitais que não são NDVI variam de faixa por cena → render
      // contínuo esticado min–máx (igual à tela); NDVI e fertilidade usam a legenda.
      const indiceNaoNdvi = nut.startsWith('ndvi_') && !nut.endsWith('_ndvi');
      let url: string | undefined;
      if (temGrid(m.resp)) {
        url = indiceNaoNdvi
          ? colorirGrid(m.resp.grid, [st.min, st.max], rampaVisualStops({ ...leg, estilo: 'continuo' })).dataUrl
          : colorirGridComLegenda(m.resp.grid, leg).dataUrl;
      } else url = m.resp.png;
      if (!url) continue;
      profundidades.push({
        profundidade: prof, rasterPng: url, bounds: m.resp.bounds,
        valores: config.valores ? ctx.valoresDe(nut, prof) : vazio, stats: st,
      });
    }
    if (profundidades.length === 0) continue;

    paginas.push({
      fazenda: ctx.fazenda, produtor: ctx.produtor, talhao: ctx.talhao, safra: ctx.safra,
      cultura: ctx.cultura, areaHa: ctx.areaHa, municipio: ctx.municipio, estado: ctx.estado,
      atributo: leg.atributo, simbolo: leg.simbolo, metodo: leg.metodo ?? null, fonte: leg.fonte, unidade: leg.unidade,
      legenda: leg, dataInterpolacao: ctx.dataInterpolacao, poligono: ctx.poligono,
      profundidades, satelite: config.satelite, corLimite: '#ffffff', logoClienteUrl: config.logoClienteUrl ?? null,
    });
  }
  if (paginas.length === 0) {
    console.warn('[relatorio] montarPaginas vazio — poligono?', !!ctx.poligono, '| nuts=', nutsSelecionados,
      '| detalhe=', nutsSelecionados.map(nut => {
        const el = ctx.elementos.find(e => e.nut === nut);
        return { nut, temLeg: !!ctx.legendaPorNut[nut], temEl: !!el,
          profs: (el?.profundidades ?? []).map(p => { const m = ctx.mapas[`${nut}__${p}`]; return { p, mapa: !!m, grid: !!m?.resp?.grid, png: !!m?.resp?.png, stats: !!m?.resp?.stats }; }) };
      }));
  }
  return paginas;
}
