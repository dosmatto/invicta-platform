'use client';

// Aba Recomendações da Página do Talhão (Fase R3.A + R3.B).
// Dois modos: aplicar 1 EQUAÇÃO (avulso) ou uma RECOMENDAÇÃO inteira (N equações).
// Mostra os mapas de DOSE (clique p/ ver cada um), financeiro consolidado, e
// SALVA o cenário na nuvem (reabrir depois → habilita o Comparador C1 da R4).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { getImportacoesLab, getTalhoes, type ImportacaoLab } from '@/lib/store';
import { listar as bibListar, type ItemBiblioteca, type ConteudoEquacao, type ConteudoRecomendacao } from '@/lib/biblioteca';
import { carregarGridsTalhao, calcularDose, type DoseCalculada } from '@/lib/recomendacao/aplicar';
import { salvarCenario, listarCenarios, descomprimirCenario, excluirCenario, marcarCenarioOficial, type Cenario } from '@/lib/recomendacao/cenarios';
import { colorirDose } from '@/lib/raster';
import { coordsFromBounds } from '@/lib/fertilidade';
import { ComparadorCenarios } from '@/components/talhao/ComparadorCenarios';
import { montarBookOficial, abrirOuBaixar } from '@/lib/recomendacao/relatorioCenarios';
import { Play, Loader2, AlertTriangle, Wand2, Save, FolderOpen, Trash2, Eye, GitCompare, FileText, Star } from 'lucide-react';

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;
const fmt = (v: number, dec = 0) => v.toLocaleString('pt-BR', { maximumFractionDigits: dec, minimumFractionDigits: dec });

