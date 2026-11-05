'use client';

// Portal do Produtor → Compactação do solo (/portal/compactacao).
//
// A pergunta do produtor: em que profundidade o solo está duro, em quais
// talhões e em quanta área. Penetrometria em MPa, por camada: média, mínimo e
// máximo, % de pontos acima do limite (classes "Alto" e "Muito alto" da
// legenda de Compactação da Biblioteca — a partir de 2,0 MPa na oficial) e os
// talhões com camada crítica. Vale a medição mais recente até a safra do filtro.
//
// Contas: lib/portalPainelSolo (medicaoDoTalhao, perfilPorCamada…).
// O mapa real (raster por camada, na nuvem) segue o pipeline da aba do talhão.

import { useCallback, useMemo, useState } from 'react';
import { Gauge, Layers, AlertTriangle, ArrowDownToLine, Map as MapaIcone, ListChecks, Ruler } from 'lucide-react';
import { rotuloAno } from '@/lib/periodo';
import { cloudCarregarMapa, cloudListarMapasMeta } from '@/lib/cloud';
import { descomprimirGrid, type Grid } from '@/lib/fertilidade';
import { colorirGridComLegenda } from '@/lib/raster';
import type { Legenda } from '@/lib/legendas';
import { distribuirEmClasses } from '@/lib/portalPainel';
import {
  medicaoDoTalhao, camadasDasMedicoes, perfilPorCamada, camadaMaisResistente, limiteCompactacao, classesCriticasCompactacao,
  type MedicaoComp, type PerfilCamada,
} from '@/lib/portalPainelSolo';
import { usePortal } from '../PortalContext';
import { Cartao, Kpi, LegendaClasses, Vazio, MiniMapa, COR, fmtNum, fmtHaCurto, fmtPct, talhoesTxt, plural } from '../ui';
import type { CamadaReal } from '../ui';
import { Abas, NomeTalhao, PilulaClasse, TabelaTalhoes, acaoAbrirTalhao, faixaTxt, useLegendasSolo } from './SoloPecas';

type DocResp = { resp?: { bounds?: [number, number, number, number]; grid?: Grid } };

/** Raster de UMA camada (`compactacao__${talhão}__${importação}__${prof}`), na legenda de Compactação. */
function camadaCompactacao(talhaoId: string, importacaoId: string, prof: string, leg: Legenda): CamadaReal {
  const prefixo = `compactacao__${talhaoId}__${importacaoId}__`;
  const mapaId = `${prefixo}${prof}`;
  return {
    chave: `comp:${mapaId}:${leg.id}`,
    carregar: async () => {
      // Listagem leve primeiro: sem o item, não há mapa (e não baixa nada).
      const meta = (await cloudListarMapasMeta(prefixo)).find(m => m.id === mapaId);
      if (!meta) return null;
      const doc = await cloudCarregarMapa<DocResp>(mapaId, meta.atualizadoEm);
      const resp = doc?.dados?.resp;
      if (!resp?.grid || !resp.bounds) return null;
      let grid: Grid | null = null;
      try { grid = resp.grid.comp === 'gz' ? await descomprimirGrid(resp.grid) : resp.grid; } catch { grid = null; }
      return grid ? { tipo: 'raster', url: colorirGridComLegenda(grid, leg).dataUrl, bounds: resp.bounds } : null;
    },
  };
}

/** Fora do plano ('compactacao'), a rota é barrada pela GuardaPlano do shell. */
export function PaginaCompactacao() {
  return <Conteudo />;
}

