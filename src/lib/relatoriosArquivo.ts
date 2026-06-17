'use client';

// Arquivo de relatórios gerados. O PDF (arquivo fiel) vai para o Firebase
// Storage; os metadados (data, tipo, elementos, safra…) ficam numa coleção
// Firestore própria (inv_relatorios) para listar/excluir por talhão. Cada
// geração cria um registro NOVO (não sobrescreve).

import { getFb, getStorageFb } from './firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore';

export interface RegistroRelatorio {
  id: string;
  talhaoId: string;
  safra: string;
  tipo: string;          // 'Fertilidade'
  titulo: string;        // ex.: "Relatório completo" / "Relatório (3 mapas)"
  elementos: string[];   // símbolos incluídos, na ordem
  paginas: number;
  geradoEm: number;      // Date.now()
  geradoPor: string;     // e-mail do usuário
  tamanhoBytes: number;
  storagePath: string;   // relatorios/{talhaoId}/{id}.pdf
  downloadURL: string;
}

const COL = 'inv_relatorios';

type MetaEntrada = Omit<RegistroRelatorio, 'id' | 'storagePath' | 'downloadURL' | 'tamanhoBytes' | 'geradoEm'>;

// Sobe o PDF p/ o Storage e grava os metadados. Lança erro se a nuvem/Storage
// estiver indisponível (o caller mostra a mensagem; o PDF já abriu na aba).
export async function salvarRelatorio(blob: Blob, meta: MetaEntrada): Promise<RegistroRelatorio> {
  const fb = getFb();
  const st = getStorageFb();
  if (!fb || !st) throw new Error('Nuvem indisponível para arquivar o relatório.');
  const id = `rel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const storagePath = `relatorios/${meta.talhaoId}/${id}.pdf`;
  const r = ref(st, storagePath);
  await uploadBytes(r, blob, { contentType: 'application/pdf' });
  const downloadURL = await getDownloadURL(r);
  const reg: RegistroRelatorio = { ...meta, id, storagePath, downloadURL, tamanhoBytes: blob.size, geradoEm: Date.now() };
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
  const st = getStorageFb();
  if (!fb) return;
  try { if (st && reg.storagePath) await deleteObject(ref(st, reg.storagePath)); } catch (e) { console.warn('[relatorios] falha ao apagar arquivo:', e); }
  await deleteDoc(doc(fb.db, COL, reg.id));
}
