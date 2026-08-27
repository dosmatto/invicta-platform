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
  marcarPendenteSupabase,
  salvarMapaSupabase, carregarMapasPorPrefixoSupabase, excluirMapasPorPrefixoSupabase,
  excluirDocsPorPrefixoSupabase, excluirColecaoSupabase,
  listarIdsMapasPorPrefixoSupabase, carregarMapasPorIdsSupabase,
  listarMapasMetaPorPrefixoSupabase, carregarMapaSupabase,
  type MapaMetaSupabase } from './supabaseData';
import { cacheObterMapa, cacheGravarMapa, cacheExcluirMapasPorPrefixo } from './mapaCache';
import { temPesadaLocal, removerLocal } from './localComprimido';

export type MapaMeta = MapaMetaSupabase;

// Coleções (arrays de registros com id) espelhadas 1:1 com as chaves locais
const KEYS_LISTA = [
  'inv_clientes', 'inv_fazendas', 'inv_talhoes',
  'inv_safras', 'inv_padroes_elem', 'inv_padroes_amos',
  'inv_grades',                        // grades reais (GradeAmostragem) — não muda
  'inv_bib_laboratorios',              // Fase 3
  'inv_bib_labs',                      // Cadastro de LABORATÓRIOS (quem assina o laudo).
                                       // Entrou no sync na v2.47: nasceu fora dele na v2.44 e,
                                       // sem estar aqui, cloudPushLista era no-op — o cadastro
                                       // e os nomes editados ficavam presos num navegador só.
                                       // Quem já tem itens locais entra por
                                       // migrarLabsParaSyncV1 (store.ts).
  'inv_bib_perfis',                    // Fase 4
  'inv_bib_safras',                    // Fase 5 — Safras
  'inv_bib_grades',                    // Fase 5 — Padrões de Amostragem + Elementos
  'inv_bib_preferencias-analise',      // Fase 5 — Etiqueta
  'inv_bib_equacoes',                  // Fase R1 — Equações de recomendação
  'inv_bib_recomendacoes',             // Fase R2 — Recomendações (conjuntos de equações)
  'inv_bib_exportacao',                // Coeficientes de exportação de nutrientes por cultura.
                                       // Nasce dentro do sync (não há dado local anterior), então
                                       // NÃO precisa de migrar…ParaSyncV1 como os vizinhos.
  'inv_bib_insumos',                   // Parte XIV — Insumos. Entrou no sync na v2.42, quando
                                       // as equações passaram a apontar para eles: FK que não
                                       // sincroniza vira custo sumido na outra máquina.
                                       // Quem já tinha insumos locais entra por
                                       // migrarInsumosParaSyncV1 (store.ts) — leia lá antes
                                       // de mexer nesta linha.
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
  'inv_convites',                      // IAM — convites por link (token/validade/status)
  'inv_auditoria',                     // IAM — trilha de auditoria (quem fez o quê)
  'inv_perfis_permissao',              // IAM — perfis de permissão salvos com nome
  'inv_prescricoes',                   // Prescrições Agronômicas (doses por zona → arquivo de aplicação)
];
// Configurações (objeto único por chave) — coleção 'inv_config', doc = chave
const KEYS_OBJ = ['inv_etiqueta_cfg'];

let ativo = false;

export const cloudAtivo = () => ativo;

// A nuvem manda nos dados, mas o boot dela ainda NÃO confirmou (falhou, estourou
// os 12s do AppContext, ou segue rodando em 2º plano). Neste estado uma coleção
// vazia no local significa "ainda não sei", NÃO "não existe" — quem semeia
// registros com id FIXO tem que esperar, senão o push por id sobrescreve na nuvem
// (e em todas as máquinas) o que o usuário havia editado.
export function cloudAindaNaoHidratou(): boolean {
  return usarDadosSupabase() && !ativo;
}

// Marca uma chave como pendente de subida ANTES do boot. Só faz sentido para
// chave que acabou de entrar em KEYS_LISTA e ainda não existe na nuvem — sem
// isto o boot grava o vazio da nuvem por cima do local. Ver
// marcarPendenteSupabase (supabaseData.ts) e migrarInsumosParaSyncV1 (store.ts).
export function cloudMarcarPendente(key: string) {
  if (!usarDadosSupabase()) return;
  marcarPendenteSupabase(key);
}

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

