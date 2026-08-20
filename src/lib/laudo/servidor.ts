// Lado SERVIDOR da ingestão de laudos: autenticação por chave de laboratório,
// resolução da remessa e gravação no app_kv.
//
// Separado do núcleo puro (ingestao.ts) de propósito: aqui há I/O, e é o núcleo
// — não isto — que o teste consegue exercitar de verdade. Tudo o que decide
// VALOR de amostra vive lá; aqui só se decide DE QUEM é o laudo e ONDE ele vai.
//
// Roda com a SERVICE ROLE, que passa por cima da RLS. Logo, todo recorte de
// escopo tem de ser feito explicitamente neste arquivo — não há rede de proteção
// do banco embaixo.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { periodoDeData } from '../periodo.ts';
import { ELEMENTOS_LAB, type ResultadoAmostra } from './nucleo.ts';
import { VARIAVEIS_COMPLEMENTARES } from '../../constants/variaveisSeedComplementar.ts';

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE_SERVICO = process.env.SUPABASE_SERVICE_ROLE;

export const COL_GRADES = 'inv_grades';
export const COL_LAUDOS = 'inv_lab';
export const COL_VARIAVEIS = 'inv_bib_preferencias-analise';

export function servicoConfigurado(): boolean {
  return !!(URL_SUPABASE && CHAVE_SERVICO);
}

export function clienteServico(): SupabaseClient {
  return createClient(URL_SUPABASE!, CHAVE_SERVICO!, { auth: { persistSession: false } });
}

/** A chave nunca é guardada em claro: o banco só vê o SHA-256. */
export const hashChave = (chave: string) => createHash('sha256').update(chave, 'utf8').digest('hex');

// ── Autenticação ─────────────────────────────────────────────────────────────

export interface LabAutenticado {
  chaveId: string;
  laboratorioId: string;
  laboratorioNome: string;
  empresaId: string | null;
}

export function chaveDoHeader(auth: string | null): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec((auth ?? '').trim());
  return m ? m[1] : null;
}

export async function autenticar(sb: SupabaseClient, auth: string | null): Promise<LabAutenticado | null> {
  const chave = chaveDoHeader(auth);
  if (!chave) return null;
  const { data, error } = await sb
    .from('lab_chaves')
    .select('id, laboratorio_id, laboratorio_nome, empresa_id')
    .eq('hash', hashChave(chave))
    .is('revogada_em', null)
    .limit(1);
  if (error || !data?.length) return null;
  const r = data[0];
  // Best-effort: falhar em registrar o uso não pode derrubar a ingestão.
  void sb.from('lab_chaves').update({ ultimo_uso_em: new Date().toISOString() }).eq('id', r.id);
  return {
    chaveId: String(r.id),
    laboratorioId: String(r.laboratorio_id ?? ''),
    laboratorioNome: String(r.laboratorio_nome ?? ''),
    empresaId: r.empresa_id == null ? null : String(r.empresa_id),
  };
}

// ── Remessa → talhão ─────────────────────────────────────────────────────────

export interface GradeDaRemessa {
  gradeId: string;
  talhaoId: string;
  safra: string;
  empresaId: string | null;
  dataReferencia: string | null;
  numeros: Set<number>;
  profundidades: Set<string>;
}

type GradeBruta = {
  id?: string; talhaoId?: string; safra?: string; empresaId?: string; dataReferencia?: string;
  pontos?: { numero?: number; ordem?: number }[];
  profundidades?: { rotulo?: string }[];
};

export type ResolucaoRemessa =
  | { ok: true; grade: GradeDaRemessa }
  | { ok: false; motivo: 'nao-encontrada' | 'ambigua' | 'outra-empresa' };

/**
 * Acha a grade pelo código de remessa.
 *
 * Duas grades com o mesmo código devolvem `ambigua` e a rota recusa. Escolher
 * uma seria adivinhar em qual talhão gravar — exatamente o que o código de
 * remessa existe para eliminar.
 */
export async function resolverRemessa(
  sb: SupabaseClient, codigo: string, lab: LabAutenticado,
): Promise<ResolucaoRemessa> {
  const { data, error } = await sb
    .from('app_kv')
    .select('dados')
    .eq('colecao', COL_GRADES)
    .eq('dados->>codigoRemessa', codigo)
    .limit(2);
  if (error || !data?.length) return { ok: false, motivo: 'nao-encontrada' };
  if (data.length > 1) return { ok: false, motivo: 'ambigua' };

  const g = (data[0] as { dados: GradeBruta }).dados;
  const empresaId = g.empresaId ?? null;
  // A chave é emitida para um laboratório DENTRO de uma empresa. Sem esta linha,
  // uma chave válida alcançaria a remessa de qualquer cliente da plataforma.
  if (lab.empresaId && empresaId && lab.empresaId !== empresaId) return { ok: false, motivo: 'outra-empresa' };

  const numeros = new Set<number>();
  (g.pontos ?? []).forEach((p, i) => numeros.add(p.numero ?? i + 1));
  const profundidades = new Set<string>((g.profundidades ?? []).map(p => String(p.rotulo ?? '')).filter(Boolean));

  return {
    ok: true,
    grade: {
      gradeId: String(g.id ?? ''),
      talhaoId: String(g.talhaoId ?? ''),
      safra: String(g.safra ?? ''),
      empresaId,
      dataReferencia: g.dataReferencia ?? null,
      numeros, profundidades,
    },
  };
}

