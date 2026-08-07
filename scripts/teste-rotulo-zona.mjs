// Rótulo do número da zona — roda: npm run teste:rotulo
//
// O caso relatado: renumerei as zonas no editor, vi a numeração nova enquanto
// editava e, ao sair, o mapa voltou à antiga — com números REPETIDOS, porque
// dois polígonos ainda dividiam o mesmo `zona`. Editor e mapa liam campos
// diferentes; agora leem esta função.

import assert from 'node:assert/strict';
import { rotuloZona, idEhNumeroDaZona } from '../src/lib/meap/rotuloZona.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

console.log('\nRótulo da zona\n');

t('zoneamento recém-gerado: id e zona concordam', () => {
  assert.equal(rotuloZona({ id: '01', zona: '01' }), '01');
  assert.equal(rotuloZona({ id: '05', zona: 5 }), '05');
});

t('polígono EXTRA da mesma zona (id sufixado) rotula pela ZONA', () => {
  // "01_2" é identidade interna: mostrar isso no mapa seria pior que "01".
  assert.equal(rotuloZona({ id: '01_2', zona: '01' }), '01');
  assert.equal(rotuloZona({ id: '03_5', zona: '03' }), '03');
});

t('O CASO RELATADO: renumerado à mão, o id manda', () => {
  // O editor renumerou o polígono para 05; o `zona` velho ficou 01 e o mapa
  // mostrava dois "01". Agora o número que aparece é o que o agrônomo digitou.
  assert.equal(rotuloZona({ id: '05', zona: '01' }), '05');
  assert.equal(rotuloZona({ id: '02', zona: '01' }), '02');
});

t('id textual (uuid, "z1") não rotula nada — quem manda é a zona', () => {
  assert.equal(rotuloZona({ id: 'z1', zona: 3 }), '3');
  assert.equal(rotuloZona({ id: 'a1b2c3', zona: '02' }), '02');
});

t('sem um dos campos, usa o que existir; sem nenhum, "?"', () => {
  assert.equal(rotuloZona({ zona: '04' }), '04');
  assert.equal(rotuloZona({ id: '07' }), '07');
  assert.equal(rotuloZona({ id: 'z9' }), 'z9');
  assert.equal(rotuloZona({}), '?');
  assert.equal(rotuloZona(null), '?');
  assert.equal(rotuloZona({ id: null, zona: null }), '?');
});

t('idEhNumeroDaZona separa número puro de identidade interna', () => {
  assert.equal(idEhNumeroDaZona('01'), true);
  assert.equal(idEhNumeroDaZona(7), true);
  assert.equal(idEhNumeroDaZona('01_2'), false);
  assert.equal(idEhNumeroDaZona('z1'), false);
  assert.equal(idEhNumeroDaZona(''), false);
  assert.equal(idEhNumeroDaZona(undefined), false);
});

t('numeração de um mapa inteiro sai SEM repetição depois de renumerar', () => {
  const antes = [
    { id: '01', zona: '01' }, { id: '01_2', zona: '01' },
    { id: '04', zona: '04' }, { id: '04_2', zona: '04' }, { id: '03', zona: '03' },
  ];
  assert.deepEqual(antes.map(rotuloZona), ['01', '01', '04', '04', '03']);

  // o editor renumerou cada polígono (é o que a tela mostrava durante a edição)
  const depois = [
    { id: '01', zona: '01' }, { id: '02', zona: '01' },
    { id: '03', zona: '04' }, { id: '04', zona: '04' }, { id: '05', zona: '03' },
  ];
  const nums = depois.map(rotuloZona);
  assert.deepEqual(nums, ['01', '02', '03', '04', '05']);
  assert.equal(new Set(nums).size, nums.length, 'nenhum número repetido');
});

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
