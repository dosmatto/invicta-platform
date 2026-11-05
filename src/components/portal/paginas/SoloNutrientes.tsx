'use client';

// Portal do Produtor → Evolução dos nutrientes (/portal/nutrientes), no padrão
// novo (substitui o componente antigo EvolucaoNutrientesPagina, já removido).
//
// A pergunta do produtor: o solo está MELHORANDO ou piorando? Um nutriente por
// vez: média por ano, quantos talhões subiram e caíram, onde mudou mais e a
// tabela talhão × ano com a cor da classe de cada valor. Com UM talhão mostra
// todos os nutrientes dele lado a lado (primeira × última análise).
//
// Contas: lib/portalProdutor (evolucaoPorTalhao, tendencia) e lib/portalPainelSolo.

import { Fragment, useCallback, useMemo, useState } from 'react';
import { TrendingUp, ArrowUpRight, ArrowDownRight, FlaskConical, Grid3x3, BarChart3, ListChecks, ExternalLink } from 'lucide-react';
import { classeDoValor, corCheiaDaClasse, type ClasseLegenda } from '@/lib/legendas';
import { evolucaoPorTalhao, anosDaEvolucao, tendencia, type LinhaEvolucaoTalhao } from '@/lib/portalProdutor';
import { ATRIBUTOS_SOLO, resumoAtributo, evolucaoPonderada, direcao, contarDirecoes, type Direcao } from '@/lib/portalPainelSolo';
import { rotuloAno } from '@/lib/periodo';
import { usePortal } from '../PortalContext';
import { Cartao, Kpi, LegendaClasses, BarrasAno, Seletor, Vazio, COR, fmtNum, fmtHaCurto, nomeLegivel, talhoesTxt, suave } from '../ui';
import { Abas, PilulaClasse, acaoAbrirTalhao, faixaTxt, unidadeDoAtributo, useLegendasSolo } from './SoloPecas';

type Ordem = 'nome' | 'maior' | 'menor' | 'variacao';
const ORDENS: Array<{ valor: Ordem; rotulo: string }> = [
  { valor: 'nome', rotulo: 'Por talhão' },
  { valor: 'maior', rotulo: 'Maior valor primeiro' },
  { valor: 'menor', rotulo: 'Menor valor primeiro' },
  { valor: 'variacao', rotulo: 'Maior variação primeiro' },
];
const SETA: Record<Direcao, string> = { subiu: '▲', caiu: '▼', estavel: '=', 'sem-base': '' };

/** Fora do plano ('fertilidade'), a rota é barrada pela GuardaPlano do shell. */
export function PaginaNutrientes() {
  return <Conteudo />;
}

