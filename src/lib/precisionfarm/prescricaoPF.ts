// Integração PrecisionFarm — extensão 0.3.0: PRESCRIÇÃO (Invicta → PF).
// Núcleo PURO: mapeamento tipo/unidade da Invicta → contrato, montagem do
// payload `prescription` (FORMATO_0_3.md) e a escolha do que entra (estrela +
// versão mais recente da linhagem). Sem banco, sem rede, imports com `.ts` —
// `npm run teste:precisionfarm` exercita isto de verdade.
//
// Decisões (ledger pf-contrato-03):
//   • Fonte: a aba Prescrições (tipo `Prescricao`), nunca os cenários de
//     Recomendações (Q2).
//   • Só as linhagens com a ESTRELA "Enviar à PrecisionFarm", na versão mais
//     recente (origemId) (Q3). Tirar a estrela = revisão `archive` (Q4).
//   • Tipo/unidade fora do contrato → NÃO publica, com o motivo. Nenhuma
//     conversão de unidade, nenhum chute (Q5).
//   • A dose de cada polígono é a MESMA do arquivo de máquina (SHP): casamento
//     polígono ↔ zona de casarZonas, compensação de germinação de doseArquivo
//     e o arredondamento de arredRel. Dose zero continua zero; zona sem dose é
//     erro (nunca vira zero).

import { casarZonas } from '../prescricao/casar.ts';
import { arredRel, doseArquivo } from '../prescricao/resumo.ts';
import type { Prescricao, TipoPrescricao, UnidadeDose } from '../prescricao/tipos.ts';
import { MAX_FEICOES, MAX_VERTICES, seasonDoContrato, type ResultadoPayload } from './contrato.ts';

// ── Vocabulário do contrato ──────────────────────────────────────────────────

export type InputType = 'seed' | 'fertilizer' | 'lime' | 'other';
export type OperationCategory = 'planting' | 'fertilizing' | 'liming' | 'spraying' | 'other';
export type Quantity = 'seed_population' | 'application_rate';
export type RateUnit = 'seeds/m' | 'seeds/ha' | 'kg/ha' | 't/ha' | 'L/ha';

/** Unidades que o contrato aceita para cada input_type (FORMATO_0_3.md). */
export const UNIDADES_DO_CONTRATO: Record<InputType, readonly RateUnit[]> = {
  seed: ['seeds/m', 'seeds/ha'],
  fertilizer: ['kg/ha', 't/ha'],
  lime: ['kg/ha', 't/ha'],
  other: ['kg/ha', 't/ha', 'L/ha'],
};

/**
 * Tipo da prescrição da Invicta → contrato. ÚNICO lugar desta conversão.
 *   sementes      → seed / planting / seed_population
 *   fertilizante  → fertilizer / fertilizing / application_rate
 *   corretivo     → lime / liming / application_rate
 *   organico      → other / fertilizing / application_rate (esterco não é o
 *                   "fertilizer" mineral do contrato; e dejeto líquido vai em
 *                   L/ha, que só `other` aceita)
 *   personalizado → other / other / application_rate
 */
export const TIPO_PARA_CONTRATO: Record<TipoPrescricao, { input_type: InputType; operation_category: OperationCategory; quantity: Quantity }> = {
  sementes: { input_type: 'seed', operation_category: 'planting', quantity: 'seed_population' },
  fertilizante: { input_type: 'fertilizer', operation_category: 'fertilizing', quantity: 'application_rate' },
  corretivo: { input_type: 'lime', operation_category: 'liming', quantity: 'application_rate' },
  organico: { input_type: 'other', operation_category: 'fertilizing', quantity: 'application_rate' },
  personalizado: { input_type: 'other', operation_category: 'other', quantity: 'application_rate' },
};

/** Unidade da Invicta → rate_unit do contrato (só renomeia; não converte). */
export const UNIDADE_PARA_CONTRATO: Partial<Record<UnidadeDose, RateUnit>> = {
  'sementes/m': 'seeds/m',
  'sementes/ha': 'seeds/ha',
  'kg/ha': 'kg/ha',
  't/ha': 't/ha',
  'L/ha': 'L/ha',
  // 'sementes/m2' NÃO existe no contrato — recusado (converter exigiria
  // espaçamento confirmado; FORMATO_0_3.md proíbe a adivinhação).
};

const ROTULO_TIPO_CURTO: Record<TipoPrescricao, string> = {
  sementes: 'sementes', fertilizante: 'fertilizante', corretivo: 'corretivo', organico: 'orgânico', personalizado: 'produto personalizado',
};

