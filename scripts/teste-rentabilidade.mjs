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
  pontoEquilibrioKgha, resumoRentabilidade, classesRentabilidade, classesRentabilidadeDaLegenda, SACA_KG_PADRAO,
  arrendamentoPorHa, ALQUEIRES, ALQUEIRE_HA_PADRAO,
} from '../src/lib/rentabilidade.ts';
import { classesComBordas, corCheiaDaClasse } from '../src/lib/legendas.ts';
import { legendaRentabilidade, BORDAS_RENTAB } from '../src/constants/legendasSeedOficial.ts';

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

console.log('\narrendamento');

t('40 sc/alq a R$ 130/sc no alqueire paulista = R$ 2.148,76/ha', () => {
  const v = arrendamentoPorHa(40, PKG, 60, 2.42);
  assert.ok(Math.abs(v - (40 * 130) / 2.42) < 1e-9, String(v));
  assert.ok(Math.abs(v - 2148.7603) < 1e-3, String(v));
});

t('o alqueire mineiro (4,84 ha) da METADE do paulista', () => {
  const pau = arrendamentoPorHa(40, PKG, 60, 2.42);
  const min = arrendamentoPorHa(40, PKG, 60, 4.84);
  assert.ok(Math.abs(pau / min - 2) < 1e-9, 'esperava fator 2 exato');
});

t('o padrao da casa e o paulista, e os tres tamanhos estao declarados', () => {
  assert.equal(ALQUEIRE_HA_PADRAO, 2.42);
  assert.deepEqual(ALQUEIRES.map(a => a.ha), [2.42, 4.84, 2.7225]);
});

t('preco maior encarece o arrendamento (contrato e em produto)', () => {
  const barato = arrendamentoPorHa(40, precoPorKg({ valor: 100, unidade: 'sc' }), 60, 2.42);
  const caro = arrendamentoPorHa(40, precoPorKg({ valor: 150, unidade: 'sc' }), 60, 2.42);
  assert.ok(caro > barato);
  assert.ok(Math.abs(caro / barato - 1.5) < 1e-9);
});

t('entrada invalida devolve null, nunca 0 nem Infinity', () => {
  assert.equal(arrendamentoPorHa(0, PKG, 60, 2.42), null);
  assert.equal(arrendamentoPorHa(40, 0, 60, 2.42), null);
  assert.equal(arrendamentoPorHa(40, PKG, 60, 0), null);
  assert.equal(arrendamentoPorHa(NaN, PKG, 60, 2.42), null);
  assert.equal(arrendamentoPorHa(40, PKG, 0, 2.42), null);
});

t('arrendamento soma ao custo e sobe o ponto de equilibrio', () => {
  const arr = arrendamentoPorHa(40, PKG, 60, 2.42);
  const semArr = pontoEquilibrioKgha(PKG, CUSTO);
  const comArr = pontoEquilibrioKgha(PKG, CUSTO + arr);
  assert.ok(comArr > semArr);
  assert.ok(Math.abs(comArr - (CUSTO + arr) / PKG) < 1e-9);
});

console.log('\nclassesRentabilidadeDaLegenda — a Biblioteca manda nas faixas');

// A legenda oficial, achatada como a tela faz antes de chamar a conta.
const CLS_OFICIAL = legendaRentabilidade.classes.map(c => ({
  nome: c.nome, valorMin: c.valorMin, valorMax: c.valorMax, cor: corCheiaDaClasse(c),
}));

t('os cortes do mapa sao os limites do cadastro, nao quantis dos dados', () => {
  // Margens espalhadas de -3.000 a +3.000; o quantil escolheria outros cortes.
  const v = Float32Array.from([-3000, -2500, -1500, -800, -100, 100, 800, 1500, 2500, 3000]);
  const r = classesRentabilidadeDaLegenda(v, CLS_OFICIAL, { pixelM: 10 });
  assert.deepEqual(r.breaks, BORDAS_RENTAB);
  assert.equal(r.faixas.length, BORDAS_RENTAB.length + 1);
});

t('o ZERO e borda de faixa e o PDF sabe onde destaca-lo', () => {
  const v = Float32Array.from([-1200, -300, 200, 1800]);
  const r = classesRentabilidadeDaLegenda(v, CLS_OFICIAL, { pixelM: 10 });
  assert.equal(r.breaks[r.iZero], 0, 'iZero tem de apontar para o corte 0');
  // Nenhuma faixa pode atravessar o zero: prejuizo e lucro na mesma cor e a
  // unica leitura que o mapa de dinheiro nao pode errar.
  for (const f of r.faixas) assert.ok(!(f.min < 0 && f.max > 0), `faixa ${f.nome} atravessa o zero`);
});

t('vermelho abaixo de zero, azul acima — nunca o contrario', () => {
  const azul = (c) => { const n = parseInt(c.slice(1), 16); return (n & 255) > ((n >> 16) & 255); };
  CLS_OFICIAL.forEach((c, i) => {
    const negativa = c.valorMax != null && c.valorMax <= 0;
    assert.equal(azul(c.cor), !negativa, `classe ${i + 1} (${c.nome}) com a cor do outro lado`);
  });
});

