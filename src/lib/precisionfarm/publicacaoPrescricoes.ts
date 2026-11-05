// Integração PrecisionFarm — extensão 0.3.0: SINCRONIZAÇÃO das prescrições
// marcadas com a estrela "Enviar à PrecisionFarm" (ledger pf-contrato-03,
// Q3–Q5). Orquestração com o banco atrás de uma PORTA (como recebimento.ts):
// em produção, repoPrescricoes.ts (Supabase, service role); no teste ponta a
// ponta, um repositório em memória.
//
//   estrela (pf_prescricoes_estrela) + prescrições na NUVEM (app_kv)
//        └─► por linhagem: publicar (upsert) · arquivar · nada
//              └─► revisão imutável em pf_recursos/pf_revisoes (o MESMO
//                  esquema de zonas/colheita: inventário com event + checksum)
//
// Regras:
//   • Conteúdo lido da NUVEM (o que a PF recebe é o que sincronizou), versão
//     mais recente da linhagem (origemId).
//   • Só com vínculo CONFIRMADO; sem ele a estrela fica salva e a situação
//     diz "pendente: <motivo>" — publica sozinha na confirmação (Q5).
//   • Idempotente: conteúdo igual à última revisão não cria revisão nova.
//   • Estrela tirada / prescrição excluída / item retirado pela Lavra →
//     revisão `archive` (snapshot completo da última publicada).
//   • Falha numa linhagem não para as outras e nunca apaga a estrela.

import {
  MAX_ENVELOPE_BYTES_INVICTA, MigracaoPendente, bytesDoEnvelope, checksumEnvelope, impressaoConteudo, mensagemTamanho, montarEnvelope,
  validarEnvelope, type Envelope, type Evento, type StatusVinculo,
} from './contrato.ts';
import {
  chaveLocalPrescricao, decidirLinhagem, linhagemDaChave, montarPayloadPrescricao, ultimasDasLinhagens,
  type CabecalhoPrescricao, type PrescricaoParaPF,
} from './prescricaoPF.ts';

// ── Porta do banco ───────────────────────────────────────────────────────────

export interface EstrelaPrescricao {
  talhao_id: string;
  linhagem_id: string;
  marcada: boolean;
  marcada_por: string | null;
  marcada_em: string | null;
}

export interface VinculoPublicacao {
  id: string;
  status: StatusVinculo;
  shared_producer_id: string;
  shared_farm_id: string;
  shared_field_id: string;
}

export interface RevisaoPublicada {
  resource_id: string;
  revision: number;
  conteudo_hash: string;
  checksum: string;
  operation: 'upsert' | 'archive';
  publicado_em: string;
}

export type SituacaoPrescricao = 'publicada' | 'pendente' | 'arquivada' | 'nao_publicada';

export interface RegistroSituacao {
  situacao: SituacaoPrescricao;
  motivo: string | null;
  revisao: number | null;
  resource_id: string | null;
}

export interface RepoPrescricoesPF {
  talhao(talhaoId: string): Promise<{ id: string; nome: string; geoVersao: number } | null>;
  vinculoDoTalhao(talhaoId: string): Promise<VinculoPublicacao | null>;
  /** Estrelas do talhão. Banco sem a migração 0.3 → MigracaoPendente. */
  estrelas(talhaoId: string): Promise<EstrelaPrescricao[]>;
  gravarEstrela(talhaoId: string, linhagemId: string, marcada: boolean, por: string, agoraIso: string): Promise<void>;
  /** Guarda a última situação (a tela de lote lê daqui sem recalcular). */
  registrarSituacao(talhaoId: string, linhagemId: string, s: RegistroSituacao, agoraIso: string): Promise<void>;
  /** Cabeçalho de TODAS as versões das prescrições do talhão na nuvem. */
  cabecalhos(talhaoId: string): Promise<CabecalhoPrescricao[]>;
  /** Uma versão completa (zonas, fc, params) na nuvem. */
  prescricao(id: string): Promise<PrescricaoParaPF | null>;
  recursosPrescricao(vinculoId: string): Promise<Array<{ resource_id: string; chave_local: string }>>;
  /** Cria se não existe. Banco sem a migração 0.3 (check antigo) → MigracaoPendente. */
  obterOuCriarRecurso(a: { vinculoId: string; talhaoId: string; chaveLocal: string }): Promise<{ resource_id: string }>;
  ultimaRevisao(resourceId: string): Promise<RevisaoPublicada | null>;
  payloadDaRevisao(resourceId: string, n: number): Promise<Record<string, unknown> | null>;
  inserirRevisao(a: {
    envelope: Envelope; evento: Omit<Evento, 'checksum'>; checksum: string; conteudoHash: string; tamanhoBytes: number;
    name: string; season: string | null; seasonPeriod: string | null; origem: Record<string, unknown>; publicadoPor: string;
  }): Promise<{ ok: true } | { ok: false; conflito: boolean; erro: string }>;
}

