// Escolha do interpolador por mapa (src/lib/fertilidade.ts).
//
// O caso real: laudo com 79 pontos na 0-20 e um punhado na 20-40. A krigagem
// não ajusta o variograma com menos de 4 pontos, e o backend devolve
// "nao convergiu" — uma vez por variável. A regra aqui derruba SÓ o mapa
// faminto para IDW; se algum dia ela passar a valer para o mapa inteiro, a
// 0-20 (que tem pontos de sobra) sai por IDW sem ninguém pedir, e é
// exatamente isso que não pode acontecer em fertilidade.
//
// Rodar: npm run teste:interpolador

import test from 'node:test';
import assert from 'node:assert/strict';
import { interpoladorEfetivo, MIN_PTS_MAPA, MIN_PTS_KRIGE } from '../src/lib/fertilidade.ts';

test('os mínimos são 3 para o mapa e 4 para a krigagem', () => {
  assert.equal(MIN_PTS_MAPA, 3);
  assert.equal(MIN_PTS_KRIGE, 4);
  assert.ok(MIN_PTS_KRIGE > MIN_PTS_MAPA, 'IDW tem de aceitar um caso que a krigagem recusa');
});

test('krigagem com menos de 4 pontos cai para IDW e sinaliza', () => {
  for (const n of [3]) {
    const r = interpoladorEfetivo('krige', n);
    assert.equal(r.metodo, 'idw', `${n} pontos deviam cair para IDW`);
    assert.equal(r.caiuParaIdw, true);
  }
});

test('krigagem com 4 pontos ou mais NÃO cai — a queda é a exceção', () => {
  for (const n of [4, 5, 40, 79]) {
    const r = interpoladorEfetivo('krige', n);
    assert.equal(r.metodo, 'krige', `${n} pontos deviam continuar krigados`);
    assert.equal(r.caiuParaIdw, false);
  }
});

test('quem escolheu IDW nunca é sinalizado como queda', () => {
  // Senão a tela avisa "caiu para IDW" para quem pediu IDW de propósito.
  for (const n of [3, 4, 79]) {
    const r = interpoladorEfetivo('idw', n);
    assert.equal(r.metodo, 'idw');
    assert.equal(r.caiuParaIdw, false, `${n} pontos: IDW escolhido não é queda`);
  }
});

test('a queda é POR MAPA — 20-40 curta não arrasta a 0-20 junto', () => {
  const rasa = interpoladorEfetivo('krige', 79);   // 0-20 do laudo inteiro
  const funda = interpoladorEfetivo('krige', 3);   // 20-40 amostrada em parte
  assert.equal(rasa.metodo, 'krige');
  assert.equal(funda.metodo, 'idw');
});

test('o limite é exatamente 4: 3 cai, 4 não', () => {
  assert.equal(interpoladorEfetivo('krige', MIN_PTS_KRIGE - 1).caiuParaIdw, true);
  assert.equal(interpoladorEfetivo('krige', MIN_PTS_KRIGE).caiuParaIdw, false);
});
