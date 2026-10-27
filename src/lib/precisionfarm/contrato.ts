// Integração PrecisionFarm (ponte 0.2.0) — núcleo PURO do contrato.
//
// A PrecisionFarm lê, por /integration/v1/*, as camadas que a Invicta PUBLICOU
// (zonas consolidadas e colheita oficial) dos talhões com vínculo confirmado.
// Aqui vive TUDO o que decide o FORMATO do que sai: checksum canônico, envelope,
// payloads de zonas e colheita, época/safra do contrato, paginação e o filtro
// de escopo. A rota (rota.ts) e o servidor (servidor.ts) só autenticam, leem o
// banco, chamam isto e gravam. Sem DOM, sem banco, imports com `.ts` — é o que
// deixa `npm run teste:precisionfarm` exercitar o contrato de verdade.
//
// Contrato de referência: docs/integracao-precisionfarm/ponte-0.2/ (openapi.json,
// envelope.schema.json, ASSINATURA_EXEMPLO.mjs). Lado da Invicta:
// docs/integracao-precisionfarm.md.

import { createHash } from 'node:crypto';
import { rotuloZona } from '../meap/rotuloZona.ts';
import { classeReconhecida, classeZona, ORDEM_CLASSES } from '../zonas.ts';

// ── Constantes do contrato ───────────────────────────────────────────────────

export const CONTRACT_VERSION = '0.2.0';
export const SOURCE_SYSTEM = 'invicta';

/** Tipos que a Invicta publica na fase 1. */
export const TIPOS_PUBLICADOS = ['management_zones', 'harvest'] as const;
export type TipoRecurso = typeof TIPOS_PUBLICADOS[number];

export const FORMATOS = ['application/geo+json'] as const;

/** Limite do CONTRATO por revisão GeoJSON (10 MB). */
export const MAX_GEOJSON_BYTES = 10 * 1024 * 1024;
/** Limite PRÁTICO da Invicta: a revisão volta inteira numa resposta de função
 *  da Vercel, que corta perto de 4,5 MB. Acima disto a publicação é recusada
 *  (GeoTIFF/asset fica para a fase 4). Divergência documentada. */
export const MAX_ENVELOPE_BYTES_INVICTA = 4 * 1024 * 1024;
export const MAX_FEICOES = 100_000;
export const MAX_VERTICES = 1_000_000;

export const LIMITE_PAGINA_PADRAO = 100;
export const LIMITE_PAGINA_MAX = 200;

// ── Checksum canônico (idêntico a ASSINATURA_EXEMPLO.mjs) ────────────────────

