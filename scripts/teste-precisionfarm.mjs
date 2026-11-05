// Integração PrecisionFarm 0.2.0 (src/lib/precisionfarm/contrato.ts) —
// `npm run teste:precisionfarm`.
//
// O que este arquivo protege:
//  1. CHECKSUM — o mesmo cálculo de ASSINATURA_EXEMPLO.mjs (reproduz o
//     3a2572c7…601 do exemplo-linhas.json); asset.url/expires_at fora.
//  2. SCHEMA — a cópia embutida é a do envelope.schema.json e todo envelope
//     gerado (zonas e colheita) passa nela.
//  3. PAYLOADS — zonas com zone_id texto, potential_rank 1..N real (inclusive
//     acima de 5), n_zones, ids únicos; colheita em células kg/ha, nodata fora.
//  4. IDEMPOTÊNCIA — republicar o mesmo conteúdo dá a mesma impressão, mesmo
//     com event_id/occurred_at/revisão diferentes.
//  5. SAFRA/ÉPOCA — "26/27" → "2026/2027"; verao/safrinha/inverno →
//     main/second/winter; época vazia recusa.
//  6. PAGINAÇÃO e ESCOPO — cursor opaco em string, limite 200; só vínculos
//     confirmados (e da empresa da chave).
//  7. LIMITE DA PF — leitura defensiva do payload de 'boundary' (Polygon,
//     MultiPolygon com furo, Feature, FeatureCollection; inválido recusado sem
//     reparo), comparação (plataforma × UTM 22S, diferença simétrica) e busca
//     sob demanda no inventário de uma PF simulada.
//  8. TELA DE LOTE — manifesto da PF (formato da Figueira, SHA-256, defeito
//     por item), casamento por geometria (1:1 ≤ 5 % pré-marcado, > 5 % sem
//     marcar, ambíguo, sem par, dois da PF no mesmo nosso, duplicatas, conflito
//     de identidade), a conferência do servidor antes de criar e a execução em
//     lote (concorrência, ordem, falha isolada, pulado × erro). Com
//     PF_MANIFESTO_REAL=<pasta> confere também o manifesto real da Figueira.
//  9. MANIFESTO v2 (VINCULOS.json + LIMITES.geojson, 04/11) — leitura e
//     validação estrita dos limites por shared_field_id, > 5 % marcado (Q3),
//     fazenda dividida e conflito de reuso (Q2), substituição do pendente sem
//     ID PF permitida e negada (Q5), a conferência do servidor (substituição,
//     um shared_farm_id por fazenda) e o retorno (VINCULOS.json + relatório).
//     Com PF_ATIVACAO_REAL=<pasta> e PF_CASAMENTO_REF=<casamento-162.json>
//     roda o pacote real de 162 talhões.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canonico, checksumEnvelope, impressaoConteudo, montarEnvelope, eventoDoEnvelope, validarEnvelope,
  SCHEMA_ENVELOPE, seasonDoContrato, periodoDoContrato, cropDoContrato, chaveLocalColheita,
  montarPayloadZonas, montarPayloadColheita, bytesDoEnvelope, MAX_ENVELOPE_BYTES_INVICTA,
  lerPaginacao, paginar, vinculosNoEscopo, itemInventario, vigentes, capabilities, idsParaNovoVinculo,
  LIMITE_PAGINA_MAX, PARCERIA_PADRAO, posicaoDaClasse, uuidDeterministico, corpoNaoImplementado,
} from '../src/lib/precisionfarm/contrato.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

const PONTE = new URL('../docs/integracao-precisionfarm/ponte-0.2/', import.meta.url);
const lerJson = nome => JSON.parse(readFileSync(new URL(nome, PONTE), 'utf8'));

const IDS = {
  shared_producer_id: '00000002-1111-4111-8111-000000000002',
  shared_farm_id: '00000003-1111-4111-8111-000000000003',
  shared_field_id: '00000004-1111-4111-8111-000000000004',
};
const RES = '00000007-1111-4111-8111-000000000007';
const EV = '00000006-1111-4111-8111-000000000006';
const QUANDO = new Date('2026-10-22T15:00:00.000Z');
const quad = (x, y, d = 0.001) => ({ type: 'Polygon', coordinates: [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]] });

// ── 1. Checksum ─────────────────────────────────────────────────────────────
console.log('Checksum');
t('reproduz o checksum 3a2572c7…601 do exemplo-linhas.json', () => {
  assert.equal(checksumEnvelope(lerJson('exemplo-linhas.json')),
    '3a2572c77dbecaa2f1a7e880c8631c9855f58da9240df9025a3b8606bd051601');
});
t('o checksum do inventário de exemplo é o mesmo', () => {
  const inv = lerJson('exemplo-inventario.json');
  assert.equal(inv.items[0].event.checksum, checksumEnvelope(lerJson('exemplo-linhas.json')));
});
t('canônico ordena chaves recursivamente e mantém a ordem dos arrays', () => {
  assert.equal(canonico({ b: 1, a: { d: [3, 1], c: null } }), '{"a":{"c":null,"d":[3,1]},"b":1}');
});
t('asset.url e asset.expires_at ficam fora; sha256 do asset entra', () => {
  const base = { ...lerJson('exemplo-colheita.json') };
  base.payload = { ...base.payload, asset: { format: 'image/tiff', crs: 'EPSG:4326', size_bytes: 10, sha256: 'ab', url: 'https://x/1', expires_at: '2026-10-23T00:00:00Z' } };
  const outro = structuredClone(base);
  outro.payload.asset.url = 'https://x/2';
  delete outro.payload.asset.expires_at;
  assert.equal(checksumEnvelope(base), checksumEnvelope(outro));
  outro.payload.asset.sha256 = 'cd';
  assert.notEqual(checksumEnvelope(base), checksumEnvelope(outro));
  assert.equal(base.payload.asset.url, 'https://x/1', 'não pode mutar o original');
});

// ── 2. Schema ───────────────────────────────────────────────────────────────
console.log('Schema');
t('a cópia embutida é idêntica ao envelope.schema.json', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(SCHEMA_ENVELOPE)), lerJson('envelope.schema.json'));
});
t('exemplos da PF passam no validador', () => {
  for (const n of ['exemplo-linhas.json', 'exemplo-zonas.json', 'exemplo-colheita.json']) {
    assert.deepEqual(validarEnvelope(lerJson(n)), [], n);
  }
});
t('validador recusa campo a mais, uuid ruim, revisão 0 e data sem fuso', () => {
  const e = lerJson('exemplo-zonas.json');
  assert.ok(validarEnvelope({ ...e, checksum: 'x' }).some(m => m.includes('checksum')));
  assert.ok(validarEnvelope({ ...e, event_id: 'abc' }).some(m => m.includes('event_id')));
  assert.ok(validarEnvelope({ ...e, resource_revision: 0 }).some(m => m.includes('resource_revision')));
  assert.ok(validarEnvelope({ ...e, occurred_at: '2026-10-22 15:00' }).some(m => m.includes('occurred_at')));
  const { payload: _p, ...semPayload } = e; void _p;
  assert.ok(validarEnvelope(semPayload).some(m => m.includes('payload')));
});

// ── 3. Payload de zonas ─────────────────────────────────────────────────────
console.log('Zonas');
const zf = (id, zona, classe, x, extra = {}) => ({ type: 'Feature', properties: { id, zona, classe, cor: '#000', areaHa: 1, potencialRank: 0, ...extra }, geometry: quad(x, -24) });
const fcDe = feats => ({ type: 'FeatureCollection', features: feats });
const resumo = r => r.payload.geometry.features.map(f => [f.id, f.properties.zone_id, f.properties.potential_rank, f.properties.class_name]);
t('zone_id = rotuloZona (id sufixado → zona), rank fixo da classe, n_zones', () => {
  const r = montarPayloadZonas({ nome: 'Zonas', fc: fcDe([zf('02_2', '02', 'Média', -50), zf('01', '01', 'Alta', -50.01), zf('02', '02', 'Média', -50.02)]) });
  assert.ok(r.ok, r.erro);
  const p = r.payload;
  assert.equal(p.status, 'consolidated'); assert.equal(p.season, null);
  assert.equal(p.semantic, 'productivity_class'); assert.equal(p.value_unit, 'class');
  assert.equal(p.n_zones, 2);
  assert.deepEqual(resumo(r), [['02_2', '02', 3, 'Média'], ['01', '01', 1, 'Alta'], ['02', '02', 3, 'Média']]);
  assert.deepEqual(Object.keys(p.geometry.features[0].properties).sort(), ['class_name', 'potential_rank', 'zone_id']);
});
t('IGEFI 03 real (editado à mão, `zona` velho): publica 02..06 com ranks 2,1,2,5,4', () => {
  // id:zona:classe:potencialRank do zoneamento padrão em produção (meta.edicaoManual).
  const fc = fcDe([
    zf('02', '02', 'Média-alta', -50.00, { potencialRank: 2 }),
    zf('03', '03', 'Alta', -50.01, { potencialRank: 1 }),
    zf('04', '04', 'Média-alta', -50.02, { potencialRank: 2 }),
    zf('05', '04', 'Baixa', -50.03, { potencialRank: 5 }),
    zf('06', '05', 'Média-baixa', -50.04, { potencialRank: 4 }),
  ]);
  const r = montarPayloadZonas({ nome: 'IGEFI 03', fc });
  assert.ok(r.ok, r.erro);
  assert.deepEqual(resumo(r), [
    ['02', '02', 2, 'Média-alta'], ['03', '03', 1, 'Alta'], ['04', '04', 2, 'Média-alta'],
    ['05', '05', 5, 'Baixa'], ['06', '06', 4, 'Média-baixa'],
  ]);
  assert.equal(r.payload.n_zones, 5);
});
t('reclassificar à mão: segue a CLASSE, não `zona` nem potencialRank velhos', () => {
  // Zona 03 reclassificada para Alta no editor: `zona` e potencialRank ficaram velhos.
  const fc = fcDe([zf('01', '01', 'Alta', -50, { potencialRank: 1 }), zf('03', '03', 'Alta', -50.01, { potencialRank: 3 }), zf('05', '05', 'Baixa', -50.02, { potencialRank: 5 })]);
  const r = montarPayloadZonas({ nome: 'Z', fc });
  assert.ok(r.ok, r.erro);
  assert.deepEqual(resumo(r).map(x => x.slice(1, 3)), [['01', 1], ['03', 1], ['05', 5]]);
});
t('unificar à mão: polígonos da mesma zona com a mesma classe passam', () => {
  const fc = fcDe([zf('02', '02', 'Média', -50), zf('02_2', '02', 'Média', -50.01), zf('02_3', '02', 'Média', -50.02)]);
  const r = montarPayloadZonas({ nome: 'Z', fc });
  assert.ok(r.ok, r.erro);
  assert.deepEqual(resumo(r).map(x => x[1]), ['02', '02', '02']);
  assert.equal(r.payload.n_zones, 1);
});
t('mesma zona (rotuloZona) com classes diferentes → recusa com mensagem', () => {
  const fc = fcDe([zf('01', '01', 'Alta', -50), zf('01_2', '01', 'Baixa', -50.01)]);
  const r = montarPayloadZonas({ nome: 'Z', fc });
  assert.equal(r.ok, false);
  assert.match(r.erro, /zona 01 tem polígonos de classes diferentes \(Alta, Baixa\)/);
});
t('"Nível N" → rank N; acima de 5 manda o rank real e n_zones = nº de zonas', () => {
  const feats = Array.from({ length: 7 }, (_, i) => zf(String(i + 1).padStart(2, '0'), i + 1, `Nível ${i + 1}`, -50 + i * 0.01));
  const r = montarPayloadZonas({ nome: 'Z', fc: fcDe(feats) });
  assert.ok(r.ok, r.erro);
  assert.equal(r.payload.n_zones, 7);
  assert.deepEqual(r.payload.geometry.features.map(f => f.properties.potential_rank), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(r.payload.geometry.features.map(f => f.properties.zone_id), ['01', '02', '03', '04', '05', '06', '07']);
});
t('classe fora da escala: potencialRank (denso) se único por zona', () => {
  const fc = fcDe([zf('z1', '1', 'Solo arenoso', -50, { potencialRank: 4 }), zf('z2', '2', 'Solo argiloso', -50.01, { potencialRank: 0 }), zf('z1b', '1', 'Solo arenoso', -50.02, { potencialRank: 4 })]);
  const r = montarPayloadZonas({ nome: 'Z', fc });
  assert.ok(r.ok, r.erro);
  assert.deepEqual(resumo(r).map(x => x.slice(1, 3)), [['1', 2], ['2', 1], ['1', 2]]);
});
t('classe fora da escala e potencialRank ambíguo/ausente → recusa', () => {
  const amb = fcDe([zf('z1', '1', 'X', -50, { potencialRank: 1 }), zf('z1b', '1', 'X', -50.01, { potencialRank: 2 })]);
  assert.equal(montarPayloadZonas({ nome: 'Z', fc: amb }).ok, false);
  const sem = fcDe([zf('z1', '1', 'X', -50, { potencialRank: undefined })]);
  assert.equal(montarPayloadZonas({ nome: 'Z', fc: sem }).ok, false);
  // Escala misturada (semáforo + Nível) não é confiável: cai no potencialRank, aqui ambíguo.
  const mista = fcDe([zf('01', '01', 'Alta', -50, { potencialRank: 1 }), zf('02', '02', 'Nível 2', -50.01, { potencialRank: 1 }), zf('02_2', '02', 'Nível 2', -50.02, { potencialRank: 3 })]);
  assert.equal(montarPayloadZonas({ nome: 'Z', fc: mista }).ok, false);
});
t('polígono sem número de zona → recusa', () => {
  const r = montarPayloadZonas({ nome: 'Z', fc: fcDe([zf(null, null, 'Alta', -50)]) });
  assert.equal(r.ok, false);
  assert.match(r.erro, /sem número de zona|não tem número de zona/);
});
t('posição fixa das classes', () => {
  assert.deepEqual(['ALTA', 'média alta', 'Medio', 'MEDIA_BAIXA', 'baixo'].map(c => posicaoDaClasse(c).pos), [1, 2, 3, 4, 5]);
  assert.equal(posicaoDaClasse('Nível 3').pos, 3);
  assert.equal(posicaoDaClasse('Solo'), null);
});
t('id de polígono repetido ganha sufixo; sem id ganha zona-posição', () => {
  const fc = fcDe([zf('x', '01', 'Alta', -50), zf('x', '01', 'Alta', -50.01), zf('', '02', 'Baixa', -50.02)]);
  const r = montarPayloadZonas({ nome: 'Z', fc });
  assert.deepEqual(r.payload.geometry.features.map(f => f.id), ['x', 'x_2', '02-3']);
});
t('geometria que não é área é recusada (sem reparo)', () => {
  const fc = fcDe([{ type: 'Feature', properties: { id: '01', classe: 'Alta' }, geometry: { type: 'Point', coordinates: [-50, -24] } }]);
  const r = montarPayloadZonas({ nome: 'Z', fc });
  assert.equal(r.ok, false);
  assert.match(r.erro, /geometria/);
  assert.equal(montarPayloadZonas({ nome: 'Z', fc: fcDe([]) }).ok, false);
});
t('MultiPolygon e furos passam intactos (coordenadas sem arredondamento)', () => {
  const g = { type: 'MultiPolygon', coordinates: [quad(-50.123456789012345, -24).coordinates, quad(-50.2, -24).coordinates] };
  const r = montarPayloadZonas({ nome: 'Z', fc: fcDe([{ type: 'Feature', properties: { id: '01', classe: 'Alta' }, geometry: g }]) });
  assert.ok(r.ok, r.erro);
  assert.deepEqual(r.payload.geometry.features[0].geometry, g);
});

// ── Envelope de zonas + idempotência ────────────────────────────────────────
console.log('Envelope e idempotência');
const fcZ = { type: 'FeatureCollection', features: [zf('a', '01', 'Alta', -50), zf('b', '02', 'Baixa', -50.01)] };
const envZ = (over = {}) => montarEnvelope({
  ids: IDS, resourceId: RES, tipo: 'management_zones', revisao: 1, boundaryRevision: 3, eventId: EV, quando: QUANDO,
  payload: montarPayloadZonas({ nome: 'Zonas', fc: fcZ }).payload, ...over,
});
t('envelope de zonas valida no schema; base_revision = revisão - 1; data sem ms', () => {
  const e = envZ({ revisao: 4 });
  assert.deepEqual(validarEnvelope(e), []);
  assert.equal(e.base_revision, 3); assert.equal(e.boundary_revision, 3);
  assert.equal(e.occurred_at, '2026-10-22T15:00:00Z');
  assert.equal(e.source_system, 'invicta'); assert.equal(e.contract_version, '0.2.0');
});
t('boundary_revision ausente/0 vira 1 (schema exige >= 1)', () => {
  assert.equal(envZ({ boundaryRevision: 0 }).boundary_revision, 1);
});
t('mesma camada, outro event_id/occurred_at/revisão = MESMA impressão (não cria revisão)', () => {
  const a = envZ();
  const b = envZ({ eventId: '00000099-1111-4111-8111-000000000099', quando: new Date('2027-01-01T00:00:00Z'), revisao: 2 });
  assert.equal(impressaoConteudo(a), impressaoConteudo(b));
  assert.notEqual(checksumEnvelope(a), checksumEnvelope(b), 'o checksum do contrato cobre o envelope inteiro');
});
t('mudou zona, limite ou ids = impressão diferente', () => {
  const a = impressaoConteudo(envZ());
  const fc2 = structuredClone(fcZ); fc2.features[0].properties.classe = 'Média';
  assert.notEqual(a, impressaoConteudo(envZ({ payload: montarPayloadZonas({ nome: 'Zonas', fc: fc2 }).payload })));
  assert.notEqual(a, impressaoConteudo(envZ({ boundaryRevision: 4 })));
  assert.notEqual(a, impressaoConteudo(envZ({ ids: { ...IDS, shared_field_id: '00000005-1111-4111-8111-000000000005' } })));
});
t('evento = envelope sem payload + checksum (formato do inventário)', () => {
  const e = envZ();
  const c = checksumEnvelope(e);
  const ev = eventoDoEnvelope(e, c);
  assert.equal('payload' in ev, false);
  assert.equal(ev.checksum, c);
  assert.deepEqual(Object.keys(ev).sort(), [...Object.keys(lerJson('exemplo-inventario.json').items[0].event)].sort());
});

// ── 4. Colheita ─────────────────────────────────────────────────────────────
console.log('Colheita');
const grade = {
  rows: 2, cols: 3, bounds: [-50, -24.002, -49.997, -24],
  valores: new Float32Array([3500.04, NaN, -1, 4100.26, Infinity, 0]),
};
t('células Polygon em kg/ha; NaN/infinito/negativo omitidos; zero fica', () => {
  const r = montarPayloadColheita({ nome: 'Colheita oficial', season: '2026/2027', periodo: 'main', cultura: 'soja', grade });
  assert.ok(r.ok);
  const p = r.payload;
  assert.equal(p.status, 'available'); assert.equal(p.quantity, 'grain_yield'); assert.equal(p.value_unit, 'kg/ha');
  assert.equal(p.season, '2026/2027'); assert.equal(p.season_period, 'main'); assert.equal(p.crop, 'soybean');
  const fs = p.geometry.features;
  assert.deepEqual(fs.map(f => [f.id, f.properties.value]), [['cell-0', 3500], ['cell-3', 4100.3], ['cell-5', 0]]);
  assert.ok(fs.every(f => f.geometry.type === 'Polygon' && f.properties.value >= 0));
});
t('geometria da célula: norte no topo, bordas dos bounds', () => {
  const r = montarPayloadColheita({ nome: 'C', season: '2026/2027', periodo: 'main', cultura: 'soja', grade });
  const perto = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-12);
  const anel0 = r.payload.geometry.features[0].geometry.coordinates[0];   // linha 0, coluna 0 (NO)
  assert.ok(perto(anel0[0], [-50, -24.001]), JSON.stringify(anel0[0]));
  assert.ok(perto(anel0[2], [-49.999, -24]), JSON.stringify(anel0[2]));
  const anel3 = r.payload.geometry.features[1].geometry.coordinates[0];   // linha 1, coluna 0 (SO)
  assert.ok(Math.abs(anel3[0][1] - -24.002) < 1e-12);
  assert.deepEqual(anel3[0], anel3[4], 'anel fechado');
});
t('envelope de colheita valida no schema', () => {
  const r = montarPayloadColheita({ nome: 'C', season: '2026/2027', periodo: 'second', cultura: 'milho', grade });
  const e = montarEnvelope({ ids: IDS, resourceId: RES, tipo: 'harvest', revisao: 1, boundaryRevision: 1, eventId: EV, quando: QUANDO, payload: r.payload });
  assert.deepEqual(validarEnvelope(e), []);
});
t('grade sem dado, shape errado ou bounds invertidos são recusados', () => {
  const base = { nome: 'C', season: '2026/2027', periodo: 'main', cultura: 'soja' };
  assert.equal(montarPayloadColheita({ ...base, grade: { ...grade, valores: new Float32Array(6).fill(NaN) } }).ok, false);
  assert.equal(montarPayloadColheita({ ...base, grade: { ...grade, rows: 3 } }).ok, false);
  assert.equal(montarPayloadColheita({ ...base, grade: { ...grade, bounds: [-49, -24.002, -50, -24] } }).ok, false);
});
t('colheita grande passa do limite de ~4 MB da Invicta', () => {
  const n = 160; // 25.600 células
  const g = { rows: n, cols: n, bounds: [-50.123456, -24.123456, -50.003456, -24.003456], valores: new Float32Array(n * n).fill(3456.78) };
  const r = montarPayloadColheita({ nome: 'C', season: '2026/2027', periodo: 'main', cultura: 'soja', grade: g });
  const e = montarEnvelope({ ids: IDS, resourceId: RES, tipo: 'harvest', revisao: 1, boundaryRevision: 1, eventId: EV, quando: QUANDO, payload: r.payload });
  assert.ok(bytesDoEnvelope(e) > MAX_ENVELOPE_BYTES_INVICTA, `${bytesDoEnvelope(e)} bytes`);
});

