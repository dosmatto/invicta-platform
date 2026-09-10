'use client';

// Monitoramento automático por satélite (pendência 40) — a tela.
//
// Marca o talhão para o robô noturno (backend/agenda.py) varrer sozinho em
// horário de baixo uso. Três peças, usadas em lugares diferentes:
//   • BotaoMonitorar — o cartão de liga/desliga dentro do talhão;
//   • PainelRegras   — os 4 limiares, reaproveitado no talhão e na fazenda;
//   • LogExecucoes   — o que o robô fez, e POR QUE recusou cada cena.
//
// As camadas que ele gera são iguais às feitas à mão (mesma coleção, mesmo id,
// mesmo formato) — só carregam `automatico: true`, que é o que permite filtrar
// e apagar em massa depois.

import { useEffect, useMemo, useState } from 'react';
import {
  getMonitorSatelite, setMonitorSatelite, type MonitorSatelite as Monitor, type RegrasAceiteMsr,
} from '@/lib/store';
import { listarExecucoes, itensDoTalhao, TEXTO_STATUS, type ExecucaoMsr } from '@/lib/msrMonitor';
import { estimativaMbPorCena } from '@/lib/msrSelecao';
import { indicesDisponiveis } from '@/lib/msr';
import { cloudPodeGravar } from '@/lib/cloud';
import { emailUsuario } from '@/lib/empresa';
import { Radar, Loader2, ChevronDown, ChevronRight, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { inputStyle } from '@/constants/ui';

const dm = (s?: string) => s ? new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—';
const dmh = (s?: string) => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

export const REGRAS_UI: Array<{ campo: keyof RegrasAceiteMsr; rotulo: string; ajuda: string; passo: number; min: number; max: number; sufixo: string }> = [
  { campo: 'pctLimpoMin', rotulo: 'Talhão limpo, no mínimo', passo: 5, min: 0, max: 100, sufixo: '%',
    ajuda: 'Quanto do TALHÃO precisa estar livre de nuvem e sombra. É a regra que importa — a nuvem da cena inteira não diz nada sobre o seu talhão.' },
  { campo: 'ndviMin', rotulo: 'Vigor médio, no mínimo', passo: 0.05, min: 0, max: 1, sufixo: '',
    ajuda: 'NDVI médio abaixo disto é solo exposto ou pós-colheita. Evita encher o banco de imagem sem lavoura.' },
  { campo: 'nuvemMaxCena', rotulo: 'Nuvem da cena, no máximo', passo: 5, min: 0, max: 100, sufixo: '%',
    ajuda: 'Filtro barato, aplicado no catálogo antes de baixar qualquer banda. Serve só para o robô não perder tempo.' },
  { campo: 'intervaloMinDias', rotulo: 'Intervalo entre imagens', passo: 1, min: 1, max: 60, sufixo: ' dias',
    ajuda: 'No máximo uma imagem guardada a cada N dias, mesmo que passem duas boas seguidas. É o freio do tamanho do banco.' },
];

// ── Painel de regras (talhão ou lote) ────────────────────────────────────────

export function PainelRegras({ valor, indices, pixelM, onMudar, nx, ny }: {
  valor: RegrasAceiteMsr;
  indices: string[];
  pixelM: number;
  onMudar: (regras: RegrasAceiteMsr, indices: string[]) => void;
  nx?: number; ny?: number;
}) {
  const disponiveis = useMemo(() => indicesDisponiveis('sentinel').ok, []);
  const mb = estimativaMbPorCena(nx ?? 400, ny ?? 400, Math.max(1, indices.length));
  // ~4 cenas por mês é o que o Sentinel-2 entrega com o filtro de nuvem ligado.
  const porMes = mb * 4;

  return (
    <div className="space-y-2">
      {REGRAS_UI.map(r => (
        <div key={r.campo}>
          <div className="flex items-center justify-between gap-2">
            <label className="text-[10px] font-semibold" style={{ color: '#93c5fd' }}>{r.rotulo}</label>
            <div className="flex items-center gap-1">
              <input type="number" min={r.min} max={r.max} step={r.passo}
                value={valor[r.campo]}
                onChange={e => onMudar({ ...valor, [r.campo]: Number(e.target.value) }, indices)}
                className="w-16 rounded px-1.5 py-0.5 text-[11px] text-right outline-none" style={inputStyle} />
              <span className="text-[9px] w-8" style={{ color: '#64748b' }}>{r.sufixo}</span>
            </div>
          </div>
          <p className="text-[8px] leading-snug mt-0.5" style={{ color: '#475569' }}>{r.ajuda}</p>
        </div>
      ))}

      <div>
        <label className="text-[10px] font-semibold block mb-1" style={{ color: '#93c5fd' }}>Índices a calcular</label>
        <div className="flex flex-wrap gap-1">
          {disponiveis.map(i => {
            const on = indices.includes(i.id);
            return (
              <button key={i.id}
                onClick={() => onMudar(valor, on ? indices.filter(x => x !== i.id) : [...indices, i.id])}
                className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                style={{ background: on ? 'var(--invicta-blue-mid)' : '#0b1d3a', border: '1px solid #1a3a6b', color: on ? '#fff' : '#64748b' }}
                title={i.resumo}>
                {i.nome}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-[9px] leading-relaxed p-1.5 rounded" style={{ background: '#0b1d3a', color: '#94a3b8' }}>
        Espaço no banco: cada imagem guardada ocupa cerca de <b>{mb.toFixed(1)} MB</b> com {indices.length || 1} índice
        {indices.length > 1 ? 's' : ''} — algo perto de <b>{porMes.toFixed(0)} MB por mês</b> em cada talhão monitorado.
        Multiplique pelos talhões que pretende marcar antes de marcar todos.
        {pixelM ? ` Resolução: ${pixelM} m.` : ''}
      </p>
    </div>
  );
}

// ── Cartão de liga/desliga dentro do talhão ──────────────────────────────────

export function BotaoMonitorar({ talhaoId, fazendaId, onDesligarComCamadas }: {
  talhaoId: string;
  fazendaId?: string;
  /** Chamado ao DESLIGAR: quem sabe listar/apagar as camadas é o painel de satélite. */
  onDesligarComCamadas?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  // O store é síncrono (localStorage): ler DERIVANDO é mais simples e correto do
  // que gravar no estado dentro de um efeito. O contador é o que força a releitura
  // depois de uma gravação nossa.
  const [versao, setVersao] = useState(0);
  const mon: Monitor | undefined = useMemo(
    () => { void versao; return getMonitorSatelite(talhaoId); },   // `versao` invalida o cache
    [talhaoId, versao],
  );
  const podeGravar = cloudPodeGravar();

  const ativo = !!mon?.ativo;
  const regras = mon?.regras ?? { pctLimpoMin: 70, ndviMin: 0.15, nuvemMaxCena: 20, intervaloMinDias: 5 };
  const indices = mon?.indices ?? ['NDVI'];

  function alternar() {
    if (!podeGravar) return;
    setMonitorSatelite(talhaoId, {
      ativo: !ativo, fazendaId, usuario: emailUsuario() ?? undefined,
      desde: mon?.desde ?? new Date().toISOString().slice(0, 10),
    });
    setVersao(v => v + 1);
    if (ativo) onDesligarComCamadas?.();     // estava ligado → acabou de desligar
  }

  function mudarRegras(r: RegrasAceiteMsr, inds: string[]) {
    setMonitorSatelite(talhaoId, { regras: r, indices: inds });
    setVersao(v => v + 1);
  }

  return (
    <div className="rounded-lg p-2.5 space-y-2" style={{ background: '#061525', border: `1px solid ${ativo ? '#166534' : '#1a3a6b'}` }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Radar size={13} style={{ color: ativo ? '#4ade80' : '#64748b' }} className="flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold" style={{ color: ativo ? '#86efac' : '#94a3b8' }}>
              Busca automática de madrugada: {ativo ? 'ligada' : 'desligada'}
            </p>
            <p className="text-[9px]" style={{ color: '#64748b' }}>
              {ativo
                ? 'O servidor procura imagens novas sozinho e guarda só as que passam nas regras.'
                : 'Ligue para não depender de alguém abrir esta tela para o histórico continuar.'}
            </p>
          </div>
        </div>
        <button onClick={alternar} disabled={!podeGravar}
          className="px-2.5 py-1 rounded text-[10px] font-bold flex-shrink-0"
          style={{ background: ativo ? '#7f1d1d' : 'var(--invicta-green-dark)', color: '#fff', opacity: podeGravar ? 1 : 0.5 }}>
          {ativo ? 'Desligar' : 'Ligar'}
        </button>
      </div>

      {!podeGravar && (
        <p className="text-[9px]" style={{ color: '#fbbf24' }}>Faça login para agendar o monitoramento.</p>
      )}

      <button onClick={() => setAberto(a => !a)} className="text-[10px] font-semibold flex items-center gap-1" style={{ color: '#93c5fd' }}>
        {aberto ? <ChevronDown size={11} /> : <ChevronRight size={11} />} Regras e histórico
      </button>

      {aberto && (
        <div className="space-y-2.5 pt-0.5">
          <PainelRegras valor={regras} indices={indices} pixelM={mon?.pixelM ?? 10} onMudar={mudarRegras} />
          <LogExecucoes talhaoId={talhaoId} />
        </div>
      )}
    </div>
  );
}

// ── Log das execuções ────────────────────────────────────────────────────────

export function LogExecucoes({ talhaoId }: { talhaoId?: string }) {
  const [execs, setExecs] = useState<ExecucaoMsr[] | null>(null);
  const [abertas, setAbertas] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let vivo = true;
    listarExecucoes(10).then(e => { if (vivo) setExecs(e); }).catch(() => { if (vivo) setExecs([]); });
    return () => { vivo = false; };
  }, []);

  if (execs === null) {
    return <p className="text-[10px] flex items-center gap-1.5" style={{ color: '#64748b' }}><Loader2 size={11} className="animate-spin" /> Carregando o histórico…</p>;
  }
  if (execs.length === 0) {
    return <p className="text-[9px]" style={{ color: '#64748b' }}>O robô ainda não rodou nenhuma vez.</p>;
  }

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold" style={{ color: '#93c5fd' }}>Últimas execuções</p>
      {execs.map(e => {
        const itens = talhaoId ? itensDoTalhao([e], talhaoId) : (e.itens ?? []);
        if (talhaoId && itens.length === 0) return null;
        const aberta = !!abertas[e.id];
        const t = e.totais ?? { talhoes: 0, avaliadas: 0, salvas: 0, erros: 0 };
        return (
          <div key={e.id} className="rounded p-1.5" style={{ background: '#0b1d3a', border: '1px solid #1a3a6b' }}>
            <button onClick={() => setAbertas(a => ({ ...a, [e.id]: !a[e.id] }))} className="w-full text-left">
              <p className="text-[10px] font-bold flex items-center gap-1" style={{ color: '#cbd5e1' }}>
                {aberta ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                {dmh(e.iniciadoEm)} · {TEXTO_STATUS[e.status] ?? e.status}
              </p>
              <p className="text-[9px] pl-3.5" style={{ color: '#64748b' }}>
                {talhaoId
                  ? `${itens.filter(i => i.decisao === 'salva').length} salva(s) de ${itens.length} avaliada(s) neste talhão`
                  : `${t.salvas} salva(s) de ${t.avaliadas} avaliada(s) em ${t.talhoes} talhão(ões)`}
                {t.erros ? ` · ${t.erros} erro(s)` : ''}
              </p>
            </button>
            {aberta && (
              <div className="pl-3.5 pt-1 space-y-0.5">
                {itens.slice(0, 40).map((i, k) => (
                  <p key={k} className="text-[9px] flex items-start gap-1" style={{ color: '#94a3b8' }}>
                    {i.decisao === 'salva' ? <CheckCircle2 size={9} style={{ color: '#4ade80' }} className="flex-shrink-0 mt-0.5" />
                      : i.decisao === 'erro' ? <AlertTriangle size={9} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
                        : <XCircle size={9} style={{ color: '#fb923c' }} className="flex-shrink-0 mt-0.5" />}
                    <span>
                      {dm(i.data)} · {i.pctLimpo != null ? `${i.pctLimpo}% limpo` : 'sem avaliação'}
                      {i.ndviMedio != null ? ` · vigor ${Number(i.ndviMedio).toFixed(2)}` : ''}
                      {i.decisao !== 'salva' ? ` — ${i.motivo}` : ''}
                    </span>
                  </p>
                ))}
                {itens.length > 40 && <p className="text-[8px]" style={{ color: '#475569' }}>…e mais {itens.length - 40}.</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
