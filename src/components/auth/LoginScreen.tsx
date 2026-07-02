'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Loader2, LogIn } from 'lucide-react';
import { loginEmailSenha, mensagemErroLogin } from '@/lib/auth';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !senha) return;
    setErro(''); setCarregando(true);
    try {
      await loginEmailSenha(email, senha);
      // Sucesso: o AppProvider reage ao onAuthStateChanged e renderiza o app.
    } catch (err) {
      setErro(mensagemErroLogin(err));
      setCarregando(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center px-4" style={{ background: 'var(--invicta-blue-dark)' }}>
      <form onSubmit={entrar} className="w-full max-w-sm rounded-2xl p-8 space-y-5"
        style={{ background: 'var(--invicta-blue)', border: '1px solid #1a3a6b', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
        <div className="flex justify-center">
          <Image src="/images/logo-branca.png" alt="Invicta" width={150} height={46} style={{ objectFit: 'contain', width: 150, height: 'auto' }} priority />
        </div>
        <p className="text-center text-xs" style={{ color: '#93c5fd' }}>Plataforma Agronômica — acesso restrito</p>

        <div>
          <label className="text-[11px] font-semibold block mb-1" style={{ color: '#93c5fd' }}>E-mail</label>
          <input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="voce@invicta.agr.br" className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{ background: '#0a1929', color: '#e2e8f0', border: '1px solid #2e5fa3' }} />
        </div>
        <div>
          <label className="text-[11px] font-semibold block mb-1" style={{ color: '#93c5fd' }}>Senha</label>
          <input type="password" autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)}
            placeholder="••••••••" className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{ background: '#0a1929', color: '#e2e8f0', border: '1px solid #2e5fa3' }} />
        </div>

        {erro && <p className="text-[11px] text-center" style={{ color: '#f87171' }}>{erro}</p>}

        <button type="submit" disabled={carregando || !email.trim() || !senha}
          className="w-full py-2.5 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: 'var(--invicta-green-dark)' }}>
          {carregando ? <><Loader2 size={16} className="animate-spin" /> Entrando…</> : <><LogIn size={16} /> Entrar</>}
        </button>

        <p className="text-center text-[10px]" style={{ color: '#475569' }}>INVICTA AP · invictaap.com.br</p>
      </form>
    </div>
  );
}
