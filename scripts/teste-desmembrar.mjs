// Testes da CIRURGIA que separa uma área do talhão (lib/desmembrarTalhao) —
// pendência 19. Cobre as regras puras; as gravações no store são exercitadas
// na bancada, não aqui (o store depende de localStorage/IndexedDB).
//
// A garantia central: NÚMERO DE AMOSTRA NÃO MUDA. Ele está impresso na etiqueta
// do saco e foi na carta ao laboratório; renumerar faz o resultado da amostra 18
// cair no ponto errado — mapa plausível e FALSO.
// Roda: `npm run teste:desmembrar`
import assert from 'node:assert/strict';
import {
  separarPontos, colisaoDeNumeros, numerosEmFaixas, geometriaSemParte,
  numeroDoPonto, fcDePartes,
} from '../src/lib/desmembrarRegras.ts';
import { areaHaGeo } from '../src/lib/areaGeo.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✓', n); } catch (e) { fail++; console.error('  ✗', n, '—', e.message); } };

const quad = (w, s, l, a) => [[[w, s], [w + l, s], [w + l, s + a], [w, s + a], [w, s]]];
const LNG = -50.3, LAT = -24.42;
// Área grande (a que fica) + área separada à direita (a que sai).
const GRANDE = quad(LNG, LAT, 0.011, 0.0092);
const SEPARADA = quad(LNG + 0.016, LAT + 0.004, 0.0042, 0.0035);
const PARTES = [GRANDE, SEPARADA];

const p = (ordem, numero, lng, lat) => ({ ordem, numero, lng, lat, profs: 1 });
// 6 pontos na área grande (1,2,3,6,7,8) e 4 na separada (4,5,18,19) — a
// numeração da grade original é entrelaçada, como na serpentina real.
const PONTOS = [
  p(0, 1, LNG + 0.002, LAT + 0.002), p(1, 2, LNG + 0.005, LAT + 0.003),
  p(2, 3, LNG + 0.008, LAT + 0.007), p(5, 6, LNG + 0.003, LAT + 0.008),
  p(6, 7, LNG + 0.006, LAT + 0.006), p(7, 8, LNG + 0.009, LAT + 0.002),
  p(3, 4, LNG + 0.017, LAT + 0.005), p(4, 5, LNG + 0.019, LAT + 0.006),
  p(17, 18, LNG + 0.018, LAT + 0.0065), p(18, 19, LNG + 0.0195, LAT + 0.0055),
];

t('separarPontos: cada ponto vai para o lado da sua área', () => {
  const { saem, ficam } = separarPontos(PONTOS, SEPARADA);
  assert.deepEqual(saem.map(numeroDoPonto), [4, 5, 18, 19]);
  assert.deepEqual(ficam.map(numeroDoPonto), [1, 2, 3, 6, 7, 8]);
});

t('OS NÚMEROS E O ORDEM SOBREVIVEM À SEPARAÇÃO — a etiqueta já foi impressa', () => {
  const { saem, ficam } = separarPontos(PONTOS, SEPARADA);
  // mesmos objetos, sem renumeração nem reindexação
  for (const grupo of [saem, ficam]) {
    for (const pt of grupo) {
      const orig = PONTOS.find(o => o.ordem === pt.ordem);
      assert.equal(pt.numero, orig.numero, `ponto ordem ${pt.ordem} mudou de número`);
    }
  }
  assert.deepEqual(saem.map(x => x.ordem), [3, 4, 17, 18], 'ordem é a chave das coletas de campo');
  assert.equal(saem.length + ficam.length, PONTOS.length, 'nenhum ponto se perde nem se duplica');
});

t('Ponto fora das duas áreas fica com o talhão de origem', () => {
  const fora = p(99, 100, LNG + 0.05, LAT + 0.05);
  const { saem, ficam } = separarPontos([...PONTOS, fora], SEPARADA);
  assert.equal(saem.length, 4);
  assert.ok(ficam.some(x => x.numero === 100), 'quem não cai na área que sai, fica');
});

t('colisaoDeNumeros: acusa repetição com a grade do destino', () => {
  const { saem } = separarPontos(PONTOS, SEPARADA);
  const destino = [p(0, 1, 0, 0), p(3, 4, 0, 0), p(17, 18, 0, 0)];
  assert.deepEqual(colisaoDeNumeros(saem, destino), [4, 18]);
  assert.deepEqual(colisaoDeNumeros(saem, [p(0, 90, 0, 0)]), [], 'sem repetição, funde');
});

t('numerosEmFaixas: 4, 5, 18-22, 38', () => {
  assert.equal(numerosEmFaixas([4, 5, 18, 19, 20, 21, 22, 38]), '4, 5, 18-22, 38');
  assert.equal(numerosEmFaixas([7]), '7');
  assert.equal(numerosEmFaixas([3, 2, 1]), '1-3');
  assert.equal(numerosEmFaixas([5, 6]), '5, 6', 'par consecutivo não vira faixa (fica igual de curto)');
  assert.equal(numerosEmFaixas([]), '');
});

t('geometriaSemParte: a área sai inteira e o resto não é tocado', () => {
  const g = geometriaSemParte(PARTES, 1, 'IGEFI 02');
  assert.equal(g.fica.features.length, 1);
  assert.equal(g.sai.features.length, 1);
  assert.deepEqual(g.fica.features[0].geometry.coordinates, GRANDE, 'o que fica é o polígono original, vértice a vértice');
  assert.deepEqual(g.sai.features[0].geometry.coordinates, SEPARADA);
});

t('AS ÁREAS FECHAM: o que fica + o que sai = o talhão inteiro', () => {
  const inteiro = areaHaGeo(fcDePartes(PARTES, 'x'));
  const g = geometriaSemParte(PARTES, 1, 'x');
  const soma = areaHaGeo(g.fica) + areaHaGeo(g.sai);
  assert.ok(Math.abs(soma - inteiro) <= 0.02, `${soma} vs ${inteiro}`);
});

t('Talhão de uma área só não se separa', () => {
  assert.equal(geometriaSemParte([GRANDE], 0, 'x'), null);
  assert.equal(geometriaSemParte(PARTES, 5, 'x'), null, 'índice fora da geometria');
});

console.log(`\n${ok} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
