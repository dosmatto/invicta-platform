'use client';

// Conceito de Empresa (multi-tenant) — Fase 1.A da reorganização.
//
// Cada usuário tem ao menos uma "Empresa Pessoal" auto-criada no 1º boot.
// A empresa ativa fica em localStorage e segrega a visão dos cadastros.
// Por enquanto o Firestore continua usando os paths antigos (`inv_*` raiz);
// a hierarquia `/empresas/{eid}/...` entra na Fase 1.5.

import { getFb } from './firebase';
import { cloudPushLista } from './cloud';

export type PapelMembro = 'owner' | 'admin' | 'agronomo' | 'operador' | 'editor' | 'viewer';

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
const K_PAPEIS = 'inv_papeis';

// Papéis por E-MAIL (fonte da verdade, sincronizada). Substitui a antiga
// "auto-promoção a admin" (todo login virava admin). Quem não está na lista =
// sem papel = acesso bloqueado. Owner é o nível máximo.
export interface RegistroPapel { id: string; email: string; papel: PapelMembro; }
const PAPEIS_SEED: Array<{ email: string; papel: PapelMembro }> = [
  { email: 'william@invicta.agr.br', papel: 'owner' },
  { email: 'jhon@invicta.agr.br', papel: 'admin' },
];
const normEmail = (e: string) => e.trim().toLowerCase();

function load<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(key) ?? '[]'); } catch { return []; }
}
function save<T>(key: string, data: T[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(data));
  cloudPushLista(key, data as { id: unknown }[]); // espelha empresas na nuvem (no-op sem Firebase/login)
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

// E-mail do usuário autenticado (minúsculo). null se não logado (modo local).
export function emailUsuario(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const fb = getFb();
    const auth = (fb as { auth?: { currentUser?: { email?: string | null } } } | null)?.auth;
    const email = auth?.currentUser?.email;
    return email ? normEmail(email) : null;
  } catch { return null; }
}

// ── Papéis por e-mail (inv_papeis) ──────────────────────────────────────────
export function getPapeis(): RegistroPapel[] {
  return load<RegistroPapel>(K_PAPEIS).sort((a, b) => a.email.localeCompare(b.email));
}
export function papelDoEmail(email: string | null): PapelMembro | null {
  if (!email) return null;
  const e = normEmail(email);
  return getPapeis().find(p => p.email === e)?.papel ?? null;
}
export function definirPapelEmail(email: string, papel: PapelMembro) {
  const e = normEmail(email);
  if (!e) return;
  const lista = load<RegistroPapel>(K_PAPEIS);
  const idx = lista.findIndex(p => p.email === e);
  if (idx >= 0) lista[idx] = { ...lista[idx], papel };
  else lista.push({ id: e, email: e, papel });
  save(K_PAPEIS, lista);
}
export function removerPapelEmail(email: string) {
  const e = normEmail(email);
  save(K_PAPEIS, load<RegistroPapel>(K_PAPEIS).filter(p => p.email !== e));
}
// Garante owner/admin oficiais (idempotente; rede de segurança contra lockout do
// owner). Roda no boot DEPOIS de hidratar a nuvem.
export function seedPapeis() {
  const lista = load<RegistroPapel>(K_PAPEIS);
  let mudou = false;
  for (const s of PAPEIS_SEED) {
    if (!lista.some(p => p.email === s.email)) { lista.push({ id: s.email, email: s.email, papel: s.papel }); mudou = true; }
  }
  if (mudou) save(K_PAPEIS, lista);
}

// ── Capacidades / Permissões por papel (U2 — configurável pelo Owner) ────────
const K_PERMISSOES = 'inv_permissoes';

export type Capacidade =
  | 'cadastro' | 'excluirProdutor' | 'amostragem' | 'importarLaudo'
  | 'fertilidade' | 'recomendacoes' | 'biblioteca' | 'relatorios';

