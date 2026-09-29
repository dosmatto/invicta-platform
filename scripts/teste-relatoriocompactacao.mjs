// Cálculos do relatório de compactação — roda: npm run teste:relatoriocompactacao
//
// O que este arquivo protege:
//   1. Classe de um valor pela legenda oficial (5 classes em MPa, bordas
//      1,0/1,5/2,0/3,0): borda fica na classe de BAIXO; NaN não tem classe.
//   2. % de área por classe a partir do grid: NaN (fora do talhão) não conta;
//      com polígono, o pixel com centro fora dele também não; soma = 100%.
//   3. Estatística dos pontos por camada ignora camada sem leitura.
//   4. Tabela pontos × camadas: célula vazia sem leitura, linha de média com a
//      classe da média; paginação.
//   5. Rótulos de faixa e de método em texto Latin-1 (fonte do jsPDF).

import assert from 'node:assert/strict';
import { classesFertilidade5 } from '../src/lib/legendas.ts';
import {
  indiceClasseValor, rotuloFaixaClasse, pontoNoPoligono, areaPorClasse, estatisticaPontos,
  rotuloMetodo, metodoGeral, camadasFaltando, montarTabela, paginar, gradeMiniaturas,
} from '../src/lib/relatorioCompactacaoCalc.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}
const perto = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

// Mesma régua da legenda oficial sys_compactacao.
const CL = classesFertilidade5([1.0, 1.5, 2.0, 3.0], true);

console.log('classe do valor');
t('valores no meio de cada classe', () => {
  assert.equal(indiceClasseValor(0.5, CL), 0);
  assert.equal(indiceClasseValor(1.2, CL), 1);
  assert.equal(indiceClasseValor(1.8, CL), 2);
  assert.equal(indiceClasseValor(2.5, CL), 3);
  assert.equal(indiceClasseValor(3.7, CL), 4);
});
t('borda pertence à classe de baixo', () => {
  assert.equal(indiceClasseValor(1.0, CL), 0);
  assert.equal(indiceClasseValor(1.5, CL), 1);
  assert.equal(indiceClasseValor(3.0, CL), 3);
  assert.equal(indiceClasseValor(3.0000001, CL), 4);
});
t('NaN/Infinity sem classe; zero e negativo na primeira', () => {
  assert.equal(indiceClasseValor(NaN, CL), -1);
  assert.equal(indiceClasseValor(Infinity, CL), -1);
  assert.equal(indiceClasseValor(0, CL), 0);
});
t('rótulos de faixa (Latin-1)', () => {
  assert.equal(rotuloFaixaClasse(CL[0]), '<= 1,0');
  assert.equal(rotuloFaixaClasse(CL[1]), '1,0 - 1,5');
  assert.equal(rotuloFaixaClasse(CL[4]), '> 3,0');
  for (const c of CL) assert.ok(/^[\x00-\xFF]*$/.test(rotuloFaixaClasse(c)));
});

