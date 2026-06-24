'use client';

// Autenticação por e-mail/senha (Firebase Auth). Login obrigatório quando o
// Firebase está configurado — substitui o acesso anônimo. As CONTAS são criadas
// pelo admin no Console do Firebase (Authentication → Users); o app só faz login.

import { getFb, firebaseConfigurado } from './firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, updatePassword, type User } from 'firebase/auth';

export { firebaseConfigurado };
export type { User };

// Observa o estado de login. Retorna função para cancelar a inscrição.
export function observarAuth(cb: (u: User | null) => void): () => void {
  const fb = getFb();
  if (!fb) { cb(null); return () => {}; }
  return onAuthStateChanged(fb.auth, cb);
}

export async function loginEmailSenha(email: string, senha: string): Promise<void> {
  const fb = getFb();
  if (!fb) throw new Error('Firebase não configurado.');
  await signInWithEmailAndPassword(fb.auth, email.trim().toLowerCase(), senha);
}

export async function logout(): Promise<void> {
  const fb = getFb();
  if (fb) await signOut(fb.auth);
}

// Troca a senha do usuário logado (usado na troca obrigatória do 1º acesso).
export async function trocarSenha(novaSenha: string): Promise<void> {
  const fb = getFb();
  if (!fb?.auth.currentUser) throw new Error('Não autenticado.');
  await updatePassword(fb.auth.currentUser, novaSenha);
}

export function emailUsuario(): string | null {
  return getFb()?.auth.currentUser?.email ?? null;
}

// Mensagem amigável a partir do código de erro do Firebase Auth.
export function mensagemErroLogin(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found') || code.includes('invalid-email'))
    return 'E-mail ou senha incorretos.';
  if (code.includes('operation-not-allowed'))
    return 'Login por e-mail/senha não está habilitado no Firebase (Authentication → Sign-in method → E-mail/senha).';
  if (code.includes('too-many-requests')) return 'Muitas tentativas. Aguarde alguns instantes e tente de novo.';
  if (code.includes('network')) return 'Sem conexão com o Firebase. Verifique a internet.';
  return 'Falha ao entrar' + (code ? ` (${code})` : '') + '.';
}
