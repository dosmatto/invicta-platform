// Catálogo de variáveis: quando é seguro semear/migrar, e como curar as gêmeas.
// Roda: `npm run teste:catalogo`.
//
// Trava o bug de 27/08/2026 — ordem dos elementos (Perfil) e a tela Preferências
// de Análise mudando sozinhas. Diferente das legendas (id fixo → sobrescreve),
// variável tem id aleatório: semear na hora errada DUPLICA, e a leitura passa a
// escolher ora uma cópia ora outra.
import assert from 'node:assert/strict';
import { deveSemearCatalogo, podeMigrarCatalogo, gemeasAExcluir } from '../src/lib/catalogoVariaveis.ts';

let ok = 0, fail = 0;
const t = (nome, fn) => {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
};

console.log('\nCatálogo de variáveis\n');

t('conta nova com a nuvem já respondida → semeia', () => {
  assert.equal(deveSemearCatalogo(0, false), true);
});

t('NUVEM AINDA NÃO RESPONDEU → NÃO semeia (é a fábrica de gêmeas)', () => {
  assert.equal(deveSemearCatalogo(0, true), false,
    'vazio antes de a nuvem responder quer dizer "ainda não sei", não "não existe"');
});

t('catálogo já existe → nunca semeia, respondida ou não', () => {
  assert.equal(deveSemearCatalogo(17, false), false);
  assert.equal(deveSemearCatalogo(17, true), false);
});

t('migração que reescreve a ordem exige catálogo MATERIALIZADO', () => {
  // A guarda antiga perguntava a uma função com fallback em memória e nunca era
  // falsa: rodava contra o seed, gravava a ordem de fábrica e queimava a flag.
  assert.equal(podeMigrarCatalogo(0, false), false, 'nada gravado = não migra');
  assert.equal(podeMigrarCatalogo(17, true), false, 'nuvem muda = espera');
  assert.equal(podeMigrarCatalogo(17, false), true);
});

t('sem duplicata, nada a excluir', () => {
  assert.deepEqual(gemeasAExcluir([
    { id: 'a', varId: 'ph' }, { id: 'b', varId: 'ca' },
  ]), []);
});

t('gêmeas: sobra a EDITADA POR ÚLTIMO', () => {
  const fora = gemeasAExcluir([
    { id: 'velha', varId: 'ph', atualizadoEm: '2026-08-01T10:00:00Z' },
    { id: 'nova',  varId: 'ph', atualizadoEm: '2026-08-27T10:00:00Z' },
  ]);
  assert.deepEqual(fora, ['velha']);
});

t('empate de data desempata por id — dois aparelhos chegam ao mesmo resultado', () => {
  const itens = [
    { id: 'zzz', varId: 'k', atualizadoEm: '2026-08-27T10:00:00Z' },
    { id: 'aaa', varId: 'k', atualizadoEm: '2026-08-27T10:00:00Z' },
  ];
  assert.deepEqual(gemeasAExcluir(itens), ['zzz']);
  assert.deepEqual(gemeasAExcluir([...itens].reverse()), ['zzz'], 'independe da ordem de chegada');
});

t('linha sem data perde para a que tem (o seed novo não rouba o ajuste antigo)', () => {
  const fora = gemeasAExcluir([
    { id: 'seed', varId: 'mo' },
    { id: 'usuario', varId: 'mo', atualizadoEm: '2026-08-20T10:00:00Z' },
  ]);
  assert.deepEqual(fora, ['seed']);
});

t('três cópias do mesmo varId → sobra uma só', () => {
  const fora = gemeasAExcluir([
    { id: 'a', varId: 'p', atualizadoEm: '2026-08-01T00:00:00Z' },
    { id: 'b', varId: 'p', atualizadoEm: '2026-08-10T00:00:00Z' },
    { id: 'c', varId: 'p', atualizadoEm: '2026-08-05T00:00:00Z' },
  ]);
  assert.deepEqual(fora.sort(), ['a', 'c']);
});

t('cura vários varIds de uma vez, sem tocar nos únicos', () => {
  const fora = gemeasAExcluir([
    { id: '1', varId: 'ph', atualizadoEm: '2026-08-02T00:00:00Z' },
    { id: '2', varId: 'ph', atualizadoEm: '2026-08-01T00:00:00Z' },
    { id: '3', varId: 'ca', atualizadoEm: '2026-08-02T00:00:00Z' },
    { id: '4', varId: 'ca', atualizadoEm: '2026-08-03T00:00:00Z' },
    { id: '5', varId: 'mg', atualizadoEm: '2026-08-01T00:00:00Z' },
  ]);
  assert.deepEqual(fora.sort(), ['2', '3']);
});

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
