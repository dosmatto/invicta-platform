'use client';

// Peças compartilhadas pelas páginas do SOLO do portal (Fertilidade, Nutrientes,
// Zonas, Prescrições, Compactação). Ficam aqui, com prefixo próprio, para não
// mexer no kit (../ui/*) enquanto outras frentes também editam o portal.

import { useMemo, type KeyboardEvent, type ReactNode } from 'react';
import { getLegendas, getLegendasPorAtributo } from '@/lib/store';
import type { ClasseLegenda, Legenda } from '@/lib/legendas';
import { legendaPadraoDe } from '@/lib/processarFertilidade';
import { ATRIBUTOS_SOLO } from '@/lib/portalPainelSolo';
import { usePortal } from '../PortalContext';
import { COR, fmtNum } from '../ui';
import type { AcaoCartao } from '../ui';

/** Legendas da Biblioteca que as páginas do solo usam (uma vez por montagem). */
export function useLegendasSolo() {
  return useMemo(() => {
    const todas = getLegendas();
    const porAt: Record<string, Legenda | undefined> = {};
    for (const a of ATRIBUTOS_SOLO) porAt[a.id] = legendaPadraoDe(todas, a.id);
    return { porAt, compactacao: getLegendasPorAtributo('compactacao')[0] ?? null };
  }, []);
}

// Unidades de reserva quando a legenda não traz. K, Ca e Mg das legendas ABC são
// mmolc/dm³ (o componente antigo de Nutrientes dizia cmolc/dm³ — estava errado).
const UNIDADE_RESERVA: Record<string, string> = { p: 'mg/dm³', k: 'mmolc/dm³', v: '%', ph: '', mo: 'g/dm³', ca: 'mmolc/dm³', mg: 'mmolc/dm³' };
export const unidadeDoAtributo = (leg: Legenda | undefined, id: string): string => leg?.unidade || UNIDADE_RESERVA[id] || '';

/** "≤ 6", "6 – 12", "> 30" — fronteira semiaberta (mín, máx], como classeDoValor. */
export function faixaTxt(c: Pick<ClasseLegenda, 'valorMin' | 'valorMax'>, casas = 1): string {
  if (c.valorMin == null && c.valorMax != null) return `≤ ${fmtNum(c.valorMax, casas)}`;
  if (c.valorMax == null && c.valorMin != null) return `> ${fmtNum(c.valorMin, casas)}`;
  if (c.valorMin != null && c.valorMax != null) return `${fmtNum(c.valorMin, casas)} – ${fmtNum(c.valorMax, casas)}`;
  return '';
}

/** Ação "Abrir na página do talhão →" do cartão principal (só com UM talhão no filtro). */
export function acaoAbrirTalhao(p: ReturnType<typeof usePortal>, aba: string): AcaoCartao | null {
  const t = p.talhao;
  return t ? { rotulo: 'Abrir na página do talhão', onClick: () => p.abrirTalhao(t.id, aba), titulo: `Abrir ${t.nome} na plataforma, aba certa` } : null;
}