/** Serialização canônica: chaves ordenadas recursivamente, arrays na ordem. */
export function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map(k => `${JSON.stringify(k)}:${canonico(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/** SHA-256 hex da forma canônica do envelope SEM payload.asset.url/expires_at
 *  (podem ser renovados sem mudar a revisão). Não altera o objeto recebido. */
export function checksumEnvelope(envelope: object): string {
  const estavel = structuredClone(envelope) as Record<string, unknown> & { payload?: { asset?: Record<string, unknown> } };
  if (estavel.payload?.asset) {
    delete estavel.payload.asset.url;
    delete estavel.payload.asset.expires_at;
  }
  return createHash('sha256').update(canonico(estavel)).digest('hex');
}

/**
 * Impressão do CONTEÚDO de uma revisão — o que decide "publicação idêntica".
 *
 * O checksum do contrato cobre o envelope inteiro, inclusive event_id e
 * occurred_at, que mudam a cada clique: comparar checksums faria toda
 * republicação virar revisão nova. Aqui saem os campos que só identificam o
 * EVENTO (event_id, occurred_at) e a numeração (resource_revision,
 * base_revision); fica o que é dado: ids compartilhados, recurso, limite,
 * operação e payload.
 */
export function impressaoConteudo(envelope: object): string {
  const { event_id: _e, occurred_at: _o, resource_revision: _r, base_revision: _b, ...resto } = envelope as Record<string, unknown>;
  void _e; void _o; void _r; void _b;
  const estavel = structuredClone(resto) as Record<string, unknown> & { payload?: { asset?: Record<string, unknown> } };
  if (estavel.payload?.asset) {
    delete estavel.payload.asset.url;
    delete estavel.payload.asset.expires_at;
  }
  return createHash('sha256').update(canonico(estavel)).digest('hex');
}

// ── Envelope ─────────────────────────────────────────────────────────────────

export interface Envelope {
  contract_version: string;
  event_id: string;
  source_system: 'invicta' | 'precisionfarm';
  shared_producer_id: string;
  shared_farm_id: string;
  shared_field_id: string;
  resource_id: string;
  resource_type: TipoRecurso;
  resource_revision: number;
  base_revision: number;
  boundary_revision: number;
  occurred_at: string;
  operation: 'upsert' | 'archive';
  payload: Record<string, unknown>;
}

/** Evento = envelope sem payload + checksum (formato de inventory.items[].event). */
export type Evento = Omit<Envelope, 'payload'> & { checksum: string };

export interface IdsCompartilhados {
  shared_producer_id: string;
  shared_farm_id: string;
  shared_field_id: string;
}

/** ISO 8601 UTC com Z, sem milissegundos (mesma forma dos exemplos). */
export function dataContrato(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function montarEnvelope(a: {
  ids: IdsCompartilhados;
  resourceId: string;
  tipo: TipoRecurso;
  revisao: number;
  boundaryRevision: number;
  eventId: string;
  quando: Date;
  payload: Record<string, unknown>;
}): Envelope {
  return {
    contract_version: CONTRACT_VERSION,
    event_id: a.eventId,
    source_system: SOURCE_SYSTEM,
    shared_producer_id: a.ids.shared_producer_id,
    shared_farm_id: a.ids.shared_farm_id,
    shared_field_id: a.ids.shared_field_id,
    resource_id: a.resourceId,
    resource_type: a.tipo,
    resource_revision: a.revisao,
    base_revision: a.revisao - 1,
    // boundary_revision >= 1 no schema; talhão sem geoVersao = versão 1.
    boundary_revision: Math.max(1, Math.trunc(a.boundaryRevision || 1)),
    occurred_at: dataContrato(a.quando),
    operation: 'upsert',
    payload: a.payload,
  };
}

export function eventoDoEnvelope(envelope: Envelope, checksum: string): Evento {
  const { payload: _p, ...evento } = envelope;
  void _p;
  return { ...evento, checksum };
}

// ── Validação contra envelope.schema.json ────────────────────────────────────
//
// Cópia FIEL de docs/integracao-precisionfarm/ponte-0.2/envelope.schema.json
// (o teste confere que as duas são iguais) interpretada por um validador do
// subconjunto que o schema usa. Não há ajv 2020-12 no projeto, e o schema é
// pequeno o bastante para não justificar uma dependência.

export const SCHEMA_ENVELOPE = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'urn:precisionfarm:integration:0.2.0:envelope',
  title: 'Envelope 0.2.0',
  type: 'object',
  required: [
    'contract_version', 'event_id', 'source_system', 'shared_producer_id', 'shared_farm_id',
    'shared_field_id', 'resource_id', 'resource_type', 'resource_revision', 'base_revision',
    'boundary_revision', 'occurred_at', 'operation', 'payload',
  ],
  properties: {
    contract_version: { const: '0.2.0' },
    event_id: { type: 'string', format: 'uuid' },
    source_system: { enum: ['precisionfarm', 'invicta'] },
    shared_producer_id: { type: 'string', format: 'uuid' },
    shared_farm_id: { type: 'string', format: 'uuid' },
    shared_field_id: { type: 'string', format: 'uuid' },
    resource_id: { type: 'string', format: 'uuid' },
    resource_type: { enum: ['boundary', 'guidance', 'management_zones', 'harvest', 'application'] },
    resource_revision: { type: 'integer', minimum: 1 },
    base_revision: { type: 'integer', minimum: 0 },
    boundary_revision: { type: 'integer', minimum: 1 },
    occurred_at: { type: 'string', format: 'date-time' },
    operation: { enum: ['upsert', 'archive'] },
    payload: { type: 'object' },
  },
  additionalProperties: false,
} as const;

export const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_DATA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

type Esquema = {
  type?: string; required?: readonly string[]; properties?: Record<string, Esquema>;
  additionalProperties?: boolean; const?: unknown; enum?: readonly unknown[];
  format?: string; minimum?: number;
};

function tipoOk(v: unknown, tipo: string): boolean {
  switch (tipo) {
    case 'object': return !!v && typeof v === 'object' && !Array.isArray(v);
    case 'array': return Array.isArray(v);
    case 'string': return typeof v === 'string';
    case 'integer': return typeof v === 'number' && Number.isInteger(v);
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'boolean': return typeof v === 'boolean';
    default: return true;
  }
}

/** Valida `valor` contra o subconjunto de JSON Schema usado pelo contrato.
 *  Devolve a lista de erros (vazia = válido). */
export function validarContraSchema(schema: Esquema, valor: unknown, caminho = '$'): string[] {
  const erros: string[] = [];
  if (schema.type && !tipoOk(valor, schema.type)) return [`${caminho}: esperado ${schema.type}`];
  if ('const' in schema && valor !== schema.const) erros.push(`${caminho}: esperado ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(valor)) erros.push(`${caminho}: fora de ${JSON.stringify(schema.enum)}`);
  if (schema.format === 'uuid' && typeof valor === 'string' && !RE_UUID.test(valor)) erros.push(`${caminho}: uuid inválido`);
  if (schema.format === 'date-time' && typeof valor === 'string' && (!RE_DATA_HORA.test(valor) || Number.isNaN(Date.parse(valor)))) {
    erros.push(`${caminho}: date-time inválido`);
  }
  if (schema.minimum != null && typeof valor === 'number' && valor < schema.minimum) erros.push(`${caminho}: menor que ${schema.minimum}`);
  if (tipoOk(valor, 'object') && (schema.required || schema.properties)) {
    const o = valor as Record<string, unknown>;
    for (const k of schema.required ?? []) if (!(k in o)) erros.push(`${caminho}.${k}: obrigatório`);
    for (const [k, sub] of Object.entries(schema.properties ?? {})) {
      if (k in o) erros.push(...validarContraSchema(sub, o[k], `${caminho}.${k}`));
    }
    if (schema.additionalProperties === false) {
      for (const k of Object.keys(o)) if (!(k in (schema.properties ?? {}))) erros.push(`${caminho}.${k}: propriedade não prevista`);
    }
  }
  return erros;
}

