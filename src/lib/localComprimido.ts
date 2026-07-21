// Espelho local do navegador: chaves PESADAS em IndexedDB, leves no localStorage.
//
// HISTÓRICO: o localStorage tem teto de ~5-10 MB por site. O GeoJSON de
// inv_talhoes (todos os polígonos) e inv_condutividade sozinhos passam de 9 MB;
// a v1.x comprimia com lz-string (prefixo MARCA), mas mesmo comprimido o
// conjunto estourava a cota — a partir daí NADA mais gravava e o boot re-baixava
// a base inteira a cada abertura. Agora as chaves pesadas persistem no
// IndexedDB (cota de GBs) e o localStorage fica só com as leves.
//
// A LEITURA continua SÍNCRONA (contrato de todo o app: 40+ getters do store):
// rawPesadas guarda em memória a string JSON crua de cada chave pesada,
// hidratada do IndexedDB no início do app (hidratarCachePesado, aguardada pelo
// AppContext ANTES de qualquer leitura pesada — boot da nuvem incluso). O
// IndexedDB é só persistência; a verdade lógica da sessão é a memória.
//
// Retrocompatível: a leitura legada ainda entende o prefixo MARCA (valores
// antigos comprimidos no localStorage) e a hidratação MIGRA esses valores para
// o IndexedDB, removendo-os do localStorage — é o que libera a cota do
// navegador na primeira abertura da versão nova.
//
// A NUVEM (Supabase) continua guardando JSON puro — isto é só o cache local.

import * as LZString from 'lz-string';
import { idbPesadoGet, idbPesadoPut, idbPesadoDelete, idbPesadoClear } from './idbPesado';

// Prefixo que marca um valor comprimido LEGADO no localStorage. Nenhum JSON
// serializado (começa com [ / { / aspas / dígito) começa com esta sequência.
const MARCA = '@@LZ@@';

// Chaves pesadas (geometria/grid) que persistem no IndexedDB. Fora desta lista
// o valor vai como JSON puro no localStorage — assim a Biblioteca (inv_bib_*) e
// as migrações que leem cru continuam funcionando sem tocar em nada. Incluir
// uma chave aqui é seguro a qualquer momento: a hidratação migra o valor.
const PESADAS = new Set<string>([
  'inv_talhoes',          // poligonos de todas as fazendas - o maior ofensor (~7 MB)
  'inv_condutividade',    // variavel fixa por talhao (pontos/grid) - ~2 MB
  'inv_produtividade',    // metadados/versoes de colheita
  'inv_composicoes',      // composicoes temporais de indices (IV5)
  'inv_mde',              // metadados das bases altimetricas (MDE)
  'inv_mde_camadas',      // camadas topograficas salvas p/ Zonas
  'inv_meap_zoneamentos', // zoneamentos (poligonos de zonas)
  'inv_meap_ambientes',   // ambientes produtivos
  'inv_compactacao',      // penetrometria por profundidade
  'inv_grades_compact',   // grades de compactacao
  'inv_plantios',         // cultura por talhao+safra
]);

// ── Cache de leitura em memoria ─────────────────────────────────────────────
// TODO getter do store (getTalhoes, getFazendas...) chama lerListaLocal;
// cacheListas guarda o resultado JÁ PARSEADO por chave (o parse de listas de
// MBs a cada chamada era o maior custo de CPU da app). rawPesadas guarda a
// STRING crua das chaves pesadas — fonte síncrona de lerRawLocal (o diff
// gravarSeMudou do boot compara string crua) e origem do parse de cacheListas.
// Invariante: toda escrita (gravarListaLocal/gravarRawLocal) atualiza os dois
// SINCRONAMENTE antes de persistir; escritas de OUTRAS abas invalidam via
// evento 'storage' (leves) ou BroadcastChannel (pesadas).
const cacheListas = new Map<string, unknown[]>();
const rawPesadas = new Map<string, string>();

// Registro (lazy, 1x, SSR-safe) do listener cross-tab das chaves LEVES. O
// evento 'storage' só dispara em abas que NÃO fizeram a escrita — se /coleta
// grava, /painel (outra aba) invalida sua entrada e reparsea na próxima
// leitura. e.key === null => localStorage.clear() (invalida tudo).
let listenerStorageRegistrado = false;
function registrarListenerStorage(): void {
  if (listenerStorageRegistrado || typeof window === 'undefined') return;
  listenerStorageRegistrado = true;
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key === null) { cacheListas.clear(); return; }
    cacheListas.delete(e.key);
  });
}

