// Integração PrecisionFarm — FASE 2: orquestração do RECEBIMENTO de linhas.
//
//   aviso (POST /notifications) ─┐
//   recuperação (GET /changes)  ─┼─► fila (pf_entrada_eventos) ─► processar:
//   carga inicial (/inventory)  ─┘     busca a revisão na PF, confere tudo,
//                                      guarda o snapshot, promove a vigente
//                                      ─► recibo assinado (POST /receipts)
//
// O banco entra por uma PORTA (RepoRecebimento): em produção é o Supabase
// (repoLinhas.ts, service role, tabelas pf_* sem política de RLS); no teste
// ponta a ponta é um repositório em memória contra uma PF simulada. As regras
// (o que é válido, o que é temporário, o que promove) são de linhas.ts.
// Nada aqui escreve em app_kv/talhoes: o app é local-first.

import { vinculosNoEscopo, type EscopoChave, type StatusVinculo } from './contrato.ts';
import { FalhaPF, type ClientePF } from './clientePF.ts';
import {
  MAX_NOTIFICACAO_BYTES, TENTATIVAS_404, TIPOS_RECEBIDOS, atrasoTentativaS, conferirRevisao, decidirReaviso,
  eventoDoItem, falhaDefinitiva, idsBatem, impressaoEvento, normalizarEvento, reciboDeveRepetir, validarEvento,
  validarPayloadLinhas, verificarAssinatura,
  type ConfigRecebimento, type EventoRecebido, type MetaLinhas,
} from './linhas.ts';

/** Metadados de uma revisão que a camada guarda quando ela vira a vigente. */
export type MetaCamada = Omit<MetaLinhas, 'bytes' | 'nSemKind' | 'observacao'>;

/** Aviso que já estava na fila (mesmo event_id). */
export interface EventoExistente { id: number; conteudoHash: string; status: StatusFila }

// ── Porta do banco ───────────────────────────────────────────────────────────

export type OrigemEvento = 'notificacao' | 'changes' | 'inventario';
export type StatusFila = 'pendente' | 'aplicado' | 'rejeitado';

export interface VinculoRecebimento {
  id: string;
  talhao_id: string;
  parceria: string;
  empresa_id: string | null;
  status: StatusVinculo;
  shared_producer_id: string;
  shared_farm_id: string;
  shared_field_id: string;
}

export interface EventoFila {
  id: number;
  event_id: string;
  conteudo_hash: string;
  evento: EventoRecebido;
  vinculo_id: string;
  talhao_id: string;
  resource_id: string;
  resource_revision: number;
  origem: OrigemEvento;
  status: StatusFila;
  tentativas: number;
  proxima_tentativa_em: string;
  ultimo_erro: string | null;
  recibo_status: 'applied' | 'rejected' | null;
  recibo_motivo: string | null;
  recibo_enviado_em: string | null;
  recibo_tentativas: number;
  recibo_proxima_em: string | null;
  recibo_erro: string | null;
}

export type NovoEvento = Pick<EventoFila, 'event_id' | 'conteudo_hash' | 'evento' | 'vinculo_id' | 'talhao_id' | 'resource_id' | 'resource_revision' | 'origem'>;

export type PatchEvento = Partial<Omit<EventoFila, 'id' | 'event_id' | 'conteudo_hash' | 'evento'>> & {
  travado_ate?: string | null; processado_em?: string | null;
};

export interface CamadaLinhas {
  resource_id: string;
  vinculo_id: string;
  talhao_id: string;
  revisao_vigente: number | null;
  revisao_geometria: number | null;
  arquivada: boolean;
  nome: string | null;
  integration_name: string | null;
  cropping_cycle: string | null;
  operation_category: string | null;
  spacing_m: number | null;
  boundary_revision: number | null;
  ultimo_erro: string | null;
  ultimo_erro_em: string | null;
  ultima_sincronizacao_em: string | null;
  arquivada_em: string | null;
}

export interface RevisaoGuardada {
  checksum: string;
  operation: 'upsert' | 'archive';
  boundary_revision: number;
  meta: MetaCamada | null;
}

export interface NovaRevisaoLinhas {
  resource_id: string; revision: number; event_id: string; checksum: string;
  operation: 'upsert' | 'archive'; boundary_revision: number; envelope: object;
  meta: MetaLinhas | null;
}

