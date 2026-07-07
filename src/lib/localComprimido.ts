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
export function lerListaLocal<T>(key: string): T[] {
  const json = lerRawLocal(key);
  if (!json) return [];
  try { return JSON.parse(json) as T[]; } catch { return []; }
}

export function gravarListaLocal<T>(key: string, data: T[]): void {
  gravarRawLocal(key, JSON.stringify(data));
}
