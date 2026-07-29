'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Loader2, LogIn, MailCheck, AlertTriangle, Send } from 'lucide-react';
import { loginEmailSenha, loginOffline, mensagemErroLogin, reenviarConfirmacao } from '@/lib/auth';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  // Volta do LINK DE CONFIRMAÇÃO de e-mail (Supabase redireciona para a origem
  // com o resultado no #hash). Antes ninguém lia isso: quem confirmava caía numa
  // tela de login muda, e quem falhava (link consumido pela prévia do WhatsApp,
  // por exemplo) não tinha nem mensagem nem como pedir outro link.
  const [confirmacao, setConfirmacao] = useState<'' | 'ok' | 'erro'>('');
  const [confirmacaoMsg, setConfirmacaoMsg] = useState('');
  const [mostrarReenviar, setMostrarReenviar] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [reenviado, setReenviado] = useState(false);

  useEffect(() => {
    let vivo = true;
    queueMicrotask(() => {
      if (!vivo || typeof window === 'undefined' || !window.location.hash) return;
      const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      if (h.get('error')) {
        const code = h.get('error_code') ?? '';
        setConfirmacao('erro');
        setConfirmacaoMsg(code === 'otp_expired'
          ? 'O link de confirmação expirou ou já tinha sido aberto (a prévia do WhatsApp e alguns antivírus “visitam” o link antes de você — e ele só vale uma vez). Digite seu e-mail abaixo e peça um novo.'
          : `Não foi possível confirmar o e-mail${h.get('error_description') ? `: ${h.get('error_description')}` : ''}. Digite seu e-mail abaixo e peça um novo link.`);
        setMostrarReenviar(true);
        history.replaceState(null, '', window.location.pathname);
      } else if (h.get('access_token') && (h.get('type') === 'signup' || h.get('type') === 'invite')) {
        setConfirmacao('ok');
        setConfirmacaoMsg('E-mail confirmado! Agora é só entrar com o e-mail e a senha que você criou. O acesso libera depois da aprovação do administrador.');
        history.replaceState(null, '', window.location.pathname);
      }
    });
    return () => { vivo = false; };
  }, []);

  async function reenviar() {
    if (!/\S+@\S+\.\S+/.test(email)) { setErro('Digite seu e-mail no campo acima para reenviar a confirmação.'); return; }
    setReenviando(true); setErro('');
    const r = await reenviarConfirmacao(email);
    setReenviando(false);
    if (r.ok) { setReenviado(true); setConfirmacao(''); setConfirmacaoMsg(''); }
    else setErro(`Não deu para reenviar: ${r.erro ?? 'erro desconhecido'}`);
  }

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !senha) return;
    setErro(''); setCarregando(true);
    try {
      // Sem internet: confere a senha contra o acesso salvo neste aparelho
      // (login OFFLINE do app de campo — a senha nunca fica salva, só um hash).
      if (!navigator.onLine) {
        await loginOffline(email, senha);
        return;
      }
      await loginEmailSenha(email, senha);
      // Sucesso: o AppProvider reage ao onAuthStateChanged e renderiza o app.
    } catch (err) {
      const msg = ((err as { message?: string })?.message ?? '').toLowerCase();
      // rede caiu OU servidor degradado (pendurado até estourar o tempo-limite)
      const semRede = !navigator.onLine || msg.includes('network') || msg.includes('fetch')
        || msg.includes('tempo esgotado') || msg.includes('timeout');
      if (semRede) {
        // → tenta o offline como fallback (senha conferida contra o hash local)
        try { await loginOffline(email, senha); return; }
        catch (e2) { setErro((e2 as Error).message); setCarregando(false); return; }
      }
      // E-mail ainda não confirmado → além da mensagem, oferece o reenvio aqui.
      if (msg.includes('email not confirmed')) setMostrarReenviar(true);
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

        {confirmacao === 'ok' && (
          <div className="flex items-start gap-2 rounded-lg p-2.5" style={{ background: '#0f3d2e', border: '1px solid #166534' }}>
            <MailCheck size={14} className="mt-0.5 shrink-0" style={{ color: '#6ee7b7' }} />
            <p className="text-[11px] leading-relaxed" style={{ color: '#6ee7b7' }}>{confirmacaoMsg}</p>
          </div>
        )}
        {confirmacao === 'erro' && (
          <div className="flex items-start gap-2 rounded-lg p-2.5" style={{ background: '#3a2300', border: '1px solid #92400e' }}>
            <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: '#fbbf24' }} />
            <p className="text-[11px] leading-relaxed" style={{ color: '#fbbf24' }}>{confirmacaoMsg}</p>
          </div>
        )}
        {reenviado && (
          <div className="flex items-start gap-2 rounded-lg p-2.5" style={{ background: '#0f3d2e', border: '1px solid #166534' }}>
            <MailCheck size={14} className="mt-0.5 shrink-0" style={{ color: '#6ee7b7' }} />
            <p className="text-[11px] leading-relaxed" style={{ color: '#6ee7b7' }}>
              Novo e-mail de confirmação enviado. Abra o link <b>mais recente</b> da sua caixa de entrada
              (no navegador — não pela prévia do WhatsApp) e depois entre aqui.
            </p>
          </div>
        )}

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

        {mostrarReenviar && !reenviado && (
          <button type="button" onClick={reenviar} disabled={reenviando}
            className="w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: '#1a3a6b', color: '#93c5fd' }}>
            {reenviando ? <><Loader2 size={13} className="animate-spin" /> Reenviando…</> : <><Send size={13} /> Reenviar e-mail de confirmação</>}
          </button>
        )}

        <p className="text-center text-[10px]" style={{ color: '#475569' }}>
          Sem internet? Se você já entrou neste aparelho, o mesmo e-mail e senha funcionam offline.
        </p>
        <p className="text-center text-[10px]" style={{ color: '#475569' }}>INVICTA AP · invictaap.com.br</p>
      </form>
    </div>
  );
}
