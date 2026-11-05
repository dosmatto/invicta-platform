// Integração PrecisionFarm — RETORNO do manifesto v2 (ledger pf-manifesto-v2,
// Q2/Q6): o VINCULOS.json da PF devolvido com os IDs da Invicta preenchidos e
// o relatório por talhão. Núcleo PURO (sem rede, sem store, sem node:*): roda
// no navegador ("Exportar retorno") e no teste em Node.
//
// A fonte da verdade são os VÍNCULOS que existem (os da tela de lote, já
// recarregados depois de criar/confirmar) — não a prévia: só o que está no
// banco é correspondência. A prévia (casamentos) entra só para explicar o que
// NÃO virou vínculo (sem par, ambíguo, conflito…) e para a diferença de limite.
//
// VINCULOS.json: tudo o que a PF mandou é preservado (campos e UUIDs). Por
// talhão: remote_field_id = nosso talhão, identity_status, remote_field_name e
// boundary_difference_pct; quando o shared_farm_id do vínculo não é o proposto
// (fazenda dividida, Q2), o do vínculo vai em shared_farm_id e o da PF fica em
// proposed_shared_farm_id. clients[]: remote_producer_id = nosso cliente.
// farm_groups[]: o agrupamento da PF fica com a fazenda principal (remote_farm_id)
// e cada fazenda a mais vira uma entrada nova com split_from_shared_farm_id.

import { LIMIAR_PAR_PCT, type Casamento } from './manifestoPF.ts';

export interface VinculoRetorno {
  talhaoId: string;
  fazendaId: string | null;
  clienteId: string | null;
  sharedProducerId: string;
  sharedFarmId: string;
  sharedFieldId: string;
  status: string;
  /** Quantos recursos (zonas/colheitas) a Invicta já publicou no vínculo. */
  publicados: number;
}

export interface NomesRetorno {
  talhao: ReadonlyMap<string, string>;
  fazenda: ReadonlyMap<string, string>;
  cliente: ReadonlyMap<string, string>;
}

/** As cinco situações que a PF pediu (ATIVACAO.md) + "pendente de
 *  confirmação" (vínculo criado aqui, ainda não confirmado — a PF não o vê). */
export type SituacaoRetorno = 'ativo' | 'sem correspondência' | 'limite divergente' | 'sem dados' | 'erro' | 'pendente de confirmação';
export const SITUACOES_RETORNO: SituacaoRetorno[] = ['ativo', 'pendente de confirmação', 'limite divergente', 'sem dados', 'sem correspondência', 'erro'];

export interface LinhaRetorno {
  localFieldId: string;
  nomePF: string;
  clientePF: string;
  sharedFieldId: string;
  /** shared_farm_id que vale (o do vínculo, ou o proposto pela PF sem vínculo). */
  sharedFarmId: string;
  situacao: SituacaoRetorno;
  motivo: string;
  talhaoId: string | null;
  talhao: string | null;
  fazenda: string | null;
  cliente: string | null;
  statusVinculo: string | null;
  difLimitePct: number | null;
  areaPfHa: number | null;
}

export interface RetornoPF {
  vinculosJson: Record<string, unknown>;
  linhas: LinhaRetorno[];
  contagem: Record<SituacaoRetorno, number>;
  /** Agrupamentos da PF que viraram mais de uma fazenda nossa. */
  gruposDivididos: number;
  /** Entradas novas em farm_groups (fazendas além da principal). */
  fazendasNovas: number;
  /** Vínculos ainda pendentes — a PF só vê depois de confirmados. */
  pendentes: number;
}

type Obj = Record<string, unknown>;
const ehObjeto = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const txt = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const low = (v: unknown) => txt(v).toLowerCase();
const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: v < 1 ? 2 : 1 });

const STATUS_VINCULO: Record<string, string> = {
  confirmado: 'confirmed',
  pendente: 'remote_matched_pending_confirmation',
  suspenso: 'remote_link_suspended',
};

/** Mais frequente (empate: o primeiro que apareceu). */
function maisFrequente<T>(xs: readonly T[]): T | undefined {
  const c = new Map<T, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  let melhor: T | undefined, n = 0;
  for (const [x, k] of c) if (k > n) { melhor = x; n = k; }
  return melhor;
}

