'use client';

// Portal do Produtor → NDVI / NDRE (/portal/ndvi).
//
// Janela: o CICLO da colheita do ano do filtro (jul/A−1 → jun/A, lib/portalPainel
// cicloDeData) em TUDO — KPIs, mapa, ranking, cenas e séries.
//
// O que o produtor quer saber aqui: "minha lavoura está com o vigor que
// deveria? onde está pior? como está frente ao ano passado?". A página mostra a
// última leitura e o PICO do ciclo, a evolução mês a mês (safra contra safra, ou
// talhão contra talhão), o mapa da última cena e a lista das cenas com a
// qualidade de cada uma (% do talhão limpo, nuvem).
//
// Tudo sai da listagem LEVE da nuvem (metadados das cenas — sem baixar raster);
// o raster só vem no modo "Mapas reais", sob demanda (MiniMapa). Sem nuvem
// (bancada local) ou sem cenas: estado vazio que diz o porquê. Contas em
// lib/portalPainelSensores (puro, testado).

import { useCallback, useMemo, useState } from 'react';
import { Satellite, Layers, TrendingUp, ShieldCheck, Gauge, Map as MapaIcone, ListChecks, BarChart3 } from 'lucide-react';
import { legendaDesignada, PREF_LEGENDA } from '@/lib/legendaDesignada';
import { rotuloAno } from '@/lib/periodo';
import {
  ciclosComCena, indicesDisponiveis, cenasDoTalhao, cenasRecentes, kpisNdvi, resumoNdviPorTalhao, serieMensal, serieMensalPorTalhao,
  ROTULO_FONTE, LIMPO_MIN, type CenaSat, type CenaRecente, type NdviTalhao,
} from '@/lib/portalPainelSensores';
import { distribuirEmClasses, coresRelativas, ordemNoCiclo, rotuloCicloMeses, MESES_DO_CICLO } from '@/lib/portalPainel';
import { usePortal } from '../PortalContext';
import {
  Cartao, Kpi, LegendaClasses, BarraTop, LinhaSerie, Seletor, Vazio, Esqueleto, MiniMapa,
  COR, MESES_CURTOS, fmtNum, fmtHaCurto, suave, talhoesTxt,
} from '../ui';
import { BotaoAbrirTalhao, GradeKpis, TabelaTalhoes, SeloCor, dataCurta, rotuloFaixa, type ColunaTabela } from './SensoresComuns';
import { camadaNdvi } from './camadasSensores';

/** Rampa do mapa leve para índices que não são NDVI (sem classes oficiais): vermelho → verde-escuro. */
const RAMPA_VIGOR = ['#c62828', '#f9a825', '#d4e157', '#66bb6a', '#1b5e20'];
const CORES_SERIE = ['var(--invicta-green-dark)', '#f59e0b', '#3b82f6', '#a855f7', '#ef4444', '#14b8a6'];

/** Selo de qualidade da cena: % do talhão sem nuvem/sombra. */
function SeloLimpo({ v }: { v: number | null }) {
  if (v == null) return <span style={{ color: COR.mudo }} title="A cena ainda não foi avaliada quanto à limpeza">não avaliada</span>;
  const cor = v >= LIMPO_MIN ? 'var(--p-verde-texto)' : v >= 40 ? 'var(--status-warning)' : 'var(--status-error)';
  return <span className="inline-flex items-center h-5 px-1.5 rounded-md font-bold" style={{ background: suave(cor, 12), color: cor }}>{fmtNum(v, 0)}%</span>;
}

/** Fora do plano ('ndvi'), a rota é barrada pela GuardaPlano do shell. */
export function PaginaNdvi() {
  return <ConteudoNdvi />;
}