export const CAPACIDADES: Array<{ id: Capacidade; label: string }> = [
  { id: 'cadastro', label: 'Cadastrar/editar Cliente·Fazenda·Talhão' },
  { id: 'excluirProdutor', label: 'Excluir produtor' },
  { id: 'amostragem', label: 'Amostragem (grades, etiquetas, SHP/KML)' },
  { id: 'importarLaudo', label: 'Importar laudo de laboratório' },
  { id: 'fertilidade', label: 'Processar fertilidade (interpolar/zona)' },
  { id: 'recomendacoes', label: 'Recomendações (simular/cenários/arquivos)' },
  { id: 'biblioteca', label: 'Biblioteca (criar/editar)' },
  { id: 'relatorios', label: 'Gerar relatórios (PDF)' },
];

// Papéis atribuíveis na UI (Owner sempre tudo; Produtor/Amostrador = fases U3).
export const PAPEIS_ATRIBUIVEIS: PapelMembro[] = ['owner', 'admin', 'agronomo', 'operador'];
export const ROTULO_PAPEL: Record<string, string> = {
  owner: 'Owner', admin: 'Admin', agronomo: 'Agrônomo', operador: 'Operador de campo', editor: 'Editor', viewer: 'Viewer',
};

type Caps = Record<Capacidade, boolean>;
const TODAS = (v: boolean): Caps => ({ cadastro: v, excluirProdutor: v, amostragem: v, importarLaudo: v, fertilidade: v, recomendacoes: v, biblioteca: v, relatorios: v });
const DEFAULTS_PERMISSOES: Record<string, Caps> = {
  owner: TODAS(true),
  admin: TODAS(true),
  agronomo: { ...TODAS(false), recomendacoes: true, relatorios: true },
  operador: { ...TODAS(false), amostragem: true },
  editor: TODAS(true),    // legado
  viewer: TODAS(false),   // legado
};

export interface RegistroPermissao { id: string; caps: Caps; } // id = papel

// Config efetiva (defaults sobrescritos pelo que o Owner salvou).
export function getPermissoes(): Record<string, Caps> {
  const out: Record<string, Caps> = {};
  for (const p of Object.keys(DEFAULTS_PERMISSOES)) out[p] = { ...DEFAULTS_PERMISSOES[p] };
  for (const r of load<RegistroPermissao>(K_PERMISSOES)) out[r.id] = { ...(out[r.id] ?? TODAS(false)), ...r.caps };
  return out;
}
export function seedPermissoes() {
  const lista = load<RegistroPermissao>(K_PERMISSOES);
  let mudou = false;
  for (const papel of PAPEIS_ATRIBUIVEIS) {
    if (!lista.some(r => r.id === papel)) { lista.push({ id: papel, caps: { ...DEFAULTS_PERMISSOES[papel] } }); mudou = true; }
  }
  if (mudou) save(K_PERMISSOES, lista);
}
export function definirPermissao(papel: PapelMembro, cap: Capacidade, valor: boolean) {
  const lista = load<RegistroPermissao>(K_PERMISSOES);
  const idx = lista.findIndex(r => r.id === papel);
  const base = idx >= 0 ? lista[idx].caps : { ...(DEFAULTS_PERMISSOES[papel] ?? TODAS(false)) };
  const caps = { ...base, [cap]: valor };
  if (idx >= 0) lista[idx] = { ...lista[idx], caps };
  else lista.push({ id: papel, caps });
  save(K_PERMISSOES, lista);
}

