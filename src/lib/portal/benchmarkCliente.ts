'use client';

// Chamada da página Comparativo (e do cartão da Visão geral) à rota
// POST /api/portal/benchmark. Vai o access_token da sessão Supabase em
// Authorization: Bearer; o servidor decide quem é o "você" (produtor: o próprio
// vínculo; owner/admin: o `clienteId` do preview).
//
// Bancada sem Supabase → { ok:false, motivo:'indisponivel' } SEM fetch: o
// benchmark nunca é calculado no navegador (o app_kv do navegador tem dados de
// todos os produtores — o recorte lá é só de tela).

import { getSupabase, supabaseConfigurado } from '../supabase';
import type { RespostaBenchmark } from './benchmarkCalc';

export type {
  RespostaBenchmark, ItemProdutividade, FertilidadeBenchmark, ValoresFert, Quantis,
} from './benchmarkCalc';

/** indisponivel = sem Supabase/sem service role no ambiente (ou rota 404); sem-sessao = 401;
 *  proibido = 403 (papel que não usa o portal, acesso inativo ou sem vínculo);
 *  invalido = 400; limite = 429 (pedidos demais do mesmo usuário em 1 min);
 *  erro = falha do servidor ou sem conexão. */
export type MotivoFalhaBenchmark = 'indisponivel' | 'sem-sessao' | 'proibido' | 'invalido' | 'limite' | 'erro';
export interface FalhaBenchmark { ok: false; motivo: MotivoFalhaBenchmark; erro?: string }

const MOTIVOS = new Set<MotivoFalhaBenchmark>(['indisponivel', 'sem-sessao', 'proibido', 'invalido', 'limite', 'erro']);

export async function buscarBenchmark(safra: string, clienteId?: string | null): Promise<RespostaBenchmark | FalhaBenchmark> {
  if (!supabaseConfigurado) return { ok: false, motivo: 'indisponivel' };
  const sb = getSupabase();
  if (!sb) return { ok: false, motivo: 'indisponivel' };
  const token = (await sb.auth.getSession()).data.session?.access_token;
  if (!token) return { ok: false, motivo: 'sem-sessao', erro: 'Sessão ausente — entre na plataforma de novo.' };
  try {
    const r = await fetch('/api/portal/benchmark', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(clienteId ? { safra, clienteId } : { safra }),
    });
    const corpo = await r.json().catch(() => null) as (Partial<RespostaBenchmark> & { ok?: boolean; motivo?: string; erro?: string }) | null;
    if (corpo?.ok === true && r.ok) return corpo as RespostaBenchmark;
    const motivo = MOTIVOS.has(corpo?.motivo as MotivoFalhaBenchmark) ? corpo!.motivo as MotivoFalhaBenchmark
      : r.status === 401 ? 'sem-sessao' : r.status === 403 ? 'proibido' : r.status === 429 ? 'limite'
        // 404 = a rota não existe neste servidor (deploy anterior ao recurso).
        : r.status === 404 ? 'indisponivel' : 'erro';
    return { ok: false, motivo, erro: corpo?.erro ?? `Erro ${r.status} no servidor.` };
  } catch {
    return { ok: false, motivo: 'erro', erro: 'Sem conexão com o servidor.' };
  }
}
