// Integração PrecisionFarm — lado SERVIDOR: autenticação (chave da PF e sessão
// do usuário), leitura do talhão/zoneamento/colheita na nuvem e gravação nas
// tabelas próprias da integração (docs/integracao-precisionfarm.sql).
//
// Roda com a SERVICE ROLE (passa por cima da RLS): todo recorte de escopo é
// feito AQUI e em rota.ts, explicitamente. app_kv e talhoes são só LIDOS — o
// app é local-first e o servidor nunca reescreve um registro do navegador.
// Nada que decide FORMATO do contrato vive aqui; isso é do núcleo (contrato.ts).

import type { SupabaseClient } from '@supabase/supabase-js';
import { gunzipSync } from 'node:zlib';
import { chaveDoHeader, hashChave } from '../laudo/servidor.ts';
import { padraoVigente } from '../meap/versoes.ts';
import type { Envelope, Evento, GradeColheita, StatusVinculo, TipoRecurso } from './contrato.ts';
import { ehPapelGestor, ehPapelSemEscopo, podeVerTalhao, type RegistroAcesso } from './acessoTalhao.ts';
import type { FazendaEscopo } from '../iam/escopoFazendas.ts';

export { servicoConfigurado, clienteServico } from '../laudo/servidor.ts';

const COL_ZONEAMENTOS = 'inv_meap_zoneamentos';
const COL_PRODUTIVIDADE = 'inv_produtividade';
const COL_MAPAS = 'inv_mapas_fert';
const COL_FAZENDAS = 'inv_fazendas';
const COL_PAPEIS = 'inv_papeis';

// ── Autenticação da PrecisionFarm (Bearer da integração) ─────────────────────

export interface ChavePrecisionFarm { chaveId: string; nome: string; parceria: string; empresaId: string | null }

/** Mesma tabela da Lavra (integracao_chaves, só o SHA-256), sistema
 *  'precisionfarm'. Chave da Lavra não abre a PF e vice-versa. */
export async function autenticarPrecisionFarm(sb: SupabaseClient, auth: string | null): Promise<ChavePrecisionFarm | null> {
  const chave = chaveDoHeader(auth);
  if (!chave) return null;
  const { data, error } = await sb
    .from('integracao_chaves')
    .select('id, nome, empresa_id, parceria')
    .eq('hash', hashChave(chave))
    .eq('sistema', 'precisionfarm')
    .is('revogada_em', null)
    .limit(1);
  // Falha de BANCO não é "chave inválida": sobe e vira 500, para uma pane não
  // se disfarçar de 401 do lado da PF.
  if (error) throw new Error(`Falha ao conferir a chave: ${error.message}`);
  if (!data?.length) return null;
  const r = data[0];
  // Chave da PF sem parceria não alcança vínculo nenhum: trata como inválida.
  if (!r.parceria) return null;
  // Best-effort e AGUARDADO (builder preguiçoso; promessa solta morre com a
  // função serverless). Falhar aqui não derruba a leitura.
  try { await sb.from('integracao_chaves').update({ ultimo_uso_em: new Date().toISOString() }).eq('id', r.id); } catch { /* best-effort */ }
  return {
    chaveId: String(r.id), nome: String(r.nome ?? ''), parceria: String(r.parceria),
    empresaId: r.empresa_id == null ? null : String(r.empresa_id),
  };
}

// ── Autenticação do usuário (vínculo e publicação) ───────────────────────────

export type UsuarioAutenticado =
  | { ok: true; email: string; papel: 'owner' | 'admin' }
  | { ok: false; status: 401 | 403; erro: string };

/**
 * Sessão do usuário: o navegador manda o access_token do Supabase em
 * `Authorization: Bearer`. O servidor valida o token no próprio Supabase Auth
 * (auth.getUser — confere assinatura e expiração), pega o e-mail e exige papel
 * owner/admin em inv_papeis — a MESMA regra de `inv_eh_admin()` da RLS
 * (docs/seguranca-rls.sql). Esconder a seção na tela não é proteção; isto é.
 */
