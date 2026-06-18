'use client';

// Histórico de relatórios gerados. Versão SEM custo (sem Firebase Storage/Blaze):
// guarda apenas a CONFIGURAÇÃO do relatório no Firestore (coleção inv_relatorios);
// o PDF é REGENERADO sob demanda ao "Abrir" (a partir dos mapas salvos na nuvem).
// Cada geração cria um registro novo (não sobrescreve).

import { getFb } from './firebase';
import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore';

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
  const fb = getFb();
  if (!fb) throw new Error('Nuvem indisponível para registrar o relatório.');
  const id = `rel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const reg: RegistroRelatorio = { ...meta, id, geradoEm: Date.now() };
  await setDoc(doc(fb.db, COL, id), reg);
  return reg;
}

// Lista os relatórios de um talhão (todas as safras), mais recente primeiro.
export async function listarRelatorios(talhaoId: string): Promise<RegistroRelatorio[]> {
  const fb = getFb();
  if (!fb) return [];
  try {
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
  const fb = getFb();
  if (!fb) return;
  await deleteDoc(doc(fb.db, COL, reg.id));
}
