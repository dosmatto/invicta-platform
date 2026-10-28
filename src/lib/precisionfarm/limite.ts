// Integração PrecisionFarm — buscar o LIMITE que a PF publicou para um talhão
// com vínculo CONFIRMADO, sob demanda (botão "Comparar com o limite da
// PrecisionFarm"). Não há tabela nova nem fila: o aviso de limite continua
// recusado com 422 em /notifications (TIPOS_RECEBIDOS = só guidance) e o
// cursor do /changes já passou do evento — então o caminho é o inventário:
//
//   GET {PF}/fields/{shared_field_id}/inventory → item resource_type 'boundary'
//   GET {PF}/resources/{id}/revisions/{n}       → envelope com a geometria
//
// Com `event` no item (formato do 0.2.0), a revisão é CONFERIDA como na fase 2
// (conferirRevisao: contrato, UUIDs, tipo, revisão e checksum canônico). Sem
// `event`, confere o schema, o recurso, a revisão e o checksum do item, se
// houver. A geometria é lida por limiteGeometria.ts (defensiva, sem reparo).
//
// A PF entra por ClientePF (porta): o teste usa uma PF simulada, sem rede.
// Nada aqui grava: adotar o limite é decisão do usuário, no navegador.

import { FalhaPF, type ClientePF } from './clientePF.ts';
import { RE_UUID, SCHEMA_ENVELOPE, checksumEnvelope, validarContraSchema } from './contrato.ts';
import { conferirRevisao, idsBatem, validarEvento, type EnvelopeRecebido, type EventoRecebido, type IdsVinculo } from './linhas.ts';
import { lerPayloadLimite, type ContagemLimite, type GeometriaLimite } from './limiteGeometria.ts';

export { FalhaPF };

export interface LimitePF extends ContagemLimite {
  geometria: GeometriaLimite;
  resourceId: string;
  /** resource_revision do limite na PF. */
  revisao: number;
  /** boundary_revision (numeração DA PF — não é o geoVersao daqui). */
  boundaryRevision: number;
  /** occurred_at da revisão (quando a PF publicou). */
  data: string | null;
  nome: string | null;
  checksum: string | null;
  /** 'checksum' = conferida contra o evento do inventário; 'basica' = sem evento. */
  conferencia: 'checksum' | 'basica';
  /** Quantos itens 'boundary' o inventário trazia (1 = normal). */
  itensNoInventario: number;
}

export type ResultadoLimitePF =
  | { ok: true; limite: LimitePF }
  | { ok: false; motivo: 'sem_limite' | 'arquivado' | 'invalido' | 'incompleto'; erro: string };

type ItemInventario = Record<string, unknown> & { resource_type?: unknown; event?: unknown };

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Revisão anunciada pelo item: event.resource_revision → resource_revision →
 *  revision (o complemento de 28/10 cita `revision`). */
export function revisaoDoItem(it: ItemInventario): number | null {
  const ev = ehObjeto(it.event) ? it.event : {};
  for (const v of [ev.resource_revision, it.resource_revision, it.revision]) {
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1) return v;
  }
  return null;
}

const dataDoItem = (it: ItemInventario) => {
  const ev = ehObjeto(it.event) ? it.event : {};
  return texto(it.updated_at) ?? texto(ev.occurred_at) ?? '';
};

/**
 * Item de limite do inventário. Um talhão tem UM limite; se vierem vários
 * (recurso trocado na PF), vale o mais recente (updated_at/occurred_at) e,
 * empatado, o de maior revisão — e a tela avisa quantos havia.
 */
export function escolherItemLimite(itens: readonly unknown[]): { item: ItemInventario; total: number } | null {
  const limites = itens.filter((x): x is ItemInventario => ehObjeto(x) && x.resource_type === 'boundary');
  if (!limites.length) return null;
  const ordenados = [...limites].sort((a, b) =>
    dataDoItem(b).localeCompare(dataDoItem(a)) || (revisaoDoItem(b) ?? 0) - (revisaoDoItem(a) ?? 0));
  return { item: ordenados[0], total: limites.length };
}

const arquivado = (it: ItemInventario) =>
  it.status === 'archived' || (ehObjeto(it.event) && it.event.operation === 'archive');

/** Teto de páginas lidas do inventário de UM talhão. */
export const MAX_PAGINAS_INVENTARIO = 20;

/** Inventário do talhão (páginas com cursor; teto MAX_PAGINAS_INVENTARIO).
 *  `incompleto` = a PF ainda dizia has_more quando paramos (teto atingido ou
 *  cursor que não anda) — quem chama não pode concluir "não existe". */
async function itensDoInventario(pf: ClientePF, sharedFieldId: string): Promise<{ itens: unknown[]; incompleto: boolean; paginas: number }> {
  const itens: unknown[] = [];
  let cursor = '0';
  for (let pag = 1; pag <= MAX_PAGINAS_INVENTARIO; pag++) {
    const p = await pf.inventario(sharedFieldId, cursor);
    itens.push(...p.items);
    if (!p.has_more) return { itens, incompleto: false, paginas: pag };
    if (p.next_cursor === cursor) return { itens, incompleto: true, paginas: pag };
    cursor = p.next_cursor;
  }
  return { itens, incompleto: true, paginas: MAX_PAGINAS_INVENTARIO };
}

