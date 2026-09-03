#!/usr/bin/env node
// Teste do AUTO-CADASTRO POR CONVITE em DOIS APARELHOS, contra um Supabase
// FALSO em memória que aplica as políticas RLS reais de docs/seguranca-rls.sql.
// Roda: `node scripts/teste-autocadastro.mjs`.
//
// O BUG QUE ESTE TESTE REPRODUZ (relatado): quem se cadastra pelo link
// (/convite?t=TOKEN) num navegador NOVO fica preso em "Cadastro aguardando
// aprovação" e o pedido NUNCA aparece para o administrador aprovar.
//
// Por que um Supabase falso e não o real (como teste-convite.mjs / teste-rls.mjs):
// o que quebra não é uma chamada isolada — é a COMBINAÇÃO de dois aparelhos com
// estados de sincronismo diferentes escrevendo na mesma coleção `inv_papeis`.
// Isso exige controlar o estado de módulo dos dois lados, o que só dá em memória.
//
// ── O QUE FOI REPLICADO DO APP (o teste não pode ser ficção) ─────────────────
// Os módulos do app são TypeScript e importam `window`/localStorage, então não
// dá para importá-los num .mjs. O algoritmo abaixo é uma cópia FIEL de:
//
//   src/lib/supabaseData.ts:425      const espelhoSb            (espelho de diff)
//   src/lib/supabaseData.ts:431      let bootCompleto
//   src/lib/supabaseData.ts:438      const chavesHidratadas
//   src/lib/supabaseData.ts:162-170  seedEspelho()
//   src/lib/supabaseData.ts:559-632  syncLista()  ← ramo `primeira` + poda not-in
//   src/lib/supabaseData.ts:186-283  bootIncremental() (recorte do app_kv)
//   src/lib/supabaseData.ts:340-380  bootSupabaseData() — boot COMPLETO (seedEspelho da nuvem)
//   src/lib/iam/usuarios.ts:23-27    gravar()  (localStorage + cloudPushLista)
//   src/lib/iam/usuarios.ts:57-72    salvarUsuario()
//   src/lib/iam/usuarios.ts:196-205  marcarUltimoAcesso()
//   src/lib/iam/auditoria.ts:29-52   registrar()
//   src/app/convite/page.tsx:134-147 ramo "aguardando_aprovacao" do cadastro
//   src/context/AppContext.tsx:251-258  Promise.race([bootCloud(), 12s])
//   src/context/AppContext.tsx:260,273,296  seedPapeis/migrarIamV1/marcarUltimoAcesso
//                                    (rodam DEPOIS da corrida — ou seja, DURANTE
//                                     o boot quando ele passa dos 12s)
//   src/lib/janelaBoot.ts:41-44      editadaDuranteBoot()
//   docs/seguranca-rls.sql:55-93     políticas gerais (select/insert/update/delete)
//   docs/seguranca-rls.sql:95-124    exceção do AUTO-CADASTRO
//   docs/seguranca-rls.sql:126-146   exceção do consumo do CONVITE
//   docs/seguranca-rls.sql:148-153   auditoria append-only
//
// Nenhuma flag é ligada "na mão": os estados dos dois aparelhos são produzidos
// rodando os mesmos passos que o app roda.

import assert from 'node:assert/strict';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}
const linha = () => console.log('─'.repeat(72));

// ═══════════════════════════════════════════════════════════════════════════
// 1) SUPABASE FALSO — tabela app_kv + as políticas RLS de docs/seguranca-rls.sql
// ═══════════════════════════════════════════════════════════════════════════

const COLECOES_ACESSO = ['inv_papeis', 'inv_permissoes', 'inv_planos', 'inv_convites', 'inv_auditoria'];
const low = v => String(v ?? '').toLowerCase();
const naoPrivilegiado = p => !['owner', 'admin'].includes(String(p ?? ''));

// docs/seguranca-rls.sql:37-53 — public.inv_eh_admin()
function invEhAdmin(nuvem, jwtEmail) {
  return nuvem.app_kv.some(k =>
    k.colecao === 'inv_papeis'
    && low(k.dados?.email) === low(jwtEmail || '')
    && ['owner', 'admin'].includes(String(k.dados?.papel ?? '')));
}

