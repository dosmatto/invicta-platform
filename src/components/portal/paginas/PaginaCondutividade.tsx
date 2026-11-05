'use client';

// Portal do Produtor → Condutividade elétrica (/portal/condutividade).
//
// O que o produtor quer saber aqui: "meu solo é uniforme? onde ele é mais
// argiloso/úmido (CE alta) e onde é mais arenoso (CE baixa)?". A CE aparente do
// solo acompanha textura, umidade e CTC — por isso ela é a base das zonas de
// manejo. A página mostra a média e a faixa, quanto da área está em CE Baixa /
// Média / Alta, o mapa por profundidade e o quanto cada talhão varia por dentro.
//
// A área por classe é ESTIMADA pela proporção dos pontos medidos (a área do
// talhão se reparte na proporção dos pontos de cada classe) — respeita a
// variação dentro do talhão, que a média esconde. Contas em
// lib/portalPainelSensores (puro, testado). Estrutural: não depende da safra.

import { useCallback, useMemo, useState } from 'react';
import { Zap, Ruler, Layers, Grid3x3, Map as MapaIcone, Layers3, Activity, ListOrdered, Waves } from 'lucide-react';
import { legendaDesignada, PREF_LEGENDA } from '@/lib/legendaDesignada';
import { classeDoValor, corCheiaDaClasse } from '@/lib/legendas';
import type { DadosPainel } from '@/lib/portalPainel';
import {
  profundidadesCe, profundidadePadraoCe, ceNaProfundidade, distribuirPontosEmClasses, agruparEmTres, resumoCe, variacaoInterna, type CeProf,
} from '@/lib/portalPainelSensores';
import { usePortal } from '../PortalContext';
import { Cartao, Kpi, LegendaClasses, BarrasAno, Seletor, Vazio, MiniMapa, camadaCondutividade, COR, fmtNum, fmtInt, fmtHaCurto, suave, talhoesTxt } from '../ui';
import { BotaoAbrirTalhao, GradeKpis, FaixasValores, TabelaTalhoes, SeloCor, dataCurta, rotuloFaixa, type ColunaTabela } from './SensoresComuns';

const TOM_FAIXA = { Baixa: 'var(--status-info)', Média: 'var(--status-warning)', Alta: 'var(--status-processing)' } as const;

