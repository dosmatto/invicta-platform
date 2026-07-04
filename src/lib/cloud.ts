'use client';

// Espelho do store local (localStorage) no Firestore — fase 1 da nuvem.
//
// O app continua lendo o localStorage de forma síncrona (nenhuma tela muda).
// A nuvem entra em dois momentos:
//   1. boot: baixa todas as coleções e substitui o cache local (se a nuvem
//      estiver vazia e o local não, sobe o local — migração da 1ª máquina);
//   2. gravação: cada save() espelha o diff (por id) no Firestore.
//
// Cada registro vira um doc {id, json} — JSON serializado para evitar
// limitações de tipos do Firestore (ex.: arrays aninhados de GeoJSON).
// Sem variáveis NEXT_PUBLIC_FIREBASE_*, tudo aqui é no-op.

import { getFb, firebaseConfigurado } from './firebase';
import { collection, deleteDoc, doc, endAt, getDoc, getDocs, orderBy, query, setDoc, startAt } from 'firebase/firestore';
import { usarDadosSupabase, bootSupabaseData, pushListaSupabase, pushObjSupabase,
  salvarMapaSupabase, carregarMapasPorPrefixoSupabase, excluirMapasPorPrefixoSupabase,
  mapasJaMigrados, marcarMapasMigrados,
  salvarDocSupabase, colecaoJaMigrada, marcarColecaoMigrada } from './supabaseData';

// Coleções (arrays de registros com id) espelhadas 1:1 com as chaves locais
const KEYS_LISTA = [
  'inv_clientes', 'inv_fazendas', 'inv_talhoes',
  // Antigas (Fase 5 migra para inv_bib_*). Mantidas para HIDRATAR dados de
  // quem já usa Firestore; após migração viram espelho inerte (nada grava nelas).
  'inv_safras', 'inv_padroes_elem', 'inv_padroes_amos',
  'inv_grades',                        // grades reais (GradeAmostragem) — não muda
  'inv_bib_laboratorios',              // Fase 3
  'inv_bib_perfis',                    // Fase 4
  'inv_bib_safras',                    // Fase 5 — Safras
  'inv_bib_grades',                    // Fase 5 — Padrões de Amostragem + Elementos
  'inv_bib_preferencias-analise',      // Fase 5 — Etiqueta
  'inv_bib_equacoes',                  // Fase R1 — Equações de recomendação
  'inv_bib_recomendacoes',             // Fase R2 — Recomendações (conjuntos de equações)
  'inv_lab', 'inv_legendas',
  'inv_plantios',                      // Fase 8.B — cultura por talhão+safra
  'inv_compactacao',                   // Fase 8.C — penetrometria por profundidade
  'inv_grades_compact',                // #36 — grades de compactação (plataforma cria; app de campo coleta)
  'inv_mde',                           // MDE F1 — metadados das bases altimétricas aprovadas (rasters em inv_mapas_fert)
  'inv_composicoes',                   // IV5 — composições temporais de índices aprovadas (raster em inv_mapas_fert)
  'inv_mde_camadas',                   // MDE F4 — camadas topográficas salvas p/ Zonas de Manejo (raster mdecam__)
  'inv_condutividade',                 // Condutividade Elétrica — Variável Fixa do Talhão (versões/oficial)
  'inv_paletas',                       // paletas de cor salvas (barras reutilizáveis nas legendas)
  'inv_meap_ambientes',                // MEAP — Ambientes Produtivos / Zonas de Manejo (M1)
  'inv_meap_zoneamentos',              // MEAP — zoneamentos salvos (1 padrão → Amostragem)
  'inv_produtividade',                 // Módulo 12 — Mapas de Colheita (metadados/versões; raster sob demanda)
  'inv_precos',                        // #33 — Tabela de preços única (produtos/frete/aplicação) reusada nas Equações
  'inv_empresas',                      // multi-tenant — empresas/membros (sync entre máquinas)
  'inv_papeis',                        // papéis por e-mail (owner/admin/…) — fonte da verdade de acesso
  'inv_permissoes',                    // capacidades por papel (U2, editável pelo Owner)
  'inv_planos',                        // planos de assinatura do produtor (U3.B)
];
// Configurações (objeto único por chave) — coleção 'inv_config', doc = chave
const KEYS_OBJ = ['inv_etiqueta_cfg'];

