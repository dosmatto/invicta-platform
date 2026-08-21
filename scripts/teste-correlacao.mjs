// Correlação entre rasters — roda: npm run teste:correlacao
//
// O ponto central: a extração de comparador.ts/ComparadorProdNdvi.tsx para
// lib/correlacaoGrid.ts NÃO pode mudar número nenhum. O teste carrega uma
// RÉPLICA do algoritmo antigo (materializava todos os pares e depois filtrava
// por passo) e exige r e amostra idênticos — é a rede que protege o "r" que já
// está na tela do usuário e o ranking do MatrizFatores.

import assert from 'node:assert/strict';
import { correlacaoGrids, reamostrarBilinear, sobreposicaoBbox } from '../src/lib/correlacaoGrid.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

// ── Réplica EXATA do algoritmo anterior (comparador.ts pré-extração) ─────────
function correlacaoAntiga(pa, pb, maxAmostra = 500) {
  const br = reamostrarBilinear(pb.valores, pb.rows, pb.cols, pa.rows, pa.cols);
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  const pares = [];
  for (let i = 0; i < pa.valores.length; i++) {
    const x = pa.valores[i], y = br[i];
    if (!isFinite(x) || !isFinite(y)) continue;
    n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
    pares.push({ a: x, b: y });
  }
  if (n < 30) return { r: null, amostra: [] };
  const cov = sxy / n - (sx / n) * (sy / n);
  const vx = sxx / n - (sx / n) ** 2, vy = syy / n - (sy / n) ** 2;
  const d = Math.sqrt(vx * vy);
  const r = d > 0 ? cov / d : null;
  const passo = Math.max(1, Math.floor(pares.length / maxAmostra));
  return { r, amostra: pares.filter((_, i) => i % passo === 0).slice(0, maxAmostra) };
}

// ── Fixtures determinísticas (LCG — sem Math.random) ────────────────────────
function rnd(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function malha(rows, cols, fn) {
  const v = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) v[r * cols + c] = fn(r, c);
  return { valores: v, rows, cols };
}

const R = rnd(42);
// A: gradiente + ruído; B: correlacionado com A; alguns NaN dos dois lados
const base = malha(60, 80, (r, c) => r * 10 + c * 3);
const A = malha(60, 80, (r, c) => (r === 0 && c < 5 ? NaN : base.valores[r * 80 + c] + R() * 40));
const B = malha(60, 80, (r, c) => (c === 79 ? NaN : base.valores[r * 80 + c] * 0.5 + R() * 30));

console.log('\nequivalência com o algoritmo anterior');

t('r idêntico ao da implementação antiga', () => {
  const antigo = correlacaoAntiga(A, B);
  const novo = correlacaoGrids(A, B, { maxAmostra: 500, minN: 30 });
  assert.equal(novo.r, antigo.r);
});

t('amostra idêntica (mesmos pares, mesma ordem)', () => {
  const antigo = correlacaoAntiga(A, B);
  const novo = correlacaoGrids(A, B, { maxAmostra: 500, minN: 30 });
  assert.deepEqual(novo.amostra, antigo.amostra);
});

t('idêntico também em malhas de tamanhos diferentes (reamostragem)', () => {
  const B2 = malha(30, 40, (r, c) => r * 20 + c * 6 + R() * 15);
  const antigo = correlacaoAntiga(A, B2);
  const novo = correlacaoGrids(A, B2, { maxAmostra: 500, minN: 30 });
  assert.equal(novo.r, antigo.r);
  assert.deepEqual(novo.amostra, antigo.amostra);
});

t('idêntico com maxAmostra grande (passo = 1)', () => {
  const antigo = correlacaoAntiga(A, B, 100000);
  const novo = correlacaoGrids(A, B, { maxAmostra: 100000, minN: 30 });
  assert.equal(novo.r, antigo.r);
  assert.deepEqual(novo.amostra, antigo.amostra);
});

console.log('\ncorrelacaoGrids');

t('amostra respeita o teto', () => {
  const c = correlacaoGrids(A, B, { maxAmostra: 1500, minN: 30 });
  assert.ok(c.amostra.length <= 1500);
  assert.ok(c.amostra.length > 0);
});

t('n conta só os pixels válidos nos DOIS mapas', () => {
  const c = correlacaoGrids(A, B, {});
  // A tem 5 NaN (linha 0, colunas 0-4), B tem 60 NaN (coluna 79) — conjuntos
  // disjuntos, então cada um tira o seu do total.
  assert.equal(c.n, 60 * 80 - 5 - 60);
});

t('correlação positiva perfeita dá r = 1', () => {
  const x = malha(20, 20, (r, c) => r * 20 + c);
  const y = malha(20, 20, (r, c) => (r * 20 + c) * 3 + 7);
  const c = correlacaoGrids(x, y, {});
  assert.ok(Math.abs(c.r - 1) < 1e-9, `r=${c.r}`);
});

