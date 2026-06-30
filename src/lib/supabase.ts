'use client';

// Inicialização do Supabase — totalmente OPCIONAL nesta etapa (A3.1).
// Sem as variáveis NEXT_PUBLIC_SUPABASE_* este módulo é no-op e nada muda
// (mesmo padrão do firebase.ts). Aqui só fica o CLIENTE; a troca do provedor
// de login (auth.ts) vem na A3.2, depois das contas migradas.
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
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return client;
}
