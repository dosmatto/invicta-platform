'use client';

// Camada de DADOS no Supabase/Postgres (D1.2 da migração).
//
// Mantém o MESMO modelo do app: o front lê o localStorage de forma síncrona; aqui
// só substituímos o ESPELHO (antes Firestore, agora Postgres). No boot hidratamos
// o cache a partir do Postgres; em cada save gravamos lá.
//
// Roteamento: a lista `inv_talhoes` vai pra tabela relacional `talhoes` (com a
// coluna `geom` PostGIS — preenchida no D2); TODO o resto vai pra `app_kv`
// (colecao+item_id+dados jsonb), preservando os ids de string do app.
//
// Interruptor SEPARADO do login: só ativa com NEXT_PUBLIC_USE_SUPABASE_DATA=true,
// pra ligar o Auth Supabase não forçar os dados (evita tela vazia antes do import).

import { getSupabase, supabaseConfigurado } from './supabase';
import { lerRawLocal, gravarRawLocal, lerListaLocal } from './localComprimido';

const TABELA_TALHOES_KEY = 'inv_talhoes';
const ITEM_OBJ = '__obj__';  // item_id usado p/ guardar uma config (objeto único) no app_kv
const COL_MAPAS = 'inv_mapas_fert';  // coleção dos rasters no app_kv (carregada SOB DEMANDA, fora do boot)
const escLike = (s: string) => s.replace(/[\\%_]/g, c => '\\' + c);  // escapa curingas do LIKE (ids usam '__')

// Os dados vêm do Supabase? (login Supabase + interruptor de dados ligado)
export function usarDadosSupabase(): boolean {
  return supabaseConfigurado && process.env.NEXT_PUBLIC_USE_SUPABASE_DATA === 'true';
}

type Rec = { id?: unknown; empresaId?: string; fazendaId?: string; nome?: string; areaHa?: number };

function lerLocalLista(key: string): unknown[] {
  return lerListaLocal(key);
}

// ── Pendências "sujas" (gravadas no aparelho e AINDA não confirmadas na nuvem) ──
// Persistidas no localStorage para SOBREVIVER a recarregamento/fechamento da aba.
// Sem isso, o fluxo "lançou → conexão caiu → recarregou" perdia os lançamentos:
// a fila de retry vivia só na memória e o boot sobrescrevia o local com a nuvem.
const SUJO_KEY = 'inv_sync_sujo';

function lerSujos(): Record<string, true> {
  try { return JSON.parse(localStorage.getItem(SUJO_KEY) || '{}'); } catch { return {}; }
}
function marcarSujo(key: string) {
  if (typeof window === 'undefined') return;
  try { const s = lerSujos(); if (!s[key]) { s[key] = true; localStorage.setItem(SUJO_KEY, JSON.stringify(s)); } } catch {}
}
function limparSujo(key: string) {
  if (typeof window === 'undefined') return;
  try { const s = lerSujos(); if (s[key]) { delete s[key]; localStorage.setItem(SUJO_KEY, JSON.stringify(s)); } } catch {}
}

// União por id: registros da nuvem + registros locais (local VENCE no conflito,
// pois carrega edições ainda não sincronizadas). Locais sem correspondente na
// nuvem (lançamentos offline) são PRESERVADOS. Efeito colateral aceito: uma
// exclusão feita offline pode "ressuscitar" no merge — ressuscitar é reversível,
// perder lançamento não é.
function mesclarPorId(nuvem: unknown[], local: unknown[]): unknown[] {
  const mapa = new Map<string, unknown>();
  const extras: unknown[] = [];
  for (const r of nuvem) {
    const id = (r as Rec)?.id;
    if (id != null) mapa.set(String(id), r); else extras.push(r);
  }
  for (const r of local) {
    const id = (r as Rec)?.id;
    if (id != null) mapa.set(String(id), r); else extras.push(r);
  }
  return [...mapa.values(), ...extras];
}

// ── D3 — AUTO-CARGA: na 1ª vez (Postgres vazio), semeia a partir dos dados ────
// locais (que vieram do Firestore). Roda ANTES de hidratar, então a virada do
// interruptor preserva tudo sem script nem service_role. Idempotente: depois que
// o Postgres tem dados, não semeia de novo.
async function seedSeVazio(keysLista: string[], keysObj: string[]): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const [kv, tal] = await Promise.all([
    sb.from('app_kv').select('item_id', { count: 'exact', head: true }),
    sb.from('talhoes').select('id', { count: 'exact', head: true }),
  ]);
  if (kv.error || tal.error) throw (kv.error ?? tal.error);
  const vazio = (kv.count ?? 0) === 0 && (tal.count ?? 0) === 0;
  if (!vazio) return;

  const temLocal = keysLista.some(k => lerLocalLista(k).length > 0);
  if (!temLocal) return;  // nada local pra semear (ex.: navegador novo)

  console.log('[supabase] Postgres vazio — semeando a partir dos dados locais (1ª vez)…');
  for (const key of keysLista) {
    const arr = lerLocalLista(key);
    if (arr.length) await pushListaSupabase(key, arr);
  }
  for (const key of keysObj) {
    const v = lerRawLocal(key);
    if (v != null) await pushObjSupabase(key, v);
  }
  console.log('[supabase] seed concluído.');
}

