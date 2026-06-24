'use client';

import { useState, useEffect, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { getClientes, saveCliente, updateCliente, excluirProdutorCascata, Cliente } from '@/lib/store';
import { pode } from '@/lib/empresa';
import { cloudExcluirMapasPorPrefixo, cloudExcluirPorPrefixo } from '@/lib/cloud';
import { Plus, Search, ChevronRight, X, Save, Users, Pencil, Trash2, AlertTriangle } from 'lucide-react';

const FORM_VAZIO = {
  nome: '', sigla: '', tipoPessoa: 'PF' as 'PF' | 'PJ',
  documento: '', telefone: '', email: '',
  cidade: '', estado: 'PR', observacoes: '',
};

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const ESTADOS_BR = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
  'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC',
  'SP','SE','TO',
];

export function ProdutoresPanel() {
  const { setActivePanel, setNav } = useApp();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busca, setBusca] = useState('');
  const [letraAtiva, setLetraAtiva] = useState<string | null>(null);
  const [mostraForm, setMostraForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [alvoExcluir, setAlvoExcluir] = useState<Cliente | null>(null);
  const [txtConfirma, setTxtConfirma] = useState('');
  const [excluindo, setExcluindo] = useState(false);
  const letraRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const podeCadastro = pode('cadastro');
  const podeExcluir = pode('excluirProdutor');

  const [form, setForm] = useState({ ...FORM_VAZIO });

  useEffect(() => { setClientes(getClientes()); }, []);

  function reload() { setClientes(getClientes()); }

  function abrirCliente(c: Cliente) {
    setNav({ produtorId: c.id, produtor: c.nome, fazendaId: null, fazenda: '', talhaoId: null, talhao: '', area: 0 });
    setActivePanel(`produtor-${c.id}`);
  }

  function abrirNovo() { setEditId(null); setForm({ ...FORM_VAZIO }); setMostraForm(true); }
  function cancelarForm() { setMostraForm(false); setEditId(null); setForm({ ...FORM_VAZIO }); }

  function abrirEdicao(c: Cliente) {
    setForm({
      nome: c.nome, sigla: c.sigla ?? '', tipoPessoa: c.tipoPessoa,
      documento: c.documento, telefone: c.telefone, email: c.email,
      cidade: c.cidade, estado: c.estado, observacoes: c.observacoes ?? '',
    });
    setEditId(c.id);
    setMostraForm(true);
  }

  function handleSave() {
    if (!form.nome.trim()) return;
    setSalvando(true);
    setTimeout(() => {
      if (editId) updateCliente(editId, form); else saveCliente(form);
      reload();
      cancelarForm();
      setSalvando(false);
    }, 300);
  }

  // Exclusão (admin): apaga o produtor e tudo dele (cascata local + nuvem).
  async function confirmarExclusao() {
    if (!alvoExcluir || txtConfirma.trim().toUpperCase() !== 'APAGAR') return;
    setExcluindo(true);
    const { talhaoIds } = excluirProdutorCascata(alvoExcluir.id);
    for (const tid of talhaoIds) {
      await cloudExcluirMapasPorPrefixo(`${tid}__`);
      await cloudExcluirPorPrefixo('inv_cenarios', `cen_${tid}_`);
    }
    setExcluindo(false);
    setAlvoExcluir(null); setTxtConfirma('');
    reload();
  }

  function scrollToLetra(letra: string) {
    setLetraAtiva(letra);
    setBusca('');
    const el = letraRefs.current[letra];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Filtra e agrupa
  const filtrados = clientes.filter(c =>
    c.nome.toLowerCase().includes(busca.toLowerCase()) ||
    c.documento.includes(busca)
  );

  const porLetra: Record<string, Cliente[]> = {};
  filtrados.forEach(c => {
    const l = c.nome.charAt(0).toUpperCase();
    if (!porLetra[l]) porLetra[l] = [];
    porLetra[l].push(c);
  });
  const letrasComDados = Object.keys(porLetra).sort();

  const inp = (label: string, key: keyof typeof form, type = 'text', placeholder = '') => (
    <div>
      <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>{label}</label>
      <input type={type} value={form[key] as string} placeholder={placeholder}
        onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        className="w-full rounded px-3 py-2 text-xs outline-none"
        style={{ background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' }} />
    </div>
  );

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex-shrink-0 p-3 space-y-2" style={{ borderBottom: '1px solid #1a3a6b' }}>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 flex-1 px-2 py-1.5 rounded-lg text-xs"
            style={{ background: '#1a3a6b', color: '#64748b' }}>
            <Search size={12} />
            <input value={busca} onChange={e => { setBusca(e.target.value); setLetraAtiva(null); }}
              placeholder="Buscar cliente..."
              className="bg-transparent flex-1 outline-none text-xs"
              style={{ color: '#e2e8f0' }} />
            {busca && <button onClick={() => setBusca('')}><X size={11} /></button>}
          </div>
          {podeCadastro && (
            <button onClick={() => mostraForm ? cancelarForm() : abrirNovo()}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white flex-shrink-0"
              style={{ background: mostraForm ? '#374151' : 'var(--invicta-green-dark)' }}>
              {mostraForm ? <X size={12} /> : <Plus size={12} />}
              {mostraForm ? 'Cancelar' : 'Novo'}
            </button>
          )}
        </div>

        {/* Índice A-Z */}
        {!busca && !mostraForm && (
          <div className="flex flex-wrap gap-0.5">
            {LETRAS.map(l => {
              const temDados = !!porLetra[l];
              const ativa = letraAtiva === l;
              return (
                <button key={l} onClick={() => temDados && scrollToLetra(l)}
                  disabled={!temDados}
                  className="w-5 h-5 rounded text-[9px] font-bold transition-colors"
                  style={{
                    background: ativa ? 'var(--invicta-blue-mid)' : temDados ? '#1a3a6b' : 'transparent',
                    color: ativa ? '#fff' : temDados ? '#93c5fd' : '#2e3f5c',
                    cursor: temDados ? 'pointer' : 'default',
                  }}>
                  {l}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Formulário de novo cliente */}
      {mostraForm && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#93c5fd' }}>
            {editId ? 'Editar Cliente' : 'Novo Cliente'}
          </p>

          {/* Tipo de pessoa */}
          <div className="flex gap-2">
            {(['PF', 'PJ'] as const).map(t => (
              <button key={t} onClick={() => setForm(p => ({ ...p, tipoPessoa: t }))}
                className="flex-1 py-2 rounded text-xs font-bold transition-colors"
                style={{
                  background: form.tipoPessoa === t ? 'var(--invicta-blue-mid)' : '#1a3a6b',
                  color: '#fff',
                }}>
                {t === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}
              </button>
            ))}
          </div>

          {inp('Nome completo / Razão Social *', 'nome', 'text', form.tipoPessoa === 'PF' ? 'João da Silva' : 'Empresa Ltda')}
          {inp('Sigla (opcional)', 'sigla', 'text', 'Ex: JDS')}
          {inp(form.tipoPessoa === 'PF' ? 'CPF' : 'CNPJ', 'documento', 'text', form.tipoPessoa === 'PF' ? '000.000.000-00' : '00.000.000/0001-00')}
          {inp('Telefone / WhatsApp', 'telefone', 'tel', '(00) 00000-0000')}
          {inp('E-mail', 'email', 'email', 'email@dominio.com')}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Município</label>
              <input value={form.cidade} placeholder="Cidade"
                onChange={e => setForm(p => ({ ...p, cidade: e.target.value }))}
                className="w-full rounded px-3 py-2 text-xs outline-none"
                style={{ background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' }} />
            </div>
            <div>
              <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Estado</label>
              <select value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value }))}
                className="w-full rounded px-3 py-2 text-xs outline-none"
                style={{ background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' }}>
                {ESTADOS_BR.map(uf => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Observações</label>
            <textarea value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}
              rows={2} placeholder="Notas opcionais..."
              className="w-full rounded px-3 py-2 text-xs outline-none resize-none"
              style={{ background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' }} />
          </div>

          <button onClick={handleSave} disabled={!form.nome.trim() || salvando}
            className="w-full py-2.5 rounded text-sm font-bold text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-40"
            style={{ background: 'var(--invicta-green-dark)' }}>
            <Save size={14} />
            {salvando ? 'Salvando...' : editId ? 'Salvar alterações' : 'Salvar Cliente'}
          </button>
        </div>
      )}

      {/* Lista de clientes */}
      {!mostraForm && (
        <div className="flex-1 overflow-y-auto">
          {filtrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-12 px-6 text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: '#1a3a6b' }}>
                <Users size={28} style={{ color: '#2e5fa3' }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: '#94a3b8' }}>
                  {busca ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
                </p>
                <p className="text-xs mt-1" style={{ color: '#475569' }}>
                  {busca ? 'Tente outro termo' : 'Clique em "+ Novo" para começar'}
                </p>
              </div>
            </div>
          ) : (
            letrasComDados.map(letra => (
              <div key={letra} ref={el => { letraRefs.current[letra] = el; }}>
                {/* Separador de letra */}
                <div className="px-4 py-1.5 sticky top-0 z-10"
                  style={{ background: '#0a1929', borderBottom: '1px solid #1a3a6b' }}>
                  <span className="text-xs font-black" style={{ color: 'var(--invicta-blue-mid)' }}>{letra}</span>
                </div>
                {porLetra[letra].map(c => (
                  <div key={c.id}
                    className="w-full flex items-center gap-1 pr-2 transition-colors"
                    style={{ borderBottom: '1px solid #0f2240' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-item-hover)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                    <button onClick={() => abrirCliente(c)} className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                        style={{ background: 'var(--invicta-blue-mid)', color: '#fff' }}>
                        {c.nome.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: '#e2e8f0' }}>{c.nome}</p>
                        <p className="text-[10px] truncate" style={{ color: '#64748b' }}>
                          {c.sigla ? `${c.sigla} · ` : ''}{c.tipoPessoa} · {c.cidade} · {c.estado}
                        </p>
                      </div>
                    </button>
                    {podeCadastro && (
                      <button onClick={() => abrirEdicao(c)} title="Editar cliente"
                        className="p-1.5 rounded flex-shrink-0" style={{ color: '#93c5fd' }}>
                        <Pencil size={13} />
                      </button>
                    )}
                    {podeExcluir && (
                      <button onClick={() => { setAlvoExcluir(c); setTxtConfirma(''); }} title="Excluir cliente"
                        className="p-1.5 rounded flex-shrink-0" style={{ color: '#f87171' }}>
                        <Trash2 size={13} />
                      </button>
                    )}
                    <ChevronRight size={14} style={{ color: '#64748b' }} className="flex-shrink-0" />
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {/* Contador */}
      {!mostraForm && clientes.length > 0 && (
        <div className="flex-shrink-0 px-4 py-2 text-center text-[10px]"
          style={{ color: '#475569', borderTop: '1px solid #1a3a6b' }}>
          {clientes.length} cliente{clientes.length !== 1 ? 's' : ''} cadastrado{clientes.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* Modal de exclusão (admin): exige digitar APAGAR */}
      {alvoExcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => { if (!excluindo) { setAlvoExcluir(null); setTxtConfirma(''); } }}>
          <div className="w-full max-w-sm rounded-xl p-4 space-y-3" style={{ background: '#0a1929', border: '1px solid #7f1d1d' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-2">
              <AlertTriangle size={18} style={{ color: '#f87171' }} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold" style={{ color: '#fecaca' }}>Excluir produtor</p>
                <p className="text-[11px] mt-1" style={{ color: '#94a3b8' }}>
                  Isto apaga <strong style={{ color: '#e2e8f0' }}>{alvoExcluir.nome}</strong> e <strong>tudo</strong> ligado a ele
                  (fazendas, talhões, análises, grades, mapas e cenários). <strong style={{ color: '#fca5a5' }}>Não dá para desfazer.</strong>
                </p>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>
                Para confirmar, digite <span style={{ color: '#fca5a5', fontWeight: 700 }}>APAGAR</span>
              </label>
              <input autoFocus value={txtConfirma} onChange={e => setTxtConfirma(e.target.value)}
                placeholder="APAGAR" disabled={excluindo}
                onKeyDown={e => { if (e.key === 'Enter') confirmarExclusao(); }}
                className="w-full rounded px-3 py-2 text-xs outline-none"
                style={{ background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' }} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setAlvoExcluir(null); setTxtConfirma(''); }} disabled={excluindo}
                className="flex-1 py-2 rounded text-xs font-semibold" style={{ background: '#1a3a6b', color: '#cbd5e1' }}>
                Cancelar
              </button>
              <button onClick={confirmarExclusao} disabled={excluindo || txtConfirma.trim().toUpperCase() !== 'APAGAR'}
                className="flex-1 py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
                style={{ background: '#b91c1c' }}>
                <Trash2 size={13} /> {excluindo ? 'Apagando…' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