console.log('% de área por classe');
t('conta só pixels finitos; soma 100%; média do mapa', () => {
  // 2×3: um NaN; valores em 3 classes
  const v = new Float32Array([0.5, 0.5, NaN, 1.8, 2.5, 2.5]);
  const a = areaPorClasse(v, 2, 3, CL, { pixelM: 10 });
  assert.equal(a.nPix, 5);
  assert.deepEqual(a.pixPorClasse, [2, 0, 1, 2, 0]);
  perto(a.pct.reduce((s, x) => s + x, 0), 100, 1e-9);
  perto(a.pct[0], 40, 1e-9);
  perto(a.ha[3], 2 * 0.01, 1e-12);      // 2 pixels de 10 m = 0,02 ha
  perto(a.mediaMapa, (0.5 + 0.5 + 1.8 + 2.5 + 2.5) / 5, 1e-6);
});
t('grid todo NaN → sem área, média nula', () => {
  const a = areaPorClasse(new Float32Array([NaN, NaN]), 1, 2, CL);
  assert.equal(a.nPix, 0);
  assert.deepEqual(a.pct, [0, 0, 0, 0, 0]);
  assert.equal(a.mediaMapa, null);
});
t('polígono corta os pixels com centro fora dele', () => {
  // bounds 0..4 × 0..2, grid 2×4 (pixel 1×1). Polígono = metade oeste (x 0..2).
  const bounds = [0, 0, 4, 2];
  const pol = { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] };
  const v = new Float32Array([0.5, 0.5, 3.5, 3.5, 0.5, 0.5, 3.5, 3.5]);
  const a = areaPorClasse(v, 2, 4, CL, { bounds, poligono: pol });
  assert.equal(a.nPix, 4);
  assert.deepEqual(a.pixPorClasse, [4, 0, 0, 0, 0]);
});
t('ponto no polígono honra buraco', () => {
  const pol = { type: 'Polygon', coordinates: [
    [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
    [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
  ] };
  assert.equal(pontoNoPoligono(1, 1, pol), true);
  assert.equal(pontoNoPoligono(5, 5, pol), false);
  assert.equal(pontoNoPoligono(11, 5, pol), false);
});
t('orientação: linha 0 é o NORTE', () => {
  // grid 2×1: linha 0 (norte) = 3,5; linha 1 (sul) = 0,5. Polígono só na metade norte.
  const pol = { type: 'Polygon', coordinates: [[[0, 1], [1, 1], [1, 2], [0, 2], [0, 1]]] };
  const a = areaPorClasse(new Float32Array([3.5, 0.5]), 2, 1, CL, { bounds: [0, 0, 1, 2], poligono: pol });
  assert.deepEqual(a.pixPorClasse, [0, 0, 0, 0, 1]);
});

console.log('estatística e tabela');
const PTS = [
  { lng: 0, lat: 0, medicao: '3', valores: { '0-10': 0.8, '10-20': 2.1 } },
  { lng: 1, lat: 0, valores: { '0-10': 1.2, '10-20': 2.9, '20-30': 3.4 } },
  { lng: 2, lat: 0, medicao: '5+6', valores: { '0-10': 1.0 } },
];
t('estatística ignora camada sem leitura', () => {
  const e = estatisticaPontos(PTS, '10-20');
  assert.equal(e.n, 2); perto(e.media, 2.5, 1e-12); perto(e.min, 2.1); perto(e.max, 2.9);
  assert.equal(estatisticaPontos(PTS, '50-60'), null);
});
t('tabela: medição, célula vazia, classes e média', () => {
  const tb = montarTabela(PTS, ['0-10', '10-20', '20-30'], CL);
  assert.equal(tb.linhas.length, 3);
  assert.equal(tb.linhas[0].medicao, '3');
  assert.equal(tb.linhas[1].medicao, '2');          // sem medição → nº do ponto
  assert.equal(tb.linhas[2].medicao, '5+6');
  assert.deepEqual(tb.linhas[2].celulas[1], { valor: null, classe: -1 });
  assert.equal(tb.linhas[1].celulas[2].classe, 4);
  perto(tb.media[0].valor, 1.0, 1e-12);
  assert.equal(tb.media[0].classe, 0);              // 1,0 = borda → classe de baixo
  assert.equal(tb.media[1].classe, 3);              // 2,5
  assert.equal(tb.media[2].classe, 4);              // 3,4
});
t('paginação', () => {
  assert.deepEqual(paginar([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(paginar([], 10), [[]]);
  assert.equal(paginar(Array.from({ length: 21 }, (_, i) => i), 24).length, 1);
});

console.log('rótulos e prontidão');
t('método', () => {
  assert.equal(rotuloMetodo('idw'), 'IDW');
  assert.equal(rotuloMetodo('spherical'), 'Krigagem (spherical)');
  assert.equal(rotuloMetodo(''), '—');
  assert.equal(metodoGeral(['spherical', 'exponential']), 'Krigagem');
  assert.equal(metodoGeral(['spherical', 'idw']), 'IDW / Krigagem');
});
t('camadas faltando', () => {
  assert.deepEqual(camadasFaltando(['0-10', '10-20', '20-30'], ['10-20']), ['0-10', '20-30']);
  assert.deepEqual(camadasFaltando(['0-10'], new Set(['0-10'])), []);
});
t('grade das miniaturas', () => {
  assert.deepEqual(gradeMiniaturas(1), { cols: 1, rows: 1 });
  assert.deepEqual(gradeMiniaturas(6), { cols: 3, rows: 2 });
  assert.deepEqual(gradeMiniaturas(8), { cols: 4, rows: 2 });
  assert.deepEqual(gradeMiniaturas(12), { cols: 4, rows: 3 });
});

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
