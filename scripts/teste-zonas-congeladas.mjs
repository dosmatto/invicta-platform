// Zonas congeladas dentro da grade — roda: npm run teste:zonascongeladas
//
// O caso relatado: no app de campo, a grade "MCASH 09 — Zonas 1" mostrava os
// pontos "1-1, 2-6, 3-8" sobre o satélite SEM NENHUMA DIVISA. A zona passou a
// viajar dentro da grade; estas são as regras que decidem com que rótulo ela
// viaja e quando é seguro congelar um zoneamento numa grade antiga.

import assert from 'node:assert/strict';
import {
  CASAS, arredondarGeometria, congelarZonas, normalizarRotulo, prefixosDosPontos, zoneamentoCasa,
} from '../src/lib/zonasCongeladas.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

// quadrado de lado ~0,01° com canto inferior-esquerdo em (x, y)
const quadrado = (x, y, l = 0.01) => ({
  type: 'Polygon',
  coordinates: [[[x, y], [x + l, y], [x + l, y + l], [x, y + l], [x, y]]],
});
const zona = (id, geom, extra = {}) => ({
  type: 'Feature', properties: { id, zona: id, classe: 'Alta', areaHa: 10, ...extra }, geometry: geom,
});
const fcDe = (...features) => ({ type: 'FeatureCollection', features });

// zoneamento de referência: zona 01 à esquerda, zona 02 à direita
const FC = fcDe(zona('01', quadrado(0, 0)), zona('02', quadrado(0.02, 0)));
// pontos dentro de cada uma, numerados como lib/gradeZonas numera
const PONTOS = [
  { zona: '01', rotulo: '1-1', lng: 0.005, lat: 0.005 },
  { zona: '01', rotulo: '1-2', lng: 0.003, lat: 0.007 },
  { zona: '02', rotulo: '2-1', lng: 0.025, lat: 0.005 },
];

console.log('\nZonas congeladas na grade\n');

// ── Rótulo ────────────────────────────────────────────────────────────────
t('O CASO RELATADO: o rótulo da zona é o MESMO prefixo dos pontos dela', () => {
  // o mapa chama de "01"; os pontos dizem "1-1" — congelar "01" poria dois
  // números diferentes para a mesma zona na tela do operador.
  const pref = prefixosDosPontos(PONTOS);
  const zonas = congelarZonas(FC, r => pref.get(r));
  assert.deepEqual(zonas.map(z => z.rotulo), ['1', '2']);
});

t('zona SEM ponto nenhum cai na normalização, não no rótulo cru', () => {
  const fc = fcDe(...FC.features, zona('03', quadrado(0.04, 0)));
  const pref = prefixosDosPontos(PONTOS);
  assert.deepEqual(congelarZonas(fc, r => pref.get(r)).map(z => z.rotulo), ['1', '2', '3']);
});

t('normalizarRotulo tira o zero à esquerda e preserva o que não tem dígito', () => {
  assert.equal(normalizarRotulo('01'), '1');
  assert.equal(normalizarRotulo('10'), '10');
  assert.equal(normalizarRotulo('Alta'), 'Alta');   // inventar número aqui colidiria com uma zona real
  assert.equal(normalizarRotulo(''), '');
});

t('prefixo sai dos pontos mesmo quando a numeração precisou desempatar', () => {
  // "1" e "01" querem os dois o número 1; a numeração dá 2 para o segundo.
  const pts = [{ zona: '1', rotulo: '1-1', lng: 0, lat: 0 }, { zona: '01', rotulo: '2-1', lng: 0, lat: 0 }];
  const pref = prefixosDosPontos(pts);
  assert.equal(pref.get('1'), '1');
  assert.equal(pref.get('01'), '2');
});

// ── Geometria ─────────────────────────────────────────────────────────────
t('arredondar corta a precisão nas 6 casas (é a razão de a função existir)', () => {
  const g = arredondarGeometria({
    type: 'Polygon',
    coordinates: [[[-51.123456789012, -23.987654321098], [-51.1, -23.9], [-51.2, -23.8], [-51.123456789012, -23.987654321098]]],
  });
  assert.deepEqual(g.coordinates[0][0], [-51.123457, -23.987654]);
  // nenhum vértice sobra com mais de CASAS decimais
  for (const [x, y] of g.coordinates[0]) {
    for (const v of [x, y]) {
      const casas = (String(v).split('.')[1] ?? '').length;
      assert.ok(casas <= CASAS, `${v} ficou com ${casas} casas`);
    }
  }
});

