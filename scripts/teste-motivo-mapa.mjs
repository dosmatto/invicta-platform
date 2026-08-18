// Testes do diagnóstico "por que este mapa não saiu" (Fertilidade).
// Caso real que motivou: talhão FCDBV 01, laudo Fundação ABC com 12 amostras em
// 0-20 e apenas 3 em 20-40 (ids 3, 7, 11) — amostragem da camada profunda em 1 de
// cada 4 pontos. Todas as 15 variáveis do 20-40 falhavam, e a coluna Argila vinha
// em branco ("  ") no 0-20. A tela só dizia "menos de 3 pontos".
import assert from 'node:assert/strict';
import { casarAmostrasComPontos } from '../src/lib/eloGrade.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✓', n); } catch (e) { fail++; console.error('  ✗', n, '—', e.message); } };

const grade = (n) => ({ pontos: Array.from({ length: n }, (_, i) => ({ numero: i + 1, ordem: i, lng: -50.3 + i * 1e-4, lat: -24.9 + i * 1e-4 })) });

t('20-40 do laudo real: 3 amostras (ids 3,7,11) casam por NÚMERO com a grade de 12', () => {
  const pts = casarAmostrasComPontos([{ numero: 3, valor: 4.0 }, { numero: 7, valor: 4.0 }, { numero: 11, valor: 4.2 }], grade(12));
  assert.equal(pts.length, 3, 'os 3 pontos existem — o problema NÃO é o casamento');
});

t('0-20 do laudo real: 12 amostras casam com os 12 pontos', () => {
  const am = Array.from({ length: 12 }, (_, i) => ({ numero: i + 1, valor: 4 + i * 0.1 }));
  assert.equal(casarAmostrasComPontos(am, grade(12)).length, 12);
});

t('coluna em branco (Argila 0-20): nenhuma amostra chega ao casamento', () => {
  assert.equal(casarAmostrasComPontos([], grade(12)).length, 0);
});

t('2 amostras: nem por número nem por ordem (fallback exige 3)', () => {
  assert.equal(casarAmostrasComPontos([{ numero: 1, valor: 4 }, { numero: 2, valor: 5 }], grade(12)).length, 2);
});

t('mais amostras que pontos: o fallback por ordem não inventa ponto', () => {
  const am = Array.from({ length: 5 }, (_, i) => ({ numero: 100 + i, valor: 4 }));
  assert.equal(casarAmostrasComPontos(am, grade(3)).length, 0, 'nenhum número bate e a grade é curta');
});

console.log(`\n${ok} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
