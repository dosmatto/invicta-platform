'use client';

// Inicialização do Supabase — provedor único de auth + dados.
// Sem as variáveis NEXT_PUBLIC_SUPABASE_* este módulo é no-op e o app roda 100%
// local (localStorage). Aqui só fica o CLIENTE; a auth vive em auth.ts.
//
// A `anon key` é pública por design (vai no front, protegida por RLS). A
// `service_role key` NUNCA entra aqui — ela só roda em script/servidor.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { criarArmazenamentoSessao } from './sessaoStorage';
import { APP_VERSION } from '@/constants/version';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigurado = !!(url && anonKey);

// VERSÃO DO CLIENTE EM TODA REQUISIÇÃO (pendência 43, v2.155.0). A RLS do
// app_kv (docs/seguranca-rls.sql, seção 3b) só aceita escrita nos CATÁLOGOS da
// Biblioteca quando este cabeçalho existe e é >= à versão mínima gravada no
// banco. Motivo: em 13/09/2026 um build ANTIGO do app de campo (anterior à
// correção da v2.80.0) semeou o catálogo de variáveis do zero e PODOU na nuvem
// o catálogo real — casas decimais e ordem dos elementos sumiram para todo
// mundo. O código atual não faz isso, mas um aparelho com o build velho
// continua fazendo; a única defesa que alcança esse aparelho é o banco recusar
// quem não se identifica. O app de campo é cortado do mesmo commit, então
// carrega a mesma APP_VERSION e passa na régua — e nem escreve nesses catálogos.
// Cabeçalho em minúsculas: o PostgREST expõe os nomes assim em request.headers.
const CABECALHOS_INVICTA = { 'x-invicta-versao': APP_VERSION } as const;

let client: SupabaseClient | null = null;

// Cliente Supabase (singleton). null se não configurado ou no servidor.
export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigurado || typeof window === 'undefined') return null;
  if (!client) {
    client = createClient(url!, anonKey!, {
      global: { headers: CABECALHOS_INVICTA },
      auth: {
        persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
        // ONDE A SESSÃO MORA — explícito de propósito. SEM este campo, o
        // supabase-js escolhe sozinho: testa uma escrita no localStorage e, se
        // falhar, guarda a sessão SÓ NA MEMÓRIA, calado. Com o localStorage
        // cheio o teste falha, e aí toda recarga volta para a tela de login —
        // era exatamente o "está cada vez pedindo login e senha". O adaptador
        // (sessaoStorage.ts) usa localStorage e, quando ele recusa, IndexedDB.
        storage: criarArmazenamentoSessao(),
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
    global: { headers: CABECALHOS_INVICTA },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
