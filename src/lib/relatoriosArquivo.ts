'use client';

// Histórico de relatórios gerados. Versão SEM custo (sem Firebase Storage/Blaze):
// guarda apenas a CONFIGURAÇÃO do relatório no Firestore (coleção inv_relatorios);
// o PDF é REGENERADO sob demanda ao "Abrir" (a partir dos mapas salvos na nuvem).
// Cada geração cria um registro novo (não sobrescreve).

import { ensureFb, getFirestoreFns } from './firebase';
import { usarDadosSupabase, salvarDocSupabase, carregarDocsPorCampoSupabase, excluirDocSupabase } from './supabaseData';

export interface RegistroRelatorio {
  id: string;
  talhaoId: string;
  safra: string;
  tipo: string;          // 'Fertilidade'
  titulo: string;        // ex.: "Relatório completo" / "Relatório (3 mapas)"
  nuts: string[];        // elementos (ids) p/ regenerar o PDF, na ordem
  elementos: string[];   // símbolos (exibição)
  satelite: boolean;
  valores: boolean;
  paginas: number;
  geradoEm: number;      // Date.now()
  geradoPor: string;     // e-mail do usuário
}

const COL = 'inv_relatorios';
type MetaEntrada = Omit<RegistroRelatorio, 'id' | 'geradoEm'>;

// Grava o registro (configuração) do relatório no Firestore.
export async function salvarRelatorio(meta: MetaEntrada): Promise<RegistroRelatorio> {
  const id = `rel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const reg: RegistroRelatorio = { ...meta, id, geradoEm: Date.now() };
  if (usarDadosSupabase()) { await salvarDocSupabase(COL, id, reg); return reg; }
  const fb = await ensureFb();
  if (!fb) throw new Error('Nuvem indisponível para registrar o relatório.');
  const { doc, setDoc } = await getFirestoreFns();
  await setDoc(doc(fb.db, COL, id), reg);
  return reg;
}

// Lista os relatórios de um talhão (todas as safras), mais recente primeiro.
export async function listarRelatorios(talhaoId: string): Promise<RegistroRelatorio[]> {
  if (usarDadosSupabase()) {
    const out = await carregarDocsPorCampoSupabase<RegistroRelatorio>(COL, 'talhaoId', talhaoId);
    return out.sort((a, b) => b.geradoEm - a.geradoEm);
  }
  const fb = await ensureFb();
  if (!fb) return [];
  try {
    const { collection, query, getDocs, where } = await getFirestoreFns();
    const snap = await getDocs(query(collection(fb.db, COL), where('talhaoId', '==', talhaoId)));
    const out: RegistroRelatorio[] = [];
    snap.forEach(d => out.push(d.data() as RegistroRelatorio));
    return out.sort((a, b) => b.geradoEm - a.geradoEm);
  } catch (e) {
    console.warn('[relatorios] falha ao listar:', e);
    return [];
  }
}

export async function excluirRelatorio(reg: RegistroRelatorio): Promise<void> {
  if (usarDadosSupabase()) { await excluirDocSupabase(COL, reg.id); return; }
  const fb = await ensureFb();
  if (!fb) return;
  const { doc, deleteDoc } = await getFirestoreFns();
  await deleteDoc(doc(fb.db, COL, reg.id));
}
