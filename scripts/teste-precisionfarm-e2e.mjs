// Integração PrecisionFarm — FASE 2, ponta a ponta com uma PF SIMULADA —
// `npm run teste:precisionfarm-e2e`.
//
// Sobe um servidor HTTPS local (certificado autoassinado gerado com openssl na
// hora, numa pasta temporária) que imita a API 0.2.0 da PrecisionFarm:
// GET /resources/{id}/revisions/{n}, /fields/{id}/inventory, /changes e
// POST /receipts (conferindo Bearer + HMAC dos recibos). Do lado da Invicta
// roda o código de VERDADE (recebimento.ts, clientePF.ts, linhas.ts) com um
// repositório EM MEMÓRIA no lugar do Supabase — a mesma porta RepoRecebimento.
//
// Cobre: aviso assinado → fila → 202; repetido; 409; 401/413/422/404; busca e
// validação da revisão; snapshot + vigente; ordem fora de sequência sem
// regressão; geometria inválida → rejected mantendo a vigente; falha
// temporária com backoff; recibo com reenvio; archive; recuperação por
// /changes com cursor gravado só depois de enfileirar; carga inicial pelo
// inventário; redirect recusado; resposta grande demais; vínculo suspenso.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checksumEnvelope } from '../src/lib/precisionfarm/contrato.ts';
import { criarClientePF } from '../src/lib/precisionfarm/clientePF.ts';
import { assinarHmac, estadoDasRevisoes, situacaoCamada, verificarAssinatura } from '../src/lib/precisionfarm/linhas.ts';
import {
  cargaInicial, enfileirar, processarFila, receberNotificacao, recuperarPorChanges, reenviarRecibos, rotinaPeriodica, tentarDeNovo,
} from '../src/lib/precisionfarm/recebimento.ts';

// Certificado autoassinado só deste teste: o processo aceita qualquer
// certificado. O código de produção continua exigindo https:// e a validação
// normal do Node.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.removeAllListeners('warning');

let ok = 0, fail = 0;
async function t(nome, fn) {
  try { await fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.stack ?? e.message); }
}

const PONTE = new URL('../docs/integracao-precisionfarm/ponte-0.2/', import.meta.url);
const lerJson = nome => JSON.parse(readFileSync(new URL(nome, PONTE), 'utf8'));

// ── Certificado e PF simulada ───────────────────────────────────────────────
const pasta = mkdtempSync(join(tmpdir(), 'pf-e2e-'));
try {
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(pasta, 'k.pem'), '-out', join(pasta, 'c.pem'),
    '-days', '1', '-subj', '/CN=127.0.0.1'], { stdio: 'ignore' });
} catch {
  console.error('Este teste precisa do openssl no PATH (gera o certificado da PF simulada).');
  process.exit(1);
}

const CHAVE_PF_PARA_INVICTA = 'chave-que-a-pf-emitiu-para-a-invicta';
const HMAC_ENTRADA = 'segredo-pf-para-invicta';
const HMAC_SAIDA = 'segredo-invicta-para-pf';
const CHAVE_INVICTA_PARA_PF = 'invpf_chave_de_teste';

const IDS = {
  shared_producer_id: '00000002-1111-4111-8111-000000000002',
  shared_farm_id: '00000003-1111-4111-8111-000000000003',
  shared_field_id: '00000004-1111-4111-8111-000000000004',
};
const RES = '00000005-1111-4111-8111-000000000005';
const RES2 = '0000000a-1111-4111-8111-00000000000a';
const ev_id = n => `00000001-1111-4111-8111-${String(n).padStart(12, '0')}`;

/** Estado da PF simulada. */
const pf = {
  revisoes: new Map(),          // `${rid}:${n}` → envelope (ou { status, corpo, headers })
  falhas: new Map(),            // `${rid}:${n}` → nº de 503 a devolver antes de responder
  redirect: new Set(),          // `${rid}:${n}` → responde 302
  grande: new Set(),            // `${rid}:${n}` → corpo de 11 MB
  changes: [],                  // eventos
  inventario: [],               // itens
  recibos: [],                  // recibos aceitos
  recibosFalhar: 0,             // quantos POST /receipts respondem 500
  recibosRecusados: [],         // recibos com assinatura/chave errada
};

