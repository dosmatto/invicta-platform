// Integração PrecisionFarm (ponte 0.2.0) — FASE 2: RECEBER as linhas da PF.
// Núcleo PURO do recebimento.
//
// A PrecisionFarm avisa (POST /integration/v1/notifications, assinado com HMAC)
// que publicou uma revisão de LINHAS (resource_type 'guidance'); a Invicta põe
// o aviso numa fila, busca a revisão completa em GET {PF}/resources/{id}/revisions/{n},
// confere contrato, checksum, vínculo e geometria, guarda o snapshot imutável e
// passa a mostrá-lo como a camada VIGENTE. O resultado volta num recibo
// assinado (POST {PF}/receipts).
//
// Aqui vive TUDO o que DECIDE: configuração, assinatura HMAC, validação do
// aviso e da revisão, regra de ordem (sem regressão), backoff e a classificação
// das falhas (temporária × permanente). Sem banco e sem rede — imports com
// `.ts` — é o que deixa `npm run teste:precisionfarm` exercitar isto de verdade.
// Orquestração: recebimento.ts. Banco: repoLinhas.ts. HTTP da PF: clientePF.ts.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  MAX_FEICOES, MAX_GEOJSON_BYTES, MAX_VERTICES, SCHEMA_ENVELOPE,
  canonico, checksumEnvelope, validarContraSchema,
} from './contrato.ts';

// ── Constantes ───────────────────────────────────────────────────────────────

/** Corpo máximo de um aviso (contrato §4: notificações até 256 KB). */
export const MAX_NOTIFICACAO_BYTES = 256 * 1024;
/** Tolerância do X-PF-Timestamp (contrato §3: 300 s). */
export const TOLERANCIA_ASSINATURA_S = 300;
/** Tipos que a Invicta RECEBE nesta fase. Limite, zonas etc. → 422. */
export const TIPOS_RECEBIDOS = ['guidance'] as const;
/** Tipos de feição de uma camada de linhas: linha guia e bordadura. */
export const KINDS_LINHA = ['guidance', 'headland'] as const;
export type KindLinha = typeof KINDS_LINHA[number];

/** Backoff das retentativas: 10 s, 20 s, 40 s… até 1 h (contrato §5). */
export const ATRASO_MIN_S = 10;
export const ATRASO_MAX_S = 3600;

/** Teto do corpo de uma revisão vinda da PF: 10 MB de GeoJSON + folga para os
 *  campos do envelope. A geometria em si é conferida contra os 10 MB. */
export const MAX_REVISAO_BYTES = MAX_GEOJSON_BYTES + 256 * 1024;

export const MSG_NAO_CONFIGURADA = 'Integração de recebimento não configurada.';

// ── Configuração (variáveis de ambiente) ─────────────────────────────────────

/** Variáveis que o recebimento exige. O segredo do cron (PF_CRON_SEGREDO) é
 *  conferido à parte, só na rota do cron. */
export const VARS_RECEBIMENTO = ['PF_BASE_URL', 'PF_CHAVE', 'PF_HMAC_ENTRADA', 'PF_HMAC_SAIDA'] as const;

export interface ConfigRecebimento {
  /** Base da PF terminando em /integration/v1, sem barra final. */
  baseUrl: string;
  /** Bearer que a PF emitiu para a Invicta. */
  chave: string;
  /** Segredo HMAC PrecisionFarm → Invicta (confere os avisos). */
  hmacEntrada: string;
  /** Segredo HMAC Invicta → PrecisionFarm (assina os recibos). */
  hmacSaida: string;
}

export type LeituraConfig =
  | { ok: true; cfg: ConfigRecebimento }
  | { ok: false; faltando: string[]; erro: string };

/** Sufixo que o contrato fixa para a base da API (§4). */
export const SUFIXO_BASE = '/integration/v1';

/**
 * Base da PF: só https, sem usuário/senha, sem query/fragmento, e TERMINANDO em
 * /integration/v1 (barra final tolerada e removida). Colar só o domínio faria
 * toda busca de revisão dar 404 — melhor "não configurada" do que recusar avisos.
 */
export function normalizarBaseUrl(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) return null;
  const caminho = u.pathname.replace(/\/+$/, '');
  if (!caminho.endsWith(SUFIXO_BASE)) return null;
  return `${u.origin}${caminho}`;
}

/**
 * Lê a configuração do ambiente. Nunca devolve nem registra VALOR de segredo —
 * só os NOMES que faltam (é o que a tela e as rotas mostram).
 */
