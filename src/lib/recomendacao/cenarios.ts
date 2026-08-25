'use client';

// Fase R3.B — persistência de Cenários (na nuvem). Um cenário guarda os mapas de
// DOSE (um por equação) + financeiro, para reabrir e comparar (R4). Igual ao
// histórico de relatórios, fica na coleção `inv_cenarios` (Supabase), consultado
// sob demanda por talhão (FORA do sync de listas). Os grids vão GZIP dentro do
// registro.

import { emailUsuario } from '../auth';
import { usarDadosSupabase, salvarDocSupabase, carregarDocsPorCampoSupabase, excluirDocSupabase, projetarDocsPorCampoSupabase } from '../supabaseData';
import { comprimirGrid, descomprimirGrid, type Grid } from '../fertilidade';
import { listar as bibListar, type ConteudoEquacao, type EstiloRecomendacao } from '../biblioteca';
import { reidratarDoses, type RotulosEquacao } from './legendaViva';
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

// Só as SAFRAS que têm cenário, para uma lista de talhões — projeção leve
// (não baixa os grids das doses). Usado para montar o seletor de Ano dos
// relatórios da fazenda ("quais anos têm dado"). null = falha na consulta.
export async function safrasComCenario(talhaoIds: string[]): Promise<string[] | null> {
  if (!usarDadosSupabase() || talhaoIds.length === 0) return [];
  const linhas = await projetarDocsPorCampoSupabase(COL, 'talhaoId', talhaoIds, ['safra']);
  if (linhas === null) return null;
  const set = new Set<string>();
  for (const l of linhas) { const s = l.safra; if (s) set.add(s); }
  return [...set];
}

export async function listarCenarios(talhaoId: string, safra?: string): Promise<Cenario[]> {
  if (!usarDadosSupabase()) return [];
  const out = await carregarDocsPorCampoSupabase<Cenario>(COL, 'talhaoId', talhaoId);
  return out.filter(c => !safra || c.safra === safra).sort((a, b) => b.geradoEm - a.geradoEm);
}

// Rótulos ATUAIS de cada equação da Biblioteca (estilo/nome/produto), indexados
// por id. NÃO filtra por `ativo`: desativar a equação não pode mudar a legenda de
// um mapa já processado (mesmo critério de construirNumDe, em relatorioCenarios).
// O estilo é clonado UMA vez por equação — as doses passam a compartilhar esse
// clone, e nada a jusante toca no objeto que veio da Biblioteca.
export function rotulosAtuaisDasEquacoes(): Map<string, RotulosEquacao<EstiloRecomendacao>> {
  const mapa = new Map<string, RotulosEquacao<EstiloRecomendacao>>();
  for (const it of bibListar<ConteudoEquacao>('equacoes')) {
    const e = it.conteudo?.estilo;
    if (!e) continue;
    mapa.set(it.id, {
      estilo: { ...e, classes: e.classes.map(c => ({ ...c })) },
      nome: it.nome,
      produto: it.conteudo.produto,
    });
  }
  return mapa;
}

// Re-hidrata SÓ OS RÓTULOS (nome/produto/estilo) das doses a partir da equação
// atual, SEM descomprimir grid nenhum — `reidratarDoses` não toca em `grid`.
// É o que o RESUMO GERAL precisa: ele não desenha mapa, e gunzipar o grid de
// cada dose, de cada talhão, de cada ano escolhido inviabilizaria o multi-ano.
// Passe `rotulos` pré-montado quando for hidratar muitos cenários — assim a
// Biblioteca é lida UMA vez, não uma vez por cenário.
export function hidratarRotulos(
  cen: Cenario, rotulos?: Map<string, RotulosEquacao<EstiloRecomendacao>>,
): Cenario {
  return { ...cen, doses: reidratarDoses(cen.doses, rotulos ?? rotulosAtuaisDasEquacoes()) };
}

// Descomprime os grids das doses p/ visualizar/recolorir ao reabrir, e re-hidrata
// a LEGENDA (+ nome/produto) a partir da equação atual — ver legendaViva.ts. É
// por aqui que passam TODOS os consumidores que desenham mapa de dose (PDF
// oficial, relatório combinado, relatório da fazenda, JPG, shapefile, comparador
// e o "reabrir" da tela), então a correção mora neste ponto único.
export async function descomprimirCenario(cen: Cenario): Promise<Cenario> {
  // Uma leitura da Biblioteca por CENÁRIO (fora do Promise.all) — nunca por dose.
  const rotulos = rotulosAtuaisDasEquacoes();
  const doses = await Promise.all(cen.doses.map(async d => ({
    ...d, grid: d.grid?.comp === 'gz' ? await descomprimirGrid(d.grid as Grid) : d.grid,
  })));
  return { ...cen, doses: reidratarDoses(doses, rotulos) };
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
