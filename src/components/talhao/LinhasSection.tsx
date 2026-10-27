'use client';

// Aba "Linhas" do talhão — linhas guia e bordaduras RECEBIDAS da PrecisionFarm
// (fase 2 da integração, docs/integracao-precisionfarm.md §6).
//
// SOMENTE LEITURA para todos: as linhas são desenhadas e publicadas na
// PrecisionFarm; aqui não há edição. Uma camada por resource_id deles; cada
// revisão válida que chega vira a vigente sozinha e a anterior vai para o
// histórico. O servidor confere o acesso ao talhão (Q4) — esta tela só mostra.
// Owner/admin ainda veem o botão "Buscar linhas da PrecisionFarm" (carga
// inicial pelo inventário deles).
//
// O mapa recebe as linhas pelo canal `linhasPF` do AppContext (MapView desenha
// guia, bordadura e a revisão em comparação com estilos distintos).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ChevronDown, ChevronRight, Download, Eye, EyeOff, GitCompare, Loader2, Lock, RefreshCw } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import type { Talhao } from '@/lib/store';
import {
  buscarLinhasPF, estadoLinhasPF, geometriaLinhasPF, tentarDeNovoLinhasPF,
  type CamadaLinhasPF, type EstadoLinhasPF,
} from '@/lib/precisionfarm/cliente';
import { CONSULTA_MIN_MS, intervaloConsultaMs, proximoMinimoMs } from '@/lib/precisionfarm/consulta';

const ROTULO_CICLO: Record<string, string> = { summer: 'Verão', winter: 'Inverno' };
const ROTULO_OPERACAO: Record<string, string> = {
  planting: 'Plantio', seeding: 'Semeadura', spraying: 'Pulverização', fertilizing: 'Adubação',
  harvesting: 'Colheita', harvest: 'Colheita', tillage: 'Preparo de solo',
};
const SITUACAO: Record<CamadaLinhasPF['situacao'], { txt: string; cor: string; fundo: string }> = {
  atualizado: { txt: 'Atualizado', cor: '#4ade80', fundo: '#052e16' },
  sincronizando: { txt: 'Sincronizando', cor: '#fbbf24', fundo: '#422006' },
  erro: { txt: 'Erro', cor: '#f87171', fundo: '#450a0a' },
};

const dataCurta = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

const chave = (rid: string, n: number) => `${rid}:${n}`;
const nomeDa = (c: CamadaLinhasPF) => c.nome || c.integrationName || 'Camada sem nome';

export function LinhasSection({ talhao }: { talhao: Talhao }) {
  return <Linhas key={talhao.id} talhaoId={talhao.id} />;
}