export async function autenticarUsuario(sb: SupabaseClient, auth: string | null): Promise<UsuarioAutenticado> {
  const token = chaveDoHeader(auth);
  if (!token) return { ok: false, status: 401, erro: 'Sessão ausente. Entre de novo na plataforma.' };
  const { data, error } = await sb.auth.getUser(token);
  const email = data?.user?.email?.trim().toLowerCase();
  if (error || !email) return { ok: false, status: 401, erro: 'Sessão expirada ou inválida. Saia e entre de novo.' };
  const { data: regs, error: e2 } = await sb
    .from('app_kv').select('dados')
    .eq('colecao', COL_PAPEIS)
    // ilike = lower() da RLS; curingas do LIKE escapados (o e-mail pode ter "_").
    .ilike('dados->>email', email.replace(/[\\%_]/g, c => '\\' + c))
    .limit(5);
  if (e2) return { ok: false, status: 403, erro: 'Não foi possível conferir o seu papel.' };
  const papel = (regs ?? [])
    .map(r => (r as { dados?: { email?: string; papel?: string } }).dados)
    .find(d => String(d?.email ?? '').trim().toLowerCase() === email)?.papel;
  if (papel !== 'owner' && papel !== 'admin') {
    return { ok: false, status: 403, erro: 'Só owner e admin usam a integração com a PrecisionFarm.' };
  }
  return { ok: true, email, papel };
}

// ── Autenticação de LEITURA (aba Linhas: todos com acesso ao talhão, Q4) ─────

export type LeitorAutenticado =
  | { ok: true; email: string; papel: string; gestor: boolean }
  | { ok: false; status: 401 | 403 | 404; erro: string };

/**
 * Sessão + "este usuário vê este talhão?". Mesma regra do app (getTalhoes):
 * papel e vínculos do registro em inv_papeis, status que entra, escopo de
 * cliente/fazenda/talhão (acessoTalhao.ts → podeVerTalhao). Owner/admin/editor
 * veem todos. Linha de papel PRODUTOR do e-mail vale primeiro (falha fechada,
 * como inv_eh_produtor da RLS); entre as do mesmo papel, a canônica
 * (item_id = e-mail) e depois a mais recente.
 */
export async function autenticarLeitor(sb: SupabaseClient, auth: string | null, talhaoId: string): Promise<LeitorAutenticado> {
  const token = chaveDoHeader(auth);
  if (!token) return { ok: false, status: 401, erro: 'Sessão ausente. Entre de novo na plataforma.' };
  const { data, error } = await sb.auth.getUser(token);
  const email = data?.user?.email?.trim().toLowerCase();
  if (error || !email) return { ok: false, status: 401, erro: 'Sessão expirada ou inválida. Saia e entre de novo.' };
  const { data: regs, error: e2 } = await sb
    .from('app_kv').select('item_id, dados, atualizado_em')
    .eq('colecao', COL_PAPEIS)
    .ilike('dados->>email', email.replace(/[\\%_]/g, c => '\\' + c))
    .limit(20);
  if (e2) return { ok: false, status: 403, erro: 'Não foi possível conferir o seu acesso.' };
  type Linha = { item_id: string; dados: RegistroAcesso & { email?: string }; atualizado_em: string | null };
  const linhas = ((regs ?? []) as Linha[]).filter(r => String(r.dados?.email ?? '').trim().toLowerCase() === email);
  const temProdutor = linhas.some(r => r.dados?.papel === 'produtor');
  const candidatas = (temProdutor ? linhas.filter(r => r.dados?.papel === 'produtor') : linhas)
    .sort((a, b) => Number(b.item_id === email) - Number(a.item_id === email) || String(b.atualizado_em ?? '').localeCompare(String(a.atualizado_em ?? '')));
  const reg = candidatas[0]?.dados ?? null;
  if (!reg?.papel) return { ok: false, status: 403, erro: 'Seu usuário não tem papel na plataforma.' };
  const gestor = ehPapelGestor(reg.papel);
  if (ehPapelSemEscopo(reg.papel)) {
    return podeVerTalhao(reg, { id: talhaoId, fazendaId: null }, [])
      ? { ok: true, email, papel: reg.papel, gestor }
      : { ok: false, status: 403, erro: 'Seu acesso não está ativo.' };
  }
  const t = await carregarTalhao(sb, talhaoId);
  if (!t) return { ok: false, status: 404, erro: 'Talhão não encontrado na nuvem.' };
  const ids = [...new Set([t.fazendaId, ...(Array.isArray(reg.fazendasVinculadas) ? reg.fazendasVinculadas : [])].filter((x): x is string => typeof x === 'string' && !!x))];
  let fazendas: FazendaEscopo[] = [];
  if (ids.length) {
    const { data: fz, error: e3 } = await sb.from('app_kv').select('item_id, clienteId:dados->>clienteId').eq('colecao', COL_FAZENDAS).in('item_id', ids);
    if (e3) return { ok: false, status: 403, erro: 'Não foi possível conferir o seu acesso.' };
    fazendas = ((fz ?? []) as { item_id: string; clienteId: string | null }[]).map(f => ({ id: String(f.item_id), clienteId: String(f.clienteId ?? '') }));
  }
  if (!podeVerTalhao(reg, { id: t.id, fazendaId: t.fazendaId }, fazendas)) {
    return { ok: false, status: 403, erro: 'Você não tem acesso a este talhão.' };
  }
  return { ok: true, email, papel: reg.papel, gestor };
}

