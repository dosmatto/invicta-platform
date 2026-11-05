'use client';

// Indicador do topo: ícone grande num tile colorido, rótulo, número grande
// (algarismos tabulares), unidade, linha de apoio e variação ▲▼ colorida.
// Sem valor, o número vira "—" e a linha de apoio diz por quê (nada inventado).

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { COR, fmtNum, suave } from './formato';

export type TomKpi = 'verde' | 'azul' | 'ambar' | 'roxo' | 'ciano';
const TOM: Record<TomKpi, string> = {
  verde: 'var(--invicta-green)',
  azul: 'var(--invicta-blue-mid)',
  ambar: 'var(--status-warning)',
  roxo: 'var(--status-processing)',
  ciano: '#0891b2',
};

export interface DeltaKpi {
  /** Variação em % (ou na unidade de `sufixo`). */
  valor: number;
  sufixo?: string;
  rotulo?: string;
  /** Subir é bom (verde ▲)? Padrão: sim. */
  bomQuandoSobe?: boolean;
}

export function Kpi({ icone: Icone, rotulo, valor, unidade, sub, delta, tom = 'verde', vazio, carregando, onClick, titulo }: {
  icone: LucideIcon;
  rotulo: string;
  valor: ReactNode | null;
  unidade?: string;
  sub?: ReactNode;
  delta?: DeltaKpi | null;
  tom?: TomKpi;
  /** Texto quando não há valor (ex.: "sem mapa de colheita no ano"). */
  vazio?: string;
  carregando?: boolean;
  onClick?: () => void;
  titulo?: string;
}) {
  const cor = TOM[tom];
  const semValor = valor == null || valor === '';
  const subida = delta && delta.valor > 0, descida = delta && delta.valor < 0;
  const bom = delta ? ((delta.bomQuandoSobe ?? true) ? subida : descida) : false;
  const corDelta = !delta || delta.valor === 0 ? COR.texto2 : bom ? 'var(--p-verde-texto)' : COR.vermelho;
  const Tag = onClick ? 'button' : 'div';
  // Número longo ("36.337.778") encolhe a fonte; a unidade quebra para a linha
  // de baixo quando não cabe ao lado (flex-wrap) — o cartão nunca estoura.
  const nChars = typeof valor === 'string' || typeof valor === 'number' ? String(valor).length : 0;
  const fonteValor = nChars >= 12 ? 'text-lg sm:text-xl' : nChars >= 9 ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-[28px]';
  // Textos que podem ser cortados (truncate) mostram o texto inteiro no tooltip.
  const subTxt = semValor && !carregando ? (vazio ?? (typeof sub === 'string' ? sub : undefined))
    : [delta ? `${delta.valor > 0 ? '▲ +' : delta.valor < 0 ? '▼ ' : '= '}${fmtNum(delta.valor, 1)}${delta.sufixo ?? '%'}` : '', delta?.rotulo ?? '', typeof sub === 'string' ? sub : '']
      .filter(Boolean).join(' · ') || undefined;
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} title={titulo}
      className={`rounded-2xl p-3.5 sm:p-4 flex items-center gap-3 sm:gap-4 min-w-0 text-left ${onClick ? 'transition-transform hover:-translate-y-0.5' : ''}`}
      style={{ background: COR.superficie, border: `1px solid ${COR.borda}`, boxShadow: COR.sombra }}>
      <span className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: suave(cor, 15), color: cor }}>
        <Icone size={26} strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs sm:text-[13px] font-semibold leading-tight truncate" style={{ color: COR.texto2 }} title={titulo ? undefined : rotulo}>{rotulo}</p>
        {carregando ? (
          <span className="portal-esqueleto block h-7 w-24 rounded-md mt-1.5" />
        ) : (
          <p className={`mt-0.5 leading-none tracking-tight tabular-nums flex flex-wrap items-baseline gap-x-1 gap-y-0.5 min-w-0 ${semValor ? 'text-2xl font-semibold' : `${fonteValor} font-extrabold`}`}
            style={{ color: semValor ? COR.mudo : COR.texto }}>
            <span className="whitespace-nowrap">{semValor ? '—' : valor}</span>
            {!semValor && unidade && <span className="text-sm sm:text-base font-bold whitespace-nowrap max-w-full truncate" style={{ color: COR.texto2 }} title={unidade}>{unidade}</span>}
          </p>
        )}
        <p className="text-[11px] sm:text-xs mt-1.5 leading-tight truncate" style={{ color: COR.texto2 }} title={titulo ? undefined : subTxt}>
          {semValor && !carregando ? (vazio ?? sub) : (
            <>
              {delta && (
                <span className="font-bold mr-1" style={{ color: corDelta }}>
                  {delta.valor > 0 ? '▲ +' : delta.valor < 0 ? '▼ ' : '= '}{fmtNum(delta.valor, 1)}{delta.sufixo ?? '%'}
                </span>
              )}
              {delta?.rotulo ? <span>{delta.rotulo}{sub ? ' · ' : ''}</span> : null}
              {sub}
            </>
          )}
        </p>
      </div>
    </Tag>
  );
}