// ── 5. Safra/época ──────────────────────────────────────────────────────────
console.log('Safra e época');
t('safra AA/AA → 20AA/20AA; AAAA/AAAA passa; resto recusa', () => {
  assert.equal(seasonDoContrato('26/27'), '2026/2027');
  assert.equal(seasonDoContrato(' 25/26 '), '2025/2026');
  assert.equal(seasonDoContrato('2026/2027'), '2026/2027');
  assert.equal(seasonDoContrato('2026'), null);
  assert.equal(seasonDoContrato(''), null);
});
t('verao→main, safrinha→second, inverno→winter, vazio→null', () => {
  assert.equal(periodoDoContrato('verao'), 'main');
  assert.equal(periodoDoContrato('safrinha'), 'second');
  assert.equal(periodoDoContrato('inverno'), 'winter');
  assert.equal(periodoDoContrato(''), null);
  assert.equal(periodoDoContrato('outra'), null);
});
t('chave do recurso de colheita = safra+época do contrato (cultura fora)', () => {
  assert.equal(chaveLocalColheita('2026/2027', 'main'), 'harvest|2026/2027|main');
  assert.equal(cropDoContrato('Milho'), 'corn');
  assert.equal(cropDoContrato('sorgo'), 'sorgo');
});

// ── 6. Paginação e escopo ───────────────────────────────────────────────────
console.log('Paginação e escopo');
t('cursor padrão "0", limit padrão 100, máximo 200', () => {
  assert.deepEqual(lerPaginacao(null, null), { ok: true, offset: 0, limit: 100 });
  assert.deepEqual(lerPaginacao('5', '200'), { ok: true, offset: 5, limit: 200 });
  assert.equal(lerPaginacao('0', String(LIMITE_PAGINA_MAX + 1)).ok, false);
  assert.equal(lerPaginacao('0', '0').ok, false);
  assert.equal(lerPaginacao('-1', null).ok, false);
  assert.equal(lerPaginacao('abc', null).ok, false);
  assert.equal(lerPaginacao('0', '1.5').ok, false);
});
t('items, next_cursor string e has_more', () => {
  const l = [1, 2, 3, 4, 5];
  assert.deepEqual(paginar(l, 0, 2), { items: [1, 2], next_cursor: '2', has_more: true });
  assert.deepEqual(paginar(l, 4, 2), { items: [5], next_cursor: '5', has_more: false });
  assert.deepEqual(paginar(l, 9, 2), { items: [], next_cursor: '5', has_more: false });
  assert.deepEqual(paginar([], 0, 100), { items: [], next_cursor: '0', has_more: false });
});
t('escopo: só confirmados DA PARCERIA da chave; chave de empresa só vê a própria', () => {
  const vs = [
    { shared_field_id: 'a', status: 'confirmado', empresa_id: 'e1', parceria: 'producao' },
    { shared_field_id: 'b', status: 'pendente', empresa_id: 'e1', parceria: 'producao' },
    { shared_field_id: 'c', status: 'suspenso', empresa_id: null, parceria: 'producao' },
    { shared_field_id: 'd', status: 'confirmado', empresa_id: 'e2', parceria: 'producao' },
    { shared_field_id: 'e', status: 'confirmado', empresa_id: null, parceria: 'producao' },
    { shared_field_id: 'h', status: 'confirmado', empresa_id: null, parceria: 'homologacao' },
  ];
  assert.deepEqual(vinculosNoEscopo(vs, { parceria: 'producao', empresaId: null }).map(v => v.shared_field_id), ['a', 'd', 'e']);
  assert.deepEqual(vinculosNoEscopo(vs, { parceria: 'producao', empresaId: 'e1' }).map(v => v.shared_field_id), ['a', 'e']);
  assert.deepEqual(vinculosNoEscopo(vs, { parceria: 'homologacao', empresaId: null }).map(v => v.shared_field_id), ['h']);
  assert.equal(PARCERIA_PADRAO, 'producao');
});
t('inventário: só a maior revisão de cada recurso, event com checksum', () => {
  const e1 = envZ(); const e2 = envZ({ revisao: 2 });
  const revs = [e1, e2].map(e => ({ resource_id: e.resource_id, resource_revision: e.resource_revision, e }));
  const v = vigentes(revs);
  assert.equal(v.length, 1); assert.equal(v[0].resource_revision, 2);
  const c = checksumEnvelope(e2);
  const { payload: _p, ...evento } = e2; void _p;
  const item = itemInventario({ resource_id: RES, resource_type: 'management_zones', resource_revision: 2, boundary_revision: 3, name: 'Zonas', checksum: c, evento });
  assert.equal(item.status, 'published'); assert.equal(item.checksum, c);
  assert.equal(item.event.checksum, c); assert.equal(item.event.resource_revision, 2);
  assert.equal('payload' in item.event, false);
});
t('vínculo novo reaproveita UUID do produtor e da fazenda (o mais antigo vence)', () => {
  let n = 0; const novo = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const existentes = [
    { cliente_id: 'cli1', fazenda_id: 'faz1', shared_producer_id: 'P1', shared_farm_id: 'F1' },
    { cliente_id: 'cli1', fazenda_id: 'faz1', shared_producer_id: 'P2', shared_farm_id: 'F2' },
  ];
  assert.deepEqual(idsParaNovoVinculo({ parceria: 'producao', clienteId: 'cli1', fazendaId: 'faz1' }, existentes, novo),
    { shared_producer_id: 'P1', shared_farm_id: 'F1', shared_field_id: '00000000-0000-4000-8000-000000000001' });
  const outraFaz = idsParaNovoVinculo({ parceria: 'producao', clienteId: 'cli1', fazendaId: 'faz2' }, existentes, novo);
  assert.equal(outraFaz.shared_producer_id, 'P1'); assert.notEqual(outraFaz.shared_farm_id, 'F1');
});
t('sem vínculo anterior: produtor/fazenda DETERMINÍSTICOS (corrida de dois talhões da mesma fazenda)', () => {
  let n = 0; const novo = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const a = idsParaNovoVinculo({ parceria: 'producao', clienteId: 'cli9', fazendaId: 'faz9' }, [], novo);
  const b = idsParaNovoVinculo({ parceria: 'producao', clienteId: 'cli9', fazendaId: 'faz9' }, [], novo);
  assert.equal(a.shared_producer_id, b.shared_producer_id);
  assert.equal(a.shared_farm_id, b.shared_farm_id);
  assert.notEqual(a.shared_field_id, b.shared_field_id);
  assert.notEqual(a.shared_producer_id, a.shared_farm_id);
  assert.match(a.shared_farm_id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const h = idsParaNovoVinculo({ parceria: 'homologacao', clienteId: 'cli9', fazendaId: 'faz9' }, [], novo);
  assert.notEqual(h.shared_farm_id, a.shared_farm_id, 'outra parceria, outro UUID');
  assert.equal(uuidDeterministico('x'), uuidDeterministico('x'));
  const semCad = idsParaNovoVinculo({ parceria: 'producao', clienteId: null, fazendaId: null }, [], novo);
  assert.equal(new Set(Object.values(semCad)).size, 3);
});
t('capabilities: versão, tipos, formato, limites; fase 2 recebe avisos de linhas, /changes e /receipts da Invicta seguem 501', () => {
  const c = capabilities('production');
  assert.equal(c.contract_version, '0.2.0'); assert.equal(c.environment, 'production');
  assert.deepEqual(c.resource_types, ['management_zones', 'harvest']);
  assert.deepEqual(c.formats, ['application/geo+json']);
  assert.equal(c.limits.max_geojson_bytes, 10 * 1024 * 1024); assert.equal(c.limits.max_page_size, 200);
  assert.equal(c.features.changes, false); assert.equal(c.features.notifications, true); assert.equal(c.features.receipts, false);
  assert.equal(c.features.hmac, true);
  assert.deepEqual(c.notification_resource_types, ['guidance']);
  assert.ok(c.endpoints.includes('/notifications'));
  assert.deepEqual(c.not_implemented, ['changes', 'receipts']);
  assert.equal(corpoNaoImplementado('/changes').error.code, 'not_implemented');
});

// ═════════════════════════════════════════════════════════════════════════════
// FASE 2 — receber linhas (src/lib/precisionfarm/linhas.ts, acessoTalhao.ts)
// ═════════════════════════════════════════════════════════════════════════════

const L = await import('../src/lib/precisionfarm/linhas.ts');
const { podeVerTalhao } = await import('../src/lib/precisionfarm/acessoTalhao.ts');
const { createHmac } = await import('node:crypto');
const { execFileSync } = await import('node:child_process');
const { fileURLToPath } = await import('node:url');

console.log('Fase 2 — HMAC');
t('reproduz ASSINATURA_EXEMPLO.mjs: a assinatura dele confere aqui e o corpo é um aviso válido', () => {
  const script = fileURLToPath(new URL('ASSINATURA_EXEMPLO.mjs', PONTE));
  const saida = JSON.parse(execFileSync(process.execPath, [script], { encoding: 'utf8' }));
  const ts = saida.headers['X-PF-Timestamp'];
  const corpo = new TextEncoder().encode(saida.body);
  const v = L.verificarAssinatura({ segredo: '0'.repeat(64), timestamp: ts, assinatura: saida.headers['X-PF-Signature'], corpo, agoraS: Number(ts) });
  assert.deepEqual(v, { ok: true });
  assert.equal(L.assinarHmac('0'.repeat(64), ts, saida.body), saida.headers['X-PF-Signature']);
  const ev = JSON.parse(saida.body);
  assert.deepEqual(L.validarEvento(ev), []);
  assert.equal(ev.checksum, lerJson('exemplo-notificacao.json').checksum);
});
t('segredo é TEXTO UTF-8 (não decodifica hex); assinatura = HMAC(ts + "." + corpo) em hex minúsculo', () => {
  const s = 'ab'.repeat(32);
  const esperado = createHmac('sha256', Buffer.from(s, 'utf8')).update('1700000000.{"a":1}').digest('hex');
  assert.equal(L.assinarHmac(s, '1700000000', '{"a":1}'), esperado);
  assert.notEqual(L.assinarHmac(s, '1700000000', '{"a":1}'), createHmac('sha256', Buffer.from(s, 'hex')).update('1700000000.{"a":1}').digest('hex'));
});
t('recusa corpo alterado, timestamp fora de 300 s, maiúsculas, ausente', () => {
  const corpo = new TextEncoder().encode('{"x":1}');
  const sig = L.assinarHmac('seg', '1000', corpo);
  const base = { segredo: 'seg', timestamp: '1000', assinatura: sig, corpo, agoraS: 1000 };
  assert.equal(L.verificarAssinatura(base).ok, true);
  assert.equal(L.verificarAssinatura({ ...base, agoraS: 1300 }).ok, true, '300 s ainda vale');
  assert.equal(L.verificarAssinatura({ ...base, agoraS: 1301 }).ok, false);
  assert.equal(L.verificarAssinatura({ ...base, agoraS: 699 }).ok, false);
  assert.equal(L.verificarAssinatura({ ...base, corpo: new TextEncoder().encode('{"x":2}') }).ok, false);
  assert.equal(L.verificarAssinatura({ ...base, corpo: new TextEncoder().encode('{"x": 1}') }).ok, false, 'reformatar o JSON quebra a assinatura');
  assert.equal(L.verificarAssinatura({ ...base, assinatura: sig.toUpperCase() }).ok, false);
  assert.equal(L.verificarAssinatura({ ...base, assinatura: null }).ok, false);
  assert.equal(L.verificarAssinatura({ ...base, timestamp: 'abc' }).ok, false);
  assert.equal(L.verificarAssinatura({ ...base, segredo: 'outro' }).ok, false);
  assert.equal(L.textosIguais('abc', 'abc'), true); assert.equal(L.textosIguais('abc', 'abd'), false);
});

console.log('Fase 2 — aviso e idempotência');
const notif = () => lerJson('exemplo-notificacao.json');
t('exemplo-notificacao passa; campo a mais, payload, origem invicta, checksum ruim e base_revision errada não', () => {
  assert.deepEqual(L.validarEvento(notif()), []);
  assert.ok(L.validarEvento({ ...notif(), extra: 1 }).length);
  assert.ok(L.validarEvento({ ...notif(), payload: {} }).length);
  assert.ok(L.validarEvento({ ...notif(), source_system: 'invicta' }).some(m => m.includes('source_system')));
  assert.ok(L.validarEvento({ ...notif(), checksum: 'XYZ' }).some(m => m.includes('checksum')));
  assert.ok(L.validarEvento({ ...notif(), base_revision: 5 }).some(m => m.includes('base_revision')));
  const { checksum: _c, ...sem } = notif(); void _c;
  assert.ok(L.validarEvento(sem).some(m => m.includes('checksum')));
});
t('mesmo event_id + mesmo conteúdo (outra formatação/caixa) = repetido; conteúdo diferente = conflito', () => {
  const a = notif();
  const b = JSON.parse(JSON.stringify(a, null, 2));
  b.resource_id = b.resource_id.toUpperCase();
  assert.equal(L.impressaoEvento(a), L.impressaoEvento(b));
  assert.equal(L.decidirDuplicado(null, L.impressaoEvento(a)), 'novo');
  assert.equal(L.decidirDuplicado(L.impressaoEvento(a), L.impressaoEvento(b)), 'repetido');
  assert.equal(L.decidirDuplicado(L.impressaoEvento(a), L.impressaoEvento({ ...a, boundary_revision: 2 })), 'conflito');
});
t('item de /changes: evento direto ou em item.event', () => {
  const e = notif();
  assert.equal(L.eventoDoItem(e), e);
  assert.equal(L.eventoDoItem({ resource_id: 'x', event: e }), e);
});
t('ids do vínculo: os três UUIDs precisam bater (sem diferenciar caixa)', () => {
  const e = notif();
  assert.ok(L.idsBatem(e, { shared_producer_id: e.shared_producer_id.toUpperCase(), shared_farm_id: e.shared_farm_id, shared_field_id: e.shared_field_id }));
  assert.ok(!L.idsBatem(e, { ...e, shared_farm_id: '00000009-1111-4111-8111-000000000009' }));
});

console.log('Fase 2 — revisão e geometria');
t('exemplo-linhas confere com exemplo-notificacao (checksum canônico da fase 1)', () => {
  const r = L.conferirRevisao(lerJson('exemplo-linhas.json'), notif());
  assert.ok(r.ok, r.erro);
});
t('revisão adulterada, de outra revisão ou de outra origem é recusada', () => {
  const env = lerJson('exemplo-linhas.json');
  env.payload.geometry.features[0].geometry.coordinates[1][0] = -49.998;
  assert.match(L.conferirRevisao(env, notif()).erro, /Checksum não confere/);
  assert.match(L.conferirRevisao({ ...lerJson('exemplo-linhas.json'), resource_revision: 2, base_revision: 1 }, notif()).erro, /resource_revision/);
  assert.match(L.conferirRevisao({ ...lerJson('exemplo-linhas.json'), source_system: 'invicta' }, notif()).erro, /source_system/);
  assert.match(L.conferirRevisao({ ...lerJson('exemplo-linhas.json'), extra: 1 }, notif()).erro, /fora do contrato/);
});
const linha = (kind, coords, tipo = 'LineString') => ({ type: 'Feature', properties: { kind }, geometry: { type: tipo, coordinates: coords } });
const payloadL = (features, extra = {}) => ({ name: 'linhas', integration_name: 'linhas_verao', cropping_cycle: 'summer', operation_category: 'planting', spacing_m: 7.8, geometry: { type: 'FeatureCollection', features }, ...extra });
t('payload do exemplo: válido, metadados lidos', () => {
  const r = L.validarPayloadLinhas(lerJson('exemplo-linhas.json').payload);
  assert.ok(r.ok, r.erro);
  assert.deepEqual([r.meta.nome, r.meta.integrationName, r.meta.ciclo, r.meta.categoria, r.meta.espacamentoM, r.meta.nFeicoes, r.meta.nVertices],
    ['linhas_verao', 'linhas_verao', 'summer', 'planting', 7.8, 1, 2]);
});
t('guia + bordadura, MultiLineString, altitude e ciclo nulo passam', () => {
  const r = L.validarPayloadLinhas(payloadL([
    linha('guidance', [[-50, -24], [-49.999, -23.999]]),
    linha('headland', [[[-50, -24], [-50, -23.99], [-49.99, -23.99]], [[-50.1, -24, 800], [-50.2, -24, 801]]], 'MultiLineString'),
  ], { cropping_cycle: null, spacing_m: null }));
  assert.ok(r.ok, r.erro);
  assert.equal(r.meta.nVertices, 7);
});
t('kind ausente ou desconhecido NÃO recusa: vira linha guia, contado e anotado para o histórico', () => {
  const r = L.validarPayloadLinhas(payloadL([
    linha('guidance', [[-50, -24], [-50, -23]]),
    linha('bordadura', [[-50, -24], [-50, -23]]),
    { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[-50, -24], [-50, -23]] } },
    { type: 'Feature', properties: null, geometry: { type: 'LineString', coordinates: [[-50, -24], [-50, -23]] } },
  ]));
  assert.ok(r.ok, r.erro);
  assert.equal(r.meta.nSemKind, 3);
  assert.match(r.meta.observacao, /3 feição\(ões\) sem properties.kind.*bordadura.*linha guia/);
  const limpo = L.validarPayloadLinhas(payloadL([linha('headland', [[-50, -24], [-50, -23]])]));
  assert.equal(limpo.meta.nSemKind, 0); assert.equal(limpo.meta.observacao, null);
});
t('nome da camada: name → integration_name → "Linhas <operação> <ciclo>"', () => {
  assert.equal(L.nomeDaCamada({ name: ' Talhão 3 verão ', integration_name: 'x' }), 'Talhão 3 verão');
  assert.equal(L.nomeDaCamada({ name: '', integration_name: 'linhas_verao' }), 'linhas_verao');
  assert.equal(L.nomeDaCamada({ operation_category: 'planting', cropping_cycle: 'summer' }), 'Linhas planting summer');
  assert.equal(L.nomeDaCamada({}), 'Linhas');
  const r = L.validarPayloadLinhas({ ...payloadL([linha('guidance', [[-50, -24], [-50, -23]])]), name: undefined, integration_name: null });
  assert.ok(r.ok, r.erro); assert.equal(r.meta.nome, 'Linhas planting summer');
  assert.equal(L.validarPayloadLinhas({ ...payloadL([]), name: 5 }).ok, false);
});
t('geometria inválida é recusada SEM reparo: polígono, 1 ponto, lat > 90, CRS', () => {
  const casos = [
    [payloadL([linha('guidance', [[[-50, -24], [-49, -24], [-49, -23], [-50, -24]]], 'Polygon')]), /Polygon/],
    [payloadL([linha('guidance', [[-50, -24]])]), /LineString inválida/],
    [payloadL([linha('guidance', [[-50, -24], [-50, 95]])]), /LineString inválida/],
    [payloadL([linha('guidance', [[-50, -24], [-50, NaN]])]), /LineString inválida/],
    [payloadL([linha('guidance', [], 'MultiLineString')]), /MultiLineString vazia/],
    [{ ...payloadL([linha('guidance', [[-50, -24], [-50, -23]])]), geometry: { type: 'FeatureCollection', crs: { type: 'name', properties: { name: 'EPSG:31982' } }, features: [linha('guidance', [[-50, -24], [-50, -23]])] } }, /WGS84/],
    [payloadL([]).geometry, /FeatureCollection/],
    [payloadL([], { spacing_m: -1 }), /spacing_m/],
    [payloadL([], { cropping_cycle: 'spring' }), /cropping_cycle/],
    [{ ...payloadL([]), geometry: { type: 'Feature' } }, /FeatureCollection/],
  ];
  for (const [p, re] of casos) {
    const r = L.validarPayloadLinhas(p);
    assert.equal(r.ok, false, String(re));
    assert.match(r.erro, re);
  }
});
t('limites do contrato: 100 mil feições, 1 milhão de vértices, 10 MB', () => {
  const f = linha('guidance', [[-50, -24], [-50, -23]]);
  assert.match(L.validarPayloadLinhas(payloadL(new Array(100_001).fill(f))).erro, /100000/);
  const longa = Array.from({ length: 1_000_001 }, (_, i) => [-50 + i * 1e-7, -24]);
  assert.match(L.validarPayloadLinhas(payloadL([linha('guidance', longa)])).erro, /vértices/);
  const gorda = { ...f, properties: { kind: 'guidance', nota: 'x'.repeat(10 * 1024 * 1024) } };
  assert.match(L.validarPayloadLinhas(payloadL([gorda])).erro, /10 MB/);
  assert.equal(L.validarPayloadLinhas(payloadL(new Array(1000).fill(f))).ok, true);
});

