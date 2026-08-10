'use client';

// Carrega os mapas de fertilidade SALVOS NA NUVEM de um talhão+safra e monta as
// páginas (DadosRelatorioFert) para o Gerador de Relatórios. Fonte da verdade =
// nuvem (os mapas processados ficam persistidos lá).

import {
  getTalhoes, getFazendas, getClientes, getImportacoesLab, getGrades, getLegendas, getPlantio,
  getVariaveisAnalise, casasDecimaisVariavel,
} from './store';
import type { Legenda } from './legendas';
import { cloudCarregarMapasPorPrefixo } from './cloud';
import { descomprimirGrid, decodeGrid, extrairPoligono, type RespInterp } from './fertilidade';
import { colorirGridComLegenda, colorirGrid, temGrid } from './raster';
import { rampaVisualStops, ordenarLegendasDoAtributo } from './legendas';
import { resolverGradeDoLaudo, casarAmostrasComPontos } from './eloGrade';
import { ehAuxiliar20mPerdido } from './recomendacao/escolhaMapa';
import { carregarNdviSalvos } from './meap/gerar';
import { municipioDaFazenda } from './geocodeMunicipio';
import { centroideGeom } from './recomendacao/zonasGrid';
import type { Epoca } from './periodo';
import type { DadosRelatorioFert, ProfundidadeRel } from './relatorioFertilidade';

// Ponto representativo do talhão para o geocoding reverso do município.
export function pontoDoPoligono(
  p: GeoJSON.Polygon | GeoJSON.MultiPolygon | null,
): { lng: number; lat: number } | null {
  const c = p ? centroideGeom(p) : null;
  return c ? { lng: c[0], lat: c[1] } : null;
}

type MapaCarregado = { resp: RespInterp; labels: GeoJSON.FeatureCollection; interpoladoEm?: string };

export interface ElementoDisponivel { nut: string; atributo: string; simbolo: string; profundidades: string[]; ehIndice?: boolean }

