'use client';

import { useState, useEffect, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { getClientes, saveCliente, Cliente } from '@/lib/store';
import { Plus, Search, ChevronRight, X, Save, Users } from 'lucide-react';

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
  const letraRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [form, setForm] = useState({
    nome: '', sigla: '', tipoPessoa: 'PF' as 'PF' | 'PJ',
    documento: '', telefone: '', email: '',
    cidade: '', estado: 'PR', observacoes: '',
  });

  useEffect(() => { setClientes(getClientes()); }, []);

  function reload() { setClientes(getClientes()); }

  function abrirCliente(c: Cliente) {
    setNav({ produtorId: c.id, produtor: c.nome, fazendaId: null, fazenda: '', talhaoId: null, talhao: '', area: 0 });
    setActivePanel(`produtor-${c.id}`);
  }

  function handleSave() {
    if (!form.nome.trim()) return;
    setSalvando(true);
    setTimeout(() => {
      saveCliente(form);
      reload();
      setForm({ nome: '', sigla: '', tipoPessoa: 'PF', documento: '', telefone: '', email: '', cidade: '', estado: 'PR', observacoes: '' });
      setMostraForm(false);
      setSalvando(false);
    }, 300);
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
          <button onClick={() => setMostraForm(f => !f)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white flex-shrink-0"
            style={{ background: mostraForm ? '#374151' : 'var(--invicta-green-dark)' }}>
            {mostraForm ? <X size={12} /> : <Plus size={12} />}
            {mostraForm ? 'Cancelar' : 'Novo'}
          </button>
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
            Novo Cliente
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
            {salvando ? 'Salvando...' : 'Salvar Cliente'}
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
                  <button key={c.id} onClick={() => abrirCliente(c)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                    style={{ borderBottom: '1px solid #0f2240' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-item-hover)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
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
                    <ChevronRight size={14} style={{ color: '#64748b' }} />
                  </button>
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
    </div>
  );
}
