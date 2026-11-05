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

import { escritaBloqueada, registroBloqueado, somenteLeitura } from './somenteLeitura';
import { getSupabase, supabaseConfigurado } from './supabase';
import { marcarGravacaoLocal, editadaDuranteBoot, chavesEditadasDuranteBoot, mesclarGravacoes, type RegistroGravacoes } from './janelaBoot';
import { lerRawLocal, gravarRawLocal, lerListaLocal } from './localComprimido';
import { mapaPorId, calcularEdicoes, mesclarComEdicoes, idsDoEnvio, idsParaJuncao, confirmarEnvio, podarIguaisANuvem, type IdsEditados } from './edicoesSync';

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
/**
 * Marca uma chave como PENDENTE de subida sem ter havido gravação nenhuma.
 *
 * Caso de uso único: chave que passou a sincronizar AGORA e ainda não existe na
 * nuvem. Sem esta marca o boot completo lê `porColecao[key] ?? []` e grava esse
 * vazio por cima do que já estava no navegador (ver o laço de `keysLista` no
 * fim de `bootSupabaseData`). Marcada, ela cai no ramo `mesclarPorId`, onde o
 * local vence, e sobe no re-push do fim do boot.
 *
 * Marca também os ids no modo `todos`: aqui a lista local INTEIRA é o que tem
 * de subir (a nuvem não tem nada da chave) — sem isso o envio por registro não
 * acharia nenhum id editado e não subiria nada.
 *
 * Exportado com nome próprio em vez de `marcarSujo` cru: "sujo" descreve o
 * mecanismo, não o motivo, e este é o único motivo legítimo de fora daqui.
 */
export function marcarPendenteSupabase(key: string) {
  gravarIdsEditados(key, { up: [], del: [], todos: true });
  marcarSujo(key);
}

function limparSujo(key: string) {
  if (typeof window === 'undefined') return;
  try { const s = lerSujos(); if (s[key]) { delete s[key]; localStorage.setItem(SUJO_KEY, JSON.stringify(s)); } } catch {}
}

// ── QUAIS registros este aparelho editou (e ainda não confirmou na nuvem) ─────
//
// O BUG (31/10/2026, 1102 talhões regravados num envio só): a pendência "suja"
// era por CHAVE, não por registro. Saber só que "inv_talhoes mudou" obrigava a
// tratar a lista local INTEIRA como verdade em dois lugares:
//   · 1º envio da sessão sem espelho (boot que estourou os 12s do AppContext,
//     ou que falhou): subia TODOS os registros locais;
//   · boot com pendência: a junção dava vitória ao local em TODOS os ids.
// Se a cópia local era anterior à edição de outra pessoa/aparelho, aquela
// edição era desfeita na nuvem — e o limite antigo do talhão "voltava".
//
// Agora cada gravação compara a lista nova com a última lista conhecida deste
// aparelho (`baseLocal`) e anota os ids que de fato mudaram. Envio e junção do
// boot só dão vitória ao local NESSES ids. Persistido para sobreviver a
// recarga/fechamento da aba, como a pendência por chave.
//
// `baseLocal` nasce no INÍCIO do boot (as chaves pesadas já estão hidratadas —
// ver AppContext) e passa a ser a lista final que o boot gravou; depois, a
// última lista enviada. Sem base (envio antes de qualquer boot), o registro
// vira `todos` — o comportamento antigo, só para não perder uma gravação.
const IDS_KEY = 'inv_sync_ids';

const baseLocal: Record<string, Map<string, string>> = {};

function lerTodosIds(): Record<string, IdsEditados> {
  try { return JSON.parse(localStorage.getItem(IDS_KEY) || '{}'); } catch { return {}; }
}
/** Ids editados desta chave; `null` = sem registro (pendência antiga, de antes desta versão). */
function lerIdsEditados(key: string): IdsEditados | null {
  if (typeof window === 'undefined') return null;
  return lerTodosIds()[key] ?? null;
}
function gravarIdsEditados(key: string, v: IdsEditados): void {
  try {
    const t = lerTodosIds();
    t[key] = v;
    localStorage.setItem(IDS_KEY, JSON.stringify(t));
  } catch { /* cota cheia: a chave fica sem registro e cai no ramo antigo */ }
}
function limparIdsEditados(key: string): void {
  if (typeof window === 'undefined') return;
  try { const t = lerTodosIds(); if (t[key]) { delete t[key]; localStorage.setItem(IDS_KEY, JSON.stringify(t)); } } catch {}
}

