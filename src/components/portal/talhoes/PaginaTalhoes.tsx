'use client';

// Página Talhões do portal: a lista dos talhões com os números de cada um
// (produtividade do ano, P e V% da última análise com a classe, zonas e o que
// mais existe) e a matriz talhão × ano. Clicar no talhão abre a VISÃO do
// talhão no portal (Visão geral com o filtro); "Página do talhão" abre a
// página completa da plataforma.

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Grid3x3, FlaskConical, BarChart3, Shapes, Zap, Mountain, Satellite, Sprout, ExternalLink, ArrowRight } from 'lucide-react';
import { getLegendas } from '@/lib/store';
import { classeDoValor, corCheiaDaClasse } from '@/lib/legendas';
import { legendaPadraoDe } from '@/lib/processarFertilidade';
import { legendaDaCultura } from '@/lib/produtividade';
import { rotuloAno } from '@/lib/periodo';
import { resumoPorTalhao, projetarMapa, classesEmSacas, type ResumoTalhao } from '@/lib/portalPainel';
import { fmtScHa } from '@/lib/portalUnidade';
import { usePortal } from '../PortalContext';
import { Kpi, Seletor, Vazio, COR, fmtNum, fmtHaCurto, fmtPct, nomeLegivel, suave, talhoesTxt } from '../ui';
import { MatrizTalhaoAno } from './MatrizTalhaoAno';

type Ordem = 'nome' | 'prod' | 'area' | 'p';
const ORDENS: Array<{ valor: Ordem; rotulo: string }> = [
  { valor: 'nome', rotulo: 'Por nome' },
  { valor: 'prod', rotulo: 'Maior produtividade' },
  { valor: 'area', rotulo: 'Maior área' },
  { valor: 'p', rotulo: 'Menor P primeiro' },
];

function Silhueta({ geojson, cor }: { geojson?: string | null; cor: string }) {
  const proj = useMemo(() => projetarMapa([{ id: 'x', geojson }], 120, 84, 6), [geojson]);
  const f = proj.formas[0];
  return (
    <svg viewBox={proj.viewBox} className="w-[88px] h-[62px] flex-shrink-0 rounded-lg" style={{ background: 'var(--p-mapa-fundo)' }} aria-hidden>
      {f && <path d={f.d} fill={cor} fillOpacity={0.85} stroke="var(--p-contorno)" strokeWidth={1.5} fillRule="evenodd" />}
    </svg>
  );
}

function Selo({ on, icone: Icone, rotulo }: { on: boolean; icone: typeof Zap; rotulo: string }) {
  return (
    <span title={`${rotulo}: ${on ? 'sim' : 'não'}`} className="inline-flex items-center gap-1 h-6 px-1.5 rounded-md text-[10.5px] font-semibold"
      style={on ? { background: suave('var(--invicta-green)', 13), color: 'var(--p-verde-texto)' } : { background: COR.superficie2, color: COR.mudo }}>
      <Icone size={11} />{rotulo}
    </span>
  );
}

