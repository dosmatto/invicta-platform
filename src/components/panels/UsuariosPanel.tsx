'use client';

// Gestão de usuários/papéis + permissões (Fases U1/U2). Acesso por E-MAIL
// (inv_papeis): quem está na lista entra com o papel dado; quem não está fica
// bloqueado. O Owner também configura, por papel, o que cada um pode fazer
// (inv_permissoes). As CONTAS de login são criadas no Console do Firebase
// (convite automático com senha provisória = Fase U3).

import { useEffect, useState } from 'react';
import {
  getPapeis, definirPapelEmail, removerPapelEmail,
  getPermissoes, definirPermissao,
  ehOwner, emailUsuario,
  CAPACIDADES, PAPEIS_ATRIBUIVEIS, ROTULO_PAPEL, ROTULO_CURTO,
  type PapelMembro, type RegistroPapel, type Capacidade,
} from '@/lib/empresa';
import { UserPlus, Trash2, AlertTriangle, ShieldCheck, SlidersHorizontal } from 'lucide-react';

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;
// Papéis cujas permissões o Owner edita (Owner é sempre tudo, não aparece aqui).
const PAPEIS_CONFIG: PapelMembro[] = ['admin', 'agronomo', 'operador'];

export function UsuariosPanel() {
  const [papeis, setPapeis] = useState<RegistroPapel[]>([]);
  const [perms, setPerms] = useState<Record<string, Record<string, boolean>>>({});
  const [emailNovo, setEmailNovo] = useState('');
  const [papelNovo, setPapelNovo] = useState<PapelMembro>('admin');
  const [aviso, setAviso] = useState('');

  function recarregar() { setPapeis(getPapeis()); setPerms(getPermissoes()); }
  useEffect(() => {
    recarregar();
    const onCh = () => recarregar();
    if (typeof window !== 'undefined') window.addEventListener('inv:empresa', onCh);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('inv:empresa', onCh); };
  }, []);

  const meuEmail = emailUsuario();
  const souOwner = ehOwner();

  function add() {
    setAviso('');
    if (!souOwner) { setAviso('Só o Owner pode atribuir papéis.'); return; }
    const e = emailNovo.trim().toLowerCase();
    if (!e || !e.includes('@')) { setAviso('Informe um e-mail válido.'); return; }
    if (papeis.some(p => p.email === e)) { setAviso('Esse e-mail já tem papel — edite na lista abaixo.'); return; }
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
    if (typeof window !== 'undefined' && !window.confirm(`Remover o acesso de ${email}?`)) return;
    removerPapelEmail(email);
    recarregar();
  }

  function togglePerm(papel: PapelMembro, cap: Capacidade) {
    if (!souOwner) return;
    definirPermissao(papel, cap, !perms[papel]?.[cap]);
    recarregar();
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-3 space-y-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider" style={{ color: '#475569' }}>
        <ShieldCheck size={12} /> Papéis de acesso
      </div>
      <p className="text-[10px]" style={{ color: '#64748b' }}>
        O acesso é por e-mail. Quem não estiver na lista fica bloqueado até um Owner liberar.
        A conta de login é criada no Console do Firebase (convite automático = em breve).
      </p>

      {aviso && (
        <div className="p-2 rounded text-[10px] flex items-start gap-1.5" style={{ background: '#3a2300', color: '#fbbf24', border: '1px solid #92400e' }}>
          <AlertTriangle size={11} /> {aviso}
        </div>
      )}

      {/* Novo usuário (e-mail + papel) — só Owner */}
      {souOwner ? (
        <div className="p-3 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
          <p className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: '#475569' }}>Novo usuário</p>
          <div className="flex gap-2">
            <input value={emailNovo} onChange={e => setEmailNovo(e.target.value)} placeholder="email@dominio.com"
              onKeyDown={e => { if (e.key === 'Enter') add(); }}
              className="flex-1 rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
            <select value={papelNovo} onChange={e => setPapelNovo(e.target.value as PapelMembro)}
              className="rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>
              {PAPEIS_ATRIBUIVEIS.map(p => <option key={p} value={p}>{ROTULO_PAPEL[p]}</option>)}
            </select>
            <button onClick={add} className="px-3 py-1 rounded text-[10px] font-bold text-white flex items-center gap-1"
              style={{ background: 'var(--invicta-green-dark)' }}>
              <UserPlus size={11} /> Add
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[10px]" style={{ color: '#64748b' }}>Só o Owner pode adicionar ou alterar papéis.</p>
      )}

      {/* Lista de usuários */}
      <div className="p-3 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
        <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: '#475569' }}>Usuários do sistema ({papeis.length})</p>
        <div className="space-y-1.5">
          {papeis.map(r => (
            <div key={r.id} className="flex items-center gap-2 p-1.5 rounded" style={{ background: '#0b1d3a' }}>
              <code className="flex-1 text-[10px] truncate" style={{ color: '#cbd5e1' }}>
                {r.email}{r.email === meuEmail && <span style={{ color: '#86efac' }}> (você)</span>}
              </code>
              <select value={r.papel} onChange={e => trocar(r.email, e.target.value as PapelMembro)} disabled={!souOwner}
                className="rounded px-1 py-0.5 text-[10px] outline-none" style={inputStyle}>
                {PAPEIS_ATRIBUIVEIS.map(p => <option key={p} value={p}>{ROTULO_PAPEL[p]}</option>)}
                {!PAPEIS_ATRIBUIVEIS.includes(r.papel) && <option value={r.papel}>{ROTULO_PAPEL[r.papel] ?? r.papel}</option>}
              </select>
              <button onClick={() => remover(r.email)} disabled={!souOwner}
                className="p-1 rounded" style={{ color: '#f87171', background: '#1a3a6b', opacity: souOwner ? 1 : 0.5 }}>
                <Trash2 size={10} />
              </button>
            </div>
          ))}
          {papeis.length === 0 && <p className="text-[10px]" style={{ color: '#64748b' }}>Nenhum usuário com papel ainda.</p>}
        </div>
      </div>

      {/* Permissões por papel (matriz) — só Owner edita */}
      {souOwner && (
        <div className="p-3 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
          <div className="flex items-center gap-1.5 mb-1 text-[10px] uppercase tracking-wider" style={{ color: '#475569' }}>
            <SlidersHorizontal size={12} /> Permissões por papel
          </div>
          <p className="text-[9px] mb-2" style={{ color: '#64748b' }}>Owner tem tudo. Marque o que cada papel pode fazer.</p>
          <table className="w-full text-[10px]" style={{ color: '#cbd5e1', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th className="text-left font-semibold pb-1" style={{ color: '#64748b' }}>Capacidade</th>
                {PAPEIS_CONFIG.map(p => (
                  <th key={p} className="pb-1 font-semibold text-center" style={{ color: '#93c5fd', width: 44 }} title={ROTULO_PAPEL[p]}>{ROTULO_CURTO[p]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPACIDADES.map(c => (
                <tr key={c.id} style={{ borderTop: '1px solid #0f2240' }}>
                  <td className="py-1.5 pr-1 leading-tight" title={c.label}>{c.curto}</td>
                  {PAPEIS_CONFIG.map(p => (
                    <td key={p} className="text-center">
                      <input type="checkbox" checked={!!perms[p]?.[c.id]} onChange={() => togglePerm(p, c.id)}
                        className="accent-green-600 cursor-pointer" style={{ width: 15, height: 15 }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
