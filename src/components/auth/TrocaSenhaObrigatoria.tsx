'use client';

// 1º acesso de um usuário convidado: ele entrou com a senha provisória e é
// obrigado a definir uma nova antes de usar o app (flag senhaProvisoria no
// inv_papeis, limpa ao concluir).

import { useState } from 'react';
import { trocarSenha, logout } from '@/lib/auth';
import { limparSenhaProvisoria } from '@/lib/empresa';
import { KeyRound, Loader2 } from 'lucide-react';

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;

export function TrocaSenhaObrigatoria({ email, onDone }: { email: string; onDone: () => void }) {
  const [s1, setS1] = useState('');
  const [s2, setS2] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro('');
    if (s1.length < 6) { setErro('A senha precisa ter ao menos 6 caracteres.'); return; }
    if (s1 !== s2) { setErro('As senhas não conferem.'); return; }
    setSalvando(true);
    try {
      await trocarSenha(s1);
      limparSenhaProvisoria();
      onDone();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setErro(code === 'auth/requires-recent-login'
        ? 'Sessão antiga — saia e entre de novo com a senha provisória para trocar.'
        : (code ?? 'Falha ao trocar a senha.'));
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ background: '#061525' }}>
      <div className="w-full max-w-sm space-y-3">
        <div className="text-center space-y-1">
          <KeyRound size={26} className="mx-auto" style={{ color: '#93c5fd' }} />
          <p className="text-base font-bold" style={{ color: '#e2e8f0' }}>Defina sua senha</p>
          <p className="text-xs" style={{ color: '#94a3b8' }}>
            Primeiro acesso de <strong style={{ color: '#cbd5e1' }}>{email}</strong>. Crie uma senha nova para continuar.
          </p>
        </div>
        <input type="password" value={s1} onChange={e => setS1(e.target.value)} placeholder="Nova senha (mín. 6)" disabled={salvando}
          className="w-full rounded px-3 py-2 text-sm outline-none" style={inputStyle} />
        <input type="password" value={s2} onChange={e => setS2(e.target.value)} placeholder="Confirmar senha" disabled={salvando}
          onKeyDown={e => { if (e.key === 'Enter') salvar(); }}
          className="w-full rounded px-3 py-2 text-sm outline-none" style={inputStyle} />
        {erro && <p className="text-[11px]" style={{ color: '#fca5a5' }}>{erro}</p>}
        <button onClick={salvar} disabled={salvando}
          className="w-full py-2 rounded text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: 'var(--invicta-green-dark)' }}>
          {salvando ? <><Loader2 size={14} className="animate-spin" /> Salvando…</> : 'Salvar e entrar'}
        </button>
        <button onClick={() => logout()} className="w-full py-1.5 rounded text-xs font-semibold"
          style={{ background: '#1a3a6b', color: '#93c5fd' }}>
          Sair
        </button>
      </div>
    </div>
  );
}
