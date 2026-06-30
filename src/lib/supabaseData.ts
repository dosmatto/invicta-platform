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

// Os dados vêm do Supabase? (login Supabase + interruptor de dados ligado)
export function usarDadosSupabase(): boolean {
  return supabaseConfigurado && process.env.NEXT_PUBLIC_USE_SUPABASE_DATA === 'true';
}

type Rec = { id?: unknown; empresaId?: string; fazendaId?: string; nome?: string; areaHa?: number };

// ── BOOT: hidrata o localStorage a partir do Postgres ────────────────────────
export async function bootSupabaseData(keysLista: string[], keysObj: string[]): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase não configurado.');

  // Talhões (tabela dedicada) → inv_talhoes
  const talhoes = await sb.from('talhoes').select('dados');
  if (talhoes.error) throw talhoes.error;
  localStorage.setItem(TABELA_TALHOES_KEY, JSON.stringify((talhoes.data ?? []).map(r => r.dados)));

  // app_kv → todas as outras coleções de uma vez
  const kv = await sb.from('app_kv').select('colecao, item_id, dados');
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