export interface OpcoesSincronizacao {
  /** false = só calcula a situação (GET da tela); nada é gravado. */
  gravar: boolean;
  por: string;
  agora?: () => Date;
  novoUuid: () => string;
}

export interface SituacaoLinhagem {
  linhagemId: string;
  /** Versão que vale (a mais recente da linhagem), se ainda existe. */
  versaoId: string | null;
  versao: number | null;
  nome: string | null;
  marcada: boolean;
  situacao: SituacaoPrescricao;
  motivo: string | null;
  revisao: number | null;
  resourceId: string | null;
  /** Revisão criada AGORA (publicação/arquivamento novo). */
  criada: boolean;
}

// ── Mensagens ────────────────────────────────────────────────────────────────

export const MOTIVO_SEM_VINCULO = 'O talhão não tem vínculo com a PrecisionFarm. A estrela fica salva e publica sozinha quando o vínculo for confirmado.';
const motivoVinculo = (s: StatusVinculo) => (s === 'suspenso'
  ? 'O vínculo com a PrecisionFarm está suspenso. A estrela fica salva e publica sozinha quando ele for confirmado de novo.'
  : 'O vínculo com a PrecisionFarm ainda está pendente. A estrela fica salva e publica sozinha quando ele for confirmado.');

// ── Uma revisão ──────────────────────────────────────────────────────────────

type ResultadoRevisao =
  | { ok: true; criada: boolean; revisao: number; resourceId: string }
  | { ok: false; erro: string }
  /** Dry-run: o que seria gravado difere da última revisão (ou não há). */
  | { ok: 'diferente'; revisao: number | null; resourceId: string | null };

async function revisao(repo: RepoPrescricoesPF, a: {
  v: VinculoPublicacao; talhao: { id: string; geoVersao: number }; chaveLocal: string; recursoExistente: string | null;
  payload: Record<string, unknown>; operacao: 'upsert' | 'archive'; origem: Record<string, unknown>; opts: OpcoesSincronizacao;
}): Promise<ResultadoRevisao> {
  const ids = { shared_producer_id: a.v.shared_producer_id, shared_farm_id: a.v.shared_farm_id, shared_field_id: a.v.shared_field_id };
  const quando = a.opts.agora ? a.opts.agora() : new Date();
  const env = (resourceId: string, n: number) => montarEnvelope({
    ids, resourceId, tipo: 'prescription', revisao: n, boundaryRevision: a.talhao.geoVersao,
    eventId: a.opts.novoUuid(), quando, payload: a.payload, operacao: a.operacao,
  });
  // Tamanho ANTES de criar qualquer linha (UUIDs de mesmo comprimento).
  const bytesProva = bytesDoEnvelope(env(a.recursoExistente ?? a.opts.novoUuid(), 1));
  if (bytesProva > MAX_ENVELOPE_BYTES_INVICTA) return { ok: false, erro: mensagemTamanho(bytesProva, 0) };

  if (!a.opts.gravar) {
    if (!a.recursoExistente) return { ok: 'diferente', revisao: null, resourceId: null };
    const ultima = await repo.ultimaRevisao(a.recursoExistente);
    const prova = env(a.recursoExistente, (ultima?.revision ?? 0) + 1);
    if (ultima && ultima.conteudo_hash === impressaoConteudo(prova)) return { ok: true, criada: false, revisao: ultima.revision, resourceId: a.recursoExistente };
    return { ok: 'diferente', revisao: ultima?.revision ?? null, resourceId: a.recursoExistente };
  }

  const recurso = await repo.obterOuCriarRecurso({ vinculoId: a.v.id, talhaoId: a.talhao.id, chaveLocal: a.chaveLocal });
  const ultima = await repo.ultimaRevisao(recurso.resource_id);
  const envelope = env(recurso.resource_id, (ultima?.revision ?? 0) + 1);
  const erros = validarEnvelope(envelope);
  if (erros.length) return { ok: false, erro: `Envelope fora do contrato: ${erros.join('; ')}` };
  const conteudoHash = impressaoConteudo(envelope);
  if (ultima && ultima.conteudo_hash === conteudoHash) return { ok: true, criada: false, revisao: ultima.revision, resourceId: recurso.resource_id };
  const checksum = checksumEnvelope(envelope);
  const { payload: _p, ...evento } = envelope;
  void _p;
  const ins = await repo.inserirRevisao({
    envelope, evento, checksum, conteudoHash, tamanhoBytes: bytesDoEnvelope(envelope),
    name: String(a.payload.name ?? ''), season: typeof a.payload.season === 'string' ? a.payload.season : null,
    seasonPeriod: typeof a.payload.season_period === 'string' ? a.payload.season_period : null,
    origem: a.origem, publicadoPor: a.opts.por,
  });
  if (!ins.ok) return { ok: false, erro: ins.erro };
  return { ok: true, criada: true, revisao: envelope.resource_revision, resourceId: recurso.resource_id };
}

