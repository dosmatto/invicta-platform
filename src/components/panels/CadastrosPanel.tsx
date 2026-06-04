'use client';

import { useState, useEffect } from 'react';
import { LEGENDAS_PADRAO, ANALISES_FISICAS } from '@/constants/agronomica';
import {
  getPadroesElementos, savePadraoElementos, updatePadraoElementos, deletePadraoElementos,
  getPadroesAmostragem, savePadraoAmostragem, updatePadraoAmostragem, deletePadraoAmostragem,
  PadraoElementos, PadraoAmostragem, ProfundidadeConfig,
} from '@/lib/store';
import {
  ChevronLeft, ChevronRight, Plus, X, Save, Trash2, Pencil,
  TestTube, Grid3x3, AlertTriangle, FlaskConical,
} from 'lucide-react';
import { BaseAgronomicaPanel } from './BaseAgronomicaPanel';

type View = 'menu' | 'elementos' | 'amostragem' | 'base';

// Elementos selecionáveis = nutrientes da Base Agronômica + análises físicas (textura)
const ELEMENTOS_DISPONIVEIS = [
  ...LEGENDAS_PADRAO.map(l => ({ id: l.id, simbolo: l.simbolo, nome: l.nome })),
  ...ANALISES_FISICAS,
];

// ── Painel raiz: menu de cadastros ──────────────────────────────────────────
export function CadastrosPanel() {
  const [view, setView] = useState<View>('menu');

  if (view === 'elementos') return <PadroesElementos onVoltar={() => setView('menu')} />;
  if (view === 'amostragem') return <PadroesAmostragem onVoltar={() => setView('menu')} />;
  if (view === 'base') return (
    <div className="flex flex-col h-full">
      <VoltarBar onVoltar={() => setView('menu')} titulo="Cadastros" />
      <div className="flex-1 overflow-y-auto"><BaseAgronomicaPanel /></div>
    </div>
  );

  const itens = [
    { id: 'elementos', label: 'Padrões de Elementos', desc: 'Conjuntos de elementos a analisar (Rotina, Micros…)', icon: TestTube, color: '#a78bfa' },
    { id: 'amostragem', label: 'Padrões de Amostragem', desc: 'Densidade + profundidades por padrão', icon: Grid3x3, color: '#60a5fa' },
    { id: 'base', label: 'Base Agronômica', desc: 'Legendas, classes e metodologias por nutriente', icon: FlaskConical, color: '#4ade80' },
  ] as const;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        <p className="text-[10px]" style={{ color: '#64748b' }}>
          Cadastros gerais reutilizáveis no sistema.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {itens.map(it => (
          <button key={it.id} onClick={() => setView(it.id as View)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
            style={{ borderBottom: '1px solid #0f2240' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-item-hover)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: it.color + '22' }}>
              <it.icon size={16} style={{ color: it.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>{it.label}</p>
              <p className="text-[10px]" style={{ color: '#64748b' }}>{it.desc}</p>
            </div>
            <ChevronRight size={14} style={{ color: '#64748b' }} />
          </button>
        ))}
      </div>
    </div>
  );
}

// ── helpers de estilo ────────────────────────────────────────────────────────
const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;

function VoltarBar({ onVoltar, titulo }: { onVoltar: () => void; titulo: string }) {
  return (
    <button onClick={onVoltar}
      className="flex items-center gap-1.5 px-4 py-2 text-xs w-full text-left flex-shrink-0 transition-colors"
      style={{ color: '#93c5fd', borderBottom: '1px solid #0f2240' }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-item-hover)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
      <ChevronLeft size={12} /> {titulo}
    </button>
  );
}

// ── Padrões de Elementos ─────────────────────────────────────────────────────
function PadroesElementos({ onVoltar }: { onVoltar: () => void }) {
  const [lista, setLista] = useState<PadraoElementos[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [mostraForm, setMostraForm] = useState(false);
  const [nome, setNome] = useState('');
  const [sel, setSel] = useState<string[]>([]);

  useEffect(() => { setLista(getPadroesElementos()); }, []);
  function reload() { setLista(getPadroesElementos()); }

  function abrirNovo() { setEditId(null); setNome(''); setSel([]); setMostraForm(true); }
  function abrirEdicao(p: PadraoElementos) { setEditId(p.id); setNome(p.nome); setSel(p.elementos); setMostraForm(true); }

  function toggle(id: string) {
    setSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function salvar() {
    if (!nome.trim() || sel.length === 0) return;
    if (editId) updatePadraoElementos(editId, { nome: nome.trim(), elementos: sel });
    else savePadraoElementos({ nome: nome.trim(), elementos: sel });
    reload(); setMostraForm(false);
  }

  function excluir(id: string) { deletePadraoElementos(id); reload(); }

  const nomePorId = (id: string) => ELEMENTOS_DISPONIVEIS.find(l => l.id === id)?.simbolo ?? id;

  return (
    <div className="flex flex-col h-full">
      <VoltarBar onVoltar={onVoltar} titulo="Cadastros" />

      <div className="px-4 py-3 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        <p className="text-sm font-bold" style={{ color: '#fff' }}>Padrões de Elementos</p>
        {!mostraForm && (
          <button onClick={abrirNovo}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white"
            style={{ background: 'var(--invicta-green-dark)' }}>
            <Plus size={12} /> Novo
          </button>
        )}
      </div>

      {mostraForm ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#93c5fd' }}>
            {editId ? 'Editar padrão' : 'Novo padrão de elementos'}
          </p>
          <div>
            <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Nome *</label>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Rotina, Rotina + Micros"
              className="w-full rounded px-3 py-2 text-xs outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="text-[10px] font-semibold block mb-1.5" style={{ color: '#64748b' }}>
              Elementos a analisar ({sel.length})
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {ELEMENTOS_DISPONIVEIS.map(el => {
                const on = sel.includes(el.id);
                return (
                  <button key={el.id} onClick={() => toggle(el.id)}
                    title={el.nome}
                    className="py-2 rounded text-xs font-bold transition-colors"
                    style={{
                      background: on ? 'var(--invicta-blue-mid)' : '#1a3a6b',
                      color: on ? '#fff' : '#64748b',
                      border: `1px solid ${on ? '#60a5fa' : 'transparent'}`,
                    }}>
                    {el.simbolo}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setMostraForm(false)}
              className="flex-1 py-2 rounded text-xs font-semibold flex items-center justify-center gap-1"
              style={{ background: '#1a3a6b', color: '#94a3b8' }}>
              <X size={12} /> Cancelar
            </button>
            <button onClick={salvar} disabled={!nome.trim() || sel.length === 0}
              className="flex-1 py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1 disabled:opacity-40"
              style={{ background: 'var(--invicta-green-dark)' }}>
              <Save size={12} /> Salvar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {lista.length === 0 ? (
            <EmptyState icon={TestTube} titulo="Nenhum padrão de elementos" sub='Clique em "+ Novo" para criar' />
          ) : (
            lista.map(p => (
              <div key={p.id} className="px-4 py-3" style={{ borderBottom: '1px solid #0f2240' }}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>{p.nome}</p>
                  <div className="flex items-center gap-1">
                    <IconBtn onClick={() => abrirEdicao(p)} color="#93c5fd" hover="#1a3a6b"><Pencil size={12} /></IconBtn>
                    <IconBtn onClick={() => excluir(p.id)} color="#f87171" hover="#450a0a"><Trash2 size={12} /></IconBtn>
                  </div>
                </div>
                <p className="text-[10px] mt-1" style={{ color: '#64748b' }}>
                  {p.elementos.map(nomePorId).join(' · ')}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Padrões de Amostragem ────────────────────────────────────────────────────
function PadroesAmostragem({ onVoltar }: { onVoltar: () => void }) {
  const [lista, setLista] = useState<PadraoAmostragem[]>([]);
  const [padroesElem, setPadroesElem] = useState<PadraoElementos[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [mostraForm, setMostraForm] = useState(false);
  const [nome, setNome] = useState('');
  const [densidade, setDensidade] = useState('2');
  const [profs, setProfs] = useState<ProfundidadeConfig[]>([]);

  useEffect(() => { setLista(getPadroesAmostragem()); setPadroesElem(getPadroesElementos()); }, []);
  function reload() { setLista(getPadroesAmostragem()); }

  function abrirNovo() {
    setEditId(null); setNome(''); setDensidade('2');
    setProfs([{ rotulo: '00-20', percentual: 100, padraoElementosId: padroesElem[0]?.id ?? '' }]);
    setMostraForm(true);
  }
  function abrirEdicao(p: PadraoAmostragem) {
    setEditId(p.id); setNome(p.nome); setDensidade(String(p.densidadeHaPonto));
    setProfs(p.profundidades); setMostraForm(true);
  }

  function setProf(i: number, patch: Partial<ProfundidadeConfig>) {
    setProfs(prev => prev.map((p, idx) => idx === i ? { ...p, ...patch } : p));
  }
  function addProf() {
    setProfs(prev => [...prev, { rotulo: '20-40', percentual: 20, padraoElementosId: padroesElem[0]?.id ?? '' }]);
  }
  function removeProf(i: number) { setProfs(prev => prev.filter((_, idx) => idx !== i)); }

  const valido = nome.trim() && Number(densidade) > 0 && profs.length > 0 &&
    profs.every(p => p.rotulo.trim() && p.percentual > 0 && p.padraoElementosId);

  function salvar() {
    if (!valido) return;
    const dados = { nome: nome.trim(), densidadeHaPonto: Number(densidade), profundidades: profs };
    if (editId) updatePadraoAmostragem(editId, dados);
    else savePadraoAmostragem(dados);
    reload(); setMostraForm(false);
  }
  function excluir(id: string) { deletePadraoAmostragem(id); reload(); }

  const nomeElem = (id: string) => padroesElem.find(p => p.id === id)?.nome ?? '—';

  return (
    <div className="flex flex-col h-full">
      <VoltarBar onVoltar={onVoltar} titulo="Cadastros" />

      <div className="px-4 py-3 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        <p className="text-sm font-bold" style={{ color: '#fff' }}>Padrões de Amostragem</p>
        {!mostraForm && (
          <button onClick={abrirNovo}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white"
            style={{ background: 'var(--invicta-green-dark)' }}>
            <Plus size={12} /> Novo
          </button>
        )}
      </div>

      {/* Aviso: precisa de padrões de elementos antes */}
      {mostraForm && padroesElem.length === 0 ? (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
            <AlertTriangle size={16} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold" style={{ color: '#fbbf24' }}>Cadastre Padrões de Elementos primeiro</p>
              <p className="text-[10px] mt-1" style={{ color: '#78350f' }}>
                Cada profundidade precisa de um padrão de elementos (ex: Rotina). Volte e cadastre ao menos um.
              </p>
            </div>
          </div>
          <button onClick={() => setMostraForm(false)}
            className="w-full mt-3 py-2 rounded text-xs font-semibold" style={{ background: '#1a3a6b', color: '#94a3b8' }}>
            Voltar
          </button>
        </div>
      ) : mostraForm ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#93c5fd' }}>
            {editId ? 'Editar padrão' : 'Novo padrão de amostragem'}
          </p>
          <div>
            <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Nome *</label>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Padrão 1 Invicta"
              className="w-full rounded px-3 py-2 text-xs outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Densidade (ha / ponto) *</label>
            <input type="number" step="0.5" min="0.1" value={densidade} onChange={e => setDensidade(e.target.value)}
              className="w-full rounded px-3 py-2 text-xs outline-none" style={inputStyle} />
          </div>

          {/* Profundidades */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-semibold" style={{ color: '#64748b' }}>Profundidades</label>
              <button onClick={addProf} className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: '#86efac' }}>
                <Plus size={11} /> Adicionar
              </button>
            </div>
            <div className="space-y-2">
              {profs.map((prof, i) => (
                <div key={i} className="p-2 rounded space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="text-[9px] font-semibold block mb-0.5" style={{ color: '#475569' }}>Profundidade</label>
                      <input value={prof.rotulo} onChange={e => setProf(i, { rotulo: e.target.value })} placeholder="00-20"
                        className="w-full rounded px-2 py-1 text-xs outline-none" style={inputStyle} />
                    </div>
                    <div style={{ width: '70px' }}>
                      <label className="text-[9px] font-semibold block mb-0.5" style={{ color: '#475569' }}>% pontos</label>
                      <input type="number" min="1" max="100" value={prof.percentual}
                        onChange={e => setProf(i, { percentual: Number(e.target.value) })}
                        className="w-full rounded px-2 py-1 text-xs outline-none" style={inputStyle} />
                    </div>
                    {profs.length > 1 && (
                      <button onClick={() => removeProf(i)} className="mt-4 p-1 rounded" style={{ color: '#f87171' }}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="text-[9px] font-semibold block mb-0.5" style={{ color: '#475569' }}>Padrão de elementos</label>
                    <select value={prof.padraoElementosId} onChange={e => setProf(i, { padraoElementosId: e.target.value })}
                      className="w-full rounded px-2 py-1 text-xs outline-none" style={inputStyle}>
                      {padroesElem.map(pe => <option key={pe.id} value={pe.id}>{pe.nome}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={() => setMostraForm(false)}
              className="flex-1 py-2 rounded text-xs font-semibold flex items-center justify-center gap-1"
              style={{ background: '#1a3a6b', color: '#94a3b8' }}>
              <X size={12} /> Cancelar
            </button>
            <button onClick={salvar} disabled={!valido}
              className="flex-1 py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1 disabled:opacity-40"
              style={{ background: 'var(--invicta-green-dark)' }}>
              <Save size={12} /> Salvar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {lista.length === 0 ? (
            <EmptyState icon={Grid3x3} titulo="Nenhum padrão de amostragem" sub='Clique em "+ Novo" para criar' />
          ) : (
            lista.map(p => (
              <div key={p.id} className="px-4 py-3" style={{ borderBottom: '1px solid #0f2240' }}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>{p.nome}</p>
                  <div className="flex items-center gap-1">
                    <IconBtn onClick={() => abrirEdicao(p)} color="#93c5fd" hover="#1a3a6b"><Pencil size={12} /></IconBtn>
                    <IconBtn onClick={() => excluir(p.id)} color="#f87171" hover="#450a0a"><Trash2 size={12} /></IconBtn>
                  </div>
                </div>
                <p className="text-[10px] mt-0.5" style={{ color: '#86efac' }}>1 ponto / {p.densidadeHaPonto} ha</p>
                <div className="mt-1.5 space-y-0.5">
                  {p.profundidades.map((prof, i) => (
                    <p key={i} className="text-[10px]" style={{ color: '#64748b' }}>
                      <span style={{ color: '#93c5fd' }}>{prof.rotulo}</span> · {prof.percentual}% · {nomeElem(prof.padraoElementosId)}
                    </p>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── auxiliares ────────────────────────────────────────────────────────────────
function IconBtn({ children, onClick, color, hover }: { children: React.ReactNode; onClick: () => void; color: string; hover: string }) {
  return (
    <button onClick={onClick} className="p-1.5 rounded transition-colors" style={{ background: '#1a3a6b', color }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = hover}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#1a3a6b'}>
      {children}
    </button>
  );
}

function EmptyState({ icon: Icon, titulo, sub }: { icon: React.ElementType; titulo: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: '#1a3a6b' }}>
        <Icon size={26} style={{ color: '#2e5fa3' }} />
      </div>
      <p className="text-sm font-semibold" style={{ color: '#94a3b8' }}>{titulo}</p>
      <p className="text-xs" style={{ color: '#475569' }}>{sub}</p>
    </div>
  );
}