function linhas(n, extra = {}) {
  const base = lerJson('exemplo-linhas.json').payload;
  return {
    ...base, ...extra,
    geometry: extra.geometry ?? { type: 'FeatureCollection', features: [
      { type: 'Feature', id: `g${n}`, properties: { kind: 'guidance', sequence: 1 }, geometry: { type: 'LineString', coordinates: [[-50, -24], [-49.999 + n * 1e-6, -23.999]] } },
      { type: 'Feature', id: `h${n}`, properties: { kind: 'headland' }, geometry: { type: 'LineString', coordinates: [[-50.001, -24.001], [-49.998, -24.001]] } },
    ] },
  };
}

/** Publica uma revisão na PF simulada e devolve o EVENTO (aviso). */
function publicar(rid, n, a = {}) {
  const envelope = {
    contract_version: '0.2.0', event_id: a.eventId ?? ev_id(n + (rid === RES2 ? 100 : 0)), source_system: 'precisionfarm', ...IDS, ...(a.ids ?? {}),
    resource_id: rid, resource_type: a.tipo ?? 'guidance', resource_revision: n, base_revision: n - 1,
    boundary_revision: a.boundary ?? 1, occurred_at: '2026-10-27T12:00:00Z', operation: a.operacao ?? 'upsert',
    payload: a.payload ?? (a.operacao === 'archive' ? {} : linhas(n)),
  };
  const checksum = checksumEnvelope(envelope);
  pf.revisoes.set(`${rid}:${n}`, a.servido ?? envelope);
  const { payload: _p, ...evento } = envelope; void _p;
  return { ...evento, checksum };
}

const servidor = createServer({ key: readFileSync(join(pasta, 'k.pem')), cert: readFileSync(join(pasta, 'c.pem')) }, (req, res) => {
  const corpo = [];
  req.on('data', c => corpo.push(c));
  req.on('end', () => {
    const responder = (status, obj, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(obj == null ? '' : JSON.stringify(obj)); };
    if (req.headers.authorization !== `Bearer ${CHAVE_PF_PARA_INVICTA}`) return responder(401, { error: { code: 'unauthorized' } });
    const u = new URL(req.url, 'https://pf.local');
    const p = u.pathname.replace(/^\/integration\/v1/, '');
    let m;
    if (req.method === 'GET' && (m = /^\/resources\/([^/]+)\/revisions\/(\d+)$/.exec(p))) {
      const k = `${m[1]}:${m[2]}`;
      if (pf.redirect.has(k)) return responder(302, null, { location: 'https://outro.exemplo/x' });
      if (pf.grande.has(k)) { res.writeHead(200, { 'content-type': 'application/json' }); res.end('"' + 'x'.repeat(11 * 1024 * 1024) + '"'); return; }
      const f = pf.falhas.get(k) ?? 0;
      if (f > 0) { pf.falhas.set(k, f - 1); return responder(503, { error: { code: 'disabled' } }); }
      const env = pf.revisoes.get(k);
      return env ? responder(200, env) : responder(404, { error: { code: 'not_found' } });
    }
    if (req.method === 'GET' && (m = /^\/fields\/([^/]+)\/inventory$/.exec(p))) {
      if (m[1] !== IDS.shared_field_id) return responder(404, { error: { code: 'not_found' } });
      return responder(200, { items: pf.inventario, next_cursor: String(pf.inventario.length), has_more: false });
    }
    if (req.method === 'GET' && p === '/changes') {
      const c = Number(u.searchParams.get('cursor') ?? '0');
      const l = Number(u.searchParams.get('limit') ?? '100');
      const items = pf.changes.slice(c, c + l);
      return responder(200, { items, next_cursor: String(c + items.length), has_more: c + items.length < pf.changes.length });
    }
    if (req.method === 'POST' && p === '/receipts') {
      const bytes = Buffer.concat(corpo);
      const v = verificarAssinatura({ segredo: HMAC_SAIDA, timestamp: req.headers['x-pf-timestamp'], assinatura: req.headers['x-pf-signature'], corpo: bytes, agoraS: Math.floor(Date.now() / 1000) });
      if (!v.ok) { pf.recibosRecusados.push(v.erro); return responder(401, { error: { code: 'unauthorized' } }); }
      if (pf.recibosFalhar > 0) { pf.recibosFalhar--; return responder(500, { error: { code: 'internal' } }); }
      pf.recibos.push(JSON.parse(bytes.toString('utf8')));
      return responder(200, { ok: true });
    }
    return responder(404, { error: { code: 'not_found' } });
  });
});
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
const porta = servidor.address().port;
const cfg = { baseUrl: `https://127.0.0.1:${porta}/integration/v1`, chave: CHAVE_PF_PARA_INVICTA, hmacEntrada: HMAC_ENTRADA, hmacSaida: HMAC_SAIDA };

