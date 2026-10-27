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
t('capabilities: versão, tipos, formato, limites e o que NÃO existe na fase 1', () => {
  const c = capabilities('production');
  assert.equal(c.contract_version, '0.2.0'); assert.equal(c.environment, 'production');
  assert.deepEqual(c.resource_types, ['management_zones', 'harvest']);
  assert.deepEqual(c.formats, ['application/geo+json']);
  assert.equal(c.limits.max_geojson_bytes, 10 * 1024 * 1024); assert.equal(c.limits.max_page_size, 200);
  assert.equal(c.features.changes, false); assert.equal(c.features.notifications, false); assert.equal(c.features.receipts, false);
  assert.deepEqual(c.not_implemented, ['/changes', '/notifications', '/receipts']);
  assert.equal(corpoNaoImplementado('/changes').error.code, 'not_implemented');
});

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