// Lê TODAS as linhas de uma tabela paginando (PostgREST limita a 1000/consulta).
// Sem isso, bases grandes carregavam só as 1000 primeiras — hidratação parcial,
// e um push seguinte podava do Postgres tudo que "faltava" (perda de dados).
async function lerTudoPaginado<T>(
  sb: NonNullable<ReturnType<typeof getSupabase>>,
  tabela: string, colunas: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filtro?: (q: any) => any,
): Promise<T[]> {
  const PAGINA = 1000;
  const out: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = sb.from(tabela).select(colunas).range(de, de + PAGINA - 1);
    if (filtro) q = filtro(q);
    const r = await q;
    if (r.error) throw r.error;
    const linhas = (r.data ?? []) as T[];
    out.push(...linhas);
    if (linhas.length < PAGINA) break;   // última página
  }
  return out;
}

// Grava no localStorage SÓ se o conteúdo mudou — a compressão LZ de strings
// grandes (inv_talhoes ~7MB) a cada abertura era parte da lentidão do boot.
function gravarSeMudou(key: string, json: string): void {
  if (lerRawLocal(key) === json) return;   // comparação de string é barata; comprimir não
  gravarRawLocal(key, json);
}

// Semeia o espelho de diff com o estado da NUVEM: o 1º save da sessão passa a
// enviar só o que realmente mudou (antes re-enviava a coleção INTEIRA — 916
// talhões ≈ MBs — e disparava a poda not-in). Com o espelho semeado, a poda
// nunca roda em operação normal.
function seedEspelho(key: string, recs: unknown[]): void {
  const m = new Map<string, string>();
  for (const r of recs) {
    const id = (r as Rec)?.id;
    if (id != null) m.set(String(id), JSON.stringify(r));
  }
  espelhoSb[key] = m;
}

// ── BOOT INCREMENTAL ─────────────────────────────────────────────────────────
// Baixar a base INTEIRA (~MBs) a cada abertura custava ~9s de rede. Guardamos a
// marca d'água (maior atualizado_em visto) e, nas aberturas seguintes, baixamos
// SÓ o que mudou (2 counts + 2 consultas de delta ≈ <1s). Segurança:
//  - counts da nuvem ≠ counts locais → cai pro boot COMPLETO (pega exclusões);
//  - pendências locais (inv_sync_sujo) → boot COMPLETO (merge/espelho corretos);
//  - 1 boot completo forçado a cada 24h (reconcilia qualquer resíduo).
const MARCA_KEY = 'inv_boot_marca';
const FULL_EM_KEY = 'inv_boot_full_em';

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b; if (!b) return a; return a > b ? a : b;
}

