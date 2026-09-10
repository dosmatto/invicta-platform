'use client';

// Onde a SESSÃO DE LOGIN é guardada. Existe por causa de um defeito preciso:
// "toda hora pede login e senha".
//
// O supabase-js, quando não recebe um `storage`, decide sozinho no construtor
// (GoTrueClient): faz um teste de escrita minúsculo no localStorage e, se ele
// falhar, cai num adaptador EM MEMÓRIA — sem avisar ninguém. Com o localStorage
// cheio (é o que também produzia o "Falha ao reabrir: The quota has been
// exceeded." da v2.140.0), esse teste falha, a sessão passa a existir só na
// memória da aba e QUALQUER recarga volta para a tela de login. Nada aparece no
// console; parece "o login está caindo".
//
// E mesmo quando o teste passa por pouco: o token é renovado de hora em hora e
// precisa ser REGRAVADO. Se essa gravação estoura a cota, fica guardado o token
// velho — que na volta já não vale, e o app pede login de novo.
//
// A regra desta casa passa a ser: A SESSÃO NÃO DISPUTA ESPAÇO COM O CACHE.
//   1º localStorage — o caminho normal, síncrono e rápido;
//   2º IndexedDB (cota na casa dos GBs) quando o localStorage recusa;
//   3º memória, só se os dois falharem (navegação privada com IDB bloqueado) —
//      aí o login por sessão é inevitável, mas o aviso de armazenamento cheio
//      acende no cabeçalho ('inv:quota-erro', o mesmo do SyncBadge).
//
// O adaptador é assíncrono de propósito: o supabase-js acessa o storage sempre
// por `getItemAsync/setItemAsync/removeItemAsync`, que aguardam a promessa.

import { idbSessaoGet, idbSessaoPut, idbSessaoDelete } from './idbSessao.ts';

/** Formato que o supabase-js espera em `auth.storage`. */
export interface ArmazenamentoSessao {
  getItem(chave: string): Promise<string | null>;
  setItem(chave: string, valor: string): Promise<void>;
  removeItem(chave: string): Promise<void>;
}

export function ehErroDeCota(e: unknown): boolean {
  // Cada navegador nomeia o seu: Chrome usa 'QuotaExceededError', Firefox manda
  // 'NS_ERROR_DOM_QUOTA_REACHED' com code 22, Safari antigo só o code 22.
  if (typeof DOMException !== 'undefined' && e instanceof DOMException) {
    return e.name === 'QuotaExceededError'
      || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
      || e.code === 22;
  }
  const nome = (e as { name?: string } | null)?.name;
  return nome === 'QuotaExceededError' || nome === 'NS_ERROR_DOM_QUOTA_REACHED';
}

function avisarQuota(chave: string): void {
  if (typeof window === 'undefined') return;
  try { window.dispatchEvent(new CustomEvent('inv:quota-erro', { detail: { key: chave } })); } catch { /* sem window */ }
}

// `localStorage` pode LANÇAR só de ser tocado (cookies de terceiros bloqueados,
// modo privado antigo) — nunca acesse direto.
function ls(): Storage | null {
  try {
    if (typeof globalThis === 'undefined') return null;
    const s = (globalThis as { localStorage?: Storage }).localStorage;
    return s ?? null;
  } catch { return null; }
}

export function criarArmazenamentoSessao(): ArmazenamentoSessao {
  const memoria = new Map<string, string>();

  return {
    async getItem(chave) {
      try { const v = ls()?.getItem(chave); if (v != null) return v; } catch { /* segue */ }
      const doIdb = await idbSessaoGet(chave);
      if (doIdb != null) return doIdb;
      return memoria.get(chave) ?? null;
    },

    async setItem(chave, valor) {
      memoria.set(chave, valor);           // espelho em memória: a aba atual nunca fica sem sessão
      try {
        ls()?.setItem(chave, valor);
        // Deu certo no localStorage: apaga a cópia de reserva, senão uma sessão
        // ANTIGA sobreviveria no IndexedDB e voltaria à tona depois de um logout
        // que só limpasse o localStorage.
        void idbSessaoDelete(chave);
        return;
      } catch (e) {
        if (!ehErroDeCota(e)) { console.warn('[sessao] localStorage recusou a sessão:', e); }
      }
      const ok = await idbSessaoPut(chave, valor);
      if (!ok) {
        console.warn('[sessao] sem lugar para persistir a sessão — ela vale só nesta aba.');
        avisarQuota(chave);
        return;
      }
      // Persistiu no IndexedDB, mas o localStorage estar cheio é um problema de
      // verdade (o cache do app parou de gravar): o selo do cabeçalho tem de
      // acender mesmo com o login salvo.
      avisarQuota(chave);
    },

    async removeItem(chave) {
      // Logout tem de limpar OS TRÊS. Deixar qualquer um para trás ressuscita a
      // sessão na próxima abertura.
      memoria.delete(chave);
      try { ls()?.removeItem(chave); } catch { /* segue */ }
      await idbSessaoDelete(chave);
    },
  };
}
