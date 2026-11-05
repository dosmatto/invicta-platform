// Integração PrecisionFarm — MANIFESTO de vínculos propostos pela PF: leitura,
// casamento por GEOMETRIA contra os nossos talhões, plano de IDs por fazenda e
// a conferência que o servidor refaz antes de criar os vínculos. Núcleo PURO
// (turf + matemática; sem rede, sem store, sem node:*): roda no navegador
// (prévia), no servidor (criação) e no teste em Node (imports com `.ts`).
//
// Dois formatos de pacote (ledger pf-lote Q4/Q5 e pf-manifesto-v2 Q1–Q5):
//   • v1 (FIGUEIRA_VINCULOS_PROPOSTOS.json, 28/10): `fields[]` com
//     local_field_id, name, shared_producer_id, shared_farm_id,
//     shared_field_id e boundary_file (ou a geometria no próprio item);
//   • v2 (VINCULOS.json + LIMITES.geojson, 04/11): `clients[]`,
//     `farm_groups[]` e `fields[]` SEM boundary_file — o limite de cada talhão
//     é a feição do LIMITES.geojson com `properties.shared_field_id` igual.
// Para cada talhão da PF: o NOSSO de maior sobreposição (entre TODOS os
// talhões visíveis, pré-filtrados pela caixa) e a diferença simétrica em % (a
// mesma conta da comparação de limite, compararLimite). Par 1:1 ≤ 5 % vem
// marcado; > 5 % pode ser marcado (no v2 também vem marcado — Q3); talhão da
// PF que cobre dois ou mais dos nossos é AMBÍGUO e não pode ser criado. Os
// vínculos nascem PENDENTES com o UUID do talhão da PF e o ID PF.
//
// FAZENDAS (v2, Q2): a PF agrupa por produtor (um shared_farm_id por
// produtor), a Invicta tem várias fazendas por cliente. O shared_farm_id da PF
// fica com a fazenda nossa que recebe MAIS talhões casados daquele grupo; as
// demais recebem um UUID novo (ou o que já têm) — um shared_farm_id nunca
// serve a duas fazendas nossas. A mesma regra vale para o formato v1 (cada
// shared_farm_id do manifesto é um "grupo").
//
// SUBSTITUIÇÃO (Q5): o talhão que já tem vínculo PENDENTE, SEM ID PF e sem
// nada publicado (gerado na tela com UUIDs aleatórios, como o "115") pode ter
// os IDs trocados pelos do manifesto. Confirmado, suspenso ou pendente com ID
// PF nunca.
// Duplicata e conflito são recusados com o motivo — aqui na prévia e de novo
// no servidor (conferirCriacao), que é quem vale.

import turfIntersect from '@turf/intersect';
import { feature, featureCollection } from '@turf/helpers';
import { areaM2Geo } from '../areaGeo.ts';
import { compararLimites, geometriaDoTalhao } from './compararLimite.ts';
import { lerGeometriaLimite, type GeometriaLimite } from './limiteGeometria.ts';

/** Mesmo RE_UUID de contrato.ts (que tem node:crypto e não entra no navegador). */
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Par 1:1 com diferença simétrica até isto (% da área do nosso) é pré-marcado. */
export const LIMIAR_PAR_PCT = 5;
/** Sobreposição RELEVANTE (para "ambíguo"): o talhão da PF cobre ao menos esta
 *  fração do NOSSO talhão E a interseção é ao menos esta fração do talhão da
 *  PF. A borda vizinha que entra numa diferença de 0,03–3 % não chega perto; um
 *  talhão da PF que junta dois dos nossos (IGEFI11 da PF = nossos 10 + 11)
 *  cobre quase todo cada um. A 2ª condição evita que uma ilha pequena nossa
 *  dentro do talhão da PF o torne ambíguo. */
export const COBERTURA_RELEVANTE = 0.25;
export const FRACAO_PF_RELEVANTE = 0.05;
/** Teto de itens por manifesto / por pedido de criação. */
export const MAX_CAMPOS_MANIFESTO = 500;
/** Teto de feições no LIMITES.geojson (uma por talhão; folga para lixo). */
export const MAX_FEICOES_LIMITES = 5_000;

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');

/** UUID v4 aleatório — crypto.randomUUID só existe em contexto seguro; o
 *  getRandomValues existe sempre (navegador e Node). */
