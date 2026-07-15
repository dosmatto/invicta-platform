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

// ── BOOT: hidrata o localStorage a partir do Postgres ────────────────────────
export async function bootSupabaseData(keysLista: string[], keysObj: string[]): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase não configurado.');

  await seedSeVazio(keysLista, keysObj);   // D3: 1ª vez carrega o Postgres do local

  // Chaves com pendência local não confirmada (lançamentos que a queda de
  // conexão impediu de subir): o boot NÃO pode sobrescrevê-las com a nuvem —
  // mescla por id (local vence) e re-envia depois da hidratação.
  const sujos = lerSujos();

  // Talhões (tabela dedicada) → inv_talhoes — paginado (pode passar de 1000).
  const talhoes = await lerTudoPaginado<{ dados: unknown }>(sb, 'talhoes', 'dados');
  {
    const nuvem = talhoes.map(r => r.dados);
    const final = sujos[TABELA_TALHOES_KEY] ? mesclarPorId(nuvem, lerLocalLista(TABELA_TALHOES_KEY)) : nuvem;
    gravarRawLocal(TABELA_TALHOES_KEY, JSON.stringify(final));
  }

  // app_kv → só as coleções de listas/config (os MAPAS ficam fora do boot) — paginado.
  const kv = await lerTudoPaginado<{ colecao: string; item_id: string; dados: unknown }>(
    sb, 'app_kv', 'colecao, item_id, dados', q => q.in('colecao', [...keysLista, ...keysObj]));
  const porColecao: Record<string, unknown[]> = {};
  const objs: Record<string, unknown> = {};
  for (const row of kv) {
    if (row.item_id === ITEM_OBJ) objs[row.colecao] = row.dados;
    else (porColecao[row.colecao] ??= []).push(row.dados);
  }
  for (const key of keysLista) {
    if (key === TABELA_TALHOES_KEY) continue;
    const nuvem = porColecao[key] ?? [];
    const final = sujos[key] ? mesclarPorId(nuvem, lerLocalLista(key)) : nuvem;
    gravarRawLocal(key, JSON.stringify(final));
  }
  for (const key of keysObj) {
    if (sujos[key]) continue;   // config local pendente vence — sobe no re-push abaixo
    const o = objs[key] as { valor?: string } | undefined;
    if (o?.valor != null) gravarRawLocal(key, o.valor);
  }

  bootCompleto = true;   // hidratação íntegra → a partir daqui o push pode podar órfãos com segurança

  // Re-envia as pendências recuperadas (mescladas acima). Fire-and-forget: a
  // fila serializa, marca/limpa a pendência e o SyncBadge mostra o estado.
  for (const key of Object.keys(sujos)) {
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
export async function salvarMapaSupabase(id: string, dados: object): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const up = await sb.from('app_kv').upsert(
    { colecao: COL_MAPAS, item_id: id, dados, atualizado_em: new Date().toISOString() },
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

export async function excluirDocSupabase(colecao: string, id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const r = await sb.from('app_kv').delete().eq('colecao', colecao).eq('item_id', id);
  if (r.error) console.warn(`[supabase] excluir ${colecao}:`, r.error.message);
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