export function validarEnvelope(envelope: unknown): string[] {
  return validarContraSchema(SCHEMA_ENVELOPE as unknown as Esquema, envelope);
}

// ── Safra e época de cultivo → contrato ──────────────────────────────────────

/**
 * Safra da Invicta ("26/27") → season do contrato ("2026/2027"). Aceita também
 * "2026/2027". Qualquer outra forma devolve null (a publicação recusa: mandar
 * uma safra adivinhada poria a colheita na safra errada do lado de lá).
 */
export function seasonDoContrato(safra: string): string | null {
  const s = String(safra ?? '').trim();
  let m = /^(\d{2})\/(\d{2})$/.exec(s);
  if (m) return `20${m[1]}/20${m[2]}`;
  m = /^(\d{4})\/(\d{4})$/.exec(s);
  if (m) return `${m[1]}/${m[2]}`;
  return null;
}

export type PeriodoContrato = 'main' | 'second' | 'winter';

/**
 * Época de cultivo da Invicta → season_period do contrato. ÚNICO lugar desta
 * conversão (decisão do usuário, ledger item 19):
 *   verao → main · safrinha → second · inverno → winter
 * 'winter' NÃO está no 0.2.0 (que só fala em main/second): é divergência
 * documentada, a pedir à PrecisionFarm, como o potential_rank 1..N.
 * Época vazia ('') → null: a publicação recusa e pede para definir a época.
 */
export function periodoDoContrato(epoca: string): PeriodoContrato | null {
  switch (String(epoca ?? '').trim()) {
    case 'verao': return 'main';
    case 'safrinha': return 'second';
    case 'inverno': return 'winter';
    default: return null;
  }
}