// Políticas permissivas se SOMAM por OU (é o ponto do comentário em :26-29 do SQL).
// sessao = { email } para `authenticated`; null = `anon` (nenhuma política vale,
// pois TODAS são `to authenticated`).
function podeInserir(nuvem, sessao, row) {
  if (!sessao) return false;                                   // anon: sem política nenhuma
  const jwt = sessao.email;
  // app_kv_insert_autenticado (sql:66-72)
  if (!COLECOES_ACESSO.includes(row.colecao) || invEhAdmin(nuvem, jwt)) return true;
  // app_kv_insert_autocadastro (sql:102-110)
  if (row.colecao === 'inv_papeis'
    && low(row.dados?.email) === low(jwt || '')
    && naoPrivilegiado(row.dados?.papel)
    && String(row.dados?.status ?? '') === 'aguardando_aprovacao') return true;
  // app_kv_insert_auditoria (sql:151-153)
  if (row.colecao === 'inv_auditoria') return true;
  return false;
}

function podeAtualizar(nuvem, sessao, antiga, nova) {
  if (!sessao) return false;
  const jwt = sessao.email;
  // app_kv_update_autenticado (sql:74-83)
  if (!COLECOES_ACESSO.includes(nova.colecao) || invEhAdmin(nuvem, jwt)) return true;
  // app_kv_update_autocadastro (sql:112-123): USING pelo e-mail + WITH CHECK papel/status
  if (antiga.colecao === 'inv_papeis' && low(antiga.dados?.email) === low(jwt || '')
    && nova.colecao === 'inv_papeis' && low(nova.dados?.email) === low(jwt || '')
    && naoPrivilegiado(nova.dados?.papel)
    && String(nova.dados?.status ?? '') === 'aguardando_aprovacao') return true;
  // app_kv_update_convite_uso (sql:130-140)
  if (antiga.colecao === 'inv_convites' && nova.colecao === 'inv_convites'
    && low(nova.dados?.usadoPor) === low(jwt || '')
    && ['pendente', 'usado'].includes(String(nova.dados?.status ?? ''))) return true;
  return false;
}

// app_kv_delete_autenticado (sql:85-90). DELETE usa USING: linha que não passa
// é INVISÍVEL (some do comando), não vira erro — é assim no Postgres.
function podeApagar(nuvem, sessao, row) {
  if (!sessao) return false;
  return !COLECOES_ACESSO.includes(row.colecao) || invEhAdmin(nuvem, sessao.email);
}

// app_kv_select_autenticado (sql:60-62): using(true) para authenticated.
const podeLer = sessao => !!sessao;

function criarNuvem() {
  return { app_kv: [], degradada: false };
}

// Construtor de consulta no estilo do supabase-js (só o que syncLista/boot usam).
function consulta(nuvem, sessao, tabela) {
  const st = { tabela, op: 'select', filtros: [], rows: null, opts: {}, faixa: null };
  const valor = (r, col) => r[col];
  const api = {
    select(_cols, opts = {}) { st.op = 'select'; st.opts = opts; return api; },
    upsert(rows) { st.op = 'upsert'; st.rows = Array.isArray(rows) ? rows : [rows]; return api; },
    delete() { st.op = 'delete'; return api; },
    eq(col, v) { st.filtros.push(r => valor(r, col) === v); return api; },
    in(col, arr) { const s = new Set(arr); st.filtros.push(r => s.has(valor(r, col))); return api; },
    gt(col, v) { st.filtros.push(r => String(valor(r, col) ?? '') > String(v)); return api; },
    // `.not('item_id','in','(a,b,c)')` — a forma exata usada na poda (supabaseData.ts:621)
    not(col, op, lista) {
      assert.equal(op, 'in', 'o app só usa .not(col, "in", …)');
      const s = new Set(String(lista).replace(/^\(|\)$/g, '').split(',').filter(Boolean));
      st.filtros.push(r => !s.has(String(valor(r, col))));
      return api;
    },
    order() { return api; },
    range(de, ate) { st.faixa = [de, ate]; return api; },
    then(res, rej) { return Promise.resolve().then(() => executar(nuvem, sessao, st)).then(res, rej); },
  };
  return api;
}