function ConteudoNdvi() {
  const p = usePortal();
  const { dados, ano } = p;
  const um = !!p.talhao;
  // Tudo nesta página é do CICLO da colheita do ano (jul/A−1 → jun/A): "jul/25–jun/26" no filtro 2026.
  const cicloTxt = ano != null ? rotuloCicloMeses(ano) : rotuloAno(p.safra);

  const indices = useMemo(() => indicesDisponiveis(dados), [dados]);
  const [indiceSel, setIndiceSel] = useState('NDVI');
  const indice = indices.includes(indiceSel) ? indiceSel : (indices[0] ?? 'NDVI');
  const [mostrar, setMostrar] = useState<'ultima' | 'pico'>('ultima');
  const [comparar, setComparar] = useState<'safras' | 'talhoes'>('safras');
  const legNdvi = useMemo(() => legendaDesignada('ndvi', PREF_LEGENDA.ndvi), []);

  const kp = useMemo(() => kpisNdvi(dados, ano, indice), [dados, ano, indice]);
  const resumos = useMemo(() => resumoNdviPorTalhao(dados, ano, indice), [dados, ano, indice]);
  // Série no CICLO da colheita do ano (jul/A−1 → jun/A), não no ano civil: a lavoura de Out→Abr que gerou a colheita sai inteira (regra em lib/portalPainel, cicloDeData).
  const ciclosIndice = useMemo(() => ciclosComCena(dados, indice), [dados, indice]);
  const todosCiclos = useMemo(() => ciclosComCena(dados), [dados]);
  const recentes = useMemo<CenaRecente[]>(() => cenasRecentes(dados, ano, indice, um ? 30 : 10), [dados, ano, indice, um]);

  // A cena de cada talhão que o mapa mostra (a última ou a do pico).
  const cenaDoMapa = useMemo(() => {
    const m = new Map<string, CenaSat>();
    for (const d of dados) {
      const cs = cenasDoTalhao(d, ano, 'ciclo').filter(c => c.indice === indice);
      if (!cs.length) continue;
      m.set(d.talhao.id, mostrar === 'ultima' ? cs[cs.length - 1] : cs.reduce((a, c) => (c.media > a.media ? c : a), cs[0]));
    }
    return m;
  }, [dados, ano, indice, mostrar]);

  const porId = useMemo(() => new Map(resumos.map(r => [r.talhaoId, r])), [resumos]);
  const valorMapa = useMemo(() => new Map([...cenaDoMapa].map(([id, c]) => [id, c.media])), [cenaDoMapa]);
  const classesNdvi = useMemo(() => legNdvi?.classes ?? [], [legNdvi]);
  const usaClasses = indice === 'NDVI' && classesNdvi.length > 0;
  const itensMapa = useMemo(() => dados.map(d => ({ id: d.talhao.id, valor: valorMapa.get(d.talhao.id) ?? null, areaHa: d.talhao.areaHa })), [dados, valorMapa]);
  const dist = useMemo(() => distribuirEmClasses(itensMapa, usaClasses ? classesNdvi : []), [itensMapa, usaClasses, classesNdvi]);
  const rel = useMemo(() => coresRelativas(itensMapa.map(i => ({ id: i.id, valor: i.valor })), RAMPA_VIGOR), [itensMapa]);
  const corDe = useCallback((id: string) => (usaClasses ? dist.corPorId[id] : rel.corPorId[id]) ?? null, [usaClasses, dist, rel]);

  const talhoesMapa = useMemo(() => dados.map(d => ({ id: d.talhao.id, nome: d.talhao.nome, geojson: d.talhao.geojson })), [dados]);
  const realNdvi = useCallback((id: string) => camadaNdvi(cenaDoMapa.get(id), legNdvi), [cenaDoMapa, legNdvi]);
  const clicar = useCallback((id: string) => (um ? p.abrirTalhao(id, 'ndvi') : p.setFiltro({ talhao: id })), [um, p]);

  // ── Séries ──
  const serie = useMemo(() => {
    if (comparar === 'talhoes' && !um) {
      const por = serieMensalPorTalhao(dados, ano, indice, 'ciclo').sort((a, b) => b.areaHa - a.areaHa).slice(0, 6);
      return por.map((s, i) => ({ id: s.talhaoId, rotulo: s.nome, cor: CORES_SERIE[i], valores: s.valores }));
    }
    const ciclos = [...new Set([...(ano != null && ciclosIndice.includes(ano) ? [ano] : []), ...ciclosIndice])].slice(0, 4);
    return ciclos.map((a, i) => ({ id: String(a), rotulo: rotuloCicloMeses(a), cor: CORES_SERIE[i], valores: serieMensal(dados, a, indice, 'ciclo') }));
  }, [comparar, um, dados, ano, indice, ciclosIndice]);
  // Eixo: do primeiro ao último mês com cena, na ordem do ciclo (Jul … Jun).
  const mesesSerie = useMemo(() => {
    const ms = serie.flatMap(s => Object.keys(s.valores).map(m => ordemNoCiclo(Number(m))));
    if (!ms.length) return [] as number[];
    const lo = Math.min(...ms), hi = Math.max(...ms);
    return Array.from({ length: hi - lo + 1 }, (_, i) => MESES_DO_CICLO[lo + i]);
  }, [serie]);

  // ── Estados vazios ──
  const temCenasNoAno = kp.nCenas > 0;
  if (!temCenasNoAno) {
    const outrosCiclos = todosCiclos.filter(a => a !== ano);
    const opcaoDoAno = (a: number) => p.opcoesSafra.find(o => rotuloAno(o.valor) === String(a));
    return (
      <div className="space-y-4">
        {um && <div className="flex justify-end"><BotaoAbrirTalhao aba="ndvi" /></div>}
        {outrosCiclos.length > 0 ? (
          <Vazio icone={Satellite} titulo={`Sem cenas de satélite no ciclo ${cicloTxt}`}
            texto={`Há cenas nos ciclos ${outrosCiclos.map(rotuloCicloMeses).join(', ')}. Troque o ano para ver.`}
            acao={<div className="flex flex-wrap justify-center gap-2 mt-2">
              {outrosCiclos.map(a => { const o = opcaoDoAno(a); return o ? (
                <button key={a} type="button" onClick={() => p.setFiltro({ safra: o.valor })} className="h-8 px-3 rounded-lg text-xs font-bold"
                  style={{ background: COR.verdeEscuro, color: '#fff' }}>Ver {a}</button>
              ) : null; })}
            </div>} />
        ) : p.sincronizando ? (
          <Esqueleto altura={220} />
        ) : p.falhasNuvem.includes('mapas') ? (
          <Vazio icone={Satellite} titulo="Não foi possível consultar as cenas agora" texto="A consulta à nuvem falhou. Recarregue a página em instantes." />
        ) : !p.comNuvem ? (
          <Vazio icone={Satellite} titulo="As cenas de satélite ficam na nuvem" texto="Nesta bancada local não há conexão com a nuvem — no portal do produtor, o NDVI e o NDRE de cada talhão aparecem aqui." />
        ) : (
          <Vazio icone={Satellite} titulo={um ? 'Este talhão ainda não tem cenas de satélite' : 'Ainda não há cenas de satélite processadas'}
            texto="Quando a Invicta processar o NDVI/NDRE dos talhões, a evolução, o pico do ciclo e o mapa aparecem aqui." />
        )}
      </div>
    );
  }

  // ── KPIs ──
  const pico = kp.pico;
  const kpis = [
    <Kpi key="atual" icone={Gauge} tom="verde" rotulo={`${indice} na última cena`} valor={kp.valorUltimo != null ? fmtNum(kp.valorUltimo, 2) : null}
      sub={`cena de ${dataCurta(kp.ultimaData, true)} · ${um ? 'este talhão' : `média de ${talhoesTxt(kp.nTalhoes)}`}`} vazio="sem leitura" />,
    <Kpi key="pico" icone={TrendingUp} tom="azul" rotulo="Pico do ciclo" valor={pico ? fmtNum(pico.valor, 2) : null}
      delta={kp.deltaPicoPct != null ? { valor: kp.deltaPicoPct, rotulo: 'vs. ciclo anterior' } : null}
      sub={pico ? `em ${MESES_CURTOS[pico.mes - 1]}${kp.deltaPicoPct == null ? ` · sem o ciclo anterior para comparar` : ''}` : undefined} vazio="sem leitura" />,
    <Kpi key="cenas" icone={Layers} tom="ciano" rotulo="Cenas de satélite" valor={String(kp.nCenas)} sub={`ciclo ${cicloTxt} · ${um ? 'neste talhão' : talhoesTxt(kp.nTalhoes)}`} />,
    <Kpi key="limpas" icone={ShieldCheck} tom="ambar" rotulo="Cenas confiáveis" valor={kp.pctCenasLimpas != null ? `${kp.pctCenasLimpas}` : null} unidade="%"
      sub={`talhão ≥ ${LIMPO_MIN}% limpo · ${kp.nAvaliadas} avaliada${kp.nAvaliadas === 1 ? '' : 's'}`} vazio="cenas ainda sem avaliação de limpeza" />,
  ];

  // ── Mapa ──
  const picos = resumos.filter(r => r.pico).sort((a, b) => (b.pico?.valor ?? 0) - (a.pico?.valor ?? 0));
  const minBarra = picos.length ? Math.max(0, Math.floor((Math.min(...picos.map(r => r.pico!.valor)) - 0.1) * 10) / 10) : 0;
  const legendaItens = usaClasses
    ? [...dist.classes].reverse().map(c => ({ cor: c.cor, rotulo: rotuloFaixa(c, 2), pct: um ? null : c.pct, ha: um ? null : c.ha, sub: c.nome, apagado: c.n === 0 }))
    : RAMPA_VIGOR.map((cor, i) => ({ cor, rotulo: rel.min != null && rel.max != null ? fmtNum(rel.min + ((rel.max - rel.min) * i) / (RAMPA_VIGOR.length - 1), 2) : '—' })).reverse();
  const colunasCenas: Array<ColunaTabela<CenaRecente>> = [
    { id: 'data', rotulo: 'Data', valor: r => r.data, render: r => <span className="font-bold">{dataCurta(r.data, true)}</span> },
    ...(um ? [] : [{ id: 'nome', rotulo: 'Talhão', valor: (r: CenaRecente) => r.nome, render: (r: CenaRecente) => <span className="font-semibold">{r.nome}</span> }]),
    { id: 'sat', rotulo: 'Satélite', valor: r => ROTULO_FONTE[r.fonte], soDesktop: true, render: r => <span style={{ color: COR.texto2 }}>{ROTULO_FONTE[r.fonte]}</span> },
    { id: 'media', rotulo: indice, align: 'right', valor: r => r.media, render: r => <span className="font-extrabold" title={r.min != null && r.max != null ? `de ${fmtNum(r.min, 2)} a ${fmtNum(r.max, 2)}` : undefined}>{fmtNum(r.media, 2)}</span> },
    { id: 'limpo', rotulo: 'Talhão limpo', align: 'right', titulo: 'Quanto do talhão está sem nuvem nem sombra na cena', valor: r => r.pctLimpo, render: r => <SeloLimpo v={r.pctLimpo} /> },
    { id: 'nuvem', rotulo: 'Nuvem na cena', align: 'right', soDesktop: true, valor: r => r.nuvem, render: r => (r.nuvem != null ? `${fmtNum(r.nuvem, 0)}%` : '—') },
  ];
  const colunasTalhoes: Array<ColunaTabela<NdviTalhao>> = [
    { id: 'nome', rotulo: 'Talhão', valor: r => r.nome },
    { id: 'area', rotulo: 'Área (ha)', align: 'right', valor: r => r.areaHa, render: r => fmtHaCurto(r.areaHa), soDesktop: true },
    { id: 'ultima', rotulo: 'Última cena', align: 'right', valor: r => r.ultima?.media ?? null,
      render: r => (r.ultima ? <span><strong>{fmtNum(r.ultima.media, 2)}</strong> <span style={{ color: COR.mudo }}>{dataCurta(r.ultima.data)}</span></span> : '—') },
    { id: 'pico', rotulo: 'Pico do ciclo', align: 'right', valor: r => r.pico?.valor ?? null,
      render: r => (r.pico ? <span><strong>{fmtNum(r.pico.valor, 2)}</strong> <span style={{ color: COR.mudo }}>{dataCurta(r.pico.data)}</span></span> : '—') },
    { id: 'media', rotulo: 'Média do ciclo', align: 'right', valor: r => r.mediaAno, render: r => fmtNum(r.mediaAno, 2), soDesktop: true },
    { id: 'cenas', rotulo: 'Cenas', align: 'right', valor: r => r.nCenas, render: r => <span>{r.nCenas}{r.nLimpas ? <span style={{ color: COR.mudo }}> ({r.nLimpas} limpas)</span> : null}</span> },
    { id: 'classe', rotulo: 'Situação', valor: r => r.ultima?.media ?? null, soDesktop: true,
      render: r => { const cor = dist.corPorId[r.talhaoId]; const cl = dist.classePorId[r.talhaoId]; return cor && cl && mostrar === 'ultima' ? <SeloCor cor={cor} rotulo={cl} /> : '—'; } },
  ];

  return (
    <div className="space-y-4">
      <GradeKpis>{kpis}</GradeKpis>

      <div className="grid grid-cols-1 md:grid-cols-6 xl:grid-cols-12 gap-4">
        <Cartao className="md:col-span-6 xl:col-span-7" icone={MapaIcone} titulo={`Mapa de ${indice}`}
          sub={um ? (mostrar === 'ultima' ? `Última cena${kp.ultimaData ? ` · ${dataCurta(kp.ultimaData, true)}` : ''}` : `Cena de maior valor do ciclo ${cicloTxt}`) : `Cor = ${indice} ${mostrar === 'ultima' ? 'da última cena' : 'do pico'} de cada talhão · ciclo ${cicloTxt}`}
          extra={<div className="flex flex-wrap items-center gap-2">
            {indices.length > 1 && <Seletor valor={indice} onChange={setIndiceSel} opcoes={indices.map(i => ({ valor: i, rotulo: i }))} rotulo="Índice" />}
            <Seletor valor={mostrar} onChange={v => setMostrar(v as 'ultima' | 'pico')} opcoes={[{ valor: 'ultima', rotulo: 'Última cena' }, { valor: 'pico', rotulo: 'Pico do ciclo' }]} rotulo="Mostrar" />
          </div>}>
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_200px] gap-4 items-start">
            <MiniMapa talhoes={talhoesMapa} corDe={corDe} altura={um ? 300 : 260} nomes={!um}
              rotulo={id => { const c = cenaDoMapa.get(id); return c ? `${indice} ${fmtNum(c.media, 2)} · ${dataCurta(c.data)}` : 'sem cena'; }}
              camadaReal={realNdvi} onClicar={clicar} aria={`Mapa de ${indice}`} />
            <LegendaClasses titulo={indice} itens={legendaItens}
              rodape={usaClasses
                ? `Cor = classe d${mostrar === 'ultima' ? 'a última cena' : 'o pico'} de cada talhão (legenda ${legNdvi?.nome ?? 'NDVI'}).${dist.semDado.n ? ` ${talhoesTxt(dist.semDado.n)} sem cena.` : ''}`
                : `${indice} não tem classes oficiais: a cor compara os talhões entre si (menor → maior).`} />
          </div>
        </Cartao>

        <Cartao className="md:col-span-6 xl:col-span-5" icone={TrendingUp} titulo="Evolução mês a mês"
          sub={comparar === 'safras' ? `${indice} médio por mês · ciclo (jul–jun) contra ciclo` : `${indice} por mês · talhões maiores (até 6) · ciclo ${cicloTxt}`}
          extra={!um && resumos.length > 1 ? <Seletor valor={comparar} onChange={v => setComparar(v as 'safras' | 'talhoes')} opcoes={[{ valor: 'safras', rotulo: 'Ciclo × ciclo' }, { valor: 'talhoes', rotulo: 'Talhão × talhão' }]} rotulo="Comparar" /> : null}>
          {mesesSerie.length === 0 ? <Vazio compacto icone={Satellite} titulo="Sem cenas para a série" /> : (
            <>
              <LinhaSerie categorias={mesesSerie.map(m => MESES_CURTOS[m - 1])} casas={2} area={false}
                series={serie.map(s => ({ id: s.id, rotulo: s.rotulo, cor: s.cor, valores: mesesSerie.map(m => s.valores[m] ?? null) }))} />
              {comparar === 'safras' && serie.length === 1 && <p className="text-[10.5px] mt-1" style={{ color: COR.mudo }}>Só há cenas do ciclo {serie[0].rotulo}; com outro ciclo, as linhas se comparam.</p>}
            </>
          )}
        </Cartao>

        {!um && (
          <Cartao className="md:col-span-6 xl:col-span-5" icone={BarChart3} titulo="Comparação entre talhões" sub={`Pico de ${indice} no ciclo ${cicloTxt} · maior vigor primeiro`}>
            {picos.length === 0 ? <Vazio compacto icone={BarChart3} titulo="Sem cenas nos talhões" /> : (
              <BarraTop itens={picos.slice(0, 12).map(r => ({ id: r.talhaoId, rotulo: r.nome, valor: r.pico!.valor, cor: dist.corPorId[r.talhaoId] }))}
                casas={2} minimo={minBarra} unidade={`${indice} (pico)`}
                extra={{ titulo: 'Área (ha)', valor: it => fmtHaCurto(porId.get(it.id)?.areaHa ?? null) }} onClicar={id => p.setFiltro({ talhao: id })} />
            )}
            {picos.length > 12 && <p className="text-[10.5px] mt-2" style={{ color: COR.mudo }}>Mostrando os 12 de maior pico; a tabela abaixo traz todos.</p>}
          </Cartao>
        )}

        <Cartao className={um ? 'md:col-span-6 xl:col-span-12' : 'md:col-span-6 xl:col-span-7'} icone={ListChecks} titulo={um ? 'Cenas deste talhão' : 'Cenas recentes'}
          sub={um ? `${indice} · ciclo ${cicloTxt} · qual cena merece confiança` : `As ${recentes.length} mais novas · ciclo ${cicloTxt}`}
          rodape={`“Talhão limpo” = quanto da área do talhão está sem nuvem nem sombra. Cenas com menos de ${LIMPO_MIN}% ficam de fora das análises da Invicta.`}>
          <TabelaTalhoes linhas={recentes} colunas={colunasCenas} ordemInicial="data" desc aria="Cenas de satélite" chaveDe={r => r.itemId} onClicar={um ? undefined : id => p.setFiltro({ talhao: id })} />
        </Cartao>

        {!um && resumos.length > 0 && (
          <Cartao className="md:col-span-6 xl:col-span-12" icone={Satellite} titulo="Todos os talhões" sub={`${indice} de cada talhão no ciclo ${cicloTxt} — clique para ver o talhão`}>
            <TabelaTalhoes linhas={resumos} colunas={colunasTalhoes} ordemInicial="pico" desc aria="Índice de vegetação por talhão" onClicar={id => p.setFiltro({ talhao: id })} />
          </Cartao>
        )}
      </div>
    </div>
  );
}