/** Cultura da Invicta → `crop` do payload. Os códigos em inglês seguem o
 *  vocabulário do contrato (summer, planting…); cultura fora da lista vai
 *  como está. */
const CROP: Record<string, string> = { soja: 'soybean', milho: 'corn', trigo: 'wheat', feijao: 'bean' };
export function cropDoContrato(cultura: string): string {
  const c = String(cultura ?? '').trim().toLowerCase();
  return CROP[c] ?? c;
}

/** Chave local estável de um recurso de colheita: talhão + safra + época (Q13). */
export function chaveLocalColheita(season: string, periodo: PeriodoContrato): string {
  return `harvest|${season}|${periodo}`;
}
export const CHAVE_LOCAL_ZONAS = 'management_zones';

// ── Payload de zonas (item 8) ────────────────────────────────────────────────

type FC = GeoJSON.FeatureCollection;

export type ResultadoPayload =
  | { ok: true; payload: Record<string, unknown>; nFeicoes: number; nVertices: number }
  | { ok: false; erro: string };

function contarVertices(g: GeoJSON.Polygon | GeoJSON.MultiPolygon): number {
  const aneis = g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
  return aneis.reduce((s, a) => s + a.length, 0);
}

function coordenadasOk(g: GeoJSON.Polygon | GeoJSON.MultiPolygon): boolean {
  const aneis = g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
  if (!aneis.length) return false;
  return aneis.every(a => Array.isArray(a) && a.length >= 4
    && a.every(p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])
      && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90));
}

/** Posição FIXA de uma classe na escala de potencial, ou null se não for
 *  reconhecida. Semáforo: Alta=1, Média-alta=2, Média=3, Média-baixa=4,
 *  Baixa=5 (mesma classeZona do mapa). "Nível N" / "Classe N": N. */
export function posicaoDaClasse(raw: unknown): { familia: 'semaforo' | 'nivel'; pos: number } | null {
  const t = raw == null ? '' : String(raw).trim();
  if (!t) return null;
  if (classeReconhecida(t)) {
    const i = ORDEM_CLASSES.indexOf(classeZona(t).label);
    return i >= 0 ? { familia: 'semaforo', pos: i + 1 } : null;
  }
  const m = /^(?:n[ií]vel|classe)\s*(\d+)$/i.exec(t);
  if (m && Number(m[1]) >= 1) return { familia: 'nivel', pos: Number(m[1]) };
  return null;
}

/**
 * Zoneamento padrão → payload management_zones.
 *
 * - zone_id = `rotuloZona()` — a MESMA regra do mapa, do SHP/KML e da Lavra
 *   (id numérico puro vence o campo `zona`, que o editor manual não atualiza).
 *   Vários polígonos podem dividir o mesmo zone_id.
 * - potential_rank = posição FIXA da classe na escala (Alta=1 … Baixa=5;
 *   "Nível N" = N). A classe é o único campo que acompanha as edições à mão
 *   (reclassificar/unificar) e a reordenação da tela; `zona` e `potencialRank`
 *   podem ficar velhos. Classe não reconhecida: usa o `potencialRank` (ordem
 *   densa 1..K) SÓ se ele for único dentro de cada zone_id.
 * - Um zone_id com classes diferentes, ou nada confiável → recusa (422), com
 *   mensagem para corrigir o zoneamento. Nunca publica rank adivinhado.
 * - n_zones = nº de zone_id distintos. Acima de 5 manda o rank real (Q8).
 * - feature.id = id do polígono (único; repetido ganha sufixo _2, _3…).
 */
