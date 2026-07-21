'use client';

// Conceito de Empresa (multi-tenant) — Fase 1.A da reorganização.
//
// Cada usuário tem ao menos uma "Empresa Pessoal" auto-criada no 1º boot.
// A empresa ativa fica em localStorage e segrega a visão dos cadastros.
// A nuvem (Supabase) usa as chaves `inv_*` como coleções (via cloud.ts);
// a hierarquia `/empresas/{eid}/...` entra na Fase 1.5.

import { usuarioAtual, authConfigurado } from './auth';
import { cloudPushLista } from './cloud';
import { lerListaLocal } from './localComprimido';

export type PapelMembro = 'owner' | 'admin' | 'agronomo' | 'operador' | 'produtor' | 'prestador' | 'editor' | 'viewer';

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
export interface RegistroPapel {
  id: string; email: string; papel: PapelMembro; senhaProvisoria?: boolean;
  clienteId?: string;  // produtor: qual Cliente ele é (escopo do portal)
  planoId?: string;    // produtor: qual plano de assinatura (seções liberadas)
  clientesVinculados?: string[]; // agrônomo/operador: clientes que ele pode acessar (vazio = todos)
  talhoesVinculados?: string[];  // restringe AINDA MAIS dentro dos clientes permitidos; vazio/ausente = todos os talhões dos clientes visíveis
  validadeAte?: string;  // prestador: ISO date; login expira nesta data (ausente = nunca expira)
}
// Alias público (nome usado pela UI/consumidores). Mesma forma de RegistroPapel.
export type PapelUsuario = RegistroPapel;
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
  cloudPushLista(key, data as { id: unknown }[]); // espelha na nuvem (no-op sem Supabase configurado)
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

// Id de "dono" ESTÁVEL derivado do e-mail — independe do provedor de auth, então
// sobrevive à troca Firebase→Supabase (o uid do provedor MUDA; o e-mail não).
export function idDonoEmail(email: string): string {
  return 'email:' + normEmail(email);
}

// UID/"dono" do usuário atual. Logado → id por E-MAIL (estável entre provedores).
// Sem login → uid local persistido (anônimo, só pra fins de "dono" antes de auth).
export function uidUsuario(): string {
  if (typeof window === 'undefined') return 'srv';
  try {
    const email = usuarioAtual()?.email;
    if (email) return idDonoEmail(email);
  } catch {}
  let local = localStorage.getItem(K_UID_LOCAL);
  if (!local) {
    local = 'local-' + uid();
    localStorage.setItem(K_UID_LOCAL, local);
  }
  return local;
}

// Ids ANTIGOS do dono (uid do provedor + uid local persistido) e o id NOVO por
// e-mail. Usado pela migração que re-chaveia a Biblioteca pessoal (donoUsuarioId)
// quando o uid muda. Roda no boot com uid+e-mail do usuário logado.
export function idsReKeyDono(): { oldIds: string[]; newId: string } | null {
  if (typeof window === 'undefined') return null;
  const email = emailUsuario();
  if (!email) return null;
  const newId = idDonoEmail(email);
  const provUid = usuarioAtual()?.uid ?? '';
  const localUid = localStorage.getItem(K_UID_LOCAL) ?? '';
  const oldIds = [provUid, localUid].filter(x => x && x !== newId);
  return { oldIds, newId };
}

