// Integração PrecisionFarm — FASE 2: banco do recebimento de linhas (Supabase,
// SERVICE ROLE). Implementa a porta RepoRecebimento (recebimento.ts) e as
// leituras da aba "Linhas" do talhão.
//
// Tabelas (docs/integracao-precisionfarm-fase2.sql), todas com RLS ligada e
// NENHUMA política — só estas rotas do servidor alcançam:
//   pf_entrada_eventos  fila de avisos recebidos (+ estado do recibo)
//   pf_linhas_camadas   uma linha por resource_id (camada) com a vigente
//   pf_linhas_revisoes  snapshots IMUTÁVEIS (trigger recusa UPDATE/DELETE)
//   pf_entrada_cursor   cursor de GET {PF}/changes
// app_kv e talhoes NUNCA são escritos aqui (app local-first).

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CamadaLinhas, Descarte, EventoExistente, EventoFila, NovaRevisaoLinhas, NovoEvento, PatchEvento, PatchVigente,
  RepoRecebimento, RevisaoGuardada, VinculoRecebimento,
} from './recebimento.ts';

const COLS_EVENTO = 'id, event_id, conteudo_hash, evento, vinculo_id, talhao_id, resource_id, resource_revision, origem, status, tentativas, proxima_tentativa_em, ultimo_erro, recibo_status, recibo_motivo, recibo_enviado_em, recibo_tentativas, recibo_proxima_em, recibo_erro';
const COLS_CAMADA = 'resource_id, vinculo_id, talhao_id, revisao_vigente, revisao_geometria, arquivada, arquivada_em, nome, integration_name, cropping_cycle, operation_category, spacing_m, boundary_revision, n_feicoes, n_vertices, ultimo_erro, ultimo_erro_em, ultima_sincronizacao_em';
const COLS_VINCULO = 'id, talhao_id, parceria, empresa_id, status, shared_producer_id, shared_farm_id, shared_field_id';
const CHAVE_CURSOR = 'changes';

/** Valor entre aspas para filtro or() do PostgREST (datas têm ':' e '.'). */
const q = (v: string) => `"${v.replace(/["\\]/g, '')}"`;

function falhou(o: string, e: { message: string }): never {
  throw new Error(`Falha ao ${o}: ${e.message}`);
}

async function lerExistente(sb: SupabaseClient, eventId: string): Promise<EventoExistente | null> {
  const { data, error } = await sb.from('pf_entrada_eventos').select('id, conteudo_hash, status').eq('event_id', eventId.toLowerCase()).limit(1);
  if (error) falhou('ler o aviso', error);
  const r = data?.[0] as { id: number; conteudo_hash: string; status: EventoExistente['status'] } | undefined;
  return r ? { id: r.id, conteudoHash: r.conteudo_hash, status: r.status } : null;
}

/** Aviso rejeitado volta para a fila do zero (o recibo novo sai depois). */
const PATCH_REABRIR = (agoraIso: string) => ({
  status: 'pendente', tentativas: 0, proxima_tentativa_em: agoraIso, travado_ate: null, ultimo_erro: null, processado_em: null,
  recibo_status: null, recibo_motivo: null, recibo_enviado_em: null, recibo_tentativas: 0, recibo_proxima_em: null, recibo_erro: null,
});

