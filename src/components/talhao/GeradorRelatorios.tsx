'use client';

// Gerador de Relatórios (aba Relatórios da Página do Talhão). Carrega os mapas
// de fertilidade SALVOS NA NUVEM do talhão+safra, deixa o usuário selecionar e
// reordenar os elementos + ligar/desligar satélite e valores, e gera um PDF
// ÚNICO (uma página por elemento) reaproveitando o layout oficial V1.

import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { carregarContextoRelatorio, montarPaginas, type ContextoRelatorio } from '@/lib/relatorioDados';
import { gerarRelatorioMultiplo } from '@/lib/relatorioFertilidade';
import { FileDown, Loader2, ChevronUp, ChevronDown, AlertTriangle, CheckSquare, Square, Satellite, Hash } from 'lucide-react';

export function GeradorRelatorios({ safraNome }: { safraNome?: string } = {}) {
  const { nav } = useApp();
  const safra = safraNome ?? '';

  const [ctx, setCtx] = useState<ContextoRelatorio | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [ordem, setOrdem] = useState<string[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [satelite, setSatelite] = useState(true);
  const [valores, setValores] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let cancel = false;
    if (!nav.talhaoId || !safra) { setCtx(null); setCarregando(false); return; }
    setCarregando(true); setErro('');
    carregarContextoRelatorio(nav.talhaoId, safra)
      .then(c => {
        if (cancel) return;
        setCtx(c);
        setOrdem(c.elementos.map(e => e.nut));
        setSel(new Set(c.elementos.map(e => e.nut)));
        setCarregando(false);
      })
      .catch(() => { if (!cancel) { setErro('Falha ao carregar os mapas salvos.'); setCarregando(false); } });
    return () => { cancel = true; };
  }, [nav.talhaoId, safra]);

  function toggle(nut: string) { setSel(s => { const n = new Set(s); if (n.has(nut)) n.delete(nut); else n.add(nut); return n; }); }
  function mover(i: number, dir: -1 | 1) {
    setOrdem(o => { const n = [...o]; const j = i + dir; if (j < 0 || j >= n.length) return o; [n[i], n[j]] = [n[j], n[i]]; return n; });
  }

  async function gerar() {
    if (!ctx) return;
    const nuts = ordem.filter(n => sel.has(n));
    if (nuts.length === 0) { setErro('Selecione ao menos um mapa.'); return; }
    setGerando(true); setErro('');
    try {
      const paginas = montarPaginas(ctx, nuts, { satelite, valores });
      if (paginas.length === 0) { setErro('Nenhuma página gerável (mapas sem dados completos).'); return; }
      await gerarRelatorioMultiplo(paginas, `Relatorio_Fertilidade_${ctx.talhao}_${safra}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao gerar o relatório.');
    } finally { setGerando(false); }
  }

  if (!safra) return <div className="px-4 py-4"><Aviso texto="Defina uma safra (no topo) para montar o relatório." /></div>;
  if (carregando) return <div className="px-4 py-4 flex items-center gap-2 text-xs" style={{ color: '#64748b' }}><Loader2 size={13} className="animate-spin" /> Carregando mapas salvos na nuvem…</div>;
  if (!ctx || ctx.elementos.length === 0) return <div className="px-4 py-4"><Aviso texto="Nenhum mapa de fertilidade salvo na nuvem para este talhão/safra. Processe os mapas na aba Fertilidade (logado) e volte aqui." /></div>;

  const elPorNut = Object.fromEntries(ctx.elementos.map(e => [e.nut, e]));
  const nSel = ordem.filter(n => sel.has(n)).length;

  return (
    <div className="px-4 py-3 space-y-3">
      <p className="text-[11px]" style={{ color: '#94a3b8' }}>
        Relatório de <strong style={{ color: '#cbd5e1' }}>Fertilidade</strong> — selecione e ordene os mapas. Cada elemento vira uma página num PDF único.
      </p>

      <div className="space-y-1">
        {ordem.map((nut, i) => {
          const e = elPorNut[nut]; if (!e) return null;
          const on = sel.has(nut);
          return (
            <div key={nut} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: '#061525', border: `1px solid ${on ? '#1a3a6b' : '#0f2240'}` }}>
              <button onClick={() => toggle(nut)} title={on ? 'Remover' : 'Incluir'}>
                {on ? <CheckSquare size={16} style={{ color: '#4ade80' }} /> : <Square size={16} style={{ color: '#475569' }} />}
              </button>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold" style={{ color: on ? '#e2e8f0' : '#64748b' }}>{e.atributo} ({e.simbolo})</span>
                <span className="text-[10px] ml-1.5" style={{ color: '#64748b' }}>· {e.profundidades.join(' / ')} cm</span>
              </div>
              <button onClick={() => mover(i, -1)} disabled={i === 0} className="p-0.5 disabled:opacity-30" style={{ color: '#93c5fd' }}><ChevronUp size={14} /></button>
              <button onClick={() => mover(i, 1)} disabled={i === ordem.length - 1} className="p-0.5 disabled:opacity-30" style={{ color: '#93c5fd' }}><ChevronDown size={14} /></button>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <ToggleBtn on={satelite} onClick={() => setSatelite(v => !v)} icon={Satellite} label="Satélite" />
        <ToggleBtn on={valores} onClick={() => setValores(v => !v)} icon={Hash} label="Valores" />
      </div>

      {erro && <p className="text-[10px]" style={{ color: '#f87171' }}>{erro}</p>}

      <button onClick={gerar} disabled={gerando || nSel === 0}
        className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
        style={{ background: 'var(--invicta-blue-mid)' }}>
        {gerando ? <><Loader2 size={13} className="animate-spin" /> Gerando PDF…</> : <><FileDown size={13} /> Gerar PDF ({nSel} {nSel === 1 ? 'mapa' : 'mapas'})</>}
      </button>
      <p className="text-[9px]" style={{ color: '#475569' }}>
        Usa os mapas já salvos na nuvem (processados na aba Fertilidade). Se faltar algum elemento aqui, processe-o lá primeiro.
      </p>
    </div>
  );
}

function ToggleBtn({ on, onClick, icon: Icon, label }: { on: boolean; onClick: () => void; icon: React.ElementType; label: string }) {
  return (
    <button onClick={onClick} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-[11px] font-semibold"
      style={{ background: on ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: on ? '#fff' : '#64748b' }}>
      <Icon size={12} /> {label}: {on ? 'sim' : 'não'}
    </button>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
      <AlertTriangle size={14} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
      <p className="text-[10px]" style={{ color: '#fbbf24' }}>{texto}</p>
    </div>
  );
}