console.log('Fase 2 — ordem, archive, retentativas');
t('revisão menor que a vigente não regride; maior promove', () => {
  assert.equal(L.promove(null, 1), true);
  assert.equal(L.promove(3, 4), true);
  assert.equal(L.promove(3, 2), false);
  assert.equal(L.promove(3, 3), false);
});
t('estado das revisões: vigente = maior; archive arquiva e mantém as linhas da última upsert', () => {
  assert.deepEqual(L.estadoDasRevisoes([]), { vigente: null, arquivada: false, revisaoGeometria: null });
  assert.deepEqual(L.estadoDasRevisoes([{ revision: 2, operation: 'upsert' }, { revision: 1, operation: 'upsert' }]), { vigente: 2, arquivada: false, revisaoGeometria: 2 });
  assert.deepEqual(L.estadoDasRevisoes([{ revision: 1, operation: 'upsert' }, { revision: 3, operation: 'archive' }, { revision: 2, operation: 'upsert' }]), { vigente: 3, arquivada: true, revisaoGeometria: 2 });
  assert.deepEqual(L.estadoDasRevisoes([{ revision: 3, operation: 'archive' }, { revision: 4, operation: 'upsert' }]), { vigente: 4, arquivada: false, revisaoGeometria: 4 });
});
t('backoff 10 s … 1 h', () => {
  assert.deepEqual([1, 2, 3, 9, 10, 11, 60].map(L.atrasoTentativaS), [10, 20, 40, 2560, 3600, 3600, 3600]);
});
t('falha temporária × permanente; recibo repete só no que pode dar certo', () => {
  for (const s of [409, 410, 413, 422]) assert.equal(L.classeDoStatus(s), 'permanente', String(s));
  for (const s of [301, 401, 403, 404, 408, 429, 500, 502, 503]) assert.equal(L.classeDoStatus(s), 'temporaria', String(s));
  for (const s of [408, 429, 500, 503, 401]) assert.equal(L.reciboDeveRepetir(s), true, String(s));
  for (const s of [400, 404, 409, 422]) assert.equal(L.reciboDeveRepetir(s), false, String(s));
});
t('404 vira definitivo só quando o backoff chega ao teto (10ª tentativa); outros temporários nunca', () => {
  assert.equal(L.TENTATIVAS_404, 10);
  assert.equal(L.atrasoTentativaS(L.TENTATIVAS_404), 3600, 'é a tentativa em que o backoff bate 1 h');
  assert.equal(L.falhaDefinitiva(404, 1), false);
  assert.equal(L.falhaDefinitiva(404, 9), false);
  assert.equal(L.falhaDefinitiva(404, 10), true);
  assert.equal(L.falhaDefinitiva(503, 50), false);
  assert.equal(L.falhaDefinitiva(null, 50), false);
});
t('reaviso: rejeitado + mesmo conteúdo reabre; aplicado/pendente = repetido; outro conteúdo = conflito', () => {
  assert.equal(L.decidirReaviso({ conteudoHash: 'a', status: 'rejeitado' }, 'a'), 'reabrir');
  assert.equal(L.decidirReaviso({ conteudoHash: 'a', status: 'aplicado' }, 'a'), 'repetido');
  assert.equal(L.decidirReaviso({ conteudoHash: 'a', status: 'pendente' }, 'a'), 'repetido');
  assert.equal(L.decidirReaviso({ conteudoHash: 'a', status: 'rejeitado' }, 'b'), 'conflito');
});
const C = await import('../src/lib/precisionfarm/consulta.ts');
t('consulta da aba respeita o próximo horário de tentativa (mín. que cresce, teto 5 min)', () => {
  const agora = Date.parse('2026-10-27T12:00:00Z');
  assert.equal(C.intervaloConsultaMs(null, agora, 6000), 6000);
  assert.equal(C.intervaloConsultaMs('2026-10-27T12:00:01Z', agora, 6000), 6000);
  assert.equal(C.intervaloConsultaMs('2026-10-27T12:01:00Z', agora, 6000), 62_000);
  assert.equal(C.intervaloConsultaMs('2026-10-27T13:00:00Z', agora, 6000), 300_000, 'backoff de 1 h → no máximo 5 min');
  assert.deepEqual([6000, 12000, 24000, 48000, 60000].map(C.proximoMinimoMs), [12000, 24000, 48000, 60000, 60000]);
});
t('corpo do recibo segue exemplo-recibo.json; motivo só no rejected', () => {
  assert.deepEqual(JSON.parse(L.corpoRecibo('00000001-1111-4111-8111-000000000001', 'applied', 'x')), lerJson('exemplo-recibo.json'));
  assert.deepEqual(JSON.parse(L.corpoRecibo('e', 'rejected', 'geometria inválida')), { event_id: 'e', status: 'rejected', reason: 'geometria inválida' });
  assert.equal(JSON.parse(L.corpoRecibo('e', 'rejected', 'x'.repeat(900))).reason.length, 500);
});
t('situação na tela: fila → sincronizando; recusa → erro; senão atualizado', () => {
  assert.equal(L.situacaoCamada({ ultimoErro: 'x' }, 1), 'sincronizando');
  assert.equal(L.situacaoCamada({ ultimoErro: 'x' }, 0), 'erro');
  assert.equal(L.situacaoCamada({ ultimoErro: null }, 0), 'atualizado');
});

