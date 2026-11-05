// Benchmark anônimo do Portal do Produtor — lado SERVIDOR (I/O).
//
// Roda com a SERVICE ROLE (passa por cima da RLS): é o único lugar que lê os
// dados de TODOS os produtores, e o que sai daqui é só o agregado montado por
// benchmarkCalc.ts (montarResposta). O app_kv tem SELECT amplo para usuário
// autenticado ativo — por isso o benchmark NUNCA é calculado no navegador.
//
// Quem pede (contrato .workflow/scratch/contrato-benchmark.md):
//   · produtor → o cliente vem do PRÓPRIO registro (clienteIdDoProdutor, a mesma
//     regra do portal); `clienteId` do corpo é ignorado;
//   · owner/admin → podem passar `clienteId` (preview "ver como o produtor");
//   · qualquer outro papel, status que não entra ou sem sessão → 401/403.
// Só LEITURA: nada é gravado.

import type { SupabaseClient } from '@supabase/supabase-js';
import { clienteServico, servicoConfigurado } from '../laudo/servidor.ts';
import { registroDoLeitor } from '../precisionfarm/servidor.ts';
import { podeEntrar } from '../iam/acessoEfetivo.ts';
import { clienteIdDoProdutor } from '../iam/vinculoProdutor.ts';
import { anoDaSafra, anoDeData, hojeSaoPauloISO } from '../periodo.ts';
import { anoDoRegistro } from '../portalProdutor.ts';
import type { RegistroAcesso } from '../precisionfarm/acessoTalhao.ts';
import type { FazendaEscopo } from '../iam/escopoFazendas.ts';
import {
  JANELA_ANOS_FERTILIDADE, montarBase, montarResposta, anoBenchmarkValido, talhoesDoEscopo,
  type BaseBenchmark, type LaudoIn, type LocalCliente, type MapaColheitaIn, type TalhaoIn, type VoceBenchmark,
} from './benchmarkCalc.ts';

const COL_PRODUTIVIDADE = 'inv_produtividade';
const COL_LAB = 'inv_lab';
const COL_FAZENDAS = 'inv_fazendas';
const COL_CLIENTES = 'inv_clientes';

/** A base (valores por cliente) de um ano fica em memória por 10 min: a página
 *  abre várias vezes e ler os laudos de todos é caro. Também atenua o ataque
 *  por diferença no tempo (ver o topo de benchmarkCalc.ts). Nunca sai daqui. */
const TTL_MS = 10 * 60 * 1000;
/** Teto do cache (LRU): cada base é grande; poucos anos são pedidos de fato. */
const MAX_ANOS_CACHE = 4;
/** Base PRONTA por ano, na ordem de uso (Map = ordem de inserção; o fim é o mais recente). */
const cache = new Map<number, { em: number; base: BaseBenchmark }>();
/** Carga EM ANDAMENTO por ano: pedidos simultâneos do mesmo ano esperam a mesma. */
const carregando = new Map<number, Promise<BaseBenchmark>>();

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// ── Autorização ─────────────────────────────────────────────────────────────

export type Autorizacao =
  /** `reg` só para o produtor: o "você" dele é o ESCOPO (talhoesDoEscopo). */
  | { ok: true; clienteId: string | null; reg?: RegistroAcesso }
  | { ok: false; status: 401 | 403; motivo: 'sem-sessao' | 'proibido'; erro: string };

/** Quem é o "você" do benchmark (ver regras no topo). */
export async function autorizarBenchmark(sb: SupabaseClient, auth: string | null, clienteIdPedido: unknown): Promise<Autorizacao> {
  const r = await registroDoLeitor(sb, auth);
  if (!r.ok) return { ok: false, status: r.status, motivo: r.status === 401 ? 'sem-sessao' : 'proibido', erro: r.erro };
  const reg = r.reg;
  if (!podeEntrar(reg.status)) return { ok: false, status: 403, motivo: 'proibido', erro: 'Seu acesso não está ativo.' };
  if (reg.papel === 'produtor') {
    const id = clienteIdDoProdutor(reg);
    if (!id) return { ok: false, status: 403, motivo: 'proibido', erro: 'Acesso ainda não vinculado a um produtor.' };
    return { ok: true, clienteId: id, reg };
  }
  if (reg.papel === 'owner' || reg.papel === 'admin') {
    const id = typeof clienteIdPedido === 'string' && clienteIdPedido.length > 0 && clienteIdPedido.length <= 128 ? clienteIdPedido : null;
    return { ok: true, clienteId: id };
  }
  return { ok: false, status: 403, motivo: 'proibido', erro: 'O comparativo é do Portal do Produtor.' };
}