/**
 * Boot completo, uma lista: grava no local o resultado da junção com a nuvem.
 * Sem pendência, a nuvem manda (e ids antigos do registro deixam de valer).
 * Com pendência, o local só vence nos ids de idsParaJuncao — que passam a ser
 * o registro, para o re-envio do fim do boot subir exatamente esses.
 */
function juntarNoBoot(key: string, nuvem: unknown[], sujo: boolean): void {
  let final = nuvem;
  if (sujo) {
    const local = lerLocalLista(key);
    const ids = idsParaJuncao(lerIdsEditados(key), baseLocal[key], local, nuvem);
    final = mesclarComEdicoes(nuvem, local, ids);
    if (!ids.todos) {
      // Só fica no registro o que de fato difere do retrato da nuvem.
      const fin = mapaPorId(final), nv = mapaPorId(nuvem);
      const resto = podarIguaisANuvem(ids, id => fin.get(id), id => nv.get(id));
      if (resto) gravarIdsEditados(key, resto); else limparIdsEditados(key);
    }
  } else {
    limparIdsEditados(key);
  }
  gravarSeMudou(key, JSON.stringify(final));
  seedEspelho(key, nuvem);   // espelho = estado da NUVEM (diffs certeiros)
  baseLocal[key] = mapaPorId(final);
}

