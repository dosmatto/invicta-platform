'use client';

// Coleta, para o Painel do Produtor, tudo que a plataforma guarda por talhão —
// primeiro o que está no aparelho (síncrono, pinta na hora), depois o que só
// existe na nuvem (mapas de fertilidade e satélite, cenários, relatórios), que
// chega e completa a tela. A REGRA do que está pronto fica em
// lib/portalProdutor.ts (puro, testado em node) — aqui é só coleta.

import {
  getGrades, getImportacoesLab, getZoneamentosMeap, getPrescricoes, getMapasProdutividade,
  getComposicoes, getMdes, getCondutividade, getImportacoesCompactacao, getPlantio,
  getAmostrasFoliares,
  type Talhao,
} from './store';
import { cloudListarMapasMeta } from './cloud';
import { usarDadosSupabase, projetarDocsPorCampoSupabase } from './supabaseData';
import type { DadosTalhao, CenarioIn, RelatorioIn } from './portalProdutor';
import type { DadosPainel, ZonaFeicaoPainel, MapaNuvemPainel } from './portalPainel';

/** O que o aparelho já tem do talhão (todas as safras — o filtro de ano é da regra). */
export function dadosLocaisDoTalhao(t: Talhao, safra: string): DadosTalhao {
  return {
    talhao: { id: t.id, fazendaId: t.fazendaId, nome: t.nome, areaHa: t.areaHa, status: t.status, geojson: t.geojson },
    cultura: safra ? getPlantio(t.id, safra) : '',
    grades: getGrades(t.id),
    laudos: getImportacoesLab(t.id),
    zoneamentos: getZoneamentosMeap(t.id),
    prescricoes: getPrescricoes(t.id),
    colheitas: getMapasProdutividade(t.id),
    composicoes: getComposicoes(t.id),
    mdes: getMdes(t.id),
    condutividade: getCondutividade(t.id),
    compactacao: getImportacoesCompactacao(t.id),
    amostrasFoliares: getAmostrasFoliares(t.id),
  };
}

/** Zonas do padrão vigente lidas do ESPELHO do cadastro (`talhao.zonasGeojson`,
 *  props classe/areaHa/zona/cor). Nunca getZoneamentosMeap: ele grava (repara
 *  padrões duplicados e atualiza o talhão) — chamá-lo para cada talhão do
 *  portal seria escrita em laço numa tela somente leitura. */
export function zonasDoCadastro(t: Talhao): ZonaFeicaoPainel[] {
  if (!t.zonasGeojson) return [];
  try {
    const fc = JSON.parse(t.zonasGeojson) as { features?: Array<{ geometry?: { type?: string } | null; properties?: Record<string, unknown> | null }> };
    return (fc.features ?? [])
      .filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
      .map(f => {
        const p = f.properties ?? {};
        const area = Number(p.areaHa ?? p.area_ha ?? p.area);
        return {
          classe: String(p.classe ?? p.class ?? ''),
          areaHa: Number.isFinite(area) ? area : 0,
          zona: (p.zona ?? p.id ?? null) as string | number | null,
          cor: typeof p.cor === 'string' ? p.cor : null,
        };
      });
  } catch { return []; }
}

/** O que o aparelho tem do talhão, para o Portal v2 (DadosPainel = DadosTalhao
 *  com os registros completos do store). Igual a dadosLocaisDoTalhao, MAS as
 *  zonas vêm do cadastro (zonasDoCadastro) — seguro para chamar em laço. */
