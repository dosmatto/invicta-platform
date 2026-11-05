'use client';

// Faixa "Apresentando como <produtor> · Sair" — fica no topo do /painel, do
// /talhao e do /portal enquanto o MODO APRESENTAÇÃO vale (owner/admin vendo a
// plataforma como o produtor; ver lib/modoApresentacao.ts).
//
// Sair desliga o modo e recarrega o /painel do admin, que reabre a ficha do
// cliente apresentado (o "mesmo ponto" de onde o modo foi ligado). Recarregar
// é de propósito: listas e painéis montados com o escopo do produtor não
// sobrevivem para o admin.

import { useSyncExternalStore } from 'react';
import { Eye, Users, X } from 'lucide-react';
import { apresentacaoAtual, desligarApresentacao, planoPorId } from '@/lib/empresa';
import { assinarApresentacao, estadoBruto } from '@/lib/modoApresentacao';
import { desligarModoProdutorMapa } from '@/lib/modoProdutorMapa';

/** Sai do modo apresentação e volta ao /painel do admin. */
export function sairDaApresentacao(): void {
  const est = apresentacaoAtual();
  desligarApresentacao(est?.clienteId ?? null);
  desligarModoProdutorMapa();
  window.location.assign('/painel');
}

/** Portal: sai do modo e volta à escolha de produtor do "Ver como o produtor vê". */
export function trocarProdutorApresentado(): void {
  desligarApresentacao();
  desligarModoProdutorMapa();
  window.location.assign('/portal');
}

/** Estado do modo, reativo (null fora dele e no servidor). */
export function useApresentacao() {
  const bruto = useSyncExternalStore(assinarApresentacao, estadoBruto, () => '');
  return bruto ? apresentacaoAtual() : null;
}

export function FaixaApresentacao({ variante = 'painel' }: { variante?: 'painel' | 'portal' }) {
  const est = useApresentacao();
  if (!est) return null;
  const plano = est.planoId ? planoPorId(est.planoId) : null;
  const portal = variante === 'portal';
  return (
    <div role="status" data-faixa-apresentacao
      className="flex items-center gap-2 px-3 sm:px-4 py-1.5 text-xs flex-shrink-0 z-[60] relative"
      style={portal
        ? { background: 'var(--status-info-bg)', color: 'var(--status-info)', borderBottom: '1px solid color-mix(in srgb, var(--status-info) 25%, transparent)' }
        : { background: '#0b3a1f', color: '#bbf7d0', borderBottom: '1px solid #166534' }}>
      <Eye size={14} className="flex-shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        Apresentando como <strong>{est.nome || 'produtor'}</strong>
        <span className="opacity-75"> · somente leitura{plano ? ` · plano ${plano.nome}` : ''}</span>
      </span>
      {portal && (
        <button type="button" onClick={trocarProdutorApresentado} title="Sair do modo e escolher outro produtor"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold flex-shrink-0 underline-offset-2 hover:underline">
          <Users size={12} /> Trocar produtor
        </button>
      )}
      <button type="button" onClick={sairDaApresentacao} title="Sair do modo apresentação e voltar ao painel"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold flex-shrink-0"
        style={portal ? { border: '1px solid currentColor' } : { background: '#166534', color: '#fff' }}>
        <X size={12} /> Sair
      </button>
    </div>
  );
}
