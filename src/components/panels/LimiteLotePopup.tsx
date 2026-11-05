'use client';

// Pop-up "Limite da PrecisionFarm" da TELA DE LOTE (Biblioteca → PrecisionFarm),
// aberto pela célula "Dif. limite" (Q9 do ledger pf-contrato-03).
//
// Não duplica nada: o corpo é o MESMO bloco da seção do talhão
// (LimitePrecisionFarm → MapaComparacaoLimite + números + Adotar com
// verificarTrocaPoligono e confirmação). A comparação que o lote já buscou é
// reaproveitada; sem ela, compara na hora. Setas (botões ou ← →) andam pelos
// talhões da lista filtrada que podem comparar (vínculo confirmado + talhão
// neste aparelho); Esc fecha. Depois de adotar, a linha do lote se atualiza
// (onAdotado).

import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { Talhao } from '@/lib/store';
import type { LimitePFTela } from '@/lib/precisionfarm/cliente';
import LimitePrecisionFarm from '@/components/talhao/LimitePrecisionFarm';

export interface ItemPopupLimite { talhaoId: string; nome: string; fazenda: string; cliente: string; local: Talhao }

export default function LimiteLotePopup({ itens, indice, limites, onNavegar, onFechar, onLimiteLido, onAdotado }: {
  itens: ItemPopupLimite[];
  indice: number;
  limites: Record<string, LimitePFTela>;
  onNavegar: (indice: number) => void;
  onFechar: () => void;
  onLimiteLido: (talhaoId: string, l: LimitePFTela) => void;
  onAdotado: (talhaoId: string, t: Talhao) => void;
}) {
  const item = itens[indice] ?? null;
  const anterior = indice > 0 ? indice - 1 : null;
  const seguinte = indice < itens.length - 1 ? indice + 1 : null;

  // Esc fecha; ← → navegam (fora de campos de texto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable)) return;
      if (e.key === 'Escape') { e.preventDefault(); onFechar(); }
      else if (e.key === 'ArrowLeft' && anterior != null) { e.preventDefault(); onNavegar(anterior); }
      else if (e.key === 'ArrowRight' && seguinte != null) { e.preventDefault(); onNavegar(seguinte); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [anterior, seguinte, onFechar, onNavegar]);

  if (!item) return null;
  const seta = (ativo: boolean) => ({ background: '#1e3a5f', color: ativo ? '#e2e8f0' : '#475569' });

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4" style={{ background: 'rgba(2, 6, 23, 0.7)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }}
      role="dialog" aria-modal="true" aria-label={`Limite da PrecisionFarm — ${item.nome}`}>
      <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-lg overflow-hidden" style={{ background: '#0a1929', border: '1px solid #1a3a6b' }}>
        <div className="px-3 py-2 flex items-center gap-2 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
          <button onClick={() => anterior != null && onNavegar(anterior)} disabled={anterior == null} title="Talhão anterior (←)"
            className="p-1 rounded" style={seta(anterior != null)}><ChevronLeft size={14} /></button>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold truncate" style={{ color: '#e2e8f0' }}>{item.nome}</div>
            <div className="text-[10px] truncate" style={{ color: '#64748b' }}>{item.fazenda} · {item.cliente} · {indice + 1}/{itens.length}</div>
          </div>
          <button onClick={() => seguinte != null && onNavegar(seguinte)} disabled={seguinte == null} title="Talhão seguinte (→)"
            className="p-1 rounded" style={seta(seguinte != null)}><ChevronRight size={14} /></button>
          <button onClick={onFechar} title="Fechar (Esc)" aria-label="Fechar" className="p-1 rounded" style={{ background: '#3a1a1a', color: '#fca5a5' }}><X size={14} /></button>
        </div>
        <div className="px-3 py-2 overflow-auto text-xs" style={{ color: '#cbd5e1' }}>
          {/* key = talhão: trocar de talhão remonta o bloco com o estado zerado. */}
          <LimitePrecisionFarm key={item.talhaoId} talhao={item.local}
            limiteInicial={limites[item.talhaoId] ?? null} autoComparar publicarNoMapa={false}
            onLimiteLido={l => onLimiteLido(item.talhaoId, l)}
            onLimiteAdotado={t => onAdotado(item.talhaoId, t)} />
        </div>
      </div>
    </div>
  );
}
