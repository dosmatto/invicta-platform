// Exportacao de nutrientes pela colheita — roda: npm run teste:exportacao
//
// O que este arquivo protege:
//   1. Garantia zero NAO vira Infinity. Dividir por ela poria na tela uma dose
//      absurda e crivel.
//   2. Preco ausente = null, nunca 0 — 0 diria "de graca".
//   3. NaN fora de toda soma (pixel fora do talhao / recortado).
//   4. Os numeros que o usuario citou: K2O/0,60 = KCl, P2O5/0,52 = MAP etc.

import assert from 'node:assert/strict';
import {
  coefDe, exportadoDoPixel, gridExportacao, resumoExportacao, equivalentesDe,
} from '../src/lib/exportacao.ts';
import { paraRelatorio } from '../src/lib/insumos.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

// Fixture: soja 3.600 kg/ha (3,6 t/ha), K2O 20 kg/t, P2O5 14 kg/t
const COEF_K = 20, COEF_P = 14;

console.log('\ncoefDe');

t('coeficiente declarado, inclusive zero', () => {
  assert.equal(coefDe({ k2o: 20 }, 'k2o'), 20);
  assert.equal(coefDe({ k2o: 0 }, 'k2o'), 0, 'zero declarado e um valor');
});

t('ausente = null (distinto de zero declarado)', () => {
  assert.equal(coefDe({ k2o: 20 }, 'p2o5'), null);
  assert.equal(coefDe(null, 'k2o'), null);
  assert.equal(coefDe({ k2o: NaN }, 'k2o'), null);
  assert.equal(coefDe({ k2o: -3 }, 'k2o'), null);
});

console.log('\nexportacao por pixel');

t('3,6 t/ha x 20 kg/t = 72,0 kg/ha de K2O', () => {
  assert.ok(Math.abs(exportadoDoPixel(3600, COEF_K) - 72) < 1e-9);
});

t('3,6 t/ha x 14 kg/t = 50,4 kg/ha de P2O5', () => {
  assert.ok(Math.abs(exportadoDoPixel(3600, COEF_P) - 50.4) < 1e-9);
});

t('NaN entra, NaN sai', () => {
  assert.ok(Number.isNaN(exportadoDoPixel(NaN, COEF_K)));
});

t('gridExportacao preserva NaN e devolve buffer proprio', () => {
  const out = gridExportacao(new Float32Array([3600, NaN]), COEF_K);
  assert.ok(Math.abs(out[0] - 72) < 1e-3);
  assert.ok(Number.isNaN(out[1]));
  assert.equal(out.byteOffset, 0);
});

console.log('\nresumoExportacao');

const vals = new Float32Array(120);
for (let i = 0; i < 100; i++) vals[i] = 3600;
for (let i = 100; i < 120; i++) vals[i] = NaN;
const R = resumoExportacao(vals, { coefKgPorT: COEF_K, pixelM: 10 });

t('NaN fora de nPixels, areaHa e totalKg', () => {
  assert.equal(R.nPixels, 100);
  assert.ok(Math.abs(R.areaHa - 1) < 1e-12);
  assert.ok(Math.abs(R.mediaKgHa - 72) < 1e-9);
  assert.ok(Math.abs(R.totalKg - 72) < 1e-9);   // 72 kg/ha x 1 ha
});

t('totalKg = mediaKgHa x areaHa (fecha com a tabela)', () => {
  assert.ok(Math.abs(R.totalKg - R.mediaKgHa * R.areaHa) < 1e-9);
});

t('so NaN devolve null; coeficiente invalido devolve null', () => {
  assert.equal(resumoExportacao(new Float32Array([NaN]), { coefKgPorT: COEF_K, pixelM: 10 }), null);
  assert.equal(resumoExportacao(vals, { coefKgPorT: NaN, pixelM: 10 }), null);
});

console.log('\nequivalentesDe');

const PRODUTOS = [
  { nome: 'Cloreto de Potassio (KCl)', garantiaPct: 60 },
  { nome: 'Sulfato de Potassio', garantiaPct: 50, precoT: 4200 },
];
const PROD_P = [
  { nome: 'MAP', garantiaPct: 52 },
  { nome: 'Superfosfato Triplo', garantiaPct: 41 },
  { nome: 'Gafsa', garantiaPct: 29 },
  { nome: 'Superfosfato Simples', garantiaPct: 18 },
];

t('K2O 72 kg/ha -> KCl 120,0 kg/ha', () => {
  const e = equivalentesDe(72, 1, PRODUTOS);
  const kcl = e.find(x => x.nome.includes('KCl'));
  assert.ok(Math.abs(kcl.doseMediaKgHa - 120) < 1e-9);
});

t('P2O5 50,4 kg/ha -> MAP 96,92 / ST 122,93 / Gafsa 173,79 / SS 280,0', () => {
  const e = equivalentesDe(50.4, 1, PROD_P);
  const d = n => e.find(x => x.nome === n).doseMediaKgHa;
  assert.ok(Math.abs(d('MAP') - 96.923077) < 1e-5, d('MAP'));
  assert.ok(Math.abs(d('Superfosfato Triplo') - 122.926829) < 1e-5);
  assert.ok(Math.abs(d('Gafsa') - 173.793103) < 1e-5);
  assert.ok(Math.abs(d('Superfosfato Simples') - 280) < 1e-6);
});