// ── Repositório em memória (mesma porta do Supabase) ────────────────────────
function criarRepoMemoria() {
  const s = {
    vinculos: [{ id: 'v1', talhao_id: 'TAL-1', parceria: 'producao', empresa_id: null, status: 'confirmado', ...IDS }],
    eventos: [], camadas: new Map(), revisoes: new Map(), cursor: '0', seq: 0, falharInsercao: false,
    descartes: [], falharDescarte: false, falharLeituraFila: false,
  };
  const cp = o => structuredClone(o);
  const existente = e => (e ? { id: e.id, conteudoHash: e.conteudo_hash, status: e.status } : null);
  const reabrir = (e, agora) => Object.assign(e, { status: 'pendente', tentativas: 0, proxima_tentativa_em: agora, travado_ate: null, ultimo_erro: null,
    processado_em: null, recibo_status: null, recibo_motivo: null, recibo_enviado_em: null, recibo_tentativas: 0, recibo_proxima_em: null, recibo_erro: null });
  const repo = {
    async eventoExistente(id) { return existente(s.eventos.find(e => e.event_id === id.toLowerCase())); },
    async reabrirEvento(id, agora) { const e = s.eventos.find(x => x.id === id); if (e?.status === 'rejeitado') reabrir(e, agora); },
    async reabrirRejeitadosDaCamada(rid, agora) {
      const alvo = s.eventos.filter(e => e.resource_id === rid && e.status === 'rejeitado');
      alvo.forEach(e => reabrir(e, agora));
      return alvo.length;
    },
    async registrarDescarte(d, agora) {
      if (s.falharDescarte) throw new Error('banco fora do ar (simulado)');
      s.descartes.push({ ...cp(d), registrado_em: agora });
    },
    async vinculoDoCampo(f) { return cp(s.vinculos.find(v => v.shared_field_id === f.toLowerCase()) ?? null); },
    async camada(rid) { return cp(s.camadas.get(rid) ?? null); },
    async criarCamada(a) {
      if (s.camadas.has(a.resource_id)) return;
      s.camadas.set(a.resource_id, { ...a, revisao_vigente: null, revisao_geometria: null, arquivada: false, arquivada_em: null, nome: null, integration_name: null,
        cropping_cycle: null, operation_category: null, spacing_m: null, boundary_revision: null, ultimo_erro: null, ultimo_erro_em: null, ultima_sincronizacao_em: null });
    },
    async inserirEvento(row) {
      if (s.falharInsercao) throw new Error('banco fora do ar (simulado)');
      const ex = s.eventos.find(e => e.event_id === row.event_id);
      if (ex) return { inserido: false, existente: existente(ex) };
      s.eventos.push({ id: ++s.seq, ...cp(row), status: 'pendente', tentativas: 0, proxima_tentativa_em: new Date(0).toISOString(), ultimo_erro: null,
        travado_ate: null, recibo_status: null, recibo_motivo: null, recibo_enviado_em: null, recibo_tentativas: 0, recibo_proxima_em: null, recibo_erro: null });
      return { inserido: true };
    },
    async eventosProntos(agora, limite) {
      if (s.falharLeituraFila) throw new Error('banco fora do ar (simulado)');
      return cp(s.eventos.filter(e => e.status === 'pendente' && e.proxima_tentativa_em <= agora && (!e.travado_ate || e.travado_ate < agora)).slice(0, limite));
    },
    async travarEvento(id, agora, ate) {
      const e = s.eventos.find(x => x.id === id);
      if (!e || e.status !== 'pendente' || (e.travado_ate && e.travado_ate >= agora)) return false;
      e.travado_ate = ate; return true;
    },
    async atualizarEvento(id, patch, seReciboProximaEm) {
      const e = s.eventos.find(x => x.id === id);
      if (seReciboProximaEm !== undefined && e.recibo_proxima_em !== seReciboProximaEm) return;
      Object.assign(e, cp(patch));
    },
    async revisaoGuardada(rid, n) {
      const r = s.revisoes.get(`${rid}:${n}`);
      return r ? { checksum: r.checksum, operation: r.operation, boundary_revision: r.boundary_revision, meta: r.meta ? (({ bytes, ...m }) => { void bytes; return m; })(r.meta) : null } : null;
    },
    async guardarRevisao(row) {
      const k = `${row.resource_id}:${row.revision}`;
      if (s.revisoes.has(k)) return 'existe';
      s.revisoes.set(k, Object.freeze(cp(row))); return 'ok';
    },
    async promoverVigente(rid, p, agora) {
      const c = s.camadas.get(rid);
      if (!c || !(c.revisao_vigente == null || c.revisao_vigente < p.revisao_vigente)) return false;
      Object.assign(c, { revisao_vigente: p.revisao_vigente, arquivada: p.arquivada, arquivada_em: p.arquivada_em, boundary_revision: p.boundary_revision, ultimo_erro: null, ultimo_erro_em: null, atualizado_em: agora });
      if (p.geometria) Object.assign(c, { revisao_geometria: p.geometria.revisao, nome: p.geometria.meta.nome, integration_name: p.geometria.meta.integrationName,
        cropping_cycle: p.geometria.meta.ciclo, operation_category: p.geometria.meta.categoria, spacing_m: p.geometria.meta.espacamentoM });
      return true;
    },
    async marcarSincronizada(rid, agora) { s.camadas.get(rid).ultima_sincronizacao_em = agora; },
    async registrarErroCamada(rid, motivo, agora) { Object.assign(s.camadas.get(rid), { ultimo_erro: motivo, ultimo_erro_em: agora }); },
    async recibosPendentes(agora, limite) {
      return cp(s.eventos.filter(e => e.recibo_status && !e.recibo_enviado_em && e.recibo_proxima_em && e.recibo_proxima_em <= agora).slice(0, limite));
    },
    async lerCursor() { return s.cursor; },
    async gravarCursor(c) { s.cursor = c; },
  };
  return { repo, s };
}