console.log('Fase 2 — configuração');
t('sem variáveis: "não configurada" com os NOMES que faltam (nunca valores)', () => {
  const r = L.lerConfigRecebimento({});
  assert.equal(r.ok, false);
  assert.deepEqual(r.faltando, ['PF_BASE_URL', 'PF_CHAVE', 'PF_HMAC_ENTRADA', 'PF_HMAC_SAIDA']);
  assert.match(r.erro, /não configurada/);
  const parcial = L.lerConfigRecebimento({ PF_BASE_URL: 'https://x/integration/v1', PF_CHAVE: 'segredo-123' });
  assert.deepEqual(parcial.faltando, ['PF_HMAC_ENTRADA', 'PF_HMAC_SAIDA']);
  assert.ok(!JSON.stringify(parcial).includes('segredo-123'));
});
t('PF_BASE_URL só https, sem credenciais; barra final sai', () => {
  const env = { PF_CHAVE: 'k', PF_HMAC_ENTRADA: 'a', PF_HMAC_SAIDA: 'b' };
  assert.equal(L.lerConfigRecebimento({ ...env, PF_BASE_URL: 'http://precisionfarm.com.br/integration/v1' }).ok, false);
  assert.equal(L.lerConfigRecebimento({ ...env, PF_BASE_URL: 'https://u:p@precisionfarm.com.br/integration/v1' }).ok, false);
  const ok = L.lerConfigRecebimento({ ...env, PF_BASE_URL: ' https://precisionfarm.com.br/integration/v1/ ' });
  assert.equal(ok.ok, true);
  assert.equal(ok.cfg.baseUrl, 'https://precisionfarm.com.br/integration/v1');
});
t('PF_BASE_URL tem de terminar em /integration/v1: só o domínio = "não configurada" (nunca 404 nos avisos)', () => {
  const env = { PF_CHAVE: 'k', PF_HMAC_ENTRADA: 'a', PF_HMAC_SAIDA: 'b' };
  for (const u of ['https://precisionfarm.com.br', 'https://precisionfarm.com.br/', 'https://precisionfarm.com.br/integration', 'https://precisionfarm.com.br/integration/v2']) {
    const r = L.lerConfigRecebimento({ ...env, PF_BASE_URL: u });
    assert.equal(r.ok, false, u);
    assert.match(r.erro, /não configurada.*terminando em \/integration\/v1/);
  }
  assert.equal(L.lerConfigRecebimento({ ...env, PF_BASE_URL: 'https://homolog.precisionfarm.com.br/api/integration/v1' }).ok, true);
});

console.log('Fase 2 — acesso ao talhão (leitura da aba Linhas)');
t('owner/admin veem tudo; status bloqueado/aguardando não vê nada', () => {
  const T = { id: 't1', fazendaId: 'f1' };
  assert.equal(podeVerTalhao({ papel: 'owner' }, T, []), true);
  assert.equal(podeVerTalhao({ papel: 'admin', status: 'ativo' }, T, []), true);
  assert.equal(podeVerTalhao({ papel: 'admin', status: 'bloqueado' }, T, []), false);
  assert.equal(podeVerTalhao({ papel: 'agronomo', status: 'aguardando_aprovacao' }, T, []), false);
  assert.equal(podeVerTalhao(null, T, []), false);
  assert.equal(podeVerTalhao({ status: 'ativo' }, T, []), false);
});
t('produtor: só os talhões do(s) cliente(s) dele; fazenda marcada (condomínio) entra; talhões marcados restringem', () => {
  const FZ = [{ id: 'f1', clienteId: 'c1' }, { id: 'f2', clienteId: 'c2' }];
  const T1 = { id: 't1', fazendaId: 'f1' }; const T2 = { id: 't2', fazendaId: 'f2' };
  const prod = { papel: 'produtor', clienteId: 'c1' };
  assert.equal(podeVerTalhao(prod, T1, FZ), true);
  assert.equal(podeVerTalhao(prod, T2, FZ), false);
  assert.equal(podeVerTalhao({ papel: 'produtor', clientesVinculados: ['c2'] }, T2, FZ), true);
  assert.equal(podeVerTalhao({ ...prod, fazendasVinculadas: ['f2'] }, T2, FZ), true, 'condomínio');
  assert.equal(podeVerTalhao({ ...prod, talhoesVinculados: ['t9'] }, T1, FZ), false);
  assert.equal(podeVerTalhao({ papel: 'produtor' }, T1, FZ), false, 'produtor sem vínculo não vê nada');
  assert.equal(podeVerTalhao(prod, { id: 't3', fazendaId: null }, FZ), false);
});
t('agrônomo sem vínculo vê todos (retrocompatível); com clientes vinculados, só esses', () => {
  const FZ = [{ id: 'f1', clienteId: 'c1' }, { id: 'f2', clienteId: 'c2' }];
  assert.equal(podeVerTalhao({ papel: 'agronomo' }, { id: 't2', fazendaId: 'f2' }, FZ), true);
  assert.equal(podeVerTalhao({ papel: 'agronomo', clientesVinculados: ['c1'] }, { id: 't2', fazendaId: 'f2' }, FZ), false);
  assert.equal(podeVerTalhao({ papel: 'agronomo', clientesVinculados: ['c1'] }, { id: 't1', fazendaId: 'f1' }, FZ), true);
});

// ═════════════════════════════════════════════════════════════════════════════
// LIMITE publicado pela PF — leitura do payload, comparação e busca sob demanda
// (src/lib/precisionfarm/limiteGeometria.ts, compararLimite.ts, limite.ts)
// ═════════════════════════════════════════════════════════════════════════════
const LG = await import('../src/lib/precisionfarm/limiteGeometria.ts');
const CL = await import('../src/lib/precisionfarm/compararLimite.ts');
const LM = await import('../src/lib/precisionfarm/limite.ts');
const { existsSync } = await import('node:fs');

const pendentes = [];
/** Teste assíncrono: roda junto, contado antes do resumo. */
function ta(nome, fn) {
  pendentes.push(fn().then(() => { ok++; console.log('  ✓', nome); }, e => { fail++; console.error('  ✗', nome, '—', e.message); }));
}

// Talhão de teste perto do IGEFI03 (fuso 22S). d em graus (~0,001° ≈ 100 m).
const LX = -50.3, LY = -24.9;
const anel = (x0, y0, x1, y1) => [[LX + x0, LY + y0], [LX + x1, LY + y0], [LX + x1, LY + y1], [LX + x0, LY + y1], [LX + x0, LY + y0]];
const furo = (x0, y0, x1, y1) => anel(x0, y0, x1, y1).reverse();
const QUAD = { type: 'Polygon', coordinates: [anel(0, 0, 0.01, 0.01)] };
// Duas partes; a primeira com furo.
const MULTI_FURO = { type: 'MultiPolygon', coordinates: [
  [anel(0, 0, 0.01, 0.01), furo(0.004, 0.004, 0.006, 0.006)],
  [anel(0.02, 0, 0.03, 0.005)],
] };
const lerOk = (g) => { const r = LG.lerGeometriaLimite(g); if (!r.ok) throw new Error(r.erro); return r; };
const lerErro = (g) => { const r = LG.lerGeometriaLimite(g); assert.equal(r.ok, false, 'deveria recusar'); return r.erro; };

console.log('Limite da PF — leitura do payload');
t('Polygon, MultiPolygon com furo, Feature e FeatureCollection são aceitos', () => {
  assert.equal(lerOk(QUAD).geometria.type, 'Polygon');
  const m = lerOk(MULTI_FURO);
  assert.deepEqual([m.geometria.type, m.partes, m.furos, m.vertices], ['MultiPolygon', 2, 1, 12]);
  assert.equal(lerOk({ type: 'Feature', properties: {}, geometry: MULTI_FURO }).partes, 2);
  const fc = lerOk({ type: 'FeatureCollection', features: [
    { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: MULTI_FURO.coordinates[0] } },
    { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: MULTI_FURO.coordinates[1] } },
  ] });
  // Várias feições viram UM MultiPolygon, na ordem em que vieram.
  assert.deepEqual(fc.geometria, MULTI_FURO);
});
t('coordenadas preservadas sem arredondar (mesmos números, inclusive 15+ casas)', () => {
  const fino = { type: 'Polygon', coordinates: [[[-50.29892290977286, -24.897328650160897], [-50.29, -24.897328650160897], [-50.29, -24.89], [-50.29892290977286, -24.89], [-50.29892290977286, -24.897328650160897]]] };
  const r = lerOk(fino);
  assert.equal(JSON.stringify(r.geometria), JSON.stringify(fino));
});
t('onde está a geometria: payload.geometry, .boundary, .geojson, o próprio payload ou texto JSON', () => {
  const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: QUAD }] };
  for (const p of [{ name: 'limite', geometry: fc }, { boundary: QUAD }, { geojson: JSON.stringify(fc) }, fc, { type: 'Feature', properties: {}, geometry: QUAD }]) {
    const r = LG.lerPayloadLimite(p);
    assert.equal(r.ok, true, JSON.stringify(p).slice(0, 60) + (r.ok ? '' : ` — ${r.erro}`));
    assert.equal(r.geometria.type, 'Polygon');
  }
});
t('GeometryCollection de polígonos vira MultiPolygon', () => {
  assert.equal(lerOk({ type: 'GeometryCollection', geometries: MULTI_FURO.coordinates.map(c => ({ type: 'Polygon', coordinates: c })) }).geometria.type, 'MultiPolygon');
});
t('partes que só ENCOSTAM (divisa comum) e furo que toca a borda num vértice são válidos', () => {
  lerOk({ type: 'MultiPolygon', coordinates: [[anel(0, 0, 0.01, 0.01)], [anel(0.01, 0, 0.02, 0.01)]] });
  lerOk({ type: 'Polygon', coordinates: [anel(0, 0, 0.01, 0.01), [[LX, LY], [LX + 0.004, LY + 0.006], [LX + 0.006, LY + 0.004], [LX, LY]]] });
});
t('inválidos são RECUSADOS com o motivo (sem reparo)', () => {
  const aberto = anel(0, 0, 0.01, 0.01).slice(0, 4);
  assert.match(lerErro({ type: 'Polygon', coordinates: [[...aberto, [LX + 0.001, LY]]] }), /não fecha/);
  assert.match(lerErro({ type: 'Polygon', coordinates: [aberto.slice(0, 3)] }), /mínimo 4/);
  // gravata-borboleta
  assert.match(lerErro({ type: 'Polygon', coordinates: [[[LX, LY], [LX + 0.01, LY + 0.01], [LX + 0.01, LY], [LX, LY + 0.004], [LX, LY]]] }), /cruza a si mesmo/);
  assert.match(lerErro({ type: 'Polygon', coordinates: [anel(0, 0, 0.01, 0.01), furo(0.02, 0.02, 0.03, 0.03)] }), /fora do anel externo/);
  assert.match(lerErro({ type: 'Polygon', coordinates: [anel(0, 0, 0.01, 0.01), furo(0.005, 0.005, 0.015, 0.006)] }), /cruza/);
  assert.match(lerErro({ type: 'MultiPolygon', coordinates: [[anel(0, 0, 0.01, 0.01)], [anel(0.005, 0.005, 0.015, 0.015)]] }), /se sobrepõem/);
  assert.match(lerErro({ type: 'MultiPolygon', coordinates: [[anel(0, 0, 0.01, 0.01)], [anel(0.002, 0.002, 0.004, 0.004)]] }), /se sobrepõem/, 'parte dentro da outra');
  assert.match(lerErro({ type: 'LineString', coordinates: [[LX, LY], [LX + 1, LY]] }), /só aceita Polygon/);
  assert.match(lerErro({ type: 'FeatureCollection', features: [] }), /vazia/);
  assert.match(lerErro({ type: 'Feature', properties: {}, geometry: null }), /sem geometria|não tem geometria/);
  assert.match(lerErro({ type: 'Polygon', coordinates: [[[LX, 95], [LX + 1, 95], [LX + 1, 96], [LX, 95]]] }), /WGS84/);
  assert.match(lerErro({ ...QUAD, crs: { type: 'name', properties: { name: 'EPSG:31982' } } }), /WGS84/);
  assert.match(lerErro('{não é json'), /não é JSON/);
  assert.match(LG.lerPayloadLimite({ name: 'limite' }).erro, /sem geometria/);
  assert.match(LG.lerPayloadLimite({ asset: { url: 'https://x' } }).erro, /asset/);
  assert.equal(LG.lerPayloadLimite(null).ok, false);
});

t('anel não simples e furo dentro de furo são RECUSADOS (área errada se passassem)', () => {
  const P = (pts) => pts.map(([x, y]) => [LX + x, LY + y]);
  // (a) furo dentro de outro furo: 100 − 36 − 16 em vez de 64.
  assert.match(lerErro({ type: 'Polygon', coordinates: [anel(0, 0, 0.01, 0.01), furo(0.002, 0.002, 0.008, 0.008), furo(0.003, 0.003, 0.007, 0.007)] }), /furo 2 está dentro do furo 1/);
  // furo repetido também desconta duas vezes
  assert.match(lerErro({ type: 'Polygon', coordinates: [anel(0, 0, 0.01, 0.01), furo(0.002, 0.002, 0.008, 0.008), furo(0.002, 0.002, 0.008, 0.008)] }), /dentro do furo/);
  // (b) volta sobre si numa aresta colinear (vai-e-volta na borda de cima).
  assert.match(lerErro({ type: 'Polygon', coordinates: [P([[0, 0], [0.01, 0], [0.01, 0.01], [0.004, 0.01], [0.006, 0.01], [0, 0.01], [0, 0]])] }), /volta sobre si mesmo/);
  // espícula que sai e volta pelo mesmo caminho até outro vértice
  assert.match(lerErro({ type: 'Polygon', coordinates: [P([[0, 0], [0.01, 0], [0.01, 0.01], [0.005, 0.01], [0.005, 0.015], [0.005, 0.012], [0, 0.01], [0, 0]])] }), /volta sobre si mesmo|encosta em si/);
  // (c) figura 8: o anel passa duas vezes pelo mesmo vértice.
  assert.match(lerErro({ type: 'Polygon', coordinates: [P([[0, 0], [0.005, 0.005], [0.01, 0], [0.01, 0.01], [0.005, 0.005], [0, 0.01], [0, 0]])] }), /figura 8/);
});
t('vértice repetido em sequência e vértice no meio de uma aresta reta continuam válidos', () => {
  const P = (pts) => pts.map(([x, y]) => [LX + x, LY + y]);
  const r = lerOk({ type: 'Polygon', coordinates: [P([[0, 0], [0.005, 0], [0.005, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]])] });
  assert.equal(r.vertices, 6, 'nada é removido');
});