export function criarRepoLinhas(sb: SupabaseClient): RepoRecebimento {
  return {
    async vinculoDoCampo(sharedFieldId) {
      const { data, error } = await sb.from('pf_vinculos').select(COLS_VINCULO).eq('shared_field_id', sharedFieldId.toLowerCase()).limit(1);
      if (error) falhou('ler o vínculo', error);
      return (data?.[0] as VinculoRecebimento | undefined) ?? null;
    },

    async camada(resourceId) {
      const { data, error } = await sb.from('pf_linhas_camadas').select(COLS_CAMADA).eq('resource_id', resourceId).limit(1);
      if (error) falhou('ler a camada de linhas', error);
      return (data?.[0] as CamadaLinhas | undefined) ?? null;
    },

    async criarCamada(a) {
      const { error } = await sb.from('pf_linhas_camadas').upsert(a, { onConflict: 'resource_id', ignoreDuplicates: true });
      if (error) falhou('criar a camada de linhas', error);
    },

    async eventoExistente(eventId) {
      return lerExistente(sb, eventId);
    },

    async inserirEvento(row: NovoEvento) {
      const { error } = await sb.from('pf_entrada_eventos').insert(row);
      if (!error) return { inserido: true as const };
      if (error.code !== '23505') falhou('enfileirar o aviso', error);
      const ex = await lerExistente(sb, row.event_id);
      if (!ex) throw new Error('Aviso repetido sumiu da fila.');
      return { inserido: false as const, existente: ex };
    },

    async reabrirEvento(id, agoraIso) {
      const { error } = await sb.from('pf_entrada_eventos').update(PATCH_REABRIR(agoraIso)).eq('id', id).eq('status', 'rejeitado');
      if (error) falhou('reabrir o aviso', error);
    },

    async reabrirRejeitadosDaCamada(resourceId, agoraIso) {
      const { data, error } = await sb.from('pf_entrada_eventos').update(PATCH_REABRIR(agoraIso))
        .eq('resource_id', resourceId).eq('status', 'rejeitado').select('id');
      if (error) falhou('reabrir os avisos da camada', error);
      return (data ?? []).length;
    },

    async registrarDescarte(d: Descarte, agoraIso) {
      const { error } = await sb.from('pf_entrada_descartes').insert({
        origem: d.origem, event_id: d.event_id, motivo: d.motivo.slice(0, 2000), item: d.item ?? null, registrado_em: agoraIso,
      });
      if (error) falhou('registrar o evento descartado', error);
    },

    async eventosProntos(agoraIso, limite) {
      const { data, error } = await sb.from('pf_entrada_eventos').select(COLS_EVENTO)
        .eq('status', 'pendente').lte('proxima_tentativa_em', agoraIso)
        .or(`travado_ate.is.null,travado_ate.lt.${q(agoraIso)}`)
        .order('id', { ascending: true }).limit(limite);
      if (error) falhou('ler a fila', error);
      return (data ?? []) as EventoFila[];
    },

    async travarEvento(id, agoraIso, ateIso) {
      const { data, error } = await sb.from('pf_entrada_eventos').update({ travado_ate: ateIso })
        .eq('id', id).eq('status', 'pendente')
        .or(`travado_ate.is.null,travado_ate.lt.${q(agoraIso)}`)
        .select('id');
      if (error) falhou('travar o aviso', error);
      return (data ?? []).length === 1;
    },

    async atualizarEvento(id, patch: PatchEvento, seReciboProximaEm?: string) {
      let q = sb.from('pf_entrada_eventos').update(patch).eq('id', id);
      if (seReciboProximaEm !== undefined) q = q.eq('recibo_proxima_em', seReciboProximaEm);
      const { error } = await q;
      if (error) falhou('atualizar o aviso', error);
    },

    async revisaoGuardada(resourceId, n) {
      const { data, error } = await sb.from('pf_linhas_revisoes')
        .select('checksum, operation, boundary_revision, nome, integration_name, cropping_cycle, operation_category, spacing_m, n_feicoes, n_vertices')
        .eq('resource_id', resourceId).eq('revision', n).limit(1);
      if (error) falhou('ler a revisão guardada', error);
      const r = data?.[0] as {
        checksum: string; operation: 'upsert' | 'archive'; boundary_revision: number; nome: string | null; integration_name: string | null;
        cropping_cycle: string | null; operation_category: string | null; spacing_m: number | null; n_feicoes: number | null; n_vertices: number | null;
      } | undefined;
      if (!r) return null;
      const out: RevisaoGuardada = {
        checksum: r.checksum, operation: r.operation, boundary_revision: r.boundary_revision,
        meta: r.operation === 'upsert' ? {
          nome: r.nome ?? '', integrationName: r.integration_name, ciclo: r.cropping_cycle, categoria: r.operation_category,
          espacamentoM: r.spacing_m, nFeicoes: r.n_feicoes ?? 0, nVertices: r.n_vertices ?? 0,
        } : null,
      };
      return out;
    },

    async guardarRevisao(row: NovaRevisaoLinhas) {
      const m = row.meta;
      const { error } = await sb.from('pf_linhas_revisoes').insert({
        resource_id: row.resource_id, revision: row.revision, event_id: row.event_id, checksum: row.checksum,
        operation: row.operation, boundary_revision: row.boundary_revision, envelope: row.envelope,
        nome: m?.nome ?? null, integration_name: m?.integrationName ?? null, cropping_cycle: m?.ciclo ?? null,
        operation_category: m?.categoria ?? null, spacing_m: m?.espacamentoM ?? null,
        n_feicoes: m?.nFeicoes ?? null, n_vertices: m?.nVertices ?? null, tamanho_bytes: m?.bytes ?? null,
        n_sem_kind: m?.nSemKind ?? null, observacao: m?.observacao ?? null,
      });
      if (!error) return 'ok';
      if (error.code === '23505') return 'existe';
      falhou('guardar a revisão', error);
    },

    async promoverVigente(resourceId, p: PatchVigente, agoraIso) {
      const patch: Record<string, unknown> = {
        revisao_vigente: p.revisao_vigente, arquivada: p.arquivada, arquivada_em: p.arquivada_em,
        boundary_revision: p.boundary_revision, ultimo_erro: null, ultimo_erro_em: null, atualizado_em: agoraIso,
      };
      if (p.geometria) {
        const m = p.geometria.meta;
        Object.assign(patch, {
          revisao_geometria: p.geometria.revisao, nome: m.nome, integration_name: m.integrationName, cropping_cycle: m.ciclo,
          operation_category: m.categoria, spacing_m: m.espacamentoM, n_feicoes: m.nFeicoes, n_vertices: m.nVertices,
        });
      }
      // Condição atômica: só promove se for MAIOR que a vigente (sem regressão
      // mesmo com dois processadores aplicando revisões ao mesmo tempo).
      const { data, error } = await sb.from('pf_linhas_camadas').update(patch)
        .eq('resource_id', resourceId)
        .or(`revisao_vigente.is.null,revisao_vigente.lt.${p.revisao_vigente}`)
        .select('resource_id');
      if (error) falhou('promover a revisão vigente', error);
      return (data ?? []).length === 1;
    },

    async marcarSincronizada(resourceId, agoraIso) {
      const { error } = await sb.from('pf_linhas_camadas').update({ ultima_sincronizacao_em: agoraIso }).eq('resource_id', resourceId);
      if (error) falhou('marcar a sincronização', error);
    },

    async registrarErroCamada(resourceId, motivo, agoraIso) {
      const { error } = await sb.from('pf_linhas_camadas').update({ ultimo_erro: motivo.slice(0, 1000), ultimo_erro_em: agoraIso, atualizado_em: agoraIso }).eq('resource_id', resourceId);
      if (error) falhou('registrar o erro da camada', error);
    },

    async recibosPendentes(agoraIso, limite) {
      const { data, error } = await sb.from('pf_entrada_eventos').select(COLS_EVENTO)
        .not('recibo_status', 'is', null).is('recibo_enviado_em', null)
        .lte('recibo_proxima_em', agoraIso)
        .order('recibo_proxima_em', { ascending: true }).limit(limite);
      if (error) falhou('ler os recibos pendentes', error);
      return (data ?? []) as EventoFila[];
    },

    async lerCursor() {
      const { data, error } = await sb.from('pf_entrada_cursor').select('cursor').eq('chave', CHAVE_CURSOR).limit(1);
      if (error) falhou('ler o cursor', error);
      return String((data?.[0] as { cursor?: string } | undefined)?.cursor ?? '0');
    },

    async gravarCursor(cursor, agoraIso) {
      const { error } = await sb.from('pf_entrada_cursor').upsert({ chave: CHAVE_CURSOR, cursor, atualizado_em: agoraIso }, { onConflict: 'chave' });
      if (error) falhou('gravar o cursor', error);
    },
  };
}