export interface ContextoRelatorio {
  fazenda: string; produtor: string; talhao: string; safra: string; cultura: string;
  areaHa: number; municipio: string; estado: string;
  // Para o NOME DO ARQUIVO (lib/nomeExport): a sigla cadastrada da fazenda e o
  // PERÍODO do laudo (ano + época, derivados da Data de referência pelo store).
  siglaFazenda: string | null;
  ano: number | null;
  epoca: Epoca | null;
  // Laboratório que FEZ a análise — vem do laudo importado, não da legenda.
  // É ele que sai na coluna FONTE do quadro INTERPRETAÇÃO.
  laboratorio: string;
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  dataInterpolacao: string;
  elementos: ElementoDisponivel[];
  mapas: Record<string, MapaCarregado>;     // chave `${nut}__${prof}`
  legendaPorNut: Record<string, Legenda>;
  valoresDe: (nut: string, prof: string) => GeoJSON.FeatureCollection;
  pontosGrade: GeoJSON.FeatureCollection;   // pontos de amostragem com o Nº do ponto (p/ a capa)
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
  // MESMA regra da tela (eloGrade): a grade apontada pelo laudo quando tem
  // pontos; senão a grade com mais pontos do talhão/ano. Com o `find` estrito de
  // antes, um laudo apontando p/ grade esvaziada deixava a capa SEM o nº dos
  // pontos e os mapas SEM os valores — enquanto a tela mostrava os dois.
  const grade = importacao ? resolverGradeDoLaudo(getGrades(talhaoId, safra), importacao.gradeId) : null;
  if (importacao && !(grade?.pontos?.length ?? 0)) {
    console.warn('[relatorio] sem pontos de grade p/ o laudo', importacao.id, '— capa sai sem numeração e os valores caem nos rótulos salvos com o mapa.');
  }
  // Pontos de amostragem com o Nº DO PONTO — para o 1º mapa do relatório (capa).
  const pontosGrade: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: (grade?.pontos ?? []).map(p => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      properties: { txt: String(p.numero ?? p.ordem + 1) },
    })),
  };

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
      // Resto da v2.37: o raster auxiliar de 20 m da Recomendação chegou a ser
      // gravado NESTA gaveta e, sendo sempre o mais recente, sequestrava a
      // estatística do relatório (mín/máx encolhiam). A aba Fertilidade limpa
      // esses restos ao abrir — mas quem vai DIRETO ao relatório não passou por
      // lá, então o gerador também os ignora.
      if (ehAuxiliar20mPerdido(c.id, prefixo, dados)) continue;
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

  // valores da amostra por nut/prof (planilha → ponto da grade). Casamento pelo
  // nº da amostra, com fallback por ordem — o mesmo da tela (eloGrade).
  // ÚLTIMO RECURSO: os rótulos SALVOS junto com o mapa na hora da interpolação
  // (`labels`). É exatamente o que a tela faz quando o elo com a grade não
  // resolve; sem isso o PDF saía com o mapa "pelado" e a tela cheia de valores.
  function valoresDe(nut: string, prof: string): GeoJSON.FeatureCollection {
    const amostras = (importacao?.resultados ?? [])
      .filter(r => r.profundidade === prof && r.valores[nut] != null && isFinite(r.valores[nut]))
      .map(r => ({ numero: r.numero, valor: r.valores[nut] }));
    const pts = casarAmostrasComPontos(amostras, grade);
    if (!pts.length) return mapas[`${nut}__${prof}`]?.labels ?? { type: 'FeatureCollection', features: [] };
    // Casas do rótulo do ponto: config da variável (Preferências de Análise) tem
    // prioridade; senão pH/K = 1, demais 0 — igual ao mapa da tela (satk/satca/satmg=1).
    const casas = casasDecimaisVariavel(nut) ?? ((nut === 'ph' || nut === 'k') ? 1 : 0);
    return {
      type: 'FeatureCollection',
      features: pts.map(p => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
        properties: { txt: p.valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) },
      })),
    };
  }

  // elementos disponíveis = nuts com ≥1 mapa + legenda
  const nutsComMapa = [...new Set(Object.keys(mapas).map(k => k.split('__')[0]))];
  const elementos: ElementoDisponivel[] = [];
  for (const nut of nutsComMapa) {
    // Ordem canônica (padrão → sistema → nome): a MESMA legenda do mapa da tela —
    // não a "primeira do array" (ordem arbitrária do boot da nuvem).
    const leg = ordenarLegendasDoAtributo(legendas.filter(l => l.atributoId === nut))[0];
    if (!leg) continue;
    legendaPorNut[nut] = leg;
    const profs = [...new Set(Object.keys(mapas).filter(k => k.startsWith(`${nut}__`)).map(k => k.slice(nut.length + 2)))].sort();
    elementos.push({ nut, atributo: leg.atributo, simbolo: leg.simbolo, profundidades: profs });
  }
  // Ordem dos elementos no relatório = a ORDEM DO CATÁLOGO (Variáveis de Análise),
  // que o usuário controla com as setas no Perfil (Legendas por elemento). Fallback
  // = ORDEM fixa histórica p/ o que não estiver no catálogo.
  const ordemCat = new Map(getVariaveisAnalise().map(v => [v.id, v.ordem]));
  const chave = (nut: string) => ordemCat.get(nut) ?? (ORDEM.indexOf(nut) < 0 ? 999 : ORDEM.indexOf(nut));
  elementos.sort((a, b) => chave(a.nut) - chave(b.nut));

  // Índices vegetativos MANTIDOS (IV3): entram como capítulos extras no fim —
  // cada data vira um painel (no lugar da "profundidade"). Legenda = NDVI oficial.
  const legNdvi = ordenarLegendasDoAtributo(legendas.filter(l => l.atributoId === 'ndvi'))[0];
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
      // Índices vegetativos entram LOGO APÓS o 1º mapa (capa) — no INÍCIO da lista
      // de capítulos — e DESMARCADOS por padrão (ehIndice; o usuário marca se quiser).
      const ivs: ElementoDisponivel[] = [];
      for (const [nut, e] of porNut) {
        legendaPorNut[nut] = legNdvi;
        ivs.push({ nut, atributo: `Índice vegetativo — ${e.simbolo}`, simbolo: e.simbolo, profundidades: e.datas, ehIndice: true });
      }
      elementos.unshift(...ivs);
    } catch { /* índices são opcionais no relatório */ }
  }

  const dataInterpolacao = new Date(dataMaisRecente || importacao?.criadoEm || Date.now())
    .toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });

  // Município SEMPRE: cadastro → cache local → Nominatim (ver municipioDaFazenda).
  const local = await municipioDaFazenda(fazenda?.id, pontoDoPoligono(poligono));

  return {
    fazenda: fazenda?.nome ?? '', produtor: cliente?.nome ?? '', talhao: talhao?.nome ?? '', safra,
    cultura: getPlantio(talhaoId, safra), areaHa: talhao?.areaHa ?? 0,
    municipio: local.municipio, estado: local.estado,
    siglaFazenda: fazenda?.sigla ?? null,
    ano: importacao?.ano ?? null, epoca: importacao?.epoca ?? null,
    laboratorio: importacao?.laboratorio ?? '',
    poligono, dataInterpolacao, elementos, mapas, legendaPorNut, valoresDe, pontosGrade,
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
      siglaFazenda: ctx.siglaFazenda, ano: ctx.ano, epoca: ctx.epoca,
      // FONTE = o LABORATÓRIO que fez a análise, e o LAUDO GANHA SEMPRE. A fonte
      // da legenda só entra quando não há laudo por trás do mapa — ela vem fixa
      // do seed ("Fundação ABC" em toda legenda do conjunto ABC), então trocar de
      // laboratório não mudava nada no PDF.
      atributo: leg.atributo, simbolo: leg.simbolo, metodo: leg.metodo ?? null,
      fonte: ctx.laboratorio || leg.fonte, unidade: leg.unidade,
      legenda: leg, dataInterpolacao: ctx.dataInterpolacao, poligono: ctx.poligono,
      profundidades, satelite: config.satelite, corLimite: '#ffffff', logoClienteUrl: config.logoClienteUrl ?? null,
      pontosGrade: ctx.pontosGrade,
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
