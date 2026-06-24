'use client';

// Gerador de Relatórios (aba Relatórios da Página do Talhão). Carrega os mapas
// de fertilidade SALVOS NA NUVEM do talhão+safra, deixa o usuário selecionar e
// reordenar os elementos + ligar/desligar satélite e valores, e gera um PDF
// ÚNICO (uma página por elemento) reaproveitando o layout oficial V1.
//
// Cada geração registra a CONFIGURAÇÃO no Firestore (sem Storage/custo): o menu
// mostra o histórico (data · tipo · mapas · safra), com Abrir (REGENERA o PDF a
// partir dos mapas salvos) e Excluir. Cada geração cria um registro novo.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { carregarContextoRelatorio, montarPaginas, type ContextoRelatorio } from '@/lib/relatorioDados';
import { extrairPoligono } from '@/lib/fertilidade';
import { gerarRelatorioMultiplo } from '@/lib/relatorioFertilidade';
import { salvarRelatorio, listarRelatorios, excluirRelatorio, type RegistroRelatorio } from '@/lib/relatoriosArquivo';
import { emailUsuario } from '@/lib/auth';
import { pode } from '@/lib/empresa';
import { FileDown, Loader2, ChevronUp, ChevronDown, AlertTriangle, CheckSquare, Square, Satellite, Hash, FileStack, History, Trash2, ExternalLink } from 'lucide-react';