export function uuidAleatorio(): string {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b].map(n => n.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

// ── Leitura do manifesto ─────────────────────────────────────────────────────

export type FormatoManifesto = 'v1' | 'v2';

export interface CampoManifesto {
  /** local_field_id da PF (número lá) → texto, como o pf_local_id do vínculo. */
  pfLocalId: string;
  nome: string;
  sharedProducerId: string;
  sharedFarmId: string;
  sharedFieldId: string;
  /** boundary_file (caminho dentro do zip) — null se a geometria veio no item. */
  arquivoLimite: string | null;
  /** boundary_sha256 do arquivo, quando a PF manda (conferido na tela). */
  sha256: string | null;
  /** Geometria no próprio item (geometry/boundary/geojson), se houver. */
  geometriaNoItem: unknown;
  /** v2: o limite é a feição do LIMITES.geojson com este shared_field_id. */
  limiteNoGeojson: boolean;
  /** identity_status da PF (informativo). */
  statusPF: string | null;
  /** v2: produtor da PF (local_producer_id) e o nome dele em clients[]. */
  localProducerId: string | null;
  nomeClientePF: string | null;
  /** Defeito do item (UUID inválido, sem ID, repetido…) — não pode ser criado. */
  problema: string | null;
}

/** v2: clients[] da PF (o nome é o da PF — nunca serve para casar). */
export interface ClientePF { localProducerId: string; nome: string; sharedProducerId: string; statusPF: string | null }
/** v2: farm_groups[] — agrupamento PROVISÓRIO da PF (um por produtor). */
export interface GrupoFazendaPF { localProducerId: string; sharedProducerId: string; sharedFarmId: string; statusPF: string | null }

export type LeituraManifesto =
  | { ok: true; formato: FormatoManifesto; campos: CampoManifesto[]; clientes: ClientePF[]; grupos: GrupoFazendaPF[] }
  | { ok: false; erro: string };

/** Lê o manifesto (objeto ou texto JSON), v1 ou v2. Defeito de UM item marca só ele. */
export function lerManifestoPF(json: unknown): LeituraManifesto {
  let m = json;
  if (typeof m === 'string') {
    try { m = JSON.parse(m); } catch { return { ok: false, erro: 'O manifesto não é um JSON válido.' }; }
  }
  if (!ehObjeto(m) || !Array.isArray(m.fields)) return { ok: false, erro: 'O manifesto não tem a lista "fields" (formato do VINCULOS.json / FIGUEIRA_VINCULOS_PROPOSTOS.json).' };
  if (!m.fields.length) return { ok: false, erro: 'O manifesto não traz nenhum talhão em "fields".' };
  if (m.fields.length > MAX_CAMPOS_MANIFESTO) return { ok: false, erro: `O manifesto traz ${m.fields.length} talhões; o limite por importação é ${MAX_CAMPOS_MANIFESTO}.` };
  const formato: FormatoManifesto = Array.isArray(m.clients) || Array.isArray(m.farm_groups) ? 'v2' : 'v1';
  const uuid = (v: unknown) => texto(v).toLowerCase();

  const clientes: ClientePF[] = (Array.isArray(m.clients) ? m.clients : []).filter(ehObjeto).map(c => ({
    localProducerId: texto(c.local_producer_id), nome: texto(c.name).slice(0, 200),
    sharedProducerId: uuid(c.shared_producer_id), statusPF: texto(c.identity_status) || null,
  }));
  const grupos: GrupoFazendaPF[] = (Array.isArray(m.farm_groups) ? m.farm_groups : []).filter(ehObjeto).map(g => ({
    localProducerId: texto(g.local_producer_id), sharedProducerId: uuid(g.shared_producer_id),
    sharedFarmId: uuid(g.shared_farm_id), statusPF: texto(g.identity_status) || null,
  }));
  const nomeCliente = new Map(clientes.map(c => [c.localProducerId, c.nome]));

  const campos = m.fields.map((f, k): CampoManifesto => {
    const o = ehObjeto(f) ? f : {};
    const prod = texto(o.local_producer_id) || null;
    const c: CampoManifesto = {
      pfLocalId: texto(o.local_field_id).slice(0, 200),
      nome: texto(o.name) || `item ${k + 1}`,
      sharedProducerId: uuid(o.shared_producer_id),
      sharedFarmId: uuid(o.shared_farm_id),
      sharedFieldId: uuid(o.shared_field_id),
      arquivoLimite: texto(o.boundary_file) || null,
      sha256: texto(o.boundary_sha256).toLowerCase() || null,
      geometriaNoItem: o.geometry ?? o.boundary ?? o.geojson ?? null,
      limiteNoGeojson: false,
      statusPF: texto(o.identity_status) || null,
      localProducerId: prod,
      nomeClientePF: prod ? nomeCliente.get(prod) ?? null : null,
      problema: null,
    };
    const falta: string[] = [];
    if (!ehObjeto(f)) c.problema = 'Item do manifesto não é um objeto.';
    else if (!c.pfLocalId) c.problema = 'Sem local_field_id (o ID do talhão na PrecisionFarm).';
    else {
      if (!RE_UUID.test(c.sharedProducerId)) falta.push('shared_producer_id');
      if (!RE_UUID.test(c.sharedFarmId)) falta.push('shared_farm_id');
      if (!RE_UUID.test(c.sharedFieldId)) falta.push('shared_field_id');
      if (falta.length) c.problema = `UUID ausente ou inválido: ${falta.join(', ')}.`;
      else if (!c.arquivoLimite && c.geometriaNoItem == null) {
        // v2: o limite vem do LIMITES.geojson (ligado por shared_field_id).
        if (formato === 'v2') c.limiteNoGeojson = true;
        else c.problema = 'Sem limite (boundary_file ou geometria no item).';
      }
    }
    return c;
  });
  // Repetidos DENTRO do manifesto: nenhum dos dois entra (não há como saber qual vale).
  const marcarRepetidos = (chave: (c: CampoManifesto) => string, rotulo: string) => {
    const conta = new Map<string, number>();
    for (const c of campos) if (chave(c)) conta.set(chave(c), (conta.get(chave(c)) ?? 0) + 1);
    for (const c of campos) if (!c.problema && (conta.get(chave(c)) ?? 0) > 1) c.problema = `${rotulo} repetido no manifesto.`;
  };
  marcarRepetidos(c => c.sharedFieldId, 'shared_field_id');
  marcarRepetidos(c => c.pfLocalId, 'local_field_id');
  return { ok: true, formato, campos, clientes, grupos };
}

/** Caminho do zip ↔ boundary_file: exato, senão pelo nome do arquivo (o
 *  usuário pode ter mandado os .geojson soltos, sem a pasta). */
export function acharArquivo<T>(arquivos: ReadonlyMap<string, T>, caminho: string): T | null {
  const norm = (s: string) => s.replace(/\\/g, '/').replace(/^\.?\//, '');
  const alvo = norm(caminho);
  for (const [k, v] of arquivos) if (norm(k) === alvo) return v;
  const base = alvo.split('/').pop()!.toLowerCase();
  const porNome = [...arquivos].filter(([k]) => norm(k).split('/').pop()!.toLowerCase() === base);
  return porNome.length === 1 ? porNome[0][1] : null;
}

/** Feições do LIMITES.geojson por shared_field_id (minúsculo). */
export type FeicoesPorCampo = Map<string, unknown[]>;

/**
 * v2: indexa um LIMITES.geojson (FeatureCollection) pelas
 * `properties.shared_field_id`. A geometria NÃO é validada aqui (é a leitura
 * estrita de cada talhão, em limiteDoCampo). `ok: false` = o arquivo não é uma
 * coleção de limites da PF (sem nenhuma feição com shared_field_id).
 */
export function lerLimitesGeojson(json: unknown, destino: FeicoesPorCampo = new Map()):
  { ok: true; feicoes: FeicoesPorCampo; nFeicoes: number; nSemId: number } | { ok: false; erro: string } {
  let g = json;
  if (typeof g === 'string') {
    try { g = JSON.parse(g); } catch { return { ok: false, erro: 'O arquivo de limites não é um JSON válido.' }; }
  }
  if (!ehObjeto(g) || g.type !== 'FeatureCollection' || !Array.isArray(g.features)) return { ok: false, erro: 'O arquivo de limites não é uma FeatureCollection.' };
  if (g.features.length > MAX_FEICOES_LIMITES) return { ok: false, erro: `O arquivo de limites traz ${g.features.length} feições (até ${MAX_FEICOES_LIMITES}).` };
  let nSemId = 0, nComId = 0;
  for (const f of g.features) {
    const id = ehObjeto(f) && ehObjeto(f.properties) ? texto(f.properties.shared_field_id).toLowerCase() : '';
    if (!id) { nSemId++; continue; }
    nComId++;
    const l = destino.get(id) ?? [];
    l.push(f);
    destino.set(id, l);
  }
  if (!nComId) return { ok: false, erro: 'Nenhuma feição do arquivo de limites tem properties.shared_field_id.' };
  return { ok: true, feicoes: destino, nFeicoes: g.features.length, nSemId };
}

/** Limite do item: lido e VALIDADO (a mesma leitura estrita do limite da PF —
 *  nada é consertado). `conteudo` = texto do arquivo, ou null se não veio;
 *  `feicoes` = o LIMITES.geojson indexado (v2). */
export function limiteDoCampo(c: CampoManifesto, conteudo: string | null, sha256DoConteudo: string | null, feicoes?: ReadonlyMap<string, readonly unknown[]> | null):
  { ok: true; geometria: GeometriaLimite } | { ok: false; erro: string } {
  let fonte: unknown = c.geometriaNoItem;
  if (c.limiteNoGeojson) {
    const lista = feicoes?.get(c.sharedFieldId) ?? [];
    if (!lista.length) return { ok: false, erro: `Sem limite no LIMITES.geojson (nenhuma feição com shared_field_id ${c.sharedFieldId}).` };
    if (lista.length > 1) return { ok: false, erro: `${lista.length} feições do LIMITES.geojson com o mesmo shared_field_id — não há como saber qual vale.` };
    const props = (lista[0] as { properties?: Record<string, unknown> }).properties ?? {};
    const idNaFeicao = texto(props.local_field_id);
    if (idNaFeicao && idNaFeicao !== c.pfLocalId) {
      return { ok: false, erro: `A feição do LIMITES.geojson traz local_field_id ${idNaFeicao}; o VINCULOS.json diz ${c.pfLocalId}.` };
    }
    fonte = lista[0];
  } else if (fonte == null) {
    if (conteudo == null) return { ok: false, erro: `Arquivo do limite não encontrado: ${c.arquivoLimite}.` };
    if (c.sha256 && sha256DoConteudo && c.sha256 !== sha256DoConteudo) {
      return { ok: false, erro: `O arquivo ${c.arquivoLimite} não é o do manifesto (SHA-256 diferente).` };
    }
    fonte = conteudo;
  }
  const g = lerGeometriaLimite(fonte);
  return g.ok ? { ok: true, geometria: g.geometria } : { ok: false, erro: g.erro };
}

// ── Casamento por geometria ──────────────────────────────────────────────────

export interface TalhaoParaCasar {
  id: string;
  nome: string;
  fazendaId: string | null;
  clienteId: string | null;
  bbox?: [number, number, number, number] | null;
  /** Talhao.geojson (texto). */
  geojson: string | null | undefined;
}

export interface VinculoExistente {
  talhaoId: string;
  sharedProducerId: string;
  sharedFarmId: string;
  sharedFieldId: string;
  status: string;
  fazendaId: string | null;
  clienteId: string | null;
  /** ID PF (pf_local_id). Ausente = desconhecido → trata como preenchido (não substitui). */
  pfLocalId?: string | null;
  /** Já publicou alguma revisão (zonas/colheita). Ausente = desconhecido → não substitui. */
  temPublicacao?: boolean;
}

/** Q5: vínculo que o manifesto pode SUBSTITUIR — pendente, sem ID PF e sem
 *  nada publicado (as revisões são imutáveis e levam os UUIDs no envelope). */
export const podeSubstituir = (v: VinculoExistente) =>
  v.status === 'pendente' && v.pfLocalId === null && v.temPublicacao === false;

function porQueNaoSubstitui(v: VinculoExistente): string {
  if (v.status !== 'pendente') return `está ${v.status}`;
  if (v.pfLocalId !== null) return v.pfLocalId === undefined ? 'não se sabe se tem ID PF' : `já tem o ID PF ${v.pfLocalId}`;
  return v.temPublicacao === undefined ? 'não se sabe se já publicou' : 'já tem publicação';
}

export interface Candidato {
  talhaoId: string;
  nome: string;
  fazendaId: string | null;
  clienteId: string | null;
  intersecaoM2: number;
  /** % do NOSSO talhão dentro do da PF. */
  coberturaPct: number;
  /** Só no melhor (comparação completa); null nos demais. */
  difSimM2: number | null;
  /** Diferença simétrica em % da área do nosso (compararLimites). */
  difSimPct: number | null;
}

export type SituacaoCasamento = 'par' | 'diferente' | 'ambiguo' | 'sem-par' | 'ja-vinculado' | 'conflito' | 'invalido';

/** De onde vem o shared_farm_id do par (Q2): o da PF (fazenda principal do
 *  grupo), um UUID novo (fazenda dividida) ou o que a fazenda já tem. */
export type PapelFazenda = 'principal' | 'nova' | 'reuso';

export interface IdsDoPar { sharedProducerId: string; sharedFarmId: string; papelFazenda: PapelFazenda }

export interface Casamento {
  campo: CampoManifesto;
  areaPfHa: number | null;
  /** Nosso talhão de maior sobreposição. */
  melhor: Candidato | null;
  /** Demais com sobreposição relevante (ambíguo quando houver). */
  outrosRelevantes: Candidato[];
  situacao: SituacaoCasamento;
  motivo: string | null;
  preMarcado: boolean;
  podeCriar: boolean;
  /** Q5: o vínculo pendente (sem ID PF) que este par substitui. */
  substitui: VinculoExistente | null;
  /** IDs com que o vínculo seria criado (só quando podeCriar). */
  ids: IdsDoPar | null;
}

export interface OpcoesCasamento {
  /** Q3 (v2): o par com diferença > 5 % também vem marcado. */
  preMarcarDiferentes?: boolean;
  /** UUID da fazenda dividida (padrão: aleatório). */
  novoUuid?: () => string;
}

type Caixa = [number, number, number, number];

function caixaDe(g: GeometriaLimite): Caixa {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) for (const [x, y] of p[0]) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}
const cruzam = (a: Caixa, b: Caixa) => !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);