function Conteudo() {
  const p = usePortal();
  const { dados, ano } = p;
  const um = !!p.talhao;
  const anoTxt = rotuloAno(p.safra);
  const legs = useLegendasSolo();
  const leg = legs.compactacao;
  const classes = useMemo(() => leg?.classes ?? [], [leg]);
  const unid = leg?.unidade || 'MPa';
  const limite = useMemo(() => limiteCompactacao(classes), [classes]);
  const critSet = useMemo(() => classesCriticasCompactacao(classes), [classes]);

  const medicoes = useMemo(() => dados.flatMap(d => { const m = medicaoDoTalhao(d, ano, classes); return m ? [m] : []; }), [dados, ano, classes]);
  const camadas = useMemo(() => camadasDasMedicoes(medicoes), [medicoes]);
  const perfil = useMemo(() => perfilPorCamada(medicoes, classes), [medicoes, classes]);
  const pior = useMemo(() => camadaMaisResistente(perfil), [perfil]);

  // Camada do mapa: a escolhida; senão, a mais resistente (onde está o problema).
  const [sel, setSel] = useState('');
  const camada = camadas.includes(sel) ? sel : (pior?.prof ?? camadas[0] ?? '');
  const perfilSel = perfil.find(c => c.prof === camada) ?? null;

  const mediaDe = useMemo(() => new Map(medicoes.map(m => [m.talhaoId, m.camadas.find(c => c.prof === camada) ?? null])), [medicoes, camada]);
  const dist = useMemo(() => distribuirEmClasses(dados.map(d => ({ id: d.talhao.id, valor: mediaDe.get(d.talhao.id)?.media ?? null, areaHa: d.talhao.areaHa })), classes), [dados, mediaDe, classes]);
  const criticos = medicoes.filter(m => m.criticas.length > 0);
  const areaMedida = medicoes.reduce((s, m) => s + m.areaHa, 0);
  const areaCritica = criticos.reduce((s, m) => s + m.areaHa, 0);
  const areaFiltro = dados.reduce((s, d) => s + (Number.isFinite(d.talhao.areaHa) ? d.talhao.areaHa : 0), 0);
  const anosMed = medicoes.map(m => m.ano).filter((a): a is number => a != null);
  const medUm: MedicaoComp | null = um ? medicoes[0] ?? null : null;

  const talhoesMapa = useMemo(() => dados.map(d => ({ id: d.talhao.id, nome: d.talhao.nome, geojson: d.talhao.geojson })), [dados]);
  const medDe = useMemo(() => new Map(medicoes.map(m => [m.talhaoId, m])), [medicoes]);
  const real = useCallback((id: string) => { const m = medDe.get(id); return m && leg && camada ? camadaCompactacao(id, m.importacaoId, camada, leg) : null; }, [medDe, leg, camada]);
  const clicar = useCallback((id: string) => (um ? p.abrirTalhao(id, 'compactacao') : p.setFiltro({ talhao: id })), [um, p]);

  if (!leg) return <Vazio icone={Gauge} titulo="Sem legenda de compactação" texto="A Biblioteca não tem legenda de Compactação cadastrada, então as classes não podem ser mostradas." />;
  if (!medicoes.length) {
    return <Vazio icone={Gauge} titulo={`Sem medição de compactação até ${anoTxt}`} texto={um ? 'Este talhão ainda não tem penetrometria importada.' : `Nenhum talhão no filtro tem penetrometria importada${p.cultura ? ` (${p.cultura})` : ''}.`} />;
  }

  return (
    <div className="space-y-4">
      <Abas valor={camada} onChange={setSel} rotulo="Camada do solo" opcoes={camadas.map(c => ({ valor: c, rotulo: `${c} cm`, sub: c === pior?.prof ? 'mais dura' : undefined }))} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi icone={Layers} tom="azul" rotulo={um ? 'Pontos medidos' : 'Talhões medidos'} valor={um ? String(medUm?.nPontos ?? 0) : fmtHaCurto(areaMedida)} unidade={um ? 'pontos' : 'ha'}
          sub={um ? `${medUm?.levantamento || 'penetrometria'} · ${medUm?.ano ?? '—'}` : `${talhoesTxt(medicoes.length)} de ${dados.length}${anosMed.length ? ` · medições de ${Math.min(...anosMed) === Math.max(...anosMed) ? anosMed[0] : `${Math.min(...anosMed)}–${Math.max(...anosMed)}`}` : ''}`} />
        <Kpi icone={Gauge} tom="verde" rotulo={`Resistência média · ${camada} cm`} valor={perfilSel ? fmtNum(perfilSel.media, 2) : null} unidade={unid}
          sub={perfilSel ? <PilulaClasse nome={perfilSel.classe} cor={perfilSel.cor} /> : undefined} vazio="sem medição nesta camada" />
        <Kpi icone={ArrowDownToLine} tom="ambar" rotulo="Camada mais dura" valor={pior ? `${pior.prof}` : null} unidade="cm"
          sub={pior ? `${fmtNum(pior.media, 2)} ${unid} · ${fmtNum(pior.pctCritico, 0)}% dos pontos acima de ${limite != null ? fmtNum(limite, 1) : '—'}` : undefined} vazio="sem medição" />
        <Kpi icone={AlertTriangle} tom={criticos.length ? 'ambar' : 'verde'} rotulo={um ? 'Camada crítica' : 'Talhões com camada crítica'}
          valor={um ? String(medUm?.criticas.length ?? 0) : String(criticos.length)} unidade={um ? ((medUm?.criticas.length ?? 0) === 1 ? 'camada' : 'camadas') : undefined}
          sub={um ? (medUm?.criticas.length ? `${medUm.criticas.join(', ')} cm · média acima de ${limite != null ? fmtNum(limite, 1) : '—'} ${unid}` : 'nenhuma camada acima do limite') : `${fmtHaCurto(areaCritica)} ha · ${fmtPct(areaFiltro ? (areaCritica / areaFiltro) * 100 : 0, 0)} da área`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 xl:grid-cols-12 gap-4">
        <Cartao className="md:col-span-6 xl:col-span-7" icone={MapaIcone} titulo={`Mapa de resistência · ${camada} cm`}
          sub={um ? `Penetrometria de ${medUm?.ano ?? '—'}` : 'Média de cada talhão na camada — a medição mais recente de cada um'}
          acao={um ? acaoAbrirTalhao(p, 'compactacao') : null}>
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_230px] gap-4 items-start">
            <MiniMapa talhoes={talhoesMapa} corDe={id => dist.corPorId[id] ?? null} altura={um ? 300 : 280} nomes={!um}
              rotulo={id => { const c = mediaDe.get(id); return c ? `${fmtNum(c.media, 2)} ${unid} · ${c.classe ?? ''}` : 'sem medição'; }}
              camadaReal={real} onClicar={clicar} aria="Mapa de resistência do solo" />
            <LegendaClasses titulo={`Resistência (${unid})`}
              itens={dist.classes.map(c => ({ cor: c.cor, rotulo: `${c.nome} ${faixaTxt(c, 1)}`, pct: um ? null : c.pct, ha: um ? null : c.ha, apagado: c.n === 0, sub: critSet?.has(c.nome) ? 'crítica' : undefined }))}
              rodape={um
                ? `Média do talhão na camada: ${perfilSel ? fmtNum(perfilSel.media, 2) : '—'} ${unid} (${perfilSel?.classe ?? '—'}). Classes da legenda ${leg.nome}.`
                : `Cor = classe da média de cada talhão (legenda ${leg.nome}).${dist.semDado.n ? ` ${talhoesTxt(dist.semDado.n)} sem medição.` : ''}`} />
          </div>
        </Cartao>

        <Cartao className="md:col-span-6 xl:col-span-5" icone={Ruler} titulo="Resistência por camada" sub={`${um ? 'Pontos do talhão' : 'Média ponderada pela área'} · barra = média, traço = mínimo a máximo`}>
          <PerfilCamadas perfil={perfil} limite={limite} unid={unid} selecionada={camada} onSelecionar={setSel} />
        </Cartao>

        <Cartao className="md:col-span-6 xl:col-span-12" icone={ListChecks} titulo={um ? `${p.talhao?.nome}: camada a camada` : `Compactação por talhão · ${camada} cm`}
          sub={um ? 'Média, mínimo e máximo dos pontos e % acima do limite' : 'Do mais duro para o menos duro — clique para abrir o painel do talhão'}>
          {um && medUm ? (
            <TabelaTalhoes aria="Compactação por camada" minLargura={520}
              linhas={medUm.camadas.map(c => ({ talhaoId: c.prof, ...c }))}
              colunas={[
                { id: 'c', titulo: 'Camada', render: l => <strong>{l.prof} cm</strong> },
                { id: 'm', titulo: `Média (${unid})`, alinhar: 'right', render: l => <strong className="tabular-nums">{fmtNum(l.media, 2)}</strong> },
                { id: 'mm', titulo: 'Mín – máx', alinhar: 'right', render: l => <span className="tabular-nums" style={{ color: COR.texto2 }}>{fmtNum(l.min, 2)} – {fmtNum(l.max, 2)}</span> },
                { id: 'cl', titulo: 'Classe', render: l => <PilulaClasse nome={l.classe} cor={l.cor} /> },
                { id: 'pc', titulo: `% pontos > ${limite != null ? fmtNum(limite, 1) : '—'}`, alinhar: 'right', render: l => <span className="tabular-nums font-bold" style={{ color: l.pctCritico > 0 ? COR.ambar : COR.texto2 }}>{fmtNum(l.pctCritico, 0)}%</span> },
                { id: 'n', titulo: 'Pontos', alinhar: 'right', sohDesktop: true, render: l => <span className="tabular-nums" style={{ color: COR.texto2 }}>{l.n}</span> },
              ]} />
          ) : (
            <TabelaTalhoes aria="Compactação por talhão" onClicar={clicar} minLargura={680}
              linhas={[...medicoes].sort((a, b) => (mediaDe.get(b.talhaoId)?.media ?? -1) - (mediaDe.get(a.talhaoId)?.media ?? -1))}
              colunas={[
                { id: 'n', titulo: 'Talhão', render: l => <NomeTalhao nome={l.nome} sub={`${fmtHaCurto(l.areaHa)} ha`} /> },
                { id: 'a', titulo: 'Medição', alinhar: 'center', render: l => <span className="tabular-nums" style={{ color: COR.texto2 }}>{l.ano ?? '—'} · {plural(l.nPontos, 'ponto', 'pontos')}</span> },
                { id: 'm', titulo: `Média ${camada} (${unid})`, alinhar: 'right', render: l => { const c = mediaDe.get(l.talhaoId); return c ? <strong className="tabular-nums">{fmtNum(c.media, 2)}</strong> : <span style={{ color: COR.mudo }}>não medida</span>; } },
                { id: 'mm', titulo: 'Mín – máx', alinhar: 'right', sohDesktop: true, render: l => { const c = mediaDe.get(l.talhaoId); return c ? <span className="tabular-nums" style={{ color: COR.texto2 }}>{fmtNum(c.min, 2)} – {fmtNum(c.max, 2)}</span> : '—'; } },
                { id: 'cl', titulo: 'Classe', render: l => { const c = mediaDe.get(l.talhaoId); return <PilulaClasse nome={c?.classe ?? null} cor={c?.cor ?? null} />; } },
                { id: 'cr', titulo: 'Camada crítica', render: l => (l.criticas.length
                  ? <span className="font-bold whitespace-nowrap" style={{ color: COR.ambar }}>{l.criticas.join(', ')} cm</span> : <span style={{ color: COR.mudo }}>nenhuma</span>) },
              ]} />
          )}
        </Cartao>
      </div>
    </div>
  );
}

