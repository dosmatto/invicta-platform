'use client';

// Portal do Produtor → Linhas de plantio (decisão Q9 do ledger): o mapa das
// linhas e SÓ o que existe — quais talhões receberam linhas da PrecisionFarm,
// espaçamento, ciclo, operação, nº de linhas e a última sincronização. A
// plataforma não recebe falhas, sobreposição, velocidade nem população: nada
// disso aparece (e nada é inventado).
//
// Com "Todos os talhões": mapa leve (quem tem linhas) + tabela das camadas.
// Com UM talhão: as linhas desenhadas de verdade (a geometria só é baixada aqui,
// e só das camadas ligadas) + o cartão de cada camada. Somente leitura — as
// linhas são desenhadas e publicadas na PrecisionFarm.

import { useMemo, useState } from 'react';
import { Rows3, Layers, Ruler, RefreshCw, Eye, EyeOff, ExternalLink, Info, AlertTriangle, Loader2 } from 'lucide-react';
import type { CamadaLinhasPF } from '@/lib/precisionfarm/cliente';
import { camadasComLinhas, contarFeicoes, feicoesDaCamada, resumirLinhas } from '@/lib/portalPainelExtras';
import { usePortal } from '../PortalContext';
import { Cartao, Kpi, LegendaClasses, MiniMapa, Vazio, Esqueleto, COR, fmtNum, fmtHaCurto, fmtInt, nomeLegivel, suave, talhoesTxt } from '../ui';
import { LinhasMapa, COR_GUIA, COR_BORDADURA, type CamadaDesenhada } from './LinhasMapa';
import { chaveGeometria, useCamadasLinhas, useGeometriasLinhas, useResumoLinhas, type PedidoGeometria } from './useLinhasPortal';

const ROTULO_CICLO: Record<string, string> = { summer: 'Verão', winter: 'Inverno' };
const ROTULO_OPERACAO: Record<string, string> = {
  planting: 'Plantio', seeding: 'Semeadura', spraying: 'Pulverização', fertilizing: 'Adubação',
  harvesting: 'Colheita', harvest: 'Colheita', tillage: 'Preparo de solo',
};
const ciclo = (c: string | null) => (c ? (ROTULO_CICLO[c] ?? c) : '—');
const operacao = (c: string | null) => (c ? (ROTULO_OPERACAO[c] ?? c) : '—');
const metros = (m: number | null) => (m != null ? `${fmtNum(m, m < 1 ? 2 : 1)} m` : '—');
const dataHora = (iso: string | null | undefined) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
};
const dataCurta = (iso: string | null | undefined) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;
};

function Situacao({ c }: { c: Pick<CamadaLinhasPF, 'situacao'> }) {
  const cfg = c.situacao === 'atualizado' ? { txt: 'Atualizado', cor: 'var(--p-verde-texto)', base: 'var(--invicta-green)' }
    : c.situacao === 'sincronizando' ? { txt: 'Sincronizando', cor: 'var(--status-warning)', base: 'var(--status-warning)' }
      : { txt: 'Com problema', cor: 'var(--status-error)', base: 'var(--status-error)' };
  return (
    <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md text-[10.5px] font-bold whitespace-nowrap" style={{ background: suave(cfg.base, 13), color: cfg.cor }}
      title={c.situacao === 'erro' ? 'A atualização mais recente não pôde ser aplicada; vale a última revisão válida.' : undefined}>
      {c.situacao === 'sincronizando' && <Loader2 size={10} className="animate-spin" />}{cfg.txt}
    </span>
  );
}

const Aviso = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-start gap-2 rounded-xl px-3 py-2 text-xs" style={{ background: suave('var(--status-info)', 8), border: `1px solid color-mix(in srgb, var(--status-info) 22%, transparent)`, color: COR.texto2 }}>
    <Info size={15} className="flex-shrink-0 mt-px" style={{ color: 'var(--status-info)' }} />
    <span>{children}</span>
  </div>
);