// Coleções PESADAS ou exclusivas da plataforma que o app de CAMPO (Coleta) NÃO
// lê. Baixá-las no celular estourava o localStorage ("armazenamento cheio") —
// só inv_condutividade já passa de 2 MB. O campo é READ-ONLY nelas (cria apenas
// coletas/medições/leituras, que têm sync próprio por doc), então não baixá-las
// não afeta a nuvem nem a sincronização.
const KEYS_PULAR_CAMPO = new Set<string>([
  'inv_condutividade', 'inv_produtividade', 'inv_mde', 'inv_mde_camadas',
  'inv_composicoes', 'inv_meap_ambientes', 'inv_meap_zoneamentos',
  'inv_lab', 'inv_compactacao', 'inv_precos', 'inv_paletas', 'inv_estilo_presets',
  'inv_bib_laboratorios', 'inv_bib_labs', 'inv_bib_perfis', 'inv_bib_preferencias-analise',
  'inv_bib_equacoes', 'inv_bib_recomendacoes',
  'inv_padroes_elem', 'inv_padroes_amos',
  'inv_prescricoes',                   // plataforma-only: o app de campo não lê prescrições
  'inv_bib_insumos',                   // idem — insumos só servem às prescrições e às equações
  'inv_bib_exportacao',                // idem — só o relatório de produtividade usa
]);
const KEYS_LISTA_CAMPO = KEYS_LISTA.filter(k => !KEYS_PULAR_CAMPO.has(k));

// MODO CAMPO LIGADO. O boot do app de coleta APAGA do aparelho as coleções acima
// e não as hidrata — logo, o que sobra delas no localStorage é vazio (ou um seed
// que as migrações do boot acabaram de criar em cima do vazio). Empurrar isso
// para a nuvem substitui o cadastro REAL de todo mundo pelo seed de fábrica.
//
// Foi o que aconteceu (27/08/2026): abrir /coleta apagava `inv_bib_preferencias-
// analise` do aparelho, as migrações do boot semeavam o catálogo do zero e o
// primeiro push, sem espelho para comparar, ainda podava na nuvem tudo que não
// estivesse no seed. A plataforma inteira via a ordem dos elementos e as
// Preferências de Análise "mudarem sozinhas".
let modoCampoLigado = false;

// Boot do app de CAMPO: hidrata SÓ as coleções que a Coleta usa e, antes,
// APAGA do localStorage as coleções pesadas que boots antigos (versão anterior)
// deixaram — é o que libera o "armazenamento cheio" já na próxima abertura.
export async function bootCloudCampo(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  modoCampoLigado = true;   // trava os pushes das coleções que este boot NÃO hidrata
  if (!usarDadosSupabase()) return false;
  // Limpa as coleções pesadas que boots antigos deixaram; anota se removeu
  // alguma (= este aparelho vinha do boot completo antigo).
  // A presença/remoção cobre os DOIS mundos: localStorage (valores legados) e o
  // cache pesado em memória/IndexedDB (removerLocal apaga ambos e avisa as
  // outras abas). A hidratação já rodou (AppContext aguarda antes deste boot),
  // então temPesadaLocal é confiável.
  let limpouPesada = false;
  for (const k of KEYS_PULAR_CAMPO) {
    try {
      if (localStorage.getItem(k) != null || temPesadaLocal(k)) { removerLocal(k); limpouPesada = true; }
    } catch { /* segue */ }
  }
  // Quando o localStorage estava CHEIO, gravações da base (produtores/fazendas/
  // talhões) falhavam no meio por falta de espaço → a lista local ficava PARCIAL
  // e o boot incremental (só delta) não a repara. Ao liberar espaço pela 1ª vez,
  // força um boot COMPLETO (apaga a marca d'água) para re-baixar a base inteira.
  if (limpouPesada) {
    try { localStorage.removeItem('inv_boot_marca'); localStorage.removeItem('inv_boot_full_em'); } catch { /* segue */ }
    console.log('[nuvem] campo: coleções pesadas limpas — forçando boot completo para repor a base.');
  }
  try {
    await bootSupabaseData(KEYS_LISTA_CAMPO, KEYS_OBJ);
    ativo = true;
    console.log(`[nuvem] ATIVA (campo) — ${KEYS_LISTA_CAMPO.length} coleções; ${KEYS_PULAR_CAMPO.size} pesadas puladas/limpas.`);
  } catch (e) {
    console.warn('[nuvem] Supabase indisponível, usando dados locais:', e);
    ativo = false;
  }
  return ativo;
}

// Espelha uma gravação de lista no Supabase.
export function cloudPushLista(key: string, lista: unknown[]) {
  if (!KEYS_LISTA.includes(key)) return;
  if (modoCampoLigado && KEYS_PULAR_CAMPO.has(key)) {
    console.warn('[nuvem] campo: push bloqueado em', key, '— coleção não hidratada neste aparelho.');
    return;
  }
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