// ── Leitura ─────────────────────────────────────────────────────────────────

const fatias = <T>(xs: readonly T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, k) => xs.slice(k * n, k * n + n));
const numOuNull = (v: unknown): number | null => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) ? n : null; };
const txt = (v: unknown): string => (v == null ? '' : String(v));

/** Todas as linhas de uma coleção do app_kv com a projeção pedida. Paginado: o
 *  max_rows do PostgREST (1000) cortaria a lista em silêncio. */
async function lerColecao<T>(sb: SupabaseClient, colecao: string, colunas: string): Promise<T[]> {
  const todos: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from('app_kv').select(colunas).eq('colecao', colecao).order('item_id').range(de, de + 999);
    if (error) throw new Error(`Falha ao ler ${colecao}: ${error.message}`);
    todos.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) return todos;
  }
}

async function lerMapasColheita(sb: SupabaseClient, ano: number): Promise<MapaColheitaIn[]> {
  type Linha = { talhaoId: string | null; cultura: string | null; oficial: unknown; criadoEm: string | null; ano: unknown; safra: string | null; dataReferencia: string | null; media: unknown; area: unknown };
  const linhas = await lerColecao<Linha>(sb, COL_PRODUTIVIDADE,
    'talhaoId:dados->>talhaoId, cultura:dados->>cultura, oficial:dados->oficial, criadoEm:dados->>criadoEm, '
    + 'ano:dados->>ano, safra:dados->>safra, dataReferencia:dados->>dataReferencia, '
    + 'media:dados->stats->>mediaKgha, area:dados->stats->>areaHa');
  return linhas
    .map((l): MapaColheitaIn => ({
      talhaoId: txt(l.talhaoId), cultura: l.cultura, oficial: l.oficial === true || l.oficial === 'true',
      criadoEm: l.criadoEm, ano: numOuNull(l.ano), safra: l.safra, dataReferencia: l.dataReferencia,
      mediaKgha: numOuNull(l.media), areaHa: numOuNull(l.area),
    }))
    .filter(m => m.talhaoId && anoDoRegistro(m) === ano);
}

/** Cabeçalhos dos laudos da janela; os RESULTADOS (pesados) só dos laudos que
 *  entram na conta, em fatias. */
async function lerLaudos(sb: SupabaseClient, ano: number): Promise<LaudoIn[]> {
  type Cab = { item_id: string; talhaoId: string | null; ano: unknown; safra: string | null; dataReferencia: string | null };
  const cabs = (await lerColecao<Cab>(sb, COL_LAB, 'item_id, talhaoId:dados->>talhaoId, ano:dados->>ano, safra:dados->>safra, dataReferencia:dados->>dataReferencia'))
    .map((c): LaudoIn => ({ id: txt(c.item_id), talhaoId: txt(c.talhaoId), ano: numOuNull(c.ano), safra: c.safra, dataReferencia: c.dataReferencia }))
    .filter(l => { const a = anoDoRegistro(l); return !!l.talhaoId && a != null && a <= ano && a > ano - JANELA_ANOS_FERTILIDADE; });
  // Só o ano mais recente de cada talhão entra (laudosDaJanela) — pede só esses.
  const maisRecente = new Map<string, number>();
  for (const l of cabs) { const a = anoDoRegistro(l)!; if ((maisRecente.get(l.talhaoId) ?? -Infinity) < a) maisRecente.set(l.talhaoId, a); }
  const usados = cabs.filter(l => anoDoRegistro(l) === maisRecente.get(l.talhaoId));
  const porId = new Map(usados.map(l => [l.id, l]));
  const lotes = fatias([...porId.keys()], 25);
  // 4 consultas por vez: em série estouraria o tempo; todas juntas, a memória.
  for (let k = 0; k < lotes.length; k += 4) {
    await Promise.all(lotes.slice(k, k + 4).map(async ids => {
      const { data, error } = await sb.from('app_kv').select('item_id, resultados:dados->resultados').eq('colecao', COL_LAB).in('item_id', ids);
      if (error) throw new Error(`Falha ao ler os laudos: ${error.message}`);
      for (const r of (data ?? []) as { item_id: string; resultados: unknown }[]) {
        const l = porId.get(String(r.item_id));
        if (l && Array.isArray(r.resultados)) l.resultados = r.resultados as LaudoIn['resultados'];
      }
    }));
  }
  return usados;
}

/** talhão → fazenda → cliente, com a área do talhão (só o cabeçalho: o `dados`
 *  inteiro traz o geojson, pesado). */