/** Anota os ids que mudaram entre a base deste aparelho e `lista`; a base vira `lista`. */
function registrarEdicoes(key: string, lista: unknown[]): void {
  if (typeof window === 'undefined') return;
  const nova = mapaPorId(lista);
  const base = baseLocal[key];
  baseLocal[key] = nova;
  if (!base) console.warn(`[sync] ${key}: gravação sem base conhecida — envio cai no modo antigo (lista inteira).`);
  const r = calcularEdicoes(base, nova, lerIdsEditados(key));
  if (r) gravarIdsEditados(key, r);
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
    // Postgres vazio: aqui a lista inteira É o que tem de subir (modo `todos`).
    if (arr.length) { gravarIdsEditados(key, { up: [], del: [], todos: true }); await pushListaSupabase(key, arr); }
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
//
// ORDEM EXPLÍCITA (obrigatória): sem ORDER BY o Postgres devolve as linhas na
// ordem que quiser — e ela MUDA com o tempo (um UPDATE move a linha de lugar).
// Duas consequências, ambas já observadas:
//   1. paginar com .range() sem ordem pode repetir/pular registros entre páginas;
//   2. a ordem do array no localStorage virava sorteio a cada boot — e quem
//      escolhe "a primeira legenda do atributo" passava a pegar outra legenda,
//      trocando sozinho o estilo/cores do mapa (v2.8.8).
async function lerTudoPaginado<T>(
  sb: NonNullable<ReturnType<typeof getSupabase>>,
  tabela: string, colunas: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filtro?: (q: any) => any,
  ordem: string[] = ['id'],
): Promise<T[]> {
  const PAGINA = 1000;
  const out: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = sb.from(tabela).select(colunas).range(de, de + PAGINA - 1);
    for (const col of ordem) q = q.order(col, { ascending: true });
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
  chavesHidratadas.add(key);
  espelhoSb[key] = mapaPorId(recs);
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
  const inicioBoot = Date.now();   // marco da janela (ver janelaBoot.ts)
  const todasCols = [...keysLista, ...keysObj];

  // counts + deltas em PARALELO (4 consultas pequenas)
  const [cT, cK, mudTal, mudKv] = await Promise.all([
    sb.from('talhoes').select('id', { count: 'exact', head: true }),
    sb.from('app_kv').select('item_id', { count: 'exact', head: true }).in('colecao', todasCols),
    lerTudoPaginado<{ dados: unknown; atualizado_em: string | null }>(
      sb, 'talhoes', 'dados, atualizado_em', q => q.gt('atualizado_em', marca)),
    lerTudoPaginado<{ colecao: string; item_id: string; dados: unknown; atualizado_em: string | null }>(
      sb, 'app_kv', 'colecao, item_id, dados, atualizado_em',
      q => q.in('colecao', todasCols).gt('atualizado_em', marca), ['colecao', 'item_id']),
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

  // Chave editada localmente DEPOIS que este boot começou: o delta em mãos é
  // anterior à edição. Antes, o local vencia e a lista INTEIRA era reenviada —
  // e, sem espelho, isso subia todos os registros locais, inclusive os velhos,
  // por cima do que outros aparelhos tinham gravado (31/10/2026: 1102 talhões).
  // Agora o incremental desiste e o boot COMPLETO assume: ele baixa tudo e junta
  // por registro (mesclarComEdicoes), dando vitória ao local só nos ids editados.
  // Conferido aqui, depois do último await — daqui até o fim não há espera.
  const editadaAgora = (key: string) => editadaDuranteBoot(gravacoes(), key, inicioBoot);
  const editadas = [...keysLista, ...keysObj].filter(editadaAgora);
  if (editadas.length) {
    console.info(`[boot] incremental descartado — edições durante o boot em: ${editadas.join(', ')}`);
    return false;
  }

  // aplica delta dos talhões por id
  if (mudTal.length) {
    const lista = lerLocalLista(TABELA_TALHOES_KEY);
    const porId = new Map(lista.map(r => [String((r as Rec).id), r]));
    for (const row of mudTal) { porId.set(String((row.dados as Rec).id), row.dados); novaMarca = maxIso(novaMarca, row.atualizado_em); }
    const final = [...porId.values()];
    gravarSeMudou(TABELA_TALHOES_KEY, JSON.stringify(final));
    seedEspelho(TABELA_TALHOES_KEY, final);
    baseLocal[TABELA_TALHOES_KEY] = mapaPorId(final);
  } else {
    const lista = lerLocalLista(TABELA_TALHOES_KEY);
    seedEspelho(TABELA_TALHOES_KEY, lista);
    baseLocal[TABELA_TALHOES_KEY] = mapaPorId(lista);
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
      baseLocal[key] = mapaPorId(final);
    } else {
      const lista = lerLocalLista(key);
      seedEspelho(key, lista);
      baseLocal[key] = mapaPorId(lista);
    }
  }
  for (const key of keysObj) {
    const o = porColecao.get(key)?.find(m => m.item_id === ITEM_OBJ)?.dados as { valor?: string } | undefined;
    if (o?.valor != null) gravarSeMudou(key, o.valor);
  }

  if (novaMarca) localStorage.setItem(MARCA_KEY, novaMarca);
  // Incremental só roda sem pendência e sem edição na janela: local = nuvem.
  for (const key of keysLista) limparIdsEditados(key);
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
  const inicioBoot = Date.now();   // marco da janela: nada gravado depois disto é sobrescrito

  // Base de comparação das gravações desta sessão (ver registrarEdicoes): o
  // retrato local de ANTES de qualquer edição. O AppContext hidrata as chaves
  // pesadas antes de chamar o boot, então inv_talhoes já está inteiro aqui.
  for (const key of keysLista) if (!baseLocal[key]) baseLocal[key] = mapaPorId(lerLocalLista(key));

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
  // mescla por id (local vence SÓ nos ids editados aqui — mesclarComEdicoes) e
  // re-envia depois da hidratação.
  // IMPORTANTE: as flags são lidas NA HORA de gravar cada chave (não no início)
  // — um boot lento que termina em 2º plano precisa respeitar edições feitas
  // pelo usuário ENQUANTO ele rodava.
  // "Suja" agora inclui a chave EDITADA ENQUANTO o boot rodava, mesmo que o push
  // dela já tenha confirmado (aí a pendência foi limpa e a checagem antiga
  // deixava o retrato velho passar por cima). Ver lib/janelaBoot.ts.
  const ehSujo = (key: string) =>
    !!lerSujos()[key] || editadaDuranteBoot(gravacoes(), key, inicioBoot);

  // Talhões + app_kv em PARALELO (antes eram sequenciais — 2 esperas somadas),
  // trazendo atualizado_em p/ registrar a marca d'água do boot incremental.
  let novaMarca: string | null = null;
  const [talhoes, kv] = await Promise.all([
    lerTudoPaginado<{ dados: unknown; atualizado_em: string | null }>(sb, 'talhoes', 'dados, atualizado_em'),
    lerTudoPaginado<{ colecao: string; item_id: string; dados: unknown; atualizado_em: string | null }>(
      sb, 'app_kv', 'colecao, item_id, dados, atualizado_em',
      q => q.in('colecao', [...keysLista, ...keysObj]), ['colecao', 'item_id']),
  ]);
  const tRede1 = performance.now();
  {
    for (const r of talhoes) novaMarca = maxIso(novaMarca, r.atualizado_em);
    juntarNoBoot(TABELA_TALHOES_KEY, talhoes.map(r => r.dados), ehSujo(TABELA_TALHOES_KEY));
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
    juntarNoBoot(key, porColecao[key] ?? [], ehSujo(key));
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
  const editadasNaJanela = chavesEditadasDuranteBoot(gravacoes(), [...keysLista, ...keysObj], inicioBoot);
  for (const key of new Set([...Object.keys(lerSujos()), ...editadasNaJanela])) {
    if (keysLista.includes(key)) void pushListaSupabase(key, lerLocalLista(key));
    else if (keysObj.includes(key)) { const v = lerRawLocal(key); if (v != null) void pushObjSupabase(key, v); }
    else limparSujo(key);   // chave que saiu da whitelist — pendência órfã
  }
  if (editadasNaJanela.length) {
    console.info('[boot] edições feitas durante o boot preservadas (nuvem não sobrescreveu):', editadasNaJanela.join(', '));
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

// Coleções que ESTE boot realmente hidratou. A poda de órfãos (delete not-in) só
// pode rodar sobre elas: uma coleção que o boot nem baixou tem estado local
// vazio ou semeado do zero, e podar a partir daí APAGA o cadastro real na nuvem.
// O app de coleta boota com uma lista reduzida (KEYS_LISTA_CAMPO) — as de fora
// nunca passam por aqui.
const chavesHidratadas = new Set<string>();

// Fila por chave: promise-chain do push em andamento (encadeia o próximo).
const filaSb: Record<string, Promise<void>> = {};
// Última lista pendente por chave (coalescing) — a mais recente vence.
const pendenteSb: Record<string, { lista: unknown[]; obj?: false } | { json: string; obj: true }> = {};
// Chaves que falharam e aguardam retry (guardam a última carga).
const errosSb: Record<string, { lista: unknown[]; obj?: false } | { json: string; obj: true }> = {};

// Quando cada chave foi gravada LOCALMENTE (todo save que espelha na nuvem passa
// por enfileirar). O boot compara com o instante em que COMEÇOU: o retrato da
// nuvem que ele tem em mãos é anterior a qualquer edição feita depois disso, e
// gravá-lo por cima apagaria a edição. Ver lib/janelaBoot.ts — npm run teste:janela.
const gravadoLocalEm: RegistroGravacoes = {};

// …e a mesma anotação PERSISTIDA, para valer entre abas e entre sessões (a de
// cima é memória desta aba). Ver janelaBoot.mesclarGravacoes.
const GRAVADO_KEY = 'inv_sync_gravado';
function lerGravadosPersistidos(): RegistroGravacoes {
  try { return JSON.parse(localStorage.getItem(GRAVADO_KEY) || '{}'); } catch { return {}; }
}
function persistirGravacao(key: string, agora: number): void {
  if (typeof window === 'undefined') return;
  try {
    const m = lerGravadosPersistidos();
    m[key] = agora;
    localStorage.setItem(GRAVADO_KEY, JSON.stringify(m));
  } catch { /* cota cheia: segue só com a memória desta aba */ }
}
/** Registro completo (memória desta aba + persistido de todas). */
function gravacoes(): RegistroGravacoes {
  return mesclarGravacoes(gravadoLocalEm, lerGravadosPersistidos());
}

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
    // Reenvia o estado ATUAL, não a carga que falhou: entre a falha e o retry o
    // usuário pode ter editado de novo, e a carga velha drenaria DEPOIS da nova
    // — desfazendo a edição e, pior, apagando na nuvem (idsDelete) os itens que
    // ela criou. Se o estado atual não for legível, cai na carga antiga.
    if (carga.obj) {
      const json = lerRawLocal(key);
      enfileirar(key, json != null ? { json, obj: true } : carga);
    } else {
      const lista = lerLocalLista(key);
      enfileirar(key, lista.length ? { lista } : carga);
    }
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
  const agoraMs = Date.now();
  marcarGravacaoLocal(gravadoLocalEm, key, agoraMs);   // janela do boot (ver janelaBoot.ts)
  persistirGravacao(key, agoraMs);                     // …visível para as outras abas
  if (!carga.obj) registrarEdicoes(key, carga.lista);   // QUAIS ids mudaram (antes de marcar a chave)
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
    // (Os ids editados saem um a um dentro do syncLista — confirmarEnvio.)
    if (!pendenteSb[key]) limparSujo(key);
    emitirSync(key, 'ok');
  } else { errosSb[key] = carga; emitirSync(key, 'erro'); }
}

/**
 * Espera a fila de envio destas chaves esvaziar (push em voo + pendente).
 *
 * Para gravações em LOTE (Importador de migração): sem esperar, o coalescing
 * juntaria vários lotes num push só — o diff carregaria as linhas de todos
 * eles num POST único e o tamanho do lote deixaria de ser o limite do envio.
 * Esperando entre um lote e outro, cada POST leva só as linhas daquele lote.
 * Falha de envio não lança: a chave fica marcada como suja e o retry de
 * sempre (online/foco/45 s) reenvia.
 */
export async function aguardarFilaSupabase(keys: string[]): Promise<void> {
  for (let volta = 0; volta < 10; volta++) {
    const emVoo = keys.map(k => filaSb[k]).filter((p): p is Promise<void> => !!p);
    if (emVoo.length === 0) return;
    await Promise.all(emVoo.map(p => p.catch(() => {})));
    if (keys.every(k => !pendenteSb[k])) return;
  }
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
  // Direito de PODAR decidido AGORA, junto com `primeira` — não depois do await
  // do upsert. Entre uma coisa e outra o boot pode terminar e virar bootCompleto:
  // a poda rodaria contra a lista velha (a que este push começou a subir) e
  // apagaria da nuvem o que o boot acabou de trazer. Ver o teste de auto-cadastro
  // (npm run teste:autocadastro), passo B.
  let podePodar = primeira && bootCompleto && chavesHidratadas.has(key);

  // POR REGISTRO (o normal): só sobem os ids que este aparelho editou
  // (registrarEdicoes). Uma lista local velha nunca mais vai inteira para a
  // nuvem — nem no 1º envio sem espelho (boot que estourou os 12s), nem num
  // diff contra um espelho que ficou para trás. `todos` = modo antigo (envio
  // antes de qualquer boot, seed do Postgres vazio).
  // Ids a fazer upsert (novos/alterados) e a deletar (saíram) — ver idsDoEnvio.
  const envio = idsDoEnvio(next, prev, lerIdsEditados(key));
  const porRegistro = envio.porRegistro;
  let idsUpsert = envio.upsert;
  let idsDelete = envio.del;
  if (porRegistro) podePodar = false;              // poda por not-in só existe no modo antigo
  // Nada a enviar. (No 1º envio do modo antigo não sai daqui: a poda ainda roda.)
  if (!(primeira && !porRegistro) && !idsUpsert.length && !idsDelete.length) {
    podarRegistroIgualANuvem(key);
    return true;
  }

  const recPorId = new Map<string, Rec>();
  for (const r of recs) recPorId.set(String(r.id), r);

  // Produtor: só sobe o que é de talhão DELE (a RLS recusaria o lote inteiro por
  // um registro alheio). O que fica de fora é alteração local em dado de outro
  // talhão — some no próximo boot, porque a nuvem manda. Poda, nunca.
  if (somenteLeitura()) {
    idsUpsert = idsUpsert.filter(id => !registroBloqueado(key, id, recPorId.get(id)));
    idsDelete = idsDelete.filter(id => {
      let antes: unknown;
      try { antes = JSON.parse(prev?.get(id) ?? 'null'); } catch { antes = null; }
      return !registroBloqueado(key, id, antes);
    });
    podePodar = false;
  }

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
    if (podePodar) {
      // Poda órfãos remotos: apaga o que não está na lista atual (uma vez).
      // Só com boot íntegro — senão um local parcial apagaria dados reais.
      let del = sb.from('talhoes').delete();
      const ids = [...next.keys()];
      if (ids.length) del = del.not('id', 'in', `(${ids.join(',')})`);
      const d = await del;
      if (d.error) { console.warn('[supabase] delete talhoes:', d.error.message); return false; }
    } else if ((!primeira || porRegistro) && idsDelete.length) {   // apagar por id explícito é seguro mesmo sem espelho
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
    if (podePodar) {
      // Poda órfãos remotos (uma vez) — só com boot íntegro (ver acima).
      let del = sb.from('app_kv').delete().eq('colecao', key);
      const ids = [...next.keys()];
      if (ids.length) del = del.not('item_id', 'in', `(${ids.join(',')})`);
      const d = await del;
      if (d.error) { console.warn(`[supabase] delete ${key}:`, d.error.message); return false; }
    } else if ((!primeira || porRegistro) && idsDelete.length) {   // apagar por id explícito é seguro mesmo sem espelho
      const d = await sb.from('app_kv').delete().eq('colecao', key).in('item_id', idsDelete);
      if (d.error) { console.warn(`[supabase] delete ${key}:`, d.error.message); return false; }
    }
  }

  // Só atualiza o espelho no sucesso. Por registro, o espelho recebe APENAS o
  // que subiu: o resto da lista local não foi enviado e não vira "a nuvem tem".
  // Sem espelho ainda (boot rodando), continua sem — o boot o semeia da nuvem.
  if (porRegistro) {
    const esp = espelhoSb[key];
    if (esp) {
      for (const id of idsUpsert) esp.set(id, next.get(id)!);
      for (const id of idsDelete) esp.delete(id);
    }
  } else {
    espelhoSb[key] = next;
  }

  // Tira do registro os ids que esta carga confirmou — só os que não mudaram
  // de novo desde então (o local é compartilhado entre as abas; uma edição mais
  // nova, desta ou de outra aba, mantém o id). Só DEPOIS do boot: se ele ainda
  // roda, o retrato da nuvem que tem em mãos pode ser anterior a este envio, e
  // a junção dele precisa saber que estes ids são do local; o re-envio do fim
  // do boot confirma de novo e aí limpa.
  const reg = lerIdsEditados(key);
  if (bootCompleto && reg) {
    const atualPorId = new Map(lerLocalLista(key).map(r => [String((r as Rec).id), r]));
    const atual = (id: string) => { const r = atualPorId.get(id); return r === undefined ? undefined : JSON.stringify(r); };
    const resto = confirmarEnvio(reg, idsUpsert, idsDelete, next, atual);
    if (resto) gravarIdsEditados(key, resto); else limparIdsEditados(key);
  }
  podarRegistroIgualANuvem(key);
  return true;
}

// Depois do boot: tira do registro todo id cujo local ATUAL já é igual ao
// espelho (= a nuvem). Ver podarIguaisANuvem. Compara com o local de agora (não
// com a lista desta carga, que pode estar atrás de uma edição mais nova) e não
// roda com carga pendente — a edição dela tem de continuar no registro.
function podarRegistroIgualANuvem(key: string): void {
  const esp = espelhoSb[key];
  const reg = lerIdsEditados(key);
  if (!bootCompleto || !esp || !reg || reg.todos || pendenteSb[key]) return;
  const atualPorId = new Map(lerLocalLista(key).map(r => [String((r as Rec).id), r]));
  const local = (id: string) => { const r = atualPorId.get(id); return r === undefined ? undefined : JSON.stringify(r); };
  const resto = podarIguaisANuvem(reg, local, id => esp.get(id));
  if (!resto) limparIdsEditados(key);
  else if (resto.up.length !== reg.up.length || resto.del.length !== reg.del.length) gravarIdsEditados(key, resto);
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
  if (escritaBloqueada(key)) return;   // produtor: somente leitura
  return enfileirar(key, { lista });
}

// Config (objeto único, ex.: inv_etiqueta_cfg) → 1 linha no app_kv.
// Entra na mesma fila por chave e no mesmo tratamento de erro/pendência.
export async function pushObjSupabase(key: string, json: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  if (escritaBloqueada(key)) return;   // produtor: somente leitura
  return enfileirar(key, { json, obj: true });
}

// ── Registros criados PELO SERVIDOR (API da Lavra) ───────────────────────────
//
// POST /api/v1/programacao grava prescrições direto no app_kv. O boot já as
// traz (completo: a nuvem manda; incremental: entram pelo delta ou, se o
// relógio enganar a marca d'água, pela divergência de counts que força o
// completo; com pendência local: mesclarPorId soma as duas). O que o boot NÃO
// faz é trazê-las com o app já aberto — e o agrônomo programa na Lavra e abre a
// AP em seguida. Isto preenche essa lacuna, sob demanda, para UM recorte
// (ex.: as prescrições de um talhão).
//
// Só ACRESCENTA ids que este navegador não tem; nunca reescreve um registro
// local. É seguro porque o servidor só cria registros novos (cada versão tem id
// próprio) — não há edição do servidor a perder nem a sobrescrever.
//
// Não roda com a chave suja ou com push pendente: a carga enfileirada é um
// retrato SEM os registros novos, e o diff dela (espelho com eles × lista sem
// eles) os apagaria da nuvem. Também pula ids que já estão no espelho mas não
// no local — é exclusão local ainda subindo, e trazê-los de volta a desfaria.
export async function incorporarNovosDaNuvem(key: string, campo: string, valor: string): Promise<number> {
  const sb = getSupabase();
  if (!sb || !usarDadosSupabase() || !chavesHidratadas.has(key)) return 0;
  const r = await sb.from('app_kv').select('item_id, dados').eq('colecao', key).eq(`dados->>${campo}`, valor);
  if (r.error || !r.data?.length) return 0;
  // Conferido DEPOIS do await: uma gravação pode ter entrado enquanto a consulta rodava.
  if (lerSujos()[key] || pendenteSb[key] || errosSb[key]) return 0;
  const esp = espelhoSb[key];
  if (!esp) return 0;
  const local = lerLocalLista(key);
  const ids = new Set(local.map(x => String((x as Rec).id)));
  const novos = (r.data as { item_id: string; dados: unknown }[])
    .filter(x => !ids.has(x.item_id) && !esp.has(x.item_id) && String((x.dados as Rec)?.id) === x.item_id);
  if (!novos.length) return 0;
  gravarRawLocal(key, JSON.stringify([...local, ...novos.map(x => x.dados)]));
  // Vieram da nuvem, não são edição deste aparelho: entram na base também.
  const base = baseLocal[key];
  if (base) for (const x of novos) base.set(x.item_id, JSON.stringify(x.dados));
  // Espelho = "a nuvem já tem": o próximo diff não reenvia nem apaga estes.
  for (const x of novos) esp.set(x.item_id, JSON.stringify(x.dados));
  return novos.length;
}

// ── Mapas (rasters) — D1.3 ────────────────────────────────────────────────────
// Ficam no app_kv na coleção COL_MAPAS, com o id encodando o contexto inteiro
// (talhao__importacao__metodo__…). Carregados SOB DEMANDA por prefixo (LIKE),
// fora do boot. Mesma API do cloud.ts (Firestore).
// Devolve true só quando o servidor confirmou a gravação (a fila de
// interpolação da migração precisa saber; a aba Fertilidade ignora).
export async function salvarMapaSupabase(id: string, dados: object, atualizadoEm?: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  if (escritaBloqueada(COL_MAPAS) || registroBloqueado(COL_MAPAS, id)) return false;   // produtor: só satélite/compactação dos talhões dele
  const up = await sb.from('app_kv').upsert(
    { colecao: COL_MAPAS, item_id: id, dados, atualizado_em: atualizadoEm ?? new Date().toISOString() },
    { onConflict: 'colecao,item_id' },
  );
  if (up.error) { console.warn('[supabase] salvar mapa:', up.error.message); return false; }
  return true;
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
  automatico?: boolean | null;      // pendência 40 — gravada pelo robô noturno
  pctLimpo?: number | null;         // % do talhão limpo na cena de origem
}

export async function listarMapasMetaPorPrefixoSupabase(prefixo: string): Promise<MapaMetaSupabase[] | null> {
  const sb = getSupabase();
  if (!sb) return [];
  const r = await sb.from('app_kv').select(
    'item_id, atualizado_em, indice:dados->>indice, formula:dados->>formula, bandas:dados->bandas, '
    + 'mascara:dados->mascara, usuario:dados->>usuario, criadoEm:dados->>criadoEm, salvoEm:dados->>salvoEm, '
    + 'automatico:dados->automatico, pctLimpo:dados->pctLimpo, '
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
      automatico: (x.automatico as boolean | null) ?? null,
      pctLimpo: (x.pctLimpo as number | null) ?? null,
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

// Exclusão por LISTA de ids, em lotes (o .in() vai na URL) — espelha
// carregarMapasPorIdsSupabase. A exclusão por prefixo não serve para "apagar só
// as automáticas": elas dividem o prefixo com as feitas à mão.
export async function excluirMapasPorIdsSupabase(ids: string[]): Promise<number> {
  const sb = getSupabase();
  if (!sb || !ids.length) return 0;
  if (escritaBloqueada(COL_MAPAS)) return 0;
  ids = ids.filter(id => !registroBloqueado(COL_MAPAS, id));   // produtor: só satélite/compactação dos talhões dele
  let n = 0;
  const LOTE = 30;
  for (let i = 0; i < ids.length; i += LOTE) {
    const r = await sb.from('app_kv').delete({ count: 'exact' })
      .eq('colecao', COL_MAPAS).in('item_id', ids.slice(i, i + LOTE));
    if (r.error) { console.warn('[supabase] excluir mapas por ids:', r.error.message); continue; }
    n += r.count ?? 0;
  }
  return n;
}

export async function excluirMapasPorPrefixoSupabase(prefixo: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  if (escritaBloqueada(COL_MAPAS) || registroBloqueado(COL_MAPAS, prefixo)) return;   // produtor: só satélite/compactação dos talhões dele
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
  if (escritaBloqueada(colecao) || registroBloqueado(colecao, id, dados)) return false;   // produtor: só nos talhões dele
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

// Projeção LEVE de campos de uma coleção, filtrando por um campo do JSON.
// Existe para descobrir "quais anos têm dado" sem baixar o doc inteiro: os
// cenários de recomendação carregam os grids das doses (MBs, gzipados) e
// trazê-los só para ler a safra seria desperdício. Ex.:
//   projetarDocsPorCampoSupabase('inv_cenarios', 'talhaoId', ids, ['safra'])
// Devolve um objeto por linha com os campos pedidos + o campo do filtro.
export async function projetarDocsPorCampoSupabase(
  colecao: string, campo: string, valores: string[], campos: string[],
): Promise<Array<Record<string, string | null>> | null> {
  const sb = getSupabase();
  if (!sb || valores.length === 0) return [];
  const sel = [campo, ...campos].map(c => `${c}:dados->>${c}`).join(', ');
  const r = await sb.from('app_kv').select(sel).eq('colecao', colecao).in(`dados->>${campo}`, valores);
  if (r.error) { console.warn(`[supabase] projetar ${colecao}:`, r.error.message); return null; }
  return (r.data ?? []) as unknown as Array<Record<string, string | null>>;
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
  if (escritaBloqueada(colecao) || registroBloqueado(colecao, id)) return 0;   // produtor: só nos talhões dele
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
  // Produtor: exclusão em massa (por prefixo ou da coleção inteira) não tem um
  // talhão para conferir — só passa nas coleções do IAM (id vazio = sem talhão).
  if (escritaBloqueada(colecao) || registroBloqueado(colecao, '')) return;
  const r = await sb.from('app_kv').delete().eq('colecao', colecao).like('item_id', escLike(prefixo) + '%');
  if (r.error) console.warn(`[supabase] excluir por prefixo ${colecao}:`, r.error.message);
}

// Apaga TODOS os docs de uma coleção (usado na limpeza total da base).
export async function excluirColecaoSupabase(colecao: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  if (escritaBloqueada(colecao) || registroBloqueado(colecao, '')) return;   // produtor: idem prefixo
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