async function bootIncremental(
  sb: NonNullable<ReturnType<typeof getSupabase>>,
  keysLista: string[], keysObj: string[], marca: string,
): Promise<boolean> {
  const t0 = performance.now();
  const todasCols = [...keysLista, ...keysObj];

  // counts + deltas em PARALELO (4 consultas pequenas)
  const [cT, cK, mudTal, mudKv] = await Promise.all([
    sb.from('talhoes').select('id', { count: 'exact', head: true }),
    sb.from('app_kv').select('item_id', { count: 'exact', head: true }).in('colecao', todasCols),
    lerTudoPaginado<{ dados: unknown; atualizado_em: string | null }>(
      sb, 'talhoes', 'dados, atualizado_em', q => q.gt('atualizado_em', marca)),
    lerTudoPaginado<{ colecao: string; item_id: string; dados: unknown; atualizado_em: string | null }>(
      sb, 'app_kv', 'colecao, item_id, dados, atualizado_em', q => q.in('colecao', todasCols).gt('atualizado_em', marca)),
  ]);
  if (cT.error || cK.error) throw (cT.error ?? cK.error);

  // counts locais têm que bater — senão houve exclusão/estado divergente → completo
  let localKv = 0;
  for (const key of keysLista) { if (key !== TABELA_TALHOES_KEY) localKv += lerLocalLista(key).length; }
  for (const key of keysObj) { if (lerRawLocal(key) != null) localKv += 1; }
  const localTal = lerLocalLista(TABELA_TALHOES_KEY).length;
  const espTal = localTal + contarNovos(mudTal, TABELA_TALHOES_KEY);
  const espKv = localKv + contarNovosKv(mudKv, keysLista, keysObj);
  if ((cT.count ?? -1) !== espTal || (cK.count ?? -1) !== espKv) {
    // divergência → boot completo reconcilia; o log diz ONDE divergiu (diagnóstico
    // de "todo boot cai no completo")
    console.info(`[boot] incremental descartado — counts divergem: talhões nuvem ${cT.count} × esperado ${espTal}; kv nuvem ${cK.count} × esperado ${espKv}`);
    return false;
  }

  let novaMarca: string | null = marca;

  // aplica delta dos talhões por id
  if (mudTal.length) {
    const lista = lerLocalLista(TABELA_TALHOES_KEY);
    const porId = new Map(lista.map(r => [String((r as Rec).id), r]));
    for (const row of mudTal) { porId.set(String((row.dados as Rec).id), row.dados); novaMarca = maxIso(novaMarca, row.atualizado_em); }
    const final = [...porId.values()];
    gravarSeMudou(TABELA_TALHOES_KEY, JSON.stringify(final));
    seedEspelho(TABELA_TALHOES_KEY, final);
  } else {
    seedEspelho(TABELA_TALHOES_KEY, lerLocalLista(TABELA_TALHOES_KEY));
  }

  // aplica delta do app_kv por coleção
  const porColecao = new Map<string, { item_id: string; dados: unknown }[]>();
  for (const row of mudKv) {
    (porColecao.get(row.colecao) ?? porColecao.set(row.colecao, []).get(row.colecao)!)
      .push({ item_id: row.item_id, dados: row.dados });
    novaMarca = maxIso(novaMarca, row.atualizado_em);
  }
  for (const key of keysLista) {
    if (key === TABELA_TALHOES_KEY) continue;
    const mudancas = porColecao.get(key);
    if (mudancas?.length) {
      const lista = lerLocalLista(key);
      const porId = new Map(lista.map(r => [String((r as Rec).id), r]));
      for (const m of mudancas) porId.set(m.item_id, m.dados);
      const final = [...porId.values()];
      gravarSeMudou(key, JSON.stringify(final));
      seedEspelho(key, final);
    } else {
      seedEspelho(key, lerLocalLista(key));
    }
  }
  for (const key of keysObj) {
    const o = porColecao.get(key)?.find(m => m.item_id === ITEM_OBJ)?.dados as { valor?: string } | undefined;
    if (o?.valor != null) gravarSeMudou(key, o.valor);
  }

  if (novaMarca) localStorage.setItem(MARCA_KEY, novaMarca);
  console.info(`[boot] INCREMENTAL: ${mudTal.length + mudKv.length} mudança(s) em ${Math.round(performance.now() - t0)}ms`);
  return true;
}

// Quantos registros do delta são NOVOS (não existem no local) — entram na conta
// de counts para não confundir "linha nova na nuvem" com divergência.
function contarNovos(mud: { dados: unknown }[], key: string): number {
  if (!mud.length) return 0;
  const ids = new Set(lerLocalLista(key).map(r => String((r as Rec).id)));
  return mud.filter(m => !ids.has(String((m.dados as Rec).id))).length;
}
function contarNovosKv(
  mud: { colecao: string; item_id: string }[], keysLista: string[], keysObj: string[],
): number {
  if (!mud.length) return 0;
  let n = 0;
  const idsPorCol = new Map<string, Set<string>>();
  for (const m of mud) {
    if (m.colecao === TABELA_TALHOES_KEY) continue;
    if (keysObj.includes(m.colecao)) { if (lerRawLocal(m.colecao) == null) n++; continue; }
    if (!keysLista.includes(m.colecao)) continue;
    let ids = idsPorCol.get(m.colecao);
    if (!ids) { ids = new Set(lerLocalLista(m.colecao).map(r => String((r as Rec).id))); idsPorCol.set(m.colecao, ids); }
    if (!ids.has(m.item_id)) n++;
  }
  return n;
}

