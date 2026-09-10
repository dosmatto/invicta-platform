'use client';

// Monitoramento por satélite da FAZENDA inteira (pendência 40).
//
// Marcar 30 talhões um a um, entrando em 30 telas, não é fluxo — é penitência.
// Aqui a fazenda inteira aparece numa lista com caixas de seleção, as regras são
// aplicadas ao lote, e o que já está monitorado fica visível de saída.
//
// Vive ao lado de RelatoriosFazenda (mesmo lugar, mesmo recolhimento) em vez de
// dentro da lista de talhões: aquela linha já é um botão com gaveta e menu
// próprios, e enfiar uma caixa de seleção nela quebraria os dois gestos.

import { useMemo, useState } from 'react';
import {
  getTalhoes, getMonitoresSatelite, setMonitorSatelite,
  type Talhao, type RegrasAceiteMsr,
} from '@/lib/store';
import { PainelRegras, LogExecucoes } from '@/components/talhao/MonitorSatelite';
import { cloudPodeGravar } from '@/lib/cloud';
import { emailUsuario } from '@/lib/empresa';
import { Radar, ChevronDown, ChevronRight, Search } from 'lucide-react';

const REGRAS_INICIAIS: RegrasAceiteMsr = { pctLimpoMin: 70, ndviMin: 0.15, nuvemMaxCena: 20, intervaloMinDias: 5 };

