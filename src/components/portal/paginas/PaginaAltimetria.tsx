'use client';

// Portal do Produtor → Altimetria / Relevo (/portal/altimetria).
//
// O que o produtor quer saber aqui: "meu terreno é plano ou inclinado? onde
// empoça, onde escorre, onde o risco de erosão é maior?". A página mostra a
// faixa de altitude, o desnível (amplitude) e a declividade — média e máxima —
// do modelo digital de elevação aprovado de cada talhão, com o mapa (leve: cor
// pela altitude média; real: o raster de elevação ou o sombreado do relevo).
//
// Declividade em GRAUS (como na aba Altimetria do talhão); ao lado vai o % —
// a unidade em que se fala de declive no campo — e a classe de relevo da
// Embrapa. Estrutural: não depende da safra. Contas em lib/portalPainelSensores.

import { useCallback, useMemo } from 'react';
import { Mountain, ArrowUpDown, TrendingDown, Gauge, Map as MapaIcone, Activity, ListOrdered, Ruler } from 'lucide-react';
import { coresRelativas } from '@/lib/portalPainel';
import { relevoDetalhe, resumoRelevoDetalhe, grausParaPct, classeRelevo, type RelevoDetalhe } from '@/lib/portalPainelSensores';
import { usePortal } from '../PortalContext';
import { Cartao, Kpi, LegendaClasses, Vazio, MiniMapa, camadaRelevo, COR, RAMPA_RELEVO, fmtNum, fmtHaCurto, talhoesTxt } from '../ui';
import { BotaoAbrirTalhao, GradeKpis, FaixasValores, TabelaTalhoes, type ColunaTabela } from './SensoresComuns';

/** Declividade com a conversão para %: "3,5° (≈ 6,1%)". */
const declTxt = (g: number | null, casas = 1) => (g == null ? '—' : `${fmtNum(g, casas)}° (≈ ${fmtNum(grausParaPct(g), 1)}%)`);