// ── Catálogo de variáveis aceitas ────────────────────────────────────────────

/** Ids do seed que entram ligados — usado quando o cliente ainda não materializou o catálogo. */
function variaveisDoSeed(): Set<string> {
  const ids = ELEMENTOS_LAB.map(e => e.id);
  for (const v of VARIAVEIS_COMPLEMENTARES) if (v.usar) ids.push(v.id);
  return new Set(ids);
}

export async function variaveisAceitas(sb: SupabaseClient, empresaId: string | null): Promise<Set<string>> {
  const { data, error } = await sb.from('app_kv').select('dados').eq('colecao', COL_VARIAVEIS);
  if (error || !data?.length) return variaveisDoSeed();
  const ids = new Set<string>();
  for (const linha of data as { dados?: { empresaId?: string; conteudo?: { tipo?: string; varId?: string; usar?: boolean } } }[]) {
    const item = linha.dados;
    const c = item?.conteudo;
    if (c?.tipo !== 'variavel' || !c.usar || !c.varId) continue;
    if (empresaId && item?.empresaId && item.empresaId !== empresaId) continue;
    ids.add(c.varId);
  }
  // Catálogo vazio (instalação nova) não pode virar "nenhuma variável aceita" —
  // seria um laudo recusado inteiro por um estado transitório do cliente.
  return ids.size ? ids : variaveisDoSeed();
}

// ── Gravação ─────────────────────────────────────────────────────────────────

/**
 * Id determinístico: mesmo protocolo, mesma remessa ⇒ mesma linha.
 *
 * É o que torna o reenvio seguro. Sem isso, uma retentativa do laboratório
 * (timeout, fila, replay) criaria um segundo laudo do mesmo lote — e laudo
 * duplicado distorce mapa e dose sem gerar erro nenhum. Mesmo padrão de prefixo
 * do motor de migração do acervo (`mig`).
 */
export function idLaudoApi(remessa: string, protocolo: string): string {
  const p = protocolo.replace(/[^\w.-]+/g, '_').slice(0, 80);
  return `api__${remessa}__${p}`;
}

export interface GravacaoLaudo {
  grade: GradeDaRemessa;
  lab: LabAutenticado;
  remessa: string;
  protocolo: string;
  dataAnalise: string | null;
  resultados: ResultadoAmostra[];
  elementos: string[];
}

export async function gravarLaudo(sb: SupabaseClient, g: GravacaoLaudo): Promise<{ id: string; criado: boolean }> {
  const id = idLaudoApi(g.remessa, g.protocolo);
  const agora = new Date().toISOString();

  const { data: existente } = await sb
    .from('app_kv').select('dados').eq('colecao', COL_LAUDOS).eq('item_id', id).limit(1);
  const criadoEm = (existente?.[0] as { dados?: { criadoEm?: string } } | undefined)?.dados?.criadoEm ?? agora;

  // A data de referência manda no Ano/Época (o store deriva os dois dela). Cai
  // para a data da grade quando o laboratório não informa — nunca para "hoje",
  // que jogaria um laudo de safra passada no período errado.
  const dataReferencia = g.dataAnalise ?? g.grade.dataReferencia ?? null;
  const per = dataReferencia ? periodoDeData(dataReferencia) : null;

  const dados = {
    id,
    talhaoId: g.grade.talhaoId,
    safra: g.grade.safra,
    gradeId: g.grade.gradeId,
    laboratorio: g.lab.laboratorioNome,
    laboratorioId: g.lab.laboratorioId || undefined,
    campanha: g.protocolo,
    resultados: g.resultados,
    elementos: g.elementos,
    criadoEm,
    atualizadoEm: agora,
    ...(dataReferencia ? { dataReferencia } : {}),
    ...(per ? { ano: per.ano, epoca: per.epoca } : {}),
    ...(g.grade.empresaId ? { empresaId: g.grade.empresaId } : {}),
    // Marca a procedência: distingue no suporte um laudo que chegou sozinho de
    // um que alguém importou à mão, e permite varrer/reverter só os da API.
    origem: 'api' as const,
    remessa: g.remessa,
  };

  const { error } = await sb.from('app_kv').upsert(
    { colecao: COL_LAUDOS, item_id: id, dados, atualizado_em: agora },
    { onConflict: 'colecao,item_id' },
  );
  if (error) throw new Error(`Falha ao gravar o laudo: ${error.message}`);
  return { id, criado: !existente?.length };
}
