'use client';

// KV mínimo sobre IndexedDB para a SESSÃO de login (ver sessaoStorage.ts).
//
// POR QUE NÃO REUSAR `idbPesado.ts`: aquele store é o cache de dados e tem um
// `idbPesadoClear()` — chamado por "limpar base operacional" (admin). A sessão
// não é dado operacional; limpar a base não pode, de quebra, deslogar quem está
// fazendo a limpeza. Banco próprio, ninguém varre por engano.
//
// Mesmo contrato do idbPesado: SSR-safe, TODA falha degrada para null/no-op
// (navegação privada, cota, navegador antigo) — nunca lança.

const DB_NOME = 'inv_sessao';
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

export async function idbSessaoGet(key: string): Promise<string | null> {
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

/** true = persistiu; false = falhou (modo privado/cota). */
export async function idbSessaoPut(key: string, valor: string): Promise<boolean> {
  const db = await abrirDb();
  if (!db) return false;
  return new Promise(res => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(valor, key);
      tx.oncomplete = () => res(true);
      tx.onerror = () => res(false);
      tx.onabort = () => res(false);
    } catch { res(false); }
  });
}

export async function idbSessaoDelete(key: string): Promise<void> {
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