// ── Cross-tab das PESADAS (BroadcastChannel) ────────────────────────────────
// IndexedDB não emite evento 'storage'; sem isto, a aba vizinha ficaria com o
// cache em memória obsoleto até reload. Ao receber {key}, a aba re-hidrata a
// chave do IndexedDB (async — a leitura síncrona pode devolver o valor antigo
// por alguns ms, aceitável: as leituras do app são render-driven). O emissor
// só posta APÓS o put confirmar, então o get do receptor vê o valor novo.
type MsgPesada = { key: string } | { tipo: 'clear' };
let canal: BroadcastChannel | null = null;
let canalRegistrado = false;
function canalPesado(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!canalRegistrado) {
    canalRegistrado = true;
    try {
      canal = new BroadcastChannel('inv_pesado');
      canal.onmessage = (e: MessageEvent<MsgPesada>) => {
        const msg = e.data;
        if (msg && 'tipo' in msg && msg.tipo === 'clear') {
          rawPesadas.clear();
          for (const k of PESADAS) cacheListas.delete(k);
          return;
        }
        if (!msg || !('key' in msg)) return;
        void idbPesadoGet(msg.key).then(v => {
          if (v != null) rawPesadas.set(msg.key, v); else rawPesadas.delete(msg.key);
          cacheListas.delete(msg.key);
        });
      };
    } catch { canal = null; }
  }
  return canal;
}
function avisarAbas(msg: MsgPesada): void {
  try { canalPesado()?.postMessage(msg); } catch { /* melhor-esforço */ }
}

// ── Hidratação (chamar 1x no início do app, ANTES de qualquer leitura pesada) ─
// Para cada chave pesada: IndexedDB → memória; não achou? lê o LEGADO do
// localStorage (descomprimindo MARCA) e MIGRA para o IndexedDB, removendo do
// localStorage só APÓS o put confirmar — é a liberação da cota na 1ª abertura.
// SINGLETON: chamadas repetidas devolvem a mesma Promise (o AppContext aguarda
// de verdade só na primeira).
let hidratacao: Promise<void> | null = null;
let hidratacaoConcluida = false;
export function hidratarCachePesado(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (!hidratacao) {
    hidratacao = (async () => {
      canalPesado();   // registra o receptor cross-tab junto com a hidratação
      const t0 = performance.now();
      let n = 0, chars = 0;
      for (const key of PESADAS) {
        if (rawPesadas.has(key)) continue;   // já escrita nesta sessão — memória vence
        try {
          const doIdb = await idbPesadoGet(key);
          if (doIdb != null) {
            rawPesadas.set(key, doIdb);
            cacheListas.delete(key);   // leitura precoce pode ter grudado []/legado no parse
            n++; chars += doIdb.length;
            continue;
          }
          // Legado: valor ainda no localStorage (comprimido ou JSON puro).
          const json = lerLegadoLocalStorage(key);
          if (json != null) {
            rawPesadas.set(key, json);
            cacheListas.delete(key);
            n++; chars += json.length;
            if (await idbPesadoPut(key, json)) localStorage.removeItem(key);
          }
        } catch { /* chave segue pelo fallback legado de lerRawLocal */ }
      }
      hidratacaoConcluida = true;
      const mb = (chars * 2) / 1048576;   // UTF-16: ~2 bytes/char
      console.info(`[cache] pesados hidratados: ${n} chaves, ${mb.toFixed(1)} MB, ${Math.round(performance.now() - t0)}ms`);
    })();
  }
  return hidratacao;
}

// Limpeza total do cache pesado (memória + IndexedDB + outras abas). Usada no
// "APAGAR TUDO" — sem isto a base "zerada" ressuscitaria do IndexedDB no boot.
export async function limparCachePesado(): Promise<void> {
  rawPesadas.clear();
  for (const k of PESADAS) cacheListas.delete(k);
  await idbPesadoClear();
  avisarAbas({ tipo: 'clear' });
}

// Remove UMA chave do espelho local (memória + persistência + outras abas).
// Funciona para qualquer chave; nas pesadas apaga também o IndexedDB. Usada
// pelas limpezas diretas (boot do campo, clearAll) que antes davam
// localStorage.removeItem cru — sem isto o valor ressuscitaria da memória/IDB.
export function removerLocal(key: string): void {
  if (typeof window === 'undefined') return;
  cacheListas.delete(key);
  try { localStorage.removeItem(key); } catch { /* segue */ }
  if (PESADAS.has(key)) {
    rawPesadas.delete(key);
    void idbPesadoDelete(key).then(() => avisarAbas({ key }));
  }
}

// A chave pesada tem valor conhecido nesta sessão? (memória pós-hidratação —
// substitui o antigo `localStorage.getItem(k) != null` das checagens de presença)
export function temPesadaLocal(key: string): boolean {
  return rawPesadas.has(key);
}

// Chaves pesadas presentes em memória — para a ENUMERAÇÃO dos backups
// (localStorage.key(i) não enxerga o que migrou para o IndexedDB).
export function chavesPesadasEmMemoria(): string[] {
  return [...rawPesadas.keys()];
}

// Leitura LEGADA do localStorage (descomprime o prefixo MARCA da v1.x).
function lerLegadoLocalStorage(key: string): string | null {
  const raw = localStorage.getItem(key);
  if (raw == null) return null;
  if (raw.startsWith(MARCA)) {
    const json = LZString.decompressFromUTF16(raw.slice(MARCA.length)) as string | null;
    return json || null;
  }
  return raw;
}

