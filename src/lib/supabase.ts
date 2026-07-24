'use client';

// Inicialização do Supabase — provedor único de auth + dados.
// Sem as variáveis NEXT_PUBLIC_SUPABASE_* este módulo é no-op e o app roda 100%
// local (localStorage). Aqui só fica o CLIENTE; a auth vive em auth.ts.
//
// A `anon key` é pública por design (vai no front, protegida por RLS). A
// `service_role key` NUNCA entra aqui — ela só roda em script/servidor.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigurado = !!(url && anonKey);

let client: SupabaseClient | null = null;

// Cliente Supabase (singleton). null se não configurado ou no servidor.
export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigurado || typeof window === 'undefined') return null;
  if (!client) {
    client = createClient(url!, anonKey!, {
      auth: {
        persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
        // O supabase-js, por padrão, usa navigator.locks p/ serializar a auth
        // ENTRE ABAS (Web Locks). Isso fazia a interpolação PARAR ao abrir uma 2ª
        // aba: a nova aba segurava o lock no boot/refresh do token e a 1ª aba
        // travava em getSession() ao salvar cada mapa. Lock pass-through (sem
        // travar entre abas) — app de 1 usuário; cada aba cuida da própria sessão.
        lock: <R,>(_name: string, _acquireTimeout: number, fn: () => Promise<R>) => fn(),
      },
    });
  }
  return client;
}

// Cliente EFÊMERO (sem persistência) — para ações que NÃO devem mexer na sessão
// do admin, como criar usuário (signUp). Cada chamada devolve um cliente novo,
// descartável; a sessão que o signUp gerar fica só na memória dele.
export function getSupabaseEfemero(): SupabaseClient | null {
  if (!supabaseConfigurado || typeof window === 'undefined') return null;
  return createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
