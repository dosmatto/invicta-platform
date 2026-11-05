'use client';

// Portal do Produtor → Zonas de manejo (/portal/zonas).
//
// A pergunta do produtor: como meu talhão se divide em ambientes de produção,
// quanto de cada um e o que já foi prescrito em cima disso. O mapa é VETORIAL
// (zoneamento padrão vigente > o mais recente > espelho talhao.zonasGeojson,
// via lib/portalDados zonasGeojsonDoTalhao): aparece sempre, sem nuvem e sem
// baixar raster. Sem getZoneamentosMeap (ele grava).
//
// Contas: lib/portalPainelSolo (zonasPorTalhao, prescricoesVigentes) e
// lib/portalPainel (resumoZonas, kpisPainel).

import { useCallback, useMemo } from 'react';
import { Shapes, Map as MapaIcone, Layers, Trophy, Tractor, ListChecks, Grid3x3 } from 'lucide-react';
import { rotuloAno } from '@/lib/periodo';
import { kpisPainel } from '@/lib/portalPainel';
import { fmtRel } from '@/lib/prescricao/resumo';
import { zonasPorTalhao, potencialDaZona, prescricoesVigentes, resumirPrescricao, type ZonasDoTalhao } from '@/lib/portalPainelSolo';
import { usePortal } from '../PortalContext';
import { Cartao, Kpi, LegendaClasses, Vazio, MiniMapa, camadaZonas, COR, fmtNum, fmtHaCurto, fmtPct, talhoesTxt, plural } from '../ui';
import { BarraEmpilhada, NomeTalhao, TabelaTalhoes, acaoAbrirTalhao } from './SoloPecas';
import { zonasDoTalhaoPorId } from '@/lib/portalDados';

