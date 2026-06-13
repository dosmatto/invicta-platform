'use client';

import { useEffect, useState } from 'react';
import {
  empresaAtiva, updateEmpresa, deleteEmpresa,
  adicionarMembro, trocarPapelMembro, removerMembro,
  uidUsuario, ehAdmin, type PapelMembro, type Empresa,
} from '@/lib/empresa';
import { Building2, UserPlus, Trash2, Copy, AlertTriangle, Save } from 'lucide-react';

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;

export function EmpresaConfig() {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [nomeEdit, setNomeEdit] = useState('');
  const [uidNovo, setUidNovo] = useState('');
  const [papelNovo, setPapelNovo] = useState<PapelMembro>('editor');
  const [aviso, setAviso] = useState('');

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

  if (!empresa) {
    return <div className="px-4 py-4 text-[11px]" style={{ color: '#fbbf24' }}>Nenhuma empresa ativa.</div>;
  }

  const meuUid = uidUsuario();
  const souAdmin = ehAdmin(empresa);

  function salvarNome() {
    if (!nomeEdit.trim() || nomeEdit === empresa!.nome) return;
    updateEmpresa(empresa!.id, { nome: nomeEdit.trim() });
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('inv:empresa'));
  }

  function add() {
    setAviso('');
    if (!souAdmin) { setAviso('Só admin pode adicionar membros.'); return; }
    if (!uidNovo.trim()) { setAviso('Cole o UID do colega.'); return; }
    if (empresa!.membros[uidNovo.trim()]) { setAviso('Esse UID já é membro.'); return; }
    adicionarMembro(empresa!.id, uidNovo.trim(), papelNovo);
    setUidNovo('');
    recarregar();
  }

  function trocarPapel(uid: string, p: PapelMembro) {
    if (!souAdmin) return;
    trocarPapelMembro(empresa!.id, uid, p);
    recarregar();
  }

  function remover(uid: string) {
    if (!souAdmin) return;
    if (uid === meuUid && !confirm('Você está removendo a si mesmo desta empresa. Continuar?')) return;
    removerMembro(empresa!.id, uid);
    recarregar();
  }

  function excluir() {
    if (!souAdmin) return;
    if (!confirm(`Excluir a empresa "${empresa!.nome}"? Os dados continuam no banco, mas você perde acesso por aqui.`)) return;
    deleteEmpresa(empresa!.id);
    if (typeof window !== 'undefined') setTimeout(() => window.location.reload(), 50);
  }

  function copiarMeuUid() {
    if (typeof navigator === 'undefined') return;
    navigator.clipboard?.writeText(meuUid).catch(() => {});
    setAviso('Seu UID foi copiado.');
  }

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Identidade da empresa */}
      <div className="p-3 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
        <div className="flex items-center gap-1.5 mb-2 text-[10px] uppercase tracking-wider" style={{ color: '#475569' }}>
          <Building2 size={12} /> Empresa
        </div>
        <input value={nomeEdit} onChange={e => setNomeEdit(e.target.value)} className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
        <button onClick={salvarNome} disabled={!souAdmin || nomeEdit === empresa.nome}
          className="mt-2 w-full py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1"
          style={{ background: souAdmin ? 'var(--invicta-blue)' : '#1a3a6b', opacity: souAdmin ? 1 : 0.5 }}>
          <Save size={11} /> Salvar nome
        </button>
        <p className="text-[9px] mt-1.5" style={{ color: '#64748b' }}>ID interno: {empresa.id}</p>
      </div>

      {/* Meu UID — pra compartilhar com outros usuários */}
      <div className="p-3 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
        <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#475569' }}>Meu UID (compartilhe com colegas)</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-[10px] truncate" style={{ color: '#cbd5e1' }}>{meuUid}</code>
          <button onClick={copiarMeuUid} className="p-1.5 rounded text-[10px]" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
            <Copy size={11} />
          </button>
        </div>
      </div>

      {aviso && (
        <div className="p-2 rounded text-[10px] flex items-start gap-1.5" style={{ background: '#3a2300', color: '#fbbf24', border: '1px solid #92400e' }}>
          <AlertTriangle size={11} /> {aviso}
        </div>
      )}

      {/* Adicionar membro */}
      <div className="p-3 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
        <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#475569' }}>Adicionar membro</p>
        <input value={uidNovo} onChange={e => setUidNovo(e.target.value)} placeholder="Cole o UID Firebase do colega"
          className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle} disabled={!souAdmin} />
        <div className="flex gap-2 mt-2">
          <select value={papelNovo} onChange={e => setPapelNovo(e.target.value as PapelMembro)}
            className="flex-1 rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} disabled={!souAdmin}>
            <option value="admin">Admin</option>
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
          <button onClick={add} disabled={!souAdmin || !uidNovo.trim()}
            className="px-3 py-1 rounded text-[10px] font-bold text-white flex items-center gap-1"
            style={{ background: souAdmin && uidNovo.trim() ? 'var(--invicta-green-dark)' : '#1a3a6b', opacity: souAdmin && uidNovo.trim() ? 1 : 0.5 }}>
            <UserPlus size={11} /> Adicionar
          </button>
        </div>
      </div>

      {/* Membros */}
      <div className="p-3 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
        <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#475569' }}>Membros ({Object.keys(empresa.membros).length})</p>
        <div className="space-y-1.5">
          {Object.entries(empresa.membros).map(([uid, papel]) => (
            <div key={uid} className="flex items-center gap-2 p-1.5 rounded" style={{ background: '#0b1d3a' }}>
              <code className="flex-1 text-[10px] truncate" style={{ color: '#cbd5e1' }}>
                {uid}{uid === meuUid && <span style={{ color: '#86efac' }}> (você)</span>}
              </code>
              <select value={papel} onChange={e => trocarPapel(uid, e.target.value as PapelMembro)} disabled={!souAdmin}
                className="rounded px-1 py-0.5 text-[10px] outline-none" style={inputStyle}>
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <button onClick={() => remover(uid)} disabled={!souAdmin} className="p-1 rounded" style={{ color: '#f87171', background: '#1a3a6b', opacity: souAdmin ? 1 : 0.5 }}>
                <Trash2 size={10} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Zona de perigo */}
      {souAdmin && (
        <div className="p-3 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
          <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#fbbf24' }}>Zona de perigo</p>
          <button onClick={excluir} className="w-full py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1"
            style={{ background: '#7f1d1d', color: '#fecaca' }}>
            <Trash2 size={11} /> Excluir esta empresa
          </button>
        </div>
      )}
    </div>
  );
}