const TIMEOUT_BOOT_MS = 20000;

// Último estado conhecido da nuvem (key -> id -> json) para diff nas gravações
const espelho: Record<string, Map<string, string>> = {};
let ativo = false;

export const cloudAtivo = () => ativo;

// Pode gravar/ler docs independentes (mapas) basta estar logado — NÃO depende do
// boot ter terminado de hidratar todas as listas (que é o que `ativo` indica).
// Mapas são docs autônomos (setDoc por id), então não precisam do espelho/diff.
export function cloudPodeGravar(): boolean {
  return firebaseConfigurado && !!getFb()?.auth.currentUser;
}

function lerLocal(key: string): { id: string }[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]'); } catch { return []; }
}

async function hidratarLista(key: string) {
  const fb = getFb()!;
  const snap = await getDocs(collection(fb.db, key));
  const nuvem = new Map<string, string>();
  snap.forEach(d => { const j = (d.data() as { json?: string }).json; if (j) nuvem.set(d.id, j); });

  if (nuvem.size > 0) {
    const arr = [...nuvem.values()].map(j => JSON.parse(j));
    localStorage.setItem(key, JSON.stringify(arr));
  } else {
    // nuvem vazia: sobe o que existir localmente (migração inicial)
    for (const rec of lerLocal(key)) {
      const json = JSON.stringify(rec);
      await setDoc(doc(fb.db, key, String(rec.id)), { id: String(rec.id), json });
      nuvem.set(String(rec.id), json);
    }
  }
  espelho[key] = nuvem;
}

async function hidratarObj(key: string) {
  const fb = getFb()!;
  const ref = doc(fb.db, 'inv_config', key);
  const snap = await getDoc(ref);
  const m = new Map<string, string>();
  if (snap.exists()) {
    const j = (snap.data() as { json?: string }).json;
    if (j) { localStorage.setItem(key, j); m.set(key, j); }
  } else {
    const local = localStorage.getItem(key);
    if (local) { await setDoc(ref, { json: local }); m.set(key, local); }
  }
  espelho[key] = m;
}

// Baixa tudo antes do app renderizar. Retorna true se a nuvem está ativa.
export async function bootCloud(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  // Dados no Supabase/Postgres (D1.2) — substitui o Firestore quando o interruptor
  // está ligado. Hidrata o cache local a partir das tabelas e segue o fluxo normal.
  if (usarDadosSupabase()) {
    try {
      await bootSupabaseData(KEYS_LISTA, KEYS_OBJ);
      ativo = true;
      console.log('[nuvem] ATIVA — dados no Supabase (Postgres).');
      await migrarMapasParaSupabaseSeVazio();   // 1ª vez: leva os mapas do Firestore p/ o Supabase
      // cenários (doc traz o objeto no campo `json`) e relatórios (objeto direto)
      await migrarColecaoParaSupabaseSeVazio('inv_cenarios', (d) => {
        try { return JSON.parse((d as { json?: string }).json ?? 'null'); } catch { return null; }
      });
      await migrarColecaoParaSupabaseSeVazio('inv_relatorios', (d) => (d ?? null) as object | null);
    }
    catch (e) { console.warn('[nuvem] Supabase indisponível, usando dados locais:', e); ativo = false; }
    return ativo;
  }
  if (!firebaseConfigurado) return false;
  const fb = getFb();
  if (!fb?.auth.currentUser) { console.warn('[nuvem] sem usuário logado — nuvem inativa.'); ativo = false; return false; }
  const trabalho = (async () => {
    // Em paralelo — antes era sequencial (16 coleções uma a uma), o que
    // estourava o timeout em conexões lentas e deixava a nuvem inativa.
    await Promise.all(KEYS_LISTA.map(k => hidratarLista(k)));
    await Promise.all(KEYS_OBJ.map(k => hidratarObj(k)));
  })();
  const timeout = new Promise<never>((_, rej) =>
    setTimeout(() => rej(new Error('timeout ao conectar na nuvem')), TIMEOUT_BOOT_MS));
  try {
    await Promise.race([trabalho, timeout]);
    ativo = true;
    console.log('[nuvem] ATIVA — sincronizando com o Firestore.');
  } catch (e) {
    // segue 100% local nesta sessão (sem push, para não corromper o espelho)
    console.warn('[nuvem] indisponível, usando dados locais:', e);
    ativo = false;
  }
  return ativo;
}

