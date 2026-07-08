'use client';

// Fase R3.B — persistência de Cenários (na nuvem). Um cenário guarda os mapas de
// DOSE (um por equação) + financeiro, para reabrir e comparar (R4). Igual ao
// histórico de relatórios, fica na coleção `inv_cenarios` (Supabase), consultado
// sob demanda por talhão (FORA do sync de listas). Os grids vão GZIP dentro do
// registro.

import { emailUsuario } from '../auth';
import { usarDadosSupabase, salvarDocSupabase, carregarDocsPorCampoSupabase, excluirDocSupabase } from '../supabaseData';
import { comprimirGrid, descomprimirGrid, type Grid } from '../fertilidade';
import type { DoseCalculada } from './aplicar';

export interface Cenario {
  id: string;
  talhaoId: string;
  safra: string;
  importacaoId: string;
  origem: 'equacao' | 'recomendacao';
  recomendacaoId?: string;
  nome: string;
  doses: DoseCalculada[];
  financeiro: { custoTotal: number; custoHa: number; areaHa: number };
  geradoEm: number;
  geradoPor: string;
  oficial?: boolean;   // marcado "Para uso" → entra na geração de arquivos (aba Arquivos)
}

const COL = 'inv_cenarios';

// `idFixo` faz upsert (reprocessar a mesma recomendação+importação sobrescreve,
// em vez de criar duplicado). Sem ele, gera um id novo a cada chamada.
export async function salvarCenario(meta: Omit<Cenario, 'id' | 'geradoEm' | 'geradoPor'>, idFixo?: string): Promise<Cenario> {
  const id = idFixo ?? `cen_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  // comprime os grids (gzip) p/ caber no doc.
  const doses = await Promise.all(meta.doses.map(async d => ({ ...d, grid: await comprimirGrid(d.grid as Grid) })));
  const cen: Cenario = { ...meta, doses, id, geradoEm: Date.now(), geradoPor: emailUsuario() ?? '' };
  if (!usarDadosSupabase()) throw new Error('Nuvem indisponível para salvar o cenário.');
  await salvarDocSupabase(COL, id, cen);
  return cen;
}

export async function listarCenarios(talhaoId: string, safra?: string): Promise<Cenario[]> {
  if (!usarDadosSupabase()) return [];
  const out = await carregarDocsPorCampoSupabase<Cenario>(COL, 'talhaoId', talhaoId);
  return out.filter(c => !safra || c.safra === safra).sort((a, b) => b.geradoEm - a.geradoEm);
}

// Descomprime os grids das doses p/ visualizar/recolorir ao reabrir.
export async function descomprimirCenario(cen: Cenario): Promise<Cenario> {
  const doses = await Promise.all(cen.doses.map(async d => ({
    ...d, grid: d.grid?.comp === 'gz' ? await descomprimirGrid(d.grid as Grid) : d.grid,
  })));
  return { ...cen, doses };
}

// Marca/desmarca o cenário como "Para uso" (oficial). Regrava o doc preservando
// os grids como estão (gz) — sem recomprimir.
export async function marcarCenarioOficial(cen: Cenario, oficial: boolean): Promise<void> {
  const atualizado: Cenario = { ...cen, oficial };
  if (!usarDadosSupabase()) throw new Error('Nuvem indisponível.');
  await salvarDocSupabase(COL, cen.id, atualizado);
}

export async function excluirCenario(id: string): Promise<void> {
  if (!usarDadosSupabase()) return;
  await excluirDocSupabase(COL, id);
}
