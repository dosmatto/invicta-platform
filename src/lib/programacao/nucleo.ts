// Programação de safra vinda da LAVRA (plataforma fitotécnica) — núcleo PURO.
//
// A Lavra lê, no Supabase da AP, o zoneamento que o agrônomo liberou
// (talhao.zoneamentoLiberadoId), programa as doses por zona e devolve por
// POST /api/v1/programacao. Aqui vive TUDO o que decide se o envio é aceito e o
// que vira prescrição; a rota (rota.ts) e o servidor (servidor.ts) só leem o
// banco, chamam isto e gravam. Sem I/O, sem DOM, imports com `.ts` — é o que
// deixa `npm run teste:programacao` exercitar a validação e a idempotência de
// verdade.
//
// Contrato completo: docs/integracao-lavra.md.

import turfArea from '@turf/area';
import { fatiarArea } from '../areaGeo.ts';
import { rotuloZona } from '../meap/rotuloZona.ts';
import type {
  ChaveProgramacao, OrigemLavra, Prescricao, TipoPrescricao, UnidadeDose, ZonaDose, ParamsCalculo,
} from '../prescricao/tipos.ts';

// ── Catálogo do contrato ─────────────────────────────────────────────────────

export const CHAVES_PROGRAMACAO: readonly ChaveProgramacao[] = [
  'semente', 'adubo_base', 'cobertura_1', 'cobertura_2', 'corretivo_calcario', 'corretivo_gesso',
];

/** Tipo de prescrição que cada linha da programação gera (e o único aceito). */
export const TIPO_DA_CHAVE: Record<ChaveProgramacao, 'sementes' | 'fertilizante' | 'corretivo'> = {
  semente: 'sementes',
  adubo_base: 'fertilizante',
  cobertura_1: 'fertilizante',
  cobertura_2: 'fertilizante',
  corretivo_calcario: 'corretivo',
  corretivo_gesso: 'corretivo',
};

export const ROTULO_CHAVE: Record<ChaveProgramacao, string> = {
  semente: 'Semente',
  adubo_base: 'Adubo de base',
  cobertura_1: 'Cobertura 1',
  cobertura_2: 'Cobertura 2',
  corretivo_calcario: 'Calcário',
  corretivo_gesso: 'Gesso',
};

/** Unidades aceitas por tipo — as mesmas UnidadeDose que a AP exporta. */
export const UNIDADES_DO_TIPO: Record<'sementes' | 'fertilizante' | 'corretivo', readonly UnidadeDose[]> = {
  sementes: ['sementes/ha', 'sementes/m', 'sementes/m2'],
  fertilizante: ['kg/ha', 't/ha', 'L/ha'],
  corretivo: ['kg/ha', 't/ha'],
};

/** Itens por envio. Só há 6 chaves e repetir chave já é erro — o teto existe
 *  para um corpo malformado não ser varrido inteiro. */
export const MAX_ITENS = 20;
/** Zonas por item. Zoneamento real tem dezenas; acima disso é corpo errado. */
export const MAX_ZONAS_ITEM = 5000;
/** Folga aceita em `origem.atualizadoEm` à frente do relógio do servidor.
 *  Data no futuro trava a cadeia: todo envio legítimo depois dela vira
 *  `ignorada` (é "anterior" à gravada) até o relógio alcançar. */
export const FOLGA_FUTURO_MS = 24 * 60 * 60 * 1000;
const RE_ID = /^[A-Za-z0-9_.-]{1,80}$/;
const RE_SAFRA = /^(\d{4})\/(\d{4})$/;

// ── Payload ─────────────────────────────────────────────────────────────────

export interface ZonaProgramada { idZona: string; dose: number }

export interface ItemProgramacao {
  chave: ChaveProgramacao;
  tipo: 'sementes' | 'fertilizante' | 'corretivo';
  produto: string;
  unidade: UnidadeDose;
  cultivar?: string;
  /** Espaçamento entre linhas (m). Obrigatório quando unidade = sementes/m. */
  espacamentoM?: number;
  /** Germinação do lote (%). Só informativo na AP (a dose é a taxa da máquina). */
  germinacaoPct?: number;
  zonas: ZonaProgramada[];
}

export interface OrigemProgramacao {
  sistema: 'lavra';
  cultivoId: string;
  planoId?: string;
  subdivisao?: string;
  agronomo?: string;
  atualizadoEm: string;
}

