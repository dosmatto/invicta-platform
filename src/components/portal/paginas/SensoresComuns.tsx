'use client';

// Peças compartilhadas pelas páginas de SENSORES do portal (NDVI, Produtividade,
// Condutividade, Altimetria): botão "Abrir na página do
// talhão", tabela ordenável por talhão, faixas mín–máx por talhão e a grade de
// KPIs. Ficam aqui (e não em ui/) para não mexer no kit compartilhado. O
// bloqueio por plano é da rota (shell/GuardaPlano).

import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ExternalLink } from 'lucide-react';
import { usePortal } from '../PortalContext';
import { COR, fmtNum, suave } from '../ui';

/** "Abrir <talhão> na página do talhão" — só aparece com UM talhão no filtro. */
export function BotaoAbrirTalhao({ aba, className }: { aba: string; className?: string }) {
  const p = usePortal();
  if (!p.talhao) return null;
  const t = p.talhao;
  return (
    <button type="button" onClick={() => p.abrirTalhao(t.id, aba)}
      className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-bold ${className ?? ''}`}
      style={{ background: COR.verdeEscuro, color: '#fff' }}>
      <ExternalLink size={13} /> Abrir {t.nome} na página do talhão
    </button>
  );
}

/** Linha de KPIs sem buraco: 4 por linha no desktop largo, 2 no tablet, 1 no celular. */
export function GradeKpis({ children, n }: { children: ReactNode[]; n?: number }) {
  const qtd = n ?? children.length;
  const cols = qtd >= 4 ? 'sm:grid-cols-2 xl:grid-cols-4' : qtd === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : qtd === 2 ? 'sm:grid-cols-2' : '';
  return <div className={`grid grid-cols-1 ${cols} gap-3`}>{children.map((k, i) => <div key={i} className="min-w-0 grid">{k}</div>)}</div>;
}

// ── Tabela ordenável por talhão ─────────────────────────────────────────────

export interface ColunaTabela<T> {
  id: string;
  rotulo: string;
  titulo?: string;
  align?: 'left' | 'right';
  /** Valor usado para ordenar (null vai sempre para o fim). */
  valor: (r: T) => number | string | null;
  render?: (r: T) => ReactNode;
  /** Esconde no celular (a tabela rola, mas o essencial cabe). */
  soDesktop?: boolean;
}

export function TabelaTalhoes<T extends { talhaoId: string; nome: string }>({ linhas, colunas, ordemInicial, desc = false, onClicar, aria, chaveDe }: {
  linhas: T[];
  /** Chave da linha quando há mais de uma por talhão (padrão: o id do talhão). */
  chaveDe?: (r: T) => string;
  colunas: Array<ColunaTabela<T>>;
  ordemInicial?: string;
  desc?: boolean;
  onClicar?: (id: string) => void;
  aria?: string;
}) {
  const [ordem, setOrdem] = useState<{ id: string; desc: boolean }>({ id: ordemInicial ?? colunas[0].id, desc });
  const ordenadas = useMemo(() => {
    const col = colunas.find(c => c.id === ordem.id) ?? colunas[0];
    return [...linhas].sort((a, b) => {
      const va = col.valor(a), vb = col.valor(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR', { numeric: true });
      return ordem.desc ? -c : c;
    });
  }, [linhas, colunas, ordem]);
  const alternar = (id: string) => setOrdem(o => (o.id === id ? { id, desc: !o.desc } : { id, desc: id !== colunas[0].id }));

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-xs" aria-label={aria}>
        <thead>
          <tr style={{ color: COR.texto2 }}>
            {colunas.map((c, i) => {
              const ativo = ordem.id === c.id;
              return (
                <th key={c.id} scope="col" aria-sort={ativo ? (ordem.desc ? 'descending' : 'ascending') : 'none'}
                  className={`font-semibold pb-2 whitespace-nowrap ${i ? 'pl-3' : ''} ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.soDesktop ? 'hidden md:table-cell' : ''}`}
                  style={i === 0 ? { position: 'sticky', left: 0, background: COR.superficie, zIndex: 1 } : undefined}>
                  <button type="button" onClick={() => alternar(c.id)} title={c.titulo ?? `Ordenar por ${c.rotulo}`}
                    className={`inline-flex items-center gap-1 ${c.align === 'right' ? 'flex-row-reverse' : ''}`} style={{ color: ativo ? COR.texto : COR.texto2 }}>
                    {c.rotulo}
                    {ativo && (ordem.desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map(r => (
            <tr key={chaveDe ? chaveDe(r) : r.talhaoId} onClick={onClicar ? () => onClicar(r.talhaoId) : undefined}
              className={onClicar ? 'cursor-pointer transition-colors hover:bg-[var(--bg-surface-hover)]' : ''} style={{ borderTop: `1px solid ${COR.borda}` }}>
              {colunas.map((c, i) => (
                <td key={c.id} className={`py-2 ${i ? 'pl-3' : 'pr-2'} tabular-nums ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.soDesktop ? 'hidden md:table-cell' : ''} ${i === 0 ? 'font-bold' : ''}`}
                  style={i === 0 ? { position: 'sticky', left: 0, background: COR.superficie, maxWidth: 140, zIndex: 1 } : undefined}>
                  {i === 0 ? <span className="block truncate" title={r.nome}>{c.render ? c.render(r) : r.nome}</span> : (c.render ? c.render(r) : (c.valor(r) ?? '—'))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Faixas mín–máx por talhão (eixo comum) ──────────────────────────────────

export interface FaixaItem { id: string; rotulo: string; min: number; max: number; marcador?: number | null; sub?: string; cor?: string }

/** Cada talhão é uma barra de `min` a `max` num eixo COMUM — dá para ver de
 *  relance quem fica mais alto/mais condutivo e quem varia mais por dentro. O
 *  ponto é a média (ou a mediana) do talhão. */
export function FaixasValores({ itens, unidade, casas = 0, onClicar, marcadorRotulo = 'média' }: {
  itens: FaixaItem[];
  unidade: string;
  casas?: number;
  onClicar?: (id: string) => void;
  marcadorRotulo?: string;
}) {
  if (!itens.length) return null;
  const lo = Math.min(...itens.map(i => i.min)), hi = Math.max(...itens.map(i => i.max));
  const span = hi - lo || 1;
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / span) * 100))}%`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => lo + span * f);
  return (
    <div className="text-xs">
      <ul className="space-y-2">
        {itens.map(it => (
          <li key={it.id}>
            <button type="button" onClick={() => onClicar?.(it.id)} disabled={!onClicar} className="w-full grid items-center gap-2 text-left group"
              style={{ gridTemplateColumns: 'minmax(56px,84px) minmax(0,1fr) minmax(72px,auto)', cursor: onClicar ? 'pointer' : 'default' }}
              title={`${it.rotulo}: ${fmtNum(it.min, casas)} a ${fmtNum(it.max, casas)} ${unidade}${it.marcador != null ? ` · ${marcadorRotulo} ${fmtNum(it.marcador, casas)}` : ''}`}>
              <span className="font-bold truncate group-hover:underline" style={{ color: COR.texto }}>{it.rotulo}</span>
              <span className="relative h-5 rounded-md block" style={{ background: COR.superficie2 }}>
                <span className="absolute top-1 bottom-1 rounded-md" style={{ left: pos(it.min), width: `max(6px, calc(${pos(it.max)} - ${pos(it.min)}))`, background: it.cor ?? suave('var(--invicta-green)', 55) }} />
                {it.marcador != null && (
                  <span className="absolute top-0 bottom-0 w-[3px] rounded-full" style={{ left: `calc(${pos(it.marcador)} - 1.5px)`, background: COR.texto }} />
                )}
              </span>
              <span className="tabular-nums text-right whitespace-nowrap" style={{ color: COR.texto2 }}>{fmtNum(it.min, casas)} – {fmtNum(it.max, casas)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="grid mt-1.5 text-[10.5px] tabular-nums" style={{ gridTemplateColumns: 'minmax(56px,84px) minmax(0,1fr) minmax(72px,auto)', gap: 8, color: COR.mudo }}>
        <span />
        <span className="flex justify-between">{ticks.map((t, i) => <span key={i}>{fmtNum(t, casas)}</span>)}</span>
        <span className="text-right">{unidade}</span>
      </div>
      {itens.some(i => i.marcador != null) && (
        <p className="text-[10.5px] mt-1.5 flex items-center gap-1.5" style={{ color: COR.mudo }}>
          <span className="inline-block w-[3px] h-3 rounded-full" style={{ background: COR.texto }} /> traço = {marcadorRotulo} do talhão · barra = do mínimo ao máximo
        </p>
      )}
    </div>
  );
}

/** Contagem + rótulo curto num selo (ex.: classe do talhão). */
export function SeloCor({ cor, rotulo }: { cor: string; rotulo: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-semibold">
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cor, boxShadow: '0 0 0 1px color-mix(in srgb, var(--text-primary) 12%, transparent)' }} />
      {rotulo}
    </span>
  );
}

/** "≤ 45,0", "45,0 – 60,0", "> 90,0" — fronteira semiaberta (mín, máx] como classeDoValor. */
export function rotuloFaixa(c: { valorMin: number | null; valorMax: number | null }, casas = 1): string {
  if (c.valorMin == null && c.valorMax != null) return `≤ ${fmtNum(c.valorMax, casas)}`;
  if (c.valorMax == null && c.valorMin != null) return `> ${fmtNum(c.valorMin, casas)}`;
  if (c.valorMin != null && c.valorMax != null) return `${fmtNum(c.valorMin, casas)} – ${fmtNum(c.valorMax, casas)}`;
  return '';
}

/** "dd/mm" ou "dd/mm/aa" a partir de 'YYYY-MM-DD'. */
export function dataCurta(iso: string | null | undefined, comAno = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}${comAno ? `/${m[1].slice(2)}` : ''}` : '—';
}