function executar(nuvem, sessao, st) {
  assert.equal(st.tabela, 'app_kv', 'este teste só exercita app_kv');
  if (nuvem.degradada) {
    // 503 do provedor — é o mesmo estado que faz o boot passar dos 12s da
    // corrida do AppContext (o comentário em AppContext.tsx:246-250 cita o
    // 522 do Cloudflare, ~19,5 s).
    return { data: null, count: null, error: { message: 'Supabase degradado (503)' } };
  }
  const casa = r => st.filtros.every(f => f(r));

  if (st.op === 'select') {
    if (!podeLer(sessao)) return { data: [], count: 0, error: null };
    const linhas = nuvem.app_kv.filter(casa);
    if (st.opts.head && st.opts.count === 'exact') return { data: null, count: linhas.length, error: null };
    const [de, ate] = st.faixa ?? [0, linhas.length];
    return { data: linhas.slice(de, ate + 1).map(r => JSON.parse(JSON.stringify(r))), count: linhas.length, error: null };
  }

  if (st.op === 'upsert') {
    // INSERT … ON CONFLICT DO UPDATE: violação de WITH CHECK aborta o COMANDO
    // INTEIRO (42501). Por isso nada é aplicado se uma linha for barrada.
    const plano = [];
    for (const nova of st.rows) {
      const i = nuvem.app_kv.findIndex(r => r.colecao === nova.colecao && r.item_id === nova.item_id);
      const permitido = i < 0
        ? podeInserir(nuvem, sessao, nova)
        : podeAtualizar(nuvem, sessao, nuvem.app_kv[i], nova);
      if (!permitido) {
        return { data: null, error: { code: '42501', message: `new row violates row-level security policy for table "app_kv" (colecao=${nova.colecao}, item_id=${nova.item_id})` } };
      }
      plano.push([i, nova]);
    }
    for (const [i, nova] of plano) {
      if (i < 0) nuvem.app_kv.push(JSON.parse(JSON.stringify(nova)));
      else nuvem.app_kv[i] = JSON.parse(JSON.stringify(nova));
    }
    return { data: null, error: null };
  }

  if (st.op === 'delete') {
    // USING filtra em silêncio: quem não pode apagar simplesmente não vê a linha.
    const sobrando = nuvem.app_kv.filter(r => !(casa(r) && podeApagar(nuvem, sessao, r)));
    nuvem.app_kv.length = 0;
    nuvem.app_kv.push(...sobrando);
    return { data: null, error: null };
  }
  throw new Error('operação não suportada: ' + st.op);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2) APARELHO — o estado de MÓDULO do app, um por navegador/aba
// ═══════════════════════════════════════════════════════════════════════════

function criarAparelho(nome, nuvem, sessao) {
  return {
    nome, nuvem, sessao,
    sb: { from: tabela => consulta(nuvem, sessao, tabela) },
    local: new Map(),          // localStorage (só as listas que interessam)
    espelhoSb: {},             // supabaseData.ts:425 — ausente = 1º push da sessão
    bootCompleto: false,       // supabaseData.ts:431
    chavesHidratadas: new Set(),// supabaseData.ts:438
    gravadoLocalEm: {},        // supabaseData.ts:455 (+ janelaBoot.ts)
    avisos: [],
  };
}

const lerLocalLista = (ap, key) => JSON.parse(JSON.stringify(ap.local.get(key) ?? []));
const gravarListaLocal = (ap, key, lista) => ap.local.set(key, JSON.parse(JSON.stringify(lista)));

// supabaseData.ts:162-170
function seedEspelho(ap, key, recs) {
  ap.chavesHidratadas.add(key);
  const m = new Map();
  for (const r of recs) if (r?.id != null) m.set(String(r.id), JSON.stringify(r));
  ap.espelhoSb[key] = m;
}

// supabaseData.ts:559-632 — CÓPIA FIEL (só o ramo app_kv; talhões não entra aqui).
async function syncLista(ap, key, lista) {
  const recs = lista;
  const agora = new Date().toISOString();

  const next = new Map();
  for (const r of recs) next.set(String(r.id), JSON.stringify(r));

  const prev = ap.espelhoSb[key];
  const primeira = prev === undefined;
  // supabaseData.ts — direito de podar capturado ANTES do await do upsert (TOCTOU).
  const podePodar = primeira && ap.bootCompleto && ap.chavesHidratadas.has(key);

  let idsUpsert, idsDelete;
  if (primeira) {
    idsUpsert = [...next.keys()];   // tudo
    idsDelete = [];                 // no 1º push, poda via not-in
  } else {
    idsUpsert = [...next.keys()].filter(id => prev.get(id) !== next.get(id));
    idsDelete = [...prev.keys()].filter(id => !next.has(id));
    if (!idsUpsert.length && !idsDelete.length) return true;
  }

  const recPorId = new Map();
  for (const r of recs) recPorId.set(String(r.id), r);

  if (idsUpsert.length) {
    const rows = idsUpsert.map(id => {
      const r = recPorId.get(id);
      return { colecao: key, item_id: id, empresa_id: r.empresaId ?? null, dados: r, atualizado_em: agora };
    });
    const up = await ap.sb.from('app_kv').upsert(rows, { onConflict: 'colecao,item_id' });
    if (up.error) { ap.avisos.push(`[supabase] upsert ${key}: ${up.error.message}`); return false; }
  }

  if (podePodar) {
    // A PODA NOT-IN. Apaga na nuvem tudo que não está na lista LOCAL deste
    // aparelho — inclusive o que ele nunca chegou a baixar.
    let del = ap.sb.from('app_kv').delete().eq('colecao', key);
    const ids = [...next.keys()];
    if (ids.length) del = del.not('item_id', 'in', `(${ids.join(',')})`);
    const d = await del;
    if (d.error) { ap.avisos.push(`[supabase] delete ${key}: ${d.error.message}`); return false; }
    ap.avisos.push(`[poda] ${key}: delete not-in com ${ids.length} id(s) locais`);
  } else if (!primeira && idsDelete.length) {
    const d = await ap.sb.from('app_kv').delete().eq('colecao', key).in('item_id', idsDelete);
    if (d.error) { ap.avisos.push(`[supabase] delete ${key}: ${d.error.message}`); return false; }
  }

  ap.espelhoSb[key] = next;   // só atualiza o espelho no sucesso (supabaseData.ts:630)
  return true;
}