// Espelha uma gravação de lista (diff por id contra o último estado conhecido)
export function cloudPushLista(key: string, lista: unknown[]) {
  if (!KEYS_LISTA.includes(key)) return;
  if (usarDadosSupabase()) { void pushListaSupabase(key, lista); return; }
  if (!ativo) return;
  const fb = getFb();
  if (!fb) return;
  const prev = espelho[key] ?? new Map<string, string>();
  const next = new Map<string, string>();
  for (const rec of lista as { id: unknown }[]) next.set(String(rec.id), JSON.stringify(rec));
  espelho[key] = next;
  (async () => {
    for (const [id, json] of next) {
      if (prev.get(id) !== json) await setDoc(doc(fb.db, key, id), { id, json });
    }
    for (const id of prev.keys()) {
      if (!next.has(id)) await deleteDoc(doc(fb.db, key, id));
    }
  })().catch(e => console.warn(`[nuvem] falha ao gravar ${key}:`, e));
}

// Espelha uma configuração (objeto único)
export function cloudPushObj(key: string, json: string) {
  if (!KEYS_OBJ.includes(key)) return;
  if (usarDadosSupabase()) { void pushObjSupabase(key, json); return; }
  if (!ativo) return;
  const fb = getFb();
  if (!fb) return;
  espelho[key] = new Map([[key, json]]);
  setDoc(doc(fb.db, 'inv_config', key), { json })
    .catch(e => console.warn(`[nuvem] falha ao gravar ${key}:`, e));
}

// ── Mapas de fertilidade (carregados sob demanda, não no boot) ──────────────
// Coleção 'inv_mapas_fert'. O id de cada doc carrega o contexto inteiro
// (talhao/importacao/metodo/pixel/variograma/nutriente/profundidade) para
// permitir busca por prefixo sem indices secundarios.
const COL_MAPAS = 'inv_mapas_fert';

export function cloudSalvarMapa(id: string, dados: object) {
  if (usarDadosSupabase()) { void salvarMapaSupabase(id, dados); return; }
  if (!cloudPodeGravar()) { console.warn('[nuvem] sem login — mapa NÃO foi salvo (não persiste):', id); return; }
  const fb = getFb();
  if (!fb) return;
  setDoc(doc(fb.db, COL_MAPAS, id), { json: JSON.stringify(dados) })
    .then(() => console.log('[nuvem] mapa salvo:', id))
    .catch(e => console.warn(`[nuvem] falha ao salvar mapa ${id}:`, e));
}

export async function cloudCarregarMapasPorPrefixo<T>(prefixo: string): Promise<Array<{ id: string; dados: T }>> {
  if (usarDadosSupabase()) return carregarMapasPorPrefixoSupabase<T>(prefixo);
  if (!cloudPodeGravar()) return [];
  const fb = getFb();
  if (!fb) return [];
  try {
    const q = query(collection(fb.db, COL_MAPAS), orderBy('__name__'), startAt(prefixo), endAt(prefixo + ''));
    const snap = await getDocs(q);
    const out: Array<{ id: string; dados: T }> = [];
    snap.forEach(d => {
      const j = (d.data() as { json?: string }).json;
      if (j) { try { out.push({ id: d.id, dados: JSON.parse(j) as T }); } catch {} }
    });
    console.log(`[nuvem] mapas carregados p/ prefixo "${prefixo}":`, out.length, '(ativo=' + ativo + ')');
    return out;
  } catch (e) {
    console.warn('[nuvem] falha ao carregar mapas:', e);
    return [];
  }
}