// ── BOOT: hidrata o localStorage a partir do Postgres ────────────────────────
export async function bootSupabaseData(keysLista: string[], keysObj: string[]): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase não configurado.');
  const t0 = performance.now();

  // Caminho INCREMENTAL: marca presente, sem pendências locais e boot completo
  // recente (<24h). Qualquer divergência cai no caminho completo abaixo.
  const marca = typeof window !== 'undefined' ? localStorage.getItem(MARCA_KEY) : null;
  const fullEm = Number(localStorage.getItem(FULL_EM_KEY) || 0);
  const semPendencias = Object.keys(lerSujos()).length === 0;
  if (marca && semPendencias && Date.now() - fullEm < 24 * 3600e3) {
    try {
      if (await bootIncremental(sb, keysLista, keysObj, marca)) { bootCompleto = true; return; }
    } catch (e) { console.warn('[boot] incremental falhou — completo:', e); }
  } else {
    // por que o incremental nem foi tentado (diagnóstico de abertura lenta)
    console.info(`[boot] completo direto — ${!marca ? 'sem marca d\'água (1ª abertura neste navegador)'
      : !semPendencias ? `pendências locais de sync: ${Object.keys(lerSujos()).join(', ')}`
      : 'reconciliação periódica (>24h desde o último completo)'}`);
  }

  await seedSeVazio(keysLista, keysObj);   // D3: 1ª vez carrega o Postgres do local

  // Chaves com pendência local não confirmada (lançamentos que a queda de
  // conexão impediu de subir): o boot NÃO pode sobrescrevê-las com a nuvem —
  // mescla por id (local vence) e re-envia depois da hidratação.
  // IMPORTANTE: as flags são lidas NA HORA de gravar cada chave (não no início)
  // — um boot lento que termina em 2º plano precisa respeitar edições feitas
  // pelo usuário ENQUANTO ele rodava.
  const ehSujo = (key: string) => !!lerSujos()[key];

  // Talhões + app_kv em PARALELO (antes eram sequenciais — 2 esperas somadas),
  // trazendo atualizado_em p/ registrar a marca d'água do boot incremental.
  let novaMarca: string | null = null;
  const [talhoes, kv] = await Promise.all([
    lerTudoPaginado<{ dados: unknown; atualizado_em: string | null }>(sb, 'talhoes', 'dados, atualizado_em'),
    lerTudoPaginado<{ colecao: string; item_id: string; dados: unknown; atualizado_em: string | null }>(
      sb, 'app_kv', 'colecao, item_id, dados, atualizado_em', q => q.in('colecao', [...keysLista, ...keysObj])),
  ]);
  const tRede1 = performance.now();
  {
    for (const r of talhoes) novaMarca = maxIso(novaMarca, r.atualizado_em);
    const nuvem = talhoes.map(r => r.dados);
    const final = ehSujo(TABELA_TALHOES_KEY) ? mesclarPorId(nuvem, lerLocalLista(TABELA_TALHOES_KEY)) : nuvem;
    gravarSeMudou(TABELA_TALHOES_KEY, JSON.stringify(final));
    seedEspelho(TABELA_TALHOES_KEY, nuvem);   // espelho = estado da NUVEM (diffs certeiros)
  }
  for (const r of kv) novaMarca = maxIso(novaMarca, r.atualizado_em);
  const tRede2 = performance.now();
  const porColecao: Record<string, unknown[]> = {};
  const objs: Record<string, unknown> = {};
  for (const row of kv) {
    if (row.item_id === ITEM_OBJ) objs[row.colecao] = row.dados;
    else (porColecao[row.colecao] ??= []).push(row.dados);
  }
  for (const key of keysLista) {
    if (key === TABELA_TALHOES_KEY) continue;
    const nuvem = porColecao[key] ?? [];
    const final = ehSujo(key) ? mesclarPorId(nuvem, lerLocalLista(key)) : nuvem;
    gravarSeMudou(key, JSON.stringify(final));
    seedEspelho(key, nuvem);
  }
  for (const key of keysObj) {
    if (ehSujo(key)) continue;   // config local pendente vence — sobe no re-push abaixo
    const o = objs[key] as { valor?: string } | undefined;
    if (o?.valor != null) gravarSeMudou(key, o.valor);
  }

  bootCompleto = true;   // hidratação íntegra → a partir daqui o push pode podar órfãos com segurança
  // registra a marca d'água — as próximas aberturas baixam só o delta
  try {
    if (novaMarca) localStorage.setItem(MARCA_KEY, novaMarca);
    localStorage.setItem(FULL_EM_KEY, String(Date.now()));
  } catch {}
  const tFim = performance.now();
  console.info(`[boot] COMPLETO: talhões ${talhoes.length} + app_kv ${kv.length} em ${Math.round(tRede2 - t0)}ms (paralelo) · gravação local ${Math.round(tFim - tRede2)}ms · total ${Math.round(tFim - t0)}ms`);

  // Re-envia as pendências recuperadas (mescladas acima). Fire-and-forget: a
  // fila serializa, marca/limpa a pendência e o SyncBadge mostra o estado.
  for (const key of Object.keys(lerSujos())) {
    if (keysLista.includes(key)) void pushListaSupabase(key, lerLocalLista(key));
    else if (keysObj.includes(key)) { const v = lerRawLocal(key); if (v != null) void pushObjSupabase(key, v); }
    else limparSujo(key);   // chave que saiu da whitelist — pendência órfã
  }
}

// ── GRAVAÇÃO: fila por chave + diff por id + erro visível/retry ────────────────
//
// Antes: cada save reescrevia a coleção INTEIRA (upsert de tudo + delete not-in),
// sem fila (pushes concorrentes se sobrepunham: o delete de um push antigo podia
// apagar registro recém-criado por um mais novo) e com falha só em console.warn.
//
// Agora:
//  1. FILA POR CHAVE (promise-chain): pushes da mesma chave são serializados; se
//     chegarem várias gravações enquanto um push roda, só a ÚLTIMA fica pendente
//     (coalescing — as intermediárias são descartadas).
//  2. DIFF POR ID (espelho em memória): 1º push da sessão p/ a chave faz o sync
//     completo (poda órfãos remotos uma vez); os seguintes enviam upsert só dos
//     ids novos/alterados e delete só dos removidos.
//  3. ERRO VISÍVEL + RETRY: em falha, mantém a chave pendente e dispara o evento
//     `inv:sync` (status 'erro'); em sucesso, dispara 'ok'. Um listener de `online`
//     (registrado uma vez, lazy) re-tenta os pendentes.