// supabaseData.ts:514-536 (enfileirar) — aqui sem fila/coalescing: o que importa
// é que a GRAVAÇÃO LOCAL é anotada NA HORA (janela do boot) e o push vai depois.
async function pushLista(ap, key, lista) {
  ap.gravadoLocalEm[key] = Date.now();
  return syncLista(ap, key, lista);
}

// ── Portes do IAM ───────────────────────────────────────────────────────────
const norm = e => e.trim().toLowerCase();
const K_PAPEIS = 'inv_papeis', K_AUDITORIA = 'inv_auditoria';

// usuarios.ts:23-27 + 57-72
async function salvarUsuario(ap, email, patch) {
  const e = norm(email);
  const lista = lerLocalLista(ap, K_PAPEIS);
  const i = lista.findIndex(u => norm(u.email) === e);
  if (i >= 0) lista[i] = { ...lista[i], ...patch, id: lista[i].id || e, email: e };
  else lista.push({ id: e, email: e, papel: patch.papel ?? 'leitor', criadoEm: new Date().toISOString(), criadoPor: ap.sessao?.email ?? 'sistema', ...patch });
  gravarListaLocal(ap, K_PAPEIS, lista);
  await pushLista(ap, K_PAPEIS, lista);
}

// auditoria.ts:29-52
async function registrar(ap, acao, dados = {}) {
  const ev = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, em: new Date().toISOString(), quem: ap.sessao?.email ?? 'sistema', acao, alvo: dados.alvo };
  const lista = lerLocalLista(ap, K_AUDITORIA);
  lista.push(ev);
  gravarListaLocal(ap, K_AUDITORIA, lista);
  await pushLista(ap, K_AUDITORIA, lista);
}

// usuarios.ts — registrarPedidoDeAcesso: grava o PRÓPRIO pedido como UM documento.
// Não empurra a lista: a exceção de RLS do auto-cadastro só autoriza a linha do
// próprio e-mail, e num aparelho que já abriu a plataforma a lista local carrega
// as outras pessoas — o Postgres recusa o comando inteiro (ver PASSO D).
async function registrarPedidoDeAcesso(ap, email, patch) {
  const e = norm(email);
  const lista = lerLocalLista(ap, K_PAPEIS);
  const i = lista.findIndex(u => norm(u.email) === e);
  const registro = i >= 0
    ? { ...lista[i], ...patch, id: lista[i].id || e, email: e }
    : { id: e, email: e, papel: patch.papel ?? 'leitor', criadoEm: new Date().toISOString(), criadoPor: e, ...patch };
  if (i >= 0) lista[i] = registro; else lista.push(registro);
  gravarListaLocal(ap, K_PAPEIS, lista);
  const up = await ap.sb.from('app_kv').upsert(
    { colecao: K_PAPEIS, item_id: e, dados: registro, atualizado_em: new Date().toISOString() },
    { onConflict: 'colecao,item_id' });
  if (up.error) { ap.avisos.push(`[supabase] salvar ${K_PAPEIS}: ${up.error.message}`); return false; }
  return true;
}

// auditoria.ts — registrarDoc: mesma ideia, um evento por vez.
async function registrarDoc(ap, acao, dados = {}) {
  const ev = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, em: new Date().toISOString(), quem: ap.sessao?.email ?? 'sistema', acao, alvo: dados.alvo };
  const lista = lerLocalLista(ap, K_AUDITORIA);
  lista.push(ev);
  gravarListaLocal(ap, K_AUDITORIA, lista);
  const up = await ap.sb.from('app_kv').upsert(
    { colecao: K_AUDITORIA, item_id: ev.id, dados: ev, atualizado_em: new Date().toISOString() },
    { onConflict: 'colecao,item_id' });
  if (up.error) ap.avisos.push(`[supabase] salvar ${K_AUDITORIA}: ${up.error.message}`);
}