// E-mail do usuário autenticado (minúsculo). null se não logado (modo local).
export function emailUsuario(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const email = usuarioAtual()?.email;
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
export function definirPapelEmail(
  email: string, papel: PapelMembro,
  extra?: { senhaProvisoria?: boolean; clienteId?: string; planoId?: string; clientesVinculados?: string[]; talhoesVinculados?: string[]; validadeAte?: string },
) {
  const e = normEmail(email);
  if (!e) return;
  const lista = load<RegistroPapel>(K_PAPEIS);
  const idx = lista.findIndex(p => p.email === e);
  const patch = { papel, ...(extra ?? {}) };
  if (idx >= 0) lista[idx] = { ...lista[idx], ...patch };
  else lista.push({ id: e, email: e, ...patch });
  save(K_PAPEIS, lista);
}

// Registro de papel do usuário logado (produtor: traz clienteId/planoId).
export function meuRegistro(): RegistroPapel | null {
  const email = emailUsuario();
  if (!email) return null;
  return getPapeis().find(p => p.email === email) ?? null;
}

// 1º acesso: o usuário convidado precisa trocar a senha provisória.
export function precisaTrocarSenha(): boolean {
  const email = emailUsuario();
  if (!email) return false;
  return getPapeis().find(p => p.email === email)?.senhaProvisoria === true;
}
export function limparSenhaProvisoria() {
  const email = emailUsuario();
  if (!email) return;
  const lista = load<RegistroPapel>(K_PAPEIS);
  const idx = lista.findIndex(p => p.email === email);
  if (idx >= 0 && lista[idx].senhaProvisoria) { lista[idx] = { ...lista[idx], senhaProvisoria: false }; save(K_PAPEIS, lista); }
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

// ── Categorias de usuário (derivadas do papel) ───────────────────────────────
// Agrupa os papéis em 3 baldes para a UI de gestão de usuários.
export type CategoriaUsuario = 'equipe' | 'produtores' | 'prestadores';
export function categoriaDoPapel(p: PapelMembro): CategoriaUsuario {
  if (p === 'produtor') return 'produtores';
  if (p === 'prestador') return 'prestadores';
  return 'equipe'; // owner/admin/agronomo/operador/editor/viewer
}
export const NOME_CATEGORIA: Record<CategoriaUsuario, string> = {
  equipe: 'Equipe interna',
  produtores: 'Produtores',
  prestadores: 'Prestadores de serviço',
};

// ── Validade de login (prestadores) ──────────────────────────────────────────
// Fim do dia local a partir de "hoje + dias" (inclusivo — vale o dia inteiro).
function fimDoDiaEmDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}
// Renova (ou define) a validade do login por N dias, contando HOJE como o 1º:
// validadeAte = fim do dia de hoje + (dias - 1). Assim "renovar 30" exibe
// "expira em 30 dias" (o Math.ceil de diasRestantes conta o resto de hoje como 1)
// e "1 dia" vale só até o fim de hoje.
export function renovarValidade(email: string, dias: number) {
  const e = normEmail(email);
  if (!e) return;
  const lista = load<RegistroPapel>(K_PAPEIS);
  const idx = lista.findIndex(p => p.email === e);
  if (idx < 0) return;
  lista[idx] = { ...lista[idx], validadeAte: fimDoDiaEmDias(Math.max(1, dias) - 1) };
  save(K_PAPEIS, lista);
}
// Login expirado? SÓ true se houver validadeAte no passado (sem validade = nunca).
export function loginExpirado(p: PapelUsuario | null | undefined): boolean {
  if (!p?.validadeAte) return false;
  const t = Date.parse(p.validadeAte);
  return Number.isFinite(t) && t < Date.now();
}
// Dias inteiros até expirar (null sem validade; negativo se já expirado).
export function diasRestantes(p: PapelUsuario): number | null {
  if (!p.validadeAte) return null;
  const t = Date.parse(p.validadeAte);
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - Date.now()) / 86_400_000);
}

// ── Capacidades / Permissões por papel (U2 — configurável pelo Owner) ────────
const K_PERMISSOES = 'inv_permissoes';

export type Capacidade =
  | 'cadastro' | 'excluirProdutor' | 'amostragem' | 'importarLaudo'
  | 'fertilidade' | 'ndvi' | 'recomendacoes' | 'biblioteca' | 'relatorios';

export const CAPACIDADES: Array<{ id: Capacidade; label: string; curto: string }> = [
  { id: 'cadastro', label: 'Cadastrar/editar Cliente·Fazenda·Talhão', curto: 'Cadastro' },
  { id: 'excluirProdutor', label: 'Excluir produtor', curto: 'Excluir produtor' },
  { id: 'amostragem', label: 'Amostragem (grades, etiquetas, SHP/KML)', curto: 'Amostragem' },
  { id: 'importarLaudo', label: 'Importar laudo de laboratório', curto: 'Importar laudo' },
  { id: 'fertilidade', label: 'Processar fertilidade (interpolar/zona)', curto: 'Fertilidade' },
  { id: 'ndvi', label: 'Gerar mapas de NDVI / satélite', curto: 'NDVI' },
  { id: 'recomendacoes', label: 'Recomendações (simular/cenários/arquivos)', curto: 'Recomendações' },
  { id: 'biblioteca', label: 'Biblioteca (criar/editar)', curto: 'Biblioteca' },
  { id: 'relatorios', label: 'Gerar relatórios (PDF)', curto: 'Relatórios' },
];

