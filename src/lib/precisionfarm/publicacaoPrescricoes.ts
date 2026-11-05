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
/** Desmarcada/excluída com o vínculo fora do ar: o que falta é ARQUIVAR lá. */
const motivoArquivoPendente = (porque: string, s: StatusVinculo | null) =>
  `Arquivamento pendente na PrecisionFarm (${porque.replace(/\.$/, '')}): ${s === 'suspenso' ? 'o vínculo está suspenso' : s === 'pendente' ? 'o vínculo ainda está pendente' : 'o talhão não tem vínculo'} — arquiva sozinho quando o vínculo for confirmado.`;
export const MOTIVO_CONCORRENCIA = 'Outra publicação desta prescrição aconteceu ao mesmo tempo e a situação mudou duas vezes seguidas. Use "Publicar prescrições" (ou marque de novo) em instantes.';

// ── Uma revisão ──────────────────────────────────────────────────────────────

type ResultadoRevisao =
  | { ok: true; criada: boolean; revisao: number; resourceId: string }
  | { ok: false; erro: string }
  /** Dry-run: o que seria gravado difere da última revisão (ou não há). */
  | { ok: 'diferente'; revisao: number | null; resourceId: string | null }
  /** Corrida: a estrela/versão mudou depois da leitura, ou outra publicação
   *  gravou a mesma revisão (23505). Quem chama relê tudo e refaz. */
  | { ok: 'refazer' };

