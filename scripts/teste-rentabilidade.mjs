// Rentabilidade do mapa de colheita — roda: npm run teste:rentabilidade
//
// Os erros aqui nao parecem erros — produzem mapa plausivel e falso. O que este
// arquivo protege, em ordem de custo:
//   1. NaN NAO vira prejuizo. Pixel fora do talhao tratado como 0 daria
//      -custoHa e pintaria tudo em volta da lavoura de vermelho maximo.
//   2. Preco ausente/zero e DESCONHECIDO (null), nunca 0 — 0 anunciaria que a
//      lavoura inteira deu prejuizo.
//   3. Faixas ancoradas no ZERO. Quantil puro pinta 1/k de vermelho mesmo num
//      talhao inteiramente lucrativo.
//   4. Area e total fecham com a pagina 1 do relatorio.

import assert from 'node:assert/strict';
import {
  precoPorKg, rotuloPreco, margemDoPixel, gridRentabilidade,
  pontoEquilibrioKgha, resumoRentabilidade, classesRentabilidade, SACA_KG_PADRAO,
} from '../src/lib/rentabilidade.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

// Fixture: soja 3.600 kg/ha, R$ 130/sc (60 kg), custo R$ 5.400/ha
const PRECO_SC = { valor: 130, unidade: 'sc' };
const PKG = 130 / 60;                    // 2,16666...
const CUSTO = 5400;

console.log('\nprecoPorKg');

t('saca de 60 kg', () => {
  assert.ok(Math.abs(precoPorKg(PRECO_SC) - PKG) < 1e-12);
});

t('tonelada e quilo', () => {
  assert.equal(precoPorKg({ valor: 7800, unidade: 't' }), 7.8);
  assert.equal(precoPorKg({ valor: 2.5, unidade: 'kg' }), 2.5);
});

t('sacaKg diferente de 60 muda o resultado', () => {
  assert.ok(Math.abs(precoPorKg({ valor: 130, unidade: 'sc', sacaKg: 50 }) - 2.6) < 1e-12);
  assert.equal(SACA_KG_PADRAO, 60);
});

t('preco ausente, zero ou negativo = null (DESCONHECIDO, nunca 0)', () => {
  assert.equal(precoPorKg(null), null);
  assert.equal(precoPorKg(undefined), null);
  assert.equal(precoPorKg({ valor: 0, unidade: 'sc' }), null);
  assert.equal(precoPorKg({ valor: -5, unidade: 'sc' }), null);
  assert.equal(precoPorKg({ valor: NaN, unidade: 'sc' }), null);
});

t('sacaKg invalido cai no padrao, nao em Infinity', () => {
  assert.ok(Math.abs(precoPorKg({ valor: 130, unidade: 'sc', sacaKg: 0 }) - PKG) < 1e-12);
});

t('rotuloPreco diz o que o usuario digitou', () => {
  assert.equal(rotuloPreco(PRECO_SC), 'R$ 130,00/sc (60 kg)');
  assert.equal(rotuloPreco({ valor: 7800, unidade: 't' }), 'R$ 7.800,00/t');
});

console.log('\nmargem e ponto de equilibrio');

t('pixel medio: 3.600 x 2,1667 - 5.400 = 2.400 R$/ha', () => {
  assert.ok(Math.abs(margemDoPixel(3600, PKG, CUSTO) - 2400) < 1e-9);
});

t('NaN entra, NaN sai — nunca -custoHa', () => {
  assert.ok(Number.isNaN(margemDoPixel(NaN, PKG, CUSTO)));
  assert.ok(Number.isNaN(margemDoPixel(undefined, PKG, CUSTO)));
});

t('gridRentabilidade preserva NaN e devolve array novo', () => {
  const src = new Float32Array([3600, NaN, 1000]);
  const out = gridRentabilidade(src, PKG, CUSTO);
  assert.ok(Math.abs(out[0] - 2400) < 1e-3);
  assert.ok(Number.isNaN(out[1]));
  assert.ok(out[2] < 0);
  assert.notEqual(out, src);
  assert.equal(out.byteOffset, 0, 'buffer proprio (f32ParaB64 leria bytes alheios)');
});

t('equilibrio = custo / preco = 2.492,3 kg/ha', () => {
  assert.ok(Math.abs(pontoEquilibrioKgha(PKG, CUSTO) - 2492.3076923) < 1e-6);
});

t('sem preco nao ha equilibrio', () => {
  assert.equal(pontoEquilibrioKgha(0, CUSTO), null);
  assert.equal(pontoEquilibrioKgha(NaN, CUSTO), null);
});

console.log('\nresumoRentabilidade');

// 100 pixels de 10 m (1 ha), metade 3.600 e metade 1.200 kg/ha, + 20 NaN
const vals = new Float32Array(120);
for (let i = 0; i < 50; i++) vals[i] = 3600;
for (let i = 50; i < 100; i++) vals[i] = 1200;
for (let i = 100; i < 120; i++) vals[i] = NaN;
const R = resumoRentabilidade(vals, { precoKg: PKG, custoHa: CUSTO, pixelM: 10 });

t('NaN fora de nPixels e de areaHa', () => {
  assert.equal(R.nPixels, 100);
  assert.ok(Math.abs(R.areaHa - 1) < 1e-12);   // 100 x 0,01 ha
});

