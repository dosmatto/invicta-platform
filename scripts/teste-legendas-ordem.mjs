// Testes da ORDEM das legendas de um mesmo atributo.
// Trava o bug de 29/07/2026: mapas que estavam com estilo "contínuo" voltaram
// sozinhos para "segmentado". Não era o estilo que se perdia — era o MAPA que
// passava a usar OUTRA legenda do mesmo atributo, porque a escolha automática
// pegava "a primeira do array" e a ordem vinha do boot da nuvem (consulta sem
// ORDER BY → ordem arbitrária, que muda com o tempo).
// Roda: `npm run teste:legendas`.
import assert from 'node:assert/strict';
import { ordenarLegendasDoAtributo } from '../src/lib/legendas.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

const L = (id, nome, extra = {}) => ({ id, nome, ...extra });
const primeira = lst => ordenarLegendasDoAtributo(lst)[0].id;
const ids = lst => ordenarLegendasDoAtributo(lst).map(l => l.id);

console.log('\nOrdem das legendas do atributo\n');

t('a marcada como PADRÃO vem primeiro, mesmo contra uma oficial', () => {
  const oficial = L('a', 'ABC — Fósforo', { escopo: 'sistema' });
  const minha = L('b', 'Meu Fósforo contínuo', { escopo: 'empresa', padrao: true });
  assert.equal(primeira([oficial, minha]), 'b');
  assert.equal(primeira([minha, oficial]), 'b');   // independe da ordem de entrada
});

t('sem padrão marcado, a oficial (Sistema) continua ganhando — comportamento histórico', () => {
  const oficial = L('a', 'ZZZ oficial', { escopo: 'sistema' });
  const minha = L('b', 'AAA minha', { escopo: 'empresa' });
  assert.equal(primeira([minha, oficial]), 'a');
});

t('ORDEM DE ENTRADA NÃO MUDA O RESULTADO (o bug: array embaralhado pelo boot)', () => {
  const lst = [
    L('a', 'ABC — Potássio', { escopo: 'sistema' }),
    L('b', 'Potássio contínuo', { escopo: 'empresa' }),
    L('c', 'Potássio 2024', { escopo: 'empresa' }),
  ];
  const esperado = ids(lst);
  // toda permutação tem que dar exatamente a mesma ordem final
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const p of perms) assert.deepEqual(ids(p.map(i => lst[i])), esperado);
});

t('entre iguais, desempata por nome e depois por id (nunca fica indefinido)', () => {
  const a = L('z1', 'Cálcio', { escopo: 'empresa' });
  const b = L('a1', 'Cálcio', { escopo: 'empresa' });   // mesmo nome
  assert.deepEqual(ids([a, b]), ['a1', 'z1']);
  assert.deepEqual(ids([b, a]), ['a1', 'z1']);
});

t('marcar padrão em outra troca a escolhida (só uma manda)', () => {
  const lst = [
    L('a', 'ABC — pH', { escopo: 'sistema' }),
    L('b', 'pH contínuo', { escopo: 'empresa', padrao: true }),
  ];
  assert.equal(primeira(lst), 'b');
  lst[1].padrao = undefined;
  assert.equal(primeira(lst), 'a');   // volta ao critério automático
});

t('não muta a lista original', () => {
  const lst = [L('b', 'B', { escopo: 'empresa' }), L('a', 'A', { escopo: 'sistema' })];
  ordenarLegendasDoAtributo(lst);
  assert.deepEqual(lst.map(l => l.id), ['b', 'a']);
});

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