export async function cloudExcluirMapasPorPrefixo(prefixo: string) {
  if (usarDadosSupabase()) return excluirMapasPorPrefixoSupabase(prefixo);
  if (!cloudPodeGravar()) return;
  const fb = getFb();
  if (!fb) return;
  try {
    const q = query(collection(fb.db, COL_MAPAS), orderBy('__name__'), startAt(prefixo), endAt(prefixo + ''));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  } catch (e) { console.warn('[nuvem] falha ao excluir mapas:', e); }
}

// Migração ÚNICA dos mapas Firestore → Supabase (na 1ª carga com dados no Postgres).
// Lê toda a coleção de mapas do Firestore (via a ponte anônima) e grava no Supabase.
// Idempotente: só roda quando o Supabase ainda não tem nenhum mapa.
async function migrarMapasParaSupabaseSeVazio() {
  try {
    if (await mapasJaMigrados()) return;                // já concluiu (flag) — não relê o Firestore
    const fb = getFb();
    console.log('[nuvem][mig-mapas] Firebase logado (ponte)?', !!fb?.auth.currentUser);
    if (!fb?.auth.currentUser) return;                  // sem ponte Firebase agora — tenta na próxima carga
    const snap = await getDocs(collection(fb.db, COL_MAPAS));
    console.log('[nuvem][mig-mapas] copiando', snap.size, 'mapas do Firestore → Supabase…');
    for (const d of snap.docs) {
      const j = (d.data() as { json?: string }).json;
      if (!j) continue;
      try { await salvarMapaSupabase(d.id, JSON.parse(j)); } catch {}
    }
    await marcarMapasMigrados();                        // marca como concluído (idempotente)
    console.log('[nuvem][mig-mapas] concluído.');
  } catch (e) { console.warn('[nuvem] falha ao migrar mapas:', e); }
}

// Migração única genérica de uma coleção Firestore → Supabase (cenários, relatórios).
// `transform` converte o doc do Firestore no objeto a guardar (ou null p/ pular).
async function migrarColecaoParaSupabaseSeVazio(colecao: string, transform: (d: unknown) => object | null) {
  try {
    if (await colecaoJaMigrada(colecao)) return;
    const fb = getFb();
    if (!fb?.auth.currentUser) return;
    const snap = await getDocs(collection(fb.db, colecao));
    for (const d of snap.docs) {
      const obj = transform(d.data());
      if (obj) { try { await salvarDocSupabase(colecao, d.id, obj); } catch {} }
    }
    await marcarColecaoMigrada(colecao);
    console.log(`[nuvem][mig] ${colecao}: ${snap.size} migrados p/ o Supabase`);
  } catch (e) { console.warn(`[nuvem][mig] falha em ${colecao}:`, e); }
}

// Apaga por prefixo de id em QUALQUER coleção (ex.: inv_cenarios id `cen_<talhao>_…`).
// U+F8FF é o sentinela alto do Firestore para o fim do intervalo de prefixo.
export async function cloudExcluirPorPrefixo(key: string, prefixo: string) {
  if (!cloudPodeGravar()) return;
  const fb = getFb();
  if (!fb) return;
  try {
    const q = query(collection(fb.db, key), orderBy('__name__'), startAt(prefixo), endAt(prefixo + ''));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  } catch (e) { console.warn('[nuvem] falha ao excluir por prefixo', key, prefixo, e); }
}

// Apaga TODOS os docs de uma coleção (usado na limpeza total da base).
export async function cloudExcluirColecao(key: string) {
  if (!cloudPodeGravar()) return;
  const fb = getFb();
  if (!fb) return;
  try {
    const snap = await getDocs(collection(fb.db, key));
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  } catch (e) { console.warn('[nuvem] falha ao excluir coleção', key, e); }
}
