// Testes da ORDEM das legendas de um mesmo atributo.
// Trava o bug de 29/07/2026: mapas que estavam com estilo "contínuo" voltaram
// sozinhos para "segmentado". Não era o estilo que se perdia — era o MAPA que
// passava a usar OUTRA legenda do mesmo atributo, porque a escolha automática
// pegava "a primeira do array" e a ordem vinha do boot da nuvem (consulta sem
// ORDER BY → ordem arbitrária, que muda com o tempo).
// Roda: `npm run teste:legendas`.
import assert from 'node:assert/strict';
import { ordenarLegendasDoAtributo, deveSemearLegendas, respeitarPadraoHomonima, promocoesDeHomonimas } from '../src/lib/legendas.ts';

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

console.log('\nHomônimas (gêmeas de migração/sync): escolha explícita × padrão\n');

// Legenda "completa" p/ os helpers de homônimas (precisam de atributoId/atualizadoEm).
const H = (id, nome, extra = {}) => ({ id, nome, atributoId: 'satk', atualizadoEm: '2026-01-01', ...extra });

t('escolha aponta a gêmea NÃO-padrão de uma padrão → vale a padrão (o bug do K%)', () => {
  const antiga = H('a', 'Saturação por Potássio');                       // a que o perfil pinou
  const editada = H('b', 'Saturação por Potássio', { padrao: true });    // a que o usuário edita
  assert.equal(respeitarPadraoHomonima([antiga, editada], antiga).id, 'b');
});

t('escolha É a padrão → mantém', () => {
  const a = H('a', 'Saturação por Potássio', { padrao: true });
  const b = H('b', 'Saturação por Potássio');
  assert.equal(respeitarPadraoHomonima([a, b], a).id, 'a');
});

t('nomes DIFERENTES → a escolha explícita continua valendo (não é gêmea)', () => {
  const quartil = H('a', 'Produtividade por quartil');
  const fixa = H('b', 'Produtividade fixa', { padrao: true });
  assert.equal(respeitarPadraoHomonima([quartil, fixa], quartil).id, 'a');
});

t('atributos diferentes com mesmo nome NÃO se atraem', () => {
  const satk = H('a', 'Saturação');
  const satca = H('b', 'Saturação', { atributoId: 'satca', padrao: true });
  assert.equal(respeitarPadraoHomonima([satk, satca], satk).id, 'a');
});

t('sem nenhuma padrão → mantém a escolha', () => {
  const a = H('a', 'Saturação por Potássio');
  const b = H('b', 'Saturação por Potássio');
  assert.equal(respeitarPadraoHomonima([a, b], a).id, 'a');
});

console.log('\nPromoção automática das homônimas sem padrão\n');

t('2 gêmeas sem padrão → promove a editada por último', () => {
  const antiga = H('a', 'Saturação por Potássio', { atualizadoEm: '2026-05-01' });
  const editada = H('b', 'Saturação por Potássio', { atualizadoEm: '2026-08-01' });
  assert.deepEqual(promocoesDeHomonimas([antiga, editada]), ['b']);
  assert.deepEqual(promocoesDeHomonimas([editada, antiga]), ['b']);   // independe da ordem
});

t('grupo que JÁ tem padrão → não mexe', () => {
  const a = H('a', 'Saturação por Potássio', { padrao: true });
  const b = H('b', 'Saturação por Potássio', { atualizadoEm: '2026-08-01' });
  assert.deepEqual(promocoesDeHomonimas([a, b]), []);
});

t('nomes distintos no mesmo atributo → não é gêmea, não promove', () => {
  const a = H('a', 'Saturação por Potássio');
  const b = H('b', 'K% contínua');
  assert.deepEqual(promocoesDeHomonimas([a, b]), []);
});

t('3 gêmeas → promove só a mais recente; empate de data desempata por id', () => {
  const l1 = H('c', 'X', { atualizadoEm: '2026-01-01' });
  const l2 = H('a', 'X', { atualizadoEm: '2026-06-01' });
  const l3 = H('b', 'X', { atualizadoEm: '2026-06-01' });
  assert.deepEqual(promocoesDeHomonimas([l1, l2, l3]), ['a']);
});

t('grupos independentes por atributo → uma promoção por grupo', () => {
  const k1 = H('a', 'Saturação', { atualizadoEm: '2026-02-01' });
  const k2 = H('b', 'Saturação', { atualizadoEm: '2026-03-01' });
  const c1 = H('c', 'Saturação', { atributoId: 'satca', atualizadoEm: '2026-02-01' });
  const c2 = H('d', 'Saturação', { atributoId: 'satca', atualizadoEm: '2026-01-01' });
  assert.deepEqual(promocoesDeHomonimas([k1, k2, c1, c2]).sort(), ['b', 'c']);
});

t('promoção + ordem: depois de promover, a editada vira a [0] do atributo', () => {
  const antiga = H('a', 'Saturação por Potássio', { atualizadoEm: '2026-05-01', escopo: 'empresa' });
  const editada = H('b', 'Saturação por Potássio', { atualizadoEm: '2026-08-01', escopo: 'empresa' });
  const [id] = promocoesDeHomonimas([antiga, editada]);
  const lst = [antiga, editada].map(l => l.id === id ? { ...l, padrao: true } : l);
  assert.equal(ordenarLegendasDoAtributo(lst)[0].id, 'b');
});

console.log('\nQuando o seed das legendas oficiais pode rodar\n');

t('conta nova, nuvem já hidratada → semeia', () => {
  assert.equal(deveSemearLegendas(0, false), true);
});

t('NUVEM AINDA NÃO HIDRATOU → NÃO semeia (o bug: sobrescrevia as editadas)', () => {
  // Este é o caso destrutivo: local vazio só porque o boot da nuvem falhou/
  // estourou o tempo. Os ids do seed são fixos, então gravar aqui apaga na nuvem
  // (e em todas as máquinas) a versão que o usuário havia editado.
  assert.equal(deveSemearLegendas(0, true), false);
});

t('já existe legenda → nunca semeia, hidratada ou não', () => {
  assert.equal(deveSemearLegendas(45, false), false);
  assert.equal(deveSemearLegendas(45, true), false);
  assert.equal(deveSemearLegendas(1, false), false);
});

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