// Papéis atribuíveis na UI (Owner sempre tudo; Amostrador = fase futura).
export const PAPEIS_ATRIBUIVEIS: PapelMembro[] = ['owner', 'admin', 'agronomo', 'operador', 'produtor', 'prestador'];
export const ROTULO_PAPEL: Record<string, string> = {
  owner: 'Owner', admin: 'Admin', agronomo: 'Agrônomo', operador: 'Operador de campo', produtor: 'Produtor', prestador: 'Prestador de serviço', editor: 'Editor', viewer: 'Viewer',
};
// Rótulo curto p/ cabeçalhos estreitos (matriz de permissões).
export const ROTULO_CURTO: Record<string, string> = {
  owner: 'Owner', admin: 'Admin', agronomo: 'Agrôn.', operador: 'Oper.', produtor: 'Produtor', prestador: 'Prestador', editor: 'Editor', viewer: 'Viewer',
};

type Caps = Record<Capacidade, boolean>;
const TODAS = (v: boolean): Caps => ({ cadastro: v, excluirProdutor: v, amostragem: v, importarLaudo: v, fertilidade: v, ndvi: v, recomendacoes: v, biblioteca: v, relatorios: v });
const DEFAULTS_PERMISSOES: Record<string, Caps> = {
  owner: TODAS(true),
  admin: TODAS(true),
  agronomo: { ...TODAS(false), ndvi: true, recomendacoes: true, relatorios: true },
  operador: { ...TODAS(false), amostragem: true },
  prestador: { ...TODAS(false), amostragem: true }, // prestador de coleta: só amostragem (app de campo)
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
// Modo LOCAL (sem auth configurado, ex.: demo) não tem papéis — libera tudo.
export function pode(cap: Capacidade, papel: PapelMembro | null = papelDoUsuario()): boolean {
  if (!authConfigurado) return true;
  if (!papel) return false;
  if (papel === 'owner') return true;
  return getPermissoes()[papel]?.[cap] ?? DEFAULTS_PERMISSOES[papel]?.[cap] ?? false;
}

// ── Planos de assinatura do Produtor (U3.B — editáveis pelo Owner) ───────────
// Cada plano (nome editável) libera um conjunto de SEÇÕES do portal (= abas da
// página do talhão que têm dado pronto). O produtor é read-only.
const K_PLANOS = 'inv_planos';

export type SecaoPortal = 'resumo' | 'fertilidade' | 'amostragem' | 'recomendacoes' | 'compactacao' | 'relatorios' | 'arquivos';
export const SECOES_PORTAL: Array<{ id: SecaoPortal; label: string }> = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'fertilidade', label: 'Fertilidade (mapas)' },
  { id: 'amostragem', label: 'Amostragem' },
  { id: 'recomendacoes', label: 'Recomendações' },
  { id: 'compactacao', label: 'Compactação' },
  { id: 'relatorios', label: 'Relatórios' },
  { id: 'arquivos', label: 'Arquivos' },
];
export interface PlanoAssinatura { id: string; nome: string; secoes: Record<string, boolean>; }

const secoesDe = (ids: SecaoPortal[]): Record<string, boolean> =>
  Object.fromEntries(SECOES_PORTAL.map(s => [s.id, ids.includes(s.id)]));
const PLANOS_SEED: PlanoAssinatura[] = [
  { id: 'basico', nome: 'Básico', secoes: secoesDe(['resumo', 'fertilidade']) },
  { id: 'intermediario', nome: 'Intermediário', secoes: secoesDe(['resumo', 'fertilidade', 'recomendacoes', 'compactacao']) },
  { id: 'completo', nome: 'Completo', secoes: secoesDe(['resumo', 'fertilidade', 'amostragem', 'recomendacoes', 'compactacao', 'relatorios', 'arquivos']) },
];

