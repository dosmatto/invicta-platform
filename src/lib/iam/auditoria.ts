'use client';

// IAM — trilha de auditoria. Registra QUEM fez O QUÊ, COM QUEM e QUANDO.
//
// Antes desta fase o sistema não guardava nenhuma ação de acesso (nem convite,
// nem troca de papel, nem reset de senha). Aqui tudo passa por `registrar()`.
// Guarda no mesmo padrão das outras listas (localStorage + espelho na nuvem),
// com teto de itens para não crescer sem limite.

import { lerListaLocal, gravarListaLocal } from '../localComprimido';
import { cloudPushLista } from '../cloud';
import { usarDadosSupabase, salvarDocSupabase } from '../supabaseData';
import { emailUsuario } from '../empresa';
import type { AcaoAuditoria, EventoAuditoria } from './tipos';

export const K_AUDITORIA = 'inv_auditoria';
const TETO = 2000;   // eventos mantidos (os mais antigos são descartados)

export function getAuditoria(): EventoAuditoria[] {
  return lerListaLocal<EventoAuditoria>(K_AUDITORIA)
    .sort((a, b) => (b.em ?? '').localeCompare(a.em ?? ''));
}

// Eventos de um e-mail específico (painel lateral do usuário).
export function auditoriaDe(email: string): EventoAuditoria[] {
  const e = email.trim().toLowerCase();
  return getAuditoria().filter(x => x.alvo === e || x.quem === e);
}

/**
 * Mesma trilha, mas gravando UM documento na nuvem em vez da lista inteira.
 * Existe pela mesma razão de `registrarPedidoDeAcesso` (iam/usuarios.ts): quem
 * ainda não é usuário não pode reenviar a auditoria dos outros — a RLS recusa o
 * comando todo e o evento "cadastro solicitado" se perdia.
 */
export async function registrarDoc(
  acao: AcaoAuditoria,
  dados: { alvo?: string; detalhe?: string; de?: string; para?: string } = {},
): Promise<void> {
  if (typeof window === 'undefined') return;
  const ev: EventoAuditoria = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    em: new Date().toISOString(),
    quem: emailUsuario() ?? 'sistema',
    acao,
    alvo: dados.alvo?.trim().toLowerCase(),
    detalhe: dados.detalhe,
    de: dados.de,
    para: dados.para,
  };
  try {
    const lista = lerListaLocal<EventoAuditoria>(K_AUDITORIA);
    lista.push(ev);
    gravarListaLocal(K_AUDITORIA, lista.length > TETO ? lista.slice(-TETO) : lista);
    if (usarDadosSupabase()) await salvarDocSupabase(K_AUDITORIA, ev.id, ev);
  } catch (e) {
    console.warn('[auditoria] falha ao registrar', acao, e);
  }
}

export function registrar(
  acao: AcaoAuditoria,
  dados: { alvo?: string; detalhe?: string; de?: string; para?: string } = {},
): void {
  if (typeof window === 'undefined') return;
  const ev: EventoAuditoria = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    em: new Date().toISOString(),
    quem: emailUsuario() ?? 'sistema',
    acao,
    alvo: dados.alvo?.trim().toLowerCase(),
    detalhe: dados.detalhe,
    de: dados.de,
    para: dados.para,
  };
  try {
    const lista = lerListaLocal<EventoAuditoria>(K_AUDITORIA);
    lista.push(ev);
    const podado = lista.length > TETO ? lista.slice(-TETO) : lista;
    gravarListaLocal(K_AUDITORIA, podado);
    cloudPushLista(K_AUDITORIA, podado as unknown as { id: unknown }[]);
  } catch (e) {
    console.warn('[auditoria] falha ao registrar', acao, e);
  }
}

// Marca o último acesso do usuário logado (chamado no boot, 1× por sessão).
export function registrarLogin(email: string | null): void {
  if (!email) return;
  const chave = `inv_login_registrado_${email}`;
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    if (sessionStorage.getItem(chave) === hoje) return;   // 1× por sessão/dia
    sessionStorage.setItem(chave, hoje);
  } catch { /* sessionStorage indisponível — registra mesmo assim */ }
  registrar('login', { alvo: email });
}