export interface ProgramacaoPayload {
  talhaoId: string;
  zoneamentoId: string;
  anoSafra: string;
  tempo: 'NORMAL' | 'SAFRINHA';
  origem: OrigemProgramacao;
  prescricoes: ItemProgramacao[];
  remover: ChaveProgramacao[];
}

export interface ErroProgramacao {
  campo: string;
  codigo: string;
  mensagem: string;
  item?: ChaveProgramacao;
  /** idZona envolvidos (zona-faltando / zona-inexistente / zona-repetida). */
  zonas?: string[];
}

// ── 1ª passada: formato ─────────────────────────────────────────────────────

const ehObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const opcTexto = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const numeroFinito = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Confere forma, tipos e catálogo — sem banco. Devolve o payload NORMALIZADO
 * (textos aparados, `remover` sempre presente) quando não há erro.
 *
 * Junta TODOS os erros numa passada: a Lavra corrige o envio de uma vez, em vez
 * de descobrir um problema por tentativa.
 */
export function validarFormato(raw: unknown, agoraMs: number = Date.now()): { payload: ProgramacaoPayload | null; erros: ErroProgramacao[] } {
  const erros: ErroProgramacao[] = [];
  const err = (campo: string, codigo: string, mensagem: string, extra: Partial<ErroProgramacao> = {}) =>
    erros.push({ campo, codigo, mensagem, ...extra });

  if (!ehObj(raw)) {
    err('', 'invalido', 'O corpo precisa ser um objeto JSON.');
    return { payload: null, erros };
  }

  const talhaoId = texto(raw.talhaoId);
  if (!talhaoId) err('talhaoId', 'obrigatorio', 'Informe talhaoId (o id do talhão na AP).');
  const zoneamentoId = texto(raw.zoneamentoId);
  if (!zoneamentoId) err('zoneamentoId', 'obrigatorio', 'Informe zoneamentoId (o zoneamento liberado do talhão).');

  const anoSafra = texto(raw.anoSafra);
  const mSafra = anoSafra ? RE_SAFRA.exec(anoSafra) : null;
  if (!mSafra || +mSafra[2] !== +mSafra[1] + 1) err('anoSafra', 'invalido', 'anoSafra deve ser "AAAA/AAAA" com anos consecutivos (ex.: "2026/2027").');

  const tempo = raw.tempo;
  if (tempo !== 'NORMAL' && tempo !== 'SAFRINHA') err('tempo', 'invalido', 'tempo deve ser "NORMAL" ou "SAFRINHA".');

  let origem: OrigemProgramacao | null = null;
  if (!ehObj(raw.origem)) err('origem', 'obrigatorio', 'Informe o objeto origem.');
  else {
    const o = raw.origem;
    if (o.sistema !== 'lavra') err('origem.sistema', 'invalido', 'origem.sistema deve ser "lavra".');
    const cultivoId = o.cultivoId == null ? null : String(o.cultivoId).trim();
    if (!cultivoId || !RE_ID.test(cultivoId)) err('origem.cultivoId', 'invalido', 'origem.cultivoId é obrigatório (até 80 caracteres: letras, números, _ . -).');
    const atualizadoEm = texto(o.atualizadoEm);
    const msAtualizado = atualizadoEm ? Date.parse(atualizadoEm) : Number.NaN;
    let atualizadoOk = false;
    if (Number.isNaN(msAtualizado)) err('origem.atualizadoEm', 'invalido', 'origem.atualizadoEm deve ser uma data ISO 8601 (ex.: "2026-10-07T14:30:00-03:00").');
    else if (msAtualizado > agoraMs + FOLGA_FUTURO_MS) err('origem.atualizadoEm', 'data-futura', 'origem.atualizadoEm está mais de 24 h no futuro em relação ao relógio da AP. Confira o relógio/fuso da Lavra — uma data futura travaria os próximos envios deste cultivo.');
    else atualizadoOk = true;
    if (o.planoId != null && typeof o.planoId !== 'string' && typeof o.planoId !== 'number') err('origem.planoId', 'invalido', 'origem.planoId deve ser texto ou número.');
    if (cultivoId && RE_ID.test(cultivoId) && atualizadoEm && atualizadoOk && o.sistema === 'lavra') {
      origem = {
        sistema: 'lavra', cultivoId, atualizadoEm,
        ...(o.planoId != null && String(o.planoId).trim() ? { planoId: String(o.planoId).trim() } : {}),
        ...(opcTexto(o.subdivisao) ? { subdivisao: opcTexto(o.subdivisao) } : {}),
        ...(opcTexto(o.agronomo) ? { agronomo: opcTexto(o.agronomo) } : {}),
      };
    }
  }

  // remover
  const remover: ChaveProgramacao[] = [];
  if (raw.remover != null) {
    if (!Array.isArray(raw.remover)) err('remover', 'invalido', 'remover deve ser uma lista de chaves.');
    else raw.remover.forEach((c, i) => {
      if (!CHAVES_PROGRAMACAO.includes(c as ChaveProgramacao)) err(`remover[${i}]`, 'chave-desconhecida', `Chave "${String(c)}" desconhecida. Aceitas: ${CHAVES_PROGRAMACAO.join(', ')}.`);
      else if (remover.includes(c as ChaveProgramacao)) err(`remover[${i}]`, 'chave-repetida', `Chave "${c}" repetida em remover.`);
      else remover.push(c as ChaveProgramacao);
    });
  }

  // prescricoes
  const itens: ItemProgramacao[] = [];
  const brutos = raw.prescricoes == null ? [] : raw.prescricoes;
  if (!Array.isArray(brutos)) err('prescricoes', 'invalido', 'prescricoes deve ser uma lista.');
  else if (brutos.length > MAX_ITENS) err('prescricoes', 'limite-excedido', `No máximo ${MAX_ITENS} itens por envio (vieram ${brutos.length}).`);
  else {
    const vistas = new Set<string>();
    brutos.forEach((b, i) => {
      const c = `prescricoes[${i}]`;
      if (!ehObj(b)) { err(c, 'invalido', 'Cada item deve ser um objeto.'); return; }
      const chave = b.chave as ChaveProgramacao;
      if (!CHAVES_PROGRAMACAO.includes(chave)) { err(`${c}.chave`, 'chave-desconhecida', `Chave "${String(b.chave)}" desconhecida. Aceitas: ${CHAVES_PROGRAMACAO.join(', ')}.`); return; }
      if (vistas.has(chave)) { err(`${c}.chave`, 'chave-repetida', `Chave "${chave}" aparece mais de uma vez.`, { item: chave }); return; }
      vistas.add(chave);
      if (remover.includes(chave)) err(`${c}.chave`, 'conflito-remover', `Chave "${chave}" está em prescricoes e em remover ao mesmo tempo.`, { item: chave });

      const esperado = TIPO_DA_CHAVE[chave];
      let ok = true;
      if (b.tipo !== esperado) { ok = false; err(`${c}.tipo`, 'tipo-incompativel', `A chave "${chave}" exige tipo "${esperado}".`, { item: chave }); }
      const produto = texto(b.produto);
      if (!produto) { ok = false; err(`${c}.produto`, 'obrigatorio', 'Informe o produto (nome comercial).', { item: chave }); }
      const unidade = b.unidade as UnidadeDose;
      if (!UNIDADES_DO_TIPO[esperado].includes(unidade)) {
        ok = false; err(`${c}.unidade`, 'unidade-invalida', `Unidade "${String(b.unidade)}" não serve para ${esperado}. Aceitas: ${UNIDADES_DO_TIPO[esperado].join(', ')}.`, { item: chave });
      }
      const espacamentoM = b.espacamentoM;
      if (espacamentoM != null && (!numeroFinito(espacamentoM) || espacamentoM <= 0 || espacamentoM > 3)) {
        ok = false; err(`${c}.espacamentoM`, 'invalido', 'espacamentoM deve ser um número em metros (0 < x ≤ 3).', { item: chave });
      }
      if (unidade === 'sementes/m' && !numeroFinito(espacamentoM)) {
        ok = false; err(`${c}.espacamentoM`, 'obrigatorio', 'Dose em sementes/m exige espacamentoM (m) — sem ele a AP não fecha o total.', { item: chave });
      }
      const germinacaoPct = b.germinacaoPct;
      if (germinacaoPct != null && (!numeroFinito(germinacaoPct) || germinacaoPct <= 0 || germinacaoPct > 100)) {
        ok = false; err(`${c}.germinacaoPct`, 'invalido', 'germinacaoPct deve estar entre 0 e 100.', { item: chave });
      }
      if (esperado !== 'sementes' && (b.cultivar != null || espacamentoM != null || germinacaoPct != null)) {
        ok = false; err(c, 'invalido', 'cultivar, espacamentoM e germinacaoPct só valem para a chave "semente".', { item: chave });
      }

      const zonas: ZonaProgramada[] = [];
      if (!Array.isArray(b.zonas) || !b.zonas.length) { ok = false; err(`${c}.zonas`, 'obrigatorio', 'Informe a dose de cada zona em zonas: [{ idZona, dose }].', { item: chave }); }
      else if (b.zonas.length > MAX_ZONAS_ITEM) { ok = false; err(`${c}.zonas`, 'limite-excedido', `No máximo ${MAX_ZONAS_ITEM} zonas por item (vieram ${b.zonas.length}).`, { item: chave }); }
      else {
        const repetidas: string[] = [];
        const ids = new Set<string>();
        b.zonas.forEach((z, j) => {
          if (!ehObj(z) || z.idZona == null || String(z.idZona).trim() === '') { ok = false; err(`${c}.zonas[${j}].idZona`, 'obrigatorio', 'Cada zona precisa de idZona.', { item: chave }); return; }
          const idZona = String(z.idZona).trim();
          if (!numeroFinito(z.dose) || z.dose < 0) { ok = false; err(`${c}.zonas[${j}].dose`, 'dose-invalida', `Dose da zona ${idZona} deve ser um número ≥ 0 (0 = não aplica).`, { item: chave, zonas: [idZona] }); return; }
          if (ids.has(idZona)) { repetidas.push(idZona); return; }
          ids.add(idZona);
          zonas.push({ idZona, dose: z.dose });
        });
        if (repetidas.length) { ok = false; err(`${c}.zonas`, 'zona-repetida', `Zona(s) com mais de uma dose: ${repetidas.join(', ')}.`, { item: chave, zonas: repetidas }); }
      }

      if (ok && produto) {
        itens.push({
          chave, tipo: esperado, produto, unidade, zonas,
          ...(esperado === 'sementes' && opcTexto(b.cultivar) ? { cultivar: opcTexto(b.cultivar) } : {}),
          ...(numeroFinito(espacamentoM) ? { espacamentoM } : {}),
          ...(numeroFinito(germinacaoPct) ? { germinacaoPct } : {}),
        });
      }
    });
  }
  if (Array.isArray(brutos) && !brutos.length && !remover.length && !(raw.remover != null && !Array.isArray(raw.remover))) {
    err('prescricoes', 'vazio', 'Nada a fazer: envie ao menos um item em prescricoes ou uma chave em remover.');
  }

  if (erros.length || !talhaoId || !zoneamentoId || !anoSafra || !origem) return { payload: null, erros };
  return {
    payload: {
      talhaoId, zoneamentoId, anoSafra, tempo: tempo as 'NORMAL' | 'SAFRINHA', origem, prescricoes: itens, remover,
    },
    erros,
  };
}