// usuarios.ts:196-205 — roda em TODA abertura do app (1× por hora)
async function marcarUltimoAcesso(ap, email) {
  const lista = lerLocalLista(ap, K_PAPEIS);
  if (!lista.some(u => norm(u.email) === norm(email))) return;
  await salvarUsuario(ap, email, { ultimoAcesso: new Date().toISOString() });
}

// convite/page.tsx:134-147 — o ramo em que o convite NÃO é conhecido neste
// aparelho (lista `inv_convites` não sincronizada: navegador novo), que é
// exatamente o do link de GRUPO. Entra na fila de aprovação.
async function cadastrarPeloConvite(ap, email, nome, token) {
  const agora = new Date().toISOString();
  const enviado = await registrarPedidoDeAcesso(ap, email, {
    nome, papel: 'leitor', categoria: 'interno', status: 'aguardando_aprovacao',
    criadoEm: agora, criadoPor: email,
    aceiteLgpdEm: agora, aceiteTermosEm: agora, conviteId: token,
  });
  if (enviado) await registrarDoc(ap, 'cadastro_solicitado', { alvo: email });
  return enviado;
}

// ── Boots ───────────────────────────────────────────────────────────────────
const KEYS = [K_PAPEIS, K_AUDITORIA];

// supabaseData.ts:340-380 (recorte app_kv): baixa tudo, grava local, e semeia o
// espelho com o estado da NUVEM. Depois disto `bootCompleto` vira true.
async function bootCompletoDoAparelho(ap) {
  const r = await ap.sb.from('app_kv').select('colecao, item_id, dados, atualizado_em').range(0, 999).order('colecao').in('colecao', KEYS);
  if (r.error) throw new Error(r.error.message);
  const porColecao = {};
  for (const row of r.data) (porColecao[row.colecao] ??= []).push(row.dados);
  let marca = null;
  for (const row of r.data) if (!marca || (row.atualizado_em ?? '') > marca) marca = row.atualizado_em;
  for (const key of KEYS) {
    const nuvem = porColecao[key] ?? [];
    gravarListaLocal(ap, key, nuvem);
    seedEspelho(ap, key, nuvem);
  }
  ap.bootCompleto = true;
  return marca;
}

// supabaseData.ts:186-283 (recorte app_kv) — inclui a checagem de counts e o
// ramo `editadaAgora` (a chave gravada DURANTE o boot é PRESERVADA: o delta é
// descartado, a chave entra em chavesHidratadas e NÃO passa por seedEspelho).
async function bootIncrementalDoAparelho(ap, marca, duranteARede) {
  const inicioBoot = Date.now();
  const cK = await ap.sb.from('app_kv').select('item_id', { count: 'exact', head: true }).in('colecao', KEYS);
  const del = await ap.sb.from('app_kv').select('colecao, item_id, dados, atualizado_em').range(0, 999).order('colecao').in('colecao', KEYS).gt('atualizado_em', marca);
  if (cK.error || del.error) throw new Error((cK.error ?? del.error).message);
  const mudKv = del.data;

  // AppContext.tsx:251-258 — a corrida de 12 s solta a tela e as rotinas de
  // abertura (seedPapeis/migrarIamV1/marcarUltimoAcesso, linhas 260/273/296)
  // rodam AQUI, com o boot ainda na rede.
  if (duranteARede) await duranteARede();

  let localKv = 0;
  for (const key of KEYS) localKv += lerLocalLista(ap, key).length;
  const idsPorCol = new Map();
  let novos = 0;
  for (const m of mudKv) {
    let ids = idsPorCol.get(m.colecao);
    if (!ids) { ids = new Set(lerLocalLista(ap, m.colecao).map(r => String(r.id))); idsPorCol.set(m.colecao, ids); }
    if (!ids.has(m.item_id)) novos++;
  }
  if ((cK.count ?? -1) !== localKv + novos) return false;   // divergiu → boot completo

  const porColecao = new Map();
  let novaMarca = marca;
  for (const row of mudKv) {
    (porColecao.get(row.colecao) ?? porColecao.set(row.colecao, []).get(row.colecao)).push({ item_id: row.item_id, dados: row.dados });
    if ((row.atualizado_em ?? '') > novaMarca) novaMarca = row.atualizado_em;
  }
  // janelaBoot.ts:41-44
  const editadaAgora = key => { const t0 = ap.gravadoLocalEm[key]; return t0 !== undefined && t0 >= inicioBoot; };
  const preservadas = [];
  for (const key of KEYS) {
    if (editadaAgora(key)) { preservadas.push(key); continue; }  // ← SEM seedEspelho e SEM hidratar
    const mudancas = porColecao.get(key);
    if (mudancas?.length) {
      const porId = new Map(lerLocalLista(ap, key).map(r => [String(r.id), r]));
      for (const m of mudancas) porId.set(m.item_id, m.dados);
      const final = [...porId.values()];
      gravarListaLocal(ap, key, final);
      seedEspelho(ap, key, final);
    } else {
      seedEspelho(ap, key, lerLocalLista(ap, key));
    }
  }
  for (const key of preservadas) await pushLista(ap, key, lerLocalLista(ap, key));
  return { ok: true, marca: preservadas.length ? marca : novaMarca, preservadas };
}