export function lerConfigRecebimento(env: Record<string, string | undefined>): LeituraConfig {
  const v = (k: string) => (env[k] ?? '').trim();
  const faltando = VARS_RECEBIMENTO.filter(k => !v(k));
  if (faltando.length) return { ok: false, faltando: [...faltando], erro: MSG_NAO_CONFIGURADA };
  const baseUrl = normalizarBaseUrl(v('PF_BASE_URL'));
  if (!baseUrl) {
    return { ok: false, faltando: [], erro: `${MSG_NAO_CONFIGURADA} PF_BASE_URL precisa ser um endereço https:// terminando em ${SUFIXO_BASE} (ex.: https://precisionfarm.com.br${SUFIXO_BASE}), sem usuário, senha ou parâmetros.` };
  }
  return { ok: true, cfg: { baseUrl, chave: v('PF_CHAVE'), hmacEntrada: v('PF_HMAC_ENTRADA'), hmacSaida: v('PF_HMAC_SAIDA') } };
}

// ── Assinatura HMAC (idêntica a ASSINATURA_EXEMPLO.mjs) ──────────────────────

const bytesUtf8 = (s: string) => Buffer.from(s, 'utf8');

/**
 * HMAC-SHA256(segredo, timestamp + "." + bytes EXATOS do corpo), em hex
 * minúsculo. O segredo é usado como TEXTO UTF-8 — mesmo que pareça hex, não é
 * decodificado (contrato §3).
 */
export function assinarHmac(segredo: string, timestamp: string, corpo: string | Uint8Array): string {
  const c = typeof corpo === 'string' ? bytesUtf8(corpo) : corpo;
  return createHmac('sha256', bytesUtf8(segredo)).update(bytesUtf8(`${timestamp}.`)).update(c).digest('hex');
}

export type VerificacaoAssinatura = { ok: true } | { ok: false; erro: string };

/** Confere X-PF-Timestamp (± 300 s) e X-PF-Signature em tempo constante. */
export function verificarAssinatura(a: {
  segredo: string; timestamp: string | null; assinatura: string | null; corpo: Uint8Array; agoraS: number;
}): VerificacaoAssinatura {
  const ts = (a.timestamp ?? '').trim();
  if (!/^\d{1,12}$/.test(ts)) return { ok: false, erro: 'X-PF-Timestamp ausente ou inválido (segundos Unix).' };
  if (Math.abs(a.agoraS - Number(ts)) > TOLERANCIA_ASSINATURA_S) {
    return { ok: false, erro: `X-PF-Timestamp fora da tolerância de ${TOLERANCIA_ASSINATURA_S} s.` };
  }
  const sig = (a.assinatura ?? '').trim();
  if (!/^[0-9a-f]{64}$/.test(sig)) return { ok: false, erro: 'X-PF-Signature ausente ou fora do formato (hex minúsculo).' };
  const esperado = Buffer.from(assinarHmac(a.segredo, ts, a.corpo), 'hex');
  const recebido = Buffer.from(sig, 'hex');
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) {
    return { ok: false, erro: 'Assinatura HMAC inválida.' };
  }
  return { ok: true };
}

/** Comparação em tempo constante de dois textos (segredo do cron). */
export function textosIguais(a: string, b: string): boolean {
  const x = createHash('sha256').update(a, 'utf8').digest();
  const y = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(x, y);
}

// ── Aviso (evento = envelope sem payload + checksum) ─────────────────────────

/** Esquema do EVENTO derivado do envelope.schema.json: tira `payload`, põe
 *  `checksum`. Mesmo formato de exemplo-notificacao.json e de inventory.items[].event. */
const { payload: _payloadSchema, ...PROPS_SEM_PAYLOAD } = SCHEMA_ENVELOPE.properties;
void _payloadSchema;
export const SCHEMA_EVENTO = {
  type: 'object',
  required: [...SCHEMA_ENVELOPE.required.filter(k => k !== 'payload'), 'checksum'],
  properties: { ...PROPS_SEM_PAYLOAD, checksum: { type: 'string' } },
  additionalProperties: false,
} as const;

export interface EventoRecebido {
  contract_version: string;
  event_id: string;
  source_system: string;
  shared_producer_id: string;
  shared_farm_id: string;
  shared_field_id: string;
  resource_id: string;
  resource_type: string;
  resource_revision: number;
  base_revision: number;
  boundary_revision: number;
  occurred_at: string;
  operation: 'upsert' | 'archive';
  checksum: string;
}

