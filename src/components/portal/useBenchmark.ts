'use client';

// Comparativo Invicta (benchmark anônimo) — o ÚNICO hook do portal para
// POST /api/portal/benchmark: o cartão da Visão geral e a página Comparativo
// usam este mesmo hook (e o mesmo cache), então mostram sempre o MESMO estado.
//
// A chamada em si (token da sessão, motivos de falha do servidor) é
// lib/portal/benchmarkCliente (`buscarBenchmark`). O benchmark NUNCA é
// calculado no navegador: sem Supabase/servidor, só "indisponível".
//
// Estados da consulta (distintos, cada um com o seu texto):
//   carregando · indisponivel (bancada local / servidor sem o recurso) ·
//   sem-sessao (401) · proibido (403) · erro (falha agora; "tentar de novo") · ok.
// "Insuficiente" (< 5 produtores) é da CULTURA, dentro do ok: `benchDaCultura`.
//
// Cache: uma resposta por (USUÁRIO, safra, cliente) na sessão da página. Ficam
// em cache ok, indisponível e proibido; erro e sem-sessão não (a próxima
// abertura — ou "tentar de novo" — refaz o pedido). A resposta tem o "você" (a
// média, o Top N%, a cidade, P/K/V%) de QUEM pediu: o logout não recarrega a
// aba, então o cache é por usuário (o id entra na chave) e é limpo no logout
// (evento EVENTO_LOGOUT de lib/auth) e sempre que o usuário muda.

import { useCallback, useEffect, useState } from 'react';
import { buscarBenchmark, type RespostaBenchmark, type ItemProdutividade } from '@/lib/portal/benchmarkCliente';
import { usuarioAtual, EVENTO_LOGOUT } from '@/lib/auth';
import { itemDaCulturaBench } from '@/lib/portal/benchmarkCalc';

export type { RespostaBenchmark, ItemProdutividade, FertilidadeBenchmark } from '@/lib/portal/benchmarkCliente';

export type FalhaBenchmarkPortal = 'indisponivel' | 'sem-sessao' | 'proibido' | 'erro';

export type EstadoBenchmark =
  | { estado: 'carregando' }
  | { estado: FalhaBenchmarkPortal; motivo: string }
  | { estado: 'ok'; dados: RespostaBenchmark };

export const TEXTO_FALHA_BENCHMARK: Record<FalhaBenchmarkPortal, { titulo: string; motivo: string }> = {
  indisponivel: {
    titulo: 'Comparativo indisponível aqui',
    motivo: 'O comparativo é calculado no servidor da Invicta, com a sua sessão — ele não roda nesta bancada local nem em ambientes sem a nuvem ligada.',
  },
  'sem-sessao': {
    titulo: 'Entre de novo para ver o comparativo',
    motivo: 'Sua sessão expirou ou não foi encontrada. Entre na plataforma de novo para ver o comparativo.',
  },
  proibido: {
    titulo: 'Comparativo fora do seu acesso',
    motivo: 'O seu acesso não inclui o comparativo entre produtores.',
  },
  erro: {
    titulo: 'Não foi possível consultar o comparativo',
    motivo: 'Não foi possível consultar o comparativo agora.',
  },
};

const cache = new Map<string, Promise<EstadoBenchmark>>();
/** De quem é o que está no cache (uid; '' = sem usuário). Mudou → limpa. */
let donoDoCache: string | null = null;

/** Esquece todas as respostas (logout, troca de usuário). */
export function limparCacheBenchmark(): void {
  cache.clear();
  donoDoCache = null;
}

if (typeof window !== 'undefined') window.addEventListener(EVENTO_LOGOUT, limparCacheBenchmark);

async function consultar(safra: string, clienteId?: string): Promise<EstadoBenchmark> {
  const r = await buscarBenchmark(safra, clienteId);
  if (r.ok) return { estado: 'ok', dados: r };
  // 'invalido' (400) é erro do pedido — para o produtor, "não foi possível".
  const estado: FalhaBenchmarkPortal = r.motivo === 'invalido' ? 'erro' : r.motivo;
  const motivo = estado === 'erro' ? (r.erro ?? TEXTO_FALHA_BENCHMARK.erro.motivo) : TEXTO_FALHA_BENCHMARK[estado].motivo;
  return { estado, motivo };
}

/** `clienteId` só no preview (owner/admin); para o produtor o servidor usa o
 *  próprio vínculo. Safra vazia = não consulta (ex.: seção fora do plano). */
export function useBenchmark(safra: string, clienteId?: string): { estado: EstadoBenchmark; recarregar: () => void } {
  const uid = usuarioAtual()?.uid ?? '';
  const chave = `${uid}|${safra}|${clienteId ?? ''}`;
  const [tentativa, setTentativa] = useState(0);
  const [res, setRes] = useState<{ chave: string; tentativa: number; v: EstadoBenchmark } | null>(null);
  useEffect(() => {
    if (!safra) return;
    let vivo = true;
    if (donoDoCache !== uid) { cache.clear(); donoDoCache = uid; }
    let p = cache.get(chave);
    if (!p) {
      p = consultar(safra, clienteId);
      cache.set(chave, p);
      void p.then(v => { if (v.estado === 'erro' || v.estado === 'sem-sessao') cache.delete(chave); });
    }
    void p.then(v => { if (vivo) setRes({ chave, tentativa, v }); });
    return () => { vivo = false; };
  }, [chave, uid, safra, clienteId, tentativa]);
  const recarregar = useCallback(() => { cache.delete(chave); setTentativa(t => t + 1); }, [chave]);
  const estado: EstadoBenchmark = !safra
    ? { estado: 'indisponivel', motivo: 'Sem safra escolhida.' }
    : res && res.chave === chave && res.tentativa === tentativa ? res.v : { estado: 'carregando' };
  return { estado, recarregar };
}

/** A cultura dentro de uma resposta ok: 'insuficiente' (< mínimo de
 *  produtores, ou a cultura nem aparece) ou o item com os agregados. */
export function benchDaCultura(dados: RespostaBenchmark, cultura: string):
  | { estado: 'insuficiente'; minimo: number; nProdutores: number }
  | { estado: 'ok'; item: ItemProdutividade & { mediaScHa: number } } {
  // A MESMA normalização do servidor ("Milho safrinha" → "Milho"): lib/portal/benchmarkCalc.
  const b = itemDaCulturaBench(dados.produtividade, cultura);
  if (!b || b.insuficiente || b.mediaScHa == null) return { estado: 'insuficiente', minimo: dados.minimoProdutores, nProdutores: b?.nProdutores ?? 0 };
  return { estado: 'ok', item: b as ItemProdutividade & { mediaScHa: number } };
}
