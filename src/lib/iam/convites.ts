'use client';

// IAM — convites por LINK. O administrador gera o convite, copia o link e manda
// pelo canal que quiser (WhatsApp/e-mail próprio). A pessoa abre o link, se
// cadastra e CRIA A PRÓPRIA SENHA — nenhuma senha provisória é exibida ou
// trafegada. Depois fica "Aguardando aprovação".
//
// Segurança do token: 32 bytes de crypto.getRandomValues (base64url). O gerador
// anterior era 'Inv' + Math.random() de 5 dígitos (90 mil possibilidades) —
// inaceitável para um link de acesso.

import { lerListaLocal, gravarListaLocal } from '../localComprimido';
import { cloudPushLista } from '../cloud';
import { emailUsuario } from '../empresa';
import { registrar } from './auditoria';
import type { CategoriaIam, Convite, PapelIam } from './tipos';
import { aplicarUso, statusAoVivo } from './conviteRegras';

export { statusAoVivo };

export const K_CONVITES = 'inv_convites';
export const VALIDADE_PADRAO_DIAS = 7;

const norm = (e: string) => e.trim().toLowerCase();

function gerarToken(): string {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function ler(): Convite[] { return lerListaLocal<Convite>(K_CONVITES); }
function gravar(lista: Convite[]): void {
  gravarListaLocal(K_CONVITES, lista);
  cloudPushLista(K_CONVITES, lista as unknown as { id: unknown }[]);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('inv:empresa'));
}

export function getConvites(): Convite[] {
  return ler()
    .map(c => ({ ...c, status: statusAoVivo(c) }))
    .sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? ''));
}

export function conviteDoToken(token: string): Convite | null {
  const c = ler().find(x => x.id === token);
  if (!c) return null;
  return { ...c, status: statusAoVivo(c) };
}

export function linkDoConvite(token: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}/convite?t=${token}`;
}

export function criarConvite(dados: {
  email: string; nome?: string; categoria?: CategoriaIam; papel?: PapelIam;
  dias?: number; observacao?: string;
}): Convite {
  const dias = Math.max(1, Math.min(90, Math.round(dados.dias ?? VALIDADE_PADRAO_DIAS)));
  const agora = new Date();
  const expira = new Date(agora.getTime() + dias * 86400_000);
  const c: Convite = {
    id: gerarToken(),
    email: norm(dados.email),
    nome: dados.nome?.trim() || undefined,
    categoria: dados.categoria,
    papel: dados.papel,
    criadoEm: agora.toISOString(),
    criadoPor: emailUsuario() ?? 'sistema',
    expiraEm: expira.toISOString(),
    status: 'pendente',
    observacao: dados.observacao,
  };
  const lista = ler();
  // Cancela convites pendentes anteriores do mesmo e-mail (evita 2 links vivos).
  // Os MULTIUSO ficam de fora: e-mail vazio casaria com todos eles.
  for (const x of lista) {
    if (!x.multiuso && norm(x.email) === c.email && x.status === 'pendente') {
      x.status = 'cancelado';
      x.canceladoEm = agora.toISOString();
    }
  }
  lista.push(c);
  gravar(lista);
  registrar('convite_criado', { alvo: c.email, detalhe: `validade ${dias} dia(s)` });
  return c;
}

// CONVITE DE TIPO (multiuso): um link por perfil de usuário, para mandar no
// grupo do WhatsApp dos produtores em vez de gerar um convite por pessoa.
// Cada um que abrir informa o próprio e-mail e cria a própria senha; todos caem
// em "Aguardando aprovação" já com a categoria/papel/perfil deste link — a
// aprovação continua sendo manual, o link não dá acesso a ninguém sozinho.
//
// Validade: 365 dias por padrão (renovável). Link de acesso sem prazo nenhum é
// convite para vazar num grupo e continuar valendo anos depois.
export const VALIDADE_TIPO_DIAS = 365;

export function criarConviteTipo(dados: {
  rotulo: string; categoria?: CategoriaIam; papel?: PapelIam;
  perfilId?: string; dias?: number; observacao?: string;
}): Convite {
  const dias = Math.max(1, Math.min(730, Math.round(dados.dias ?? VALIDADE_TIPO_DIAS)));
  const agora = new Date();
  const c: Convite = {
    id: gerarToken(),
    email: '',
    multiuso: true,
    rotulo: dados.rotulo.trim() || 'Convite',
    categoria: dados.categoria,
    papel: dados.papel,
    perfilId: dados.perfilId || undefined,
    usos: 0,
    criadoEm: agora.toISOString(),
    criadoPor: emailUsuario() ?? 'sistema',
    expiraEm: new Date(agora.getTime() + dias * 86400_000).toISOString(),
    status: 'pendente',
    observacao: dados.observacao,
  };
  const lista = ler();
  lista.push(c);
  gravar(lista);
  registrar('convite_criado', { alvo: `[tipo] ${c.rotulo}`, detalhe: `link reutilizável · validade ${dias} dia(s)` });
  return c;
}

// Reenviar = renovar a validade do MESMO convite (o link continua valendo).
export function reenviarConvite(id: string, dias = VALIDADE_PADRAO_DIAS): Convite | null {
  const lista = ler();
  const c = lista.find(x => x.id === id);
  if (!c) return null;
  c.expiraEm = new Date(Date.now() + Math.max(1, Math.min(90, dias)) * 86400_000).toISOString();
  c.status = 'pendente';
  gravar(lista);
  registrar('convite_reenviado', { alvo: c.email, detalhe: `nova validade ${dias} dia(s)` });
  return c;
}

export function cancelarConvite(id: string): void {
  const lista = ler();
  const c = lista.find(x => x.id === id);
  if (!c) return;
  c.status = 'cancelado';
  c.canceladoEm = new Date().toISOString();
  gravar(lista);
  registrar('convite_cancelado', { alvo: c.email });
}

export function marcarConviteUsado(id: string, emailUsado: string): void {
  const lista = ler();
  const c = lista.find(x => x.id === id);
  if (!c) return;
  const email = norm(emailUsado);
  // Regra pura (conviteRegras.aplicarUso): link de TIPO conta o uso e segue
  // valendo; convite individual é consumido.
  Object.assign(c, aplicarUso(c, email, new Date().toISOString()));
  gravar(lista);
  registrar('convite_usado', { alvo: email, detalhe: c.multiuso ? `link "${c.rotulo}"` : undefined });
}

// Validação usada pela página pública /convite.
export type ResultadoValidacao =
  | { ok: true; convite: Convite }
  | { ok: false; motivo: 'inexistente' | 'expirado' | 'cancelado' | 'usado' };

export function validarConvite(token: string): ResultadoValidacao {
  const c = conviteDoToken(token);
  if (!c) return { ok: false, motivo: 'inexistente' };
  if (c.status === 'cancelado') return { ok: false, motivo: 'cancelado' };
  if (c.status === 'usado') return { ok: false, motivo: 'usado' };
  if (c.status === 'expirado') return { ok: false, motivo: 'expirado' };
  return { ok: true, convite: c };
}

export const MOTIVO_TEXTO: Record<'inexistente' | 'expirado' | 'cancelado' | 'usado', string> = {
  inexistente: 'Este link de convite não existe. Confira se copiou o endereço inteiro.',
  expirado:    'Este convite expirou. Peça um novo link ao administrador.',
  cancelado:   'Este convite foi cancelado. Peça um novo link ao administrador.',
  usado:       'Este convite já foi utilizado. Se já se cadastrou, é só entrar com seu e-mail e senha.',
};
