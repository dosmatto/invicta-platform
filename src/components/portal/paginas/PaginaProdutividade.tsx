'use client';

// Portal do Produtor → Produtividade (/portal/produtividade).
//
// O que o produtor quer saber aqui: "quanto colhi, em relação ao ano passado,
// e onde foi bem e onde foi mal?". A página mostra a média ponderada pela área
// (na unidade do cabeçalho: kg/ha, sc/ha ou sc/alq) com a variação contra a safra anterior, a produção total, o quanto os
// talhões variam entre si (CV), o mapa em classes, o ranking com a variação de
// cada talhão e o histórico por safra e cultura.
//
// Com UM talhão no filtro vira o "detalhe de colheita do talhão": os números do
// mapa dele (mín–máx, CV, produção), o mapa real por padrão e o histórico dele.
// Contas em lib/portalPainelSensores (puro, testado). Sem colheita no ano →
// estado vazio que aponta os anos que têm.

import { useCallback, useMemo, useState } from 'react';
import { BarChart3, Wheat, Scale, Trophy, Map as MapaIcone, PieChart, History, ListOrdered, Ruler } from 'lucide-react';
import { legendaDaCultura } from '@/lib/produtividade';
import { rotuloAno } from '@/lib/periodo';
import { colheitaDoAno, classesEmSacas, distribuirEmClasses, normCultura, talhoesSemColheita, culturaPredominanteDoAno, tituloCulturaPredominante } from '@/lib/portalPainel';
import { linhasProdutividade, resumoProdutividade, historicoPorSafra, type LinhaProd } from '@/lib/portalPainelSensores';
import { usePortal } from '../PortalContext';
import { Cartao, Kpi, LegendaClasses, BarrasAno, Seletor, Vazio, MiniMapa, camadaProdutividade, COR, fmtNum, fmtInt, fmtHaCurto, suave, talhoesTxt } from '../ui';
import { BotaoAbrirTalhao, GradeKpis, TabelaTalhoes, rotuloFaixa, type ColunaTabela } from './SensoresComuns';
import { casasDaUnidade, classesNaUnidade, deScHa, fmtScHa } from '@/lib/portalUnidade';

/** ▲ +x% / ▼ −x% colorido (subir é bom). */
function Delta({ v }: { v: number | null }) {
  if (v == null) return <span style={{ color: COR.mudo }}>—</span>;
  const cor = v > 0 ? 'var(--p-verde-texto)' : v < 0 ? COR.vermelho : COR.texto2;
  return <span className="font-bold" style={{ color: cor }}>{v > 0 ? '▲ +' : v < 0 ? '▼ ' : '= '}{fmtNum(v, 1)}%</span>;
}

/** Fora do plano ('produtividade'), a rota é barrada pela GuardaPlano do shell. */
export function PaginaProdutividade() {
  return <ConteudoProdutividade />;
}