t('ordenado por garantia DECRESCENTE (mais concentrado primeiro)', () => {
  const e = equivalentesDe(50.4, 1, PROD_P);
  assert.deepEqual(e.map(x => x.garantiaPct), [52, 41, 29, 18]);
});

t('totalT = dose x area / 1000', () => {
  const e = equivalentesDe(72, 10, PRODUTOS);
  const kcl = e.find(x => x.nome.includes('KCl'));
  assert.ok(Math.abs(kcl.totalT - (120 * 10) / 1000) < 1e-9);
});

t('garantia 0, negativa, NaN ou ausente: produto FORA, sem Infinity', () => {
  const e = equivalentesDe(72, 1, [
    { nome: 'zero', garantiaPct: 0 },
    { nome: 'neg', garantiaPct: -5 },
    { nome: 'nan', garantiaPct: NaN },
    { nome: 'ok', garantiaPct: 60 },
  ]);
  assert.equal(e.length, 1);
  assert.equal(e[0].nome, 'ok');
  e.forEach(x => assert.ok(Number.isFinite(x.doseMediaKgHa)));
});

t('preco ausente = custo null, NUNCA 0', () => {
  const e = equivalentesDe(72, 1, PRODUTOS);
  const kcl = e.find(x => x.nome.includes('KCl'));
  assert.equal(kcl.custoHa, null);
  assert.equal(kcl.custoTotal, null);
});

t('preco zero tambem e desconhecido, nao de graca', () => {
  const e = equivalentesDe(72, 1, [{ nome: 'x', garantiaPct: 60, precoT: 0 }]);
  assert.equal(e[0].custoHa, null);
});

t('com preco: custo = dose(t) x R$/t', () => {
  const e = equivalentesDe(72, 2, PRODUTOS);
  const s = e.find(x => x.nome.includes('Sulfato'));
  const dose = 72 / 0.5;                       // 144 kg/ha
  assert.ok(Math.abs(s.doseMediaKgHa - dose) < 1e-9);
  assert.ok(Math.abs(s.custoHa - (dose / 1000) * 4200) < 1e-9);
  assert.ok(Math.abs(s.custoTotal - s.custoHa * 2) < 1e-9);
});

t('nutriente invalido devolve lista vazia', () => {
  assert.deepEqual(equivalentesDe(NaN, 1, PRODUTOS), []);
  assert.deepEqual(equivalentesDe(-1, 1, PRODUTOS), []);
});

console.log('\nparaRelatorio — quem entra na tabela de equivalentes');

const CATALOGO = [
  { nome: 'MAP', usarNoRelatorio: true },
  { nome: 'MAP (2)' },
  { nome: 'Super Triplo', usarNoRelatorio: false },
  { nome: 'DAP', usarNoRelatorio: true },
];

t('marcados vencem: so eles entram, na ordem do cadastro', () => {
  assert.deepEqual(paraRelatorio(CATALOGO).map(p => p.nome), ['MAP', 'DAP']);
});

t('ninguem marcado = todos (a tabela nao pode sumir de quem ja usava)', () => {
  const semMarca = CATALOGO.map(({ nome }) => ({ nome }));
  assert.deepEqual(paraRelatorio(semMarca).map(p => p.nome), semMarca.map(p => p.nome));
});

t('false e "nao usar", nao "nao respondi"', () => {
  const so = [{ nome: 'A', usarNoRelatorio: false }, { nome: 'B', usarNoRelatorio: true }];
  assert.deepEqual(paraRelatorio(so).map(p => p.nome), ['B']);
});

t('nao muta a lista de entrada nem devolve a mesma referencia', () => {
  const entrada = Object.freeze([Object.freeze({ nome: 'A' })]);
  const saida = paraRelatorio(entrada);
  assert.notEqual(saida, entrada);
  assert.deepEqual(saida.map(p => p.nome), ['A']);
});

t('lista vazia continua vazia', () => {
  assert.deepEqual(paraRelatorio([]), []);
});

t('PONTA A PONTA: marcar 2 produtos tira a nota do "+ N nao listado(s)"', () => {
  // Sete fertilizantes com P2O5 dariam 6 linhas + "mais 1 nao listado"; com
  // dois marcados a tabela sai com exatamente os dois escolhidos.
  const sete = Array.from({ length: 7 }, (_, i) => ({ nome: `F${i}`, garantiaPct: 50 - i, usarNoRelatorio: i < 2 }));
  const escolhidos = paraRelatorio(sete);
  assert.equal(escolhidos.length, 2);
  const eq = equivalentesDe(60, 10, escolhidos);
  assert.deepEqual(eq.map(x => x.nome), ['F0', 'F1']);
  assert.ok(eq.length <= 6, 'nao sobra nada para o corte de 6 linhas');
});

console.log(`\n${ok} ok, ${fail} falhas\n`);
process.exit(fail ? 1 : 0);