function Conteudo() {
  const p = usePortal();
  const { dados, ano } = p;
  const um = !!p.talhao;
  const anoTxt = rotuloAno(p.safra);
  const legs = useLegendasSolo();
  const [at, setAt] = useState('p');
  const [ordem, setOrdem] = useState<Ordem>('nome');
  const def = ATRIBUTOS_SOLO.find(a => a.id === at) ?? ATRIBUTOS_SOLO[0];
  const casas = def.casas;
  const leg = legs.porAt[at];
  const classes = useMemo(() => leg?.classes ?? [], [leg]);
  const unid = unidadeDoAtributo(leg, at);

  const todosIds = useMemo(() => ATRIBUTOS_SOLO.map(a => a.id), []);
  const linhas = useMemo(() => evolucaoPorTalhao(dados, todosIds), [dados, todosIds]);
  const anos = useMemo(() => anosDaEvolucao(linhas), [linhas]);
  // Toda a história (ano = null): esta página é "ano a ano", não "até a safra do filtro".
  const r = useMemo(() => resumoAtributo(dados, null, at, classes, leg?.invertida), [dados, at, classes, leg]);
  const evol = useMemo(() => evolucaoPonderada(dados, at, null).slice(-8), [dados, at]);
  const classeDe = useCallback((v: number | null): ClasseLegenda | null => (v == null || !classes.length ? null : classeDoValor(v, classes) ?? null), [classes]);
  const corDe = (c: ClasseLegenda | null) => (c ? corCheiaDaClasse(c) : null);

  // Direção de cada talhão neste nutriente.
  const tendencias = useMemo(() => new Map(linhas.map(l => [l.talhaoId, tendencia(l.pontos, at)])), [linhas, at]);
  const direcoes = useMemo(() => new Map(linhas.map(l => { const t = tendencias.get(l.talhaoId)!; return [l.talhaoId, direcao(t.primeiro, t.ultimo, t.variacao)] as const; })), [linhas, tendencias]);
  const contagem = useMemo(() => contarDirecoes([...direcoes.values()]), [direcoes]);
  const comAnalise = linhas.filter(l => tendencias.get(l.talhaoId)!.ultimo != null);
  const comDuas = contagem.subiu + contagem.caiu + contagem.estavel;

  // Maiores mudanças (só talhões com duas análises ou mais).
  const mudancas = useMemo(() => linhas.flatMap(l => { const t = tendencias.get(l.talhaoId)!; return t.variacao != null ? [{ l, t }] : []; }), [linhas, tendencias]);
  const maioresAltas = useMemo(() => [...mudancas].filter(x => x.t.variacao! > 0).sort((a, b) => b.t.variacao! - a.t.variacao!).slice(0, 3), [mudancas]);
  const maioresQuedas = useMemo(() => [...mudancas].filter(x => x.t.variacao! < 0).sort((a, b) => a.t.variacao! - b.t.variacao!).slice(0, 3), [mudancas]);

  const ordenar = useCallback((ls: LinhaEvolucaoTalhao[]) => [...ls].sort((a, b) => {
    if (ordem === 'nome') return a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true });
    const ta = tendencias.get(a.talhaoId)!, tb = tendencias.get(b.talhaoId)!;
    const va = ordem === 'variacao' ? (ta.variacao == null ? null : Math.abs(ta.variacao)) : ta.ultimo;
    const vb = ordem === 'variacao' ? (tb.variacao == null ? null : Math.abs(tb.variacao)) : tb.ultimo;
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return ordem === 'menor' ? va - vb : vb - va;
  }), [ordem, tendencias]);
  const grupos = useMemo(() => p.fazendas
    .map(f => ({ f, itens: ordenar(linhas.filter(l => l.fazendaId === f.id)) }))
    .filter(g => g.itens.length > 0), [p.fazendas, linhas, ordenar]);

  const abrirNoTalhao = useCallback((id: string, a: number | null) => p.abrirTalhao(id, 'fertilidade', { novaAba: true, ano: a }), [p]);
  const clicarTalhao = useCallback((id: string) => (um ? p.abrirTalhao(id, 'fertilidade') : p.setFiltro({ talhao: id })), [um, p]);

  const semAnalise = comAnalise.length === 0;
  const umaLinha = um ? linhas[0] : null;

  return (
    <div className="space-y-4">
      <Abas valor={at} onChange={setAt} rotulo="Nutriente" opcoes={ATRIBUTOS_SOLO.map(a => ({ valor: a.id, rotulo: a.rotulo }))} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi icone={Grid3x3} tom="azul" rotulo="Talhões com análise" valor={comAnalise.length ? String(comAnalise.length) : null}
          sub={`de ${dados.length}${anos.length ? ` · ${anos.length === 1 ? anos[0] : `${anos[0]}–${anos[anos.length - 1]}`}` : ''}`} vazio="sem análise de solo importada" />
        <Kpi icone={FlaskConical} tom="verde" rotulo={`${def.rotulo} · ${um ? 'última análise' : 'média ponderada'}`} valor={r.media != null ? fmtNum(r.media, casas) : null} unidade={unid}
          delta={r.deltaMedia?.pct != null ? { valor: r.deltaMedia.pct, rotulo: 'vs. análise anterior' } : null}
          sub={r.classeMedia ? <PilulaClasse nome={r.classeMedia.nome} cor={r.classeMedia.cor} /> : undefined} subTexto={r.classeMedia?.nome ?? undefined} vazio="sem valor" />
        <Kpi icone={ArrowUpRight} tom="verde" rotulo={um ? 'Primeira × última análise' : 'Talhões que subiram'}
          valor={um ? (umaLinha && tendencias.get(umaLinha.talhaoId)?.variacao != null ? `${tendencias.get(umaLinha.talhaoId)!.variacao! > 0 ? '+' : ''}${fmtNum(tendencias.get(umaLinha.talhaoId)!.variacao, casas)}` : null) : (comDuas ? String(contagem.subiu) : null)}
          unidade={um ? unid : undefined}
          sub={um ? 'diferença desde a primeira análise' : `${contagem.estavel} estáveis · desde a primeira análise`} vazio={um ? 'só há uma análise deste talhão' : 'precisa de 2 análises por talhão'} />
        <Kpi icone={ArrowDownRight} tom="ambar" rotulo={um ? 'Análises do talhão' : 'Talhões que caíram'}
          valor={um ? (umaLinha && umaLinha.pontos.length ? String(umaLinha.pontos.length) : null) : (comDuas ? String(contagem.caiu) : null)}
          sub={um ? (umaLinha ? `${anos.length ? `${anos[0]}–${anos[anos.length - 1]}` : ''}` : undefined) : `de ${comDuas} com 2+ análises`} vazio="sem análise" />
      </div>

      {semAnalise ? (
        <Vazio icone={FlaskConical} titulo="Sem análise de solo" texto={um ? 'Este talhão ainda não tem laudo de laboratório importado.' : `Nenhum talhão no filtro tem análise de solo importada${p.cultura ? ` (${p.cultura})` : ''}.`} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-6 xl:grid-cols-12 gap-4">
          <Cartao className="md:col-span-3 xl:col-span-5" icone={BarChart3} titulo={`${def.rotulo} por ano`} sub={`${unid || def.rotulo} · ${um ? 'valor do talhão' : 'média ponderada pela área'}`}
            acao={um ? acaoAbrirTalhao(p, 'fertilidade') : null}>
            {evol.length === 0 ? <Vazio compacto icone={FlaskConical} titulo={`Sem análise de ${def.rotulo}`} /> : (
              <>
                <BarrasAno itens={evol.map(e => ({ rotulo: String(e.ano), valor: e.valor, destaque: e.ano === ano, titulo: `${e.ano}: ${fmtNum(e.valor, casas)}${unid ? ` ${unid}` : ''} · ${talhoesTxt(e.nTalhoes)}` }))} unidade={unid || def.rotulo} casas={casas} />
                <p className="text-[10.5px] mt-1" style={{ color: COR.mudo }}>
                  {evol.length === 1 ? 'Com a próxima análise, a tendência aparece. ' : ''}{ano != null && evol.some(e => e.ano === ano) ? `Barra forte = ${anoTxt}.` : `Sem análise em ${anoTxt}; barra forte = ${evol[evol.length - 1].ano}.`}
                </p>
              </>
            )}
          </Cartao>

          {um && umaLinha ? (
            <Cartao className="md:col-span-3 xl:col-span-7" icone={ListChecks} titulo="Todos os nutrientes deste talhão" sub="Primeira × última análise, com a classe da legenda da Biblioteca">
              <div className="overflow-x-auto -mx-1 px-1">
                <table className="w-full text-xs" style={{ minWidth: 460 }}>
                  <thead><tr style={{ color: COR.texto2 }}>
                    <th className="text-left font-semibold pb-1.5">Nutriente</th>
                    <th className="text-right font-semibold pb-1.5 px-1.5">Primeira</th>
                    <th className="text-right font-semibold pb-1.5 px-1.5">Última</th>
                    <th className="text-left font-semibold pb-1.5 px-1.5">Classe</th>
                    <th className="text-right font-semibold pb-1.5">Variação</th>
                  </tr></thead>
                  <tbody>
                    {ATRIBUTOS_SOLO.map(a => {
                      const t = tendencia(umaLinha.pontos, a.id);
                      const cl = legs.porAt[a.id]?.classes ?? [];
                      const c = t.ultimo != null && cl.length ? classeDoValor(t.ultimo, cl) : undefined;
                      return (
                        <tr key={a.id} onClick={() => setAt(a.id)} className="cursor-pointer hover:bg-[var(--bg-surface-hover)]"
                          style={{ borderTop: `1px solid ${COR.borda}`, background: a.id === at ? 'color-mix(in srgb, var(--invicta-green) 9%, transparent)' : undefined }}>
                          <td className="py-1.5 font-bold">{a.rotulo}</td>
                          <td className="py-1.5 px-1.5 text-right tabular-nums" style={{ color: COR.texto2 }}>{t.primeiro != null ? fmtNum(t.primeiro, a.casas) : '—'}</td>
                          <td className="py-1.5 px-1.5 text-right tabular-nums font-extrabold">{t.ultimo != null ? fmtNum(t.ultimo, a.casas) : '—'}</td>
                          <td className="py-1.5 px-1.5"><PilulaClasse nome={c?.nome ?? null} cor={c ? corCheiaDaClasse(c) : null} vazio={t.ultimo != null ? 'sem legenda' : '—'} /></td>
                          <td className="py-1.5 text-right tabular-nums font-bold">{t.variacao == null ? <span style={{ color: COR.mudo }}>{t.ultimo != null ? 'só 1 análise' : '—'}</span> : `${t.variacao > 0 ? '▲ +' : t.variacao < 0 ? '▼ ' : '= '}${fmtNum(t.variacao, a.casas)}`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Cartao>
          ) : (
            <Cartao className="md:col-span-3 xl:col-span-7" icone={TrendingUp} titulo={`Panorama de ${def.rotulo}`} sub="Classe da última análise de cada talhão e onde mais mudou">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {classes.length === 0 ? (
                  <Vazio compacto titulo={`Sem legenda de ${def.rotulo}`} texto="A Biblioteca não tem legenda cadastrada para este atributo." />
                ) : (
                  <LegendaClasses titulo="Última análise"
                    itens={r.dist.classes.map(c => ({ cor: c.cor, rotulo: `${c.nome} ${faixaTxt(c, casas)}`, pct: c.pct, ha: c.ha, apagado: c.n === 0 }))}
                    rodape={`${comAnalise.length} de ${dados.length} talhões · ${fmtHaCurto(r.areaComValor)} ha com análise.`} />
                )}
                <div className="space-y-3 min-w-0">
                  {([['Subiu mais', maioresAltas, 'var(--p-verde-texto)'], ['Caiu mais', maioresQuedas, COR.vermelho]] as const).map(([titulo, itens, cor]) => (
                    <div key={titulo}>
                      <p className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: COR.texto2 }}>{titulo}</p>
                      {itens.length === 0 ? <p className="text-xs" style={{ color: COR.mudo }}>{mudancas.length ? 'nenhum talhão' : 'precisa de 2 análises por talhão'}</p> : (
                        <ul className="space-y-1">
                          {itens.map(({ l, t }) => (
                            <li key={l.talhaoId}>
                              <button type="button" onClick={() => clicarTalhao(l.talhaoId)} className="w-full flex items-center justify-between gap-2 text-xs text-left rounded-lg px-2 py-1 hover:bg-[var(--bg-surface-hover)]">
                                <span className="font-bold truncate">{l.nome}</span>
                                <span className="tabular-nums font-extrabold whitespace-nowrap" style={{ color: cor }}>{t.variacao! > 0 ? '▲ +' : '▼ '}{fmtNum(t.variacao, casas)}<span className="font-normal ml-1" style={{ color: COR.mudo }}>{t.ultimo != null ? `→ ${fmtNum(t.ultimo, casas)}` : ''}</span></span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </Cartao>
          )}

          {/* Tabela talhão × ano */}
          <Cartao className="md:col-span-6 xl:col-span-12" icone={Grid3x3} titulo={`${def.rotulo} · talhão × ano`}
            sub={`Média das amostras de cada ano, na camada mais rasa${unid ? ` · ${unid}` : ''} — a cor é a classe da legenda`}
            extra={!um ? <Seletor valor={ordem} onChange={v => setOrdem(v as Ordem)} opcoes={ORDENS} rotulo="Ordenar" /> : null}
            rodape={classes.length ? (
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <strong style={{ color: COR.texto }}>Classes de {def.rotulo}</strong>
                {classes.map(c => (
                  <span key={c.nome} className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: corCheiaDaClasse(c) }} />{c.nome}<span className="tabular-nums" style={{ color: COR.mudo }}>{faixaTxt(c, casas)}</span></span>
                ))}
                <span className="ml-auto">Variação = última − primeira análise.</span>
              </span>
            ) : `Sem legenda cadastrada para ${def.rotulo}.`}>
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: 460 + anos.length * 84 }}>
                <thead>
                  <tr style={{ color: COR.texto2 }}>
                    <th className="text-left font-semibold py-2 pr-3 sticky left-0 z-10" style={{ background: COR.superficie }}>Talhão</th>
                    <th className="text-right font-semibold py-2 pr-3">Área</th>
                    {anos.map(a => <th key={a} className="text-center font-semibold py-2 px-1 tabular-nums" style={a === ano ? { color: COR.texto } : undefined}>{a}{a === ano ? ' ●' : ''}</th>)}
                    <th className="text-center font-semibold py-2 px-2">Tendência</th>
                    <th className="text-right font-semibold py-2 pl-2">Variação</th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.map(g => (
                    <Fragment key={g.f.id}>
                      {p.fazendas.length > 1 && (
                        <tr><td colSpan={4 + anos.length} className="pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: COR.texto2 }}>{nomeLegivel(g.f.nome)} · {talhoesTxt(g.itens.length)}</td></tr>
                      )}
                      {g.itens.map(l => {
                        const t = tendencias.get(l.talhaoId)!;
                        const dir = direcoes.get(l.talhaoId)!;
                        const cUlt = classeDe(t.ultimo);
                        const porAno = new Map(l.pontos.map(pt => [pt.ano, pt.valores[at] ?? null]));
                        return (
                          <tr key={l.talhaoId}>
                            <td className="py-1.5 pr-3 sticky left-0 z-10" style={{ background: COR.superficie, borderTop: `1px solid ${COR.borda}` }}>
                              <button type="button" onClick={() => clicarTalhao(l.talhaoId)} disabled={l.pontos.length === 0} title={um ? 'Abrir a página do talhão' : 'Ver o painel deste talhão'}
                                className="font-extrabold text-left hover:underline disabled:no-underline disabled:cursor-default" style={{ color: l.pontos.length ? COR.texto : COR.texto2 }}>{l.nome}</button>
                            </td>
                            <td className="py-1.5 pr-3 text-right tabular-nums whitespace-nowrap" style={{ color: COR.texto2, borderTop: `1px solid ${COR.borda}` }}>{fmtHaCurto(l.areaHa)} ha</td>
                            {anos.map(a => {
                              const v = porAno.get(a) ?? null;
                              const c = classeDe(v);
                              const cor = corDe(c);
                              return (
                                <td key={a} className="py-1.5 px-1" style={{ borderTop: `1px solid ${COR.borda}` }}>
                                  {v == null ? <span className="block text-center" style={{ color: COR.mudo }}>—</span> : (
                                    <button type="button" onClick={() => abrirNoTalhao(l.talhaoId, a)} title={`${c?.nome ?? ''}${c ? ' · ' : ''}abrir os mapas de ${a} em nova aba`}
                                      className="w-full inline-flex items-center justify-center gap-1.5 py-1 px-1.5 rounded-md font-semibold tabular-nums whitespace-nowrap"
                                      style={{ background: cor ? suave(cor, 20) : COR.superficie2, color: COR.texto, border: `1px solid ${cor ?? COR.borda}` }}>
                                      {cor && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cor }} />}{fmtNum(v, casas)}
                                    </button>
                                  )}
                                </td>
                              );
                            })}
                            <td className="py-1.5 px-2 text-center" style={{ borderTop: `1px solid ${COR.borda}` }}>
                              <Sparkline pontos={l.pontos.map(pt => ({ ano: pt.ano, valor: pt.valores[at] ?? null }))} cor={corDe(cUlt) ?? 'var(--invicta-blue-mid)'} />
                            </td>
                            <td className="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap font-bold" style={{ borderTop: `1px solid ${COR.borda}`, color: dir === 'caiu' ? COR.vermelho : dir === 'subiu' ? 'var(--p-verde-texto)' : COR.texto2 }}>
                              {t.variacao == null ? <span className="font-normal" style={{ color: COR.mudo }}>{t.ultimo != null ? 'só 1 análise' : '—'}</span> : <>{SETA[dir]} {t.variacao > 0 ? '+' : ''}{fmtNum(t.variacao, casas)}</>}
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            {um && <p className="text-[11px] mt-2 inline-flex items-center gap-1" style={{ color: COR.mudo }}><ExternalLink size={11} /> Clique num valor para abrir os mapas daquele ano.</p>}
          </Cartao>
        </div>
      )}
    </div>
  );
}

// Linha fina ano a ano, sem rótulos: a tabela já mostra os números.
function Sparkline({ pontos, cor }: { pontos: Array<{ ano: number; valor: number | null }>; cor: string }) {
  const vs = pontos.filter((p): p is { ano: number; valor: number } => p.valor != null);
  if (vs.length < 2) return <span className="text-[11px]" style={{ color: COR.mudo }}>{vs.length === 1 ? 'só 1 ano' : '—'}</span>;
  const w = 110, h = 30, pad = 5;
  const min = Math.min(...vs.map(p => p.valor)), max = Math.max(...vs.map(p => p.valor));
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (vs.length - 1);
  const y = (v: number) => (max === min ? h / 2 : h - pad - ((v - min) * (h - 2 * pad)) / (max - min));
  const d = vs.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="inline-block align-middle">
      <path d={d} fill="none" stroke={cor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {vs.map((p, i) => <circle key={p.ano} cx={x(i)} cy={y(p.valor)} r={i === vs.length - 1 ? 3.5 : 2.5} fill={i === vs.length - 1 ? cor : 'var(--bg-surface)'} stroke={cor} strokeWidth={1.5} />)}
    </svg>
  );
}
