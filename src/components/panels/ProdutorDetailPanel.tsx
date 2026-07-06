'use client';

import { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { getClientes, getFazendas, getTalhoes, saveFazenda, updateCliente, deleteCliente, Cliente, Fazenda } from '@/lib/store';
import { ChevronLeft, ChevronRight, Plus, Building2, Phone, Mail, Edit2, Save, X, Trash2, Pencil } from 'lucide-react';
import { PanelSection, PanelButton, MockIndicator } from './_shared';

const ESTADOS_BR = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const editInput = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;

function FieldEdit({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)}
        className="w-full rounded px-3 py-2 text-xs outline-none" style={editInput} />
    </div>
  );
}

export function ProdutorDetailPanel() {
  const { nav, setNav, setActivePanel } = useApp();
  const [tab, setTab] = useState<'fazendas' | 'dados'>('fazendas');
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [fazendas, setFazendas] = useState<Fazenda[]>([]);
  const [mostraForm, setMostraForm] = useState(false);
  const [form, setForm] = useState({ nome: '', sigla: '', municipio: '', estado: 'PR', car: '', nirf: '' });
  const [salvando, setSalvando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Cliente>>({});
  const [renomeando, setRenomeando] = useState(false);
  const [nomeTemp, setNomeTemp] = useState('');
  const [areasFaz, setAreasFaz] = useState<Record<string, number>>({});

  function iniciarEdicaoCliente() { if (cliente) { setEditForm({ ...cliente }); setEditando(true); } }
  function salvarRenomeProdutor() {
    const novo = nomeTemp.trim();
    if (!cliente || !novo) { setRenomeando(false); return; }
    updateCliente(cliente.id, { nome: novo });
    setCliente(getClientes().find(c => c.id === cliente.id) ?? null);
    setNav({ produtor: novo.toUpperCase() });
    setRenomeando(false);
  }
  function salvarEdicaoCliente() {
    if (!cliente) return;
    updateCliente(cliente.id, editForm);
    setCliente(getClientes().find(c => c.id === cliente.id) ?? null);
    setEditando(false);
  }
  function apagarCliente() {
    if (!cliente) return;
    if (fazendas.length > 0) { alert('Este cliente tem fazendas cadastradas. Apague as fazendas primeiro para poder excluir o cliente.'); return; }
    if (!confirm(`Excluir o cliente "${cliente.nome}"? Esta ação não pode ser desfeita.`)) return;
    deleteCliente(cliente.id);
    setActivePanel('produtores');
  }

  useEffect(() => {
    if (!nav.produtorId) return;
    const clientes = getClientes();
    setCliente(clientes.find(c => c.id === nav.produtorId) ?? null);
    const fz = getFazendas(nav.produtorId);
    setFazendas(fz);
    const map: Record<string, number> = {};
    for (const f of fz) map[f.id] = getTalhoes(f.id).reduce((s, t) => s + (t.areaHa || 0), 0);
    setAreasFaz(map);
  }, [nav.produtorId]);

  function abrirFazenda(f: Fazenda) {
    setNav({ fazendaId: f.id, fazenda: f.nome });
    setActivePanel(`fazenda-${f.id}`);
  }

  function handleSalvarFazenda() {
    if (!form.nome.trim() || !nav.produtorId) return;
    setSalvando(true);
    setTimeout(() => {
      saveFazenda({ clienteId: nav.produtorId!, ...form });
      setFazendas(getFazendas(nav.produtorId!));
      setForm({ nome: '', sigla: '', municipio: '', estado: 'PR', car: '', nirf: '' });
      setMostraForm(false);
      setSalvando(false);
    }, 300);
  }

  if (!cliente) return (
    <div className="flex items-center justify-center p-8">
      <p className="text-xs" style={{ color: '#64748b' }}>Carregando...</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Voltar */}
      <button onClick={() => setActivePanel('produtores')}
        className="flex items-center gap-1.5 px-4 py-2 text-xs w-full text-left flex-shrink-0 transition-colors"
        style={{ color: '#93c5fd', borderBottom: '1px solid #0f2240' }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-item-hover)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
        <ChevronLeft size={12} /> Clientes
      </button>

      {/* Header */}
      <div className="px-4 py-4 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b', background: '#0a1929' }}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0"
            style={{ background: 'var(--invicta-blue-mid)', color: '#fff' }}>
            {cliente.nome.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            {renomeando ? (
              <div className="flex items-center gap-1">
                <input autoFocus value={nomeTemp} onChange={e => setNomeTemp(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') salvarRenomeProdutor(); if (e.key === 'Escape') setRenomeando(false); }}
                  className="rounded px-1.5 py-0.5 text-sm font-bold outline-none" style={{ background: '#1a3a6b', color: '#fff', border: '1px solid #2e5fa3', width: 170 }} />
                <button onClick={salvarRenomeProdutor} title="Salvar" className="p-1" style={{ color: '#4ade80' }}><Save size={13} /></button>
                <button onClick={() => setRenomeando(false)} title="Cancelar" className="p-1" style={{ color: '#94a3b8' }}><X size={13} /></button>
              </div>
            ) : (
              <p className="text-base font-bold flex items-center gap-1.5 min-w-0" style={{ color: '#fff' }}>
                <span className="truncate">{cliente.nome}</span>
                <button onClick={() => { setNomeTemp(cliente.nome); setRenomeando(true); }} title="Renomear cliente" className="p-0.5 flex-shrink-0" style={{ color: '#64748b' }}><Pencil size={12} /></button>
              </p>
            )}
            <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>
              {cliente.tipoPessoa} · {cliente.documento || '—'}
            </p>
            <p className="text-xs" style={{ color: '#64748b' }}>{cliente.cidade} · {cliente.estado}</p>
          </div>
        </div>
        <div className="flex gap-4 mt-2">
          {cliente.telefone && (
            <div className="flex items-center gap-1.5 text-xs" style={{ color: '#64748b' }}>
              <Phone size={11} />{cliente.telefone}
            </div>
          )}
          {cliente.email && (
            <div className="flex items-center gap-1.5 text-xs truncate" style={{ color: '#64748b' }}>
              <Mail size={11} />{cliente.email}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        {[
          { id: 'fazendas', label: `Fazendas (${fazendas.length})` },
          { id: 'dados',    label: 'Dados' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as typeof tab)}
            className="flex-1 py-2.5 text-xs font-semibold"
            style={{
              color: tab === t.id ? '#fff' : '#64748b',
              borderBottom: tab === t.id ? '2px solid var(--invicta-green)' : '2px solid transparent',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'fazendas' && (
          <>
            {/* Formulário nova fazenda */}
            {mostraForm ? (
              <div className="p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#93c5fd' }}>Nova Fazenda</p>
                {[
                  { label: 'Nome da Fazenda *', key: 'nome', ph: 'Fazenda São João' },
                  { label: 'Sigla (opcional)', key: 'sigla', ph: 'Ex: FSJ' },
                  { label: 'Município', key: 'municipio', ph: 'Cidade' },
                  { label: 'CAR', key: 'car', ph: 'MT-0000000-00...' },
                  { label: 'NIRF', key: 'nirf', ph: 'Número NIRF (opcional)' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>{f.label}</label>
                    <input value={form[f.key as keyof typeof form]} placeholder={f.ph}
                      onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full rounded px-3 py-2 text-xs outline-none"
                      style={{ background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' }} />
                  </div>
                ))}
                <div>
                  <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Estado</label>
                  <select value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value }))}
                    className="w-full rounded px-3 py-2 text-xs outline-none"
                    style={{ background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' }}>
                    {ESTADOS_BR.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setMostraForm(false)}
                    className="flex-1 py-2 rounded text-xs font-semibold flex items-center justify-center gap-1"
                    style={{ background: '#1a3a6b', color: '#94a3b8' }}>
                    <X size={12} /> Cancelar
                  </button>
                  <button onClick={handleSalvarFazenda} disabled={!form.nome.trim() || salvando}
                    className="flex-1 py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1 disabled:opacity-40"
                    style={{ background: 'var(--invicta-green-dark)' }}>
                    <Save size={12} /> {salvando ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="p-3">
                  <button onClick={() => setMostraForm(true)}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold text-white"
                    style={{ background: 'var(--invicta-green-dark)' }}>
                    <Plus size={12} /> Nova Fazenda
                  </button>
                </div>

                {fazendas.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <Building2 size={28} className="mx-auto mb-2" style={{ color: '#2e3f5c' }} />
                    <p className="text-xs" style={{ color: '#475569' }}>Nenhuma fazenda cadastrada.</p>
                    <p className="text-xs mt-1" style={{ color: '#2e3f5c' }}>Clique em "Nova Fazenda" acima.</p>
                  </div>
                ) : (
                  fazendas.map(f => (
                    <button key={f.id} onClick={() => abrirFazenda(f)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                      style={{ borderBottom: '1px solid #0f2240' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-item-hover)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: '#166534' }}>
                        <Building2 size={14} style={{ color: '#86efac' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: '#e2e8f0' }}>{f.nome}</p>
                        <p className="text-[10px]" style={{ color: '#64748b' }}>
                          {f.sigla ? `${f.sigla} · ` : ''}{f.municipio} · {f.estado}{f.car ? ` · CAR: ${f.car}` : ''}
                        </p>
                        {areasFaz[f.id] > 0 && (
                          <p className="text-[10px] font-semibold" style={{ color: '#86efac' }}>
                            {areasFaz[f.id].toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha
                          </p>
                        )}
                      </div>
                      <ChevronRight size={14} style={{ color: '#64748b' }} />
                    </button>
                  ))
                )}
              </>
            )}
          </>
        )}

        {tab === 'dados' && (editando ? (
          <div className="p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#93c5fd' }}>Editar Cliente</p>
            <FieldEdit label="Nome *" value={editForm.nome ?? ''} onChange={v => setEditForm(p => ({ ...p, nome: v }))} />
            <FieldEdit label="Sigla" value={editForm.sigla ?? ''} onChange={v => setEditForm(p => ({ ...p, sigla: v }))} />
            <div>
              <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Tipo</label>
              <select value={editForm.tipoPessoa ?? 'PF'} onChange={e => setEditForm(p => ({ ...p, tipoPessoa: e.target.value as 'PF' | 'PJ' }))}
                className="w-full rounded px-3 py-2 text-xs outline-none" style={editInput}>
                <option value="PF">Pessoa Física</option>
                <option value="PJ">Pessoa Jurídica</option>
              </select>
            </div>
            <FieldEdit label="CPF / CNPJ" value={editForm.documento ?? ''} onChange={v => setEditForm(p => ({ ...p, documento: v }))} />
            <FieldEdit label="Município" value={editForm.cidade ?? ''} onChange={v => setEditForm(p => ({ ...p, cidade: v }))} />
            <div>
              <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Estado</label>
              <select value={editForm.estado ?? 'PR'} onChange={e => setEditForm(p => ({ ...p, estado: e.target.value }))}
                className="w-full rounded px-3 py-2 text-xs outline-none" style={editInput}>
                {ESTADOS_BR.map(uf => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </div>
            <FieldEdit label="Telefone" value={editForm.telefone ?? ''} onChange={v => setEditForm(p => ({ ...p, telefone: v }))} />
            <FieldEdit label="E-mail" value={editForm.email ?? ''} onChange={v => setEditForm(p => ({ ...p, email: v }))} />
            <FieldEdit label="Observações" value={editForm.observacoes ?? ''} onChange={v => setEditForm(p => ({ ...p, observacoes: v }))} />
            <div className="flex gap-2">
              <button onClick={() => setEditando(false)} className="flex-1 py-2 rounded text-xs font-semibold flex items-center justify-center gap-1" style={{ background: '#1a3a6b', color: '#94a3b8' }}><X size={12} /> Cancelar</button>
              <button onClick={salvarEdicaoCliente} disabled={!editForm.nome?.trim()} className="flex-1 py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1 disabled:opacity-40" style={{ background: 'var(--invicta-green-dark)' }}><Save size={12} /> Salvar</button>
            </div>
          </div>
        ) : (
          <>
            <div className="p-3 flex justify-end">
              <button onClick={iniciarEdicaoCliente} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold" style={{ background: '#1a3a6b', color: '#93c5fd' }}><Edit2 size={12} /> Editar</button>
            </div>
            <PanelSection>
              {[
                { label: 'Nome', value: cliente.nome },
                { label: 'Tipo', value: cliente.tipoPessoa === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica' },
                { label: 'CPF / CNPJ', value: cliente.documento || '—' },
                { label: 'Município', value: cliente.cidade || '—' },
                { label: 'Estado', value: cliente.estado },
                { label: 'Telefone', value: cliente.telefone || '—' },
                { label: 'E-mail', value: cliente.email || '—' },
                { label: 'Cadastrado em', value: new Date(cliente.criadoEm).toLocaleDateString('pt-BR') },
              ].map(d => (
                <div key={d.label} className="flex items-center justify-between px-4 py-2.5"
                  style={{ borderBottom: '1px solid #0f2240' }}>
                  <p className="text-xs" style={{ color: '#64748b' }}>{d.label}</p>
                  <p className="text-xs font-semibold" style={{ color: '#e2e8f0' }}>{d.value}</p>
                </div>
              ))}
              {cliente.observacoes && (
                <div className="px-4 py-3">
                  <p className="text-[10px] font-semibold mb-1" style={{ color: '#64748b' }}>Observações</p>
                  <p className="text-xs" style={{ color: '#94a3b8' }}>{cliente.observacoes}</p>
                </div>
              )}
            </PanelSection>
            <div className="p-4">
              <button onClick={apagarCliente}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded text-xs font-semibold"
                style={{ background: fazendas.length > 0 ? '#1a3a6b' : '#7f1d1d', color: fazendas.length > 0 ? '#475569' : '#fca5a5' }}>
                <Trash2 size={12} /> {fazendas.length > 0 ? `Exclusão bloqueada (${fazendas.length} fazenda${fazendas.length > 1 ? 's' : ''})` : 'Apagar cliente'}
              </button>
              {fazendas.length > 0 && <p className="text-[9px] text-center mt-1" style={{ color: '#475569' }}>Apague as fazendas primeiro para excluir o cliente.</p>}
            </div>
          </>
        ))}
      </div>
    </div>
  );
}
