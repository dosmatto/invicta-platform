'use client';

// Biblioteca → Recomendações (Fase R2). Uma recomendação = conjunto de equações
// da biblioteca. Mesma UX prática das Equações: lista única + busca, editor numa
// página só, clonar / "Salvar como", nasce compartilhada (escopo 'empresa').
// Aplicar a um talhão e gerar cenários/financeiro é a Fase R3.

import { useEffect, useMemo, useState } from 'react';
import {
  CATEGORIAS, listar, criar, atualizar, excluir, ativar, ordenarIdsEquacoes,
  type ItemBiblioteca, type ConteudoRecomendacao, type ConteudoEquacao,
  type CategoriaBiblioteca,
} from '@/lib/biblioteca';
import { Plus, Edit3, Trash2, Power, Copy, X, Save, SaveAll, Search, Check } from 'lucide-react';
import { pode } from '@/lib/empresa';

const SLUG: CategoriaBiblioteca = 'recomendacoes';
const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;
const listaDe = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);

export function RecomendacoesPanel() {
  const def = CATEGORIAS.find(c => c.slug === SLUG)!;
  const Icon = def.icone;
  const [refresh, setRefresh] = useState(0);
  const [filtro, setFiltro] = useState('');
  const [edit, setEdit] = useState<ItemBiblioteca<ConteudoRecomendacao> | 'novo' | null>(null);
  const podeBib = pode('biblioteca');

  useEffect(() => {
    const onCh = (e: Event) => {
      const d = (e as CustomEvent).detail as { slug?: CategoriaBiblioteca } | undefined;
      if (!d?.slug || d.slug === SLUG || d.slug === 'equacoes') setRefresh(x => x + 1);
    };
    if (typeof window !== 'undefined') window.addEventListener('inv:biblioteca', onCh);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('inv:biblioteca', onCh); };
  }, []);

  const itens = useMemo(() => listar<ConteudoRecomendacao>(SLUG), [refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtrados = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    if (!f) return itens;
    return itens.filter(i => `${i.nome} ${(i.conteudo.culturas ?? []).join(' ')}`.toLowerCase().includes(f));
  }, [itens, filtro]);

  function excluirItem(it: ItemBiblioteca<ConteudoRecomendacao>) {
    if (!confirm(`Excluir a recomendação "${it.nome}"?`)) return;
    excluir(SLUG, it.id);
  }
  function clonar(it: ItemBiblioteca<ConteudoRecomendacao>) {
    criar<ConteudoRecomendacao>(SLUG, { nome: `${it.nome} (cópia)`, descricao: it.descricao, conteudo: it.conteudo, escopo: 'empresa' });
  }

  return (
    <section className="flex-1 flex flex-col overflow-hidden relative">
      <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        <div className="flex items-center gap-2 mb-1">
          <Icon size={14} style={{ color: '#93c5fd' }} />
          <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: '#e2e8f0' }}>{def.nome}</h3>
        </div>
        <p className="text-[10px]" style={{ color: '#64748b' }}>{def.descricao}</p>
      </div>

      <div className="px-3 pt-2 flex-shrink-0 flex gap-1.5">
        <div className="relative flex-1">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: '#64748b' }} />
          <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar recomendação..."
            className="w-full rounded pl-7 pr-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
        </div>
        {podeBib && (
          <button onClick={() => setEdit('novo')}
            className="px-2.5 py-1.5 rounded text-[10px] font-bold text-white flex items-center gap-1 flex-shrink-0"
            style={{ background: 'var(--invicta-green-dark)' }}>
            <Plus size={11} /> Nova
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {filtrados.length === 0 ? (
          <div className="text-center py-8 px-4">
            <p className="text-[10px]" style={{ color: '#64748b' }}>
              {itens.length === 0 ? 'Nenhuma recomendação ainda. Use ' : 'Nada encontrado.'}
              {itens.length === 0 && <em>+ Nova</em>}{itens.length === 0 ? '.' : ''}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filtrados.map(it => (
              <div key={it.id} className="p-2 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-bold truncate" style={{ color: '#e2e8f0' }}>{it.nome}</div>
                    <div className="text-[9px] truncate" style={{ color: '#64748b' }}>
                      {(it.conteudo.equacaoIds ?? []).length} equação(ões)
                      {(it.conteudo.culturas ?? []).length ? ` · ${it.conteudo.culturas.join(', ')}` : ''}
                    </div>
                  </div>
                  {it.escopo === 'sistema' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#1a3a6b', color: '#93c5fd' }}>sistema</span>}
                  {!it.ativo && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#1a3a6b', color: '#94a3b8' }}>inativo</span>}
                  {podeBib && (<>
                    <button onClick={() => setEdit(it)} title="Editar" className="p-1 rounded hover:bg-white/10" style={{ color: '#93c5fd' }}><Edit3 size={11} /></button>
                    <button onClick={() => clonar(it)} title="Clonar" className="p-1 rounded hover:bg-white/10" style={{ color: '#93c5fd' }}><Copy size={11} /></button>
                    <button onClick={() => ativar(SLUG, it.id, !it.ativo)} title={it.ativo ? 'Inativar' : 'Ativar'} className="p-1 rounded hover:bg-white/10" style={{ color: it.ativo ? '#fbbf24' : '#22c55e' }}><Power size={11} /></button>
                    <button onClick={() => excluirItem(it)} title="Excluir" className="p-1 rounded hover:bg-white/10" style={{ color: '#f87171' }}><Trash2 size={11} /></button>
                  </>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {edit && <RecomendacaoEditor item={edit === 'novo' ? null : edit} onClose={() => setEdit(null)} />}
    </section>
  );
}

function RecomendacaoEditor({ item, onClose }: { item: ItemBiblioteca<ConteudoRecomendacao> | null; onClose: () => void }) {
  const c = item?.conteudo;
  const [nome, setNome] = useState(item?.nome ?? '');
  const [descricao, setDescricao] = useState(item?.descricao ?? '');
  const [culturas, setCulturas] = useState((c?.culturas ?? []).join(', '));
  const [equacaoIds, setEquacaoIds] = useState<string[]>(c?.equacaoIds ?? []);
  const [buscaEq, setBuscaEq] = useState('');
  const [erro, setErro] = useState('');

  const equacoes = useMemo(() => listar<ConteudoEquacao>('equacoes'), []);
  const eqPorId = useMemo(() => new Map(equacoes.map(e => [e.id, e] as const)), [equacoes]);
  // Ao abrir, normaliza a ordem das equações já salvas para a ordem canônica
  // (bloco por grupo → ordem fina → nome). Devolve a mesma ref se já estiver ok.
  useEffect(() => {
    setEquacaoIds(prev => {
      const ord = ordenarIdsEquacoes(prev, eqPorId);
      return ord.length === prev.length && ord.every((id, i) => id === prev[i]) ? prev : ord;
    });
  }, [eqPorId]);
  const disponiveis = useMemo(() => {
    const f = buscaEq.trim().toLowerCase();
    return equacoes
      .filter(e => !equacaoIds.includes(e.id))
      .filter(e => !f || `${e.nome} ${e.conteudo.produto ?? ''}`.toLowerCase().includes(f));
  }, [equacoes, equacaoIds, buscaEq]);

  function montarConteudo(): ConteudoRecomendacao {
    return { equacaoIds, culturas: listaDe(culturas) };
  }
  function validarTudo(): boolean {
    setErro('');
    if (!nome.trim()) { setErro('Dê um nome à recomendação.'); return false; }
    if (equacaoIds.length === 0) { setErro('Adicione ao menos uma equação.'); return false; }
    return true;
  }
  function salvar() {
    if (!validarTudo()) return;
    const conteudo = montarConteudo();
    if (item) atualizar<ConteudoRecomendacao>(SLUG, item.id, { nome: nome.trim(), descricao: descricao.trim() || undefined, conteudo });
    else criar<ConteudoRecomendacao>(SLUG, { nome: nome.trim(), descricao: descricao.trim() || undefined, conteudo, escopo: 'empresa' });
    onClose();
  }
  function salvarComo() {
    if (!validarTudo()) return;
    const base = nome.trim();
    const nomeNovo = item && base === item.nome ? `${base} (cópia)` : base;
    criar<ConteudoRecomendacao>(SLUG, { nome: nomeNovo, descricao: descricao.trim() || undefined, conteudo: montarConteudo(), escopo: 'empresa' });
    onClose();
  }

  const txt = "w-full rounded px-2 py-1.5 text-[11px] outline-none";

  return (
    <div className="absolute inset-0 z-10 flex flex-col" style={{ background: 'var(--invicta-blue-dark)' }}>
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        <span className="text-[11px] font-bold uppercase truncate" style={{ color: '#e2e8f0' }}>{item ? 'Editar recomendação' : 'Nova recomendação'}</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/10" style={{ color: '#cbd5e1' }}><X size={12} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Nome</label>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="ex: Invicta - Corretivos" className={txt} style={inputStyle} />
        </div>
        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Culturas (vírgula)</label>
          <input value={culturas} onChange={e => setCulturas(e.target.value)} placeholder="Soja, Milho" className={txt} style={inputStyle} />
        </div>
        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Descrição</label>
          <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2} className={txt + " resize-none"} style={inputStyle} />
        </div>

        {/* Equações selecionadas */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide mb-1.5 pb-1" style={{ color: '#93c5fd', borderBottom: '1px solid #1a3a6b' }}>
            Equações ({equacaoIds.length})
          </div>
          {equacaoIds.length === 0 ? (
            <p className="text-[9px] mb-1" style={{ color: '#64748b' }}>Nenhuma equação ainda — escolha abaixo.</p>
          ) : (
            <div className="flex flex-wrap gap-1 mb-1">
              {equacaoIds.map(id => {
                const eq = eqPorId.get(id);
                return (
                  <span key={id} className="text-[10px] font-semibold pl-2 pr-1 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'var(--invicta-green-dark)', color: '#fff' }}>
                    {eq?.nome ?? '(equação removida)'}
                    <button onClick={() => setEquacaoIds(equacaoIds.filter(x => x !== id))} className="rounded-full hover:bg-black/20 p-0.5" title="Remover"><X size={10} /></button>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Adicionar equações */}
        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Adicionar equação</label>
          {equacoes.length === 0 ? (
            <p className="text-[10px]" style={{ color: '#fbbf24' }}>Nenhuma equação na biblioteca. Crie equações na aba <strong>Equações</strong> primeiro.</p>
          ) : (
            <>
              <div className="relative mb-1">
                <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: '#64748b' }} />
                <input value={buscaEq} onChange={e => setBuscaEq(e.target.value)} placeholder="Buscar equação..." className="w-full rounded pl-7 pr-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
              </div>
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {disponiveis.length === 0 ? (
                  <p className="text-[9px] py-1 text-center" style={{ color: '#64748b' }}>
                    {equacaoIds.length === equacoes.length ? 'Todas as equações já foram adicionadas.' : 'Nada encontrado.'}
                  </p>
                ) : disponiveis.map(eq => (
                  <button key={eq.id} onClick={() => { setEquacaoIds(ordenarIdsEquacoes([...equacaoIds, eq.id], eqPorId)); }}
                    className="w-full p-1.5 rounded text-left flex items-center gap-2 hover:bg-white/5" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                    <Plus size={11} style={{ color: '#22c55e', flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold truncate" style={{ color: '#e2e8f0' }}>{eq.nome}</div>
                      <div className="text-[9px] truncate" style={{ color: '#64748b' }}>{eq.conteudo.produto || 'sem produto'}{eq.conteudo.unidadeTratamento ? ` · ${eq.conteudo.unidadeTratamento}` : ''}</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {erro && <div className="mx-3 mb-2 px-2 py-1.5 rounded text-[10px] flex-shrink-0" style={{ background: '#3a1a1a', color: '#fca5a5', border: '1px solid #7f1d1d' }}>{erro}</div>}
      <div className="flex gap-2 px-3 py-2 flex-shrink-0" style={{ borderTop: '1px solid #1a3a6b' }}>
        <button onClick={onClose} className="py-1.5 px-3 rounded text-[10px] font-bold" style={{ background: '#1a3a6b', color: '#cbd5e1' }}>Cancelar</button>
        <button onClick={salvarComo} title="Cria uma nova recomendação a partir destas edições (não altera a original)"
          className="flex-1 py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
          <SaveAll size={11} /> Salvar como
        </button>
        <button onClick={salvar} className="flex-1 py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1" style={{ background: 'var(--invicta-green-dark)' }}>
          <Save size={11} /> Salvar
        </button>
      </div>
    </div>
  );
}