// Espelho por chave (id → JSON.stringify(rec)); ausente = ainda não sincronizou
// nesta sessão (força o sync completo no 1º push).
const espelhoSb: Record<string, Map<string, string>> = {};

// Só depois de um boot ÍNTEGRO (paginado, sem erro) é seguro o 1º push podar
// órfãos remotos (delete not-in). Se o boot falhou/foi parcial, o local pode
// estar incompleto — nesse caso NUNCA apagamos do Postgres (só upsert), para
// não perder dados. Começa false e vira true no fim de bootSupabaseData.
let bootCompleto = false;

// Fila por chave: promise-chain do push em andamento (encadeia o próximo).
const filaSb: Record<string, Promise<void>> = {};
// Última lista pendente por chave (coalescing) — a mais recente vence.
const pendenteSb: Record<string, { lista: unknown[]; obj?: false } | { json: string; obj: true }> = {};
// Chaves que falharam e aguardam retry (guardam a última carga).
const errosSb: Record<string, { lista: unknown[]; obj?: false } | { json: string; obj: true }> = {};

let onlineRegistrado = false;

// Sinaliza o status do sync p/ a UI (SSR-safe).
function emitirSync(key: string, status: 'ok' | 'erro') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('inv:sync', { detail: { key, status } }));
}

// Registra (uma vez) o listener de reconexão que re-tenta as chaves pendentes.
function retentarPendentes() {
  for (const [key, carga] of Object.entries(errosSb)) {
    delete errosSb[key];
    enfileirar(key, carga);   // re-enfileira a última carga que falhou
  }
}

function garantirRetryOnline() {
  if (onlineRegistrado || typeof window === 'undefined') return;
  onlineRegistrado = true;
  // 'online' nem sempre dispara (conexão "cai" com o navegador achando que está
  // online — servidor fora, wifi fraco). Por isso re-tenta também ao voltar o
  // foco na aba e num relógio de 45 s enquanto houver pendência.
  window.addEventListener('online', retentarPendentes);
  window.addEventListener('focus', retentarPendentes);
  setInterval(() => {
    if (Object.keys(errosSb).length && navigator.onLine !== false) retentarPendentes();
  }, 45_000);
}

// Enfileira um push (lista ou obj) na chave, com coalescing e drenagem serial.
function enfileirar(
  key: string,
  carga: { lista: unknown[]; obj?: false } | { json: string; obj: true },
): Promise<void> {
  garantirRetryOnline();
  marcarSujo(key);           // pendência persistente: só limpa com sucesso confirmado
  pendenteSb[key] = carga;   // coalescing: a última carga pendente vence
  const anterior = filaSb[key] ?? Promise.resolve();
  const proxima = anterior
    .catch(() => {})          // isola a falha do anterior (não trava a fila)
    .then(async () => {
      const p = pendenteSb[key];
      if (!p) return;         // já drenado por um push que enfileirou depois
      delete pendenteSb[key];
      await drenar(key, p);
    });
  filaSb[key] = proxima;
  return proxima;
}

// Executa UM push já desenfileirado. Em falha, marca a chave como pendente de
// retry e emite 'erro'; em sucesso, emite 'ok'.
async function drenar(
  key: string,
  carga: { lista: unknown[]; obj?: false } | { json: string; obj: true },
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const ok = carga.obj
    ? await syncObj(sb, key, carga.json)
    : await syncLista(sb, key, carga.lista);
  if (ok) {
    delete errosSb[key];
    // Limpa a pendência persistente SÓ se não chegou carga mais nova enquanto
    // este push rodava (a mais nova re-marcou e ainda vai drenar).
    if (!pendenteSb[key]) limparSujo(key);
    emitirSync(key, 'ok');
  } else { errosSb[key] = carga; emitirSync(key, 'erro'); }
}

