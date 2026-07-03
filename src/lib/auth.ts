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

// ── Login OFFLINE (app de campo) ─────────────────────────────────────────────
// Depois de um login ONLINE bem-sucedido neste aparelho, guardamos um
// VERIFICADOR da senha (PBKDF2-SHA256 + salt — a senha em si NUNCA é salva).
// Sem internet, e-mail+senha são conferidos localmente e o app entra com a
// identidade salva. Nesse modo NÃO existe sessão na nuvem: os dados ficam
// pendentes no aparelho e o envio exige entrar de novo com internet.

const KEY_OFFLINE = 'inv_login_offline';
type VerificadorOffline = { email: string; uid: string; salt: string; hash: string; em: string };

let usuarioOffline: User | null = null;
let notificarObs: ((u: User | null) => void) | null = null; // registrado por observarAuth

const b64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf))));

async function derivarHash(senha: string, saltB64: string): Promise<string> {
  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 120000 }, chave, 256);
  return b64(bits);
}

function lerVerificadores(): VerificadorOffline[] {
  try { return JSON.parse(localStorage.getItem(KEY_OFFLINE) ?? '[]'); } catch { return []; }
}

async function salvarVerificadorOffline(email: string, senha: string, uid: string): Promise<void> {
  try {
    const e = normEmail(email);
    const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await derivarHash(senha, salt);
    const lista = lerVerificadores().filter(v => v.email !== e);
    lista.push({ email: e, uid, salt, hash, em: new Date().toISOString() });
    localStorage.setItem(KEY_OFFLINE, JSON.stringify(lista));
  } catch { /* WebCrypto indisponível — segue sem login offline */ }
}

// Entra SEM internet conferindo a senha contra o verificador local.
export async function loginOffline(email: string, senha: string): Promise<void> {
  const e = normEmail(email);
  const v = lerVerificadores().find(x => x.email === e);
  if (!v) throw new Error('Sem internet — e este aparelho ainda não tem acesso salvo para este e-mail. Conecte uma vez para o primeiro login.');
  const hash = await derivarHash(senha, v.salt);
  if (hash !== v.hash) throw new Error('E-mail ou senha incorretos.');
  usuarioOffline = { uid: v.uid, email: v.email };
  supaUser = null;
  notificarObs?.(usuarioOffline);
}

// Está no modo offline (entrou pelo verificador local, sem sessão na nuvem)?
export function modoOffline(): boolean {
  return usuarioOffline != null && supaUser == null;
}

// Usuário atual (provedor-ciente), p/ os getters síncronos de identidade.
export function usuarioAtual(): User | null {
  if (usarSupabase) return supaUser ?? usuarioOffline;
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
    const avisar = (u: User | null) => {
      const uid = u?.uid ?? null;
      if (uid === ultimoUid) return;   // mesma pessoa (refresh/foco) → ignora
      ultimoUid = uid;
      cb(u);
    };
    notificarObs = avisar;             // p/ o login OFFLINE avisar o app
    const { data } = sb.auth.onAuthStateChange(async (_evt, session) => {
      const su = session?.user;
      // Sessão nula da nuvem NÃO derruba um login offline ativo.
      if (!su && usuarioOffline) return;
      supaUser = su ? { uid: su.id, email: su.email ?? null } : null;
      // Ponte: garante a sessão anônima do Firebase ANTES de avisar o app.
      if (supaUser) { usuarioOffline = null; await entrarAnonimo().catch(() => {}); }
      avisar(supaUser);
    });
    return () => { notificarObs = null; data.subscription.unsubscribe(); };
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
    const { data, error } = await sb.auth.signInWithPassword({ email: e, password: senha });
    if (error) throw error;
    // guarda o verificador p/ este aparelho poder logar OFFLINE depois
    if (data.session?.user) void salvarVerificadorOffline(e, senha, data.session.user.id);
    return; // a ponte anônima é estabelecida pelo observador (onAuthStateChange)
  }
  const fb = getFb();
  if (!fb) throw new Error('Firebase não configurado.');
  await signInWithEmailAndPassword(fb.auth, e, senha);
}

export async function logout(): Promise<void> {
  if (usuarioOffline) {
    usuarioOffline = null;
    notificarObs?.(null);
  }
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
    // mantém o login offline deste aparelho em dia com a senha nova
    const u = usuarioAtual();
    if (u?.email) void salvarVerificadorOffline(u.email, novaSenha, u.uid);
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
    // Se "Confirm email" estiver LIGADO no projeto, o link de confirmação usa a
    // Site URL do Supabase — que não pode ser localhost. Fixamos o redirect na
    // ORIGEM atual (o admin convida a partir da app publicada) como reforço, pra
    // o link nunca cair em localhost mesmo com a Site URL mal configurada.
    const emailRedirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
    const { data, error } = await sb.auth.signUp({ email: e, password: senha, options: emailRedirectTo ? { emailRedirectTo } : undefined });
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
