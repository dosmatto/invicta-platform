// Testes da ORDEM em que as Zonas de Manejo tentam os laudos de fertilidade.
//
// O bug que originou isto: o talhão tinha 29 mapas de fertilidade salvos, e a
// aba Zonas mostrava "Camadas a usar (0/1)" — só a EC. A causa era
// `getImportacoesLab(talhaoId)[0]`: o laudo mais recente por `criadoEm` ganhava
// sempre, mesmo sem NENHUM mapa processado, e a fertilidade sumia em silêncio.
// A ordem abaixo é o que faz o zoneamento continuar procurando.
// Roda: `npm run teste:laudo-zonas`.
import assert from 'node:assert/strict';
import { ordemLaudosParaZonas, MAX_LAUDOS_TENTADOS } from '../src/lib/meap/escolhaLaudo.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

const ids = (l) => l.map(i => i.id);
// Como o store entrega: mais recente primeiro.
const L2026 = { id: 'l2026' }, L2025 = { id: 'l2025' }, L2024 = { id: 'l2024' };
const TODOS = [L2026, L2025, L2024];

t('o laudo do ANO selecionado vem antes de todos', () => {
  assert.deepEqual(ids(ordemLaudosParaZonas(TODOS, [L2025], 6)), ['l2025', 'l2026', 'l2024']);
});

t('REGRESSÃO: o laudo mais novo sem mapa não é o fim da fila', () => {
  // Ano 2026 selecionado, laudo de 2026 ainda sem mapa: a lista precisa conter
  // 2025 depois dele, senão a fertilidade some da tela (era o bug).
  const fila = ordemLaudosParaZonas(TODOS, [L2026], 6);
  assert.equal(fila[0].id, 'l2026');
  assert.ok(ids(fila).includes('l2025'), 'o laudo anterior tem de continuar na fila');
});

t('sem ano selecionado, vale a ordem do store (mais recente primeiro)', () => {
  assert.deepEqual(ids(ordemLaudosParaZonas(TODOS, [], 6)), ['l2026', 'l2025', 'l2024']);
});

t('o laudo do ano não é duplicado na segunda fila', () => {
  const fila = ordemLaudosParaZonas(TODOS, [L2025], 6);
  assert.equal(fila.length, new Set(ids(fila)).size);
  assert.equal(fila.length, 3);
});

t('vários laudos no mesmo ano mantêm a ordem entre si', () => {
  const a = { id: 'a' }, b = { id: 'b' };
  assert.deepEqual(ids(ordemLaudosParaZonas([...TODOS, a, b], [a, b], 6)),
    ['a', 'b', 'l2026', 'l2025', 'l2024']);
});

t('o teto corta a fila (cada tentativa é uma consulta na nuvem)', () => {
  const muitos = Array.from({ length: 20 }, (_, i) => ({ id: `l${i}` }));
  assert.equal(ordemLaudosParaZonas(muitos, [], 6).length, 6);
  assert.equal(MAX_LAUDOS_TENTADOS, 6);
});

t('talhão sem nenhum laudo devolve fila vazia (não quebra)', () => {
  assert.deepEqual(ordemLaudosParaZonas([], [], 6), []);
});

console.log(`\n${ok} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
