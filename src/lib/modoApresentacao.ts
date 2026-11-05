// MODO APRESENTAÇÃO — owner/admin abrem a plataforma (/painel, /talhao,
// /portal) EXATAMENTE como um produtor vê, com o próprio login, para mostrar ao
// produtor sem precisar da senha dele.
//
// ┌─ LEIA ANTES DE MEXER ─────────────────────────────────────────────────────┐
// │ O modo só RESTRINGE A INTERFACE. A sessão continua sendo a do admin: a    │
// │ RLS do banco é a dele, e qualquer consulta à nuvem enxerga o que o admin  │
// │ enxerga. O que muda é o papel EFETIVO que o app usa para decidir escopo,  │
// │ abas e botões (empresa.ts → papelDoUsuario/meuRegistro). Não é fronteira  │
// │ de segurança — é um modo de tela.                                         │
// │ Nada é gravado no banco por causa do modo: o estado mora na sessionStorage│
// │ (morre com a aba) e, enquanto ele vale, a porta da nuvem recusa TODA      │
// │ gravação (somenteLeitura.ts), sem as exceções que o produtor tem          │
// │ (satélite/compactação dos talhões dele).                                  │
// └───────────────────────────────────────────────────────────────────────────┘
//
// Regras (testadas em `npm run teste:modo-apresentacao`):
//   · só LIGA para owner/admin (ou a bancada sem login, que não tem papéis).
//     Para qualquer outro papel um estado que sobrou na aba é IGNORADO — o modo
//     nunca dá a ninguém mais acesso, porque o papel efetivo é sempre o mais
//     restrito (produtor) e só substitui owner/admin;
//   · papel efetivo = 'produtor'; registro efetivo = o do usuário PRODUTOR
//     vinculado ao cliente, se houver (vínculos de cliente/fazenda/talhão e o
//     ajuste por usuário da matriz); senão um registro só com o cliente;
//   · plano = o do registro do produtor (decidido ao ligar), ou o que o preview
//     do portal escolheu em ?plano=; sem plano = todas as seções, como no
//     preview do portal.
//
// Onde a tela NÃO fica idêntica à do produtor (limites conhecidos):
//   · Comparativo Invicta (benchmark): o servidor recebe o clienteId (owner/
//     admin podem pedir) e calcula o "você" com o CLIENTE INTEIRO — não com o
//     recorte do produtor (fazendas/talhões marcados, condomínio). Para quem
//     tem acesso só a parte do cliente, o número difere do que ele vê;
//   · rotas de servidor (PrecisionFarm) respondem pelo papel REAL: a tela
//     zera "gestor" e cliente.ts recusa os POSTs que gravam enquanto o modo
//     vale (lib/precisionfarm/cliente.ts);
//   · o diagnóstico com IA mostra o que já existe, sem "Gerar" (grava e gasta
//     IA com o login do admin).
//
// Puro (o acesso à sessionStorage fica em funções com try/catch, nunca no
// carregamento do módulo): o teste importa este arquivo direto pelo Node.

import { clientesDoProdutor } from './iam/vinculoProdutor.ts';

const CHAVE = 'inv_apresentacao';
// Ao Sair: qual cliente o /painel do admin reabre (o "mesmo ponto"). Uma vez só.
const CHAVE_VOLTA = 'inv_apresentacao_volta';
/** Evento na `window` quando o modo liga/desliga (a faixa e o portal reagem). */
export const EVENTO_APRESENTACAO = 'inv:apresentacao';

export interface EstadoApresentacao {
  clienteId: string;
  /** Nome do cliente, para a faixa. */
  nome: string;
  /** Plano em vigor; null = sem plano (todas as seções liberadas). */
  planoId: string | null;
  /** E-mail do usuário produtor vinculado ao cliente, se houver. */
  produtorEmail: string | null;
}

/** O mínimo de um registro de papel que o modo lê (inv_papeis). */
export interface RegistroBase {
  id?: string;
  email?: string;
  papel?: string;
  status?: string;
  nome?: string;
  clienteId?: string;
  planoId?: string;
  clientesVinculados?: string[];
  fazendasVinculadas?: string[];
  talhoesVinculados?: string[];
  permissoes?: Record<string, boolean>;
  senhaProvisoria?: boolean;
  validadeAte?: string;
}

// ── Regra pura ──────────────────────────────────────────────────────────────

/** Quem pode ligar o modo: owner/admin; sem login (bancada) não há papéis. */
export function podeApresentar(papelReal: string | null | undefined, comAuth: boolean): boolean {
  if (!comAuth) return true;
  return papelReal === 'owner' || papelReal === 'admin';
}

/** Lê o estado gravado. Qualquer coisa fora do formato = modo desligado. */
export function lerEstado(bruto: string | null | undefined): EstadoApresentacao | null {
  if (!bruto) return null;
  try {
    const o = JSON.parse(bruto) as Partial<EstadoApresentacao> | null;
    if (!o || typeof o.clienteId !== 'string' || !o.clienteId) return null;
    return {
      clienteId: o.clienteId,
      nome: typeof o.nome === 'string' ? o.nome : '',
      planoId: typeof o.planoId === 'string' && o.planoId ? o.planoId : null,
      produtorEmail: typeof o.produtorEmail === 'string' && o.produtorEmail ? o.produtorEmail : null,
    };
  } catch { return null; }
}

/** O modo vale para quem está logado? (estado presente E papel real que pode.) */
export function apresentacaoValida(
  estado: EstadoApresentacao | null, papelReal: string | null | undefined, comAuth: boolean,
): estado is EstadoApresentacao {
  return !!estado && podeApresentar(papelReal, comAuth);
}

