// FATIAR a área do polígono entre as zonas (src/lib/areaGeo.ts → fatiarArea).
// Roda: `npm run teste:fatiar`.
//
// Regra do app: a área que vale é a do POLÍGONO do talhão; o que é fatiado por
// zonas de manejo TEM de somar essa área de volta. Sem isso a mesma tela mostra
// 143,5 / 142,38 / 139,28 para o mesmo talhão e ninguém sabe qual está certo.
import assert from 'node:assert/strict';
import { fatiarArea } from '../src/lib/areaGeo.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ok  ', n); } catch (e) { fail++; console.error('  FALHOU', n, '-', e.message); } };
const soma = (a) => Math.round(a.reduce((s, v) => s + v, 0) * 100) / 100;

console.log('\nFatiar a area do poligono entre as zonas\n');

t('a soma das fatias E a area do poligono — o caso relatado', () => {
  const zonas = [81.6, 3.5, 37, 13.6, 3.6];        // somam 139,3
  const r = fatiarArea(zonas, 142.38);
  assert.equal(soma(r), 142.38);
});

t('a PROPORCAO entre as zonas nao muda', () => {
  const zonas = [80, 40, 20];
  const r = fatiarArea(zonas, 142.38);
  assert.ok(Math.abs(r[0] / r[1] - 2) < 0.001);
  assert.ok(Math.abs(r[1] / r[2] - 2) < 0.001);
});

t('fecha com 2 casas mesmo quando o arredondamento nao ajuda', () => {
  for (const total of [100.01, 113.34, 142.38, 7.77, 999.99]) {
    const r = fatiarArea([1, 1, 1], total);
    assert.equal(soma(r), total, `total ${total} somou ${soma(r)}`);
  }
});

t('zona de area zero continua zero (nao ganha area do nada)', () => {
  const r = fatiarArea([50, 0, 50], 120);
  assert.equal(r[1], 0);
  assert.equal(soma(r), 120);
});

t('total invalido devolve as partes como vieram, so arredondadas', () => {
  assert.deepEqual(fatiarArea([10, 20], 0), [10, 20]);
  assert.deepEqual(fatiarArea([10, 20], -5), [10, 20]);
});

t('partes vazias ou somando zero nao quebram nem dividem por zero', () => {
  assert.deepEqual(fatiarArea([], 100), []);
  assert.deepEqual(fatiarArea([0, 0], 100), [0, 0]);
});

t('valor invalido (NaN) vira zero em vez de contaminar a soma', () => {
  const r = fatiarArea([10, NaN, 30], 80);
  assert.equal(soma(r), 80);
  assert.equal(r[1], 0);
});

t('uma zona so recebe a area inteira do poligono', () => {
  assert.deepEqual(fatiarArea([139.28], 142.38), [142.38]);
});

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