// ── Leitura do cadastro (nuvem) ──────────────────────────────────────────────

export interface TalhaoNuvem {
  id: string; nome: string; empresaId: string | null; fazendaId: string | null; geoVersao: number;
}

export async function carregarTalhao(sb: SupabaseClient, id: string): Promise<TalhaoNuvem | null> {
  const { data, error } = await sb.from('talhoes').select('id, nome, empresa_id, dados').eq('id', id).limit(1);
  if (error || !data?.length) return null;
  const r = data[0] as { id: string; nome: string | null; empresa_id: string | null; dados: { nome?: string; fazendaId?: string; empresaId?: string; geoVersao?: number } | null };
  return {
    id: String(r.id),
    nome: String(r.nome ?? r.dados?.nome ?? ''),
    empresaId: r.empresa_id ?? r.dados?.empresaId ?? null,
    fazendaId: r.dados?.fazendaId ?? null,
    geoVersao: Number(r.dados?.geoVersao ?? 1) || 1,
  };
}

export async function carregarTalhoes(sb: SupabaseClient, ids: string[]): Promise<Map<string, TalhaoNuvem>> {
  const m = new Map<string, TalhaoNuvem>();
  if (!ids.length) return m;
  const { data, error } = await sb.from('talhoes').select('id, nome, empresa_id, dados').in('id', ids);
  if (error) throw new Error(`Falha ao ler os talhões: ${error.message}`);
  for (const r of (data ?? []) as { id: string; nome: string | null; empresa_id: string | null; dados: { nome?: string; fazendaId?: string; empresaId?: string; geoVersao?: number } | null }[]) {
    m.set(String(r.id), {
      id: String(r.id), nome: String(r.nome ?? r.dados?.nome ?? ''), empresaId: r.empresa_id ?? r.dados?.empresaId ?? null,
      fazendaId: r.dados?.fazendaId ?? null, geoVersao: Number(r.dados?.geoVersao ?? 1) || 1,
    });
  }
  return m;
}

export async function clienteDaFazenda(sb: SupabaseClient, fazendaId: string | null): Promise<string | null> {
  if (!fazendaId) return null;
  const { data } = await sb.from('app_kv').select('dados').eq('colecao', COL_FAZENDAS).eq('item_id', fazendaId).limit(1);
  const d = (data?.[0] as { dados?: { clienteId?: string } } | undefined)?.dados;
  return d?.clienteId ?? null;
}