const naNuvem = (nuvem, colecao, itemId) =>
  nuvem.app_kv.find(r => r.colecao === colecao && r.item_id === itemId) ?? null;

// ═══════════════════════════════════════════════════════════════════════════
// 3) CENÁRIO
// ═══════════════════════════════════════════════════════════════════════════

const OWNER = 'dono@invicta.agr.br';
const OUTRO = 'agronomo@invicta.agr.br';
const NOVO = 'candidato@fazenda.com.br';
const TOKEN = 'tok_grupo_produtores';

console.log('\nAuto-cadastro por convite — 2 aparelhos × Supabase falso com a RLS real\n');

const nuvem = criarNuvem();
// Estado inicial da nuvem: o dono e um agrônomo já cadastrados (como em produção).
nuvem.app_kv.push(
  { colecao: K_PAPEIS, item_id: OWNER, empresa_id: null, dados: { id: OWNER, email: OWNER, papel: 'owner', status: 'ativo' }, atualizado_em: '2026-01-01T00:00:00.000Z' },
  { colecao: K_PAPEIS, item_id: OUTRO, empresa_id: null, dados: { id: OUTRO, email: OUTRO, papel: 'agronomo', status: 'ativo' }, atualizado_em: '2026-01-01T00:00:00.000Z' },
  { colecao: K_AUDITORIA, item_id: 'aud_inicial', empresa_id: null, dados: { id: 'aud_inicial', acao: 'login', quem: OWNER }, atualizado_em: '2026-01-01T00:00:00.000Z' },
);

// ── PASSO A — aparelho NOVO do candidato ────────────────────────────────────
// Navegador limpo: localStorage vazio, NENHUM boot da nuvem (a página /convite
// é pública e não monta o AppProvider — src/app/layout.tsx não tem provider —
// logo bootCloud() nunca rodou aqui: bootCompleto=false, espelho vazio).
console.log('PASSO A — aparelho NOVO grava o pedido de acesso (aguardando_aprovacao)…');
const candidato = criarAparelho('celular do candidato', nuvem, { email: NOVO });
await cadastrarPeloConvite(candidato, NOVO, 'Candidato da Silva', TOKEN);

// A1 protege: o pedido do não-admin passa pela exceção de auto-cadastro da RLS
// (sql:102-110) e a linha nasce na nuvem. Se isto falha, o administrador nunca
// terá o que aprovar — o pedido morre no aparelho de quem se cadastrou.
t('A1 · o pedido do candidato EXISTE em app_kv/inv_papeis', () => {
  const row = naNuvem(nuvem, K_PAPEIS, NOVO);
  assert.ok(row, `nada gravado — avisos do push: ${candidato.avisos.join(' | ') || '(nenhum)'}`);
  assert.equal(row.dados.status, 'aguardando_aprovacao');
  assert.equal(row.dados.papel, 'leitor');
});

// A2 protege: a trilha (append-only, sql:151-153) registra o pedido mesmo vindo
// de um não-admin — é o segundo lugar onde o administrador poderia enxergá-lo.
t('A2 · a auditoria "cadastro_solicitado" também subiu', () => {
  assert.ok(nuvem.app_kv.some(r => r.colecao === K_AUDITORIA && r.dados?.acao === 'cadastro_solicitado' && r.dados?.alvo === NOVO),
    `auditoria não subiu — avisos: ${candidato.avisos.join(' | ') || '(nenhum)'}`);
});
linha();