/** O que muda na camada quando uma revisão vira a vigente. */
export interface PatchVigente {
  revisao_vigente: number;
  arquivada: boolean;
  arquivada_em: string | null;
  boundary_revision: number;
  /** Só em upsert: a revisão cujas linhas a tela desenha e os metadados dela. */
  geometria?: { revisao: number; meta: MetaCamada };
}

/** Aviso descartado pela recuperação (/changes) ou pela carga — fica registrado
 *  ANTES de o cursor andar, para não sumir em silêncio. */
export interface Descarte { origem: OrigemEvento; event_id: string | null; motivo: string; item: unknown }

export interface RepoRecebimento {
  vinculoDoCampo(sharedFieldId: string): Promise<VinculoRecebimento | null>;
  camada(resourceId: string): Promise<CamadaLinhas | null>;
  /** Cria a camada se não existe (corrida: o segundo só ignora). */
  criarCamada(a: { resource_id: string; vinculo_id: string; talhao_id: string }): Promise<void>;
  /** Aviso já na fila com este event_id (id, impressão e status), ou null. */
  eventoExistente(eventId: string): Promise<EventoExistente | null>;
  /** Insere o aviso na fila. Corrida (event_id entrou agora) → devolve o existente. */
  inserirEvento(row: NovoEvento): Promise<{ inserido: true } | { inserido: false; existente: EventoExistente }>;
  /** Volta um aviso REJEITADO para 'pendente' (tentativas e recibo zerados). */
  reabrirEvento(id: number, agoraIso: string): Promise<void>;
  /** Reabre todos os avisos rejeitados de uma camada; devolve quantos. */
  reabrirRejeitadosDaCamada(resourceId: string, agoraIso: string): Promise<number>;
  registrarDescarte(d: Descarte, agoraIso: string): Promise<void>;
  /** Pendentes com proxima_tentativa_em <= agora, sem trava viva, mais antigos primeiro. */
  eventosProntos(agoraIso: string, limite: number): Promise<EventoFila[]>;
  /** Trava o aviso para ESTE processador (after() e cron podem rodar juntos). */
  travarEvento(id: number, agoraIso: string, ateIso: string): Promise<boolean>;
  /** `seReciboProximaEm`: só aplica se o recibo ainda é o mesmo que foi lido
   *  (um resultado novo no meio do envio troca recibo_proxima_em). */
  atualizarEvento(id: number, patch: PatchEvento, seReciboProximaEm?: string): Promise<void>;
  revisaoGuardada(resourceId: string, n: number): Promise<RevisaoGuardada | null>;
  /** Snapshot imutável. 'existe' = (recurso, revisão) já estava lá. */
  guardarRevisao(row: NovaRevisaoLinhas): Promise<'ok' | 'existe'>;
  /** Promove SÓ se n > vigente (condição atômica no banco). */
  promoverVigente(resourceId: string, patch: PatchVigente, agoraIso: string): Promise<boolean>;
  marcarSincronizada(resourceId: string, agoraIso: string): Promise<void>;
  registrarErroCamada(resourceId: string, motivo: string, agoraIso: string): Promise<void>;
  recibosPendentes(agoraIso: string, limite: number): Promise<EventoFila[]>;
  lerCursor(): Promise<string>;
  gravarCursor(cursor: string, agoraIso: string): Promise<void>;
}

export interface Ambiente {
  repo: RepoRecebimento;
  pf: ClientePF;
  agora?: () => Date;
}

const agoraDe = (amb: Ambiente) => (amb.agora ? amb.agora() : new Date());
const iso = (d: Date) => d.toISOString();
const somarS = (d: Date, s: number) => new Date(d.getTime() + s * 1000);
const TRAVA_S = 120;

// ── Enfileirar ───────────────────────────────────────────────────────────────

export type ResultadoEnfileirar =
  | { resultado: 'novo' | 'repetido' | 'reaberto'; eventId: string }
  | { resultado: 'tipo_nao_suportado' | 'fora_do_vinculo' | 'conflito'; mensagem: string };

/**
 * Põe um aviso VÁLIDO (validarEvento já passou) na fila. Confere o tipo
 * (só guidance nesta fase), o vínculo CONFIRMADO no escopo da chave e os três
 * UUIDs, e a idempotência por event_id. A camada nasce aqui (a tela já mostra
 * "sincronizando" para uma camada nova).
 */