// ── Vínculos ─────────────────────────────────────────────────────────────────

export interface VinculoRow {
  id: string;
  parceria: string;
  empresa_id: string | null;
  talhao_id: string;
  fazenda_id: string | null;
  cliente_id: string | null;
  shared_producer_id: string;
  shared_farm_id: string;
  shared_field_id: string;
  pf_local_id: string | null;
  status: StatusVinculo;
  criado_por: string | null;
  criado_em: string;
  confirmado_por: string | null;
  confirmado_em: string | null;
  suspenso_por: string | null;
  suspenso_em: string | null;
  atualizado_em: string;
}

const COLS_VINCULO = 'id, parceria, empresa_id, talhao_id, fazenda_id, cliente_id, shared_producer_id, shared_farm_id, shared_field_id, pf_local_id, status, criado_por, criado_em, confirmado_por, confirmado_em, suspenso_por, suspenso_em, atualizado_em';

/** Erro de corrida conhecido (unique violado) — a rota responde 409, não 500. */
export class ConflitoIntegracao extends Error {}

export async function vinculoDoTalhao(sb: SupabaseClient, talhaoId: string, parceria: string): Promise<VinculoRow | null> {
  const { data, error } = await sb.from('pf_vinculos').select(COLS_VINCULO).eq('parceria', parceria).eq('talhao_id', talhaoId).limit(1);
  if (error) throw new Error(`Falha ao ler o vínculo: ${error.message}`);
  return (data?.[0] as VinculoRow | undefined) ?? null;
}

export async function vinculoDoCampo(sb: SupabaseClient, sharedFieldId: string): Promise<VinculoRow | null> {
  const { data, error } = await sb.from('pf_vinculos').select(COLS_VINCULO).eq('shared_field_id', sharedFieldId).limit(1);
  if (error) throw new Error(`Falha ao ler o vínculo: ${error.message}`);
  return (data?.[0] as VinculoRow | undefined) ?? null;
}

export async function vinculoPorId(sb: SupabaseClient, id: string): Promise<VinculoRow | null> {
  const { data, error } = await sb.from('pf_vinculos').select(COLS_VINCULO).eq('id', id).limit(1);
  if (error) throw new Error(`Falha ao ler o vínculo: ${error.message}`);
  return (data?.[0] as VinculoRow | undefined) ?? null;
}

/** Vínculos da parceria do mesmo cliente OU da mesma fazenda — para
 *  reaproveitar UUIDs. Ordem estável (mais antigo primeiro): o reuso é
 *  determinístico. */
export async function vinculosParaReuso(sb: SupabaseClient, parceria: string, clienteId: string | null, fazendaId: string | null): Promise<VinculoRow[]> {
  const q = (v: string) => `"${v.replace(/["\\]/g, '')}"`;   // valor entre aspas no filtro or() do PostgREST
  const filtros = [clienteId ? `cliente_id.eq.${q(clienteId)}` : null, fazendaId ? `fazenda_id.eq.${q(fazendaId)}` : null].filter(Boolean);
  if (!filtros.length) return [];
  const { data, error } = await sb.from('pf_vinculos').select(COLS_VINCULO)
    .eq('parceria', parceria).or(filtros.join(','))
    .order('criado_em', { ascending: true }).order('id', { ascending: true });
  if (error) throw new Error(`Falha ao ler os vínculos: ${error.message}`);
  return (data ?? []) as VinculoRow[];
}

/** Confirmados da parceria (o filtro fino de empresa é do núcleo: vinculosNoEscopo). */
export async function vinculosConfirmados(sb: SupabaseClient, parceria: string): Promise<VinculoRow[]> {
  const { data, error } = await sb.from('pf_vinculos').select(COLS_VINCULO)
    .eq('status', 'confirmado').eq('parceria', parceria).order('shared_field_id');
  if (error) throw new Error(`Falha ao ler os vínculos: ${error.message}`);
  return (data ?? []) as VinculoRow[];
}