export function LinhasPagina() {
  const p = usePortal();
  const um = !!p.talhao;

  const idsEscopo = useMemo(() => p.talhoesEscopo.map(t => t.id), [p.talhoesEscopo]);
  const resumo = useResumoLinhas(idsEscopo, p.comNuvem);
  const comLinhas = resumo.estado === 'ok' ? resumo.comLinhas : null;
  const idsComLinhas = useMemo(() => p.dados.filter(d => comLinhas?.has(d.talhao.id)).map(d => d.talhao.id), [p.dados, comLinhas]);
  const { camadas, pendentes } = useCamadasLinhas(idsComLinhas);

  // ── Sem nuvem / sem resposta: estados honestos ──
  if (!p.comNuvem) {
    return <Vazio icone={Rows3} titulo="As linhas de plantio ficam na nuvem"
      texto="Nesta bancada local não há conexão com a PrecisionFarm. No portal do produtor, os talhões com linhas e o mapa aparecem aqui." />;
  }
  if (resumo.estado === 'carregando') {
    return <div className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">{[0, 1, 2, 3].map(i => <Esqueleto key={i} altura={92} />)}</div><Esqueleto altura={320} /></div>;
  }
  if (resumo.estado === 'erro') {
    return <Vazio icone={AlertTriangle} titulo="Não foi possível consultar as linhas agora" texto={resumo.motivo} />;
  }
  return <LinhasConteudo um={um} idsComLinhas={idsComLinhas} camadas={camadas} pendentes={pendentes} />;
}

