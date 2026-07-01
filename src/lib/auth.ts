'use client';

// Autenticação por e-mail/senha — DUAL-PROVIDER (Fase 3, etapa A3.2).
//
// Seleção por ambiente (mesma filosofia "no-op sem chave" do resto):
//   • Se NEXT_PUBLIC_SUPABASE_* presentes  -> Supabase Auth (novo provedor).
//   • Senão                                 -> Firebase Auth (comportamento atual).
//
// Na transição, a IDENTIDADE (login/e-mail/uid p/ autorização) vem do Supabase,
// mas os DADOS continuam no Firestore — que exige sessão Firebase. Por isso, com
// o Supabase ativo, abrimos TAMBÉM um login ANÔNIMO no Firebase (ponte) só para o
// espelho (`cloud.ts`) seguir gravando. O `cloud.ts` não muda: ele só checa
// "existe currentUser do Firebase?", e o anônimo satisfaz isso.
//
// As assinaturas exportadas são as mesmas de antes — os consumidores não mudam.

import { getFb, firebaseConfigurado, entrarAnonimo, criarUsuarioConvite as criarUsuarioConviteFb } from './firebase';
import { getSupabase, getSupabaseEfemero, supabaseConfigurado } from './supabase';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut, updatePassword } from 'firebase/auth';

export { firebaseConfigurado };

// Usuário normalizado, independente de provedor.
export type User = { uid: string; email: string | null };

// Há algum provedor de auth configurado (Supabase OU Firebase).
export const authConfigurado = supabaseConfigurado || firebaseConfigurado;
// Provedor ativo nesta build. Supabase tem precedência quando configurado.
const usarSupabase = supabaseConfigurado;

const normEmail = (e: string) => e.trim().toLowerCase();

// Cache SÍNCRONO do usuário Supabase (o SDK só expõe a sessão de forma async;
// os getters do app — emailUsuario/uidUsuario — são síncronos). Atualizado pelo
// observador de auth, que roda no boot.
let supaUser: User | null = null;

// Usuário atual (provedor-ciente), p/ os getters síncronos de identidade.
export function usuarioAtual(): User | null {
  if (usarSupabase) return supaUser;
  const u = getFb()?.auth.currentUser;
  return u ? { uid: u.uid, email: u.email } : null;
}

// Observa o estado de login. Retorna função para cancelar a inscrição.
export function observarAuth(cb: (u: User | null) => void): () => void {
  if (usarSupabase) {
    const sb = getSupabase();
    if (!sb) { cb(null); return () => {}; }
    // onAuthStateChange dispara INITIAL_SESSION na inscrição + eventos seguintes.
    // Só avisamos o app quando a IDENTIDADE muda (login/logout). O Supabase reemite
    // TOKEN_REFRESHED / SIGNED_IN a cada refresh de token e foco de aba; sem o
    // guard, o AppContext re-rodaria o boot inteiro toda vez ("reabre tudo" +
    // interrompe interpolação/uploads no meio).
    let ultimoUid: string | null | undefined = undefined;  // undefined = ainda não avisou
    const { data } = sb.auth.onAuthStateChange(async (_evt, session) => {
      const su = session?.user;
      const uid = su?.id ?? null;
      if (uid === ultimoUid) return;   // mesma pessoa (refresh/foco) → ignora
      ultimoUid = uid;
      supaUser = su ? { uid: su.id, email: su.email ?? null } : null;
      // Ponte: garante a sessão anônima do Firebase ANTES de avisar o app.
      if (supaUser) await entrarAnonimo().catch(() => {});
      cb(supaUser);
    });
    return () => data.subscription.unsubscribe();
  }
  const fb = getFb();
  if (!fb) { cb(null); return () => {}; }
  return onAuthStateChanged(fb.auth, u => cb(u ? { uid: u.uid, email: u.email } : null));
}

export async function loginEmailSenha(email: string, senha: string): Promise<void> {
  const e = normEmail(email);
  if (usarSupabase) {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase não configurado.');
    const { error } = await sb.auth.signInWithPassword({ email: e, password: senha });
    if (error) throw error;
    return; // a ponte anônima é estabelecida pelo observador (onAuthStateChange)
  }
  const fb = getFb();
  if (!fb) throw new Error('Firebase não configurado.');
  await signInWithEmailAndPassword(fb.auth, e, senha);
}

export async function logout(): Promise<void> {
  if (usarSupabase) {
    await getSupabase()?.auth.signOut().catch(() => {});
  }
  // sempre encerra a sessão Firebase (real ou anônima da ponte)
  const fb = getFb();
  if (fb?.auth.currentUser) await fbSignOut(fb.auth).catch(() => {});
}

// Troca a senha do usuário logado (usado na troca obrigatória do 1º acesso).
export async function trocarSenha(novaSenha: string): Promise<void> {
  if (usarSupabase) {
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase não configurado.');
    const { error } = await sb.auth.updateUser({ password: novaSenha });
    if (error) throw error;
    return;
  }
  const fb = getFb();
  if (!fb?.auth.currentUser) throw new Error('Não autenticado.');
  await updatePassword(fb.auth.currentUser, novaSenha);
}

// Cria a conta de login de um NOVO usuário (convite do admin) SEM deslogar quem
// está logado. Firebase: app secundário in-memory. Supabase: cliente EFÊMERO +
// signUp — exige no projeto Supabase "Confirm email" DESLIGADO (Authentication →
// Providers → Email) p/ a senha provisória já servir de imediato. O 1º acesso
// força a troca de senha (via `senhaProvisoria`/`precisaTrocarSenha`).
export async function criarUsuarioConvite(email: string, senha: string): Promise<{ ok: boolean; jaExiste?: boolean; erro?: string }> {
  const e = normEmail(email);
  if (usarSupabase) {
    const sb = getSupabaseEfemero();
    if (!sb) return { ok: false, erro: 'Supabase não configurado.' };
    const { data, error } = await sb.auth.signUp({ email: e, password: senha });
    if (error) {
      const m = (error.message || '').toLowerCase();
      if (m.includes('already registered') || m.includes('already exists') || m.includes('already been registered'))
        return { ok: false, jaExiste: true };
      return { ok: false, erro: error.message };
    }
    // Supabase "obfusca" usuário existente devolvendo user sem identities.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0)
      return { ok: false, jaExiste: true };
    return { ok: true };
  }
  return criarUsuarioConviteFb(e, senha);
}

export function emailUsuario(): string | null {
  const em = usuarioAtual()?.email;
  return em ? normEmail(em) : null;
}

// Mensagem amigável a partir do erro do provedor (Firebase ou Supabase).
export function mensagemErroLogin(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  const msg = ((err as { message?: string })?.message ?? '').toLowerCase();
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found') || code.includes('invalid-email')
    || msg.includes('invalid login credentials') || msg.includes('invalid email or password'))
    return 'E-mail ou senha incorretos.';
  if (msg.includes('email not confirmed'))
    return 'E-mail ainda não confirmado no Supabase (Authentication → Users).';
  if (code.includes('operation-not-allowed'))
    return 'Login por e-mail/senha não está habilitado no Firebase (Authentication → Sign-in method → E-mail/senha).';
  if (code.includes('too-many-requests') || msg.includes('rate limit')) return 'Muitas tentativas. Aguarde alguns instantes e tente de novo.';
  if (code.includes('network') || msg.includes('network') || msg.includes('fetch')) return 'Sem conexão com o servidor de login. Verifique a internet.';
  return 'Falha ao entrar' + (code ? ` (${code})` : '') + '.';
}
