// Testes da ORDEM do catálogo de variáveis (as setinhas de "Legendas por elemento").
//
// CASO RELATADO (07/08/2026, com print): a lista estava
//   Textura · MO · pH · m% · P · K · Ca
// e clicar em SUBIR no pH não o trocava com o MO — jogava o pH para o TOPO:
//   pH · Textura · MO · m% · P · K
// A implementação antiga permutava os dois valores de `ordem` entre vizinhos, o
// que só funciona com `ordem` toda distinta. O 1º teste abaixo reproduz o pulo
// com a conta antiga e prova que a nova anda exatamente um degrau.
//
// Roda: `npm run teste:ordem`.
import assert from 'node:assert/strict';
import { moverNaOrdem, renumerar } from '../src/lib/ordemCatalogo.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

const lista = (...ids) => ids.map(id => ({ id, usar: true }));
const ids = arr => arr.map(v => v.id).join(' · ');

console.log('\nOrdem do catálogo de variáveis\n');

// ── O caso do print ──────────────────────────────────────────────────────────

t('CASO RELATADO: subir o pH anda UM degrau, não vai para o topo', () => {
  const antes = lista('textura', 'mo', 'ph', 'm', 'p', 'k', 'ca');
  const depois = moverNaOrdem(antes, 'ph', -1);
  assert.equal(ids(depois), 'textura · ph · mo · m · p · k · ca', ids(depois));
  assert.notEqual(ids(depois).split(' · ')[0], 'ph', 'o pH foi para o topo de novo');
});

t('a conta ANTIGA (permutar `ordem`) pulava com empate — sentinela do bug', () => {
  // Empate de `ordem` é o gatilho: quem decide a posição vira o desempate por
  // sigla, e o valor recebido na permuta leva o item para longe.
  const cat = [
    { id: 'textura', sigla: 'Textura', ordem: 0 },
    { id: 'mo', sigla: 'MO', ordem: 5 },
    { id: 'ph', sigla: 'pH', ordem: 5 },   // empatado com o MO
  ];
  const ordenar = l => [...l].sort((a, b) => a.ordem - b.ordem || a.sigla.localeCompare(b.sigla, 'pt-BR'));
  const a = cat[2], b = cat[1];            // subir pH → vizinho é MO
  a.ordem = a.ordem + -1 * 0.001;          // o ramo "a.ordem === b.ordem" do código antigo
  assert.equal(ordenar(cat)[0].id, 'textura');
  // Com 'textura' em 0 o pulo não aparece; com o catálogo real, onde o topo
  // também empata, 4,999 passa à frente de todo mundo que estiver em 5.
  const cat2 = [
    { id: 'textura', sigla: 'Textura', ordem: 5 },
    { id: 'mo', sigla: 'MO', ordem: 5 },
    { id: 'ph', sigla: 'pH', ordem: 4.999 },
  ];
  assert.equal(ordenar(cat2)[0].id, 'ph', 'era este o pulo para o topo');
});

// ── Comportamento básico ─────────────────────────────────────────────────────

t('descer anda um degrau', () => {
  assert.equal(ids(moverNaOrdem(lista('a', 'b', 'c'), 'a', 1)), 'b · a · c');
});

t('nas pontas não faz nada (devolve null)', () => {
  assert.equal(moverNaOrdem(lista('a', 'b'), 'a', -1), null);
  assert.equal(moverNaOrdem(lista('a', 'b'), 'b', 1), null);
});

t('id inexistente devolve null', () => {
  assert.equal(moverNaOrdem(lista('a', 'b'), 'zz', -1), null);
});

t('subir e descer volta ao original', () => {
  const orig = lista('a', 'b', 'c', 'd');
  const ida = moverNaOrdem(orig, 'c', -1);
  assert.equal(ids(moverNaOrdem(ida, 'c', 1)), ids(orig));
});

// ── Inativos: ficam na lista, mas as setas os pulam ──────────────────────────

t('a seta pula o INATIVO que estiver no caminho', () => {
  const todas = [
    { id: 'a', usar: true },
    { id: 'oculta', usar: false },
    { id: 'b', usar: true },
  ];
  // 'b' sobe: o vizinho VISÍVEL é 'a', não a oculta.
  assert.equal(ids(moverNaOrdem(todas, 'b', -1)), 'b · oculta · a');
});

t('o inativo não some nem muda de vizinhança', () => {
  const todas = [
    { id: 'a', usar: true }, { id: 'b', usar: true },
    { id: 'x', usar: false }, { id: 'c', usar: true },
  ];
  const r = moverNaOrdem(todas, 'c', -1);
  assert.equal(r.length, 4, 'perdeu item');
  assert.ok(r.some(v => v.id === 'x'), 'o inativo sumiu');
});

t('item INATIVO não é movido pelas setas (não está na lista visível)', () => {
  const todas = [{ id: 'a', usar: true }, { id: 'x', usar: false }, { id: 'b', usar: true }];
  assert.equal(moverNaOrdem(todas, 'x', -1), null);
});

// ── Renumeração ──────────────────────────────────────────────────────────────

t('renumerar devolve SÓ quem mudou de número', () => {
  const r = renumerar([{ id: 'a', ordem: 0 }, { id: 'c', ordem: 2 }, { id: 'b', ordem: 1 }]);
  assert.equal(r.length, 2, 'reescreveria itens que já estavam certos');
  assert.deepEqual(r.map(x => `${x.item.id}=${x.ordem}`), ['c=1', 'b=2']);
});

t('renumerar DESEMPATA um catálogo todo na mesma ordem', () => {
  const bagunca = [{ id: 'a', ordem: 999 }, { id: 'b', ordem: 999 }, { id: 'c', ordem: 999 }];
  const r = renumerar(bagunca);
  assert.deepEqual(r.map(x => x.ordem), [0, 1, 2]);
});

t('catálogo já numerado 0..n-1 não gera gravação nenhuma', () => {
  assert.equal(renumerar([{ id: 'a', ordem: 0 }, { id: 'b', ordem: 1 }]).length, 0);
});

t('depois de mover + renumerar, TODA ordem é única — não há empate a herdar', () => {
  const todas = [
    { id: 'textura', usar: true, ordem: 5 }, { id: 'mo', usar: true, ordem: 5 },
    { id: 'ph', usar: true, ordem: 5 }, { id: 'm', usar: true, ordem: 5 },
  ];
  const nova = moverNaOrdem(todas, 'ph', -1);
  const mudou = renumerar(nova);
  const finais = nova.map(v => mudou.find(m => m.item.id === v.id)?.ordem ?? v.ordem);
  assert.equal(new Set(finais).size, finais.length, 'sobrou empate depois de renumerar');
  assert.equal(ids(nova), 'textura · ph · mo · m');
});

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
