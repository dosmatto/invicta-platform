'use client';

// Estados das cenas de satélite (IV4): a REJEIÇÃO de uma imagem agora é
// persistida na NUVEM por talhão (doc no app_kv, colecao 'inv_cenas_estado'),
// além do cache local — vale em qualquer aparelho/navegador. Offline, funciona
// só com o local e sincroniza na próxima abertura online.

import { usarDadosSupabase, salvarDocSupabase, carregarDocsPorCampoSupabase } from './supabaseData';

const K = 'inv_ndvi_rejeitadas';
const COLECAO = 'inv_cenas_estado';

export function getRejeitadasLocal(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(K) ?? '{}'); } catch { return {}; }
}

function saveLocal(r: Record<string, boolean>) {
  localStorage.setItem(K, JSON.stringify(r));
}

// Carrega o estado do talhão da nuvem e faz merge no cache local (nuvem manda
// nas chaves DESTE talhão; o resto do cache fica como está).
export async function carregarRejeitadas(talhaoId: string): Promise<Record<string, boolean>> {
  const local = getRejeitadasLocal();
  if (usarDadosSupabase() && typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const docs = await carregarDocsPorCampoSupabase<{ talhaoId: string; rejeitadas?: Record<string, boolean> }>(COLECAO, 'talhaoId', talhaoId);
      const nuvem = docs[0]?.rejeitadas ?? {};
      for (const k of Object.keys(local)) if (k.startsWith(talhaoId + ':')) delete local[k];
      const junto = { ...local, ...nuvem };
      saveLocal(junto);
      return junto;
    } catch { /* offline/erro: segue com o local */ }
  }
  return local;
}

export function marcarRejeitada(talhaoId: string, id: string, v: boolean) {
  const r = getRejeitadasLocal();
  if (v) r[id] = true; else delete r[id];
  saveLocal(r);
  if (usarDadosSupabase() && typeof navigator !== 'undefined' && navigator.onLine) {
    const doTalhao = Object.fromEntries(Object.entries(r).filter(([k]) => k.startsWith(talhaoId + ':')));
    void salvarDocSupabase(COLECAO, talhaoId, { talhaoId, rejeitadas: doTalhao }).catch(() => {});
  }
}