t('mais perto do zero, mais claro; no extremo, mais escuro', () => {
  const lum = (c) => { const n = parseInt(c.slice(1), 16); return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114; };
  const l = CLS_OFICIAL.map(c => lum(c.cor));
  const meio = CLS_OFICIAL.length / 2;
  for (let i = 1; i < meio; i++) assert.ok(l[i] > l[i - 1], `lado negativo nao clareia rumo ao zero em ${i}`);
  for (let i = meio + 1; i < l.length; i++) assert.ok(l[i] < l[i - 1], `lado positivo nao escurece rumo ao extremo em ${i}`);
  assert.ok(l[meio - 1] > l[0], 'o extremo negativo tem de ser o vermelho mais escuro');
  assert.ok(l[meio] > l[l.length - 1], 'o extremo positivo tem de ser o azul mais escuro');
});

t('area por faixa fecha com o total (mesma conta da pagina 1)', () => {
  const v = Float32Array.from([-3000, -1500, -700, -200, 300, 900, 1600, 4000]);
  const r = classesRentabilidadeDaLegenda(v, CLS_OFICIAL, { pixelM: 20 });
  const soma = r.faixas.reduce((s, f) => s + f.areaHa, 0);
  assert.ok(Math.abs(soma - 8 * (20 * 20) / 10000) < 1e-9);
  assert.ok(Math.abs(r.faixas.reduce((s, f) => s + f.pctArea, 0) - 100) < 1e-9);
});

t('talhao inteiramente lucrativo nao ganha uma faixa vermelha de mentira', () => {
  const v = Float32Array.from([200, 600, 1200, 2500, 4000]);
  const r = classesRentabilidadeDaLegenda(v, CLS_OFICIAL, { pixelM: 10 });
  const vermelhoComArea = r.faixas.filter(f => f.max <= 0 && f.areaHa > 0);
  assert.equal(vermelhoComArea.length, 0);
});

t('NaN nao entra em faixa nenhuma', () => {
  const v = Float32Array.from([NaN, NaN, 500, NaN]);
  const r = classesRentabilidadeDaLegenda(v, CLS_OFICIAL, { pixelM: 10 });
  assert.equal(r.faixas.reduce((s, f) => s + f.nPixels, 0), 1);
});

t('legenda quebrada devolve null — quem chama cai no quantil', () => {
  const v = Float32Array.from([-100, 100]);
  assert.equal(classesRentabilidadeDaLegenda(v, [], { pixelM: 10 }), null, 'sem classes');
  assert.equal(classesRentabilidadeDaLegenda(v, [CLS_OFICIAL[0]], { pixelM: 10 }), null, 'uma classe so');
  const semLimite = [{ nome: 'a', valorMin: null, valorMax: null, cor: '#f00' }, { nome: 'b', valorMin: null, valorMax: null, cor: '#00f' }];
  assert.equal(classesRentabilidadeDaLegenda(v, semLimite, { pixelM: 10 }), null, 'borda aberta no meio');
  const foraDeOrdem = [
    { nome: 'a', valorMin: null, valorMax: 500, cor: '#f00' },
    { nome: 'b', valorMin: 500, valorMax: 100, cor: '#0f0' },
    { nome: 'c', valorMin: 100, valorMax: null, cor: '#00f' },
  ];
  assert.equal(classesRentabilidadeDaLegenda(v, foraDeOrdem, { pixelM: 10 }), null, 'cortes fora de ordem');
});

t('legenda EDITADA pelo usuario muda o mapa (a Biblioteca tem de mandar)', () => {
  const v = Float32Array.from([-100, 100, 400, 900]);
  const pares = [{ inicio: '#8E0000', fim: '#D32F2F' }, { inicio: '#B7D7FF', fim: '#0D47A1' }];
  const editada = classesComBordas([0], pares, ['Prejuizo', 'Lucro']).map(c => ({
    nome: c.nome, valorMin: c.valorMin, valorMax: c.valorMax, cor: corCheiaDaClasse(c),
  }));
  const r = classesRentabilidadeDaLegenda(v, editada, { pixelM: 10 });
  assert.deepEqual(r.breaks, [0]);
  assert.equal(r.faixas.length, 2);
  assert.equal(r.faixas[0].nPixels, 1);
  assert.equal(r.faixas[1].nPixels, 3);
});

t('classesComBordas: N-1 bordas viram N classes com as pontas abertas', () => {
  const cs = classesComBordas([-1, 0, 1], [{ inicio: '#000', fim: '#111' }, { inicio: '#222', fim: '#333' }, { inicio: '#444', fim: '#555' }, { inicio: '#666', fim: '#777' }], ['a', 'b', 'c', 'd']);
  assert.equal(cs.length, 4);
  assert.equal(cs[0].valorMin, null);
  assert.equal(cs[3].valorMax, null);
  assert.deepEqual(cs.map(c => c.ordem), [1, 2, 3, 4]);
  assert.ok(Math.abs(cs.reduce((s, c) => s + c.larguraVisual, 0) - 100) < 1e-9);
});

console.log(`\n${ok} ok, ${fail} falhas\n`);
process.exit(fail ? 1 : 0);