export async function inserirVinculo(sb: SupabaseClient, row: Omit<VinculoRow, 'id' | 'criado_em' | 'atualizado_em' | 'confirmado_por' | 'confirmado_em' | 'suspenso_por' | 'suspenso_em'>): Promise<VinculoRow> {
  const { data, error } = await sb.from('pf_vinculos').insert(row).select(COLS_VINCULO).single();
  if (error?.code === '23505') throw new ConflitoIntegracao('Este talhão já ganhou vínculo em outra aba/clique ao mesmo tempo. Recarregue a seção.');
  if (error) throw new Error(`Falha ao criar o vínculo: ${error.message}`);
  return data as VinculoRow;
}

export async function atualizarVinculo(sb: SupabaseClient, id: string, patch: Partial<VinculoRow>): Promise<VinculoRow> {
  const { data, error } = await sb.from('pf_vinculos').update({ ...patch, atualizado_em: new Date().toISOString() }).eq('id', id).select(COLS_VINCULO).single();
  if (error) throw new Error(`Falha ao atualizar o vínculo: ${error.message}`);
  return data as VinculoRow;
}

// ── Zoneamento padrão e colheita oficial (nuvem) ─────────────────────────────

export interface ZoneamentoNuvem { id: string; talhaoId: string; nome: string; padrao: boolean; fc: GeoJSON.FeatureCollection }

/** Zoneamento PADRÃO vigente do talhão na nuvem (mesma regra de desempate da
 *  tela: padraoVigente). Lê só o cabeçalho de todas as versões e a geometria
 *  de uma. */
export async function zoneamentoPadrao(sb: SupabaseClient, talhaoId: string): Promise<ZoneamentoNuvem | null> {
  const { data, error } = await sb
    .from('app_kv')
    .select('item_id, padrao:dados->padrao, padraoEm:dados->>padraoEm, criadoEm:dados->>criadoEm')
    .eq('colecao', COL_ZONEAMENTOS)
    .eq('dados->>talhaoId', talhaoId);
  if (error) throw new Error(`Falha ao ler os zoneamentos: ${error.message}`);
  const cab = (data ?? []).map(r => {
    const x = r as { item_id: string; padrao: unknown; padraoEm: string | null; criadoEm: string | null };
    return { id: String(x.item_id), padrao: x.padrao === true, padraoEm: x.padraoEm ?? undefined, criadoEm: x.criadoEm ?? undefined };
  });
  const vig = padraoVigente(cab);
  if (!vig) return null;
  const { data: d2, error: e2 } = await sb.from('app_kv').select('dados').eq('colecao', COL_ZONEAMENTOS).eq('item_id', vig.id).limit(1);
  if (e2) throw new Error(`Falha ao ler o zoneamento: ${e2.message}`);
  const z = (d2?.[0] as { dados?: { id?: string; talhaoId?: string; nome?: string; fc?: GeoJSON.FeatureCollection } } | undefined)?.dados;
  if (!z?.fc || !Array.isArray(z.fc.features)) return null;
  return { id: String(z.id ?? vig.id), talhaoId: String(z.talhaoId ?? talhaoId), nome: String(z.nome ?? ''), padrao: true, fc: z.fc };
}

export interface MapaProdNuvem {
  id: string; talhaoId: string; safra: string; epoca: string; cultura: string; versao: number; oficial: boolean;
}

export async function mapaProdutividade(sb: SupabaseClient, mapaId: string): Promise<MapaProdNuvem | null> {
  const { data, error } = await sb.from('app_kv').select('dados').eq('colecao', COL_PRODUTIVIDADE).eq('item_id', mapaId).limit(1);
  if (error) throw new Error(`Falha ao ler o mapa de produtividade: ${error.message}`);
  const d = (data?.[0] as { dados?: Partial<MapaProdNuvem> } | undefined)?.dados;
  if (!d?.id) return null;
  return {
    id: String(d.id), talhaoId: String(d.talhaoId ?? ''), safra: String(d.safra ?? ''), epoca: String(d.epoca ?? ''),
    cultura: String(d.cultura ?? ''), versao: Number(d.versao ?? 1), oficial: d.oficial === true,
  };
}

