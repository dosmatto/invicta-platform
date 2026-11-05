'use client';

// Cartão do portal: título (com ícone opcional), subtítulo, ação "Ver mapa →"
// no canto, conteúdo e rodapé. Sombra leve e cantos bem arredondados.

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { COR, suave } from './formato';

export interface AcaoCartao { rotulo: string; href?: string; onClick?: () => void; titulo?: string }

export function BotaoAcao({ acao, cheio }: { acao: AcaoCartao; cheio?: boolean }) {
  const cls = 'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold whitespace-nowrap transition-opacity hover:opacity-85';
  const estilo = cheio
    ? { background: COR.verdeEscuro, color: '#fff' }
    : { background: suave('var(--invicta-green)', 10), color: COR.verdeTexto, border: '1px solid color-mix(in srgb, var(--invicta-green) 45%, transparent)' };
  const miolo = <>{acao.rotulo}<ArrowRight size={13} /></>;
  if (acao.href) return <Link href={acao.href} className={cls} style={estilo} title={acao.titulo}>{miolo}</Link>;
  return <button type="button" onClick={acao.onClick} className={cls} style={estilo} title={acao.titulo}>{miolo}</button>;
}

export function Cartao({ titulo, sub, icone: Icone, acao, extra, rodape, children, className, corpoClassName, id }: {
  titulo?: ReactNode;
  sub?: ReactNode;
  icone?: LucideIcon;
  acao?: AcaoCartao | null;
  /** Conteúdo livre no canto do cabeçalho (seletor, selo…), antes da ação. */
  extra?: ReactNode;
  rodape?: ReactNode;
  children?: ReactNode;
  className?: string;
  corpoClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`rounded-2xl p-4 sm:p-5 flex flex-col min-w-0 ${className ?? ''}`}
      style={{ background: COR.superficie, border: `1px solid ${COR.borda}`, boxShadow: COR.sombra }}>
      {(titulo || acao || extra) && (
        <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 mb-3">
          <div className="min-w-0 flex-1 basis-[210px] flex items-start gap-2">
            {Icone && (
              <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-px" style={{ background: suave('var(--invicta-green)'), color: COR.verdeTexto }}>
                <Icone size={15} />
              </span>
            )}
            <div className="min-w-0">
              {titulo && <h2 className="text-[15px] sm:text-base font-extrabold leading-tight tracking-tight" style={{ color: COR.texto }}>{titulo}</h2>}
              {sub && <p className="text-xs mt-0.5 leading-snug" style={{ color: COR.texto2 }}>{sub}</p>}
            </div>
          </div>
          {(extra || acao) && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {extra}
              {acao && <BotaoAcao acao={acao} />}
            </div>
          )}
        </header>
      )}
      <div className={`flex-1 min-h-0 ${corpoClassName ?? ''}`}>{children}</div>
      {rodape && <div className="mt-3 pt-3 text-[11px]" style={{ borderTop: `1px solid ${COR.borda}`, color: COR.texto2 }}>{rodape}</div>}
    </section>
  );
}
