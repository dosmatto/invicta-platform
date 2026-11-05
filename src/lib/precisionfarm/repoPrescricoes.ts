// Integração PrecisionFarm — extensão 0.3.0: banco da publicação de
// PRESCRIÇÕES (Supabase, SERVICE ROLE). Implementa a porta RepoPrescricoesPF
// (publicacaoPrescricoes.ts).
//
//   pf_prescricoes_estrela  estrela "Enviar à PrecisionFarm" por linhagem +
//                           última situação (docs/integracao-precisionfarm-0.3.sql)
//   pf_recursos/pf_revisoes o MESMO esquema de zonas/colheita (resource_type
//                           'prescription' exige o check novo da migração 0.3)
//   app_kv inv_prescricoes  só LIDO (o app é local-first)
//
// Sem a migração 0.3: a tabela das estrelas não existe e o check antigo de
// pf_recursos recusa 'prescription' → MigracaoPendente, com a mensagem de qual
// arquivo aplicar. Zonas, colheita e linhas não são afetadas.

import type { SupabaseClient } from '@supabase/supabase-js';
import { MigracaoPendente, PARCERIA_PADRAO, ehErroDeMigracao } from './contrato.ts';
import type { CabecalhoPrescricao, PrescricaoParaPF } from './prescricaoPF.ts';
import type { EstrelaPrescricao, RepoPrescricoesPF, RevisaoPublicada } from './publicacaoPrescricoes.ts';
import { carregarTalhao, inserirRevisao, ultimaRevisao, vinculoDoTalhao } from './servidor.ts';

const COL_PRESCRICOES = 'inv_prescricoes';
const T_ESTRELA = 'pf_prescricoes_estrela';

function falhou(o: string, e: { code?: string; message: string }): never {
  if (ehErroDeMigracao(e)) throw new MigracaoPendente(o);
  throw new Error(`Falha ao ${o}: ${e.message}`);
}

