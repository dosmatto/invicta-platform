'use client';

import { useEffect, useState } from 'react';
import { empresaAtiva, updateEmpresa, deleteEmpresa, ehAdmin, type Empresa } from '@/lib/empresa';
import { Building2, Trash2, Save, ShieldCheck } from 'lucide-react';

import { inputStyle } from '@/constants/ui';

export function EmpresaConfig() {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [nomeEdit, setNomeEdit] = useState('');

  function recarregar() {
    const e = empresaAtiva();
    setEmpresa(e);
    setNomeEdit(e?.nome ?? '');
  }
  useEffect(() => {
    recarregar();
    const onCh = () => recarregar();
    if (typeof window !== 'undefined') window.addEventListener('inv:empresa', onCh);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('inv:empresa', onCh); };
  }, []);

  const souAdmin = ehAdmin();

  function salvarNome() {
    if (!empresa || !nomeEdit.trim() || nomeEdit === empresa.nome) return;
    updateEmpresa(empresa.id, { nome: nomeEdit.trim() });
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('inv:empresa'));
  }

  function excluirEmpresa() {
    if (!souAdmin || !empresa) return;
    if (typeof window !== 'undefined' && !window.confirm(`Excluir a empresa "${empresa.nome}"? Os dados continuam no banco, mas você perde a referência por aqui.`)) return;
    deleteEmpresa(empresa.id);
    if (typeof window !== 'undefined') setTimeout(() => window.location.reload(), 50);
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-3 space-y-3">
      {/* Empresa (single-tenant — cosmético) */}
      <div className="p-3 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
        <div className="flex items-center gap-1.5 mb-2 text-[10px] uppercase tracking-wider" style={{ color: '#475569' }}>
          <Building2 size={12} /> Empresa
        </div>
        <input value={nomeEdit} onChange={e => setNomeEdit(e.target.value)} disabled={!souAdmin}
          className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
        <button onClick={salvarNome} disabled={!souAdmin || nomeEdit === empresa?.nome}
          className="mt-2 w-full py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1"
          style={{ background: souAdmin ? 'var(--invicta-blue-mid)' : '#1a3a6b', opacity: souAdmin ? 1 : 0.5 }}>
          <Save size={11} /> Salvar nome
        </button>
      </div>

      {/* Aponta a gestão de usuários para o painel próprio */}
      <div className="p-3 rounded-lg flex items-start gap-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
        <ShieldCheck size={13} style={{ color: '#93c5fd' }} className="flex-shrink-0 mt-0.5" />
        <p className="text-[10px]" style={{ color: '#94a3b8' }}>
          Usuários e papéis de acesso agora ficam na aba <strong style={{ color: '#cbd5e1' }}>Usuários</strong> (menu lateral).
        </p>
      </div>

      {/* Zona de perigo */}
      {souAdmin && (
        <div className="p-3 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
          <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#fbbf24' }}>Zona de perigo</p>
          <button onClick={excluirEmpresa} className="w-full py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1"
            style={{ background: '#7f1d1d', color: '#fecaca' }}>
            <Trash2 size={11} /> Excluir esta empresa
          </button>
        </div>
      )}
    </div>
  );
}