export type MapeamentoContrato =
  | { ok: true; input_type: InputType; operation_category: OperationCategory; quantity: Quantity; rate_unit: RateUnit }
  | { ok: false; erro: string };

export function mapearTipoUnidade(tipo: string, unidade: string): MapeamentoContrato {
  const t = TIPO_PARA_CONTRATO[tipo as TipoPrescricao];
  if (!t) return { ok: false, erro: `Tipo de prescrição "${tipo}" sem correspondência no contrato da PrecisionFarm.` };
  const u = UNIDADE_PARA_CONTRATO[unidade as UnidadeDose];
  const aceitas = UNIDADES_DO_CONTRATO[t.input_type];
  if (!u || !aceitas.includes(u)) {
    const lista = aceitas.map(x => x.replace('seeds', 'sementes')).join(' ou ');
    return {
      ok: false,
      erro: `Unidade ${unidade || '(vazia)'} não é aceita pela PrecisionFarm para ${ROTULO_TIPO_CURTO[tipo as TipoPrescricao]} (aceita ${lista}). `
        + 'A Invicta não converte unidades sozinha: salve uma versão da prescrição numa unidade aceita.',
    };
  }
  return { ok: true, ...t, rate_unit: u };
}

// ── Payload ──────────────────────────────────────────────────────────────────

function contarVertices(g: GeoJSON.Polygon | GeoJSON.MultiPolygon): number {
  const aneis = g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
  return aneis.reduce((s, a) => s + a.length, 0);
}

function poligonoOk(g: GeoJSON.Geometry | null | undefined): g is GeoJSON.Polygon | GeoJSON.MultiPolygon {
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return false;
  const aneis = g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
  if (!aneis.length) return false;
  return aneis.every(a => Array.isArray(a) && a.length >= 4
    && a.every(p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])
      && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90));
}

/** O que a montagem lê da prescrição (o registro da nuvem). */
export type PrescricaoParaPF = Pick<Prescricao, 'nome' | 'tipo' | 'produto' | 'unidade' | 'zonas' | 'fc' | 'params' | 'versao'>
  & Partial<Pick<Prescricao, 'ano' | 'origemLavra'>>;

/**
 * Prescrição → payload `prescription` (FORMATO_0_3.md). Recusa, com o motivo:
 * tipo/unidade fora do contrato, produto vazio, polígono sem zona, zona sem
 * dose (NaN/ausente) ou com dose negativa, geometria que não é área válida,
 * tetos de feições/vértices. Dose 0 é publicada como 0.
 * Safra (`season`) e época (`season_period`) entram só quando existem e são
 * inequívocas: safra do Ano da prescrição (ou da Lavra) no formato do
 * contrato; época só a safrinha da Lavra (→ second, a mesma semântica de
 * periodoDoContrato). Sem época na prescrição, nada é inventado.
 */
