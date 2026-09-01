// Testes do limite na faixa das amostras, no lado do app (lib/faixaAmostras).
//
// Segunda linha de defesa. A primeira é o servidor (backend/interp.py), mas ele
// não é o único produtor: o INTERPOLADOR DESTA MÁQUINA não se atualiza sozinho —
// no caso relatado o usuário reprocessou e o cálculo foi para o programa local
// antigo, sem limite — e mapas SALVOS antes da correção guardam o valor fora da
// faixa, já que reabrir não refaz a conta.
// Roda: `npm run teste:faixa-front`
import assert from 'node:assert/strict';
import { faixaDe, limitarNaFaixa } from '../src/lib/faixaAmostras.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✓', n); } catch (e) { fail++; console.error('  ✗', n, '—', e.message); } };
const f32 = (a) => Float32Array.from(a);

t('faixaDe: menor e maior das amostras', () => {
  assert.deepEqual(faixaDe([7, 4, 26, 10]), [4, 26]);
});

t('faixaDe: ignora NaN/Infinity e devolve null sem amostra utilizável', () => {
  assert.deepEqual(faixaDe([NaN, 5, Infinity, 9]), [5, 9]);
  assert.equal(faixaDe([]), null);
  assert.equal(faixaDe([NaN, NaN]), null);
});

t('O CASO REAL: negativo vira o mínimo amostrado', () => {
  // mapa de P: amostras 4..70, grid com -16,1 (o que o usuário viu)
  const { valores, alterados } = limitarNaFaixa(f32([-16.1, 8, 22, 70]), [4, 70]);
  assert.equal(valores[0], 4, '-16,1 tem de virar 4');
  assert.equal(alterados, 1);
});

t('acima do máximo também é limitado', () => {
  const { valores, alterados } = limitarNaFaixa(f32([4, 87.1, 30]), [4, 70]);
  assert.equal(valores[1], 70);
  assert.equal(alterados, 1);
});

t('valores DENTRO da faixa ficam idênticos, bit a bit', () => {
  const orig = f32([4, 8.25, 22.5, 70]);
  const { valores, alterados } = limitarNaFaixa(orig, [4, 70]);
  assert.equal(alterados, 0);
  assert.equal(valores, orig, 'sem alteração tem de devolver o MESMO array');
});

t('NaN é preservado (é o recorte do talhão, não pode virar valor)', () => {
  const { valores } = limitarNaFaixa(f32([NaN, -5, NaN, 100]), [4, 70]);
  assert.ok(Number.isNaN(valores[0]) && Number.isNaN(valores[2]), 'NaN tem de continuar NaN');
  assert.equal(valores[1], 4);
  assert.equal(valores[3], 70);
});

t('sem faixa (nenhuma amostra) devolve o grid intocado', () => {
  const orig = f32([-16.1, 8]);
  const { valores, alterados } = limitarNaFaixa(orig, null);
  assert.equal(valores, orig, 'sem saber a faixa, não inventa limite');
  assert.equal(alterados, 0);
});

t('amostra única: min = max, tudo colapsa nesse valor', () => {
  const { valores } = limitarNaFaixa(f32([-3, 7, 99]), faixaDe([7]));
  assert.deepEqual([...valores], [7, 7, 7]);
});

t('faixa negativa legítima é respeitada (ex.: temperatura, saldo)', () => {
  // Se a AMOSTRA é negativa, o negativo é legítimo e não pode ser cortado.
  const { valores, alterados } = limitarNaFaixa(f32([-12, -3, 5]), [-12, 5]);
  assert.equal(alterados, 0, 'nada a limitar — a faixa das amostras inclui negativo');
  assert.equal(valores[0], -12);
});

t('conta quantos pixels foram corrigidos (para a tela poder avisar)', () => {
  const { alterados } = limitarNaFaixa(f32([-1, -2, 5, 99, 100]), [0, 50]);
  assert.equal(alterados, 4);
});

console.log(`\n${ok} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
