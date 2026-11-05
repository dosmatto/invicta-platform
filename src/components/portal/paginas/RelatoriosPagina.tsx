'use client';

// Portal do Produtor → Relatórios e recomendações. O que já foi GERADO para os
// talhões: relatórios em PDF (inv_relatorios) e cenários de recomendação
// (inv_cenarios), por talhão e safra. A plataforma guarda só a configuração do
// relatório — o PDF é montado na página do talhão ao abrir —, então cada linha
// leva direto à aba certa do talhão (via abrirTalhao). Somente leitura.
//
// Plano: relatórios só com a seção 'relatorios'; recomendações só com
// 'recomendacoes'. A página não vaza o que o plano não libera (o shell só
// esconde o menu; quem digita a URL cai aqui).

import { useMemo, useState } from 'react';
import { FileText, ClipboardList, Grid3x3, Clock, ArrowRight, Award, FlaskConical, Info, ChevronDown, AlertTriangle } from 'lucide-react';
import { rotuloAno } from '@/lib/periodo';
import { docsPorTalhao, documentosDoPortal, type DocPortal } from '@/lib/portalPainelExtras';
import { usePortal } from '../PortalContext';
import { Cartao, Kpi, LegendaClasses, MiniMapa, Seletor, Vazio, Esqueleto, COR, fmtHaCurto, fmtInt, fmtNum, suave, talhoesTxt } from '../ui';

const POR_PAGINA = 8;
const COR_AMBOS = 'var(--invicta-green)';
const COR_SO_REL = 'var(--invicta-blue-mid)';
const COR_SO_REC = 'var(--status-warning)';

const dia = (ms: number | null) => (ms == null ? null : new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }));

function ListaDocs({ itens, aba, icone: Icone, tom, mostrarTalhao, mostrarSafra, abrir }: {
  itens: DocPortal[]; aba: 'relatorios' | 'recomendacoes'; icone: typeof FileText; tom: string; mostrarTalhao: boolean; mostrarSafra: boolean;
  abrir: (d: DocPortal, aba: string) => void;
}) {
  const [tudo, setTudo] = useState(false);
  const visiveis = tudo ? itens : itens.slice(0, POR_PAGINA);
  return (
    <>
      <ul className="divide-y" style={{ borderColor: COR.borda }}>
        {visiveis.map((d, i) => (
          <li key={`${d.talhaoId}-${d.titulo}-${d.em}-${i}`} className="py-2.5 first:pt-0 last:pb-0" style={{ borderColor: COR.borda }}>
            <button type="button" onClick={() => abrir(d, aba)} className="w-full flex items-center gap-3 text-left group">
              <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: suave(tom, 14), color: tom }}><Icone size={17} /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[13px] font-bold truncate group-hover:underline" style={{ color: COR.texto }}>{d.titulo}</span>
                  {d.oficial && (
                    <span className="inline-flex items-center gap-0.5 h-5 px-1.5 rounded-md text-[10px] font-bold flex-shrink-0" style={{ background: suave('var(--invicta-green)', 14), color: 'var(--p-verde-texto)' }} title="Recomendação oficial do talhão">
                      <Award size={10} /> Oficial
                    </span>
                  )}
                </span>
                <span className="block text-[11.5px] truncate" style={{ color: COR.texto2 }}>
                  {[d.tipo !== d.titulo ? d.tipo : null, mostrarTalhao ? d.talhaoNome : null, mostrarSafra && d.safra ? `safra ${d.safra}` : null, dia(d.em)].filter(Boolean).join(' · ')}
                </span>
              </span>
              <ArrowRight size={15} className="flex-shrink-0 opacity-50 group-hover:opacity-100" style={{ color: COR.texto2 }} />
            </button>
          </li>
        ))}
      </ul>
      {itens.length > POR_PAGINA && (
        <button type="button" onClick={() => setTudo(v => !v)} className="mt-3 inline-flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--p-verde-texto)' }}>
          <ChevronDown size={14} style={{ transform: tudo ? 'rotate(180deg)' : undefined }} /> {tudo ? 'Mostrar menos' : `Mostrar todos (${itens.length})`}
        </button>
      )}
    </>
  );
}