export async function enfileirar(amb: Ambiente, bruto: EventoRecebido, origem: OrigemEvento, escopo: EscopoChave): Promise<ResultadoEnfileirar> {
  const ev = normalizarEvento(bruto);
  if (!(TIPOS_RECEBIDOS as readonly string[]).includes(ev.resource_type)) {
    return { resultado: 'tipo_nao_suportado', mensagem: `resource_type "${ev.resource_type}" ainda não é recebido pela Invicta (só guidance nesta fase).` };
  }
  const v = await amb.repo.vinculoDoCampo(ev.shared_field_id);
  if (!v || !vinculosNoEscopo([v], escopo).length) {
    return { resultado: 'fora_do_vinculo', mensagem: 'Talhão fora do vínculo confirmado ou inexistente.' };
  }
  if (!idsBatem(ev, v)) {
    return { resultado: 'conflito', mensagem: 'shared_producer_id/shared_farm_id não conferem com o vínculo deste talhão.' };
  }
  const hash = impressaoEvento(ev);
  const jaExistia = async (ex: EventoExistente): Promise<ResultadoEnfileirar> => {
    const d = decidirReaviso(ex, hash);
    if (d === 'conflito') return { resultado: 'conflito', mensagem: 'event_id já recebido com outro conteúdo.' };
    if (d === 'repetido') return { resultado: 'repetido', eventId: ev.event_id };
    // Rejeitado antes e chegou de novo igual: tenta outra vez (a regra pode ter
    // mudado ou a PF pode ter corrigido a revisão).
    await amb.repo.reabrirEvento(ex.id, iso(agoraDe(amb)));
    return { resultado: 'reaberto', eventId: ev.event_id };
  };
  // event_id já conhecido: decide ANTES de criar camada (um 409 não deixa
  // camada órfã para trás).
  const ex = await amb.repo.eventoExistente(ev.event_id);
  if (ex) return jaExistia(ex);
  const c = await amb.repo.camada(ev.resource_id);
  if (c && c.vinculo_id !== v.id) {
    return { resultado: 'conflito', mensagem: 'Este resource_id já pertence a outro talhão.' };
  }
  if (!c) await amb.repo.criarCamada({ resource_id: ev.resource_id, vinculo_id: v.id, talhao_id: v.talhao_id });
  const ins = await amb.repo.inserirEvento({
    event_id: ev.event_id, conteudo_hash: hash, evento: ev, vinculo_id: v.id, talhao_id: v.talhao_id,
    resource_id: ev.resource_id, resource_revision: ev.resource_revision, origem,
  });
  if (ins.inserido) return { resultado: 'novo', eventId: ev.event_id };
  return jaExistia(ins.existente);
}

/** "Tentar de novo" (owner/admin) na camada com erro: reabre os avisos
 *  rejeitados dela. Devolve quantos voltaram para a fila. */
export async function tentarDeNovo(amb: Ambiente, resourceId: string): Promise<number> {
  return amb.repo.reabrirRejeitadosDaCamada(resourceId, iso(agoraDe(amb)));
}

// ── Aviso da PF (POST /integration/v1/notifications) ─────────────────────────

export interface RespostaHttp { status: number; corpo: unknown }

const erro = (status: number, code: string, message: string): RespostaHttp => ({ status, corpo: { error: { code, message } } });

/** Lê o corpo com teto de bytes (o Content-Length pode mentir ou faltar). */
export async function lerCorpoLimitado(req: Request, max: number): Promise<Uint8Array | null> {
  const decl = Number(req.headers.get('content-length'));
  if (Number.isFinite(decl) && decl > max) return null;
  if (!req.body) return new Uint8Array(0);
  const leitor = req.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { try { await leitor.cancel(); } catch { /* fechado */ } return null; }
    partes.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of partes) { out.set(p, o); o += p.byteLength; }
  return out;
}

/**
 * Núcleo da rota de avisos. Ordem: tamanho (413) → assinatura HMAC (401) →
 * chave Bearer (401) → JSON/contrato (422) → tipo (422) → vínculo (404/409) →
 * fila → 202. Persistido ANTES de responder; o processamento vem depois
 * (after() na rota + cron).
 */