/** Grade do mapa (`${talhaoId}__prod__${mapaId}` em inv_mapas_fert): gzip →
 *  Float32 little-endian (o mesmo que o navegador gravou). */
export async function gradeProdutividade(sb: SupabaseClient, talhaoId: string, mapaId: string): Promise<GradeColheita | null> {
  const { data, error } = await sb.from('app_kv').select('dados').eq('colecao', COL_MAPAS).eq('item_id', `${talhaoId}__prod__${mapaId}`).limit(1);
  if (error) throw new Error(`Falha ao ler a grade do mapa: ${error.message}`);
  const resp = (data?.[0] as { dados?: { resp?: { bounds?: [number, number, number, number]; grid?: { b64?: string; shape?: [number, number]; comp?: string } } } } | undefined)?.dados?.resp;
  const g = resp?.grid;
  if (!resp?.bounds || !g?.b64 || !Array.isArray(g.shape)) return null;
  let bytes = Buffer.from(g.b64, 'base64');
  if (g.comp === 'gz') bytes = gunzipSync(bytes);
  // Copia para um ArrayBuffer alinhado (o Buffer pode vir com byteOffset ímpar).
  const ab = new ArrayBuffer(bytes.length - (bytes.length % 4));
  new Uint8Array(ab).set(bytes.subarray(0, ab.byteLength));
  return { valores: new Float32Array(ab), rows: Number(g.shape[0]), cols: Number(g.shape[1]), bounds: resp.bounds };
}

// ── Recursos e revisões ──────────────────────────────────────────────────────

export interface RecursoRow { resource_id: string; vinculo_id: string; talhao_id: string; resource_type: TipoRecurso; chave_local: string; criado_em: string }

/** Recurso da chave local; cria se não existe (corrida de dois cliques cai no
 *  unique e o segundo só relê). */
export async function obterOuCriarRecurso(sb: SupabaseClient, a: { vinculoId: string; talhaoId: string; tipo: TipoRecurso; chaveLocal: string }): Promise<RecursoRow> {
  const sel = 'resource_id, vinculo_id, talhao_id, resource_type, chave_local, criado_em';
  const ler = async () => {
    const { data, error } = await sb.from('pf_recursos').select(sel).eq('vinculo_id', a.vinculoId).eq('chave_local', a.chaveLocal).limit(1);
    if (error) throw new Error(`Falha ao ler o recurso: ${error.message}`);
    return (data?.[0] as RecursoRow | undefined) ?? null;
  };
  const existe = await ler();
  if (existe) return existe;
  const { error } = await sb.from('pf_recursos').upsert(
    { vinculo_id: a.vinculoId, talhao_id: a.talhaoId, resource_type: a.tipo, chave_local: a.chaveLocal },
    { onConflict: 'vinculo_id,chave_local', ignoreDuplicates: true },
  );
  if (error) throw new Error(`Falha ao criar o recurso: ${error.message}`);
  const criado = await ler();
  if (!criado) throw new Error('Falha ao criar o recurso.');
  return criado;
}

export interface RevisaoRow {
  resource_id: string; revision: number; event_id: string; checksum: string; conteudo_hash: string;
  boundary_revision: number; name: string | null; season: string | null; season_period: string | null;
  evento: Omit<Evento, 'checksum'>; publicado_por: string | null; publicado_em: string; tamanho_bytes: number | null;
}
const COLS_REVISAO = 'resource_id, revision, event_id, checksum, conteudo_hash, boundary_revision, name, season, season_period, evento, publicado_por, publicado_em, tamanho_bytes';