// ── Ambiente ────────────────────────────────────────────────────────────────
let relogio = new Date();
const { repo, s } = criarRepoMemoria();
const amb = { repo, pf: criarClientePF(cfg, { timeoutMs: 5000 }), agora: () => relogio };
const avancar = seg => { relogio = new Date(relogio.getTime() + seg * 1000); };
const ESCOPO = { parceria: 'producao', empresaId: null };
const deps = { cfg, autenticar: async a => (a === `Bearer ${CHAVE_INVICTA_PARA_PF}` ? ESCOPO : null) };

function aviso(evento, a = {}) {
  const corpo = a.corpo ?? JSON.stringify(evento);
  const ts = a.ts ?? String(Math.floor(relogio.getTime() / 1000));
  const sig = a.sig ?? assinarHmac(a.segredo ?? HMAC_ENTRADA, ts, corpo);
  return new Request('https://invicta.test/integration/v1/notifications', {
    method: 'POST', body: corpo,
    headers: { 'content-type': 'application/json', authorization: a.auth ?? `Bearer ${CHAVE_INVICTA_PARA_PF}`, 'x-pf-timestamp': ts, 'x-pf-signature': sig },
  });
}
const enviar = async (evento, a) => receberNotificacao(amb, aviso(evento, a), deps);
const camada = rid => s.camadas.get(rid);
const pendentes = rid => s.eventos.filter(e => e.resource_id === rid && e.status === 'pendente').length;
const evento = id => s.eventos.find(e => e.event_id === id);

