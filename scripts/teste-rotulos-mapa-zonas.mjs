// Onde o número de cada polígono é escrito no mapa (src/lib/rotulosMapa.ts).
// Roda: `npm run teste:rotulos-mapa`.
//
// O que este arquivo protege: no PDF de prescrição os números das zonas saíam
// empilhados uns sobre os outros e, em zona comprida, fora da própria mancha —
// o mapa vira adivinhação sobre qual dose é de qual talhão.
import assert from 'node:assert/strict';
import {
  poloDeInacessibilidade, posicionarRotulos, dentroDoPoligono,
} from '../src/lib/rotulosMapa.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ok  ', n); } catch (e) { fail++; console.error('  FALHOU', n, '-', e.message); } };

const ret = (x, y, w, h) => [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]];
const AREA = { largura: 800, altura: 600 };
const cx = (p) => p.x, cy = (p) => p.y;
const caixa = (p, w, h) => ({ x0: p.x - w / 2, y0: p.y - h / 2, x1: p.x + w / 2, y1: p.y + h / 2 });
const seCruzam = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

console.log('\nRotulos no mapa\n');

t('o polo cai no centro de um quadrado e o raio e a metade do lado', () => {
  const p = poloDeInacessibilidade(ret(100, 100, 200, 200));
  assert.ok(Math.abs(p.x - 200) < 6 && Math.abs(p.y - 200) < 6, `veio ${p.x},${p.y}`);
  assert.ok(Math.abs(p.raio - 100) < 6, `raio ${p.raio}`);
});

t('em poligono em C o polo fica DENTRO — a media dos vertices ficaria fora', () => {
  // C aberto para a direita
  const c = [[[0, 0], [200, 0], [200, 60], [60, 60], [60, 140], [200, 140], [200, 200], [0, 200], [0, 0]]];
  const p = poloDeInacessibilidade(c);
  assert.ok(dentroDoPoligono(p.x, p.y, c), `polo fora: ${p.x},${p.y}`);
  // a media simples dos vertices cai no vao do C
  const mx = c[0].reduce((s, v) => s + v[0], 0) / c[0].length;
  const my = c[0].reduce((s, v) => s + v[1], 0) / c[0].length;
  assert.equal(dentroDoPoligono(mx, my, c), false, 'a media deveria cair fora — e o bug antigo');
});

t('poligono com FURO: o polo nao cai dentro do buraco', () => {
  const externo = ret(0, 0, 300, 300)[0];
  const furo = [[100, 100], [200, 100], [200, 200], [100, 200], [100, 100]];
  const p = poloDeInacessibilidade([externo, furo]);
  assert.ok(dentroDoPoligono(p.x, p.y, [externo, furo]), 'polo dentro do furo');
});

t('numero que CABE fica dentro da mancha, sem traco', () => {
  const r = posicionarRotulos([{ texto: '77.764', aneis: ret(100, 100, 300, 300), largura: 60, altura: 16 }], AREA);
  assert.equal(r[0].traco, null, 'nao deveria precisar de traco');
  assert.ok(dentroDoPoligono(r[0].x, r[0].y, ret(100, 100, 300, 300)), 'texto fora da mancha');
});

t('numero que NAO CABE sai para fora COM traco apontando a mancha', () => {
  const fino = ret(100, 100, 300, 12);        // faixa de 12 px de altura
  const r = posicionarRotulos([{ texto: '76.239', aneis: fino, largura: 60, altura: 18 }], AREA);
  assert.ok(r[0].traco, 'deveria ter traco');
  assert.ok(dentroDoPoligono(r[0].traco.x, r[0].traco.y, fino), 'a ponta do traco tem de estar DENTRO do poligono');
  assert.ok(Math.abs(r[0].y - r[0].traco.y) > 8, 'o texto deveria ter saido de cima da faixa');
});

t('DOIS vizinhos apertados nao se sobrepoem — o caso do print', () => {
  const a = ret(100, 100, 90, 24);
  const b = ret(100, 128, 90, 24);
  const r = posicionarRotulos([
    { texto: '77.764', aneis: a, largura: 60, altura: 18 },
    { texto: '76.239', aneis: b, largura: 60, altura: 18 },
  ], AREA);
  assert.equal(seCruzam(caixa(r[0], 60, 18), caixa(r[1], 60, 18)), false,
    `caixas se cruzam: ${cx(r[0])},${cy(r[0])} x ${cx(r[1])},${cy(r[1])}`);
});

t('CINCO zonas grudadas: nenhuma caixa cruza com nenhuma outra', () => {
  const itens = Array.from({ length: 5 }, (_, i) => ({
    texto: `7${i}.000`, aneis: ret(120, 100 + i * 26, 100, 22), largura: 58, altura: 17,
  }));
  const r = posicionarRotulos(itens, AREA);
  for (let i = 0; i < r.length; i++) {
    for (let j = i + 1; j < r.length; j++) {
      assert.equal(seCruzam(caixa(r[i], 58, 17), caixa(r[j], 58, 17)), false, `${i} cruza com ${j}`);
    }
  }
});

t('o rotulo nunca sai da imagem', () => {
  const perto = ret(2, 2, 40, 10);            // colado no canto superior esquerdo
  const r = posicionarRotulos([{ texto: '72.428', aneis: perto, largura: 60, altura: 18 }], { largura: 200, altura: 150 });
  assert.ok(r[0].x - 30 >= 0 && r[0].x + 30 <= 200, `x fora: ${r[0].x}`);
  assert.ok(r[0].y - 9 >= 0 && r[0].y + 9 <= 150, `y fora: ${r[0].y}`);
});

t('a MAIOR mancha escolhe primeiro e fica sem traco', () => {
  const grande = ret(100, 100, 300, 300);
  const pequena = ret(410, 100, 40, 14);
  const r = posicionarRotulos([
    { texto: 'pequena', aneis: pequena, largura: 60, altura: 18 },
    { texto: 'grande', aneis: grande, largura: 60, altura: 18 },
  ], AREA);
  assert.equal(r[1].traco, null, 'a grande deveria caber sem traco');
  assert.ok(r[0].traco, 'a pequena deveria sair com traco');
});

t('a ORDEM da saida acompanha a ordem da entrada (nao a de colocacao)', () => {
  const r = posicionarRotulos([
    { texto: 'A', aneis: ret(0, 0, 30, 12), largura: 20, altura: 12 },
    { texto: 'B', aneis: ret(100, 100, 300, 300), largura: 20, altura: 12 },
  ], AREA);
  assert.deepEqual(r.map(x => x.texto), ['A', 'B']);
});

t('entrada degenerada (sem texto ou sem anel) nao quebra', () => {
  const r = posicionarRotulos([
    { texto: '', aneis: ret(0, 0, 10, 10), largura: 0, altura: 12 },
    { texto: 'X', aneis: [], largura: 20, altura: 12 },
    { texto: 'Y', aneis: [[[0, 0], [1, 1]]], largura: 20, altura: 12 },
  ], AREA);
  assert.equal(r.length, 3);
  for (const p of r) { assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y)); }
});

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
