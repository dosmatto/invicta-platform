'use client';

// Inicialização do Firebase — totalmente opcional. Sem as variáveis
// NEXT_PUBLIC_FIREBASE_* o app roda 100% local (localStorage), como antes.

import { initializeApp, getApps, deleteApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAuth, signInAnonymously, initializeAuth, inMemoryPersistence, createUserWithEmailAndPassword, type Auth } from 'firebase/auth';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const cfg = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfigurado = !!(cfg.apiKey && cfg.projectId && cfg.appId);

let app: FirebaseApp | null = null;

export function getFb(): { db: Firestore; auth: Auth } | null {
  if (!firebaseConfigurado || typeof window === 'undefined') return null;
  if (!app) app = getApps()[0] ?? initializeApp(cfg);
  return { db: getFirestore(app), auth: getAuth(app) };
}

// Firebase Storage (usado p/ arquivar os PDFs dos relatórios). Sem Storage
// habilitado no console, o upload simplesmente falha e é tratado pelo caller.
export function getStorageFb(): FirebaseStorage | null {
  if (!firebaseConfigurado || typeof window === 'undefined') return null;
  if (!app) app = getApps()[0] ?? initializeApp(cfg);
  return getStorage(app);
}

// Login anônimo (regras do Firestore exigem usuário autenticado)
export async function entrarAnonimo(): Promise<boolean> {
  const fb = getFb();
  if (!fb) return false;
  if (!fb.auth.currentUser) await signInAnonymously(fb.auth);
  return true;
}

// Cria a conta de login (e-mail/senha) de um NOVO usuário SEM deslogar o admin.
// Usa um app Firebase secundário com persistência EM MEMÓRIA (não toca a sessão
// principal). Sem backend — roda no cliente. O admin gera a senha provisória.
export async function criarUsuarioConvite(email: string, senha: string): Promise<{ ok: boolean; jaExiste?: boolean; erro?: string }> {
  if (!firebaseConfigurado || typeof window === 'undefined') return { ok: false, erro: 'Firebase não configurado.' };
  const sec = initializeApp(cfg, 'convite-' + Math.random().toString(36).slice(2));
  try {
    const secAuth = initializeAuth(sec, { persistence: inMemoryPersistence });
    await createUserWithEmailAndPassword(secAuth, email, senha);
    await secAuth.signOut().catch(() => {});
    return { ok: true };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'auth/email-already-in-use') return { ok: false, jaExiste: true };
    return { ok: false, erro: code ?? 'Falha ao criar usuário.' };
  } finally {
    await deleteApp(sec).catch(() => {});
  }
}
