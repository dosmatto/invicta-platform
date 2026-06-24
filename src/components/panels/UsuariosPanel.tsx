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
  getPlanos, salvarPlano, atualizarPlano, excluirPlano, toggleSecaoPlano, SECOES_PORTAL,
  ehOwner, emailUsuario,
  CAPACIDADES, PAPEIS_ATRIBUIVEIS, ROTULO_PAPEL, ROTULO_CURTO,
  type PapelMembro, type RegistroPapel, type Capacidade, type PlanoAssinatura, type SecaoPortal,
} from '@/lib/empresa';
import { getClientes, type Cliente } from '@/lib/store';
import { criarUsuarioConvite } from '@/lib/firebase';
import { UserPlus, Trash2, AlertTriangle, ShieldCheck, SlidersHorizontal, Copy, Loader2, KeyRound, CreditCard, Plus } from 'lucide-react';

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;
// Papéis cujas permissões o Owner edita (Owner é sempre tudo, não aparece aqui).
const PAPEIS_CONFIG: PapelMembro[] = ['admin', 'agronomo', 'operador'];
// Senha provisória simples (≥6 chars; letras+dígitos). Ex.: Inv54321
const gerarSenhaProvisoria = () => 'Inv' + Math.floor(10000 + Math.random() * 90000);