async function resolverTalhoes(sb: SupabaseClient, talhaoIds: string[]): Promise<{ talhoes: TalhaoIn[]; fazendaCliente: Map<string, string>; fazendas: Map<string, { clienteId: string; municipio: string; estado: string }> }> {
  const brutos: Array<{ id: string; fazendaId: string; areaHa: number | null }> = [];
  for (const ids of fatias([...new Set(talhaoIds)], 150)) {
    const { data, error } = await sb.from('talhoes').select('id, fazenda_id, area_ha, dFazenda:dados->>fazendaId, dArea:dados->>areaHa').in('id', ids);
    if (error) throw new Error(`Falha ao ler os talhões: ${error.message}`);
    for (const r of (data ?? []) as { id: string; fazenda_id: string | null; area_ha: unknown; dFazenda: string | null; dArea: unknown }[]) {
      brutos.push({ id: String(r.id), fazendaId: txt(r.fazenda_id ?? r.dFazenda), areaHa: numOuNull(r.area_ha) ?? numOuNull(r.dArea) });
    }
  }
  const fazendas = new Map<string, { clienteId: string; municipio: string; estado: string }>();
  for (const ids of fatias([...new Set(brutos.map(b => b.fazendaId).filter(Boolean))], 150)) {
    const { data, error } = await sb.from('app_kv')
      .select('item_id, clienteId:dados->>clienteId, municipio:dados->>municipio, estado:dados->>estado')
      .eq('colecao', COL_FAZENDAS).in('item_id', ids);
    if (error) throw new Error(`Falha ao ler as fazendas: ${error.message}`);
    for (const f of (data ?? []) as { item_id: string; clienteId: string | null; municipio: string | null; estado: string | null }[]) {
      if (f.clienteId) fazendas.set(String(f.item_id), { clienteId: f.clienteId, municipio: txt(f.municipio), estado: txt(f.estado) });
    }
  }
  const fazendaCliente = new Map([...fazendas].map(([id, f]) => [id, f.clienteId]));
  const talhoes = brutos
    .filter(b => fazendaCliente.has(b.fazendaId))
    .map(b => ({ id: b.id, clienteId: fazendaCliente.get(b.fazendaId)!, areaHa: b.areaHa, fazendaId: b.fazendaId }));
  return { talhoes, fazendaCliente, fazendas };
}

/** Localização de cada cliente: a do cadastro do cliente; vazia → a da fazenda
 *  dele (a primeira com município, por id). */
async function locaisDosClientes(
  sb: SupabaseClient, clienteIds: string[], fazendas: Map<string, { clienteId: string; municipio: string; estado: string }>,
): Promise<Map<string, LocalCliente>> {
  const out = new Map<string, LocalCliente>();
  for (const ids of fatias([...new Set(clienteIds)], 150)) {
    const { data, error } = await sb.from('app_kv').select('item_id, cidade:dados->>cidade, estado:dados->>estado').eq('colecao', COL_CLIENTES).in('item_id', ids);
    if (error) throw new Error(`Falha ao ler os clientes: ${error.message}`);
    for (const c of (data ?? []) as { item_id: string; cidade: string | null; estado: string | null }[]) {
      if (txt(c.cidade).trim() || txt(c.estado).trim()) out.set(String(c.item_id), { cidade: txt(c.cidade), uf: txt(c.estado) });
    }
  }
  const fz = [...fazendas].sort(([a], [b]) => a.localeCompare(b));
  for (const id of clienteIds) {
    if (out.has(id)) continue;
    const f = fz.find(([, x]) => x.clienteId === id && x.municipio.trim());
    if (f) out.set(id, { cidade: f[1].municipio, uf: f[1].estado });
  }
  return out;
}

async function lerBase(sb: SupabaseClient, ano: number, clienteExtra: string | null): Promise<BaseBenchmark> {
  const [mapas, laudos] = await Promise.all([lerMapasColheita(sb, ano), lerLaudos(sb, ano)]);
  const { talhoes, fazendas } = await resolverTalhoes(sb, [...mapas.map(m => m.talhaoId), ...laudos.map(l => l.talhaoId)]);
  const clientes = [...new Set([...talhoes.map(t => t.clienteId), ...(clienteExtra ? [clienteExtra] : [])])];
  const locais = await locaisDosClientes(sb, clientes, fazendas);
  return montarBase({ ano, mapas, laudos, talhoes, locais });
}

/** Base do ano, do cache quando fresca. O cliente que pede pode não ter dado
 *  nenhum (e então não estaria nos `locais`): a localização dele é lida à parte. */