/** Seletor em abas (atributo, produto, camada): rola de lado no celular. */
export function Abas<T extends string>({ valor, opcoes, onChange, rotulo }: {
  valor: T;
  opcoes: Array<{ valor: T; rotulo: string; sub?: string; desabilitada?: boolean }>;
  onChange: (v: T) => void;
  rotulo: string;
}) {
  return (
    <div className="max-w-full overflow-x-auto -mx-1 px-1 pb-1">
      <div role="tablist" aria-label={rotulo} className="inline-flex gap-1 rounded-xl p-1" style={{ background: COR.superficie2, border: `1px solid ${COR.borda}` }}>
        {opcoes.map(o => (
          <button key={o.valor} type="button" role="tab" aria-selected={valor === o.valor} disabled={o.desabilitada} onClick={() => onChange(o.valor)}
            className="h-9 px-3.5 rounded-lg text-[13px] font-bold whitespace-nowrap flex items-center gap-1.5 disabled:opacity-40"
            style={valor === o.valor ? { background: COR.superficie, color: COR.texto, boxShadow: COR.sombra } : { color: COR.texto2 }}>
            {o.rotulo}{o.sub && <span className="text-[10.5px] font-medium" style={{ color: COR.mudo }}>{o.sub}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Bolinha + nome da classe da legenda. */
export function PilulaClasse({ nome, cor, vazio = '—' }: { nome: string | null; cor: string | null; vazio?: string }) {
  if (!nome) return <span style={{ color: COR.mudo }}>{vazio}</span>;
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold whitespace-nowrap">
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cor ?? COR.semDado, boxShadow: '0 0 0 1px color-mix(in srgb, var(--text-primary) 12%, transparent)' }} />
      {nome}
    </span>
  );
}

export interface ColunaTab<T> {
  id: string;
  titulo: ReactNode;
  alinhar?: 'left' | 'right' | 'center';
  /** Esconde a coluna abaixo de `sm` (a tabela já rola de lado, mas o essencial fica à vista). */
  sohDesktop?: boolean;
  render: (linha: T) => ReactNode;
}

/** Tabela por talhão: cabeçalho discreto, linha clicável (abre/filtra o talhão). */
export function TabelaTalhoes<T extends { talhaoId: string; chaveLinha?: string }>({ linhas, colunas, onClicar, aria, minLargura = 520 }: {
  linhas: T[];
  colunas: Array<ColunaTab<T>>;
  onClicar?: (id: string) => void;
  aria: string;
  minLargura?: number;
}) {
  const alinha = (a?: 'left' | 'right' | 'center') => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');
  const tecla = (e: KeyboardEvent, id: string) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClicar?.(id); } };
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-xs" style={{ minWidth: minLargura }} aria-label={aria}>
        <thead>
          <tr style={{ color: COR.texto2 }}>
            {colunas.map(c => <th key={c.id} className={`${alinha(c.alinhar)} font-semibold pb-1.5 px-1.5 whitespace-nowrap ${c.sohDesktop ? 'hidden sm:table-cell' : ''}`}>{c.titulo}</th>)}
          </tr>
        </thead>
        <tbody>
          {linhas.map(l => (
            <tr key={l.chaveLinha ?? l.talhaoId} onClick={() => onClicar?.(l.talhaoId)} onKeyDown={e => tecla(e, l.talhaoId)} tabIndex={onClicar ? 0 : undefined} role={onClicar ? 'button' : undefined}
              className={onClicar ? 'cursor-pointer hover:bg-[var(--bg-surface-hover)]' : ''} style={{ borderTop: `1px solid ${COR.borda}` }}>
              {colunas.map(c => <td key={c.id} className={`${alinha(c.alinhar)} py-2 px-1.5 ${c.sohDesktop ? 'hidden sm:table-cell' : ''}`}>{c.render(l)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Nome do talhão em destaque (primeira coluna das tabelas). */
export function NomeTalhao({ nome, sub }: { nome: string; sub?: string }) {
  return (
    <span className="block min-w-0">
      <span className="block font-extrabold truncate" style={{ color: COR.texto }}>{nome}</span>
      {sub && <span className="block text-[10.5px] truncate" style={{ color: COR.mudo }}>{sub}</span>}
    </span>
  );
}

/** Barra empilhada de proporções (composição das zonas de um talhão). */
export function BarraEmpilhada({ partes, altura = 10 }: { partes: Array<{ cor: string; pct: number; titulo: string }>; altura?: number }) {
  const soma = partes.reduce((s, x) => s + x.pct, 0);
  if (!partes.length || soma <= 0) return <span style={{ color: COR.mudo }}>—</span>;
  return (
    <span className="flex w-full min-w-[96px] rounded-full overflow-hidden" style={{ height: altura, background: COR.superficie2 }} role="img" aria-label={partes.map(x => x.titulo).join(' · ')}>
      {partes.map((x, i) => <span key={i} title={x.titulo} style={{ width: `${(x.pct / soma) * 100}%`, background: x.cor }} />)}
    </span>
  );
}