// ── Cenários ────────────────────────────────────────────────────────────────
console.log('Aviso (POST /notifications)');
const e1 = publicar(RES, 1);
await t('aviso assinado e válido → 202, na fila ANTES de processar, camada "sincronizando"', async () => {
  const r = await enviar(e1);
  assert.equal(r.status, 202, JSON.stringify(r.corpo));
  assert.equal(r.corpo.event_id, e1.event_id);
  assert.equal(s.eventos.length, 1);
  assert.equal(evento(e1.event_id).status, 'pendente');
  assert.equal(situacaoCamada({ ultimoErro: camada(RES).ultimo_erro }, pendentes(RES)), 'sincronizando');
});
await t('mesmo event_id e mesmo conteúdo (reformatado) → 202 sem duplicar', async () => {
  const r = await enviar(e1, { corpo: JSON.stringify(e1, null, 2) });
  assert.equal(r.status, 202); assert.equal(r.corpo.duplicate, true);
  assert.equal(s.eventos.length, 1);
});
await t('mesmo event_id com conteúdo diferente → 409', async () => {
  const r = await enviar({ ...e1, boundary_revision: 7 });
  assert.equal(r.status, 409);
  assert.equal(s.eventos.length, 1);
});
await t('assinatura errada, timestamp vencido, chave errada → 401 (nada na fila)', async () => {
  assert.equal((await enviar(e1, { segredo: 'outro' })).status, 401);
  assert.equal((await enviar(e1, { ts: String(Math.floor(relogio.getTime() / 1000) - 301) })).status, 401);
  assert.equal((await enviar(e1, { auth: 'Bearer chave-errada' })).status, 401);
  assert.equal(s.eventos.length, 1);
});
await t('corpo acima de 256 KB → 413; JSON inválido/fora do contrato → 422; tipo não suportado → 422', async () => {
  assert.equal((await enviar(e1, { corpo: JSON.stringify({ ...e1, x: 'y'.repeat(260 * 1024) }) })).status, 413);
  assert.equal((await enviar(e1, { corpo: '{nao json' })).status, 422);
  assert.equal((await enviar({ ...e1, event_id: ev_id(900), extra: true })).status, 422);
  const zonas = await enviar({ ...e1, event_id: ev_id(901), resource_type: 'management_zones' });
  assert.equal(zonas.status, 422); assert.equal(zonas.corpo.error.code, 'unsupported_resource_type');
});
await t('talhão fora do vínculo → 404; produtor/fazenda que não batem → 409', async () => {
  assert.equal((await enviar({ ...e1, event_id: ev_id(902), shared_field_id: '00000099-1111-4111-8111-000000000099' })).status, 404);
  assert.equal((await enviar({ ...e1, event_id: ev_id(903), shared_farm_id: '00000098-1111-4111-8111-000000000098' })).status, 409);
  assert.equal(s.eventos.length, 1);
});