function statusDeConjunto(vs: readonly VinculoRetorno[], total: number): string | null {
  if (!vs.length) return null;
  const conf = vs.filter(v => v.status === 'confirmado').length;
  if (conf && conf === total) return 'confirmed';
  if (conf) return 'partially_confirmed';
  return 'remote_matched_pending_confirmation';
}

/**
 * Monta o retorno. `original` = o VINCULOS.json como veio (objeto); nada dele
 * é alterado (trabalha numa cópia).
 */
export function montarRetornoPF(
  original: unknown,
  casamentos: readonly Casamento[],
  vinculos: readonly VinculoRetorno[],
  nomes: NomesRetorno,
  agora: Date = new Date(),
): RetornoPF {
  const json = JSON.parse(JSON.stringify(original ?? {})) as Obj;
  const fields = (Array.isArray(json.fields) ? json.fields : []).filter(ehObjeto);
  const clients = (Array.isArray(json.clients) ? json.clients : []).filter(ehObjeto);
  const grupos = Array.isArray(json.farm_groups) ? json.farm_groups.filter(ehObjeto) : null;

  const casPorCampo = new Map(casamentos.map(c => [c.campo.sharedFieldId, c]));
  const vincPorCampo = new Map(vinculos.map(v => [v.sharedFieldId.toLowerCase(), v]));
  const nomeClientePF = new Map(clients.map(c => [txt(c.local_producer_id), txt(c.name)]));

  const linhas: LinhaRetorno[] = [];
  // shared_farm_id ORIGINAL de cada talhão (antes de trocar) → vínculo
  const vincDoGrupo = new Map<string, VinculoRetorno[]>();
  const vincDoProdutor = new Map<string, VinculoRetorno[]>();
  const camposDoProdutor = new Map<string, number>();

  for (const f of fields) {
    const sid = low(f.shared_field_id);
    const farmPF = low(f.shared_farm_id);
    const prodPF = low(f.shared_producer_id);
    camposDoProdutor.set(prodPF, (camposDoProdutor.get(prodPF) ?? 0) + 1);
    const v = vincPorCampo.get(sid);
    const cas = casPorCampo.get(sid);
    const doMesmo = cas?.melhor && (!v || cas.melhor.talhaoId === v.talhaoId) ? cas.melhor : null;
    const dif = doMesmo?.difSimPct ?? null;
    const linha: LinhaRetorno = {
      localFieldId: txt(f.local_field_id), nomePF: txt(f.name), clientePF: nomeClientePF.get(txt(f.local_producer_id)) ?? '',
      sharedFieldId: sid, sharedFarmId: farmPF, situacao: 'erro', motivo: '',
      talhaoId: null, talhao: null, fazenda: null, cliente: null, statusVinculo: null,
      difLimitePct: dif, areaPfHa: cas?.areaPfHa ?? null,
    };
    if (v) {
      const l = vincDoGrupo.get(farmPF) ?? []; l.push(v); vincDoGrupo.set(farmPF, l);
      const p = vincDoProdutor.get(prodPF) ?? []; p.push(v); vincDoProdutor.set(prodPF, p);
      f.remote_field_id = v.talhaoId;
      f.remote_field_name = nomes.talhao.get(v.talhaoId) ?? null;
      f.identity_status = STATUS_VINCULO[v.status] ?? v.status;
      f.boundary_difference_pct = dif != null ? Math.round(dif * 100) / 100 : null;
      if (v.sharedFarmId !== farmPF) { f.proposed_shared_farm_id = f.shared_farm_id; f.shared_farm_id = v.sharedFarmId; }
      if (v.sharedProducerId !== prodPF) { f.proposed_shared_producer_id = f.shared_producer_id; f.shared_producer_id = v.sharedProducerId; }
      Object.assign(linha, {
        sharedFarmId: v.sharedFarmId, talhaoId: v.talhaoId, talhao: nomes.talhao.get(v.talhaoId) ?? v.talhaoId,
        fazenda: v.fazendaId ? nomes.fazenda.get(v.fazendaId) ?? v.fazendaId : null,
        cliente: v.clienteId ? nomes.cliente.get(v.clienteId) ?? v.clienteId : null,
        statusVinculo: v.status,
      });
      const difTxt = dif != null ? `diferença de ${fmt(dif)}% entre os limites` : 'diferença de limite não medida';
      if (v.status === 'suspenso') Object.assign(linha, { situacao: 'erro', motivo: 'Vínculo suspenso na Invicta.' });
      else if (v.status === 'pendente') {
        Object.assign(linha, { situacao: 'pendente de confirmação', motivo: `Vínculo criado na Invicta, aguardando confirmação (${difTxt}).` });
      } else if (dif != null && dif > LIMIAR_PAR_PCT) {
        Object.assign(linha, { situacao: 'limite divergente', motivo: `Vínculo ativo; ${difTxt} (acima de ${LIMIAR_PAR_PCT}%) — comparar antes de adotar.` });
      } else if (!v.publicados) {
        Object.assign(linha, { situacao: 'sem dados', motivo: 'Vínculo ativo; a Invicta ainda não publicou zonas nem colheitas deste talhão.' });
      } else {
        Object.assign(linha, { situacao: 'ativo', motivo: `Vínculo ativo; ${v.publicados} recurso(s) publicado(s).` });
      }
    } else if (!cas) {
      Object.assign(linha, { situacao: 'erro', motivo: 'Talhão não avaliado nesta importação.' });
    } else {
      if (cas.melhor) Object.assign(linha, { talhao: cas.melhor.nome, talhaoId: cas.melhor.talhaoId, fazenda: cas.melhor.fazendaId ? nomes.fazenda.get(cas.melhor.fazendaId) ?? null : null });
      const naoCriado = `Par encontrado (${cas.melhor?.nome ?? '—'}${dif != null ? `, diferença de ${fmt(dif)}%` : ''}), mas o vínculo não foi criado.`;
      const porSituacao: Record<Casamento['situacao'], [SituacaoRetorno, string, string]> = {
        'sem-par': ['sem correspondência', cas.motivo ?? 'Sem talhão correspondente.', 'remote_match_not_found'],
        ambiguo: ['sem correspondência', `Ambíguo: ${cas.motivo ?? ''}`, 'remote_match_ambiguous'],
        par: ['sem correspondência', naoCriado, txt(f.identity_status)],
        diferente: ['sem correspondência', naoCriado, txt(f.identity_status)],
        conflito: ['erro', `Conflito de IDs: ${cas.motivo ?? ''}`, 'remote_match_rejected'],
        'ja-vinculado': ['erro', cas.motivo ?? 'Talhão já vinculado.', 'remote_match_rejected'],
        invalido: ['erro', cas.motivo ?? 'Item ou limite inválido.', 'remote_match_rejected'],
      };
      const [situacao, motivo, status] = porSituacao[cas.situacao];
      Object.assign(linha, { situacao, motivo });
      if (status) f.identity_status = status;
    }
    linhas.push(linha);
  }

  // clients[]: nosso cliente (o de mais vínculos daquele produtor).
  for (const c of clients) {
    const prod = low(c.shared_producer_id);
    const vs = vincDoProdutor.get(prod) ?? [];
    const cli = maisFrequente(vs.map(v => v.clienteId).filter((x): x is string => !!x));
    if (!cli) continue;
    c.remote_producer_id = cli;
    c.remote_producer_name = nomes.cliente.get(cli) ?? null;
    const outros = [...new Set(vs.map(v => v.clienteId).filter(x => x && x !== cli))];
    if (outros.length) c.remote_note = `Talhões deste produtor também em outro(s) cliente(s) da Invicta: ${outros.map(o => nomes.cliente.get(o!) ?? o).join(', ')}.`;
    c.identity_status = statusDeConjunto(vs, camposDoProdutor.get(prod) ?? vs.length) ?? c.identity_status;
  }

  // farm_groups[]: a principal fica com o UUID da PF; cada fazenda a mais vira entrada nova.
  let gruposDivididos = 0, fazendasNovas = 0;
  if (grupos) {
    const saida: Obj[] = [];
    for (const g of grupos) {
      const farmPF = low(g.shared_farm_id);
      saida.push(g);
      const vs = vincDoGrupo.get(farmPF) ?? [];
      const porFarm = new Map<string, VinculoRetorno[]>();
      for (const v of vs) { const l = porFarm.get(v.sharedFarmId) ?? []; l.push(v); porFarm.set(v.sharedFarmId, l); }
      const preencher = (e: Obj, lista: VinculoRetorno[]) => {
        const faz = maisFrequente(lista.map(v => v.fazendaId).filter((x): x is string => !!x));
        e.remote_farm_id = faz ?? null;
        e.remote_farm_name = faz ? nomes.fazenda.get(faz) ?? null : null;
        e.identity_status = statusDeConjunto(lista, lista.length) ?? e.identity_status;
      };
      const daPF = porFarm.get(farmPF);
      if (daPF) preencher(g, daPF);
      let dividiu = false;
      for (const [farm, lista] of porFarm) {
        if (farm === farmPF) continue;
        dividiu = true; fazendasNovas++;
        const e: Obj = {
          local_producer_id: g.local_producer_id ?? null, shared_producer_id: g.shared_producer_id ?? null,
          shared_farm_id: farm, name: null,
        };
        preencher(e, lista);
        e.split_from_shared_farm_id = g.shared_farm_id;
        e.note = `Agrupamento ${txt(g.shared_farm_id)} dividido pela Invicta: ${lista.length} talhão(ões) desta fazenda da Invicta.`;
        saida.push(e);
      }
      if (dividiu) gruposDivididos++;
    }
    json.farm_groups = saida;
  }

  const contagem = Object.fromEntries(SITUACOES_RETORNO.map(s => [s, 0])) as Record<SituacaoRetorno, number>;
  for (const l of linhas) contagem[l.situacao]++;
  const pendentes = linhas.filter(l => l.statusVinculo === 'pendente').length;
  json.invicta_return = {
    generated_at: agora.toISOString(),
    remote_system: 'invicta',
    field_status: contagem,
    farm_groups_split: gruposDivididos,
    new_farm_entries: fazendasNovas,
    note: 'remote_*_id = IDs da Invicta. Fazenda dividida: o shared_farm_id da PF fica com a fazenda da Invicta que recebeu mais talhões; as demais têm UUID novo (split_from_shared_farm_id). Vínculo pendente ainda não é visto pela PF.',
  };
  return { vinculosJson: json, linhas, contagem, gruposDivididos, fazendasNovas, pendentes };
}

