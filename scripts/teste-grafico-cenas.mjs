// Geometria do gráfico de cenas — roda: npm run teste:grafcenas
//
// O que este arquivo protege:
//   1. O eixo X é TEMPO, não posição no array. Uma cena no meio exato do
//      período tem que cair no meio do eixo — é o teste que impede alguém de
//      "simplificar" para espaçamento uniforme e apagar os vazios da série.
//   2. posX e dataDoPixel são inversas (ida e volta), senão o brush seleciona
//      um intervalo diferente do que o usuário arrastou.
//   3. Um único ponto não divide por zero.
//   4. A curva de vigor QUEBRA em vão maior que o limite e NÃO quebra no
//      limite exato — reta sobre buraco de dois meses é dado inventado.

import assert from 'node:assert/strict';
import {
  escalaTempo, posX, dataDoPixel, cenasNaJanela, segmentosVigor, ticksTempo, ms, iso, MS_DIA,
} from '../src/lib/graficoCenas.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

const CAIXA = { W: 340, PL: 28, PR: 12 };
const perto = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} ≠ ${b}`);

console.log('\nms / iso');

t('ida e volta preserva a data', () => {
  for (const d of ['2023-09-03', '2026-02-29', '2026-12-31']) {
    if (d === '2026-02-29') continue;                 // 2026 não é bissexto
    assert.equal(iso(ms(d)), d);
  }
  assert.equal(iso(ms('2024-02-29')), '2024-02-29');
});

console.log('\nescalaTempo');

t('pega os extremos do período', () => {
  const e = escalaTempo(['2026-03-10', '2023-09-03', '2025-01-01']);
  assert.equal(iso(e.t0), '2023-09-03');
  assert.equal(iso(e.t1), '2026-03-10');
});

t('uma data só abre ±1 dia (senão todo x vira NaN)', () => {
  const e = escalaTempo(['2026-03-10']);
  assert.ok(e.t1 > e.t0);
  assert.equal(e.t1 - e.t0, 2 * MS_DIA);
  assert.ok(Number.isFinite(posX('2026-03-10', e, CAIXA)));
});

t('datas repetidas também não colapsam', () => {
  const e = escalaTempo(['2026-03-10', '2026-03-10', '2026-03-10']);
  assert.ok(Number.isFinite(posX('2026-03-10', e, CAIXA)));
});

t('lista vazia devolve escala utilizável', () => {
  const e = escalaTempo([]);
  assert.ok(e.t1 > e.t0);
});

console.log('\nposX — o eixo é tempo, não índice');

t('extremos caem nas bordas da área de desenho', () => {
  const e = escalaTempo(['2024-01-01', '2026-01-01']);
  perto(posX('2024-01-01', e, CAIXA), CAIXA.PL);
  perto(posX('2026-01-01', e, CAIXA), CAIXA.W - CAIXA.PR);
});

t('cena no meio do PERÍODO cai no meio do eixo, não no meio da lista', () => {
  // 3 cenas: duas coladas no começo e uma no fim. Se o eixo fosse por índice,
  // a do meio (2024-01-15) cairia no centro. Por tempo, fica quase na esquerda.
  const datas = ['2024-01-01', '2024-01-15', '2026-01-01'];
  const e = escalaTempo(datas);
  const meio = (CAIXA.PL + (CAIXA.W - CAIXA.PR)) / 2;
  const x = posX('2024-01-15', e, CAIXA);
  assert.ok(x < CAIXA.PL + 20, `cena de 15/01 deveria ficar colada à esquerda; veio em ${x}`);
  assert.ok(Math.abs(x - meio) > 100, 'caiu no meio — o eixo voltou a ser por índice');
  // e a data realmente central do período cai no centro
  const centro = iso((e.t0 + e.t1) / 2);
  perto(posX(centro, e, CAIXA), meio, 0.6);
});

t('é monotônico: data maior, x maior', () => {
  const e = escalaTempo(['2023-09-03', '2026-08-30']);
  let ant = -Infinity;
  for (const d of ['2023-09-03', '2024-02-01', '2025-06-15', '2026-08-30']) {
    const x = posX(d, e, CAIXA);
    assert.ok(x > ant, `${d} não avançou`);
    ant = x;
  }
});

console.log('\ndataDoPixel — inversa de posX (o brush depende disso)');

t('ida e volta devolve a mesma data', () => {
  const e = escalaTempo(['2023-09-03', '2026-08-30']);
  for (const d of ['2023-09-03', '2024-05-20', '2025-12-31', '2026-08-30']) {
    assert.equal(dataDoPixel(posX(d, e, CAIXA), e, CAIXA), d);
  }
});

t('pixel fora da área é grampeado nas pontas', () => {
  const e = escalaTempo(['2024-01-01', '2026-01-01']);
  assert.equal(dataDoPixel(-500, e, CAIXA), '2024-01-01');
  assert.equal(dataDoPixel(9999, e, CAIXA), '2026-01-01');
});

console.log('\ncenasNaJanela');

const cs = ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01'].map(data => ({ data }));

t('inclui as duas pontas', () => {
  assert.deepEqual(cenasNaJanela(cs, '2026-02-01', '2026-03-01').map(c => c.data),
    ['2026-02-01', '2026-03-01']);
});

t('aceita o intervalo invertido (arrasto da direita para a esquerda)', () => {
  assert.deepEqual(cenasNaJanela(cs, '2026-03-01', '2026-02-01').map(c => c.data),
    ['2026-02-01', '2026-03-01']);
});

t('janela sem nenhuma cena devolve vazio', () => {
  assert.deepEqual(cenasNaJanela(cs, '2026-02-05', '2026-02-20'), []);
});

console.log('\nsegmentosVigor');

const p = (data, valor) => ({ data, valor });

t('série contínua vira um segmento só', () => {
  const s = segmentosVigor([p('2026-01-01', 0.3), p('2026-01-11', 0.4), p('2026-01-21', 0.5)], 30);
  assert.equal(s.length, 1);
  assert.equal(s[0].length, 3);
});

t('vão MAIOR que o limite quebra a linha', () => {
  const s = segmentosVigor([p('2026-01-01', 0.3), p('2026-03-15', 0.8)], 30);
  assert.equal(s.length, 2, 'reta sobre buraco de 2 meses é dado inventado');
});

t('vão EXATAMENTE no limite ainda liga', () => {
  assert.equal(segmentosVigor([p('2026-01-01', 0.3), p('2026-01-31', 0.5)], 30).length, 1);
  assert.equal(segmentosVigor([p('2026-01-01', 0.3), p('2026-02-01', 0.5)], 30).length, 2);
});

t('ordena por data antes de segmentar', () => {
  const s = segmentosVigor([p('2026-01-21', 0.5), p('2026-01-01', 0.3), p('2026-01-11', 0.4)], 30);
  assert.equal(s.length, 1);
  assert.deepEqual(s[0].map(x => x.data), ['2026-01-01', '2026-01-11', '2026-01-21']);
});

t('não modifica o array recebido', () => {
  const orig = [p('2026-01-21', 0.5), p('2026-01-01', 0.3)];
  const copia = [...orig];
  segmentosVigor(orig, 30);
  assert.deepEqual(orig, copia);
});

t('vazio e ponto único não estouram', () => {
  assert.deepEqual(segmentosVigor([], 30), []);
  assert.equal(segmentosVigor([p('2026-01-01', 0.3)], 30).length, 1);
});

console.log('\nticksTempo');

t('3 anos → marcas anuais, poucas e legíveis', () => {
  const ticks = ticksTempo(escalaTempo(['2023-09-03', '2026-08-30']));
  assert.ok(ticks.length >= 2 && ticks.length <= 8, `veio ${ticks.length} marcas`);
  assert.ok(ticks.every(t => /^\d{4}$/.test(t.rotulo)), 'rótulo anual deveria ser só o ano');
});

t('1 ano → marcas trimestrais', () => {
  const ticks = ticksTempo(escalaTempo(['2026-01-01', '2026-12-20']));
  assert.ok(ticks.length >= 3 && ticks.length <= 8, `veio ${ticks.length} marcas`);
  assert.ok(ticks.every(t => /^\d{2}\/\d{2}$/.test(t.rotulo)));
});

t('3 meses → marcas mensais', () => {
  const ticks = ticksTempo(escalaTempo(['2026-06-01', '2026-08-31']));
  assert.ok(ticks.length >= 2 && ticks.length <= 8, `veio ${ticks.length} marcas`);
});

t('toda marca cai dentro do período (nada desenhado fora do eixo)', () => {
  const e = escalaTempo(['2023-09-03', '2026-08-30']);
  for (const tk of ticksTempo(e)) {
    assert.ok(ms(tk.data) >= e.t0 && ms(tk.data) <= e.t1, `marca fora: ${tk.data}`);
  }
});

t('período curtíssimo não entra em laço infinito', () => {
  const ticks = ticksTempo(escalaTempo(['2026-08-30']));
  assert.ok(Array.isArray(ticks));
});

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