console.log('Processamento');
await t('processa: busca a revisão, valida, guarda snapshot, vira vigente, recibo applied assinado', async () => {
  const r = await processarFila(amb);
  assert.equal(r.aplicados, 1, JSON.stringify(r));
  const c = camada(RES);
  assert.equal(c.revisao_vigente, 1); assert.equal(c.revisao_geometria, 1);
  assert.equal(c.nome, 'linhas_verao'); assert.equal(c.cropping_cycle, 'summer'); assert.equal(c.operation_category, 'planting'); assert.equal(c.spacing_m, 7.8);
  assert.ok(c.ultima_sincronizacao_em);
  assert.ok(s.revisoes.has(`${RES}:1`));
  assert.deepEqual(pf.recibos, [{ event_id: e1.event_id, status: 'applied', reason: null }]);
  assert.deepEqual(pf.recibosRecusados, []);
  assert.equal(situacaoCamada({ ultimoErro: c.ultimo_erro }, pendentes(RES)), 'atualizado');
});
await t('revisão 3 antes da 2: 3 vira vigente; 2 é guardada e NÃO regride', async () => {
  const e3 = publicar(RES, 3); const e2 = publicar(RES, 2);
  assert.equal((await enviar(e3)).status, 202);
  await processarFila(amb);
  assert.equal(camada(RES).revisao_vigente, 3);
  assert.equal((await enviar(e2)).status, 202);
  await processarFila(amb);
  assert.equal(camada(RES).revisao_vigente, 3);
  assert.equal(camada(RES).revisao_geometria, 3);
  assert.ok(s.revisoes.has(`${RES}:2`));
  assert.equal(evento(e2.event_id).status, 'aplicado');
  assert.deepEqual(pf.recibos.map(x => x.status), ['applied', 'applied', 'applied']);
});
await t('geometria inválida (polígono) → rejected com motivo; vigente mantida; erro visível na camada', async () => {
  const e4 = publicar(RES, 4, { payload: linhas(4, { geometry: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { kind: 'guidance' }, geometry: { type: 'Polygon', coordinates: [[[-50, -24], [-49, -24], [-49, -23], [-50, -24]]] } }] } }) });
  await enviar(e4);
  const r = await processarFila(amb);
  assert.equal(r.rejeitados, 1);
  assert.equal(camada(RES).revisao_vigente, 3);
  assert.match(camada(RES).ultimo_erro, /Polygon/);
  assert.equal(situacaoCamada({ ultimoErro: camada(RES).ultimo_erro }, pendentes(RES)), 'erro');
  assert.equal(s.revisoes.has(`${RES}:4`), false, 'revisão inválida não entra no espelho');
  const rec = pf.recibos.at(-1);
  assert.equal(rec.event_id, e4.event_id); assert.equal(rec.status, 'rejected'); assert.match(rec.reason, /Polygon/);
});
await t('checksum do aviso diferente da revisão servida → rejected', async () => {
  const e5 = publicar(RES, 5);
  const adulterado = structuredClone(pf.revisoes.get(`${RES}:5`));
  adulterado.payload.spacing_m = 9;
  pf.revisoes.set(`${RES}:5`, adulterado);
  await enviar(e5);
  await processarFila(amb);
  assert.equal(evento(e5.event_id).status, 'rejeitado');
  assert.match(evento(e5.event_id).ultimo_erro, /Checksum não confere/);
  assert.equal(camada(RES).revisao_vigente, 3);
  // A PF republica a 5 corretamente com OUTRO evento: entra e limpa o erro.
});
await t('falha temporária (503) → adiado com backoff de 10 s; depois aplica e limpa o erro', async () => {
  const e6 = publicar(RES, 6);
  pf.falhas.set(`${RES}:6`, 1);
  await enviar(e6);
  let r = await processarFila(amb);
  assert.equal(r.adiados, 1);
  const ev = evento(e6.event_id);
  assert.equal(ev.status, 'pendente'); assert.equal(ev.tentativas, 1); assert.match(ev.ultimo_erro, /503/);
  assert.equal(new Date(ev.proxima_tentativa_em).getTime() - relogio.getTime(), 10_000);
  r = await processarFila(amb);
  assert.equal(r.aplicados + r.adiados, 0, 'antes do backoff, nada');
  avancar(11);
  r = await processarFila(amb);
  assert.equal(r.aplicados, 1);
  assert.equal(camada(RES).revisao_vigente, 6);
  assert.equal(camada(RES).ultimo_erro, null);
});
await t('recibo que falha (500) fica pendente e é reenviado depois do backoff', async () => {
  const e7 = publicar(RES, 7);
  pf.recibosFalhar = 1;
  const antes = pf.recibos.length;
  await enviar(e7);
  await processarFila(amb);
  const ev = evento(e7.event_id);
  assert.equal(ev.status, 'aplicado');
  assert.equal(ev.recibo_enviado_em, null); assert.match(ev.recibo_erro, /500/);
  assert.equal(pf.recibos.length, antes);
  avancar(11);
  const r = await reenviarRecibos(amb);
  assert.equal(r.enviados, 1);
  assert.deepEqual(pf.recibos.at(-1), { event_id: e7.event_id, status: 'applied', reason: null });
  assert.ok(evento(e7.event_id).recibo_enviado_em);
});
await t('redirect da PF é recusado (temporário, mensagem clara); resposta > 10 MB é rejeitada', async () => {
  const e8 = publicar(RES, 8);
  pf.redirect.add(`${RES}:8`);
  await enviar(e8);
  await processarFila(amb);
  assert.equal(evento(e8.event_id).status, 'pendente');
  assert.match(evento(e8.event_id).ultimo_erro, /redirecionamento/);
  pf.redirect.delete(`${RES}:8`);
  pf.grande.add(`${RES}:8`);
  avancar(30);
  await processarFila(amb);
  assert.equal(evento(e8.event_id).status, 'rejeitado');
  assert.match(evento(e8.event_id).ultimo_erro, /maior que/);
  pf.grande.delete(`${RES}:8`);
});
await t('archive: camada arquivada, linhas da última upsert e histórico preservados', async () => {
  const e9 = publicar(RES, 9, { operacao: 'archive' });
  await enviar(e9);
  await processarFila(amb);
  const c = camada(RES);
  assert.equal(c.revisao_vigente, 9); assert.equal(c.arquivada, true);
  assert.equal(c.arquivada_em, '2026-10-27T12:00:00Z', 'data do arquivamento NA PF (occurred_at)');
  assert.equal(c.revisao_geometria, 7, 'a tela ainda sabe desenhar a última upsert (rev. 7)');
  // O estado incremental da camada bate com o recalculado das revisões guardadas.
  const revs = [...s.revisoes.values()].filter(r => r.resource_id === RES).map(r => ({ revision: r.revision, operation: r.operation }));
  assert.deepEqual(revs.map(r => r.revision).sort((a, b) => a - b), [1, 2, 3, 6, 7, 9]);
  assert.deepEqual(estadoDasRevisoes(revs), { vigente: c.revisao_vigente, arquivada: c.arquivada, revisaoGeometria: c.revisao_geometria });
});

