'use client';

import { useEffect, useState } from 'react';
import {
  empresaAtiva, updateEmpresa, deleteEmpresa,
  getPapeis, definirPapelEmail, removerPapelEmail,
  ehOwner, ehAdmin, emailUsuario, type PapelMembro, type Empresa, type RegistroPapel,
} from '@/lib/empresa';
import { Building2, UserPlus, Trash2, AlertTriangle, Save, ShieldCheck } from 'lucide-react';

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;
// Fase U1: só Owner/Admin são atribuíveis; Agrônomo/Operador/Produtor entram na U2.
const PAPEIS_DISPONIVEIS: PapelMembro[] = ['owner', 'admin'];
const rotuloPapel: Record<string, string> = { owner: 'Owner', admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };

export function EmpresaConfig() {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [nomeEdit, setNomeEdit] = useState('');
  const [papeis, setPapeis] = useState<RegistroPapel[]>([]);
  const [emailNovo, setEmailNovo] = useState('');
  const [papelNovo, setPapelNovo] = useState<PapelMembro>('admin');
  const [aviso, setAviso] = useState('');

  function recarregar() {
    const e = empresaAtiva();
    setEmpresa(e);
    setNomeEdit(e?.nome ?? '');
    setPapeis(getPapeis());
  }
  useEffect(() => {
    recarregar();
    const onCh = () => recarregar();
    if (typeof window !== 'undefined') window.addEventListener('inv:empresa', onCh);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('inv:empresa', onCh); };
  }, []);

  const meuEmail = emailUsuario();
  const souOwner = ehOwner();
  const souAdmin = ehAdmin();

  function salvarNome() {
    if (!empresa || !nomeEdit.trim() || nomeEdit === empresa.nome) return;
    updateEmpresa(empresa.id, { nome: nomeEdit.trim() });
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('inv:empresa'));
  }

  function add() {
    setAviso('');
    if (!souOwner) { setAviso('Só o Owner pode atribuir papéis.'); return; }
    const e = emailNovo.trim().toLowerCase();
    if (!e || !e.includes('@')) { setAviso('Informe um e-mail válido.'); return; }
    definirPapelEmail(e, papelNovo);
    setEmailNovo('');
    recarregar();
  }

  function trocar(email: string, p: PapelMembro) {
    if (!souOwner) return;
    definirPapelEmail(email, p);
    recarregar();
  }

  function remover(email: string) {
    if (!souOwner) return;
    const owners = papeis.filter(x => x.papel === 'owner');
    if (owners.length === 1 && owners[0].email === email) { setAviso('Não dá para remover o único Owner.'); return; }
    if (!confirm(`Remover o acesso de ${email}?`)) return;
    removerPapelEmail(email);
    recarregar();
  }

  function excluirEmpresa() {
    if (!souAdmin || !empresa) return;
    if (!confirm(`Excluir a empresa "${empresa.nome}"? Os dados continuam no banco, mas você perde a referência por aqui.`)) return;
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

      {aviso && (
        <div className="p-2 rounded text-[10px] flex items-start gap-1.5" style={{ background: '#3a2300', color: '#fbbf24', border: '1px solid #92400e' }}>
          <AlertTriangle size={11} /> {aviso}
        </div>
      )}

      {/* Papéis de acesso (por e-mail) — só o Owner edita */}
      <div className="p-3 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
        <div className="flex items-center gap-1.5 mb-2 text-[10px] uppercase tracking-wider" style={{ color: '#475569' }}>
          <ShieldCheck size={12} /> Papéis de acesso
        </div>
        <p className="text-[9px] mb-2" style={{ color: '#64748b' }}>
          O acesso é por e-mail. Quem não estiver na lista fica bloqueado até um Owner liberar.
          (A conta de login é criada no Console do Firebase.)
        </p>

        {souOwner && (
          <div className="flex gap-2 mb-2">
            <input value={emailNovo} onChange={e => setEmailNovo(e.target.value)} placeholder="email@dominio.com"
              className="flex-1 rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
            <select value={papelNovo} onChange={e => setPapelNovo(e.target.value as PapelMembro)}
              className="rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>
              {PAPEIS_DISPONIVEIS.map(p => <option key={p} value={p}>{rotuloPapel[p]}</option>)}
            </select>
            <button onClick={add} className="px-3 py-1 rounded text-[10px] font-bold text-white flex items-center gap-1"
              style={{ background: 'var(--invicta-green-dark)' }}>
              <UserPlus size={11} /> Add
            </button>
          </div>
        )}

        <div className="space-y-1.5">
          {papeis.map(r => (
            <div key={r.id} className="flex items-center gap-2 p-1.5 rounded" style={{ background: '#0b1d3a' }}>
              <code className="flex-1 text-[10px] truncate" style={{ color: '#cbd5e1' }}>
                {r.email}{r.email === meuEmail && <span style={{ color: '#86efac' }}> (você)</span>}
              </code>
              <select value={r.papel} onChange={e => trocar(r.email, e.target.value as PapelMembro)} disabled={!souOwner}
                className="rounded px-1 py-0.5 text-[10px] outline-none" style={inputStyle}>
                {PAPEIS_DISPONIVEIS.map(p => <option key={p} value={p}>{rotuloPapel[p]}</option>)}
                {!PAPEIS_DISPONIVEIS.includes(r.papel) && <option value={r.papel}>{rotuloPapel[r.papel] ?? r.papel}</option>}
              </select>
              <button onClick={() => remover(r.email)} disabled={!souOwner}
                className="p-1 rounded" style={{ color: '#f87171', background: '#1a3a6b', opacity: souOwner ? 1 : 0.5 }}>
                <Trash2 size={10} />
              </button>
            </div>
          ))}
          {papeis.length === 0 && <p className="text-[10px]" style={{ color: '#64748b' }}>Nenhum papel atribuído ainda.</p>}
        </div>
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