export function getPlanos(): PlanoAssinatura[] { return load<PlanoAssinatura>(K_PLANOS); }
export function planoPorId(id: string | undefined): PlanoAssinatura | null {
  if (!id) return null;
  return getPlanos().find(p => p.id === id) ?? null;
}
export function seedPlanos() {
  const lista = load<PlanoAssinatura>(K_PLANOS);
  let mudou = false;
  for (const s of PLANOS_SEED) {
    if (!lista.some(p => p.id === s.id)) { lista.push({ ...s, secoes: { ...s.secoes } }); mudou = true; }
  }
  if (mudou) save(K_PLANOS, lista);
}
export function salvarPlano(p: { nome: string; secoes?: Record<string, boolean> }): PlanoAssinatura {
  const lista = load<PlanoAssinatura>(K_PLANOS);
  const novo: PlanoAssinatura = { id: 'plano-' + uid(), nome: p.nome.trim() || 'Plano', secoes: p.secoes ?? secoesDe(['resumo']) };
  lista.push(novo);
  save(K_PLANOS, lista);
  return novo;
}
export function atualizarPlano(id: string, patch: Partial<Omit<PlanoAssinatura, 'id'>>) {
  const lista = load<PlanoAssinatura>(K_PLANOS);
  const idx = lista.findIndex(p => p.id === id);
  if (idx >= 0) { lista[idx] = { ...lista[idx], ...patch }; save(K_PLANOS, lista); }
}
export function excluirPlano(id: string) {
  save(K_PLANOS, load<PlanoAssinatura>(K_PLANOS).filter(p => p.id !== id));
}
export function toggleSecaoPlano(id: string, secao: SecaoPortal, valor: boolean) {
  const lista = load<PlanoAssinatura>(K_PLANOS);
  const idx = lista.findIndex(p => p.id === id);
  if (idx >= 0) { lista[idx] = { ...lista[idx], secoes: { ...lista[idx].secoes, [secao]: valor } }; save(K_PLANOS, lista); }
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

// ── Escopo por VÍNCULO (consultoria) ─────────────────────────────────────────
// Quais CLIENTES o usuário logado pode enxergar. `null` = sem restrição (vê
// todos). Owner/Admin/Editor sempre veem tudo. Produtor vê só o próprio cliente.
// Agrônomo/Operador: se tiverem clientes vinculados, só esses; se NÃO tiverem
// nenhum vínculo definido, mantêm acesso total (retrocompatível — nada quebra
// até você atribuir vínculos). Usado por getClientes/getFazendas/getTalhoes.
export function escopoClienteIds(): Set<string> | null {
  const papel = papelDoUsuario();
  if (!papel || papel === 'owner' || papel === 'admin' || papel === 'editor') return null;
  const reg = meuRegistro();
  if (papel === 'produtor') return new Set(reg?.clienteId ? [reg.clienteId] : []);
  const vinc = reg?.clientesVinculados;
  return vinc && vinc.length ? new Set(vinc) : null;
}

// Quais TALHÕES o usuário logado pode enxergar (granularidade fina DENTRO dos
// clientes já permitidos por escopoClienteIds). `null` = sem restrição por
// talhão. Owner/Admin/Editor sempre null. Qualquer papel não-privilegiado
// (agrônomo/operador/prestador/produtor) fica restrito SÓ SE tiver
// `talhoesVinculados` não-vazio; senão null (retrocompatível — nada muda até
// você atribuir vínculos de talhão). Usado por getTalhoes.
export function escopoTalhaoIds(): Set<string> | null {
  const papel = papelDoUsuario();
  if (!papel || papel === 'owner' || papel === 'admin' || papel === 'editor') return null;
  const reg = meuRegistro();
  const vinc = reg?.talhoesVinculados;
  return vinc && vinc.length ? new Set(vinc) : null;
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
    // lerListaLocal (e não o load local, que faz JSON.parse cru do localStorage):
    // inv_talhoes é chave PESADA — o parse cru já falhava silencioso com o valor
    // comprimido @@LZ@@ (contava 0) e pós-migração a chave vive na memória/IDB.
    for (const r of lerListaLocal<{ empresaId?: string }>(key)) {
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
