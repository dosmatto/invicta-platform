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

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
