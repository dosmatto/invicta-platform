'use client';

// Conceito de Empresa (multi-tenant) — Fase 1.A da reorganização.
//
// Cada usuário tem ao menos uma "Empresa Pessoal" auto-criada no 1º boot.
// A empresa ativa fica em localStorage e segrega a visão dos cadastros.
// Por enquanto o Firestore continua usando os paths antigos (`inv_*` raiz);
// a hierarquia `/empresas/{eid}/...` entra na Fase 1.5.

import { getFb } from './firebase';

export type PapelMembro = 'admin' | 'editor' | 'viewer';

export interface Empresa {
  id: string;
  nome: string;
  criadoPor: string;       // uid do criador
  criadoEm: string;
  membros: Record<string, PapelMembro>;  // uid → papel
}

const K_EMPRESAS = 'inv_empresas';
const K_ATIVA = 'inv_empresa_ativa';
const K_UID_LOCAL = 'inv_uid_local';

function load<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(key) ?? '[]'); } catch { return []; }
}
function save<T>(key: string, data: T[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(data));
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

// UID do usuário atual. Se Firebase ativo, usa o uid de auth; senão, um uid
// local persistido (anônimo, só pra fins de "dono" antes de auth).
export function uidUsuario(): string {
  if (typeof window === 'undefined') return 'srv';
  try {
    const fb = getFb();
    const auth = (fb as { auth?: { currentUser?: { uid?: string } } } | null)?.auth;
    if (auth?.currentUser?.uid) return auth.currentUser.uid;
  } catch {}
  let local = localStorage.getItem(K_UID_LOCAL);
  if (!local) {
    local = 'local-' + uid();
    localStorage.setItem(K_UID_LOCAL, local);
  }
  return local;
}

// CRUD básico
export function getEmpresas(): Empresa[] {
  return load<Empresa>(K_EMPRESAS).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function getEmpresasDoUsuario(uidLocal = uidUsuario()): Empresa[] {
  return getEmpresas().filter(e => e.membros && e.membros[uidLocal]);
}

export function getEmpresa(id: string): Empresa | undefined {
  return load<Empresa>(K_EMPRESAS).find(e => e.id === id);
}

export function saveEmpresa(e: Omit<Empresa, 'id' | 'criadoEm'>): Empresa {
  const lista = load<Empresa>(K_EMPRESAS);
  const nova: Empresa = { ...e, id: uid(), criadoEm: new Date().toISOString() };
  lista.push(nova);
  save(K_EMPRESAS, lista);
  return nova;
}

export function updateEmpresa(id: string, patch: Partial<Omit<Empresa, 'id' | 'criadoEm'>>) {
  const lista = load<Empresa>(K_EMPRESAS);
  const idx = lista.findIndex(e => e.id === id);
  if (idx >= 0) { lista[idx] = { ...lista[idx], ...patch }; save(K_EMPRESAS, lista); }
}

export function deleteEmpresa(id: string) {
  save(K_EMPRESAS, load<Empresa>(K_EMPRESAS).filter(e => e.id !== id));
  if (empresaAtivaId() === id) {
    const restantes = getEmpresasDoUsuario();
    setEmpresaAtivaId(restantes[0]?.id ?? null);
  }
}

// Empresa ativa
export function empresaAtivaId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(K_ATIVA);
}

export function empresaAtiva(): Empresa | null {
  const id = empresaAtivaId();
  return id ? (getEmpresa(id) ?? null) : null;
}

export function setEmpresaAtivaId(id: string | null) {
  if (typeof window === 'undefined') return;
  if (id) localStorage.setItem(K_ATIVA, id); else localStorage.removeItem(K_ATIVA);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('inv:empresa'));
}

// Papéis
export function papelDoUsuario(e: Empresa | null, uidLocal = uidUsuario()): PapelMembro | null {
  return e?.membros?.[uidLocal] ?? null;
}
export function ehAdmin(e: Empresa | null, uidLocal = uidUsuario()): boolean {
  return papelDoUsuario(e, uidLocal) === 'admin';
}
export function podeEditar(e: Empresa | null, uidLocal = uidUsuario()): boolean {
  const p = papelDoUsuario(e, uidLocal);
  return p === 'admin' || p === 'editor';
}

// Boot — chamada uma vez por sessão (idempotente).
// Garante Empresa Pessoal + ativa caso o usuário ainda não tenha nenhuma.
export function empresaIfEmpty() {
  if (typeof window === 'undefined') return;
  const u = uidUsuario();
  const minhas = getEmpresasDoUsuario(u);
  if (minhas.length === 0) {
    const sufixo = u.slice(-5);
    const nova = saveEmpresa({
      nome: `Empresa Pessoal — ${sufixo}`,
      criadoPor: u,
      membros: { [u]: 'admin' },
    });
    setEmpresaAtivaId(nova.id);
    return;
  }
  // Se há empresas mas nenhuma ativa, ativa a primeira
  if (!empresaAtivaId()) setEmpresaAtivaId(minhas[0].id);
}

// Membros (CRUD)
export function adicionarMembro(empresaId: string, uidNovo: string, papel: PapelMembro = 'editor') {
  const e = getEmpresa(empresaId);
  if (!e) return;
  const membros = { ...e.membros, [uidNovo]: papel };
  updateEmpresa(empresaId, { membros });
}
export function trocarPapelMembro(empresaId: string, uidAlvo: string, papel: PapelMembro) {
  const e = getEmpresa(empresaId);
  if (!e || !e.membros[uidAlvo]) return;
  updateEmpresa(empresaId, { membros: { ...e.membros, [uidAlvo]: papel } });
}
export function removerMembro(empresaId: string, uidAlvo: string) {
  const e = getEmpresa(empresaId);
  if (!e) return;
  // não permite remover o último admin
  const novosMembros = { ...e.membros };
  delete novosMembros[uidAlvo];
  const aindaTemAdmin = Object.values(novosMembros).some(p => p === 'admin');
  if (!aindaTemAdmin) return;
  updateEmpresa(empresaId, { membros: novosMembros });
}
