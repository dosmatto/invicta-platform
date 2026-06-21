'use client';

// Fase R3.B — persistência de Cenários (na nuvem). Um cenário guarda os mapas de
// DOSE (um por equação) + financeiro, para reabrir e comparar (R4). Igual ao
// histórico de relatórios, fica na coleção Firestore `inv_cenarios`, consultado
// sob demanda por talhão (FORA do sync de listas). Doc = { campos de consulta +
// json } — os grids vão GZIP dentro do json (cabe no limite de 1 MB/doc).

import { getFb } from '../firebase';
import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
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
}

const COL = 'inv_cenarios';

// `idFixo` faz upsert (reprocessar a mesma recomendação+importação sobrescreve,
// em vez de criar duplicado). Sem ele, gera um id novo a cada chamada.
export async function salvarCenario(meta: Omit<Cenario, 'id' | 'geradoEm' | 'geradoPor'>, idFixo?: string): Promise<Cenario> {
  const fb = getFb();
  if (!fb) throw new Error('Nuvem indisponível para salvar o cenário.');
  const id = idFixo ?? `cen_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  // comprime os grids (gzip) p/ caber no doc do Firestore.
  const doses = await Promise.all(meta.doses.map(async d => ({ ...d, grid: await comprimirGrid(d.grid as Grid) })));
  const cen: Cenario = { ...meta, doses, id, geradoEm: Date.now(), geradoPor: fb.auth.currentUser?.email ?? '' };
  await setDoc(doc(fb.db, COL, id), {
    id, talhaoId: cen.talhaoId, safra: cen.safra, geradoEm: cen.geradoEm, json: JSON.stringify(cen),
  });
  return cen;
}

export async function listarCenarios(talhaoId: string, safra?: string): Promise<Cenario[]> {
  const fb = getFb();
  if (!fb) return [];
  try {
    const snap = await getDocs(query(collection(fb.db, COL), where('talhaoId', '==', talhaoId)));
    const out: Cenario[] = [];
    snap.forEach(d => { try { out.push(JSON.parse((d.data() as { json: string }).json) as Cenario); } catch { /* ignora doc inválido */ } });
    return out.filter(c => !safra || c.safra === safra).sort((a, b) => b.geradoEm - a.geradoEm);
  } catch (e) {
    console.warn('[cenarios] falha ao listar:', e);
    return [];
  }
}

// Descomprime os grids das doses p/ visualizar/recolorir ao reabrir.
export async function descomprimirCenario(cen: Cenario): Promise<Cenario> {
  const doses = await Promise.all(cen.doses.map(async d => ({
    ...d, grid: d.grid?.comp === 'gz' ? await descomprimirGrid(d.grid as Grid) : d.grid,
  })));
  return { ...cen, doses };
}

export async function excluirCenario(id: string): Promise<void> {
  const fb = getFb();
  if (!fb) return;
  await deleteDoc(doc(fb.db, COL, id));
}
