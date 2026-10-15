'use client';

// Evolução dos nutrientes — página própria do portal (15/10/2026).
//
// O cartão do painel mostra os cinco nutrientes de UM talhão. Aqui é o
// contrário: UM nutriente por vez, TODOS os talhões do produtor numa tabela
// por ano — valor com a classe dos mapas (cor da legenda), tendência e
// variação entre a primeira e a última análise. Serve para comparar talhões
// e achar o que está baixo. Clicar no talhão abre a página dele em nova aba,
// na Fertilidade do último ano analisado.

import { Fragment, useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowLeft, ChevronDown, ExternalLink, Eye } from 'lucide-react';
import { getFazendas, getTalhoes, getSafras, getLegendasPorAtributo, type Cliente } from '@/lib/store';
import { classeDoValor, type ClasseLegenda } from '@/lib/legendas';
import { anoDaSafra } from '@/lib/periodo';
import { fmtHa } from '@/lib/formato';
import type { PlanoAssinatura } from '@/lib/empresa';
import { APP_VERSION } from '@/constants/version';
import { dadosLocaisDoTalhao } from '@/lib/portalDados';
import {
  NUTRIENTES_EVOLUCAO, evolucaoPorTalhao, anosDaEvolucao, tendencia,
  type LinhaEvolucaoTalhao, type PontoEvolucao,
} from '@/lib/portalProdutor';
import { COR } from './GraficosPortal';

