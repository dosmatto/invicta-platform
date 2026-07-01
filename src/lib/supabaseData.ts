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
  try { return JSON.parse(localStorage.getItem(key) ?? '[]'); } catch { return []; }
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
    const v = localStorage.getItem(key);
    if (v != null) await pushObjSupabase(key, v);
  }
  console.log('[supabase] seed concluído.');
}

// ── BOOT: hidrata o localStorage a partir do Postgres ────────────────────────
export async function bootSupabaseData(keysLista: string[], keysObj: string[]): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase não configurado.');

  await seedSeVazio(keysLista, keysObj);   // D3: 1ª vez carrega o Postgres do local

  // Talhões (tabela dedicada) → inv_talhoes
  const talhoes = await sb.from('talhoes').select('dados');
  if (talhoes.error) throw talhoes.error;
  localStorage.setItem(TABELA_TALHOES_KEY, JSON.stringify((talhoes.data ?? []).map(r => r.dados)));

  // app_kv → só as coleções de listas/config (os MAPAS ficam fora do boot)
  const kv = await sb.from('app_kv').select('colecao, item_id, dados').in('colecao', [...keysLista, ...keysObj]);
  if (kv.error) throw kv.error;
  const porColecao: Record<string, unknown[]> = {};
  const objs: Record<string, unknown> = {};
  for (const row of kv.data ?? []) {
    if (row.item_id === ITEM_OBJ) objs[row.colecao] = row.dados;
    else (porColecao[row.colecao] ??= []).push(row.dados);
  }
  for (const key of keysLista) {
    if (key === TABELA_TALHOES_KEY) continue;
    localStorage.setItem(key, JSON.stringify(porColecao[key] ?? []));
  }
  for (const key of keysObj) {
    const o = objs[key] as { valor?: string } | undefined;
    if (o?.valor != null) localStorage.setItem(key, o.valor);
  }
}

// ── GRAVAÇÃO: upsert da lista inteira + remoção do que saiu ───────────────────
export async function pushListaSupabase(key: string, lista: unknown[]): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const recs = lista as Rec[];
  const ids = recs.map(r => String(r.id));
  const agora = new Date().toISOString();

  if (key === TABELA_TALHOES_KEY) {
    const rows = recs.map(r => ({
      id: String(r.id), empresa_id: r.empresaId ?? null, fazenda_id: r.fazendaId ?? null,
      nome: r.nome ?? '', area_ha: r.areaHa ?? null, dados: r, atualizado_em: agora,
    }));
    if (rows.length) {
      const up = await sb.from('talhoes').upsert(rows, { onConflict: 'id' });
      if (up.error) { console.warn('[supabase] upsert talhoes:', up.error.message); return; }
    }
    let del = sb.from('talhoes').delete();
    if (ids.length) del = del.not('id', 'in', `(${ids.join(',')})`);
    const d = await del;
    if (d.error) console.warn('[supabase] delete talhoes:', d.error.message);
    return;
  }

  const rows = recs.map(r => ({
    colecao: key, item_id: String(r.id), empresa_id: r.empresaId ?? null, dados: r, atualizado_em: agora,
  }));
  if (rows.length) {
    const up = await sb.from('app_kv').upsert(rows, { onConflict: 'colecao,item_id' });
    if (up.error) { console.warn(`[supabase] upsert ${key}:`, up.error.message); return; }
  }
  let del = sb.from('app_kv').delete().eq('colecao', key);
  if (ids.length) del = del.not('item_id', 'in', `(${ids.join(',')})`);
  const d = await del;
  if (d.error) console.warn(`[supabase] delete ${key}:`, d.error.message);
}

// Config (objeto único, ex.: inv_etiqueta_cfg) → 1 linha no app_kv.
export async function pushObjSupabase(key: string, json: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const up = await sb.from('app_kv').upsert(
    { colecao: key, item_id: ITEM_OBJ, dados: { valor: json }, atualizado_em: new Date().toISOString() },
    { onConflict: 'colecao,item_id' },
  );
  if (up.error) console.warn(`[supabase] upsert obj ${key}:`, up.error.message);
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
// Usadas por cenários (inv_cenarios) e relatórios (inv_relatorios). Guardadas no
// app_kv (colecao+item_id+dados), consultadas por um campo do jsonb.
export async function salvarDocSupabase(colecao: string, id: string, dados: object): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const up = await sb.from('app_kv').upsert(
    { colecao, item_id: id, dados, atualizado_em: new Date().toISOString() },
    { onConflict: 'colecao,item_id' },
  );
  if (up.error) console.warn(`[supabase] salvar ${colecao}:`, up.error.message);
}

export async function carregarDocsPorCampoSupabase<T>(colecao: string, campo: string, valor: string): Promise<T[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const r = await sb.from('app_kv').select('dados').eq('colecao', colecao).eq(`dados->>${campo}`, valor);
  if (r.error) { console.warn(`[supabase] carregar ${colecao}:`, r.error.message); return []; }
  return (r.data ?? []).map(row => row.dados as T);
}

export async function excluirDocSupabase(colecao: string, id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const r = await sb.from('app_kv').delete().eq('colecao', colecao).eq('item_id', id);
  if (r.error) console.warn(`[supabase] excluir ${colecao}:`, r.error.message);
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