export function criarRepoPrescricoes(sb: SupabaseClient): RepoPrescricoesPF {
  return {
    async talhao(talhaoId) {
      const t = await carregarTalhao(sb, talhaoId);
      return t ? { id: t.id, nome: t.nome, geoVersao: t.geoVersao } : null;
    },

    async vinculoDoTalhao(talhaoId) {
      return vinculoDoTalhao(sb, talhaoId, PARCERIA_PADRAO);
    },

    async estrelas(talhaoId) {
      const { data, error } = await sb.from(T_ESTRELA).select('talhao_id, linhagem_id, marcada, marcada_por, marcada_em').eq('talhao_id', talhaoId);
      if (error) falhou('ler as estrelas das prescrições', error);
      return (data ?? []) as EstrelaPrescricao[];
    },

    async gravarEstrela(talhaoId, linhagemId, marcada, por, agoraIso) {
      const { error } = await sb.from(T_ESTRELA).upsert(
        { talhao_id: talhaoId, linhagem_id: linhagemId, marcada, marcada_por: por, marcada_em: agoraIso, atualizado_em: agoraIso },
        { onConflict: 'talhao_id,linhagem_id' },
      );
      if (error) falhou('gravar a estrela da prescrição', error);
    },

    async registrarSituacao(talhaoId, linhagemId, s, agoraIso) {
      const { error } = await sb.from(T_ESTRELA)
        .update({ situacao: s.situacao, motivo: s.motivo?.slice(0, 1000) ?? null, revisao: s.revisao, resource_id: s.resource_id, verificado_em: agoraIso })
        .eq('talhao_id', talhaoId).eq('linhagem_id', linhagemId);
      if (error) falhou('registrar a situação da prescrição', error);
    },

    async cabecalhos(talhaoId) {
      const { data, error } = await sb.from('app_kv')
        .select('item_id, origemId:dados->>origemId, versao:dados->versao, atualizadoEm:dados->>atualizadoEm, nome:dados->>nome, removida:dados->origemLavra->removida')
        .eq('colecao', COL_PRESCRICOES).eq('dados->>talhaoId', talhaoId);
      if (error) throw new Error(`Falha ao ler as prescrições: ${error.message}`);
      type Linha = { item_id: string; origemId: string | null; versao: unknown; atualizadoEm: string | null; nome: string | null; removida: unknown };
      return ((data ?? []) as Linha[]).map((r): CabecalhoPrescricao => ({
        id: String(r.item_id), origemId: r.origemId || null, versao: Number(r.versao) || 1,
        atualizadoEm: String(r.atualizadoEm ?? ''), nome: String(r.nome ?? ''), removida: r.removida === true,
      }));
    },

    async prescricao(id) {
      const { data, error } = await sb.from('app_kv').select('dados').eq('colecao', COL_PRESCRICOES).eq('item_id', id).limit(1);
      if (error) throw new Error(`Falha ao ler a prescrição: ${error.message}`);
      const d = (data?.[0] as { dados?: PrescricaoParaPF } | undefined)?.dados;
      return d && Array.isArray(d.zonas) ? d : null;
    },

    async recursosPrescricao(vinculoId) {
      const { data, error } = await sb.from('pf_recursos').select('resource_id, chave_local').eq('vinculo_id', vinculoId).eq('resource_type', 'prescription');
      if (error) throw new Error(`Falha ao ler os recursos: ${error.message}`);
      return (data ?? []) as Array<{ resource_id: string; chave_local: string }>;
    },

    async obterOuCriarRecurso(a) {
      const ler = async () => {
        const { data, error } = await sb.from('pf_recursos').select('resource_id, resource_type').eq('vinculo_id', a.vinculoId).eq('chave_local', a.chaveLocal).limit(1);
        if (error) throw new Error(`Falha ao ler o recurso: ${error.message}`);
        return (data?.[0] as { resource_id: string; resource_type: string } | undefined) ?? null;
      };
      const existe = await ler();
      if (existe) return { resource_id: existe.resource_id };
      const { error } = await sb.from('pf_recursos').upsert(
        { vinculo_id: a.vinculoId, talhao_id: a.talhaoId, resource_type: 'prescription', chave_local: a.chaveLocal },
        { onConflict: 'vinculo_id,chave_local', ignoreDuplicates: true },
      );
      // 23514 = o check antigo (só management_zones/harvest): migração 0.3 pendente.
      if (error) falhou('criar o recurso da prescrição', error);
      const criado = await ler();
      if (!criado) throw new Error('Falha ao criar o recurso da prescrição.');
      return { resource_id: criado.resource_id };
    },

    async ultimaRevisao(resourceId) {
      const r = await ultimaRevisao(sb, resourceId);
      if (!r) return null;
      const out: RevisaoPublicada = {
        resource_id: r.resource_id, revision: r.revision, conteudo_hash: r.conteudo_hash, checksum: r.checksum,
        operation: r.evento?.operation === 'archive' ? 'archive' : 'upsert', publicado_em: r.publicado_em,
      };
      return out;
    },

    async payloadDaRevisao(resourceId, n) {
      const { data, error } = await sb.from('pf_revisoes').select('payload:envelope->payload').eq('resource_id', resourceId).eq('revision', n).limit(1);
      if (error) throw new Error(`Falha ao ler a revisão: ${error.message}`);
      const p = (data?.[0] as { payload?: Record<string, unknown> } | undefined)?.payload;
      return p && typeof p === 'object' ? p : null;
    },

    async inserirRevisao(a) {
      return inserirRevisao(sb, a);
    },
  };
}

// ── Leituras da tela de lote ─────────────────────────────────────────────────

export interface ResumoEstrelasTalhao { marcadas: number; publicadas: number; pendentes: number }

/** Estrelas de vários talhões (tela de lote). null = migração 0.3 pendente
 *  (a coluna aparece vazia, sem quebrar a tela). */
export async function resumoEstrelasDosTalhoes(sb: SupabaseClient, talhaoIds: string[]): Promise<Map<string, ResumoEstrelasTalhao> | null> {
  const m = new Map<string, ResumoEstrelasTalhao>();
  const unicos = [...new Set(talhaoIds)];
  for (let k = 0; k < unicos.length; k += 150) {
    const { data, error } = await sb.from(T_ESTRELA).select('talhao_id, marcada, situacao').in('talhao_id', unicos.slice(k, k + 150));
    if (error && ehErroDeMigracao(error)) return null;
    if (error) throw new Error(`Falha ao ler as estrelas: ${error.message}`);
    for (const r of (data ?? []) as { talhao_id: string; marcada: boolean; situacao: string | null }[]) {
      if (!r.marcada) continue;
      const x = m.get(r.talhao_id) ?? { marcadas: 0, publicadas: 0, pendentes: 0 };
      x.marcadas++;
      if (r.situacao === 'publicada') x.publicadas++;
      else x.pendentes++;
      m.set(r.talhao_id, x);
    }
  }
  return m;
}