// ── PASSO B1 — aparelho do ADMIN com boot COMPLETO (o caminho saudável) ─────
// O admin abriu o app ANTES do candidato se cadastrar, então a cópia local dele
// não tem o candidato. Com boot completo, o espelho foi semeado com a nuvem →
// os pushes seguintes são diffs, e nada que ele não viu é apagado.
console.log('PASSO B1 — admin com boot COMPLETO salva OUTRO usuário…');
const adminOk = criarAparelho('desktop do admin (boot completo)', nuvem, { email: OWNER });
// (boot tirado ANTES do cadastro do candidato: removemos a linha dele do retrato)
const semCandidato = criarNuvem();
semCandidato.app_kv = nuvem.app_kv.filter(r => r.item_id !== NOVO && r.dados?.alvo !== NOVO).map(r => JSON.parse(JSON.stringify(r)));
const adminOkBoot = criarAparelho('retrato antigo', semCandidato, { email: OWNER });
const marcaAntiga = await bootCompletoDoAparelho(adminOkBoot);   // marca d'água da abertura anterior
adminOk.local = adminOkBoot.local; adminOk.espelhoSb = adminOkBoot.espelhoSb;
adminOk.chavesHidratadas = adminOkBoot.chavesHidratadas; adminOk.bootCompleto = true;
// …e agora ele edita outro usuário, já com o candidato existindo na nuvem real.
await salvarUsuario(adminOk, OUTRO, { telefone: '(55) 99999-0000' });

// B1 protege: um push por DIFF (espelho presente) só apaga o que saiu da lista
// local — nunca o que chegou na nuvem depois do retrato.
t('B1 · push por diff (espelho semeado) NÃO apaga o pedido', () => {
  assert.ok(naNuvem(nuvem, K_PAPEIS, NOVO), 'o pedido sumiu num push que deveria ser só diff');
});
linha();

// ── PASSO B2 — aparelho do ADMIN cujo boot caiu no ramo "chave preservada" ──
// Como se chega aqui SEM ligar flag na mão (tudo em AppContext.tsx/supabaseData.ts):
//   1. Supabase degradado → a corrida de 12 s (AppContext:251-258) solta a tela
//      com o boot ainda na rede;
//   2. marcarUltimoAcesso (AppContext:296, 1× por hora) grava inv_papeis AGORA
//      → anota gravadoLocalEm['inv_papeis'] e dispara o push;
//   3. o push falha (é a MESMA degradação) → syncLista devolve false e o espelho
//      NÃO é atualizado (supabaseData.ts:630);
//   4. o boot incremental termina: editadaAgora('inv_papeis') é true, então a
//      chave entra em chavesHidratadas SEM passar por seedEspelho (:253-256);
//   5. bootCompleto vira true.
// Resultado: espelho AUSENTE + bootCompleto + chave hidratada = o próximo push
// de inv_papeis cai no ramo `primeira` e roda a PODA NOT-IN.
console.log('PASSO B2 — admin com boot INCREMENTAL que preservou inv_papeis…');
// Abertura anterior (antes do candidato): localStorage e marca d'água do retrato
// antigo. O estado de MÓDULO nasce zerado — é outra carga de página.
const admin = criarAparelho('desktop do admin (boot incremental)', nuvem, { email: OWNER });
admin.local.set(K_PAPEIS, lerLocalLista(adminOkBoot, K_PAPEIS));   // retrato SEM o candidato
admin.local.set(K_AUDITORIA, lerLocalLista(adminOkBoot, K_AUDITORIA));

const r = await bootIncrementalDoAparelho(admin, marcaAntiga, async () => {
  nuvem.degradada = true;                      // 503 na janela do boot — é o que o alongou
  await marcarUltimoAcesso(admin, OWNER);      // push falha, mas a gravação já foi anotada
});
nuvem.degradada = false;                        // a rede volta logo depois do boot
admin.bootCompleto = true;                      // supabaseData.ts:318

t('B2 · chave preservada pelo boot NÃO conta como hidratada (a poda não pode disparar)', () => {
  assert.ok(r && r.ok, 'o boot incremental não completou');
  assert.deepEqual(r.preservadas, [K_PAPEIS], 'inv_papeis deveria ter sido preservada pela janela do boot');
  assert.equal(admin.espelhoSb[K_PAPEIS], undefined, 'espelho deveria estar ausente');
  // O CERNE DA CORREÇÃO: espelho ausente É esperado (o delta foi descartado), mas
  // aí a chave NÃO pode entrar em chavesHidratadas — senão `primeira && bootCompleto
  // && hidratada` libera o delete not-in contra uma lista local sabidamente velha.
  assert.equal(admin.chavesHidratadas.has(K_PAPEIS), false,
    'inv_papeis foi marcada como hidratada mesmo com o delta descartado — a poda vai apagar o pedido');
  assert.equal(admin.bootCompleto, true);
});

// O admin salva QUALQUER outro usuário (o gesto mais banal da Central de Acessos).
await salvarUsuario(admin, OUTRO, { observacoes: 'ajuste qualquer' });