export async function receberNotificacao(
  amb: Ambiente,
  req: Request,
  deps: { cfg: ConfigRecebimento; autenticar: (auth: string | null) => Promise<EscopoChave | null> },
): Promise<RespostaHttp> {
  const corpo = await lerCorpoLimitado(req, MAX_NOTIFICACAO_BYTES);
  if (!corpo) return erro(413, 'payload_too_large', `Aviso maior que ${MAX_NOTIFICACAO_BYTES / 1024} KB.`);
  const sig = verificarAssinatura({
    segredo: deps.cfg.hmacEntrada,
    timestamp: req.headers.get('x-pf-timestamp'),
    assinatura: req.headers.get('x-pf-signature'),
    corpo,
    agoraS: Math.floor(agoraDe(amb).getTime() / 1000),
  });
  if (!sig.ok) return erro(401, 'unauthorized', sig.erro);
  const escopo = await deps.autenticar(req.headers.get('authorization'));
  if (!escopo) return erro(401, 'unauthorized', 'Chave ausente, inválida ou revogada. Envie Authorization: Bearer <chave>.');

  let json: unknown;
  try { json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(corpo)); }
  catch { return erro(422, 'invalid_request', 'Corpo não é JSON UTF-8 válido.'); }
  const erros = validarEvento(json);
  if (erros.length) return erro(422, 'invalid_contract', `Aviso fora do contrato 0.2.0: ${erros.slice(0, 5).join('; ')}`);

  const r = await enfileirar(amb, json as EventoRecebido, 'notificacao', escopo);
  switch (r.resultado) {
    case 'novo': return { status: 202, corpo: { status: 'accepted', event_id: r.eventId } };
    case 'repetido': return { status: 202, corpo: { status: 'accepted', event_id: r.eventId, duplicate: true } };
    case 'reaberto': return { status: 202, corpo: { status: 'accepted', event_id: r.eventId, reopened: true } };
    case 'tipo_nao_suportado': return erro(422, 'unsupported_resource_type', r.mensagem);
    case 'fora_do_vinculo': return erro(404, 'not_found', r.mensagem);
    case 'conflito': return erro(409, 'conflict', r.mensagem);
  }
}

// ── Processamento da fila ────────────────────────────────────────────────────

export interface ResumoProcessamento { aplicados: number; rejeitados: number; adiados: number; recibosEnviados: number; recibosFalhos: number }

class Permanente extends Error {}

