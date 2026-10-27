// Quem pode VER um talhão — a regra do servidor para a leitura das linhas
// recebidas da PrecisionFarm (Q4: todos com acesso ao talhão, só leitura).
//
// É a MESMA conta que o app faz para listar talhões (store.ts getTalhoes +
// empresa.ts escopoClienteIds/escopoFazendaIds/escopoTalhaoIds), montada com os
// módulos puros do IAM que o app já usa (vinculoProdutor, escopoFazendas,
// acessoEfetivo). As tabelas pf_* não têm política de RLS (só service role):
// sem esta conferência, qualquer sessão leria as linhas de qualquer talhão.
//
// Puro (sem banco): quem chama traz o registro do usuário em inv_papeis, o
// talhão e as fazendas envolvidas. Testado em `npm run teste:precisionfarm`.

import { podeEntrar } from '../iam/acessoEfetivo.ts';
import { fazendasVisiveis, type FazendaEscopo } from '../iam/escopoFazendas.ts';
import { clientesDoProdutor } from '../iam/vinculoProdutor.ts';

export interface RegistroAcesso {
  papel?: string;
  status?: string;
  clienteId?: string;
  clientesVinculados?: string[];
  fazendasVinculadas?: string[];
  talhoesVinculados?: string[];
}

/** Papéis que enxergam TODOS os talhões (mesma lista de escopoClienteIds). */
const PAPEIS_SEM_ESCOPO = new Set(['owner', 'admin', 'editor']);

export const ehPapelSemEscopo = (papel: string | undefined) => !!papel && PAPEIS_SEM_ESCOPO.has(papel);
export const ehPapelGestor = (papel: string | undefined) => papel === 'owner' || papel === 'admin';

const lista = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : []);

/**
 * O usuário vê o talhão?
 *  · sem registro, sem papel ou status que não entra (bloqueado, aguardando…) → não;
 *  · owner/admin/editor → sim;
 *  · talhoesVinculados preenchido → só esses;
 *  · produtor → clientes = clienteId + clientesVinculados; demais papéis →
 *    clientesVinculados (vazio = sem restrição de cliente);
 *  · fazendas → regra de iam/escopoFazendas (marcar nunca reduz o marcado).
 * `fazendas` = a fazenda do talhão + as fazendas marcadas no registro (com o
 * cliente de cada uma) — é o que a regra 2 de escopoFazendas precisa.
 */
export function podeVerTalhao(
  reg: RegistroAcesso | null | undefined,
  talhao: { id: string; fazendaId: string | null },
  fazendas: readonly FazendaEscopo[],
): boolean {
  if (!reg || !reg.papel || !podeEntrar(reg.status)) return false;
  if (ehPapelSemEscopo(reg.papel)) return true;

  const tals = lista(reg.talhoesVinculados);
  if (tals.length && !tals.includes(talhao.id)) return false;

  const esc: Set<string> | null = reg.papel === 'produtor'
    ? new Set(clientesDoProdutor({ clienteId: reg.clienteId, clientesVinculados: lista(reg.clientesVinculados) }))
    : (lista(reg.clientesVinculados).length ? new Set(lista(reg.clientesVinculados)) : null);
  const fazs = lista(reg.fazendasVinculadas);
  const escF: Set<string> | null = fazs.length ? new Set(fazs) : null;
  if (!esc && !escF) return true;

  if (!talhao.fazendaId) return false;
  const daFazenda = fazendas.find(f => f.id === talhao.fazendaId);
  if (!daFazenda) return false;
  // A lista inteira entra na conta (regra 2: produtor com ALGUMA fazenda
  // marcada fica só com as marcadas); o talhão passa se a fazenda dele passar.
  return fazendasVisiveis([...fazendas], esc, escF).some(f => f.id === talhao.fazendaId);
}