export function dadosLocaisPortal(t: Talhao, safra: string): DadosPainel {
  const zonasFc = zonasDoCadastro(t);
  const nZonas = new Set(zonasFc.map(z => String(z.zona ?? z.classe))).size;
  return {
    talhao: { id: t.id, fazendaId: t.fazendaId, nome: t.nome, areaHa: t.areaHa, status: t.status, geojson: t.geojson },
    cultura: safra ? getPlantio(t.id, safra) : '',
    grades: getGrades(t.id),
    laudos: getImportacoesLab(t.id),
    zoneamentos: zonasFc.length ? [{ padrao: true, criadoEm: t.criadoEm, meta: { nZonas } }] : [],
    zonasFc,
    prescricoes: getPrescricoes(t.id),
    colheitas: getMapasProdutividade(t.id),
    composicoes: getComposicoes(t.id),
    mdes: getMdes(t.id),
    condutividade: getCondutividade(t.id),
    compactacao: getImportacoesCompactacao(t.id),
    amostrasFoliares: getAmostrasFoliares(t.id),
  };
}

export type FalhaNuvem = 'mapas' | 'cenarios' | 'relatorios';

export interface DadosNuvem {
  mapasNuvem: Record<string, MapaNuvemPainel[]>;
  cenarios: Record<string, CenarioIn[]>;
  relatorios: Record<string, RelatorioIn[]>;
  /** Consultas que FALHARAM (erro da nuvem — não "vieram vazias"). Quem lê
   *  decide: o trilho do talhão não esconde a aba por causa disso. */
  falhas?: FalhaNuvem[];
}

const NUVEM_VAZIA = (): DadosNuvem => ({ mapasNuvem: {}, cenarios: {}, relatorios: {} });

/** Listagens LEVES da nuvem (sem raster, sem grid): uma por talhão para os
 *  mapas, uma só para todos os cenários e uma para os relatórios. Sem nuvem
 *  (bancada local) devolve vazio — a tela mostra o que o aparelho tem. */
export async function dadosNuvemDosTalhoes(ids: string[]): Promise<DadosNuvem> {
  const out = NUVEM_VAZIA();
  if (!usarDadosSupabase() || ids.length === 0) return out;
  const falhas = new Set<FalhaNuvem>();
  const [mapas, cens, rels] = await Promise.all([
    Promise.all(ids.map(id => cloudListarMapasMeta(`${id}__`).catch(() => { falhas.add('mapas'); return [] as MapaNuvemPainel[]; }))),
    projetarDocsPorCampoSupabase('inv_cenarios', 'talhaoId', ids, ['safra', 'nome', 'geradoEm', 'oficial']).catch(() => null),
    projetarDocsPorCampoSupabase('inv_relatorios', 'talhaoId', ids, ['safra', 'tipo', 'titulo', 'geradoEm']).catch(() => null),
  ]);
  ids.forEach((id, i) => { out.mapasNuvem[id] = mapas[i]; });
  // projetarDocsPorCampoSupabase devolve null quando o banco recusa a consulta.
  if (cens === null) falhas.add('cenarios');
  if (rels === null) falhas.add('relatorios');
  if (falhas.size) { out.falhas = [...falhas]; console.warn('[portal] nuvem falhou em: ' + out.falhas.join(', ')); }
  for (const r of cens ?? []) {
    const id = r.talhaoId;
    if (!id) continue;
    (out.cenarios[id] ??= []).push({ safra: r.safra ?? null, nome: r.nome ?? null, geradoEm: r.geradoEm ?? null, oficial: r.oficial ?? null });
  }
  for (const r of rels ?? []) {
    const id = r.talhaoId;
    if (!id) continue;
    (out.relatorios[id] ??= []).push({ safra: r.safra ?? null, tipo: r.tipo ?? null, titulo: r.titulo ?? null, geradoEm: r.geradoEm ?? null });
  }
  return out;
}

/** Junta o local com o que veio da nuvem (ausente = ainda carregando/sem nuvem). */
export function juntarNuvem<T extends DadosTalhao>(local: T, nuvem: DadosNuvem | null): T {
  if (!nuvem) return local;
  const id = local.talhao.id;
  return {
    ...local,
    mapasNuvem: nuvem.mapasNuvem[id] ?? [],
    cenarios: nuvem.cenarios[id] ?? [],
    relatorios: nuvem.relatorios[id] ?? [],
  };
}