t('produtividade e margem medias', () => {
  assert.ok(Math.abs(R.produtividadeMediaKgha - 2400) < 1e-9);
  assert.ok(Math.abs(R.receitaMediaHa - 2400 * PKG) < 1e-9);
  assert.ok(Math.abs(R.margemMediaHa - (2400 * PKG - CUSTO)) < 1e-9);
});

t('margemTotal = margemMediaHa x areaHa (fecha com a tabela)', () => {
  assert.ok(Math.abs(R.margemTotal - R.margemMediaHa * R.areaHa) < 1e-9);
  assert.ok(Math.abs(R.custoTotal - CUSTO * R.areaHa) < 1e-9);
  assert.ok(Math.abs(R.receitaTotal - R.custoTotal - R.margemTotal) < 1e-6);
});

t('area de prejuizo + area de lucro = area total', () => {
  assert.ok(Math.abs(R.areaPrejuizoHa + R.areaLucroHa - R.areaHa) < 1e-12);
  // 1.200 kg/ha rende 2.600 e custa 5.400 -> prejuizo; 3.600 da lucro
  assert.ok(Math.abs(R.pctPrejuizo - 50) < 1e-9);
});

t('min e max da margem', () => {
  assert.ok(Math.abs(R.margemMinHa - (1200 * PKG - CUSTO)) < 1e-9);
  assert.ok(Math.abs(R.margemMaxHa - (3600 * PKG - CUSTO)) < 1e-9);
});

t('sem preco devolve null; so NaN devolve null', () => {
  assert.equal(resumoRentabilidade(vals, { precoKg: 0, custoHa: CUSTO, pixelM: 10 }), null);
  assert.equal(resumoRentabilidade(new Float32Array([NaN, NaN]), { precoKg: PKG, custoHa: CUSTO, pixelM: 10 }), null);
});

t('custo zero: retorno sobre o custo e null, nao Infinity', () => {
  const r0 = resumoRentabilidade(vals, { precoKg: PKG, custoHa: 0, pixelM: 10 });
  assert.equal(r0.retornoSobreCustoPct, null);
});

console.log('\nclassesRentabilidade (ancoradas no zero)');

t('talhao INTEIRAMENTE lucrativo: nenhum break negativo, nenhuma cor de prejuizo', () => {
  const so = gridRentabilidade(new Float32Array(200).fill(4000), PKG, CUSTO);
  const c = classesRentabilidade(so, { k: 5, pixelM: 10 });
  assert.equal(c.iZero, null, 'nao deveria haver corte no zero');
  c.breaks.forEach(b => assert.ok(b >= 0, `break negativo: ${b}`));
  c.faixas.forEach(f => assert.ok(!['#7F0000', '#C62828', '#EF6C00'].includes(f.cor), `cor de prejuizo: ${f.cor}`));
});

t('talhao INTEIRAMENTE no prejuizo: nenhuma cor de lucro', () => {
  const so = gridRentabilidade(new Float32Array(200).fill(500), PKG, CUSTO);
  const c = classesRentabilidade(so, { k: 5, pixelM: 10 });
  assert.equal(c.iZero, null);
  c.faixas.forEach(f => assert.ok(!['#C5E1A5', '#7CB342', '#33691E'].includes(f.cor), `cor de lucro: ${f.cor}`));
});

t('metade e metade: o ZERO e fronteira de faixa', () => {
  const g = gridRentabilidade(vals, PKG, CUSTO);
  const c = classesRentabilidade(g, { k: 5, pixelM: 10 });
  assert.notEqual(c.iZero, null, 'esperava corte no zero');
  assert.equal(c.breaks[c.iZero], 0);
  assert.equal(c.breaks.filter(b => b === 0).length, 1, 'o zero tem de aparecer uma vez so');
});

t('a soma das areas das faixas fecha com a area total', () => {
  const g = gridRentabilidade(vals, PKG, CUSTO);
  const c = classesRentabilidade(g, { k: 5, pixelM: 10 });
  const soma = c.faixas.reduce((s, f) => s + f.areaHa, 0);
  assert.ok(Math.abs(soma - c.areaHa) < 1e-9);
  assert.ok(Math.abs(c.faixas.reduce((s, f) => s + f.pctArea, 0) - 100) < 1e-9);
});

t('a coluna R$ da tabela soma a margem total', () => {
  const g = gridRentabilidade(vals, PKG, CUSTO);
  const c = classesRentabilidade(g, { k: 5, pixelM: 10 });
  const soma = c.faixas.reduce((s, f) => s + f.somaKg, 0);
  assert.ok(Math.abs(soma - R.margemTotal) < 1e-6, `${soma} != ${R.margemTotal}`);
});

t('margem exatamente 0 cai na faixa DE BAIXO (convencao (min,max])', () => {
  // custo igual a receita: todos os pixels ficam em 0
  const g = gridRentabilidade(new Float32Array(100).fill(3600), PKG, 3600 * PKG);
  const c = classesRentabilidade(g, { k: 5, pixelM: 10 });
  // valor constante: nao ha corte possivel, uma faixa so cobrindo 100%
  assert.equal(c.faixas.length, 1);
  assert.ok(Math.abs(c.faixas[0].pctArea - 100) < 1e-9);
});

t('so NaN devolve null', () => {
  assert.equal(classesRentabilidade(new Float32Array([NaN, NaN]), { k: 5, pixelM: 10 }), null);
});

console.log(`\n${ok} ok, ${fail} falhas\n`);
process.exit(fail ? 1 : 0);