console.log('Limite da PF — comparação');
t('UTM: no meridiano central de 45°N dá E=500000 e N=4982950,40 (referência WGS84)', () => {
  const [e, n] = CL.paraUtm(-75, 45, { zona: 18, sul: false });
  assert.ok(Math.abs(e - 500000) < 1e-6, String(e));
  assert.ok(Math.abs(n - 4982950.4) < 0.01, String(n));
  assert.deepEqual(CL.fusoUtm(-50.3, -24.9), { zona: 22, sul: true });
});
t('mesmo limite: diferença zero, idênticos; furo descontado nas duas métricas', () => {
  const c = CL.compararLimites(MULTI_FURO, MULTI_FURO);
  assert.equal(c.identicos, true);
  assert.equal(c.difSimM2, 0);
  assert.equal(c.fuso, '22S');
  assert.deepEqual([c.pf.partes, c.pf.furos, c.pf.vertices], [2, 1, 12]);
  const semFuro = CL.compararLimites({ type: 'MultiPolygon', coordinates: [[MULTI_FURO.coordinates[0][0]], MULTI_FURO.coordinates[1]] }, null);
  const furoHa = semFuro.pf.areaHa - c.pf.areaHa;
  assert.ok(furoHa > 4.4 && furoHa < 4.6, `furo de 0,002° ~4,5 ha, deu ${furoHa}`);
  // UTM a ~0,7° do meridiano central: k² ≈ 0,9993 (a área plana é um pouco menor).
  const r = c.pf.areaUtmHa / c.pf.areaHa;
  assert.ok(r > 0.9990 && r < 0.9996, `razão UTM/plataforma ${r}`);
});
t('limite deslocado: só PF + só Invicta = diferença simétrica (as duas métricas) e o %', () => {
  const inv = { type: 'Polygon', coordinates: [anel(0, 0, 0.01, 0.01)] };
  const pf = { type: 'Polygon', coordinates: [anel(0.001, 0, 0.011, 0.01)] };   // 10% para leste
  const c = CL.compararLimites(pf, inv);
  assert.equal(c.identicos, false);
  assert.ok(Math.abs(c.soPfM2 - c.soInvictaM2) / c.soPfM2 < 0.01, 'as duas faixas têm a mesma área');
  assert.ok(Math.abs(c.difSimM2 - (c.soPfM2 + c.soInvictaM2)) < 1e-6);
  assert.ok(Math.abs(c.difSimPct - 20) < 0.2, `~20%, deu ${c.difSimPct}`);
  assert.ok(Math.abs(c.difSimUtmM2 / c.difSimM2 - c.pf.areaUtmHa / c.pf.areaHa) < 1e-3);
  assert.equal(c.soPf.type, 'Polygon');
  // Sem limite na Invicta: tudo é "só PF" e não há %.
  const s = CL.compararLimites(pf, null);
  assert.equal(s.invicta, null); assert.equal(s.difSimPct, null); assert.equal(s.soPf, pf);
});
t('limite do talhão (texto) vira uma geometria só; texto ruim → null', () => {
  const g = CL.geometriaDoTalhao(JSON.stringify({ type: 'FeatureCollection', features: MULTI_FURO.coordinates.map(c => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: c } })) }));
  assert.deepEqual(g, MULTI_FURO);
  assert.equal(CL.geometriaDoTalhao('xx'), null);
  assert.equal(CL.geometriaDoTalhao(undefined), null);
  assert.deepEqual(CL.caixaDoLimite(QUAD), [LX, LY, LX + 0.01, LY + 0.01]);
});
// Conferência com um limite REAL da PF (IGEFI 03) — o arquivo não vai para o
// repositório; roda quando existe (PF_LIMITE_REAL=<caminho> ou o da sessão).
const REAL = process.env.PF_LIMITE_REAL;
if (REAL && existsSync(REAL)) {
  t('IGEFI 03 real: lê sem recusar e a área UTM 22S bate com a da PF (66,4658 ha)', () => {
    const r = lerOk(JSON.parse(readFileSync(REAL, 'utf8')));
    const c = CL.compararLimites(r.geometria, r.geometria);
    assert.equal(c.fuso, '22S');
    assert.equal(Math.round(c.pf.areaUtmHa * 1e4) / 1e4, 66.4658);
    assert.equal(c.difSimM2, 0);
  });
} else {
  console.log('  – IGEFI 03 real: pulado (defina PF_LIMITE_REAL=<arquivo .geojson>)');
}

console.log('Limite da PF — busca no inventário (PF simulada)');
const VINC = { ...IDS };
const RES_LIM = '00000009-1111-4111-8111-000000000009';
function envelopeLimite(extra = {}) {
  return {
    contract_version: '0.2.0', event_id: '0000000a-1111-4111-8111-00000000000a', source_system: 'precisionfarm',
    ...IDS, resource_id: RES_LIM, resource_type: 'boundary', resource_revision: 2, base_revision: 1,
    boundary_revision: 2, occurred_at: '2026-10-27T18:00:00Z', operation: 'upsert',
    payload: { name: 'limite', geometry: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: MULTI_FURO }] } },
    ...extra,
  };
}
function eventoDe(env) { const { payload: _p, ...ev } = env; return { ...ev, checksum: checksumEnvelope(env) }; }
/** PF simulada: inventário em páginas + revisões por recurso. */
function pfSimulada({ paginas, revisoes = {}, falha = null }) {
  const chamadas = [];
  return {
    chamadas,
    async inventario(field, cursor) {
      chamadas.push(['inventario', field, cursor]);
      if (falha) throw falha;
      return paginas[Number(cursor)];
    },
    async revisao(id, n) { chamadas.push(['revisao', id, n]); return revisoes[`${id}/${n}`]; },
    async changes() { throw new Error('não usado'); },
    async enviarRecibo() { throw new Error('não usado'); },
  };
}
const itemLim = (env, extra = {}) => ({ resource_id: env.resource_id, resource_type: 'boundary', resource_revision: env.resource_revision, boundary_revision: env.boundary_revision, status: 'published', name: 'limite', checksum: checksumEnvelope(env), event: eventoDe(env), ...extra });
const itemLinhas = { resource_id: '00000005-1111-4111-8111-000000000005', resource_type: 'guidance', resource_revision: 1 };

ta('acha o limite (2ª página do inventário), confere pelo checksum do evento e devolve a geometria', async () => {
  const env = envelopeLimite();
  const pf = pfSimulada({
    paginas: [{ items: [itemLinhas], next_cursor: '1', has_more: true }, { items: [itemLim(env)], next_cursor: '2', has_more: false }],
    revisoes: { [`${RES_LIM}/2`]: env },
  });
  const r = await LM.buscarLimitePF(pf, VINC);
  assert.equal(r.ok, true, r.erro);
  assert.deepEqual(r.limite.geometria, MULTI_FURO);
  assert.equal(r.limite.revisao, 2); assert.equal(r.limite.boundaryRevision, 2);
  assert.equal(r.limite.conferencia, 'checksum');
  assert.equal(r.limite.data, '2026-10-27T18:00:00Z');
  assert.deepEqual([r.limite.partes, r.limite.furos], [2, 1]);
  assert.deepEqual(pf.chamadas.map(c => c[0]), ['inventario', 'inventario', 'revisao']);
});
ta('item sem `event` e com `revision` (complemento 28/10): conferência básica pelo checksum do item', async () => {
  const env = envelopeLimite();
  const { event: _e, resource_revision: _r, ...semEvento } = itemLim(env);
  const pf = pfSimulada({ paginas: [{ items: [{ ...semEvento, revision: 2 }], next_cursor: '1', has_more: false }], revisoes: { [`${RES_LIM}/2`]: env } });
  const r = await LM.buscarLimitePF(pf, VINC);
  assert.equal(r.ok, true, r.erro);
  assert.equal(r.limite.conferencia, 'basica');
  // Checksum do item que não bate → recusa.
  const pf2 = pfSimulada({ paginas: [{ items: [{ ...semEvento, revision: 2, checksum: 'f'.repeat(64) }], next_cursor: '1', has_more: false }], revisoes: { [`${RES_LIM}/2`]: env } });
  const r2 = await LM.buscarLimitePF(pf2, VINC);
  assert.equal(r2.motivo, 'invalido'); assert.match(r2.erro, /Checksum/);
});
ta('revisão adulterada (checksum do evento não bate) → inválido, sem geometria', async () => {
  const env = envelopeLimite();
  const adulterado = { ...env, payload: { ...env.payload, name: 'outro' } };
  const pf = pfSimulada({ paginas: [{ items: [itemLim(env)], next_cursor: '1', has_more: false }], revisoes: { [`${RES_LIM}/2`]: adulterado } });
  const r = await LM.buscarLimitePF(pf, VINC);
  assert.equal(r.ok, false); assert.equal(r.motivo, 'invalido'); assert.match(r.erro, /Checksum não confere/);
});
ta('payload com geometria inválida → inválido com o motivo', async () => {
  const env = envelopeLimite({ payload: { geometry: { type: 'Polygon', coordinates: [[[LX, LY], [LX + 0.01, LY + 0.01], [LX + 0.01, LY], [LX, LY + 0.004], [LX, LY]]] } } });
  const pf = pfSimulada({ paginas: [{ items: [itemLim(env)], next_cursor: '1', has_more: false }], revisoes: { [`${RES_LIM}/2`]: env } });
  const r = await LM.buscarLimitePF(pf, VINC);
  assert.equal(r.motivo, 'invalido'); assert.match(r.erro, /cruza a si mesmo/);
});
ta('sem limite no inventário → sem_limite; limite arquivado → arquivado (sem baixar revisão)', async () => {
  const r = await LM.buscarLimitePF(pfSimulada({ paginas: [{ items: [itemLinhas], next_cursor: '1', has_more: false }] }), VINC);
  assert.equal(r.motivo, 'sem_limite');
  const env = envelopeLimite({ operation: 'archive', payload: {} });
  const pf = pfSimulada({ paginas: [{ items: [itemLim(env, { status: 'archived' })], next_cursor: '1', has_more: false }] });
  const r2 = await LM.buscarLimitePF(pf, VINC);
  assert.equal(r2.motivo, 'arquivado');
  assert.equal(pf.chamadas.filter(c => c[0] === 'revisao').length, 0);
});
ta('UUIDs do limite diferentes do vínculo → inválido', async () => {
  const env = envelopeLimite({ shared_farm_id: '0000000b-1111-4111-8111-00000000000b' });
  const pf = pfSimulada({ paginas: [{ items: [itemLim(env)], next_cursor: '1', has_more: false }], revisoes: { [`${RES_LIM}/2`]: env } });
  const r = await LM.buscarLimitePF(pf, VINC);
  assert.equal(r.motivo, 'invalido'); assert.match(r.erro, /UUIDs/);
});
ta('vários limites no inventário: vale o mais recente, e a contagem vai para a tela', async () => {
  const novo = envelopeLimite();
  const velhoId = '0000000c-1111-4111-8111-00000000000c';
  const velho = envelopeLimite({ resource_id: velhoId, resource_revision: 1, base_revision: 0, occurred_at: '2026-10-01T00:00:00Z' });
  const pf = pfSimulada({
    paginas: [{ items: [itemLim(velho, { updated_at: '2026-10-01T00:00:00Z' }), itemLim(novo, { updated_at: '2026-10-27T18:00:00Z' })], next_cursor: '1', has_more: false }],
    revisoes: { [`${RES_LIM}/2`]: novo, [`${velhoId}/1`]: velho },
  });
  const r = await LM.buscarLimitePF(pf, VINC);
  assert.equal(r.limite.resourceId, RES_LIM); assert.equal(r.limite.itensNoInventario, 2);
});
ta('inventário cortado no teto de páginas sem achar o limite → incompleto (não "sem limite")', async () => {
  const paginas = Array.from({ length: 30 }, (_, k) => ({ items: [itemLinhas], next_cursor: String(k + 1), has_more: true }));
  const pf = pfSimulada({ paginas });
  const r = await LM.buscarLimitePF(pf, VINC);
  assert.equal(r.ok, false); assert.equal(r.motivo, 'incompleto'); assert.match(r.erro, /não terminou/);
  assert.equal(pf.chamadas.length, LM.MAX_PAGINAS_INVENTARIO);
  // Cursor que não anda com has_more = também incompleto.
  const r2 = await LM.buscarLimitePF(pfSimulada({ paginas: [{ items: [itemLinhas], next_cursor: '0', has_more: true }] }), VINC);
  assert.equal(r2.motivo, 'incompleto');
  // Limite achado antes do teto: segue normal mesmo com has_more.
  const env = envelopeLimite();
  const r3 = await LM.buscarLimitePF(pfSimulada({ paginas: [{ items: [itemLim(env)], next_cursor: '0', has_more: true }], revisoes: { [`${RES_LIM}/2`]: env } }), VINC);
  assert.equal(r3.ok, true, r3.erro);
});
ta('PF fora (503) sobe como FalhaPF — a rota responde 503, não 500', async () => {
  const pf = pfSimulada({ paginas: [], falha: new LM.FalhaPF('Integração desabilitada do lado da PrecisionFarm (503).', 'temporaria', 503) });
  await assert.rejects(LM.buscarLimitePF(pf, VINC), e => e instanceof LM.FalhaPF && e.status === 503);
});

// ═════════════════════════════════════════════════════════════════════════════
// TELA DE LOTE — manifesto da PF (leitura, casamento por geometria, conferência
// do servidor) e execução em lote (src/lib/precisionfarm/manifestoPF.ts, lote.ts)
// ═════════════════════════════════════════════════════════════════════════════
const MF = await import('../src/lib/precisionfarm/manifestoPF.ts');
const LT = await import('../src/lib/precisionfarm/lote.ts');

const uuidN = n => `00000${String(n).padStart(3, '0')}-2222-4222-8222-${String(n).padStart(12, '0')}`;
const PROD = uuidN(900), FARM = uuidN(901);
/** Item do manifesto no formato da PF (local_field_id NÚMERO, como no da Figueira). */
const itemPF = (n, nome, geometria, extra = {}) => ({
  local_field_id: n, name: nome, shared_producer_id: PROD, shared_farm_id: FARM, shared_field_id: uuidN(n),
  identity_status: 'proposed_pending_remote_match', geometry: geometria, ...extra,
});
const poli = (x0, y0, x1, y1) => ({ type: 'Polygon', coordinates: [anel(x0, y0, x1, y1)] });
const nosso = (id, g, extra = {}) => ({ id, nome: `nosso ${id}`, fazendaId: 'fz', clienteId: 'cl', geojson: JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: g }] }), ...extra });
const casar = (fields, talhoes, vinculos = []) => {
  const m = MF.lerManifestoPF({ fields });
  if (!m.ok) throw new Error(m.erro);
  return MF.casarManifesto(m.campos, m.campos.map(c => MF.limiteDoCampo(c, null, null)), talhoes, vinculos);
};
const vinc = (talhaoId, sharedFieldId, extra = {}) => ({ talhaoId, sharedFieldId, sharedProducerId: PROD, sharedFarmId: FARM, status: 'pendente', fazendaId: 'fz', clienteId: 'cl', ...extra });