type Ordem = 'nome' | 'maior' | 'menor' | 'variacao';
const ORDENS: Array<{ id: Ordem; rotulo: string }> = [
  { id: 'nome', rotulo: 'Por talhão' },
  { id: 'maior', rotulo: 'Maior valor primeiro' },
  { id: 'menor', rotulo: 'Menor valor primeiro' },
  { id: 'variacao', rotulo: 'Maior variação primeiro' },
];
const cartao = { background: 'var(--bg-surface)', border: '1px solid var(--border-color)' } as const;
const casasDe = (nut: string) => (nut === 'ph' || nut === 'k' ? 2 : 1);
const fmtV = (v: number, casas: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const nomeLegivel = (nome: string) => (nome === nome.toUpperCase() ? nome.toLowerCase() : nome);

export function EvolucaoNutrientesPagina({ cliente, plano, preview, qsPreview }: {
  cliente: Cliente;
  plano: PlanoAssinatura | null;
  preview: boolean;
  qsPreview: string;
}) {
  const router = useRouter();
  const [nut, setNut] = useState<string>(NUTRIENTES_EVOLUCAO[0].id);
  const [fazendaSel, setFazendaSel] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('nome');

  const fazendasTodas = useMemo(() => (preview ? getFazendas(cliente.id) : getFazendas()), [cliente.id, preview]);
  const fazendas = useMemo(() => (fazendaSel ? fazendasTodas.filter(f => f.id === fazendaSel) : fazendasTodas), [fazendasTodas, fazendaSel]);
  const linhas = useMemo(
    () => evolucaoPorTalhao(fazendas.flatMap(f => getTalhoes(f.id)).map(t => dadosLocaisDoTalhao(t, ''))),
    [fazendas]);
  const anos = useMemo(() => anosDaEvolucao(linhas), [linhas]);
  const safras = useMemo(() => getSafras(), []);
  const legenda = useMemo(() => getLegendasPorAtributo(nut)[0] ?? null, [nut]);
  const classeDe = useCallback((v: number | null): ClasseLegenda | null =>
    (v == null || !legenda ? null : classeDoValor(v, legenda.classes) ?? null), [legenda]);
  const corDe = (c: ClasseLegenda | null) => c?.corFim ?? c?.corBase ?? COR.azul;
  const def = NUTRIENTES_EVOLUCAO.find(n => n.id === nut) ?? NUTRIENTES_EVOLUCAO[0];
  const casas = casasDe(nut);

  // Ordenação dentro de cada fazenda (a fazenda é o grupo).
  const ordenar = useCallback((ls: LinhaEvolucaoTalhao[]) => [...ls].sort((a, b) => {
    if (ordem === 'nome') return a.nome.localeCompare(b.nome, 'pt-BR');
    const ta = tendencia(a.pontos, nut), tb = tendencia(b.pontos, nut);
    const va = ordem === 'variacao' ? ta.variacao : ta.ultimo;
    const vb = ordem === 'variacao' ? tb.variacao : tb.ultimo;
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return ordem === 'menor' ? va - vb : vb - va;
  }), [ordem, nut]);
  const grupos = useMemo(() => fazendas
    .map(f => ({ f, itens: ordenar(linhas.filter(l => l.fazendaId === f.id)) }))
    .filter(g => g.itens.length > 0), [fazendas, linhas, ordenar]);

  // Panorama: a classe do ÚLTIMO valor de cada talhão, na ordem da legenda.
  const panorama = useMemo(() => {
    const m = new Map<string, { classe: ClasseLegenda; n: number }>();
    for (const l of linhas) {
      const c = classeDe(tendencia(l.pontos, nut).ultimo);
      if (!c) continue;
      const e = m.get(c.nome);
      if (e) e.n++; else m.set(c.nome, { classe: c, n: 1 });
    }
    return (legenda?.classes ?? []).map(c => m.get(c.nome)).filter((x): x is { classe: ClasseLegenda; n: number } => !!x);
  }, [linhas, nut, classeDe, legenda]);
  const comAnalise = useMemo(() => linhas.filter(l => l.pontos.length > 0).length, [linhas]);
  // Camada mais comum entre os talhões com análise (cada talhão usa a mais rasa do próprio laudo).
  const profundidade = useMemo(() => {
    const cont = new Map<string, number>();
    for (const l of linhas) if (l.profundidade) cont.set(l.profundidade, (cont.get(l.profundidade) ?? 0) + 1);
    return [...cont.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [linhas]);

  const safraDoAno = useCallback((ano: number) =>
    safras.find(s => anoDaSafra(s.nome) === ano)?.nome ?? `${String(ano).slice(2)}/${String(ano + 1).slice(2)}`, [safras]);
  const abrirTalhao = useCallback((id: string, ano: number | null) => {
    const q = new URLSearchParams({ aba: 'fertilidade' });
    if (ano != null) q.set('safra', safraDoAno(ano));
    if (preview) { q.set('preview', '1'); if (plano) q.set('plano', plano.id); }
    window.open(`/talhao/${id}?${q.toString()}`, '_blank', 'noopener,noreferrer');
  }, [safraDoAno, preview, plano]);

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-app)', color: COR.texto }}>
      <header className="flex items-center justify-between px-5 py-3" style={{ background: 'var(--invicta-blue)', borderBottom: '1px solid var(--invicta-blue-dark)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <Image src="/images/logo-branca.png" alt="Invicta" width={128} height={48} priority className="h-12 w-auto" style={{ objectFit: 'contain' }} />
          <span className="text-sm font-semibold hidden sm:inline truncate" style={{ color: 'var(--sidebar-text)' }}>Portal do produtor · Evolução dos nutrientes</span>
        </div>
        <button onClick={() => router.push(`/portal${qsPreview}`)} title="Voltar ao portal"
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold flex-shrink-0"
          style={{ background: 'var(--bg-surface)', color: 'var(--invicta-blue)' }}>
          <ArrowLeft size={14} /> Portal
        </button>
      </header>

      <main className="max-w-[1240px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        {preview && (
          <div className="rounded-lg px-4 py-2 text-sm flex items-center gap-2" style={{ background: 'var(--status-info-bg)', color: 'var(--status-info)', border: '1px solid color-mix(in srgb, var(--status-info) 25%, var(--bg-surface))' }}>
            <Eye size={14} />
            <span>Você está vendo como <strong className="capitalize">{nomeLegivel(cliente.nome)}</strong> veria.</span>
          </div>
        )}

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: COR.texto }}>Evolução dos nutrientes</h1>
            <p className="text-sm mt-1" style={{ color: COR.texto2 }}>
              Todos os seus talhões, um nutriente por vez: a média das amostras de cada ano{profundidade ? `, camada ${profundidade} cm` : ''}, com a classe dos seus mapas. Clique no talhão para abrir os mapas de fertilidade em nova aba.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {fazendasTodas.length > 1 && (
              <Seletor valor={fazendaSel} onChange={setFazendaSel}
                opcoes={[{ valor: '', rotulo: 'Todas as fazendas' }, ...fazendasTodas.map(f => ({ valor: f.id, rotulo: f.nome }))]} />
            )}
            <Seletor valor={ordem} onChange={v => setOrdem(v as Ordem)} opcoes={ORDENS.map(o => ({ valor: o.id, rotulo: o.rotulo }))} />
          </div>
        </div>

        {/* Nutriente */}
        <div className="flex flex-wrap items-center gap-1 rounded-lg p-1 w-fit" style={{ background: 'var(--bg-surface-hover)', border: '1px solid var(--border-color)' }}>
          {NUTRIENTES_EVOLUCAO.map(n => (
            <button key={n.id} type="button" onClick={() => setNut(n.id)}
              className="h-8 px-4 rounded-md text-sm font-semibold whitespace-nowrap"
              style={nut === n.id ? { background: 'var(--bg-surface)', color: COR.texto, boxShadow: '0 1px 2px var(--border-color)' } : { color: COR.texto2 }}>
              {n.rotulo}{n.unidade && !n.rotulo.includes('%') ? <span className="font-normal text-xs" style={{ color: COR.texto2 }}> {n.unidade}</span> : null}
            </button>
          ))}
        </div>

        {comAnalise === 0 ? (
          <section className="rounded-2xl p-6" style={cartao}>
            <p className="text-sm" style={{ color: COR.texto2 }}>Nenhum dos seus talhões tem análise de solo importada ainda.</p>
          </section>
        ) : (
          <>
            {/* Panorama do último valor */}
            <section className="rounded-2xl p-5 sm:p-6 flex flex-wrap items-center gap-x-6 gap-y-3" style={cartao}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: COR.texto2 }}>Última análise · {def.rotulo}</p>
                <p className="text-sm mt-0.5" style={{ color: COR.texto2 }}>{comAnalise} de {linhas.length} talhões com análise</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {panorama.map(({ classe, n }) => (
                  <span key={classe.nome} className="inline-flex items-center gap-2 px-3 h-8 rounded-full text-sm font-semibold"
                    style={{ background: `color-mix(in srgb, ${corDe(classe)} 18%, var(--bg-surface))`, color: COR.texto, border: `1px solid ${corDe(classe)}` }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: corDe(classe) }} />{classe.nome} <span className="tabular-nums" style={{ color: COR.texto2 }}>{n}</span>
                  </span>
                ))}
                {panorama.length === 0 && <span className="text-sm" style={{ color: COR.texto2 }}>Sem legenda cadastrada para {def.rotulo}.</span>}
              </div>
            </section>

            {/* Tabela talhão × ano */}
            <section className="rounded-2xl p-5 sm:p-6" style={cartao}>
              <div className="overflow-x-auto -mx-5 sm:-mx-6 px-5 sm:px-6">
                <table className="w-full text-sm" style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: 560 + anos.length * 96 }}>
                  <thead>
                    <tr style={{ color: COR.texto2 }}>
                      <th className="text-left text-xs font-medium py-2 pr-3 sticky left-0 z-10" style={{ background: 'var(--bg-surface)' }}>Talhão</th>
                      <th className="text-right text-xs font-medium py-2 pr-4">Área</th>
                      {anos.map(a => <th key={a} className="text-center text-xs font-semibold py-2 px-1 tabular-nums">{a}</th>)}
                      <th className="text-center text-xs font-medium py-2 px-2">Tendência</th>
                      <th className="text-right text-xs font-medium py-2 pl-2">Variação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupos.map(g => (
                      <Fragment key={g.f.id}>
                        <tr>
                          <td colSpan={4 + anos.length} className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wider capitalize" style={{ color: COR.texto2 }}>
                            {nomeLegivel(g.f.nome)} · {g.itens.length} {g.itens.length === 1 ? 'talhão' : 'talhões'}
                          </td>
                        </tr>
                        {g.itens.map(l => {
                          const t = tendencia(l.pontos, nut);
                          const cUlt = classeDe(t.ultimo);
                          const cor = corDe(cUlt);
                          const porAno = new Map(l.pontos.map(p => [p.ano, p.valores[nut] ?? null]));
                          return (
                            <tr key={l.talhaoId}>
                              <td className="py-1.5 pr-3 sticky left-0 z-10" style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border-color)' }}>
                                <button type="button" onClick={() => abrirTalhao(l.talhaoId, t.anoUltimo)} disabled={l.pontos.length === 0}
                                  title={l.pontos.length ? 'Abrir os mapas de fertilidade em nova aba' : 'Sem análise de solo'}
                                  className="inline-flex items-center gap-1.5 font-semibold text-left disabled:cursor-default"
                                  style={{ color: l.pontos.length ? COR.texto : COR.texto2 }}>
                                  {l.nome}{l.pontos.length > 0 && <ExternalLink size={11} style={{ color: COR.texto2 }} />}
                                </button>
                              </td>
                              <td className="py-1.5 pr-4 text-right tabular-nums whitespace-nowrap" style={{ color: COR.texto2, borderTop: '1px solid var(--border-color)' }}>{fmtHa(l.areaHa)} ha</td>
                              {anos.map(a => {
                                const v = porAno.get(a) ?? null;
                                const c = classeDe(v);
                                return (
                                  <td key={a} className="py-1.5 px-1" style={{ borderTop: '1px solid var(--border-color)' }}>
                                    <CelulaValor v={v} classe={c} cor={corDe(c)} casas={casas} />
                                  </td>
                                );
                              })}
                              <td className="py-1.5 px-2 text-center" style={{ borderTop: '1px solid var(--border-color)' }}>
                                <Sparkline pontos={l.pontos.map(p => ({ ano: p.ano, valor: p.valores[nut] ?? null }))} cor={cor} />
                              </td>
                              <td className="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap text-xs font-semibold" style={{ color: t.variacao == null ? COR.mudo : COR.texto, borderTop: '1px solid var(--border-color)' }}>
                                {t.variacao == null ? '—' : <>{t.variacao > 0 ? '▲ +' : t.variacao < 0 ? '▼ ' : '= '}{fmtV(t.variacao, casas)}</>}
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              {legenda && (
                <div className="mt-4 pt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs" style={{ color: COR.texto2, borderTop: '1px solid var(--border-color)' }}>
                  <span className="font-semibold" style={{ color: COR.texto }}>Classes de {def.rotulo}</span>
                  {legenda.classes.map(c => (
                    <span key={c.nome} className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm" style={{ background: corDe(c) }} />
                      {c.nome}
                      <span className="tabular-nums" style={{ color: COR.mudo }}>
                        {c.valorMin == null ? '<' : fmtV(c.valorMin, casas)}{c.valorMin != null && c.valorMax != null ? '–' : ''}{c.valorMax == null ? (c.valorMin == null ? '' : '+') : (c.valorMin == null ? ' ' : '') + fmtV(c.valorMax, casas)}
                      </span>
                    </span>
                  ))}
                  <span className="ml-auto">Variação = última análise − primeira. Tendência = ano a ano.</span>
                </div>
              )}
            </section>
          </>
        )}

        <p className="text-center text-xs pt-1" style={{ color: COR.texto2 }}>INVICTA Platform · v{APP_VERSION}</p>
      </main>
    </div>
  );
}

function CelulaValor({ v, classe, cor, casas }: { v: number | null; classe: ClasseLegenda | null; cor: string; casas: number }) {
  if (v == null) return <span className="block w-full text-center text-xs py-1" style={{ color: COR.mudo }}>—</span>;
  return (
    <span title={classe?.nome} className="inline-flex items-center justify-center gap-1.5 w-full py-1 px-1.5 rounded-md text-xs font-semibold tabular-nums whitespace-nowrap"
      style={{ background: classe ? `color-mix(in srgb, ${cor} 18%, var(--bg-surface))` : 'var(--bg-surface-hover)', color: COR.texto, border: `1px solid ${classe ? cor : 'var(--border-color)'}` }}>
      {classe && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cor }} />}{fmtV(v, casas)}
    </span>
  );
}