// ── 2ª passada: contexto (talhão, liberação, zonas) ─────────────────────────

export interface TalhaoAlvo {
  id: string;
  areaHa: number;
  empresaId: string | null;
  zoneamentoLiberadoId: string | null;
}

export interface ZoneamentoAlvo {
  id: string;
  talhaoId: string;
  nome: string;
  fc: GeoJSON.FeatureCollection;
}

/** idZona de cada polígono do zoneamento — a MESMA regra da tela de
 *  Prescrições (zonasDoZoneamento em PrescricoesSection): `properties.id`, ou
 *  `z<índice>` quando o polígono não tem id. */
export function idsDoFc(fc: GeoJSON.FeatureCollection): string[] {
  return fc.features.map((f, i) => String((f.properties as { id?: unknown } | null)?.id ?? `z${i}`));
}

/** Erros de zona de cada item contra o fc do zoneamento liberado. */
export function validarZonas(itens: ItemProgramacao[], fc: GeoJSON.FeatureCollection): ErroProgramacao[] {
  const erros: ErroProgramacao[] = [];
  const doFc = idsDoFc(fc);
  const setFc = new Set(doFc);
  itens.forEach((it, i) => {
    const enviados = new Set(it.zonas.map(z => z.idZona));
    const inexistentes = it.zonas.map(z => z.idZona).filter(id => !setFc.has(id));
    const faltando = doFc.filter(id => !enviados.has(id));
    if (inexistentes.length) erros.push({
      campo: `prescricoes[${i}].zonas`, codigo: 'zona-inexistente', item: it.chave, zonas: inexistentes,
      mensagem: `${ROTULO_CHAVE[it.chave]}: zona(s) que não existem no zoneamento liberado: ${inexistentes.join(', ')}.`,
    });
    if (faltando.length) erros.push({
      campo: `prescricoes[${i}].zonas`, codigo: 'zona-faltando', item: it.chave, zonas: faltando,
      mensagem: `${ROTULO_CHAVE[it.chave]}: zona(s) sem dose: ${faltando.join(', ')}. Toda zona do zoneamento precisa de dose (0 = não aplica).`,
    });
  });
  return erros;
}