console.log('Lote — manifesto da PF');
t('lê o formato da Figueira: local_field_id número → texto, UUIDs em minúsculas, boundary_file e sha256', () => {
  const m = MF.lerManifestoPF(JSON.stringify({ fields: [{
    local_field_id: 16, name: 'IGEFI01', shared_producer_id: PROD.toUpperCase(), shared_farm_id: FARM, shared_field_id: uuidN(16),
    boundary_file: 'limites_figueira/IGEFI01.geojson', boundary_sha256: 'ABC', identity_status: 'proposed_pending_remote_match',
  }] }));
  assert.equal(m.ok, true);
  const c = m.campos[0];
  assert.deepEqual([c.pfLocalId, c.nome, c.sharedProducerId, c.arquivoLimite, c.sha256, c.problema], ['16', 'IGEFI01', PROD, 'limites_figueira/IGEFI01.geojson', 'abc', null]);
});
t('manifesto sem fields / vazio / não-JSON é recusado inteiro', () => {
  assert.equal(MF.lerManifestoPF({}).ok, false);
  assert.equal(MF.lerManifestoPF({ fields: [] }).ok, false);
  assert.match(MF.lerManifestoPF('{').erro, /JSON/);
});
t('defeito de UM item marca só ele: UUID inválido, sem ID PF, sem limite, repetidos', () => {
  const m = MF.lerManifestoPF({ fields: [
    itemPF(1, 'a', QUAD, { shared_farm_id: 'x' }),
    itemPF(2, 'b', QUAD, { local_field_id: '' }),
    itemPF(3, 'c', null),
    itemPF(4, 'd', QUAD), itemPF(5, 'e', QUAD, { shared_field_id: uuidN(4) }),
    itemPF(6, 'f', QUAD),
  ] });
  assert.match(m.campos[0].problema, /shared_farm_id/);
  assert.match(m.campos[1].problema, /local_field_id/);
  assert.match(m.campos[2].problema, /Sem limite/);
  assert.match(m.campos[3].problema, /shared_field_id repetido/);
  assert.match(m.campos[4].problema, /shared_field_id repetido/);
  assert.equal(m.campos[5].problema, null);
});
t('arquivo do limite: caminho exato do zip ou só o nome (soltos); nome repetido em pastas = não acha', () => {
  const arqs = new Map([['limites_figueira/IGEFI01.geojson', 1], ['IGEFI02.geojson', 2], ['a/X.geojson', 3], ['b/X.geojson', 4]]);
  assert.equal(MF.acharArquivo(arqs, 'limites_figueira/IGEFI01.geojson'), 1);
  assert.equal(MF.acharArquivo(arqs, 'limites_figueira/IGEFI02.geojson'), 2);
  assert.equal(MF.acharArquivo(arqs, 'c/X.geojson'), null);
});
t('limite: SHA-256 diferente do manifesto, arquivo ausente e geometria inválida são recusados', () => {
  const [c] = MF.lerManifestoPF({ fields: [itemPF(1, 'a', null, { boundary_file: 'a.geojson', boundary_sha256: 'aa' })] }).campos;
  assert.match(MF.limiteDoCampo(c, JSON.stringify(QUAD), 'bb').erro, /SHA-256/);
  assert.equal(MF.limiteDoCampo(c, JSON.stringify(QUAD), 'aa').ok, true);
  assert.match(MF.limiteDoCampo(c, null, null).erro, /não encontrado/);
  const aberto = { type: 'Polygon', coordinates: [anel(0, 0, 0.01, 0.01).slice(0, 4)] };
  assert.match(MF.limiteDoCampo(c, JSON.stringify(aberto), null).erro, /inválido/);
});

console.log('Lote — casamento por geometria');
// Nossos: A e B lado a lado; C+D (a PF junta os dois); E; H (a PF parte em dois).
const GA = poli(0, 0, 0.01, 0.01), GB = poli(0.01, 0, 0.02, 0.01);
const GC = poli(0, 0.02, 0.005, 0.03), GD = poli(0.005, 0.02, 0.01, 0.03);
const GE = poli(0.03, 0, 0.04, 0.01), GH = poli(0.05, 0, 0.06, 0.01);
const NOSSOS = [nosso('A', GA), nosso('B', GB), nosso('C', GC), nosso('D', GD), nosso('E', GE), nosso('H', GH)];
t('1:1 com diferença ≤ 5% é PRÉ-MARCADO; a borda que invade o vizinho não o torna ambíguo', () => {
  // A deslocado 1% para a direita: sobra fina sobre B, diferença ≈ 2%.
  const [r] = casar([itemPF(1, 'pA', poli(0.0001, 0, 0.0101, 0.01))], NOSSOS);
  assert.equal(r.situacao, 'par'); assert.equal(r.preMarcado, true); assert.equal(r.podeCriar, true);
  assert.equal(r.melhor.talhaoId, 'A'); assert.ok(r.melhor.difSimPct > 1.5 && r.melhor.difSimPct < 2.5, String(r.melhor.difSimPct));
  assert.equal(r.outrosRelevantes.length, 0);
});
t('idêntico: diferença 0 e pré-marcado', () => {
  const [r] = casar([itemPF(1, 'pB', GB)], NOSSOS);
  assert.equal(r.situacao, 'par'); assert.equal(r.melhor.talhaoId, 'B'); assert.equal(r.melhor.difSimPct, 0);
});
t('talhão da PF que cobre dois dos nossos é AMBÍGUO e não pode ser criado (IGEFI11 da PF = nossos 10 + 11)', () => {
  const [r] = casar([itemPF(1, 'pCD', poli(0, 0.02, 0.01, 0.03))], NOSSOS);
  assert.equal(r.situacao, 'ambiguo'); assert.equal(r.podeCriar, false); assert.equal(r.preMarcado, false);
  assert.match(r.motivo, /nosso C.*nosso D|nosso D.*nosso C/);
});
t('diferença > 5%: pode marcar, mas NÃO vem marcado', () => {
  const [r] = casar([itemPF(1, 'pE', poli(0.03, 0, 0.0411, 0.01))], NOSSOS);
  assert.equal(r.situacao, 'diferente'); assert.equal(r.podeCriar, true); assert.equal(r.preMarcado, false);
  assert.ok(r.melhor.difSimPct > 5);
});
t('sem sobreposição: sem par', () => {
  const [r] = casar([itemPF(1, 'pX', poli(0.2, 0.2, 0.21, 0.21))], NOSSOS);
  assert.equal(r.situacao, 'sem-par'); assert.equal(r.podeCriar, false);
});
t('dois talhões da PF no MESMO nosso: nenhum dos dois entra (não é 1:1)', () => {
  const rs = casar([itemPF(1, 'pH1', poli(0.05, 0, 0.0549, 0.01)), itemPF(2, 'pH2', poli(0.0551, 0, 0.06, 0.01))], NOSSOS);
  for (const r of rs) { assert.equal(r.situacao, 'ambiguo'); assert.equal(r.podeCriar, false); }
  assert.match(rs[0].motivo, /pH2/);
});
t('DUPLICATA: shared_field_id já vinculado (mesmo talhão = "mesmos IDs"; outro talhão = recusa)', () => {
  const [r1] = casar([itemPF(1, 'pA', GA)], NOSSOS, [vinc('A', uuidN(1), { status: 'confirmado' })]);
  assert.equal(r1.situacao, 'ja-vinculado'); assert.equal(r1.podeCriar, false); assert.match(r1.motivo, /mesmos IDs \(confirmado\)/);
  const [r2] = casar([itemPF(1, 'pA', GA)], NOSSOS, [vinc('B', uuidN(1))]);
  assert.equal(r2.situacao, 'ja-vinculado'); assert.match(r2.motivo, /talhão nosso B/);
});
t('DUPLICATA: nosso talhão já tem vínculo com OUTROS UUIDs', () => {
  const [r] = casar([itemPF(1, 'pA', GA)], NOSSOS, [vinc('A', uuidN(77))]);
  assert.equal(r.situacao, 'ja-vinculado'); assert.equal(r.podeCriar, false); assert.match(r.motivo, /outros UUIDs/);
});
t('conflito de identidade: a fazenda já tem outro shared_farm_id (mesma regra do "Gerar identificadores")', () => {
  const [r] = casar([itemPF(1, 'pB', GB)], NOSSOS, [vinc('A', uuidN(50), { sharedFarmId: uuidN(51) })]);
  assert.equal(r.situacao, 'conflito'); assert.equal(r.podeCriar, false); assert.match(r.motivo, /shared_farm_id/);
});
t('item com defeito / limite inválido sai como inválido, sem derrubar os outros', () => {
  const rs = casar([itemPF(1, 'ruim', poli(0, 0, 0.01, 0.01), { shared_field_id: 'x' }), itemPF(2, 'pB', GB)], NOSSOS);
  assert.deepEqual(rs.map(r => r.situacao), ['invalido', 'par']);
});

console.log('Lote — conferência do servidor antes de criar');
const NUVEM = new Map([['A', { fazendaId: 'fz', clienteId: 'cl', empresaId: 'emp' }], ['B', { fazendaId: 'fz', clienteId: 'cl', empresaId: 'emp' }], ['E', { fazendaId: 'fz', clienteId: 'cl', empresaId: null }]]);
const itemC = (talhaoId, n, extra = {}) => ({ talhaoId, pfLocalId: String(n), sharedProducerId: PROD, sharedFarmId: FARM, sharedFieldId: uuidN(n), nomePF: `p${n}`, ...extra });
t('cria o que passa; recusa talhão fora da nuvem, já vinculado, shared_field_id usado e repetidos no pedido', () => {
  const r = MF.conferirCriacao([
    itemC('A', 1),
    itemC('Z', 2),                    // não está na nuvem (o "115")
    itemC('B', 3),                    // B já tem vínculo
    itemC('E', 9),                    // shared_field_id 9 já é de outro talhão
    itemC('A', 4),                    // talhão repetido no pedido
  ], NUVEM, [vinc('B', uuidN(70)), vinc('Q', uuidN(9))]);
  assert.equal(r[0].ok, true); assert.deepEqual([r[0].fazendaId, r[0].clienteId, r[0].empresaId], ['fz', 'cl', 'emp']);
  assert.match(r[1].motivo, /não está na nuvem/);
  assert.match(r[2].motivo, /já tem vínculo/);
  assert.match(r[3].motivo, /shared_field_id já está/);
  assert.match(r[4].motivo, /repetido/);
});
t('identidade: fazenda com outro shared_farm_id (existente ou de item anterior do pedido) é recusada', () => {
  const r = MF.conferirCriacao([itemC('A', 1), itemC('B', 2, { sharedFarmId: uuidN(99) })], NUVEM, []);
  assert.equal(r[0].ok, true); assert.match(r[1].motivo, /shared_farm_id/);
  const r2 = MF.conferirCriacao([itemC('A', 1)], NUVEM, [vinc('Q', uuidN(60), { sharedProducerId: uuidN(61), fazendaId: 'outra' })]);
  assert.match(r2[0].motivo, /shared_producer_id/);
});
t('formato: UUID inválido e sem ID PF recusados; corpo vazio/grande demais recusado inteiro', () => {
  const r = MF.conferirCriacao([itemC('A', 1, { sharedFieldId: 'x' }), itemC('A', 2, { pfLocalId: '' })], NUVEM, []);
  assert.match(r[0].motivo, /UUID/); assert.match(r[1].motivo, /ID do talhão na PrecisionFarm/);
  assert.equal(MF.lerItensCriacao({ itens: [] }).ok, false);
  assert.equal(MF.lerItensCriacao({ itens: Array.from({ length: MF.MAX_CAMPOS_MANIFESTO + 1 }, () => ({})) }).ok, false);
  assert.equal(MF.lerItensCriacao({ itens: [{ talhaoId: ' A ', sharedFieldId: uuidN(1).toUpperCase() }] }).itens[0].sharedFieldId, uuidN(1));
});


// ── Manifesto v2 (VINCULOS.json + LIMITES.geojson, 04/11) — ledger pf-manifesto-v2 ──
const RT = await import('../src/lib/precisionfarm/retornoPF.ts');
/** UUIDs "novos" previsíveis no teste (fazenda dividida). */
const sequencia = () => { let n = 0; return () => `00000000-9999-4999-8999-${String(++n).padStart(12, '0')}`; };
const PROD2 = uuidN(910), FARM2 = uuidN(911);
const v2 = (fields, extra = {}) => ({
  source_system: 'precisionfarm', summary: { clients: 1, fields: fields.length },
  clients: [
    { local_producer_id: 1, name: 'Tiago PF', shared_producer_id: PROD, remote_producer_id: null, identity_status: 'proposed_pending_remote_match' },
    { local_producer_id: 2, name: 'Outro PF', shared_producer_id: PROD2, remote_producer_id: null, identity_status: 'proposed_pending_remote_match' },
  ],
  farm_groups: [
    { local_producer_id: 1, shared_producer_id: PROD, shared_farm_id: FARM, name: null, remote_farm_id: null, identity_status: 'proposed_group_requires_remote_farm_confirmation', note: 'provisório' },
    { local_producer_id: 2, shared_producer_id: PROD2, shared_farm_id: FARM2, name: null, remote_farm_id: null, identity_status: 'proposed_group_requires_remote_farm_confirmation' },
  ],
  fields, ...extra,
});
const campoV2 = (n, nome, extra = {}) => ({
  local_field_id: n, local_producer_id: 1, name: nome, shared_producer_id: PROD, shared_farm_id: FARM, shared_field_id: uuidN(n),
  remote_field_id: null, identity_status: 'proposed_pending_remote_match', enabled: false, projects: [{ name: 'linhas_verao' }], ...extra,
});
const feicao = (n, g, props = {}) => ({ type: 'Feature', properties: { local_field_id: n, name: `f${n}`, shared_field_id: uuidN(n), ...props }, geometry: g });
const limitesFC = feicoes => JSON.stringify({ type: 'FeatureCollection', features: feicoes });
const casarV2 = (fields, feicoes, talhoes, vinculos = [], opc = {}) => {
  const m = MF.lerManifestoPF(v2(fields));
  if (!m.ok) throw new Error(m.erro);
  const idx = MF.lerLimitesGeojson(limitesFC(feicoes));
  if (!idx.ok) throw new Error(idx.erro);
  return MF.casarManifesto(m.campos, m.campos.map(c => MF.limiteDoCampo(c, null, null, idx.feicoes)), talhoes, vinculos, { preMarcarDiferentes: true, novoUuid: sequencia(), ...opc });
};
// Nossos em fila: N0..N4 (fazenda f1: N0, N1, N2; fazenda f2: N3, N4), cliente c1.
const GN = i => poli(0.1 + i * 0.01, 0.1, 0.11 + i * 0.01, 0.11);
const nossoF = (i, fazendaId, clienteId = 'c1', extra = {}) => nosso(`N${i}`, GN(i), { fazendaId, clienteId, ...extra });
const NOSSOS_V2 = [nossoF(0, 'f1'), nossoF(1, 'f1'), nossoF(2, 'f1'), nossoF(3, 'f2'), nossoF(4, 'f2')];
const vincV2 = (talhaoId, sharedFieldId, extra = {}) => ({ talhaoId, sharedFieldId, sharedProducerId: PROD, sharedFarmId: FARM, status: 'pendente', fazendaId: 'f1', clienteId: 'c1', pfLocalId: null, temPublicacao: false, ...extra });

console.log('Manifesto v2 — leitura (VINCULOS.json + LIMITES.geojson)');
t('lê o v2: formato, clients/farm_groups, limite no LIMITES.geojson, nome do cliente da PF', () => {
  const m = MF.lerManifestoPF(JSON.stringify(v2([campoV2(1, 'BOQUEIRAO'), campoV2(2, 'X', { local_producer_id: 2, shared_producer_id: PROD2.toUpperCase(), shared_farm_id: FARM2 })])));
  assert.equal(m.ok, true); assert.equal(m.formato, 'v2');
  assert.equal(m.clientes.length, 2); assert.equal(m.grupos[0].sharedFarmId, FARM);
  const [a, b] = m.campos;
  assert.deepEqual([a.pfLocalId, a.limiteNoGeojson, a.problema, a.nomeClientePF, a.localProducerId], ['1', true, null, 'Tiago PF', '1']);
  assert.deepEqual([b.sharedProducerId, b.nomeClientePF], [PROD2, 'Outro PF']);
  // v1 sem boundary continua com defeito (o formato antigo não muda).
  assert.match(MF.lerManifestoPF({ fields: [itemPF(1, 'a', null)] }).campos[0].problema, /Sem limite/);
  assert.equal(MF.lerManifestoPF({ fields: [itemPF(1, 'a', QUAD)] }).formato, 'v1');
});
t('LIMITES.geojson: indexa por shared_field_id; sem feição, feição repetida, local_field_id trocado e geometria inválida são recusados', () => {
  const m = MF.lerManifestoPF(v2([campoV2(1, 'a'), campoV2(2, 'b'), campoV2(3, 'c'), campoV2(4, 'd'), campoV2(5, 'e')]));
  const aberto = { type: 'Polygon', coordinates: [anel(0, 0, 0.01, 0.01).slice(0, 4)] };
  const idx = MF.lerLimitesGeojson(limitesFC([
    feicao(1, GA),
    feicao(2, GB), feicao(2, GB),
    feicao(3, GE, { local_field_id: 99 }),
    feicao(4, aberto),
    { type: 'Feature', properties: { name: 'sem id' }, geometry: GA },
  ]));
  assert.equal(idx.ok, true); assert.equal(idx.nFeicoes, 6); assert.equal(idx.nSemId, 1);
  const l = m.campos.map(c => MF.limiteDoCampo(c, null, null, idx.feicoes));
  assert.equal(l[0].ok, true);
  assert.match(l[1].erro, /2 feições/);
  assert.match(l[2].erro, /local_field_id 99/);
  assert.match(l[3].erro, /inválido/);
  assert.match(l[4].erro, /Sem limite no LIMITES\.geojson/);
  assert.equal(MF.lerLimitesGeojson('{"type":"FeatureCollection","features":[{"type":"Feature","properties":{},"geometry":null}]}').ok, false);
  assert.equal(MF.lerLimitesGeojson('[]').ok, false);
});

