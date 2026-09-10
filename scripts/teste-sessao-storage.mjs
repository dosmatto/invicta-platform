// Testes do armazenamento da SESSÃO DE LOGIN (src/lib/sessaoStorage.ts).
//
// O defeito que originou isto: "está cada vez pedindo login e senha". O
// supabase-js, sem um `storage` explícito, testa uma escrita no localStorage no
// construtor e — se ela falhar — guarda a sessão só na MEMÓRIA, sem avisar. Com
// o localStorage cheio, toda recarga voltava para a tela de login. Estes testes
// travam o contrato do adaptador que resolve isso: localStorage → IndexedDB →
// memória, e logout que limpa os três.
// Roda: `npm run teste:sessao`.
import assert from 'node:assert/strict';

// ── navegador de mentira, montado ANTES do import do módulo ─────────────────
const eventos = [];
globalThis.window = { dispatchEvent: (e) => { eventos.push(e); return true; } };
globalThis.CustomEvent = class CustomEvent {
  constructor(tipo, init) { this.type = tipo; this.detail = init?.detail; }
};

// localStorage controlável: `cheio` estoura como o do navegador; `quebrado`
// lança até na leitura (cookies de terceiros bloqueados).
function criarLs() {
  const dados = new Map();
  return {
    cheio: false, quebrado: false, _dados: dados,
    getItem(k) { if (this.quebrado) throw new Error('acesso negado'); return dados.has(k) ? dados.get(k) : null; },
    setItem(k, v) {
      if (this.cheio) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
      dados.set(k, v);
    },
    removeItem(k) { dados.delete(k); },
  };
}

// IndexedDB de mentira, com o mínimo que idbSessao.ts usa: open→onsuccess,
// transaction→objectStore→get/put/delete, tx.oncomplete. `quebrado` derruba a
// transação, que é como o navegador se comporta em navegação privada.
const idb = { dados: new Map(), quebrado: false };
globalThis.indexedDB = {
  open() {
    const req = {};
    queueMicrotask(() => {
      req.result = {
        createObjectStore() { /* o store do fake é o Map acima */ },
        transaction() {
          if (idb.quebrado) throw new Error('IDB indisponível');
          const tx = {};
          tx.objectStore = () => ({
            get(k) {
              const r = {};
              queueMicrotask(() => { r.result = idb.dados.get(k); r.onsuccess?.(); });
              return r;
            },
            put(v, k) { idb.dados.set(k, v); queueMicrotask(() => tx.oncomplete?.()); return {}; },
            delete(k) {
              const r = {};
              idb.dados.delete(k);
              queueMicrotask(() => { r.onsuccess?.(); tx.oncomplete?.(); });
              return r;
            },
          });
          return tx;
        },
      };
      req.onupgradeneeded?.();
      req.onsuccess?.();
    });
    return req;
  },
};

const { criarArmazenamentoSessao, ehErroDeCota } = await import('../src/lib/sessaoStorage.ts');

let ok = 0, fail = 0;
async function t(nome, fn) {
  try { await fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}
function cenario({ cheio = false, idbQuebrado = false } = {}) {
  globalThis.localStorage = criarLs();
  globalThis.localStorage.cheio = cheio;
  idb.dados.clear();
  idb.quebrado = idbQuebrado;
  eventos.length = 0;
  return criarArmazenamentoSessao();
}

const CHAVE = 'sb-projeto-auth-token';
const SESSAO = JSON.stringify({ access_token: 'a', refresh_token: 'r' });

await t('caminho normal: grava e lê do localStorage', async () => {
  const a = cenario();
  await a.setItem(CHAVE, SESSAO);
  assert.equal(globalThis.localStorage._dados.get(CHAVE), SESSAO);
  assert.equal(await a.getItem(CHAVE), SESSAO);
});

await t('REGRESSÃO: localStorage cheio → a sessão vai para o IndexedDB', async () => {
  const a = cenario({ cheio: true });
  await a.setItem(CHAVE, SESSAO);
  assert.equal(idb.dados.get(CHAVE), SESSAO, 'não persistiu no IndexedDB');
  assert.equal(await a.getItem(CHAVE), SESSAO);
});

await t('a sessão salva no IndexedDB sobrevive à recarga (adaptador NOVO a lê)', async () => {
  const a = cenario({ cheio: true });
  await a.setItem(CHAVE, SESSAO);
  // Recarregar a página = adaptador novo, memória zerada. É o passo que faltava
  // quando a sessão ficava só na memória: aqui ela TEM de voltar.
  const depoisDaRecarga = criarArmazenamentoSessao();
  assert.equal(await depoisDaRecarga.getItem(CHAVE), SESSAO, 'pediria login de novo');
});

await t('localStorage e IndexedDB fora → memória, e só nesta aba', async () => {
  const a = cenario({ cheio: true, idbQuebrado: true });
  await a.setItem(CHAVE, SESSAO);
  assert.equal(await a.getItem(CHAVE), SESSAO);
  assert.equal(await criarArmazenamentoSessao().getItem(CHAVE), null);
});

await t('armazenamento cheio acende o aviso do cabeçalho (inv:quota-erro)', async () => {
  const a = cenario({ cheio: true });
  await a.setItem(CHAVE, SESSAO);
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].type, 'inv:quota-erro');
});

await t('gravação normal NÃO dispara aviso nenhum', async () => {
  const a = cenario();
  await a.setItem(CHAVE, SESSAO);
  assert.equal(eventos.length, 0);
});

await t('voltando a caber, a cópia do IndexedDB é apagada', async () => {
  const a = cenario({ cheio: true });
  await a.setItem(CHAVE, SESSAO);
  assert.equal(idb.dados.get(CHAVE), SESSAO);
  globalThis.localStorage.cheio = false;
  await a.setItem(CHAVE, JSON.stringify({ access_token: 'novo' }));
  await new Promise(r => setTimeout(r, 0));   // o delete é best-effort (void)
  assert.equal(idb.dados.has(CHAVE), false, 'sessão VELHA ficaria no IDB e voltaria depois do logout');
});

await t('logout limpa os três (localStorage, IndexedDB e memória)', async () => {
  const a = cenario({ cheio: true });
  await a.setItem(CHAVE, SESSAO);
  await a.removeItem(CHAVE);
  assert.equal(await a.getItem(CHAVE), null, 'sessão ressuscitou depois do logout');
  assert.equal(idb.dados.has(CHAVE), false);
  assert.equal(globalThis.localStorage._dados.has(CHAVE), false);
});

await t('localStorage que LANÇA ao ser lido não derruba o getItem', async () => {
  const a = cenario();
  await a.setItem(CHAVE, SESSAO);
  globalThis.localStorage.quebrado = true;
  assert.equal(await a.getItem(CHAVE), SESSAO, 'devia ter caído para IDB/memória');
});

await t('chave ausente devolve null (e não string vazia)', async () => {
  const a = cenario();
  assert.equal(await a.getItem('nao-existe'), null);
});

await t('ehErroDeCota reconhece os nomes dos três navegadores', () => {
  const comNome = (n) => { const e = new Error('x'); e.name = n; return e; };
  assert.equal(ehErroDeCota(comNome('QuotaExceededError')), true);
  assert.equal(ehErroDeCota(comNome('NS_ERROR_DOM_QUOTA_REACHED')), true);
  assert.equal(ehErroDeCota(comNome('TypeError')), false);
  assert.equal(ehErroDeCota(null), false);
});

console.log(`\n${ok} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