const COLUNAS: [keyof LinhaRetorno, string][] = [
  ['localFieldId', 'local_field_id'], ['nomePF', 'talhao_pf'], ['clientePF', 'cliente_pf'], ['situacao', 'situacao'], ['motivo', 'motivo'],
  ['talhao', 'talhao_invicta'], ['fazenda', 'fazenda_invicta'], ['cliente', 'cliente_invicta'], ['talhaoId', 'remote_field_id'],
  ['statusVinculo', 'status_vinculo'], ['difLimitePct', 'diferenca_limite_pct'], ['areaPfHa', 'area_pf_ha'],
  ['sharedFieldId', 'shared_field_id'], ['sharedFarmId', 'shared_farm_id'],
];

/** Relatório por talhão em CSV (`;`, UTF-8 com BOM — abre direto no Excel pt-BR). */
export function relatorioCsv(linhas: readonly LinhaRetorno[]): string {
  const cel = (v: unknown) => {
    let s = v == null ? '' : typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: 2, useGrouping: false }) : String(v);
    // Injeção de fórmula: texto (nome de talhão vindo da PF, motivo…) que
    // comece com = + - @ tab ou CR viraria fórmula no Excel — vai com apóstrofo.
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const corpo = [COLUNAS.map(c => c[1]).join(';'), ...linhas.map(l => COLUNAS.map(([k]) => cel(l[k])).join(';'))];
  return `﻿${corpo.join('\r\n')}\r\n`;
}