export type Liberacao =
  | { ok: true }
  | { ok: false; motivo: 'nao-liberado' | 'trocado' | 'outro-talhao'; zoneamentoLiberadoId: string | null };

/** O zoneamento recebido é o liberado AGORA para este talhão? */
export function conferirLiberacao(p: Pick<ProgramacaoPayload, 'zoneamentoId'>, t: TalhaoAlvo, z: ZoneamentoAlvo | null): Liberacao {
  const liberado = t.zoneamentoLiberadoId || null;
  if (!liberado) return { ok: false, motivo: 'nao-liberado', zoneamentoLiberadoId: null };
  if (p.zoneamentoId !== liberado) return { ok: false, motivo: 'trocado', zoneamentoLiberadoId: liberado };
  // Espelho apontando para zoneamento que não existe/de outro talhão: trata
  // como não liberado — gravar zonas de outro talhão seria pior que recusar.
  if (!z || z.talhaoId !== t.id) return { ok: false, motivo: 'outro-talhao', zoneamentoLiberadoId: null };
  return { ok: true };
}

// ── Montagem das zonas da prescrição ────────────────────────────────────────

function areaHaDe(f: GeoJSON.Feature): number {
  const a = (f.properties as { areaHa?: unknown } | null)?.areaHa;
  if (typeof a === 'number' && a > 0) return a;
  try { return turfArea(f) / 10_000; } catch { return 0; }
}

