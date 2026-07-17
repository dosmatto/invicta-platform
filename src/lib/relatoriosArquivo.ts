'use client';

// Histórico de relatórios gerados. Versão SEM custo: guarda apenas a
// CONFIGURAÇÃO do relatório na nuvem (Supabase, coleção inv_relatorios); o PDF é
// REGENERADO sob demanda ao "Abrir" (a partir dos mapas salvos na nuvem). Cada
// geração cria um registro novo (não sobrescreve).

import { usarDadosSupabase, salvarDocSupabase, carregarDocsPorCampoSupabase, excluirDocSupabase } from './supabaseData';

export interface RegistroRelatorio {
  id: string;
  talhaoId: string;
  safra: string;
  tipo: string;          // 'Fertilidade' | 'Recomendação' | 'Recomendação + Fertilidade'
  titulo: string;        // ex.: "Relatório completo" / "Relatório (3 mapas)"
  nuts: string[];        // elementos (ids) da seção Fertilidade p/ regenerar, na ordem
  elementos: string[];   // símbolos (exibição)
  satelite: boolean;
  valores: boolean;
  paginas: number;
  geradoEm: number;      // Date.now()
  geradoPor: string;     // e-mail do usuário
  // Combinado (opcional; ausente em registros antigos = só Fertilidade):
  cenarioIds?: string[]; // ids dos cenários da seção Recomendação p/ regenerar
  cenarioNomes?: string[]; // nomes das recomendações (exibição)
}

const COL = 'inv_relatorios';
type MetaEntrada = Omit<RegistroRelatorio, 'id' | 'geradoEm'>;

// Grava o registro (configuração) do relatório na nuvem.
export async function salvarRelatorio(meta: MetaEntrada): Promise<RegistroRelatorio> {
  const id = `rel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const reg: RegistroRelatorio = { ...meta, id, geradoEm: Date.now() };
  if (!usarDadosSupabase()) throw new Error('Nuvem indisponível para registrar o relatório.');
  await salvarDocSupabase(COL, id, reg);
  return reg;
}

// Lista os relatórios de um talhão (todas as safras), mais recente primeiro.
export async function listarRelatorios(talhaoId: string): Promise<RegistroRelatorio[]> {
  if (!usarDadosSupabase()) return [];
  const out = await carregarDocsPorCampoSupabase<RegistroRelatorio>(COL, 'talhaoId', talhaoId);
  return out.sort((a, b) => b.geradoEm - a.geradoEm);
}

export async function excluirRelatorio(reg: RegistroRelatorio): Promise<void> {
  if (!usarDadosSupabase()) return;
  await excluirDocSupabase(COL, reg.id);
}
