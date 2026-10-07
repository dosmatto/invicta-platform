// Lado SERVIDOR de POST /api/v1/programacao: chave da integração, leitura do
// talhão/zoneamento/prescrições e gravação no app_kv.
//
// Roda com a SERVICE ROLE (passa por cima da RLS): todo recorte de escopo —
// empresa da chave × empresa do talhão — é feito AQUI, explicitamente. Nada que
// decide VALOR vive aqui; isso é do núcleo puro (nucleo.ts).

import type { SupabaseClient } from '@supabase/supabase-js';
import { chaveDoHeader, hashChave } from '../laudo/servidor.ts';
import type { Prescricao } from '../prescricao/tipos.ts';
import type { TalhaoAlvo, ZoneamentoAlvo } from './nucleo.ts';

export { servicoConfigurado, clienteServico } from '../laudo/servidor.ts';

export const COL_PRESCRICOES = 'inv_prescricoes';
export const COL_ZONEAMENTOS = 'inv_meap_zoneamentos';

// ── Autenticação ─────────────────────────────────────────────────────────────

export interface IntegracaoAutenticada {
  chaveId: string;
  sistema: 'lavra';
  nome: string;
  empresaId: string | null;
}

/**
 * Chave de INTEGRAÇÃO (tabela `integracao_chaves`, docs/integracao-lavra.sql) —
 * separada de `lab_chaves` de propósito: chave de laboratório escreve laudo,
 * chave da Lavra escreve prescrição. Uma tabela só exigiria escopo por coluna e
 * um erro nela daria a um laboratório o poder de mandar dose para a máquina.
 */
export async function autenticarIntegracao(sb: SupabaseClient, auth: string | null): Promise<IntegracaoAutenticada | null> {
  const chave = chaveDoHeader(auth);
  if (!chave) return null;
  const { data, error } = await sb
    .from('integracao_chaves')
    .select('id, sistema, nome, empresa_id')
    .eq('hash', hashChave(chave))
    .eq('sistema', 'lavra')
    .is('revogada_em', null)
    .limit(1);
  if (error || !data?.length) return null;
  const r = data[0];
  // O builder do postgrest-js é preguiçoso: sem await/then a UPDATE nem sai.
  // Aguarda (em função serverless, promessa solta pode morrer com a resposta)
  // e engole a falha — registrar o uso não pode derrubar a integração.
  try { await sb.from('integracao_chaves').update({ ultimo_uso_em: new Date().toISOString() }).eq('id', r.id); } catch { /* best-effort */ }
  return {
    chaveId: String(r.id),
    sistema: 'lavra',
    nome: String(r.nome ?? ''),
    empresaId: r.empresa_id == null ? null : String(r.empresa_id),
  };
}

// ── Leitura ──────────────────────────────────────────────────────────────────

/** Talhão pelo id — `null` se não existe OU é de outra empresa (mesma resposta,
 *  para a chave não servir de sonda de ids alheios). */
export async function carregarTalhao(sb: SupabaseClient, id: string, chave: IntegracaoAutenticada): Promise<TalhaoAlvo | null> {
  const { data, error } = await sb.from('talhoes').select('id, empresa_id, area_ha, dados').eq('id', id).limit(1);
  if (error || !data?.length) return null;
  const r = data[0] as { id: string; empresa_id: string | null; area_ha: number | null; dados: { areaHa?: number; empresaId?: string; zoneamentoLiberadoId?: string } | null };
  const empresaId = r.empresa_id ?? r.dados?.empresaId ?? null;
  if (chave.empresaId && empresaId && chave.empresaId !== empresaId) return null;
  return {
    id: String(r.id),
    areaHa: Number(r.area_ha ?? r.dados?.areaHa ?? 0) || 0,
    empresaId,
    zoneamentoLiberadoId: r.dados?.zoneamentoLiberadoId || null,
  };
}

export async function carregarZoneamento(sb: SupabaseClient, id: string): Promise<ZoneamentoAlvo | null> {
  const { data, error } = await sb.from('app_kv').select('dados').eq('colecao', COL_ZONEAMENTOS).eq('item_id', id).limit(1);
  if (error || !data?.length) return null;
  const d = (data[0] as { dados: { id?: string; talhaoId?: string; nome?: string; fc?: GeoJSON.FeatureCollection } }).dados;
  if (!d?.fc || !Array.isArray(d.fc.features)) return null;
  return { id: String(d.id ?? id), talhaoId: String(d.talhaoId ?? ''), nome: String(d.nome ?? ''), fc: d.fc };
}

/**
 * Prescrições deste cultivo já gravadas (qualquer versão, qualquer item) NA
 * EMPRESA DO TALHÃO — nunca lê de outra empresa (ids de cultivo da Lavra são
 * inteiros sequenciais; sem este recorte, uma chave alcançaria a cadeia de
 * outra empresa). Volta também as de outros talhões da mesma empresa: o núcleo
 * só encadeia as deste talhão e usa as outras para avisar de revínculo.
 */
export async function carregarExistentes(sb: SupabaseClient, cultivoId: string, talhao: TalhaoAlvo): Promise<Prescricao[]> {
  let q = sb
    .from('app_kv').select('dados')
    .eq('colecao', COL_PRESCRICOES)
    .eq('dados->origemLavra->>cultivoId', cultivoId);
  q = talhao.empresaId ? q.eq('empresa_id', talhao.empresaId) : q.is('empresa_id', null);
  const { data, error } = await q;
  if (error) throw new Error(`Falha ao ler as prescrições existentes: ${error.message}`);
  return (data ?? []).map(r => (r as { dados: Prescricao }).dados).filter(p => p?.origemLavra);
}

// ── Gravação ─────────────────────────────────────────────────────────────────

/**
 * Upsert por id. Os ids são determinísticos (nucleo.idPrescricaoLavra) e cada
 * versão é um registro NOVO — o servidor nunca reescreve um registro que o
 * navegador já tem. É isso que torna seguro gravar por fora do sync do app:
 * ver "Gravação pelo servidor × sync do navegador" em docs/integracao-lavra.md.
 */
export async function gravarPrescricoes(sb: SupabaseClient, lista: Prescricao[], agora: string): Promise<void> {
  if (!lista.length) return;
  const rows = lista.map(p => ({
    colecao: COL_PRESCRICOES, item_id: p.id, empresa_id: p.empresaId ?? null, dados: p, atualizado_em: agora,
  }));
  const { error } = await sb.from('app_kv').upsert(rows, { onConflict: 'colecao,item_id' });
  if (error) throw new Error(`Falha ao gravar as prescrições: ${error.message}`);
}