/** ZonaDose[] do zoneamento com as doses da Lavra. Área = fatia da área do
 *  talhão (mesma régua da tela de Prescrições — ver zonasDoZoneamento). */
export function zonasDaProgramacao(fc: GeoJSON.FeatureCollection, areaTalhaoHa: number, doses: ZonaProgramada[]): ZonaDose[] {
  const porId = new Map(doses.map(d => [d.idZona, d.dose]));
  const areas = fatiarArea(fc.features.map(f => areaHaDe(f)), areaTalhaoHa);
  const ids = idsDoFc(fc);
  return fc.features.map((f, i) => {
    const p = (f.properties ?? {}) as { id?: string; zona?: string | number; classe?: string; cor?: string; potencialRank?: number };
    return {
      idZona: ids[i],
      nomeZona: p.zona != null || p.id != null ? rotuloZona(p) : String(i + 1),
      classe: String(p.classe ?? '—'),
      cor: String(p.cor ?? '#94a3b8'),
      areaHa: areas[i] ?? areaHaDe(f),
      ...(typeof p.potencialRank === 'number' ? { potencialRank: p.potencialRank } : {}),
      dose: porId.get(ids[i]) ?? 0,
    };
  });
}

// ── Idempotência e plano de gravação ────────────────────────────────────────

/**
 * Identidade de uma linha da programação: TALHÃO + cultivo + item. O talhão
 * entra porque o cultivo da Lavra pode ser revinculado a outro talhão da AP —
 * sem ele, o envio para o talhão novo continuaria (ou "removeria") a cadeia do
 * talhão antigo.
 */
export const chaveIdempotencia = (talhaoId: string, cultivoId: string, chave: ChaveProgramacao) =>
  `lavra:${talhaoId}:${cultivoId}:${chave}`;