export function RecomendacaoSection({ safraNome }: { safraNome?: string }) {
  const { nav, setFertilidadeOverlay, setFertilidadeLabels } = useApp();
  const safra = safraNome ?? '';

  const [modo, setModo] = useState<'equacao' | 'recomendacao'>('recomendacao');
  const [importacoes, setImportacoes] = useState<ImportacaoLab[]>([]);
  const [importacaoId, setImportacaoId] = useState('');
  const [equacoes, setEquacoes] = useState<ItemBiblioteca<ConteudoEquacao>[]>([]);
  const [recomendacoes, setRecomendacoes] = useState<ItemBiblioteca<ConteudoRecomendacao>[]>([]);
  const [equacaoId, setEquacaoId] = useState('');
  const [recomendacaoId, setRecomendacaoId] = useState('');

  const [estado, setEstado] = useState<'idle' | 'carregando' | 'pronto' | 'erro'>('idle');
  const [erro, setErro] = useState('');
  const [doses, setDoses] = useState<DoseCalculada[]>([]);
  const [falhas, setFalhas] = useState<{ nome: string; erro: string }[]>([]);
  const [visivel, setVisivel] = useState(0);
  const [nomeCenario, setNomeCenario] = useState('');
  const [salvoMsg, setSalvoMsg] = useState('');
  const [salvos, setSalvos] = useState<Cenario[]>([]);
  const [selCompara, setSelCompara] = useState<Set<string>>(new Set());
  const [comparar, setComparar] = useState<Cenario[] | null>(null);
  const [bookSel, setBookSel] = useState<Set<string>>(new Set());
  const [bookEstado, setBookEstado] = useState<'idle' | 'carregando' | 'pronto' | 'erro'>('idle');
  const [erroBook, setErroBook] = useState('');

  // Biblioteca (equações + recomendações) — reage a edições
  useEffect(() => {
    const load = () => {
      setEquacoes(bibListar<ConteudoEquacao>('equacoes').filter(e => e.ativo));
      setRecomendacoes(bibListar<ConteudoRecomendacao>('recomendacoes').filter(r => r.ativo));
    };
    load();
    const onBib = (e: Event) => { const d = (e as CustomEvent).detail as { slug?: string } | undefined; if (!d?.slug || d.slug === 'equacoes' || d.slug === 'recomendacoes') load(); };
    if (typeof window !== 'undefined') window.addEventListener('inv:biblioteca', onBib);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('inv:biblioteca', onBib); };
  }, []);

  useEffect(() => { if (nav.talhaoId && safra) setImportacoes(getImportacoesLab(nav.talhaoId, safra)); }, [nav.talhaoId, safra]);
  useEffect(() => {
    if (importacaoId || importacoes.length === 0) return;
    const r = [...importacoes].sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? ''))[0];
    if (r) setImportacaoId(r.id);
  }, [importacoes, importacaoId]);

  const talhao = useMemo(() => getTalhoes().find(t => t.id === nav.talhaoId) ?? null, [nav.talhaoId]);
  const eqSel = equacoes.find(e => e.id === equacaoId) ?? null;
  const recSel = recomendacoes.find(r => r.id === recomendacaoId) ?? null;

  const recarregarSalvos = useCallback(async () => {
    if (nav.talhaoId && safra) setSalvos(await listarCenarios(nav.talhaoId, safra));
  }, [nav.talhaoId, safra]);
  useEffect(() => { recarregarSalvos(); }, [recarregarSalvos]);

  // limpa resultado ao trocar contexto
  useEffect(() => { setDoses([]); setFalhas([]); setEstado('idle'); setErro(''); setVisivel(0); setSalvoMsg(''); }, [modo, equacaoId, recomendacaoId, importacaoId]);

  // dose visível no mapa
  const doseAtiva = doses[visivel] ?? null;
  useEffect(() => {
    if (!doseAtiva) { setFertilidadeOverlay(null); setFertilidadeLabels(null); return; }
    try {
      const png = colorirDose(doseAtiva.grid, doseAtiva.estilo);
      setFertilidadeOverlay({ url: png.dataUrl, coordinates: coordsFromBounds(doseAtiva.bounds), opacity: 1 });
      setFertilidadeLabels(null);
    } catch (e) { console.warn('[recomendacao] colorir falhou', e); }
  }, [doseAtiva, setFertilidadeOverlay, setFertilidadeLabels]);
  useEffect(() => () => { setFertilidadeOverlay(null); setFertilidadeLabels(null); }, [setFertilidadeOverlay, setFertilidadeLabels]);

  async function aplicar() {
    setErro(''); setDoses([]); setFalhas([]); setVisivel(0); setSalvoMsg('');
    if (!nav.talhaoId || !importacaoId) { setErro('Selecione uma importação de laboratório.'); setEstado('erro'); return; }
    let itens: ItemBiblioteca<ConteudoEquacao>[] = [];
    if (modo === 'equacao') {
      if (!eqSel) { setErro('Escolha uma equação.'); setEstado('erro'); return; }
      itens = [eqSel];
    } else {
      if (!recSel) { setErro('Escolha uma recomendação.'); setEstado('erro'); return; }
      itens = recSel.conteudo.equacaoIds.map(id => equacoes.find(e => e.id === id)).filter(Boolean) as ItemBiblioteca<ConteudoEquacao>[];
      if (itens.length === 0) { setErro('A recomendação não tem equações ativas.'); setEstado('erro'); return; }
    }
    setEstado('carregando');
    try {
      const grids = await carregarGridsTalhao(nav.talhaoId, importacaoId);
      const area = talhao?.areaHa ?? 0;
      const ok: DoseCalculada[] = [];
      const erros: { nome: string; erro: string }[] = [];
      for (const it of itens) {
        try { ok.push(calcularDose(it, grids, area)); }
        catch (e) { erros.push({ nome: it.nome, erro: e instanceof Error ? e.message : String(e) }); }
      }
      setDoses(ok); setFalhas(erros);
      setEstado(ok.length ? 'pronto' : 'erro');
      if (!ok.length) { setErro('Nenhuma equação pôde ser aplicada — veja os detalhes abaixo.'); return; }
      // Auto-salva o cenário na nuvem (id determinístico = não duplica ao reprocessar).
      const ref = modo === 'recomendacao' ? recomendacaoId : equacaoId;
      const autoId = `cen_${nav.talhaoId}_${importacaoId}_${modo}_${ref}`;
      const custoTotal = ok.reduce((s, d) => s + (d.custo ?? 0), 0);
      const nome = nomeCenario.trim() || `${recSel?.nome ?? eqSel?.nome ?? 'Cenário'}`;
      try {
        await salvarCenario({
          talhaoId: nav.talhaoId, safra, importacaoId,
          origem: modo, recomendacaoId: modo === 'recomendacao' ? recomendacaoId : undefined,
          nome, doses: ok, financeiro: { custoTotal, custoHa: area ? custoTotal / area : 0, areaHa: area },
        }, autoId);
        await recarregarSalvos();
        setSalvoMsg(`Salvo como "${nome}".`);
      } catch (e) { setSalvoMsg('Calculado, mas NÃO salvou na nuvem: ' + (e instanceof Error ? e.message : String(e))); }
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); setEstado('erro'); }
  }

  const fin = useMemo(() => {
    if (!doses.length) return null;
    const area = talhao?.areaHa ?? 0;
    let custoTotal = 0; let temSemCusto = false;
    for (const d of doses) { custoTotal += d.custo; if (d.custoTonelada == null) temSemCusto = true; }
    return { area, custoTotal, custoHa: area ? custoTotal / area : 0, temSemCusto };
  }, [doses, talhao]);

  async function reabrir(cen: Cenario) {
    setEstado('carregando'); setErro('');
    try {
      const full = await descomprimirCenario(cen);
      setModo(full.origem);
      setDoses(full.doses); setFalhas([]); setVisivel(0); setEstado('pronto');
    } catch (e) { setErro('Falha ao reabrir: ' + (e instanceof Error ? e.message : String(e))); setEstado('erro'); }
  }
  async function excluirSalvo(c: Cenario) {
    if (!confirm(`Excluir o cenário "${c.nome}"?`)) return;
    await excluirCenario(c.id); await recarregarSalvos();
    setSelCompara(prev => { const n = new Set(prev); n.delete(c.id); return n; });
  }
  async function toggleOficial(c: Cenario) {
    try { await marcarCenarioOficial(c, !c.oficial); await recarregarSalvos(); }
    catch (e) { alert('Falha ao marcar: ' + (e instanceof Error ? e.message : String(e))); }
  }
  function toggleCompara(id: string) {
    setSelCompara(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else if (n.size < 3) n.add(id);   // compara até 3
      return n;
    });
  }
  async function abrirComparador() {
    const sel = salvos.filter(c => selCompara.has(c.id));
    if (sel.length < 2) return;
    const full = await Promise.all(sel.map(descomprimirCenario));
    setComparar(full);
  }

  // Book: todas as recomendações marcadas por padrão (o usuário desmarca o que não quer).
  useEffect(() => { setBookSel(new Set(recomendacoes.map(r => r.id))); }, [recomendacoes]);
  function toggleBook(id: string) {
    setBookSel(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  async function gerarBook() {
    setErroBook('');
    if (!nav.talhaoId || !importacaoId) { setErroBook('Selecione uma importação de laboratório.'); setBookEstado('erro'); return; }
    const recs = recomendacoes.filter(r => bookSel.has(r.id));
    if (recs.length === 0) { setErroBook('Marque ao menos uma recomendação.'); setBookEstado('erro'); return; }
    const aba = typeof window !== 'undefined' ? window.open('', '_blank') : null;  // antes de qualquer await
    setBookEstado('carregando');
    try {
      const grids = await carregarGridsTalhao(nav.talhaoId, importacaoId);
      const area = talhao?.areaHa ?? 0;
      const cens: Cenario[] = [];
      for (const r of recs) {
        const itens = r.conteudo.equacaoIds.map(id => equacoes.find(e => e.id === id)).filter(Boolean) as ItemBiblioteca<ConteudoEquacao>[];
        const ok: DoseCalculada[] = [];
        for (const it of itens) { try { ok.push(calcularDose(it, grids, area)); } catch { /* sem mapa p/ essa equação */ } }
        if (ok.length === 0) continue;
        const custoTotal = ok.reduce((s, d) => s + d.custo, 0);
        const financeiro = { custoTotal, custoHa: area ? custoTotal / area : 0, areaHa: area };
        cens.push({ id: '', talhaoId: nav.talhaoId, safra, importacaoId, origem: 'recomendacao', recomendacaoId: r.id, nome: r.nome, doses: ok, financeiro, geradoEm: Date.now(), geradoPor: '' });
        salvarCenario({ talhaoId: nav.talhaoId, safra, importacaoId, origem: 'recomendacao', recomendacaoId: r.id, nome: r.nome, doses: ok, financeiro }, `cen_${nav.talhaoId}_${importacaoId}_recomendacao_${r.id}`).catch(() => {});
      }
      if (cens.length === 0) { if (aba) aba.close(); setErroBook('Nenhuma recomendação pôde ser aplicada — faltam mapas interpolados dos atributos usados.'); setBookEstado('erro'); return; }
      const blob = await montarBookOficial(cens);
      abrirOuBaixar(blob, aba, `book-recomendacoes-${safra}.pdf`);
      await recarregarSalvos();
      setBookEstado('pronto');
    } catch (e) { if (aba) aba.close(); setErroBook(e instanceof Error ? e.message : String(e)); setBookEstado('erro'); }
  }

  const classesVis = useMemo(() => doseAtiva ? [...doseAtiva.estilo.classes].sort((a, b) => a.limiteSuperior - b.limiteSuperior) : [], [doseAtiva]);
  const podeAplicar = !!importacaoId && (modo === 'equacao' ? !!eqSel : !!recSel) && estado !== 'carregando';

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Wand2 size={14} style={{ color: '#a78bfa' }} />
        <h3 className="text-sm font-bold" style={{ color: '#e2e8f0' }}>Recomendação / Cenário</h3>
      </div>

      {/* Modo */}
      <div className="flex gap-1">
        {([['recomendacao', 'Recomendação'], ['equacao', 'Equação avulsa']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setModo(v)} className="flex-1 py-1.5 rounded text-[10px] font-bold"
            style={{ background: modo === v ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: modo === v ? '#fff' : '#94a3b8' }}>{label}</button>
        ))}
      </div>

      <div>
        <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Importação de laboratório</label>
        <select value={importacaoId} onChange={e => setImportacaoId(e.target.value)} className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle}>
          {importacoes.length === 0 && <option value="">Nenhuma importação nesta safra</option>}
          {importacoes.map(i => <option key={i.id} value={i.id}>{i.laboratorio || 'Importação'} · {(i.criadoEm ?? '').slice(0, 10)}</option>)}
        </select>
      </div>

      {modo === 'equacao' ? (
        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Equação</label>
          {equacoes.length === 0 ? (
            <p className="text-[10px]" style={{ color: '#fbbf24' }}>Nenhuma equação. Crie em <strong>Biblioteca → Equações</strong>.</p>
          ) : (
            <select value={equacaoId} onChange={e => setEquacaoId(e.target.value)} className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle}>
              <option value="">Escolha uma equação…</option>
              {equacoes.map(e => <option key={e.id} value={e.id}>{e.nome}{e.conteudo.profundidade ? ` (${e.conteudo.profundidade})` : ''}</option>)}
            </select>
          )}
        </div>
      ) : (
        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Recomendação</label>
          {recomendacoes.length === 0 ? (
            <p className="text-[10px]" style={{ color: '#fbbf24' }}>Nenhuma recomendação. Crie em <strong>Biblioteca → Recomendações</strong>.</p>
          ) : (
            <select value={recomendacaoId} onChange={e => setRecomendacaoId(e.target.value)} className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle}>
              <option value="">Escolha uma recomendação…</option>
              {recomendacoes.map(r => <option key={r.id} value={r.id}>{r.nome} ({r.conteudo.equacaoIds.length})</option>)}
            </select>
          )}
        </div>
      )}

      <div>
        <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Nome do cenário (opcional)</label>
        <input value={nomeCenario} onChange={e => setNomeCenario(e.target.value)} placeholder="ex: Cenário A — V70"
          className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
      </div>

      <button onClick={aplicar} disabled={!podeAplicar}
        className="w-full py-2 rounded text-[11px] font-bold text-white flex items-center justify-center gap-1.5"
        style={{ background: !podeAplicar ? '#1a3a6b' : 'var(--invicta-green-dark)', opacity: podeAplicar ? 1 : 0.5 }}>
        {estado === 'carregando' ? <><Loader2 size={13} className="animate-spin" /> Aplicando e salvando…</> : <><Play size={13} /> Aplicar e salvar</>}
      </button>

      {erro && (
        <div className="px-2 py-1.5 rounded text-[10px] flex items-start gap-1.5" style={{ background: '#3a1a1a', color: '#fca5a5', border: '1px solid #7f1d1d' }}>
          <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" /> <span>{erro}</span>
        </div>
      )}

      {falhas.length > 0 && (
        <div className="px-2 py-1.5 rounded text-[9px]" style={{ background: '#2a230b', color: '#fbbf24', border: '1px solid #614a0a' }}>
          <div className="font-bold mb-0.5">Não aplicadas:</div>
          {falhas.map((f, i) => <div key={i}>• {f.nome}: {f.erro}</div>)}
        </div>
      )}

      {/* Resultado */}
      {estado === 'pronto' && doses.length > 0 && (
        <div className="rounded-lg p-3 space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
          {/* financeiro consolidado */}
          {fin && (
            <div className="text-[10px] space-y-0.5 pb-1" style={{ color: '#cbd5e1', borderBottom: '1px solid #1a3a6b' }}>
              <div className="flex justify-between"><span>Área</span><span>{fmt(fin.area, 1)} ha</span></div>
              <div className="flex justify-between font-bold" style={{ color: '#4ade80' }}><span>Custo total{fin.temSemCusto ? '*' : ''}</span><span>R$ {fmt(fin.custoTotal, 2)}</span></div>
              <div className="flex justify-between"><span>Custo / ha</span><span>R$ {fmt(fin.custoHa, 2)}</span></div>
              {fin.temSemCusto && <div className="text-[8px]" style={{ color: '#64748b' }}>* alguns produtos sem custo/tonelada definido</div>}
            </div>
          )}

          {/* lista de doses (clique p/ ver no mapa) */}
          <div className="space-y-1">
            {doses.map((d, i) => (
              <button key={i} onClick={() => setVisivel(i)} className="w-full p-1.5 rounded text-left flex items-center gap-2"
                style={{ background: i === visivel ? '#11305a' : '#0b1f38', border: i === visivel ? '1px solid var(--invicta-green)' : '1px solid transparent' }}>
                <Eye size={11} style={{ color: i === visivel ? '#4ade80' : '#475569', flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-bold truncate" style={{ color: '#e2e8f0' }}>{d.nomeEquacao}</div>
                  <div className="text-[9px] truncate" style={{ color: '#64748b' }}>
                    {d.produto ? `${d.produto} · ` : ''}méd {fmt(d.stats.media)} {d.unidade} · {fmt(d.toneladas, 1)} t{d.custo != null ? ` · R$ ${fmt(d.custo, 2)}` : ''}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* legenda da dose visível */}
          {classesVis.length > 0 && doseAtiva && (
            <div className="pt-1" style={{ borderTop: '1px solid #1a3a6b' }}>
              <div className="text-[9px] font-semibold mb-1" style={{ color: '#94a3b8' }}>Legenda · {doseAtiva.nomeEquacao} ({doseAtiva.unidade})</div>
              <div className="space-y-0.5">
                {classesVis.map((c, i) => {
                  const inf = i === 0 ? 0 : classesVis[i - 1].limiteSuperior;
                  const transp = doseAtiva.estilo.zeroTransparente && c.limiteSuperior <= doseAtiva.estilo.valorMinimo;
                  return (
                    <div key={i} className="flex items-center gap-1.5 text-[9px]" style={{ color: '#cbd5e1' }}>
                      <span className="w-4 h-3 rounded" style={{ background: transp ? 'transparent' : c.cor, border: transp ? '1px dashed #64748b' : '1px solid #2e5fa3' }} />
                      <span>{fmt(inf)} – {fmt(c.limiteSuperior)}{transp ? ' (transparente)' : ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* status do auto-save */}
          {salvoMsg && (
            <div className="pt-1 flex items-center gap-1.5 text-[9px]" style={{ color: salvoMsg.startsWith('Salvo') ? '#4ade80' : '#fbbf24', borderTop: '1px solid #1a3a6b' }}>
              <Save size={10} /> <span>{salvoMsg} Apague em “Cenários salvos” o que não for usar.</span>
            </div>
          )}
        </div>
      )}

      {/* Cenários salvos */}
      {salvos.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#93c5fd' }}>Cenários salvos</div>
            <button onClick={abrirComparador} disabled={selCompara.size < 2}
              className="text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1"
              style={{ background: selCompara.size >= 2 ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: selCompara.size >= 2 ? '#fff' : '#64748b' }}>
              <GitCompare size={11} /> Comparar{selCompara.size ? ` (${selCompara.size})` : ''}
            </button>
          </div>
          <div className="text-[9px] mb-1" style={{ color: '#64748b' }}>Marque 2 ou 3 cenários para comparar lado a lado.</div>
          <div className="space-y-1">
            {salvos.map(c => {
              const marcado = selCompara.has(c.id);
              return (
                <div key={c.id} className="p-2 rounded-lg flex items-center gap-2" style={{ background: '#061525', border: marcado ? '1px solid var(--invicta-green)' : '1px solid #1a3a6b' }}>
                  <input type="checkbox" checked={marcado} onChange={() => toggleCompara(c.id)} disabled={!marcado && selCompara.size >= 3} title="Comparar" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold truncate flex items-center gap-1" style={{ color: '#e2e8f0' }}>
                      {c.nome}
                      {c.oficial && <span className="text-[8px] font-bold px-1 py-0.5 rounded" style={{ background: 'var(--invicta-green-dark)', color: '#fff' }}>uso</span>}
                    </div>
                    <div className="text-[9px]" style={{ color: '#64748b' }}>
                      {new Date(c.geradoEm).toLocaleDateString('pt-BR')} · {c.doses.length} produto(s) · R$ {fmt(c.financeiro.custoTotal, 2)}
                    </div>
                  </div>
                  <button onClick={() => toggleOficial(c)} title={c.oficial ? 'Marcado para uso (clique p/ desmarcar)' : 'Marcar para uso (entra na geração de arquivos)'} className="p-1 rounded hover:bg-white/10" style={{ color: c.oficial ? '#fbbf24' : '#475569' }}><Star size={12} fill={c.oficial ? '#fbbf24' : 'none'} /></button>
                  <button onClick={() => reabrir(c)} title="Reabrir" className="p-1 rounded hover:bg-white/10" style={{ color: '#93c5fd' }}><FolderOpen size={12} /></button>
                  <button onClick={() => excluirSalvo(c)} title="Excluir" className="p-1 rounded hover:bg-white/10" style={{ color: '#f87171' }}><Trash2 size={12} /></button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Book de recomendações (PDF oficial em lote) */}
      {recomendacoes.length > 0 && (
        <div style={{ borderTop: '1px solid #1a3a6b', paddingTop: 10 }}>
          <div className="flex items-center gap-1.5 mb-1">
            <FileText size={13} style={{ color: '#a78bfa' }} />
            <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#93c5fd' }}>Book de recomendações (PDF)</span>
          </div>
          <p className="text-[9px] mb-1.5" style={{ color: '#64748b' }}>
            Gera 1 PDF oficial por recomendação marcada (uma página por produto) para apresentar ao produtor. Todas vêm marcadas; desmarque as que não quiser.
          </p>
          <div className="space-y-0.5 mb-2">
            {recomendacoes.map(r => (
              <label key={r.id} className="flex items-center gap-2 text-[10px] p-1 rounded cursor-pointer" style={{ color: '#cbd5e1' }}>
                <input type="checkbox" checked={bookSel.has(r.id)} onChange={() => toggleBook(r.id)} />
                <span className="flex-1 truncate">{r.nome}</span>
                <span style={{ color: '#64748b' }}>{r.conteudo.equacaoIds.length} eq.</span>
              </label>
            ))}
          </div>
          <button onClick={gerarBook} disabled={bookSel.size === 0 || !importacaoId || bookEstado === 'carregando'}
            className="w-full py-2 rounded text-[11px] font-bold text-white flex items-center justify-center gap-1.5"
            style={{ background: (bookSel.size === 0 || !importacaoId || bookEstado === 'carregando') ? '#1a3a6b' : 'var(--invicta-green-dark)', opacity: (bookSel.size === 0 || !importacaoId) ? 0.5 : 1 }}>
            {bookEstado === 'carregando' ? <><Loader2 size={13} className="animate-spin" /> Gerando book…</> : <><FileText size={13} /> Gerar book PDF ({bookSel.size})</>}
          </button>
          {erroBook && (
            <div className="mt-2 px-2 py-1.5 rounded text-[10px] flex items-start gap-1.5" style={{ background: '#3a1a1a', color: '#fca5a5', border: '1px solid #7f1d1d' }}>
              <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" /> <span>{erroBook}</span>
            </div>
          )}
        </div>
      )}

      {comparar && <ComparadorCenarios cenarios={comparar} onClose={() => setComparar(null)} />}
    </div>
  );
}
