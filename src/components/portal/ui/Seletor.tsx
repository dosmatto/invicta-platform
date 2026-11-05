'use client';

// Seletor (select nativo estilizado): no cabeçalho (sobre o azul da marca) ou
// dentro de um cartão. Nativo de propósito — no celular abre a roda do sistema.

import type { LucideIcon } from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import { COR } from './formato';

export interface OpcaoSeletor { valor: string; rotulo: string }

export function Seletor({ valor, opcoes, onChange, rotulo, icone: Icone, variante = 'cartao', largura, desabilitado }: {
  valor: string;
  opcoes: OpcaoSeletor[];
  onChange: (v: string) => void;
  /** Legenda curta (aparece acima do valor no cabeçalho; aria-label sempre). */
  rotulo?: string;
  icone?: LucideIcon;
  variante?: 'hero' | 'cartao';
  largura?: number;
  desabilitado?: boolean;
}) {
  const hero = variante === 'hero';
  return (
    <label className={`relative inline-flex items-center gap-2 rounded-xl min-w-0 ${hero ? 'h-11 pl-3 pr-8' : 'h-9 pl-2.5 pr-7'} ${desabilitado ? 'opacity-60' : 'cursor-pointer'}`}
      style={hero
        ? { background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.22)', color: '#fff', maxWidth: largura ?? 260 }
        : { background: COR.superficie, border: `1px solid ${COR.borda}`, color: COR.texto, maxWidth: largura ?? 240 }}>
      {Icone && <Icone size={hero ? 17 : 14} className="flex-shrink-0" style={{ opacity: hero ? 0.9 : 0.7 }} />}
      <span className="flex flex-col min-w-0 leading-tight">
        {hero && rotulo && <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.65)' }}>{rotulo}</span>}
        <span className={`truncate ${hero ? 'text-[13px] font-bold' : 'text-xs font-semibold'}`} title={opcoes.find(o => o.valor === valor)?.rotulo}>{opcoes.find(o => o.valor === valor)?.rotulo ?? '—'}</span>
      </span>
      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ opacity: 0.75 }} />
      <select value={valor} onChange={e => onChange(e.target.value)} aria-label={rotulo} disabled={desabilitado}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default"
        // A lista que abre é do sistema e herda a cor do <label>: no cabeçalho
        // (texto branco) o Windows desenhava opções brancas sobre fundo branco.
        // Cor e fundo explícitos, do tema do portal, no select E em cada opção.
        style={{ color: COR.texto, background: COR.superficie }}>
        {opcoes.map(o => <option key={o.valor} value={o.valor} style={{ color: COR.texto, background: COR.superficie }}>{o.rotulo}</option>)}
      </select>
    </label>
  );
}