async function revisao(repo: RepoPrescricoesPF, a: {
  v: VinculoPublicacao; talhao: { id: string; geoVersao: number }; chaveLocal: string; recursoExistente: string | null;
  payload: Record<string, unknown>; operacao: 'upsert' | 'archive'; origem: Record<string, unknown>; opts: OpcoesSincronizacao;
  /** Relê estrela e versão DEPOIS de ler a última revisão e ANTES de gravar:
   *  false = a decisão ficou velha (ex.: desmarcaram durante a sincronização). */
  aindaVale: () => Promise<boolean>;
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
  // Ordem que fecha a corrida: (1) última revisão lida acima, (2) estrela e
  // versão relidas AQUI, (3) insert com unique (recurso, revisão). Quem mudou a
  // estrela/versão depois de (2) grava a SUA revisão depois — e um insert
  // velho que perder a numeração cai no 23505 e refaz. Assim um upsert lido
  // antes nunca fica por cima de um archive (ou de uma versão) posterior.
  if (!(await a.aindaVale())) return { ok: 'refazer' };
  const checksum = checksumEnvelope(envelope);
  const { payload: _p, ...evento } = envelope;
  void _p;
  const ins = await repo.inserirRevisao({
    envelope, evento, checksum, conteudoHash, tamanhoBytes: bytesDoEnvelope(envelope),
    name: String(a.payload.name ?? ''), season: typeof a.payload.season === 'string' ? a.payload.season : null,
    seasonPeriod: typeof a.payload.season_period === 'string' ? a.payload.season_period : null,
    origem: a.origem, publicadoPor: a.opts.por,
  });
  if (!ins.ok) return ins.conflito ? { ok: 'refazer' } : { ok: false, erro: ins.erro };
  // Releitura DEPOIS do insert: se outro cliente mudou a estrela/versão entre
  // a releitura de cima e este insert, a sincronização DELE pode ter decidido
  // "nada" olhando a revisão anterior (ex.: re-marcada sobre um archive e
  // desmarcada no meio). Refazer corrige: archive ou revisão nova por cima.
  if (!(await a.aindaVale())) return { ok: 'refazer' };
  return { ok: true, criada: true, revisao: envelope.resource_revision, resourceId: recurso.resource_id };
}

// ── Sincronização de um talhão ───────────────────────────────────────────────

/** Estado FRESCO de uma linhagem (relido a cada tentativa). */
interface EstadoLinhagem {
  marcada: boolean;
  temEstrela: boolean;
  ult: CabecalhoPrescricao | null;
  resourceId: string | null;
  ultimaRev: RevisaoPublicada | null;
}

async function lerLinhagem(repo: RepoPrescricoesPF, talhaoId: string, L: string, v: VinculoPublicacao | null): Promise<EstadoLinhagem> {
  const [estrelas, cabs, recursos] = await Promise.all([
    repo.estrelas(talhaoId), repo.cabecalhos(talhaoId), v ? repo.recursosPrescricao(v.id) : Promise.resolve([]),
  ]);
  const e = estrelas.find(x => x.linhagem_id === L);
  const resourceId = recursos.find(r => linhagemDaChave(r.chave_local) === L)?.resource_id ?? null;
  return {
    marcada: !!e?.marcada, temEstrela: !!e,
    ult: ultimasDasLinhagens(cabs).get(L) ?? null,
    resourceId,
    ultimaRev: resourceId ? await repo.ultimaRevisao(resourceId) : null,
  };
}

/** Uma linhagem, com UMA repetição em caso de corrida (estado relido). */
async function sincronizarLinhagem(repo: RepoPrescricoesPF, talhaoId: string, L: string, ctx: {
  v: VinculoPublicacao | null; talhao: { id: string; nome: string; geoVersao: number } | null; opts: OpcoesSincronizacao;
}): Promise<{ s: SituacaoLinhagem; e: EstadoLinhagem }> {
  const { v, talhao, opts } = ctx;
  for (let tentativa = 1; ; tentativa++) {
    const e = await lerLinhagem(repo, talhaoId, L, v);
    const { marcada, ult, resourceId, ultimaRev } = e;
    const base: SituacaoLinhagem = {
      linhagemId: L, versaoId: ult?.id ?? null, versao: ult?.versao ?? null, nome: ult?.nome ?? null, marcada,
      situacao: 'nao_publicada', motivo: null, revisao: null, resourceId, criada: false,
    };
    const pend = (motivo: string): SituacaoLinhagem => ({ ...base, situacao: 'pendente', motivo, revisao: ultimaRev?.revision ?? null });
    const d = decidirLinhagem({ marcada, ultima: ult, ultimaOperacao: ultimaRev?.operation ?? null });
    if (d.acao === 'nada') {
      const s: SituacaoLinhagem = ultimaRev?.operation === 'archive'
        ? { ...base, situacao: 'arquivada', motivo: d.motivo, revisao: ultimaRev.revision }
        : { ...base, situacao: 'nao_publicada', motivo: marcada ? d.motivo : null };
      return { s, e };
    }
    if (!v || v.status !== 'confirmado') {
      return { s: pend(d.acao === 'arquivar' ? motivoArquivoPendente(d.motivo, v?.status ?? null) : v ? motivoVinculo(v.status) : MOTIVO_SEM_VINCULO), e };
    }
    if (!talhao) return { s: pend('O talhão ainda não está na nuvem. Aguarde a sincronização.'), e };

    let r: ResultadoRevisao;
    if (d.acao === 'publicar') {
      const p = await repo.prescricao(d.versaoId);
      const res = p ? montarPayloadPrescricao(p) : { ok: false as const, erro: 'Esta versão ainda não chegou à nuvem. Aguarde a sincronização e tente de novo.' };
      if (!res.ok) return { s: pend(`Ainda não publicada: ${res.erro}`), e };
      r = await revisao(repo, {
        v, talhao, chaveLocal: chaveLocalPrescricao(L), recursoExistente: resourceId, payload: res.payload, operacao: 'upsert',
        origem: { prescricaoId: d.versaoId, linhagemId: L, versao: ult?.versao ?? null }, opts,
        // Ainda marcada e ainda ESTA a versão mais recente (uma V3 da Lavra
        // gravada no meio vence a V2 lida antes).
        aindaVale: async () => {
          const f = await lerLinhagem(repo, talhaoId, L, v);
          return f.marcada && !!f.ult && !f.ult.removida && f.ult.id === d.versaoId;
        },
      });
      if (r.ok === true) return { s: { ...base, situacao: 'publicada', revisao: r.revisao, resourceId: r.resourceId, criada: r.criada }, e };
      if (r.ok === 'diferente') return { s: pend(r.revisao ? `A versão atual ainda não foi publicada (a PrecisionFarm tem a revisão ${r.revisao}).` : 'Ainda não publicada.'), e };
      if (r.ok === false) return { s: pend(`Ainda não publicada: ${r.erro}`), e };
    } else {
      // arquivar: snapshot completo da última publicada, operação archive.
      const payload = await repo.payloadDaRevisao(resourceId!, ultimaRev!.revision);
      if (!payload) return { s: pend('Não foi possível ler a última revisão publicada para arquivá-la.'), e };
      r = await revisao(repo, {
        v, talhao, chaveLocal: chaveLocalPrescricao(L), recursoExistente: resourceId, payload, operacao: 'archive',
        origem: { linhagemId: L, arquivada: d.motivo }, opts,
        // Continua valendo arquivar (ninguém marcou de novo no meio)?
        aindaVale: async () => {
          const f = await lerLinhagem(repo, talhaoId, L, v);
          return decidirLinhagem({ marcada: f.marcada, ultima: f.ult, ultimaOperacao: 'upsert' }).acao === 'arquivar';
        },
      });
      if (r.ok === true) return { s: { ...base, situacao: 'arquivada', motivo: d.motivo, revisao: r.revisao, criada: r.criada }, e };
      if (r.ok === 'diferente') return { s: pend(`${d.motivo} O arquivamento na PrecisionFarm ainda não foi feito.`), e };
      if (r.ok === false) return { s: pend(`Arquivamento não feito: ${r.erro}`), e };
    }
    // r.ok === 'refazer': relê tudo e decide de novo, uma vez.
    if (tentativa >= 2) return { s: pend(MOTIVO_CONCORRENCIA), e };
  }
}

/**
 * Sincroniza (ou, com gravar=false, só avalia) as prescrições do talhão com a
 * PrecisionFarm. Devolve a situação de cada linhagem com estrela ou com algo
 * já publicado. MigracaoPendente (sem a tabela das estrelas) sobe para a rota.
 *
 * Concorrência (tela × Lavra × outra aba): sem trava por talhão — cada
 * linhagem relê estrela/versão antes de gravar e, no 23505 ou se a decisão
 * ficou velha, relê tudo e refaz uma vez (ver `revisao`).
 */
export async function sincronizarPrescricoes(repo: RepoPrescricoesPF, talhaoId: string, opts: OpcoesSincronizacao): Promise<SituacaoLinhagem[]> {
  const agoraIso = () => (opts.agora ? opts.agora() : new Date()).toISOString();
  const estrelas = await repo.estrelas(talhaoId);
  const [v, talhao] = await Promise.all([repo.vinculoDoTalhao(talhaoId), repo.talhao(talhaoId)]);
  const recursos = v ? await repo.recursosPrescricao(v.id) : [];
  const linhagens = [...new Set([
    ...estrelas.map(e => e.linhagem_id),
    ...recursos.map(r => linhagemDaChave(r.chave_local)).filter((l): l is string => !!l),
  ])].sort();

  const saida: SituacaoLinhagem[] = [];
  for (const L of linhagens) {
    let s: SituacaoLinhagem;
    let e: EstadoLinhagem | null = null;
    try {
      ({ s, e } = await sincronizarLinhagem(repo, talhaoId, L, { v, talhao, opts }));
    } catch (err) {
      const msg = err instanceof MigracaoPendente ? err.message : `Falha ao publicar: ${err instanceof Error ? err.message : 'erro desconhecido'}`;
      s = { linhagemId: L, versaoId: null, versao: null, nome: null, marcada: !!estrelas.find(x => x.linhagem_id === L)?.marcada, situacao: 'pendente', motivo: msg, revisao: null, resourceId: null, criada: false };
    }
    if (opts.gravar && (e?.temEstrela ?? estrelas.some(x => x.linhagem_id === L))) {
      try {
        // Prescrição EXCLUÍDA (a linhagem sumiu) que já chegou ao estado final
        // (arquivada lá, ou nunca publicada): a estrela sai sozinha — não há
        // mais cartão para tirá-la, e ela não pode ficar contando para sempre.
        // (Retirada pela Lavra fica marcada: um reenvio da Lavra republica.)
        if (e && e.marcada && !e.ult && (s.situacao === 'arquivada' || s.situacao === 'nao_publicada')) {
          await repo.gravarEstrela(talhaoId, L, false, 'sistema (prescrição excluída)', agoraIso());
          s = { ...s, marcada: false };
        }
        // A última situação fica guardada junto da estrela (tela de lote).
        await repo.registrarSituacao(talhaoId, L, { situacao: s.situacao, motivo: s.motivo, revisao: s.revisao, resource_id: s.resourceId }, agoraIso());
      } catch (err) { console.error('[precisionfarm] falha ao registrar a situação da prescrição', err instanceof Error ? err.message : err); }
    }
    saida.push(s);
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