// ── Leituras da tela (aba Linhas) ────────────────────────────────────────────

export interface RevisaoTela {
  resource_id: string; revision: number; operation: 'upsert' | 'archive'; checksum: string; recebido_em: string;
  n_feicoes: number | null; boundary_revision: number; observacao: string | null;
}

export async function camadasDoTalhao(sb: SupabaseClient, talhaoId: string): Promise<CamadaLinhas[]> {
  const { data, error } = await sb.from('pf_linhas_camadas').select(COLS_CAMADA).eq('talhao_id', talhaoId).order('nome', { ascending: true });
  if (error) falhou('ler as camadas de linhas', error);
  return (data ?? []) as CamadaLinhas[];
}

export async function revisoesDasCamadas(sb: SupabaseClient, ids: string[]): Promise<RevisaoTela[]> {
  if (!ids.length) return [];
  const { data, error } = await sb.from('pf_linhas_revisoes')
    .select('resource_id, revision, operation, checksum, recebido_em, n_feicoes, boundary_revision, observacao')
    .in('resource_id', ids).order('revision', { ascending: false }).limit(1000);
  if (error) falhou('ler o histórico de revisões', error);
  return (data ?? []) as RevisaoTela[];
}

export interface AvisoTela {
  resource_id: string; resource_revision: number; status: 'pendente' | 'rejeitado';
  ultimo_erro: string | null; tentativas: number; proxima_tentativa_em: string; processado_em: string | null;
}

/** Avisos pendentes e os rejeitados (histórico de recusas) das camadas. */
export async function avisosDasCamadas(sb: SupabaseClient, ids: string[]): Promise<AvisoTela[]> {
  if (!ids.length) return [];
  const { data, error } = await sb.from('pf_entrada_eventos')
    .select('resource_id, resource_revision, status, ultimo_erro, tentativas, proxima_tentativa_em, processado_em')
    .in('resource_id', ids).in('status', ['pendente', 'rejeitado'])
    .order('id', { ascending: false }).limit(500);
  if (error) falhou('ler a fila do talhão', error);
  return (data ?? []) as AvisoTela[];
}

/** Só a geometria de uma revisão (sem o resto do envelope). */
export async function geometriaDaRevisao(sb: SupabaseClient, resourceId: string, n: number): Promise<{ operation: string; geometria: unknown } | null> {
  const { data, error } = await sb.from('pf_linhas_revisoes')
    .select('operation, geometria:envelope->payload->geometry')
    .eq('resource_id', resourceId).eq('revision', n).limit(1);
  if (error) falhou('ler a geometria da revisão', error);
  return (data?.[0] as { operation: string; geometria: unknown } | undefined) ?? null;
}