/** Processa UM aviso já travado. Nunca lança: o resultado vai para a fila. */
async function processarEvento(amb: Ambiente, ev: EventoFila): Promise<'aplicado' | 'rejeitado' | 'adiado'> {
  const { repo, pf } = amb;
  const e = ev.evento;
  const n = e.resource_revision;
  try {
    // Vínculo ainda confirmado (pode ter sido suspenso depois do aviso).
    const v = await repo.vinculoDoCampo(e.shared_field_id);
    if (!v || v.id !== ev.vinculo_id || v.status !== 'confirmado') throw new Permanente('O vínculo deste talhão não está mais confirmado na Invicta.');
    if (!idsBatem(e, v)) throw new Permanente('Os UUIDs compartilhados não conferem mais com o vínculo deste talhão.');

    let guardada = await repo.revisaoGuardada(e.resource_id, n);
    if (guardada && guardada.checksum !== e.checksum) throw new Permanente(`A revisão ${n} já foi recebida com outro checksum (snapshots são imutáveis).`);
    if (!guardada) {
      const bruto = await pf.revisao(e.resource_id, n);
      const conf = conferirRevisao(bruto, e);
      if (!conf.ok) throw new Permanente(conf.erro);
      let meta: MetaLinhas | null = null;
      if (conf.envelope.operation === 'upsert') {
        const val = validarPayloadLinhas(conf.envelope.payload);
        if (!val.ok) throw new Permanente(val.erro);
        meta = val.meta;
      }
      const g = await repo.guardarRevisao({
        resource_id: e.resource_id, revision: n, event_id: e.event_id, checksum: e.checksum,
        operation: e.operation, boundary_revision: e.boundary_revision, envelope: conf.envelope, meta,
      });
      if (g === 'existe') {
        // Outro processador guardou no meio do caminho: confere que é a mesma.
        const outra = await repo.revisaoGuardada(e.resource_id, n);
        if (!outra || outra.checksum !== e.checksum) throw new Permanente(`A revisão ${n} já foi recebida com outro checksum (snapshots são imutáveis).`);
      }
      guardada = { checksum: e.checksum, operation: e.operation, boundary_revision: e.boundary_revision, meta };
    }

    const agora = agoraDe(amb);
    const patch: PatchVigente = {
      revisao_vigente: n,
      arquivada: guardada.operation === 'archive',
      // Data do arquivamento NA PF (occurred_at do evento), não a hora daqui.
      arquivada_em: guardada.operation === 'archive' ? e.occurred_at : null,
      boundary_revision: guardada.boundary_revision,
      ...(guardada.operation === 'upsert' && guardada.meta ? { geometria: { revisao: n, meta: guardada.meta } } : {}),
    };
    // Revisão antiga chegando atrasada: guardada no histórico, sem regredir.
    await repo.promoverVigente(e.resource_id, patch, iso(agora));
    await repo.marcarSincronizada(e.resource_id, iso(agora));
    await repo.atualizarEvento(ev.id, {
      status: 'aplicado', ultimo_erro: null, travado_ate: null, processado_em: iso(agora),
      // Zera o envio: um recibo antigo que terminou no meio de uma reabertura
      // não pode marcar este resultado novo como já enviado.
      recibo_status: 'applied', recibo_motivo: null, recibo_proxima_em: iso(agora), recibo_enviado_em: null,
    });
    return 'aplicado';
  } catch (err) {
    const agora = agoraDe(amb);
    const tent = ev.tentativas + 1;
    const esgotou = err instanceof FalhaPF && err.classe === 'temporaria' && falhaDefinitiva(err.status, tent);
    const permanente = err instanceof Permanente || (err instanceof FalhaPF && err.classe === 'permanente') || esgotou;
    const base = err instanceof Error ? err.message : 'Falha desconhecida.';
    const motivo = esgotou ? `${base} Desistimos depois de ${TENTATIVAS_404} tentativas.` : base;
    if (permanente) {
      try {
        // Recusa de revisão MENOR que a vigente não põe a camada em erro (a
        // vigente segue válida); fica só no histórico de avisos recusados.
        const c = await repo.camada(e.resource_id);
        if (!c || c.revisao_vigente == null || n > c.revisao_vigente) {
          await repo.registrarErroCamada(e.resource_id, `Revisão ${n} recusada: ${motivo}`, iso(agora));
        }
        await repo.atualizarEvento(ev.id, {
          status: 'rejeitado', ultimo_erro: motivo, travado_ate: null, processado_em: iso(agora),
          recibo_status: 'rejected', recibo_motivo: motivo, recibo_proxima_em: iso(agora), recibo_enviado_em: null,
        });
      } catch (e2) { console.error('[precisionfarm] falha ao registrar recusa', e2 instanceof Error ? e2.message : e2); }
      return 'rejeitado';
    }
    try {
      await repo.atualizarEvento(ev.id, {
        tentativas: tent, ultimo_erro: motivo, travado_ate: null,
        proxima_tentativa_em: iso(somarS(agora, atrasoTentativaS(tent))),
      });
    } catch (e2) { console.error('[precisionfarm] falha ao adiar aviso', e2 instanceof Error ? e2.message : e2); }
    return 'adiado';
  }
}

/** Processa a fila até `limite` avisos ou até estourar o prazo; depois manda
 *  os recibos que ficaram prontos. */
export async function processarFila(amb: Ambiente, opts: { limite?: number; prazoMs?: number } = {}): Promise<ResumoProcessamento> {
  const inicio = Date.now();
  const prazo = opts.prazoMs ?? 40_000;
  const resumo: ResumoProcessamento = { aplicados: 0, rejeitados: 0, adiados: 0, recibosEnviados: 0, recibosFalhos: 0 };
  const agora = agoraDe(amb);
  const prontos = await amb.repo.eventosProntos(iso(agora), opts.limite ?? 25);
  for (const ev of prontos) {
    if (Date.now() - inicio > prazo) break;
    const a = agoraDe(amb);
    if (!(await amb.repo.travarEvento(ev.id, iso(a), iso(somarS(a, TRAVA_S))))) continue;
    const r = await processarEvento(amb, ev);
    if (r === 'aplicado') resumo.aplicados++;
    else if (r === 'rejeitado') resumo.rejeitados++;
    else resumo.adiados++;
  }
  const rec = await reenviarRecibos(amb);
  resumo.recibosEnviados = rec.enviados;
  resumo.recibosFalhos = rec.falhos;
  return resumo;
}