console.log('Recuperação por /changes');
await t('enfileira só guidance do vínculo; cursor gravado depois; upsert novo desarquiva', async () => {
  const e10 = publicar(RES, 10);
  const outroTipo = { ...publicar(RES, 11, { tipo: 'boundary', eventId: ev_id(500) }), resource_id: '0000000b-1111-4111-8111-00000000000b' };
  const foraVinculo = { ...publicar(RES, 12, { eventId: ev_id(501) }), shared_field_id: '00000099-1111-4111-8111-000000000099' };
  pf.changes = [e1, { resource_id: RES, event: e10 }, outroTipo, foraVinculo];
  const r = await recuperarPorChanges(amb, ESCOPO);
  assert.equal(r.novos, 1); assert.equal(r.repetidos, 1); assert.equal(r.ignorados, 2);
  assert.equal(s.cursor, '4');
  await processarFila(amb);
  assert.equal(camada(RES).revisao_vigente, 10); assert.equal(camada(RES).arquivada, false); assert.equal(camada(RES).revisao_geometria, 10);
  const de_novo = await recuperarPorChanges(amb, ESCOPO);
  assert.equal(de_novo.novos + de_novo.repetidos, 0); assert.equal(s.cursor, '4');
});
await t('falha ao enfileirar NÃO avança o cursor', async () => {
  pf.changes.push(publicar(RES, 13));
  s.falharInsercao = true;
  await assert.rejects(recuperarPorChanges(amb, ESCOPO));
  assert.equal(s.cursor, '4');
  s.falharInsercao = false;
  const r = await recuperarPorChanges(amb, ESCOPO);
  assert.equal(r.novos, 1); assert.equal(s.cursor, '5');
});

console.log('Carga inicial (inventário)');
await t('enfileira o `event` de cada guidance (event_id DELES); sem event é contado; outros tipos ignorados', async () => {
  const eA = publicar(RES2, 1);
  pf.inventario = [
    { resource_id: RES2, resource_type: 'guidance', resource_revision: 1, event: eA },
    { resource_id: '0000000c-1111-4111-8111-00000000000c', resource_type: 'guidance', resource_revision: 1 },
    { resource_id: '0000000d-1111-4111-8111-00000000000d', resource_type: 'management_zones', resource_revision: 1, event: { ...eA, resource_type: 'management_zones' } },
  ];
  const r = await cargaInicial(amb, IDS.shared_field_id, ESCOPO);
  assert.equal(r.novos, 1); assert.equal(r.semEvento, 1); assert.equal(r.ignorados, 1);
  assert.equal(evento(eA.event_id).origem, 'inventario');
  const rot = await rotinaPeriodica(amb, ESCOPO, 20_000);
  assert.equal(rot.falhaInterna, false);
  assert.ok(rot.etapas.fila.aplicados >= 1, JSON.stringify(rot));
  assert.equal(camada(RES2).revisao_vigente, 1);
  assert.equal(camada(RES2).talhao_id, 'TAL-1');
});

console.log('Vínculo');
await t('vínculo suspenso entre o aviso e o processamento → rejected', async () => {
  const eB = publicar(RES2, 2);
  await enfileirar(amb, eB, 'notificacao', ESCOPO);
  s.vinculos[0].status = 'suspenso';
  await processarFila(amb);
  assert.equal(evento(eB.event_id).status, 'rejeitado');
  assert.match(evento(eB.event_id).ultimo_erro, /vínculo/);
  assert.equal(camada(RES2).revisao_vigente, 1);
  assert.equal((await enviar(publicar(RES2, 3))).status, 404, 'aviso novo com vínculo suspenso → 404');
  s.vinculos[0].status = 'confirmado';
});
await t('aviso REJEITADO que chega de novo igual (reaviso/changes/Buscar) é reaberto e aplicado', async () => {
  const eB = s.eventos.find(e => e.resource_id === RES2 && e.resource_revision === 2).evento;
  const r = await enviar(eB);
  assert.equal(r.status, 202); assert.equal(r.corpo.reopened, true);
  assert.equal(evento(eB.event_id).status, 'pendente');
  assert.equal(evento(eB.event_id).recibo_status, null, 'recibo zerado: o novo resultado sai depois');
  await processarFila(amb);
  assert.equal(evento(eB.event_id).status, 'aplicado');
  assert.equal(camada(RES2).revisao_vigente, 2);
  assert.deepEqual(pf.recibos.at(-1), { event_id: eB.event_id, status: 'applied', reason: null });
});

