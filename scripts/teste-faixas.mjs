// Testes da classificação por faixa da DOSE (mapa × tabela do plano de aplicação).
// Trava o bug de 27/07/2026: com dose mínima 1.000 e piso operacional, os pixels
// no piso (valor === 1.000) apareciam no MAPA com a cor da faixa "50–1.000"
// (roxo), enquanto a TABELA os contava em "1.000–2.000" (azul) — o mapa exibia
// cores que não existiam na legenda. Roda: `npm run teste:faixas`.
import assert from 'node:assert/strict';
import { classesVisiveis, indiceClasse } from '../src/lib/recomendacao/faixas.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

// Estilo real do relatório do usuário (Calcário/Gesso)
const CLASSES = [
  { cor: '#5b3fa8', limiteSuperior: 1000 },   // "50 – 1.000"  (roxo)
  { cor: '#2f7fd1', limiteSuperior: 2000 },   // "1.000 – 2.000" (azul)
  { cor: '#66c2a5', limiteSuperior: 3000 },
  { cor: '#a6d96a', limiteSuperior: 4000 },
  { cor: '#e6f598', limiteSuperior: 5000 },
  { cor: '#fee08b', limiteSuperior: 6000 },
  { cor: '#f4a582', limiteSuperior: 7000 },
  { cor: '#d6604d', limiteSuperior: 8000 },
  { cor: '#b2182b', limiteSuperior: 9000 },
  { cor: '#67001f', limiteSuperior: 10000 },  // roxo escuro
];
const corDe = (classes, v) => classes[indiceClasse(v, classes.map(c => c.limiteSuperior))].cor;

t('mínima 1.000: a faixa "50–1.000" (roxa) NÃO é visível', () => {
  const vis = classesVisiveis(CLASSES, 1000);
  assert.equal(vis[0].limiteSuperior, 2000, 'a 1ª faixa visível deve ser 1.000–2.000');
  assert.ok(!vis.some(c => c.limiteSuperior === 1000), 'faixa 50–1.000 não deve aparecer');
});

t('BUG: pixel no PISO (v = mínima = 1.000) → azul, nunca roxo', () => {
  const vis = classesVisiveis(CLASSES, 1000);
  assert.equal(corDe(vis, 1000), '#2f7fd1', 'v=1000 deve cair em 1.000–2.000 (azul)');
  // Sem o fix (todas as classes) daria roxo — prova de que a regressão é detectável:
  assert.equal(corDe(CLASSES, 1000), '#5b3fa8', 'sem filtrar, v=1000 daria roxo (bug)');
});

t('Gesso do relatório: 1.000–1.906 fica TODO na faixa azul (100%)', () => {
  const vis = classesVisiveis(CLASSES, 1000);
  for (const v of [1000, 1062, 1500, 1906, 1999.9]) {
    assert.equal(corDe(vis, v), '#2f7fd1', `v=${v} deveria ser azul`);
  }
});

t('mínima 150 (caso "01"): a faixa roxa CONTINUA visível', () => {
  const vis = classesVisiveis(CLASSES, 150);
  assert.equal(vis[0].limiteSuperior, 1000, 'com mínima 150, a faixa até 1.000 ocorre');
  assert.equal(corDe(vis, 900), '#5b3fa8', 'v=900 é roxo — e a legenda mostra essa faixa');
});

t('mínima 0 = comportamento antigo (todas as classes)', () => {
  assert.equal(classesVisiveis(CLASSES, 0).length, CLASSES.length);
  assert.equal(classesVisiveis(CLASSES).length, CLASSES.length);
});

t('valores acima do maior limite caem na última faixa', () => {
  const vis = classesVisiveis(CLASSES, 1000);
  assert.equal(corDe(vis, 99999), '#67001f');
});

t('mapa e tabela usam a MESMA faixa (não divergem em nenhum valor)', () => {
  const min = 1000;
  const vis = classesVisiveis(CLASSES, min);
  const lims = vis.map(c => c.limiteSuperior);
  for (const v of [1000, 1000.0001, 1999, 2000, 2001, 3000, 6500, 12000]) {
    const kMapa = indiceClasse(v, lims);      // colorirDose
    const kTabela = indiceClasse(v, lims);    // planoDeAplicacao
    assert.equal(kMapa, kTabela, `divergiu em v=${v}`);
    assert.ok(kMapa >= 0 && kMapa < vis.length, `índice fora do intervalo em v=${v}`);
  }
});

t('mínima acima de TODOS os limites não deixa o mapa sem cor', () => {
  const vis = classesVisiveis(CLASSES, 999999);
  assert.equal(vis.length, 1, 'mantém a última classe como salvaguarda');
});

t('classes fora de ordem/inválidas são ordenadas e filtradas', () => {
  const bagunca = [
    { cor: '#c', limiteSuperior: 3000 },
    { cor: '#a', limiteSuperior: 1000 },
    { cor: '#x', limiteSuperior: Number.NaN },
    { cor: '#b', limiteSuperior: 2000 },
  ];
  const vis = classesVisiveis(bagunca, 0);
  assert.deepEqual(vis.map(c => c.limiteSuperior), [1000, 2000, 3000]);
});

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