/** FNV-1a 32 bits em base 36 — só para desambiguar ids sanitizados. */
function hashCurto(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

/** id do talhão seguro para compor id de registro: [A-Za-z0-9_.-]; se precisou
 *  trocar caractere, acrescenta um hash do original (dois ids diferentes não
 *  colapsam no mesmo texto sanitizado). */
export function parteIdTalhao(talhaoId: string): string {
  const limpo = talhaoId.replace(/[^A-Za-z0-9_.-]/g, '-');
  return limpo === talhaoId ? talhaoId : `${limpo}-${hashCurto(talhaoId)}`;
}

/**
 * Id DETERMINÍSTICO por (talhão, cultivo, item, versão). Dois envios simultâneos
 * da mesma alteração calculam o mesmo id e o upsert grava uma linha só — nunca
 * duas "v2". `cultivoId` já foi restrito a [A-Za-z0-9_.-] na validação.
 */
export const idPrescricaoLavra = (talhaoId: string, cultivoId: string, chave: ChaveProgramacao, versao: number) =>
  `lavra__${parteIdTalhao(talhaoId)}__${cultivoId}__${chave}__v${versao}`;

/** Mesma empresa? (`null`/ausente = AP de empresa única.) */
const mesmaEmpresa = (a: string | null | undefined, b: string | null | undefined) => (a ?? null) === (b ?? null);

/**
 * Recorte de escopo das prescrições existentes — defesa em profundidade sobre
 * o filtro do servidor: o que for de OUTRA empresa é descartado aqui também
 * (nunca entra em cadeia, aviso ou resposta). Separa o que é deste talhão do
 * que é do mesmo cultivo em outro talhão da mesma empresa (revínculo).
 */
export function recortarExistentes(existentes: Prescricao[], talhao: TalhaoAlvo, cultivoId: string): { doTalhao: Prescricao[]; outrosTalhoes: Prescricao[] } {
  const doTalhao: Prescricao[] = [];
  const outrosTalhoes: Prescricao[] = [];
  for (const p of existentes) {
    if (!p?.origemLavra || p.origemLavra.cultivoId !== cultivoId) continue;
    if (!mesmaEmpresa(p.empresaId, talhao.empresaId)) continue;
    (p.talhaoId === talhao.id ? doTalhao : outrosTalhoes).push(p);
  }
  return { doTalhao, outrosTalhoes };
}

export interface AvisoProgramacao {
  codigo: 'cultivo-em-outro-talhao';
  item: ChaveProgramacao;
  /** Talhão(ões) da AP onde este cultivo + item já tem prescrição. */
  talhoes: string[];
  mensagem: string;
}

export type AcaoItem = 'criada' | 'atualizada' | 'inalterada' | 'removida' | 'inexistente' | 'ignorada';

export interface ResultadoItem {
  chave: ChaveProgramacao;
  acao: AcaoItem;
  id: string | null;
  versao: number | null;
  motivo?: string;
}

export interface ContextoPlano {
  talhao: TalhaoAlvo;
  zoneamento: ZoneamentoAlvo;
  /** Prescrições já gravadas com origemLavra deste cultivo (qualquer versão).
   *  O servidor já recorta pela empresa do talhão; o plano recorta de novo
   *  (recortarExistentes) e só encadeia as DESTE talhão. */
  existentes: Prescricao[];
  agora: string;
}

/** Última versão de uma linha da programação (maior `versao`). */
function ultimaDaCadeia(existentes: Prescricao[], chave: string): Prescricao | null {
  let ult: Prescricao | null = null;
  for (const p of existentes) {
    if (p.origemLavra?.chave !== chave) continue;
    if (!ult || p.versao > ult.versao) ult = p;
  }
  return ult;
}

/** O que a Lavra controla numa prescrição — base da comparação "nada mudou". */
function assinatura(p: Pick<Prescricao, 'tipo' | 'produto' | 'unidade' | 'zoneamentoId' | 'ano' | 'zonas' | 'params'> & { tempo?: string; removida?: boolean }): string {
  const s = p.params.sementes;
  return JSON.stringify([
    p.tipo, p.produto, p.unidade, p.zoneamentoId, p.ano ?? '', p.tempo ?? '', !!p.removida,
    s?.cultivar ?? '', s?.espacamentoM ?? null, p.params.sementes ? s?.germinacaoPct ?? null : null,
    [...p.zonas].map(z => [z.idZona, z.dose]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  ]);
}

const porDaLavra = (o: OrigemProgramacao) => `Lavra${o.agronomo ? ` · ${o.agronomo}` : ''}`;

function nomeDaPrescricao(it: ItemProgramacao, p: ProgramacaoPayload): string {
  const sub = p.origem.subdivisao ? ` · ${p.origem.subdivisao}` : '';
  return `${ROTULO_CHAVE[it.chave]} — ${it.produto} (${p.anoSafra}${p.tempo === 'SAFRINHA' ? ' safrinha' : ''}${sub})`;
}

/** Mais antiga do que a que já está gravada? (reenvio fora de ordem) */
function envioAntigo(ult: Prescricao | null, p: ProgramacaoPayload): boolean {
  const gravado = ult?.origemLavra?.atualizadoEm;
  return !!gravado && Date.parse(p.origem.atualizadoEm) < Date.parse(gravado);
}

/**
 * Decide, item a item, o que gravar — sem gravar nada (é o mesmo plano que o
 * modo validar devolve). Regras:
 *  - sem versão anterior desta linha → V1 (`criada`);
 *  - com versão anterior e conteúdo diferente → versão nova ligada à V1 por
 *    `origemId` (`atualizada`) — a anterior fica salva, como em toda prescrição;
 *  - conteúdo igual ao da última versão → nada (`inalterada`): retentativa da
 *    Lavra (timeout, fila) não cria versão fantasma;
 *  - `origem.atualizadoEm` anterior ao da última versão gravada → nada
 *    (`ignorada`): envio atrasado não desfaz uma programação mais nova;
 *  - `remover` → versão nova marcada `removida` (`removida`); sem versão → `inexistente`.
 */
export function planejarGravacao(p: ProgramacaoPayload, ctx: ContextoPlano): { resultados: ResultadoItem[]; gravar: Prescricao[]; avisos: AvisoProgramacao[] } {
  const resultados: ResultadoItem[] = [];
  const gravar: Prescricao[] = [];
  const avisos: AvisoProgramacao[] = [];
  const { agora, talhao, zoneamento } = ctx;
  const por = porDaLavra(p.origem);
  const { doTalhao, outrosTalhoes } = recortarExistentes(ctx.existentes, talhao, p.origem.cultivoId);
  const chaveDe = (item: ChaveProgramacao) => chaveIdempotencia(talhao.id, p.origem.cultivoId, item);
  const idDe = (item: ChaveProgramacao, versao: number) => idPrescricaoLavra(talhao.id, p.origem.cultivoId, item, versao);

  /** Revínculo: este talhão ainda não tem a linha, mas o MESMO cultivo + item
   *  já tem prescrição em outro talhão da empresa. Não continua aquela cadeia
   *  (nem a toca) — começa uma nova aqui e avisa. */
  const avisarOutroTalhao = (item: ChaveProgramacao) => {
    const talhoes = [...new Set(outrosTalhoes.filter(x => x.origemLavra!.item === item).map(x => x.talhaoId))];
    if (!talhoes.length) return;
    avisos.push({
      codigo: 'cultivo-em-outro-talhao', item, talhoes,
      mensagem: `${ROTULO_CHAVE[item]}: o cultivo ${p.origem.cultivoId} já tem prescrição no(s) talhão(ões) ${talhoes.join(', ')} da AP. `
        + 'A programação deste talhão começa uma cadeia nova; a do outro talhão continua como está e segue salva lá até alguém retirá-la (pela AP, ou `remover` enviado para aquele talhão).',
    });
  };

  const montarOrigem = (chave: ChaveProgramacao, idRegistro: string, removida: boolean): OrigemLavra => ({
    sistema: 'lavra',
    chave: chaveDe(chave),
    item: chave,
    cultivoId: p.origem.cultivoId,
    ...(p.origem.planoId ? { planoId: p.origem.planoId } : {}),
    ...(p.origem.subdivisao ? { subdivisao: p.origem.subdivisao } : {}),
    ...(p.origem.agronomo ? { agronomo: p.origem.agronomo } : {}),
    anoSafra: p.anoSafra,
    tempo: p.tempo,
    atualizadoEm: p.origem.atualizadoEm,
    recebidoEm: agora,
    idRegistro,
    ...(removida ? { removida: true } : {}),
  });

  const ligarCadeia = (ult: Prescricao | null) => (ult ? { origemId: ult.origemId ?? ult.id } : {});

  for (const it of p.prescricoes) {
    const chave = chaveDe(it.chave);
    const ult = ultimaDaCadeia(doTalhao, chave);
    if (!ult) avisarOutroTalhao(it.chave);
    if (envioAntigo(ult, p)) {
      resultados.push({ chave: it.chave, acao: 'ignorada', id: ult!.id, versao: ult!.versao, motivo: `origem.atualizadoEm é anterior ao da versão já gravada (${ult!.origemLavra!.atualizadoEm}).` });
      continue;
    }

    const params: ParamsCalculo = it.tipo === 'sementes' && (it.cultivar || it.espacamentoM != null || it.germinacaoPct != null)
      ? { sementes: {
          // A dose da Lavra é a TAXA DE SEMEADURA (o que a máquina aplica);
          // germinação só entra nas métricas informativas. Sem ela, 100% —
          // não inventar perda que ninguém informou.
          germinacaoPct: it.germinacaoPct ?? 100,
          ...(it.cultivar ? { cultivar: it.cultivar } : {}),
          ...(it.espacamentoM != null ? { espacamentoM: it.espacamentoM } : {}),
        } }
      : {};
    const zonas = zonasDaProgramacao(zoneamento.fc, talhao.areaHa, it.zonas);
    const tipo: TipoPrescricao = it.tipo;

    const nova = { tipo, produto: it.produto, unidade: it.unidade, zoneamentoId: zoneamento.id, ano: p.anoSafra, zonas, params, tempo: p.tempo };
    if (ult && !ult.origemLavra?.removida && assinatura({ ...ult, tempo: ult.origemLavra?.tempo }) === assinatura(nova)) {
      resultados.push({ chave: it.chave, acao: 'inalterada', id: ult.id, versao: ult.versao });
      continue;
    }

    const versao = ult ? ult.versao + 1 : 1;
    const id = idDe(it.chave, versao);
    const resumo = ult ? 'reenviada pela Lavra (substitui a versão anterior)' : 'programada na Lavra';
    gravar.push({
      id,
      talhaoId: talhao.id,
      ano: p.anoSafra,
      nome: nomeDaPrescricao(it, p),
      tipo,
      produto: it.produto,
      unidade: it.unidade,
      zoneamentoId: zoneamento.id,
      zoneamentoNome: zoneamento.nome,
      modo: 'manual',
      params,
      zonas,
      fc: zoneamento.fc,
      versao,
      ...ligarCadeia(ult),
      criadoEm: agora,
      criadoPor: por,
      atualizadoEm: agora,
      historico: [...(ult?.historico ?? []), { em: agora, por, resumo }],
      exportes: [],
      ...(talhao.empresaId ? { empresaId: talhao.empresaId } : {}),
      origemLavra: montarOrigem(it.chave, id, false),
    });
    resultados.push({ chave: it.chave, acao: ult ? 'atualizada' : 'criada', id, versao });
  }

  for (const item of p.remover) {
    const chave = chaveDe(item);
    const ult = ultimaDaCadeia(doTalhao, chave);
    if (!ult) { avisarOutroTalhao(item); resultados.push({ chave: item, acao: 'inexistente', id: null, versao: null }); continue; }
    if (envioAntigo(ult, p)) {
      resultados.push({ chave: item, acao: 'ignorada', id: ult.id, versao: ult.versao, motivo: `origem.atualizadoEm é anterior ao da versão já gravada (${ult.origemLavra!.atualizadoEm}).` });
      continue;
    }
    if (ult.origemLavra?.removida) { resultados.push({ chave: item, acao: 'inalterada', id: ult.id, versao: ult.versao }); continue; }
    const versao = ult.versao + 1;
    const id = idDe(item, versao);
    gravar.push({
      ...ult,
      id, versao, ...ligarCadeia(ult),
      // Escopo vem do talhão do envio, nunca da versão herdada (ult já é
      // deste talhão — recortarExistentes —, mas não custa fechar a porta).
      talhaoId: talhao.id, empresaId: talhao.empresaId ?? undefined,
      criadoEm: agora, criadoPor: por, atualizadoEm: agora,
      historico: [...ult.historico, { em: agora, por, resumo: 'removida da programação na Lavra' }],
      exportes: [],
      origemLavra: { ...montarOrigem(item, id, true), anoSafra: ult.origemLavra?.anoSafra ?? p.anoSafra, tempo: ult.origemLavra?.tempo ?? p.tempo },
    });
    resultados.push({ chave: item, acao: 'removida', id, versao });
  }

  return { resultados, gravar, avisos };
}
