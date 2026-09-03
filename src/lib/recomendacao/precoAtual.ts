'use client';

// PREÇO ATUAL de uma dose já salva — para o relatório refazer a conta em vez de
// repetir o número congelado.
//
// O custo de uma dose é gravado quando o cenário é criado (`d.custo` = t ×
// R$/t da época). Isso é certo para reproduzir um PDF antigo, e errado para o
// pedido do usuário: mudar o preço no produtor e gerar o relatório de novo tem
// de sair com a conta refeita, SEM reprocessar mapa nenhum.
//
// Aqui a cadeia inteira é resolvida na hora: dose → equação → insumo →
// preço posto na fazenda (produto + frete), passando pela camada do produtor
// (lib/custosProdutor). Sem conseguir resolver — equação sem insumo vinculado,
// insumo excluído, produtor sem cadastro —, o chamador fica com o valor salvo:
// nenhum relatório pode ficar SEM custo por causa disto.

import { listar, type ConteudoEquacao } from '../biblioteca';
import { type ConteudoInsumo } from '../insumos';
import { getTalhoes, getFazendas, precoResolvidoDoInsumo } from '../store';
import type { Epoca } from '../periodo';
export { custoAtualDaDose } from '../custosProdutor';

export interface PrecoAtualResolvido {
  /** R$/t (produto + frete). null = não deu para resolver. */
  precoTotalT: number | null;
  /** De onde veio: 'fazenda'/'produtor' = personalizado; 'biblioteca' = geral. */
  nivel?: string;
  insumoId?: string;
}

/**
 * Devolve um resolvedor pronto: lê a Biblioteca e o cadastro UMA vez e responde
 * por (equacaoId, talhaoId). Chamar direto por dose leria a Biblioteca dezenas
 * de vezes num resumo de fazenda inteira.
 */
export function construirPrecoAtual(ano: number | null, epoca?: Epoca | null) {
  const eqParaInsumo = new Map<string, string>();
  for (const e of listar<ConteudoEquacao>('equacoes')) {
    const insumoId = e.conteudo?.insumoId;
    if (insumoId) eqParaInsumo.set(e.id, insumoId);
  }
  const insumoPorId = new Map<string, ConteudoInsumo | undefined>();
  for (const i of listar<ConteudoInsumo>('insumos')) insumoPorId.set(i.id, i.conteudo);

  // talhão → fazenda → cliente, para achar de quem é o preço.
  const fazendaDoTalhao = new Map<string, string>();
  for (const t of getTalhoes()) fazendaDoTalhao.set(t.id, t.fazendaId);
  const clienteDaFazenda = new Map<string, string>();
  for (const f of getFazendas()) clienteDaFazenda.set(f.id, f.clienteId);

  return function precoAtual(equacaoId: string, talhaoId: string): PrecoAtualResolvido {
    if (ano == null) return { precoTotalT: null };
    // Dose de aplicação parcelada vem como "<id>__apN" — o preço é o da equação base.
    const base = (equacaoId || '').split('__ap')[0];
    const insumoId = eqParaInsumo.get(base);
    if (!insumoId) return { precoTotalT: null };
    const fazendaId = fazendaDoTalhao.get(talhaoId) ?? null;
    const clienteId = fazendaId ? clienteDaFazenda.get(fazendaId) ?? null : null;
    if (!clienteId) return { precoTotalT: null, insumoId };
    const r = precoResolvidoDoInsumo(insumoId, insumoPorId.get(insumoId), {
      clienteId, fazendaId, ano, epoca: epoca ?? null,
    });
    return { precoTotalT: r.precoTotalT, nivel: r.fonte.preco, insumoId };
  };
}

/**
 * Cenários com os custos REFEITOS pelo preço de hoje.
 *
 * Aplicado logo depois de carregar, para todo o resto do relatório (tabelas,
 * totais, resumo) enxergar um número só — sem precisar lembrar de recalcular em
 * cada ponto de exibição, que é como um deles ficaria para trás.
 *
 * Só mexe em `custo` e `custoTonelada`; dose, tonelagem e mapa continuam os
 * gravados — o preço mudou, a recomendação agronômica não.
 */
interface DoseComCusto {
  equacaoId?: string; toneladas?: number | null;
  custo?: number | null; custoTonelada?: number | null;
}
export function cenariosComPrecoAtual<D extends DoseComCusto, T extends { doses: D[] }>(
  cenarios: T[], talhaoId: string, ano: number | null, epoca?: Epoca | null,
): T[] {
  if (ano == null || !cenarios.length) return cenarios;
  const precoAtual = construirPrecoAtual(ano, epoca);
  return cenarios.map(c => ({
    ...c,
    doses: c.doses.map(d => {
      const preco = precoAtual(d.equacaoId ?? '', talhaoId).precoTotalT;
      if (preco == null) return d;
      const t = typeof d.toneladas === 'number' && Number.isFinite(d.toneladas) ? d.toneladas : null;
      return { ...d, custoTonelada: preco, ...(t != null ? { custo: t * preco } : {}) };
    }),
  }));
}