// ── Recibos (POST {PF}/receipts) ─────────────────────────────────────────────

export async function reenviarRecibos(amb: Ambiente, limite = 50): Promise<{ enviados: number; falhos: number }> {
  let enviados = 0, falhos = 0;
  const pend = await amb.repo.recibosPendentes(iso(agoraDe(amb)), limite);
  for (const ev of pend) {
    if (!ev.recibo_status) continue;
    const agora = agoraDe(amb);
    const tent = ev.recibo_tentativas + 1;
    try {
      const st = await amb.pf.enviarRecibo(ev.event_id, ev.recibo_status, ev.recibo_motivo);
      if (st >= 200 && st < 300) {
        // Condicional: se o aviso foi reaberto e reprocessado durante o envio,
        // o recibo novo continua pendente e sai no próximo ciclo.
        await amb.repo.atualizarEvento(ev.id, { recibo_enviado_em: iso(agora), recibo_tentativas: tent, recibo_erro: null, recibo_proxima_em: null },
          ev.recibo_proxima_em ?? undefined);
        enviados++;
      } else if (reciboDeveRepetir(st)) {
        await amb.repo.atualizarEvento(ev.id, { recibo_tentativas: tent, recibo_erro: `A PrecisionFarm respondeu ${st} ao recibo.`, recibo_proxima_em: iso(somarS(agora, atrasoTentativaS(tent))) });
        falhos++;
      } else {
        // 4xx definitivo: para de insistir (fica registrado para o suporte).
        await amb.repo.atualizarEvento(ev.id, { recibo_tentativas: tent, recibo_erro: `A PrecisionFarm recusou o recibo (${st}); não será reenviado.`, recibo_proxima_em: null });
        falhos++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao enviar o recibo.';
      try {
        await amb.repo.atualizarEvento(ev.id, { recibo_tentativas: tent, recibo_erro: msg, recibo_proxima_em: iso(somarS(agora, atrasoTentativaS(tent))) });
      } catch { /* a próxima rodada tenta de novo */ }
      falhos++;
    }
  }
  return { enviados, falhos };
}

// ── Recuperação por /changes e carga inicial por /inventory ──────────────────

export interface ResumoEnfileiramento { novos: number; repetidos: number; reabertos: number; ignorados: number; conflitos: number; invalidos: number }

const resumoVazio = (): ResumoEnfileiramento => ({ novos: 0, repetidos: 0, reabertos: 0, ignorados: 0, conflitos: 0, invalidos: 0 });

/** Guarda só itens pequenos no registro de descartes (o motivo basta para o
 *  resto). */
function itemParaRegistro(item: unknown): unknown {
  try { return JSON.stringify(item).length <= 64 * 1024 ? item : null; } catch { return null; }
}
const eventIdDe = (v: unknown): string | null => {
  const id = (v as { event_id?: unknown } | null)?.event_id;
  return typeof id === 'string' ? id.slice(0, 80) : null;
};

/** Enfileira os eventos de uma página. Evento de outro tipo ou fora do vínculo
 *  é IGNORADO (a recuperação lê tudo da parceria); falha de banco sobe — e aí o
 *  cursor não anda. */
async function enfileirarLote(amb: Ambiente, itens: readonly unknown[], origem: OrigemEvento, escopo: EscopoChave, r: ResumoEnfileiramento): Promise<void> {
  for (const item of itens) {
    const ev = eventoDoItem(item);
    const erros = validarEvento(ev);
    if (erros.length) {
      // Registrado (tabela + log) ANTES de o cursor andar — não some calado.
      const motivo = `Evento fora do contrato: ${erros.slice(0, 5).join('; ')}`;
      console.warn('[precisionfarm] evento descartado:', origem, eventIdDe(ev), motivo);
      await amb.repo.registrarDescarte({ origem, event_id: eventIdDe(ev), motivo, item: itemParaRegistro(item) }, iso(agoraDe(amb)));
      r.invalidos++;
      continue;
    }
    const x = await enfileirar(amb, ev as EventoRecebido, origem, escopo);
    if (x.resultado === 'novo') r.novos++;
    else if (x.resultado === 'repetido') r.repetidos++;
    else if (x.resultado === 'reaberto') r.reabertos++;
    else if (x.resultado === 'conflito') {
      console.warn('[precisionfarm] evento em conflito descartado:', origem, eventIdDe(ev), x.mensagem);
      await amb.repo.registrarDescarte({ origem, event_id: eventIdDe(ev), motivo: x.mensagem, item: itemParaRegistro(item) }, iso(agoraDe(amb)));
      r.conflitos++;
    } else r.ignorados++;
  }
}

/** GET {PF}/changes desde o cursor salvo; o next_cursor só é gravado DEPOIS
 *  de a página inteira estar na fila. */
export async function recuperarPorChanges(amb: Ambiente, escopo: EscopoChave, opts: { paginasMax?: number; prazoMs?: number } = {}): Promise<ResumoEnfileiramento & { paginas: number; cursor: string }> {
  const inicio = Date.now();
  const r = resumoVazio();
  let cursor = await amb.repo.lerCursor();
  let paginas = 0;
  for (;;) {
    if (paginas >= (opts.paginasMax ?? 10) || Date.now() - inicio > (opts.prazoMs ?? 20_000)) break;
    const p = await amb.pf.changes(cursor, 100);
    paginas++;
    await enfileirarLote(amb, p.items, 'changes', escopo, r);
    if (p.next_cursor !== cursor) {
      cursor = p.next_cursor;
      await amb.repo.gravarCursor(cursor, iso(agoraDe(amb)));
    }
    if (!p.has_more) break;
  }
  return { ...r, paginas, cursor };
}

/** Carga inicial de um talhão: GET {PF}/fields/{id}/inventory e enfileira o
 *  `event` de cada camada de linhas (o event_id DELES — nada inventado).
 *  Camada sem `event` no inventário é contada e não entra. */
export async function cargaInicial(amb: Ambiente, sharedFieldId: string, escopo: EscopoChave): Promise<ResumoEnfileiramento & { semEvento: number }> {
  const r = resumoVazio();
  let semEvento = 0;
  let cursor = '0';
  for (let pag = 0; pag < 20; pag++) {
    const p = await amb.pf.inventario(sharedFieldId, cursor);
    const eventos: unknown[] = [];
    for (const it of p.items) {
      const o = it as { resource_type?: unknown; event?: unknown };
      if (o?.resource_type !== 'guidance') { r.ignorados++; continue; }
      if (!o.event || typeof o.event !== 'object') { semEvento++; continue; }
      eventos.push(o.event);
    }
    await enfileirarLote(amb, eventos, 'inventario', escopo, r);
    if (!p.has_more || p.next_cursor === cursor) break;
    cursor = p.next_cursor;
  }
  return { ...r, semEvento };
}

/** Rotina do cron (a cada 5 min): fila → recibos → /changes → fila de novo
 *  (o que a recuperação trouxe). Uma falha da PF numa etapa não impede as outras. */
export async function rotinaPeriodica(amb: Ambiente, escopo: EscopoChave, prazoMs = 45_000): Promise<{ falhaInterna: boolean; etapas: Record<string, unknown> }> {
  const inicio = Date.now();
  const resto = () => Math.max(1_000, prazoMs - (Date.now() - inicio));
  const etapas: Record<string, unknown> = {};
  // Falha da PF (rede, 503…) é o dia a dia: a rotina rodou e tenta de novo.
  // Falha NOSSA (banco/fila) vira falhaInterna → a rota responde 500.
  let falhaInterna = false;
  const etapa = async (nome: string, fn: () => Promise<unknown>) => {
    try { etapas[nome] = await fn(); }
    catch (e) {
      etapas[nome] = { erro: e instanceof Error ? e.message : 'falha' };
      if (!(e instanceof FalhaPF)) falhaInterna = true;
    }
  };
  await etapa('fila', () => processarFila(amb, { prazoMs: resto() / 2 }));
  await etapa('changes', () => recuperarPorChanges(amb, escopo, { prazoMs: resto() / 2 }));
  await etapa('filaDepois', () => processarFila(amb, { prazoMs: resto() }));
  return { falhaInterna, etapas };
}