export function PaginaCondutividade() {
  const p = usePortal();
  const { dados } = p;
  const um = !!p.talhao;

  const profs = useMemo(() => profundidadesCe(dados), [dados]);
  const [profSel, setProfSel] = useState('');
  const padrao = useMemo(() => profundidadePadraoCe(dados), [dados]);
  const prof = profs.some(x => x.valor === profSel) ? profSel : (padrao ?? '');

  const itens = useMemo<CeProf[]>(() => (prof ? dados.map(d => ceNaProfundidade(d, prof)).filter((x): x is CeProf => !!x) : []), [dados, prof]);
  const itemPorId = useMemo(() => new Map(itens.map(i => [i.talhaoId, i])), [itens]);
  const leg = useMemo(() => legendaDesignada('condutividade', PREF_LEGENDA.condutividade), []);
  const unidade = leg?.unidade || 'mS/m';
  const classes = useMemo(() => leg?.classes ?? [], [leg]);
  const dist = useMemo(() => distribuirPontosEmClasses(itens, classes, dados.map(d => ({ id: d.talhao.id, areaHa: d.talhao.areaHa }))), [itens, classes, dados]);
  const tres = useMemo(() => agruparEmTres(dist.classes), [dist]);
  const resumo = useMemo(() => resumoCe(itens), [itens]);
  const porProf = useMemo(() => profs.map(x => ({ prof: x.valor, n: x.nTalhoes, r: resumoCe(dados.map(d => ceNaProfundidade(d, x.valor)).filter((c): c is CeProf => !!c)) })).filter(x => x.r), [profs, dados]);

  const talhoesMapa = useMemo(() => dados.map(d => ({ id: d.talhao.id, nome: d.talhao.nome, geojson: d.talhao.geojson })), [dados]);
  const realCe = useCallback((id: string) => {
    const it = itemPorId.get(id);
    return it?.levId ? camadaCondutividade(id, { id: it.levId, profundidadeOficial: it.profundidade, profundidades: [it.profundidade] }) : null;
  }, [itemPorId]);
  const clicar = useCallback((id: string) => (um ? p.abrirTalhao(id, 'condutividade') : p.setFiltro({ talhao: id })), [um, p]);

  if (!itens.length || !resumo) {
    return (
      <div className="space-y-4">
        {um && <div className="flex justify-end"><BotaoAbrirTalhao aba="condutividade" /></div>}
        <Vazio icone={Zap} titulo={um ? 'Este talhão ainda não tem condutividade elétrica' : 'Nenhum talhão no filtro tem condutividade elétrica'}
          texto="Quando o levantamento de CE do solo for processado, o mapa, as classes e a variação dentro do talhão aparecem aqui." />
      </div>
    );
  }

  const t0 = itens[0];
  const casas = classes.every(c => [c.valorMin, c.valorMax].every(v => v == null || Number.isInteger(v))) ? 0 : 1;
  const alta = tres?.find(x => x.rotulo === 'Alta');
  const comCe = itens.length;
  const kpis = [
    <Kpi key="media" icone={Zap} tom="ciano" rotulo={um ? 'CE média do talhão' : 'CE média'} valor={fmtNum(resumo.media, 1)} unidade={unidade}
      sub={`camada ${prof} cm · ${fmtInt(resumo.nPontos)} pontos`} />,
    <Kpi key="faixa" icone={Ruler} tom="azul" rotulo="Faixa medida" valor={`${fmtNum(resumo.min, 0)} – ${fmtNum(resumo.max, 0)}`} unidade={unidade}
      sub={um ? `variação interna de ${variacaoInterna(t0) ?? '—'}% da média` : `de ${resumo.menosCondutivo?.nome ?? '—'} a ${resumo.maisCondutivo.nome}`} />,
    um
      ? <Kpi key="levant" icone={Layers} tom="roxo" rotulo="Levantamento" valor={t0.data ? dataCurta(t0.data, true) : null} sub={`${fmtInt(t0.n)} pontos na camada ${prof} cm`} vazio="sem data no levantamento" />
      : <Kpi key="alta" icone={Waves} tom="roxo" rotulo="Área com CE alta" valor={alta ? fmtHaCurto(alta.ha) : null} unidade={alta ? `ha (${fmtNum(alta.pct, 0)}%)` : 'ha'}
          sub="mais argila, umidade e CTC" vazio="legenda sem classes suficientes" />,
    <Kpi key="talhoes" icone={Grid3x3} tom="verde" rotulo={um ? 'Camadas medidas' : 'Talhões levantados'} valor={um ? String(porProf.length) : String(comCe)} unidade={um ? (porProf.length === 1 ? 'profundidade' : 'profundidades') : `de ${dados.length}`}
      sub={um ? porProf.map(x => x.prof).join(' · ') : `${fmtHaCurto(itens.reduce((s, i) => s + i.areaHa, 0))} ha${dist.semDado.n ? ` · ${talhoesTxt(dist.semDado.n)} sem CE` : ''}`} />,
  ];

  const classeDaMedia = (v: number) => classeDoValor(v, classes);
  const colunas: Array<ColunaTabela<CeProf>> = [
    { id: 'nome', rotulo: 'Talhão', valor: r => r.nome },
    { id: 'area', rotulo: 'Área (ha)', align: 'right', soDesktop: true, valor: r => r.areaHa, render: r => fmtHaCurto(r.areaHa) },
    { id: 'media', rotulo: `Média (${unidade})`, align: 'right', valor: r => r.media, render: r => <strong className="text-sm">{fmtNum(r.media, 1)}</strong> },
    { id: 'faixa', rotulo: 'Mín – máx', align: 'right', soDesktop: true, valor: r => r.min, render: r => `${fmtNum(r.min, 0)} – ${fmtNum(r.max, 0)}` },
    { id: 'var', rotulo: 'Varia por dentro', align: 'right', titulo: '(máximo − mínimo) ÷ média: quanto o solo muda dentro do talhão', valor: r => variacaoInterna(r), render: r => { const v = variacaoInterna(r); return v != null ? `${v}%` : '—'; } },
    { id: 'classe', rotulo: 'Classe da média', soDesktop: true, valor: r => classeDaMedia(r.media)?.nome ?? null,
      render: r => { const c = classeDaMedia(r.media); return c ? <SeloCor cor={corCheiaDaClasse(c)} rotulo={c.nome} /> : '—'; } },
    { id: 'pontos', rotulo: 'Pontos', align: 'right', soDesktop: true, valor: r => r.n, render: r => fmtInt(r.n) },
    { id: 'data', rotulo: 'Levantamento', align: 'right', soDesktop: true, valor: r => r.data, render: r => dataCurta(r.data, true) },
  ];

  const faixas = [...itens].sort((a, b) => b.media - a.media).map(i => ({ id: i.talhaoId, rotulo: i.nome, min: i.min, max: i.max, marcador: i.media, cor: dist.corPorId[i.talhaoId] ? suave(dist.corPorId[i.talhaoId], 60) : undefined }));

  return (
    <div className="space-y-4">
      <GradeKpis>{kpis}</GradeKpis>

      <div className="grid grid-cols-1 md:grid-cols-6 xl:grid-cols-12 gap-4">
        <Cartao className="md:col-span-6 xl:col-span-8" icone={MapaIcone} titulo="Mapa de condutividade elétrica"
          sub={um ? `Camada ${prof} cm${t0.data ? ` · levantamento de ${dataCurta(t0.data, true)}` : ''}` : `Cor = classe da CE média de cada talhão · camada ${prof} cm`}
          extra={profs.length > 1 ? <Seletor valor={prof} onChange={setProfSel} opcoes={profs.map(x => ({ valor: x.valor, rotulo: `${x.valor} cm` }))} rotulo="Profundidade" /> : null}>
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_220px] gap-4 items-start">
            <MiniMapa talhoes={talhoesMapa} corDe={id => dist.corPorId[id] ?? null} altura={um ? 320 : 290} nomes={!um}
              rotulo={id => { const c = itemPorId.get(id); return c ? `${fmtNum(c.media, 1)} ${unidade}` : 'sem CE'; }}
              camadaReal={realCe} onClicar={clicar} aria="Mapa de condutividade elétrica" />
            <div className="space-y-3 min-w-0">
              {tres && (
                <div>
                  <p className="text-[11px] font-bold mb-1.5 uppercase tracking-wide" style={{ color: COR.texto2 }}>Área por faixa de CE</p>
                  <ul className="grid grid-cols-3 gap-1.5">
                    {[...tres].reverse().map(f => (
                      <li key={f.rotulo} className="rounded-xl px-2 py-1.5 text-center min-w-0" style={{ background: suave(TOM_FAIXA[f.rotulo], 11), border: `1px solid color-mix(in srgb, ${TOM_FAIXA[f.rotulo]} 28%, transparent)` }}
                        title={`${f.rotulo}: ${f.classes.join(' + ')}`}>
                        <p className="text-[10.5px] font-semibold" style={{ color: COR.texto2 }}>{f.rotulo}</p>
                        <p className="text-base font-extrabold tabular-nums leading-tight">{fmtNum(f.pct, 0)}%</p>
                        <p className="text-[10.5px] tabular-nums" style={{ color: COR.texto2 }}>{fmtHaCurto(f.ha)} ha</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {classes.length ? (
                <LegendaClasses compacta titulo="Classes de CE"
                  itens={[...dist.classes].reverse().map(c => ({ cor: c.cor, rotulo: c.nome, sub: rotuloFaixa(c, casas), pct: c.pct, ha: c.ha, apagado: c.pct === 0 }))}
                  rodape={`Em ${unidade}. Área estimada pela proporção dos pontos medidos em cada classe.`} />
              ) : <Vazio compacto titulo="Sem legenda de CE" texto="Cadastre a legenda de condutividade na Biblioteca." />}
            </div>
          </div>
          {leg?.observacao && <p className="text-[11px] mt-3 leading-snug" style={{ color: COR.texto2 }}>{leg.observacao}</p>}
        </Cartao>

        <Cartao className="md:col-span-6 xl:col-span-4" icone={Layers3} titulo="Por profundidade"
          sub={`CE média ${um ? 'do talhão' : 'ponderada pela área'} em cada camada`}>
          {porProf.length === 0 ? <Vazio compacto icone={Layers3} titulo="Sem camadas medidas" /> : (
            <>
              <BarrasAno itens={porProf.map(x => ({ rotulo: x.prof, valor: x.r!.media, destaque: x.prof === prof,
                titulo: `Camada ${x.prof} cm: ${fmtNum(x.r!.media, 1)} ${unidade} · ${talhoesTxt(x.n)}` }))} unidade={unidade} casas={1} />
              <p className="text-[10.5px] mt-1" style={{ color: COR.mudo }}>
                {porProf.length === 1 ? 'Só há uma camada medida.' : 'Cada barra é uma camada (cm); a destacada é a do mapa. Clique no seletor do mapa para trocar.'}
              </p>
            </>
          )}
        </Cartao>

        {!um && (
          <Cartao className="md:col-span-6 xl:col-span-7" icone={Activity} titulo="Faixa de CE em cada talhão" sub={`Do mínimo ao máximo medido · camada ${prof} cm · mais condutivo primeiro`}>
            <FaixasValores itens={faixas} unidade={unidade} casas={0} onClicar={id => p.setFiltro({ talhao: id })} />
          </Cartao>
        )}

        <Cartao className={um ? 'md:col-span-6 xl:col-span-12' : 'md:col-span-6 xl:col-span-5'} icone={ListOrdered}
          titulo={um ? 'Levantamento do talhão por camada' : 'Talhões'} sub={um ? 'Todas as profundidades medidas neste talhão' : `Camada ${prof} cm — clique para ver o talhão`}>
          {um ? (
            <TabelaTalhoes linhas={porCamadaDoTalhao(dados, profs.map(x => x.valor))} colunas={colunas.map(c => (c.id === 'nome' ? { ...c, rotulo: 'Camada' } : c))} ordemInicial="nome" aria="CE do talhão por camada"
              chaveDe={r => r.profundidade} />
          ) : (
            <TabelaTalhoes linhas={itens} colunas={colunas.filter(c => !['faixa', 'pontos', 'data', 'area'].includes(c.id))} ordemInicial="media" desc aria="CE por talhão" onClicar={id => p.setFiltro({ talhao: id })} />
          )}
        </Cartao>
      </div>
    </div>
  );
}

/** Para um talhão só: uma linha por camada medida (a coluna "Talhão" mostra a camada). */
function porCamadaDoTalhao(dados: DadosPainel[], profs: string[]): CeProf[] {
  const d = dados[0];
  if (!d) return [];
  return profs.map(pr => ceNaProfundidade(d, pr)).filter((c): c is CeProf => !!c).map(c => ({ ...c, nome: `${c.profundidade} cm` }));
}
