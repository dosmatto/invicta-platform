'use client';

// Coleta, para o Painel do Produtor, tudo que a plataforma guarda por talhão —
// primeiro o que está no aparelho (síncrono, pinta na hora), depois o que só
// existe na nuvem (mapas de fertilidade e satélite, cenários, relatórios), que
// chega e completa a tela. A REGRA do que está pronto fica em
// lib/portalProdutor.ts (puro, testado em node) — aqui é só coleta.

import {
  getGrades, getImportacoesLab, getZoneamentosMeap, getPrescricoes, getMapasProdutividade,
  getComposicoes, getMdes, getCondutividade, getImportacoesCompactacao, getPlantio,
  type Talhao,
} from './store';
import { cloudListarMapasMeta } from './cloud';
import { usarDadosSupabase, projetarDocsPorCampoSupabase } from './supabaseData';
import type { DadosTalhao, CenarioIn, RelatorioIn, MapaNuvemIn } from './portalProdutor';

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
  };
}

export interface DadosNuvem {
  mapasNuvem: Record<string, MapaNuvemIn[]>;
  cenarios: Record<string, CenarioIn[]>;
  relatorios: Record<string, RelatorioIn[]>;
}

const NUVEM_VAZIA = (): DadosNuvem => ({ mapasNuvem: {}, cenarios: {}, relatorios: {} });

/** Listagens LEVES da nuvem (sem raster, sem grid): uma por talhão para os
 *  mapas, uma só para todos os cenários e uma para os relatórios. Sem nuvem
 *  (bancada local) devolve vazio — a tela mostra o que o aparelho tem. */
export async function dadosNuvemDosTalhoes(ids: string[]): Promise<DadosNuvem> {
  const out = NUVEM_VAZIA();
  if (!usarDadosSupabase() || ids.length === 0) return out;
  const [mapas, cens, rels] = await Promise.all([
    Promise.all(ids.map(id => cloudListarMapasMeta(`${id}__`).catch(() => [] as MapaNuvemIn[]))),
    projetarDocsPorCampoSupabase('inv_cenarios', 'talhaoId', ids, ['safra', 'nome', 'geradoEm', 'oficial']).catch(() => null),
    projetarDocsPorCampoSupabase('inv_relatorios', 'talhaoId', ids, ['safra', 'tipo', 'titulo', 'geradoEm']).catch(() => null),
  ]);
  ids.forEach((id, i) => { out.mapasNuvem[id] = mapas[i]; });
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
export function juntarNuvem(local: DadosTalhao, nuvem: DadosNuvem | null): DadosTalhao {
  if (!nuvem) return local;
  const id = local.talhao.id;
  return {
    ...local,
    mapasNuvem: nuvem.mapasNuvem[id] ?? [],
    cenarios: nuvem.cenarios[id] ?? [],
    relatorios: nuvem.relatorios[id] ?? [],
  };
}