// O usuário logado tem a capacidade? Owner sempre sim; sem papel (bloqueado) = não.
export function pode(cap: Capacidade, papel: PapelMembro | null = papelDoUsuario()): boolean {
  if (!papel) return false;
  if (papel === 'owner') return true;
  return getPermissoes()[papel]?.[cap] ?? DEFAULTS_PERMISSOES[papel]?.[cap] ?? false;
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

// Papéis — agora resolvidos pelo E-MAIL do usuário logado (inv_papeis), não mais
// pela membros[uid] da empresa. O parâmetro Empresa é ignorado (mantido só p/
// compatibilidade com os call sites existentes). Dados são single-tenant
// (loadFiltrado desligado), então papel e visibilidade são independentes.
export function papelDoUsuario(_e?: Empresa | null): PapelMembro | null {
  return papelDoEmail(emailUsuario());
}
export function ehOwner(_e?: Empresa | null): boolean {
  return papelDoUsuario() === 'owner';
}
export function ehAdmin(_e?: Empresa | null): boolean {
  const p = papelDoUsuario();
  return p === 'owner' || p === 'admin';
}
export function podeEditar(_e?: Empresa | null): boolean {
  const p = papelDoUsuario();
  return p === 'owner' || p === 'admin' || p === 'editor';
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

// Herança de empresa: o usuário logado vira admin de TODAS as empresas
// existentes (chamado depois do boot da nuvem, com as empresas já hidratadas).
// Resolve a transição anônimo→e-mail: os dados ficavam "presos" à empresa do
// usuário anônimo e os usuários reais não a viam. Simplificação single-tenant
// (uma empresa/companhia); a segregação por empresa real fica para a Fase 1.5.
export function adotarEmpresasLocais(uid: string) {
  if (typeof window === 'undefined' || !uid) return;
  const lista = load<Empresa>(K_EMPRESAS);
  let mudou = false;
  for (const e of lista) {
    if (!e.membros?.[uid]) {
      e.membros = { ...(e.membros ?? {}), [uid]: 'admin' };
      mudou = true;
    }
  }
  if (mudou) save(K_EMPRESAS, lista);
}

// ── Empresa padrão "Invicta" (single-tenant) ───────────────────────────────
// Renomeia a empresa que concentra os cadastros para "Invicta" e a define como
// ativa quando não há uma escolha válida (default inteligente). Idempotente;
// roda no login depois do boot da nuvem (a renomeação persiste pelo sync).
const NOME_PADRAO_EMPRESA = 'Invicta';

function contarCadastrosPorEmpresa(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of ['inv_clientes', 'inv_fazendas', 'inv_talhoes']) {
    for (const r of load<{ empresaId?: string }>(key)) {
      if (r.empresaId) out[r.empresaId] = (out[r.empresaId] ?? 0) + 1;
    }
  }
  return out;
}

export function garantirEmpresaInvicta(uidLogado = uidUsuario()) {
  if (typeof window === 'undefined' || !uidLogado) return;
  const lista = load<Empresa>(K_EMPRESAS);
  if (lista.length === 0) return; // sem empresas: empresaIfEmpty cuida

  const contagem = contarCadastrosPorEmpresa();
  // Canônica: já chamada "Invicta" > a com mais cadastros > a mais antiga.
  let canonica = lista.find(e => e.nome.trim().toLowerCase() === NOME_PADRAO_EMPRESA.toLowerCase());
  if (!canonica) {
    canonica = [...lista].sort((a, b) =>
      (contagem[b.id] ?? 0) - (contagem[a.id] ?? 0) ||
      new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime()
    )[0];
  }
  if (!canonica) return;

  // Renomeia para "Invicta" + garante o usuário como admin (persiste na nuvem).
  let mudou = false;
  if (canonica.nome !== NOME_PADRAO_EMPRESA) { canonica.nome = NOME_PADRAO_EMPRESA; mudou = true; }
  if (!canonica.membros?.[uidLogado]) { canonica.membros = { ...(canonica.membros ?? {}), [uidLogado]: 'admin' }; mudou = true; }
  if (mudou) save(K_EMPRESAS, lista);

  // Default inteligente: só ativa a Invicta se a ativa atual for inválida/vazia.
  const ativaId = empresaAtivaId();
  const ativa = ativaId ? lista.find(e => e.id === ativaId) : undefined;
  const ativaValida = !!ativa && !!ativa.membros?.[uidLogado] && (contagem[ativa.id] ?? 0) > 0;
  if (!ativaValida) setEmpresaAtivaId(canonica.id);
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
