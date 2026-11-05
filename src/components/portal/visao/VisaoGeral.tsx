'use client';

// Visão geral do Portal do Produtor v2 (/portal) — no padrão da referência:
// cinco KPIs, mapa de produtividade, evolução dos índices de vegetação, CE,
// relevo, zonas, fertilidade (com "outros atributos"), "minha propriedade em
// números", top talhões, correlação, benchmark Invicta e evolução do P.
//
// Com o filtro Talhão = um talhão, a MESMA tela vira o painel do talhão:
// números só dele, mini-mapas em modo real (alternável), histórico no lugar do
// ranking e "Abrir na página do talhão".
//
// Toda conta é de lib/portalPainel (puro, testado); aqui é só tela. Sem dado,
// cada cartão diz o que falta — nunca um número inventado.

import { useCallback, useMemo, useState } from 'react';
import {
  Layers, Shapes, BarChart3, ArrowLeftRight, Sprout, Satellite, Zap, Mountain, FlaskConical, ClipboardCheck,
  TrendingUp, Sigma, Map as MapaIcone,
} from 'lucide-react';
import { getLegendas } from '@/lib/store';
import { classeDoValor, corCheiaDaClasse, type ClasseLegenda, type Legenda } from '@/lib/legendas';
import { legendaPadraoDe } from '@/lib/processarFertilidade';
import { legendaDesignada, PREF_LEGENDA } from '@/lib/legendaDesignada';
import { legendaDaCultura } from '@/lib/produtividade';
import { rotuloAno } from '@/lib/periodo';
import {
  kpisPainel, produtividadePorTalhao, classesEmSacas, distribuirEmClasses, serieIndices, relevoPorTalhao,
  resumoRelevo, coresRelativas, resumoZonas, fertilidadePorTalhao, mediasPonderadasAtributos, alertasPropriedade,
  correlacoes, evolucaoAtributo, historicoProdutividade, colheitaDoAno, ultimoLaudo, interpretarR, rotuloP,
  talhoesSemColheita, MIN_TALHOES_CORRELACAO, rotuloCicloMeses, culturaPredominanteDoAno, tituloCulturaPredominante, type DadosPainel,
} from '@/lib/portalPainel';
import { grausParaPct, profundidadePadraoCe, ceNaProfundidade, distribuirPontosEmClasses, resumoCe, type CeProf } from '@/lib/portalPainelSensores';
import { usePortal } from '../PortalContext';
import { useBenchmark } from '../useBenchmark';
import {
  Cartao, Kpi, LegendaClasses, BarraTop, BarrasAno, LinhaSerie, Alerta, Seletor, Vazio, Esqueleto, MiniMapa,
  camadaProdutividade, camadaFertilidade, camadaCondutividade, camadaRelevo, camadaZonas,
  COR, fmtNum, fmtHaCurto, fmtPct, talhoesTxt, plural, MESES_CURTOS, RAMPA_RELEVO,
} from '../ui';
import { CartaoBenchmark } from './CartaoBenchmark';

const ATRIBUTOS = ['p', 'k', 'ph', 'ca', 'mg', 'v', 'mo'] as const;
// Unidade de reserva (a da legenda vale primeiro): a canônica da plataforma
// (lib/unidades UNIDADE_CANONICA — o laudo é convertido nela na importação).
// K, Ca e Mg são mmolc/dm³, não cmolc/dm³.
const ROTULO_AT: Record<string, { rotulo: string; unidade: string; casas: number }> = {
  p: { rotulo: 'P', unidade: 'mg/dm³', casas: 1 },
  k: { rotulo: 'K', unidade: 'mmolc/dm³', casas: 1 },
  ph: { rotulo: 'pH', unidade: '', casas: 1 },
  ca: { rotulo: 'Ca', unidade: 'mmolc/dm³', casas: 1 },
  mg: { rotulo: 'Mg', unidade: 'mmolc/dm³', casas: 1 },
  v: { rotulo: 'V%', unidade: '%', casas: 0 },
  mo: { rotulo: 'MO', unidade: 'g/dm³', casas: 1 },
};
// Linha de KPIs sem buraco: 5 cartões = 3 + 2 (grade de 6) até o 2xl; 5 em linha no 2xl.
const GRADE_KPI: Record<number, { grade: string; item: (i: number) => string }> = {
  1: { grade: '', item: () => '' },
  2: { grade: 'sm:grid-cols-2', item: () => '' },
  3: { grade: 'sm:grid-cols-2 lg:grid-cols-3', item: i => (i === 2 ? 'sm:col-span-2 lg:col-span-1' : '') },
  4: { grade: 'sm:grid-cols-2 2xl:grid-cols-4', item: () => '' },
  5: { grade: 'sm:grid-cols-2 lg:grid-cols-6 2xl:grid-cols-5', item: i => `${i < 3 ? 'lg:col-span-2' : 'lg:col-span-3'} 2xl:col-span-1${i === 4 ? ' sm:col-span-2' : ''}` },
};