export function montarPayloadZonas(z: { nome: string; fc: FC }): ResultadoPayload {
  const feats = Array.isArray(z.fc?.features) ? z.fc.features : [];
  if (!feats.length) return { ok: false, erro: 'O zoneamento padrão não tem nenhuma zona.' };

  type P = { id?: string | number | null; zona?: string | number | null; classe?: unknown; potencialRank?: unknown };
  const props = feats.map(f => (f.properties ?? {}) as P);
  const zonas = props.map(p => rotuloZona(p));
  const iSem = zonas.indexOf('?');
  if (iSem >= 0) {
    return { ok: false, erro: `O polígono ${iSem + 1} do zoneamento padrão não tem número de zona. Abra o zoneamento, renumere e salve de novo antes de publicar.` };
  }

  // 1) Pela classe (todas reconhecidas, numa família só).
  const posicoes = props.map(p => posicaoDaClasse(p.classe));
  const familias = new Set(posicoes.map(x => x?.familia ?? null));
  let rankDe: Map<string, number> | null = null;
  if (!familias.has(null) && familias.size === 1) {
    const porZona = new Map<string, Set<number>>();
    zonas.forEach((zid, i) => {
      const s = porZona.get(zid) ?? new Set<number>();
      s.add(posicoes[i]!.pos);
      porZona.set(zid, s);
    });
    const misturada = [...porZona].find(([, s]) => s.size > 1);
    if (misturada) {
      const classes = [...new Set(props.filter((_, i) => zonas[i] === misturada[0]).map(p => String(p.classe).trim()))];
      return { ok: false, erro: `A zona ${misturada[0]} tem polígonos de classes diferentes (${classes.join(', ')}). Renumere ou reclassifique no editor de zonas e salve antes de publicar.` };
    }
    rankDe = new Map([...porZona].map(([zid, s]) => [zid, [...s][0]]));
  } else {
    // 2) Classe não reconhecida: potencialRank, se for único por zone_id.
    const porZona = new Map<string, Set<number>>();
    let todos = true;
    zonas.forEach((zid, i) => {
      const r = props[i].potencialRank;
      if (typeof r !== 'number' || !Number.isFinite(r)) { todos = false; return; }
      const s = porZona.get(zid) ?? new Set<number>();
      s.add(r);
      porZona.set(zid, s);
    });
    if (!todos || [...porZona.values()].some(s => s.size > 1)) {
      return { ok: false, erro: 'Não dá para saber o potencial de cada zona deste zoneamento: as classes não são da escala Alta…Baixa (ou "Nível N") e o potencial gravado não é único por zona. Revise as classes no editor de zonas e salve antes de publicar.' };
    }
    const distintos = [...new Set([...porZona.values()].map(s => [...s][0]))].sort((a, b) => a - b);
    const denso = new Map(distintos.map((r, i) => [r, i + 1]));
    rankDe = new Map([...porZona].map(([zid, s]) => [zid, denso.get([...s][0])!]));
  }

  const usados = new Set<string>();
  const features: GeoJSON.Feature[] = [];
  let nVertices = 0;
  for (let i = 0; i < feats.length; i++) {
    const g = feats[i].geometry;
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon') || !coordenadasOk(g)) {
      return { ok: false, erro: `O polígono ${i + 1} do zoneamento padrão não tem geometria de área válida. Corrija o zoneamento antes de publicar.` };
    }
    nVertices += contarVertices(g);
    const p = props[i];
    const zid = zonas[i];
    let id = p.id != null && String(p.id).trim() !== '' ? String(p.id).trim() : `${zid}-${i + 1}`;
    if (usados.has(id)) {
      let n = 2;
      while (usados.has(`${id}_${n}`)) n++;
      id = `${id}_${n}`;
    }
    usados.add(id);
    const properties: Record<string, unknown> = { zone_id: zid, potential_rank: rankDe.get(zid)! };
    if (p.classe != null && String(p.classe).trim() !== '') properties.class_name = String(p.classe).trim();
    features.push({ type: 'Feature', id, properties, geometry: g });
  }
  if (features.length > MAX_FEICOES) return { ok: false, erro: `O zoneamento tem ${features.length} polígonos; o contrato aceita até ${MAX_FEICOES}.` };
  if (nVertices > MAX_VERTICES) return { ok: false, erro: `O zoneamento tem ${nVertices} vértices; o contrato aceita até ${MAX_VERTICES}.` };

  return {
    ok: true,
    nFeicoes: features.length,
    nVertices,
    payload: {
      name: z.nome,
      status: 'consolidated',
      season: null,
      semantic: 'productivity_class',
      value_unit: 'class',
      n_zones: new Set(zonas).size,
      geometry: { type: 'FeatureCollection', features },
    },
  };
}