/** Papel que o app usa para escopo, abas e escrita. */
export function papelEfetivo<P extends string>(
  papelReal: P | null, estado: EstadoApresentacao | null, comAuth: boolean,
): P | 'produtor' | null {
  return apresentacaoValida(estado, papelReal, comAuth) ? 'produtor' : papelReal;
}

/** Ação da matriz que GRAVA (criar, editar, excluir, importar…). No modo, o
 *  admin não ganha nenhuma — nem as que o produtor tem (prescrição, satélite,
 *  compactação): nenhum botão de escrita na apresentação. Ver e baixar ficam. */
export function acaoDeEscrita(acao: string | undefined): boolean {
  return acao !== 'visualizar' && acao !== 'exportar';
}

const ativo = (r: RegistroBase) => !r.status || r.status === 'ativo';

/** O usuário PRODUTOR vinculado ao cliente (o ativo primeiro; depois o que tem
 *  o cliente como principal). null = cliente sem login de produtor. */
export function produtorDoCliente<R extends RegistroBase>(registros: readonly R[], clienteId: string): R | null {
  const candidatos = registros.filter(r => r.papel === 'produtor' && clientesDoProdutor(r).includes(clienteId));
  if (!candidatos.length) return null;
  const nota = (r: R) => (ativo(r) ? 2 : 0) + (r.clienteId === clienteId ? 1 : 0);
  return [...candidatos].sort((a, b) => nota(b) - nota(a) || (a.email ?? '').localeCompare(b.email ?? ''))[0];
}

/** Estado a gravar ao ligar. `planoEscolhido` (preview do portal) vence; sem
 *  ele, vale o plano do registro do produtor; sem produtor, nenhum plano. */
export function montarEstado(
  cliente: { id: string; nome: string },
  registros: readonly RegistroBase[],
  planoEscolhido?: string | null,
): EstadoApresentacao {
  const prod = produtorDoCliente(registros, cliente.id);
  const planoId = planoEscolhido !== undefined ? (planoEscolhido || null) : (prod?.planoId || null);
  return { clienteId: cliente.id, nome: cliente.nome, planoId, produtorEmail: prod?.email ?? null };
}

/**
 * Registro que o app passa a ler como "meu" (meuRegistro). Identidade, status
 * e validade continuam os do admin — a entrada no app não muda —; papel,
 * vínculos, ajustes da matriz e plano passam a ser os do produtor.
 */
export function registroEfetivo<R extends RegistroBase>(
  real: R | null, estado: EstadoApresentacao, registros: readonly RegistroBase[],
): R & RegistroBase {
  const prod = (estado.produtorEmail && registros.find(r => r.papel === 'produtor' && r.email === estado.produtorEmail))
    || produtorDoCliente(registros, estado.clienteId);
  const vinculados = prod ? clientesDoProdutor(prod) : [];
  return {
    ...(real ?? ({} as R)),
    papel: 'produtor',
    nome: prod?.nome ?? estado.nome,
    // O cliente escolhido vai na frente (é o principal do portal); os demais
    // vínculos do produtor (condomínio) continuam valendo.
    clienteId: estado.clienteId,
    clientesVinculados: [...new Set([estado.clienteId, ...vinculados])],
    fazendasVinculadas: prod?.fazendasVinculadas ?? [],
    talhoesVinculados: prod?.talhoesVinculados ?? [],
    permissoes: prod?.permissoes ?? {},
    planoId: estado.planoId ?? undefined,
  };
}

// ── Estado na aba (sessionStorage) ──────────────────────────────────────────

let memo: { bruto: string | null; estado: EstadoApresentacao | null } = { bruto: null, estado: null };

/** Estado gravado na aba (sem conferir o papel — quem confere é empresa.ts). */
export function estadoGravado(): EstadoApresentacao | null {
  let bruto: string | null = null;
  try { bruto = typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(CHAVE); } catch { bruto = null; }
  if (bruto !== memo.bruto) memo = { bruto, estado: lerEstado(bruto) };
  return memo.estado;
}

/** Texto cru do estado — para useSyncExternalStore (comparação por valor). */
export function estadoBruto(): string {
  try { return (typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(CHAVE)) ?? ''; } catch { return ''; }
}

function avisar() {
  try { window.dispatchEvent(new Event(EVENTO_APRESENTACAO)); } catch { /* fora do navegador */ }
}

/** Grava o estado. Quem chama já conferiu podeApresentar (empresa.ts). */
export function gravarEstado(estado: EstadoApresentacao): void {
  try { sessionStorage.setItem(CHAVE, JSON.stringify(estado)); } catch { /* aba sem storage: segue sem o modo */ }
  avisar();
}

/** Desliga o modo. `voltarPara` = cliente que o /painel do admin reabre. */
export function apagarEstado(voltarPara?: string | null): void {
  try {
    sessionStorage.removeItem(CHAVE);
    if (voltarPara) sessionStorage.setItem(CHAVE_VOLTA, voltarPara);
  } catch { /* nada a limpar */ }
  avisar();
}

/** Cliente que o /painel deve reabrir depois de Sair — uma vez só. */
export function consumirVoltaApresentacao(): string | null {
  try {
    const id = sessionStorage.getItem(CHAVE_VOLTA);
    if (id) sessionStorage.removeItem(CHAVE_VOLTA);
    return id;
  } catch { return null; }
}

/** Assina as mudanças do modo (mesma aba). */
export function assinarApresentacao(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENTO_APRESENTACAO, cb);
  return () => window.removeEventListener(EVENTO_APRESENTACAO, cb);
}
