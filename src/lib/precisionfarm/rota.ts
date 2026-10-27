// Handlers das rotas da integração PrecisionFarm.
//
// Dois públicos, duas autenticações:
//   • /integration/v1/*   → a PrecisionFarm, com a chave Bearer da integração
//     (integracao_chaves, sistema 'precisionfarm'). Só LÊ o que foi publicado,
//     e só dos vínculos CONFIRMADOS (vinculosNoEscopo). Sem kill-switch: com
//     chave válida responde (Q2).
//   • /api/precisionfarm/* → a tela do talhão, com a SESSÃO do usuário
//     (access_token do Supabase) e papel owner/admin (autenticarUsuario).
//     Cria/edita o vínculo e publica revisões.
//
// Corpo de erro do lado PF: { "error": { "code", "message" } } com os status do
// contrato (401 · 404 · 413 · 422). Contrato: docs/integracao-precisionfarm.md.

import { randomUUID } from 'node:crypto';
import {
  CHAVE_LOCAL_ZONAS, MAX_ENVELOPE_BYTES_INVICTA, PARCERIA_PADRAO, RE_UUID,
  bytesDoEnvelope, capabilities, chaveLocalColheita, checksumEnvelope, corpoNaoImplementado, dataContrato, eventoDoEnvelope, idsParaNovoVinculo,
  impressaoConteudo, itemInventario, lerPaginacao, mensagemTamanho, montarEnvelope, montarPayloadColheita,
  montarPayloadZonas, paginar, periodoDoContrato, seasonDoContrato, validarEnvelope, vigentes, vinculosNoEscopo,
  type EscopoChave, type ResultadoPayload, type TipoRecurso,
} from './contrato.ts';
import {
  ConflitoIntegracao, atualizarVinculo, autenticarPrecisionFarm, autenticarUsuario, carregarTalhao, carregarTalhoes, clienteDaFazenda,
  clienteServico, envelopeDaRevisao, gradeProdutividade, inserirRevisao, inserirVinculo, mapaProdutividade,
  obterOuCriarRecurso, recursoPorId, servicoConfigurado, ultimaRevisao, vigentesDoVinculo, vinculoDoCampo,
  vinculoDoTalhao, vinculoPorId, vinculosConfirmados, vinculosParaReuso, zoneamentoPadrao,
  type VinculoRow,
} from './servidor.ts';

const CABECALHOS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

const json = (corpo: unknown, status: number, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CABECALHOS, ...extra } });

const erroPF = (status: number, code: string, message: string) => json({ error: { code, message } }, status);

/** Ambiente informado em /capabilities (Vercel: production | preview | development). */
function ambiente(): string {
  return process.env.VERCEL_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'development');
}

// ═════════════════════════════════════════════════════════════════════════════
// Lado PrecisionFarm — /integration/v1/*
// ═════════════════════════════════════════════════════════════════════════════

async function comChave(req: Request, fn: (sb: ReturnType<typeof clienteServico>, escopo: EscopoChave) => Promise<Response>): Promise<Response> {
  // Ambiente sem service role é erro de configuração NOSSO (500), não o 503 de
  // "integração desabilitada" do contrato — não há kill-switch (Q2).
  if (!servicoConfigurado()) return erroPF(500, 'server_misconfigured', 'Serviço de integração não configurado neste ambiente.');
  const sb = clienteServico();
  try {
    const chave = await autenticarPrecisionFarm(sb, req.headers.get('authorization'));
    if (!chave) return erroPF(401, 'unauthorized', 'Chave ausente, inválida ou revogada. Envie Authorization: Bearer <chave>.');
    return await fn(sb, { parceria: chave.parceria, empresaId: chave.empresaId });
  } catch (e) {
    console.error('[precisionfarm]', e);
    return erroPF(500, 'internal_error', 'Falha interna ao ler a integração.');
  }
}

export function tratarCapabilities(req: Request): Promise<Response> {
  return comChave(req, async () => json(capabilities(ambiente()), 200));
}