type EsquemaGenerico = Parameters<typeof validarContraSchema>[0];

/** Erros do aviso contra o contrato (vazio = válido). Exige origem
 *  'precisionfarm' e checksum SHA-256 em hex. */
export function validarEvento(v: unknown): string[] {
  const erros = validarContraSchema(SCHEMA_EVENTO as unknown as EsquemaGenerico, v);
  if (erros.length) return erros;
  const e = v as EventoRecebido;
  if (e.source_system !== 'precisionfarm') erros.push('$.source_system: esperado "precisionfarm"');
  if (!/^[0-9a-f]{64}$/.test(e.checksum)) erros.push('$.checksum: esperado SHA-256 em hex minúsculo');
  if (e.base_revision !== e.resource_revision - 1) erros.push('$.base_revision: deve ser resource_revision - 1');
  return erros;
}

/** UUIDs em minúsculas (a chave do banco e as comparações não podem depender
 *  da caixa que a PF mandou). */
export function normalizarEvento(e: EventoRecebido): EventoRecebido {
  return {
    ...e,
    event_id: e.event_id.toLowerCase(),
    shared_producer_id: e.shared_producer_id.toLowerCase(),
    shared_farm_id: e.shared_farm_id.toLowerCase(),
    shared_field_id: e.shared_field_id.toLowerCase(),
    resource_id: e.resource_id.toLowerCase(),
  };
}

/** Impressão do CONTEÚDO do aviso (forma canônica) — decide "mesmo event_id,
 *  mesmo conteúdo" (202 sem duplicar) × "conteúdo diferente" (409). Espaços e
 *  ordem das chaves no JSON não contam; qualquer valor diferente conta. */
export function impressaoEvento(e: EventoRecebido): string {
  return createHash('sha256').update(canonico(normalizarEvento(e))).digest('hex');
}

export type DecisaoDuplicado = 'novo' | 'repetido' | 'conflito';
export function decidirDuplicado(existente: string | null, novo: string): DecisaoDuplicado {
  if (existente == null) return 'novo';
  return existente === novo ? 'repetido' : 'conflito';
}

/** Item de /changes: o evento vem no próprio item (formato do inventário) ou em
 *  `item.event`. Os dois são aceitos. */
export function eventoDoItem(item: unknown): unknown {
  if (item && typeof item === 'object' && 'event' in item && (item as { event?: unknown }).event && typeof (item as { event?: unknown }).event === 'object') {
    return (item as { event: unknown }).event;
  }
  return item;
}

// ── Vínculo ──────────────────────────────────────────────────────────────────

export interface IdsVinculo { shared_producer_id: string; shared_farm_id: string; shared_field_id: string }

/** Os três UUIDs do aviso batem com os do vínculo? (o talhão já foi achado
 *  pelo shared_field_id; produtor/fazenda diferentes = identidade conflitante). */
export function idsBatem(e: IdsVinculo, v: IdsVinculo): boolean {
  return e.shared_producer_id.toLowerCase() === v.shared_producer_id.toLowerCase()
    && e.shared_farm_id.toLowerCase() === v.shared_farm_id.toLowerCase()
    && e.shared_field_id.toLowerCase() === v.shared_field_id.toLowerCase();
}

// ── Revisão (snapshot completo vindo da PF) ──────────────────────────────────

export interface EnvelopeRecebido extends Omit<EventoRecebido, 'checksum'> { payload: Record<string, unknown> }

export type ConferenciaRevisao = { ok: true; envelope: EnvelopeRecebido } | { ok: false; erro: string };

/**
 * A revisão baixada é a que o aviso anunciou? Contrato 0.2.0 (schema), origem
 * PF, mesmo evento/recurso/revisão/tipo/operação/UUIDs e o checksum canônico
 * (o MESMO cálculo da fase 1, sem asset.url/expires_at) igual ao do aviso.
 */