// B3 protege o coração do bug: o aparelho do administrador não pode APAGAR da
// nuvem um pedido que ele nunca baixou. A RLS não segura isto — ele É admin.
t('B3 · o pedido do candidato CONTINUA na nuvem depois do push do admin', () => {
  assert.ok(naNuvem(nuvem, K_PAPEIS, NOVO),
    `o push do admin podou o pedido — ${admin.avisos.filter(a => a.startsWith('[poda]')).join(' | ') || 'sem poda registrada'}`);
});
linha();

// ── PASSO C — o admin lista os pendentes ────────────────────────────────────
// CentralAcessos.tsx:68 filtra a lista LOCAL por status 'aguardando_aprovacao'.
console.log('PASSO C — admin recarrega o app e abre a Central de Acessos…');
const adminFresco = criarAparelho('desktop do admin (recarregado)', nuvem, { email: OWNER });
await bootCompletoDoAparelho(adminFresco);
const pendentes = lerLocalLista(adminFresco, K_PAPEIS).filter(u => u.status === 'aguardando_aprovacao');

// C protege o resultado que o usuário vê: existir na nuvem não basta, o pedido
// tem que chegar à tela de quem aprova.
t('C · o administrador ENXERGA o candidato na fila de aprovação', () => {
  assert.deepEqual(pendentes.map(u => u.email), [NOVO],
    'a Central de Acessos do admin não mostra o pedido');
});
linha();

// ── PASSO D — o celular de QUEM JÁ USA o app (o caso relatado em produção) ──
// O aparelho não é virgem: já abriu a plataforma alguma vez, então o localStorage
// tem inv_papeis com TODA a equipe. Foi o que aconteceu no celular do Jhon: a
// conta era criada e o pedido não chegava. O erro na tela dizia a verdade.
console.log('PASSO D — celular que JÁ tem a lista de acessos de outras pessoas…');
const OUTRO_NOVO = 'jnatan@exemplo.com';
const reincidente = criarAparelho('celular de quem já usa o app', nuvem, { email: OUTRO_NOVO });
// A lista local que um aparelho desses carrega (veio de um boot antigo, de outra conta).
gravarListaLocal(reincidente, K_PAPEIS, [
  { id: OWNER, email: OWNER, papel: 'owner', status: 'ativo' },
  { id: OUTRO, email: OUTRO, papel: 'agronomo', status: 'ativo' },
  { id: NOVO, email: NOVO, papel: 'leitor', status: 'aguardando_aprovacao' },
]);

// D1 documenta a CAUSA: o caminho antigo (salvarUsuario → push da LISTA) manda
// junto as linhas das outras pessoas. A exceção de auto-cadastro só autoriza a
// linha do próprio e-mail, e o Postgres recusa o comando INTEIRO (42501).
const listaComOutros = [...lerLocalLista(reincidente, K_PAPEIS),
  { id: OUTRO_NOVO, email: OUTRO_NOVO, papel: 'leitor', status: 'aguardando_aprovacao' }];
const okListaInteira = await pushLista(reincidente, K_PAPEIS, listaComOutros);
t('D1 · empurrar a LISTA INTEIRA daqui é recusado pela RLS (a causa do defeito)', () => {
  assert.equal(okListaInteira, false, 'a lista inteira passou — a simulação da RLS está frouxa');
  assert.ok(!naNuvem(nuvem, K_PAPEIS, OUTRO_NOVO), 'nada deveria ter sido gravado');
});

// D2 é a correção: um documento só, que é exatamente o que a política autoriza.
const enviouD = await cadastrarPeloConvite(reincidente, OUTRO_NOVO, 'Cadastro do celular', TOKEN);
t('D2 · gravando UM documento, o pedido chega mesmo com a lista dos outros no aparelho', () => {
  assert.equal(enviouD, true, `o envio falhou — avisos: ${reincidente.avisos.join(' | ') || '(nenhum)'}`);
  const row = naNuvem(nuvem, K_PAPEIS, OUTRO_NOVO);
  assert.ok(row, 'o pedido não chegou à nuvem');
  assert.equal(row.dados.status, 'aguardando_aprovacao');
});

// D3: e as linhas das OUTRAS pessoas continuam intactas — o aparelho de quem se
// cadastra não pode alterar nada além do próprio registro.
t('D3 · os registros das outras pessoas não foram tocados', () => {
  assert.equal(naNuvem(nuvem, K_PAPEIS, OWNER)?.dados?.papel, 'owner');
  assert.equal(naNuvem(nuvem, K_PAPEIS, NOVO)?.dados?.status, 'aguardando_aprovacao');
});
linha();

if (admin.avisos.length || candidato.avisos.length) {
  console.log('Avisos dos pushes (o que o app teria mandado para o console):');
  for (const a of [...candidato.avisos, ...adminOk.avisos, ...admin.avisos]) console.log('   ·', a);
  linha();
}

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