export async function ultimaRevisao(sb: SupabaseClient, resourceId: string): Promise<RevisaoRow | null> {
  const { data, error } = await sb.from('pf_revisoes').select(COLS_REVISAO).eq('resource_id', resourceId).order('revision', { ascending: false }).limit(1);
  if (error) throw new Error(`Falha ao ler a revisão: ${error.message}`);
  return (data?.[0] as RevisaoRow | undefined) ?? null;
}

export type InsercaoRevisao = { ok: true } | { ok: false; conflito: boolean; erro: string };

export async function inserirRevisao(sb: SupabaseClient, a: {
  envelope: Envelope; evento: Omit<Evento, 'checksum'>; checksum: string; conteudoHash: string; tamanhoBytes: number;
  name: string; season: string | null; seasonPeriod: string | null; origem: Record<string, unknown>; publicadoPor: string;
}): Promise<InsercaoRevisao> {
  const { error } = await sb.from('pf_revisoes').insert({
    resource_id: a.envelope.resource_id,
    revision: a.envelope.resource_revision,
    event_id: a.envelope.event_id,
    checksum: a.checksum,
    conteudo_hash: a.conteudoHash,
    boundary_revision: a.envelope.boundary_revision,
    name: a.name,
    season: a.season,
    season_period: a.seasonPeriod,
    evento: a.evento,
    envelope: a.envelope,
    tamanho_bytes: a.tamanhoBytes,
    origem: a.origem,
    publicado_por: a.publicadoPor,
  });
  if (!error) return { ok: true };
  if (error.code === '23505') return { ok: false, conflito: true, erro: 'Outra publicação deste recurso terminou ao mesmo tempo. Recarregue e publique de novo se ainda for preciso.' };
  return { ok: false, conflito: false, erro: `Falha ao gravar a revisão: ${error.message}` };
}

/**
 * Recursos de um vínculo + SÓ a revisão VIGENTE (maior) de cada um, sem o
 * envelope pesado. Uma consulta ordenada com limit 1 por recurso — ler "todas
 * as revisões" esbarraria no max_rows do PostgREST (1000 no Supabase) e uma
 * lista truncada poderia esconder justamente a mais nova. Recursos por vínculo
 * são poucos (zonas + uma colheita por safra/época).
 */
export async function vigentesDoVinculo(sb: SupabaseClient, vinculoId: string): Promise<{ recursos: RecursoRow[]; revisoes: RevisaoRow[] }> {
  const { data: recs, error } = await sb.from('pf_recursos')
    .select('resource_id, vinculo_id, talhao_id, resource_type, chave_local, criado_em')
    .eq('vinculo_id', vinculoId).order('resource_id');
  if (error) throw new Error(`Falha ao ler os recursos: ${error.message}`);
  const recursos = (recs ?? []) as RecursoRow[];
  const ultimas = await Promise.all(recursos.map(r => ultimaRevisao(sb, r.resource_id)));
  return { recursos, revisoes: ultimas.filter((r): r is RevisaoRow => !!r) };
}

export async function recursoPorId(sb: SupabaseClient, resourceId: string): Promise<RecursoRow | null> {
  const { data, error } = await sb.from('pf_recursos').select('resource_id, vinculo_id, talhao_id, resource_type, chave_local, criado_em').eq('resource_id', resourceId).limit(1);
  if (error) throw new Error(`Falha ao ler o recurso: ${error.message}`);
  return (data?.[0] as RecursoRow | undefined) ?? null;
}

export async function envelopeDaRevisao(sb: SupabaseClient, resourceId: string, n: number): Promise<{ envelope: Envelope; checksum: string } | null> {
  const { data, error } = await sb.from('pf_revisoes').select('envelope, checksum').eq('resource_id', resourceId).eq('revision', n).limit(1);
  if (error) throw new Error(`Falha ao ler a revisão: ${error.message}`);
  const r = data?.[0] as { envelope: Envelope; checksum: string } | undefined;
  return r ? { envelope: r.envelope, checksum: r.checksum } : null;
}