export function conferirRevisao(bruto: unknown, ev: EventoRecebido): ConferenciaRevisao {
  const erros = validarContraSchema(SCHEMA_ENVELOPE as unknown as EsquemaGenerico, bruto);
  if (erros.length) return { ok: false, erro: `Revisão fora do contrato 0.2.0: ${erros.slice(0, 5).join('; ')}` };
  const e = bruto as EnvelopeRecebido;
  if (e.source_system !== 'precisionfarm') return { ok: false, erro: 'Revisão com source_system diferente de "precisionfarm".' };
  const campos = ['event_id', 'shared_producer_id', 'shared_farm_id', 'shared_field_id', 'resource_id'] as const;
  for (const k of campos) {
    if (String(e[k]).toLowerCase() !== String(ev[k]).toLowerCase()) return { ok: false, erro: `A revisão baixada não confere com o aviso (${k} diferente).` };
  }
  const exatos = ['resource_type', 'resource_revision', 'base_revision', 'boundary_revision', 'operation', 'contract_version'] as const;
  for (const k of exatos) {
    if (e[k] !== ev[k]) return { ok: false, erro: `A revisão baixada não confere com o aviso (${k} diferente).` };
  }
  const c = checksumEnvelope(e);
  if (c !== ev.checksum) return { ok: false, erro: `Checksum não confere: o aviso diz ${ev.checksum.slice(0, 12)}…, a revisão baixada dá ${c.slice(0, 12)}….` };
  return { ok: true, envelope: e };
}

export interface MetaLinhas {
  nome: string;
  integrationName: string | null;
  /** 'summer' | 'winter' (ciclo verão/inverno — linhas são perenes, sem safra). */
  ciclo: string | null;
  categoria: string | null;
  espacamentoM: number | null;
  nFeicoes: number;
  nVertices: number;
  bytes: number;
  /** Feições sem properties.kind (ou com valor desconhecido) — desenhadas como
   *  linha guia e anotadas no histórico. */
  nSemKind: number;
  /** Nota para o histórico da revisão (null = nada a registrar). */
  observacao: string | null;
}

export type ResultadoLinhas = { ok: true; meta: MetaLinhas } | { ok: false; erro: string };

const CICLOS = new Set(['summer', 'winter']);
const CRS_WGS84 = new Set(['urn:ogc:def:crs:OGC:1.3:CRS84', 'urn:ogc:def:crs:OGC::CRS84', 'EPSG:4326', 'urn:ogc:def:crs:EPSG::4326']);

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const textoOuNulo = (v: unknown) => v == null || typeof v === 'string';

function posicaoOk(p: unknown): boolean {
  return Array.isArray(p) && (p.length === 2 || p.length === 3)
    && p.every(n => typeof n === 'number' && Number.isFinite(n))
    && Math.abs(p[0] as number) <= 180 && Math.abs(p[1] as number) <= 90;
}

/** Vértices de uma LineString válida (≥ 2 posições WGS84), ou -1. */
function verticesDaLinha(l: unknown): number {
  if (!Array.isArray(l) || l.length < 2) return -1;
  for (const p of l) if (!posicaoOk(p)) return -1;
  return l.length;
}

/**
 * Nome mostrado da camada: payload.name; sem ele, integration_name; sem os
 * dois, "Linhas <operation_category> <ciclo>" (o que houver).
 */
export function nomeDaCamada(p: { name?: unknown; integration_name?: unknown; operation_category?: unknown; cropping_cycle?: unknown }): string {
  const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return t(p.name) || t(p.integration_name)
    || ['Linhas', t(p.operation_category), t(p.cropping_cycle)].filter(Boolean).join(' ');
}

/**
 * Payload de uma revisão 'guidance' (operação upsert). Recusa — SEM reparar —
 * o que não for: FeatureCollection de LineString/MultiLineString em WGS84
 * [longitude, latitude]; até 100 mil feições, 1 milhão de vértices e 10 MB de
 * GeoJSON. properties.kind 'headland' = bordadura; qualquer outro valor (ou
 * ausente — o contrato não define `kind`) é tratado como linha guia e fica
 * anotado no histórico. Metadados: name (sem ele, nomeDaCamada),
 * integration_name, cropping_cycle (summer/winter), operation_category,
 * spacing_m (> 0).
 */