/** TETO (m²) da interseção de dois polígonos: a área da sobreposição das
 *  caixas (retângulo lon/lat na esfera, com folga de 10 %). A interseção real
 *  nunca passa disso — serve para pular recortes que não mudam o resultado. */
function tetoIntersecaoM2(a: Caixa, b: Caixa): number {
  const x0 = Math.max(a[0], b[0]), x1 = Math.min(a[2], b[2]);
  const y0 = Math.max(a[1], b[1]), y1 = Math.min(a[3], b[3]);
  if (x1 < x0 || y1 < y0) return 0;
  const R = 6_378_137, rad = Math.PI / 180;
  return 1.1 * R * R * (x1 - x0) * rad * Math.abs(Math.sin(y1 * rad) - Math.sin(y0 * rad));
}

const fmtPct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: v < 1 ? 2 : 1 })}%`;

/**
 * Conflito de IDs de produtor/fazenda com os vínculos que JÁ existem (e com os
 * que vêm antes no mesmo pedido): a mesma regra de reuso do "Gerar
 * identificadores" (idsParaNovoVinculo) — uma fazenda nossa tem UM
 * shared_farm_id, um cliente nosso tem UM shared_producer_id — e, no sentido
 * contrário (Q2), um shared_farm_id serve a UMA fazenda nossa (tolerando o que
 * já existe: a fazenda que já usa aquele UUID continua usando).
 */
export function conflitoDeIds(
  a: { fazendaId: string | null; clienteId: string | null; sharedFarmId: string; sharedProducerId: string },
  vinculos: readonly Pick<VinculoExistente, 'fazendaId' | 'clienteId' | 'sharedFarmId' | 'sharedProducerId'>[],
): string | null {
  const daFazenda = a.fazendaId ? vinculos.find(v => v.fazendaId === a.fazendaId && v.sharedFarmId !== a.sharedFarmId) : undefined;
  if (daFazenda) return `A fazenda deste talhão já tem vínculo com outro shared_farm_id (${daFazenda.sharedFarmId}); o manifesto traz ${a.sharedFarmId}.`;
  const doCliente = a.clienteId ? vinculos.find(v => v.clienteId === a.clienteId && v.sharedProducerId !== a.sharedProducerId) : undefined;
  if (doCliente) return `O cliente deste talhão já tem vínculo com outro shared_producer_id (${doCliente.sharedProducerId}); o manifesto traz ${a.sharedProducerId}.`;
  const jaDaFazenda = !!a.fazendaId && vinculos.some(v => v.fazendaId === a.fazendaId && v.sharedFarmId === a.sharedFarmId);
  const deOutra = a.fazendaId && !jaDaFazenda ? vinculos.find(v => v.sharedFarmId === a.sharedFarmId && v.fazendaId && v.fazendaId !== a.fazendaId) : undefined;
  if (deOutra) return `O shared_farm_id ${a.sharedFarmId} já é de outra fazenda nossa (${deOutra.fazendaId}); um shared_farm_id serve a uma fazenda só.`;
  return null;
}

type LimiteLido = { ok: true; geometria: GeometriaLimite } | { ok: false; erro: string };

/**
 * Prepara o casamento: caixas dos nossos (do bbox gravado; sem ele, da
 * geometria) e os caches. Devolve `casarUm(k)` — o casamento do k-ésimo
 * talhão da PF, sem os passos que olham o manifesto inteiro (feitos em
 * `finalizarCasamento`).
 */
function prepararCasamento(
  campos: readonly CampoManifesto[],
  limites: readonly LimiteLido[],
  talhoes: readonly TalhaoParaCasar[],
  vinculos: readonly VinculoExistente[],
  opcoes: OpcoesCasamento,
): (k: number) => Casamento {
  // Geometria dos nossos: lida só quando a caixa cruza a de algum talhão da PF
  // (a base inteira tem milhares de talhões).
  const geoCache = new Map<string, GeometriaLimite | null>();
  const geoDo = (t: TalhaoParaCasar) => {
    if (!geoCache.has(t.id)) geoCache.set(t.id, geometriaDoTalhao(t.geojson));
    return geoCache.get(t.id)!;
  };
  const caixas: (Caixa | null)[] = talhoes.map(t => {
    if (t.bbox && t.bbox.length === 4 && t.bbox.every(Number.isFinite)) return t.bbox;
    const g = geoDo(t);
    return g ? caixaDe(g) : null;
  });
  const areaCache = new Map<string, number>();
  const areaDo = (id: string, g: GeometriaLimite) => {
    if (!areaCache.has(id)) areaCache.set(id, areaM2Geo(g));
    return areaCache.get(id)!;
  };
  const porTalhao = new Map(vinculos.map(v => [v.talhaoId, v]));
  const porCampo = new Map(vinculos.map(v => [v.sharedFieldId.toLowerCase(), v]));
  const nomeDo = new Map(talhoes.map(t => [t.id, t.nome]));

  return (k: number): Casamento => {
    const campo = campos[k];
    const base = { campo, areaPfHa: null, melhor: null, outrosRelevantes: [], preMarcado: false, podeCriar: false, substitui: null, ids: null } as Omit<Casamento, 'situacao' | 'motivo'>;
    if (campo.problema) return { ...base, situacao: 'invalido', motivo: campo.problema };
    const lim = limites[k];
    if (!lim?.ok) return { ...base, situacao: 'invalido', motivo: lim?.erro ?? 'Limite não lido.' };
    const pf = lim.geometria;
    const cx = caixaDe(pf);
    const areaPfM2 = areaM2Geo(pf);
    // Vizinhos pela caixa, do maior TETO de interseção para o menor. O recorte
    // (turf, caro em limite de milhares de vértices) só roda se o vizinho ainda
    // puder ser o melhor ou ser relevante (ambíguo) — o teto decide sem recortar.
    const vizinhos: { t: TalhaoParaCasar; teto: number }[] = [];
    talhoes.forEach((t, i) => {
      const c = caixas[i];
      if (c && cruzam(c, cx)) vizinhos.push({ t, teto: tetoIntersecaoM2(c, cx) });
    });
    vizinhos.sort((a, b) => b.teto - a.teto);
    const candidatos: Candidato[] = [];
    const geoCand = new Map<string, GeometriaLimite>();
    let maior = 0;
    for (const { t, teto } of vizinhos) {
      const g = geoDo(t);
      if (!g) continue;
      const areaNossoM2 = areaDo(t.id, g);
      const podeSerRelevante = teto >= COBERTURA_RELEVANTE * areaNossoM2 && teto >= FRACAO_PF_RELEVANTE * areaPfM2;
      if (teto <= maior && !podeSerRelevante) continue;
      let intersecaoM2: number;
      try {
        const r = turfIntersect(featureCollection([feature(pf), feature(g)]));
        intersecaoM2 = r ? areaM2Geo(r.geometry as GeometriaLimite) : 0;
      } catch { continue; }   // recorte falhou nesse par: não é candidato
      if (intersecaoM2 < 1) continue;   // só encosta
      maior = Math.max(maior, intersecaoM2);
      geoCand.set(t.id, g);
      candidatos.push({
        talhaoId: t.id, nome: t.nome, fazendaId: t.fazendaId, clienteId: t.clienteId, intersecaoM2,
        coberturaPct: areaNossoM2 > 0 ? (intersecaoM2 / areaNossoM2) * 100 : 0,
        difSimM2: null, difSimPct: null,
      });
    }
    candidatos.sort((a, b) => b.intersecaoM2 - a.intersecaoM2);
    const melhor = candidatos[0] ?? null;
    if (melhor) {
      try {
        const cmp = compararLimites(pf, geoCand.get(melhor.talhaoId)!);
        melhor.difSimM2 = cmp.difSimM2; melhor.difSimPct = cmp.difSimPct;
      } catch { /* sem a diferença: não pré-marca (cai em "diferente") */ }
    }
    const relevante = (c: Candidato) => c.coberturaPct >= COBERTURA_RELEVANTE * 100 && c.intersecaoM2 >= FRACAO_PF_RELEVANTE * areaPfM2;
    const relevantes = candidatos.filter(relevante);
    const outrosRelevantes = relevantes.filter(c => c !== melhor);
    const com = { ...base, areaPfHa: areaPfM2 / 10_000, melhor, outrosRelevantes };

    // 1) O shared_field_id da PF já está num vínculo nosso.
    const doCampo = porCampo.get(campo.sharedFieldId);
    if (doCampo) {
      const mesmo = melhor && doCampo.talhaoId === melhor.talhaoId;
      return {
        ...com, situacao: 'ja-vinculado',
        motivo: mesmo
          ? `Já vinculado a este talhão com estes mesmos IDs (${doCampo.status}).`
          : `Este shared_field_id já está no vínculo do talhão ${nomeDo.get(doCampo.talhaoId) ?? doCampo.talhaoId} (${doCampo.status}).`,
      };
    }
    // 2) Cobre dois ou mais dos nossos.
    if (relevantes.length >= 2) {
      return { ...com, situacao: 'ambiguo', motivo: `Cobre ${relevantes.length} talhões nossos: ${relevantes.map(c => `${c.nome} (${fmtPct(c.coberturaPct)} dele)`).join(', ')}. Resolva à mão.` };
    }
    if (!melhor) return { ...com, situacao: 'sem-par', motivo: 'Nenhum talhão nosso sobrepõe este limite.' };
    // 3) Nosso talhão já tem vínculo (com outros UUIDs) — só o pendente sem ID
    //    PF e sem publicação pode ser substituído (Q5).
    const doTalhao = porTalhao.get(melhor.talhaoId);
    if (doTalhao && !podeSubstituir(doTalhao)) {
      return { ...com, situacao: 'ja-vinculado', motivo: `O talhão ${melhor.nome} já tem vínculo com outros UUIDs (${doTalhao.status}, shared_field_id ${doTalhao.sharedFieldId}); não pode ser substituído: ${porQueNaoSubstitui(doTalhao)}.` };
    }
    const substitui = doTalhao ?? null;
    const sub = substitui ? `Substitui o vínculo PENDENTE sem ID PF deste talhão (shared_field_id ${substitui.sharedFieldId}).` : '';
    const pct = melhor.difSimPct;
    if (pct != null && pct <= LIMIAR_PAR_PCT) return { ...com, situacao: 'par', motivo: sub || null, preMarcado: true, podeCriar: true, substitui };
    return {
      ...com, situacao: 'diferente', podeCriar: true, preMarcado: !!opcoes.preMarcarDiferentes, substitui,
      motivo: `Diferença de ${pct != null ? fmtPct(pct) : '—'} (acima de ${LIMIAR_PAR_PCT}%): confira antes de criar.${sub ? ` ${sub}` : ''}`,
    };
  };
}

/** Passos que olham o manifesto inteiro: dois da PF no mesmo nosso e o plano de IDs. */
function finalizarCasamento(res: Casamento[], vinculos: readonly VinculoExistente[], opcoes: OpcoesCasamento): Casamento[] {
  // 4) Dois talhões da PF no MESMO talhão nosso: não é 1:1 — nenhum dos dois entra.
  const conta = new Map<string, number>();
  for (const r of res) if (r.podeCriar && r.melhor) conta.set(r.melhor.talhaoId, (conta.get(r.melhor.talhaoId) ?? 0) + 1);
  for (const r of res) {
    if (r.podeCriar && r.melhor && (conta.get(r.melhor.talhaoId) ?? 0) > 1) {
      const outros = res.filter(x => x !== r && x.podeCriar && x.melhor?.talhaoId === r.melhor!.talhaoId).map(x => x.campo.nome);
      Object.assign(r, { situacao: 'ambiguo', podeCriar: false, preMarcado: false, substitui: null, motivo: `O talhão ${r.melhor.nome} também casa com ${outros.join(', ')} da PrecisionFarm. Resolva à mão.` });
    }
  }
  // 5) IDs de fazenda e produtor de cada par (Q2 + regra de reuso).
  planejarIds(res, vinculos, opcoes.novoUuid ?? uuidAleatorio);
  return res;
}

/**
 * Casa cada talhão da PF com os nossos. `limites` = geometria validada de cada
 * campo (mesma ordem de `campos`) ou o erro de leitura.
 */
export function casarManifesto(
  campos: readonly CampoManifesto[],
  limites: readonly LimiteLido[],
  talhoes: readonly TalhaoParaCasar[],
  vinculos: readonly VinculoExistente[],
  opcoes: OpcoesCasamento = {},
): Casamento[] {
  const casarUm = prepararCasamento(campos, limites, talhoes, vinculos, opcoes);
  return finalizarCasamento(campos.map((_, k) => casarUm(k)), vinculos, opcoes);
}

/** O mesmo casamento, devolvendo a vez ao navegador a cada `lote` talhões
 *  (a tela mostra o progresso em vez de congelar). */
export async function casarManifestoAos(
  campos: readonly CampoManifesto[],
  limites: readonly LimiteLido[],
  talhoes: readonly TalhaoParaCasar[],
  vinculos: readonly VinculoExistente[],
  opcoes: OpcoesCasamento = {},
  aoProgredir?: (feitos: number, total: number) => void,
  lote = 8,
): Promise<Casamento[]> {
  const casarUm = prepararCasamento(campos, limites, talhoes, vinculos, opcoes);
  const res: Casamento[] = [];
  for (let k = 0; k < campos.length; k++) {
    res.push(casarUm(k));
    if ((k + 1) % lote === 0 || k + 1 === campos.length) {
      aoProgredir?.(k + 1, campos.length);
      await new Promise(r => setTimeout(r, 0));
    }
  }
  return finalizarCasamento(res, vinculos, opcoes);
}

/**
 * Plano de IDs (Q2), sobre TODOS os pares que podem ser criados (marcados ou
 * não — o plano não muda quando o usuário desmarca, e o UUID novo de uma
 * fazenda dividida fica o mesmo até o fim da prévia):
 *   • por grupo da PF (shared_farm_id do manifesto): a fazenda nossa que já usa
 *     aquele UUID é a principal; senão, a que recebe MAIS pares (empate: maior
 *     área da PF; depois a que aparece primeiro). A principal fica com o UUID da
 *     PF — se ela já tem OUTRO, é conflito (não cria, mostra o motivo);
 *   • as demais fazendas usam o shared_farm_id que já têm, ou um UUID NOVO;
 *   • produtor: o shared_producer_id da PF; o cliente nosso que já tem outro
 *     (vínculo existente ou par anterior do manifesto) é conflito.
 * O vínculo que vai ser SUBSTITUÍDO (Q5) não conta como existente.
 */
function planejarIds(res: Casamento[], vinculos: readonly VinculoExistente[], novoUuid: () => string) {
  const substituidos = new Set(res.filter(r => r.podeCriar && r.substitui).map(r => r.substitui!.talhaoId));
  const base = vinculos.filter(v => !substituidos.has(v.talhaoId));
  const farmDaFazenda = new Map<string, string>();
  const fazendaDoFarm = new Map<string, string>();
  const prodDoCliente = new Map<string, { id: string; doManifesto: boolean }>();
  for (const v of base) {
    if (v.fazendaId && !farmDaFazenda.has(v.fazendaId)) farmDaFazenda.set(v.fazendaId, v.sharedFarmId);
    if (v.fazendaId && !fazendaDoFarm.has(v.sharedFarmId)) fazendaDoFarm.set(v.sharedFarmId, v.fazendaId);
    if (v.clienteId && !prodDoCliente.has(v.clienteId)) prodDoCliente.set(v.clienteId, { id: v.sharedProducerId, doManifesto: false });
  }
  const recusar = (r: Casamento, motivo: string) => Object.assign(r, { situacao: 'conflito', podeCriar: false, preMarcado: false, ids: null, substitui: null, motivo });

  const grupos = new Map<string, Casamento[]>();
  for (const r of res) {
    if (!r.podeCriar || !r.melhor) continue;
    if (!r.melhor.fazendaId) { recusar(r, 'O nosso talhão não tem fazenda — não há a quem dar o shared_farm_id.'); continue; }
    const l = grupos.get(r.campo.sharedFarmId) ?? [];
    l.push(r);
    grupos.set(r.campo.sharedFarmId, l);
  }
  for (const [farmPF, itens] of grupos) {
    const porFazenda = new Map<string, Casamento[]>();
    for (const r of itens) {
      const l = porFazenda.get(r.melhor!.fazendaId!) ?? [];
      l.push(r);
      porFazenda.set(r.melhor!.fazendaId!, l);
    }
    const area = (rs: Casamento[]) => rs.reduce((s, r) => s + (r.areaPfHa ?? 0), 0);
    const principal = fazendaDoFarm.get(farmPF)
      ?? [...porFazenda].sort((a, b) => b[1].length - a[1].length || area(b[1]) - area(a[1]))[0][0];
    for (const [fazendaId, rs] of porFazenda) {
      const ja = farmDaFazenda.get(fazendaId);
      let farm: string, papel: PapelFazenda;
      if (fazendaId === principal) {
        if (ja && ja !== farmPF) {
          for (const r of rs) recusar(r, `A fazenda deste talhão já tem vínculo com outro shared_farm_id (${ja}); o manifesto traz ${farmPF}.`);
          continue;
        }
        farm = farmPF; papel = 'principal';
      } else if (ja) { farm = ja; papel = 'reuso'; }
      else { farm = novoUuid(); papel = 'nova'; }
      farmDaFazenda.set(fazendaId, farm);
      if (!fazendaDoFarm.has(farm)) fazendaDoFarm.set(farm, fazendaId);
      for (const r of rs) r.ids = { sharedProducerId: r.campo.sharedProducerId, sharedFarmId: farm, papelFazenda: papel };
    }
  }
  // Produtor, na ordem do manifesto.
  for (const r of res) {
    if (!r.podeCriar || !r.ids || !r.melhor?.clienteId) continue;
    const ja = prodDoCliente.get(r.melhor.clienteId);
    if (ja && ja.id !== r.ids.sharedProducerId) {
      recusar(r, `O cliente deste talhão já tem vínculo com outro shared_producer_id (${ja.id}); o manifesto traz ${r.ids.sharedProducerId}.${ja.doManifesto ? ' (outro item do manifesto)' : ''}`);
      continue;
    }
    if (!ja) prodDoCliente.set(r.melhor.clienteId, { id: r.ids.sharedProducerId, doManifesto: true });
  }
}

export interface FazendaDoGrupo { fazendaId: string; sharedFarmId: string; papel: PapelFazenda; pares: number }
export interface ResumoGrupo {
  /** shared_farm_id que a PF propôs para o grupo. */
  sharedFarmIdPF: string;
  nomeClientePF: string | null;
  fazendas: FazendaDoGrupo[];
  /** Mais de uma fazenda nossa — o grupo da PF é dividido no retorno. */
  dividido: boolean;
}

/** Fazendas nossas por grupo da PF, a partir do plano de IDs (pares criáveis). */
export function resumoFazendas(casamentos: readonly Casamento[]): ResumoGrupo[] {
  const grupos = new Map<string, ResumoGrupo>();
  for (const r of casamentos) {
    if (!r.podeCriar || !r.ids || !r.melhor?.fazendaId) continue;
    const g = grupos.get(r.campo.sharedFarmId) ?? { sharedFarmIdPF: r.campo.sharedFarmId, nomeClientePF: r.campo.nomeClientePF, fazendas: [], dividido: false };
    let f = g.fazendas.find(x => x.fazendaId === r.melhor!.fazendaId);
    if (!f) { f = { fazendaId: r.melhor.fazendaId, sharedFarmId: r.ids.sharedFarmId, papel: r.ids.papelFazenda, pares: 0 }; g.fazendas.push(f); }
    f.pares++;
    grupos.set(r.campo.sharedFarmId, g);
  }
  for (const g of grupos.values()) {
    g.fazendas.sort((a, b) => (a.papel === 'principal' ? -1 : b.papel === 'principal' ? 1 : b.pares - a.pares));
    g.dividido = g.fazendas.length > 1;
  }
  return [...grupos.values()];
}

// ── Conferência do servidor antes de criar ───────────────────────────────────

export interface ItemCriacao {
  talhaoId: string;
  pfLocalId: string;
  sharedProducerId: string;
  sharedFarmId: string;
  sharedFieldId: string;
  /** Nome do talhão na PF (só para a mensagem). */
  nomePF: string;
  /** Q5: pede para trocar o vínculo PENDENTE sem ID PF do talhão. */
  substituir: boolean;
}

/** Corpo do POST → itens normalizados (ou o erro do pedido inteiro). */
export function lerItensCriacao(corpo: unknown): { ok: true; itens: ItemCriacao[] } | { ok: false; erro: string } {
  const lista = ehObjeto(corpo) ? corpo.itens : null;
  if (!Array.isArray(lista) || !lista.length) return { ok: false, erro: 'Informe itens: [{ talhaoId, pfLocalId, sharedProducerId, sharedFarmId, sharedFieldId }].' };
  if (lista.length > MAX_CAMPOS_MANIFESTO) return { ok: false, erro: `No máximo ${MAX_CAMPOS_MANIFESTO} vínculos por pedido.` };
  return {
    ok: true,
    itens: lista.map(x => {
      const o = ehObjeto(x) ? x : {};
      return {
        talhaoId: texto(o.talhaoId), pfLocalId: texto(o.pfLocalId).slice(0, 200),
        sharedProducerId: texto(o.sharedProducerId).toLowerCase(), sharedFarmId: texto(o.sharedFarmId).toLowerCase(),
        sharedFieldId: texto(o.sharedFieldId).toLowerCase(), nomePF: texto(o.nomePF).slice(0, 200),
        substituir: o.substituir === true,
      };
    }),
  };
}

export type ConferenciaCriacao =
  | { ok: true; item: ItemCriacao; fazendaId: string | null; clienteId: string | null; empresaId: string | null; substitui: VinculoExistente | null }
  | { ok: false; item: ItemCriacao; motivo: string };

/**
 * O que o servidor confere ANTES de inserir (a prévia da tela é conforto; isto
 * é a regra): formato, talhão na nuvem, talhão sem vínculo (ou, pedido
 * explicitamente, com vínculo substituível — Q5), shared_field_id livre, sem
 * repetição no próprio pedido e a mesma identidade de produtor/fazenda dos
 * vínculos existentes. `talhoes`: os da nuvem (sem o talhão = não
 * sincronizado ou inexistente). `vinculos` precisam trazer pfLocalId e
 * temPublicacao para a substituição valer.
 */
export function conferirCriacao(
  itens: readonly ItemCriacao[],
  talhoes: ReadonlyMap<string, { fazendaId: string | null; clienteId: string | null; empresaId: string | null }>,
  vinculos: readonly VinculoExistente[],
): ConferenciaCriacao[] {
  const porTalhao = new Map(vinculos.map(v => [v.talhaoId, v]));
  // Os substituídos saem da base da regra de identidade. Se um deles acaba
  // recusado por outro motivo, o vínculo antigo FICA — confere tudo de novo com
  // ele de volta (e o item mantém o motivo da recusa original).
  const dono = new Map<string, ItemCriacao>();
  for (const i of itens) {
    const v = porTalhao.get(i.talhaoId);
    if (i.substituir && v && podeSubstituir(v) && !dono.has(i.talhaoId)) dono.set(i.talhaoId, i);
  }
  const liberados = new Set(dono.keys());
  const motivoOriginal = new Map<ItemCriacao, string>();
  for (;;) {
    const res = conferirUmaVez(itens, talhoes, vinculos, liberados);
    const caidos = res.filter((r): r is Extract<ConferenciaCriacao, { ok: false }> => !r.ok && dono.get(r.item.talhaoId) === r.item && liberados.has(r.item.talhaoId));
    if (!caidos.length) return res.map(r => (!r.ok && motivoOriginal.has(r.item) ? { ...r, motivo: motivoOriginal.get(r.item)! } : r));
    for (const r of caidos) { liberados.delete(r.item.talhaoId); motivoOriginal.set(r.item, r.motivo); }
  }
}

function conferirUmaVez(
  itens: readonly ItemCriacao[],
  talhoes: ReadonlyMap<string, { fazendaId: string | null; clienteId: string | null; empresaId: string | null }>,
  vinculos: readonly VinculoExistente[],
  liberados: ReadonlySet<string>,
): ConferenciaCriacao[] {
  const porTalhao = new Map(vinculos.map(v => [v.talhaoId, v]));
  const porCampo = new Map(vinculos.map(v => [v.sharedFieldId.toLowerCase(), v]));
  const base = vinculos.filter(v => !liberados.has(v.talhaoId));
  const aceitos: VinculoExistente[] = [];
  return itens.map((item): ConferenciaCriacao => {
    const recusa = (motivo: string): ConferenciaCriacao => ({ ok: false, item, motivo });
    if (!item.talhaoId) return recusa('Sem talhão.');
    if (!item.pfLocalId) return recusa('Sem o ID do talhão na PrecisionFarm (local_field_id).');
    if (![item.sharedProducerId, item.sharedFarmId, item.sharedFieldId].every(u => RE_UUID.test(u))) return recusa('UUID ausente ou inválido.');
    const t = talhoes.get(item.talhaoId);
    if (!t) return recusa('Este talhão não está na nuvem (ainda não sincronizou ou não existe).');
    const v1 = porTalhao.get(item.talhaoId);
    let substitui: VinculoExistente | null = null;
    if (v1) {
      if (!item.substituir) return recusa(`O talhão já tem vínculo (${v1.status}, shared_field_id ${v1.sharedFieldId}).`);
      if (!podeSubstituir(v1)) return recusa(`O vínculo do talhão não pode ser substituído: ${porQueNaoSubstitui(v1)} (só o PENDENTE sem ID PF e sem publicação).`);
      if (!liberados.has(item.talhaoId)) return recusa('O vínculo do talhão não pode ser substituído neste pedido.');
      substitui = v1;
    } else if (item.substituir) {
      return recusa('Pedido de substituição, mas o talhão não tem vínculo.');
    }
    const v2 = porCampo.get(item.sharedFieldId);
    if (v2) return recusa(`Este shared_field_id já está no vínculo de outro talhão (${v2.talhaoId}, ${v2.status}).`);
    if (aceitos.some(a => a.talhaoId === item.talhaoId)) return recusa('Talhão repetido neste pedido.');
    if (aceitos.some(a => a.sharedFieldId === item.sharedFieldId)) return recusa('shared_field_id repetido neste pedido.');
    const ids = conflitoDeIds({ fazendaId: t.fazendaId, clienteId: t.clienteId, sharedFarmId: item.sharedFarmId, sharedProducerId: item.sharedProducerId }, [...base, ...aceitos]);
    if (ids) return recusa(ids);
    aceitos.push({
      talhaoId: item.talhaoId, sharedProducerId: item.sharedProducerId, sharedFarmId: item.sharedFarmId, sharedFieldId: item.sharedFieldId,
      status: 'pendente', fazendaId: t.fazendaId, clienteId: t.clienteId,
    });
    return { ok: true, item, fazendaId: t.fazendaId, clienteId: t.clienteId, empresaId: t.empresaId, substitui };
  });
}