t('arredondar não abre o anel nem separa a divisa de duas zonas', () => {
  // anel com o último vértice escrito com MAIS casas que o primeiro: se o
  // arredondamento não os juntasse, o polígono sairia aberto.
  const g = arredondarGeometria({
    type: 'Polygon',
    coordinates: [[[0.1234567, 0], [0.2, 0], [0.2, 0.1], [0.12345671, 0.0000000004]]],
  });
  const anel = g.coordinates[0];
  assert.deepEqual(anel[0], anel[anel.length - 1], 'o anel tem que fechar depois de arredondar');
  // vértice comum de duas zonas vizinhas, escrito diferente em cada arquivo
  const a = arredondarGeometria({ type: 'Polygon', coordinates: [[[0.0100000004, 0.02], [0, 0], [0, 0.02], [0.0100000004, 0.02]]] }).coordinates[0][0];
  const b = arredondarGeometria({ type: 'Polygon', coordinates: [[[0.0099999996, 0.02], [0.03, 0], [0.03, 0.02], [0.0099999996, 0.02]]] }).coordinates[0][0];
  assert.deepEqual(a, b, 'a divisa comum tem que continuar sendo o MESMO vértice');
});

t('zona com BURACO: ponto no furo conta como fora', () => {
  // quadrado grande com um furo no meio; o ponto do furo não é da zona.
  const comFuro = {
    type: 'Polygon',
    coordinates: [
      [[0, 0], [0.1, 0], [0.1, 0.1], [0, 0.1], [0, 0]],
      [[0.04, 0.04], [0.06, 0.04], [0.06, 0.06], [0.04, 0.06], [0.04, 0.04]],
    ],
  };
  const fc = fcDe(zona('01', comFuro));
  const dentro = [{ zona: '01', rotulo: '1-1', lng: 0.02, lat: 0.02 }];
  const noFuro = [{ zona: '01', rotulo: '1-1', lng: 0.05, lat: 0.05 }];
  assert.equal(zoneamentoCasa(fc, dentro), true);
  assert.equal(zoneamentoCasa(fc, noFuro), false);
});

t('congelar duas vezes a mesma FC dá exatamente o mesmo resultado', () => {
  const pref = prefixosDosPontos(PONTOS);
  assert.deepEqual(congelarZonas(FC, r => pref.get(r)), congelarZonas(FC, r => pref.get(r)));
});

t('MultiPolygon (zona partida em duas manchas) sobrevive ao congelamento', () => {
  const mp = { type: 'MultiPolygon', coordinates: [quadrado(0, 0).coordinates, quadrado(0.05, 0).coordinates] };
  const [z] = congelarZonas(fcDe(zona('01', mp)));
  assert.equal(z.geometry.type, 'MultiPolygon');
  assert.equal(z.geometry.coordinates.length, 2);
});

t('feature sem polígono (ponto/linha solta no arquivo) não vira zona', () => {
  const fc = fcDe(...FC.features, { type: 'Feature', properties: { id: '09' }, geometry: { type: 'Point', coordinates: [0, 0] } });
  assert.equal(congelarZonas(fc).length, 2);
});

// ── Casamento com os pontos (o que autoriza reparar uma grade antiga) ──────
t('o zoneamento que gerou a grade CASA', () => {
  assert.equal(zoneamentoCasa(FC, PONTOS), true);
});

t('OUTRO zoneamento, numerado igual mas desenhado em outro lugar, NÃO casa', () => {
  // a trava só por número deixaria isto passar: as duas têm zonas "01" e "02".
  const outro = fcDe(zona('01', quadrado(10, 10)), zona('02', quadrado(10.02, 10)));
  assert.equal(zoneamentoCasa(outro, PONTOS), false);
});

t('zoneamento sem a zona que os pontos citam NÃO casa', () => {
  assert.equal(zoneamentoCasa(fcDe(zona('01', quadrado(0, 0))), PONTOS), false);
});

t('grade antiga SEM `zona` nos pontos não casa com nada (não dá para conferir)', () => {
  const semZona = [{ rotulo: '1', lng: 0.005, lat: 0.005 }, { rotulo: '2', lng: 0.025, lat: 0.005 }];
  assert.equal(zoneamentoCasa(FC, semZona), false);
});

t('um ponto arrastado para fora na edição manual não invalida a grade', () => {
  // 12 pontos no lugar + 1 arrastado para fora = 92% dentro, acima do mínimo
  const pts = [...PONTOS, ...PONTOS, ...PONTOS, ...PONTOS,
    { zona: '02', rotulo: '2-9', lng: 0.0399, lat: 0.005 }];
  assert.equal(pts.length, 13);
  assert.equal(zoneamentoCasa(FC, pts), true);
});

t('metade dos pontos fora: é outro zoneamento, não casa', () => {
  const pts = [PONTOS[0], { zona: '01', rotulo: '1-9', lng: 5, lat: 5 }];
  assert.equal(zoneamentoCasa(FC, pts), false);
});

t('zoneamento vazio ou ausente não casa', () => {
  assert.equal(zoneamentoCasa(null, PONTOS), false);
  assert.equal(zoneamentoCasa(fcDe(), PONTOS), false);
});

console.log(`\n${ok} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
