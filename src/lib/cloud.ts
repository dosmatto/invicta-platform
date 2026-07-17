'use client';

// Espelho do store local (localStorage) na nuvem (Supabase/Postgres).
//
// O app continua lendo o localStorage de forma síncrona (nenhuma tela muda).
// A nuvem entra em dois momentos:
//   1. boot: baixa todas as coleções e substitui o cache local;
//   2. gravação: cada save() espelha a lista/objeto no Supabase.
//
// Sem NEXT_PUBLIC_SUPABASE_* (ou com NEXT_PUBLIC_USE_SUPABASE_DATA != 'true'),
// tudo aqui é no-op e o app roda 100% local (localStorage), como antes.

import { usuarioAtual } from './auth';
import { usarDadosSupabase, bootSupabaseData, pushListaSupabase, pushObjSupabase,
  salvarMapaSupabase, carregarMapasPorPrefixoSupabase, excluirMapasPorPrefixoSupabase,
  excluirDocsPorPrefixoSupabase, excluirColecaoSupabase,
  listarIdsMapasPorPrefixoSupabase, carregarMapasPorIdsSupabase,
  listarMapasMetaPorPrefixoSupabase, carregarMapaSupabase,
  type MapaMetaSupabase } from './supabaseData';
import { cacheObterMapa, cacheGravarMapa, cacheExcluirMapasPorPrefixo } from './mapaCache';

export type MapaMeta = MapaMetaSupabase;

// Coleções (arrays de registros com id) espelhadas 1:1 com as chaves locais
const KEYS_LISTA = [
  'inv_clientes', 'inv_fazendas', 'inv_talhoes',
  'inv_safras', 'inv_padroes_elem', 'inv_padroes_amos',
  'inv_grades',                        // grades reais (GradeAmostragem) — não muda
  'inv_bib_laboratorios',              // Fase 3
  'inv_bib_perfis',                    // Fase 4
  'inv_bib_safras',                    // Fase 5 — Safras
  'inv_bib_grades',                    // Fase 5 — Padrões de Amostragem + Elementos
  'inv_bib_preferencias-analise',      // Fase 5 — Etiqueta
  'inv_bib_equacoes',                  // Fase R1 — Equações de recomendação
  'inv_bib_recomendacoes',             // Fase R2 — Recomendações (conjuntos de equações)
  'inv_estilo_presets',                // Presets de divisão de classes do estilo de dose
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

let ativo = false;

export const cloudAtivo = () => ativo;

// Pode gravar/ler docs independentes (mapas) basta a nuvem estar configurada e
// haver um usuário logado. Mapas são docs autônomos (upsert por id).
export function cloudPodeGravar(): boolean {
  return usarDadosSupabase() && !!usuarioAtual();
}

// Baixa tudo antes do app renderizar. Retorna true se a nuvem está ativa.
export async function bootCloud(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!usarDadosSupabase()) return false;
  try {
    await bootSupabaseData(KEYS_LISTA, KEYS_OBJ);
    ativo = true;
    console.log('[nuvem] ATIVA — dados no Supabase (Postgres).');
  } catch (e) {
    console.warn('[nuvem] Supabase indisponível, usando dados locais:', e);
    ativo = false;
  }
  return ativo;
}

// Espelha uma gravação de lista no Supabase.
export function cloudPushLista(key: string, lista: unknown[]) {
  if (!KEYS_LISTA.includes(key)) return;
  if (!usarDadosSupabase()) return;
  void pushListaSupabase(key, lista);
}

// Espelha uma configuração (objeto único) no Supabase.
export function cloudPushObj(key: string, json: string) {
  if (!KEYS_OBJ.includes(key)) return;
  if (!usarDadosSupabase()) return;
  void pushObjSupabase(key, json);
}