console.log('Correções da verificação nº 1');
await t('M1: revisão sem kind / kind desconhecido é APLICADA e anotada no histórico', async () => {
  const semKind = linhas(3, { geometry: { type: 'FeatureCollection', features: [
    { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[-50, -24], [-49.99, -24]] } },
    { type: 'Feature', properties: { kind: 'row' }, geometry: { type: 'LineString', coordinates: [[-50, -24.001], [-49.99, -24.001]] } },
  ] } });
  const e = publicar(RES2, 3, { payload: semKind });
  await enviar(e);
  await processarFila(amb);
  assert.equal(evento(e.event_id).status, 'aplicado');
  assert.equal(camada(RES2).revisao_vigente, 3);
  assert.match(s.revisoes.get(`${RES2}:3`).meta.observacao, /2 feição\(ões\) sem properties.kind.*row/);
});
await t('M1: "Tentar de novo" reabre as recusadas da camada (revisão antiga recusada de novo não põe a camada em erro — B3)', async () => {
  const n = await tentarDeNovo(amb, RES);
  assert.ok(n >= 3, `reabertos: ${n}`);
  // A PF corrigiu a revisão 5 (antes servida adulterada): agora entra no histórico.
  pf.revisoes.set(`${RES}:5`, (() => { const x = structuredClone(pf.revisoes.get(`${RES}:6`)); return x; })());
  avancar(1);
  await processarFila(amb, { limite: 50 });
  const c = camada(RES);
  assert.ok(c.revisao_vigente >= 10);
  assert.equal(c.ultimo_erro, null, 'recusa de revisão MENOR que a vigente não marca erro');
  assert.equal(evento(ev_id(4)).status, 'rejeitado', 'o polígono continua recusado');
});
await t('B1: event_id reutilizado com outro resource_id → 409 sem criar camada órfã', async () => {
  const antes = s.camadas.size;
  const r = await enviar({ ...e1, resource_id: '0000000e-1111-4111-8111-00000000000e' });
  assert.equal(r.status, 409);
  assert.equal(s.camadas.size, antes);
});
await t('M2: 404 da PF é temporário nas primeiras tentativas e só vira recusa quando o backoff esgota', async () => {
  const e = publicar(RES2, 4);
  pf.revisoes.delete(`${RES2}:4`);
  await enviar(e);
  for (let i = 1; i <= 9; i++) {
    await processarFila(amb);
    assert.equal(evento(e.event_id).status, 'pendente', `tentativa ${i}`);
    assert.equal(evento(e.event_id).tentativas, i);
    avancar(3601);
  }
  await processarFila(amb);
  assert.equal(evento(e.event_id).status, 'rejeitado');
  assert.match(evento(e.event_id).ultimo_erro, /404.*Desistimos depois de 10 tentativas/);
});
await t('B6: item inválido de /changes é registrado ANTES de o cursor andar; falha ao registrar não avança', async () => {
  const cursor0 = s.cursor;
  pf.changes.push({ resource_id: RES, event: { event_id: 'nao-e-uuid', resource_type: 'guidance' } });
  s.falharDescarte = true;
  await assert.rejects(recuperarPorChanges(amb, ESCOPO));
  assert.equal(s.cursor, cursor0);
  s.falharDescarte = false;
  const r = await recuperarPorChanges(amb, ESCOPO);
  assert.equal(r.invalidos, 1);
  assert.equal(s.descartes.length, 1);
  assert.equal(s.descartes[0].origem, 'changes'); assert.match(s.descartes[0].motivo, /fora do contrato/);
  assert.equal(s.cursor, String(pf.changes.length));
});
await t('B2: rotina com o banco fora do ar → falhaInterna (rota responde 500); PF fora do ar não', async () => {
  s.falharLeituraFila = true;
  const r = await rotinaPeriodica(amb, ESCOPO, 5_000);
  assert.equal(r.falhaInterna, true);
  s.falharLeituraFila = false;
  const pfFora = { ...amb, pf: criarClientePF({ ...cfg, baseUrl: 'https://127.0.0.1:1/integration/v1' }, { timeoutMs: 1000 }) };
  const r2 = await rotinaPeriodica(pfFora, ESCOPO, 5_000);
  assert.equal(r2.falhaInterna, false, JSON.stringify(r2.etapas));
  assert.ok(r2.etapas.changes.erro);
});
await t('nenhum recibo saiu com assinatura inválida', async () => {
  assert.deepEqual(pf.recibosRecusados, []);
});

servidor.close();
rmSync(pasta, { recursive: true, force: true });
console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