export function montarPayloadPrescricao(p: PrescricaoParaPF): ResultadoPayload {
  const m = mapearTipoUnidade(p.tipo, p.unidade);
  if (!m.ok) return m;
  const produto = String(p.produto ?? '').trim();
  if (!produto) return { ok: false, erro: 'A prescrição não tem produto. Abra, informe o produto e salve uma versão nova.' };
  const zonas = Array.isArray(p.zonas) ? p.zonas : [];
  if (!zonas.length) return { ok: false, erro: 'A prescrição não tem zonas.' };
  const semDose = zonas.filter(z => typeof z.dose !== 'number' || !Number.isFinite(z.dose));
  if (semDose.length) return { ok: false, erro: `Zona(s) sem dose: ${semDose.map(z => z.nomeZona || z.idZona).join(', ')}. Uma zona sem dose não é publicada como zero — preencha a dose e salve.` };
  const negativa = zonas.filter(z => z.dose < 0);
  if (negativa.length) return { ok: false, erro: `Zona(s) com dose negativa: ${negativa.map(z => z.nomeZona || z.idZona).join(', ')}.` };

  const { pares, semZona } = casarZonas(p.fc, zonas);
  if (semZona.length) {
    return { ok: false, erro: `${semZona.length} polígono(s) do mapa não casam com nenhuma zona da prescrição (ficariam sem dose). Refaça a prescrição a partir do zoneamento atual.` };
  }
  if (!pares.length) return { ok: false, erro: 'A prescrição não tem polígonos no mapa.' };

  const features: GeoJSON.Feature[] = [];
  let nVertices = 0;
  for (let i = 0; i < pares.length; i++) {
    const { feature, zona } = pares[i];
    if (!poligonoOk(feature.geometry)) {
      return { ok: false, erro: `O polígono ${i + 1} (zona ${zona.nomeZona || zona.idZona}) não é uma área válida (Polygon/MultiPolygon em WGS84).` };
    }
    const rate = arredRel(doseArquivo(p as Prescricao, zona.dose));
    if (!Number.isFinite(rate) || rate < 0) return { ok: false, erro: `Dose inválida na zona ${zona.nomeZona || zona.idZona}.` };
    nVertices += contarVertices(feature.geometry);
    features.push({ type: 'Feature', properties: { zone_id: String(zona.idZona), rate }, geometry: feature.geometry });
  }
  if (features.length > MAX_FEICOES) return { ok: false, erro: `A prescrição tem ${features.length} polígonos; o contrato aceita até ${MAX_FEICOES}.` };
  if (nVertices > MAX_VERTICES) return { ok: false, erro: `A prescrição tem ${nVertices} vértices; o contrato aceita até ${MAX_VERTICES}.` };

  const payload: Record<string, unknown> = {
    name: String(p.nome ?? '').trim() || produto,
    status: 'available',
    is_favorite: true,
    product: produto,
    input_type: m.input_type,
    operation_category: m.operation_category,
    quantity: m.quantity,
    rate_unit: m.rate_unit,
    geometry: { type: 'FeatureCollection', features },
  };
  const season = seasonDoContrato(p.ano || p.origemLavra?.anoSafra || '');
  if (season) payload.season = season;
  if (p.origemLavra?.tempo === 'SAFRINHA') payload.season_period = 'second';
  return { ok: true, payload, nFeicoes: features.length, nVertices };
}

// ── Linhagem e estrela ───────────────────────────────────────────────────────

/** Cabeçalho leve de uma versão (o que o servidor lê de todas). */
export interface CabecalhoPrescricao {
  id: string;
  origemId: string | null;
  versao: number;
  atualizadoEm: string;
  nome: string;
  /** A Lavra retirou o item da programação nesta versão. */
  removida: boolean;
}

/** Linhagem = id da V1 (origemId das versões seguintes). */
export const linhagemDe = (c: { id: string; origemId?: string | null }) => c.origemId || c.id;

/** Chave local do recurso no pf_recursos (um resource_id por linhagem). */
export const chaveLocalPrescricao = (linhagemId: string) => `prescription|${linhagemId}`;
export const linhagemDaChave = (chave: string): string | null => (chave.startsWith('prescription|') ? chave.slice('prescription|'.length) : null);

/** Versão mais recente de cada linhagem (maior `versao`; empate → mais nova). */
export function ultimasDasLinhagens<T extends CabecalhoPrescricao>(cabs: readonly T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const c of cabs) {
    const k = linhagemDe(c);
    const a = m.get(k);
    if (!a || c.versao > a.versao || (c.versao === a.versao && c.atualizadoEm > a.atualizadoEm)) m.set(k, c);
  }
  return m;
}

/**
 * O que fazer com UMA linhagem na sincronização:
 *   publicar  — estrela marcada e a última versão existe e vale;
 *   arquivar  — havia publicação (última revisão upsert) e agora a estrela
 *               saiu, a linhagem sumiu ou a Lavra retirou o item;
 *   nada      — nada publicado e nada a publicar (ou já arquivada).
 */
export type DecisaoLinhagem = { acao: 'publicar'; versaoId: string } | { acao: 'arquivar'; motivo: string } | { acao: 'nada'; motivo: string };

export function decidirLinhagem(a: {
  marcada: boolean;
  ultima: CabecalhoPrescricao | null;
  /** Operação da última revisão publicada (null = nunca publicada). */
  ultimaOperacao: 'upsert' | 'archive' | null;
}): DecisaoLinhagem {
  const vale = !!a.ultima && !a.ultima.removida;
  if (a.marcada && vale) return { acao: 'publicar', versaoId: a.ultima!.id };
  const motivo = !a.ultima ? 'A prescrição foi excluída na Invicta.'
    : a.ultima.removida ? 'A versão mais recente foi retirada da programação na Lavra.'
      : 'A estrela "Enviar à PrecisionFarm" foi tirada.';
  if (a.ultimaOperacao === 'upsert') return { acao: 'arquivar', motivo };
  return { acao: 'nada', motivo };
}
