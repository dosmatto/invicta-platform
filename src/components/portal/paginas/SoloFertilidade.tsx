'use client';

// Portal do Produtor → Fertilidade do solo (/portal/fertilidade).
//
// A pergunta do produtor: ONDE o solo está fraco, QUANTA área é, o que mudou
// desde a análise anterior. A página responde para UM atributo por vez (P, K,
// V%, pH, MO, Ca, Mg): mapa pela última análise de cada talhão, classes da
// legenda da Biblioteca com % e ha, área abaixo do nível crítico (régua do
// ledger Q12: "Muito baixo" + "Baixo"), média ponderada de todos os atributos
// contra a referência, ranking de talhões (pior primeiro) e a evolução por
// safra. Com UM talhão vira o detalhe dele: as AMOSTRAS nas classes, mín/máx e
// o histórico ano a ano.
//
// Toda conta é de lib/portalPainelSolo (puro, testado). Sem dado → Vazio.

import { useCallback, useMemo, useState } from 'react';
import { FlaskConical, Activity, AlertTriangle, CalendarClock, Map as MapaIcone, TrendingUp, ListChecks, ClipboardList } from 'lucide-react';
import { rotuloAno } from '@/lib/periodo';
import { classeDoValor, corCheiaDaClasse } from '@/lib/legendas';
import { classesCriticas, ultimoLaudo } from '@/lib/portalPainel';
import {
  ATRIBUTOS_SOLO, resumoAtributo, evolucaoPonderada, pontosAteAno, amostrasDoLaudo, distribuirAmostras,
  type ResumoAtributo, type LinhaFert,
} from '@/lib/portalPainelSolo';
import { usePortal } from '../PortalContext';
import {
  Cartao, Kpi, LegendaClasses, BarrasAno, Alerta, Vazio, MiniMapa, camadaFertilidade,
  COR, fmtNum, fmtHaCurto, fmtPct, talhoesTxt, plural,
} from '../ui';
import { Abas, PilulaClasse, TabelaTalhoes, NomeTalhao, acaoAbrirTalhao, faixaTxt, unidadeDoAtributo, useLegendasSolo } from './SoloPecas';

const haPct = (ha: number, pct: number) => `${fmtHaCurto(ha)} ha (${fmtPct(pct)})`;
const lista = (nomes: string[], max = 5) => (nomes.length <= max ? nomes.join(', ') : `${nomes.slice(0, max).join(', ')} e mais ${nomes.length - max}`);

/** Fora do plano ('fertilidade'), a rota é barrada pela GuardaPlano do shell. */
export function PaginaFertilidade() {
  return <Conteudo />;
}