function ConteudoProdutividade() {
  const p = usePortal();
  const { dados, ano, cultura } = p;
  const um = !!p.talhao;
  const anoTxt = rotuloAno(p.safra);

  // Um talhão herda a cultura predominante da propriedade (dadosEscopo) — regra em lib/portalPainel.
  const base = useMemo(() => linhasProdutividade(dados, ano, cultura, p.dadosEscopo), [dados, ano, cultura, p.dadosEscopo]);
  const predEscopo = useMemo(() => culturaPredominanteDoAno(p.dadosEscopo, ano), [p.dadosEscopo, ano]);
  const { linhas } = base;
  const culturaKpi = base.cultura;
  const anterior = useMemo(() => (ano != null && culturaKpi ? linhasProdutividade(dados, ano - 1, culturaKpi).linhas : []), [dados, ano, culturaKpi]);
  const resumo = useMemo(() => resumoProdutividade(linhas, culturaKpi, anterior), [linhas, culturaKpi, anterior]);

  const legProd = useMemo(() => (culturaKpi ? legendaDaCultura(culturaKpi) ?? null : null), [culturaKpi]);
  const classes = useMemo(() => (legProd ? classesEmSacas(legProd.classes) : []), [legProd]);
  // Unidade da tela: a régua (classes) e os números seguem em sc/ha; só os textos
  // mudam — os limites da legenda vêm da original em kg/ha (lib/portalUnidade).
  const u = p.unidade;
  const casasU = casasDaUnidade(u);
  const faixaU = useMemo(() => new Map(classesNaUnidade(legProd?.classes ?? [], u).map(c => [c.nome, c])), [legProd, u]);
  const faixaDe = (c: { nome: string; valorMin: number | null; valorMax: number | null }) => rotuloFaixa(faixaU.get(c.nome) ?? c, casasU);
  const valorPorId = useMemo(() => new Map(linhas.map(l => [l.talhaoId, l.mediaScHa])), [linhas]);
  const dist = useMemo(() => distribuirEmClasses(dados.map(d => ({ id: d.talhao.id, valor: valorPorId.get(d.talhao.id) ?? null, areaHa: d.talhao.areaHa })), classes), [dados, valorPorId, classes]);
  // "Sem colheita" = sem colheita DA cultura; quem colheu outra cultura não conta.
  const semColheita = useMemo(() => talhoesSemColheita(dados, ano, culturaKpi), [dados, ano, culturaKpi]);
  const nomesPorClasse = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const l of linhas) { const c = dist.classePorId[l.talhaoId]; if (c) m.set(c, [...(m.get(c) ?? []), l.nome]); }
    return m;
  }, [linhas, dist]);

  const historico = useMemo(() => historicoPorSafra(dados, cultura), [dados, cultura]);
  const culturasHist = useMemo(() => [...new Map(historico.map(h => [normCultura(h.cultura), h.cultura])).values()], [historico]);
  const [culHistSel, setCulHistSel] = useState('');
  const culHist = (culHistSel && culturasHist.find(c => normCultura(c) === normCultura(culHistSel))) || culturasHist.find(c => normCultura(c) === normCultura(culturaKpi)) || culturasHist[0] || '';
  const histCultura = useMemo(() => historico.filter(h => normCultura(h.cultura) === normCultura(culHist)), [historico, culHist]);

  const talhoesMapa = useMemo(() => dados.map(d => ({ id: d.talhao.id, nome: d.talhao.nome, geojson: d.talhao.geojson })), [dados]);
  const porId = useMemo(() => new Map(dados.map(d => [d.talhao.id, d])), [dados]);
  const realProd = useCallback((id: string) => { const d = porId.get(id); return d ? camadaProdutividade(id, colheitaDoAno(d, ano, culturaKpi), d.mapasNuvem) : null; }, [porId, ano, culturaKpi]);
  const clicar = useCallback((id: string) => (um ? p.abrirTalhao(id, 'produtividade') : p.setFiltro({ talhao: id })), [um, p]);

  // ── Sem colheita no ano ──
  if (!linhas.length || !resumo) {
    const outros = [...new Set(historico.map(h => h.ano))].filter(a => a !== ano).sort((a, b) => b - a);
    const opcaoDoAno = (a: number) => p.opcoesSafra.find(o => rotuloAno(o.valor) === String(a));
    return (
      <div className="space-y-4">
        {um && <div className="flex justify-end"><BotaoAbrirTalhao aba="produtividade" /></div>}
        <Vazio icone={BarChart3} titulo={um ? `Este talhão não tem mapa de colheita em ${anoTxt}` : `Sem mapa de colheita em ${anoTxt}`}
          texto={[
            cultura ? `Nenhum talhão de ${cultura} tem colheita processada no ano.` : 'Quando a colheita for processada, a produtividade aparece aqui.',
            outros.length ? `Há colheita em ${outros.join(', ')}.` : '',
          ].filter(Boolean).join(' ')}
          acao={outros.length ? (
            <div className="flex flex-wrap justify-center gap-2 mt-2">
              {outros.map(a => { const o = opcaoDoAno(a); return o ? (
                <button key={a} type="button" onClick={() => p.setFiltro({ safra: o.valor })} className="h-8 px-3 rounded-lg text-xs font-bold" style={{ background: COR.verdeEscuro, color: '#fff' }}>Ver {a}</button>
              ) : null; })}
            </div>
          ) : null} />
      </div>
    );
  }

  const l0 = linhas[0];
  const semAnterior = resumo.anteriorScHa == null;
  const kpis = [
    <Kpi key="media" icone={BarChart3} tom="verde" rotulo={`Produtividade média · ${culturaKpi}`} valor={fmtScHa(resumo.mediaScHa, u, false)} unidade={u}
      // Curto para caber em 2 linhas: "▲ +9,0% vs. 2025 · antes: 3.660 kg/ha · predominante" (o tooltip explica).
      delta={resumo.deltaPct != null ? { valor: resumo.deltaPct, rotulo: `vs. ${(ano ?? 0) - 1}` } : null}
      sub={[semAnterior ? `${um ? 'sem' : `${talhoesTxt(resumo.nTalhoes)} · sem`} ${(ano ?? 0) - 1} para comparar` : `antes: ${fmtScHa(resumo.anteriorScHa ?? 0, u)}`, base.outrasCulturas ? 'predominante' : ''].filter(Boolean).join(' · ')}
      titulo={base.outrasCulturas ? tituloCulturaPredominante({ cultura: culturaKpi, outras: base.outras, anoTxt, um, predominanteEscopo: predEscopo }) : undefined} />,
    <Kpi key="prod" icone={Wheat} tom="ambar" rotulo="Produção total" valor={fmtInt(resumo.producaoTotalT)} unidade="t"
      sub={`${fmtInt(resumo.producaoTotalSc)} sacas · ${fmtHaCurto(resumo.areaHa)} ha colhidos`} />,
    um || resumo.cvEntreTalhoes == null
      ? <Kpi key="cv" icone={Scale} tom="roxo" rotulo="Variação dentro do talhão" valor={resumo.cvDentro != null ? fmtNum(resumo.cvDentro, 1) : null} unidade="% (CV)"
          sub="o quanto o mapa varia de um ponto a outro" vazio={resumo.nTalhoes < 2 && !um ? 'precisa de 2 talhões colhidos' : 'sem CV no mapa de colheita'} />
      : <Kpi key="cv" icone={Scale} tom="roxo" rotulo="Variação entre talhões" valor={fmtNum(resumo.cvEntreTalhoes, 1)} unidade="% (CV)"
          sub={resumo.cvDentro != null ? `dentro de cada mapa: ${fmtNum(resumo.cvDentro, 1)}%` : 'coeficiente de variação das médias'} />,
    um
      ? <Kpi key="faixa" icone={Ruler} tom="azul" rotulo="Faixa dentro do talhão" valor={l0.minScHa != null && l0.maxScHa != null ? `${fmtScHa(l0.minScHa, u, false)} – ${fmtScHa(l0.maxScHa, u, false)}` : null} unidade={u}
          sub="mínimo e máximo do mapa de colheita" vazio="mapa sem mínimo/máximo" />
      : <Kpi key="melhor" icone={Trophy} tom="azul" rotulo="Maior produtividade" valor={resumo.melhor ? fmtScHa(resumo.melhor.mediaScHa, u, false) : null} unidade={u}
          sub={resumo.melhor ? `${resumo.melhor.nome}${resumo.pior ? ` · menor: ${resumo.pior.nome} (${fmtScHa(resumo.pior.mediaScHa, u, false)})` : ''}` : undefined} />,
  ];

  // ── Tabelas ──
  const maxSc = Math.max(...linhas.map(l => l.mediaScHa));
  const colunas: Array<ColunaTabela<LinhaProd>> = [
    { id: 'nome', rotulo: 'Talhão', valor: r => r.nome },
    { id: 'area', rotulo: 'Área (ha)', align: 'right', soDesktop: true, valor: r => r.peso, render: r => fmtHaCurto(r.peso) },
    { id: 'sc', rotulo: u, align: 'right', valor: r => r.mediaScHa, titulo: 'Produtividade média do mapa de colheita',
      render: r => (
        <span className="inline-flex items-center gap-2 justify-end w-full">
          <span className="hidden sm:inline-block h-2.5 rounded-full" style={{ width: `${Math.max(8, (r.mediaScHa / maxSc) * 64)}px`, background: dist.corPorId[r.talhaoId] ?? 'var(--invicta-green)' }} />
          <strong className="text-sm">{fmtScHa(r.mediaScHa, u, false)}</strong>
        </span>
      ) },
    { id: 'media', rotulo: '% da média', align: 'right', soDesktop: true, valor: r => r.pctDaMedia, titulo: '100% = igual à média ponderada do conjunto',
      render: r => (r.pctDaMedia != null ? <span style={{ color: r.pctDaMedia < 90 ? COR.vermelho : COR.texto }}>{r.pctDaMedia}%</span> : '—') },
    { id: 'delta', rotulo: `vs. ${(ano ?? 0) - 1}`, align: 'right', valor: r => r.deltaPct, titulo: 'Variação contra a safra anterior, mesma cultura', render: r => <Delta v={r.deltaPct} /> },
    { id: 'prod', rotulo: 'Produção (sc)', align: 'right', soDesktop: true, valor: r => r.producaoSc, render: r => (r.producaoSc != null ? fmtInt(r.producaoSc) : '—') },
    { id: 'cv', rotulo: 'CV', align: 'right', soDesktop: true, valor: r => r.cv, titulo: 'Coeficiente de variação dentro do mapa do talhão', render: r => (r.cv != null ? `${fmtNum(r.cv, 1)}%` : '—') },
  ];

  const detalhes: Array<[string, string]> = [
    ['Média do mapa', fmtScHa(l0.mediaScHa, u)],
    ['Mínimo – máximo', l0.minScHa != null && l0.maxScHa != null ? `${fmtScHa(l0.minScHa, u, false)} – ${fmtScHa(l0.maxScHa, u)}` : '—'],
    ['Variação (CV)', l0.cv != null ? `${fmtNum(l0.cv, 1)}%` : '—'],
    ['Área colhida', `${fmtHaCurto(l0.peso)} ha`],
    ['Produção', l0.producaoSc != null ? `${fmtInt(l0.producaoSc)} sacas` : '—'],
    [`Em ${(ano ?? 0) - 1}`, l0.anteriorScHa != null ? fmtScHa(l0.anteriorScHa, u) : 'sem mapa'],
  ];

  return (
    <div className="space-y-4">
      <GradeKpis>{kpis}</GradeKpis>

      <div className="grid grid-cols-1 md:grid-cols-6 xl:grid-cols-12 gap-4">
        <Cartao className="md:col-span-6 xl:col-span-7" icone={MapaIcone} titulo={`Mapa de produtividade (${culturaKpi})`}
          sub={(um ? `Mapa de colheita ${anoTxt}` : `Média de cada talhão no mapa de colheita ${anoTxt}`) + (base.outrasCulturas ? ` · cultura predominante (também: ${base.outras.join(', ')})` : '')}>
          {/* 228px: a faixa em kg/ha ("3.600 – 4.500") cabe sem cortar ao lado de % e ha. */}
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_228px] gap-4 items-start">
            <MiniMapa talhoes={talhoesMapa} corDe={id => dist.corPorId[id] ?? null} altura={um ? 320 : 280} nomes={!um}
              rotulo={id => (valorPorId.has(id) ? fmtScHa(valorPorId.get(id)!, u) : semColheita.outraCultura.includes(id) ? `outra cultura (fora do mapa de ${culturaKpi})` : `sem colheita de ${culturaKpi}`)}
              camadaReal={realProd} onClicar={clicar} aria="Mapa de produtividade" />
            {classes.length ? (
              <LegendaClasses titulo={`Produtividade (${u})`}
                itens={[...dist.classes].reverse().map(c => ({ cor: c.cor, rotulo: faixaDe(c), pct: um ? null : c.pct, ha: um ? null : c.ha, sub: c.nome, apagado: !um && c.n === 0 }))}
                rodape={um
                  ? `Média do talhão: ${fmtScHa(l0.mediaScHa, u)} (${dist.classePorId[l0.talhaoId] ?? '—'}). Classes da legenda ${legProd?.nome ?? ''}.`
                  : `Cor = classe da média de cada talhão (legenda ${legProd?.nome ?? '—'}).${semColheita.n ? ` ${talhoesTxt(semColheita.n)} sem colheita de ${culturaKpi}.` : ''}`} />
            ) : <Vazio compacto titulo="Sem legenda de produtividade" texto="Cadastre a legenda da cultura na Biblioteca." />}
          </div>
        </Cartao>

        <Cartao className="md:col-span-6 xl:col-span-5" icone={PieChart} titulo="Distribuição por classe"
          sub={um ? 'Em que classe a média do talhão cai' : 'Quanta área e quais talhões em cada faixa de produtividade'}
          rodape={um ? undefined : 'Cada talhão entra inteiro na classe da sua média (não é área por pixel).'}>
          {classes.length === 0 ? <Vazio compacto titulo="Sem classes para mostrar" /> : (
            <ul className="space-y-2.5">
              {[...dist.classes].reverse().map(c => {
                const nomes = nomesPorClasse.get(c.nome) ?? [];
                const doTalhao = um && dist.classePorId[l0.talhaoId] === c.nome;
                return (
                  <li key={c.nome} style={{ opacity: um ? (doTalhao ? 1 : 0.4) : c.n ? 1 : 0.45 }}>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 min-w-0 font-semibold">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.cor }} />
                        <span className="truncate">{c.nome} <span style={{ color: COR.texto2 }} className="font-normal">({faixaDe(c)} {u})</span></span>
                        {doTalhao && <strong className="flex-shrink-0">◀ este talhão</strong>}
                      </span>
                      {!um && <span className="tabular-nums whitespace-nowrap"><strong>{fmtNum(c.pct, 0)}%</strong> <span style={{ color: COR.texto2 }}>· {fmtHaCurto(c.ha)} ha</span></span>}
                    </div>
                    {!um && (
                      <>
                        <div className="h-2 rounded-full mt-1 overflow-hidden" style={{ background: COR.superficie2 }}>
                          <div className="h-full rounded-full" style={{ width: `${Math.max(c.n ? 2 : 0, c.pct)}%`, background: c.cor }} />
                        </div>
                        {nomes.length > 0 && (
                          <p className="text-[10.5px] mt-1 truncate" style={{ color: COR.texto2 }} title={nomes.join(', ')}>
                            {nomes.slice(0, 4).join(', ')}{nomes.length > 4 ? ` +${nomes.length - 4}` : ''}
                          </p>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Cartao>

        {um ? (
          <Cartao className="md:col-span-3 xl:col-span-5" icone={Ruler} titulo="Números do mapa de colheita" sub={`${culturaKpi} · ${anoTxt}`}>
            <dl className="grid grid-cols-2 gap-2">
              {detalhes.map(([r, v]) => (
                <div key={r} className="rounded-xl px-3 py-2" style={{ background: COR.superficie2 }}>
                  <dt className="text-[10.5px] font-semibold" style={{ color: COR.texto2 }}>{r}</dt>
                  <dd className="text-sm font-extrabold tabular-nums mt-0.5">{v}</dd>
                </div>
              ))}
            </dl>
          </Cartao>
        ) : (
          <Cartao className="md:col-span-6 xl:col-span-12" icone={ListOrdered} titulo="Ranking dos talhões" sub={`${culturaKpi} · ${anoTxt} · clique no cabeçalho para ordenar, na linha para ver o talhão`}>
            <TabelaTalhoes linhas={linhas} colunas={colunas} ordemInicial="sc" desc aria="Produtividade por talhão" onClicar={id => p.setFiltro({ talhao: id })} />
            {semAnterior && <p className="text-[10.5px] mt-2" style={{ color: COR.mudo }}>Sem colheita de {(ano ?? 0) - 1} nesta cultura para comparar.</p>}
          </Cartao>
        )}

        <Cartao className={um ? 'md:col-span-3 xl:col-span-7' : 'md:col-span-6 xl:col-span-12'} icone={History} titulo={um ? 'Produtividade do talhão por safra' : 'Histórico por safra e cultura'}
          sub={`${um ? 'Média do mapa' : 'Média ponderada pela área colhida'} · ${u}`}
          extra={culturasHist.length > 1 ? <Seletor valor={culHist} onChange={setCulHistSel} opcoes={culturasHist.map(c => ({ valor: c, rotulo: c }))} rotulo="Cultura" /> : null}>
          {histCultura.length === 0 ? <Vazio compacto icone={History} titulo="Sem histórico de colheita" /> : (
            <div className={`grid grid-cols-1 ${um ? '' : 'lg:grid-cols-2'} gap-5 items-start`}>
              <BarrasAno itens={histCultura.slice(-8).map(h => ({ rotulo: String(h.ano), valor: deScHa(h.mediaScHa, u), destaque: h.ano === ano,
                titulo: `${h.ano} · ${h.cultura}: ${fmtScHa(h.mediaScHa, u)} · ${talhoesTxt(h.nTalhoes)} · ${fmtHaCurto(h.areaHa)} ha` }))} unidade={u} casas={casasU} />
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr style={{ color: COR.texto2 }}>
                    <th className="text-left font-semibold pb-1.5">Safra</th>
                    <th className="text-left font-semibold pb-1.5 pl-3">Cultura</th>
                    <th className="text-right font-semibold pb-1.5 pl-3">{u}</th>
                    <th className="text-right font-semibold pb-1.5 pl-3">Área (ha)</th>
                    <th className="text-right font-semibold pb-1.5 pl-3">Produção (t)</th>
                  </tr></thead>
                  <tbody>
                    {[...historico].sort((a, b) => b.ano - a.ano || b.areaHa - a.areaHa).slice(0, 12).map(h => (
                      <tr key={`${h.ano}-${h.cultura}`} style={{ borderTop: `1px solid ${COR.borda}`, background: h.ano === ano ? suave('var(--invicta-green)', 8) : undefined }}>
                        <td className="py-1.5 font-bold tabular-nums">{h.ano}</td>
                        <td className="py-1.5 pl-3">{h.cultura}</td>
                        <td className="py-1.5 pl-3 text-right tabular-nums font-bold">{fmtScHa(h.mediaScHa, u, false)}</td>
                        <td className="py-1.5 pl-3 text-right tabular-nums">{fmtHaCurto(h.areaHa)}</td>
                        <td className="py-1.5 pl-3 text-right tabular-nums">{fmtNum((h.producaoSc * 60) / 1000, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Cartao>
      </div>
    </div>
  );
}