/** "≤ 45,0", "45,0 – 60,0", "> 90,0" — fronteira semiaberta (mín, máx] como classeDoValor. */
function rotuloFaixa(c: Pick<ClasseLegenda, 'valorMin' | 'valorMax'>, casas = 1): string {
  if (c.valorMin == null && c.valorMax != null) return `≤ ${fmtNum(c.valorMax, casas)}`;
  if (c.valorMax == null && c.valorMin != null) return `> ${fmtNum(c.valorMin, casas)}`;
  if (c.valorMin != null && c.valorMax != null) return `${fmtNum(c.valorMin, casas)} – ${fmtNum(c.valorMax, casas)}`;
  return '';
}

function useLegendas() {
  return useMemo(() => {
    const todas = getLegendas();
    const porAt: Record<string, Legenda | undefined> = {};
    for (const a of ATRIBUTOS) porAt[a] = legendaPadraoDe(todas, a);
    return { porAt, ce: legendaDesignada('condutividade', PREF_LEGENDA.condutividade) ?? null };
  }, []);
}

export function VisaoGeral() {
  const p = usePortal();
  const { dados, ano, cultura } = p;
  const um = !!p.talhao;
  const anoTxt = rotuloAno(p.safra);
  const leg = useLegendas();
  const libProd = p.liberada('produtividade'), libFert = p.liberada('fertilidade'), libNdvi = p.liberada('ndvi'), libRec = p.liberada('recomendacoes');

  // ── Números ──
  // No painel de um talhão a cultura predominante vem da propriedade (dadosEscopo):
  // o talhão aparece com a mesma cultura da visão de todos (regra em lib/portalPainel).
  const kpis = useMemo(() => kpisPainel(dados, ano, cultura, p.dadosEscopo), [dados, ano, cultura, p.dadosEscopo]);
  const predEscopo = useMemo(() => culturaPredominanteDoAno(p.dadosEscopo, ano), [p.dadosEscopo, ano]);
  const culturaKpi = kpis.produtividade?.cultura ?? cultura;
  const legProd = useMemo(() => (culturaKpi ? legendaDaCultura(culturaKpi) ?? null : null), [culturaKpi]);
  const classesProd = useMemo(() => (legProd ? classesEmSacas(legProd.classes) : []), [legProd]);
  const prods = useMemo(() => produtividadePorTalhao(dados, ano, culturaKpi), [dados, ano, culturaKpi]);
  const valorProd = useMemo(() => new Map(prods.map(x => [x.talhaoId, x.mediaScHa])), [prods]);
  const distProd = useMemo(() => distribuirEmClasses(dados.map(d => ({ id: d.talhao.id, valor: valorProd.get(d.talhao.id) ?? null, areaHa: d.talhao.areaHa })), classesProd), [dados, valorProd, classesProd]);
  // "Sem colheita" = sem colheita DA cultura do cartão; quem colheu outra cultura não conta.
  const semColheita = useMemo(() => talhoesSemColheita(dados, ano, culturaKpi), [dados, ano, culturaKpi]);
  const kp = kpis.produtividade;
  const predTxt = kp?.outrasCulturas ? ` · cultura predominante (também: ${kp.outras.join(', ')})` : '';

  // CE: o MESMO método da página Condutividade — profundidade padrão e área por
  // classe ESTIMADA pela proporção dos pontos (lib/portalPainelSensores).
  const profCe = useMemo(() => profundidadePadraoCe(dados), [dados]);
  const itensCe = useMemo<CeProf[]>(() => (profCe ? dados.map(d => ceNaProfundidade(d, profCe)).filter((x): x is CeProf => !!x) : []), [dados, profCe]);
  const ces = useMemo(() => new Map(itensCe.map(i => [i.talhaoId, i])), [itensCe]);
  const distCe = useMemo(() => distribuirPontosEmClasses(itensCe, leg.ce?.classes ?? [], dados.map(d => ({ id: d.talhao.id, areaHa: d.talhao.areaHa }))), [itensCe, leg.ce, dados]);
  const ceMedia = useMemo(() => resumoCe(itensCe)?.media ?? null, [itensCe]);

  const relevos = useMemo(() => new Map(dados.map(d => [d.talhao.id, relevoPorTalhao(d)])), [dados]);
  const relevo = useMemo(() => resumoRelevo([...relevos.values()].filter((r): r is NonNullable<typeof r> => !!r)), [relevos]);
  const coresRelevo = useMemo(() => coresRelativas(dados.map(d => ({ id: d.talhao.id, valor: relevos.get(d.talhao.id)?.altMed ?? null })), RAMPA_RELEVO), [dados, relevos]);

  const zonas = useMemo(() => resumoZonas(dados), [dados]);

  const [atFert, setAtFert] = useState<string>('p');
  const fert = useMemo(() => fertilidadePorTalhao(dados, ano, [...ATRIBUTOS]), [dados, ano]);
  const legFert = leg.porAt[atFert];
  const distFert = useMemo(() => distribuirEmClasses(dados.map(d => ({ id: d.talhao.id, valor: fert.find(f => f.talhaoId === d.talhao.id)?.valores[atFert] ?? null, areaHa: d.talhao.areaHa })), legFert?.classes ?? []), [dados, fert, atFert, legFert]);
  const medias = useMemo(() => mediasPonderadasAtributos(fert, [...ATRIBUTOS]), [fert]);
  const profFert = useMemo(() => { const c = new Map<string, number>(); for (const f of fert) if (f.profundidade) c.set(f.profundidade, (c.get(f.profundidade) ?? 0) + 1); return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null; }, [fert]);
  const anosFert = useMemo(() => { const as = fert.map(f => f.ano).filter((a): a is number => a != null); return as.length ? [Math.min(...as), Math.max(...as)] : null; }, [fert]);

  const alertas = useMemo(() => alertasPropriedade({
    dados, ano, cultura: culturaKpi,
    legendas: Object.fromEntries((['p', 'k', 'v'] as const).flatMap(a => { const l = leg.porAt[a]; return l ? [[a, { classes: l.classes, invertida: l.invertida, simbolo: l.simbolo }]] : []; })),
    legendaProdutividade: legProd ? { classes: legProd.classes } : null,
    liberado: s => p.liberada(s),
  }), [dados, ano, culturaKpi, leg, legProd, p]);

  // Sem a seção NDVI no plano, a linha "NDVI (pico) × Produtividade" também sai.
  const corr = useMemo(() => correlacoes(dados, ano, culturaKpi).filter(c => libNdvi || c.id !== 'ndvi'), [dados, ano, culturaKpi, libNdvi]);
  const evolP = useMemo(() => evolucaoAtributo(dados, 'p').slice(-6), [dados]);
  const historico = useMemo(() => (um && dados[0] ? historicoProdutividade(dados[0], culturaKpi) : []), [um, dados, culturaKpi]);
  // Série no CICLO da colheita do ano (jul/A−1 → jun/A: a lavoura que gerou a colheita dos KPIs), não no ano civil — regra em lib/portalPainel (cicloDeData).
  const serie = useMemo(() => serieIndices(dados, ano, undefined, 'ciclo'), [dados, ano]);
  const cicloTxt = ano != null ? `ciclo ${rotuloCicloMeses(ano)}` : anoTxt;
  // O MESMO hook (e cache) da página Comparativo: as duas mostram o mesmo estado.
  const { estado: bench, recarregar: recarregarBench } = useBenchmark(libProd ? p.safra : '', p.preview ? p.cliente.id : undefined);

  // ── Mini-mapas ──
  const talhoesMapa = useMemo(() => dados.map(d => ({ id: d.talhao.id, nome: d.talhao.nome, geojson: d.talhao.geojson })), [dados]);
  const porId = useMemo(() => new Map<string, DadosPainel>(dados.map(d => [d.talhao.id, d])), [dados]);
  const clicar = useCallback((aba: string) => (id: string) => (um ? p.abrirTalhao(id, aba) : p.setFiltro({ talhao: id })), [um, p]);
  const realProd = useCallback((id: string) => { const d = porId.get(id); return d ? camadaProdutividade(id, colheitaDoAno(d, ano, culturaKpi), d.mapasNuvem) : null; }, [porId, ano, culturaKpi]);
  const realCe = useCallback((id: string) => { const it = ces.get(id); return it?.levId ? camadaCondutividade(id, { id: it.levId, profundidadeOficial: it.profundidade, profundidades: [it.profundidade] }) : null; }, [ces]);
  const realRelevo = useCallback((id: string) => { const d = porId.get(id); const ms = d?.mdes ?? []; return d ? camadaRelevo(id, ms.find(m => m.oficial) ?? ms[0] ?? null) : null; }, [porId]);
  const realZonas = useCallback((id: string) => camadaZonas(id, p.talhoes.find(t => t.id === id)?.zonasGeojson), [p.talhoes]);
  const realFert = useCallback((id: string) => { const d = porId.get(id); return d ? camadaFertilidade(id, ultimoLaudo(d.laudos, ano), atFert, d.mapasNuvem) : null; }, [porId, ano, atFert]);

  const nuvemVazia = (titulo: string) => !p.comNuvem
    ? <Vazio compacto icone={Satellite} titulo="As cenas de satélite ficam na nuvem" texto="Nesta bancada local não há conexão com a nuvem — no portal do produtor elas aparecem aqui." />
    : p.sincronizando ? <Esqueleto altura={180} />
      : p.falhasNuvem.includes('mapas') ? <Vazio compacto icone={Satellite} titulo="Não foi possível carregar as cenas agora" texto="A consulta à nuvem falhou. Recarregue a página em instantes." />
        : <Vazio compacto icone={Satellite} titulo={titulo} />;

  // ── KPIs ──
  const kpiCards = [
    <Kpi key="area" icone={Layers} tom="verde" rotulo={um ? 'Área do talhão' : 'Área mapeada'}
      valor={um ? fmtHaCurto(kpis.areaTotal) : kpis.nMapeados ? fmtHaCurto(kpis.areaMapeada) : null} unidade="ha"
      sub={um ? (kpis.nMapeados ? 'com mapas processados' : 'ainda sem mapas') : `${kpis.nMapeados} de ${talhoesTxt(kpis.nTalhoes)}`}
      vazio={`nenhum mapa ainda · ${talhoesTxt(kpis.nTalhoes)}`} />,
    <Kpi key="zonas" icone={Shapes} tom="azul" rotulo={um ? 'Zonas de manejo' : 'Talhões com zonas'}
      valor={um ? (zonas.zonas.length ? String(zonas.zonas.length) : null) : kpis.nZonas ? fmtHaCurto(kpis.areaZonas) : null} unidade={um ? (zonas.zonas.length === 1 ? 'zona' : 'zonas') : 'ha'}
      sub={um ? `${fmtHaCurto(zonas.areaTotal)} ha zoneados` : `${fmtPct(kpis.pctZonas, 0)} da área · ${talhoesTxt(kpis.nZonas)}`} vazio="sem zoneamento" />,
    ...(libProd ? [
      <Kpi key="prod" icone={BarChart3} tom="verde" rotulo={`Produtividade média${kp ? ` · ${kp.cultura}` : ''}`}
        valor={kp ? fmtNum(kp.media, 1) : null} unidade="sc/ha"
        delta={kp?.deltaPct != null ? { valor: kp.deltaPct, rotulo: 'vs. safra anterior' } : null}
        sub={kp ? [kp.outrasCulturas ? 'cultura predominante' : '', kp.deltaPct == null ? `${talhoesTxt(kp.n)} · sem ${(ano ?? 0) - 1} para comparar` : ''].filter(Boolean).join(' · ') : undefined}
        titulo={kp?.outrasCulturas ? tituloCulturaPredominante({ cultura: kp.cultura, outras: kp.outras, anoTxt, um, predominanteEscopo: predEscopo }) : undefined}
        vazio={`sem mapa de colheita em ${anoTxt}`} />,
      <Kpi key="amp" icone={ArrowLeftRight} tom="ambar" rotulo="Amplitude produtiva"
        valor={kp?.min != null && kp.max != null ? `${fmtNum(kp.min, 0)} – ${fmtNum(kp.max, 0)}` : null} unidade="sc/ha"
        sub={kp?.min != null && kp.max != null ? `${fmtNum(kp.max - kp.min, 1)} sc/ha ${kp.dentroDoTalhao ? 'dentro do talhão' : 'entre talhões'}` : undefined}
        vazio={kp && kp.n < 2 && !kp.dentroDoTalhao ? 'precisa de 2 talhões colhidos' : `sem mapa de colheita em ${anoTxt}`} />,
    ] : []),
    ...(libRec ? [
      <Kpi key="vr" icone={Sprout} tom="roxo" rotulo="Área com recomendação VR"
        valor={kpis.nRecomendacao ? fmtHaCurto(kpis.areaRecomendacao) : null} unidade={kpis.nRecomendacao ? `ha (${fmtPct(kpis.pctRecomendacao, 0)})` : 'ha'}
        sub="prescrição ou recomendação para uso no ano" vazio={`sem recomendação em ${anoTxt}`} />,
    ] : []),
  ];

  const corFertDe = (id: string) => distFert.corPorId[id] ?? null;
  const unidadeAt = (a: string) => leg.porAt[a]?.unidade || ROTULO_AT[a]?.unidade || '';

  return (
    <div className="space-y-4">
      <div className={`grid grid-cols-1 ${GRADE_KPI[kpiCards.length].grade} gap-3`}>
        {kpiCards.map((k, i) => <div key={i} className={`min-w-0 grid ${GRADE_KPI[kpiCards.length].item(i)}`}>{k}</div>)}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 xl:grid-cols-12 gap-4">
        {/* Produtividade */}
        {libProd && (
          <Cartao className={libNdvi ? 'md:col-span-6 xl:col-span-7' : 'md:col-span-6 xl:col-span-12'} icone={MapaIcone}
            titulo={`Mapa de produtividade${culturaKpi ? ` (${culturaKpi})` : ''}`}
            sub={(um ? `Mapa de colheita ${anoTxt}` : `Média de cada talhão no mapa de colheita ${anoTxt}`) + predTxt}
            acao={{ rotulo: 'Ver produtividade', href: p.hrefPortal('/portal/produtividade') }}>
            {prods.length === 0 ? (
              <Vazio icone={BarChart3} titulo={`Sem mapa de colheita em ${anoTxt}`} texto={culturaKpi ? `Nenhum talhão de ${culturaKpi} tem colheita processada no ano.` : 'Quando a colheita for processada, o mapa aparece aqui.'} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_200px] gap-4 items-start">
                <MiniMapa talhoes={talhoesMapa} corDe={id => distProd.corPorId[id] ?? null} altura={um ? 280 : 250} nomes={!um}
                  rotulo={id => (valorProd.has(id) ? `${fmtNum(valorProd.get(id)!, 1)} sc/ha` : semColheita.outraCultura.includes(id) ? `outra cultura (fora do mapa de ${culturaKpi})` : `sem colheita de ${culturaKpi}`)}
                  camadaReal={realProd} onClicar={clicar('produtividade')} aria="Mapa de produtividade" />
                <LegendaClasses titulo="Produtividade (sc/ha)"
                  itens={[...distProd.classes].reverse().map(c => ({ cor: c.cor, rotulo: rotuloFaixa(c), pct: um ? null : c.pct, ha: um ? null : c.ha, sub: c.nome, apagado: !um && c.n === 0 }))}
                  rodape={um
                    ? `Média do talhão: ${fmtNum(prods[0]?.mediaScHa, 1)} sc/ha (${distProd.classePorId[dados[0].talhao.id] ?? '—'}). Classes da legenda ${legProd?.nome ?? ''}.`
                    : `Cor = classe da média de cada talhão (legenda ${legProd?.nome ?? '—'}).${semColheita.n ? ` ${talhoesTxt(semColheita.n)} sem colheita de ${culturaKpi}.` : ''}`} />
              </div>
            )}
          </Cartao>
        )}

        {/* Índices de vegetação */}
        {libNdvi && (
          <Cartao className={libProd ? 'md:col-span-6 xl:col-span-5' : 'md:col-span-6 xl:col-span-12'} icone={Satellite} titulo="Evolução dos índices de vegetação"
            sub={`Média das cenas de satélite por mês · ${cicloTxt}`} acao={{ rotulo: 'Ver NDVI', href: p.hrefPortal('/portal/ndvi') }}>
            {serie.series.length === 0 ? nuvemVazia(`Sem cenas de satélite no ${cicloTxt}`) : (
              <LinhaSerie categorias={serie.meses.map(m => MESES_CURTOS[m - 1])}
                series={serie.series.map(s => ({ id: s.indice, rotulo: `${s.indice} (médio)`, cor: s.indice === 'NDVI' ? 'var(--invicta-green-dark)' : '#8bc34a', valores: serie.meses.map(m => s.valores[m] ?? null) }))}
                casas={2} />
            )}
          </Cartao>
        )}

        {/* CE */}
        <Cartao className="md:col-span-3 xl:col-span-4" icone={Zap} titulo="Condutividade elétrica"
          sub={ceMedia != null ? `Média ${fmtNum(ceMedia, 1)} ${leg.ce?.unidade ?? 'mS/m'} · camada ${profCe} cm${um && ces.get(dados[0]?.talhao.id ?? '') ? ` · ${ces.get(dados[0].talhao.id)!.n} pontos` : ''}` : 'Levantamento de CE do solo'}
          acao={{ rotulo: 'Ver mapa', href: p.hrefPortal('/portal/condutividade') }}>
          {itensCe.length === 0 ? (
            <Vazio compacto icone={Zap} titulo="Sem levantamento de CE" texto={um ? 'Este talhão ainda não tem condutividade elétrica.' : 'Nenhum talhão no filtro tem condutividade elétrica.'} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 2xl:grid-cols-2 gap-3 items-center">
              <MiniMapa talhoes={talhoesMapa} corDe={id => distCe.corPorId[id] ?? null} altura={160}
                rotulo={id => { const c = ces.get(id); return c ? `${fmtNum(c.media, 1)} ${leg.ce?.unidade ?? 'mS/m'}` : 'sem CE'; }}
                camadaReal={realCe} onClicar={clicar('condutividade')} aria="Mapa de condutividade" />
              <LegendaClasses compacta itens={[...distCe.classes].reverse().map(c => ({ cor: c.cor, rotulo: c.nome, pct: c.pct, ha: c.ha, sub: rotuloFaixa(c), apagado: c.ha === 0 }))}
                rodape={`Área estimada pela proporção dos pontos medidos em cada classe.${um ? ` Faixa: ${fmtNum(ces.get(dados[0].talhao.id)?.min, 1)} – ${fmtNum(ces.get(dados[0].talhao.id)?.max, 1)} ${leg.ce?.unidade ?? 'mS/m'}.` : ' Cor do mapa = classe da média de cada talhão.'}`} />
            </div>
          )}
        </Cartao>

        {/* Relevo */}
        <Cartao className="md:col-span-3 xl:col-span-4" icone={Mountain} titulo="Altimetria / Relevo" sub={relevo ? `${talhoesTxt(relevo.n)} com modelo de elevação` : 'Modelo digital de elevação'}
          acao={{ rotulo: 'Ver mapa', href: p.hrefPortal('/portal/altimetria') }}>
          {!relevo ? (
            <Vazio compacto icone={Mountain} titulo="Sem relevo aprovado" texto={um ? 'Este talhão ainda não tem altimetria.' : 'Nenhum talhão no filtro tem altimetria.'} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 2xl:grid-cols-2 gap-3 items-center">
              <MiniMapa talhoes={talhoesMapa} corDe={id => coresRelevo.corPorId[id] ?? null} altura={160}
                rotulo={id => { const r = relevos.get(id); return r ? `${fmtNum(r.altMed, 0)} m (méd.)` : 'sem relevo'; }}
                camadaReal={realRelevo} onClicar={clicar('altimetria')} aria="Mapa de relevo" />
              <dl className="space-y-2 text-xs">
                <div><dt style={{ color: COR.texto2 }}>Altitude</dt><dd className="text-base font-extrabold tabular-nums">{fmtNum(relevo.altMin, 0)} – {fmtNum(relevo.altMax, 0)} m</dd></div>
                <div><dt style={{ color: COR.texto2 }}>Declividade média</dt><dd className="text-base font-extrabold tabular-nums">{relevo.declMedia != null ? <>{fmtNum(relevo.declMedia, 1)}° <span className="text-[11px] font-semibold" style={{ color: COR.texto2 }}>(≈ {fmtNum(grausParaPct(relevo.declMedia), 1)}%)</span></> : '—'}</dd></div>
                <div><dt style={{ color: COR.texto2 }}>Amplitude</dt><dd className="text-base font-extrabold tabular-nums">{fmtNum(relevo.amplitude, 0)} m</dd></div>
              </dl>
            </div>
          )}
        </Cartao>

        {/* Zonas */}
        <Cartao className="md:col-span-6 xl:col-span-4" icone={Shapes} titulo={`Zonas de manejo${culturaKpi && cultura ? ` (${culturaKpi})` : ''}`}
          sub={zonas.zonas.length ? `${fmtHaCurto(zonas.areaTotal)} ha zoneados` : 'Zoneamento do talhão'}
          acao={libRec ? { rotulo: 'Prescrições', href: p.hrefPortal('/portal/prescricoes') } : { rotulo: 'Ver zonas', href: p.hrefPortal('/portal/zonas') }}>
          {zonas.zonas.length === 0 ? (
            <Vazio compacto icone={Shapes} titulo="Sem zonas de manejo" texto={um ? 'Este talhão ainda não tem zoneamento.' : 'Nenhum talhão no filtro tem zoneamento.'} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2 gap-3 items-center">
              <MiniMapa talhoes={talhoesMapa} corDe={() => null} altura={160} modo="real" camadaReal={realZonas} onClicar={clicar('zonas')} aria="Mapa das zonas de manejo" />
              <LegendaClasses compacta itens={zonas.zonas.map(z => ({ cor: z.cor, rotulo: z.rotulo, pct: z.pct, ha: z.ha }))} />
            </div>
          )}
        </Cartao>

        {/* Fertilidade */}
        {libFert && (
          <Cartao className="md:col-span-6 xl:col-span-7" icone={FlaskConical} titulo="Fertilidade do solo" sub={fert.length
            ? `${um ? 'Última análise do talhão' : 'Última análise de cada talhão'}${anosFert ? ` (${anosFert[0] === anosFert[1] ? anosFert[0] : `${anosFert[0]}–${anosFert[1]}`})` : ''}${profFert ? ` · camada ${profFert} cm` : ''}`
            : 'Última amostragem'}
            extra={fert.length ? <Seletor valor={atFert} onChange={setAtFert} opcoes={ATRIBUTOS.filter(a => leg.porAt[a]).map(a => ({ valor: a, rotulo: ROTULO_AT[a].rotulo }))} rotulo="Atributo do mapa" /> : null}
            acao={{ rotulo: 'Ver fertilidade', href: p.hrefPortal('/portal/fertilidade') }}>
            {fert.length === 0 ? (
              <Vazio icone={FlaskConical} titulo={`Sem análise de solo até ${anoTxt}`} texto="Quando o laudo do laboratório for importado, os mapas e as classes aparecem aqui." />
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-4 items-start">
                  <MiniMapa talhoes={talhoesMapa} corDe={corFertDe} altura={200}
                    rotulo={id => { const v = fert.find(f => f.talhaoId === id)?.valores[atFert]; return v != null ? `${ROTULO_AT[atFert].rotulo} ${fmtNum(v, ROTULO_AT[atFert].casas)}` : 'sem análise'; }}
                    camadaReal={realFert} onClicar={clicar('fertilidade')} aria="Mapa de fertilidade" />
                  <div className="min-w-0">
                    <table className="w-full text-xs">
                      <thead><tr style={{ color: COR.texto2 }}>
                        <th className="text-left font-semibold pb-1.5">Classe ({ROTULO_AT[atFert].rotulo}{unidadeAt(atFert) ? `, ${unidadeAt(atFert)}` : ''})</th>
                        <th className="text-right font-semibold pb-1.5">Faixa</th>
                        {!um && <th className="text-right font-semibold pb-1.5 pl-2">Área (ha)</th>}
                        {!um && <th className="text-right font-semibold pb-1.5 pl-2">%</th>}
                      </tr></thead>
                      <tbody>
                        {(legFert?.classes ?? []).length === 0 ? (
                          <tr><td colSpan={4} className="py-2" style={{ color: COR.texto2 }}>Sem legenda cadastrada para {ROTULO_AT[atFert].rotulo}.</td></tr>
                        ) : distFert.classes.map(c => {
                          const doTalhao = um && distFert.classePorId[dados[0].talhao.id] === c.nome;
                          return (
                            <tr key={c.nome} style={{ borderTop: `1px solid ${COR.borda}`, opacity: um ? (doTalhao ? 1 : 0.45) : c.n ? 1 : 0.5 }}>
                              <td className="py-1.5 whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.cor }} />
                                <span className="font-semibold">{c.nome}</span>{doTalhao && <strong className="ml-1">◀ este talhão</strong>}</span></td>
                              <td className="py-1.5 text-right tabular-nums whitespace-nowrap" style={{ color: COR.texto2 }}>{rotuloFaixa(c, ROTULO_AT[atFert].casas)}</td>
                              {!um && <td className="py-1.5 pl-2 text-right tabular-nums">{fmtHaCurto(c.ha)}</td>}
                              {!um && <td className="py-1.5 pl-2 text-right tabular-nums font-bold">{fmtNum(c.pct, 1)}%</td>}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {!um && distFert.semDado.n > 0 && <p className="text-[10.5px] mt-1.5" style={{ color: COR.mudo }}>{talhoesTxt(distFert.semDado.n)} ({fmtHaCurto(distFert.semDado.ha)} ha) sem análise.</p>}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold mb-1.5">Outros atributos <span className="font-normal" style={{ color: COR.texto2 }}>({um ? 'média do talhão' : 'média ponderada pela área'} · classe da legenda da Biblioteca)</span></p>
                  <ul className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6 gap-2">
                    {ATRIBUTOS.filter(a => a !== atFert).map(a => {
                      const m = medias[a];
                      const l = leg.porAt[a];
                      const c = m.valor != null && l ? classeDoValor(m.valor, l.classes) : undefined;
                      const cor = c ? corCheiaDaClasse(c) : 'var(--border-color)';
                      return (
                        <li key={a} className="rounded-xl px-2.5 py-2 min-w-0" style={{ background: COR.superficie2, borderLeft: `3px solid ${cor}` }}>
                          <p className="text-[10.5px] font-semibold truncate" style={{ color: COR.texto2 }} title={`${ROTULO_AT[a].rotulo}${unidadeAt(a) && a !== 'v' ? ` · ${unidadeAt(a)}` : ''}`}>{ROTULO_AT[a].rotulo}{unidadeAt(a) && a !== 'v' ? ` · ${unidadeAt(a)}` : ''}</p>
                          <p className="text-base font-extrabold tabular-nums leading-tight">{m.valor != null ? fmtNum(m.valor, ROTULO_AT[a].casas) : '—'}</p>
                          <p className="text-[10.5px] truncate" style={{ color: c ? COR.texto : COR.mudo }} title={c ? c.nome : undefined}>{c ? c.nome : m.valor != null ? 'sem legenda' : 'sem análise'}</p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            )}
          </Cartao>
        )}

        {/* Minha propriedade em números */}
        <Cartao className={libFert ? 'md:col-span-6 xl:col-span-5' : 'md:col-span-6 xl:col-span-12'} icone={ClipboardCheck} titulo={um ? 'O talhão em números' : 'Minha propriedade em números'}
          sub={`${fmtHaCurto(kpis.areaTotal)} ha · ${talhoesTxt(kpis.nTalhoes)} no filtro`}>
          {alertas.length === 0 ? <Vazio compacto titulo="Nada a destacar ainda" /> : (
            <ul className="space-y-1.5">
              {alertas.map(a => <Alerta key={a.id} tipo={a.tipo} destaque={a.destaque}>{a.texto}</Alerta>)}
            </ul>
          )}
        </Cartao>

        {/* Top talhões / histórico */}
        {libProd && (
          <Cartao className="md:col-span-3 xl:col-span-6 2xl:col-span-3" icone={TrendingUp} titulo={um ? 'Produtividade do talhão por ano' : 'Produtividade por talhão (Top 5)'}
            sub={culturaKpi ? `${culturaKpi}${!um && kp?.outrasCulturas ? ' (predominante)' : ''} · sc/ha` : 'sc/ha'}>
            {um ? (
              historico.length === 0 ? <Vazio compacto icone={BarChart3} titulo="Sem mapa de colheita" texto="Nenhuma colheita processada neste talhão." /> :
                <BarrasAno itens={historico.slice(-6).map(h => ({ rotulo: String(h.ano), valor: h.mediaScHa, destaque: h.ano === ano }))} unidade="sc/ha" />
            ) : prods.length === 0 ? <Vazio compacto icone={BarChart3} titulo={`Sem mapa de colheita em ${anoTxt}`} /> : (
              <BarraTop itens={prods.slice(0, 5).map(x => ({ id: x.talhaoId, rotulo: x.nome, valor: x.mediaScHa, cor: distProd.corPorId[x.talhaoId] }))}
                extra={{ titulo: 'Área (ha)', valor: it => fmtHaCurto(porId.get(it.id)?.talhao.areaHa ?? null) }} unidade="Produtividade (sc/ha)"
                onClicar={id => p.setFiltro({ talhao: id })} />
            )}
          </Cartao>
        )}

        {/* Correlação */}
        {libProd && (
          <Cartao className="md:col-span-3 xl:col-span-6 2xl:col-span-3" icone={Sigma} titulo={`Correlação de dados${culturaKpi ? ` (${culturaKpi})` : ''}`}
            sub={`Entre os talhões: média de cada um × produtividade${!um && kp?.outrasCulturas ? ` (${culturaKpi}, predominante)` : ''}`}>
            {um ? (
              <Vazio compacto icone={Sigma} titulo="A correlação compara talhões" texto="Escolha “Todos os talhões” para ver como NDVI, CE e altitude se relacionam com a produtividade." />
            ) : (
              <>
                <table className="w-full text-xs">
                  <thead><tr style={{ color: COR.texto2 }}><th className="text-left font-semibold pb-1.5">Variáveis</th><th className="text-right font-semibold pb-1.5">r</th><th className="text-right font-semibold pb-1.5">Interpretação</th></tr></thead>
                  <tbody>
                    {corr.map(c => (
                      <tr key={c.id} style={{ borderTop: `1px solid ${COR.borda}` }}>
                        <td className="py-2 pr-1">{c.rotulo}</td>
                        <td className="py-2 text-right tabular-nums text-sm font-extrabold" style={{ color: c.resultado ? (Math.abs(c.resultado.r) >= 0.5 ? 'var(--p-verde-texto)' : COR.texto) : COR.mudo }}>
                          {c.resultado ? fmtNum(c.resultado.r, 2) : '—'}
                        </td>
                        <td className="py-2 text-right" style={{ color: c.resultado ? COR.texto : COR.mudo }} title={c.resultado ? `n = ${c.n} · ${rotuloP(c.resultado.p)}` : undefined}>
                          {c.resultado ? interpretarR(c.resultado.r) : `n = ${c.n} (mín. ${MIN_TALHOES_CORRELACAO})`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[10.5px] mt-2" style={{ color: COR.mudo }}>
                  {corr.some(c => c.resultado)
                    ? corr.filter(c => c.resultado).map(c => `${c.id === 'ndvi' ? 'NDVI' : c.id === 'ce' ? 'CE' : 'Alt.'}: n = ${c.n}, ${rotuloP(c.resultado!.p)}`).join(' · ') + ' · Pearson'
                    : `Poucos talhões para correlação — são precisos ${MIN_TALHOES_CORRELACAO} com colheita e a variável.`}
                </p>
              </>
            )}
          </Cartao>
        )}

        {/* Benchmark */}
        {libProd && (
          <CartaoBenchmark className="md:col-span-3 xl:col-span-6 2xl:col-span-3" estado={bench} recarregar={recarregarBench} cultura={culturaKpi} safraRotulo={anoTxt}
            predominante={!!kp?.outrasCulturas} filtroFazenda={!!p.fazendaId && !um}
            voce={um ? (prods[0]?.mediaScHa ?? null) : (kp?.media ?? null)} rotuloVoce={um ? 'Este talhão' : undefined}
            semColheita={!kp} acao={{ rotulo: 'Comparativo', href: p.hrefPortal('/portal/comparativo') }} />
        )}

        {/* Evolução do P */}
        {libFert && (
          <Cartao className="md:col-span-3 xl:col-span-6 2xl:col-span-3" icone={FlaskConical} titulo="Evolução da fertilidade (P)"
            sub={`${unidadeAt('p') || 'mg/dm³'} · ${um ? 'média do talhão' : 'média ponderada'} por ano de análise`}>
            {evolP.length === 0 ? <Vazio compacto icone={FlaskConical} titulo="Sem análise de solo" /> : (
              <>
                <BarrasAno itens={evolP.map(e => ({ rotulo: String(e.ano), valor: e.valor, titulo: `${e.ano}: ${fmtNum(e.valor, 1)} mg/dm³ · ${plural(e.nTalhoes, 'talhão', 'talhões')}` }))} unidade={unidadeAt('p') || 'mg/dm³'} />
                {evolP.length === 1 && <p className="text-[10.5px] mt-1" style={{ color: COR.mudo }}>Com o próximo ano de análise, a tendência aparece.</p>}
              </>
            )}
          </Cartao>
        )}
      </div>
    </div>
  );
}
