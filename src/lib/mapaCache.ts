'use client';

// Cache local (IndexedDB) dos MAPAS da nuvem (coleção inv_mapas_fert) — os
// rasters (grids gz em base64) são o maior payload do app; sem cache, cada
// abertura de aba re-baixava megabytes já vistos. Entrada: { em, json } por
// item_id; um hit só vale quando o atualizado_em da NUVEM (vindo da listagem
// leve) bate com o gravado — mudou em outro aparelho → refetch automático.
//
// IndexedDB (e não localStorage) porque os grids passam com folga do teto de
// ~5 MB. Tudo aqui é OTIMIZAÇÃO: qualquer falha (navegação privada, quota,
// browser antigo) degrada para rede, nunca para erro.

const DB_NOME = 'inv_mapas_cache';
const STORE = 'mapas';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function abrirDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise(res => {
      try {
        const req = indexedDB.open(DB_NOME, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
        req.onsuccess = () => res(req.result);
        req.onerror = () => res(null);
        req.onblocked = () => res(null);
      } catch { res(null); }
    });
  }
  return dbPromise;
}

export async function cacheObterMapa<T>(id: string): Promise<{ atualizadoEm: string | null; dados: T } | null> {
  const db = await abrirDb();
  if (!db) return null;
  return new Promise(res => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      req.onsuccess = () => {
        const v = req.result as { em: string | null; json: string } | undefined;
        if (!v?.json) return res(null);
        try { res({ atualizadoEm: v.em ?? null, dados: JSON.parse(v.json) as T }); } catch { res(null); }
      };
      req.onerror = () => res(null);
    } catch { res(null); }
  });
}

// O JSON.stringify roda SÍNCRONO (antes de qualquer await): o snapshot é do
// momento da chamada — mutações posteriores do chamador (ex.: descomprimir o
// grid in-place) não contaminam o cache.
export async function cacheGravarMapa(id: string, atualizadoEm: string | null, dados: unknown): Promise<void> {
  let json: string;
  try { json = JSON.stringify(dados); } catch { return; }
  const db = await abrirDb();
  if (!db) return;
  await new Promise<void>(res => {
    try {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put({ em: atualizadoEm ?? null, json }, id);
      req.onsuccess = () => res();
      req.onerror = () => res();
    } catch { res(); }
  });
}

export async function cacheExcluirMapasPorPrefixo(prefixo: string): Promise<void> {
  const db = await abrirDb();
  if (!db) return;
  await new Promise<void>(res => {
    try {
      const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
      const req = store.delete(IDBKeyRange.bound(prefixo, prefixo + '￿', false, false));
      req.onsuccess = () => res();
      req.onerror = () => res();
    } catch { res(); }
  });
}