export function validarPayloadLinhas(payload: unknown): ResultadoLinhas {
  if (!ehObjeto(payload)) return { ok: false, erro: 'payload ausente ou não é um objeto.' };
  const p = payload;
  if (!textoOuNulo(p.name)) return { ok: false, erro: 'payload.name deve ser texto.' };
  if (!textoOuNulo(p.integration_name)) return { ok: false, erro: 'payload.integration_name deve ser texto.' };
  if (p.cropping_cycle != null && !CICLOS.has(String(p.cropping_cycle))) {
    return { ok: false, erro: `payload.cropping_cycle "${String(p.cropping_cycle)}" fora de summer/winter.` };
  }
  if (!textoOuNulo(p.operation_category)) return { ok: false, erro: 'payload.operation_category deve ser texto.' };
  if (p.spacing_m != null && !(typeof p.spacing_m === 'number' && Number.isFinite(p.spacing_m) && p.spacing_m > 0)) {
    return { ok: false, erro: 'payload.spacing_m deve ser um número maior que zero (metros).' };
  }

  const g = p.geometry;
  if (!ehObjeto(g) || g.type !== 'FeatureCollection' || !Array.isArray(g.features)) {
    return { ok: false, erro: 'payload.geometry deve ser uma FeatureCollection.' };
  }
  const crs = ehObjeto(g.crs) && ehObjeto(g.crs.properties) ? String(g.crs.properties.name ?? '') : '';
  if (g.crs != null && !CRS_WGS84.has(crs)) return { ok: false, erro: `Sistema de coordenadas "${crs || 'desconhecido'}" — o contrato exige WGS84 [longitude, latitude].` };
  const feats = g.features as unknown[];
  if (feats.length > MAX_FEICOES) return { ok: false, erro: `A camada tem ${feats.length} feições; o contrato aceita até ${MAX_FEICOES}.` };

  let nVertices = 0;
  let nSemKind = 0;
  const kindsEstranhos = new Set<string>();
  for (let i = 0; i < feats.length; i++) {
    const f = feats[i];
    const n = i + 1;
    if (!ehObjeto(f) || f.type !== 'Feature') return { ok: false, erro: `A feição ${n} não é uma Feature GeoJSON.` };
    const props = f.properties;
    const kind = ehObjeto(props) ? props.kind : undefined;
    if (!(KINDS_LINHA as readonly unknown[]).includes(kind)) {
      nSemKind++;
      if (kind != null && kindsEstranhos.size < 5) kindsEstranhos.add(String(kind).slice(0, 40));
    }
    const geom = f.geometry;
    if (!ehObjeto(geom)) return { ok: false, erro: `A feição ${n} não tem geometria.` };
    if (geom.type === 'LineString') {
      const v = verticesDaLinha(geom.coordinates);
      if (v < 0) return { ok: false, erro: `A feição ${n} tem LineString inválida (mínimo 2 posições [longitude, latitude] em WGS84).` };
      nVertices += v;
    } else if (geom.type === 'MultiLineString') {
      const ls = geom.coordinates;
      if (!Array.isArray(ls) || !ls.length) return { ok: false, erro: `A feição ${n} tem MultiLineString vazia.` };
      for (const l of ls) {
        const v = verticesDaLinha(l);
        if (v < 0) return { ok: false, erro: `A feição ${n} tem MultiLineString com parte inválida (mínimo 2 posições [longitude, latitude] em WGS84).` };
        nVertices += v;
      }
    } else {
      return { ok: false, erro: `A feição ${n} é ${String(geom.type)}; linhas só aceitam LineString ou MultiLineString.` };
    }
    if (nVertices > MAX_VERTICES) return { ok: false, erro: `A camada passa de ${MAX_VERTICES.toLocaleString('pt-BR')} vértices (limite do contrato).` };
  }
  const bytes = bytesUtf8(JSON.stringify(g)).length;
  if (bytes > MAX_GEOJSON_BYTES) return { ok: false, erro: `A geometria tem ${(bytes / 1024 / 1024).toFixed(1)} MB; o contrato aceita até 10 MB.` };

  const observacao = nSemKind
    ? `${nSemKind} feição(ões) sem properties.kind de linha guia/bordadura${kindsEstranhos.size ? ` (veio: ${[...kindsEstranhos].join(', ')})` : ''} — desenhadas como linha guia.`
    : null;
  return {
    ok: true,
    meta: {
      nome: nomeDaCamada(p),
      nSemKind,
      observacao,
      integrationName: typeof p.integration_name === 'string' ? p.integration_name : null,
      ciclo: p.cropping_cycle == null ? null : String(p.cropping_cycle),
      categoria: typeof p.operation_category === 'string' ? p.operation_category : null,
      espacamentoM: typeof p.spacing_m === 'number' ? p.spacing_m : null,
      nFeicoes: feats.length,
      nVertices,
      bytes,
    },
  };
}

// ── Ordem das revisões e arquivamento ────────────────────────────────────────

/** A revisão `n` passa a ser a vigente? Só se for MAIOR que a atual — revisão
 *  antiga que chega atrasada é guardada no histórico, mas não regride a tela. */
export function promove(vigente: number | null | undefined, n: number): boolean {
  return vigente == null || n > vigente;
}

export interface RevisaoHistorico { revision: number; operation: 'upsert' | 'archive' }

