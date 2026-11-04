'use client';

// Biblioteca → PrecisionFarm — TELA DE LOTE da integração (só owner/admin).
//
// Visão GERAL: todos os talhões com vínculo, de todos os clientes (GET
// /api/precisionfarm/lote), com filtro por cliente e fazenda e seleção por caixa.
// As ações em lote chamam as MESMAS rotas da seção do talhão
// (IntegracaoPrecisionFarm), talhão a talhão, com concorrência limitada
// (lote.ts → executarEmLote): mesmas travas, mesma idempotência; um talhão que
// falha não para os outros, e cada linha mostra ok / pulado (motivo) / erro.
//   • Confirmar / Suspender → POST /vinculo (confirmar exige o ID PF;
//     confirmado não troca de ID).
//   • Publicar zoneamento / colheita → POST /publicar com a escolha de
//     escolhaPublicacao (zoneamento padrão; colheitas oficiais) — o conteúdo é
//     lido NA NUVEM pela rota; o que vai daqui é a conferência de sincronização.
//   • Comparar limites → GET /limite e compararLimites contra o limite LOCAL;
//     só mostra a diferença — a adoção continua talhão a talhão.
//   • Importar manifesto da PF → ManifestoPrecisionFarm (cria pendentes).
// A rota confere sessão e papel de novo — esconder a entrada é só conforto.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileUp, GitCompare, Link2, Loader2, PauseCircle, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { getClientes, getFazendas, getTalhoes, type Talhao } from '@/lib/store';
import { cloudAindaNaoHidratou } from '@/lib/cloud';
import { fmtDec } from '@/lib/formato';
import {
  acaoVinculoPF, limitePF, loteGeralPF, publicarColheitaPF, publicarZonasPF, type Resp, type VinculoLote,
} from '@/lib/precisionfarm/cliente';
import {
  ROTULO_EPOCA, ROTULO_STATUS, colheitaSemEpoca, colheitasParaPublicar, geoVersaoDoTalhao, zoneamentoParaPublicar,
} from '@/lib/precisionfarm/escolhaPublicacao';
import { compararLimites, geometriaDoTalhao } from '@/lib/precisionfarm/compararLimite';
import {
  desfechoDaFalha, executarEmLote, juntarResultados, ok, pulado, erro, resumoDoLote,
  type ProgressoLote, type ResultadoLote,
} from '@/lib/precisionfarm/lote';
import ManifestoPrecisionFarm from './ManifestoPrecisionFarm';

type Acao = 'confirmar' | 'suspender' | 'zonas' | 'colheita' | 'limite';
const NOME_ACAO: Record<Acao, string> = {
  confirmar: 'Confirmar', suspender: 'Suspender', zonas: 'Publicar zoneamento', colheita: 'Publicar colheita', limite: 'Comparar limites',
};
const COR_DESFECHO = { ok: '#86efac', pulado: '#fbbf24', erro: '#fca5a5' } as const;

/** Diferença de limite de uma linha (preenchida pela ação Comparar). */
type DifLimite = { revisao: number; difSimM2: number; difSimPct: number | null; identicos: boolean; semLimiteAqui: boolean };

/** Linha da tabela: vínculo + o que o aparelho sabe do talhão. */
interface Linha {
  v: VinculoLote;
  local: Talhao | null;
  nome: string;
  fazendaId: string;
  fazenda: string;
  clienteId: string;
  cliente: string;
}

const dataCurta = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
/** "2026/2027" → "26/27" (só para caber na coluna). */
const safraCurta = (s: string | null) => (s && /^\d{4}\/\d{4}$/.test(s) ? `${s.slice(2, 4)}/${s.slice(7, 9)}` : s ?? '');
const PERIODO_CURTO: Record<string, string> = { main: 'Ver', second: 'Saf', winter: 'Inv' };

/** Falha de rota → desfecho da linha (409/422… = pulado; rede/5xx = erro). */
function daFalha(r: Extract<Resp<unknown>, { ok: false }>, prefixo = ''): ResultadoLote {
  const d = desfechoDaFalha(r.status);
  const t = `${prefixo}${r.erro}`;
  return d === 'pulado' ? pulado(t) : erro(t);
}

