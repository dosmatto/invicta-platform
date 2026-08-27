// Testes de "parte do talhão sem amostra no laudo" (lib/partesTalhao).
//
// Caso real (WNOCG 06, condomínio Figueira): talhão com DUAS áreas separadas.
// O laudo trouxe 34 amostras em 0-20 e faltaram exatamente os números
// 4, 5, 17, 18, 19, 20, 21, 22, 38 e 39 — os dez pontos da área separada.
// Resultado no mapa: aquela área saiu de UMA COR SÓ (a krigagem prediz a média
// onde não há amostra) e nada avisava. O casamento amostra↔ponto estava correto
// e a geometria chegava inteira ao servidor — o que faltava era o dado.
// Roda: `npm run teste:partes`
import assert from 'node:assert/strict';
import { partesDoTalhao, partesSemAmostra, separarPartes } from '../src/lib/partesTalhao.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✓', n); } catch (e) { fail++; console.error('  ✗', n, '—', e.message); } };

const quad = (w, s, e, n) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
// Área grande à esquerda, área separada à direita — sem encostar.
const TALHAO = { type: 'MultiPolygon', coordinates: [quad(0, 0, 10, 10), quad(20, 15, 26, 22)] };
const p = (numero, lng, lat) => ({ numero, lng, lat });

// 6 pontos na área grande + 4 na separada
const PONTOS = [
  p(1, 2, 2), p(2, 5, 3), p(3, 8, 7), p(6, 3, 8), p(7, 6, 6), p(8, 9, 2),
  p(4, 21, 16), p(5, 24, 17), p(17, 22, 20), p(18, 25, 21),
];
const LAUDO = new Set([1, 2, 3, 6, 7, 8]);          // o laudo não trouxe 4, 5, 17, 18

t('separarPartes: Polygon vira 1 parte; MultiPolygon vira uma por área', () => {
  assert.equal(separarPartes({ type: 'Polygon', coordinates: quad(0, 0, 1, 1) }).length, 1);
  assert.equal(separarPartes(TALHAO).length, 2);
});

t('O CASO REAL: cada ponto cai na sua parte', () => {
  const partes = partesDoTalhao(TALHAO, PONTOS, n => LAUDO.has(n));
  assert.deepEqual(partes[0].pontos.sort((a, b) => a - b), [1, 2, 3, 6, 7, 8]);
  assert.deepEqual(partes[1].pontos.sort((a, b) => a - b), [4, 5, 17, 18]);
});

t('O CASO REAL: a área separada é apontada como sem amostra', () => {
  const semAmostra = partesSemAmostra(partesDoTalhao(TALHAO, PONTOS, n => LAUDO.has(n)));
  assert.equal(semAmostra.length, 1, 'exatamente uma parte sem amostra');
  assert.equal(semAmostra[0].indice, 1, 'é a segunda área');
  assert.deepEqual(semAmostra[0].semAmostra.sort((a, b) => a - b), [4, 5, 17, 18],
    'os números que faltam no laudo são os que o aviso deve citar');
});

t('laudo completo: nenhum aviso', () => {
  const todos = new Set(PONTOS.map(x => x.numero));
  assert.deepEqual(partesSemAmostra(partesDoTalhao(TALHAO, PONTOS, n => todos.has(n))), []);
});

t('UMA amostra já basta para a parte não ser sinalizada', () => {
  const quase = new Set([...LAUDO, 17]);
  assert.deepEqual(partesSemAmostra(partesDoTalhao(TALHAO, PONTOS, n => quase.has(n))), [],
    'com 1 ponto a krigagem já não devolve a média chapada ali');
});

t('talhão de UMA parte sem amostra nenhuma: não é este aviso', () => {
  // Aqui o mapa nem sai; quem explica é o motivo de "sem mapa", não este aviso.
  const uma = { type: 'Polygon', coordinates: quad(0, 0, 10, 10) };
  assert.deepEqual(partesSemAmostra(partesDoTalhao(uma, PONTOS.slice(0, 6), () => false)), []);
});

t('parte VAZIA de pontos (nem grade tem) não vira aviso', () => {
  const semPonto = partesDoTalhao(TALHAO, PONTOS.slice(0, 6), n => LAUDO.has(n));
  assert.equal(semPonto[1].pontos.length, 0);
  assert.deepEqual(partesSemAmostra(semPonto), [], 'sem ponto de amostragem não há o que cobrar do laudo');
});

t('ponto fora do talhão é ignorado, não quebra a conta', () => {
  const partes = partesDoTalhao(TALHAO, [...PONTOS, p(99, 100, 100)], n => LAUDO.has(n));
  assert.equal(partes[0].pontos.length + partes[1].pontos.length, PONTOS.length);
});

t('furo no polígono: ponto dentro do furo não conta como dentro', () => {
  const comFuro = { type: 'MultiPolygon', coordinates: [
    [...quad(0, 0, 10, 10), [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]]],
    quad(20, 15, 26, 22),
  ] };
  const partes = partesDoTalhao(comFuro, [p(1, 5, 5), p(2, 1, 1)], () => true);
  assert.deepEqual(partes[0].pontos, [2], 'o ponto (5,5) está no furo');
});

console.log(`\n${ok} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
