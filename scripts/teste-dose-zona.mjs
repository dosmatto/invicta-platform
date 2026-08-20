// RECOMENDAÇÃO POR ZONA — um valor único por zona. Roda: npm run teste:dosezona
//
// O que este arquivo protege: o pedido do campo é que a recomendação em cima de
// zonas de manejo saia como UMA taxa por zona, não como um mosaico de 20 m. A
// taxa tem de ser EXATAMENTE a que a equação deu para aquela zona — se aqui
// entrar uma média mal feita, a prescrição vai para a máquina com o número
// errado e ninguém percebe olhando o mapa.

import assert from 'node:assert/strict';
import { agruparPorRotulo } from '../src/lib/recomendacao/dosePorZona.ts';
import { dosesDiretasPorZona, nutrientesDaEquacao } from '../src/lib/recomendacao/doseZonaDireta.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

const quadrado = (x0, x1, y0 = -25, y1 = -24.99) => ({
  type: 'Polygon',
  coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
});
const TALHAO = quadrado(-50, -49.99);
// Duas zonas coladas, metade do talhão cada.
const ZONAS = [
  { id: '01', rotulo: '1', geometry: quadrado(-50, -49.995) },
  { id: '02', rotulo: '2', geometry: quadrado(-49.995, -49.99) },
];
console.log('\nAgrupamento: quem é UMA zona\n');

t('manchas do mesmo número viram UMA zona (MultiPolygon)', () => {
  // "01" e "01_2" são pedaços do mesmo saco composto: mesma amostra, mesma taxa.
  const manchas = [
    { id: '01', rotulo: '1', geometry: quadrado(-50, -49.997) },
    { id: '02', rotulo: '2', geometry: quadrado(-49.997, -49.993) },
    { id: '01_2', rotulo: '1', geometry: quadrado(-49.993, -49.99) },
  ];
  const g = agruparPorRotulo(manchas);
  assert.equal(g.length, 2, 'as duas manchas da zona 1 têm de virar UMA entrada');
  const z1 = g.find(z => z.rotulo === '1');
  assert.equal(z1.geometry.type, 'MultiPolygon');
  assert.equal(z1.geometry.coordinates.length, 2, 'com as duas manchas');
});

t('zona de uma mancha só mantém a geometria original', () => {
  const g = agruparPorRotulo(ZONAS);
  assert.equal(g.length, 2);
  assert.equal(g[0].geometry.type, 'Polygon');
});

t('a ordem das zonas é preservada', () => {
  assert.deepEqual(agruparPorRotulo(ZONAS).map(z => z.rotulo), ['1', '2']);
});

console.log('\nDOSE DIRETA DA EQUAÇÃO (sem passar por mapa nenhum)\n');
// "o valor que deve ser atrelado a cada zona é o valor REAL dele utilizando a
// equação diretamente, nada de interpolar e fazer média para o ponto."

const EQ_CALC = {
  // Necessidade de calagem clássica: NC = (V2 - V1) * CTC / 100  (t/ha)
  script: '(70 - V) * CTC / 100',
  constantes: [], naoNegativo: true, doseMinimaViavel: 0, abaixoMinimo: 'zero', doseMaxima: 0,
};

t('a taxa é a conta da equação com o valor do laudo daquela zona', () => {
  const valores = [
    { id: '01', porNutriente: { v: 45, ctc: 8 } },
    { id: '02', porNutriente: { v: 60, ctc: 10 } },
  ];
  const { doses } = dosesDiretasPorZona(valores, EQ_CALC);
  // conta na mão: (70-45)*8/100 = 2.0 ; (70-60)*10/100 = 1.0
  assert.equal(doses.find(d => d.id === '01').dose, 2, 'zona 1: (70-45)*8/100');
  assert.equal(doses.find(d => d.id === '02').dose, 1, 'zona 2: (70-60)*10/100');
});

t('o decimal sai EXATO — não passa por float32 de raster', () => {
  // 0.3675 sobrevive à conta direta; via grid float32 voltaria 0.36750000715…
  const { doses } = dosesDiretasPorZona([{ id: '01', porNutriente: { v: 65.1, ctc: 7.5 } }], EQ_CALC);
  assert.equal(doses[0].dose, (70 - 65.1) * 7.5 / 100);
});

t('zona sem o valor de um atributo fica SEM dose, com o motivo', () => {
  const { doses } = dosesDiretasPorZona([
    { id: '01', porNutriente: { v: 45, ctc: 8 } },
    { id: '02', porNutriente: { v: 50 } },            // faltou CTC no laudo
  ], EQ_CALC);
  assert.equal(doses.find(d => d.id === '01').dose, 2);
  const z2 = doses.find(d => d.id === '02');
  assert.ok(Number.isNaN(z2.dose), 'não pode inventar taxa');
  assert.match(z2.erro, /ctc/i);
});

t('cada zona é independente: erro numa não contamina as outras', () => {
  const { doses } = dosesDiretasPorZona([
    { id: '01', porNutriente: {} },
    { id: '02', porNutriente: { v: 40, ctc: 12 } },
  ], EQ_CALC);
  assert.ok(Number.isNaN(doses[0].dose));
  assert.equal(doses[1].dose, (70 - 40) * 12 / 100);
});

t('a equação diz quais nutrientes buscar no laudo', () => {
  assert.deepEqual(nutrientesDaEquacao(EQ_CALC.script, []).sort(), ['ctc', 'v']);
});

t('piso/teto da equação são respeitados (mesmo motor da Recomendação)', () => {
  const comTeto = { ...EQ_CALC, doseMaxima: 1.5 };
  const { doses } = dosesDiretasPorZona([{ id: '01', porNutriente: { v: 20, ctc: 10 } }], comTeto);
  assert.equal(doses[0].dose, 1.5, '(70-20)*10/100 = 5 → grampeado no teto 1,5');
});

t('naoNegativo: solo já corrigido não vira dose negativa', () => {
  const { doses } = dosesDiretasPorZona([{ id: '01', porNutriente: { v: 85, ctc: 9 } }], EQ_CALC);
  assert.equal(doses[0].dose, 0, 'V acima do alvo → 0, não negativo');
});

console.log(`\n${ok} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