export function PaginaAltimetria() {
  const p = usePortal();
  const { dados } = p;
  const um = !!p.talhao;

  const relevos = useMemo(() => dados.map(relevoDetalhe).filter((r): r is RelevoDetalhe => !!r), [dados]);
  const porId = useMemo(() => new Map(relevos.map(r => [r.talhaoId, r])), [relevos]);
  const resumo = useMemo(() => resumoRelevoDetalhe(relevos), [relevos]);
  const cores = useMemo(() => coresRelativas(relevos.map(r => ({ id: r.talhaoId, valor: r.altMed })), RAMPA_RELEVO), [relevos]);

  const talhoesMapa = useMemo(() => dados.map(d => ({ id: d.talhao.id, nome: d.talhao.nome, geojson: d.talhao.geojson })), [dados]);
  const realRelevo = useCallback((id: string) => {
    const r = porId.get(id);
    return r?.mdeId ? camadaRelevo(id, { id: r.mdeId, stats: { alt_min: r.altMin, alt_max: r.altMax } }) : null;
  }, [porId]);
  const clicar = useCallback((id: string) => (um ? p.abrirTalhao(id, 'altimetria') : p.setFiltro({ talhao: id })), [um, p]);

  if (!relevos.length || !resumo) {
    return (
      <div className="space-y-4">
        {um && <div className="flex justify-end"><BotaoAbrirTalhao aba="altimetria" /></div>}
        <Vazio icone={Mountain} titulo={um ? 'Este talhão ainda não tem altimetria aprovada' : 'Nenhum talhão no filtro tem altimetria aprovada'}
          texto="Quando o modelo digital de elevação do talhão for aprovado, a altitude, a declividade e o mapa de relevo aparecem aqui." />
      </div>
    );
  }

  const r0 = relevos[0];
  const declMedia = um ? r0.declMedia : resumo.declMedia;
  const declMax = um ? r0.declMax : resumo.declMax;
  const classe = classeRelevo(declMedia != null ? grausParaPct(declMedia) : null);
  const kpis = [
    <Kpi key="alt" icone={Mountain} tom="verde" rotulo="Altitude" valor={`${fmtNum(resumo.altMin, 0)}–${fmtNum(resumo.altMax, 0)}`} unidade="m"
      sub={um ? `média ${fmtNum(r0.altMed, 0)} m` : `${talhoesTxt(resumo.nTalhoes)} com modelo de elevação`} />,
    <Kpi key="amp" icone={ArrowUpDown} tom="azul" rotulo="Amplitude (desnível)" valor={fmtNum(um ? r0.amplitude : resumo.amplitude, 0)} unidade="m"
      sub={um ? 'do ponto mais baixo ao mais alto do talhão' : `maior desnível num talhão só: ${fmtNum(resumo.amplitudeMaxTalhao.valor, 0)} m (${resumo.amplitudeMaxTalhao.nome})`} />,
    <Kpi key="decl" icone={TrendingDown} tom="ambar" rotulo="Declividade média" valor={declMedia != null ? fmtNum(declMedia, 1) : null} unidade="°"
      sub={declMedia != null ? `≈ ${fmtNum(grausParaPct(declMedia), 1)}%${classe ? ` · relevo ${classe.rotulo.toLowerCase()}` : ''}` : undefined} vazio="o modelo não trouxe declividade" />,
    <Kpi key="max" icone={Gauge} tom="roxo" rotulo="Declividade máxima" valor={declMax != null ? fmtNum(declMax, 1) : null} unidade="°"
      sub={declMax != null ? `≈ ${fmtNum(grausParaPct(declMax), 1)}%${!um && resumo.maisInclinado ? ` · média mais alta: ${resumo.maisInclinado.nome}` : ''}` : undefined} vazio="o modelo não trouxe declividade" />,
  ];

  // Legenda da rampa: leve = altitude MÉDIA entre talhões; um talhão = mín → máx dele.
  const lo = um ? r0.altMin : cores.min, hi = um ? r0.altMax : cores.max;
  const legendaItens = RAMPA_RELEVO.map((cor, i) => ({ cor, rotulo: lo != null && hi != null ? `${fmtNum(lo + ((hi - lo) * i) / (RAMPA_RELEVO.length - 1), 0)} m` : '—' })).reverse();

  const colunas: Array<ColunaTabela<RelevoDetalhe>> = [
    { id: 'nome', rotulo: 'Talhão', valor: r => r.nome },
    { id: 'area', rotulo: 'Área (ha)', align: 'right', soDesktop: true, valor: r => r.areaHa, render: r => fmtHaCurto(r.areaHa) },
    { id: 'min', rotulo: 'Mín (m)', align: 'right', soDesktop: true, valor: r => r.altMin, render: r => fmtNum(r.altMin, 0) },
    { id: 'med', rotulo: 'Média (m)', align: 'right', valor: r => r.altMed, render: r => <strong>{fmtNum(r.altMed, 0)}</strong> },
    { id: 'max', rotulo: 'Máx (m)', align: 'right', soDesktop: true, valor: r => r.altMax, render: r => fmtNum(r.altMax, 0) },
    { id: 'amp', rotulo: 'Desnível (m)', align: 'right', valor: r => r.amplitude, render: r => fmtNum(r.amplitude, 0) },
    { id: 'decl', rotulo: 'Decl. média', align: 'right', valor: r => r.declMedia, titulo: 'Declividade média em graus (≈ %)', render: r => declTxt(r.declMedia) },
    { id: 'dmax', rotulo: 'Decl. máx (°)', align: 'right', soDesktop: true, valor: r => r.declMax, render: r => (r.declMax != null ? fmtNum(r.declMax, 1) : '—') },
    { id: 'relevo', rotulo: 'Relevo', soDesktop: true, titulo: 'Classe da Embrapa pela declividade média', valor: r => (r.declMedia != null ? classeRelevo(grausParaPct(r.declMedia))?.ordem ?? null : null),
      render: r => (r.declMedia != null ? classeRelevo(grausParaPct(r.declMedia))?.rotulo ?? '—' : '—') },
  ];

  const faixas = [...relevos].sort((a, b) => b.altMed - a.altMed).map(r => ({ id: r.talhaoId, rotulo: r.nome, min: r.altMin, max: r.altMax, marcador: r.altMed, cor: cores.corPorId[r.talhaoId] }));
  const detalhes: Array<[string, string]> = [
    ['Altitude mínima', `${fmtNum(r0.altMin, 0)} m`],
    ['Altitude média', `${fmtNum(r0.altMed, 0)} m`],
    ['Altitude máxima', `${fmtNum(r0.altMax, 0)} m`],
    ['Desnível', `${fmtNum(r0.amplitude, 0)} m`],
    ['Declividade média', declTxt(r0.declMedia)],
    ['Declividade máxima', declTxt(r0.declMax)],
    ['Classe de relevo', classe?.rotulo ?? '—'],
    ['Fonte do modelo', `${r0.fonte || '—'}${r0.resolucaoM ? ` · ${fmtNum(r0.resolucaoM, 0)} m` : ''}`],
  ];

  return (
    <div className="space-y-4">
      <GradeKpis>{kpis}</GradeKpis>

      <div className="grid grid-cols-1 md:grid-cols-6 xl:grid-cols-12 gap-4">
        <Cartao className="md:col-span-6 xl:col-span-7" icone={MapaIcone} titulo="Mapa de relevo"
          sub={um ? 'Elevação do talhão (do ponto mais baixo ao mais alto)' : 'Cor = altitude média de cada talhão · verde baixo, marrom alto'}>
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_170px] gap-4 items-start">
            <MiniMapa talhoes={talhoesMapa} corDe={id => cores.corPorId[id] ?? null} altura={um ? 320 : 280} nomes={!um}
              rotulo={id => { const r = porId.get(id); return r ? `${fmtNum(r.altMed, 0)} m (média) · desnível ${fmtNum(r.amplitude, 0)} m` : 'sem relevo'; }}
              camadaReal={realRelevo} onClicar={clicar} aria="Mapa de relevo" />
            <LegendaClasses titulo={um ? 'Altitude (m)' : 'Altitude média (m)'} itens={legendaItens}
              rodape={um ? 'Rampa do mínimo ao máximo do talhão.' : 'Mapas reais: cada talhão usa a própria escala (do mínimo ao máximo dele).'} />
          </div>
        </Cartao>

        {um ? (
          <Cartao className="md:col-span-6 xl:col-span-5" icone={Ruler} titulo="Números do relevo" sub="Modelo digital de elevação aprovado do talhão">
            <dl className="grid grid-cols-2 gap-2">
              {detalhes.map(([rot, v]) => (
                <div key={rot} className="rounded-xl px-3 py-2 min-w-0" style={{ background: COR.superficie2 }}>
                  <dt className="text-[10.5px] font-semibold" style={{ color: COR.texto2 }}>{rot}</dt>
                  <dd className="text-sm font-extrabold tabular-nums mt-0.5 break-words">{v}</dd>
                </div>
              ))}
            </dl>
          </Cartao>
        ) : (
          <Cartao className="md:col-span-6 xl:col-span-5" icone={Activity} titulo="Faixa de altitude por talhão" sub="Do ponto mais baixo ao mais alto · o mais alto primeiro">
            <FaixasValores itens={faixas} unidade="m" casas={0} marcadorRotulo="altitude média" onClicar={id => p.setFiltro({ talhao: id })} />
          </Cartao>
        )}

        {!um && (
          <Cartao className="md:col-span-6 xl:col-span-12" icone={ListOrdered} titulo="Relevo de cada talhão" sub="Clique no cabeçalho para ordenar, na linha para ver o talhão"
            rodape="Declividade em graus; o % ao lado é a tangente × 100. Classe de relevo da Embrapa pela declividade média: plano até 3%, suave ondulado até 8%, ondulado até 20%, forte ondulado até 45%.">
            <TabelaTalhoes linhas={relevos} colunas={colunas} ordemInicial="decl" desc aria="Relevo por talhão" onClicar={id => p.setFiltro({ talhao: id })} />
          </Cartao>
        )}
      </div>
    </div>
  );
}