/** Estado da camada a partir das revisões GUARDADAS: vigente = a maior;
 *  arquivada = a maior é um archive; geometria a desenhar = a maior upsert até
 *  a vigente (archive não traz linhas, mas o histórico continua consultável). */
export function estadoDasRevisoes(revs: readonly RevisaoHistorico[]): { vigente: number | null; arquivada: boolean; revisaoGeometria: number | null } {
  if (!revs.length) return { vigente: null, arquivada: false, revisaoGeometria: null };
  const ord = [...revs].sort((a, b) => b.revision - a.revision);
  const ups = ord.find(r => r.operation === 'upsert');
  return { vigente: ord[0].revision, arquivada: ord[0].operation === 'archive', revisaoGeometria: ups?.revision ?? null };
}

// ── Falhas, retentativas e recibos ───────────────────────────────────────────

/** Atraso (s) antes da tentativa seguinte à `tentativa`-ésima falha: 10, 20,
 *  40… até 3600. */
export function atrasoTentativaS(tentativa: number): number {
  const k = Math.max(1, Math.trunc(tentativa));
  return Math.min(ATRASO_MAX_S, ATRASO_MIN_S * 2 ** Math.min(k - 1, 20));
}

export type ClasseFalha = 'temporaria' | 'permanente';

/**
 * Status HTTP da PF ao BUSCAR uma revisão/página. Permanente = o pedido nunca
 * vai dar certo do jeito que está (409, 410, 413, 422). Todo o resto (3xx
 * recusado, 401/403 de configuração, 404, 408, 429, 5xx, 503 "desabilitada")
 * é temporário: corrigir a configuração ou esperar a PF resolve, e a fila
 * tenta de novo com backoff. O 404 vira permanente só quando o backoff
 * esgota (falhaDefinitiva) — a publicação pode ainda estar propagando.
 */
export function classeDoStatus(status: number): ClasseFalha {
  return [409, 410, 413, 422].includes(status) ? 'permanente' : 'temporaria';
}

/** Tentativas com 404 antes de desistir: é quando o backoff chega ao teto de
 *  1 h (10, 20 … 2560 s — cerca de 85 min de espera somada). */
export const TENTATIVAS_404 = 10;

/** Esta falha temporária, na `tentativa`-ésima vez, já é definitiva? Só o 404
 *  tem prazo; o resto (rede, 5xx, 503, 401 de configuração) espera sempre. */
export function falhaDefinitiva(status: number | null, tentativa: number): boolean {
  return status === 404 && tentativa >= TENTATIVAS_404;
}

/**
 * Aviso que chega com um event_id JÁ NA FILA: mesmo conteúdo e a tarefa tinha
 * sido REJEITADA → reabre (a regra pode ter mudado, a PF pode ter corrigido);
 * mesmo conteúdo em outro estado → repetido; conteúdo diferente → conflito.
 */
export function decidirReaviso(existente: { conteudoHash: string; status: string }, novoHash: string): 'reabrir' | 'repetido' | 'conflito' {
  const d = decidirDuplicado(existente.conteudoHash, novoHash);
  if (d === 'conflito') return 'conflito';
  return existente.status === 'rejeitado' ? 'reabrir' : 'repetido';
}

/** Recibo recusado pela PF: insistir só faz sentido em 408/425/429/5xx (e
 *  falha de rede); outro 4xx é definitivo. */
export function reciboDeveRepetir(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500 || (status >= 300 && status < 400) || status === 401 || status === 403;
}

export type StatusRecibo = 'received' | 'applied' | 'rejected';

/** Corpo do recibo (exemplo-recibo.json). Motivo cortado em 500 caracteres. */
export function corpoRecibo(eventId: string, status: StatusRecibo, motivo: string | null): string {
  const reason = status === 'rejected' ? (motivo ?? 'rejeitado').slice(0, 500) : null;
  return JSON.stringify({ event_id: eventId, status, reason });
}

// ── Tela ─────────────────────────────────────────────────────────────────────

export type SituacaoCamada = 'atualizado' | 'sincronizando' | 'erro';

/** Situação mostrada: há aviso na fila → sincronizando; o último recebido foi
 *  recusado (e nada mais novo entrou depois) → erro; senão atualizado. */
export function situacaoCamada(c: { ultimoErro: string | null }, pendentes: number): SituacaoCamada {
  if (pendentes > 0) return 'sincronizando';
  if (c.ultimoErro) return 'erro';
  return 'atualizado';
}
