// Compressao transparente do espelho local do navegador.
//
// O localStorage tem teto de ~5-10 MB por site. O GeoJSON de inv_talhoes (todos
// os poligonos de todas as fazendas) e os dados de inv_condutividade sozinhos
// passam de 9 MB e estouram o limite - a partir dai NADA mais grava (nem uma
// importacao pequena). Aqui comprimimos com lz-string (SINCRONO - ao contrario do
// CompressionStream usado nos rasters em fertilidade.ts, que e assincrono e nao
// caberia no save/load sincrono do store) apenas as chaves pesadas, antes de
// gravar, e descomprimimos ao ler.
//
// A NUVEM (Supabase/Firestore) continua guardando JSON puro - isto e so o cache
// local. Retrocompativel: a leitura detecta o prefixo MARCA; valores antigos
// (JSON puro) e chaves fora da whitelist passam direto, sem conversao.

import * as LZString from 'lz-string';

// Prefixo que marca um valor comprimido. Nenhum JSON serializado (comeca com
// [ / { / aspas / digito) nem id/config do app comeca com esta sequencia, entao a
// deteccao e inequivoca.
const MARCA = '@@LZ@@';

// Chaves pesadas (geometria/grid) que valem a pena comprimir. Fora desta lista o
// valor e gravado como JSON puro - assim a Biblioteca (inv_bib_*) e as migracoes
// que leem cru continuam funcionando sem tocar em nada. Incluir uma chave aqui e
// seguro a qualquer momento: a LEITURA ja e sempre retrocompativel.
const COMPRIMIR = new Set<string>([
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
// TODO getter do store (getTalhoes, getFazendas...) chama lerListaLocal, que
// ate aqui fazia getItem + descompressao LZString (chaves de MBs) + JSON.parse
// da lista INTEIRA a CADA chamada, sem cache - o maior custo de CPU da app
// (40+ call sites, alguns componentes fazem 3+ leituras por render). Este cache
// guarda o resultado JA PARSEADO por chave.
//
// So cacheia o PARSE de LISTAS (lerListaLocal). lerRawLocal continua sem cache
// (serve para strings cruas). Invariante: o cache reflete o estado logico em
// memoria do app - toda escrita (gravarListaLocal/gravarRawLocal) o atualiza ou
// invalida, e escritas de OUTRAS abas o invalidam via evento 'storage'.
const cacheListas = new Map<string, unknown[]>();

// Registro (lazy, 1x, SSR-safe) do listener cross-tab. O evento 'storage' so
// dispara em abas que NAO fizeram a escrita - exatamente o que precisamos: se
// /coleta grava, /painel (mesma origem, outra aba) invalida sua entrada e
// reparsea na proxima leitura. e.key === null => localStorage.clear() (invalida
// tudo).
let listenerStorageRegistrado = false;
function registrarListenerStorage(): void {
  if (listenerStorageRegistrado || typeof window === 'undefined') return;
  listenerStorageRegistrado = true;
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key === null) { cacheListas.clear(); return; }
    cacheListas.delete(e.key);
  });
}

// Le a STRING JSON crua de uma chave (descomprime se estiver marcada). null se
// a chave nao existe. Funciona para QUALQUER chave (comprimida, JSON puro ou fora
// da whitelist).
export function lerRawLocal(key: string): string | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(key);
  if (raw == null) return null;
  if (raw.startsWith(MARCA)) {
    const json = LZString.decompressFromUTF16(raw.slice(MARCA.length)) as string | null;
    return json || null;
  }
  return raw;
}

// Grava uma STRING JSON, comprimindo se a chave estiver na whitelist. Se o
// localStorage estourar a quota, avisa via evento 'inv:quota-erro' (a UI pode
// escutar e mostrar um aviso) e relança um Error com mensagem clara em PT-BR -
// o chamador (store.ts/biblioteca.ts) decide o que fazer (ex.: ainda espelhar
// na nuvem).
export function gravarRawLocal(key: string, json: string): void {
  if (typeof window === 'undefined') return;
  // Invalida a entrada de lista: a string crua acabou de mudar (usado tambem pelo
  // boot da nuvem em cloud.ts/supabaseData.ts, que gravam JSON de listas por aqui).
  // A proxima lerListaLocal reparsea a partir da string nova.
  cacheListas.delete(key);
  const valor = COMPRIMIR.has(key) ? MARCA + LZString.compressToUTF16(json) : json;
  try {
    localStorage.setItem(key, valor);
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
// MISS -> caminho antigo (lerRawLocal + JSON.parse), guarda e devolve copia.
export function lerListaLocal<T>(key: string): T[] {
  registrarListenerStorage();
  const cached = cacheListas.get(key);
  if (cached) return [...cached] as T[];
  const json = lerRawLocal(key);
  let lista: T[];
  if (!json) {
    lista = [];
  } else {
    try { lista = JSON.parse(json) as T[]; } catch { lista = []; }
  }
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
    // DECISAO (quota): mesmo se gravarRawLocal lancar por quota estourada, deixamos
    // o cache com o dado NOVO - o app segue coerente em memoria com o que tentou
    // salvar; o aviso de quota ('inv:quota-erro' + Error, ja existentes) sinaliza
    // que o disco nao acompanhou. O finally garante isso apos o delete interno do
    // gravarRawLocal, tanto no sucesso quanto no erro.
    cacheListas.set(key, copia);
  }
}