export function RelatoriosPagina() {
  const p = usePortal();
  const um = !!p.talhao;
  const libRel = p.liberada('relatorios'), libRec = p.liberada('recomendacoes');
  const [todasSafras, setTodasSafras] = useState(false);
  const anoTxt = rotuloAno(p.safra);

  const docs = useMemo(() => {
    const d = documentosDoPortal(p.dados, todasSafras ? null : p.ano);
    return { relatorios: libRel ? d.relatorios : [], cenarios: libRec ? d.cenarios : [] };
  }, [p.dados, p.ano, todasSafras, libRel, libRec]);
  const porTalhao = useMemo(() => docsPorTalhao(p.dados, docs), [p.dados, docs]);

  const talhoesMapa = useMemo(() => p.dados.map(d => ({ id: d.talhao.id, nome: d.talhao.nome, geojson: d.talhao.geojson })), [p.dados]);
  const statusDe = useMemo(() => new Map(porTalhao.map(x => [x.talhaoId, x.nRelatorios > 0 && x.nCenarios > 0 ? 'ambos' : x.nRelatorios > 0 ? 'rel' : x.nCenarios > 0 ? 'rec' : 'nada'] as const)), [porTalhao]);
  const corDe = (id: string) => { const s = statusDe.get(id); return s === 'ambos' ? COR_AMBOS : s === 'rel' ? COR_SO_REL : s === 'rec' ? COR_SO_REC : null; };

  if (!p.comNuvem) {
    return <Vazio icone={FileText} titulo="Os relatórios ficam na nuvem" texto="Nesta bancada local o histórico de relatórios e recomendações não está disponível. No portal do produtor ele aparece aqui." />;
  }
  if (p.sincronizando) {
    return <div className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">{[0, 1, 2, 3].map(i => <Esqueleto key={i} altura={92} />)}</div><Esqueleto altura={300} /></div>;
  }

  const falhaRel = libRel && p.falhasNuvem.includes('relatorios'), falhaRec = libRec && p.falhasNuvem.includes('cenarios');
  const comDoc = porTalhao.filter(x => x.nRelatorios + x.nCenarios > 0);
  const area = (ids: Set<string>) => p.dados.filter(d => ids.has(d.talhao.id)).reduce((s, d) => s + (d.talhao.areaHa || 0), 0);
  const areaTotal = p.dados.reduce((s, d) => s + (d.talhao.areaHa || 0), 0);
  const idsPor = (s: string) => new Set(porTalhao.filter(x => statusDe.get(x.talhaoId) === s).map(x => x.talhaoId));
  const areaDe = (s: string) => area(idsPor(s));
  const pct = (ha: number) => (areaTotal ? (ha / areaTotal) * 100 : 0);

  const todos = [...docs.relatorios, ...docs.cenarios];
  const ultimo = todos.filter(d => d.em != null).sort((a, b) => b.em! - a.em!)[0] ?? null;
  const nOficiais = docs.cenarios.filter(c => c.oficial).length;
  const escopoTxt = todasSafras ? 'em todas as safras' : `na safra ${anoTxt}`;

  const abrir = (d: DocPortal, aba: string) => p.abrirTalhao(d.talhaoId, aba, { ano: d.ano });

  const legenda = [
    ...(libRel && libRec ? [{ cor: COR_AMBOS, rotulo: 'Relatório e recomendação', s: 'ambos' }] : []),
    ...(libRel ? [{ cor: COR_SO_REL, rotulo: libRec ? 'Só relatório' : 'Com relatório', s: 'rel' }] : []),
    ...(libRec ? [{ cor: COR_SO_REC, rotulo: libRel ? 'Só recomendação' : 'Com recomendação', s: 'rec' }] : []),
    { cor: 'var(--p-sem-dado)', rotulo: 'Nada gerado', s: 'nada' },
  ].map(x => ({ cor: x.cor, rotulo: x.rotulo, pct: pct(areaDe(x.s)), ha: areaDe(x.s), apagado: idsPor(x.s).size === 0 }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs" style={{ color: COR.texto2 }}>{um ? p.talhao!.nome : `${talhoesTxt(p.dados.length)}`} · {escopoTxt}</p>
        <Seletor valor={todasSafras ? 'todas' : 'safra'} onChange={v => setTodasSafras(v === 'todas')} rotulo="Período"
          opcoes={[{ valor: 'safra', rotulo: `Safra ${anoTxt}` }, { valor: 'todas', rotulo: 'Todas as safras' }]} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {libRel && <Kpi icone={FileText} tom="azul" rotulo="Relatórios em PDF" valor={docs.relatorios.length ? fmtInt(docs.relatorios.length) : null}
          sub={`${talhoesTxt(new Set(docs.relatorios.map(d => d.talhaoId)).size)} · ${escopoTxt}`} vazio={`nenhum relatório gerado ${escopoTxt}`} />}
        {libRec && <Kpi icone={ClipboardList} tom="ambar" rotulo="Recomendações geradas" valor={docs.cenarios.length ? fmtInt(docs.cenarios.length) : null}
          sub={nOficiais ? `${nOficiais} ${nOficiais === 1 ? 'oficial' : 'oficiais'} · ${escopoTxt}` : escopoTxt} vazio={`nenhuma recomendação gerada ${escopoTxt}`} />}
        <Kpi icone={Grid3x3} tom="verde" rotulo="Talhões com documentos" valor={comDoc.length ? fmtInt(comDoc.length) : null} unidade={`de ${p.dados.length}`}
          sub={`${fmtHaCurto(area(new Set(comDoc.map(x => x.talhaoId))))} ha · ${fmtNum(pct(area(new Set(comDoc.map(x => x.talhaoId)))), 0)}% da área`} vazio="nenhum talhão com documentos" />
        <Kpi icone={Clock} tom="roxo" rotulo="Último gerado" valor={ultimo ? dia(ultimo.em) : null} sub={ultimo ? `${ultimo.titulo} · ${ultimo.talhaoNome}` : undefined} vazio="nada gerado ainda" />
      </div>

      {(falhaRel || falhaRec) && (
        <div className="flex items-start gap-2 rounded-xl px-3 py-2 text-xs" style={{ background: suave('var(--status-warning)', 10), border: '1px solid color-mix(in srgb, var(--status-warning) 28%, transparent)', color: COR.texto }}>
          <AlertTriangle size={15} className="flex-shrink-0 mt-px" style={{ color: 'var(--status-warning)' }} />
          <span>Não foi possível consultar {falhaRel && falhaRec ? 'os relatórios e as recomendações' : falhaRel ? 'os relatórios' : 'as recomendações'} agora; a lista pode estar incompleta. Atualize a página para tentar de novo.</span>
        </div>
      )}

      {todos.length === 0 ? (
        <Vazio icone={FileText} titulo={`Nada gerado ${escopoTxt}`}
          texto={todasSafras ? 'Quando um relatório ou uma recomendação for gerado para o talhão, ele aparece aqui.' : 'Veja também as outras safras em "Todas as safras".'}
          acao={!todasSafras ? <button type="button" onClick={() => setTodasSafras(true)} className="mt-2 inline-flex items-center gap-1 h-9 px-3 rounded-lg text-xs font-bold" style={{ background: COR.verdeEscuro, color: '#fff' }}>Ver todas as safras</button> : undefined} />
      ) : (
        <>
          {!um && (
            <Cartao icone={Grid3x3} titulo="O que já foi gerado em cada talhão" sub="Cor = o talhão tem relatório e/ou recomendação. Clique para ver só aquele talhão.">
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-4 items-center">
                <MiniMapa talhoes={talhoesMapa} modo="leve" altura={280} nomes corDe={corDe}
                  rotulo={id => { const x = porTalhao.find(t => t.talhaoId === id); return x ? `${x.nRelatorios} relat. · ${x.nCenarios} recom.` : null; }}
                  onClicar={id => p.setFiltro({ talhao: id })} aria="Mapa dos talhões com relatórios e recomendações" />
                <LegendaClasses titulo="Área" itens={legenda} />
              </div>
            </Cartao>
          )}

          <div className={`grid grid-cols-1 ${libRel && libRec ? 'xl:grid-cols-2' : ''} gap-4 items-start`}>
            {libRel && (
              <Cartao icone={FileText} titulo="Relatórios em PDF" sub={`${docs.relatorios.length} ${escopoTxt}. O PDF é montado ao abrir, na página do talhão.`}
                acao={um ? { rotulo: 'Abrir na página do talhão', onClick: () => p.abrirTalhao(p.talhao!.id, 'relatorios') } : undefined}>
                {docs.relatorios.length === 0
                  ? <Vazio compacto icone={FileText} titulo={`Sem relatórios ${escopoTxt}`} texto="Os relatórios gerados para o talhão aparecem aqui." />
                  : <ListaDocs itens={docs.relatorios} aba="relatorios" icone={FileText} tom="var(--invicta-blue-mid)" mostrarTalhao={!um} mostrarSafra={todasSafras} abrir={abrir} />}
              </Cartao>
            )}
            {libRec && (
              <Cartao icone={ClipboardList} titulo="Recomendações e cenários" sub={`${docs.cenarios.length} ${escopoTxt}. Cenários de adubação e correção gerados para o talhão.`}
                acao={um ? { rotulo: 'Abrir na página do talhão', onClick: () => p.abrirTalhao(p.talhao!.id, 'recomendacoes') } : undefined}>
                {docs.cenarios.length === 0
                  ? <Vazio compacto icone={FlaskConical} titulo={`Sem recomendações ${escopoTxt}`} texto="As recomendações de adubação e correção geradas para o talhão aparecem aqui." />
                  : <ListaDocs itens={docs.cenarios} aba="recomendacoes" icone={ClipboardList} tom="var(--status-warning)" mostrarTalhao={!um} mostrarSafra={todasSafras} abrir={abrir} />}
              </Cartao>
            )}
          </div>

          {!um && (
            <Cartao icone={Grid3x3} titulo="Por talhão" sub="Quantos documentos cada talhão tem — e o que ainda falta.">
              <div className="overflow-x-auto -mx-1 px-1">
                <table className="w-full text-xs min-w-[460px]">
                  <thead><tr style={{ color: COR.texto2 }}>
                    <th className="text-left font-semibold pb-2 pr-3">Talhão</th>
                    {libRel && <th className="text-right font-semibold pb-2 pr-3">Relatórios</th>}
                    {libRec && <th className="text-right font-semibold pb-2 pr-3">Recomendações</th>}
                    <th className="text-left font-semibold pb-2 pr-3">Último</th>
                    <th className="pb-2" />
                  </tr></thead>
                  <tbody>
                    {[...porTalhao].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true })).map(x => (
                      <tr key={x.talhaoId} style={{ borderTop: `1px solid ${COR.borda}` }}>
                        <td className="py-2 pr-3 font-bold whitespace-nowrap"><button type="button" onClick={() => p.setFiltro({ talhao: x.talhaoId })} className="hover:underline text-left">{x.nome}</button></td>
                        {libRel && <td className="py-2 pr-3 text-right tabular-nums" style={x.nRelatorios ? undefined : { color: COR.mudo }}>{x.nRelatorios || '—'}</td>}
                        {libRec && <td className="py-2 pr-3 text-right tabular-nums" style={x.nCenarios ? undefined : { color: COR.mudo }}>{x.nCenarios || '—'}</td>}
                        <td className="py-2 pr-3 tabular-nums whitespace-nowrap" style={x.ultimo ? undefined : { color: COR.mudo }}>{dia(x.ultimo) ?? '—'}</td>
                        <td className="py-2 text-right">
                          <button type="button" onClick={() => p.abrirTalhao(x.talhaoId, libRel && x.nRelatorios >= x.nCenarios ? 'relatorios' : libRec ? 'recomendacoes' : 'relatorios')}
                            className="inline-flex items-center gap-1 text-[11px] font-bold whitespace-nowrap" style={{ color: 'var(--p-verde-texto)' }}>
                            Página do talhão <ArrowRight size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Cartao>
          )}
        </>
      )}

      <div className="flex items-start gap-2 rounded-xl px-3 py-2 text-xs" style={{ background: suave('var(--status-info)', 8), border: '1px solid color-mix(in srgb, var(--status-info) 22%, transparent)', color: COR.texto2 }}>
        <Info size={15} className="flex-shrink-0 mt-px" style={{ color: 'var(--status-info)' }} />
        <span>Somente leitura. Cada linha abre a aba certa da página do talhão, onde o relatório em PDF é montado com os mapas salvos.</span>
      </div>
    </div>
  );
}