export function PaginaZonas() {
  const p = usePortal();
  const { dados, ano } = p;
  const um = !!p.talhao;
  const anoTxt = rotuloAno(p.safra);
  const libRec = p.liberada('recomendacoes');

  const z = useMemo(() => zonasPorTalhao(dados, ano), [dados, ano]);
  const kpis = useMemo(() => kpisPainel(dados, ano, p.cultura, p.dadosEscopo), [dados, ano, p.cultura, p.dadosEscopo]);
  const comZonas = z.talhoes.filter(t => t.nZonas > 0);
  const semZonas = z.talhoes.filter(t => t.nZonas === 0);
  const areaTotal = kpis.areaTotal;
  const melhor = z.geral.find(g => potencialDaZona(g.chave) === 'alto') ?? null;
  const talhaoUm: ZonasDoTalhao | null = um ? z.talhoes[0] ?? null : null;

  // Quantos talhões têm cada zona (a coluna "Talhões" do quadro zona a zona).
  const talhoesPorZona = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of z.talhoes) for (const pt of t.partes) m.set(pt.chave, (m.get(pt.chave) ?? 0) + 1);
    return m;
  }, [z]);

  // Prescrições vigentes dos talhões no filtro (o elo zonas → prescrição).
  const prescricoes = useMemo(() => dados.flatMap(d => prescricoesVigentes(d, ano).map(x => resumirPrescricao(x, d.talhao.nome))), [dados, ano]);
  const talhoesComPresc = useMemo(() => new Set(prescricoes.map(x => x.talhaoId)).size, [prescricoes]);

  // ── Mapa ──
  const talhoesMapa = useMemo(() => dados.map(d => ({ id: d.talhao.id, nome: d.talhao.nome, geojson: d.talhao.geojson })), [dados]);
  const domDe = useMemo(() => new Map(z.talhoes.map(t => [t.talhaoId, t.dominante])), [z]);
  const real = useCallback((id: string) => camadaZonas(id, zonasDoTalhaoPorId(p.talhoes, id)), [p.talhoes]);
  const clicar = useCallback((id: string) => (um ? p.abrirTalhao(id, 'zonas') : p.setFiltro({ talhao: id })), [um, p]);

  const kpiCards = [
    <Kpi key="a" icone={Layers} tom="azul" rotulo={um ? 'Área zoneada' : 'Área com zonas'} valor={comZonas.length ? fmtHaCurto(z.areaGeral) : null} unidade="ha"
      sub={areaTotal ? `${fmtPct(areaTotal ? (comZonas.reduce((s, t) => s + t.areaHa, 0) / areaTotal) * 100 : 0, 0)} da área do filtro` : undefined} vazio="nenhum talhão com zoneamento" />,
    <Kpi key="b" icone={Grid3x3} tom="verde" rotulo={um ? 'Zonas do talhão' : 'Talhões zoneados'} valor={um ? (talhaoUm?.nZonas ? String(talhaoUm.nZonas) : null) : comZonas.length ? `${comZonas.length}` : null}
      unidade={um ? (talhaoUm?.nZonas === 1 ? 'zona' : 'zonas') : `de ${dados.length}`}
      sub={um ? `${z.geral.length} classes de potencial` : semZonas.length ? `${talhoesTxt(semZonas.length)} sem zoneamento` : 'todos com zoneamento'} vazio="sem zoneamento" />,
    <Kpi key="c" icone={Trophy} tom="ambar" rotulo="Zona de maior potencial" valor={melhor ? fmtHaCurto(melhor.ha) : null} unidade="ha"
      sub={melhor ? `${fmtPct(melhor.pct, 0)} da área zoneada · ${melhor.rotulo.toLowerCase()}` : undefined} vazio={z.geral.length ? 'zonas numeradas, sem classe de potencial' : 'sem zoneamento'} />,
    ...(libRec ? [
      <Kpi key="d" icone={Tractor} tom="roxo" rotulo="Com prescrição VR" valor={talhoesComPresc ? String(talhoesComPresc) : null} unidade={talhoesComPresc ? (talhoesComPresc === 1 ? 'talhão' : 'talhões') : undefined}
        sub={`${plural(prescricoes.length, 'prescrição', 'prescrições')} em ${anoTxt}`} vazio={`sem prescrição em ${anoTxt}`} />,
    ] : []),
  ];

  return (
    <div className="space-y-4">
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${kpiCards.length === 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3'} gap-3`}>{kpiCards.map((k, i) => <div key={i} className="min-w-0 grid">{k}</div>)}</div>

      {z.geral.length === 0 ? (
        <Vazio icone={Shapes} titulo="Sem zonas de manejo" texto={um ? 'Este talhão ainda não tem zoneamento.' : `Nenhum talhão no filtro tem zoneamento${p.cultura ? ` (${p.cultura})` : ''}.`} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-6 xl:grid-cols-12 gap-4">
          <Cartao className="md:col-span-6 xl:col-span-7" icone={MapaIcone} titulo="Mapa das zonas de manejo"
            sub={um ? `${talhaoUm?.nome} · zonas do padrão vigente` : `${talhoesTxt(comZonas.length)} · zonas do padrão vigente de cada talhão`}
            acao={um ? acaoAbrirTalhao(p, 'zonas') : libRec ? { rotulo: 'Ver prescrição (VR)', href: p.hrefPortal('/portal/prescricoes') } : null}>
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_220px] gap-4 items-start">
              <MiniMapa talhoes={talhoesMapa} corDe={id => domDe.get(id)?.cor ?? null} altura={um ? 320 : 300} nomes={!um} modo="real"
                rotulo={id => { const t = z.talhoes.find(x => x.talhaoId === id); return t?.nZonas ? `${plural(t.nZonas, 'zona', 'zonas')} · ${fmtHaCurto(t.areaZonas)} ha` : 'sem zoneamento'; }}
                camadaReal={real} onClicar={clicar} aria="Mapa das zonas de manejo" />
              <LegendaClasses titulo="Zonas"
                itens={z.geral.map(g => ({ cor: g.cor, rotulo: g.rotulo, pct: g.pct, ha: g.ha, sub: potencialDaZona(g.chave) ? `potencial ${potencialDaZona(g.chave)}` : undefined }))}
                rodape={`% da área zoneada (${fmtHaCurto(z.areaGeral)} ha).${semZonas.length ? ` ${talhoesTxt(semZonas.length)} sem zoneamento.` : ''}`} />
            </div>
          </Cartao>

          <Cartao className="md:col-span-6 xl:col-span-5" icone={ListChecks} titulo={um ? 'Zonas deste talhão' : 'Zonas por talhão'}
            sub={um ? 'Área e potencial de cada zona' : 'Composição de cada talhão — clique para abrir o painel dele'}>
            {um && talhaoUm ? (
              <TabelaTalhoes aria="Zonas do talhão" minLargura={360}
                linhas={talhaoUm.partes.map(pt => ({ talhaoId: pt.chave, ...pt }))}
                colunas={[
                  { id: 'z', titulo: 'Zona', render: l => <span className="inline-flex items-center gap-1.5 font-bold"><span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: l.cor }} />{l.rotulo}</span> },
                  { id: 'pot', titulo: 'Potencial', render: l => <span style={{ color: COR.texto2 }}>{potencialDaZona(l.chave) ?? '—'}</span> },
                  { id: 'ha', titulo: 'Área (ha)', alinhar: 'right', render: l => <span className="tabular-nums">{fmtNum(l.ha, 1)}</span> },
                  { id: 'pct', titulo: '%', alinhar: 'right', render: l => <strong className="tabular-nums">{fmtNum(l.pct, 1)}%</strong> },
                ]} />
            ) : (
              <TabelaTalhoes aria="Zonas por talhão" onClicar={clicar} minLargura={340}
                linhas={[...z.talhoes].sort((a, b) => b.areaZonas - a.areaZonas || a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }))}
                colunas={[
                  { id: 'n', titulo: 'Talhão', render: l => <NomeTalhao nome={l.nome} sub={l.nZonas ? undefined : 'sem zoneamento'} /> },
                  { id: 'c', titulo: 'Composição', render: l => <BarraEmpilhada partes={l.partes.map(pt => ({ cor: pt.cor, pct: pt.ha, titulo: `${pt.rotulo}: ${fmtNum(pt.pct, 0)}% · ${fmtNum(pt.ha, 1)} ha` }))} /> },
                  { id: 'a', titulo: 'Área (ha)', alinhar: 'right', render: l => <span className="tabular-nums" style={{ color: COR.texto2 }}>{l.nZonas ? fmtHaCurto(l.areaZonas) : '—'}</span> },
                ]} />
            )}
          </Cartao>

          {!um && (
            <Cartao className={libRec ? 'md:col-span-6 xl:col-span-7' : 'md:col-span-6 xl:col-span-12'} icone={Shapes} titulo="Zona a zona" sub="Quanto de cada zona há na propriedade, e em quantos talhões ela aparece">
              <TabelaTalhoes aria="Zona a zona" minLargura={460}
                linhas={z.geral.map(g => ({ talhaoId: g.chave, ...g }))}
                colunas={[
                  { id: 'z', titulo: 'Zona', render: l => <span className="inline-flex items-center gap-1.5 font-bold"><span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: l.cor }} />{l.rotulo}</span> },
                  { id: 'pot', titulo: 'Potencial', render: l => <span style={{ color: COR.texto2 }}>{potencialDaZona(l.chave) ?? '—'}</span> },
                  { id: 'ha', titulo: 'Área (ha)', alinhar: 'right', render: l => <span className="tabular-nums">{fmtNum(l.ha, 1)}</span> },
                  { id: 'pct', titulo: '% da área zoneada', alinhar: 'right', render: l => <strong className="tabular-nums">{fmtNum(l.pct, 1)}%</strong> },
                  { id: 'tal', titulo: 'Talhões', alinhar: 'right', render: l => <span className="tabular-nums" style={{ color: COR.texto2 }}>{talhoesPorZona.get(l.chave) ?? 0}</span> },
                ]} />
            </Cartao>
          )}

          {libRec && (
            <Cartao className={um ? 'md:col-span-6 xl:col-span-12' : 'md:col-span-6 xl:col-span-5'} icone={Tractor} titulo="Prescrição em taxa variável" sub={`O que já foi prescrito sobre as zonas em ${anoTxt}`}
              acao={{ rotulo: 'Ver prescrições', href: p.hrefPortal('/portal/prescricoes') }}>
              {prescricoes.length === 0 ? (
                <Vazio compacto icone={Tractor} titulo={`Sem prescrição em ${anoTxt}`} texto="Quando a Invicta gerar a prescrição das zonas, ela aparece aqui e na página Prescrições." />
              ) : (
                <ul className="space-y-1.5">
                  {prescricoes.slice(0, 6).map(x => (
                    <li key={x.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-xs" style={{ background: COR.superficie2 }}>
                      <span className="min-w-0"><strong className="block truncate">{x.produto || x.nome}</strong><span className="block truncate" style={{ color: COR.texto2 }}>{x.talhaoNome} · {fmtHaCurto(x.areaHa)} ha</span></span>
                      <span className="tabular-nums font-extrabold whitespace-nowrap">{x.doseMedia != null ? `${fmtRel(x.doseMedia)} ${x.unidade}` : '—'}</span>
                    </li>
                  ))}
                  {prescricoes.length > 6 && <li className="text-[11px] px-1" style={{ color: COR.mudo }}>e mais {prescricoes.length - 6}…</li>}
                </ul>
              )}
            </Cartao>
          )}
        </div>
      )}
    </div>
  );
}