function LinhasConteudo({ um, idsComLinhas, camadas, pendentes }: {
  um: boolean; idsComLinhas: string[]; camadas: Record<string, CamadaLinhasPF[] | 'erro'>; pendentes: number;
}) {
  const p = usePortal();
  const temLinhas = useMemo(() => new Set(idsComLinhas), [idsComLinhas]);
  const dados = p.dados;
  const areaTotal = useMemo(() => dados.reduce((s, d) => s + (d.talhao.areaHa || 0), 0), [dados]);
  const areaCom = useMemo(() => dados.filter(d => temLinhas.has(d.talhao.id)).reduce((s, d) => s + (d.talhao.areaHa || 0), 0), [dados, temLinhas]);

  const resumo = useMemo(() => resumirLinhas(dados.filter(d => temLinhas.has(d.talhao.id)).map(d => {
    const c = camadas[d.talhao.id];
    return { talhaoId: d.talhao.id, areaHa: d.talhao.areaHa || 0, camadas: Array.isArray(c) ? c : [] };
  })), [dados, temLinhas, camadas]);

  const falhou = idsComLinhas.filter(id => camadas[id] === 'erro').length;
  const carregandoDetalhes = pendentes > 0;
  const espPrincipal = resumo.espacamentos[0] ?? null;
  const dataSync = dataCurta(resumo.ultimaSincronizacao);

  const talhoesMapa = useMemo(() => dados.map(d => ({ id: d.talhao.id, nome: d.talhao.nome, geojson: d.talhao.geojson })), [dados]);
  const nomeDe = useMemo(() => new Map(dados.map(d => [d.talhao.id, d.talhao.nome])), [dados]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi icone={Rows3} tom="verde" rotulo={um ? 'Linhas neste talhão' : 'Talhões com linhas'}
          valor={um ? (idsComLinhas.length ? 'Sim' : 'Não') : fmtInt(idsComLinhas.length)}
          unidade={um ? undefined : `de ${dados.length}`}
          sub={um ? (idsComLinhas.length ? `${fmtHaCurto(areaCom)} ha` : 'nenhuma camada recebida')
            : `${fmtHaCurto(areaCom)} ha · ${areaTotal ? fmtNum((areaCom / areaTotal) * 100, 0) : '0'}% da área`}
          vazio="" />
        <Kpi icone={Layers} tom="azul" rotulo="Camadas de linhas" valor={resumo.nCamadas ? fmtInt(resumo.nCamadas) : null} carregando={carregandoDetalhes && !resumo.nCamadas}
          sub={resumo.nSincronizando ? `${resumo.nSincronizando} sincronizando` : 'linhas guia e bordaduras'} vazio={idsComLinhas.length ? 'carregando…' : 'nenhuma camada recebida'} />
        <Kpi icone={Ruler} tom="ambar" rotulo="Espaçamento" valor={espPrincipal ? metros(espPrincipal.m) : null} carregando={carregandoDetalhes && !espPrincipal}
          sub={resumo.espacamentos.length > 1 ? `mais comum · +${resumo.espacamentos.length - 1} ${resumo.espacamentos.length === 2 ? 'outro' : 'outros'}` : 'entre linhas'} vazio="não informado nas camadas" />
        <Kpi icone={RefreshCw} tom="roxo" rotulo="Última sincronização" valor={dataSync} carregando={carregandoDetalhes && !dataSync}
          sub={resumo.nErro ? `${resumo.nErro} camada(s) com problema` : 'PrecisionFarm'} vazio="sem sincronização registrada" />
      </div>

      {falhou > 0 && <Aviso>Não foi possível ler os detalhes de {talhoesTxt(falhou)} agora. Atualize a página para tentar de novo.</Aviso>}

      {idsComLinhas.length === 0 ? (
        <Vazio icone={Rows3} titulo={um ? 'Este talhão ainda não recebeu linhas' : 'Nenhum talhão recebeu linhas da PrecisionFarm'}
          texto="Quando as linhas guia e as bordaduras forem publicadas na PrecisionFarm para o talhão, elas chegam aqui sozinhas."
          acao={um ? <BotaoTalhao /> : undefined} />
      ) : um ? (
        <LinhasDoTalhao talhaoId={idsComLinhas[0]} camadas={camadas[idsComLinhas[0]]} />
      ) : (
        <>
          <Cartao icone={Rows3} titulo="Quem tem linhas" sub="Talhões com linhas guia ou bordaduras recebidas da PrecisionFarm. Clique para ver as linhas do talhão.">
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-4 items-center">
              <MiniMapa talhoes={talhoesMapa} modo="leve" altura={300} nomes
                corDe={id => (temLinhas.has(id) ? 'var(--invicta-green)' : null)}
                rotulo={id => (temLinhas.has(id) ? 'com linhas' : 'sem linhas')}
                onClicar={id => p.setFiltro({ talhao: id })} aria="Mapa dos talhões que têm linhas de plantio" />
              <LegendaClasses titulo="Área com linhas" itens={[
                { cor: 'var(--invicta-green)', rotulo: 'Com linhas', pct: areaTotal ? (areaCom / areaTotal) * 100 : 0, ha: areaCom },
                { cor: 'var(--p-sem-dado)', rotulo: 'Sem linhas', pct: areaTotal ? ((areaTotal - areaCom) / areaTotal) * 100 : 0, ha: Math.max(0, areaTotal - areaCom), apagado: !(areaTotal - areaCom > 0) },
              ]} rodape="Cor = o talhão tem ou não linhas recebidas (o talhão inteiro, não a área por pixel)." />
            </div>
          </Cartao>

          <Cartao icone={Layers} titulo="Camadas por talhão" sub="O que cada camada traz: operação, ciclo, espaçamento e quando foi sincronizada pela última vez.">
            <TabelaCamadas ids={idsComLinhas} camadas={camadas} nomeDe={nomeDe} onAbrir={id => p.setFiltro({ talhao: id })} />
            {dados.length > idsComLinhas.length && (
              <p className="text-xs mt-3 leading-snug" style={{ color: COR.texto2 }}>
                <strong style={{ color: COR.texto }}>Sem linhas ({dados.length - idsComLinhas.length}):</strong>{' '}
                <span className="capitalize">{dados.filter(d => !temLinhas.has(d.talhao.id)).map(d => nomeLegivel(d.talhao.nome)).join(', ')}</span>.
              </p>
            )}
          </Cartao>
        </>
      )}

      <Aviso>Somente leitura: as linhas são desenhadas e publicadas na PrecisionFarm, e cada revisão nova substitui a anterior aqui sozinha. Falhas, sobreposição, velocidade e população não vêm da PrecisionFarm e, por isso, não aparecem.</Aviso>
    </div>
  );
}

function BotaoTalhao() {
  const p = usePortal();
  if (!p.talhao) return null;
  return (
    <button type="button" onClick={() => p.abrirTalhao(p.talhao!.id, 'linhas')} className="mt-2 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-bold" style={{ background: COR.verdeEscuro, color: '#fff' }}>
      <ExternalLink size={13} /> Abrir {p.talhao.nome} na página do talhão
    </button>
  );
}

