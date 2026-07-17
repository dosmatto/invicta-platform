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
import { gerarRelatorioCombinado } from '@/lib/relatorioCombinado';
import { listarCenarios, descomprimirCenario, type Cenario } from '@/lib/recomendacao/cenarios';
import { salvarRelatorio, listarRelatorios, excluirRelatorio, type RegistroRelatorio } from '@/lib/relatoriosArquivo';
import { emailUsuario } from '@/lib/auth';
import { pode } from '@/lib/empresa';
import { FileDown, Loader2, ChevronUp, ChevronDown, AlertTriangle, CheckSquare, Square, Satellite, Hash, History, Trash2, ExternalLink, Wand2, FlaskConical } from 'lucide-react';

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

  // Seções do relatório combinado (ambas LIGADAS por padrão; desmarcar uma gera
  // só a outra). A de Recomendação usa os cenários JÁ salvos na nuvem.
  const [cenarios, setCenarios] = useState<Cenario[]>([]);
  const [selCen, setSelCen] = useState<Set<string>>(new Set());
  const [incluirRec, setIncluirRec] = useState(true);
  const [incluirFert, setIncluirFert] = useState(true);

  const [historico, setHistorico] = useState<RegistroRelatorio[]>([]);

  const recarregarHistorico = useCallback(async () => {
    if (!nav.talhaoId) return;
    setHistorico(await listarRelatorios(nav.talhaoId));
  }, [nav.talhaoId]);

  useEffect(() => {
    let cancel = false;
    if (!nav.talhaoId || !safra) { setCtx(null); setCenarios([]); setCarregando(false); return; }
    setCarregando(true); setErro('');
    const talhaoId = nav.talhaoId;
    Promise.all([
      carregarContextoRelatorio(talhaoId, safra, extrairPoligono(uploadedGeoRef.current)),
      listarCenarios(talhaoId, safra).catch(() => [] as Cenario[]),
    ])
      .then(([c, cens]) => {
        if (cancel) return;
        setCtx(c);
        setOrdem(c.elementos.map(e => e.nut));
        setSel(new Set(c.elementos.map(e => e.nut)));
        setCenarios(cens);
        setSelCen(new Set(cens.map(x => x.id)));
        setCarregando(false);
      })
      .catch(() => { if (!cancel) { setErro('Falha ao carregar os mapas salvos.'); setCarregando(false); } });
    return () => { cancel = true; };
  }, [nav.talhaoId, safra]);

  useEffect(() => { recarregarHistorico(); }, [recarregarHistorico]);

  function toggle(nut: string) { setSel(s => { const n = new Set(s); if (n.has(nut)) n.delete(nut); else n.add(nut); return n; }); }
  function toggleCen(id: string) { setSelCen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  function mover(i: number, dir: -1 | 1) {
    setOrdem(o => { const n = [...o]; const j = i + dir; if (j < 0 || j >= n.length) return o; [n[i], n[j]] = [n[j], n[i]]; return n; });
  }

  // Diagnóstico na tela (sem F12) de por que a Fertilidade não gerou páginas.
  function diagnosticoFert(nuts: string[]): string {
    if (!ctx) return 'contexto não carregado';
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
    return `Polígono: ${ctx.poligono ? 'OK' : 'FALTANDO'}. Mapas: ${resumo}`;
  }

  // Gera o PDF combinado (Recomendação + Fertilidade, conforme seções ativas),
  // abre na aba e arquiva no histórico.
  async function gerarCombinado() {
    setErro(''); setAviso('');
    const nomeTalhao = ctx?.talhao ?? nav.talhao;
    const nutsSel = ordem.filter(n => sel.has(n));
    const cenSel = cenarios.filter(c => selCen.has(c.id));
    const usaRec = incluirRec && cenSel.length > 0;
    const usaFert = incluirFert && nutsSel.length > 0;
    if (!usaRec && !usaFert) { setErro('Marque ao menos uma seção com itens selecionados (Recomendação ou Fertilidade).'); return; }

    setGerando(true);
    try {
      // Seção Fertilidade: monta as páginas dos elementos escolhidos.
      let paginasFert: ReturnType<typeof montarPaginas> = [];
      if (usaFert && ctx) {
        paginasFert = montarPaginas(ctx, nutsSel, { satelite, valores });
        if (paginasFert.length === 0) { setErro(`Fertilidade sem páginas. ${diagnosticoFert(nutsSel)}`); return; }
      }
      // Seção Recomendação: descomprime os grids dos cenários escolhidos.
      const recDescompr = usaRec ? await Promise.all(cenSel.map(descomprimirCenario)) : [];

      const { paginas } = await gerarRelatorioCombinado({
        recomendacao: usaRec ? recDescompr : undefined,
        fertilidade: usaFert ? paginasFert : undefined,
        nomeArquivo: `Relatorio_${nomeTalhao}_${safra}`,
      });

      const elPorNut = ctx ? Object.fromEntries(ctx.elementos.map(e => [e.nut, e])) : {};
      const tipo = usaRec && usaFert ? 'Recomendação + Fertilidade' : usaRec ? 'Recomendação' : 'Fertilidade';
      try {
        await salvarRelatorio({
          talhaoId: nav.talhaoId!, safra, tipo,
          titulo: `Relatório (${paginas} ${paginas === 1 ? 'pág' : 'págs'})`,
          nuts: usaFert ? nutsSel : [],
          elementos: usaFert ? nutsSel.map(n => elPorNut[n]?.simbolo ?? n) : [],
          satelite, valores, paginas,
          cenarioIds: usaRec ? cenSel.map(c => c.id) : [],
          cenarioNomes: usaRec ? cenSel.map(c => c.nome) : [],
          geradoPor: emailUsuario() ?? '—',
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
  // salva (sem Storage). Regenera as duas seções conforme o que foi arquivado.
  async function abrirRelatorio(reg: RegistroRelatorio) {
    setErro('');
    try {
      const mesmoCtx = reg.talhaoId === nav.talhaoId && reg.safra === safra;
      // Fertilidade
      let paginasFert: ReturnType<typeof montarPaginas> = [];
      let nomeTalhao = nav.talhao;
      if (reg.nuts.length > 0) {
        const c = (mesmoCtx && ctx) ? ctx : await carregarContextoRelatorio(reg.talhaoId, reg.safra, extrairPoligono(uploadedGeoRef.current));
        nomeTalhao = c.talhao;
        paginasFert = montarPaginas(c, reg.nuts, { satelite: reg.satelite, valores: reg.valores });
      }
      // Recomendação
      let recDescompr: Cenario[] = [];
      if (reg.cenarioIds?.length) {
        const cens = (mesmoCtx && cenarios.length) ? cenarios : await listarCenarios(reg.talhaoId, reg.safra).catch(() => []);
        const escolhidos = cens.filter(c => reg.cenarioIds!.includes(c.id));
        recDescompr = await Promise.all(escolhidos.map(descomprimirCenario));
      }
      if (paginasFert.length === 0 && recDescompr.length === 0) {
        setErro('Não há mais mapas/recomendações salvos para regenerar este relatório.'); return;
      }
      await gerarRelatorioCombinado({
        recomendacao: recDescompr.length ? recDescompr : undefined,
        fertilidade: paginasFert.length ? paginasFert : undefined,
        nomeArquivo: `Relatorio_${nomeTalhao}_${reg.safra}`,
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao reabrir o relatório.');
    }
  }

  if (!pode('relatorios')) return <div className="px-4 py-4"><Aviso texto="Seu papel não gera relatórios (somente visualização)." /></div>;
  if (!safra) return <div className="px-4 py-4"><Aviso texto="Defina uma safra (no topo) para montar o relatório." /></div>;
  if (carregando) return <div className="px-4 py-4 flex items-center gap-2 text-xs" style={{ color: '#64748b' }}><Loader2 size={13} className="animate-spin" /> Carregando mapas salvos na nuvem…</div>;

  const elPorNut = ctx ? Object.fromEntries(ctx.elementos.map(e => [e.nut, e])) : {};
  const nSelFert = ordem.filter(n => sel.has(n)).length;
  const nSelCen = cenarios.filter(c => selCen.has(c.id)).length;
  const temFert = !!ctx && ctx.elementos.length > 0;
  const temRec = cenarios.length > 0;

  // Nº de páginas previstas (recomendação = soma das doses; fertilidade = capa + elementos)
  const pagsRec = incluirRec ? cenarios.filter(c => selCen.has(c.id)).reduce((s, c) => s + c.doses.length, 0) : 0;
  const pagsFert = incluirFert && nSelFert > 0 ? nSelFert + 1 : 0;
  const usaRec = incluirRec && nSelCen > 0;
  const usaFert = incluirFert && nSelFert > 0;
  const totalPags = pagsRec + pagsFert;

  return (
    <div className="px-4 py-3 space-y-4">
      {!temFert && !temRec ? (
        <Aviso texto="Nada salvo na nuvem para este talhão/safra ainda. Gere recomendações na aba Recomendações e/ou processe os mapas na aba Fertilidade (logado) e volte aqui." />
      ) : (
        <div className="space-y-3">
          <p className="text-[11px]" style={{ color: '#94a3b8' }}>
            Monte um <strong style={{ color: '#cbd5e1' }}>PDF único</strong> com as seções abaixo. As duas vêm marcadas — <strong style={{ color: '#cbd5e1' }}>desmarque uma</strong> para gerar só a outra.
          </p>

          {/* ── Seção RECOMENDAÇÃO ── */}
          <SecaoHeader on={incluirRec} disabled={!temRec} onToggle={() => setIncluirRec(v => !v)}
            icon={Wand2} cor="#a78bfa" titulo="Recomendação" sub={temRec ? `${nSelCen}/${cenarios.length} selecionada${cenarios.length === 1 ? '' : 's'}` : 'nenhuma salva'} />
          {temRec ? (
            incluirRec && (
              <div className="space-y-1 pl-1">
                {cenarios.map(c => {
                  const on = selCen.has(c.id);
                  return (
                    <div key={c.id} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: '#061525', border: `1px solid ${on ? '#2a2350' : '#0f2240'}` }}>
                      <button onClick={() => toggleCen(c.id)} title={on ? 'Remover' : 'Incluir'}>
                        {on ? <CheckSquare size={16} style={{ color: '#a78bfa' }} /> : <Square size={16} style={{ color: '#475569' }} />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-bold" style={{ color: on ? '#e2e8f0' : '#64748b' }}>{c.nome}</span>
                        <span className="text-[10px] ml-1.5" style={{ color: '#64748b' }}>· {c.doses.length} {c.doses.length === 1 ? 'mapa' : 'mapas'}{c.origem === 'equacao' ? ' · equação avulsa' : ''}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <p className="text-[10px] pl-1" style={{ color: '#475569' }}>
              Nenhuma recomendação gerada nesta safra. Crie na aba <strong style={{ color: '#64748b' }}>Recomendações</strong> (o “Book”) para incluí-la aqui.
            </p>
          )}

          {/* ── Seção FERTILIDADE ── */}
          <SecaoHeader on={incluirFert} disabled={!temFert} onToggle={() => setIncluirFert(v => !v)}
            icon={FlaskConical} cor="#4ade80" titulo="Fertilidade" sub={temFert ? `${nSelFert}/${ctx!.elementos.length} selecionado${ctx!.elementos.length === 1 ? '' : 's'}` : 'nenhum mapa'} />
          {temFert ? (
            incluirFert && (
              <div className="space-y-1 pl-1">
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
                <div className="flex gap-2 pt-1">
                  <ToggleBtn on={satelite} onClick={() => setSatelite(v => !v)} icon={Satellite} label="Satélite" />
                  <ToggleBtn on={valores} onClick={() => setValores(v => !v)} icon={Hash} label="Valores" />
                </div>
              </div>
            )
          ) : (
            <p className="text-[10px] pl-1" style={{ color: '#475569' }}>
              Nenhum mapa de fertilidade salvo. Processe na aba <strong style={{ color: '#64748b' }}>Fertilidade</strong> (logado) para incluí-la aqui.
            </p>
          )}

          {erro && <p className="text-[10px]" style={{ color: '#f87171' }}>{erro}</p>}
          {aviso && <p className="text-[10px]" style={{ color: '#fbbf24' }}>{aviso}</p>}

          <button onClick={gerarCombinado} disabled={gerando || (!usaRec && !usaFert)}
            className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
            style={{ background: 'var(--invicta-blue-mid)' }}>
            {gerando ? <><Loader2 size={13} className="animate-spin" /> Gerando…</>
              : <><FileDown size={13} /> Gerar relatório{totalPags > 0 ? ` (${totalPags} ${totalPags === 1 ? 'pág' : 'págs'})` : ''}</>}
          </button>
          <p className="text-[9px]" style={{ color: '#475569' }}>
            Usa o que já está salvo na nuvem (recomendações da aba Recomendações + mapas da aba Fertilidade). Cada PDF gerado é arquivado no histórico abaixo.
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
        {reg.cenarioNomes && reg.cenarioNomes.length > 0 && (
          <div className="text-[9px] mt-0.5 truncate" style={{ color: '#8b7fd6' }}>Rec: {reg.cenarioNomes.join(' · ')}</div>
        )}
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

// Cabeçalho de seção com master-checkbox (liga/desliga a seção inteira).
function SecaoHeader({ on, disabled, onToggle, icon: Icon, cor, titulo, sub }: {
  on: boolean; disabled?: boolean; onToggle: () => void; icon: React.ElementType; cor: string; titulo: string; sub: string;
}) {
  const ativo = on && !disabled;
  return (
    <button onClick={disabled ? undefined : onToggle} disabled={disabled}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg disabled:cursor-default"
      style={{ background: ativo ? '#0b1f38' : '#081627', border: `1px solid ${ativo ? cor + '55' : '#0f2240'}`, opacity: disabled ? 0.6 : 1 }}>
      {ativo ? <CheckSquare size={16} style={{ color: cor }} /> : <Square size={16} style={{ color: '#475569' }} />}
      <Icon size={14} style={{ color: ativo ? cor : '#475569' }} />
      <span className="text-xs font-bold" style={{ color: ativo ? '#e2e8f0' : '#64748b' }}>{titulo}</span>
      <span className="text-[10px] ml-auto" style={{ color: '#64748b' }}>{sub}</span>
    </button>
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
