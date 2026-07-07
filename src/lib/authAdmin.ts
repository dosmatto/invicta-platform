'use client';

// Ações ADMIN de usuários (resetar senha / criar conta) via BACKEND — a
// service_role do Supabase fica só no Render (nunca no client). O backend
// valida o access_token de quem chama contra a lista INVICTA_ADMIN_EMAILS.
// Sem as envs no Render, o backend devolve 503 → `naoConfigurado` (o convite
// cai no caminho antigo de signUp; o reset mostra a instrução de configurar).

import { INTERP_URL, headersBackend } from './interpUrl';
import { getSupabase } from './supabase';

export interface RespAdmin { ok: boolean; jaExiste?: boolean; naoConfigurado?: boolean; erro?: string }

async function chamar(rota: string, body: object): Promise<RespAdmin> {
  const sb = getSupabase();
  if (!sb) return { ok: false, naoConfigurado: true, erro: 'Supabase não configurado.' };
  const token = (await sb.auth.getSession()).data.session?.access_token;
  if (!token) return { ok: false, erro: 'Sessão expirada — saia e entre de novo.' };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25_000);   // Render frio leva ~1 min p/ acordar
  try {
    const r = await fetch(`${INTERP_URL}${rota}`, {
      method: 'POST',
      headers: headersBackend({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const corpo: { detail?: string; jaExiste?: boolean } = await r.json().catch(() => ({}));
    if (r.ok) return { ok: true, jaExiste: corpo.jaExiste === true };
    if (r.status === 503 || r.status === 404)   // 404 = backend antigo (ainda sem a rota)
      return { ok: false, naoConfigurado: true, erro: corpo.detail ?? 'Admin de usuários não configurado no servidor.' };
    return { ok: false, erro: corpo.detail ?? `Erro ${r.status} no servidor.` };
  } catch {
    // Rede fora ou servidor da nuvem ainda acordando (o timeout aborta).
    return { ok: false, naoConfigurado: true, erro: 'Servidor de processamento indisponível (se acabou de abrir a tela, ele pode estar acordando — tente de novo em ~1 min).' };
  } finally { clearTimeout(t); }
}

// Redefine a senha de um usuário existente (e confirma o e-mail dele, o que
// destrava contas presas em "confirmação pendente"). Só admins autorizados.
export const resetarSenhaAdmin = (email: string, senha: string) => chamar('/admin-usuarios/resetar-senha', { email, senha });

// Cria a conta já CONFIRMADA (não depende do toggle "Confirm email" do projeto).
export const criarUsuarioAdmin = (email: string, senha: string) => chamar('/admin-usuarios/criar', { email, senha });