function TabelaCamadas({ ids, camadas, nomeDe, onAbrir }: {
  ids: string[]; camadas: Record<string, CamadaLinhasPF[] | 'erro'>; nomeDe: Map<string, string>; onAbrir: (id: string) => void;
}) {
  type LinhaTab = { id: string; c: CamadaLinhasPF | 'carregando' | 'erro' };
  const linhas = ids.flatMap((id): LinhaTab[] => {
    const cs = camadas[id];
    if (cs === undefined) return [{ id, c: 'carregando' }];
    if (cs === 'erro') return [{ id, c: 'erro' }];
    return cs.map(c => ({ id, c }));
  });
  const th = 'text-left font-semibold pb-2 pr-3 whitespace-nowrap';
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-xs min-w-[640px]">
        <thead><tr style={{ color: COR.texto2 }}>
          <th className={th}>Talhão</th><th className={th}>Camada</th><th className={th}>Operação</th><th className={th}>Ciclo</th>
          <th className={`${th} text-right`}>Espaçamento</th><th className={`${th} text-right`}>Linhas</th><th className={th}>Última sincronização</th><th className={th}>Situação</th>
        </tr></thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={`${l.id}-${typeof l.c === 'string' ? l.c : l.c.resourceId}-${i}`} style={{ borderTop: `1px solid ${COR.borda}` }}>
              <td className="py-2 pr-3 font-bold whitespace-nowrap">
                <button type="button" onClick={() => onAbrir(l.id)} className="hover:underline text-left">{nomeDe.get(l.id) ?? l.id}</button>
              </td>
              {typeof l.c === 'string' ? (
                <td colSpan={7} className="py-2" style={{ color: COR.mudo }}>{l.c === 'carregando' ? 'carregando…' : 'não foi possível ler as camadas deste talhão'}</td>
              ) : (
                <>
                  <td className="py-2 pr-3 max-w-[200px] truncate" title={l.c.nome ?? undefined}>{l.c.nome || l.c.integrationName || 'Camada sem nome'}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{operacao(l.c.categoria)}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{ciclo(l.c.ciclo)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{metros(l.c.espacamentoM)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums" title="Feições da revisão vigente: linhas guia e bordaduras">{feicoesDaCamada(l.c) != null ? fmtInt(feicoesDaCamada(l.c)) : '—'}</td>
                  <td className="py-2 pr-3 tabular-nums whitespace-nowrap">{dataHora(l.c.ultimaSincronizacao)}</td>
                  <td className="py-2"><Situacao c={l.c} /></td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LinhasDoTalhao({ talhaoId, camadas }: { talhaoId: string; camadas: CamadaLinhasPF[] | 'erro' | undefined }) {
  const p = usePortal();
  const talhao = p.talhao!;
  const lista = useMemo(() => (Array.isArray(camadas) ? camadasComLinhas(camadas) : []), [camadas]);
  const [desligadas, setDesligadas] = useState<Set<string>>(new Set());
  const pedidos = useMemo<PedidoGeometria[]>(() => lista
    .filter(c => !desligadas.has(c.resourceId) && c.revisaoGeometria != null)
    .map(c => ({ talhaoId, resourceId: c.resourceId, n: c.revisaoGeometria! })), [lista, desligadas, talhaoId]);
  const { geometrias, carregando } = useGeometriasLinhas(pedidos);

  const desenhadas = useMemo<CamadaDesenhada[]>(() => pedidos.flatMap(pd => {
    const g = geometrias[chaveGeometria(pd)];
    const c = lista.find(x => x.resourceId === pd.resourceId);
    return g && g !== 'erro' ? [{ chave: chaveGeometria(pd), nome: c?.nome ?? pd.resourceId, geometria: g }] : [];
  }), [pedidos, geometrias, lista]);
  const erroGeom = pedidos.some(pd => geometrias[chaveGeometria(pd)] === 'erro');

  if (camadas === undefined) return <Esqueleto altura={380} />;
  if (camadas === 'erro') return <Vazio icone={AlertTriangle} titulo="Não foi possível ler as linhas deste talhão agora" texto="Atualize a página para tentar de novo." />;

  const alternar = (rid: string) => setDesligadas(prev => { const s = new Set(prev); if (s.has(rid)) s.delete(rid); else s.add(rid); return s; });

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4 items-start">
      <Cartao icone={Rows3} titulo={`Linhas de ${talhao.nome}`} sub={`${fmtHaCurto(talhao.areaHa)} ha · desenhadas como a PrecisionFarm publicou`}
        rodape={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="inline-flex items-center gap-1.5"><span className="inline-block w-5 h-0.5" style={{ background: COR_GUIA }} /> Linha guia</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block w-5 h-[3px]" style={{ background: COR_BORDADURA }} /> Bordadura</span>
            {carregando && <span className="inline-flex items-center gap-1" style={{ color: COR.mudo }}><Loader2 size={11} className="animate-spin" /> baixando as linhas…</span>}
            {erroGeom && <span style={{ color: 'var(--status-error)' }}>Não foi possível baixar uma das camadas.</span>}
          </div>
        }>
        <LinhasMapa talhaoId={talhaoId} geojson={talhao.geojson} camadas={desenhadas} altura={400} />
        {pedidos.length === 0 && lista.length > 0 && <p className="text-xs mt-2" style={{ color: COR.texto2 }}>Todas as camadas estão escondidas. Ligue uma ao lado para ver as linhas.</p>}
      </Cartao>

      <div className="space-y-3">
        {lista.map(c => {
          const ligada = !desligadas.has(c.resourceId);
          const g = c.revisaoGeometria != null ? geometrias[chaveGeometria({ talhaoId, resourceId: c.resourceId, n: c.revisaoGeometria })] : undefined;
          const cont = g && g !== 'erro' ? contarFeicoes(g) : null;
          const total = feicoesDaCamada(c);
          return (
            <section key={c.resourceId} className="rounded-2xl p-3.5" style={{ background: COR.superficie, border: `1px solid ${COR.borda}`, boxShadow: COR.sombra, opacity: ligada ? 1 : 0.7 }}>
              <div className="flex items-start gap-2">
                <button type="button" onClick={() => alternar(c.resourceId)} aria-pressed={ligada} title={ligada ? 'Esconder do mapa' : 'Mostrar no mapa'}
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: suave('var(--invicta-blue-mid)', 12), color: COR.azulTexto }}>
                  {ligada ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold leading-tight truncate" title={c.nome ?? undefined}>{c.nome || 'Camada sem nome'}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: COR.texto2 }}>{operacao(c.categoria)} · {ciclo(c.ciclo)}</p>
                </div>
                <Situacao c={c} />
              </div>
              <dl className="grid grid-cols-2 gap-2 mt-3">
                {([
                  ['Espaçamento', metros(c.espacamentoM)],
                  ['Feições', total != null ? fmtInt(total) : cont ? fmtInt(cont.guia + cont.bordadura) : '—'],
                  ['Linhas guia', cont ? fmtInt(cont.guia) : ligada ? '…' : '—'],
                  ['Bordaduras', cont ? fmtInt(cont.bordadura) : ligada ? '…' : '—'],
                ] as const).map(([r, v]) => (
                  <div key={r} className="rounded-xl px-2.5 py-1.5" style={{ background: COR.superficie2 }}>
                    <dt className="text-[10.5px] font-semibold" style={{ color: COR.texto2 }}>{r}</dt>
                    <dd className="text-sm font-extrabold tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-[11px] mt-2" style={{ color: COR.texto2 }}>Última sincronização: <strong style={{ color: COR.texto }}>{dataHora(c.ultimaSincronizacao)}</strong>{c.revisaoVigente != null ? ` · revisão ${c.revisaoVigente}` : ''}</p>
            </section>
          );
        })}
        <button type="button" onClick={() => p.abrirTalhao(talhaoId, 'linhas')} className="w-full inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-xl text-xs font-bold"
          style={{ background: COR.verdeEscuro, color: '#fff' }}>
          <ExternalLink size={13} /> Abrir na página do talhão
        </button>
      </div>
    </div>
  );
}