// Linha fina ano a ano, sem rótulos: a tabela já mostra os números.
function Sparkline({ pontos, cor }: { pontos: Array<{ ano: number; valor: number | null }>; cor: string }) {
  const vs = pontos.filter((p): p is { ano: number; valor: number } => p.valor != null);
  if (vs.length < 2) return <span className="text-xs" style={{ color: COR.mudo }}>{vs.length === 1 ? 'só 1 ano' : '—'}</span>;
  const w = 120, h = 32, pad = 5;
  const min = Math.min(...vs.map(p => p.valor)), max = Math.max(...vs.map(p => p.valor));
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (vs.length - 1);
  const y = (v: number) => (max === min ? h / 2 : h - pad - ((v - min) * (h - 2 * pad)) / (max - min));
  const d = vs.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="inline-block align-middle">
      <path d={d} fill="none" stroke={cor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {vs.map((p, i) => (
        <circle key={p.ano} cx={x(i)} cy={y(p.valor)} r={i === vs.length - 1 ? 3.5 : 2.5}
          fill={i === vs.length - 1 ? cor : 'var(--bg-surface)'} stroke={cor} strokeWidth={1.5} />
      ))}
    </svg>
  );
}

function Seletor({ valor, onChange, opcoes }: { valor: string; onChange: (v: string) => void; opcoes: Array<{ valor: string; rotulo: string }> }) {
  return (
    <span className="relative inline-flex">
      <select value={valor} onChange={e => onChange(e.target.value)}
        className="appearance-none rounded-lg h-9 pl-3 pr-8 text-sm font-medium outline-none max-w-[240px] cursor-pointer"
        style={{ background: 'var(--bg-surface)', color: COR.texto, border: '1px solid var(--border-color)' }}>
        {opcoes.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
      </select>
      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: COR.texto2 }} />
    </span>
  );
}

export type { PontoEvolucao };
