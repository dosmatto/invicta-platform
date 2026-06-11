'use client';

// Inicialização do Firebase — totalmente opcional. Sem as variáveis
// NEXT_PUBLIC_FIREBASE_* o app roda 100% local (localStorage), como antes.

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth';

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

// Login anônimo (regras do Firestore exigem usuário autenticado)
export async function entrarAnonimo(): Promise<boolean> {
  const fb = getFb();
  if (!fb) return false;
  if (!fb.auth.currentUser) await signInAnonymously(fb.auth);
  return true;
}