export default function PrecisionFarmLote() {
  const [carga, setCarga] = useState<'carregando' | 'ok' | { erro: string }>('carregando');
  const [vinculos, setVinculos] = useState<VinculoLote[]>([]);
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroFazenda, setFiltroFazenda] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [resultados, setResultados] = useState<Record<string, ResultadoLote & { acao: Acao }>>({});
  const [difs, setDifs] = useState<Record<string, DifLimite>>({});
  const [progresso, setProgresso] = useState<(ProgressoLote & { acao: Acao }) | null>(null);
  const [resumo, setResumo] = useState<string | null>(null);
  const [manifesto, setManifesto] = useState(false);

  const aplicar = useCallback((r: Awaited<ReturnType<typeof loteGeralPF>>) => {
    if (!r.ok) { setCarga({ erro: r.erro }); return; }
    setVinculos(r.vinculos);
    setCarga('ok');
  }, []);
  const carregar = useCallback(async () => aplicar(await loteGeralPF()), [aplicar]);
  // Só muda estado DEPOIS da resposta (no callback, nada síncrono no efeito).
  useEffect(() => {
    let vivo = true;
    void loteGeralPF().then(r => { if (vivo) aplicar(r); });
    return () => { vivo = false; };
  }, [aplicar]);

  // Nomes do aparelho (local-first). Talhão que não está aqui usa o nome da
  // nuvem; nem lá (vínculo com talhão apagado/estranho) → o id, marcado.
  const linhas = useMemo((): Linha[] => {
    const talhoes = new Map(getTalhoes().map(t => [t.id, t]));
    const fazendas = new Map(getFazendas().map(f => [f.id, f]));
    const clientes = new Map(getClientes().map(c => [c.id, c]));
    return vinculos.map(v => {
      const local = talhoes.get(v.talhaoId) ?? null;
      const fazendaId = v.fazendaId ?? local?.fazendaId ?? '';
      const fz = fazendas.get(fazendaId);
      const clienteId = v.clienteId ?? fz?.clienteId ?? '';
      return {
        v, local,
        nome: local?.nome ?? v.naNuvem?.nome ?? `talhão ${v.talhaoId}`,
        fazendaId, fazenda: fz?.nome ?? (fazendaId ? `fazenda ${fazendaId}` : '—'),
        clienteId, cliente: clientes.get(clienteId)?.nome ?? (clienteId ? `cliente ${clienteId}` : '—'),
      };
    }).sort((a, b) => a.cliente.localeCompare(b.cliente, 'pt-BR') || a.fazenda.localeCompare(b.fazenda, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }));
  }, [vinculos]);

  const opcoesCliente = useMemo(() => [...new Map(linhas.map(l => [l.clienteId, l.cliente]))].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')), [linhas]);
  const opcoesFazenda = useMemo(() => [...new Map(linhas.filter(l => !filtroCliente || l.clienteId === filtroCliente).map(l => [l.fazendaId, l.fazenda]))]
    .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')), [linhas, filtroCliente]);
  const visiveis = useMemo(() => linhas.filter(l => (!filtroCliente || l.clienteId === filtroCliente) && (!filtroFazenda || l.fazendaId === filtroFazenda)), [linhas, filtroCliente, filtroFazenda]);
  // A ação vale para o que está MARCADO e VISÍVEL (o filtro manda).
  const alvo = visiveis.filter(l => sel.has(l.v.talhaoId));
  const todosMarcados = visiveis.length > 0 && visiveis.every(l => sel.has(l.v.talhaoId));
  const rodando = !!progresso;

  function marcar(id: string) {
    setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function marcarTodos() {
    setSel(s => {
      const n = new Set(s);
      if (todosMarcados) visiveis.forEach(l => n.delete(l.v.talhaoId)); else visiveis.forEach(l => n.add(l.v.talhaoId));
      return n;
    });
  }

  // ── Passos de UMA linha (cada ação) ──────────────────────────────────────

  async function confirmar(l: Linha): Promise<ResultadoLote> {
    if (l.v.status === 'confirmado') return pulado('Já confirmado.');
    if (!l.v.pfLocalId) return pulado('Sem o ID do talhão na PrecisionFarm — informe na seção do talhão (ou pelo manifesto).');
    const r = await acaoVinculoPF(l.v.talhaoId, 'confirmar');
    return r.ok ? ok('Confirmado.') : daFalha(r);
  }

  async function suspender(l: Linha): Promise<ResultadoLote> {
    if (l.v.status === 'suspenso') return pulado('Já suspenso.');
    const r = await acaoVinculoPF(l.v.talhaoId, 'suspender');
    return r.ok ? ok('Suspenso.') : daFalha(r);
  }

  /** Pré-condições comuns da publicação; null = pode seguir. */
  function travaPublicar(l: Linha): ResultadoLote | null {
    if (l.v.status !== 'confirmado') return pulado(`Vínculo ${ROTULO_STATUS[l.v.status].txt.toLowerCase()} — só publica com vínculo confirmado.`);
    if (!l.local) return pulado('Talhão não está neste aparelho.');
    return null;
  }

  async function publicarZonas(l: Linha): Promise<ResultadoLote> {
    const trava = travaPublicar(l);
    if (trava) return trava;
    const z = zoneamentoParaPublicar(l.v.talhaoId);
    if (!z) return pulado('Sem zoneamento padrão.');
    const r = await publicarZonasPF(l.v.talhaoId, z.id, geoVersaoDoTalhao(l.local!));
    if (!r.ok) return daFalha(r);
    return ok(r.criada ? `Zonas publicadas: rev. ${r.revisao}.` : `Zonas sem mudança (rev. ${r.revisao}).`);
  }

  async function publicarColheita(l: Linha): Promise<ResultadoLote> {
    const trava = travaPublicar(l);
    if (trava) return trava;
    const mapas = colheitasParaPublicar(l.v.talhaoId);
    if (!mapas.length) return pulado('Nenhuma colheita oficial.');
    const rs: ResultadoLote[] = [];
    // Os mapas do MESMO talhão em sequência (o lote já paraleliza os talhões).
    for (const m of mapas) {
      const rot = `${m.safra} ${ROTULO_EPOCA[m.epoca] ?? ''}`.trim();
      if (colheitaSemEpoca(m)) { rs.push(pulado(`${m.safra}: sem época de cultivo.`)); continue; }
      const r = await publicarColheitaPF(l.v.talhaoId, m.id, geoVersaoDoTalhao(l.local!));
      rs.push(!r.ok ? daFalha(r, `${rot}: `) : ok(r.criada ? `${rot}: rev. ${r.revisao}.` : `${rot}: sem mudança (rev. ${r.revisao}).`));
    }
    return juntarResultados(rs);
  }

  async function compararLimite(l: Linha): Promise<ResultadoLote> {
    if (l.v.status !== 'confirmado') return pulado('Só com vínculo confirmado.');
    if (!l.local) return pulado('Talhão não está neste aparelho.');
    const r = await limitePF(l.v.talhaoId);
    if (!r.ok) return daFalha(r);
    const geo = geometriaDoTalhao(l.local.geojson);
    if (!geo) {
      setDifs(d => ({ ...d, [l.v.talhaoId]: { revisao: r.limite.revisao, difSimM2: 0, difSimPct: null, identicos: false, semLimiteAqui: true } }));
      return ok('O talhão não tem limite aqui — compare/adote na seção do talhão.');
    }
    const c = compararLimites(r.limite.geometria, geo);
    setDifs(d => ({ ...d, [l.v.talhaoId]: { revisao: r.limite.revisao, difSimM2: c.difSimM2, difSimPct: c.difSimPct, identicos: c.identicos, semLimiteAqui: false } }));
    return ok(c.identicos ? `Igual à PF rev. ${r.limite.revisao}.` : `Difere da PF rev. ${r.limite.revisao}.`);
  }

  const PASSO: Record<Acao, (l: Linha) => Promise<ResultadoLote>> = {
    confirmar, suspender, zonas: publicarZonas, colheita: publicarColheita, limite: compararLimite,
  };

  async function rodar(acao: Acao) {
    const lista = alvo;
    if (!lista.length || rodando) return;
    if (acao === 'suspender' && !confirm(`Suspender ${lista.length} vínculo(s)? A PrecisionFarm deixa de enxergar esses talhões até serem confirmados de novo.`)) return;
    if (acao === 'confirmar' && !confirm(`Confirmar ${lista.length} vínculo(s)? A PrecisionFarm passa a enxergar esses talhões (e o que for publicado neles).`)) return;
    setResumo(null);
    setProgresso({ acao, feitos: 0, total: lista.length, emAndamento: 0 });
    const rs = await executarEmLote(lista, PASSO[acao], {
      aoProgredir: (p, i, r) => {
        setProgresso({ acao, ...p });
        setResultados(prev => ({ ...prev, [lista[i].v.talhaoId]: { ...r, acao } }));
      },
    });
    setProgresso(null);
    setResumo(`${NOME_ACAO[acao]}: ${resumoDoLote(rs).texto}.`);
    // Status e revisões mudaram no servidor: relê a visão geral.
    if (acao !== 'limite') void carregar();
  }

  const btn = (cor: string, ativo: boolean) => ({ background: cor, color: '#fff', opacity: ativo ? 1 : 0.5 });
  const podeAgir = alvo.length > 0 && !rodando;
  const sel_ = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' };

  return (
    <section className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        <div className="flex items-center gap-2 mb-1">
          <Link2 size={14} style={{ color: '#93c5fd' }} />
          <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: '#e2e8f0' }}>PrecisionFarm</h3>
        </div>
        <p className="text-[10px]" style={{ color: '#64748b' }}>
          Todos os talhões com vínculo, em lote: confirmar/suspender, publicar zoneamento padrão e colheita oficial, comparar limites e
          importar o manifesto de vínculos da PrecisionFarm. Adotar limite e trocar o ID PF continuam na seção do talhão.
        </p>
      </div>

      <div className="px-4 py-2 flex-shrink-0 flex flex-wrap items-center gap-2 text-[10px]" style={{ borderBottom: '1px solid #0f2240', color: '#cbd5e1' }}>
        <select value={filtroCliente} onChange={e => { setFiltroCliente(e.target.value); setFiltroFazenda(''); }} className="rounded px-1.5 py-1 outline-none" style={sel_}>
          <option value="">Todos os clientes</option>
          {opcoesCliente.map(([id, nome]) => <option key={id || '-'} value={id}>{nome}</option>)}
        </select>
        <select value={filtroFazenda} onChange={e => setFiltroFazenda(e.target.value)} className="rounded px-1.5 py-1 outline-none" style={sel_}>
          <option value="">Todas as fazendas</option>
          {opcoesFazenda.map(([id, nome]) => <option key={id || '-'} value={id}>{nome}</option>)}
        </select>
        <span style={{ color: '#64748b' }}>{visiveis.length} talhão(ões) · {alvo.length} marcado(s)</span>
        <span className="flex-1" />
        <button onClick={() => void carregar()} disabled={rodando} className="px-2 py-1 rounded font-bold flex items-center gap-1" style={btn('#1e3a5f', !rodando)}>
          <RefreshCw size={11} /> Recarregar
        </button>
        {/* Só com a visão geral carregada: a prévia precisa dos vínculos existentes para apontar duplicatas. */}
        <button onClick={() => setManifesto(m => !m)} disabled={rodando || carga !== 'ok'} className="px-2 py-1 rounded font-bold flex items-center gap-1" style={btn('var(--invicta-blue-mid)', !rodando && carga === 'ok')}>
          <FileUp size={11} /> Importar manifesto da PF
        </button>
      </div>

      <div className="px-4 py-2 flex-shrink-0 flex flex-wrap items-center gap-1.5 text-[10px]" style={{ borderBottom: '1px solid #0f2240' }}>
        <button onClick={() => rodar('confirmar')} disabled={!podeAgir} className="px-2 py-1 rounded font-bold flex items-center gap-1" style={btn('var(--invicta-green-dark)', podeAgir)}>
          <ShieldCheck size={11} /> Confirmar
        </button>
        <button onClick={() => rodar('suspender')} disabled={!podeAgir} className="px-2 py-1 rounded font-bold flex items-center gap-1" style={btn('#7f1d1d', podeAgir)}>
          <PauseCircle size={11} /> Suspender
        </button>
        <button onClick={() => rodar('zonas')} disabled={!podeAgir} className="px-2 py-1 rounded font-bold flex items-center gap-1" style={btn('var(--invicta-blue-mid)', podeAgir)}>
          <Send size={11} /> Publicar zoneamento
        </button>
        <button onClick={() => rodar('colheita')} disabled={!podeAgir} className="px-2 py-1 rounded font-bold flex items-center gap-1" style={btn('var(--invicta-blue-mid)', podeAgir)}>
          <Send size={11} /> Publicar colheita
        </button>
        <button onClick={() => rodar('limite')} disabled={!podeAgir} className="px-2 py-1 rounded font-bold flex items-center gap-1" style={btn('#1e3a5f', podeAgir)}>
          <GitCompare size={11} /> Comparar limites
        </button>
        {progresso && (
          <span className="flex items-center gap-1.5 ml-2" style={{ color: '#7dd3fc' }}>
            <Loader2 size={11} className="animate-spin" />
            {NOME_ACAO[progresso.acao]}: {progresso.feitos}/{progresso.total}{progresso.emAndamento ? ` (${progresso.emAndamento} em andamento)` : ''}
            <span className="inline-block rounded overflow-hidden" style={{ width: 80, height: 4, background: '#1a3a6b' }}>
              <span className="block h-full" style={{ width: `${(progresso.feitos / Math.max(1, progresso.total)) * 100}%`, background: '#7dd3fc' }} />
            </span>
          </span>
        )}
        {!progresso && resumo && <span className="ml-2 font-semibold" style={{ color: '#cbd5e1' }}>{resumo}</span>}
      </div>

      {cloudAindaNaoHidratou() && (
        <div className="px-4 py-1.5 text-[10px]" style={{ background: '#422006', color: '#fbbf24' }}>
          A nuvem ainda está carregando: zoneamentos e colheitas deste aparelho podem estar incompletos — talhões podem sair como “pulados”.
        </div>
      )}

      {manifesto && carga === 'ok' && (
        <ManifestoPrecisionFarm vinculos={vinculos} onFechar={() => setManifesto(false)} onCriados={() => void carregar()} />
      )}

      <div className="flex-1 overflow-auto">
        {carga === 'carregando' && <div className="px-4 py-3 flex items-center gap-1.5 text-[10px]" style={{ color: '#64748b' }}><Loader2 size={11} className="animate-spin" /> Carregando…</div>}
        {typeof carga === 'object' && <div className="m-4 rounded px-2 py-1.5 text-[10px]" style={{ background: '#450a0a', color: '#fca5a5' }}>{carga.erro}</div>}
        {carga === 'ok' && !vinculos.length && <div className="px-4 py-3 text-[10px]" style={{ color: '#64748b' }}>Nenhum talhão vinculado ainda. Gere os identificadores na seção do talhão ou importe o manifesto da PrecisionFarm.</div>}
        {carga === 'ok' && vinculos.length > 0 && (
          <table className="w-full text-[10px]" style={{ color: '#cbd5e1' }}>
            <thead className="sticky top-0" style={{ background: '#061525' }}>
              <tr style={{ color: '#64748b' }}>
                <th className="px-2 py-1.5 text-left"><input type="checkbox" checked={todosMarcados} onChange={marcarTodos} title="Marcar todos os visíveis" /></th>
                <th className="px-2 py-1.5 text-left font-semibold">Talhão</th>
                <th className="px-2 py-1.5 text-left font-semibold">Fazenda</th>
                <th className="px-2 py-1.5 text-left font-semibold">Cliente</th>
                <th className="px-2 py-1.5 text-left font-semibold">ID PF</th>
                <th className="px-2 py-1.5 text-left font-semibold">Vínculo</th>
                <th className="px-2 py-1.5 text-left font-semibold">Zonas</th>
                <th className="px-2 py-1.5 text-left font-semibold">Colheita</th>
                <th className="px-2 py-1.5 text-right font-semibold">Linhas</th>
                <th className="px-2 py-1.5 text-right font-semibold">Dif. limite</th>
                <th className="px-2 py-1.5 text-left font-semibold">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map(l => {
                const v = l.v;
                const st = ROTULO_STATUS[v.status];
                const zonas = v.publicados.find(p => p.tipo === 'management_zones');
                const colheitas = v.publicados.filter(p => p.tipo === 'harvest');
                const d = difs[v.talhaoId];
                const res = resultados[v.talhaoId];
                return (
                  <tr key={v.talhaoId} style={{ borderTop: '1px solid #0f2240' }}>
                    <td className="px-2 py-1"><input type="checkbox" checked={sel.has(v.talhaoId)} onChange={() => marcar(v.talhaoId)} /></td>
                    <td className="px-2 py-1">
                      <span style={{ color: '#e2e8f0' }}>{l.nome}</span>
                      {!l.local && <span className="ml-1" style={{ color: '#fbbf24' }} title={v.naNuvem ? 'O talhão está na nuvem, mas não neste aparelho.' : 'O talhão não existe na nuvem nem aqui.'}>
                        {v.naNuvem ? '(não está aqui)' : '(não encontrado)'}
                      </span>}
                    </td>
                    <td className="px-2 py-1">{l.fazenda}</td>
                    <td className="px-2 py-1">{l.cliente}</td>
                    <td className="px-2 py-1"><code>{v.pfLocalId ?? <span style={{ color: '#64748b' }}>—</span>}</code></td>
                    <td className="px-2 py-1 font-bold" style={{ color: st.cor }}>{st.txt}</td>
                    <td className="px-2 py-1" title={zonas ? `Publicado em ${dataCurta(zonas.publicadoEm)}` : undefined}>
                      {zonas ? `rev. ${zonas.revisao}` : <span style={{ color: '#64748b' }}>—</span>}
                    </td>
                    <td className="px-2 py-1">
                      {colheitas.length
                        ? colheitas.map(c => `${safraCurta(c.season)} ${PERIODO_CURTO[c.seasonPeriod ?? ''] ?? c.seasonPeriod ?? ''} r${c.revisao}`).join(' · ')
                        : <span style={{ color: '#64748b' }}>—</span>}
                    </td>
                    <td className="px-2 py-1 text-right">{v.linhas || <span style={{ color: '#64748b' }}>—</span>}</td>
                    <td className="px-2 py-1 text-right" title={d ? `PrecisionFarm rev. ${d.revisao}` : 'Use "Comparar limites"'}>
                      {!d ? <span style={{ color: '#64748b' }}>—</span>
                        : d.semLimiteAqui ? <span style={{ color: '#fbbf24' }}>sem limite aqui</span>
                          : d.identicos ? <span style={{ color: '#4ade80' }}>igual</span>
                            : <span style={{ color: (d.difSimPct ?? 0) > 5 ? '#fca5a5' : '#fbbf24' }}>
                              {fmtDec(d.difSimM2, 0)} m²{d.difSimPct != null ? ` (${fmtDec(d.difSimPct, 2)}%)` : ''}
                            </span>}
                    </td>
                    <td className="px-2 py-1" style={{ maxWidth: 320 }}>
                      {res && <span style={{ color: COR_DESFECHO[res.desfecho] }} title={NOME_ACAO[res.acao]}>
                        {res.desfecho === 'ok' ? '✓' : res.desfecho === 'pulado' ? 'pulado:' : 'erro:'} {res.texto}
                      </span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