t('correlação negativa perfeita dá r = -1', () => {
  const x = malha(20, 20, (r, c) => r * 20 + c);
  const y = malha(20, 20, (r, c) => -(r * 20 + c) * 2);
  const c = correlacaoGrids(x, y, {});
  assert.ok(Math.abs(c.r + 1) < 1e-9, `r=${c.r}`);
});

t('poucos pixels em comum → r null e amostra vazia', () => {
  const x = malha(4, 4, (r, c) => r + c);
  const y = malha(4, 4, (r, c) => r - c);
  const c = correlacaoGrids(x, y, {});
  assert.equal(c.r, null);
  assert.deepEqual(c.amostra, []);
  assert.equal(c.reta, null);
});

t('camada constante (variância zero) → r null, sem NaN vazando', () => {
  const x = malha(20, 20, () => 5);
  const y = malha(20, 20, (r, c) => r + c);
  const c = correlacaoGrids(x, y, {});
  assert.equal(c.r, null);
});

console.log('\nreta de tendência');

t('recupera coeficiente e intercepto de uma relação exata', () => {
  // y = 3x + 7 → como B entra em `b`, a reta é b = coef·a + intercepto
  const x = malha(20, 20, (r, c) => r * 20 + c);
  const y = malha(20, 20, (r, c) => (r * 20 + c) * 3 + 7);
  const c = correlacaoGrids(x, y, {});
  assert.ok(Math.abs(c.reta.coef - 3) < 1e-6, `coef=${c.reta.coef}`);
  assert.ok(Math.abs(c.reta.intercepto - 7) < 1e-6, `int=${c.reta.intercepto}`);
});

t('a reta usa TODOS os pares, não só a amostra', () => {
  const cheia = correlacaoGrids(A, B, { maxAmostra: 100000 });
  const magra = correlacaoGrids(A, B, { maxAmostra: 50 });
  assert.equal(magra.amostra.length, 50);
  assert.ok(Math.abs(cheia.reta.coef - magra.reta.coef) < 1e-12);
  assert.equal(cheia.r, magra.r);
});

console.log('\nreamostrarBilinear');

t('mesma forma devolve o mesmo array (sem cópia)', () => {
  const src = new Float32Array([1, 2, 3, 4]);
  assert.equal(reamostrarBilinear(src, 2, 2, 2, 2), src);
});

t('NaN não contamina a célula interpolada quando há peso válido em volta', () => {
  const src = new Float32Array([1, 2, NaN, 4]);
  const out = reamostrarBilinear(src, 2, 2, 3, 3);
  // Centro (posição 4): os 4 vizinhos pesam igual e 3 são finitos → média deles.
  assert.ok(Math.abs(out[4] - (1 + 2 + 4) / 3) < 1e-6, `centro=${out[4]}`);
});

t('nó que cai EM CIMA de um NaN continua NaN (não inventa valor)', () => {
  // Ampliar não pode preencher buraco: onde a fonte não sabe, o destino também
  // não sabe. Posição 6 = canto inferior esquerdo = a célula NaN da fonte.
  const src = new Float32Array([1, 2, NaN, 4]);
  const out = reamostrarBilinear(src, 2, 2, 3, 3);
  assert.ok(Number.isNaN(out[6]), `esperava NaN, veio ${out[6]}`);
});

t('cantos são preservados na ampliação', () => {
  const src = new Float32Array([10, 20, 30, 40]);
  const out = reamostrarBilinear(src, 2, 2, 3, 3);
  assert.ok(Math.abs(out[0] - 10) < 1e-5);
  assert.ok(Math.abs(out[2] - 20) < 1e-5);
  assert.ok(Math.abs(out[6] - 30) < 1e-5);
  assert.ok(Math.abs(out[8] - 40) < 1e-5);
});

console.log('\nsobreposicaoBbox');

t('bbox idênticos = 1', () => {
  assert.equal(sobreposicaoBbox([0, 0, 10, 10], [0, 0, 10, 10]), 1);
});

t('disjuntos = 0', () => {
  assert.equal(sobreposicaoBbox([0, 0, 1, 1], [5, 5, 6, 6]), 0);
  assert.equal(sobreposicaoBbox([0, 0, 1, 1], [1, 0, 2, 1]), 0);
});

t('contido no maior = 1 (razão pelo MENOR)', () => {
  assert.equal(sobreposicaoBbox([0, 0, 10, 10], [2, 2, 4, 4]), 1);
});

t('metade sobreposta = 0,5', () => {
  assert.ok(Math.abs(sobreposicaoBbox([0, 0, 10, 10], [5, 0, 15, 10]) - 0.5) < 1e-9);
});

t('bbox degenerado não estoura', () => {
  assert.equal(sobreposicaoBbox([0, 0, 0, 0], [0, 0, 10, 10]), 0);
});

console.log(`\n${ok} ok, ${fail} falhas\n`);
process.exit(fail ? 1 : 0);
