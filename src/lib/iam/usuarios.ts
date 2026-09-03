'use client';

// IAM — usuários. Opera sobre a MESMA lista `inv_papeis` (fonte da verdade de
// acesso), agora com os campos de perfil/status/permissões. Estender em vez de
// criar outra coleção evita migração destrutiva: registro antigo continua
// válido, os campos novos entram conforme forem sendo usados.

import { lerListaLocal, gravarListaLocal } from '../localComprimido';
import { cloudPushLista } from '../cloud';
import { usarDadosSupabase, carregarDocsPorCampoSupabase, salvarDocSupabase } from '../supabaseData';
import { emailUsuario, type RegistroPapel } from '../empresa';
import { registrar } from './auditoria';
import { MATRIZ_PADRAO, permissoesEfetivas } from './permissoes';
import type {
  CamposIam, CategoriaIam, MapaPermissoes, PapelIam, StatusIam,
} from './tipos';

export const K_PAPEIS = 'inv_papeis';
export type UsuarioIam = RegistroPapel & CamposIam;

const norm = (e: string) => e.trim().toLowerCase();

function ler(): UsuarioIam[] { return lerListaLocal<UsuarioIam>(K_PAPEIS); }
function gravar(lista: UsuarioIam[]): void {
  gravarListaLocal(K_PAPEIS, lista);
  cloudPushLista(K_PAPEIS, lista as unknown as { id: unknown }[]);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('inv:empresa'));
}

export function getUsuarios(): UsuarioIam[] {
  return ler().sort((a, b) =>
    (a.nome || a.email || '').localeCompare(b.nome || b.email || '', 'pt-BR'));
}
export function getUsuario(email: string): UsuarioIam | null {
  const e = norm(email);
  return ler().find(u => norm(u.email) === e) ?? null;
}

/**
 * Traz da NUVEM os cadastros que estão aguardando aprovação. Devolve quantos
 * eram desconhecidos neste aparelho.
 *
 * POR QUE EXISTE: quem se cadastra pelo link grava o pedido no aparelho DELE; a
 * Central de Acessos só relia `inv_papeis` do localStorage, e nada no app relê a
 * nuvem depois do boot (o único retry periódico é de ESCRITA). Com a aba aberta
 * — o normal de quem administra — o pedido não aparecia nunca.
 *
 * Leitura PONTUAL e sem push: mescla no espelho local e avisa a UI. Só ACRESCENTA
 * e-mails desconhecidos; jamais rebaixa um registro que já existe aqui, para uma
 * aprovação recém-feita (e ainda não sincronizada) não voltar para a fila.
 */
/**
 * Grava o PRÓPRIO pedido de acesso: no aparelho e como UM documento na nuvem.
 * Devolve `false` quando a nuvem recusou (aí não há o que aprovar do outro lado).
 *
 * POR QUE NÃO USA `salvarUsuario`: aquele caminho manda a LISTA INTEIRA de
 * `inv_papeis` (cloudPushLista → syncLista), e a exceção de RLS do auto-cadastro
 * só autoriza a linha do PRÓPRIO e-mail. Num aparelho que já abriu a plataforma
 * alguma vez — o celular de quem já é usuário, por exemplo — a lista local traz
 * também os registros das outras pessoas, e o Postgres recusa o comando INTEIRO
 * (42501): o pedido não era gravado e nada aparecia para aprovar. Num navegador
 * virgem a lista tem só um registro e passava — daí o defeito ser intermitente.
 *
 * Um documento por vez é o que a política permite e é tudo de que a tela do
 * convite precisa. Ver docs/seguranca-rls.sql (app_kv_insert_autocadastro) e
 * npm run teste:autocadastro (passo D).
 */
export async function registrarPedidoDeAcesso(
  email: string, patch: Partial<UsuarioIam>,
): Promise<boolean> {
  const e = norm(email);
  const lista = ler();
  const i = lista.findIndex(u => norm(u.email) === e);
  const registro = (i >= 0
    ? { ...lista[i], ...patch, id: lista[i].id || e, email: e }
    : {
        id: e, email: e, papel: patch.papel ?? 'leitor',
        criadoEm: new Date().toISOString(), criadoPor: e, ...patch,
      }) as UsuarioIam;
  if (i >= 0) lista[i] = registro; else lista.push(registro);
  gravarListaLocal(K_PAPEIS, lista);   // local sim; push da LISTA não (ver acima)
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('inv:empresa'));
  if (!usarDadosSupabase()) return true;
  return salvarDocSupabase(K_PAPEIS, e, registro);
}

/**
 * Traz da NUVEM os cadastros que estão aguardando aprovação. Devolve quantos
 * eram desconhecidos neste aparelho.
 *
 * POR QUE EXISTE: quem se cadastra pelo link grava o pedido no aparelho DELE; a
 * Central de Acessos só relia `inv_papeis` do localStorage, e nada no app relê a
 * nuvem depois do boot (o único retry periódico é de ESCRITA). Com a aba aberta
 * — o normal de quem administra — o pedido não aparecia nunca.
 *
 * Leitura PONTUAL e sem push: mescla no espelho local e avisa a UI. Só ACRESCENTA
 * e-mails desconhecidos; jamais rebaixa um registro que já existe aqui, para uma
 * aprovação recém-feita (e ainda não sincronizada) não voltar para a fila.
 */