// Diff+sync de uma LISTA. Retorna true se gravou tudo sem erro.
// 1º push da chave (espelho ausente): sync completo (upsert de tudo + delete
// not-in — poda órfãos remotos). Seguintes: upsert só do que mudou, delete só
// do que saiu. O espelho SÓ é atualizado no sucesso (falha → retenta o diff).
async function syncLista(sb: NonNullable<ReturnType<typeof getSupabase>>, key: string, lista: unknown[]): Promise<boolean> {
  const recs = lista as Rec[];
  const agora = new Date().toISOString();
  const talhoes = key === TABELA_TALHOES_KEY;

  // Estado desejado: id → JSON do registro.
  const next = new Map<string, string>();
  for (const r of recs) next.set(String(r.id), JSON.stringify(r));

  const prev = espelhoSb[key];
  const primeira = prev === undefined;

  // Ids a fazer upsert (novos/alterados) e a deletar (saíram).
  let idsUpsert: string[];
  let idsDelete: string[];
  if (primeira) {
    idsUpsert = [...next.keys()];                 // tudo
    idsDelete = [];                                // no 1º push, poda via not-in
  } else {
    idsUpsert = [...next.keys()].filter(id => prev.get(id) !== next.get(id));
    idsDelete = [...prev.keys()].filter(id => !next.has(id));
    if (!idsUpsert.length && !idsDelete.length) return true;   // nada mudou
  }

  const recPorId = new Map<string, Rec>();
  for (const r of recs) recPorId.set(String(r.id), r);

  if (talhoes) {
    if (idsUpsert.length) {
      const rows = idsUpsert.map(id => {
        const r = recPorId.get(id)!;
        return { id, empresa_id: r.empresaId ?? null, fazenda_id: r.fazendaId ?? null,
          nome: r.nome ?? '', area_ha: r.areaHa ?? null, dados: r, atualizado_em: agora };
      });
      const up = await sb.from('talhoes').upsert(rows, { onConflict: 'id' });
      if (up.error) { console.warn('[supabase] upsert talhoes:', up.error.message); return false; }
    }
    if (primeira && bootCompleto) {
      // Poda órfãos remotos: apaga o que não está na lista atual (uma vez).
      // Só com boot íntegro — senão um local parcial apagaria dados reais.
      let del = sb.from('talhoes').delete();
      const ids = [...next.keys()];
      if (ids.length) del = del.not('id', 'in', `(${ids.join(',')})`);
      const d = await del;
      if (d.error) { console.warn('[supabase] delete talhoes:', d.error.message); return false; }
    } else if (!primeira && idsDelete.length) {
      const d = await sb.from('talhoes').delete().in('id', idsDelete);
      if (d.error) { console.warn('[supabase] delete talhoes:', d.error.message); return false; }
    }
  } else {
    if (idsUpsert.length) {
      const rows = idsUpsert.map(id => {
        const r = recPorId.get(id)!;
        return { colecao: key, item_id: id, empresa_id: r.empresaId ?? null, dados: r, atualizado_em: agora };
      });
      const up = await sb.from('app_kv').upsert(rows, { onConflict: 'colecao,item_id' });
      if (up.error) { console.warn(`[supabase] upsert ${key}:`, up.error.message); return false; }
    }
    if (primeira && bootCompleto) {
      // Poda órfãos remotos (uma vez) — só com boot íntegro (ver acima).
      let del = sb.from('app_kv').delete().eq('colecao', key);
      const ids = [...next.keys()];
      if (ids.length) del = del.not('item_id', 'in', `(${ids.join(',')})`);
      const d = await del;
      if (d.error) { console.warn(`[supabase] delete ${key}:`, d.error.message); return false; }
    } else if (!primeira && idsDelete.length) {
      const d = await sb.from('app_kv').delete().eq('colecao', key).in('item_id', idsDelete);
      if (d.error) { console.warn(`[supabase] delete ${key}:`, d.error.message); return false; }
    }
  }

  espelhoSb[key] = next;   // só atualiza o espelho no sucesso
  return true;
}

// Grava o obj único (1 linha). Retorna true se ok.
async function syncObj(sb: NonNullable<ReturnType<typeof getSupabase>>, key: string, json: string): Promise<boolean> {
  const up = await sb.from('app_kv').upsert(
    { colecao: key, item_id: ITEM_OBJ, dados: { valor: json }, atualizado_em: new Date().toISOString() },
    { onConflict: 'colecao,item_id' },
  );
  if (up.error) { console.warn(`[supabase] upsert obj ${key}:`, up.error.message); return false; }
  return true;
}

// API pública: enfileira o push da lista (fila por chave + diff + retry).
export async function pushListaSupabase(key: string, lista: unknown[]): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  return enfileirar(key, { lista });
}

// Config (objeto único, ex.: inv_etiqueta_cfg) → 1 linha no app_kv.
// Entra na mesma fila por chave e no mesmo tratamento de erro/pendência.
export async function pushObjSupabase(key: string, json: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  return enfileirar(key, { json, obj: true });
}

// ── Mapas (rasters) — D1.3 ────────────────────────────────────────────────────
// Ficam no app_kv na coleção COL_MAPAS, com o id encodando o contexto inteiro
// (talhao__importacao__metodo__…). Carregados SOB DEMANDA por prefixo (LIKE),
// fora do boot. Mesma API do cloud.ts (Firestore).
export async function salvarMapaSupabase(id: string, dados: object, atualizadoEm?: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const up = await sb.from('app_kv').upsert(
    { colecao: COL_MAPAS, item_id: id, dados, atualizado_em: atualizadoEm ?? new Date().toISOString() },
    { onConflict: 'colecao,item_id' },
  );
  if (up.error) console.warn('[supabase] salvar mapa:', up.error.message);
}

export async function carregarMapasPorPrefixoSupabase<T>(prefixo: string): Promise<Array<{ id: string; dados: T }>> {
  const sb = getSupabase();
  if (!sb) return [];
  const r = await sb.from('app_kv').select('item_id, dados')
    .eq('colecao', COL_MAPAS).like('item_id', escLike(prefixo) + '%');
  if (r.error) { console.warn('[supabase] carregar mapas:', r.error.message); return []; }
  return (r.data ?? []).map(row => ({ id: row.item_id as string, dados: row.dados as T }));
}