// Le a STRING JSON crua de uma chave. null se a chave nao existe. Pesadas vêm
// da memória (síncrono, pós-hidratação); o caminho legado (localStorage +
// MARCA) cobre pré-hidratação e navegadores sem IndexedDB. Chaves leves:
// localStorage como sempre.
export function lerRawLocal(key: string): string | null {
  if (typeof window === 'undefined') return null;
  if (PESADAS.has(key)) {
    const mem = rawPesadas.get(key);
    if (mem != null) return mem;
  }
  return lerLegadoLocalStorage(key);
}

// Grava uma STRING JSON.
//  - PESADAS: memória PRIMEIRO (leitura síncrona já vê o dado novo), depois
//    persiste no IndexedDB em 2º plano; no sucesso remove o resíduo legado do
//    localStorage (libera cota) e avisa as outras abas. NUNCA lança quota — se
//    o IndexedDB falhar (modo privado), a sessão segue pela memória e a nuvem
//    (inv_sync_sujo) garante os dados; a persistência volta no próximo boot.
//  - LEVES: localStorage (JSON puro). Se estourar a quota, avisa via evento
//    'inv:quota-erro' e relança — o chamador (store.ts) decide o que fazer.
export function gravarRawLocal(key: string, json: string): void {
  if (typeof window === 'undefined') return;
  // Invalida a entrada de lista: a string crua acabou de mudar (usado também pelo
  // boot da nuvem em supabaseData.ts, que grava JSON de listas por aqui).
  cacheListas.delete(key);
  if (PESADAS.has(key)) {
    rawPesadas.set(key, json);
    void idbPesadoPut(key, json).then(ok => {
      if (!ok) { console.warn(`[cache] IndexedDB falhou ao gravar "${key}" — sessão segue pela memória.`); return; }
      try { localStorage.removeItem(key); } catch { /* segue */ }
      avisarAbas({ key });
    });
    return;
  }
  try {
    localStorage.setItem(key, json);
  } catch (e) {
    const quota = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);
    if (quota) {
      window.dispatchEvent(new CustomEvent('inv:quota-erro', { detail: { key } }));
      throw new Error('Armazenamento local cheio — dados não foram salvos no cache do navegador.');
    }
    throw e;
  }
}

// Acucar para o caso comum: lista de objetos.
// HIT -> devolve COPIA RASA (`[...cached]`): o chamador pode dar push/splice/sort
// no array sem corromper o cache. Os OBJETOS internos sao compartilhados (rapido);
// consumidores que mutam item in-place devem salvar depois (padrao getLegendas).
// MISS -> lerRawLocal + JSON.parse, guarda e devolve copia.
export function lerListaLocal<T>(key: string): T[] {
  registrarListenerStorage();
  const cached = cacheListas.get(key);
  if (cached) return [...cached] as T[];
  const t0 = performance.now();
  const json = lerRawLocal(key);
  let lista: T[];
  if (!json) {
    // PESADA ainda não hidratada: devolve [] SEM cachear — o valor real pode
    // estar chegando do IndexedDB; um [] grudado no cache parseado seguiria a
    // sessão inteira e um save() em cima dele PODARIA a lista na nuvem.
    if (PESADAS.has(key) && !hidratacaoConcluida) return [];
    lista = [];
  } else {
    try { lista = JSON.parse(json) as T[]; } catch { lista = []; }
  }
  // [cache] leitura FRIA cara (parse) — revela chaves pesadas (ex.: inv_talhoes
  // ~7MB) que travam o main thread na 1ª leitura.
  const dt = performance.now() - t0;
  if (dt > 100) console.info(`[cache] leitura fria "${key}": ${Math.round(dt)}ms (${lista.length} itens)`);
  cacheListas.set(key, lista as unknown[]);
  return [...lista];
}

export function gravarListaLocal<T>(key: string, data: T[]): void {
  // Guardamos uma copia rasa de `data` como novo valor do cache. O cache passa a
  // refletir o dado que o app tentou salvar, sem precisar reparsear na leitura
  // seguinte. Copia (nao o array recebido) para o cache nao seguir mutacoes
  // futuras que o chamador faca no array dele.
  const copia = [...data] as unknown[];
  try {
    gravarRawLocal(key, JSON.stringify(data)); // faz cacheListas.delete(key) internamente
  } finally {
    // DECISAO (quota): mesmo se gravarRawLocal lancar por quota estourada (chave
    // leve), deixamos o cache com o dado NOVO - o app segue coerente em memoria
    // com o que tentou salvar; o aviso de quota ('inv:quota-erro' + Error, ja
    // existentes) sinaliza que o disco nao acompanhou. O finally garante isso
    // apos o delete interno do gravarRawLocal, no sucesso e no erro.
    cacheListas.set(key, copia);
  }
}