export async function sincronizarPendentesDaNuvem(): Promise<number> {
  if (!usarDadosSupabase()) return 0;
  const daNuvem = await carregarDocsPorCampoSupabase<UsuarioIam>(K_PAPEIS, 'status', 'aguardando_aprovacao');
  if (!daNuvem.length) return 0;
  const lista = ler();
  const conhecidos = new Set(lista.map(u => norm(u.email)));
  const novos = daNuvem.filter(u => u?.email && !conhecidos.has(norm(u.email)))
    .map(u => ({ ...u, id: u.id || norm(u.email), email: norm(u.email) }));
  if (!novos.length) return 0;
  gravarListaLocal(K_PAPEIS, [...lista, ...novos]);   // SEM cloudPushLista: isto é leitura
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('inv:empresa'));
  return novos.length;
}

// Status derivado: registros antigos não têm o campo (nasceram "ativos").
export function statusDe(u: UsuarioIam): StatusIam {
  if (u.status) return u.status;
  return 'ativo';
}

// Categoria derivada quando o registro é antigo (sem o campo): usa o papel
// como palpite — interno para a equipe, e a própria categoria quando coincide.
export function categoriaDe(u: UsuarioIam): CategoriaIam {
  if (u.categoria) return u.categoria;
  switch (u.papel) {
    case 'produtor':  return 'produtor';
    case 'prestador': return 'prestador';
    default:          return 'interno';
  }
}

// Grava um patch no usuário (cria se não existir). Não registra auditoria por
// si — quem chama descreve a ação (mais legível na trilha).
export function salvarUsuario(email: string, patch: Partial<UsuarioIam>): UsuarioIam {
  const e = norm(email);
  const lista = ler();
  const i = lista.findIndex(u => norm(u.email) === e);
  if (i >= 0) {
    lista[i] = { ...lista[i], ...patch, id: lista[i].id || e, email: e };
  } else {
    lista.push({
      id: e, email: e, papel: patch.papel ?? 'leitor',
      criadoEm: new Date().toISOString(), criadoPor: emailUsuario() ?? 'sistema',
      ...patch,
    } as UsuarioIam);
  }
  gravar(lista);
  return getUsuario(e)!;
}

export function removerUsuario(email: string): void {
  const e = norm(email);
  const lista = ler().filter(u => norm(u.email) !== e);
  gravar(lista);
  registrar('usuario_removido', { alvo: e, detalhe: 'acesso removido' });
}

// ── Fluxo de aprovação ──────────────────────────────────────────────────────
export function aprovarUsuario(
  email: string, papel: PapelIam, categoria: CategoriaIam,
  extra?: Partial<UsuarioIam>,
): void {
  const antes = getUsuario(email);
  salvarUsuario(email, {
    papel: papel as RegistroPapel['papel'], categoria, status: 'ativo',
    aprovadoEm: new Date().toISOString(), aprovadoPor: emailUsuario() ?? 'sistema',
    ...extra,
  });
  registrar('usuario_aprovado', {
    alvo: email, detalhe: `${categoria} · ${papel}`,
    de: antes ? statusDe(antes) : undefined, para: 'ativo',
  });
}

export function rejeitarUsuario(email: string, motivo?: string): void {
  salvarUsuario(email, { status: 'rejeitado', observacoes: motivo });
  registrar('usuario_rejeitado', { alvo: email, detalhe: motivo });
}

export function bloquearUsuario(email: string, motivo?: string): void {
  salvarUsuario(email, {
    status: 'bloqueado', bloqueadoEm: new Date().toISOString(),
    bloqueadoPor: emailUsuario() ?? 'sistema', motivoBloqueio: motivo,
  });
  registrar('usuario_bloqueado', { alvo: email, detalhe: motivo });
}

export function desbloquearUsuario(email: string): void {
  salvarUsuario(email, {
    status: 'ativo', bloqueadoEm: undefined, bloqueadoPor: undefined, motivoBloqueio: undefined,
  });
  registrar('usuario_desbloqueado', { alvo: email });
}

export function definirStatus(email: string, status: StatusIam): void {
  const antes = getUsuario(email);
  salvarUsuario(email, { status });
  registrar(status === 'bloqueado' ? 'usuario_bloqueado' : 'papel_alterado', {
    alvo: email, detalhe: `status → ${status}`,
    de: antes ? statusDe(antes) : undefined, para: status,
  });
}

// ── Papel, categoria e permissões ───────────────────────────────────────────
export function definirPapel(email: string, papel: PapelIam): void {
  const antes = getUsuario(email);
  salvarUsuario(email, { papel: papel as RegistroPapel['papel'] });
  registrar('papel_alterado', { alvo: email, de: antes?.papel, para: papel });
}