// ── Mapas de fertilidade (carregados sob demanda, não no boot) ──────────────
export function cloudSalvarMapa(id: string, dados: object) {
  if (!usarDadosSupabase()) return;
  if (!cloudPodeGravar()) { console.warn('[nuvem] sem login — mapa NÃO foi salvo (não persiste):', id); return; }
  // Write-through no cache local com o MESMO atualizado_em enviado à nuvem:
  // a próxima listagem valida o hit sem re-baixar o que acabou de ser salvo.
  const em = new Date().toISOString();
  void salvarMapaSupabase(id, dados, em);
  void cacheGravarMapa(id, em, dados);
}

// Por prefixo, com CACHE LOCAL (IndexedDB): a rede só carrega a listagem leve
// (id + atualizado_em) e os mapas ausentes/desatualizados; o resto vem do
// aparelho. Rasters já vistos abrem sem re-baixar megabytes.
export async function cloudCarregarMapasPorPrefixo<T>(prefixo: string): Promise<Array<{ id: string; dados: T }>> {
  if (!usarDadosSupabase()) return [];
  const ids = await listarIdsMapasPorPrefixoSupabase(prefixo);
  if (ids === null) return carregarMapasPorPrefixoSupabase<T>(prefixo);   // listagem falhou → caminho antigo
  if (ids.length === 0) return [];
  const hits = await Promise.all(ids.map(async ({ id, atualizadoEm }) => {
    const hit = await cacheObterMapa<T>(id);
    return hit && hit.atualizadoEm === atualizadoEm ? { id, dados: hit.dados } : { id, dados: null as T | null };
  }));
  const out: Array<{ id: string; dados: T }> = [];
  const faltam: string[] = [];
  for (const h of hits) { if (h.dados != null) out.push({ id: h.id, dados: h.dados }); else faltam.push(h.id); }
  if (faltam.length) {
    const rows = await carregarMapasPorIdsSupabase<T>(faltam);
    for (const r of rows) {
      void cacheGravarMapa(r.id, r.atualizadoEm, r.dados);   // snapshot síncrono (mapaCache)
      out.push({ id: r.id, dados: r.dados });
    }
  }
  return out;
}

// Listagem SÓ de metadados (sem o grid) — para montar listas/abas sem baixar
// rasters. O grid de um item vem depois com cloudCarregarMapa (cache local).
export async function cloudListarMapasMeta(prefixo: string): Promise<MapaMeta[]> {
  if (!usarDadosSupabase()) return [];
  return (await listarMapasMetaPorPrefixoSupabase(prefixo)) ?? [];
}

// Um mapa completo por id. Com atualizadoEm (da listagem meta), valida o cache
// local antes de ir à rede.
export async function cloudCarregarMapa<T>(id: string, atualizadoEm?: string | null): Promise<{ id: string; dados: T } | null> {
  if (!usarDadosSupabase()) return null;
  if (atualizadoEm !== undefined) {
    const hit = await cacheObterMapa<T>(id);
    if (hit && hit.atualizadoEm === atualizadoEm) return { id, dados: hit.dados };
  }
  const row = await carregarMapaSupabase<T>(id);
  if (!row) return null;
  void cacheGravarMapa(row.id, row.atualizadoEm, row.dados);
  return { id: row.id, dados: row.dados };
}

export async function cloudExcluirMapasPorPrefixo(prefixo: string) {
  if (!usarDadosSupabase()) return;
  void cacheExcluirMapasPorPrefixo(prefixo);
  return excluirMapasPorPrefixoSupabase(prefixo);
}

// Apaga por prefixo de id em QUALQUER coleção (ex.: inv_cenarios id `cen_<talhao>_…`).
export async function cloudExcluirPorPrefixo(key: string, prefixo: string) {
  if (!usarDadosSupabase()) return;
  return excluirDocsPorPrefixoSupabase(key, prefixo);
}

// Apaga TODOS os docs de uma coleção (usado na limpeza total da base).
export async function cloudExcluirColecao(key: string) {
  if (!usarDadosSupabase()) return;
  return excluirColecaoSupabase(key);
}