// Listagem LEVE por prefixo: só id + atualizado_em (KBs) — base do cache local
// de mapas (cloud.ts). null = falha (o chamador cai no caminho sem cache).
export async function listarIdsMapasPorPrefixoSupabase(
  prefixo: string,
): Promise<Array<{ id: string; atualizadoEm: string | null }> | null> {
  const sb = getSupabase();
  if (!sb) return [];
  const r = await sb.from('app_kv').select('item_id, atualizado_em')
    .eq('colecao', COL_MAPAS).like('item_id', escLike(prefixo) + '%');
  if (r.error) { console.warn('[supabase] listar ids de mapas:', r.error.message); return null; }
  return (r.data ?? []).map(row => ({ id: row.item_id as string, atualizadoEm: (row.atualizado_em as string | null) ?? null }));
}

// Baixa mapas completos por LISTA de ids (em lotes — o .in() vai na URL).
export async function carregarMapasPorIdsSupabase<T>(
  ids: string[],
): Promise<Array<{ id: string; dados: T; atualizadoEm: string | null }>> {
  const sb = getSupabase();
  if (!sb || !ids.length) return [];
  const out: Array<{ id: string; dados: T; atualizadoEm: string | null }> = [];
  const LOTE = 30;
  for (let i = 0; i < ids.length; i += LOTE) {
    const r = await sb.from('app_kv').select('item_id, dados, atualizado_em')
      .eq('colecao', COL_MAPAS).in('item_id', ids.slice(i, i + LOTE));
    if (r.error) { console.warn('[supabase] carregar mapas por ids:', r.error.message); continue; }
    for (const row of r.data ?? []) {
      out.push({ id: row.item_id as string, dados: row.dados as T, atualizadoEm: (row.atualizado_em as string | null) ?? null });
    }
  }
  return out;
}

// METADADOS de um mapa sem o raster: tudo da linha exceto dados->resp->grid
// (o grid é ~99% do peso). Serve para listar camadas (aba NDVI, PDF, Camadas
// salvas) sem baixar megabytes; o grid vem depois, sob demanda e com cache.
export interface MapaMetaSupabase {
  id: string;
  atualizadoEm: string | null;
  indice?: string | null;
  formula?: string | null;
  bandas?: string[] | null;
  mascara?: boolean | null;
  usuario?: string | null;
  criadoEm?: string | null;
  salvoEm?: string | null;
  bounds?: [number, number, number, number] | null;
  stats?: { n?: number; min?: number | null; max?: number | null; media?: number | null; nx?: number; ny?: number; pixel_m?: number; indice?: string } | null;
  cena?: { id?: string; data?: string | null; plataforma?: string | null; nuvem?: number | null } | null;
}

export async function listarMapasMetaPorPrefixoSupabase(prefixo: string): Promise<MapaMetaSupabase[] | null> {
  const sb = getSupabase();
  if (!sb) return [];
  const r = await sb.from('app_kv').select(
    'item_id, atualizado_em, indice:dados->>indice, formula:dados->>formula, bandas:dados->bandas, '
    + 'mascara:dados->mascara, usuario:dados->>usuario, criadoEm:dados->>criadoEm, salvoEm:dados->>salvoEm, '
    + 'bounds:dados->resp->bounds, stats:dados->resp->stats, cena:dados->resp->cena',
  ).eq('colecao', COL_MAPAS).like('item_id', escLike(prefixo) + '%');
  if (r.error) { console.warn('[supabase] listar mapas (meta):', r.error.message); return null; }
  return ((r.data ?? []) as unknown as Array<Record<string, unknown>>).map(x => {
    return {
      id: x.item_id as string,
      atualizadoEm: (x.atualizado_em as string | null) ?? null,
      indice: x.indice as string | null,
      formula: x.formula as string | null,
      bandas: x.bandas as string[] | null,
      mascara: x.mascara as boolean | null,
      usuario: x.usuario as string | null,
      criadoEm: x.criadoEm as string | null,
      salvoEm: x.salvoEm as string | null,
      bounds: x.bounds as [number, number, number, number] | null,
      stats: x.stats as MapaMetaSupabase['stats'],
      cena: x.cena as MapaMetaSupabase['cena'],
    };
  });
}

// Um mapa completo por id (grid incluso).
export async function carregarMapaSupabase<T>(id: string): Promise<{ id: string; dados: T; atualizadoEm: string | null } | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const r = await sb.from('app_kv').select('item_id, dados, atualizado_em')
    .eq('colecao', COL_MAPAS).eq('item_id', id).maybeSingle();
  if (r.error) { console.warn('[supabase] carregar mapa:', r.error.message); return null; }
  if (!r.data) return null;
  return { id: r.data.item_id as string, dados: r.data.dados as T, atualizadoEm: (r.data.atualizado_em as string | null) ?? null };
}

