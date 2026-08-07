// Testes do peso de cada pixel dentro do talhão (recomendacao/cobertura.ts).
//
// O raster de 20 m da dose passou a cobrir 100% do polígono, então ele transborda
// na divisa: a célula da borda entra inteira, com o valor real que a krigagem
// calculou para aquele nó. Se ela contasse com peso cheio, a dose média subiria
// (é onde a interpolação extrapola) e a tonelagem e o custo do PDF iriam junto —
// exatamente o que não pode acontecer, porque a malha maior é decisão de desenho,
// não de conta. Estes testes travam esse peso.
// Roda: `npm run teste:cobertura`
import assert from 'node:assert/strict';
import { coberturaDoGrid } from '../src/lib/recomendacao/cobertura.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

const quadrado = (w, s, e, n) => ({
  type: 'Polygon',
  coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]],
});
const soma = (a) => a.reduce((x, y) => x + y, 0);

t('talhão que cobre a malha inteira: todo pixel pesa 1', () => {
  // bounds miolo, polígono bem maior → nenhum pixel na borda
  const p = coberturaDoGrid([3, 3], [0, 0, 2, 2], quadrado(-10, -10, 10, 10));
  assert.equal(soma(Array.from(p)), 9);
});

t('talhão fora da malha: todo pixel pesa 0', () => {
  const p = coberturaDoGrid([3, 3], [0, 0, 2, 2], quadrado(100, 100, 101, 101));
  assert.equal(soma(Array.from(p)), 0);
});

t('meio a meio: o peso total é ~metade dos pixels', () => {
  // malha 0..4 em x; talhão cobre só x <= 2 (metade do leste para fora)
  const p = coberturaDoGrid([5, 5], [0, 0, 4, 4], quadrado(-1, -1, 2, 5));
  const total = soma(Array.from(p));
  // 5 colunas de nós em x = 0,1,2,3,4; a coluna 2 é cortada ao meio pela divisa
  assert.ok(total > 11 && total < 14, `peso total ${total} fora do esperado`);
});

t('pixel cortado ao meio pesa ~0,5 (é isto que segura a tonelagem)', () => {
  // Malha 3×3 com passo 1 (nós em 0,1,2). O nó do meio é o centro de uma célula
  // [0,5..1,5]; o talhão começa em x=1, então corta essa célula ao meio.
  const p = coberturaDoGrid([3, 3], [0, 0, 2, 2], quadrado(1, -5, 5, 5));
  const meio = p[1 * 3 + 1];
  assert.ok(Math.abs(meio - 0.5) < 0.02, `esperava ~0,5 e veio ${meio}`);
});

t('a soma dos pesos ≈ área do talhão ÷ área do pixel', () => {
  // talhão 3×3 sobre malha 0..6 com passo 1 → 9 células de área
  const p = coberturaDoGrid([7, 7], [0, 0, 6, 6], quadrado(1.5, 1.5, 4.5, 4.5));
  const total = soma(Array.from(p));
  assert.ok(Math.abs(total - 9) < 0.05, `esperava ~9 células de área, veio ${total}`);
});

t('linha 0 é o NORTE (senão o peso sai espelhado no eixo Y)', () => {
  // talhão só na metade NORTE da malha
  const [rows, cols] = [4, 4];
  const p = coberturaDoGrid([rows, cols], [0, 0, 3, 3], quadrado(-1, 1.5, 4, 9));
  const linha = (r) => soma(Array.from(p.slice(r * cols, (r + 1) * cols)));
  assert.ok(linha(0) > linha(rows - 1), `norte (${linha(0)}) deveria pesar mais que sul (${linha(rows - 1)})`);
});

t('talhão com buraco: o furo não conta (anel interno fica de fora)', () => {
  const comFuro = {
    type: 'Polygon',
    coordinates: [
      [[0, 0], [6, 0], [6, 6], [0, 6], [0, 0]],
      [[2, 2], [4, 2], [4, 4], [2, 4], [2, 2]],
    ],
  };
  const p = coberturaDoGrid([7, 7], [0, 0, 6, 6], comFuro);
  const total = soma(Array.from(p));
  // 36 de área cheia − 4 do furo = 32. Sem tratar o furo daria ~36.
  assert.ok(total < 34, `o furo não foi descontado (total ${total})`);
});

t('grid degenerado não explode', () => {
  assert.equal(soma(Array.from(coberturaDoGrid([0, 0], [0, 0, 1, 1], quadrado(0, 0, 1, 1)))), 0);
  assert.equal(soma(Array.from(coberturaDoGrid([2, 2], [1, 1, 1, 1], quadrado(0, 0, 2, 2)))), 0);
});

console.log(`\n${ok} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