/** Revisão baixada × o que o inventário anunciou. */
function conferir(bruto: unknown, item: ItemInventario, resourceId: string, n: number): { ok: true; envelope: EnvelopeRecebido; conferencia: LimitePF['conferencia'] } | { ok: false; erro: string } {
  if (ehObjeto(item.event) && !validarEvento(item.event).length) {
    const c = conferirRevisao(bruto, item.event as unknown as EventoRecebido);
    return c.ok ? { ok: true, envelope: c.envelope, conferencia: 'checksum' } : c;
  }
  const erros = validarContraSchema(SCHEMA_ENVELOPE as unknown as Parameters<typeof validarContraSchema>[0], bruto);
  if (erros.length) return { ok: false, erro: `Revisão do limite fora do contrato 0.2.0: ${erros.slice(0, 5).join('; ')}` };
  const e = bruto as EnvelopeRecebido;
  if (e.source_system !== 'precisionfarm') return { ok: false, erro: 'Revisão do limite com source_system diferente de "precisionfarm".' };
  if (e.resource_id.toLowerCase() !== resourceId || e.resource_revision !== n) {
    return { ok: false, erro: 'A revisão baixada não é a que o inventário anunciou (recurso ou número diferente).' };
  }
  const chk = texto(item.checksum);
  if (chk && checksumEnvelope(e) !== chk.toLowerCase()) {
    return { ok: false, erro: `Checksum do limite não confere: o inventário diz ${chk.slice(0, 12)}…, a revisão baixada dá ${checksumEnvelope(e).slice(0, 12)}….` };
  }
  return { ok: true, envelope: e, conferencia: 'basica' };
}

/**
 * Busca o limite vigente publicado pela PF para o talhão do vínculo. Falha de
 * transporte (rede, 401, 503…) sobe como FalhaPF — a rota responde 502/503.
 * O resto (não há limite, arquivado, revisão que não confere, geometria
 * inválida) volta como `ok: false` com o motivo para a tela.
 */
export async function buscarLimitePF(pf: ClientePF, vinculo: IdsVinculo): Promise<ResultadoLimitePF> {
  const inv = await itensDoInventario(pf, vinculo.shared_field_id);
  const escolha = escolherItemLimite(inv.itens);
  if (!escolha && inv.incompleto) {
    // Não achar o limite num inventário cortado NÃO é "não publicado".
    return {
      ok: false, motivo: 'incompleto',
      erro: `O inventário da PrecisionFarm não terminou depois de ${inv.paginas} página(s) (${inv.itens.length} itens lidos, ainda há mais) e o limite não apareceu no que foi lido. Não dá para afirmar que não existe — avise a PrecisionFarm.`,
    };
  }
  if (!escolha) return { ok: false, motivo: 'sem_limite', erro: 'A PrecisionFarm ainda não publicou o limite deste talhão (nenhum item "boundary" no inventário).' };
  const { item } = escolha;
  if (arquivado(item)) return { ok: false, motivo: 'arquivado', erro: 'O limite deste talhão está arquivado na PrecisionFarm.' };
  const resourceId = String(item.resource_id ?? '').toLowerCase();
  const n = revisaoDoItem(item);
  if (!RE_UUID.test(resourceId) || n == null) {
    return { ok: false, motivo: 'invalido', erro: 'O item de limite do inventário da PrecisionFarm não traz resource_id/revisão válidos.' };
  }

  const bruto = await pf.revisao(resourceId, n);
  const c = conferir(bruto, item, resourceId, n);
  if (!c.ok) return { ok: false, motivo: 'invalido', erro: c.erro };
  const e = c.envelope;
  if (e.resource_type !== 'boundary') return { ok: false, motivo: 'invalido', erro: `A revisão baixada é "${e.resource_type}", não um limite.` };
  if (!idsBatem(e, vinculo)) return { ok: false, motivo: 'invalido', erro: 'Os UUIDs compartilhados do limite não conferem com o vínculo deste talhão.' };
  if (e.operation === 'archive') return { ok: false, motivo: 'arquivado', erro: 'A revisão vigente do limite na PrecisionFarm é um arquivamento.' };

  const g = lerPayloadLimite(e.payload);
  if (!g.ok) return { ok: false, motivo: 'invalido', erro: g.erro };
  const p = e.payload;
  return {
    ok: true,
    limite: {
      geometria: g.geometria, partes: g.partes, furos: g.furos, vertices: g.vertices,
      resourceId, revisao: n, boundaryRevision: e.boundary_revision,
      data: texto(e.occurred_at),
      nome: texto(p.name) ?? texto(p.integration_name) ?? texto(item.name) ?? texto(item.integration_name),
      checksum: ehObjeto(item.event) ? texto(item.event.checksum) : texto(item.checksum),
      conferencia: c.conferencia,
      itensNoInventario: escolha.total,
    },
  };
}