function Conteudo() {
  const p = usePortal();
  const { dados, ano } = p;
  const um = !!p.talhao;
  const anoTxt = rotuloAno(p.safra);
  const legs = useLegendasSolo();
  const [at, setAt] = useState<string>('p');
  const def = ATRIBUTOS_SOLO.find(a => a.id === at) ?? ATRIBUTOS_SOLO[0];
  const leg = legs.porAt[at];
  const classes = useMemo(() => leg?.classes ?? [], [leg]);
  const unid = unidadeDoAtributo(leg, at);

  // Todos os atributos de uma vez: alimentam a tabela de "atributos" e os alertas.
  const resumos = useMemo(() => {
    const out: Record<string, ResumoAtributo> = {};
    for (const a of ATRIBUTOS_SOLO) { const l = legs.porAt[a.id]; out[a.id] = resumoAtributo(dados, ano, a.id, l?.classes ?? [], l?.invertida); }
    return out;
  }, [dados, ano, legs]);
  const r = resumos[at];
  const dado = um ? dados[0] : null;

  // Visão de UM talhão: as amostras do laudo nas classes da legenda.
  const amostras = useMemo(() => (dado ? distribuirAmostras(amostrasDoLaudo(ultimoLaudo(dado.laudos, ano), at), classes) : null), [dado, ano, at, classes]);
  const critSet = useMemo(() => classesCriticas(classes, leg?.invertida), [classes, leg]);
  const pctAmostrasCriticas = amostras && critSet ? amostras.classes.filter(c => critSet.has(c.nome)).reduce((s, c) => s + c.pct, 0) : null;

  const evol = useMemo(() => evolucaoPonderada(dados, at, ano).slice(-6), [dados, at, ano]);
  const historicoUm = useMemo(() => (dado ? pontosAteAno(dado, at, ano) : []), [dado, at, ano]);
  const prof = useMemo(() => {
    const c = new Map<string, number>();
    for (const l of r.linhas) if (l.profundidade && l.valor != null) c.set(l.profundidade, (c.get(l.profundidade) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [r]);

  // Ranking: pior primeiro (menor valor), sem análise no fim.
  const ranking = useMemo(() => [...r.linhas].sort((a, b) => (a.valor ?? Infinity) - (b.valor ?? Infinity) || a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true })), [r]);

  // ── Mini-mapa ──
  const talhoesMapa = useMemo(() => dados.map(d => ({ id: d.talhao.id, nome: d.talhao.nome, geojson: d.talhao.geojson })), [dados]);
  const porId = useMemo(() => new Map(dados.map(d => [d.talhao.id, d])), [dados]);
  const valorDe = useMemo(() => new Map(r.linhas.map(l => [l.talhaoId, l])), [r]);
  const clicar = useCallback((id: string) => (um ? p.abrirTalhao(id, 'fertilidade') : p.setFiltro({ talhao: id })), [um, p]);
  const real = useCallback((id: string) => { const d = porId.get(id); return d ? camadaFertilidade(id, ultimoLaudo(d.laudos, ano), at, d.mapasNuvem) : null; }, [porId, ano, at]);

  const semAnalise = r.nComValor === 0;
  const kpiSub = (l: ResumoAtributo) => (l.anos ? `análises de ${l.anos[0] === l.anos[1] ? l.anos[0] : `${l.anos[0]}–${l.anos[1]}`}` : '');
  const linhaUm: LinhaFert | undefined = dado ? r.linhas[0] : undefined;

  // ── KPIs ──
  const kpis = um ? [
    <Kpi key="a" icone={CalendarClock} tom="azul" rotulo="Última análise" valor={linhaUm?.anoAnalise != null && linhaUm.valor != null ? String(linhaUm.anoAnalise) : null}
      sub={linhaUm ? `camada ${linhaUm.profundidade ?? '—'} cm · ${plural(linhaUm.nAmostras, 'amostra', 'amostras')}${linhaUm.antiga ? ' · análise antiga' : ''}` : undefined}
      vazio={`sem análise de solo até ${anoTxt}`} />,
    <Kpi key="b" icone={Activity} tom="verde" rotulo={`${def.rotulo} do talhão`} valor={r.media != null ? fmtNum(r.media, def.casas) : null} unidade={unid}
      sub={r.classeMedia ? <PilulaClasse nome={r.classeMedia.nome} cor={r.classeMedia.cor} /> : leg ? undefined : `sem legenda de ${def.rotulo} na Biblioteca`} vazio="sem valor" />,
    <Kpi key="c" icone={AlertTriangle} tom={pctAmostrasCriticas ? 'ambar' : 'verde'} rotulo="Amostras abaixo do crítico"
      valor={pctAmostrasCriticas != null && amostras && amostras.n > 0 ? fmtNum(pctAmostrasCriticas, 0) : null} unidade="%"
      sub={amostras ? `${amostras.n} amostras do laudo` : undefined} vazio={critSet ? 'sem amostras' : 'sem régua de classes na Biblioteca'} />,
    <Kpi key="d" icone={TrendingUp} tom="roxo" rotulo="Análise anterior" valor={linhaUm?.anterior ? fmtNum(linhaUm.anterior.valor, def.casas) : null} unidade={unid}
      delta={linhaUm?.anterior && linhaUm.anterior.valor ? { valor: Math.round((linhaUm.anterior.delta / linhaUm.anterior.valor) * 1000) / 10, rotulo: `desde ${linhaUm.anterior.ano}` } : null}
      vazio="só há uma análise deste talhão" />,
  ] : [
    <Kpi key="a" icone={CalendarClock} tom="azul" rotulo="Talhões com análise" valor={r.nComValor ? fmtHaCurto(r.areaComValor) : null} unidade="ha"
      sub={`${talhoesTxt(r.nComValor)} de ${dados.length}${kpiSub(r) ? ` · ${kpiSub(r)}` : ''}`} vazio={`sem análise de solo até ${anoTxt}`} />,
    <Kpi key="b" icone={Activity} tom="verde" rotulo={`${def.rotulo} · média ponderada`} valor={r.media != null ? fmtNum(r.media, def.casas) : null} unidade={unid}
      delta={r.deltaMedia?.pct != null ? { valor: r.deltaMedia.pct, rotulo: 'vs. análise anterior' } : null}
      sub={r.classeMedia ? <PilulaClasse nome={r.classeMedia.nome} cor={r.classeMedia.cor} /> : leg ? undefined : `sem legenda de ${def.rotulo} na Biblioteca`} vazio="sem valor" />,
    <Kpi key="c" icone={AlertTriangle} tom={r.areaCritica > 0 ? 'ambar' : 'verde'} rotulo={`${def.rotulo} abaixo do crítico`} valor={r.limite != null && r.nComValor ? fmtHaCurto(r.areaCritica) : null} unidade="ha"
      sub={`${fmtPct(r.pctCritica)} da área · ${talhoesTxt(r.nCriticos)}`} vazio={r.nComValor ? 'sem régua de classes na Biblioteca' : `sem análise de solo até ${anoTxt}`} />,
    <Kpi key="d" icone={ClipboardList} tom="roxo" rotulo="Sem análise recente" valor={dados.length ? fmtHaCurto(r.areaAntigos) : null} unidade="ha"
      sub={r.nAntigos ? `${talhoesTxt(r.nAntigos)} · 3 anos ou mais` : 'todos os talhões com análise recente'} vazio="sem talhões no filtro" />,
  ];

  // ── Onde agir (todos os atributos) ──
  const alertas = useMemo(() => {
    const out: Array<{ id: string; tipo: 'critico' | 'atencao' | 'ok' | 'info'; destaque: string; texto: string }> = [];
    const comRegua = ATRIBUTOS_SOLO.filter(a => resumos[a.id].nComValor > 0 && resumos[a.id].limite != null);
    for (const a of [...comRegua].sort((x, y) => resumos[y.id].areaCritica - resumos[x.id].areaCritica)) {
      const x = resumos[a.id];
      if (x.nCriticos === 0) continue;
      const nomes = x.linhas.filter(l => l.critico).map(l => l.nome);
      out.push(um
        ? { id: `c-${a.id}`, tipo: a.id === 'p' ? 'critico' : 'atencao', destaque: a.rotulo, texto: `está abaixo do nível crítico neste talhão (${fmtNum(x.media, a.casas)} · ${x.classeMedia?.nome ?? ''})` }
        : { id: `c-${a.id}`, tipo: a.id === 'p' ? 'critico' : 'atencao', destaque: haPct(x.areaCritica, x.pctCritica), texto: `com ${a.rotulo} abaixo do nível crítico — ${lista(nomes)}` });
    }
    if (comRegua.length && !out.length) out.push({ id: 'ok', tipo: 'ok', destaque: um ? 'Este talhão' : 'Nenhum talhão', texto: um ? 'está fora do nível crítico em todos os atributos com análise' : 'abaixo do nível crítico em nenhum atributo com análise' });
    if (r.nAntigos > 0) {
      const nomes = r.linhas.filter(l => l.antiga).map(l => l.nome);
      out.push({ id: 'antiga', tipo: 'atencao', destaque: um ? 'Análise antiga' : haPct(r.areaAntigos, r.areaTotal ? (r.areaAntigos / r.areaTotal) * 100 : 0), texto: um ? 'faz 3 anos ou mais (ou nunca houve) — vale uma nova amostragem' : `sem análise de solo nos últimos 3 anos — ${lista(nomes)}` });
    }
    return out;
  }, [resumos, r, um]);

  const casas = def.casas;
  const maisRaso = prof ? ` · camada ${prof} cm` : '';

  return (
    <div className="space-y-4">
      <Abas valor={at} onChange={setAt} rotulo="Atributo do solo" opcoes={ATRIBUTOS_SOLO.map(a => ({ valor: a.id, rotulo: a.rotulo, desabilitada: resumos[a.id].nComValor === 0 && at !== a.id }))} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">{kpis.map((k, i) => <div key={i} className="min-w-0 grid">{k}</div>)}</div>

      <div className="grid grid-cols-1 md:grid-cols-6 xl:grid-cols-12 gap-4">
        {/* Mapa + classes */}
        <Cartao className="md:col-span-6 xl:col-span-7" icone={MapaIcone} titulo={`Mapa de ${def.rotulo}`}
          sub={semAnalise ? 'Última análise de solo' : um ? `Análise de ${linhaUm?.anoAnalise ?? '—'}${maisRaso}` : `Última análise de cada talhão${r.anos ? ` (${r.anos[0] === r.anos[1] ? r.anos[0] : `${r.anos[0]}–${r.anos[1]}`})` : ''}${maisRaso}`}
          acao={um ? acaoAbrirTalhao(p, 'fertilidade') : null}>
          {semAnalise ? (
            <Vazio icone={FlaskConical} titulo={`Sem análise de solo até ${anoTxt}`} texto={um ? 'Este talhão ainda não tem laudo de laboratório importado.' : 'Quando o laudo do laboratório for importado, o mapa e as classes aparecem aqui.'} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_230px] gap-4 items-start">
              <MiniMapa talhoes={talhoesMapa} corDe={id => r.dist.corPorId[id] ?? null} altura={um ? 300 : 280} nomes={!um}
                rotulo={id => { const l = valorDe.get(id); return l?.valor != null ? `${def.rotulo} ${fmtNum(l.valor, casas)}${unid ? ` ${unid}` : ''} · ${l.classe ?? ''}` : 'sem análise'; }}
                camadaReal={real} onClicar={clicar} aria={`Mapa de ${def.rotulo}`} />
              {classes.length === 0 ? (
                <Vazio compacto titulo={`Sem legenda de ${def.rotulo}`} texto="A Biblioteca não tem legenda cadastrada para este atributo." />
              ) : um && amostras ? (
                <LegendaClasses titulo={`${def.rotulo}${unid ? ` (${unid})` : ''}`}
                  itens={classes.map((c, i) => ({ cor: amostras.classes[i].cor, rotulo: `${c.nome} ${faixaTxt(c, casas)}`, pct: amostras.classes[i].pct, ha: null, apagado: amostras.classes[i].n === 0 }))}
                  rodape={`% das ${amostras.n} amostras do laudo · mín ${fmtNum(amostras.min, casas)} · média ${fmtNum(amostras.media, casas)} · máx ${fmtNum(amostras.max, casas)}.`} />
              ) : (
                <LegendaClasses titulo={`${def.rotulo}${unid ? ` (${unid})` : ''}`}
                  itens={r.dist.classes.map(c => ({ cor: c.cor, rotulo: `${c.nome} ${faixaTxt(c, casas)}`, pct: c.pct, ha: c.ha, apagado: c.n === 0 }))}
                  rodape={`Cor = classe da média de cada talhão (legenda ${leg?.nome ?? '—'}).${r.dist.semDado.n ? ` ${talhoesTxt(r.dist.semDado.n)} (${fmtHaCurto(r.dist.semDado.ha)} ha) sem análise.` : ''}`} />
              )}
            </div>
          )}
        </Cartao>

        {/* Todos os atributos vs. referência */}
        <Cartao className="md:col-span-6 xl:col-span-5" icone={ListChecks} titulo="Atributos da análise" sub={um ? 'Valor do talhão × referência' : 'Média ponderada pela área × referência'}
          rodape="Referência = acima do nível crítico, na legenda da Biblioteca (fora de “Muito baixo” e “Baixo”).">
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-xs" style={{ minWidth: 380 }}>
              <thead><tr style={{ color: COR.texto2 }}>
                <th className="text-left font-semibold pb-1.5">Atributo</th>
                <th className="text-right font-semibold pb-1.5 px-1.5">Valor</th>
                <th className="text-left font-semibold pb-1.5 px-1.5">Classe</th>
                <th className="text-right font-semibold pb-1.5 px-1.5">Referência</th>
                <th className="text-right font-semibold pb-1.5">Situação</th>
              </tr></thead>
              <tbody>
                {ATRIBUTOS_SOLO.map(a => {
                  const x = resumos[a.id];
                  const sel = a.id === at;
                  const abaixo = x.media != null && x.limite != null ? x.media <= x.limite : null;
                  return (
                    <tr key={a.id} onClick={() => setAt(a.id)} className="cursor-pointer hover:bg-[var(--bg-surface-hover)]"
                      style={{ borderTop: `1px solid ${COR.borda}`, background: sel ? 'color-mix(in srgb, var(--invicta-green) 9%, transparent)' : undefined }}>
                      <td className="py-1.5 font-bold whitespace-nowrap">{a.rotulo}<span className="font-normal ml-1 hidden 2xl:inline" style={{ color: COR.mudo }}>{unidadeDoAtributo(legs.porAt[a.id], a.id) && a.id !== 'v' ? unidadeDoAtributo(legs.porAt[a.id], a.id) : ''}</span></td>
                      <td className="py-1.5 px-1.5 text-right tabular-nums font-extrabold">{x.media != null ? fmtNum(x.media, a.casas) : <span style={{ color: COR.mudo }}>—</span>}</td>
                      <td className="py-1.5 px-1.5"><PilulaClasse nome={x.classeMedia?.nome ?? null} cor={x.classeMedia?.cor ?? null} vazio={x.media != null ? 'sem legenda' : '—'} /></td>
                      <td className="py-1.5 px-1.5 text-right tabular-nums whitespace-nowrap" style={{ color: COR.texto2 }}>{x.limite != null ? `> ${fmtNum(x.limite, a.casas)}` : '—'}</td>
                      <td className="py-1.5 text-right whitespace-nowrap font-bold" style={{ color: abaixo == null ? COR.mudo : abaixo ? COR.vermelho : 'var(--p-verde-texto)' }}>
                        {abaixo == null ? '—' : abaixo ? '▼ abaixo' : '✓ ok'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Cartao>

        {/* Ranking por talhão / histórico do talhão */}
        <Cartao className="md:col-span-6 xl:col-span-7" icone={ListChecks}
          titulo={um ? `Análises de ${def.rotulo} neste talhão` : `${def.rotulo} por talhão`}
          sub={um ? 'Ano a ano, na camada mais rasa' : 'Do mais baixo para o mais alto — clique para abrir o painel do talhão'}>
          {um ? (
            historicoUm.length === 0 ? <Vazio compacto icone={FlaskConical} titulo={`Sem análise de ${def.rotulo}`} /> : (
              <TabelaTalhoes aria={`Análises de ${def.rotulo}`} minLargura={360}
                linhas={[...historicoUm].reverse().map((h, i, arr) => {
                  const c = classeDoValor(h.valor, classes);
                  const ant = arr[i + 1];
                  return { talhaoId: String(h.ano), ano: h.ano, valor: h.valor, classe: c?.nome ?? null, cor: c ? corCheiaDaClasse(c) : null, delta: ant ? Math.round((h.valor - ant.valor) * 100) / 100 : null };
                })}
                colunas={[
                  { id: 'ano', titulo: 'Ano', render: l => <strong className="tabular-nums">{l.ano}</strong> },
                  { id: 'v', titulo: `${def.rotulo}${unid ? ` (${unid})` : ''}`, alinhar: 'right', render: l => <strong className="tabular-nums">{fmtNum(l.valor, casas)}</strong> },
                  { id: 'c', titulo: 'Classe', render: l => <PilulaClasse nome={l.classe} cor={l.cor} vazio="sem legenda" /> },
                  { id: 'd', titulo: 'Variação', alinhar: 'right', render: l => (l.delta == null ? <span style={{ color: COR.mudo }}>primeira análise</span> : <span className="tabular-nums font-bold">{l.delta > 0 ? '▲ +' : l.delta < 0 ? '▼ ' : '= '}{fmtNum(l.delta, casas)}</span>) },
                ]} />
            )
          ) : ranking.length === 0 ? <Vazio compacto titulo="Nenhum talhão no filtro" /> : (
            <TabelaTalhoes aria={`${def.rotulo} por talhão`} onClicar={clicar} linhas={ranking}
              colunas={[
                { id: 'n', titulo: 'Talhão', render: l => <NomeTalhao nome={l.nome} /> },
                { id: 'a', titulo: 'Área (ha)', alinhar: 'right', render: l => <span className="tabular-nums" style={{ color: COR.texto2 }}>{fmtHaCurto(l.areaHa)}</span> },
                { id: 'v', titulo: `${def.rotulo}${unid ? ` (${unid})` : ''}`, alinhar: 'right', render: l => (l.valor != null ? <strong className="tabular-nums">{fmtNum(l.valor, casas)}</strong> : <span style={{ color: COR.mudo }}>—</span>) },
                { id: 'c', titulo: 'Classe', render: l => <PilulaClasse nome={l.classe} cor={l.cor} vazio={l.valor != null ? 'sem legenda' : 'sem análise'} /> },
                { id: 'an', titulo: 'Análise', alinhar: 'center', render: l => (l.anoAnalise != null && l.valor != null
                  ? <span className="tabular-nums" style={{ color: l.antiga ? COR.ambar : COR.texto2 }} title={l.antiga ? 'Análise antiga (3 anos ou mais)' : undefined}>{l.anoAnalise}{l.antiga ? ' ⚠' : ''}</span>
                  : <span style={{ color: COR.mudo }}>—</span>) },
                { id: 'd', titulo: 'Δ vs. anterior', alinhar: 'right', sohDesktop: true, render: l => (l.anterior
                  ? <span className="tabular-nums font-bold" title={`${l.anterior.ano}: ${fmtNum(l.anterior.valor, casas)}`}>{l.anterior.delta > 0 ? '▲ +' : l.anterior.delta < 0 ? '▼ ' : '= '}{fmtNum(l.anterior.delta, casas)}</span>
                  : <span style={{ color: COR.mudo }}>—</span>) },
              ]} />
          )}
        </Cartao>

        {/* Evolução por safra + onde agir */}
        <div className="md:col-span-6 xl:col-span-5 flex flex-col gap-4 min-w-0">
          <Cartao icone={TrendingUp} titulo={`Evolução de ${def.rotulo}`} sub={`${unid || def.rotulo} · ${um ? 'valor do talhão' : 'média ponderada'} por ano de análise`}>
            {evol.length === 0 ? <Vazio compacto icone={FlaskConical} titulo="Sem análise de solo" /> : (
              <>
                <BarrasAno itens={evol.map(e => ({ rotulo: String(e.ano), valor: e.valor, titulo: `${e.ano}: ${fmtNum(e.valor, casas)}${unid ? ` ${unid}` : ''} · ${talhoesTxt(e.nTalhoes)}` }))} unidade={unid || def.rotulo} casas={casas} />
                {evol.length === 1 && <p className="text-[10.5px] mt-1" style={{ color: COR.mudo }}>Com a próxima análise, a tendência aparece.</p>}
              </>
            )}
          </Cartao>
          <Cartao icone={AlertTriangle} titulo="Onde agir" sub={um ? 'O que a análise deste talhão pede' : 'Áreas que pedem atenção, de todos os atributos'}>
            {alertas.length === 0 ? <Vazio compacto icone={FlaskConical} titulo="Nada a destacar" texto={semAnalise ? `Sem análise de solo até ${anoTxt}.` : 'Sem legenda cadastrada para avaliar o nível crítico.'} /> : (
              <ul className="space-y-1.5">{alertas.map(a => <Alerta key={a.id} tipo={a.tipo} destaque={a.destaque}>{a.texto}</Alerta>)}</ul>
            )}
          </Cartao>
        </div>
      </div>
    </div>
  );
}
