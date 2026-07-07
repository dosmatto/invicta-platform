'use client';

// Inicialização do Firebase — totalmente opcional. Sem as variáveis
// NEXT_PUBLIC_FIREBASE_* o app roda 100% local (localStorage), como antes.
//
// LAZY-LOAD: o SDK (firebase/app, firestore, auth, storage — ~148 MB em
// node_modules, centenas de KB no bundle) só é importado quando o Firebase
// está configurado E alguém de fato precisa dele (login/boot da nuvem).
// Sem NEXT_PUBLIC_FIREBASE_*, nenhum `import()` é sequer disparado.

import type { FirebaseApp } from 'firebase/app';
import type { Firestore } from 'firebase/firestore';
import type { Auth } from 'firebase/auth';
import type { FirebaseStorage } from 'firebase/storage';

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

// Módulos do SDK carregados sob demanda (memoizado — um único import real).
type FbMods = {
  appMod: typeof import('firebase/app');
  authMod: typeof import('firebase/auth');
  fsMod: typeof import('firebase/firestore');
};
let _fbModsPromise: Promise<FbMods> | null = null;
function carregarFbMods(): Promise<FbMods> {
  if (!_fbModsPromise) {
    _fbModsPromise = Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore'),
    ]).then(([appMod, authMod, fsMod]) => ({ appMod, authMod, fsMod }));
  }
  return _fbModsPromise;
}

// Instância pronta (db+auth), populada após o import assíncrono. `getFb()`
// continua síncrono para os muitos call-sites existentes (alguns em render);
// enquanto o SDK ainda não carregou, comporta-se como "nuvem indisponível
// no momento" (mesmo estado transitório que já existia no boot).
let fbPronto: { db: Firestore; auth: Auth } | null = null;

// Garante que o SDK está carregado e a instância pronta. Chamar isso ANTES
// de qualquer operação que dependa de `getFb()` retornar não-nulo (boot,
// login, etc.). No-op se não configurado ou fora do browser.
export async function ensureFb(): Promise<{ db: Firestore; auth: Auth } | null> {
  if (!firebaseConfigurado || typeof window === 'undefined') return null;
  const { appMod, authMod, fsMod } = await carregarFbMods();
  if (!app) app = appMod.getApps()[0] ?? appMod.initializeApp(cfg);
  fbPronto = { db: fsMod.getFirestore(app), auth: authMod.getAuth(app) };
  return fbPronto;
}

// Acesso síncrono à instância já carregada (null se ainda não carregou ou
// não configurado). Os consumidores assíncronos devem chamar `ensureFb()`
// antes; os síncronos (ex.: `disabled={!cloudPodeGravar()}`) toleram o null
// transitório enquanto o import ainda está em voo.
export function getFb(): { db: Firestore; auth: Auth } | null {
  if (!firebaseConfigurado || typeof window === 'undefined') return null;
  if (!fbPronto) void ensureFb(); // dispara o carregamento em paralelo p/ a próxima chamada
  return fbPronto;
}

// Funções do Firestore (collection/doc/setDoc/…) para os módulos consumidores
// (cloud.ts, relatoriosArquivo.ts, cenarios.ts) que hoje as importam
// estaticamente. Memoizado via `carregarFbMods` — nenhum import extra.
export async function getFirestoreFns(): Promise<typeof import('firebase/firestore')> {
  const { fsMod } = await carregarFbMods();
  return fsMod;
}

// Firebase Storage (usado p/ arquivar os PDFs dos relatórios). Sem Storage
// habilitado no console, o upload simplesmente falha e é tratado pelo caller.
export async function getStorageFb(): Promise<FirebaseStorage | null> {
  if (!firebaseConfigurado || typeof window === 'undefined') return null;
  const { appMod } = await carregarFbMods();
  if (!app) app = appMod.getApps()[0] ?? appMod.initializeApp(cfg);
  const { getStorage } = await import('firebase/storage');
  return getStorage(app);
}

// Login anônimo (regras do Firestore exigem usuário autenticado)
export async function entrarAnonimo(): Promise<boolean> {
  const fb = await ensureFb();
  if (!fb) return false;
  const { authMod } = await carregarFbMods();
  if (!fb.auth.currentUser) await authMod.signInAnonymously(fb.auth);
  return true;
}

// Cria a conta de login (e-mail/senha) de um NOVO usuário SEM deslogar o admin.
// Usa um app Firebase secundário com persistência EM MEMÓRIA (não toca a sessão
// principal). Sem backend — roda no cliente. O admin gera a senha provisória.
export async function criarUsuarioConvite(email: string, senha: string): Promise<{ ok: boolean; jaExiste?: boolean; erro?: string }> {
  if (!firebaseConfigurado || typeof window === 'undefined') return { ok: false, erro: 'Firebase não configurado.' };
  const { appMod, authMod } = await carregarFbMods();
  const sec = appMod.initializeApp(cfg, 'convite-' + Math.random().toString(36).slice(2));
  try {
    const secAuth = authMod.initializeAuth(sec, { persistence: authMod.inMemoryPersistence });
    await authMod.createUserWithEmailAndPassword(secAuth, email, senha);
    await secAuth.signOut().catch(() => {});
    return { ok: true };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'auth/email-already-in-use') return { ok: false, jaExiste: true };
    return { ok: false, erro: code ?? 'Falha ao criar usuário.' };
  } finally {
    await appMod.deleteApp(sec).catch(() => {});
  }
}