// ── Payload de colheita (item 9) ─────────────────────────────────────────────

export interface GradeColheita {
  /** Float32, linha a linha, NORTE no topo; NaN = sem dado (fora do talhão). */
  valores: ArrayLike<number>;
  rows: number;
  cols: number;
  /** [oeste, sul, leste, norte] — as BORDAS do raster (mesmo uso do overlay). */
  bounds: [number, number, number, number];
}

/**
 * Grade oficial de produtividade (kg/ha) → payload harvest em células Polygon.
 * Cada pixel com valor vira um quadrado [oeste, sul]…; pixel sem valor (NaN,
 * infinito ou negativo) é OMITIDO — o contrato pede value >= 0 e nodata fora.
 * Valor em kg/ha com uma casa decimal (o Float32 cru carrega ruído de 7ª casa
 * que só engorda o arquivo). Coordenadas sem arredondamento.
 */
export function montarPayloadColheita(a: {
  nome: string; season: string; periodo: PeriodoContrato; cultura: string; grade: GradeColheita;
}): ResultadoPayload {
  const { valores, rows, cols, bounds } = a.grade;
  if (!(rows > 0 && cols > 0) || valores.length !== rows * cols) {
    return { ok: false, erro: 'A grade do mapa oficial está corrompida (tamanho não confere). Reprocesse o mapa antes de publicar.' };
  }
  const [w, s, e, n] = bounds;
  if (![w, s, e, n].every(Number.isFinite) || e <= w || n <= s) {
    return { ok: false, erro: 'Os limites (bounds) do mapa oficial são inválidos. Reprocesse o mapa antes de publicar.' };
  }
  const dx = (e - w) / cols;
  const dy = (n - s) / rows;
  const features: GeoJSON.Feature[] = [];
  for (let r = 0; r < rows; r++) {
    const yTopo = n - r * dy;
    const yBase = n - (r + 1) * dy;
    for (let c = 0; c < cols; c++) {
      const v = valores[r * cols + c];
      if (!Number.isFinite(v) || v < 0) continue;
      const x0 = w + c * dx;
      const x1 = w + (c + 1) * dx;
      features.push({
        type: 'Feature',
        id: `cell-${r * cols + c}`,
        properties: { value: Math.round(v * 10) / 10 },
        geometry: { type: 'Polygon', coordinates: [[[x0, yBase], [x1, yBase], [x1, yTopo], [x0, yTopo], [x0, yBase]]] },
      });
      if (features.length > MAX_FEICOES) {
        return { ok: false, erro: `O mapa oficial tem mais de ${MAX_FEICOES.toLocaleString('pt-BR')} células com dado; o contrato aceita até ${MAX_FEICOES.toLocaleString('pt-BR')}. Reprocesse com pixel maior.` };
      }
    }
  }
  if (!features.length) return { ok: false, erro: 'O mapa oficial não tem nenhuma célula com valor.' };
  return {
    ok: true,
    nFeicoes: features.length,
    nVertices: features.length * 5,
    payload: {
      name: a.nome,
      status: 'available',
      season: a.season,
      season_period: a.periodo,
      quantity: 'grain_yield',
      value_unit: 'kg/ha',
      crop: cropDoContrato(a.cultura),
      geometry: { type: 'FeatureCollection', features },
    },
  };
}

/** Tamanho em bytes do envelope como ele sai na resposta. */
export function bytesDoEnvelope(envelope: Envelope): number {
  return new TextEncoder().encode(JSON.stringify(envelope)).length;
}

