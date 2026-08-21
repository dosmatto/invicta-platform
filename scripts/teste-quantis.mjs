// Classificação por quantil — roda: npm run teste:quantis
//
// O que este arquivo protege:
//   1. Área igual por faixa (é a promessa da escala por quantil).
//   2. A soma das faixas fecha com a área total (tabela do PDF que não fecha
//      destrói a confiança no relatório inteiro).
//   3. Empate não vira faixa fantasma com intervalo impossível.
//   4. O valor exato do corte cai na faixa DE BAIXO — a mesma convenção de
//      classeDoValor/rasterizarPontos5, senão mapa e legenda discordam na
//      fronteira.

import assert from 'node:assert/strict';
import { breaksQuantis, indiceFaixa, classesQuantis } from '../src/lib/quantis.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

const CORES = ['#7F0000', '#E65100', '#F9A825', '#9CCC65', '#1B5E20'];
const NOMES = ['Muito Baixa', 'Baixa', 'Média', 'Alta', 'Muito Alta'];
const opts = (extra = {}) => ({ pixelM: 10, cores: CORES, nomes: NOMES, ...extra });

// 0..999, uniforme
const uniforme = Array.from({ length: 1000 }, (_, i) => i);

console.log('\nbreaksQuantis');

t('quintis de 0..999 caem em p20/p40/p60/p80', () => {
  const b = breaksQuantis(uniforme, 5);
  assert.equal(b.breaks.length, 4);
  assert.equal(b.colapsadas, 0);
  // quantil tipo 7 sobre 0..999: pos = 999*q
  [0.2, 0.4, 0.6, 0.8].forEach((q, i) => {
    assert.ok(Math.abs(b.breaks[i] - 999 * q) < 1e-6, `corte ${i}: ${b.breaks[i]}`);
  });
  assert.equal(b.min, 0);
  assert.equal(b.max, 999);
  assert.equal(b.n, 1000);
});

t('NaN e Infinity ficam de fora da contagem', () => {
  const b = breaksQuantis([...uniforme, NaN, Infinity, -Infinity], 5);
  assert.equal(b.n, 1000);
});

t('menos valores que faixas devolve null', () => {
  assert.equal(breaksQuantis([1, 2, 3], 5), null);
  assert.equal(breaksQuantis([], 5), null);
  assert.equal(breaksQuantis([NaN, NaN, NaN, NaN, NaN, NaN], 5), null);
});

t('k inválido devolve null', () => {
  assert.equal(breaksQuantis(uniforme, 1), null);
});

t('valor constante colapsa TODAS as faixas (nenhum corte possível)', () => {
  const b = breaksQuantis(new Array(500).fill(4652), 5);
  assert.equal(b.breaks.length, 0);
  assert.equal(b.colapsadas, 4);
  assert.equal(b.min, 4652);
  assert.equal(b.max, 4652);
});

t('metade dos valores repetidos colapsa parte das faixas', () => {
  // 600 iguais + 400 crescentes → p20 e p40 caem no mesmo valor
  const v = [...new Array(600).fill(100), ...Array.from({ length: 400 }, (_, i) => 200 + i)];
  const b = breaksQuantis(v, 5);
  assert.ok(b.colapsadas > 0, 'esperava colapso');
  assert.equal(b.breaks.length + b.colapsadas, 4);
  // cortes estritamente crescentes
  for (let i = 1; i < b.breaks.length; i++) assert.ok(b.breaks[i] > b.breaks[i - 1]);
});

t('nenhum corte pode ser >= o máximo (última faixa nunca nasce vazia)', () => {
  // 900 iguais no topo: p80 cairia no próprio máximo
  const v = [...Array.from({ length: 100 }, (_, i) => i), ...new Array(900).fill(999)];
  const b = breaksQuantis(v, 5);
  b.breaks.forEach(c => assert.ok(c < b.max, `corte ${c} >= max ${b.max}`));
});

console.log('\nindiceFaixa');

t('valor exato do corte cai na faixa DE BAIXO', () => {
  const breaks = [10, 20, 30, 40];
  assert.equal(indiceFaixa(10, breaks), 0);
  assert.equal(indiceFaixa(10.0001, breaks), 1);
  assert.equal(indiceFaixa(20, breaks), 1);
  assert.equal(indiceFaixa(40, breaks), 3);
  assert.equal(indiceFaixa(40.1, breaks), 4);
});

t('sem cortes, tudo cai na faixa 0', () => {
  assert.equal(indiceFaixa(123, []), 0);
});

console.log('\nclassesQuantis');