function Linhas({ talhaoId }: { talhaoId: string }) {
  const { setLinhasPF } = useApp();
  const [estado, setEstado] = useState<EstadoLinhasPF | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false);
  // null = ainda não decidido (na 1ª carga liga todas as camadas com linhas).
  const [ligadas, setLigadas] = useState<Set<string> | null>(null);
  const [historicoAberto, setHistoricoAberto] = useState<Set<string>>(new Set());
  const [comparacao, setComparacao] = useState<{ resourceId: string; n: number } | null>(null);
  const [geoms, setGeoms] = useState<Map<string, GeoJSON.FeatureCollection>>(new Map());
  const [erroGeom, setErroGeom] = useState<string | null>(null);
  const emVoo = useRef(new Set<string>());

  // Estado muda só DEPOIS da resposta (nada síncrono dentro de efeito).
  const aplicar = useCallback((r: Awaited<ReturnType<typeof estadoLinhasPF>>) => {
    if (!r.ok) { setErro(r.erro); return; }
    setErro(null);
    setEstado(r);
    setLigadas(prev => prev ?? new Set(r.camadas.filter(c => c.revisaoGeometria != null && !c.arquivada).map(c => c.resourceId)));
  }, []);
  const recarregar = useCallback(() => estadoLinhasPF(talhaoId).then(aplicar), [talhaoId, aplicar]);

  useEffect(() => {
    let vivo = true;
    void estadoLinhasPF(talhaoId).then(r => { if (vivo) aplicar(r); });
    return () => { vivo = false; };
  }, [talhaoId, aplicar]);

  // Enquanto alguma camada estiver sincronizando, confere de novo — no próximo
  // horário de tentativa da fila (backoff de até 1 h), e com intervalo que
  // dobra a cada consulta sem novidade (6 s … 60 s; teto de 5 min = o cron).
  const sincronizando = !!estado?.camadas.some(c => c.situacao === 'sincronizando');
  const proximaTentativa = (estado?.camadas ?? [])
    .filter(c => c.situacao === 'sincronizando' && c.proximaTentativaEm)
    .map(c => c.proximaTentativaEm as string).sort()[0] ?? null;
  const minimoConsulta = useRef(CONSULTA_MIN_MS);
  useEffect(() => {
    if (!sincronizando) { minimoConsulta.current = CONSULTA_MIN_MS; return; }
    const ms = intervaloConsultaMs(proximaTentativa, Date.now(), minimoConsulta.current);
    minimoConsulta.current = proximoMinimoMs(minimoConsulta.current);
    const t = setTimeout(() => { void recarregar(); }, ms);
    return () => clearTimeout(t);
  }, [sincronizando, proximaTentativa, estado, recarregar]);

  // Sair da aba tira as linhas do mapa.
  useEffect(() => () => setLinhasPF(null), [setLinhasPF]);

  const camadasVisiveis = useMemo(
    () => (estado?.camadas ?? []).filter(c => mostrarArquivadas || !c.arquivada),
    [estado, mostrarArquivadas],
  );

  // O que precisa estar no mapa: a revisão desenhável de cada camada ligada e
  // a revisão antiga em comparação.
  const precisas = useMemo(() => {
    const out: Array<{ k: string; rid: string; n: number; comparacao: boolean }> = [];
    for (const c of camadasVisiveis) {
      if (ligadas?.has(c.resourceId) && c.revisaoGeometria != null) {
        out.push({ k: chave(c.resourceId, c.revisaoGeometria), rid: c.resourceId, n: c.revisaoGeometria, comparacao: false });
      }
    }
    if (comparacao) out.push({ k: chave(comparacao.resourceId, comparacao.n), rid: comparacao.resourceId, n: comparacao.n, comparacao: true });
    return out;
  }, [camadasVisiveis, ligadas, comparacao]);

  // Baixa as geometrias que faltam (uma vez por revisão — snapshot não muda).
  useEffect(() => {
    for (const p of precisas) {
      if (geoms.has(p.k) || emVoo.current.has(p.k)) continue;
      emVoo.current.add(p.k);
      void geometriaLinhasPF(talhaoId, p.rid, p.n).then(r => {
        emVoo.current.delete(p.k);
        if (!r.ok) { setErroGeom(r.erro); return; }
        setGeoms(prev => new Map(prev).set(p.k, r.geometria));
      });
    }
  }, [precisas, geoms, talhaoId]);

  // Publica no mapa.
  useEffect(() => {
    const features: GeoJSON.Feature[] = [];
    for (const p of precisas) {
      const fc = geoms.get(p.k);
      if (!fc) continue;
      for (const f of fc.features) {
        features.push({ ...f, properties: { ...(f.properties ?? {}), comparacao: p.comparacao, camada: p.rid } });
      }
    }
    setLinhasPF(features.length ? { type: 'FeatureCollection', features } : null);
  }, [precisas, geoms, setLinhasPF]);

  async function buscar() {
    setBuscando(true); setMsg(null);
    const r = await buscarLinhasPF(talhaoId);
    setBuscando(false);
    if (!r.ok) { setMsg(r.erro); return; }
    setMsg(r.mensagem);
    minimoConsulta.current = CONSULTA_MIN_MS;
    void recarregar();
  }

  const [tentando, setTentando] = useState<string | null>(null);
  async function tentarDeNovo(rid: string) {
    setTentando(rid); setMsg(null);
    const r = await tentarDeNovoLinhasPF(talhaoId, rid);
    setTentando(null);
    setMsg(r.ok ? r.mensagem : r.erro);
    minimoConsulta.current = CONSULTA_MIN_MS;
    void recarregar();
  }

  function alternarCamada(rid: string) {
    setLigadas(prev => {
      const s = new Set(prev ?? []);
      if (s.has(rid)) s.delete(rid); else s.add(rid);
      return s;
    });
  }

  function alternarHistorico(rid: string) {
    setHistoricoAberto(prev => {
      const s = new Set(prev);
      if (s.has(rid)) s.delete(rid); else s.add(rid);
      return s;
    });
  }

  if (erro && !estado) {
    return <div className="p-4"><div className="rounded px-2 py-1.5 text-[11px]" style={{ background: '#450a0a', color: '#fca5a5' }}>{erro}</div></div>;
  }
  if (!estado) {
    return <div className="p-4 flex items-center gap-1.5 text-[11px]" style={{ color: '#64748b' }}><Loader2 size={12} className="animate-spin" /> Carregando linhas…</div>;
  }

  const nArquivadas = estado.camadas.filter(c => c.arquivada).length;
  const motivoSemBusca = !estado.recebimento.configurado
    ? 'Integração de recebimento não configurada.'
    : estado.vinculo?.status !== 'confirmado' ? 'O vínculo deste talhão com a PrecisionFarm ainda não está confirmado (aba Resumo).' : '';

  return (
    <div className="p-4 space-y-3 text-xs" style={{ color: '#cbd5e1' }}>
      <div className="flex items-start gap-2 rounded p-2 text-[10px]" style={{ background: '#0a1929', border: '1px solid #1a3a6b', color: '#94a3b8' }}>
        <Lock size={11} className="mt-0.5 flex-shrink-0" style={{ color: '#93c5fd' }} />
        <span>Linhas guia e bordaduras publicadas na <strong style={{ color: '#cbd5e1' }}>PrecisionFarm</strong>. Somente leitura: a edição é feita lá, e cada revisão nova substitui a anterior aqui sozinha (o histórico fica guardado).</span>
      </div>

      {!estado.recebimento.configurado && (
        <div className="rounded px-2 py-1.5 text-[10px]" style={{ background: '#422006', color: '#fcd34d' }}>
          {estado.recebimento.mensagem ?? 'Integração de recebimento não configurada.'}
          {estado.recebimento.faltando.length > 0 && <> Faltam as variáveis: <code>{estado.recebimento.faltando.join(', ')}</code>.</>}
        </div>
      )}

      {estado.gestor && (
        <div className="flex items-center gap-2">
          <button onClick={buscar} disabled={!estado.podeBuscar || buscando}
            title={estado.podeBuscar ? 'Lê o inventário do talhão na PrecisionFarm e traz as camadas de linhas publicadas' : motivoSemBusca}
            className="px-2.5 py-1.5 rounded text-[11px] font-bold flex items-center gap-1"
            style={{ background: 'var(--invicta-blue-mid)', color: '#fff', opacity: estado.podeBuscar ? 1 : 0.5 }}>
            {buscando ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />} Buscar linhas da PrecisionFarm
          </button>
          <button onClick={() => { void recarregar(); }} title="Atualizar" className="p-1.5 rounded" style={{ background: '#1e3a5f', color: '#cbd5e1' }}>
            <RefreshCw size={11} />
          </button>
        </div>
      )}
      {estado.gestor && !estado.podeBuscar && motivoSemBusca && <p className="text-[10px]" style={{ color: '#64748b' }}>{motivoSemBusca}</p>}
      {msg && <div className="rounded px-2 py-1.5 text-[10px]" style={{ background: '#0f2240', color: '#bfdbfe' }}>{msg}</div>}
      {erro && <div className="rounded px-2 py-1.5 text-[10px]" style={{ background: '#450a0a', color: '#fca5a5' }}>{erro}</div>}
      {erroGeom && <div className="rounded px-2 py-1.5 text-[10px]" style={{ background: '#450a0a', color: '#fca5a5' }}>Não foi possível desenhar as linhas: {erroGeom}</div>}

      {/* Legenda dos estilos no mapa */}
      <div className="flex flex-wrap items-center gap-3 text-[10px]" style={{ color: '#94a3b8' }}>
        <span className="flex items-center gap-1"><span style={{ width: 16, height: 2, background: '#22d3ee', display: 'inline-block' }} /> Linha guia</span>
        <span className="flex items-center gap-1"><span style={{ width: 16, height: 3, background: '#fb923c', display: 'inline-block' }} /> Bordadura</span>
        <span className="flex items-center gap-1"><span style={{ width: 16, borderTop: '2px dashed #e2e8f0', display: 'inline-block' }} /> Revisão antiga (comparação)</span>
      </div>

      {estado.camadas.length === 0 && (
        <p className="text-[11px]" style={{ color: '#64748b' }}>Nenhuma linha recebida da PrecisionFarm para este talhão.</p>
      )}

      {nArquivadas > 0 && (
        <label className="flex items-center gap-1.5 text-[10px] cursor-pointer" style={{ color: '#94a3b8' }}>
          <input type="checkbox" checked={mostrarArquivadas} onChange={e => setMostrarArquivadas(e.target.checked)} />
          Mostrar arquivadas ({nArquivadas})
        </label>
      )}

      {camadasVisiveis.map(c => {
        const st = SITUACAO[c.situacao];
        const ligada = !!ligadas?.has(c.resourceId);
        const abertoHist = historicoAberto.has(c.resourceId);
        return (
          <div key={c.resourceId} className="rounded p-2 space-y-1.5" style={{ background: '#061525', border: '1px solid #1a3a6b', opacity: c.arquivada ? 0.75 : 1 }}>
            <div className="flex items-center gap-2">
              <button onClick={() => alternarCamada(c.resourceId)} disabled={c.revisaoGeometria == null}
                title={ligada ? 'Esconder do mapa' : 'Mostrar no mapa'} style={{ color: ligada ? '#22d3ee' : '#475569' }}>
                {ligada ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <span className="flex-1 font-bold truncate" style={{ color: '#e2e8f0' }} title={c.integrationName ?? undefined}>{nomeDa(c)}</span>
              {c.arquivada && <span className="flex items-center gap-0.5 text-[9px] font-bold" style={{ color: '#94a3b8' }}><Archive size={10} /> Arquivada</span>}
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ color: st.cor, background: st.fundo }}>
                {c.situacao === 'sincronizando' && <Loader2 size={9} className="inline animate-spin mr-0.5" />}{st.txt}
              </span>
            </div>
            {c.integrationName && c.integrationName !== c.nome && (
              <div className="text-[10px]" style={{ color: '#64748b' }}>Nome de integração: {c.integrationName}</div>
            )}
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
              <Campo rotulo="Ciclo" valor={c.ciclo ? (ROTULO_CICLO[c.ciclo] ?? c.ciclo) : '—'} />
              <Campo rotulo="Operação" valor={c.categoria ? (ROTULO_OPERACAO[c.categoria] ?? c.categoria) : '—'} />
              <Campo rotulo="Espaçamento" valor={c.espacamentoM != null ? `${c.espacamentoM.toLocaleString('pt-BR')} m` : '—'} />
              <Campo rotulo="Origem" valor={c.origem} />
              <Campo rotulo="Revisão vigente" valor={c.revisaoVigente != null ? String(c.revisaoVigente) : '— (aguardando)'} />
              <Campo rotulo="Última sincronização" valor={dataCurta(c.ultimaSincronizacao)} />
            </div>
            <div className="text-[10px]" style={{ color: '#94a3b8' }}
              title="Número de revisão do limite NO SISTEMA DE ORIGEM (PrecisionFarm). Não é comparável com a versão do limite da Invicta — confira com a equipe da PrecisionFarm se o limite é o mesmo.">
              Limite de origem: <strong style={{ color: '#cbd5e1' }}>PrecisionFarm, revisão {c.boundaryRevision ?? '—'}</strong>
              <span style={{ color: '#64748b' }}> (numeração deles, sem equivalência automática com o limite daqui)</span>
            </div>
            {c.arquivada && <div className="text-[10px]" style={{ color: '#94a3b8' }}>Arquivada na PrecisionFarm em {dataCurta(c.arquivadaEm)} — o histórico continua disponível.</div>}
            {c.motivo && (
              <div className="rounded px-2 py-1 text-[10px]" style={{ background: c.situacao === 'erro' ? '#450a0a' : '#422006', color: c.situacao === 'erro' ? '#fca5a5' : '#fcd34d' }}>
                {c.situacao === 'erro' && c.revisaoVigente != null ? 'A vigente foi mantida. ' : ''}{c.motivo}
              </div>
            )}
            {c.podeTentarDeNovo && (
              <button onClick={() => tentarDeNovo(c.resourceId)} disabled={tentando === c.resourceId}
                title="Busca e confere de novo as revisões recusadas desta camada"
                className="px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1" style={{ background: '#1e3a5f', color: '#e2e8f0' }}>
                {tentando === c.resourceId ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />} Tentar de novo
              </button>
            )}

            {/* Histórico (Q6) */}
            {(c.revisoes.length > 0 || c.recusadas.length > 0) && (
              <div>
                <button onClick={() => alternarHistorico(c.resourceId)} className="flex items-center gap-1 text-[10px] font-bold" style={{ color: '#94a3b8' }}>
                  {abertoHist ? <ChevronDown size={11} /> : <ChevronRight size={11} />} Histórico ({c.revisoes.length} {c.revisoes.length === 1 ? 'revisão' : 'revisões'})
                </button>
                {abertoHist && (
                  <div className="mt-1 space-y-0.5">
                    {c.revisoes.map(r => {
                      const vigente = r.n === c.revisaoVigente;
                      const emComparacao = comparacao?.resourceId === c.resourceId && comparacao.n === r.n;
                      const comparavel = r.operacao === 'upsert' && r.n !== c.revisaoGeometria;
                      return (
                        <div key={r.n} className="flex items-center gap-2 text-[10px] rounded px-1.5 py-0.5" style={{ background: emComparacao ? '#1e293b' : 'transparent' }}>
                          <span className="font-bold" style={{ color: vigente ? '#4ade80' : '#cbd5e1' }}>rev. {r.n}</span>
                          <span style={{ color: '#64748b' }}>{dataCurta(r.recebidoEm)}</span>
                          {r.operacao === 'archive' && <span style={{ color: '#94a3b8' }}>arquivamento</span>}
                          {vigente && <span style={{ color: '#4ade80' }}>vigente</span>}
                          <code className="truncate" style={{ color: '#475569' }} title={r.checksum}>{r.checksum.slice(0, 8)}…</code>
                          {r.observacao && <span title={r.observacao} style={{ color: '#fbbf24' }}>⚠ sem kind</span>}
                          {comparavel && (
                            <button onClick={() => setComparacao(emComparacao ? null : { resourceId: c.resourceId, n: r.n })}
                              className="ml-auto flex items-center gap-0.5 font-bold" style={{ color: emComparacao ? '#fbbf24' : '#7dd3fc' }}>
                              <GitCompare size={10} /> {emComparacao ? 'Parar comparação' : 'Comparar no mapa'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {c.recusadas.map((x, i) => (
                      <div key={`rec-${x.n}-${i}`} className="text-[10px] rounded px-1.5 py-0.5" style={{ color: '#fca5a5' }} title={x.motivo ?? undefined}>
                        <span className="font-bold">rev. {x.n} recusada</span>
                        <span style={{ color: '#64748b' }}> · {dataCurta(x.em)}</span>
                        {x.motivo && <span style={{ color: '#94a3b8' }}> · {x.motivo}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="truncate">
      <span style={{ color: '#64748b' }}>{rotulo}: </span>
      <span style={{ color: '#cbd5e1' }}>{valor}</span>
    </div>
  );
}