console.log('Manifesto v2 — casamento e fazendas (Q2/Q3)');
t('Q3: par > 5% também vem MARCADO no v2; ≤ 5% marcado; cliente nosso sai da geometria', () => {
  const rs = casarV2([campoV2(1, 'p0'), campoV2(2, 'p1')], [feicao(1, GN(0)), feicao(2, poli(0.11, 0.1, 0.1215, 0.11))], NOSSOS_V2);
  assert.deepEqual(rs.map(r => [r.situacao, r.preMarcado, r.podeCriar]), [['par', true, true], ['diferente', true, true]]);
  assert.equal(rs[0].melhor.clienteId, 'c1');
});
t('FAZENDA DIVIDIDA: a que recebe mais pares fica com o shared_farm_id da PF; as outras, UUID novo', () => {
  const rs = casarV2([1, 2, 3, 4, 5].map(n => campoV2(n, `p${n}`)), [0, 1, 2, 3, 4].map(i => feicao(i + 1, GN(i))), NOSSOS_V2);
  assert.ok(rs.every(r => r.situacao === 'par'));
  assert.deepEqual(rs.map(r => [r.ids.sharedFarmId, r.ids.papelFazenda]), [
    [FARM, 'principal'], [FARM, 'principal'], [FARM, 'principal'],
    ['00000000-9999-4999-8999-000000000001', 'nova'], ['00000000-9999-4999-8999-000000000001', 'nova'],
  ]);
  assert.ok(rs.every(r => r.ids.sharedProducerId === PROD));
  const [g] = MF.resumoFazendas(rs);
  assert.equal(g.dividido, true);
  assert.deepEqual(g.fazendas.map(f => [f.fazendaId, f.papel, f.pares]), [['f1', 'principal', 3], ['f2', 'nova', 2]]);
});
t('fazenda que JÁ usa o shared_farm_id da PF é a principal, mesmo com menos pares; outra fazenda com vínculo reusa o dela', () => {
  const ja = [
    vincV2('Z1', uuidN(80), { fazendaId: 'f2', status: 'confirmado', pfLocalId: '80' }),
    vincV2('Z2', uuidN(81), { fazendaId: 'f1', sharedFarmId: uuidN(82), status: 'confirmado', pfLocalId: '81' }),
  ];
  const rs = casarV2([1, 2, 3, 4].map(n => campoV2(n, `p${n}`)), [0, 1, 2, 3].map(i => feicao(i + 1, GN(i))), NOSSOS_V2, ja);
  assert.deepEqual(rs.map(r => [r.situacao, r.ids?.sharedFarmId, r.ids?.papelFazenda]), [
    ['par', uuidN(82), 'reuso'], ['par', uuidN(82), 'reuso'], ['par', uuidN(82), 'reuso'], ['par', FARM, 'principal'],
  ]);
});
t('CONFLITO DE REUSO: a principal já tem OUTRO shared_farm_id → conflito, não cria; a outra fazenda segue com UUID novo', () => {
  const ja = [vincV2('Z1', uuidN(80), { fazendaId: 'f1', sharedFarmId: uuidN(82), status: 'confirmado', pfLocalId: '80' })];
  // f1 só tem pares 1 e 2 — mas é a principal (mais pares que f2, com 1)… e já tem outro UUID.
  const rs = casarV2([1, 2, 4].map(n => campoV2(n, `p${n}`)), [feicao(1, GN(0)), feicao(2, GN(1)), feicao(4, GN(3))], NOSSOS_V2, ja);
  assert.deepEqual(rs.map(r => r.situacao), ['conflito', 'conflito', 'par']);
  assert.match(rs[0].motivo, new RegExp(`outro shared_farm_id \\(${uuidN(82)}\\)`));
  assert.equal(rs[0].podeCriar, false); assert.equal(rs[0].ids, null);
  assert.deepEqual([rs[2].ids.papelFazenda, rs[2].ids.sharedFarmId], ['nova', '00000000-9999-4999-8999-000000000001']);
});
t('produtor: cliente nosso com outro shared_producer_id (existente ou de outro item) → conflito', () => {
  const rs = casarV2([campoV2(1, 'p1'), campoV2(2, 'p2', { local_producer_id: 2, shared_producer_id: PROD2, shared_farm_id: FARM2 })],
    [feicao(1, GN(0)), feicao(2, GN(3))], NOSSOS_V2);
  assert.deepEqual(rs.map(r => r.situacao), ['par', 'conflito']);
  assert.match(rs[1].motivo, /shared_producer_id.*outro item do manifesto/);
  const [r] = casarV2([campoV2(1, 'p1')], [feicao(1, GN(0))], NOSSOS_V2, [vincV2('Z1', uuidN(80), { fazendaId: 'f9', sharedProducerId: uuidN(83), sharedFarmId: uuidN(84), status: 'confirmado', pfLocalId: '1' })]);
  assert.equal(r.situacao, 'conflito'); assert.match(r.motivo, /shared_producer_id/);
});
t('Q5 PERMITIDA: pendente sem ID PF e sem publicação é substituído; o UUID antigo dele não vira conflito', () => {
  const antigo = vincV2('N0', uuidN(70), { sharedProducerId: uuidN(71), sharedFarmId: uuidN(72) });
  const rs = casarV2([campoV2(1, '115'), campoV2(2, 'p2')], [feicao(1, GN(0)), feicao(2, GN(1))], NOSSOS_V2, [antigo]);
  assert.deepEqual(rs.map(r => [r.situacao, r.podeCriar, r.preMarcado]), [['par', true, true], ['par', true, true]]);
  assert.equal(rs[0].substitui.sharedFieldId, uuidN(70));
  assert.match(rs[0].motivo, /Substitui o vínculo PENDENTE/);
  assert.deepEqual(rs.map(r => r.ids.sharedFarmId), [FARM, FARM]);
});
t('Q5 NEGADA: confirmado, suspenso, pendente com ID PF, com publicação ou sem saber → já vinculado', () => {
  for (const [extra, re] of [
    [{ status: 'confirmado', pfLocalId: '1' }, /está confirmado/],
    [{ status: 'suspenso' }, /está suspenso/],
    [{ pfLocalId: '115' }, /já tem o ID PF 115/],
    [{ temPublicacao: true }, /já tem publicação/],
    [{ temPublicacao: undefined }, /não se sabe se já publicou/],
    [{ pfLocalId: undefined }, /não se sabe se tem ID PF/],
  ]) {
    const [r] = casarV2([campoV2(1, '115')], [feicao(1, GN(0))], NOSSOS_V2, [vincV2('N0', uuidN(70), extra)]);
    assert.equal(r.situacao, 'ja-vinculado', JSON.stringify(extra)); assert.equal(r.podeCriar, false); assert.match(r.motivo, re);
  }
});
t('desempenho: talhões longe (caixa não cruza) não são recortados — 5 000 distratores não pesam', () => {
  const longe = Array.from({ length: 5000 }, (_, i) => nosso(`L${i}`, poli(5 + i * 0.01, 5, 5.005 + i * 0.01, 5.005)));
  const t0 = performance.now();
  const rs = casarV2([1, 2, 3, 4, 5].map(n => campoV2(n, `p${n}`)), [0, 1, 2, 3, 4].map(i => feicao(i + 1, GN(i))), [...longe, ...NOSSOS_V2]);
  assert.ok(rs.every(r => r.situacao === 'par'));
  assert.ok(performance.now() - t0 < 3000, `${Math.round(performance.now() - t0)} ms`);
});
ta('casarManifestoAos dá o mesmo resultado, com progresso', async () => {
  const m = MF.lerManifestoPF(v2([1, 2, 3].map(n => campoV2(n, `p${n}`))));
  const idx = MF.lerLimitesGeojson(limitesFC([0, 1, 3].map((i, k) => feicao(k + 1, GN(i)))));
  const lims = m.campos.map(c => MF.limiteDoCampo(c, null, null, idx.feicoes));
  const prog = [];
  const a = await MF.casarManifestoAos(m.campos, lims, NOSSOS_V2, [], { novoUuid: sequencia() }, (f, tot) => prog.push(`${f}/${tot}`), 2);
  const b = MF.casarManifesto(m.campos, lims, NOSSOS_V2, [], { novoUuid: sequencia() });
  assert.deepEqual(a.map(r => [r.situacao, r.ids]), b.map(r => [r.situacao, r.ids]));
  assert.deepEqual(prog, ['2/3', '3/3']);
});

