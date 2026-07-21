'use client';

// KV mínimo sobre IndexedDB para as chaves PESADAS do espelho local (ver
// localComprimido.ts). O localStorage tem teto de ~5-10 MB e estourava com
// inv_talhoes (~7 MB comprimido) + inv_condutividade (~2 MB) — a partir daí nada
// mais gravava e o boot re-baixava a base inteira a cada abertura. O IndexedDB
// tem cota na casa dos GBs.
//
// Espelha o padrão de mapaCache.ts: SSR-safe, TODA falha degrada para null/no-op
// (navegação privada, quota, browser antigo) — nunca lança. A verdade lógica da
// sessão é o cache em memória de localComprimido.ts; aqui é só persistência.

const DB_NOME = 'inv_cache_pesado';
const STORE = 'kv';

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

// String JSON gravada para a chave, ou null (ausente/falha).
export async function idbPesadoGet(key: string): Promise<string | null> {
  const db = await abrirDb();
  if (!db) return null;
  return new Promise(res => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => res(typeof req.result === 'string' ? req.result : null);
      req.onerror = () => res(null);
    } catch { res(null); }
  });
}

// true = persistiu; false = falhou (modo privado/quota) — o chamador decide
// (em regra: seguir pela memória e avisar no console).
export async function idbPesadoPut(key: string, json: string): Promise<boolean> {
  const db = await abrirDb();
  if (!db) return false;
  return new Promise(res => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(json, key);
      tx.oncomplete = () => res(true);
      tx.onerror = () => res(false);
      tx.onabort = () => res(false);
    } catch { res(false); }
  });
}

export async function idbPesadoDelete(key: string): Promise<void> {
  const db = await abrirDb();
  if (!db) return;
  await new Promise<void>(res => {
    try {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(key);
      req.onsuccess = () => res();
      req.onerror = () => res();
    } catch { res(); }
  });
}

export async function idbPesadoClear(): Promise<void> {
  const db = await abrirDb();
  if (!db) return;
  await new Promise<void>(res => {
    try {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).clear();
      req.onsuccess = () => res();
      req.onerror = () => res();
    } catch { res(); }
  });
}