export function MonitorFazenda({ fazendaId }: { fazendaId: string }) {
  const [aberto, setAberto] = useState(false);
  // Store síncrono: deriva em vez de copiar para o estado dentro de um efeito.
  // O contador força a releitura depois das nossas próprias gravações.
  const [versao, setVersao] = useState(0);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [busca, setBusca] = useState('');
  const [regras, setRegras] = useState<RegrasAceiteMsr>(REGRAS_INICIAIS);
  const [indices, setIndices] = useState<string[]>(['NDVI']);
  const [aviso, setAviso] = useState('');
  const podeGravar = cloudPodeGravar();

  // `void versao` existe para o lint enxergar o que o cache já usa: o contador
  // não entra na conta, só invalida o resultado depois de uma gravação nossa.
  const talhoes: Talhao[] = useMemo(
    () => { void versao; return getTalhoes(fazendaId); },
    [fazendaId, versao],
  );
  const ativos: Record<string, boolean> = useMemo(() => {
    void versao;
    const m: Record<string, boolean> = {};
    for (const mon of getMonitoresSatelite()) m[mon.talhaoId] = !!mon.ativo;
    return m;
  }, [versao]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return [...talhoes]
      .filter(t => !q || t.nome.toLowerCase().includes(q))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }));
  }, [talhoes, busca]);

  // Talhão sem limite não tem o que recortar — marcar seria prometer o que o
  // robô não consegue cumprir, e ele só descobriria de madrugada.
  const semLimite = (t: Talhao) => !t.geojson;
  const elegiveis = lista.filter(t => !semLimite(t));
  const marcados = elegiveis.filter(t => sel[t.id]);
  const nAtivos = Object.values(ativos).filter(Boolean).length;

  function aplicar(ativo: boolean) {
    if (!podeGravar || marcados.length === 0) return;
    for (const t of marcados) {
      setMonitorSatelite(t.id, {
        ativo, fazendaId, regras, indices,
        usuario: emailUsuario() ?? undefined,
        desde: new Date().toISOString().slice(0, 10),
      });
    }
    setAviso(`${marcados.length} talhão(ões) ${ativo ? 'passaram a ser monitorados' : 'saíram do monitoramento'}.`
      + (ativo ? '' : ' As camadas já guardadas continuam no banco — para apagá-las, abra o talhão → NDVI → Camadas salvas.'));
    setSel({});
    setVersao(v => v + 1);
  }

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
      <button onClick={() => setAberto(a => !a)} className="w-full flex items-center gap-2 px-2.5 py-2 text-left">
        {aberto ? <ChevronDown size={12} style={{ color: '#64748b' }} /> : <ChevronRight size={12} style={{ color: '#64748b' }} />}
        <Radar size={12} style={{ color: nAtivos ? '#4ade80' : '#64748b' }} />
        <span className="text-xs font-semibold flex-1" style={{ color: '#93c5fd' }}>Monitoramento por satélite</span>
        <span className="text-[10px]" style={{ color: nAtivos ? '#86efac' : '#64748b' }}>
          {nAtivos ? `${nAtivos} talhão(ões)` : 'desligado'}
        </span>
      </button>

      {aberto && (
        <div className="px-2.5 pb-2.5 space-y-2">
          <p className="text-[9px] leading-relaxed" style={{ color: '#64748b' }}>
            Os talhões marcados são varridos de madrugada: o servidor procura imagens novas do Sentinel-2 e
            guarda só as que passam nas regras abaixo. As camadas ficam prontas para usar, iguais às feitas à mão.
          </p>

          {!podeGravar && <p className="text-[9px]" style={{ color: '#fbbf24' }}>Faça login para agendar o monitoramento.</p>}

          {talhoes.length > 8 && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded" style={{ background: '#0b1d3a', border: '1px solid #1a3a6b' }}>
              <Search size={11} style={{ color: '#64748b' }} />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="filtrar talhões"
                className="flex-1 bg-transparent text-[11px] outline-none" style={{ color: '#e2e8f0' }} />
            </div>
          )}

          <div className="flex gap-2 text-[9px]">
            <button onClick={() => setSel(Object.fromEntries(elegiveis.map(t => [t.id, true])))} style={{ color: '#93c5fd' }}>todos</button>
            <button onClick={() => setSel({})} style={{ color: '#93c5fd' }}>nenhum</button>
            <button onClick={() => setSel(Object.fromEntries(elegiveis.filter(t => !ativos[t.id]).map(t => [t.id, true])))} style={{ color: '#93c5fd' }}>
              só os não monitorados
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto space-y-0.5 pr-1">
            {lista.length === 0 && <p className="text-[10px]" style={{ color: '#64748b' }}>Nenhum talhão.</p>}
            {lista.map(t => {
              const bloqueado = semLimite(t);
              return (
                <label key={t.id} className="flex items-center gap-1.5"
                  style={{ opacity: bloqueado ? 0.45 : 1, cursor: bloqueado ? 'not-allowed' : 'pointer' }}
                  title={bloqueado ? 'Talhão sem limite geográfico — não há o que recortar' : undefined}>
                  <input type="checkbox" disabled={bloqueado} checked={!!sel[t.id]}
                    onChange={e => setSel(s => ({ ...s, [t.id]: e.target.checked }))}
                    className="accent-green-600 flex-shrink-0" style={{ width: 13, height: 13 }} />
                  <span className="text-[10px] flex-1 min-w-0" style={{ color: '#cbd5e1', overflowWrap: 'anywhere' }}>{t.nome}</span>
                  {bloqueado
                    ? <span className="text-[8px] flex-shrink-0" style={{ color: '#fbbf24' }}>sem limite</span>
                    : ativos[t.id] && <span className="text-[8px] flex-shrink-0" style={{ color: '#4ade80' }}>● monitorado</span>}
                </label>
              );
            })}
          </div>

          <div className="pt-1 space-y-2" style={{ borderTop: '1px solid #12294d' }}>
            <p className="text-[10px] font-semibold" style={{ color: '#93c5fd' }}>Regras aplicadas aos selecionados</p>
            <PainelRegras valor={regras} indices={indices} pixelM={10}
              onMudar={(r, i) => { setRegras(r); setIndices(i); }} />
          </div>

          <div className="flex gap-1.5">
            <button onClick={() => aplicar(true)} disabled={!podeGravar || marcados.length === 0}
              className="flex-1 py-1.5 rounded text-[10px] font-bold text-white"
              style={{ background: marcados.length ? 'var(--invicta-green-dark)' : '#12294d', opacity: podeGravar ? 1 : 0.5 }}>
              Ligar em {marcados.length}
            </button>
            <button onClick={() => aplicar(false)} disabled={!podeGravar || marcados.length === 0}
              className="flex-1 py-1.5 rounded text-[10px] font-bold"
              style={{ background: '#1a3a6b', color: marcados.length ? '#fca5a5' : '#475569' }}>
              Desligar em {marcados.length}
            </button>
          </div>

          {aviso && <p className="text-[9px]" style={{ color: '#86efac' }}>{aviso}</p>}

          <LogExecucoes />
        </div>
      )}
    </div>
  );
}