export async function excluirMapasPorPrefixoSupabase(prefixo: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const r = await sb.from('app_kv').delete().eq('colecao', COL_MAPAS).like('item_id', escLike(prefixo) + '%');
  if (r.error) console.warn('[supabase] excluir mapas:', r.error.message);
}

// Marca de conclusão da migração ÚNICA dos mapas (evita reler o Firestore sempre
// E garante que uma migração interrompida seja retomada até terminar por completo).
const MIG_MAPAS = { colecao: '__meta__', item_id: 'mapas_migrados' };

export async function mapasJaMigrados(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return true;  // sem Supabase, nada a migrar
  const r = await sb.from('app_kv').select('item_id', { count: 'exact', head: true })
    .eq('colecao', MIG_MAPAS.colecao).eq('item_id', MIG_MAPAS.item_id);
  if (r.error) return false;  // na dúvida, tenta migrar
  return (r.count ?? 0) > 0;
}

export async function marcarMapasMigrados(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('app_kv').upsert(
    { ...MIG_MAPAS, dados: { em: new Date().toISOString() }, atualizado_em: new Date().toISOString() },
    { onConflict: 'colecao,item_id' },
  );
}

// ── Coleções consultadas por CAMPO (ex.: talhaoId), fora do boot ──────────────
// Usadas por cenários (inv_cenarios), relatórios (inv_relatorios) e coletas de
// campo (inv_coletas). Guardadas no app_kv (colecao+item_id+dados), consultadas
// por um campo do jsonb. Retorna se gravou de fato (RLS/sessão podem recusar —
// o sync de campo usa isso pra NÃO marcar como enviado o que o servidor negou).
export async function salvarDocSupabase(colecao: string, id: string, dados: object): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const up = await sb.from('app_kv').upsert(
    { colecao, item_id: id, dados, atualizado_em: new Date().toISOString() },
    { onConflict: 'colecao,item_id' },
  );
  if (up.error) { console.warn(`[supabase] salvar ${colecao}:`, up.error.message); return false; }
  return true;
}

export async function carregarDocsPorCampoSupabase<T>(colecao: string, campo: string, valor: string): Promise<T[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const r = await sb.from('app_kv').select('dados').eq('colecao', colecao).eq(`dados->>${campo}`, valor);
  if (r.error) { console.warn(`[supabase] carregar ${colecao}:`, r.error.message); return []; }
  return (r.data ?? []).map(row => row.dados as T);
}

// Toda a coleção (ex.: repositório de medições no painel web).
export async function carregarColecaoSupabase<T>(colecao: string): Promise<T[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const r = await sb.from('app_kv').select('dados').eq('colecao', colecao);
  if (r.error) { console.warn(`[supabase] carregar coleção ${colecao}:`, r.error.message); return []; }
  return (r.data ?? []).map(row => row.dados as T);
}

// Devolve o nº de linhas excluídas: 0 sem erro = nada apagado (id inexistente
// OU RLS sem política de DELETE — que falha em silêncio). O chamador decide se
// isso é erro; antes a falha era invisível ("cliquei no lixo e não apagou").
export async function excluirDocSupabase(colecao: string, id: string): Promise<number> {
  const sb = getSupabase();
  if (!sb) return 0;
  const r = await sb.from('app_kv').delete({ count: 'exact' }).eq('colecao', colecao).eq('item_id', id);
  if (r.error) {
    console.warn(`[supabase] excluir ${colecao}:`, r.error.message);
    throw new Error(`Falha ao excluir na nuvem: ${r.error.message}`);
  }
  return r.count ?? 0;
}

// Apaga por prefixo de item_id em QUALQUER coleção (ex.: inv_cenarios id `cen_<talhao>_…`).
export async function excluirDocsPorPrefixoSupabase(colecao: string, prefixo: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const r = await sb.from('app_kv').delete().eq('colecao', colecao).like('item_id', escLike(prefixo) + '%');
  if (r.error) console.warn(`[supabase] excluir por prefixo ${colecao}:`, r.error.message);
}

// Apaga TODOS os docs de uma coleção (usado na limpeza total da base).
export async function excluirColecaoSupabase(colecao: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const r = await sb.from('app_kv').delete().eq('colecao', colecao);
  if (r.error) console.warn(`[supabase] excluir coleção ${colecao}:`, r.error.message);
}

// Flag genérica de "coleção já migrada do Firestore" (evita reler).
export async function colecaoJaMigrada(nome: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return true;
  const r = await sb.from('app_kv').select('item_id', { count: 'exact', head: true })
    .eq('colecao', '__meta__').eq('item_id', `mig_${nome}`);
  if (r.error) return false;
  return (r.count ?? 0) > 0;
}
export async function marcarColecaoMigrada(nome: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('app_kv').upsert(
    { colecao: '__meta__', item_id: `mig_${nome}`, dados: { em: new Date().toISOString() }, atualizado_em: new Date().toISOString() },
    { onConflict: 'colecao,item_id' },
  );
}
