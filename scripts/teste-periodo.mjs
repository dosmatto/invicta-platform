// Testes das funções de PERÍODO (Ano/Época) — node puro, sem dependências.
// Roda com Node 22+ (type-stripping de TS): `npm run teste:periodo`.
import assert from 'node:assert/strict';
import {
  anoDeData, epocaDeData, periodoDeData, anoDaSafra, hojeSaoPauloISO, epocaDeMes, dataValida,
} from '../src/lib/periodo.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

// Casos obrigatórios do enunciado
t('01/01/2026 → Ano 2026, 1ª época', () => { assert.equal(anoDeData('2026-01-01'), 2026); assert.equal(epocaDeData('2026-01-01'), '1'); });
t('30/06/2026 → Ano 2026, 1ª época', () => assert.deepEqual(periodoDeData('2026-06-30'), { ano: 2026, epoca: '1' }));
t('01/07/2026 → Ano 2026, 2ª época', () => assert.deepEqual(periodoDeData('2026-07-01'), { ano: 2026, epoca: '2' }));
t('31/12/2026 → Ano 2026, 2ª época', () => assert.deepEqual(periodoDeData('2026-12-31'), { ano: 2026, epoca: '2' }));

// Reprocessamento de dados antigos (data de referência manual no passado)
t('15/03/2024 → Ano 2024, 1ª época', () => assert.deepEqual(periodoDeData('2024-03-15'), { ano: 2024, epoca: '1' }));
t('20/09/2024 → Ano 2024, 2ª época', () => assert.deepEqual(periodoDeData('2024-09-20'), { ano: 2024, epoca: '2' }));

// Virada de junho (1ª) para julho (2ª)
t('junho → 1ª e julho → 2ª (virada)', () => { assert.equal(epocaDeMes(6), '1'); assert.equal(epocaDeMes(7), '2'); });

// Migração/compatibilidade de safra "26/27" → 2026 (primeiro número)
t('safra "26/27" → 2026', () => assert.equal(anoDaSafra('26/27'), 2026));
t('safra "25/26" → 2025', () => assert.equal(anoDaSafra('25/26'), 2025));
t('safra "25-26" → 2025', () => assert.equal(anoDaSafra('25-26'), 2025));
t('safra "2026/2027" → 2026', () => assert.equal(anoDaSafra('2026/2027'), 2026));
t('ano puro "2024" → 2024', () => assert.equal(anoDaSafra('2024'), 2024));

// Default = hoje em America/Sao_Paulo (fuso, não o do servidor)
t('default = hoje em São Paulo (UTC-3)', () => {
  // 2026-07-24T02:00Z ainda é 2026-07-23 23:00 em SP → dia 23
  assert.equal(hojeSaoPauloISO(new Date('2026-07-24T02:00:00Z')), '2026-07-23');
  // meio-dia UTC do mesmo dia → 09:00 em SP → dia 24
  assert.equal(hojeSaoPauloISO(new Date('2026-07-24T12:00:00Z')), '2026-07-24');
});

// Validação
t('data inválida → dataValida false / anoDeData null', () => { assert.equal(dataValida('abc'), false); assert.equal(anoDeData(''), null); assert.equal(periodoDeData('2026-13-40'), null); });

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