/** Perfil do solo: uma barra por camada (mais rasa em cima), traço de mín–máx e a linha do limite. */
function PerfilCamadas({ perfil, limite, unid, selecionada, onSelecionar }: {
  perfil: PerfilCamada[]; limite: number | null; unid: string; selecionada: string; onSelecionar: (prof: string) => void;
}) {
  if (!perfil.length) return <Vazio compacto icone={Gauge} titulo="Sem medição" />;
  const max = Math.max(...perfil.map(c => c.max), limite ?? 0) * 1.08 || 1;
  const W = 420, esq = 62, dir = 12, topo = 8, linha = 38, H = topo + perfil.length * linha + 24;
  const x = (v: number) => esq + (v / max) * (W - esq - dir);
  const passo = max > 6 ? 2 : max > 3 ? 1 : 0.5;
  const ticks = Array.from({ length: Math.floor(max / passo) + 1 }, (_, i) => i * passo);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Resistência à penetração por camada" style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={topo} y2={H - 20} stroke={COR.borda} strokeDasharray={t === 0 ? undefined : '3 4'} />
            <text x={x(t)} y={H - 6} textAnchor="middle" fontSize={10.5} fill={COR.texto2}>{fmtNum(t, passo < 1 ? 1 : 0)}</text>
          </g>
        ))}
        {perfil.map((c, i) => {
          const y = topo + i * linha;
          const sel = c.prof === selecionada;
          return (
            <g key={c.prof} onClick={() => onSelecionar(c.prof)} style={{ cursor: 'pointer' }}>
              <title>{`${c.prof} cm: média ${fmtNum(c.media, 2)} ${unid} (${c.classe ?? '—'}) · mín ${fmtNum(c.min, 2)} · máx ${fmtNum(c.max, 2)} · ${fmtNum(c.pctCritico, 0)}% dos pontos acima do limite`}</title>
              {sel && <rect x={0} y={y - 2} width={W} height={linha - 4} rx={8} fill="color-mix(in srgb, var(--invicta-green) 9%, transparent)" />}
              <text x={esq - 8} y={y + 14} textAnchor="end" fontSize={11.5} fontWeight={sel ? 800 : 600} fill={COR.texto}>{c.prof}</text>
              <text x={esq - 8} y={y + 26} textAnchor="end" fontSize={9.5} fill={COR.mudo}>cm</text>
              <rect x={x(0)} y={y + 4} width={Math.max(2, x(c.media) - x(0))} height={16} rx={5} fill={c.cor ?? 'var(--invicta-blue-mid)'} />
              <line x1={x(c.min)} x2={x(c.max)} y1={y + 12} y2={y + 12} stroke={COR.texto} strokeWidth={1.6} opacity={0.75} />
              <line x1={x(c.min)} x2={x(c.min)} y1={y + 8} y2={y + 16} stroke={COR.texto} strokeWidth={1.6} opacity={0.75} />
              <line x1={x(c.max)} x2={x(c.max)} y1={y + 8} y2={y + 16} stroke={COR.texto} strokeWidth={1.6} opacity={0.75} />
              <text x={Math.min(W - dir, x(c.max) + 6)} y={y + 16} fontSize={11} fontWeight={800} fill={COR.texto} textAnchor={x(c.max) + 40 > W ? 'end' : 'start'}>{fmtNum(c.media, 2)}</text>
            </g>
          );
        })}
        {limite != null && (
          <g>
            <line x1={x(limite)} x2={x(limite)} y1={topo} y2={H - 20} stroke={COR.vermelho} strokeWidth={1.8} strokeDasharray="5 3" />
            <text x={x(limite) + 4} y={topo + 8} fontSize={10} fontWeight={700} fill={COR.vermelho}>limite {fmtNum(limite, 1)}</text>
          </g>
        )}
      </svg>
      <p className="text-[10.5px] mt-1" style={{ color: COR.mudo }}>{unid} · clique numa camada para ver o mapa dela. Acima do limite o solo restringe a raiz.</p>
    </div>
  );
}