export function GeradorRelatorios({ safraNome }: { safraNome?: string } = {}) {
  const { nav, uploadedGeo } = useApp();
  const safra = safraNome ?? '';
  // uploadedGeo num ref (fallback do polígono) — NÃO pode ser dependência do
  // efeito de carga: como o objeto muda de identidade, virava loop de recarga
  // e o "Carregando…" nunca terminava.
  const uploadedGeoRef = useRef(uploadedGeo);
  uploadedGeoRef.current = uploadedGeo;

  const [ctx, setCtx] = useState<ContextoRelatorio | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [ordem, setOrdem] = useState<string[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [satelite, setSatelite] = useState(true);
  const [valores, setValores] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const [historico, setHistorico] = useState<RegistroRelatorio[]>([]);

  const recarregarHistorico = useCallback(async () => {
    if (!nav.talhaoId) return;
    setHistorico(await listarRelatorios(nav.talhaoId));
  }, [nav.talhaoId]);

  useEffect(() => {
    let cancel = false;
    if (!nav.talhaoId || !safra) { setCtx(null); setCarregando(false); return; }
    setCarregando(true); setErro('');
    carregarContextoRelatorio(nav.talhaoId, safra, extrairPoligono(uploadedGeoRef.current))
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

  useEffect(() => { recarregarHistorico(); }, [recarregarHistorico]);

  function toggle(nut: string) { setSel(s => { const n = new Set(s); if (n.has(nut)) n.delete(nut); else n.add(nut); return n; }); }
  function mover(i: number, dir: -1 | 1) {
    setOrdem(o => { const n = [...o]; const j = i + dir; if (j < 0 || j >= n.length) return o; [n[i], n[j]] = [n[j], n[i]]; return n; });
  }

  // Gera o PDF (abre na aba) e arquiva no histórico. `nuts` = elementos a incluir.
  async function executar(nuts: string[], completo: boolean) {
    if (!ctx) return;
    if (nuts.length === 0) { setErro('Selecione ao menos um mapa.'); return; }
    setGerando(true); setErro(''); setAviso('');
    try {
      const paginas = montarPaginas(ctx, nuts, { satelite, valores });
      if (paginas.length === 0) {
        // Diagnóstico na tela (sem precisar de F12): por que zerou.
        const resumo = nuts.slice(0, 4).map(n => {
          const el = ctx.elementos.find(e => e.nut === n);
          if (!el) return `${n}:sem-elemento`;
          const ps = el.profundidades.map(p => {
            const m = ctx.mapas[`${n}__${p}`];
            if (!m) return `${p}=sem-mapa`;
            return `${p}=${m.resp?.grid ? 'grid' : (m.resp?.png ? 'png' : 'VAZIO')}`;
          }).join(',');
          return `${n}(${ps})`;
        }).join('  ');
        setErro(`Sem páginas. Polígono: ${ctx.poligono ? 'OK' : 'FALTANDO'}. Mapas: ${resumo}`);
        return;
      }
      const elPorNut = Object.fromEntries(ctx.elementos.map(e => [e.nut, e]));
      const simbolos = nuts.map(n => elPorNut[n]?.simbolo ?? n);
      await gerarRelatorioMultiplo(paginas, `Relatorio_Fertilidade_${ctx.talhao}_${safra}`);
      try {
        await salvarRelatorio({
          talhaoId: nav.talhaoId!, safra, tipo: 'Fertilidade',
          titulo: completo ? 'Relatório completo' : `Relatório (${paginas.length} ${paginas.length === 1 ? 'mapa' : 'mapas'})`,
          nuts, elementos: simbolos, satelite, valores, paginas: paginas.length, geradoPor: emailUsuario() ?? '—',
        });
        await recarregarHistorico();
      } catch (e) {
        setAviso('PDF gerado e aberto, mas não foi registrado no histórico. ' + (e instanceof Error ? e.message : ''));
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao gerar o relatório.');
    } finally { setGerando(false); }
  }

  // Reabre um relatório do histórico REGENERANDO o PDF a partir da configuração
  // salva (sem Storage). Usa o contexto atual se for o mesmo talhão/safra; senão recarrega.
  async function abrirRelatorio(reg: RegistroRelatorio) {
    setErro('');
    try {
      const c = (reg.talhaoId === nav.talhaoId && reg.safra === safra && ctx)
        ? ctx
        : await carregarContextoRelatorio(reg.talhaoId, reg.safra, extrairPoligono(uploadedGeoRef.current));
      const paginas = montarPaginas(c, reg.nuts, { satelite: reg.satelite, valores: reg.valores });
      if (paginas.length === 0) { setErro('Não há mais mapas salvos para regenerar este relatório.'); return; }
      await gerarRelatorioMultiplo(paginas, `Relatorio_Fertilidade_${c.talhao}_${reg.safra}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao reabrir o relatório.');
    }
  }

  if (!pode('relatorios')) return <div className="px-4 py-4"><Aviso texto="Seu papel não gera relatórios (somente visualização)." /></div>;
  if (!safra) return <div className="px-4 py-4"><Aviso texto="Defina uma safra (no topo) para montar o relatório." /></div>;
  if (carregando) return <div className="px-4 py-4 flex items-center gap-2 text-xs" style={{ color: '#64748b' }}><Loader2 size={13} className="animate-spin" /> Carregando mapas salvos na nuvem…</div>;

  const elPorNut = ctx ? Object.fromEntries(ctx.elementos.map(e => [e.nut, e])) : {};
  const nSel = ordem.filter(n => sel.has(n)).length;
  const semMapas = !ctx || ctx.elementos.length === 0;

  return (
    <div className="px-4 py-3 space-y-4">
      {semMapas ? (
        <Aviso texto="Nenhum mapa de fertilidade salvo na nuvem para este talhão/safra. Processe os mapas na aba Fertilidade (logado) e volte aqui." />
      ) : (
        <div className="space-y-3">
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
          {aviso && <p className="text-[10px]" style={{ color: '#fbbf24' }}>{aviso}</p>}

          <div className="space-y-1.5">
            <button onClick={() => executar(ordem.filter(n => sel.has(n)), false)} disabled={gerando || nSel === 0}
              className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
              style={{ background: 'var(--invicta-blue-mid)' }}>
              {gerando ? <><Loader2 size={13} className="animate-spin" /> Gerando…</> : <><FileDown size={13} /> Gerar selecionados ({nSel})</>}
            </button>
            <button onClick={() => executar(ctx!.elementos.map(e => e.nut), true)} disabled={gerando}
              className="w-full py-2 rounded text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
              style={{ background: '#0b2a4a', color: '#bfdbfe', border: '1px solid #1a3a6b' }}>
              <FileStack size={13} /> Gerar relatório completo (todos os {ctx!.elementos.length} mapas)
            </button>
          </div>
          <p className="text-[9px]" style={{ color: '#475569' }}>
            Usa os mapas já salvos na nuvem (processados na aba Fertilidade). Cada PDF gerado é arquivado no histórico abaixo.
          </p>
        </div>
      )}

      {/* ── Histórico ── */}
      <div className="pt-1">
        <div className="flex items-center gap-1.5 mb-2">
          <History size={13} style={{ color: '#64748b' }} />
          <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#94a3b8' }}>Relatórios gerados</span>
          {historico.length > 0 && <span className="text-[10px]" style={{ color: '#475569' }}>({historico.length})</span>}
        </div>
        {historico.length === 0 ? (
          <p className="text-[10px]" style={{ color: '#475569' }}>Nenhum relatório arquivado ainda para este talhão.</p>
        ) : (
          <div className="space-y-1">
            {historico.map(r => <LinhaHistorico key={r.id} reg={r} onAbrir={() => abrirRelatorio(r)} onExcluir={async () => { await excluirRelatorio(r); await recarregarHistorico(); }} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function LinhaHistorico({ reg, onAbrir, onExcluir }: { reg: RegistroRelatorio; onAbrir: () => Promise<void>; onExcluir: () => void }) {
  const [apagando, setApagando] = useState(false);
  const [abrindo, setAbrindo] = useState(false);
  const data = new Date(reg.geradoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: '#061525', border: '1px solid #0f2240' }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#0b2a4a', color: '#bfdbfe' }}>{reg.tipo}</span>
          <span className="text-xs font-semibold truncate" style={{ color: '#e2e8f0' }}>{reg.titulo}</span>
        </div>
        <div className="text-[10px] mt-0.5 truncate" style={{ color: '#64748b' }}>
          {data} · Safra {reg.safra} · {reg.paginas} {reg.paginas === 1 ? 'pág' : 'págs'}
        </div>
        {reg.elementos?.length > 0 && (
          <div className="text-[9px] mt-0.5 truncate" style={{ color: '#475569' }}>{reg.elementos.join(' · ')}</div>
        )}
      </div>
      <button onClick={async () => { setAbrindo(true); try { await onAbrir(); } finally { setAbrindo(false); } }} disabled={abrindo}
        title="Abrir (regenera o PDF)" className="p-1 rounded disabled:opacity-50" style={{ color: '#93c5fd' }}>
        {abrindo ? <Loader2 size={15} className="animate-spin" /> : <ExternalLink size={15} />}
      </button>
      <button onClick={async () => { if (apagando) { await onExcluir(); } else { setApagando(true); setTimeout(() => setApagando(false), 2500); } }}
        title={apagando ? 'Clique de novo para confirmar' : 'Excluir'} className="p-1 rounded" style={{ color: apagando ? '#f87171' : '#64748b' }}>
        <Trash2 size={15} />
      </button>
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