/** /changes, /notifications, /receipts — previstos no 0.2.0, fora da fase 1.
 *  501 em JSON (no formato de erro) em vez do 404 HTML do Next: o worker da PF
 *  entende que a rota existe no contrato mas ainda não foi ligada. */
export function tratarNaoImplementado(rota: string): Response {
  return json(corpoNaoImplementado(rota), 501);
}

/** Qualquer outro caminho sob /integration/v1 — 404 em JSON, não a página do Next. */
export function tratarRotaDesconhecida(): Response {
  return erroPF(404, 'not_found', 'Rota inexistente no contrato 0.2.0.');
}

export function tratarCatalogo(req: Request): Promise<Response> {
  return comChave(req, async (sb, escopo) => {
    const url = new URL(req.url);
    const pag = lerPaginacao(url.searchParams.get('cursor'), url.searchParams.get('limit'));
    if (!pag.ok) return erroPF(422, 'invalid_request', pag.erro);
    const alcancados = vinculosNoEscopo(await vinculosConfirmados(sb, escopo.parceria), escopo);
    const pagina = paginar(alcancados, pag.offset, pag.limit);
    const talhoes = await carregarTalhoes(sb, pagina.items.map(v => v.talhao_id));
    return json({
      ...pagina,
      items: pagina.items.map(v => {
        const t = talhoes.get(v.talhao_id);
        return {
          shared_producer_id: v.shared_producer_id,
          shared_farm_id: v.shared_farm_id,
          shared_field_id: v.shared_field_id,
          invicta_field_id: v.talhao_id,
          precisionfarm_field_id: v.pf_local_id,
          name: t?.nome ?? null,
          boundary_revision: t?.geoVersao ?? null,
          status: 'confirmed',
          confirmed_at: v.confirmado_em ? dataContrato(new Date(v.confirmado_em)) : null,
        };
      }),
    }, 200);
  });
}

export function tratarInventario(req: Request, sharedFieldId: string): Promise<Response> {
  return comChave(req, async (sb, escopo) => {
    if (!RE_UUID.test(sharedFieldId)) return erroPF(422, 'invalid_request', 'shared_field_id deve ser um UUID.');
    const url = new URL(req.url);
    const pag = lerPaginacao(url.searchParams.get('cursor'), url.searchParams.get('limit'));
    if (!pag.ok) return erroPF(422, 'invalid_request', pag.erro);
    const v = await vinculoDoCampo(sb, sharedFieldId.toLowerCase());
    if (!v || !vinculosNoEscopo([v], escopo).length) return erroPF(404, 'not_found', 'Talhão fora do vínculo ou inexistente.');
    const { revisoes } = await vigentesDoVinculo(sb, v.id);
    const itens = vigentes(revisoes.map(r => ({ ...r, resource_revision: r.revision })));
    const pagina = paginar(itens, pag.offset, pag.limit);
    return json({
      ...pagina,
      items: pagina.items.map(r => itemInventario({
        resource_id: r.resource_id,
        resource_type: r.evento.resource_type,
        resource_revision: r.revision,
        boundary_revision: r.boundary_revision,
        name: r.name ?? '',
        checksum: r.checksum,
        evento: r.evento,
        season: r.season,
        season_period: r.season_period,
      })),
    }, 200);
  });
}