export function mensagemTamanho(bytes: number, nFeicoes: number): string {
  const mb = (bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const lim = (MAX_ENVELOPE_BYTES_INVICTA / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return `A camada ficaria com ${mb} MB (${nFeicoes.toLocaleString('pt-BR')} feições) e o limite de publicação da Invicta é ${lim} MB. `
    + 'Reprocesse o mapa com pixel maior (ex.: 10 m) e marque-o como oficial, ou aguarde a publicação em GeoTIFF (fase 4).';
}

// ── Paginação por cursor (item 4) ────────────────────────────────────────────

export type Paginacao =
  | { ok: true; offset: number; limit: number }
  | { ok: false; erro: string };

/**
 * Lê cursor/limit da query. O cursor é OPACO para quem consome; aqui ele é o
 * deslocamento em texto ("0", "100"…), o mesmo desenho do exemplo da
 * PrecisionFarm. Cursor ou limit inválido = 422 (contrato inválido).
 */
export function lerPaginacao(cursor: string | null, limit: string | null): Paginacao {
  const c = cursor == null || cursor === '' ? '0' : cursor;
  if (!/^\d{1,9}$/.test(c)) return { ok: false, erro: 'cursor inválido' };
  let l = LIMITE_PAGINA_PADRAO;
  if (limit != null && limit !== '') {
    if (!/^\d{1,4}$/.test(limit)) return { ok: false, erro: 'limit inválido' };
    l = Number(limit);
    if (l < 1 || l > LIMITE_PAGINA_MAX) return { ok: false, erro: `limit deve estar entre 1 e ${LIMITE_PAGINA_MAX}` };
  }
  return { ok: true, offset: Number(c), limit: l };
}

export interface Pagina<T> { items: T[]; next_cursor: string; has_more: boolean }

/** Recorta uma lista já ORDENADA de forma estável. next_cursor sempre string;
 *  sem mais itens ele aponta para o fim (persistir e repetir não traz nada). */
export function paginar<T>(lista: readonly T[], offset: number, limit: number): Pagina<T> {
  const items = lista.slice(offset, offset + limit);
  const fim = Math.min(lista.length, offset + items.length);
  return { items, next_cursor: String(fim), has_more: fim < lista.length };
}

// ── Escopo (item 2) ──────────────────────────────────────────────────────────

export type StatusVinculo = 'pendente' | 'confirmado' | 'suspenso';

/** Parceria em que a tela cria os vínculos. Cada chave da PF pertence a UMA
 *  parceria (integracao_chaves.parceria) — uma chave de homologação, com outra
 *  parceria, não enxerga os vínculos de produção. */
export const PARCERIA_PADRAO = 'producao';

export interface VinculoEscopo {
  shared_field_id: string;
  status: StatusVinculo;
  empresa_id: string | null;
  parceria: string;
}

export interface EscopoChave { parceria: string; empresaId: string | null }

/**
 * Vínculos que a chave alcança: SÓ os confirmados DA PARCERIA DA CHAVE, e —
 * quando a chave é de uma empresa — só os daquela empresa. Pendente/suspenso
 * ficam fora: para a PrecisionFarm, um talhão fora do escopo e um que não
 * existe são o mesmo 404.
 */
export function vinculosNoEscopo<T extends VinculoEscopo>(vinculos: readonly T[], chave: EscopoChave): T[] {
  return vinculos.filter(v => v.status === 'confirmado'
    && v.parceria === chave.parceria
    && (!chave.empresaId || !v.empresa_id || v.empresa_id === chave.empresaId));
}

// ── Inventário (item 5) ──────────────────────────────────────────────────────

export interface RevisaoResumo {
  resource_id: string;
  resource_type: TipoRecurso;
  resource_revision: number;
  boundary_revision: number;
  name: string;
  checksum: string;
  evento: Omit<Evento, 'checksum'>;
  season?: string | null;
  season_period?: string | null;
}

export function itemInventario(r: RevisaoResumo): Record<string, unknown> {
  return {
    resource_id: r.resource_id,
    resource_type: r.resource_type,
    resource_revision: r.resource_revision,
    boundary_revision: r.boundary_revision,
    status: 'published',
    name: r.name,
    ...(r.resource_type === 'harvest' ? { season: r.season ?? null, season_period: r.season_period ?? null } : {}),
    checksum: r.checksum,
    event: { ...r.evento, checksum: r.checksum },
  };
}

/** Só a MAIOR revisão de cada recurso, ordenado por resource_id (estável para
 *  a paginação). */
export function vigentes<T extends { resource_id: string; resource_revision: number }>(revs: readonly T[]): T[] {
  const m = new Map<string, T>();
  for (const r of revs) {
    const atual = m.get(r.resource_id);
    if (!atual || r.resource_revision > atual.resource_revision) m.set(r.resource_id, r);
  }
  return [...m.values()].sort((a, b) => a.resource_id.localeCompare(b.resource_id));
}

// ── Capabilities (item 3) ────────────────────────────────────────────────────

export function capabilities(ambiente: string): Record<string, unknown> {
  return {
    contract_version: CONTRACT_VERSION,
    source_system: SOURCE_SYSTEM,
    environment: ambiente,
    resource_types: [...TIPOS_PUBLICADOS],
    formats: [...FORMATOS],
    limits: {
      max_geojson_bytes: MAX_GEOJSON_BYTES,
      max_features: MAX_FEICOES,
      max_vertices: MAX_VERTICES,
      max_page_size: LIMITE_PAGINA_MAX,
      default_page_size: LIMITE_PAGINA_PADRAO,
    },
    endpoints: ['/capabilities', '/catalog', '/fields/{shared_field_id}/inventory', '/resources/{id}/revisions/{n}'],
    // Fase 1 = só leitura. /changes, /notifications e /receipts respondem 501
    // (not_implemented); a carga é por inventário + revisão.
    features: { changes: false, notifications: false, receipts: false, hmac: false, assets: false },
    not_implemented: ['/changes', '/notifications', '/receipts'],
  };
}

/** Corpo do 501 das rotas do contrato que a fase 1 ainda não tem. */
export function corpoNaoImplementado(rota: string): Record<string, unknown> {
  return {
    error: {
      code: 'not_implemented',
      message: `${rota} ainda não existe na Invicta (fase 1: só leitura por /catalog, /fields/{id}/inventory e /resources/{id}/revisions/{n}).`,
    },
  };
}

// ── Vínculo: reaproveitamento dos UUIDs (item 12 / Q5, Q6) ───────────────────

export interface VinculoExistente {
  cliente_id: string | null;
  fazenda_id: string | null;
  shared_producer_id: string;
  shared_farm_id: string;
}

/**
 * UUID DETERMINÍSTICO (formato v5, SHA-256 truncado) de um nome. Mesmo nome →
 * mesmo UUID, sempre: dois talhões da mesma fazenda vinculados AO MESMO TEMPO
 * (nenhum vê o outro no banco) ainda saem com o mesmo shared_farm_id.
 */
export function uuidDeterministico(nome: string): string {
  const h = createHash('sha256').update(`invicta:precisionfarm:${nome}`, 'utf8').digest();
  h[6] = (h[6] & 0x0f) | 0x50;   // versão 5
  h[8] = (h[8] & 0x3f) | 0x80;   // variante RFC 4122
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/**
 * UUIDs de um vínculo novo (Q5, Q6):
 *   produtor — do vínculo MAIS ANTIGO do mesmo cliente na parceria; senão
 *              derivado (parceria + clienteId); sem cliente, aleatório.
 *   fazenda  — do vínculo MAIS ANTIGO da mesma fazenda; senão derivado
 *              (parceria + fazendaId); sem fazenda, aleatório.
 *   talhão   — sempre aleatório (novo).
 * `existentes` deve vir em ordem estável (criado_em, id): o mais antigo vence.
 */
export function idsParaNovoVinculo(
  a: { parceria: string; clienteId: string | null; fazendaId: string | null },
  existentes: readonly VinculoExistente[],
  novoUuid: () => string,
): IdsCompartilhados {
  const daFazenda = a.fazendaId ? existentes.find(v => v.fazenda_id === a.fazendaId) : undefined;
  const doCliente = a.clienteId ? existentes.find(v => v.cliente_id === a.clienteId) : undefined;
  return {
    shared_producer_id: doCliente?.shared_producer_id
      ?? (a.clienteId ? uuidDeterministico(`${a.parceria}|cliente|${a.clienteId}`) : daFazenda?.shared_producer_id ?? novoUuid()),
    shared_farm_id: daFazenda?.shared_farm_id
      ?? (a.fazendaId ? uuidDeterministico(`${a.parceria}|fazenda|${a.fazendaId}`) : novoUuid()),
    shared_field_id: novoUuid(),
  };
}