async function baseCacheada(sb: SupabaseClient, ano: number): Promise<BaseBenchmark> {
  const c = cache.get(ano);
  if (c && Date.now() - c.em <= TTL_MS) {
    cache.delete(ano); cache.set(ano, c);   // LRU: vai para o fim (mais recente)
    return c.base;
  }
  let p = carregando.get(ano);
  if (!p) {
    p = lerBase(sb, ano, null)
      .then(base => {
        cache.delete(ano);
        cache.set(ano, { em: Date.now(), base });
        while (cache.size > MAX_ANOS_CACHE) cache.delete(cache.keys().next().value as number);
        return base;
      })
      .finally(() => carregando.delete(ano));   // falha não fica presa: o próximo pedido tenta de novo
    carregando.set(ano, p);
  }
  return p;
}

async function baseDoAno(sb: SupabaseClient, ano: number, clienteId: string | null): Promise<BaseBenchmark> {
  const base = await baseCacheada(sb, ano);
  if (!clienteId || base.locais.has(clienteId)) return base;
  const extra = await locaisDosClientes(sb, [clienteId], new Map());
  return extra.size ? { ...base, locais: new Map([...base.locais, ...extra]) } : base;
}

/** As fazendas de `reg.fazendasVinculadas` com o cliente de cada uma (regra 2
 *  de escopoFazendas). As que já estão na base (têm talhão com dado) não são relidas. */
async function fazendasMarcadas(sb: SupabaseClient, reg: RegistroAcesso, base: BaseBenchmark): Promise<FazendaEscopo[]> {
  const ids = (Array.isArray(reg.fazendasVinculadas) ? reg.fazendasVinculadas : []).filter((x): x is string => typeof x === 'string' && !!x);
  if (!ids.length) return [];
  const naBase = new Map<string, string>();
  for (const t of base.talhoes.values()) if (t.fazendaId) naBase.set(t.fazendaId, t.clienteId);
  const out: FazendaEscopo[] = ids.filter(id => naBase.has(id)).map(id => ({ id, clienteId: naBase.get(id)! }));
  const faltam = [...new Set(ids.filter(id => !naBase.has(id)))];
  for (const lote of fatias(faltam, 150)) {
    const { data, error } = await sb.from('app_kv').select('item_id, clienteId:dados->>clienteId').eq('colecao', COL_FAZENDAS).in('item_id', lote);
    if (error) throw new Error(`Falha ao ler as fazendas do escopo: ${error.message}`);
    for (const f of (data ?? []) as { item_id: string; clienteId: string | null }[]) out.push({ id: String(f.item_id), clienteId: txt(f.clienteId) });
  }
  return out;
}

// ── Rota ────────────────────────────────────────────────────────────────────

/** POST /api/portal/benchmark { safra, clienteId? } — ver contrato. */
export async function tratarBenchmark(req: Request): Promise<Response> {
  if (!servicoConfigurado()) return json({ ok: false, motivo: 'indisponivel' }, 200);
  let corpo: unknown;
  try { corpo = await req.json(); } catch { return json({ ok: false, motivo: 'invalido', erro: 'Corpo inválido.' }, 400); }
  const { safra, clienteId } = (corpo ?? {}) as { safra?: unknown; clienteId?: unknown };
  const ano = typeof safra === 'string' && safra.length <= 20 ? anoDaSafra(safra) : null;
  if (typeof safra !== 'string' || ano == null) return json({ ok: false, motivo: 'invalido', erro: 'Informe a safra.' }, 400);
  const anoAtual = anoDeData(hojeSaoPauloISO()) ?? new Date().getFullYear();
  if (!anoBenchmarkValido(ano, anoAtual)) return json({ ok: false, motivo: 'invalido', erro: 'Safra fora do intervalo aceito.' }, 400);
  const sb = clienteServico();
  try {
    const a = await autorizarBenchmark(sb, req.headers.get('authorization'), clienteId);
    if (!a.ok) return json({ ok: false, motivo: a.motivo, erro: a.erro }, a.status);
    const base = await baseDoAno(sb, ano, a.clienteId);
    const voce: VoceBenchmark = a.reg
      ? { clienteId: a.clienteId, talhoes: talhoesDoEscopo(a.reg, base, await fazendasMarcadas(sb, a.reg, base)) }
      : { clienteId: a.clienteId };
    return json(montarResposta(base, voce, safra), 200);
  } catch (e) {
    console.error('[portal] benchmark:', e instanceof Error ? e.message : e);
    return json({ ok: false, motivo: 'erro', erro: 'Falha interna ao montar o comparativo.' }, 500);
  }
}