export function tratarRevisao(req: Request, resourceId: string, n: string): Promise<Response> {
  return comChave(req, async (sb, escopo) => {
    if (!RE_UUID.test(resourceId)) return erroPF(422, 'invalid_request', 'id deve ser um UUID.');
    if (!/^[1-9]\d{0,8}$/.test(n)) return erroPF(422, 'invalid_request', 'n deve ser um inteiro >= 1.');
    const naoAchou = () => erroPF(404, 'not_found', 'Recurso fora do vínculo ou inexistente.');
    const rec = await recursoPorId(sb, resourceId.toLowerCase());
    if (!rec) return naoAchou();
    const v = await vinculoPorId(sb, rec.vinculo_id);
    if (!v || !vinculosNoEscopo([v], escopo).length) return naoAchou();
    const r = await envelopeDaRevisao(sb, rec.resource_id, Number(n));
    if (!r) return naoAchou();
    // ETag = checksum da revisão (o mesmo do inventário): conferência barata.
    return json(r.envelope, 200, { etag: `"${r.checksum}"` });
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Lado Invicta — /api/precisionfarm/* (sessão do usuário, owner/admin)
// ═════════════════════════════════════════════════════════════════════════════

type Sb = ReturnType<typeof clienteServico>;
type Usuario = { email: string };

async function comUsuario(req: Request, fn: (sb: Sb, u: Usuario) => Promise<Response>): Promise<Response> {
  if (!servicoConfigurado()) return json({ ok: false, erro: 'Serviço de integração não configurado neste ambiente.' }, 500);
  const sb = clienteServico();
  const u = await autenticarUsuario(sb, req.headers.get('authorization'));
  if (!u.ok) return json({ ok: false, erro: u.erro }, u.status);
  try {
    return await fn(sb, { email: u.email });
  } catch (e) {
    console.error('[precisionfarm]', e);
    return json({ ok: false, erro: e instanceof Error ? e.message : 'Falha interna.' }, 500);
  }
}

function vinculoParaTela(v: VinculoRow | null) {
  if (!v) return null;
  return {
    status: v.status,
    sharedProducerId: v.shared_producer_id,
    sharedFarmId: v.shared_farm_id,
    sharedFieldId: v.shared_field_id,
    pfLocalId: v.pf_local_id,
    criadoPor: v.criado_por, criadoEm: v.criado_em,
    confirmadoPor: v.confirmado_por, confirmadoEm: v.confirmado_em,
    suspensoPor: v.suspenso_por, suspensoEm: v.suspenso_em,
  };
}

/** GET /api/precisionfarm/talhao/{id} — vínculo + o que está publicado. */
export function tratarEstado(req: Request, talhaoId: string): Promise<Response> {
  return comUsuario(req, async sb => {
    const v = await vinculoDoTalhao(sb, talhaoId, PARCERIA_PADRAO);
    let publicados: unknown[] = [];
    if (v) {
      const { recursos, revisoes } = await vigentesDoVinculo(sb, v.id);
      const porRecurso = new Map(recursos.map(r => [r.resource_id, r]));
      publicados = vigentes(revisoes.map(r => ({ ...r, resource_revision: r.revision })))
        .map(r => ({
          resourceId: r.resource_id,
          tipo: porRecurso.get(r.resource_id)?.resource_type ?? r.evento.resource_type,
          chaveLocal: porRecurso.get(r.resource_id)?.chave_local ?? '',
          revisao: r.revision,
          nome: r.name,
          season: r.season, seasonPeriod: r.season_period,
          checksum: r.checksum,
          boundaryRevision: r.boundary_revision,
          publicadoEm: r.publicado_em,
          publicadoPor: r.publicado_por,
          tamanhoBytes: r.tamanho_bytes,
        }))
        .sort((a, b) => String(b.publicadoEm).localeCompare(String(a.publicadoEm)));
    }
    return json({ ok: true, vinculo: vinculoParaTela(v), publicados }, 200);
  });
}

type AcaoVinculo = 'criar' | 'salvar' | 'confirmar' | 'suspender';

/** POST /api/precisionfarm/vinculo — { talhaoId, acao, pfLocalId? } */
export function tratarVinculo(req: Request): Promise<Response> {
  return comUsuario(req, async (sb, u) => {
    const corpo = await req.json().catch(() => null) as { talhaoId?: unknown; acao?: unknown; pfLocalId?: unknown } | null;
    const talhaoId = typeof corpo?.talhaoId === 'string' ? corpo.talhaoId.trim() : '';
    const acao = corpo?.acao as AcaoVinculo;
    if (!talhaoId || !['criar', 'salvar', 'confirmar', 'suspender'].includes(acao)) {
      return json({ ok: false, erro: 'Informe talhaoId e acao (criar | salvar | confirmar | suspender).' }, 400);
    }
    const pfLocalId = typeof corpo?.pfLocalId === 'string' ? corpo.pfLocalId.trim().slice(0, 200) : undefined;
    const agora = new Date().toISOString();
    const atual = await vinculoDoTalhao(sb, talhaoId, PARCERIA_PADRAO);

    if (acao === 'criar') {
      if (atual) return json({ ok: true, vinculo: vinculoParaTela(atual) }, 200);
      const t = await carregarTalhao(sb, talhaoId);
      if (!t) return json({ ok: false, erro: 'Este talhão ainda não está na nuvem. Aguarde a sincronização e tente de novo.' }, 404);
      const clienteId = await clienteDaFazenda(sb, t.fazendaId);
      const existentes = await vinculosParaReuso(sb, PARCERIA_PADRAO, clienteId, t.fazendaId);
      const ids = idsParaNovoVinculo({ parceria: PARCERIA_PADRAO, clienteId, fazendaId: t.fazendaId }, existentes, randomUUID);
      try {
        const novo = await inserirVinculo(sb, {
          parceria: PARCERIA_PADRAO, empresa_id: t.empresaId, talhao_id: t.id, fazenda_id: t.fazendaId, cliente_id: clienteId, ...ids,
          pf_local_id: pfLocalId || null, status: 'pendente', criado_por: u.email,
        });
        return json({ ok: true, vinculo: vinculoParaTela(novo) }, 201);
      } catch (e) {
        // Dois cliques/abas ao mesmo tempo: o segundo bate no unique. 409 limpo.
        if (e instanceof ConflitoIntegracao) return json({ ok: false, erro: e.message }, 409);
        throw e;
      }
    }

    if (!atual) return json({ ok: false, erro: 'Este talhão ainda não tem vínculo. Gere os identificadores primeiro.' }, 404);

    if (acao === 'salvar') {
      if (atual.status === 'confirmado') {
        return json({ ok: false, erro: 'Vínculo confirmado: suspenda antes de trocar o ID da PrecisionFarm.' }, 409);
      }
      const v = await atualizarVinculo(sb, atual.id, { pf_local_id: pfLocalId || null });
      return json({ ok: true, vinculo: vinculoParaTela(v) }, 200);
    }
    if (acao === 'confirmar') {
      // Já confirmado: nada muda — e o ID da PF NÃO pode ser trocado por aqui
      // (mesma trava do "salvar": suspender antes).
      if (atual.status === 'confirmado') {
        if (pfLocalId && pfLocalId !== atual.pf_local_id) {
          return json({ ok: false, erro: 'Vínculo já confirmado: suspenda antes de trocar o ID da PrecisionFarm.' }, 409);
        }
        return json({ ok: true, vinculo: vinculoParaTela(atual) }, 200);
      }
      const idPf = pfLocalId || atual.pf_local_id || '';
      if (!idPf) return json({ ok: false, erro: 'Informe o ID do talhão na PrecisionFarm antes de confirmar.' }, 422);
      const v = await atualizarVinculo(sb, atual.id, { pf_local_id: idPf, status: 'confirmado', confirmado_por: u.email, confirmado_em: agora });
      return json({ ok: true, vinculo: vinculoParaTela(v) }, 200);
    }
    // suspender
    const v = await atualizarVinculo(sb, atual.id, { status: 'suspenso', suspenso_por: u.email, suspenso_em: agora });
    return json({ ok: true, vinculo: vinculoParaTela(v) }, 200);
  });
}

/**
 * POST /api/precisionfarm/publicar
 *   { talhaoId, tipo: 'zonas', zoneamentoId?, geoVersao? }
 *   { talhaoId, tipo: 'colheita', mapaId, geoVersao? }
 *
 * Lê a camada NA NUVEM (o que a PF vai receber é o que está sincronizado, não
 * o rascunho do navegador) e confere com o que a tela mostra: zoneamento padrão
 * e versão do limite diferentes = sincronização pendente → 409.
 * Publicação idêntica (mesma impressão de conteúdo) não cria revisão nova.
 */
export function tratarPublicacao(req: Request): Promise<Response> {
  return comUsuario(req, async (sb, u) => {
    const corpo = await req.json().catch(() => null) as { talhaoId?: unknown; tipo?: unknown; zoneamentoId?: unknown; mapaId?: unknown; geoVersao?: unknown } | null;
    const talhaoId = typeof corpo?.talhaoId === 'string' ? corpo.talhaoId.trim() : '';
    const tipo = corpo?.tipo;
    if (!talhaoId || (tipo !== 'zonas' && tipo !== 'colheita')) {
      return json({ ok: false, erro: 'Informe talhaoId e tipo (zonas | colheita).' }, 400);
    }

    const t = await carregarTalhao(sb, talhaoId);
    if (!t) return json({ ok: false, erro: 'Este talhão ainda não está na nuvem. Aguarde a sincronização e tente de novo.' }, 404);
    const v = await vinculoDoTalhao(sb, talhaoId, PARCERIA_PADRAO);
    if (!v) return json({ ok: false, erro: 'Este talhão não tem vínculo com a PrecisionFarm. Gere os identificadores primeiro.' }, 409);
    if (v.status === 'suspenso') return json({ ok: false, erro: 'O vínculo deste talhão está suspenso. Confirme-o de novo antes de publicar.' }, 409);
    if (typeof corpo?.geoVersao === 'number' && corpo.geoVersao !== t.geoVersao) {
      return json({ ok: false, erro: `O limite do talhão aqui (versão ${corpo.geoVersao}) ainda não chegou à nuvem (versão ${t.geoVersao}). Aguarde a sincronização e publique de novo.` }, 409);
    }

    let res: ResultadoPayload;
    let tipoRecurso: TipoRecurso;
    let chaveLocal: string;
    let season: string | null = null;
    let periodo: string | null = null;
    let origem: Record<string, unknown>;

    if (tipo === 'zonas') {
      const z = await zoneamentoPadrao(sb, talhaoId);
      if (!z) return json({ ok: false, erro: 'Não há zoneamento padrão deste talhão na nuvem. Marque um zoneamento como padrão e aguarde sincronizar.' }, 409);
      if (typeof corpo?.zoneamentoId === 'string' && corpo.zoneamentoId && corpo.zoneamentoId !== z.id) {
        return json({ ok: false, erro: 'O zoneamento padrão na nuvem ainda é outro (sincronização pendente). Aguarde alguns segundos e publique de novo.' }, 409);
      }
      res = montarPayloadZonas({ nome: `Zonas de manejo — ${t.nome}${z.nome ? ` (${z.nome})` : ''}`, fc: z.fc });
      tipoRecurso = 'management_zones';
      chaveLocal = CHAVE_LOCAL_ZONAS;
      origem = { zoneamentoId: z.id, zoneamentoNome: z.nome };
    } else {
      const mapaId = typeof corpo?.mapaId === 'string' ? corpo.mapaId.trim() : '';
      if (!mapaId) return json({ ok: false, erro: 'Informe o mapa de colheita (mapaId).' }, 400);
      const m = await mapaProdutividade(sb, mapaId);
      if (!m) return json({ ok: false, erro: 'Este mapa de colheita ainda não está na nuvem. Aguarde a sincronização e tente de novo.' }, 409);
      if (m.talhaoId !== talhaoId) return json({ ok: false, erro: 'Este mapa de colheita é de outro talhão.' }, 404);
      if (!m.oficial) return json({ ok: false, erro: 'Só o mapa OFICIAL da safra/época é publicado. Marque-o como oficial (estrela) e aguarde sincronizar.' }, 409);
      season = seasonDoContrato(m.safra);
      if (!season) return json({ ok: false, erro: `A safra "${m.safra}" não está no formato AA/AA (ex.: 26/27). Corrija o ano do mapa antes de publicar.` }, 422);
      const p = periodoDoContrato(m.epoca);
      if (!p) return json({ ok: false, erro: 'Defina a época de cultivo do mapa (Verão, Safrinha ou Inverno) antes de publicar — sem ela a PrecisionFarm não sabe em qual época pôr a colheita.' }, 422);
      periodo = p;
      const grade = await gradeProdutividade(sb, talhaoId, mapaId);
      if (!grade) return json({ ok: false, erro: 'A grade deste mapa não foi encontrada na nuvem. Abra o mapa na aba Produtividade (ou reprocesse) e tente de novo.' }, 409);
      res = montarPayloadColheita({ nome: `Colheita oficial — ${t.nome} ${m.safra} ${m.cultura}`.trim(), season, periodo: p, cultura: m.cultura, grade });
      tipoRecurso = 'harvest';
      chaveLocal = chaveLocalColheita(season, p);
      origem = { mapaId: m.id, versao: m.versao, safra: m.safra, epoca: m.epoca, cultura: m.cultura };
    }
    if (!res.ok) return json({ ok: false, erro: res.erro }, 422);

    const ids = { shared_producer_id: v.shared_producer_id, shared_farm_id: v.shared_farm_id, shared_field_id: v.shared_field_id };

    // Tamanho ANTES de criar qualquer linha: o envelope de prova tem os mesmos
    // campos (UUIDs de mesmo comprimento) — a conta de bytes é a mesma.
    const prova = montarEnvelope({ ids, resourceId: randomUUID(), tipo: tipoRecurso, revisao: 1, boundaryRevision: t.geoVersao, eventId: randomUUID(), quando: new Date(), payload: res.payload });
    const bytesProva = bytesDoEnvelope(prova);
    if (bytesProva > MAX_ENVELOPE_BYTES_INVICTA) return json({ ok: false, erro: mensagemTamanho(bytesProva, res.nFeicoes) }, 413);

    const recurso = await obterOuCriarRecurso(sb, { vinculoId: v.id, talhaoId, tipo: tipoRecurso, chaveLocal });
    const ultima = await ultimaRevisao(sb, recurso.resource_id);
    const envelope = montarEnvelope({
      ids, resourceId: recurso.resource_id, tipo: tipoRecurso, revisao: (ultima?.revision ?? 0) + 1,
      boundaryRevision: t.geoVersao, eventId: randomUUID(), quando: new Date(), payload: res.payload,
    });
    const errosSchema = validarEnvelope(envelope);
    if (errosSchema.length) return json({ ok: false, erro: `Envelope fora do contrato: ${errosSchema.join('; ')}` }, 500);

    const conteudoHash = impressaoConteudo(envelope);
    if (ultima && ultima.conteudo_hash === conteudoHash) {
      return json({
        ok: true, criada: false, resourceId: recurso.resource_id, revisao: ultima.revision, checksum: ultima.checksum,
        mensagem: `Nada mudou desde a revisão ${ultima.revision} — nenhuma revisão nova foi criada.`,
      }, 200);
    }

    const checksum = checksumEnvelope(envelope);
    const tamanhoBytes = bytesDoEnvelope(envelope);
    const { payload: _p, ...evento } = envelope;
    void _p;
    const ins = await inserirRevisao(sb, {
      envelope, evento, checksum, conteudoHash, tamanhoBytes,
      name: String(res.payload.name ?? ''), season, seasonPeriod: periodo, origem, publicadoPor: u.email,
    });
    if (!ins.ok) return json({ ok: false, erro: ins.erro }, ins.conflito ? 409 : 500);
    return json({
      ok: true, criada: true, resourceId: recurso.resource_id, revisao: envelope.resource_revision,
      checksum, tamanhoBytes, nFeicoes: res.nFeicoes, evento: eventoDoEnvelope(envelope, checksum),
    }, 201);
  });
}