// ── Sincronização de um talhão ───────────────────────────────────────────────

/**
 * Sincroniza (ou, com gravar=false, só avalia) as prescrições do talhão com a
 * PrecisionFarm. Devolve a situação de cada linhagem com estrela ou com algo
 * já publicado. MigracaoPendente (sem a tabela das estrelas) sobe para a rota.
 */
export async function sincronizarPrescricoes(repo: RepoPrescricoesPF, talhaoId: string, opts: OpcoesSincronizacao): Promise<SituacaoLinhagem[]> {
  const agoraIso = () => (opts.agora ? opts.agora() : new Date()).toISOString();
  const estrelas = await repo.estrelas(talhaoId);
  const [cabs, v, talhao] = await Promise.all([repo.cabecalhos(talhaoId), repo.vinculoDoTalhao(talhaoId), repo.talhao(talhaoId)]);
  const ultimas = ultimasDasLinhagens(cabs);
  const recursos = v ? await repo.recursosPrescricao(v.id) : [];
  const recPorLinhagem = new Map<string, string>();
  for (const r of recursos) {
    const l = linhagemDaChave(r.chave_local);
    if (l) recPorLinhagem.set(l, r.resource_id);
  }
  const estrelaDe = new Map(estrelas.map(e => [e.linhagem_id, e]));
  const linhagens = [...new Set([...estrelas.map(e => e.linhagem_id), ...recPorLinhagem.keys()])].sort();

  const saida: SituacaoLinhagem[] = [];
  for (const L of linhagens) {
    const ult = ultimas.get(L) ?? null;
    const marcada = !!estrelaDe.get(L)?.marcada;
    const resourceId = recPorLinhagem.get(L) ?? null;
    const base: SituacaoLinhagem = {
      linhagemId: L, versaoId: ult?.id ?? null, versao: ult?.versao ?? null, nome: ult?.nome ?? null, marcada,
      situacao: 'nao_publicada', motivo: null, revisao: null, resourceId, criada: false,
    };
    let s: SituacaoLinhagem;
    try {
      const ultimaRev = resourceId ? await repo.ultimaRevisao(resourceId) : null;
      const d = decidirLinhagem({ marcada, ultima: ult, ultimaOperacao: ultimaRev?.operation ?? null });
      if (d.acao === 'nada') {
        s = ultimaRev?.operation === 'archive'
          ? { ...base, situacao: 'arquivada', motivo: d.motivo, revisao: ultimaRev.revision }
          : { ...base, situacao: 'nao_publicada', motivo: marcada ? d.motivo : null };
      } else if (!v) {
        s = { ...base, situacao: 'pendente', motivo: MOTIVO_SEM_VINCULO, revisao: ultimaRev?.revision ?? null };
      } else if (v.status !== 'confirmado') {
        s = { ...base, situacao: 'pendente', motivo: motivoVinculo(v.status), revisao: ultimaRev?.revision ?? null };
      } else if (!talhao) {
        s = { ...base, situacao: 'pendente', motivo: 'O talhão ainda não está na nuvem. Aguarde a sincronização.', revisao: ultimaRev?.revision ?? null };
      } else if (d.acao === 'publicar') {
        const p = await repo.prescricao(d.versaoId);
        const res = p ? montarPayloadPrescricao(p) : { ok: false as const, erro: 'Esta versão ainda não chegou à nuvem. Aguarde a sincronização e tente de novo.' };
        if (!res.ok) {
          s = { ...base, situacao: 'pendente', motivo: `Ainda não publicada: ${res.erro}`, revisao: ultimaRev?.revision ?? null };
        } else {
          const r = await revisao(repo, {
            v, talhao, chaveLocal: chaveLocalPrescricao(L), recursoExistente: resourceId, payload: res.payload, operacao: 'upsert',
            origem: { prescricaoId: d.versaoId, linhagemId: L, versao: ult?.versao ?? null }, opts,
          });
          s = r.ok === true ? { ...base, situacao: 'publicada', revisao: r.revisao, resourceId: r.resourceId, criada: r.criada }
            : r.ok === 'diferente' ? { ...base, situacao: 'pendente', motivo: r.revisao ? `A versão atual ainda não foi publicada (a PrecisionFarm tem a revisão ${r.revisao}).` : 'Ainda não publicada.', revisao: r.revisao }
              : { ...base, situacao: 'pendente', motivo: `Ainda não publicada: ${r.erro}`, revisao: ultimaRev?.revision ?? null };
        }
      } else {
        // arquivar: snapshot completo da última publicada, operação archive.
        const payload = await repo.payloadDaRevisao(resourceId!, ultimaRev!.revision);
        if (!payload) {
          s = { ...base, situacao: 'pendente', motivo: 'Não foi possível ler a última revisão publicada para arquivá-la.', revisao: ultimaRev!.revision };
        } else {
          const r = await revisao(repo, {
            v, talhao, chaveLocal: chaveLocalPrescricao(L), recursoExistente: resourceId, payload, operacao: 'archive',
            origem: { linhagemId: L, arquivada: d.motivo }, opts,
          });
          s = r.ok === true ? { ...base, situacao: 'arquivada', motivo: d.motivo, revisao: r.revisao, criada: r.criada }
            : r.ok === 'diferente' ? { ...base, situacao: 'pendente', motivo: `${d.motivo} O arquivamento na PrecisionFarm ainda não foi feito.`, revisao: r.revisao }
              : { ...base, situacao: 'pendente', motivo: `Arquivamento não feito: ${r.erro}`, revisao: ultimaRev!.revision };
        }
      }
    } catch (e) {
      const msg = e instanceof MigracaoPendente ? e.message : `Falha ao publicar: ${e instanceof Error ? e.message : 'erro desconhecido'}`;
      s = { ...base, situacao: 'pendente', motivo: msg };
    }
    saida.push(s);
    // A última situação fica guardada junto da estrela (tela de lote). Só ao
    // gravar, e só para linhagem com estrela registrada.
    if (opts.gravar && estrelaDe.has(L)) {
      try {
        await repo.registrarSituacao(talhaoId, L, { situacao: s.situacao, motivo: s.motivo, revisao: s.revisao, resource_id: s.resourceId }, agoraIso());
      } catch (e) { console.error('[precisionfarm] falha ao registrar a situação da prescrição', e instanceof Error ? e.message : e); }
    }
  }
  return saida;
}

/** Resumo curto para a tela de lote ("2 publicadas · 1 pendente: …"). */
export function resumoSincronizacao(ss: readonly SituacaoLinhagem[]): { texto: string; pendentes: number; publicadas: number; criadas: number } {
  const n = (x: SituacaoPrescricao) => ss.filter(s => s.situacao === x).length;
  const publicadas = n('publicada'), pendentes = n('pendente'), arquivadas = n('arquivada');
  const criadas = ss.filter(s => s.criada).length;
  if (!ss.length) return { texto: 'Nenhuma prescrição com estrela.', pendentes: 0, publicadas: 0, criadas: 0 };
  const partes: string[] = [];
  if (publicadas) partes.push(`${publicadas} publicada(s)`);
  if (arquivadas) partes.push(`${arquivadas} arquivada(s)`);
  if (criadas) partes.push(`${criadas} revisão(ões) nova(s)`);
  const primeiraPendente = ss.find(s => s.situacao === 'pendente');
  if (pendentes) partes.push(`${pendentes} pendente(s)${primeiraPendente?.motivo ? `: ${primeiraPendente.motivo}` : ''}`);
  return { texto: partes.join(' · ') || 'Nada a publicar.', pendentes, publicadas, criadas };
}
