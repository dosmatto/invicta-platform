'use client';

// Estado vazio honesto: o que falta e por quê ("Sem mapa de colheita nesta
// safra"). Nunca um número fictício no lugar.

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Sprout } from 'lucide-react';
import { COR, suave } from './formato';

export function Vazio({ icone: Icone = Sprout, titulo, texto, acao, compacto, className }: {
  icone?: LucideIcon;
  titulo: string;
  texto?: ReactNode;
  acao?: ReactNode;
  compacto?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center rounded-xl ${compacto ? 'py-5 px-3 gap-1.5' : 'py-10 px-6 gap-2'} ${className ?? ''}`}
      style={{ background: 'color-mix(in srgb, var(--bg-surface-hover) 60%, transparent)', border: `1px dashed ${COR.borda}` }}>
      <span className={`${compacto ? 'w-8 h-8' : 'w-11 h-11'} rounded-full flex items-center justify-center`} style={{ background: suave('var(--invicta-green)', 12), color: COR.verdeTexto }}>
        <Icone size={compacto ? 16 : 20} />
      </span>
      <p className={`${compacto ? 'text-xs' : 'text-sm'} font-bold`} style={{ color: COR.texto }}>{titulo}</p>
      {texto && <p className={`${compacto ? 'text-[11px]' : 'text-xs'} max-w-sm leading-snug`} style={{ color: COR.texto2 }}>{texto}</p>}
      {acao}
    </div>
  );
}