export function PaginaTalhoes() {
  const p = usePortal();
  const [ordem, setOrdem] = useState<Ordem>('nome');
  const [aba, setAba] = useState<'lista' | 'matriz'>('lista');
  const anoTxt = rotuloAno(p.safra);
  const resumos = useMemo(() => resumoPorTalhao(p.dados, p.ano, p.cultura), [p.dados, p.ano, p.cultura]);
  const legs = useMemo(() => { const t = getLegendas(); return { p: legendaPadraoDe(t, 'p'), v: legendaPadraoDe(t, 'v') }; }, []);
  const ordenados = useMemo(() => [...resumos].sort((a, b) => {
    if (ordem === 'prod') return (b.prodScHa ?? -1) - (a.prodScHa ?? -1);
    if (ordem === 'area') return b.areaHa - a.areaHa;
    if (ordem === 'p') return (a.p ?? Infinity) - (b.p ?? Infinity);
    return a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true });
  }), [resumos, ordem]);
  const area = resumos.reduce((s, r) => s + r.areaHa, 0);
  const comAnalise = resumos.filter(r => r.anoAnalise != null && p.ano != null && p.ano - r.anoAnalise < 3);
  const comColheita = resumos.filter(r => r.prodScHa != null);
  const comZonas = resumos.filter(r => r.nZonas > 0);
  const soma = (l: ResumoTalhao[]) => l.reduce((s, r) => s + r.areaHa, 0);
  const libFert = p.liberada('fertilidade'), libProd = p.liberada('produtividade');
  const fazendaNome = (id: string) => nomeLegivel(p.fazendas.find(f => f.id === id)?.nome ?? '');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi icone={Grid3x3} tom="verde" rotulo="Talhões" valor={String(resumos.length)} sub={`${fmtHaCurto(area)} ha${p.fazendas.length > 1 && !p.fazendaId ? ` em ${p.fazendas.length} fazendas` : ''}`} />
        {libFert && <Kpi icone={FlaskConical} tom="azul" rotulo="Análise de solo recente" valor={comAnalise.length ? fmtHaCurto(soma(comAnalise)) : null} unidade="ha"
          sub={`${talhoesTxt(comAnalise.length)} · últimos 3 anos · ${fmtPct(area ? (soma(comAnalise) / area) * 100 : 0, 0)}`} vazio="nenhuma análise nos últimos 3 anos" />}
        {libProd && <Kpi icone={BarChart3} tom="ambar" rotulo={`Colheita em ${anoTxt}`} valor={comColheita.length ? fmtHaCurto(soma(comColheita)) : null} unidade="ha"
          sub={talhoesTxt(comColheita.length)} vazio={`sem mapa de colheita em ${anoTxt}`} />}
        <Kpi icone={Shapes} tom="roxo" rotulo="Com zonas de manejo" valor={comZonas.length ? fmtHaCurto(soma(comZonas)) : null} unidade="ha" sub={talhoesTxt(comZonas.length)} vazio="sem zoneamento" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl p-1" style={{ background: COR.superficie2, border: `1px solid ${COR.borda}` }} role="tablist">
          {([['lista', 'Talhões'], ['matriz', 'Ano a ano']] as const).map(([id, rot]) => (
            <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)} className="h-8 px-4 rounded-lg text-xs font-bold"
              style={aba === id ? { background: COR.superficie, color: COR.texto, boxShadow: COR.sombra } : { color: COR.texto2 }}>{rot}</button>
          ))}
        </div>
        {aba === 'lista' && <Seletor valor={ordem} onChange={v => setOrdem(v as Ordem)} opcoes={ORDENS} rotulo="Ordenar" />}
      </div>

      {aba === 'matriz' ? (
        <MatrizTalhaoAno dados={p.dados} fazendas={p.fazendas} safras={p.safras} abrir={(id, a, ano) => p.abrirTalhao(id, a, { novaAba: true, ano })} />
      ) : ordenados.length === 0 ? (
        <Vazio icone={Grid3x3} titulo="Nenhum talhão no filtro" texto={p.cultura ? `Nenhum talhão de ${p.cultura} em ${anoTxt}.` : 'Os talhões cadastrados aparecem aqui.'} />
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
          {ordenados.map(r => {
            const legProd = r.cultura ? legendaDaCultura(r.cultura) : undefined;
            const cProd = r.prodScHa != null && legProd ? classeDoValor(r.prodScHa, classesEmSacas(legProd.classes)) : undefined;
            const cP = r.p != null && legs.p ? classeDoValor(r.p, legs.p.classes) : undefined;
            const cV = r.v != null && legs.v ? classeDoValor(r.v, legs.v.classes) : undefined;
            const t = p.dados.find(d => d.talhao.id === r.talhaoId)?.talhao;
            return (
              <li key={r.talhaoId} className="rounded-2xl p-3.5 flex flex-col gap-3" style={{ background: COR.superficie, border: `1px solid ${COR.borda}`, boxShadow: COR.sombra }}>
                <div className="flex items-start gap-3">
                  {/* Cor da classe de produtividade; sem colheita (ou sem legenda) fica no cinza
                      "sem dado" — verde ao lado das classes leria como "bom". */}
                  <Silhueta geojson={t?.geojson} cor={cProd ? corCheiaDaClasse(cProd) : COR.semDado} />
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-extrabold leading-tight truncate">{r.nome}</p>
                    <p className="text-xs mt-0.5 truncate" style={{ color: COR.texto2 }}>
                      {fmtHaCurto(r.areaHa)} ha{p.fazendas.length > 1 ? ` · ${fazendaNome(r.fazendaId)}` : ''}{r.cultura ? ` · ${r.cultura}` : ''}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      <Selo on={r.nZonas > 0} icone={Shapes} rotulo={r.nZonas ? `${r.nZonas} zonas` : 'Zonas'} />
                      <Selo on={r.ce} icone={Zap} rotulo="CE" />
                      <Selo on={r.relevo} icone={Mountain} rotulo="Relevo" />
                      {p.liberada('ndvi') && <Selo on={r.cenas > 0} icone={Satellite} rotulo={r.cenas ? `${r.cenas} cenas` : 'Satélite'} />}
                      {p.liberada('recomendacoes') && <Selo on={r.recomendacao} icone={Sprout} rotulo="VR" />}
                    </div>
                  </div>
                </div>
                <dl className="grid grid-cols-3 gap-2">
                  {libProd && (
                    <div className="rounded-xl px-2.5 py-2" style={{ background: COR.superficie2 }}>
                      <dt className="text-[10.5px] font-semibold" style={{ color: COR.texto2 }}>Produtividade</dt>
                      <dd className="text-sm font-extrabold tabular-nums mt-0.5 flex items-center gap-1.5">
                        {cProd && <span className="w-2 h-2 rounded-full" style={{ background: corCheiaDaClasse(cProd) }} />}
                        {r.prodScHa != null ? <>{fmtScHa(r.prodScHa, p.unidade, false)}<span className="text-[10px] font-semibold" style={{ color: COR.texto2 }}>{p.unidade}</span></> : <span style={{ color: COR.mudo }}>—</span>}
                      </dd>
                    </div>
                  )}
                  {libFert && ([['P', r.p, cP, 1], ['V%', r.v, cV, 0]] as const).map(([rot, v, c, casas]) => (
                    <div key={rot} className="rounded-xl px-2.5 py-2" style={{ background: COR.superficie2 }} title={c ? c.nome : undefined}>
                      <dt className="text-[10.5px] font-semibold" style={{ color: COR.texto2 }}>{rot}{r.anoAnalise ? ` · ${r.anoAnalise}` : ''}</dt>
                      <dd className="text-sm font-extrabold tabular-nums mt-0.5 flex items-center gap-1.5">
                        {c && <span className="w-2 h-2 rounded-full" style={{ background: corCheiaDaClasse(c) }} />}
                        {v != null ? fmtNum(v, casas) : <span style={{ color: COR.mudo }}>—</span>}
                        {c && <span className="text-[10px] font-semibold truncate" style={{ color: COR.texto2 }}>{c.nome}</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="flex items-center justify-between gap-2 pt-1" style={{ borderTop: `1px solid ${COR.borda}` }}>
                  <button type="button" onClick={() => p.abrirTalhao(r.talhaoId)} className="inline-flex items-center gap-1 text-xs font-semibold pt-2" style={{ color: COR.texto2 }}>
                    <ExternalLink size={12} /> Página do talhão
                  </button>
                  <Link href={p.hrefPortal('/portal', { talhao: r.talhaoId })} className="inline-flex items-center gap-1 text-xs font-bold pt-2" style={{ color: 'var(--p-verde-texto)' }}>
                    Ver painel do talhão <ArrowRight size={13} />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