console.log('Manifesto v2 — conferência do servidor (Q2/Q5)');
const NUVEM2 = new Map([['N0', { fazendaId: 'f1', clienteId: 'c1', empresaId: null }], ['N1', { fazendaId: 'f1', clienteId: 'c1', empresaId: null }], ['N3', { fazendaId: 'f2', clienteId: 'c1', empresaId: null }]]);
const itemS = (talhaoId, n, extra = {}) => ({ ...itemC(talhaoId, n), substituir: false, ...extra });
t('Q5 no servidor: substitui só com o pedido explícito e só o pendente sem ID PF e sem publicação', () => {
  const antigo = vincV2('N0', uuidN(70), { sharedProducerId: uuidN(71), sharedFarmId: uuidN(72) });
  const ok1 = MF.conferirCriacao([itemS('N0', 1, { substituir: true }), itemS('N1', 2)], NUVEM2, [antigo]);
  assert.equal(ok1[0].ok, true); assert.equal(ok1[0].substitui.sharedFieldId, uuidN(70));
  assert.equal(ok1[1].ok, true, ok1[1].motivo);   // o UUID antigo da fazenda saiu da base
  assert.match(MF.conferirCriacao([itemS('N0', 1)], NUVEM2, [antigo])[0].motivo, /já tem vínculo/);
  for (const [extra, re] of [[{ status: 'confirmado' }, /confirmado/], [{ pfLocalId: '9' }, /ID PF 9/], [{ temPublicacao: true }, /publicação/]]) {
    assert.match(MF.conferirCriacao([itemS('N0', 1, { substituir: true })], NUVEM2, [{ ...antigo, ...extra }])[0].motivo, re);
  }
  assert.match(MF.conferirCriacao([itemS('N1', 1, { substituir: true })], NUVEM2, [])[0].motivo, /não tem vínculo/);
  assert.equal(MF.lerItensCriacao({ itens: [{ substituir: 'sim' }] }).itens[0].substituir, false);
});
t('substituição recusada por OUTRO motivo: o vínculo antigo volta à base e o resto é conferido de novo', () => {
  const antigo = vincV2('N0', uuidN(70), { sharedProducerId: uuidN(71), sharedFarmId: uuidN(72), clienteId: 'c1' });
  const outroCliente = vincV2('Q', uuidN(60), { fazendaId: 'f7', clienteId: 'c1', sharedProducerId: uuidN(71), sharedFarmId: uuidN(61), status: 'confirmado', pfLocalId: '60' });
  // N0 pede substituição com PROD, mas o cliente c1 já tem uuidN(71) em outro vínculo → recusa;
  // N1 (mesma fazenda f1) com FARM passava sem o antigo na base — com ele de volta, não passa.
  const r = MF.conferirCriacao([itemS('N0', 1, { substituir: true }), itemS('N1', 2, { sharedProducerId: uuidN(71) })], NUVEM2, [antigo, outroCliente]);
  assert.match(r[0].motivo, /shared_producer_id/);
  assert.equal(r[1].ok, false); assert.match(r[1].motivo, /shared_farm_id \(.*72/);
});
t('um shared_farm_id serve a UMA fazenda (novo); a fazenda que já o usa continua usando (legado)', () => {
  const daF1 = vincV2('Z1', uuidN(80), { status: 'confirmado', pfLocalId: '80' });
  const r = MF.conferirCriacao([itemS('N3', 3)], NUVEM2, [daF1]);
  assert.match(r[0].motivo, /já é de outra fazenda nossa \(f1\)/);
  const legado = [daF1, vincV2('Z2', uuidN(81), { fazendaId: 'f2', status: 'confirmado', pfLocalId: '81' })];
  assert.equal(MF.conferirCriacao([itemS('N3', 3)], NUVEM2, legado)[0].ok, true);
  // No mesmo pedido: a 2ª fazenda com o mesmo UUID cai.
  const r2 = MF.conferirCriacao([itemS('N0', 1), itemS('N3', 3)], NUVEM2, []);
  assert.equal(r2[0].ok, true); assert.match(r2[1].motivo, /já é de outra fazenda nossa/);
});

console.log('Manifesto v2 — retorno (VINCULOS.json + relatório)');
t('retorno: remote_*, identity_status, fazenda dividida, situações e o original intacto', () => {
  const orig = v2([1, 2, 3, 4, 5, 6].map(n => campoV2(n, `p${n}`)));
  const congelado = JSON.stringify(orig);
  const rs = casarV2([1, 2, 3, 4, 5, 6].map(n => campoV2(n, `p${n}`)),
    [feicao(1, GN(0)), feicao(2, GN(1)), feicao(3, poli(0.12, 0.1, 0.1315, 0.11)), feicao(4, GN(3)), feicao(5, poli(0.5, 0.5, 0.51, 0.51)), feicao(6, GN(4))], NOSSOS_V2);
  const novo = rs[3].ids.sharedFarmId;
  const vincs = [
    { talhaoId: 'N0', fazendaId: 'f1', clienteId: 'c1', sharedProducerId: PROD, sharedFarmId: FARM, sharedFieldId: uuidN(1), status: 'confirmado', publicados: 2 },
    { talhaoId: 'N1', fazendaId: 'f1', clienteId: 'c1', sharedProducerId: PROD, sharedFarmId: FARM, sharedFieldId: uuidN(2), status: 'confirmado', publicados: 0 },
    { talhaoId: 'N2', fazendaId: 'f1', clienteId: 'c1', sharedProducerId: PROD, sharedFarmId: FARM, sharedFieldId: uuidN(3), status: 'confirmado', publicados: 1 },
    { talhaoId: 'N3', fazendaId: 'f2', clienteId: 'c1', sharedProducerId: PROD, sharedFarmId: novo, sharedFieldId: uuidN(4), status: 'pendente', publicados: 0 },
  ];
  const nomes = { talhao: new Map(NOSSOS_V2.map(t => [t.id, t.nome])), fazenda: new Map([['f1', 'Fazenda Um'], ['f2', 'Fazenda Dois']]), cliente: new Map([['c1', 'CLIENTE NOSSO']]) };
  const ret = RT.montarRetornoPF(orig, rs, vincs, nomes, new Date('2026-11-05T12:00:00Z'));
  assert.equal(JSON.stringify(orig), congelado);
  const j = ret.vinculosJson;
  assert.deepEqual(j.fields.map(f => [f.remote_field_id, f.identity_status]), [
    ['N0', 'confirmed'], ['N1', 'confirmed'], ['N2', 'confirmed'], ['N3', 'remote_matched_pending_confirmation'],
    [null, 'remote_match_not_found'], [null, 'proposed_pending_remote_match'],
  ]);
  assert.deepEqual([j.fields[3].shared_farm_id, j.fields[3].proposed_shared_farm_id], [novo, FARM]);
  assert.equal(j.fields[0].proposed_shared_farm_id, undefined);
  assert.equal(j.fields[0].remote_field_name, 'nosso N0');
  assert.equal(j.fields[0].projects[0].name, 'linhas_verao');   // campos da PF preservados
  assert.deepEqual([j.clients[0].remote_producer_id, j.clients[0].remote_producer_name, j.clients[0].identity_status], ['c1', 'CLIENTE NOSSO', 'partially_confirmed']);
  assert.equal(j.clients[1].remote_producer_id, null);
  assert.equal(j.farm_groups.length, 3);
  assert.deepEqual([j.farm_groups[0].shared_farm_id, j.farm_groups[0].remote_farm_id, j.farm_groups[0].identity_status, j.farm_groups[0].note], [FARM, 'f1', 'confirmed', 'provisório']);
  assert.deepEqual([j.farm_groups[1].shared_farm_id, j.farm_groups[1].remote_farm_id, j.farm_groups[1].split_from_shared_farm_id, j.farm_groups[1].identity_status], [novo, 'f2', FARM, 'remote_matched_pending_confirmation']);
  assert.equal(j.farm_groups[2].shared_farm_id, FARM2);
  assert.deepEqual(ret.linhas.map(l => l.situacao), ['ativo', 'sem dados', 'limite divergente', 'pendente de confirmação', 'sem correspondência', 'sem correspondência']);
  assert.match(ret.linhas[5].motivo, /Par encontrado \(nosso N4.*não foi criado/);
  assert.deepEqual([ret.gruposDivididos, ret.fazendasNovas, ret.pendentes], [1, 1, 1]);
  assert.equal(j.invicta_return.field_status.ativo, 1);
  const csv = RT.relatorioCsv(ret.linhas);
  assert.ok(csv.startsWith('﻿local_field_id;talhao_pf;cliente_pf;situacao;motivo'));
  assert.equal(csv.trim().split('\r\n').length, 7);
});

// Pacote REAL de 04/11 (fora do repositório; dado da PF): roda quando existem
// PF_ATIVACAO_REAL=<pasta com VINCULOS.json + LIMITES.geojson> e
// PF_CASAMENTO_REF=<casamento-162.json — o casamento feito contra a base, com
// o talhão/fazenda/cliente nosso de cada par>. Os "nossos" são SIMULADOS a
// partir dos limites da PF (≤ 5 %: o mesmo limite; > 5 %: deslocado; ambíguo:
// partido ao meio; o "115" com o vínculo pendente sem ID PF; a Figueira com os
// 15 confirmados), nas fazendas/clientes REAIS da referência — prova a leitura
// dos 162 limites, as contagens, a divisão de fazendas, a conferência do
// servidor e o retorno.
const AREAL = process.env.PF_ATIVACAO_REAL, AREF = process.env.PF_CASAMENTO_REF;
if (AREAL && AREF && existsSync(AREAL) && existsSync(AREF)) {
  const { join } = await import('node:path');
  const { default: turfIntersect } = await import('@turf/intersect');
  const TH = await import('@turf/helpers');
  t('pacote real 04/11: 162 limites; 83 pares (com o 115), 38 > 5%, 21 ambíguos, 5 sem par, 15 já vinculados; 5 fazendas divididas; retorno', () => {
    const vj = JSON.parse(readFileSync(join(AREAL, 'VINCULOS.json'), 'utf8'));
    const man = MF.lerManifestoPF(vj);
    assert.equal(man.formato, 'v2'); assert.equal(man.campos.length, 162); assert.equal(man.campos.filter(c => c.problema).length, 0);
    const idx = MF.lerLimitesGeojson(readFileSync(join(AREAL, 'LIMITES.geojson'), 'utf8'));
    assert.deepEqual([idx.nFeicoes, idx.nSemId], [162, 0]);
    const lims = man.campos.map(c => MF.limiteDoCampo(c, null, null, idx.feicoes));
    assert.equal(lims.filter(l => l.ok).length, 162, lims.filter(l => !l.ok).map(l => l.erro).join('; '));
    const ref = new Map(JSON.parse(readFileSync(AREF, 'utf8')).map(x => [x.shared_field_id, x]));
    const mover = (g, dx) => JSON.parse(JSON.stringify(g), (k, v) => (Array.isArray(v) && typeof v[0] === 'number' ? [v[0] + dx, ...v.slice(1)] : v));
    const talhoes = [], vinculos = [];
    const add = (id, nome, fazendaId, clienteId, g) => talhoes.push({ id, nome, fazendaId, clienteId, geojson: JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: g }] }) });
    man.campos.forEach((c, k) => {
      const r = ref.get(c.sharedFieldId), g = lims[k].geometria, m = r?.melhor;
      if (!r) return;
      if (r.situacao === 'par_ate_5') add(m.id, m.nome, m.fazendaId, m.clienteId, g);
      else if (r.situacao === 'par_acima_5') { const cx = CL.caixaDoLimite(g); add(m.id, m.nome, m.fazendaId, m.clienteId, mover(g, (cx[2] - cx[0]) * 0.035)); }
      else if (r.situacao === 'talhao_ja_vinculado') {
        add(m.id, m.nome, m.fazendaId, m.clienteId, g);
        vinculos.push({ talhaoId: m.id, sharedProducerId: uuidN(971), sharedFarmId: uuidN(972), sharedFieldId: uuidN(973), status: 'pendente', fazendaId: m.fazendaId, clienteId: m.clienteId, pfLocalId: null, temPublicacao: false });
      } else if (r.situacao === 'ja_vinculado') {
        const f = vj.fields.find(x => x.shared_field_id === c.sharedFieldId);
        add(f.remote_field_id, c.nome, 'faz-figueira', 'cli-figueira', g);
        vinculos.push({ talhaoId: f.remote_field_id, sharedProducerId: c.sharedProducerId, sharedFarmId: c.sharedFarmId, sharedFieldId: c.sharedFieldId, status: 'confirmado', fazendaId: 'faz-figueira', clienteId: 'cli-figueira', pfLocalId: c.pfLocalId, temPublicacao: true });
      } else if (r.situacao === 'ambiguo') {
        const cx = CL.caixaDoLimite(g), xm = (cx[0] + cx[2]) / 2;
        const meia = (a, b) => TH.polygon([[[a, cx[1] - 1e-3], [b, cx[1] - 1e-3], [b, cx[3] + 1e-3], [a, cx[3] + 1e-3], [a, cx[1] - 1e-3]]]);
        [[cx[0] - 1e-3, xm], [xm, cx[2] + 1e-3]].forEach(([a, b], i) => {
          const p = turfIntersect(TH.featureCollection([TH.feature(g), meia(a, b)]));
          add(`${m.id}-${k}-${i}`, `${m.nome} ${i}`, m.fazendaId, m.clienteId, p.geometry);
        });
      }
    });
    const t0 = performance.now();
    const cas = MF.casarManifesto(man.campos, lims, talhoes, vinculos, { preMarcarDiferentes: true, novoUuid: sequencia() });
    const ms = Math.round(performance.now() - t0);
    const conta = s => cas.filter(r => r.situacao === s).length;
    assert.deepEqual(['par', 'diferente', 'ambiguo', 'sem-par', 'ja-vinculado', 'conflito', 'invalido'].map(conta), [83, 38, 21, 5, 15, 0, 0]);
    const q5 = cas.filter(r => r.substitui);
    assert.deepEqual(q5.map(r => [r.campo.nome, r.situacao]), [['115', 'par']]);
    assert.equal(cas.filter(r => r.preMarcado).length, 121);
    assert.deepEqual(cas.filter(r => r.situacao === 'sem-par').map(r => r.campo.nomeClientePF).sort(), ['Jacob Cornelio Aardoom', 'Leonardo Geus', 'Leonardo Geus', 'Leonardo Geus', 'Leonardo Geus']);
    const grupos = MF.resumoFazendas(cas);
    const div = grupos.filter(g => g.dividido);
    assert.deepEqual(div.map(g => g.nomeClientePF).sort(), ['Adriano Kiers', 'Christian Kliewer', 'Jacob Cornelio Aardoom', 'Jose Ricardo Arruda', 'Ricardo Volter']);
    assert.equal(grupos.flatMap(g => g.fazendas).filter(f => f.papel === 'nova').length, 10);
    // O servidor aceita o lote inteiro como a tela mandaria.
    const itens = cas.filter(r => r.podeCriar).map(r => ({
      talhaoId: r.melhor.talhaoId, pfLocalId: r.campo.pfLocalId, nomePF: r.campo.nome, sharedProducerId: r.ids.sharedProducerId,
      sharedFarmId: r.ids.sharedFarmId, sharedFieldId: r.campo.sharedFieldId, substituir: !!r.substitui,
    }));
    const nuvem = new Map(talhoes.map(x => [x.id, { fazendaId: x.fazendaId, clienteId: x.clienteId, empresaId: null }]));
    const conf = MF.conferirCriacao(itens, nuvem, vinculos);
    assert.equal(conf.filter(c => c.ok).length, 121, conf.filter(c => !c.ok).map(c => c.motivo).join('; '));
    // Retorno depois de criar (121 pendentes; o 115 substituído) + os 15 da Figueira.
    const depois = [
      ...vinculos.filter(v => v.status === 'confirmado').map(v => ({ ...v, publicados: 1 })),
      ...conf.map(c => ({ talhaoId: c.item.talhaoId, fazendaId: c.fazendaId, clienteId: c.clienteId, sharedProducerId: c.item.sharedProducerId, sharedFarmId: c.item.sharedFarmId, sharedFieldId: c.item.sharedFieldId, status: 'pendente', publicados: 0 })),
    ];
    const ret = RT.montarRetornoPF(vj, cas, depois, { talhao: new Map(talhoes.map(x => [x.id, x.nome])), fazenda: new Map(), cliente: new Map() });
    assert.equal(ret.vinculosJson.farm_groups.length, 13 + 10);
    assert.equal(ret.vinculosJson.fields.filter(f => f.remote_field_id).length, 136);
    assert.deepEqual([ret.gruposDivididos, ret.fazendasNovas, ret.pendentes], [5, 10, 121]);
    assert.equal(ret.linhas.length, 162);
    console.log(`    (casamento ${ms} ms, ${talhoes.length} talhões; retorno: ${RT.SITUACOES_RETORNO.map(s => `${ret.contagem[s]} ${s}`).join(' · ')})`);
  });
} else {
  console.log('  – pacote real 04/11: pulado (defina PF_ATIVACAO_REAL=<pasta> e PF_CASAMENTO_REF=<casamento-162.json>)');
}

// Manifesto REAL da PF (fora do repositório; dado da Figueira): roda quando
// existe a pasta descompactada do complemento (PF_MANIFESTO_REAL=<pasta>).
// Os "nossos" são simulados com os próprios limites da PF e o IGEFI11 partido
// ao meio — prova a leitura dos 16 arquivos (SHA-256) e a regra de ambíguo.
const MREAL = process.env.PF_MANIFESTO_REAL;
if (MREAL && existsSync(MREAL)) {
  const { createHash } = await import('node:crypto');
  const { join } = await import('node:path');
  const { readdirSync } = await import('node:fs');
  const { default: turfIntersect } = await import('@turf/intersect');
  const TH = await import('@turf/helpers');
  t('Figueira real: 16 limites lidos e conferidos; 14 pares 1:1, IGEFI11 ambíguo, IGEFI03 já vinculado', () => {
    const man = MF.lerManifestoPF(readFileSync(join(MREAL, 'FIGUEIRA_VINCULOS_PROPOSTOS.json'), 'utf8'));
    const pasta = join(MREAL, 'limites_figueira');
    const arqs = new Map(readdirSync(pasta).map(f => [`limites_figueira/${f}`, readFileSync(join(pasta, f))]));
    const lims = man.campos.map(c => { const b = MF.acharArquivo(arqs, c.arquivoLimite); return MF.limiteDoCampo(c, b.toString('utf8'), createHash('sha256').update(b).digest('hex')); });
    assert.equal(lims.filter(l => l.ok).length, 16, lims.filter(l => !l.ok).map(l => l.erro).join('; '));
    const talhoes = [];
    man.campos.forEach((c, k) => {
      const g = lims[k].geometria;
      if (c.nome !== 'IGEFI11') { talhoes.push(nosso(c.nome, g)); return; }
      const cx = CL.caixaDoLimite(g), xm = (cx[0] + cx[2]) / 2;
      const meia = (a, b) => TH.polygon([[[a, cx[1] - 1e-3], [b, cx[1] - 1e-3], [b, cx[3] + 1e-3], [a, cx[3] + 1e-3], [a, cx[1] - 1e-3]]]);
      talhoes.push(nosso('IGEFI 10', turfIntersect(TH.featureCollection([TH.feature(g), meia(cx[0] - 1e-3, xm)])).geometry));
      talhoes.push(nosso('IGEFI 11', turfIntersect(TH.featureCollection([TH.feature(g), meia(xm, cx[2] + 1e-3)])).geometry));
    });
    const i03 = man.campos.find(c => c.nome === 'IGEFI03');
    const rs = MF.casarManifesto(man.campos, lims, talhoes, [vinc('IGEFI03', i03.sharedFieldId, { status: 'confirmado', sharedFarmId: i03.sharedFarmId, sharedProducerId: i03.sharedProducerId })]);
    const por = s => rs.filter(r => r.situacao === s).map(r => r.campo.nome);
    assert.equal(por('par').length, 14, JSON.stringify(rs.map(r => [r.campo.nome, r.situacao, r.motivo])));
    assert.deepEqual(por('ambiguo'), ['IGEFI11']);
    assert.deepEqual(por('ja-vinculado'), ['IGEFI03']);
    assert.equal(rs.find(r => r.campo.nome === 'PEQHOL').campo.pfLocalId, '31');
  });
} else {
  console.log('  – Figueira real: pulado (defina PF_MANIFESTO_REAL=<pasta do complemento descompactado>)');
}

console.log('Lote — execução');
ta('concorrência limitada, ordem preservada, exceção de um vira "erro" e o lote segue', async () => {
  let ativos = 0, pico = 0;
  const progresso = [];
  const rs = await LT.executarEmLote([1, 2, 3, 4, 5, 6, 7], async n => {
    ativos++; pico = Math.max(pico, ativos);
    await new Promise(r => setTimeout(r, 5 + (n % 3) * 3));
    ativos--;
    if (n === 3) throw new Error('falhou o 3');
    return n % 2 ? LT.ok(`ok ${n}`) : LT.pulado(`pulado ${n}`);
  }, { concorrencia: 2, aoProgredir: p => progresso.push(p.feitos) });
  assert.equal(pico, 2);
  assert.deepEqual(rs.map(r => r.texto), ['ok 1', 'pulado 2', 'falhou o 3', 'pulado 4', 'ok 5', 'pulado 6', 'ok 7']);
  assert.equal(rs[2].desfecho, 'erro');
  assert.deepEqual(progresso, [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(LT.resumoDoLote(rs).texto, '3 ok · 3 pulados · 1 erro');
});
t('falha da rota → desfecho: 404/409/413/422 = pulado; rede, 400, 401/403 e 5xx = erro', () => {
  for (const s of [404, 409, 413, 422]) assert.equal(LT.desfechoDaFalha(s), 'pulado');
  for (const s of [undefined, 400, 401, 403, 500, 502, 503]) assert.equal(LT.desfechoDaFalha(s), 'erro');
});
t('várias colheitas do mesmo talhão viram UM resultado (erro > ok > pulado)', () => {
  assert.equal(LT.juntarResultados([LT.pulado('a'), LT.ok('b')]).desfecho, 'ok');
  assert.equal(LT.juntarResultados([LT.ok('a'), LT.erro('b')]).desfecho, 'erro');
  assert.equal(LT.juntarResultados([LT.pulado('a'), LT.pulado('b')]).texto, 'a · b');
});

await Promise.all(pendentes);

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
