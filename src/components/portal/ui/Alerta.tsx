'use client';

// Linha de alerta da "Minha propriedade em números": ícone semântico + texto
// com o número em negrito.

import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, AlertOctagon } from 'lucide-react';
import { COR, suave } from './formato';

export type TipoAlerta = 'critico' | 'atencao' | 'info' | 'ok';
const ESTILO: Record<TipoAlerta, { cor: string; Icone: typeof Info }> = {
  critico: { cor: 'var(--status-error)', Icone: AlertOctagon },
  atencao: { cor: 'var(--status-warning)', Icone: AlertTriangle },
  info: { cor: 'var(--status-info)', Icone: Info },
  ok: { cor: 'var(--p-verde-texto)', Icone: CheckCircle2 },
};

export function Alerta({ tipo, destaque, children }: { tipo: TipoAlerta; destaque?: ReactNode; children?: ReactNode }) {
  const { cor, Icone } = ESTILO[tipo];
  return (
    <li className="flex items-start gap-2.5 rounded-xl px-3 py-2 text-[13px] leading-snug"
      style={{ background: suave(cor, 7), border: `1px solid color-mix(in srgb, ${cor} 22%, transparent)` }}>
      <Icone size={17} className="flex-shrink-0 mt-px" style={{ color: cor }} />
      <span style={{ color: COR.texto }}>
        {destaque != null && <strong className="font-extrabold tabular-nums">{destaque} </strong>}
        {children}
      </span>
    </li>
  );
}