export function UsuariosPanel() {
  const [papeis, setPapeis] = useState<RegistroPapel[]>([]);
  const [perms, setPerms] = useState<Record<string, Record<string, boolean>>>({});
  const [emailNovo, setEmailNovo] = useState('');
  const [papelNovo, setPapelNovo] = useState<PapelMembro>('admin');
  const [aviso, setAviso] = useState('');
  const [convidando, setConvidando] = useState(false);
  const [convite, setConvite] = useState<{ email: string; senha?: string; msg: string } | null>(null);
  const [clienteNovo, setClienteNovo] = useState('');
  const [planoNovo, setPlanoNovo] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [planos, setPlanos] = useState<PlanoAssinatura[]>([]);

  function recarregar() { setPapeis(getPapeis()); setPerms(getPermissoes()); setClientes(getClientes()); setPlanos(getPlanos()); }
  useEffect(() => {
    recarregar();
    const onCh = () => recarregar();
    if (typeof window !== 'undefined') window.addEventListener('inv:empresa', onCh);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('inv:empresa', onCh); };
  }, []);

  const meuEmail = emailUsuario();
  const souOwner = ehOwner();

  async function add() {
    setAviso(''); setConvite(null);
    if (!souOwner) { setAviso('Só o Owner pode atribuir papéis.'); return; }
    const e = emailNovo.trim().toLowerCase();
    if (!e || !e.includes('@')) { setAviso('Informe um e-mail válido.'); return; }
    if (papeis.some(p => p.email === e)) { setAviso('Esse e-mail já tem papel — edite na lista abaixo.'); return; }
    if (papelNovo === 'produtor' && !clienteNovo) { setAviso('Escolha qual Cliente é esse produtor.'); return; }
    const extraProd = papelNovo === 'produtor' ? { clienteId: clienteNovo, planoId: planoNovo || planos[0]?.id } : {};
    setConvidando(true);
    const senha = gerarSenhaProvisoria();
    const r = await criarUsuarioConvite(e, senha);
    if (r.ok) {
      definirPapelEmail(e, papelNovo, { senhaProvisoria: true, ...extraProd }); // papel + troca no 1º acesso
      setConvite({ email: e, senha, msg: 'Conta criada. Passe a senha provisória ao usuário — ele troca no 1º acesso.' });
    } else if (r.jaExiste) {
      definirPapelEmail(e, papelNovo, extraProd); // conta já existe: só atribui o papel
      setConvite({ email: e, msg: 'A conta de login já existia — papel atribuído. (Sem senha provisória; redefina no Console do Firebase se precisar.)' });
    } else {
      setAviso('Falha ao convidar: ' + (r.erro ?? '') + '. O papel NÃO foi atribuído.');
      setConvidando(false);
      return;
    }
    setEmailNovo('');
    setConvidando(false);
    recarregar();
  }

  function copiar(txt: string) {
    if (typeof navigator !== 'undefined') navigator.clipboard?.writeText(txt).catch(() => {});
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
          <p className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: '#475569' }}>Convidar usuário</p>
          <div className="flex gap-2">
            <input value={emailNovo} onChange={e => setEmailNovo(e.target.value)} placeholder="email@dominio.com" disabled={convidando}
              onKeyDown={e => { if (e.key === 'Enter') add(); }}
              className="flex-1 rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
            <select value={papelNovo} onChange={e => setPapelNovo(e.target.value as PapelMembro)} disabled={convidando}
              className="rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>
              {PAPEIS_ATRIBUIVEIS.map(p => <option key={p} value={p}>{ROTULO_PAPEL[p]}</option>)}
            </select>
            <button onClick={add} disabled={convidando} className="px-3 py-1 rounded text-[10px] font-bold text-white flex items-center gap-1 disabled:opacity-50"
              style={{ background: 'var(--invicta-green-dark)' }}>
              {convidando ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />} Convidar
            </button>
          </div>

          {/* Produtor: escolher Cliente + Plano (controla as seções do portal) */}
          {papelNovo === 'produtor' && (
            <div className="flex gap-2 mt-2">
              <select value={clienteNovo} onChange={e => setClienteNovo(e.target.value)} disabled={convidando}
                className="flex-1 rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle}>
                <option value="">Qual cliente?…</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <select value={planoNovo} onChange={e => setPlanoNovo(e.target.value)} disabled={convidando}
                className="rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle}>
                {planos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
          )}

          <p className="text-[9px] mt-1" style={{ color: '#64748b' }}>Cria a conta de login e gera uma senha provisória pra você passar. Ele troca no 1º acesso.</p>

          {convite && (
            <div className="mt-2 p-2 rounded" style={{ background: '#0f2a1a', border: '1px solid #166534' }}>
              <p className="text-[10px] mb-1" style={{ color: '#86efac' }}>{convite.msg}</p>
              <p className="text-[10px]" style={{ color: '#cbd5e1' }}><strong>{convite.email}</strong></p>
              {convite.senha && (
                <div className="flex items-center gap-2 mt-1">
                  <KeyRound size={12} style={{ color: '#fbbf24' }} />
                  <code className="flex-1 text-[12px] font-bold" style={{ color: '#fde68a' }}>{convite.senha}</code>
                  <button onClick={() => copiar(`${convite.email} / ${convite.senha}`)} title="Copiar e-mail + senha"
                    className="p-1 rounded text-[10px] flex items-center gap-1" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                    <Copy size={11} /> Copiar
                  </button>
                </div>
              )}
            </div>
          )}
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

      {/* Planos de assinatura do Produtor (matriz seção × plano) — só Owner */}
      {souOwner && (
        <div className="p-3 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider" style={{ color: '#475569' }}>
              <CreditCard size={12} /> Planos de assinatura (produtor)
            </div>
            <button onClick={() => { salvarPlano({ nome: 'Novo plano' }); recarregar(); }}
              className="text-[10px] font-bold flex items-center gap-1" style={{ color: '#4ade80' }}>
              <Plus size={11} /> Plano
            </button>
          </div>
          <p className="text-[9px] mb-2" style={{ color: '#64748b' }}>Cada plano libera seções do portal do produtor. Renomeie e marque as seções.</p>
          {planos.length === 0 ? (
            <p className="text-[10px]" style={{ color: '#64748b' }}>Nenhum plano. Use <em>+ Plano</em>.</p>
          ) : (
            <table className="w-full text-[10px]" style={{ color: '#cbd5e1', tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th className="text-left font-semibold pb-1" style={{ color: '#64748b' }}>Seção</th>
                  {planos.map(p => (
                    <th key={p.id} className="pb-1" style={{ width: 60 }}>
                      <input value={p.nome} onChange={e => { atualizarPlano(p.id, { nome: e.target.value }); setPlanos(getPlanos()); }}
                        className="w-full rounded px-1 py-0.5 text-[9px] font-bold text-center outline-none" style={inputStyle} />
                      <button onClick={() => { if (confirm(`Excluir o plano "${p.nome}"?`)) { excluirPlano(p.id); recarregar(); } }}
                        title="Excluir plano" className="mt-0.5" style={{ color: '#f87171' }}><Trash2 size={10} /></button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SECOES_PORTAL.map(s => (
                  <tr key={s.id} style={{ borderTop: '1px solid #0f2240' }}>
                    <td className="py-1.5 pr-1 leading-tight">{s.label}</td>
                    {planos.map(p => (
                      <td key={p.id} className="text-center">
                        <input type="checkbox" checked={!!p.secoes?.[s.id]}
                          onChange={() => { toggleSecaoPlano(p.id, s.id as SecaoPortal, !p.secoes?.[s.id]); setPlanos(getPlanos()); }}
                          className="accent-green-600 cursor-pointer" style={{ width: 14, height: 14 }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