export function definirCategoria(email: string, categoria: CategoriaIam): void {
  const antes = getUsuario(email);
  salvarUsuario(email, { categoria });
  registrar('categoria_alterada', {
    alvo: email, de: antes ? categoriaDe(antes) : undefined, para: categoria,
  });
}

// Exceção de permissão no usuário (sobrepõe o papel). `undefined` remove a
// exceção e devolve o comportamento do papel.
export function definirPermissaoUsuario(
  email: string, chave: string, valor: boolean | undefined,
): void {
  const u = getUsuario(email);
  const perms: MapaPermissoes = { ...(u?.permissoes ?? {}) };
  if (valor === undefined) delete perms[chave as keyof MapaPermissoes];
  else perms[chave as keyof MapaPermissoes] = valor;
  salvarUsuario(email, { permissoes: perms });
  registrar('permissao_alterada', {
    alvo: email, detalhe: chave, para: valor === undefined ? 'padrão do papel' : String(valor),
  });
}

// Copia as permissões EFETIVAS de outro usuário (papel + exceções) como
// exceções do destino — o pedido "clonar permissões de outro usuário".
export function clonarPermissoes(deEmail: string, paraEmail: string): boolean {
  const de = getUsuario(deEmail);
  if (!de) return false;
  const efetivas = permissoesEfetivas(de.papel as PapelIam, de.permissoes);
  salvarUsuario(paraEmail, { permissoes: { ...efetivas } });
  registrar('permissao_alterada', {
    alvo: paraEmail, detalhe: `permissões clonadas de ${norm(deEmail)}`,
  });
  return true;
}

export function limparExcecoes(email: string): void {
  salvarUsuario(email, { permissoes: {} });
  registrar('permissao_alterada', { alvo: email, detalhe: 'exceções limpas (volta ao papel)' });
}

// ── Vínculos (empresa → fazenda → talhão) ───────────────────────────────────
export function definirVinculos(
  email: string,
  v: { clientesVinculados?: string[]; fazendasVinculadas?: string[]; talhoesVinculados?: string[] },
): void {
  // PRODUTOR: o vínculo de cliente vive em dois campos (o antigo `clienteId`,
  // que o Portal lê, e `clientesVinculados`, do IAM). Gravar só um deixa os dois
  // divergentes — e, como o antigo tem preferência na leitura, trocar o produtor
  // AQUI não teria efeito nenhum enquanto o antigo apontasse para outro.
  // Ver lib/iam/vinculoProdutor.ts.
  const alvo = getUsuario(email);
  const extra = (alvo?.papel === 'produtor' && v.clientesVinculados)
    ? { clienteId: v.clientesVinculados[0] ?? '' }
    : {};
  salvarUsuario(email, { ...v, ...extra });
  const partes = [
    v.clientesVinculados ? `${v.clientesVinculados.length} produtor(es)` : null,
    v.fazendasVinculadas ? `${v.fazendasVinculadas.length} fazenda(s)` : null,
    v.talhoesVinculados ? `${v.talhoesVinculados.length} talhão(ões)` : null,
  ].filter(Boolean);
  registrar('vinculo_alterado', { alvo: email, detalhe: partes.join(' · ') || 'sem restrição' });
}

// ── Último acesso ───────────────────────────────────────────────────────────
export function marcarUltimoAcesso(email: string | null): void {
  if (!email) return;
  const u = getUsuario(email);
  if (!u) return;
  const hoje = new Date().toISOString();
  // grava no máximo 1× por hora para não empurrar a lista toda o tempo todo
  if (u.ultimoAcesso && Date.now() - Date.parse(u.ultimoAcesso) < 3600_000) return;
  salvarUsuario(email, { ultimoAcesso: hoje });
}

// ── Migração (idempotente) ──────────────────────────────────────────────────
// Preenche categoria/status/criadoEm nos registros que vieram do modelo antigo.
// NÃO altera papel nem vínculos — ninguém perde acesso.
export function migrarIamV1(): void {
  const lista = ler();
  if (lista.length === 0) return;
  let mudou = false;
  for (const u of lista) {
    if (!u.categoria) { u.categoria = categoriaDe(u); mudou = true; }
    if (!u.status) { u.status = 'ativo'; mudou = true; }
    if (!u.criadoEm) { u.criadoEm = new Date().toISOString(); mudou = true; }
    if (!u.id) { u.id = norm(u.email); mudou = true; }
  }
  if (mudou) {
    gravarListaLocal(K_PAPEIS, lista);
    cloudPushLista(K_PAPEIS, lista as unknown as { id: unknown }[]);
    console.info('[iam] migração v1: categoria/status preenchidos em', lista.length, 'registro(s)');
  }
}

// Papéis padrão disponíveis (para telas de escolha), sem os legados.
export const PAPEIS_ATRIBUIVEIS: PapelIam[] =
  ['admin', 'agronomo', 'operador', 'produtor', 'prestador', 'leitor', 'custom'];

export { MATRIZ_PADRAO };