t('5 faixas com ~20% da área cada', () => {
  const c = classesQuantis(uniforme, opts());
  assert.equal(c.faixas.length, 5);
  c.faixas.forEach(f => assert.ok(Math.abs(f.pctArea - 20) <= 0.5, `${f.nome}: ${f.pctArea}%`));
});

t('a soma das áreas das faixas fecha com a área total', () => {
  const c = classesQuantis(uniforme, opts());
  const soma = c.faixas.reduce((s, f) => s + f.areaHa, 0);
  assert.ok(Math.abs(soma - c.areaHa) < 1e-9, `${soma} != ${c.areaHa}`);
  // pixel 10 m → 0,01 ha; 1000 pixels → 10 ha
  assert.ok(Math.abs(c.areaHa - 10) < 1e-9);
});

t('a soma dos pixels das faixas fecha com o total', () => {
  const c = classesQuantis(uniforme, opts());
  assert.equal(c.faixas.reduce((s, f) => s + f.nPixels, 0), c.nPixels);
});

t('Σ pctArea = 100', () => {
  const c = classesQuantis(uniforme, opts());
  assert.ok(Math.abs(c.faixas.reduce((s, f) => s + f.pctArea, 0) - 100) < 1e-9);
});

t('as pontas usam o mín/máx do mapa, o miolo usa os cortes', () => {
  const c = classesQuantis(uniforme, opts());
  assert.equal(c.faixas[0].min, 0);
  assert.equal(c.faixas[4].max, 999);
  for (let i = 1; i < 5; i++) assert.equal(c.faixas[i].min, c.breaks[i - 1]);
  for (let i = 0; i < 4; i++) assert.equal(c.faixas[i].max, c.breaks[i]);
});

t('faixas contíguas: o max de uma é o min da seguinte', () => {
  const c = classesQuantis(uniforme, opts());
  for (let i = 1; i < c.faixas.length; i++) assert.equal(c.faixas[i].min, c.faixas[i - 1].max);
});

t('somaKg = Σ valor × área do pixel', () => {
  const c = classesQuantis(uniforme, opts());
  const esperado = uniforme.reduce((s, v) => s + v, 0) * 0.01;
  const total = c.faixas.reduce((s, f) => s + f.somaKg, 0);
  assert.ok(Math.abs(total - esperado) < 1e-6, `${total} != ${esperado}`);
});

t('cores e nomes saem na ordem da paleta', () => {
  const c = classesQuantis(uniforme, opts());
  assert.deepEqual(c.faixas.map(f => f.cor), CORES);
  assert.deepEqual(c.faixas.map(f => f.nome), NOMES);
});

t('com colapso, sobram as cores das PONTAS (extremos é o que interessa)', () => {
  const v = [...new Array(600).fill(100), ...Array.from({ length: 400 }, (_, i) => 200 + i)];
  const c = classesQuantis(v, opts());
  assert.ok(c.faixas.length < 5, 'esperava menos de 5 faixas');
  assert.equal(c.faixas[0].cor, CORES[0]);
  assert.equal(c.faixas[c.faixas.length - 1].cor, CORES[CORES.length - 1]);
  // e continua fechando
  assert.ok(Math.abs(c.faixas.reduce((s, f) => s + f.pctArea, 0) - 100) < 1e-9);
});

t('mapa constante vira UMA faixa cobrindo 100% da área', () => {
  const c = classesQuantis(new Array(500).fill(4652), opts());
  assert.equal(c.faixas.length, 1);
  assert.equal(c.faixas[0].pctArea, 100);
  assert.equal(c.faixas[0].min, 4652);
  assert.equal(c.faixas[0].max, 4652);
});

t('sem valores finitos devolve null', () => {
  assert.equal(classesQuantis([NaN, NaN], opts()), null);
});

t('k=4 (quartis) também funciona', () => {
  const c = classesQuantis(uniforme, opts({ k: 4 }));
  assert.equal(c.faixas.length, 4);
  c.faixas.forEach(f => assert.ok(Math.abs(f.pctArea - 25) <= 0.5, `${f.nome}: ${f.pctArea}%`));
});

t('pixelM diferente muda a área proporcionalmente', () => {
  const a = classesQuantis(uniforme, opts({ pixelM: 10 }));
  const b = classesQuantis(uniforme, opts({ pixelM: 20 }));
  assert.ok(Math.abs(b.areaHa - a.areaHa * 4) < 1e-9);
});

console.log(`\n${ok} ok, ${fail} falhas\n`);
process.exit(fail ? 1 : 0);
